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
from datetime import date
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


FORMAS = {"asociacion": "Asociación", "fundacion": "Fundación", "cooperativa": "Cooperativa",
          "federacion": "Federación", "otra": "Otra forma jurídica"}
AMBITOS = {"local": "local", "autonomico": "autonómico", "estatal": "estatal", "internacional": "internacional"}


def ficha_texto(p: dict) -> str:
    """La ficha de elegibilidad en frases, con lo que no consta dicho explícitamente."""
    f = p.get("ficha") or {}
    si_no = lambda v: "sí" if v else "no"  # noqa: E731
    datos, falta = [], []

    def dato(etiqueta, valor, fmt=str):
        (datos if valor not in (None, "", []) else falta).append(
            f"{etiqueta}: {fmt(valor)}" if valor not in (None, "", []) else etiqueta)

    dato("Forma jurídica", FORMAS.get(f.get("forma_juridica")))
    anio = f.get("anio_constitucion")
    dato("Año de constitución", anio, lambda a: f"{a} (antigüedad: {date.today().year - a} años)")
    dato("Declarada de utilidad pública", f.get("utilidad_publica"), si_no)
    dato("Sede", f.get("sede"))
    dato("Ámbito de actuación", AMBITOS.get(f.get("ambito_actuacion")))
    dato("Inscrita en", f.get("registros"), ", ".join)
    dato("Al corriente con Hacienda y Seguridad Social", f.get("al_corriente_pagos"), si_no)
    dato("Presupuesto anual", f.get("presupuesto_anual"), lambda v: f"{v:,.0f} €".replace(",", "."))
    dato("Voluntarios", f.get("voluntarios"))
    dato("Puede presentar aval bancario", f.get("aval_bancario"), si_no)
    dato("Inscrita como ONGD (cooperación al desarrollo)", f.get("ongd"), si_no)
    dato("Certificaciones", f.get("certificaciones"), ", ".join)
    if not datos:
        return ""
    reglas = ("Al revisar los requisitos de una convocatoria, compáralos con esta ficha: si la ficha "
              "muestra que la entidad NO lo cumple, el requisito es \"no\" y, si es imprescindible para "
              "ser beneficiaria, la puntuación debe ser menor de 40. Si la ficha no lo dice, es \"duda\".")
    texto_f = _lineas("Ficha de la entidad (datos reales para comprobar requisitos):", datos)
    if falta:
        texto_f += "\nNo consta: " + "; ".join(falta) + "."
    return texto_f + "\n" + reglas


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
        _lineas("Reglas del equipo (lo que no les interesa, aprendido de sus descartes):", p.get("reglas") or []),
        ficha_texto(p),
        _lineas("Otros datos de la entidad:", p.get("requisitos_entidad") or []),
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


def en_estado(*estados: str) -> set[str]:
    """Códigos de convocatorias que el equipo tiene en esos estados (vacío si no hay backend)."""
    if not API or not CLAVE:
        return set()
    try:
        r = requests.get(f"{API}/api/solicitudes", params={"tipo": "convocatoria"},
                         headers={"x-clave-equipo": CLAVE}, timeout=20)
        r.raise_for_status()
        return {s["id"] for s in r.json() if s.get("estado") in estados}
    except (requests.RequestException, ValueError):
        return set()


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
