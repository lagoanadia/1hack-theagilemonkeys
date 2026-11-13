"""Puntúa cada convocatoria de 0 a 100 según lo bien que encaja con Reforesta.

Dos modos:
  - IA (Groq): lee el texto oficial y razona como lo haría un técnico de la ONG.
  - Palabras clave: respaldo gratuito y sin red, para cuando no hay GROQ_API_KEY.
Los dos devuelven el mismo diccionario, así el resto del programa no distingue.
"""
import json
import os
import time

from .config import AMBITOS_PREFERENTES, PERFIL_REFORESTA, PESOS_PALABRAS
from .filtros import limpiar_html, normalizar

MODELO_GROQ = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
MAX_CARACTERES_TEXTO = 6000  # el texto del BOE puede ser largo; recortamos para ahorrar tokens


def texto_para_analizar(det: dict) -> str:
    """Junta en un solo texto lo relevante de la ficha de la BDNS."""
    organo = det.get("organo") or {}
    beneficiarios = ", ".join(b["descripcion"] for b in det.get("tiposBeneficiarios", []))
    regiones = ", ".join(r["descripcion"].strip() for r in det.get("regiones", []))
    anuncios = " ".join(limpiar_html(a.get("texto", "")) for a in det.get("anuncios", []))
    partes = [
        f"Título: {det.get('descripcion', '')}",
        f"Órgano: {organo.get('nivel1', '')} / {organo.get('nivel2', '')} / {organo.get('nivel3', '')}",
        f"Tipo: {det.get('tipoConvocatoria', '')}",
        f"Presupuesto total: {det.get('presupuestoTotal')}",
        f"Beneficiarios: {beneficiarios}",
        f"Regiones: {regiones}",
        f"Finalidad: {det.get('descripcionFinalidad', '')}",
        f"Plazo: {det.get('fechaInicioSolicitud') or det.get('textInicio') or '?'} -> "
        f"{det.get('fechaFinSolicitud') or det.get('textFin') or '?'}",
        f"Texto del extracto: {anuncios}",
    ]
    return "\n".join(partes)[:MAX_CARACTERES_TEXTO]


# ---------------------------------------------------------------- modo palabras clave

def puntuar_por_palabras(det: dict) -> dict:
    texto = normalizar(texto_para_analizar(det))
    encontradas = [p for p in PESOS_PALABRAS if p in texto]
    puntos = sum(PESOS_PALABRAS[p] for p in encontradas)

    organo = det.get("organo") or {}
    ambito = f"{organo.get('nivel1', '')} {organo.get('nivel2', '')}".upper()
    if any(a in ambito for a in AMBITOS_PREFERENTES):
        puntos += 15

    puntuacion = min(100, puntos)
    return {
        "puntuacion": puntuacion,
        "encaja": puntuacion >= 50,
        "linea": "",
        "motivo": "Coincidencias: " + ", ".join(encontradas[:8]) if encontradas else "Sin coincidencias claras",
        "resumen": det.get("descripcion", "")[:300],
        "requisitos_clave": "",
        "metodo": "palabras_clave",
    }


# ---------------------------------------------------------------- modo IA (Groq)

INSTRUCCIONES = f"""Eres el técnico de captación de fondos de una ONG ambiental.
Tu trabajo es decidir si una convocatoria pública merece que la ONG pida la ayuda.

Perfil de la ONG:
{PERFIL_REFORESTA}

Responde SOLO con un objeto JSON con estas claves:
- "puntuacion": entero 0-100. 80-100 = encaja muy bien y la ONG puede presentarse;
  50-79 = encaja parcialmente o hay dudas sobre requisitos; 0-49 = no le sirve.
- "encaja": true/false.
- "linea": cuál de sus líneas encaja ("restauracion", "conservacion", "educacion",
  "agroambiental" o "" si ninguna).
- "motivo": 1-2 frases explicando la puntuación (sé concreto: quién puede pedirla,
  ámbito geográfico, temática).
- "resumen": 1 frase en lenguaje llano sobre qué financia la convocatoria.
- "requisitos_clave": requisitos que la ONG debe comprobar (ámbito, tipo de
  entidad, cofinanciación...), en una frase. "" si no hay nada destacable.

Sé exigente: si la ONG no puede ser beneficiaria (solo personas físicas, empresas,
ayuntamientos o una entidad concreta), la puntuación debe ser baja aunque el tema encaje.
Si es de otra comunidad autónoma y exige sede allí, penaliza."""


def puntuar_con_groq(det: dict, cliente) -> dict:
    respuesta = cliente.chat.completions.create(
        model=MODELO_GROQ,
        temperature=0,  # queremos respuestas estables, no creativas
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": INSTRUCCIONES},
            {"role": "user", "content": texto_para_analizar(det)},
        ],
    )
    datos = json.loads(respuesta.choices[0].message.content)
    return {
        "puntuacion": max(0, min(100, int(datos.get("puntuacion", 0)))),
        "encaja": bool(datos.get("encaja", False)),
        "linea": str(datos.get("linea", "")),
        "motivo": str(datos.get("motivo", "")),
        "resumen": str(datos.get("resumen", "")),
        "requisitos_clave": str(datos.get("requisitos_clave", "")),
        "metodo": f"groq:{MODELO_GROQ}",
    }


class Puntuador:
    """Elige el modo automáticamente y, si Groq falla, cae al de palabras clave."""

    def __init__(self, usar_ia: bool = True):
        self.cliente = None
        if usar_ia and os.environ.get("GROQ_API_KEY"):
            from groq import Groq  # import aquí: así el modo sin IA no necesita el paquete
            self.cliente = Groq()

    @property
    def modo(self) -> str:
        return f"Groq ({MODELO_GROQ})" if self.cliente else "palabras clave (sin IA)"

    def puntuar(self, det: dict) -> dict:
        if not self.cliente:
            return puntuar_por_palabras(det)
        for intento in range(3):
            try:
                return puntuar_con_groq(det, self.cliente)
            except Exception as e:  # límite de peticiones, JSON roto, red...
                espera = 5 * (intento + 1)
                print(f"    ! Groq falló ({type(e).__name__}: {e}); reintento en {espera}s")
                time.sleep(espera)
        return puntuar_por_palabras(det)
