"""Validación con convocatorias reales de Reforesta:  python -m radar.validar

Para cada convocatoria de CONVOCATORIAS_VALIDACION responde dos preguntas:
  1. ¿La habría encontrado el radar?  -> pasa los filtros sin IA (sin contar el plazo).
  2. ¿Qué habría dicho cuando estaba abierta?  -> análisis completo de Groq.
Escribe web/public/data/validacion.json, que la web enseña como "prueba".
Solo llama a Groq si la convocatoria no está ya validada con las instrucciones actuales.
"""
import json
from datetime import date

from . import bdns
from .__main__ import RAIZ, ficha
from .config import CONVOCATORIAS_VALIDACION, UMBRAL_RELEVANCIA
from .filtros import descartar_por_detalle, descartar_por_titulo, es_ambiental
from .puntuador import VERSION_INSTRUCCIONES, CupoAgotado, Puntuador, texto_para_analizar

SALIDA = RAIZ / "web" / "public" / "data" / "validacion.json"
# Fecha "imaginaria" para comprobar los filtros como si la convocatoria siguiera abierta.
SIEMPRE_ABIERTA = date(1900, 1, 1)


def filtros_sin_ia(det: dict) -> list[dict]:
    """Recorre los filtros del radar y dice cuáles pasa (el plazo no cuenta aquí)."""
    titulo = descartar_por_titulo(det.get("descripcion", ""))
    detalle = descartar_por_detalle(det, SIEMPRE_ABIERTA)
    ambiental = es_ambiental(texto_para_analizar(det), UMBRAL_RELEVANCIA)
    return [
        {"paso": "Aparece en el barrido de la BDNS (Estado + Madrid)", "ok": True},
        {"paso": "No es nominativa, convenio ni beca", "ok": titulo is None},
        {"paso": "Concurrencia competitiva, ámbito y beneficiarios válidos", "ok": detalle is None,
         "motivo": detalle or ""},
        {"paso": "Temática ambiental", "ok": ambiental},
    ]


def main() -> None:
    anteriores = {}
    if SALIDA.exists():
        anteriores = {v["codigo"]: v for v in json.loads(SALIDA.read_text(encoding="utf-8"))["casos"]}
    puntuador = Puntuador()
    casos = []
    for codigo, descripcion in CONVOCATORIAS_VALIDACION.items():
        previo = anteriores.get(codigo)
        if previo and previo.get("version") == VERSION_INSTRUCCIONES \
                and previo.get("metodo", "").startswith("groq"):
            casos.append(previo)
            print(f"  {codigo}: ya validada ({previo['veredicto']})")
            continue

        det = bdns.detalle(codigo)
        filtros = filtros_sin_ia(det)
        evaluacion = None
        while puntuador.cliente and puntuador.cola_decision and evaluacion is None:
            try:
                evaluacion = puntuador._decision(det)  # análisis completo, sin pasar por la criba
            except CupoAgotado as e:
                puntuador._siguiente_modelo(puntuador.cola_decision, e)
        if evaluacion is None:
            print(f"  {codigo}: sin Groq disponible; se queda pendiente")
            evaluacion = {"veredicto": "pendiente", "puntuacion": 0, "metodo": "pendiente_ia"}

        caso = {**ficha(det, evaluacion), "descripcion_reto": descripcion,
                "filtros": filtros, "encontrada": all(f["ok"] for f in filtros)}
        casos.append(caso)
        print(f"  {codigo}: encontrada={caso['encontrada']} veredicto={caso['veredicto']} "
              f"({caso['puntuacion']})")

    SALIDA.write_text(json.dumps({
        "encontradas": sum(c["encontrada"] for c in casos),
        "total": len(casos),
        "casos": casos,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"-> {SALIDA}")


if __name__ == "__main__":
    main()
