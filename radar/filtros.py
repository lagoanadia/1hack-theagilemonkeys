"""Filtros "duros": reglas baratas que descartan lo que seguro no sirve.

La idea es no gastar llamadas a la IA en convocatorias que se ven a la legua
que no son para Reforesta (nominativas, convenios, ya cerradas...).
"""
import re
import unicodedata
from datetime import date

from .config import (BENEFICIARIOS_SOLO_EMPRESA, DESCARTES_TITULO, NO_TEMATICAS, PESOS_PALABRAS,
                     REGION_NACIONAL, REGIONES_VALIDAS)


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

    # Geografía: "ES616 - Jaén" -> "ES616". Sin regiones, no podemos saberlo: pasa.
    codigos = [r.get("descripcion", "").split(" - ")[0].strip() for r in det.get("regiones", [])]
    if codigos and not any(c == REGION_NACIONAL or c.startswith(tuple(REGIONES_VALIDAS))
                           for c in codigos):
        return "fuera de ámbito geográfico"

    # Beneficiarios: solo descartamos si son exclusivamente empresas (ver config).
    tipos = [normalizar(b.get("descripcion", "")) for b in det.get("tiposBeneficiarios", [])]
    if tipos and all(t in BENEFICIARIOS_SOLO_EMPRESA for t in tipos):
        return "solo para empresas"
    return None


def motivo_corto(motivo: str) -> str:
    """Agrupa motivos para el resumen ("plazo cerrado el 2026-10-01" -> "plazo cerrado")."""
    if motivo.startswith("plazo cerrado"):
        return "plazo cerrado"
    if motivo.startswith("no es concurrencia"):
        return "no es concurrencia competitiva"
    if motivo.startswith("título contiene"):
        return "título (nominativa, convenio, beca...)"
    return motivo


def limpiar_html(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()


def puntos_tematicos(texto: str) -> tuple[int, list[str]]:
    """Puntos por palabras clave ambientales (PESOS_PALABRAS) y cuáles aparecen."""
    t = normalizar(texto)
    encontradas = [p for p in PESOS_PALABRAS if p in t]
    return sum(PESOS_PALABRAS[p] for p in encontradas), encontradas


def es_ambiental(texto: str, umbral: int) -> bool:
    """¿Habla de medio ambiente? Solo cuentan las palabras temáticas, no "sin ánimo de lucro"."""
    _, encontradas = puntos_tematicos(texto)
    return sum(PESOS_PALABRAS[p] for p in encontradas if p not in NO_TEMATICAS) >= umbral
