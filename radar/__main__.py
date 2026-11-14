"""Punto de entrada:  python -m radar [--dias 365] [--sin-ia] [--limite N]

Flujo:
  1. RECOLECTAR  -> todas las convocatorias estatales y de Madrid publicadas en la ventana.
  2. FILTRAR     -> sin IA: título (nominativas, convenios...), ficha (no competitiva,
                    plazo cerrado, otra región, solo empresas) y temática ambiental.
  3. PUNTUAR     -> Groq en cascada (criba + decisión) o palabras clave.
  4. GUARDAR     -> web/public/data/convocatorias.json, que lee la web.

Dos cachés hacen que cada día solo se trabaje con lo nuevo:
  - las evaluadas por Groq están en convocatorias.json;
  - las descartadas al leer su ficha, en data/vistas.json (no se vuelven a descargar).
"""
import argparse
import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path

from . import bdns
from . import criterios, documentos, perfil
from .config import DIAS_POR_DEFECTO, UMBRAL_RELEVANCIA
from .filtros import descartar_por_detalle, descartar_por_titulo, es_ambiental, motivo_corto
from .puntuador import Puntuador, texto_para_analizar, version_actual

RAIZ = Path(__file__).resolve().parent.parent
VISTAS = RAIZ / "data" / "vistas.json"
SALIDA = RAIZ / "web" / "public" / "data" / "convocatorias.json"


def cargar_anterior() -> dict:
    """Convocatorias ya procesadas en ejecuciones anteriores, indexadas por código."""
    if not SALIDA.exists():
        return {}
    datos = json.loads(SALIDA.read_text(encoding="utf-8"))
    return {c["codigo"]: c for c in datos.get("convocatorias", [])}


def cargar_vistas() -> dict:
    """Convocatorias ya descartadas al leer su ficha: {código: motivo}."""
    if not VISTAS.exists():
        return {}
    return json.loads(VISTAS.read_text(encoding="utf-8"))


def ficha(det: dict, evaluacion: dict) -> dict:
    """Lo que guardamos de cada convocatoria (lo justo para la web)."""
    organo = det.get("organo") or {}
    return {
        "codigo": det["codigoBDNS"],
        "titulo": det.get("descripcion", "").strip(),
        "organo": organo.get("nivel2") or organo.get("nivel1", ""),
        "ambito": organo.get("nivel1", ""),
        "publicada": det.get("fechaRecepcion"),
        "inicio": det.get("fechaInicioSolicitud"),
        "fin": det.get("fechaFinSolicitud"),
        "plazo_texto": det.get("textFin") or "",
        "abierta": det.get("abierto"),
        "presupuesto": det.get("presupuestoTotal"),
        "tipo": det.get("tipoConvocatoria", ""),
        "url": bdns.url_publica(det["codigoBDNS"]),
        "url_bases": det.get("urlBasesReguladoras") or "",
        "sede": det.get("sedeElectronica") or "",
        **evaluacion,
    }


def plazo_vencido(c: dict, hoy: date) -> bool:
    """Cerrada por fecha oficial o, si no la hay, por la fecha que estimó Groq."""
    fecha = c.get("fin") or c.get("plazo_estimado")
    try:
        return bool(fecha) and date.fromisoformat(fecha) < hoy
    except ValueError:  # fecha mal formada por el modelo: no la usamos
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Radar de convocatorias para Reforesta")
    parser.add_argument("--dias", type=int, default=DIAS_POR_DEFECTO,
                        help="cuántos días hacia atrás buscar (por fecha de publicación)")
    parser.add_argument("--sin-ia", action="store_true",
                        help="no usar Groq aunque haya GROQ_API_KEY")
    parser.add_argument("--recalcular", action="store_true",
                        help="ignorar la caché y volver a puntuar todo")
    parser.add_argument("--limite", type=int, default=0,
                        help="evaluar como mucho N convocatorias nuevas (para probar gastando poco cupo)")
    args = parser.parse_args()

    hoy = date.today()
    desde = hoy - timedelta(days=args.dias)
    puntuador = Puntuador(usar_ia=not args.sin_ia)
    anterior = {} if args.recalcular else cargar_anterior()
    vistas = {} if args.recalcular else cargar_vistas()
    print(f"Radar Reforesta | {desde} -> {hoy} | modo: {puntuador.modo}")

    # 1. RECOLECTAR: barrido completo de las regiones de Reforesta.
    candidatas = {c["numeroConvocatoria"]: c for c in bdns.barrer(desde, hoy, perfil.regiones_bdns())}
    print(f"Convocatorias publicadas en la ventana: {len(candidatas)}")

    # 2a. Filtros que no necesitan descargar nada (título, cachés).
    resultado, descartes, pendientes = [], Counter(), []
    for codigo, resumen in candidatas.items():
        motivo = descartar_por_titulo(resumen["descripcion"])
        if motivo:
            descartes[motivo_corto(motivo)] += 1
        elif codigo in vistas:
            descartes[vistas[codigo]] += 1
        elif ((previa := anterior.get(codigo)) and previa.get("metodo", "").startswith("groq")
              and previa.get("version") == version_actual()):
            # Groq ya la evaluó con estas instrucciones: no gastamos cupo otra vez.
            if plazo_vencido(previa, hoy):
                descartes["plazo cerrado"] += 1
            else:
                resultado.append(previa)
        else:
            pendientes.append(codigo)

    # 2b. Descargar las fichas nuevas (en paralelo, sin pasarse con la API pública).
    print(f"Fichas por descargar: {len(pendientes)}")
    with ThreadPoolExecutor(max_workers=4) as pool:
        fichas = list(pool.map(bdns.detalle, pendientes))

    # 2c y 3. Filtros con la ficha y, a lo que sobreviva, Groq.
    evaluadas = 0
    for det in fichas:
        codigo = det["codigoBDNS"]
        motivo = descartar_por_detalle(det, hoy)
        if not motivo:
            if not es_ambiental(texto_para_analizar(det), UMBRAL_RELEVANCIA):
                motivo = "sin relación ambiental"
        if motivo:
            vistas[codigo] = motivo_corto(motivo)
            descartes[motivo_corto(motivo)] += 1
            continue

        if args.limite and evaluadas >= args.limite:
            continue
        evaluadas += 1

        evaluacion = puntuador.puntuar(det)
        if plazo_vencido(ficha(det, evaluacion), hoy):
            vistas[codigo] = "plazo cerrado"
            descartes["plazo cerrado"] += 1
            continue
        resultado.append(ficha(det, evaluacion))
        print(f"  [{evaluacion['puntuacion']:3}] {codigo} {det.get('descripcion', '')[:80]}")

    # 4. GUARDAR
    # Documentos que pide cada convocatoria interesante (lee el PDF oficial; una vez por convocatoria).
    preparando = perfil.en_estado("preparando", "presentada", "subsanar")
    hechas = 0
    for c in resultado:
        interesa = (c.get("veredicto_ia") or c.get("veredicto")) in ("presenta", "mira") or c["codigo"] in preparando
        if not interesa or c.get("documentos_version") == documentos.VERSION_DOCS or args.sin_ia:
            continue
        if hechas >= documentos.MAX_POR_EJECUCION:
            break
        extra = documentos.requeridos(puntuador, bdns.detalle(c["codigo"]))
        if extra:
            c.update(extra)
            hechas += 1
            print(f"  Documentos de {c['codigo']}: {len(extra['documentos_requeridos'])} ({extra['documentos_fuente']})")

    # Criterios de búsqueda del perfil (sin IA): ajustan el veredicto y explican por qué.
    crit = perfil.criterios()
    resultado = [criterios.aplicar(c, crit, hoy) for c in resultado]
    if any(crit.values()):
        print(f"Criterios aplicados: {crit}")

    descartadas = sum(descartes.values())
    resultado.sort(key=lambda c: (-c["puntuacion"], c.get("fin") or "9999"))
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps({
        "generado": datetime.now().isoformat(timespec="minutes"),
        "modo": puntuador.modo,
        "ventana_dias": args.dias,
        "revisadas": len(candidatas),
        "descartadas": descartadas,
        "descartes_por_motivo": dict(descartes.most_common()),
        "llamadas_groq": puntuador.llamadas,
        "convocatorias": resultado,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    VISTAS.parent.mkdir(parents=True, exist_ok=True)
    VISTAS.write_text(json.dumps(vistas, ensure_ascii=False, sort_keys=True, indent=0), encoding="utf-8")

    buenas = sum(1 for c in resultado if c.get("veredicto") == "presenta")
    print(f"\nRevisadas {len(candidatas)} | descartadas {descartadas} | "
          f"guardadas {len(resultado)} | presenta: {buenas}")
    for motivo, n in descartes.most_common():
        print(f"  descartadas por {motivo}: {n}")
    print(f"Llamadas a Groq: {puntuador.llamadas}")
    if puntuador.cupo_agotado:
        print("AVISO: se agotó el cupo de Groq; las pendientes se evaluarán en la próxima ejecución.")
    print(f"-> {SALIDA}")


if __name__ == "__main__":
    main()
