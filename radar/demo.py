"""Convocatorias de demostración:  python -m radar.demo

Evalúa con Groq las convocatorias reales de config.CONVOCATORIAS_DEMO (ya cerradas) y escribe
web/public/data/demo.json. La web (modo demo del Worker) las enseña como si estuvieran abiertas.
Caché: solo llama a Groq si cambian las instrucciones.
"""
import json

from .__main__ import RAIZ
from .config import CONVOCATORIAS_DEMO
from .validar import evaluar

SALIDA = RAIZ / "web" / "public" / "data" / "demo.json"


def main() -> None:
    casos = evaluar(CONVOCATORIAS_DEMO, SALIDA)
    SALIDA.write_text(json.dumps({"casos": casos}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"-> {SALIDA} ({len(casos)} convocatorias de demostración)")


if __name__ == "__main__":
    main()
