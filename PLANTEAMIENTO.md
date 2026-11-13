# Planteamiento: traductor visual de convocatorias para Reforesta

## El problema
Reforesta restaura terreno, pero cada hectárea la financia una convocatoria pública, una fundación o una empresa. Su capacidad de reforestar depende del dinero que consigue encontrar. Hoy presenta 4 o 5 solicitudes al año, encontradas en Google o en 4 fuentes fijas (MITECO, Fundación Biodiversidad, Comunidad de Madrid, Agenda 2030). Saber si una convocatoria encaja obliga a leer decenas de páginas. El canal de empresas (RSC) está a cero.

## La idea
Un **traductor visual de convocatorias**: busca en la BDNS, lee las bases con IA (Groq) y explica en un vistazo si Reforesta puede pedirla y qué falta, para que dediquen las horas a las que merecen la pena.

**No redacta la propuesta.** Reforesta ya sabe escribir; le falta capacidad para encontrar y priorizar.

## Usuario
Una persona del equipo de Reforesta (6 o 7 personas), sin experiencia en trámites. Pregunta que responde la app: *"¿Merece la pena dedicarle tiempo a esta convocatoria?"*

## Flujo
1. **Buscar:** escribe lo que necesita y salen convocatorias de la BDNS.
2. **Comprobar requisitos:** cada resultado indica si Reforesta cumple (✔ / ✘ / falta confirmar).
3. **Preparar:** checklist visual de lo que hay que reunir; la IA autorrellena los datos fijos de la entidad. No escribe la memoria del proyecto.
4. **Seguimiento:** línea de tiempo de pasos pendientes hasta la fecha de resolución.

## Ficha de convocatoria (pieza clave)
| Punto | Cómo se muestra |
|---|---|
| ¿Es para nosotros? | Semáforo + una frase de motivo |
| ¿Cuánto dinero? | Importe y % que cubre |
| ¿Hasta cuándo? | Cuenta atrás de días |
| ¿Quién puede pedirla? | Iconos ✔ / ✘ (ONG, territorio, cofinanciación) |
| ¿Qué financia? | Una frase en lenguaje llano + línea de Reforesta a la que encaja |
| ¿Qué hay que preparar? | Lista corta |
| Bases | Enlace al original |

## Alcance
| Prioridad | Qué |
|---|---|
| Imprescindible | Búsqueda en BDNS + ficha visual + comprobación de requisitos |
| Si hay tiempo | Checklist de preparación con autorrelleno de datos de la entidad |
| Si sobra | Línea de tiempo hasta la resolución; vista RSC con ejemplos reales |

## Stack
- PWA: Vite + React (`/web`), desplegada en Vercel.
- Backend/datos: ingesta BDNS + análisis con Groq (`/backend`). Resultados precalculados.
- `GROQ_API_KEY` solo en variables de entorno, nunca en el repo.

## Reparto
- **Diseño y usabilidad:** ficha, pantallas (Radar, Detalle, Plazos), textos, README y vídeo.
- **Técnico:** ingesta BDNS, analizador Groq, validación, API y despliegue.

## Contrato de datos (borrador, a cerrar entre las dos)
```json
{
  "id": "string",
  "titulo": "string",
  "organismo": "string",
  "plazo": "YYYY-MM-DD",
  "fecha_resolucion": "YYYY-MM-DD | null",
  "importe": 0,
  "porcentaje_cubierto": 0,
  "semaforo": "verde | amarillo | rojo",
  "puntuacion": 0,
  "motivo": "frase corta",
  "linea_reforesta": "restauracion | conservacion | educacion",
  "requisitos": [{ "texto": "string", "estado": "cumple | no_cumple | confirmar" }],
  "preparar": ["string"],
  "cita_bases": "string",
  "url": "string",
  "fuera_de_fuentes_habituales": true
}
```

## Validación
Comprobar que la herramienta encuentra las convocatorias que Reforesta ya solicitó o ganó (lista facilitada por la organización).

## Pendiente
- Lista de convocatorias solicitadas/ganadas.
- `GROQ_API_KEY` y acceso de red a `api.groq.com` y `www.infosubvenciones.es`.
- Cerrar el contrato de datos.
