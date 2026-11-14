"""Puntúa cada convocatoria de 0 a 100 según lo bien que encaja con Reforesta.

Modo IA (Groq), en cascada para ahorrar cupo gratuito:
  1. CRIBA    -> modelo pequeño (8b) con texto corto: ¿merece la pena mirarla?
  2. DECISIÓN -> modelo grande (70b) solo si la criba supera UMBRAL_CRIBA:
                 veredicto, requisitos uno a uno y cita literal de las bases.
Modo palabras clave: respaldo gratuito si no hay GROQ_API_KEY o se agota el cupo.
Todos los modos devuelven el mismo diccionario.
"""
import json
import os
import time

from .config import (AMBITOS_PREFERENTES, MODELOS_CRIBA, MODELOS_DECISION, PAUSA_ENTRE_LLAMADAS,
                     UMBRAL_CRIBA, UMBRAL_MIRA, UMBRAL_PRESENTA)
from . import perfil
from .filtros import limpiar_html, normalizar, puntos_tematicos

MAX_TEXTO_CRIBA = 2500     # caracteres: el 8b solo necesita lo esencial
# Súbelo cuando cambien las instrucciones: las convocatorias evaluadas con otra versión
# se vuelven a evaluar en la siguiente ejecución.
VERSION_INSTRUCCIONES = 2

def version_actual():
    """Versión de las instrucciones + huella del perfil editado: si cambia algo, se reevalúa.
    Sin perfil editado es el número de siempre, para no reevaluar lo ya guardado."""
    h = perfil.huella()
    return f"{VERSION_INSTRUCCIONES}-{h}" if h else VERSION_INSTRUCCIONES


AVISO_BENEFICIARIOS = """El campo "Beneficiarios" viene de la BDNS y a menudo está mal etiquetado
(p. ej. pone "personas físicas" en ayudas para ONG). Guíate por el "Texto del extracto":
si admite asociaciones, fundaciones, ONG o entidades del Tercer Sector, la ONG puede pedirla."""

MAX_TEXTO_DECISION = 6000  # el 70b lee más (el extracto del boletín suele caber)
ESTADOS_REQUISITO = {"cumple", "duda", "no"}


def texto_para_analizar(det: dict, limite: int = MAX_TEXTO_DECISION) -> str:
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
        f"Fecha de publicación: {det.get('fechaRecepcion', '?')}",
        f"Plazo: {det.get('fechaInicioSolicitud') or det.get('textInicio') or '?'} -> "
        f"{det.get('fechaFinSolicitud') or det.get('textFin') or '?'}",
        f"Texto del extracto: {anuncios}",
    ]
    return "\n".join(partes)[:limite]


def veredicto(puntuacion: int) -> str:
    """Lo calculamos nosotros (no el modelo) para que siempre cuadre con la puntuación."""
    if puntuacion >= UMBRAL_PRESENTA:
        return "presenta"
    if puntuacion >= UMBRAL_MIRA:
        return "mira"
    return "descarta"


def resultado(puntuacion: int, metodo: str, **campos) -> dict:
    """Diccionario común a todos los modos (lo que acaba en el JSON de la web)."""
    puntuacion = max(0, min(100, int(puntuacion)))
    base = {
        "puntuacion": puntuacion,
        # Sin Groq (cupo agotado) no damos veredicto: las palabras clave no son fiables.
        "veredicto": "pendiente" if "pendiente_ia" in metodo else veredicto(puntuacion),
        "encaja": puntuacion >= UMBRAL_MIRA,
        "linea": "",
        "motivo": "",
        "resumen": "",
        "requisitos": [],          # [{"texto": ..., "estado": "cumple"|"duda"|"no"}]
        "requisitos_clave": "",    # versión en texto (la usa la web actual)
        "cita": "",                # frase literal del texto oficial, comprobada
        "porcentaje_financiado": None,
        "importe_max": None,
        "plazo_estimado": None,    # "AAAA-MM-DD" si la BDNS no da fecha de fin
        "metodo": metodo,
        "version": version_actual(),
    }
    base.update(campos)
    return base


# ---------------------------------------------------------------- modo palabras clave

def puntuar_por_palabras(det: dict, metodo: str = "palabras_clave") -> dict:
    puntos, encontradas = puntos_tematicos(texto_para_analizar(det))

    organo = det.get("organo") or {}
    ambito = f"{organo.get('nivel1', '')} {organo.get('nivel2', '')}".upper()
    if any(a in ambito for a in AMBITOS_PREFERENTES):
        puntos += 15

    return resultado(
        min(100, puntos), metodo,
        motivo="Coincidencias: " + ", ".join(encontradas[:8]) if encontradas else "Sin coincidencias claras",
        resumen=det.get("descripcion", "")[:300],
    )


# ---------------------------------------------------------------- modo IA (Groq)

def instrucciones_criba() -> str:
    return f"""Eres técnico de captación de fondos de esta ONG ambiental:
{perfil.texto()}
Decide rápido si esta convocatoria pública merece un análisis detallado.
Responde SOLO con JSON: {{"puntuacion": entero 0-100, "motivo": "una frase"}}.
{AVISO_BENEFICIARIOS}
Esto es solo un primer filtro: ante la duda, puntúa 40-60 para que se analice en detalle.
Puntúa bajo (0-20) solo si está claro que la ONG no puede pedirla o el tema no tiene
ninguna relación con medio ambiente, naturaleza, educación ambiental o voluntariado."""

def instrucciones_decision() -> str:
    return f"""Eres el técnico de captación de fondos de una ONG ambiental.
Decide si la ONG debe pedir esta ayuda pública.

Perfil de la ONG:
{perfil.texto()}

Responde SOLO con un objeto JSON con estas claves:
- "puntuacion": entero 0-100. 70-100 = puede presentarse y encaja; 50-69 = encaja
  pero hay dudas importantes; 0-49 = no le sirve.
- "linea": "restauracion", "conservacion", "educacion", "agroambiental" o "".
- "resumen": UNA frase en lenguaje llano sobre qué financia (máx. 25 palabras).
- "motivo": 1-2 frases concretas: quién puede pedirla, ámbito y temática.
- "requisitos": lista de 3 a 5 requisitos de elegibilidad que la ONG debe comprobar.
  Cada uno: {{"texto": "requisito breve", "estado": "cumple" | "duda" | "no"}}.
  "cumple" = el texto deja claro que la ONG lo cumple; "no" = la excluye o no lo
  cumple; "duda" = falta información (p. ej. cofinanciación, antigüedad, sede).
- "cita": copia LITERAL (sin cambiar ni una palabra, máx. 40 palabras) la frase del
  texto que dice quién puede ser beneficiario. "" si no aparece.
- "porcentaje_financiado": entero (porcentaje del coste que cubre) o null si no consta.
- "importe_max": número en euros máximo por solicitud o null si no consta.
- "plazo_estimado": si no hay fecha de fin pero sí una regla ("un mes desde la
  publicación"), calcula la fecha "AAAA-MM-DD" usando la fecha de publicación; si no, null.

{AVISO_BENEFICIARIOS}
Sé exigente: si la ONG no puede ser beneficiaria (solo personas físicas, empresas,
ayuntamientos o una entidad concreta), la puntuación debe ser baja aunque el tema
encaje. Si es de otra comunidad autónoma y exige sede allí, penaliza.
Si la convoca un ayuntamiento o diputación, suele exigir estar inscrita en su registro
municipal de entidades o tener sede o actividad en el municipio: ponlo como requisito
en "duda" salvo que el texto diga claramente otra cosa.
Los requisitos son de ELEGIBILIDAD (quién puede pedirla y qué debe cumplir); el plazo
de presentación no es un requisito.
La "cita" debe salir del "Texto del extracto", nunca de las líneas de datos de arriba.
No inventes datos: si algo no aparece en el texto, usa null, "" o "duda"."""


class CupoAgotado(Exception):
    """Groq pide esperar más de un minuto: casi seguro el límite diario."""


def _entero(valor):
    try:
        return int(float(valor)) if valor not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _requisitos(lista) -> list[dict]:
    limpios = []
    for r in lista if isinstance(lista, list) else []:
        if isinstance(r, dict) and str(r.get("texto", "")).strip():
            estado = str(r.get("estado", "duda")).lower()
            limpios.append({"texto": str(r["texto"]).strip(),
                            "estado": estado if estado in ESTADOS_REQUISITO else "duda"})
    return limpios[:5]


def cita_verificada(cita: str, texto: str) -> str:
    """Devuelve la cita solo si aparece de verdad en el texto oficial (los modelos inventan)."""
    cita = (cita or "").strip().strip("«»\"'… .")
    if len(cita) < 15:
        return ""
    return cita if normalizar(cita) in normalizar(texto) else ""


class Puntuador:
    """Elige el modo automáticamente y lleva la cuenta de lo que pasa con Groq."""

    def __init__(self, usar_ia: bool = True):
        self.cliente = None
        self.cupo_agotado = False
        self.llamadas = {"criba": 0, "decision": 0, "respaldo": 0}
        if usar_ia and os.environ.get("GROQ_API_KEY"):
            from groq import Groq  # import aquí: así el modo sin IA no necesita el paquete
            # El SDK reintenta solo y respeta el "retry-after" de Groq (límite por minuto).
            self.cliente = Groq(max_retries=5)
            self._elegir_modelos()

    def _elegir_modelos(self) -> None:
        """Pregunta a Groq qué modelos hay y prepara una cola por papel (criba / decisión).

        Groq limita el cupo diario POR MODELO: si uno se agota, se pasa al siguiente.
        """
        try:
            disponibles = {m.id for m in self.cliente.models.list().data}
        except Exception as e:
            print(f"  ! No se pudo listar modelos de Groq ({e}); se usan los preferidos")
            disponibles = set(MODELOS_CRIBA + MODELOS_DECISION)
        print(f"  Modelos de Groq disponibles: {', '.join(sorted(disponibles))}")

        def cola(entorno: str, preferidos: list[str]) -> list[str]:
            forzado = os.environ.get(entorno)
            lista = [forzado] if forzado else [m for m in preferidos if m in disponibles]
            return list(dict.fromkeys(lista))  # sin repetidos, en orden

        self.cola_decision = cola("GROQ_MODELO_DECISION", MODELOS_DECISION)
        # La criba usa primero los pequeños y, si se agotan, los grandes (gastan más, pero funciona).
        self.cola_criba = cola("GROQ_MODELO_CRIBA", MODELOS_CRIBA + MODELOS_DECISION)
        if not self.cola_decision:
            print("  ! Ninguno de los modelos preferidos está disponible: modo palabras clave")
            self.cliente = None

    @property
    def modelo_criba(self) -> str | None:
        return self.cola_criba[0] if self.cola_criba else None

    @property
    def modelo_decision(self) -> str | None:
        return self.cola_decision[0] if self.cola_decision else None

    def _siguiente_modelo(self, cola: list[str], error: Exception) -> None:
        agotado = cola.pop(0)
        print(f"    ! Cupo de {agotado} agotado ({str(error)[:120]})")
        if cola:
            print(f"      -> sigo con {cola[0]}")
        else:
            print("      -> no quedan modelos: el resto queda pendiente para la próxima ejecución")
            self.cupo_agotado = True

    @property
    def modo(self) -> str:
        if not self.cliente:
            return "palabras clave (sin IA)"
        return f"Groq ({self.modelo_criba} → {self.modelo_decision})"

    def _llamar(self, modelo: str, instrucciones: str, texto: str) -> dict:
        from groq import RateLimitError
        time.sleep(PAUSA_ENTRE_LLAMADAS)
        try:
            respuesta = self.cliente.chat.completions.create(
                model=modelo,
                temperature=0,  # respuestas estables, no creativas
                response_format={"type": "json_object"},
                messages=[{"role": "system", "content": instrucciones},
                          {"role": "user", "content": texto}],
            )
        except RateLimitError as e:
            # Si después de los reintentos del SDK sigue el 429, es el límite diario.
            raise CupoAgotado(str(e)) from e
        return json.loads(respuesta.choices[0].message.content)

    def _criba(self, det: dict) -> dict:
        datos = self._llamar(self.modelo_criba, instrucciones_criba(), texto_para_analizar(det, MAX_TEXTO_CRIBA))
        self.llamadas["criba"] += 1
        return {"puntuacion": _entero(datos.get("puntuacion")) or 0,
                "motivo": str(datos.get("motivo", ""))}

    def _decision(self, det: dict) -> dict:
        texto = texto_para_analizar(det, MAX_TEXTO_DECISION)
        datos = self._llamar(self.modelo_decision, instrucciones_decision(), texto)
        self.llamadas["decision"] += 1
        requisitos = _requisitos(datos.get("requisitos"))
        return resultado(
            _entero(datos.get("puntuacion")) or 0, f"groq:{self.modelo_decision}",
            linea=str(datos.get("linea", "")),
            motivo=str(datos.get("motivo", "")),
            resumen=str(datos.get("resumen", "")),
            requisitos=requisitos,
            requisitos_clave="; ".join(r["texto"] for r in requisitos if r["estado"] != "cumple"),
            # La cita solo vale si está en el texto oficial (no en nuestra cabecera de datos).
            cita=cita_verificada(str(datos.get("cita", "")), texto.split("Texto del extracto:", 1)[-1]),
            porcentaje_financiado=_entero(datos.get("porcentaje_financiado")),
            importe_max=_entero(datos.get("importe_max")),
            plazo_estimado=datos.get("plazo_estimado") or None,
        )

    def puntuar(self, det: dict) -> dict:
        if not self.cliente:
            return puntuar_por_palabras(det)
        if self.cupo_agotado:
            # Se marca para que la próxima ejecución la vuelva a pasar por Groq.
            self.llamadas["respaldo"] += 1
            return puntuar_por_palabras(det, "palabras_clave:pendiente_ia")

        fallos = 0
        while not self.cupo_agotado and fallos < 2:
            try:
                criba = self._criba(det)
            except CupoAgotado as e:
                self._siguiente_modelo(self.cola_criba, e)
                continue
            except Exception as e:  # JSON roto, red, error del servidor...
                fallos += 1
                print(f"    ! Groq falló en la criba ({type(e).__name__}: {e}); intento {fallos}/2")
                continue
            if criba["puntuacion"] < UMBRAL_CRIBA:
                return resultado(criba["puntuacion"], f"groq:{self.modelo_criba}",
                                 motivo=criba["motivo"], resumen=det.get("descripcion", "")[:300])
            while not self.cupo_agotado and fallos < 2:
                try:
                    return self._decision(det)
                except CupoAgotado as e:
                    self._siguiente_modelo(self.cola_decision, e)
                except Exception as e:
                    fallos += 1
                    print(f"    ! Groq falló en la decisión ({type(e).__name__}: {e}); intento {fallos}/2")
            break
        self.llamadas["respaldo"] += 1
        return puntuar_por_palabras(det, "palabras_clave:pendiente_ia")
