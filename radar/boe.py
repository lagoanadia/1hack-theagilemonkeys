"""Cliente mínimo de la API de datos abiertos del BOE (boe.es/datosabiertos).

  - declaraciones_impacto(): declaraciones de impacto ambiental (DIA) publicadas en un rango de días.
  - texto_relevante(): de una DIA (~100.000 caracteres), solo lo que interesa a Reforesta:
    el arranque (promotor y proyecto) y los párrafos sobre medidas compensatorias,
    reforestación, revegetación o plantaciones.
"""
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import requests

SUMARIO = "https://www.boe.es/datosabiertos/api/boe/sumario/{fecha:%Y%m%d}"
TEXTO_XML = "https://www.boe.es/diario_boe/xml.php?id={id}"
URL_PUBLICA = "https://www.boe.es/diario_boe/txt.php?id={id}"
MARCA_DIA = "formula declaración de impacto ambiental"

_sesion = requests.Session()
_sesion.headers.update({"User-Agent": "radar-convocatorias/0.1", "Accept": "application/json"})

# Peso de cada expresión al elegir qué párrafos leerá la IA.
PESOS_PARRAFO = [
    (re.compile(r"medidas? compensatori", re.I), 4),
    (re.compile(r"reforest|repobla", re.I), 4),
    (re.compile(r"plantaci[oó]n|revegetaci[oó]n|restauraci[oó]n vegetal", re.I), 3),
    (re.compile(r"charcas?|humedal|anfibio", re.I), 3),
    (re.compile(r"hect[áa]reas?|\d\s?ha\b", re.I), 2),
    (re.compile(r"especies aut[óo]ctonas|h[áa]bitat", re.I), 1),
]


def _get(url: str, intentos: int = 3) -> requests.Response | None:
    for i in range(intentos):
        try:
            r = _sesion.get(url, timeout=60)
            if r.status_code == 404:  # domingos y festivos no hay BOE
                return None
            r.raise_for_status()
            return r
        except requests.RequestException:
            if i == intentos - 1:
                raise
            time.sleep(2 * (i + 1))
    return None


def _dia_de(fecha: date) -> list[dict]:
    r = _get(SUMARIO.format(fecha=fecha))
    if r is None:
        return []
    encontradas = []

    def recorrer(x):
        if isinstance(x, dict):
            if "identificador" in x and MARCA_DIA in str(x.get("titulo", "")).lower():
                encontradas.append({"id": x["identificador"], "titulo": x["titulo"].strip(),
                                    "fecha": fecha.isoformat()})
            for v in x.values():
                recorrer(v)
        elif isinstance(x, list):
            for v in x:
                recorrer(v)

    recorrer(r.json().get("data", {}).get("sumario", {}))
    return encontradas


def declaraciones_impacto(desde: date, hasta: date) -> list[dict]:
    """DIA publicadas en el BOE entre dos fechas (una petición por día, en paralelo)."""
    dias = [hasta - timedelta(days=i) for i in range((hasta - desde).days + 1)]
    with ThreadPoolExecutor(max_workers=6) as pool:
        return [d for lista in pool.map(_dia_de, dias) for d in lista]


def parrafos(id_boe: str) -> list[str]:
    r = _get(TEXTO_XML.format(id=id_boe))
    if r is None:
        return []
    texto = ET.fromstring(r.content).find("texto")
    if texto is None:
        return []
    return [" ".join("".join(p.itertext()).split()) for p in texto.iter("p")]


def texto_relevante(ps: list[str], limite: int = 9000) -> str:
    """El arranque de la resolución + los párrafos con más señales de medidas compensatorias."""
    inicio = " ".join(ps[:3])[:1800]
    puntuados = []
    for i, p in enumerate(ps[3:], start=3):
        puntos = sum(peso for patron, peso in PESOS_PARRAFO if patron.search(p))
        if puntos >= 3:
            puntuados.append((puntos, i, p[:1200]))
    elegidos, total = [], len(inicio)
    for _, i, p in sorted(puntuados, key=lambda x: -x[0]):
        if total + len(p) > limite:
            continue
        elegidos.append((i, p))
        total += len(p)
    cuerpo = "\n".join(p for _, p in sorted(elegidos))  # en el orden original del texto
    return f"INICIO DE LA RESOLUCIÓN:\n{inicio}\n\nPÁRRAFOS SOBRE MEDIDAS:\n{cuerpo}"


def url_publica(id_boe: str) -> str:
    return URL_PUBLICA.format(id=id_boe)
