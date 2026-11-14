"""Qué documentos pide cada convocatoria, leyendo el PDF oficial (no solo el extracto).

Para las convocatorias que interesan (Presenta / Mira, o las que el equipo está preparando):
  1. Descarga de la BDNS el «Texto de la convocatoria» (PDF) y saca su texto.
  2. Busca el apartado de documentación («Documentación a aportar…», «deberán acompañar…»).
  3. Groq devuelve la lista normalizada; cada documento lleva la frase de donde sale, comprobada.
  4. Los modelos oficiales que adjunta la BDNS (solicitud, anexos) van como plantillas descargables.
Se hace una sola vez por convocatoria (caché en convocatorias.json).
"""
import io
import re

import requests
from pypdf import PdfReader

from . import bdns
from .puntuador import CupoAgotado, cita_verificada

URL_DOC = bdns.BASE + "/convocatorias/documentos?idDocumento={id}"
VERSION_DOCS = 1
MAX_POR_EJECUCION = 8  # cuida el cupo diario de Groq
MAX_TEXTO = 7000

# Tipos normalizados: permiten cruzar con la biblioteca de documentos de Reforesta.
TIPOS = ["estatutos", "registro_entidad", "cif", "representante_legal", "cert_hacienda", "cert_seg_social",
         "declaracion_responsable", "memoria_actividades", "memoria_proyecto", "presupuesto", "cuentas_anuales",
         "titularidad_bancaria", "permiso_propietario", "solicitud", "anexo", "otro"]

INSTRUCCIONES = f"""Eres el técnico de una ONG que prepara solicitudes de subvenciones.
Te paso el apartado de una convocatoria pública que dice qué documentación hay que presentar.
Responde SOLO con JSON: {{"documentos": [ ... ]}} con, como máximo, 15 elementos:
{{"nombre": "nombre corto y claro del documento",
  "tipo": uno de {TIPOS},
  "obligatorio": true si se exige siempre, false si es opcional o solo en algunos casos,
  "condicion": "cuándo se pide, si es opcional (máx. 15 palabras)" o "",
  "antiguedad_max_meses": número si el texto limita la antigüedad del documento, o null,
  "cita": "frase LITERAL del texto donde se pide (máx. 30 palabras)"}}
No incluyas documentos que no aparezcan en el texto. No inventes."""

PATRONES_APARTADO = [
    r"documentaci[oó]n (que )?(a|se debe|deber[aá]) (aportar|presentar|acompa[ñn]ar)",
    r"documentaci[oó]n (a aportar|requerida|preceptiva|necesaria)",
    r"deber[aá]n? (presentar|acompa[ñn]ar|aportar)[^.]{0,80}(siguiente|documentaci)",
    r"se acompa[ñn]ar[aá] (de )?(la siguiente )?documentaci",
]


def _pdf_texto(doc_id: int) -> str:
    r = requests.get(URL_DOC.format(id=doc_id), timeout=90)
    r.raise_for_status()
    if not r.content.startswith(b"%PDF"):
        return ""
    lector = PdfReader(io.BytesIO(r.content))
    return "\n".join((p.extract_text() or "") for p in lector.pages[:60])


def apartado(texto: str) -> str:
    """El trozo del texto que habla de la documentación a presentar ("" si no se encuentra)."""
    for patron in PATRONES_APARTADO:
        m = re.search(patron, texto, re.I)
        if m:
            inicio = texto.rfind("\n", 0, max(0, m.start() - 150)) + 1
            return texto[inicio:inicio + MAX_TEXTO]
    return ""


def plantillas(det: dict) -> list[dict]:
    """Modelos oficiales adjuntos en la BDNS (solicitud, anexos): enlaces directos."""
    out = []
    for d in det.get("documentos") or []:
        desc = " ".join(str(d.get("descripcion", "")).split())
        if re.search(r"modelo|anexo|formulario|solicitud|declaraci", desc, re.I) and not re.search(r"extracto", desc, re.I):
            out.append({"nombre": desc, "archivo": d.get("nombreFic", ""), "url": URL_DOC.format(id=d["id"])})
    return out[:12]


def texto_convocatoria(det: dict) -> tuple[str, str]:
    """(texto del apartado de documentación, nombre del PDF de donde sale)."""
    candidatos = sorted(det.get("documentos") or [],
                        key=lambda d: 0 if re.search(r"texto|convocatoria|bases", str(d.get("descripcion", "")), re.I) else 1)
    for d in candidatos[:3]:
        if re.search(r"modelo|anexo|formulario", str(d.get("descripcion", "")), re.I):
            continue
        try:
            t = apartado(_pdf_texto(d["id"]))
        except Exception as e:  # PDF roto, escaneado, red...
            print(f"    ! No se pudo leer {d.get('nombreFic')}: {type(e).__name__}")
            continue
        if t:
            return t, d.get("nombreFic", "")
    return "", ""


def requeridos(puntuador, det: dict) -> dict:
    """Campos a guardar en la convocatoria: documentos requeridos, plantillas y de dónde salen."""
    resultado = {"plantillas": plantillas(det), "documentos_version": VERSION_DOCS,
                 "documentos_requeridos": [], "documentos_fuente": ""}
    texto, fuente = texto_convocatoria(det)
    if not texto or not puntuador.cliente:
        resultado["documentos_fuente"] = "no encontrado: revisad las bases"
        return resultado
    datos = None
    while puntuador.cola_decision and datos is None:
        try:
            datos = puntuador._llamar(puntuador.modelo_decision, INSTRUCCIONES, texto)
        except CupoAgotado as e:
            puntuador._siguiente_modelo(puntuador.cola_decision, e)
    if datos is None:
        return {}  # sin cupo: se intentará en la próxima ejecución
    docs = []
    for d in (datos.get("documentos") or [])[:15]:
        if not isinstance(d, dict) or not str(d.get("nombre", "")).strip():
            continue
        tipo = d.get("tipo") if d.get("tipo") in TIPOS else "otro"
        meses = d.get("antiguedad_max_meses")
        docs.append({
            "nombre": str(d["nombre"]).strip()[:120],
            "tipo": tipo,
            "obligatorio": bool(d.get("obligatorio", True)),
            "condicion": str(d.get("condicion") or "").strip()[:160],
            "antiguedad_max_meses": int(meses) if isinstance(meses, (int, float)) and 0 < meses < 120 else None,
            "cita": cita_verificada(str(d.get("cita", "")), texto),
        })
    resultado.update(documentos_requeridos=docs, documentos_fuente=fuente)
    return resultado
