# 🌱 Radar de convocatorias para Reforesta

> **1hack A Coruña · Reto Reforesta**: *¿qué construirías para que Reforesta no pierda ninguna
> convocatoria que merezca la pena y pueda restaurar más terreno?*

🔗 **Demo:** _(enlace de Cloudflare)_ · 🎬 **Vídeo:** _(enlace al vídeo)_

## El problema

Reforesta es una ONG con más de 30 años plantando y un equipo de 6 o 7 personas. Cada hectárea
que restaura la paga una convocatoria pública, una fundación o una empresa. Hoy presenta **4-5
solicitudes al año**, porque encontrar convocatorias y leer decenas de páginas para saber si
encajan le quita el tiempo que necesita para las propuestas y el trabajo de campo. Su objetivo
es llegar a **10 solicitudes al año con el mismo equipo**.

## La solución

Un **radar** que cada mañana lee todas las ayudas públicas de España, descarta lo que no sirve
y deja a Reforesta una lista corta con un semáforo:

| | Significa | Qué ve el equipo |
|---|---|---|
| 🟢 **Presenta** | Encaja y Reforesta puede pedirla | Resumen en una frase, importe y días que quedan |
| 🟡 **Mira** | Encaja, pero hay algo por confirmar | Qué requisito hay que comprobar |
| 🔴 **Descarta** | No sirve | El motivo, para fiarse del descarte |

Por cada convocatoria, la IA explica **por qué**. Da los requisitos uno a uno (✓ cumple · ? duda
· ✗ no) y una **cita literal del texto oficial** (el extracto publicado en el boletín). El radar comprueba que esa cita aparece en el texto
oficial, así que no puede inventársela.

Reforesta no instala nada ni cambia su forma de trabajar: abre una web y ve qué merece la pena
esta semana.

## Resultados con datos reales

Ejecución del 13 de noviembre de 2026 sobre la **BDNS** (Base de Datos Nacional de Subvenciones),
con las convocatorias estatales y de la Comunidad de Madrid del último año:

| Paso | Convocatorias |
|---|---:|
| Publicadas en la BDNS (Estado + Madrid, 12 meses) | **5.117** |
| ✂️ Nominativas, convenios, becas… (por título) | −2.031 |
| ✂️ No son de concurrencia competitiva | −1.104 |
| ✂️ Plazo cerrado | −1.082 |
| ✂️ Sin relación ambiental | −691 |
| ✂️ Solo para empresas | −110 |
| **Llegan a la IA** | **≈ 100** |

Más del 98 % del trabajo de lectura se hace sin IA y sin coste. Groq solo lee las ≈ 100 que
quedan, y a partir del segundo día solo las nuevas (unas pocas al día).

**Validación con convocatorias reales de Reforesta.** El reto da dos ejemplos de convocatorias a
las que Reforesta se presentó, y el radar **encuentra las dos**:

- **BDNS 923290 (MITECO)**: actividades de interés general para la protección del medio ambiente.
  La BDNS la etiqueta mal (solo "personas físicas"), pero el radar lee el texto oficial y ve que
  es para ONG y entidades del Tercer Sector.
- **BDNS 904719 (Comunidad de Madrid)**: subvenciones a entidades sin ánimo de lucro para proyectos
  ambientales (la Orden 1689/2026). Su título no contiene "medio ambiente", así que una búsqueda
  por palabras clave no la habría encontrado. El radar la encuentra porque revisa todas las
  convocatorias.

Las dos aparecen ahora como cerradas, que es correcto: sus plazos terminaron en 2026. El radar las
habría avisado el mismo día de su publicación. La web incluye el apartado **"Prueba con
convocatorias reales de Reforesta"**: por cada una enseña qué filtros pasa y el análisis completo
de la IA (veredicto, requisitos y cita del texto oficial), como si siguiera abierta. Lo genera
`python -m radar.validar` y se amplía añadiendo códigos a `CONVOCATORIAS_VALIDACION`.

## Empresas obligadas a compensar (canal RSC)

El canal de empresas de Reforesta está casi vacío porque solo le llegan las que la buscan a
ella. El radar tiene una segunda fuente: las **declaraciones de impacto ambiental (DIA)** del
BOE. Cuando una empresa quiere construir un parque eólico, una planta solar o una línea
eléctrica, el Ministerio le impone por resolución **medidas compensatorias obligatorias**:
revegetar, reforestar, restaurar hábitats, crear charcas… Esa empresa necesita a alguien que
las ejecute.

`python -m radar.empresas` lee cada día las DIA del BOE (API de datos abiertos, unas 30 cada seis
meses). A la IA solo le pasa el arranque de la resolución y los párrafos sobre medidas, unos
9.000 de sus ~100.000 caracteres. Groq extrae **promotor, proyecto, ubicación, medidas y
hectáreas**, y marca cada empresa como *Contactar*, *Mira* o *Descarta*. La web lo enseña en la
pestaña **Empresas**, con la cita literal del BOE comprobada.

## Trabajo en equipo y canal de proyectos

La web tiene un pequeño backend, un Worker de Cloudflare con base de datos **D1** (gratuita):

- **Equipo de Reforesta** ("Soy de Reforesta" + contraseña del equipo): marca convocatorias y empresas como
  *Me interesa* / *No interesa*. Las marcas se comparten entre todo el equipo y reordenan la lista.
- **Panel privado**: sin contraseña solo se ve la pestaña *Proyectos*; el Worker tampoco entrega
  los datos del radar (`/data/*.json`) sin ella.
- **Pestaña Proyectos**: Reforesta publica lo que quiere restaurar ("15 ha tras el incendio de
  Valdemorillo, 30.000 €"). Cualquier empresa, sin cuenta, pulsa **"Quiero ayudar"** y deja su
  contacto. Solo el equipo ve quién se ha interesado. Enlace para compartir: la propia web.
  Anti-spam: campo trampa para bots y máximo 5 envíos por hora desde la misma conexión (se guarda
  una huella cifrada, nunca la IP).

Puesta en marcha:
1. Crear la base D1 `radar-reforesta` y poner su id en `wrangler.jsonc` (las tablas se crean solas).
2. En el Worker, añadir el secreto `CLAVE_EQUIPO` con la contraseña del equipo.

El Worker también trae preparado el login con Google (secretos `GOOGLE_CLIENT_ID` y `EMAILS_EQUIPO`),
para cuando Reforesta prefiera entrar con su cuenta en lugar de con una contraseña compartida.

### API del ciclo de vida (para el frontend)

Todas con la cabecera `X-Clave-Equipo` (y opcionalmente `X-Autor: <nombre>`):

| Ruta | Qué hace |
|---|---|
| `GET /api/solicitudes?tipo=convocatoria` | Estado de cada convocatoria (o `empresa`) |
| `PUT /api/solicitudes/convocatoria/:codigo` | `{estado, motivos[], nota, responsable, siguiente_paso, fecha_paso}` |
| `POST /api/solicitudes/:tipo/:id/deshacer` | Vuelve al estado anterior |
| `GET /api/solicitudes/:tipo/:id/historial` | Cambios, con quién y cuándo |
| `GET/POST /api/motivos`, `DELETE /api/motivos/:id` | Catálogo de motivos de descarte, con cuántas veces se ha usado cada uno |

Estados de convocatoria: `por_revisar`, `mas_tarde`, `preparando`, `presentada`, `subsanar`,
`concedida`, `denegada`, `plantar`, `justificar`, `terminada`, `descartada`. De empresa: `nueva`,
`contactada`, `reunion`, `acuerdo`, `cerrada`, `descartada`. Sin fila en `solicitudes`, una
convocatoria está "por revisar" con el veredicto del radar; para recuperar una descartada por el
radar basta con ponerla en `por_revisar`.

### Propuestas y reservas

| Ruta | Qué hace |
|---|---|
| `GET /api/proyectos` | Público: propuestas publicadas con `plazas_libres` (null = sin límite) y `completa` |
| `GET /api/proyectos?todas=1` | Equipo: también borradores y ocultas, con nº de reservas |
| `POST /api/proyectos` | `{titulo, lugar, tipo, incluye, descripcion, hectareas, presupuesto, plazas, estado}` |
| `PUT /api/proyectos/:id` | Editar o cambiar `estado`: `borrador`, `publicada`, `oculta` |
| `POST /api/proyectos/:id/interes` | Público: reservar (rechaza si no quedan plazas) |
| `PUT /api/interesados/:id` | `{estado}`: `nueva`, `contestada`, `confirmada`, `descartada` (descartada libera la plaza) |

### Impacto para empresas (CO₂ en vuelos)

`GET /api/impacto?ha=8` (público) traduce hectáreas a algo que se entiende: CO₂ absorbido al año y
en 30 años, coches, personas y **vuelos de ida y vuelta desde Madrid** a 9 destinos (con coordenadas
`ll: [lon, lat]` para dibujarlos en un globo). Cada propuesta de `/api/proyectos` con hectáreas trae
ese mismo objeto en `impacto`. Supuestos (estimaciones, ajustables en `IMPACTO` del Worker):
5 t CO₂/ha/año, 30 años, 0,1 kg CO₂ por pasajero y km, coche 1,6 t/año, persona 5 t/año.
Ejemplo: 8 ha ≈ 40 t CO₂/año ≈ 34 vuelos Madrid–Nueva York cada año.
- **Al ayudar**: `POST /api/proyectos/:id/interes` admite `hectareas` (opcional, como mucho las de la
  propuesta) y responde con el `impacto` de esa ayuda (para animar el avión). Cada propuesta trae
  `hectareas_apoyadas` y `/api/interesados` las hectáreas de cada empresa.
- **Empresas del BOE**: `/data/empresas.json` añade `impacto` a las que tienen hectáreas que compensar
  (`superficie_total_ha` o la suma de sus medidas); `null` si el BOE no da superficie.

### Documentos

- El radar guarda en cada convocatoria interesante `documentos_requeridos` (nombre, `tipo`,
  `obligatorio`, `condicion`, `antiguedad_max_meses`, `cita`), `documentos_fuente` y `plantillas`
  (modelos oficiales de la BDNS con enlace de descarga).
- Biblioteca: `GET/POST /api/documentos` (POST multipart con `archivo`, `nombre`, `tipo`, `emitido`,
  `caduca`, o JSON sin archivo), `PUT/DELETE /api/documentos/:id`, `GET /api/archivos/:id`.
- Huecos de cada solicitud: `GET /api/solicitudes/convocatoria/:codigo/documentos` y
  `PUT .../documentos/:requisito` con `{documento_id, estado, responsable}` (el arrastrar y soltar).
- Archivos privados (solo equipo), hasta 10 MB: se guardan en D1 (gratis); si se configura R2, en R2.

### Modo demo

Si no hay ninguna convocatoria abierta que encaje, la web saldría vacía. En modo demo (activo por
defecto), `/data/convocatorias.json` añade las convocatorias reales de `validacion.json` y `demo.json` (`python -m radar.demo`,
convocatorias reales recientes ya cerradas) como si
estuvieran abiertas, con `demo: true` y fechas de demostración. No van en los correos.
`PUT /api/demo {activo: false}` lo apaga (o la variable `MODO_DEMO = "0"`).

### Avisos por correo

Cada mañana (07:23 UTC, cron del Worker) se manda a `email_avisos` del perfil un resumen: pasos que
vencen, convocatorias nuevas que encajan y empresas que esperan respuesta. Respeta `avisos`
(`cada_manana`, `semanal` = lunes, `nunca`) y no manda nada si no hay novedades.
Requiere el secreto `RESEND_API_KEY` (resend.com, gratis) en Cloudflare; opcional `EMAIL_REMITENTE`
(dominio verificado en Resend) y `URL_PUBLICA` (enlace del correo).
`GET /api/avisos/correo` muestra la vista previa (`?html=1`, el correo tal cual) y `POST` lo envía ya.

### Mapa de plantaciones

`GET /api/plantaciones` (público) devuelve los sitios con el mismo formato que `data/actuaciones.js`
(`nombre, ll:[lon,lat], ha, tipo c/e/v, anio, con`) más `arboles`, `especies` y `totales`
(hectáreas, sitios y árboles, por año y por tipo). Las `notas` solo las ve el equipo.
`POST` (equipo) admite `origen: {tipo, id}` para enlazarla con la convocatoria o empresa de la que
salió; si no se indica `con`, se rellena con su título. `PUT/DELETE /api/plantaciones/:id`.

### Seguimiento

Al cambiar de estado, la solicitud recibe un **siguiente paso con fecha** propuesto (subsanar: 14 días;
justificar: 90; preparando: el fin de plazo de la convocatoria). El equipo puede cambiarlo con
`siguiente_paso` / `fecha_paso` (AAAA-MM-DD). `GET /api/seguimiento` devuelve lo que está en marcha,
ordenado por urgencia (`vencido`, `urgente` ≤3 días, `pronto` ≤14, `ok`, `sin_fecha`) y los `avisos`
en texto (los mismos que irán por correo).

### Reglas aprendidas

Cuando un motivo de descarte se repite 3 veces, `GET /api/reglas` lo devuelve como **sugerencia**
(`{sugerencias, reglas}`). Si la regla tiene número (cofinanciación, importe, plazo), al aceptarla
(`POST /api/reglas {motivo, accion:"aceptar"}`) se convierte en un **criterio del perfil** y el radar
la aplica sin IA; la cifra sale de lo que el equipo marcó al descartar («como máximo el 30 %»).
Las reglas escritas a mano (`POST {texto}`) van a las instrucciones de Groq. `accion:"ignorar"`
la descarta para siempre; `DELETE /api/reglas/:id` la quita y deshace su criterio.

### Perfil editable

`GET/PUT /api/perfil` guarda lo que el radar sabe de Reforesta: nombre, equipo, zonas,
`comunidades_extra` (códigos NUTS, p. ej. `ES41` Castilla y León), `ampliar_espana`, `descripcion`,
`lineas`, `no_sirve`, `objetivo_anual`, `documentos` y `avisos`. El PUT reemplaza cada campo que se
envía (las listas, enteras). Cada mañana el radar lo lee (`radar/perfil.py`) y lo usa en las
instrucciones de Groq y en el filtro geográfico; si el perfil cambia, se reevalúa lo guardado.
**Ficha de elegibilidad** (`ficha` en el perfil): los datos de Reforesta que piden las convocatorias
para poder presentarse: `forma_juridica`, `anio_constitucion` (antigüedad), `utilidad_publica`,
`sede`, `ambito_actuacion`, `registros`, `al_corriente_pagos`, `presupuesto_anual`, `voluntarios`,
`aval_bancario`, `ongd`, `certificaciones`. La IA compara cada requisito con la ficha: si la
entidad no lo cumple, el requisito es «no» y, si es imprescindible, la convocatoria se descarta;
lo que no consta (null) es «duda». Se envían solo los campos que cambian; `null` = no consta.

**Criterios de búsqueda** (`criterios` en el perfil, sin IA, `radar/criterios.py`):
`importe_minimo` (por debajo → *descarta*), `cofinanciacion_maxima` en % (si hay que poner más →
como mucho *mira*) y `dias_minimos` para preparar (si quedan menos → como mucho *mira*). Nunca
ocultan nada: el radar guarda el veredicto de la IA en `veredicto_ia` y explica el cambio en
`avisos_criterios`. Los **requisitos de la entidad** (`requisitos_entidad`, texto libre) van a la IA.
Para activarlo en GitHub: variable `RADAR_API_URL` (la dirección de la web) y secreto
`CLAVE_EQUIPO` (la misma contraseña que en Cloudflare). Sin ellos, se usa `radar/config.py`.

## Cómo funciona

```
GitHub Actions (cada mañana, gratis)
   └─ python -m radar
        1. RECOLECTAR  bdns.py       Todas las convocatorias del Estado y de Madrid (API pública)
        2. FILTRAR     filtros.py    Reglas sin IA: título, tipo, plazo, región, beneficiarios, temática
        3. PUNTUAR     puntuador.py  Groq en cascada:
                                       · criba con un modelo pequeño: «¿merece la pena mirarla?»
                                       · decisión con un modelo grande: veredicto, requisitos, cita
        4. GUARDAR     web/public/data/convocatorias.json  (lo que ve la web)
                       data/vistas.json                    (descartadas: no se vuelven a descargar)
Cloudflare Workers (se redespliega con cada actualización)
   └─ web/  App React (Vite) que lee el JSON
```

**Coste: 0 €.** No hay servidor ni base de datos. Se usan GitHub Actions, el plan gratuito de
Groq y Cloudflare.

Decisiones de diseño:

- **Revisar todo en lugar de buscar palabras.** Buscar en los títulos dejaba fuera convocatorias
  reales (ver la 904719). Por eso el radar descarga todas las de Estado y Madrid y filtra después
  con la ficha completa.
- **Desconfiar de los metadatos de la BDNS.** Los campos de beneficiarios suelen estar mal
  rellenados. Solo se descarta sin IA lo que es exclusivo para empresas, y la IA tiene
  instrucciones de guiarse por el texto oficial.
- **IA en dos pasos para no pasarse del cupo gratuito.** El modelo pequeño hace la criba y el
  grande solo analiza lo prometedor. Si un modelo agota su cupo diario, el radar sigue con el
  siguiente disponible. Si se agotan todos, lo que falte queda como *Pendiente de análisis* y se
  evalúa al día siguiente: nunca se muestra como recomendada una convocatoria que la IA no ha
  leído.
- **No repetir trabajo.** Lo ya evaluado y lo descartado se guarda, así que cada día solo se
  procesa lo nuevo.

## Estructura

```
radar/                 Backend en Python (se ejecuta en GitHub Actions)
  config.py            ← perfil de Reforesta, regiones, umbrales y modelos (lo que se ajusta)
  bdns.py              cliente de la API pública de la BDNS
  filtros.py           reglas sin IA
  puntuador.py         Groq (criba + decisión) y modo de respaldo por palabras clave
  __main__.py          el flujo completo
  validar.py           prueba con convocatorias reales de Reforesta (validacion.json)
  boe.py, empresas.py  empresas obligadas a compensar según el BOE (empresas.json)
worker/index.js        API (/api/*) con base de datos D1: marcas del equipo y canal de proyectos
web/                   Frontend en React + Vite (se despliega en Cloudflare)
  public/data/convocatorias.json   datos que genera el radar
data/vistas.json       caché de descartadas
.github/workflows/radar.yml        ejecución diaria
wrangler.jsonc         configuración de Cloudflare
```

### Formato de `convocatorias.json`

```jsonc
{
  "generado": "2026-11-13T21:35",
  "revisadas": 5117, "descartadas": 5018,
  "descartes_por_motivo": { "plazo cerrado": 1082, "...": 0 },
  "convocatorias": [{
    "codigo": "923290", "titulo": "...", "organo": "...", "url": "https://www.infosubvenciones.es/...",
    "fin": "2026-12-01", "plazo_estimado": null, "presupuesto": 17389322,
    "veredicto": "presenta | mira | descarta | pendiente", "puntuacion": 82,
    "linea": "restauracion | conservacion | educacion | agroambiental",
    "resumen": "Una frase sobre qué financia", "motivo": "Por qué esta puntuación",
    "requisitos": [{ "texto": "Entidad sin ánimo de lucro", "estado": "cumple | duda | no" }],
    "cita": "Texto literal del extracto oficial (comprobado)",
    "porcentaje_financiado": 90, "importe_max": 230000
  }]
}
```

## Desarrollo del frontend (web/)

```bash
echo "CLAVE_EQUIPO=prueba-local" > .dev.vars   # contraseña solo para local (no se sube)
npx wrangler dev                                # backend: API + datos en :8787
cd web && npm install && npm run dev            # frontend con recarga en caliente (:5173)
```

`npm run dev` redirige `/api` y `/data` al backend local. Reglas para no romper nada:
- La app vive en `web/` y se compila a `web/dist` (lo que publica Cloudflare).
- `web/public/data/*.json` lo escribe el radar cada mañana: no borrarlo ni editarlo a mano.
- `/api/*` y `/data/*` son rutas del backend: ninguna página del frontend puede usarlas.
- Los datos solo se piden con la contraseña (cabecera `X-Clave-Equipo`): usad `web/src/api.js`.

## Uso local

```bash
pip install -r requirements.txt
export GROQ_API_KEY=gsk_...    # opcional: sin clave funciona con palabras clave
python -m radar --limite 5     # evalúa solo 5 convocatorias nuevas (gasta poco cupo)
cd web && npm install && npm run dev    # http://localhost:5173
```

Opciones: `--dias N` (ventana, 365 por defecto) · `--limite N` · `--sin-ia` · `--recalcular`
(ignora las cachés y lo vuelve a procesar todo).

## Puesta en producción

1. **GitHub → Settings → Secrets and variables → Actions → New repository secret**:
   `GROQ_API_KEY` (como *Secret*, no como *Variable*).
2. **Cloudflare → Workers → Import a repository**, rama `main`.
   - Build command: `cd web && npm ci && npm run build`
   - Deploy command: `npx wrangler deploy`
3. **GitHub → Actions → Radar diario → Run workflow** para la primera ejecución (unos 20 minutos).
   Después se ejecuta solo cada mañana a las 05:17 UTC.

## Personalizar

Todo lo ajustable está en [`radar/config.py`](radar/config.py):

- `PERFIL_REFORESTA`: lo que la IA sabe de la ONG. Cuanto más preciso (estatutos, líneas de
  trabajo, zonas), mejor filtra.
- `REGIONES_BDNS` / `REGIONES_VALIDAS`: dónde puede pedir ayudas Reforesta.
- `DESCARTES_TITULO`, `PESOS_PALABRAS`, `UMBRAL_RELEVANCIA`: filtros sin IA.
- `MODELOS_CRIBA`, `MODELOS_DECISION`, `UMBRAL_CRIBA`: modelos de Groq y cortes.

Si cambias las instrucciones de la IA en `puntuador.py`, sube `VERSION_INSTRUCCIONES` para que
se reevalúe lo ya guardado.

## Limitaciones conocidas

- Por ahora solo usa la BDNS, que recoge las ayudas públicas españolas. No incluye todavía el
  programa LIFE de la UE, fundaciones privadas ni programas de RSC.
- El perfil de Reforesta está redactado a partir de la información pública del reto. Con sus
  estatutos y su histórico real la IA afinaría más.
- La primera ejecución consume buena parte del cupo diario gratuito de Groq. Las siguientes
  apenas gastan.

- **La IA lee el extracto oficial, no las bases completas.** La BDNS publica el extracto del
  boletín; las bases suelen ir en un PDF aparte. Veredicto y cita se apoyan en el extracto (la cita
  se comprueba contra él). Leer el PDF de las bases es el siguiente paso (necesario también para la
  lista de documentos).

## Siguientes pasos

1. **Validar con el histórico completo** de convocatorias que Reforesta pidió o ganó y medir
   cuántas habría encontrado el radar.
2. **Aviso semanal por email** con las nuevas *Presenta*.
3. **Más fuentes**: Fundación Biodiversidad, LIFE y el Funding & Tenders Portal de la UE,
   fundaciones privadas, y DIA autonómicas (BOCM y otros boletines) para la pestaña *Empresas*.
4. **Avisos**: email a Reforesta cuando una empresa pulsa "Quiero ayudar".
5. **Calendario de recurrentes**: "la de la Comunidad de Madrid suele salir en mayo", para
   preparar la solicitud antes de que se publique.
6. **Seguimiento de solicitudes** (pantalla *Mis solicitudes* del diseño).
