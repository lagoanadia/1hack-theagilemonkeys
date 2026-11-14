# Prompt: rediseño de Convocatorias y Empresas (Isla)

## ROL
Actúa como **diseñador gráfico especializado en diseño web** (UI/UX visual) con ojo para sistemas de diseño. Tu trabajo es rediseñar, sin romper lo que ya funciona, dos pantallas de la app: **Convocatorias** y **Empresas**. Prima lo visual: jerarquía clara, bloques bien separados, ritmo, aire y satisfacción al interactuar. Después implementas el diseño en el código.

## CONTEXTO
App web de Reforesta (ONG que restaura terreno) para no perder convocatorias. Código en `web/src/isla/` (React + CSS en `isla.css`). Pantallas: `Convocatorias.jsx`, `Empresas.jsx`, `Presentar.jsx`. Datos en `web/src/datos.js`.

**Estilo actual que debes respetar y ampliar** (variables en `.isla`):
- Paleta: navy `--nv #24364D` / `--nvs #3F5873`, coral `--co #EE6A4A` (acción principal), verde `--gr` (ok), ámbar `--am` (revisar), fondo `--bg #EEF1EA`, superficies `--soft #F5F7F2`.
- Tipografía Instrument Sans, títulos 32px con tracking negativo.
- Tarjetas blancas muy redondeadas (`.i-card` 28px), botones píldora, chips/etiquetas píldora (`.i-tag`), pasos como píldoras (`.i-stp`), iconos con `Icon.jsx`.
- Tono amable, orgánico, "isla": esquinas generosas, sombras suaves, nada de cabeceras pesadas.
Reutiliza clases y tokens existentes; si creas nuevas, que sigan el mismo lenguaje. No añadas librerías pesadas: para drag & drop usa la API nativa de HTML5 (o una dependencia mínima si es imprescindible) y que funcione también con teclado.

## CAMBIOS EN CONVOCATORIAS

### Global
1. **Quitar el título** de la pantalla ("Convocatorias") y **aprovechar el espacio liberado para el ciclo de vida** (Radar → En proceso → Presentado, más Descartadas), mostrándolo grande, claro y como navegación principal.
2. **Quitar la cabecera** en "En proceso".
3. Cambiar el botón **"Ya la he presentado" → "Presentar"**.

### Secciones estilo Notion (En proceso)
- Las convocatorias se organizan en **secciones/columnas con etiqueta personalizada** (el usuario las crea, renombra, colorea y borra) para clasificar de forma **rápida y visual**.
- **Arrastrar y soltar** una tarjeta a otra sección para ordenarla. Estados visuales claros: tarjeta "levantada" al arrastrar (sombra, ligera rotación), zona de destino resaltada, hueco que indica dónde caerá.
- Por defecto todas están en una franja llamada **"Por defecto"**.
- Cada sección con su contador, plegable, con botón "+ Nueva sección". Persistir orden y secciones.

### Barra de progreso de documentos
- En cada tarjeta de convocatoria, **visible en la previsualización (sin desplegar)**: barra de progreso = documentos subidos / documentos que pide la convocatoria. Con texto tipo "3 de 5 documentos" y color que cambie (ámbar → verde al completar).

### Presentado
- Mismo formato que "En proceso" (secciones, tarjetas, drag & drop, barra de progreso).
- Filtro visible: **"En marcha"** / **"Finalizado"**.

### Descartadas
- Misma línea Notion: **secciones por motivo de descarte** (las del radar y las del equipo como motivos), con tarjetas arrastrables entre secciones y opción de recuperar.

## CAMBIOS EN EMPRESAS
1. **Top 5 arriba**: bloque destacado con las **5 empresas que más encajan** (con puntuación/porqué encaja), y debajo **el resto** en lista/rejilla.
2. **Bloque "Nuevas de hoy"**: las empresas agregadas ese día, con un mensaje cercano tipo *"Ey, siguen apareciendo muchas ofertas de empresas, pero estas son las nuevas"*. Con etiqueta "Nueva".
3. **Contenido más estructurado y satisfactorio visualmente**: cada empresa como tarjeta con **bloques diferenciados** — título/nombre + logo o inicial, descripción corta, datos clave (sector, ubicación, tamaño, encaje), etiquetas y acción. Jerarquía tipográfica clara, separadores sutiles, espaciado generoso, alineación consistente. Que se pueda escanear en 2 segundos.
4. **Segunda fase (contacto)**: cuando una empresa pasa a la segunda fase, facilitar el contacto con **cosas automatizadas**. **Entrega 3 propuestas** de diseño/funcionamiento distintas (con boceto o descripción visual y pros/contras) y **recomienda una**. Nos gusta el **drag & drop**, así que al menos una debe basarse en él (p. ej. arrastrar una empresa a una columna "Contactar con plantilla X" que genera el borrador de email). Ideas de partida: (A) tablero de drag & drop con plantillas por columna; (B) asistente de un clic que redacta el mensaje y lo deja listo para enviar; (C) secuencia automática de seguimiento con recordatorios en el calendario.

## ENTREGABLES
1. Breve **dirección visual** (qué cambia y por qué) para cada pantalla.
2. **Las 3 propuestas** de contacto automatizado con recomendación.
3. **Implementación** en `Convocatorias.jsx`, `Empresas.jsx`, `isla.css` (y lo que haga falta), manteniendo responsive razonable, accesibilidad (foco visible, contraste, teclado) y sin romper rutas ni datos existentes.
4. Capturas o descripción del resultado para revisar.

## CRITERIOS DE ÉXITO
Se entiende de un vistazo en qué fase está cada convocatoria y cuánto le falta; ordenar es arrastrar y soltar; Empresas se lee en bloques limpios y da ganas de usarla; todo se siente parte del mismo sistema visual de hoy.
