# 🌱 Radar Reforesta

> **1hack A Coruña · Reto Reforesta**: *¿qué construirías para que Reforesta no pierda ninguna
> convocatoria que merezca la pena y pueda restaurar más terreno?*

🔗 **Web:** [1hack-theagilemonkeys.radar-reforesta.workers.dev](https://1hack-theagilemonkeys.radar-reforesta.workers.dev) 

## El problema

Reforesta es una ONG con más de 30 años plantando y un equipo de 6 o 7 personas. Cada hectárea que
restaura la paga una convocatoria pública, una fundación o una empresa. Hoy presenta **4-5 solicitudes
al año**: encontrar convocatorias y leer decenas de páginas para saber si encajan le quita el tiempo
que necesita para las propuestas y el trabajo de campo. Y el canal de empresas está casi a cero.
Su objetivo: **10 solicitudes al año con el mismo equipo**.

## La solución en 3 pasos

| | Qué hace el radar | Dónde se ve |
|---|---|---|
| **1 · Encontrar** | Cada mañana lee todas las ayudas públicas de España y deja solo las que encajan. Además saca del BOE las **empresas obligadas a reforestar**, y publica los proyectos de Reforesta para que las empresas la encuentren | Convocatorias → Radar · Empresas · Página pública |
| **2 · Preparar** | Lee las bases, saca la lista de documentos, detecta los que ya tenéis y descarga un ZIP listo para subir | Convocatorias → En proceso |
| **3 · Seguir** | Cada solicitud presentada tiene su siguiente paso con fecha, hasta plantar y justificar. Avisa de lo que vence | Convocatorias → Presentado · Campana · Correo |

Reforesta no instala nada: abre una web y ve qué merece la pena esta semana. **Coste: 0 €** (planes
gratuitos de GitHub Actions, Groq y Cloudflare). **El radar no redacta la propuesta**: eso sigue siendo
de Reforesta.

## La web, pantalla a pantalla

### Convocatorias
Cuatro pestañas que siguen el camino de una solicitud:

- **Radar (por revisar).** Las convocatorias que encajan, una a una. Cada tarjeta dice el veredicto
  —**«Sí, merece la pena presentarla»** o **«Mirad antes de decidir»**—, *¿Cuánto dan?*, *¿Qué parte
  pagan?*, *¿Hasta cuándo?*, *¿Por qué encaja?* y la **frase literal del texto oficial**, comprobada
  por el radar (la IA no se la puede inventar). Dos botones: **Descartar** (con motivo) o **Presentar**.
- **En proceso.** Las que vais a presentar, ordenadas por plazo. Cada tarjeta lleva una franja de color
  con los días que quedan (coral, menos de una semana; ámbar, menos de un mes; verde, con margen),
  el organismo abreviado, el importe y una barra con los papeles que tenéis. «Presentar» sale con
  candado hasta que estén todos.
- **Preparar papeles** (al pulsar «Papeles»). El radar ha leído el PDF de las bases y saca cada
  documento que piden. Cada uno es una **casilla**: verde (listo), ámbar (revisar, por ejemplo un
  certificado caducado) o punteada (falta). Los que ya tenéis en la biblioteca **se detectan y se
  asignan solos**. Se sube un archivo, se elige de la biblioteca o se arrastra; pulsar el ✓ lo quita.
  Al lado, el plazo, el aviso de lo que falta y **Presentar**, que descarga un **ZIP** con los
  documentos bien nombrados (`01_Solicitud-de-subvencion.pdf`…) y la pasa a Presentado.
- **Presentado.** Un tablero tipo Trello con las fases **Presentada → Concedida → Plantar → Justificar**.
  Arrastrar una tarjeta cambia su estado y pone el siguiente paso con su fecha. «Finalizado» guarda las
  terminadas y denegadas.
- **Descartadas.** Un filtro a la vez: **vuestros motivos** (Cofinanciación demasiado alta, Plazo
  insuficiente, Fuera de nuestro ámbito territorial…) y **los del radar**, agrupados por *por qué* las
  descartó (Reforesta no puede pedirla, no es de medio ambiente, fuera de su zona…). Arrastrar una
  tarjeta a otro motivo la reclasifica; cualquiera se puede recuperar.

### Empresas
Empresas que el BOE obliga a reforestar (declaraciones de impacto ambiental de parques eólicos,
plantas solares, líneas eléctricas…).
- **Nuevas:** fichas con lo que deben plantar, dónde, la **afinidad** con Reforesta (0-100) y las medidas.
- **En contacto:** tablero *Pendiente de contactar → En contacto → Reunión*. Cada tarjeta se despliega
  al pulsarla: el **contacto encontrado con IA** («comprobadlo»: web, correo, teléfono, formulario),
  el **mensaje ya escrito** con los datos del proyecto, la fecha para volver a escribir y la de la reunión
  (con descarga al calendario).
- **Cerradas** y **Descartadas**.

### Propuestas y página pública
- El equipo publica lo que quiere restaurar («15 ha tras el incendio de Valdemorillo»). Cada propuesta
  sale con un **mini mapa de Madrid** y una chincheta en el pueblo.
- **Página pública** (`/#/propuestas`, sin contraseña): las empresas ven los proyectos, las hectáreas,
  **su impacto traducido a vuelos** (un globo con un avión: «8 ha compensan 11 vuelos Madrid–Sídney al
  año», estimación) y **reservan sin compromiso**.
- Las reservas llegan a una **agenda por letras** con el estado de cada empresa.

### Mapa
Todo lo plantado en la Comunidad de Madrid: hectáreas, árboles y sitios; qué es cada círculo
(convocatoria, empresa, voluntariado); un desplegable **«Hasta 2025»** para ver cómo ha crecido el
bosque; y un bocadillo con los datos de cada sitio.

### Perfil
- **La entidad:** nombre, descripción, líneas de trabajo, lo que no os sirve y el **objetivo del año**
  (un árbol en el monte por cada solicitud presentada).
- **Elegibilidad:** la ficha que piden las convocatorias (forma jurídica, antigüedad, utilidad
  pública…). Lo que no conste cuenta como «duda», no como «no».
- **Qué busca el radar:** zonas y comunidades, criterios con número (importe mínimo, cofinanciación
  máxima, días mínimos para preparar) y **lo que el radar ha aprendido** de vuestros descartes.
- **Documentos y avisos:** documentos de la entidad, avisos por correo y **Empezar de cero**.

**Campana:** los pasos que vencen, en un desplegable; se quitan uno a uno.

## Cómo sabemos que el radar funciona

No hay una lista de convocatorias de prueba, así que el radar se comprueba con datos reales:

1. **Las 2 convocatorias reales de Reforesta.** El reto da dos convocatorias a las que Reforesta se
   presentó y el radar **encuentra las dos** (`python -m radar.validar` → `validacion.json`):
   - **BDNS 923290 (MITECO):** la BDNS la etiqueta mal (solo «personas físicas»), pero el radar lee el
     texto oficial y ve que es para ONG → «Mirad antes de decidir».
   - **BDNS 904719 (Comunidad de Madrid, Orden 1689/2026):** su título no dice «medio ambiente»; una
     búsqueda por palabras no la encontraba. El radar la encuentra porque lo revisa todo → «Sí, merece
     la pena presentarla».
2. **El embudo de cada día**, con datos reales (ejecución del 14 de noviembre de 2026, Estado y
   Comunidad de Madrid, últimos 12 meses):

   | Paso | Convocatorias |
   |---|---:|
   | Publicadas en la BDNS | **5.100** |
   | ✂️ Nominativas, convenios, becas… (por título) | −2.026 |
   | ✂️ No son de concurrencia competitiva | −1.104 |
   | ✂️ Plazo cerrado | −1.081 |
   | ✂️ Sin relación ambiental | −683 |
   | ✂️ Solo para empresas | −108 |
   | **Las lee la IA** | **98** |

   Más del 98 % se descarta sin IA. Ese día ninguna convocatoria abierta encajaba, y cada descarte de la
   IA lleva su porqué (se ve en *Descartadas → El radar*).
3. **Convocatorias reales de los últimos meses** (`python -m radar.demo` → `demo.json`): por ejemplo la
   de **Fundación Biodiversidad** de educación ambiental (BDNS 928403, 200.000 €), que el radar habría
   recomendado el día que salió.

## Modo demo

Como hoy no hay convocatorias abiertas que encajen, la web arranca en **modo demo**: añade las
convocatorias reales cerradas (`validacion.json`, `demo.json`) como si estuvieran abiertas (marcadas
«Ejemplo real») y datos **simulados** (`worker/demo.js`) para que todas las pantallas tengan contenido:
solicitudes en todas las fases, empresas, propuestas con reservas, plantaciones y documentos.
No van a los correos.
- `PUT /api/demo {activo: false}` lo apaga y borra lo simulado (o la variable `MODO_DEMO = "0"`).
- **Empezar de cero** (Perfil, o `POST /api/reiniciar`): todas las convocatorias vuelven a «por
  revisar» y las empresas a «Nuevas», como el primer día. Se conservan el perfil, la biblioteca, las
  propuestas y el mapa.

## Cómo funciona por dentro

```
GitHub Actions (cada mañana, 05:17 UTC, gratis)
  ├─ python -m radar           BDNS → filtros sin IA → Groq (criba + decisión) → convocatorias.json
  │    └─ documentos.py        lee el PDF de las bases: documentos que piden
  ├─ python -m radar.validar   las 2 convocatorias reales de Reforesta → validacion.json
  ├─ python -m radar.demo      convocatorias reales recientes → demo.json
  └─ python -m radar.empresas  BOE → empresas obligadas a compensar → empresas.json
       └─ contactos.py         su contacto público, buscado con IA (Groq compound)
Cloudflare Worker + D1 (gratis)
  ├─ worker/index.js           API /api/* (solicitudes, documentos, propuestas, mapa, avisos…)
  ├─ cron 07:23 UTC            correo de avisos (Resend)
  └─ web/                      la web (React + Vite)
```

Decisiones de diseño:
- **Revisar todo en lugar de buscar palabras.** Buscar en los títulos dejaba fuera convocatorias reales
  (la 904719). El radar descarga todas las de Estado y Madrid y filtra después.
- **Desconfiar de los metadatos de la BDNS.** Solo se descarta sin IA lo que es claramente para empresas;
  la IA se guía por el texto oficial.
- **IA en dos pasos para no gastar el cupo gratuito.** Un modelo pequeño criba y uno grande decide
  (veredicto, requisitos y cita). Si se agota el cupo de un modelo pasa al siguiente; si se agotan todos,
  lo que falta queda «pendiente» para el día siguiente. Nunca se recomienda algo que la IA no ha leído.
- **La cita se comprueba.** Si la frase no aparece en el texto oficial, se descarta.
- **No repetir trabajo.** Lo evaluado y lo descartado se guarda: cada día solo se procesa lo nuevo.

### Empresas obligadas a compensar
`python -m radar.empresas` lee las declaraciones de impacto ambiental del BOE (API de datos abiertos).
A la IA solo le pasa el arranque de la resolución y los párrafos sobre medidas (≈ 9.000 de ~100.000
caracteres). Groq extrae promotor, proyecto, ubicación, medidas y hectáreas, y puntúa la **afinidad**:
70-100 medidas claras de reforestación o restauración; 40-69 parecidas o poco concretas; 0-39 nada que
Reforesta pueda hacer; suma si está en Madrid o cerca (Toledo, Guadalajara, Segovia, Ávila, Cuenca).

**Contacto con IA:** `radar/contactos.py` busca en internet (Groq `compound`, con búsqueda web) los
canales **corporativos y públicos** de cada empresa que interesa: web, correo, teléfono de centralita y
página de contacto, con las fuentes. Si es una sociedad vehículo, el de su grupo. Nunca datos personales.
Caché en `data/contactos.json`.

### Impacto en vuelos
`GET /api/impacto?ha=8` (público): CO₂ al año y en 30 años, coches, personas y vuelos de ida y vuelta
desde Madrid. `viaje` es el destino que dibuja el globo (entre 1 y 12 vuelos al año). Supuestos
orientativos, en `IMPACTO` del Worker: 5 t CO₂/ha/año, 30 años, 0,1 kg CO₂ por pasajero y km.

### API principal (Worker)
Todas las rutas de equipo llevan la cabecera `X-Clave-Equipo` (secreto `CLAVE_EQUIPO`) y,
opcionalmente, `X-Autor`. Lista completa al principio de `worker/index.js`.

| Ruta | Qué hace |
|---|---|
| `GET/PUT /api/solicitudes/:tipo/:id`, `/deshacer`, `/historial` | Estado de cada convocatoria o empresa, con historial y deshacer |
| `GET /api/seguimiento` | Lo que está en marcha, por urgencia, y los avisos |
| `GET/POST /api/documentos`, `GET /api/archivos/:id` | Biblioteca de documentos (archivos en D1, hasta 10 MB) |
| `GET/PUT /api/solicitudes/convocatoria/:codigo/documentos[/:req]` | Qué documento va en cada casilla |
| `GET /api/solicitudes/convocatoria/:codigo/zip` | ZIP para presentar |
| `GET/POST /api/proyectos`, `POST /api/proyectos/:id/interes` | Propuestas y reservas (públicas) |
| `GET/POST /api/plantaciones` | Mapa de plantaciones |
| `GET/PUT /api/perfil`, `GET/POST /api/reglas`, `GET/POST /api/motivos` | Perfil, reglas aprendidas y motivos de descarte |
| `GET/POST /api/avisos/correo` | Vista previa y envío del correo de avisos |
| `GET/PUT /api/demo`, `POST /api/reiniciar` | Modo demo y empezar de cero |

Estados de convocatoria: `por_revisar`, `mas_tarde`, `preparando`, `presentada`, `subsanar`,
`concedida`, `denegada`, `plantar`, `justificar`, `terminada`, `descartada`. De empresa: `nueva`,
`contactada`, `reunion`, `acuerdo`, `cerrada`, `descartada`. Internamente el radar usa los veredictos
`presenta` («Sí, merece la pena presentarla»), `mira` («Mirad antes de decidir»), `descarta` y
`pendiente`.

## Estructura

```
radar/                  Python (GitHub Actions)
  __main__.py           el flujo completo           config.py      perfil, regiones y modelos
  bdns.py · filtros.py  BDNS y reglas sin IA         puntuador.py   Groq (criba + decisión)
  documentos.py         documentos del PDF de bases  criterios.py   criterios con número del perfil
  validar.py · demo.py  pruebas con convocatorias reales
  boe.py · empresas.py · contactos.py               empresas del BOE y su contacto
worker/index.js         API + D1 · worker/demo.js   datos simulados del modo demo
web/src/isla/           la web: Convocatorias, Presentar, Empresas, Propuestas, Publica, Mapa, Perfil…
web/public/data/*.json  lo que genera el radar (no editar a mano)
.github/workflows/radar.yml   ejecución diaria
```

## Puesta en marcha

1. **GitHub → Settings → Secrets and variables → Actions:** secreto `GROQ_API_KEY` y `CLAVE_EQUIPO`,
   variable `RADAR_API_URL` (la dirección de la web, para que el radar lea el perfil).
2. **Cloudflare → Workers → Import a repository** (rama `main`). Build: `cd web && npm ci && npm run build`.
   Deploy: `npx wrangler deploy`. Base D1 `radar-reforesta` (las tablas se crean solas).
   Secretos: `CLAVE_EQUIPO`; opcional `RESEND_API_KEY`, `EMAIL_REMITENTE` y `URL_PUBLICA` para los correos.
3. **GitHub → Actions → Radar diario → Run workflow** la primera vez. Después corre solo cada mañana.

En local:
```bash
echo "CLAVE_EQUIPO=prueba-local" > .dev.vars
npx wrangler dev                          # API + datos en :8787
cd web && npm install && npm run dev      # web en :5173
python -m radar --limite 5                # radar (con GROQ_API_KEY; sin ella usa palabras clave)
```

## Limitaciones

- Fuentes: BDNS (ayudas públicas españolas) y BOE. Aún no LIFE, fundaciones privadas ni boletines
  autonómicos de impacto ambiental.
- El veredicto se apoya en el extracto oficial de la BDNS; el PDF de las bases se lee para los documentos
  (como mucho 8 por ejecución, por el cupo gratuito).
- El perfil de Reforesta sale de la información pública del reto: con sus estatutos y su histórico
  real, la IA afinaría más.
- Las cifras de CO₂ y vuelos son estimaciones orientativas.

## Siguientes pasos

1. Validar con el **histórico completo** de convocatorias que Reforesta pidió o ganó.
2. **Más fuentes:** Fundación Biodiversidad, LIFE y Funding & Tenders de la UE, fundaciones privadas y DIA
   autonómicas para Empresas.
3. **Calendario de recurrentes:** «la de la Comunidad de Madrid suele salir en mayo».
4. Aviso por correo cuando una empresa reserva una propuesta.
