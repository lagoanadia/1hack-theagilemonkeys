"""El perfil de Reforesta que usa el radar: lo que el equipo edita en la web (pantalla Perfil).

Cada ejecución lo pide al backend (GET /api/perfil) con:
  RADAR_API_URL  dirección de la web, p. ej. https://1hack-theagilemonkeys.<cuenta>.workers.dev
  CLAVE_EQUIPO   la contraseña del equipo
Si no están, o el backend no responde, o nadie ha guardado el perfil todavía, se usa el de
config.py. Así el radar nunca se queda sin funcionar por culpa del perfil.

Del perfil salen:
  - texto()            lo que lee Groq para decidir si una convocatoria encaja;
  - regiones_validas() prefijos NUTS que pasan el filtro geográfico;
  - regiones_bdns()    regiones que se piden en el barrido de la BDNS;
  - huella()           cambia cuando cambia el perfil: lo evaluado con otro perfil se reevalúa.
"""
import hashlib
import os
from functools import lru_cache

import requests

from .config import PERFIL_REFORESTA, REGIONES_BDNS, REGIONES_VALIDAS

API = os.environ.get("RADAR_API_URL", "").rstrip("/")
CLAVE = os.environ.get("CLAVE_EQUIPO", "")


@lru_cache(maxsize=1)
def remoto() -> dict | None:
    """El perfil guardado en la web, o None si no hay (se usa el de config.py)."""
    if not API or not CLAVE:
        return None
    try:
        r = requests.get(f"{API}/api/perfil", headers={"x-clave-equipo": CLAVE}, timeout=20)
        r.raise_for_status()
        p = r.json()
    except (requests.RequestException, ValueError) as e:
        print(f"  ! No se pudo leer el perfil de la web ({e}); uso el de config.py")
        return None
    if not p.get("guardado"):
        return None  # nadie lo ha editado: el de config.py es equivalente
    print(f"  Perfil de la web (editado por {p.get('actualizado_por') or 'el equipo'} el {p.get('actualizado', '')[:10]})")
    return p


def _lineas(titulo: str, elementos: list[str]) -> str:
    return f"{titulo}\n" + "\n".join(f"- {e}" for e in elementos) if elementos else ""


@lru_cache(maxsize=1)
def texto() -> str:
    p = remoto()
    if not p:
        return PERFIL_REFORESTA
    donde = ", ".join(p.get("zonas") or []) or "la Comunidad de Madrid"
    partes = [
        f"{p.get('nombre', 'Reforesta')} es una ONG española ({p.get('tipo_entidad', 'sin ánimo de lucro')}) "
        f"con {p.get('experiencia', 'años')} de experiencia y un equipo de {p.get('equipo', 7)} personas. "
        f"Trabaja sobre todo en la Comunidad de Madrid ({donde}).",
        p.get("descripcion", ""),
        _lineas("Líneas de trabajo:", p.get("lineas") or []),
        _lineas("Lo que NO le sirve:", p.get("no_sirve") or []),
        _lineas("Requisitos de la entidad (úsalos para decidir si cumple cada requisito):",
                p.get("requisitos_entidad") or []),
    ]
    if p.get("ampliar_espana"):
        partes.append("Puede presentarse a convocatorias de cualquier comunidad autónoma de España.")
    elif p.get("comunidades_extra"):
        nombres = {c["codigo"]: c["nombre"] for c in p.get("opciones", {}).get("comunidades", [])}
        partes.append("Además de Madrid, puede presentarse en: "
                      + ", ".join(nombres.get(c, c) for c in p["comunidades_extra"]) + ".")
    return "\n\n".join(x for x in partes if x)


def regiones_validas() -> list[str]:
    p = remoto()
    if not p:
        return REGIONES_VALIDAS
    if p.get("ampliar_espana"):
        return ["ES"]  # todas las regiones españolas empiezan por ES
    return REGIONES_VALIDAS + list(p.get("comunidades_extra") or [])


@lru_cache(maxsize=1)
def regiones_bdns() -> str | None:
    """Ids de región para el barrido. None = toda España (sin filtro de región)."""
    p = remoto()
    if not p or not (p.get("ampliar_espana") or p.get("comunidades_extra")):
        return REGIONES_BDNS
    if p.get("ampliar_espana"):
        return None
    from . import bdns  # aquí para no crear importaciones circulares
    extra = bdns.ids_de_regiones(p["comunidades_extra"])
    return ",".join([REGIONES_BDNS] + [str(i) for i in extra])


def criterios() -> dict:
    """Criterios con número del perfil (None = sin límite). No cambian la huella: se aplican sin IA."""
    p = remoto() or {}
    c = p.get("criterios") or {}
    return {k: c.get(k) for k in ("importe_minimo", "cofinanciacion_maxima", "dias_minimos")}


def huella() -> str:
    """Resumen corto del perfil editado ("" si se usa el de config.py): si cambia, se reevalúa."""
    if not remoto():
        return ""
    base = texto() + "|" + ",".join(regiones_validas())
    return hashlib.sha1(base.encode("utf-8")).hexdigest()[:8]
