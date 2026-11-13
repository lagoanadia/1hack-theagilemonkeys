"""Punto de entrada:  python -m radar [--dias 90] [--sin-ia]

Flujo:
  1. RECOLECTAR  -> busca cada término en la BDNS y junta resultados sin duplicados.
  2. FILTRAR     -> descarta por título (nominativas, convenios...) y por ficha
                    (no competitiva, plazo cerrado).
  3. PUNTUAR     -> Groq (o palabras clave) da 0-100 a cada superviviente.
  4. GUARDAR     -> docs/data/convocatorias.json, que lee la web.

Las puntuaciones ya calculadas se reutilizan entre ejecuciones (caché), así que
correrlo cada día solo gasta IA en las convocatorias nuevas.
"""
import argparse
import json
import time
from datetime import date, datetime, timedelta
from pathlib import Path

from . import bdns
from .config import DIAS_POR_DEFECTO, TERMINOS_BUSQUEDA
from .filtros import descartar_por_detalle, descartar_por_titulo
from .puntuador import Puntuador

SALIDA = Path(__file__).resolve().parent.parent / "docs" / "data" / "convocatorias.json"


def cargar_anterior() -> dict:
    """Convocatorias ya procesadas en ejecuciones anteriores, indexadas por código."""
    if not SALIDA.exists():
        return {}
    datos = json.loads(SALIDA.read_text(encoding="utf-8"))
    return {c["codigo"]: c for c in datos.get("convocatorias", [])}


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Radar de convocatorias para Reforesta")
    parser.add_argument("--dias", type=int, default=DIAS_POR_DEFECTO,
                        help="cuántos días hacia atrás buscar (por fecha de publicación)")
    parser.add_argument("--sin-ia", action="store_true",
                        help="no usar Groq aunque haya GROQ_API_KEY")
    parser.add_argument("--recalcular", action="store_true",
                        help="ignorar la caché y volver a puntuar todo")
    args = parser.parse_args()

    hoy = date.today()
    desde = hoy - timedelta(days=args.dias)
    puntuador = Puntuador(usar_ia=not args.sin_ia)
    anterior = {} if args.recalcular else cargar_anterior()
    print(f"Radar Reforesta | {desde} -> {hoy} | modo: {puntuador.modo}")

    # 1. RECOLECTAR
    candidatas: dict[str, dict] = {}
    for termino in TERMINOS_BUSQUEDA:
        encontradas = bdns.buscar(termino, desde, hoy)
        for c in encontradas:
            candidatas.setdefault(c["numeroConvocatoria"], c)
        print(f"  '{termino}': {len(encontradas)}")
    print(f"Total únicas: {len(candidatas)}")

    # 2 y 3. FILTRAR y PUNTUAR
    resultado, descartadas = [], 0
    for codigo, resumen in candidatas.items():
        if descartar_por_titulo(resumen["descripcion"]):
            descartadas += 1
            continue

        # Caché: si ya la puntuamos antes, no repetimos el trabajo.
        # Excepción: si antes fue sin IA y ahora tenemos Groq, la volvemos a puntuar.
        previa = anterior.get(codigo)
        hecha_con_ia = previa is not None and previa.get("metodo", "").startswith("groq")
        if previa and (hecha_con_ia or not puntuador.cliente):
            cerrada = previa.get("fin") and date.fromisoformat(previa["fin"]) < hoy
            if not cerrada:
                resultado.append(previa)
            continue

        det = bdns.detalle(codigo)
        time.sleep(0.2)  # ser amables con la API pública
        motivo = descartar_por_detalle(det, hoy)
        if motivo:
            descartadas += 1
            continue

        evaluacion = puntuador.puntuar(det)
        resultado.append(ficha(det, evaluacion))
        print(f"  [{evaluacion['puntuacion']:3}] {codigo} {det.get('descripcion', '')[:80]}")

    # 4. GUARDAR
    resultado.sort(key=lambda c: (-c["puntuacion"], c.get("fin") or "9999"))
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps({
        "generado": datetime.now().isoformat(timespec="minutes"),
        "modo": puntuador.modo,
        "ventana_dias": args.dias,
        "revisadas": len(candidatas),
        "descartadas": descartadas,
        "convocatorias": resultado,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    buenas = sum(1 for c in resultado if c["puntuacion"] >= 70)
    print(f"\nRevisadas {len(candidatas)} | descartadas {descartadas} | "
          f"guardadas {len(resultado)} | recomendadas (>=70): {buenas}")
    print(f"-> {SALIDA}")


if __name__ == "__main__":
    main()
