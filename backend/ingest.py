#!/usr/bin/env python3
"""Ingesta del Radar de Reforesta: BDNS -> lectura con Groq -> web/data/convocatorias.json

Solo usa la librería estándar. Variables de entorno:
  GROQ_API_KEY   (obligatoria)  clave de Groq; nunca la pongas en el repositorio
  GROQ_MODEL     (opcional)     por defecto llama-3.3-70b-versatile

ESTADO: escrito sin poder probarlo contra la BDNS ni contra Groq (la red del entorno de
desarrollo los bloqueaba). Antes de fiarte, copia los nombres reales de los parámetros desde
el Swagger de la BDNS: https://www.infosubvenciones.es/bdnstrans/doc/swagger
Ajusta BDNS_SEARCH / BDNS_DETAIL y los nombres de campo en `texto_de()` si difieren.

Uso:
  GROQ_API_KEY=... python backend/ingest.py --limit 40
"""
import argparse, json, os, re, sys, time, urllib.parse, urllib.request
from datetime import date, datetime

BDNS = "https://www.infosubvenciones.es/bdnstrans/api"
BDNS_SEARCH = BDNS + "/convocatorias/busqueda"   # TODO verificar parámetros en el Swagger
BDNS_DETAIL = BDNS + "/convocatorias"            # TODO verificar (numConv=...)
TERMINOS = ["reforestación", "repoblación forestal", "restauración forestal", "plantación árboles autóctonos"]
FUENTES_HABITUALES = ("miteco", "biodiversidad", "comunidad de madrid", "agenda 2030")
SALIDA = os.path.join(os.path.dirname(__file__), "..", "web", "data", "convocatorias.json")

PERFIL = """Reforesta es una ONG española (asociación sin ánimo de lucro, utilidad pública) de 6-7 personas.
Actúa sobre todo en la Comunidad de Madrid (Guadarrama). Foco: REFORESTACIÓN (plantación y restauración
forestal con especies autóctonas). No encajan: investigación, empresas con ánimo de lucro, obras civiles."""

SISTEMA = f"""Eres un analista de subvenciones. Lees las bases de una convocatoria y decides si Reforesta puede presentarse.
Perfil de la entidad:
{PERFIL}
Reglas estrictas:
- Usa SOLO lo que dice el texto. Si un dato no aparece, devuelve null. No inventes cifras.
- "cita" debe ser un fragmento LITERAL y corto del texto que justifique el veredicto.
- semaforo: "verde" (puede y debe presentarse), "amarillo" (encaja pero hay dudas), "rojo" (no puede o no encaja).
Responde SOLO con JSON con estas claves:
titulo, organismo, importe_max (número o null), porcentaje_cubierto (número o null), fecha_limite (YYYY-MM-DD o null),
forma_pago ("Anticipado"|"Tras justificar"|null), semaforo, motivo (una frase en lenguaje llano),
cita, requisitos (lista de {{"t": texto, "e": "cumple"|"confirmar"|"no_cumple"}})."""


def http_json(url, data=None, headers=None, timeout=40):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def buscar_bdns(termino, n):
    q = urllib.parse.urlencode({"descripcion": termino, "page": 0, "pageSize": n, "order": "fechaRecepcion", "direccion": "desc"})
    j = http_json(f"{BDNS_SEARCH}?{q}")
    return j.get("content", j if isinstance(j, list) else [])


def detalle_bdns(num):
    return http_json(f"{BDNS_DETAIL}?numConv={urllib.parse.quote(str(num))}")


def texto_de(detalle):
    """Concatena los campos de texto relevantes del detalle (ajustar a los campos reales)."""
    partes = []
    for k, v in detalle.items():
        if isinstance(v, str) and len(v) > 20:
            partes.append(f"{k}: {v}")
    return "\n".join(partes)[:12000]


def groq(texto):
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        sys.exit("Falta GROQ_API_KEY")
    body = json.dumps({
        "model": os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SISTEMA}, {"role": "user", "content": texto}],
    }).encode()
    j = http_json("https://api.groq.com/openai/v1/chat/completions", body,
                  {"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    return json.loads(j["choices"][0]["message"]["content"])


def norm(s):
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def cita_ok(cita, texto):
    c = norm(cita).strip("«»\"'… .")
    return len(c) > 15 and c in norm(texto)


def a_web(num, meta, a, texto):
    """Convierte el análisis al formato de la web. Si la cita no está en el texto, baja un nivel."""
    sem = a.get("semaforo", "amarillo")
    motivo = a.get("motivo") or ""
    if not cita_ok(a.get("cita"), texto):
        sem = {"verde": "amarillo", "amarillo": "amarillo", "rojo": "rojo"}.get(sem, "amarillo")
        motivo = (motivo + " (por revisar: la cita no se ha podido comprobar)").strip()
    dias = None
    if a.get("fecha_limite"):
        try:
            dias = (datetime.strptime(a["fecha_limite"], "%Y-%m-%d").date() - date.today()).days
        except ValueError:
            pass
    org = a.get("organismo") or meta.get("organo") or ""
    return {
        "id": f"bdns-{num}", "titulo": a.get("titulo") or meta.get("descripcion", "")[:90], "organismo": org, "fuente": "BDNS",
        "importe": a.get("importe_max") or 0, "pct": a.get("porcentaje_cubierto") or 0,
        "dias": dias if dias is not None else 0, "plazo_total": max(dias or 0, 30), "semaforo": sem,
        "fuera": not any(f in norm(org) for f in FUENTES_HABITUALES), "pago": a.get("forma_pago"),
        "motivo": motivo, "cita": "«" + (a.get("cita") or "") + "»",
        "url": f"https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/{num}",
        "requisitos": a.get("requisitos") or [],
        "preparar": [{"t": "Estatutos", "perfil": True}, {"t": "CIF", "perfil": True},
                     {"t": "Certificado de estar al corriente"}, {"t": "Presupuesto del proyecto"}],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=40)
    args = ap.parse_args()
    vistos, salida = set(), []
    for t in TERMINOS:
        for meta in buscar_bdns(t, args.limit):
            num = meta.get("numeroConvocatoria") or meta.get("id")
            if not num or num in vistos or len(salida) >= args.limit:
                continue
            vistos.add(num)
            try:
                texto = texto_de(detalle_bdns(num)) or json.dumps(meta, ensure_ascii=False)
                a = groq(texto)
                c = a_web(num, meta, a, texto)
                if c["dias"] and c["dias"] < 0:   # plazo vencido
                    continue
                salida.append(c)
                print(f"[{c['semaforo']:8}] {c['titulo'][:70]}")
            except Exception as e:  # una convocatoria que falla no tumba el lote
                print(f"  ! {num}: {e}", file=sys.stderr)
            time.sleep(1)   # ~1 petición por segundo a la BDNS
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump({"ejemplo": False, "generado": date.today().isoformat(), "convocatorias": salida, "empresas": []},
                  f, ensure_ascii=False, indent=1)
    print(f"Guardadas {len(salida)} convocatorias en {os.path.normpath(SALIDA)}")


if __name__ == "__main__":
    main()
