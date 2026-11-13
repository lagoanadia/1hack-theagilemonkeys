"""Cliente mínimo de la API pública de la BDNS (infosubvenciones.es).

Solo dos funciones:
  - buscar(): lista resumida de convocatorias que contienen un término.
  - detalle(): ficha completa de una convocatoria (plazos, importe, texto del BOE...).
"""
import time
from datetime import date

import requests

BASE = "https://www.infosubvenciones.es/bdnstrans/api"
URL_PUBLICA = "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/{codigo}"

_sesion = requests.Session()
_sesion.headers["User-Agent"] = "radar-convocatorias/0.1"


def _get(ruta: str, params: dict, intentos: int = 3) -> dict:
    """GET con reintentos sencillos: la API pública a veces tarda o falla."""
    for i in range(intentos):
        try:
            r = _sesion.get(f"{BASE}{ruta}", params=params, timeout=30)
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if i == intentos - 1:
                raise
            time.sleep(2 * (i + 1))
    return {}


def buscar(termino: str, desde: date, hasta: date, max_paginas: int = 4) -> list[dict]:
    """Devuelve las convocatorias (resumen) que contienen `termino` en el título."""
    resultados = []
    for pagina in range(max_paginas):
        datos = _get("/convocatorias/busqueda", {
            "descripcion": termino,
            "descripcionTipoBusqueda": 1,  # todas las palabras, en cualquier orden
            "fechaDesde": desde.strftime("%d/%m/%Y"),
            "fechaHasta": hasta.strftime("%d/%m/%Y"),
            "page": pagina,
            "pageSize": 50,
            "vpd": "GE",
        })
        resultados.extend(datos.get("content", []))
        if datos.get("last", True):
            break
    return resultados


def detalle(codigo_bdns: str) -> dict:
    """Ficha completa de una convocatoria a partir de su código BDNS."""
    return _get("/convocatorias", {"numConv": codigo_bdns, "vpd": "GE"})


def url_publica(codigo_bdns: str) -> str:
    return URL_PUBLICA.format(codigo=codigo_bdns)
