"""Contacto público de las empresas del BOE, buscado en internet con IA (Groq «compound», plan gratuito).

El BOE no publica cómo contactar con la empresa promotora. Para cada empresa que interesa (contactar o
mira) se pide a un modelo de Groq con búsqueda web los canales CORPORATIVOS y públicos: web, correo
general o de sostenibilidad, teléfono de centralita y página de contacto, con las fuentes donde los vio.
Muchas promotoras son sociedades vehículo (una SL por parque): entonces se da el contacto de su grupo.

Nunca se guardan datos personales de empleados. El equipo ve el resultado como «Encontrado con IA ·
comprobadlo» y decide si lo usa. Caché en data/contactos.json (una búsqueda por empresa).
"""
import json
import os
import re
import time
from urllib.parse import urlparse

from .__main__ import RAIZ

CACHE = RAIZ / "data" / "contactos.json"
MODELOS = ["groq/compound-mini", "groq/compound"]
MAX_POR_EJECUCION = 10
VERSION = 1

INSTRUCCIONES = """Busca en internet los canales de contacto PÚBLICOS y corporativos de la empresa que te indico:
es la promotora de un proyecto de energía o infraestructura en España. Una ONG de reforestación quiere
escribirle para ofrecerse a ejecutar sus medidas de reforestación obligatorias.

Responde SOLO con un objeto JSON, sin texto alrededor:
{"web": "url de su web oficial (o la de su grupo)", "email": "correo general, de contacto, de prensa o de
sostenibilidad publicado en su web, o \\"\\"", "telefono": "teléfono de centralita publicado, o \\"\\"",
"formulario": "url de su página de contacto, o \\"\\"", "grupo": "nombre de la empresa matriz si la promotora es
una sociedad vehículo, o \\"\\"", "fuentes": ["urls donde lo has visto"]}

Reglas: no inventes nada; si no lo encuentras, deja "". Solo canales corporativos: nunca datos personales
de empleados. Si la promotora es una sociedad creada para un solo parque, da el contacto de su grupo."""

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)
TELEFONO = re.compile(r"^[+\d][\d\s().-]{6,20}$")


def _url(v) -> str:
    v = str(v or "").strip()
    if v and not v.startswith("http"):
        v = "https://" + v
    try:
        u = urlparse(v)
    except ValueError:
        return ""
    return v if u.scheme in ("http", "https") and "." in u.netloc else ""


def _limpiar(datos: dict) -> dict | None:
    """Solo lo que tiene forma válida. Sin web ni ningún otro canal, no sirve."""
    c = {
        "web": _url(datos.get("web")),
        "email": str(datos.get("email") or "").strip() if EMAIL.match(str(datos.get("email") or "").strip()) else "",
        "telefono": str(datos.get("telefono") or "").strip() if TELEFONO.match(str(datos.get("telefono") or "").strip()) else "",
        "formulario": _url(datos.get("formulario")),
        "grupo": str(datos.get("grupo") or "").strip()[:120],
        "fuentes": [u for u in (_url(x) for x in (datos.get("fuentes") or [])[:5]) if u],
    }
    return c if any(c[k] for k in ("web", "email", "telefono", "formulario")) else None


def _json(texto: str) -> dict:
    m = re.search(r"\{.*\}", texto or "", re.S)
    return json.loads(m.group(0)) if m else {}


def buscar(cliente, promotor: str, proyecto: str, ubicacion: str) -> dict | None:
    from groq import RateLimitError
    entrada = f"Empresa promotora: {promotor}\nProyecto: {proyecto}\nUbicación: {ubicacion}"
    for modelo in MODELOS:
        try:
            r = cliente.chat.completions.create(
                model=modelo, temperature=0,
                messages=[{"role": "system", "content": INSTRUCCIONES}, {"role": "user", "content": entrada}],
            )
            return _limpiar(_json(r.choices[0].message.content))
        except RateLimitError:
            continue  # cupo agotado en este modelo: probar el siguiente
        except Exception as e:  # modelo no disponible, respuesta rara…
            print(f"  contacto: {modelo} falló ({str(e)[:80]})")
            continue
    return None


def clave(e: dict) -> str:
    return re.sub(r"\W+", " ", (e.get("promotor") or "").lower()).strip()


def completar(empresas: list[dict], cliente) -> None:
    """Añade e["contacto_ia"] a las empresas que interesan (usa la caché; busca como mucho N nuevas)."""
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    nuevas = 0
    for e in empresas:
        k = clave(e)
        if not k or e.get("accion") == "descarta":
            continue
        guardado = cache.get(k)
        if (guardado is None or guardado.get("version") != VERSION) and cliente and nuevas < MAX_POR_EJECUCION and os.environ.get("GROQ_API_KEY"):
            nuevas += 1
            time.sleep(2)
            c = buscar(cliente, e.get("promotor", ""), e.get("proyecto", ""), e.get("ubicacion", ""))
            guardado = {"version": VERSION, "contacto": c, "buscado": time.strftime("%Y-%m-%d")}
            cache[k] = guardado
            print(f"  contacto {'✓' if c else '–'} {e.get('promotor', '')[:50]}")
        if guardado and guardado.get("contacto"):
            e["contacto_ia"] = {**guardado["contacto"], "buscado": guardado.get("buscado", "")}
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    if nuevas:
        print(f"Contactos buscados con IA: {nuevas}")
