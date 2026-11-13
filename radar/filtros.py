"""Filtros "duros": reglas baratas que descartan lo que seguro no sirve.

La idea es no gastar llamadas a la IA en convocatorias que se ven a la legua
que no son para Reforesta (nominativas, convenios, ya cerradas...).
"""
import re
import unicodedata
from datetime import date

from .config import DESCARTES_TITULO


def normalizar(texto: str) -> str:
    """Minúsculas y sin tildes, para comparar textos sin problemas."""
    texto = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", texto.lower())


def descartar_por_titulo(titulo: str) -> str | None:
    """Devuelve el motivo del descarte o None si la convocatoria pasa."""
    t = normalizar(titulo)
    for patron in DESCARTES_TITULO:
        if patron in t:
            return f"título contiene '{patron}'"
    return None


def descartar_por_detalle(det: dict, hoy: date) -> str | None:
    """Reglas que necesitan la ficha completa."""
    tipo = normalizar(det.get("tipoConvocatoria", ""))
    if tipo and "concurrencia" not in tipo:
        return f"no es concurrencia competitiva ({det.get('tipoConvocatoria')})"

    fin = det.get("fechaFinSolicitud")
    if fin and date.fromisoformat(fin) < hoy:
        return f"plazo cerrado el {fin}"
    return None


def limpiar_html(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()
