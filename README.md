# Radar de Reforesta

Un radar que lee las convocatorias por el equipo de Reforesta y le dice, en un vistazo, cuáles merece la pena presentar para financiar reforestación. Cada convocatoria que se escapa es monte que no se planta.

**El radar encuentra, traduce y prioriza. No redacta propuestas.**

## Qué hace el MVP

Web de una sola página (sin dependencias ni instalación) con el flujo "una a una":

- **Inicio:** tres contadores con objetivo (revisadas hoy, este mes y solicitudes presentadas este año, con objetivo de 10).
- **Revisión:** una convocatoria por pantalla con semáforo, motivo en una frase, importe, plazo, requisitos y la cita literal de las bases. Tres decisiones: **Descartar** (←, con motivo en un toque), **Mirar luego** (↓) y **Presentar** (→).
- **Presentar:** crea el seguimiento con la checklist de documentos; los datos de la entidad vienen rellenos del perfil.
- **Seguimiento:** progreso de documentos y pasos hasta la resolución.
- **Descartadas:** todo lo rechazado queda visible y justificado (por el radar o por el equipo).
- **Empresas:** obligaciones de reforestar leídas del BOE (declaraciones de impacto ambiental favorables), con el mismo gesto: No encaja, Mirar luego, Contactar. El contacto es siempre el canal público del promotor.

El estado se guarda en el navegador (`localStorage`). Atajos de teclado: ← ↓ → en las pantallas de revisión.

## Cómo probarlo

```bash
cd web
python3 -m http.server 8000
# abre http://localhost:8000
```

También funciona abriendo `web/index.html` directamente.

## Datos reales y datos de ejemplo

Ahora mismo la web usa **datos de ejemplo** (marcados en pantalla). Para cargar convocatorias reales de la BDNS leídas con IA:

```bash
export GROQ_API_KEY=...        # nunca en el repositorio
python3 backend/ingest.py --limit 40
```

Esto genera `web/data/convocatorias.json`, que la web carga automáticamente. Cada veredicto lleva una **cita literal comprobada** contra el texto original; si no aparece tal cual, el veredicto baja un nivel y se marca "por revisar".

> **Aviso honesto:** `backend/ingest.py` está escrito pero **no se ha podido probar** contra la BDNS ni contra Groq (la red del entorno de desarrollo los bloqueaba). Antes de usarlo, comprueba los nombres de parámetros en el Swagger de la BDNS (`infosubvenciones.es/bdnstrans/doc/swagger`) y ajusta `BDNS_SEARCH`, `BDNS_DETAIL` y `texto_de()`.

## Qué falta

- Probar y ajustar la ingesta real de la BDNS y del BOE (el apartado Empresas usa datos de ejemplo).
- Propuestas de Reforesta con página pública para empresas y reservas (diseñado, no implementado).
- Avisos por correo, calendario y asistente "Dime qué buscas".
- Validar contra la lista de convocatorias que Reforesta ya solicitó o ganó.

## Reglas de calidad

- No se muestra un dato que el texto no diga: mejor "no indicado" que una cifra inventada.
- Todo lo estimado o de ejemplo va etiquetado.
- Las descartadas son visibles y justificadas.

## Estructura

```
web/index.html            MVP (HTML + CSS + JS, sin build)
web/data/                 convocatorias.json generado por la ingesta (opcional)
backend/ingest.py         BDNS -> Groq -> JSON
PLANTEAMIENTO.md          planteamiento y alcance
PROYECTO.md               resumen del proyecto para pedir feedback
```
