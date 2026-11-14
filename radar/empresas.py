"""Empresas obligadas a compensar:  python -m radar.empresas [--dias 180] [--limite N]

Cuando una empresa quiere construir un parque eólico, una planta solar o una línea eléctrica,
el Ministerio publica en el BOE una declaración de impacto ambiental (DIA) con las medidas
compensatorias que la empresa ESTÁ OBLIGADA a ejecutar: a menudo reforestar, revegetar o
restaurar hábitats. Esas empresas son clientes potenciales del canal de RSC de Reforesta.

Flujo:
  1. BOE: todas las DIA de los últimos días (API de datos abiertos).
  2. Para cada DIA nueva, solo el texto relevante (promotor + medidas).
  3. Groq extrae empresa, proyecto, lugar y medidas, y puntúa el encaje con Reforesta.
  4. Guarda web/public/data/empresas.json (caché: cada DIA se analiza una sola vez).
"""
import argparse
import json
from datetime import date, datetime, timedelta

from . import boe
from . import contactos
from .__main__ import RAIZ
from . import perfil
from .puntuador import CupoAgotado, Puntuador, _entero, cita_verificada

SALIDA = RAIZ / "web" / "public" / "data" / "empresas.json"
VERSION_EMPRESAS = 1  # súbelo si cambian las instrucciones: se reanaliza todo

def instrucciones() -> str:
    return f"""Eres el responsable de alianzas con empresas de una ONG ambiental:
{perfil.texto()}
Te paso extractos de una declaración de impacto ambiental (DIA) publicada en el BOE. La empresa
promotora está OBLIGADA a cumplir sus medidas preventivas, correctoras y compensatorias.
Queremos saber si es un buen cliente para que la ONG ejecute esas medidas.

Responde SOLO con un objeto JSON con estas claves:
- "promotor": nombre de la empresa promotora (razón social si aparece) o "" si no consta.
- "proyecto": nombre corto del proyecto (máx. 12 palabras).
- "tipo": "eolico", "solar", "linea_electrica", "hibrido", "infraestructura" u "otro".
- "ubicacion": municipios o provincias, y comunidad autónoma.
- "medidas": lista (máx. 5) de medidas que la ONG podría ejecutar, cada una
  {{"texto": "medida breve y concreta", "superficie_ha": número o null}}.
  Solo reforestación, revegetación, plantaciones, restauración de hábitats, charcas,
  humedales, actuaciones para fauna o educación ambiental. [] si no hay ninguna.
- "superficie_total_ha": suma de hectáreas a restaurar/plantar si consta, o null.
- "encaje": entero 0-100. 70-100 = medidas claras de reforestación o restauración que la ONG
  sabe hacer; 40-69 = medidas parecidas o poco concretas; 0-39 = nada que la ONG pueda hacer.
  Suma si el proyecto está en Madrid o provincias cercanas (Toledo, Guadalajara, Segovia,
  Ávila, Cuenca); resta un poco si está lejos.
- "resumen": UNA frase para el equipo de la ONG, del estilo "X debe revegetar 30 ha en Lugo
  por su parque eólico" (máx. 30 palabras).
- "cita": copia LITERAL (máx. 40 palabras) la frase del texto que impone la medida más útil
  para la ONG. "" si no hay.
No inventes datos: si algo no aparece en el texto, usa "", null o []."""


def _ha(valor) -> float | None:
    """Hectáreas como número (la IA a veces devuelve "12 ha" o texto): None si no es un número."""
    try:
        n = float(str(valor).replace(",", ".").split()[0]) if valor not in (None, "") else None
    except (ValueError, IndexError):
        return None
    return round(n, 2) if n is not None and 0 < n < 100000 else None


def version_empresas():
    h = perfil.huella()
    return f"{VERSION_EMPRESAS}-{h}" if h else VERSION_EMPRESAS


def accion(encaje: int) -> str:
    if encaje >= 70:
        return "contactar"
    if encaje >= 40:
        return "mira"
    return "descarta"


def analizar(puntuador: Puntuador, dia: dict) -> dict | None:
    texto = boe.texto_relevante(boe.parrafos(dia["id"]))
    entrada = f"Título: {dia['titulo']}\nFecha BOE: {dia['fecha']}\n\n{texto}"
    while puntuador.cola_decision:
        try:
            datos = puntuador._llamar(puntuador.modelo_decision, instrucciones(), entrada)
            break
        except CupoAgotado as e:
            puntuador._siguiente_modelo(puntuador.cola_decision, e)
    else:
        return None

    medidas = [{"texto": str(m.get("texto", "")).strip(), "superficie_ha": _ha(m.get("superficie_ha"))}
               for m in datos.get("medidas") or [] if isinstance(m, dict) and m.get("texto")][:5]
    encaje = max(0, min(100, _entero(datos.get("encaje")) or 0))
    return {
        "id": dia["id"],
        "fecha": dia["fecha"],
        "titulo": dia["titulo"],
        "url": boe.url_publica(dia["id"]),
        "promotor": str(datos.get("promotor", "")).strip(),
        "proyecto": str(datos.get("proyecto", "")).strip(),
        "tipo": str(datos.get("tipo", "otro")),
        "ubicacion": str(datos.get("ubicacion", "")).strip(),
        "medidas": medidas,
        "superficie_total_ha": _ha(datos.get("superficie_total_ha")),
        "encaje": encaje,
        "accion": accion(encaje),
        "resumen": str(datos.get("resumen", "")).strip(),
        "cita": cita_verificada(str(datos.get("cita", "")), texto),
        "metodo": f"groq:{puntuador.modelo_decision}",
        "version": version_empresas(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Empresas obligadas a compensar (DIA del BOE)")
    parser.add_argument("--dias", type=int, default=180)
    parser.add_argument("--limite", type=int, default=0, help="analizar como mucho N DIA nuevas")
    args = parser.parse_args()

    hoy = date.today()
    anteriores = {}
    if SALIDA.exists():
        anteriores = {e["id"]: e for e in json.loads(SALIDA.read_text(encoding="utf-8"))["empresas"]
                      if e.get("version") == version_empresas()}

    dias = boe.declaraciones_impacto(hoy - timedelta(days=args.dias), hoy)
    print(f"DIA publicadas en el BOE (últimos {args.dias} días): {len(dias)}")
    puntuador = Puntuador()
    empresas, pendientes, nuevas = [], 0, 0
    for dia in sorted(dias, key=lambda d: d["fecha"], reverse=True):
        if dia["id"] in anteriores:
            empresas.append(anteriores[dia["id"]])
            continue
        if not puntuador.cliente or (args.limite and nuevas >= args.limite):
            pendientes += 1
            continue
        nuevas += 1
        resultado = analizar(puntuador, dia)
        if resultado is None:
            pendientes += 1
            continue
        empresas.append(resultado)
        print(f"  [{resultado['encaje']:3}] {resultado['promotor'][:40]} | {resultado['proyecto'][:60]}")

    # Contacto público de cada empresa que interesa, buscado en internet con IA (caché en data/contactos.json).
    contactos.completar(empresas, puntuador.cliente)
    empresas.sort(key=lambda e: (-e["encaje"], e["fecha"]))
    SALIDA.write_text(json.dumps({
        "generado": datetime.now().isoformat(timespec="minutes"),
        "ventana_dias": args.dias,
        "revisadas": len(dias),
        "pendientes": pendientes,
        "empresas": empresas,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    contactar = sum(e["accion"] == "contactar" for e in empresas)
    print(f"Analizadas {len(empresas)} | contactar: {contactar} | pendientes: {pendientes}")
    print(f"-> {SALIDA}")


if __name__ == "__main__":
    main()
