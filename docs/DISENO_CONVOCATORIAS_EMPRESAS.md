# Convocatorias y Empresas: dirección visual y contacto automatizado

## 1. Dirección visual

**Convocatorias**
- Sin título de pantalla. Su sitio lo ocupa el **ciclo de vida** como navegación principal: Radar → En proceso → Presentado, y aparte Descartadas. Cada fase es una píldora de 58 px con icono en círculo, nombre (17 px), subtítulo («Por revisar», «Preparando papeles», «Enviadas») y contador. La activa se rellena de azul marino; el contador del Radar es coral solo si hay algo por revisar.
- En proceso, Presentado y Descartadas comparten formato: **franjas** (secciones) con cabecera en píldora tintada (color elegido), contador, plegable, y tarjetas compactas en rejilla. Sin cabeceras grandes: solo una barra fina con el filtro o una pista y «+ Nueva sección».
- Cada tarjeta responde a «¿en qué fase está y cuánto le falta?»: ruta de 4 nodos (Presentada → Concedida → Plantar → Justificar), cuenta atrás en días y **barra de documentos** («3 de 7 documentos», ámbar mientras faltan, verde al completar). No hay otras barras.
- Coral solo para lo importante: «Presentar» se pone coral cuando están todos los documentos; el botón de avanzar en Presentado, solo si el paso es urgente.
- Arrastre: la tarjeta se levanta (sombra, giro de 2,6°), el original queda tenue, la sección de destino se resalta y un hueco punteado marca dónde caerá. Con teclado: asa ⠿ → Intro levanta, ←/→ mueve, ↑/↓ cambia de sección, Intro suelta, Esc cancela (con anuncio por voz).
- Descartadas: una sección por motivo (los del equipo) y «Descartadas por el radar» al final (solo se puede sacar de ahí). Arrastrar a otro motivo reclasifica; «+ Nueva sección» crea un motivo.

**Empresas**
- **Las 5 que más encajan** arriba (la nº 1 a doble ancho), con puntuación grande; después **Nuevas de hoy** (panel blanco con el mensaje «Ey, siguen apareciendo muchas ofertas de empresas, pero estas son las nuevas») y **El resto**.
- Ficha en bloques separados por filetes: identidad (inicial de color + promotor + proyecto) · qué tienen que hacer · datos clave en rejilla (sector, ubicación, tamaño, encaje) · etiquetas · medidas / BOE · acción. Se escanea en 2 segundos: la cifra de encaje es lo más grande de la ficha.
- «En contacto» (segunda fase) es un tablero de columnas con una plantilla por columna.

## 2. Contacto automatizado (segunda fase)

### A. Tablero de arrastrar y soltar con plantilla por columna (implementada)
```
Por escribir │ Primer mensaje ✉ │ Recordatorio ✉ │ Reunión │ Acuerdo
 [Empresa]  ─┼─► arrastrar ─────► se abre el borrador con la plantilla
```
Soltar una empresa en una columna con plantilla abre un borrador ya rellenado (proyecto, ubicación, medida de plantación, BOE), editable, con «Abrir en mi correo», «Copiar» y «Ya lo he enviado». Al enviarlo se anota el envío y se programa un recordatorio. «Reunión» y «Acuerdo» solo cambian el estado.
- **Pros:** el orden de la conversación se ve de un vistazo; arrastrar es el gesto que ya conocen; el humano revisa cada mensaje; sirve a quien no domina trámites.
- **Contras:** un mensaje por vez; el BOE no trae correos, así que el destinatario se añade a mano.

### B. Asistente de un clic
Un botón «Escribirles» en cada ficha abre un asistente de tres pasos (elegir plantilla → revisar → enviar) y la empresa pasa sola a la columna siguiente.
- **Pros:** lo más simple; no hay que entender un tablero.
- **Contras:** se pierde la vista de conjunto; menos usable con 20 empresas a la vez.

### C. Secuencia automática con recordatorios en el calendario
Al elegir una empresa se programa una secuencia (día 0 primer mensaje, día 7 recordatorio, día 14 llamada) y se crean eventos en el calendario con el borrador listo.
- **Pros:** es lo que más tiempo ahorra; no se olvida ningún seguimiento.
- **Contras:** necesita backend (cron, calendario, correo) y credenciales; riesgo de mensajes automáticos poco cuidados; más difícil de explicar.

### Recomendación: A
Encaja con vuestro criterio de «arrastrar y soltar», no exige backend nuevo y mantiene a una persona revisando cada mensaje. De C ya incluye lo más valioso, el **recordatorio** (7 días tras el primer mensaje, avisado en la tarjeta). El siguiente paso natural sería conectar el recordatorio con el correo de avisos o el calendario.

## 3. Qué se guarda dónde
- Secciones, orden, colores y plegado: `GET/PUT /api/tablero` (compartido por el equipo), con copia local.
- Reclasificar en Descartadas: `PUT /api/solicitudes/convocatoria/:codigo` con `motivos`.
- «Nuevas de hoy»: primer día que el equipo vio cada empresa (`vistas` en el tablero). La primera vez solo cuentan las publicadas en el BOE en las últimas dos semanas. Lo ideal sería que el radar guardase la fecha de detección.
- Documentos subidos: `GET /api/solicitudes/convocatoria/:codigo/documentos` (ya existía) contra la lista que pide la convocatoria (o la lista general si el radar no la encontró).
