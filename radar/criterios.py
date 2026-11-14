"""Criterios de búsqueda de Reforesta (pantalla Perfil), aplicados sin IA a cada convocatoria.

Nunca ocultan nada: bajan el veredicto y explican por qué, para que el equipo decida.
  - importe_minimo:         si la ayuda máxima es menor  -> "descarta"
  - cofinanciacion_maxima:  si hay que poner más %        -> como mucho "mira"
  - dias_minimos:           si quedan menos días          -> como mucho "mira"
El veredicto original de la IA se guarda en `veredicto_ia`, así cambiar los criterios no
necesita volver a llamar a Groq: se recalcula cada mañana.
"""
from datetime import date

ORDEN = {"presenta": 0, "mira": 1, "descarta": 2}


def _peor(a: str, b: str) -> str:
    return a if ORDEN.get(a, 0) >= ORDEN.get(b, 0) else b


def aplicar(c: dict, crit: dict, hoy: date) -> dict:
    if c.get("veredicto") == "pendiente":
        return c
    base = c.get("veredicto_ia") or c.get("veredicto")
    veredicto, avisos = base, []

    minimo = crit.get("importe_minimo")
    importe = c.get("importe_max") or c.get("presupuesto")
    if minimo and c.get("importe_max") and c["importe_max"] < minimo:
        veredicto = _peor(veredicto, "descarta")
        avisos.append(f"Importe máximo ({c['importe_max']:,.0f} €) por debajo de vuestro mínimo ({minimo:,.0f} €)".replace(",", "."))

    maxima = crit.get("cofinanciacion_maxima")
    pct = c.get("porcentaje_financiado")
    if maxima is not None and pct is not None and 100 - pct > maxima:
        veredicto = _peor(veredicto, "mira")
        avisos.append(f"Hay que poner el {100 - pct} % y vuestro máximo es el {maxima} %")

    dias_min = crit.get("dias_minimos")
    fecha = c.get("fin") or c.get("plazo_estimado")
    if dias_min and fecha:
        try:
            dias = (date.fromisoformat(fecha) - hoy).days
        except ValueError:
            dias = None
        if dias is not None and 0 <= dias < dias_min:
            veredicto = _peor(veredicto, "mira")
            avisos.append(f"Quedan {dias} días y necesitáis al menos {dias_min} para prepararla")

    return {**c, "veredicto_ia": base, "veredicto": veredicto, "avisos_criterios": avisos,
            "importe_referencia": importe}
