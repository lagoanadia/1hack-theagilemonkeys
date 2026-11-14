// Backend de la webapp: un Worker de Cloudflare con base de datos D1 (SQLite).
// Solo atiende /api/*; todo lo demás (la web React) lo sirve Cloudflare como archivos estáticos.
//
// Rutas:
//   GET    /api/config                      Client ID de Google para el botón de login (público)
//   GET    /api/equipo                      ¿quién soy? (email del equipo)            (equipo)
//   GET    /api/estado                      (compatibilidad) marcas interesa/descarta (equipo)
//   PUT    /api/estado                      (compatibilidad) {tipo, id, estado}      (equipo)
//   GET    /api/solicitudes?tipo=           estado de cada convocatoria/empresa      (equipo)
//   PUT    /api/solicitudes/:tipo/:id       {estado, motivos[], nota, responsable,
//                                            siguiente_paso, fecha_paso}             (equipo)
//   POST   /api/solicitudes/:tipo/:id/deshacer   vuelve al estado anterior           (equipo)
//   GET    /api/solicitudes/:tipo/:id/historial  cambios, con quién y cuándo         (equipo)
//   GET    /api/motivos                     catálogo de motivos de descarte + usos   (equipo)
//   POST   /api/motivos                     {texto} añadir un motivo propio          (equipo)
//   DELETE /api/motivos/:id                 quitar un motivo propio                  (equipo)
//   GET    /api/documentos                  biblioteca de documentos de la entidad   (equipo)
//   POST   /api/documentos                  multipart (archivo + campos) o JSON sin archivo (equipo)
//   PUT    /api/documentos/:id              {nombre, tipo, emitido, caduca}           (equipo)
//   DELETE /api/documentos/:id              borrar (y su archivo)                     (equipo)
//   GET    /api/archivos/:id                descargar el archivo                      (equipo)
//   GET    /api/solicitudes/convocatoria/:codigo/documentos        qué documento va en cada hueco (equipo)
//   PUT    /api/solicitudes/convocatoria/:codigo/documentos/:req   {documento_id, estado, responsable} (equipo)
//   GET    /api/impacto?ha=8                CO2 que absorben esas hectáreas, en vuelos, coches y personas (público)
//   GET    /api/solicitudes/convocatoria/:codigo/zip   ZIP con los documentos asignados, listos para subir (equipo)
//   GET    /api/plantaciones                dónde ha plantado Reforesta + totales      (público; notas solo equipo)
//   POST   /api/plantaciones                {nombre, ll:[lon,lat], ha, tipo, anio, ...} (equipo)
//   PUT    /api/plantaciones/:id · DELETE   editar / quitar                           (equipo)
//   GET    /api/avisos/correo               vista previa del correo de avisos         (equipo)
//   POST   /api/avisos/correo               enviarlo ahora (prueba)                    (equipo)
//   GET    /api/demo · PUT {activo}         modo demo: convocatorias reales cerradas como si estuvieran abiertas (equipo)
//   GET    /api/seguimiento                 lo que está en marcha, con su siguiente paso y avisos (equipo)
//   GET    /api/reglas                      reglas del equipo + sugerencias detectadas (equipo)
//   POST   /api/reglas                      {motivo, accion: aceptar|ignorar} o {texto} (equipo)
//   PUT    /api/reglas/:id                  {texto}                                   (equipo)
//   DELETE /api/reglas/:id                  quitar (y deshacer su criterio)           (equipo)
//   GET    /api/tablero                     secciones, orden y colores de los tableros (equipo)
//   PUT    /api/tablero                     {datos} guarda todo el tablero (JSON, máx. 60 KB)   (equipo)
//   GET    /api/perfil                      lo que el radar sabe de Reforesta        (equipo)
//   PUT    /api/perfil                      {nombre, zonas, ampliar_espana, ...}     (equipo)
//   GET    /api/proyectos                   propuestas publicadas, con plazas libres  (público)
//   GET    /api/proyectos?todas=1           también borradores y ocultas              (equipo)
//   POST   /api/proyectos                   {titulo, lugar, tipo, incluye, plazas,
//                                            hectareas, presupuesto, estado}         (equipo)
//   PUT    /api/proyectos/:id               editar, publicar u ocultar                (equipo)
//   DELETE /api/proyectos/:id               retirar (archivar) una propuesta          (equipo)
//   POST   /api/proyectos/:id/interes       {empresa, contacto, mensaje, hectareas?} → impacto (público)
//   GET    /api/interesados                 empresas que quieren ayudar              (equipo)
//   PUT    /api/interesados/:id             {estado: nueva|contestada|confirmada|descartada} (equipo)
//   DELETE /api/interesados/:id             borrar una reserva (pruebas, spam)       (equipo)
//
// Quién hace cada cambio: cabecera X-Autor (nombre que se escribe al entrar), opcional.
// "equipo" = cabecera X-Clave-Equipo igual al secreto CLAVE_EQUIPO (es lo que usa la web).
// Preparado también, pero sin usar en la web: login con Google (Authorization: Bearer <id_token>)
// para los emails o dominios del secreto EMAILS_EQUIPO, con el secreto GOOGLE_CLIENT_ID.

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS estados (
     tipo TEXT NOT NULL, id TEXT NOT NULL, estado TEXT NOT NULL, nota TEXT DEFAULT '',
     actualizado TEXT NOT NULL, PRIMARY KEY (tipo, id))`,
  `CREATE TABLE IF NOT EXISTS proyectos (
     id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, lugar TEXT DEFAULT '',
     hectareas REAL, presupuesto REAL, descripcion TEXT DEFAULT '', creado TEXT NOT NULL,
     activo INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS interesados (
     id INTEGER PRIMARY KEY AUTOINCREMENT, proyecto_id INTEGER NOT NULL, empresa TEXT NOT NULL,
     contacto TEXT NOT NULL, mensaje TEXT DEFAULT '', creado TEXT NOT NULL)`,
  // Ciclo de vida de cada convocatoria o empresa (sustituye a "estados").
  `CREATE TABLE IF NOT EXISTS solicitudes (
     tipo TEXT NOT NULL, id TEXT NOT NULL, estado TEXT NOT NULL, motivos TEXT NOT NULL DEFAULT '[]',
     nota TEXT DEFAULT '', responsable TEXT DEFAULT '', siguiente_paso TEXT DEFAULT '',
     fecha_paso TEXT DEFAULT '', actualizado TEXT NOT NULL, actualizado_por TEXT DEFAULT '',
     PRIMARY KEY (tipo, id))`,
  `CREATE TABLE IF NOT EXISTS historial (
     n INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, ref TEXT NOT NULL,
     antes TEXT, despues TEXT NOT NULL, autor TEXT DEFAULT '', creado TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS motivos (
     id INTEGER PRIMARY KEY AUTOINCREMENT, texto TEXT NOT NULL UNIQUE, autor TEXT DEFAULT '',
     creado TEXT NOT NULL)`,
  // Migración: las marcas antiguas pasan a solicitudes una sola vez.
  `INSERT OR IGNORE INTO solicitudes (tipo, id, estado, nota, actualizado)
     SELECT tipo, id, CASE estado WHEN 'interesa' THEN 'preparando' ELSE 'descartada' END, nota, actualizado
     FROM estados`,
  `DELETE FROM estados`,
  // Ajustes de la entidad (perfil): un valor JSON por clave.
  `CREATE TABLE IF NOT EXISTS ajustes (
     clave TEXT PRIMARY KEY, valor TEXT NOT NULL, actualizado TEXT NOT NULL, actualizado_por TEXT DEFAULT '')`,
  // Archivos guardados en la propia D1 cuando no hay R2 (archivo_key "d1:..."), en trozos de 500 KB.
  `CREATE TABLE IF NOT EXISTS archivo_trozos (
     clave TEXT NOT NULL, n INTEGER NOT NULL, datos BLOB NOT NULL, PRIMARY KEY (clave, n))`,
  // Biblioteca de documentos de la entidad (archivos en R2 si existe el binding ARCHIVOS; si no, en D1).
  `CREATE TABLE IF NOT EXISTS documentos (
     id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL DEFAULT 'otro', nombre TEXT NOT NULL,
     archivo_key TEXT, archivo_nombre TEXT, mime TEXT, tamano INTEGER, emitido TEXT, caduca TEXT,
     subido_por TEXT DEFAULT '', creado TEXT NOT NULL)`,
  // Qué documento va en cada hueco de una solicitud (el arrastrar y soltar).
  `CREATE TABLE IF NOT EXISTS solicitud_documentos (
     codigo TEXT NOT NULL, requisito TEXT NOT NULL, documento_id INTEGER, estado TEXT NOT NULL DEFAULT 'falta',
     responsable TEXT DEFAULT '', actualizado TEXT NOT NULL, actualizado_por TEXT DEFAULT '',
     PRIMARY KEY (codigo, requisito))`,
  // Reglas aprendidas: las del equipo, las aceptadas de una sugerencia y las sugerencias ignoradas.
  `CREATE TABLE IF NOT EXISTS reglas (
     id INTEGER PRIMARY KEY AUTOINCREMENT, texto TEXT NOT NULL, origen TEXT NOT NULL, motivo TEXT DEFAULT '',
     criterio TEXT, autor TEXT DEFAULT '', creado TEXT NOT NULL)`,
  // Mapa de plantaciones. tipo: c convocatoria · e empresa · v voluntariado.
  // origen_tipo/origen_id enlazan con la solicitud de la que salió (opcional).
  `CREATE TABLE IF NOT EXISTS plantaciones (
     id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, lon REAL NOT NULL, lat REAL NOT NULL,
     ha REAL NOT NULL DEFAULT 0, arboles INTEGER, especies TEXT DEFAULT '', tipo TEXT NOT NULL DEFAULT 'c',
     anio INTEGER NOT NULL, con TEXT DEFAULT '', origen_tipo TEXT DEFAULT '', origen_id TEXT DEFAULT '',
     notas TEXT DEFAULT '', activo INTEGER NOT NULL DEFAULT 1, autor TEXT DEFAULT '', creado TEXT NOT NULL)`,
  // Anti-spam del formulario público: huella (hash) de la IP, nunca la IP en claro.
  `CREATE TABLE IF NOT EXISTS envios (huella TEXT NOT NULL, creado TEXT NOT NULL)`,
];
const MAX_ENVIOS_POR_HORA = 5;

async function huellaIP(request) {
  const ip = request.headers.get("cf-connecting-ip") || "desconocida";
  const datos = new TextEncoder().encode(`radar-reforesta:${ip}`);
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const TIPOS = ["convocatoria", "empresa"];
// Estados posibles. "descartada" puede llevar motivos; cualquier paso se puede deshacer.
const ESTADOS = {
  convocatoria: ["por_revisar", "mas_tarde", "preparando", "presentada", "subsanar", "concedida",
    "denegada", "plantar", "justificar", "terminada", "descartada"],
  empresa: ["nueva", "contactada", "reunion", "acuerdo", "cerrada", "descartada"],
};
// Motivos de descarte que siempre aparecen (el equipo puede añadir los suyos).
const MOTIVOS_BASE = ["No es reforestación", "Piden poner mucho dinero", "Plazo muy corto",
  "Fuera de nuestra zona", "Importe pequeño", "Sin capacidad ahora", "Exigen aval bancario"];
// Perfil por defecto: el mismo que usa el radar en radar/config.py mientras nadie lo edite.
const PERFIL_BASE = {
  nombre: "Asociación Reforesta",
  cif: "",
  tipo_entidad: "asociación sin ánimo de lucro",
  equipo: 7,
  experiencia: "más de 30 años",
  zonas: ["Sierra de Guadarrama"],
  comunidades_extra: [],
  ampliar_espana: false,
  descripcion: "Trabaja con ayuntamientos, parques regionales y propietarios privados mediante acuerdos de custodia del territorio. Se financia por hectárea plantada o restaurada.",
  lineas: [
    "Restauración de ecosistemas: reforestación, plantación de especies autóctonas, charcas para anfibios, restauración tras incendios",
    "Conservación de hábitats: anfibios, control de especies invasoras (ailanto), paisajes de Guadarrama, hábitats para aves",
    "Educación ambiental y voluntariado",
    "Programa agroambiental con agricultores",
  ],
  no_sirve: [
    "Subvenciones nominativas o directas a otra entidad, convenios ya firmados",
    "Ayudas solo para personas físicas o empresas con ánimo de lucro",
    "Cooperación internacional en otros países",
    "Investigación pura universitaria, patrimonio histórico, turismo u hostelería",
  ],
  objetivo_anual: 10,
  // Criterios de búsqueda con número (null = sin límite). El radar los aplica sin IA.
  criterios: { importe_minimo: null, cofinanciacion_maxima: null, dias_minimos: null },
  // Ficha de elegibilidad: lo que piden las convocatorias para poder presentarse. La IA compara
  // cada requisito con esta ficha; lo que no se rellena (null) cuenta como "no consta" → "duda".
  ficha: {
    forma_juridica: "asociacion", anio_constitucion: null, utilidad_publica: null, sede: "Comunidad de Madrid",
    ambito_actuacion: "autonomico", registros: [], al_corriente_pagos: null, presupuesto_anual: null,
    voluntarios: null, aval_bancario: null, ongd: null, certificaciones: [],
  },
  // Otros datos de la entidad en texto libre (también los lee la IA).
  requisitos_entidad: [],
  documentos: [
    { nombre: "Estatutos", tengo: true, caduca: "" },
    { nombre: "CIF", tengo: true, caduca: "" },
    { nombre: "Certificado de Hacienda", tengo: false, caduca: "" },
    { nombre: "Certificado de la Seguridad Social", tengo: false, caduca: "" },
    { nombre: "Memoria de actividades", tengo: false, caduca: "" },
  ],
  avisos: "cada_manana",
  email_avisos: "",
};
// Comunidades que se pueden añadir a la zona de búsqueda (códigos NUTS de la BDNS).
const COMUNIDADES = [
  ["ES11", "Galicia"], ["ES12", "Asturias"], ["ES13", "Cantabria"], ["ES21", "País Vasco"],
  ["ES22", "Navarra"], ["ES23", "La Rioja"], ["ES24", "Aragón"], ["ES41", "Castilla y León"],
  ["ES42", "Castilla-La Mancha"], ["ES43", "Extremadura"], ["ES51", "Cataluña"],
  ["ES52", "Comunidad Valenciana"], ["ES53", "Illes Balears"], ["ES61", "Andalucía"],
  ["ES62", "Región de Murcia"], ["ES70", "Canarias"],
].map(([codigo, nombre]) => ({ codigo, nombre }));
const AVISOS = ["nunca", "cada_manana", "semanal"];
const TIPOS_DOCUMENTO = ["estatutos", "registro_entidad", "cif", "representante_legal", "cert_hacienda",
  "cert_seg_social", "declaracion_responsable", "memoria_actividades", "memoria_proyecto", "presupuesto",
  "cuentas_anuales", "titularidad_bancaria", "permiso_propietario", "solicitud", "anexo", "otro"];
const ESTADOS_HUECO = ["falta", "sugerido", "confirmado", "no_aplica"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet",
  "application/msword", "application/vnd.ms-excel"];
const MAX_ARCHIVO = 10 * 1024 * 1024;
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);

// Cómo se convierte un motivo de descarte repetido en una regla. Si tiene "campo", la regla es un
// criterio con número del perfil (lo aplica el radar sin IA); si no, es texto para la IA.
const MIN_VECES_REGLA = 3;
const MOTIVO_REGLA = {
  "Piden poner mucho dinero": { campo: "cofinanciacion_maxima", accion: "Marcarlas «Mirad antes»",
    texto: (v) => `Descartáis las que piden poner más del ${v} %` },
  "Importe pequeño": { campo: "importe_minimo", accion: "Ocultarlas",
    texto: (v) => `Las de menos de ${v.toLocaleString("es-ES")} € no os compensan` },
  "Plazo muy corto": { campo: "dias_minimos", accion: "Avisadme antes",
    texto: (v) => `Con menos de ${v} días para prepararlas soléis dejarlas` },
  "No es reforestación": { accion: "Ocultarlas", texto: () => "Las que no son de plantar o restaurar no os interesan" },
  "Fuera de nuestra zona": { accion: "Ocultarlas", texto: () => "Las de fuera de vuestras zonas no os interesan" },
  "Exigen aval bancario": { accion: "Ocultarlas", texto: () => "No os interesan las que exigen aval bancario" },
};

const TIPOS_PROPUESTA = ["plantacion", "restauracion", "voluntariado", "otro"];
const ESTADOS_PROPUESTA = ["borrador", "publicada", "oculta"];
const ESTADOS_RESERVA = ["nueva", "contestada", "confirmada", "descartada"];

// Propuesta con sus plazas: una reserva ocupa plaza salvo que esté descartada.
const SQL_PROPUESTAS = `SELECT p.id, p.titulo, p.lugar, p.tipo, p.incluye, p.descripcion, p.hectareas,
    p.presupuesto, p.plazas, p.estado, p.creado, p.actualizado,
    (SELECT COUNT(*) FROM interesados i WHERE i.proyecto_id = p.id AND i.estado != 'descartada') AS reservas,
    (SELECT COALESCE(SUM(i.hectareas), 0) FROM interesados i WHERE i.proyecto_id = p.id AND i.estado != 'descartada')
      AS hectareas_apoyadas
  FROM proyectos p WHERE p.activo = 1`;
function conPlazas(p) {
  const libres = p.plazas == null ? null : Math.max(0, p.plazas - p.reservas);
  return { ...p, plazas_libres: libres, completa: libres === 0, impacto: p.hectareas > 0 ? impacto(p.hectareas) : null };
}

// ---------- Impacto: el CO2 de una plantación traducido a vuelos, coches y personas ----------
// Estimaciones redondas para enseñar a las empresas. Si Reforesta tiene datos propios
// (p. ej. la calculadora de absorciones del MITECO por especie), se cambian aquí.
const IMPACTO = {
  co2_ha_anio: 5,     // t de CO2 que absorbe al año 1 ha de bosque mediterráneo joven
  anios: 30,          // años que contamos de vida del bosque
  kg_co2_km: 0.1,     // kg de CO2 por pasajero y km volado (media aproximada)
  coche_anio: 1.6,    // t de CO2 de un coche en un año (~12.000 km)
  persona_anio: 5,    // t de CO2 de la huella media de una persona en España en un año
  origen: { nombre: "Madrid", ll: [-3.70, 40.42] },
};
// Destinos para el globo: [nombre, longitud, latitud].
const DESTINOS = [
  ["A Coruña", -8.41, 43.36], ["Tenerife", -16.25, 28.46], ["París", 2.35, 48.86], ["Londres", -0.13, 51.51],
  ["Roma", 12.50, 41.90], ["Reikiavik", -21.94, 64.15], ["El Cairo", 31.24, 30.04], ["Nueva York", -74.01, 40.71],
  ["Dubái", 55.27, 25.20], ["Ciudad de México", -99.13, 19.43], ["São Paulo", -46.63, -23.55],
  ["Nueva Delhi", 77.21, 28.61], ["Los Ángeles", -118.24, 34.05], ["Buenos Aires", -58.38, -34.60],
  ["Ciudad del Cabo", 18.42, -33.92], ["Pekín", 116.40, 39.90], ["Bangkok", 100.50, 13.76],
  ["Tokio", 139.69, 35.69], ["Sídney", 151.21, -33.87],
];
const MAX_VUELOS_VIAJE = 12;  // el globo dibuja un avión por vuelo: pocos y lejanos se entienden mejor
// Distancia en km entre dos puntos [lon, lat] siguiendo la curva de la Tierra (fórmula del haversine).
function kmEntre([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
function impacto(ha) {
  const anual = ha * IMPACTO.co2_ha_anio, total = anual * IMPACTO.anios;
  const r1 = (n) => Math.round(n * 10) / 10;
  const vuelos = DESTINOS.map(([destino, lon, lat]) => {
    const km = Math.round(kmEntre(IMPACTO.origen.ll, [lon, lat]));
    const co2 = (km * 2 * IMPACTO.kg_co2_km) / 1000;  // ida y vuelta, 1 pasajero, en t
    return { destino, ll: [lon, lat], km, co2_vuelo: Math.round(co2 * 100) / 100,
      vuelos_anio: Math.floor(anual / co2), vuelos_total: Math.floor(total / co2) };
  });
  return {
    hectareas: ha, anios: IMPACTO.anios, co2_anual: r1(anual), co2_total: Math.round(total),
    coches_anio: Math.round(anual / IMPACTO.coche_anio),
    personas_anio: r1(anual / IMPACTO.persona_anio),
    anios_persona: Math.round(total / IMPACTO.persona_anio),
    origen: IMPACTO.origen,
    vuelos,
    viaje: elegirViaje(vuelos, ha),
  };
}
// El viaje que enseña el globo: un destino donde quepan entre 1 y 12 vuelos al año. Cuanto más CO2, más
// lejos (menos vuelos y más largos). Entre los posibles se elige uno «al azar», pero siempre el mismo
// para las mismas hectáreas, para que la misma propuesta no cambie de destino al recargar.
function elegirViaje(vuelos, ha) {
  const caben = vuelos.filter((v) => v.vuelos_anio >= 1 && v.vuelos_anio <= MAX_VUELOS_VIAJE);
  if (caben.length) return caben[Math.round(ha * 10) % caben.length];
  const porKm = [...vuelos].sort((a, b) => a.km - b.km);
  // Más de 12 vuelos incluso al más lejano: el más lejano. Menos de 1 incluso al más cercano: el más cercano.
  return porKm.at(-1).vuelos_anio > MAX_VUELOS_VIAJE ? porKm.at(-1) : porKm[0];
}
function camposPropuesta(b) {
  const c = {};
  if (b.titulo !== undefined) c.titulo = texto(b.titulo, 150);
  if (b.lugar !== undefined) c.lugar = texto(b.lugar, 150);
  if (b.incluye !== undefined) c.incluye = texto(b.incluye, 300);
  if (b.descripcion !== undefined) c.descripcion = texto(b.descripcion, 2000);
  if (b.hectareas !== undefined) c.hectareas = numero(b.hectareas);
  if (b.presupuesto !== undefined) c.presupuesto = numero(b.presupuesto);
  if (b.plazas !== undefined) c.plazas = b.plazas === null || b.plazas === "" ? null : entero(b.plazas, 1, 1000) ?? null;
  if (b.tipo !== undefined && TIPOS_PROPUESTA.includes(b.tipo)) c.tipo = b.tipo;
  if (b.estado !== undefined && ESTADOS_PROPUESTA.includes(b.estado)) c.estado = b.estado;
  return c;
}

function lista(valor, maxElems, maxLargo) {
  return Array.isArray(valor) ? valor.map((v) => texto(v, maxLargo)).filter(Boolean).slice(0, maxElems) : undefined;
}
function entero(valor, min, max) {
  const n = Math.round(Number(valor));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
}

// Valida lo que llega del formulario: solo campos conocidos, con límites.
function limpiarPerfil(b) {
  const p = {};
  for (const [campo, max] of [["nombre", 120], ["cif", 20], ["tipo_entidad", 120], ["experiencia", 60],
    ["descripcion", 1500], ["email_avisos", 120]]) {
    if (b[campo] !== undefined) p[campo] = texto(b[campo], max);
  }
  if (b.equipo !== undefined) p.equipo = entero(b.equipo, 1, 500);
  if (b.objetivo_anual !== undefined) p.objetivo_anual = entero(b.objetivo_anual, 1, 200);
  if (b.ampliar_espana !== undefined) p.ampliar_espana = Boolean(b.ampliar_espana);
  if (b.avisos !== undefined && AVISOS.includes(b.avisos)) p.avisos = b.avisos;
  for (const [campo, n, max] of [["zonas", 12, 60], ["lineas", 8, 300], ["no_sirve", 10, 300],
    ["requisitos_entidad", 12, 200]]) {
    const v = lista(b[campo], n, max);
    if (v) p[campo] = v;
  }
  if (b.ficha && typeof b.ficha === "object") {
    // Solo cambian los campos que se envían; el resto se conserva (ver PUT /api/perfil).
    const f = b.ficha, si = (v) => (v === null || v === "" ? null : Boolean(v));
    const formas = ["asociacion", "fundacion", "cooperativa", "federacion", "otra"];
    const ambitos = ["local", "autonomico", "estatal", "internacional"];
    const reglas = {
      forma_juridica: (v) => (formas.includes(v) ? v : "otra"),
      anio_constitucion: (v) => (v ? entero(v, 1800, 2100) ?? null : null),
      utilidad_publica: si,
      sede: (v) => texto(v, 120),
      ambito_actuacion: (v) => (ambitos.includes(v) ? v : null),
      registros: (v) => lista(v, 10, 150) || [],
      al_corriente_pagos: si,
      // 0 es un valor válido (p. ej. 0 voluntarios); solo null o "" significan «no consta».
      presupuesto_anual: (v) => (v === null || v === "" ? null : numero(v) ?? null),
      voluntarios: (v) => (v === null || v === "" ? null : entero(v, 0, 100000) ?? null),
      aval_bancario: si,
      ongd: si,
      certificaciones: (v) => lista(v, 10, 120) || [],
    };
    p.ficha = Object.fromEntries(Object.entries(reglas).filter(([k]) => f[k] !== undefined).map(([k, fn]) => [k, fn(f[k])]));
  }
  if (b.criterios && typeof b.criterios === "object") {
    const c = b.criterios, n = (v, min, max) => (v === null || v === "" ? null : entero(v, min, max) ?? null);
    const lim = { importe_minimo: [0, 100000000], cofinanciacion_maxima: [0, 100], dias_minimos: [0, 365] };
    p.criterios = Object.fromEntries(Object.entries(lim).filter(([k]) => c[k] !== undefined).map(([k, [a, z]]) => [k, n(c[k], a, z)]));
  }
  if (Array.isArray(b.comunidades_extra)) {
    const validas = COMUNIDADES.map((c) => c.codigo);
    p.comunidades_extra = b.comunidades_extra.filter((c) => validas.includes(c));
  }
  if (Array.isArray(b.documentos)) {
    p.documentos = b.documentos.slice(0, 20).map((d) => ({
      nombre: texto(d?.nombre, 80), tengo: Boolean(d?.tengo),
      caduca: /^\d{4}-\d{2}-\d{2}$/.test(d?.caduca || "") ? d.caduca : "",
    })).filter((d) => d.nombre);
  }
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
}

async function leerPerfil(db) {
  const fila = await db.prepare("SELECT valor, actualizado, actualizado_por FROM ajustes WHERE clave = 'perfil'").first();
  return { fila, guardado: fila ? JSON.parse(fila.valor) : {} };
}
async function guardarPerfil(db, cambios, autor) {
  const { guardado } = await leerPerfil(db);
  const nuevo = { ...guardado, ...cambios };
  // Ficha y criterios se mezclan campo a campo: enviar uno no borra los demás.
  for (const k of ["ficha", "criterios"]) {
    if (cambios[k]) nuevo[k] = { ...PERFIL_BASE[k], ...(guardado[k] || {}), ...cambios[k] };
  }
  await db.prepare(
    `INSERT INTO ajustes (clave, valor, actualizado, actualizado_por) VALUES ('perfil', ?, ?, ?)
     ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado,
     actualizado_por = excluded.actualizado_por`,
  ).bind(JSON.stringify(nuevo), ahora(), autor).run();
  return nuevo;
}

// Valor propuesto para una regla con número, a partir de lo que el equipo ha descartado.
function valorRegla(campo, descartadas, convocatorias) {
  if (campo === "cofinanciacion_maxima") {
    // El modal de descarte guarda "Pueden poner como máximo el X %" en la nota: el valor más repetido.
    const pcts = descartadas.map((d) => Number((d.nota || "").match(/máximo el (\d+) %/)?.[1])).filter((n) => n > 0);
    if (!pcts.length) return 20;
    const veces = {};
    for (const n of pcts) veces[n] = (veces[n] || 0) + 1;
    return Number(Object.entries(veces).sort((a, b) => b[1] - a[1])[0][0]);
  }
  if (campo === "importe_minimo") {
    const importes = descartadas.map((d) => convocatorias[d.id]?.importe_max).filter((n) => n > 0);
    return importes.length ? Math.ceil((Math.max(...importes) + 1) / 5000) * 5000 : 10000;
  }
  if (campo === "dias_minimos") return 15;
  return null;
}

// ---------- Almacén de archivos: R2 si está configurado; si no, la propia D1 (gratis, sin tarjeta) ----------
const TROZO = 500 * 1024;
async function guardarArchivo(env, db, archivo) {
  if (env.ARCHIVOS) {
    const key = `docs/${crypto.randomUUID()}`;
    await env.ARCHIVOS.put(key, archivo.stream(), { httpMetadata: { contentType: archivo.type } });
    return key;
  }
  const key = `d1:${crypto.randomUUID()}`;
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const trozos = [];
  for (let i = 0, n = 0; i < bytes.length || n === 0; i += TROZO, n++) {
    trozos.push(db.prepare("INSERT INTO archivo_trozos (clave, n, datos) VALUES (?, ?, ?)").bind(key, n, bytes.slice(i, i + TROZO)));
  }
  await db.batch(trozos);
  return key;
}
async function leerArchivo(env, db, key) {
  if (!key.startsWith("d1:")) return env.ARCHIVOS ? (await env.ARCHIVOS.get(key))?.body || null : null;
  const { results } = await db.prepare("SELECT datos FROM archivo_trozos WHERE clave = ? ORDER BY n").bind(key).all();
  if (!results.length) return null;
  const partes = results.map((r) => new Uint8Array(r.datos));
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
async function borrarArchivo(env, db, key) {
  if (key.startsWith("d1:")) await db.prepare("DELETE FROM archivo_trozos WHERE clave = ?").bind(key).run();
  else if (env.ARCHIVOS) await env.ARCHIVOS.delete(key);
}

// ---------- ZIP para presentar: los documentos de la solicitud, con nombres claros y listos para subir ----------
// ZIP sin comprimir (método "store"): los PDF ya van comprimidos y así no hace falta ninguna librería.
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// archivos: [{ nombre, datos: Uint8Array }] → Uint8Array con el .zip
function crearZip(archivos) {
  const enc = new TextEncoder(), partes = [], central = [];
  const d = new Date();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre), crc = crc32(a.datos), n = a.datos.length;
    const cab = new DataView(new ArrayBuffer(30));
    // Cabecera local: firma, versión, flags (bit 11 = nombres en UTF-8), método 0, fecha, CRC, tamaños.
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, hora, 2], [12, dia, 2], [14, crc, 4],
      [18, n, 4], [22, n, 4], [26, nombre.length, 2], [28, 0, 2]]
      .forEach(([o, v, t]) => (t === 4 ? cab.setUint32(o, v, true) : cab.setUint16(o, v, true)));
    partes.push(new Uint8Array(cab.buffer), nombre, a.datos);
    const cen = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, hora, 2], [14, dia, 2],
      [16, crc, 4], [20, n, 4], [24, n, 4], [28, nombre.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2],
      [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([o, v, t]) => (t === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true)));
    central.push(new Uint8Array(cen.buffer), nombre);
    offset += 30 + nombre.length + n;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, archivos.length, 2], [10, archivos.length, 2],
    [12, tamCentral, 4], [16, offset, 4], [20, 0, 2]]
    .forEach(([o, v, t]) => (t === 4 ? fin.setUint32(o, v, true) : fin.setUint16(o, v, true)));
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of todo) { out.set(p, o); o += p.length; }
  return out;
}
// Texto apto para nombre de archivo: sin tildes ni símbolos ("Declaración responsable" → "Declaracion-responsable").
const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const slug = (t, max = 60) => sinTildes(t).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max).replace(/-$/, "");
// La misma clave de hueco que usa la web (web/src/isla/Presentar.jsx): tipo + nombre sin tildes.
const claveHueco = (r) => `${r.tipo}-${sinTildes(r.nombre).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 80).replace(/-+$/, "");

async function zipSolicitud(db, env, request, codigo) {
  const conv = (await datosRadar(env, request, "convocatorias"))[codigo] || { codigo, titulo: `Convocatoria ${codigo}` };
  const { results: asignados } = await db.prepare(
    `SELECT s.requisito, s.estado, d.id, d.nombre, d.archivo_key, d.archivo_nombre, d.caduca
     FROM solicitud_documentos s LEFT JOIN documentos d ON d.id = s.documento_id WHERE s.codigo = ?`,
  ).bind(codigo).all();
  const porHueco = Object.fromEntries(asignados.map((a) => [a.requisito, a]));
  // Orden: el de la lista de la convocatoria; después, huecos asignados que no estén en ella.
  const reqs = (conv.documentos_requeridos || []).map((r) => ({ ...r, clave: claveHueco(r) }));
  const conocidas = new Set(reqs.map((r) => r.clave));
  for (const a of asignados) if (!conocidas.has(a.requisito)) reqs.push({ nombre: a.requisito, clave: a.requisito, obligatorio: false });
  const base = `Reforesta_BDNS-${codigo}_${slug(conv.titulo, 50)}_${new Date().toISOString().slice(0, 10)}`;
  const archivos = [], usados = new Set();
  let n = 0, faltan = 0;
  for (const r of reqs) {
    const a = porHueco[r.clave];
    if (a?.estado === "no_aplica") continue;
    const datos = a?.archivo_key ? await leerArchivo(env, db, a.archivo_key) : null;
    if (!datos) { if (r.obligatorio) faltan++; continue; }
    const ext = (a.archivo_nombre || "").match(/\.[A-Za-z0-9]{1,5}$/)?.[0] || "";
    let nombre = `${String(++n).padStart(2, "0")}_${slug(r.nombre)}${ext}`;
    if (usados.has(nombre)) nombre = nombre.replace(ext || /$/, `_${a.id}${ext}`);
    usados.add(nombre);
    const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(await new Response(datos).arrayBuffer());
    archivos.push({ nombre, datos: bytes });
  }
  return { nombre: `${base}.zip`, zip: crearZip(archivos), incluidos: archivos.length, faltan };
}

// Siguiente paso que se propone al entrar en cada estado (si el equipo no escribe otro).
// dias: plazo orientativo desde hoy; "plazo" = la fecha fin de solicitud de la convocatoria.
// Subsanar: 10 días hábiles (art. 68 Ley 39/2015) ≈ 14 naturales.
const PASO_POR_ESTADO = {
  convocatoria: {
    preparando: { paso: "Presentar la solicitud", dias: "plazo" },
    presentada: { paso: "Mirar si ha salido la resolución", dias: 60 },
    subsanar: { paso: "Entregar lo que piden subsanar", dias: 14 },
    concedida: { paso: "Aceptar la concesión y planificar la plantación", dias: 15 },
    plantar: { paso: "Plantar y guardar fotos y facturas", dias: 120 },
    justificar: { paso: "Entregar la justificación del gasto", dias: 90 },
  },
  empresa: {
    contactada: { paso: "Volver a escribir si no contestan", dias: 10 },
    reunion: { paso: "Preparar la propuesta para la reunión", dias: 7 },
    acuerdo: { paso: "Firmar el acuerdo y fijar fecha de plantación", dias: 21 },
  },
};
const ESTADOS_FINALES = ["por_revisar", "mas_tarde", "descartada", "denegada", "terminada", "nueva", "cerrada"];
const masDias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// ---------- Modo demo ----------
// Si hoy no hay ninguna convocatoria abierta que encaje, la web quedaría vacía. En modo demo se añaden
// las convocatorias reales a las que se presentó Reforesta (validacion.json) y otras reales recientes
// ya cerradas (demo.json, generado por radar.demo) como si estuvieran
// abiertas, marcadas con demo: true. Por defecto activo (variable MODO_DEMO = "0" lo apaga);
// el equipo lo cambia con PUT /api/demo {activo}.
async function modoDemo(env, db) {
  const f = await db.prepare("SELECT valor FROM ajustes WHERE clave = 'modo_demo'").first().catch(() => null);
  return f ? f.valor === "1" : env.MODO_DEMO !== "0";
}
async function convocatoriasConDemo(env, request) {
  const r = await env.ASSETS.fetch(new Request(new URL("/data/convocatorias.json", request.url)));
  const d = await r.json();
  const leer = async (f) => {
    try {
      const x = await env.ASSETS.fetch(new Request(new URL(`/data/${f}.json`, request.url)));
      return x.ok ? (await x.json()).casos || [] : [];
    } catch { return []; }
  };
  const casos = [...await leer("validacion"), ...await leer("demo")];  // demo.json: radar.demo
  const ya = new Set(d.convocatorias.map((c) => c.codigo));
  const hoy = Date.now();
  // Solo las que el radar recomendaría (las "pendiente" de análisis no lucen en una demo).
  const demo = casos.filter((c) => !ya.has(c.codigo) && ["presenta", "mira"].includes(c.veredicto)).map((c, i) => ({
    ...c, filtros: undefined, encontrada: undefined, descripcion_reto: undefined,
    demo: true, abierta: true, plazo_estimado: null,
    publicada: new Date(hoy - (3 + i) * 86400000).toISOString().slice(0, 10),
    fin: new Date(hoy + (21 + 9 * i) * 86400000).toISOString().slice(0, 10),
    plazo_texto: "Ejemplo real: convocatoria ya cerrada, con fechas de demostración",
  }));
  return { ...d, convocatorias: [...demo, ...d.convocatorias], demo: demo.length };
}

// Empresas del BOE: impacto de las hectáreas que deben compensar (superficie total o suma de sus medidas).
function haEmpresa(e) {
  if (e.superficie_total_ha > 0) return e.superficie_total_ha;
  const suma = (e.medidas || []).reduce((s, m) => s + (m.superficie_ha > 0 ? m.superficie_ha : 0), 0);
  return suma > 0 ? suma : null;
}
function empresasConImpacto(d) {
  return { ...d, empresas: (d.empresas || []).map((e) => {
    const ha = haEmpresa(e);
    return { ...e, impacto: ha ? impacto(ha) : null };
  }) };
}

// Datos del radar (convocatorias.json / empresas.json) indexados por código; {} si no hay.
async function datosRadar(env, request, archivo) {
  try {
    const d = archivo === "convocatorias" && env.DB && await modoDemo(env, env.DB)
      ? await convocatoriasConDemo(env, request)
      : await (await env.ASSETS.fetch(new Request(new URL(`/data/${archivo}.json`, request.url)))).json();
    return Object.fromEntries((d.convocatorias || d.empresas || []).map((c) => [c.codigo || c.id, c]));
  } catch {
    return {};
  }
}

const TIPOS_PLANTACION = ["c", "e", "v"];
// Valida una plantación; parcial = true en PUT (solo los campos enviados).
function camposPlantacion(b, parcial) {
  const p = {};
  if (b.nombre !== undefined || !parcial) p.nombre = texto(b.nombre, 120);
  if (b.ll !== undefined || !parcial) {
    const [lon, lat] = Array.isArray(b.ll) ? b.ll.map(Number) : [];
    // Península, Baleares y Canarias
    if (!(lon >= -18.5 && lon <= 4.5 && lat >= 27.5 && lat <= 44)) return { error: "ll: [longitud, latitud] dentro de España" };
    Object.assign(p, { lon, lat });
  }
  if (b.ha !== undefined || !parcial) p.ha = Math.min(100000, numero(b.ha) ?? 0);
  if (b.arboles !== undefined) p.arboles = b.arboles === null || b.arboles === "" ? null : entero(b.arboles, 0, 10000000) ?? null;
  if (b.especies !== undefined) p.especies = texto(b.especies, 300);
  if (b.tipo !== undefined || !parcial) p.tipo = TIPOS_PLANTACION.includes(b.tipo) ? b.tipo : "c";
  if (b.anio !== undefined || !parcial) p.anio = entero(b.anio ?? new Date().getFullYear(), 1990, 2100);
  for (const [k, max] of [["con", 200], ["notas", 1000]]) if (b[k] !== undefined) p[k] = texto(b[k], max);
  if (b.origen && TIPOS.includes(b.origen.tipo)) Object.assign(p, { origen_tipo: b.origen.tipo, origen_id: texto(b.origen.id, 60) });
  if (!parcial && !p.nombre) return { error: "Falta el nombre del sitio" };
  return { p };
}
const filaPlantacion = (r, equipo) => ({
  id: r.id, nombre: r.nombre, ll: [r.lon, r.lat], ha: r.ha, arboles: r.arboles, especies: r.especies, tipo: r.tipo,
  anio: r.anio, con: r.con, origen: r.origen_tipo ? { tipo: r.origen_tipo, id: r.origen_id } : null,
  ...(equipo ? { notas: r.notas, autor: r.autor, creado: r.creado } : {}),
});
function totalesPlantaciones(l) {
  const suma = (xs, f) => Math.round(xs.reduce((s, x) => s + (f(x) || 0), 0) * 100) / 100;
  const agrupar = (clave) => Object.fromEntries([...new Set(l.map(clave))].sort().map((k) => {
    const g = l.filter((x) => clave(x) === k);
    return [k, { sitios: g.length, ha: suma(g, (x) => x.ha) }];
  }));
  return { sitios: l.length, ha: suma(l, (x) => x.ha), arboles: suma(l, (x) => x.arboles),
    por_anio: agrupar((x) => x.anio), por_tipo: agrupar((x) => x.tipo) };
}

// Lo que está en marcha, con días hasta su siguiente paso y nivel de aviso. Lo usan la API y el correo.
async function seguimiento(db, env, request) {
  const [convs, emps] = await Promise.all([datosRadar(env, request, "convocatorias"), datosRadar(env, request, "empresas")]);
  const { results } = await db.prepare(
    `SELECT s.*, (SELECT MAX(creado) FROM historial h WHERE h.tipo = s.tipo AND h.ref = s.id) AS desde
     FROM solicitudes s WHERE s.estado NOT IN (${ESTADOS_FINALES.map(() => "?").join(",")})`,
  ).bind(...ESTADOS_FINALES).all();
  const hoy = new Date(new Date().toISOString().slice(0, 10));
  const lista = results.map((f) => {
    const s = filaSolicitud(f);
    const datos = s.tipo === "convocatoria" ? convs[s.id] : emps[s.id];
    const fechaPaso = s.fecha_paso || (s.estado === "preparando" ? datos?.fin || datos?.plazo_estimado || "" : "");
    const dias = /^\d{4}-\d{2}-\d{2}/.test(fechaPaso) ? Math.round((new Date(fechaPaso.slice(0, 10)) - hoy) / 86400000) : null;
    const nivel = dias === null ? "sin_fecha" : dias < 0 ? "vencido" : dias <= 3 ? "urgente" : dias <= 14 ? "pronto" : "ok";
    return { ...s, titulo: datos?.titulo || datos?.proyecto || s.id, organo: datos?.organo || datos?.promotor || "",
      url: datos?.url || "", fecha_paso: fechaPaso, dias, nivel, desde: f.desde || s.actualizado };
  });
  const orden = { vencido: 0, urgente: 1, pronto: 2, ok: 3, sin_fecha: 4 };
  lista.sort((a, b) => orden[a.nivel] - orden[b.nivel] || (a.dias ?? 9999) - (b.dias ?? 9999));
  const avisos = lista.filter((x) => ["vencido", "urgente", "pronto"].includes(x.nivel)).map((x) => ({
    tipo: x.tipo, id: x.id, nivel: x.nivel, dias: x.dias,
    texto: `${x.siguiente_paso || "Siguiente paso"}: ${x.titulo.slice(0, 80)} · ${
      x.dias < 0 ? `venció hace ${-x.dias} días` : x.dias === 0 ? "hoy" : `quedan ${x.dias} días`}`,
  }));
  return { en_marcha: lista, avisos, resumen: Object.fromEntries(Object.keys(orden).map((n) => [n, lista.filter((x) => x.nivel === n).length])) };
}

// ---------- Avisos por correo ----------
// Cada mañana (cron en wrangler.jsonc) se manda a perfil.email_avisos un resumen con:
// convocatorias nuevas que encajan, pasos vencidos o a punto de vencer, y reservas de empresas sin contestar.
// Necesita el secreto RESEND_API_KEY (resend.com, gratis 100 correos/día) y, opcional, EMAIL_REMITENTE
// (un remitente de un dominio verificado en Resend; sin él se usa onboarding@resend.dev, que solo
// entrega a la dirección de la propia cuenta de Resend).
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function correoAvisos(db, env, request, { forzar = false } = {}) {
  const { guardado: perfil } = await leerPerfil(db);
  const modo = perfil.avisos || PERFIL_BASE.avisos;
  const ultimo = (await db.prepare("SELECT valor FROM ajustes WHERE clave = 'ultimo_correo'").first())?.valor || "";
  const desde = ultimo || new Date(Date.now() - 86400000).toISOString();
  const convs = Object.values(await datosRadar(env, request, "convocatorias"));
  const { results: tratadas } = await db.prepare("SELECT id FROM solicitudes WHERE tipo = 'convocatoria'").all();
  const yaVistas = new Set(tratadas.map((t) => t.id));
  const nuevas = convs.filter((c) => !c.demo && ["presenta", "mira"].includes(c.veredicto) && !yaVistas.has(c.codigo)
    && (c.publicada || "") >= desde.slice(0, 10)).sort((a, b) => b.puntuacion - a.puntuacion).slice(0, 10);
  const { avisos } = await seguimiento(db, env, request);
  const { results: reservas } = await db.prepare(
    `SELECT i.empresa, p.titulo FROM interesados i LEFT JOIN proyectos p ON p.id = i.proyecto_id
     WHERE COALESCE(i.estado, 'nueva') = 'nueva' ORDER BY i.id DESC LIMIT 10`).all();
  const total = nuevas.length + avisos.length + reservas.length;
  const url = new URL(request.url).origin;
  const bloque = (titulo, filas) => filas.length
    ? `<h3 style="margin:18px 0 6px;font:600 16px system-ui">${titulo}</h3><ul style="padding-left:18px;margin:0">${filas.map((f) => `<li style="margin:4px 0">${f}</li>`).join("")}</ul>` : "";
  const html = `<div style="font:15px/1.5 system-ui;color:#1d2a20;max-width:620px">
    <h2 style="font:700 20px system-ui;margin:0 0 4px">Radar Reforesta · ${total ? `${total} ${total === 1 ? "cosa" : "cosas"} para hoy` : "nada urgente"}</h2>
    ${bloque("⏰ Pasos que vencen", avisos.map((a) => esc(a.texto)))}
    ${bloque("🌱 Convocatorias nuevas que encajan", nuevas.map((c) =>
      `<a href="${esc(c.url)}">${esc(c.titulo.slice(0, 110))}</a> · ${c.veredicto === "presenta" ? "Presentad" : "Miradla"} (${c.puntuacion})${c.fin ? ` · hasta ${esc(c.fin)}` : ""}`))}
    ${bloque("🤝 Empresas que esperan respuesta", reservas.map((r) => `${esc(r.empresa)}${r.titulo ? ` · ${esc(r.titulo)}` : ""}`))}
    <p style="margin-top:20px"><a href="${url}">Abrir el radar</a> · Podéis cambiar o quitar estos avisos en Perfil.</p></div>`;
  const n = (k, uno, varios) => k && `${k} ${k === 1 ? uno : varios}`;
  const asunto = total ? `Radar Reforesta: ${[n(avisos.length, "paso", "pasos"), n(nuevas.length, "convocatoria", "convocatorias"),
    n(reservas.length, "empresa", "empresas")].filter(Boolean).join(", ")}` : "Radar Reforesta: nada urgente hoy";
  // Semanal: solo los lunes. Sin novedades no se manda nada (salvo prueba).
  const toca = modo === "cada_manana" || (modo === "semanal" && new Date().getUTCDay() === 1);
  return { para: perfil.email_avisos || "", modo, enviar: forzar || (toca && total > 0), asunto, html, total,
    contenido: { avisos, nuevas: nuevas.map((c) => c.codigo), reservas: reservas.length } };
}

async function enviarCorreo(env, { para, asunto, html }) {
  if (!env.RESEND_API_KEY) return { ok: false, motivo: "Falta el secreto RESEND_API_KEY en Cloudflare" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return { ok: false, motivo: "Poned un email de avisos válido en Perfil" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_REMITENTE || "Radar Reforesta <onboarding@resend.dev>", to: [para], subject: asunto, html }),
  });
  if (!r.ok) return { ok: false, motivo: `Resend respondió ${r.status}: ${(await r.text()).slice(0, 200)}` };
  return { ok: true };
}

async function avisosDiarios(env) {
  const db = env.DB;
  await prepararEsquema(db);
  // En el cron no hay petición: los datos del radar se piden a los assets con una URL cualquiera.
  const request = new Request(env.URL_PUBLICA || "https://radar-reforesta.local/");
  const c = await correoAvisos(db, env, request);
  if (c.modo === "nunca" || !c.enviar) return console.log(`Avisos: no se envía (${c.modo}, ${c.total} novedades)`);
  const r = await enviarCorreo(env, c);
  console.log(r.ok ? `Avisos enviados a ${c.para}` : `Avisos sin enviar: ${r.motivo}`);
  if (r.ok) {
    await db.prepare(`INSERT INTO ajustes (clave, valor, actualizado, actualizado_por) VALUES ('ultimo_correo', ?, ?, 'cron')
      ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado`).bind(ahora(), ahora()).run();
  }
}

// Compatibilidad con la web actual (Me interesa / No interesa).
const DE_ANTIGUO = { interesa: "preparando", descarta: "descartada" };
const A_ANTIGUO = { preparando: "interesa", descartada: "descarta" };

function autorDe(request) {
  try {
    return texto(decodeURIComponent(request.headers.get("x-autor") || ""), 40);
  } catch {
    return "";
  }
}

function filaSolicitud(r) {
  return { ...r, motivos: JSON.parse(r.motivos || "[]") };
}

// Guarda el nuevo estado y apunta en el historial cómo estaba antes (para poder deshacer).
async function cambiarSolicitud(db, tipo, id, cambios, autor) {
  const antes = await db.prepare("SELECT * FROM solicitudes WHERE tipo = ? AND id = ?").bind(tipo, id).first();
  const base = antes ? filaSolicitud(antes) : { estado: "", motivos: [], nota: "", responsable: "",
    siguiente_paso: "", fecha_paso: "" };
  const nueva = { ...base, ...cambios, tipo, id, actualizado: ahora(), actualizado_por: autor };
  if (nueva.estado !== "descartada") nueva.motivos = [];
  await db.batch([
    db.prepare(
      `INSERT INTO solicitudes (tipo, id, estado, motivos, nota, responsable, siguiente_paso, fecha_paso,
         actualizado, actualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (tipo, id) DO UPDATE SET estado = excluded.estado, motivos = excluded.motivos,
         nota = excluded.nota, responsable = excluded.responsable, siguiente_paso = excluded.siguiente_paso,
         fecha_paso = excluded.fecha_paso, actualizado = excluded.actualizado,
         actualizado_por = excluded.actualizado_por`,
    ).bind(tipo, id, nueva.estado, JSON.stringify(nueva.motivos), nueva.nota, nueva.responsable,
      nueva.siguiente_paso, nueva.fecha_paso, nueva.actualizado, autor),
    db.prepare("INSERT INTO historial (tipo, ref, antes, despues, autor, creado) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(tipo, id, antes ? JSON.stringify(base) : null, JSON.stringify(nueva), autor, ahora()),
  ]);
  return nueva;
}

// Columnas añadidas después de crear las tablas: se intentan una a una (si ya existen, falla y se ignora).
const COLUMNAS_NUEVAS = [
  "ALTER TABLE proyectos ADD COLUMN tipo TEXT DEFAULT 'plantacion'",
  "ALTER TABLE proyectos ADD COLUMN incluye TEXT DEFAULT ''",
  "ALTER TABLE proyectos ADD COLUMN plazas INTEGER",
  "ALTER TABLE proyectos ADD COLUMN estado TEXT DEFAULT 'publicada'",
  "ALTER TABLE proyectos ADD COLUMN actualizado TEXT",
  "ALTER TABLE interesados ADD COLUMN estado TEXT DEFAULT 'nueva'",
  "ALTER TABLE interesados ADD COLUMN actualizado_por TEXT DEFAULT ''",
  "ALTER TABLE interesados ADD COLUMN hectareas REAL",
];

let esquemaListo = false;
async function prepararEsquema(db) {
  if (esquemaListo) return;
  await db.batch(ESQUEMA.map((sql) => db.prepare(sql)));
  for (const sql of COLUMNAS_NUEVAS) {
    try { await db.prepare(sql).run(); } catch { /* ya existe */ }
  }
  esquemaListo = true;
}

const json = (datos, estado = 200) =>
  new Response(JSON.stringify(datos), {
    status: estado,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const error = (mensaje, estado = 400) => json({ error: mensaje }, estado);
const ahora = () => new Date().toISOString();

// Texto limpio y con longitud máxima (lo que escriben las empresas es público).
function texto(valor, max = 500) {
  return String(valor ?? "").trim().slice(0, max);
}
function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function emailsPermitidos(env) {
  return String(env.EMAILS_EQUIPO || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
}

function emailPermitido(email, env) {
  return emailsPermitidos(env).some((p) => (p.startsWith("@") ? email.endsWith(p) : email === p));
}

// Tokens de Google ya comprobados en esta instancia del Worker (evita llamar a Google cada vez).
const tokensComprobados = new Map();

// Comprueba el id_token de Google con el servicio oficial de Google y devuelve el email.
async function emailDeGoogle(token, env) {
  if (!token || !env.GOOGLE_CLIENT_ID) return null;
  const guardado = tokensComprobados.get(token);
  if (guardado && guardado.exp > Date.now() / 1000) return guardado.email;
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (!r.ok) return null;
  const d = await r.json();
  const emisorOk = ["accounts.google.com", "https://accounts.google.com"].includes(d.iss);
  const verificado = d.email_verified === true || d.email_verified === "true";
  if (!emisorOk || d.aud !== env.GOOGLE_CLIENT_ID || !verificado || Number(d.exp) < Date.now() / 1000) {
    return null;
  }
  const email = String(d.email || "").toLowerCase();
  if (tokensComprobados.size > 500) tokensComprobados.clear();
  tokensComprobados.set(token, { email, exp: Number(d.exp) });
  return email;
}

// Devuelve { email } si es del equipo, { email, denegado: true } si es una cuenta de Google
// que no está en la lista, o null si no hay sesión.
async function quienEs(request, env) {
  const clave = request.headers.get("x-clave-equipo") || "";
  if (env.CLAVE_EQUIPO && clave === env.CLAVE_EQUIPO) return { email: "clave del equipo" };
  const auth = request.headers.get("authorization") || "";
  const email = await emailDeGoogle(auth.startsWith("Bearer ") ? auth.slice(7) : "", env);
  if (!email) return null;
  return emailPermitido(email, env) ? { email } : { email, denegado: true };
}

async function leerJSON(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function api(request, env, ruta) {
  const db = env.DB;
  if (!db) return error("Falta la base de datos D1 (binding DB) en wrangler.jsonc", 503);
  const metodo = request.method;

  if (ruta === "/api/config" && metodo === "GET") {
    return json({ google_client_id: env.GOOGLE_CLIENT_ID || "" });
  }

  // --- impacto de X hectáreas (público: lo ven las empresas)
  if (ruta === "/api/impacto" && metodo === "GET") {
    const ha = numero(new URL(request.url).searchParams.get("ha"));
    if (!ha || ha > 100000) return error("ha: número de hectáreas mayor que 0");
    return json(impacto(ha));
  }

  await prepararEsquema(db);
  const usuario = await quienEs(request, env);
  const equipo = Boolean(usuario && !usuario.denegado);
  const soloEquipo = () => {
    if (!env.CLAVE_EQUIPO && !env.GOOGLE_CLIENT_ID) {
      return error("Falta configurar el secreto CLAVE_EQUIPO en el Worker", 503);
    }
    if (usuario?.denegado) return error(`${usuario.email} no está en la lista del equipo de Reforesta`, 403);
    return error(env.CLAVE_EQUIPO ? "Contraseña del equipo incorrecta"
      : "Inicia sesión con la cuenta de Google del equipo", 401);
  };

  // --- equipo
  if (ruta === "/api/equipo" && metodo === "GET") {
    return equipo ? json({ ok: true, email: usuario.email }) : soloEquipo();
  }

  const autor = autorDe(request);

  // --- compatibilidad: Me interesa / No interesa (web actual)
  if (ruta === "/api/estado") {
    if (!equipo) return soloEquipo();
    if (metodo === "GET") {
      const { results } = await db.prepare(
        "SELECT tipo, id, estado, nota, actualizado FROM solicitudes WHERE estado IN ('preparando', 'descartada')",
      ).all();
      return json(results.map((r) => ({ ...r, estado: A_ANTIGUO[r.estado] })));
    }
    if (metodo === "PUT") {
      const b = await leerJSON(request);
      const tipo = texto(b.tipo, 20), id = texto(b.id, 60);
      if (!TIPOS.includes(tipo) || !id) return error("tipo o id no válidos");
      if (!b.estado) {
        await db.prepare("DELETE FROM solicitudes WHERE tipo = ? AND id = ?").bind(tipo, id).run();
        return json({ ok: true });
      }
      if (!DE_ANTIGUO[b.estado]) return error("estado no válido");
      await cambiarSolicitud(db, tipo, id, { estado: DE_ANTIGUO[b.estado], nota: texto(b.nota) }, autor);
      return json({ ok: true });
    }
  }

  // --- ciclo de vida de convocatorias y empresas
  if (ruta === "/api/solicitudes" && metodo === "GET") {
    if (!equipo) return soloEquipo();
    const tipo = new URL(request.url).searchParams.get("tipo");
    const q = TIPOS.includes(tipo)
      ? db.prepare("SELECT * FROM solicitudes WHERE tipo = ? ORDER BY actualizado DESC").bind(tipo)
      : db.prepare("SELECT * FROM solicitudes ORDER BY actualizado DESC");
    const { results } = await q.all();
    return json(results.map(filaSolicitud));
  }

  let ms = ruta.match(/^\/api\/solicitudes\/(convocatoria|empresa)\/([\w.-]{1,60})(\/deshacer|\/historial)?$/);
  if (ms) {
    if (!equipo) return soloEquipo();
    const [, tipo, id, accion] = ms;
    if (!accion && metodo === "PUT") {
      const b = await leerJSON(request);
      const cambios = {};
      if (b.estado !== undefined) {
        if (!ESTADOS[tipo].includes(b.estado)) {
          return error(`Estado no válido. Posibles: ${ESTADOS[tipo].join(", ")}`);
        }
        cambios.estado = b.estado;
      }
      if (Array.isArray(b.motivos)) cambios.motivos = b.motivos.map((m) => texto(m, 120)).filter(Boolean).slice(0, 10);
      for (const campo of ["nota", "responsable", "siguiente_paso", "fecha_paso"]) {
        if (b[campo] !== undefined) cambios[campo] = texto(b[campo], campo === "nota" ? 1000 : 120);
      }
      const existe = await db.prepare("SELECT estado FROM solicitudes WHERE tipo = ? AND id = ?").bind(tipo, id).first();
      if (!existe && !cambios.estado) return error("La primera vez hay que indicar el estado");
      // Al cambiar de estado se propone el siguiente paso y su fecha, salvo que el equipo los mande.
      if (cambios.estado && cambios.estado !== existe?.estado) {
        const def = PASO_POR_ESTADO[tipo][cambios.estado];
        if (b.siguiente_paso === undefined) cambios.siguiente_paso = def?.paso || "";
        if (b.fecha_paso === undefined) {
          cambios.fecha_paso = def && def.dias !== "plazo" ? masDias(def.dias) : "";  // "plazo": se toma de la convocatoria
        }
      }
      if (cambios.fecha_paso && !/^\d{4}-\d{2}-\d{2}$/.test(cambios.fecha_paso)) return error("fecha_paso: AAAA-MM-DD");
      return json({ ok: true, solicitud: await cambiarSolicitud(db, tipo, id, cambios, autor) });
    }
    if (accion === "/deshacer" && metodo === "POST") {
      const ultimo = await db.prepare(
        "SELECT n, antes FROM historial WHERE tipo = ? AND ref = ? ORDER BY n DESC LIMIT 1",
      ).bind(tipo, id).first();
      if (!ultimo) return error("No hay nada que deshacer", 404);
      if (ultimo.antes) {
        await cambiarSolicitud(db, tipo, id, JSON.parse(ultimo.antes), autor);
      } else {
        await db.prepare("DELETE FROM solicitudes WHERE tipo = ? AND id = ?").bind(tipo, id).run();
      }
      // El propio "deshacer" no debe poder deshacerse en bucle: se borran ambos apuntes.
      await db.prepare("DELETE FROM historial WHERE tipo = ? AND ref = ? AND n >= ?").bind(tipo, id, ultimo.n).run();
      const ahoraFila = await db.prepare("SELECT * FROM solicitudes WHERE tipo = ? AND id = ?").bind(tipo, id).first();
      return json({ ok: true, solicitud: ahoraFila ? filaSolicitud(ahoraFila) : null });
    }
    if (accion === "/historial" && metodo === "GET") {
      const { results } = await db.prepare(
        "SELECT antes, despues, autor, creado FROM historial WHERE tipo = ? AND ref = ? ORDER BY n DESC LIMIT 50",
      ).bind(tipo, id).all();
      return json(results.map((h) => ({ ...h, antes: h.antes && JSON.parse(h.antes), despues: JSON.parse(h.despues) })));
    }
  }

  // --- biblioteca de documentos
  if (ruta === "/api/documentos") {
    if (!equipo) return soloEquipo();
    if (metodo === "GET") {
      const { results } = await db.prepare(
        "SELECT id, tipo, nombre, archivo_nombre, mime, tamano, emitido, caduca, subido_por, creado, archivo_key IS NOT NULL AS tiene_archivo FROM documentos ORDER BY tipo, id DESC",
      ).all();
      return json({ almacen: env.ARCHIVOS ? "r2" : "d1", documentos: results.map((d) => ({ ...d, tiene_archivo: Boolean(d.tiene_archivo) })) });
    }
    if (metodo === "POST") {
      const esArchivo = (request.headers.get("content-type") || "").includes("multipart/form-data");
      let campos, archivo = null;
      if (esArchivo) {
        const form = await request.formData();
        campos = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
        archivo = form.get("archivo");
        if (!archivo || typeof archivo === "string") return error("Falta el archivo");
        if (archivo.size > MAX_ARCHIVO) return error("El archivo pesa más de 10 MB");
        if (!MIME_PERMITIDOS.includes(archivo.type)) return error("Tipo de archivo no permitido (PDF, imagen, Word, Excel u ODF)");
      } else {
        campos = await leerJSON(request);
      }
      const nombre = texto(campos.nombre || archivo?.name, 120);
      if (!nombre) return error("El documento necesita un nombre");
      const tipo = TIPOS_DOCUMENTO.includes(campos.tipo) ? campos.tipo : "otro";
      let key = null;
      if (archivo) {
        key = await guardarArchivo(env, db, archivo);
      }
      const r = await db.prepare(
        `INSERT INTO documentos (tipo, nombre, archivo_key, archivo_nombre, mime, tamano, emitido, caduca, subido_por, creado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(tipo, nombre, key, archivo ? texto(archivo.name, 150) : null, archivo?.type || null, archivo?.size || null,
        fecha(campos.emitido), fecha(campos.caduca), autor, ahora()).run();
      return json({ ok: true, id: r.meta.last_row_id }, 201);
    }
  }
  ms = ruta.match(/^\/api\/documentos\/(\d+)$/);
  if (ms) {
    if (!equipo) return soloEquipo();
    const id = Number(ms[1]);
    if (metodo === "PUT") {
      const b = await leerJSON(request), c = {};
      if (b.nombre !== undefined) c.nombre = texto(b.nombre, 120);
      if (b.tipo !== undefined && TIPOS_DOCUMENTO.includes(b.tipo)) c.tipo = b.tipo;
      if (b.emitido !== undefined) c.emitido = fecha(b.emitido);
      if (b.caduca !== undefined) c.caduca = fecha(b.caduca);
      const k = Object.keys(c);
      if (!k.length || c.nombre === "") return error("Nada válido que cambiar");
      await db.prepare(`UPDATE documentos SET ${k.map((x) => `${x} = ?`).join(", ")} WHERE id = ?`).bind(...k.map((x) => c[x]), id).run();
      return json({ ok: true });
    }
    if (metodo === "DELETE") {
      const d = await db.prepare("SELECT archivo_key FROM documentos WHERE id = ?").bind(id).first();
      if (!d) return error("Ese documento no existe", 404);
      if (d.archivo_key) await borrarArchivo(env, db, d.archivo_key);
      await db.batch([
        db.prepare("DELETE FROM documentos WHERE id = ?").bind(id),
        db.prepare("UPDATE solicitud_documentos SET documento_id = NULL, estado = 'falta' WHERE documento_id = ?").bind(id),
      ]);
      return json({ ok: true });
    }
  }
  ms = ruta.match(/^\/api\/archivos\/(\d+)$/);
  if (ms && metodo === "GET") {
    if (!equipo) return soloEquipo();
    const d = await db.prepare("SELECT archivo_key, archivo_nombre, mime FROM documentos WHERE id = ?").bind(Number(ms[1])).first();
    if (!d?.archivo_key) return error("Ese documento no tiene archivo", 404);
    const cuerpo = await leerArchivo(env, db, d.archivo_key);
    if (!cuerpo) return error("Archivo no encontrado", 404);
    return new Response(cuerpo, { headers: {
      "content-type": d.mime || "application/octet-stream", "cache-control": "private, no-store",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.archivo_nombre || "documento")}`,
    } });
  }

  // --- ZIP con los documentos para presentar
  ms = ruta.match(/^\/api\/solicitudes\/convocatoria\/([\w.-]{1,60})\/zip$/);
  if (ms && metodo === "GET") {
    if (!equipo) return soloEquipo();
    const z = await zipSolicitud(db, env, request, ms[1]);
    return new Response(z.zip, { headers: {
      "content-type": "application/zip", "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${z.nombre}"`,
      "x-documentos-incluidos": String(z.incluidos), "x-documentos-faltan": String(z.faltan),
      "access-control-expose-headers": "content-disposition, x-documentos-incluidos, x-documentos-faltan",
    } });
  }

  // --- documentos de cada solicitud (qué va en cada hueco)
  ms = ruta.match(/^\/api\/solicitudes\/convocatoria\/([\w.-]{1,60})\/documentos(?:\/([\w.-]{1,80}))?$/);
  if (ms) {
    if (!equipo) return soloEquipo();
    const [, codigo, req] = ms;
    if (!req && metodo === "GET") {
      const { results } = await db.prepare(
        `SELECT s.requisito, s.documento_id, s.estado, s.responsable, s.actualizado, s.actualizado_por,
           d.nombre AS documento_nombre, d.caduca AS documento_caduca, d.emitido AS documento_emitido
         FROM solicitud_documentos s LEFT JOIN documentos d ON d.id = s.documento_id WHERE s.codigo = ?`,
      ).bind(codigo).all();
      return json(results);
    }
    if (req && metodo === "PUT") {
      const b = await leerJSON(request);
      const docId = b.documento_id === null || b.documento_id === undefined ? null : Number(b.documento_id);
      if (docId !== null && !(await db.prepare("SELECT 1 FROM documentos WHERE id = ?").bind(docId).first())) {
        return error("Ese documento no está en la biblioteca", 404);
      }
      const estado = ESTADOS_HUECO.includes(b.estado) ? b.estado : docId ? "confirmado" : "falta";
      await db.prepare(
        `INSERT INTO solicitud_documentos (codigo, requisito, documento_id, estado, responsable, actualizado, actualizado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (codigo, requisito) DO UPDATE SET documento_id = excluded.documento_id, estado = excluded.estado,
           responsable = excluded.responsable, actualizado = excluded.actualizado, actualizado_por = excluded.actualizado_por`,
      ).bind(codigo, req, docId, estado, texto(b.responsable, 40), ahora(), autor).run();
      return json({ ok: true, estado });
    }
  }

  // --- mapa de plantaciones
  if (ruta === "/api/plantaciones") {
    if (metodo === "GET") {
      const { results } = await db.prepare("SELECT * FROM plantaciones WHERE activo = 1 ORDER BY anio DESC, id DESC").all();
      const l = results.map((r) => filaPlantacion(r, equipo));
      return json({ plantaciones: l, totales: totalesPlantaciones(l) });
    }
    if (metodo === "POST") {
      if (!equipo) return soloEquipo();
      const b = await leerJSON(request);
      const { p, error: e } = camposPlantacion(b, false);
      if (e) return error(e);
      if (!p.con && p.origen_id) {  // si viene de una solicitud, se rellena «con quién» con su título
        const d = (await datosRadar(env, request, p.origen_tipo === "empresa" ? "empresas" : "convocatorias"))[p.origen_id];
        p.con = texto(d?.promotor || d?.titulo || "", 200);
      }
      const k = Object.keys(p);
      const r = await db.prepare(
        `INSERT INTO plantaciones (${k.join(", ")}, autor, creado) VALUES (${k.map(() => "?").join(", ")}, ?, ?)`,
      ).bind(...k.map((x) => p[x]), autor, ahora()).run();
      return json({ ok: true, id: r.meta.last_row_id }, 201);
    }
  }
  ms = ruta.match(/^\/api\/plantaciones\/(\d+)$/);
  if (ms) {
    if (!equipo) return soloEquipo();
    const id = Number(ms[1]);
    if (!(await db.prepare("SELECT 1 FROM plantaciones WHERE id = ? AND activo = 1").bind(id).first())) {
      return error("Esa plantación no existe", 404);
    }
    if (metodo === "PUT") {
      const { p, error: e } = camposPlantacion(await leerJSON(request), true);
      if (e) return error(e);
      const k = Object.keys(p);
      if (!k.length) return error("No hay nada que cambiar");
      await db.prepare(`UPDATE plantaciones SET ${k.map((x) => `${x} = ?`).join(", ")} WHERE id = ?`)
        .bind(...k.map((x) => p[x]), id).run();
      return json({ ok: true });
    }
    if (metodo === "DELETE") {
      await db.prepare("UPDATE plantaciones SET activo = 0 WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
  }

  // --- correo de avisos: vista previa (GET, ?html=1 para verlo tal cual) y envío de prueba (POST)
  if (ruta === "/api/avisos/correo") {
    if (!equipo) return soloEquipo();
    const c = await correoAvisos(db, env, request, { forzar: true });
    if (metodo === "GET") {
      if (new URL(request.url).searchParams.get("html")) {
        return new Response(c.html, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      return json({ para: c.para, modo: c.modo, asunto: c.asunto, total: c.total, contenido: c.contenido,
        listo: Boolean(env.RESEND_API_KEY && c.para) });
    }
    if (metodo === "POST") {
      const r = await enviarCorreo(env, c);
      return r.ok ? json({ ok: true, para: c.para }) : error(r.motivo, 400);
    }
  }

  // --- modo demo
  if (ruta === "/api/demo") {
    if (!equipo) return soloEquipo();
    if (metodo === "PUT") {
      const activo = Boolean((await leerJSON(request)).activo);
      await db.prepare(`INSERT INTO ajustes (clave, valor, actualizado, actualizado_por) VALUES ('modo_demo', ?, ?, ?)
        ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado,
        actualizado_por = excluded.actualizado_por`).bind(activo ? "1" : "0", ahora(), autor).run();
    }
    return json({ activo: await modoDemo(env, db) });
  }

  // --- seguimiento: qué toca hacer y cuándo
  if (ruta === "/api/seguimiento" && metodo === "GET") {
    if (!equipo) return soloEquipo();
    return json(await seguimiento(db, env, request));
  }

  // --- reglas aprendidas
  if (ruta === "/api/reglas") {
    if (!equipo) return soloEquipo();
    const sugerencias = async () => {
      const { results: desc } = await db.prepare(
        "SELECT id, motivos, nota FROM solicitudes WHERE tipo = 'convocatoria' AND estado = 'descartada'").all();
      const { results: hechas } = await db.prepare("SELECT motivo FROM reglas WHERE motivo != ''").all();
      const yaTratados = new Set(hechas.map((r) => r.motivo));
      const convocatorias = await datosRadar(env, request, "convocatorias");
      const porMotivo = {};
      for (const d of desc) for (const m of JSON.parse(d.motivos || "[]")) (porMotivo[m] ||= []).push(d);
      return Object.entries(porMotivo)
        .filter(([m, l]) => l.length >= MIN_VECES_REGLA && !yaTratados.has(m))
        .map(([m, l]) => {
          const def = MOTIVO_REGLA[m] || { accion: "Tenerlo en cuenta", texto: () => `No os interesan las que: ${m.toLowerCase()}` };
          const valor = def.campo ? valorRegla(def.campo, l, convocatorias) : null;
          return { motivo: m, veces: l.length, texto: def.texto(valor), accion: def.accion,
            criterio: def.campo ? { campo: def.campo, valor } : null };
        })
        .sort((a, b) => b.veces - a.veces);
    };
    if (metodo === "GET") {
      const { results } = await db.prepare(
        "SELECT id, texto, origen, motivo, criterio, autor, creado FROM reglas WHERE origen != 'ignorada' ORDER BY id DESC").all();
      return json({ sugerencias: await sugerencias(),
        reglas: results.map((r) => ({ ...r, criterio: r.criterio ? JSON.parse(r.criterio) : null })) });
    }
    if (metodo === "POST") {
      const b = await leerJSON(request);
      if (b.motivo) {
        const sug = (await sugerencias()).find((x) => x.motivo === b.motivo);
        if (!sug) return error("No hay ninguna sugerencia con ese motivo", 404);
        const origen = b.accion === "ignorar" ? "ignorada" : "aceptada";
        await db.prepare("INSERT INTO reglas (texto, origen, motivo, criterio, autor, creado) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(sug.texto, origen, sug.motivo, sug.criterio ? JSON.stringify(sug.criterio) : null, autor, ahora()).run();
        if (origen === "aceptada" && sug.criterio) {
          await guardarPerfil(db, { criterios: { [sug.criterio.campo]: sug.criterio.valor } }, autor);
        }
        return json({ ok: true, origen }, 201);
      }
      const t = texto(b.texto, 200);
      if (!t) return error("Escribid la regla");
      const r = await db.prepare("INSERT INTO reglas (texto, origen, autor, creado) VALUES (?, 'equipo', ?, ?)")
        .bind(t, autor, ahora()).run();
      return json({ ok: true, id: r.meta.last_row_id }, 201);
    }
  }
  ms = ruta.match(/^\/api\/reglas\/(\d+)$/);
  if (ms) {
    if (!equipo) return soloEquipo();
    const regla = await db.prepare("SELECT * FROM reglas WHERE id = ?").bind(Number(ms[1])).first();
    if (!regla) return error("Esa regla no existe", 404);
    if (metodo === "PUT") {
      const t = texto((await leerJSON(request)).texto, 200);
      if (!t) return error("Escribid la regla");
      await db.prepare("UPDATE reglas SET texto = ? WHERE id = ?").bind(t, regla.id).run();
      return json({ ok: true });
    }
    if (metodo === "DELETE") {
      await db.prepare("DELETE FROM reglas WHERE id = ?").bind(regla.id).run();
      if (regla.criterio) {  // quitar la regla deshace su criterio
        await guardarPerfil(db, { criterios: { [JSON.parse(regla.criterio).campo]: null } }, autor);
      }
      return json({ ok: true });
    }
  }

  // --- perfil de la entidad (lo lee el radar cada mañana)
  if (ruta === "/api/perfil") {
    if (!equipo) return soloEquipo();
    const fila = await db.prepare("SELECT valor, actualizado, actualizado_por FROM ajustes WHERE clave = 'perfil'").first();
    const guardado = fila ? JSON.parse(fila.valor) : {};
    if (metodo === "GET") {
      const { results: rt } = await db.prepare(
        "SELECT texto FROM reglas WHERE origen IN ('equipo', 'aceptada') AND criterio IS NULL ORDER BY id").all();
      return json({ ...PERFIL_BASE, ...guardado, guardado: Boolean(fila) || rt.length > 0, reglas: rt.map((r) => r.texto),
        actualizado: fila?.actualizado || null, actualizado_por: fila?.actualizado_por || "",
        opciones: { comunidades: COMUNIDADES, avisos: AVISOS } });
    }
    if (metodo === "PUT") {
      const nuevo = await guardarPerfil(db, limpiarPerfil(await leerJSON(request)), autor);
      return json({ ok: true, perfil: { ...PERFIL_BASE, ...nuevo, guardado: true } });
    }
  }

  // --- tableros (secciones de En proceso / Presentado / Descartadas, y la fase de contacto de Empresas):
  // un único JSON en ajustes. Lo interpreta la web; aquí solo se limita su tamaño.
  if (ruta === "/api/tablero") {
    if (!equipo) return soloEquipo();
    if (metodo === "GET") {
      const fila = await db.prepare("SELECT valor, actualizado, actualizado_por FROM ajustes WHERE clave = 'tablero'").first();
      return json({ datos: fila ? JSON.parse(fila.valor) : null, actualizado: fila?.actualizado || null, actualizado_por: fila?.actualizado_por || "" });
    }
    if (metodo === "PUT") {
      const { datos } = await leerJSON(request);
      const valor = JSON.stringify(datos ?? null);
      if (!datos || typeof datos !== "object" || Array.isArray(datos)) return error("datos: un objeto JSON");
      if (valor.length > 60000) return error("El tablero es demasiado grande");
      await db.prepare(
        `INSERT INTO ajustes (clave, valor, actualizado, actualizado_por) VALUES ('tablero', ?, ?, ?)
         ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado,
         actualizado_por = excluded.actualizado_por`,
      ).bind(valor, ahora(), autor).run();
      return json({ ok: true });
    }
  }

  // --- motivos de descarte
  if (ruta === "/api/motivos") {
    if (!equipo) return soloEquipo();
    if (metodo === "GET") {
      const [{ results: propios }, { results: usados }] = await Promise.all([
        db.prepare("SELECT id, texto, autor, creado FROM motivos ORDER BY id").all(),
        db.prepare("SELECT motivos FROM solicitudes WHERE estado = 'descartada'").all(),
      ]);
      const usos = {};
      for (const r of usados) for (const m of JSON.parse(r.motivos || "[]")) usos[m] = (usos[m] || 0) + 1;
      const lista = [...MOTIVOS_BASE.map((t) => ({ id: null, texto: t, propio: false })),
        ...propios.filter((m) => !MOTIVOS_BASE.includes(m.texto)).map((m) => ({ ...m, propio: true }))];
      return json(lista.map((m) => ({ ...m, usos: usos[m.texto] || 0 })));
    }
    if (metodo === "POST") {
      const t = texto((await leerJSON(request)).texto, 120);
      if (!t) return error("Escribe el motivo");
      await db.prepare("INSERT OR IGNORE INTO motivos (texto, autor, creado) VALUES (?, ?, ?)").bind(t, autor, ahora()).run();
      return json({ ok: true }, 201);
    }
  }
  ms = ruta.match(/^\/api\/motivos\/(\d+)$/);
  if (ms && metodo === "DELETE") {
    if (!equipo) return soloEquipo();
    await db.prepare("DELETE FROM motivos WHERE id = ?").bind(Number(ms[1])).run();
    return json({ ok: true });
  }

  // --- propuestas de Reforesta (lo que ofrecen a las empresas)
  if (ruta === "/api/proyectos") {
    if (metodo === "GET") {
      const todas = new URL(request.url).searchParams.get("todas") === "1";
      if (todas && !equipo) return soloEquipo();
      const { results } = await db.prepare(
        `${SQL_PROPUESTAS}${todas ? "" : " AND p.estado = 'publicada'"} ORDER BY p.id DESC`,
      ).all();
      return json(results.map(conPlazas).map((p) => (todas ? p : { ...p, reservas: undefined })));
    }
    if (metodo === "POST") {
      if (!equipo) return soloEquipo();
      const c = { tipo: "plantacion", estado: "publicada", ...camposPropuesta(await leerJSON(request)) };
      if (!c.titulo) return error("La propuesta necesita un título");
      const r = await db.prepare(
        `INSERT INTO proyectos (titulo, lugar, tipo, incluye, descripcion, hectareas, presupuesto, plazas, estado,
           creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(c.titulo, c.lugar || "", c.tipo, c.incluye || "", c.descripcion || "", c.hectareas ?? null,
        c.presupuesto ?? null, c.plazas ?? null, c.estado, ahora(), ahora()).run();
      return json({ ok: true, id: r.meta.last_row_id }, 201);
    }
  }

  let m = ruta.match(/^\/api\/proyectos\/(\d+)$/);
  if (m && metodo === "PUT") {
    if (!equipo) return soloEquipo();
    const c = camposPropuesta(await leerJSON(request));
    if (c.titulo === "") return error("La propuesta necesita un título");
    const claves = Object.keys(c);
    if (!claves.length) return error("Nada que cambiar");
    const r = await db.prepare(
      `UPDATE proyectos SET ${claves.map((k) => `${k} = ?`).join(", ")}, actualizado = ? WHERE id = ? AND activo = 1`,
    ).bind(...claves.map((k) => c[k] ?? null), ahora(), Number(m[1])).run();
    if (!r.meta.changes) return error("Esa propuesta no existe", 404);
    const p = await db.prepare(`${SQL_PROPUESTAS} AND p.id = ?`).bind(Number(m[1])).first();
    return json({ ok: true, propuesta: conPlazas(p) });
  }
  if (m && metodo === "DELETE") {
    if (!equipo) return soloEquipo();
    await db.prepare("UPDATE proyectos SET activo = 0 WHERE id = ?").bind(Number(m[1])).run();
    return json({ ok: true });
  }

  m = ruta.match(/^\/api\/proyectos\/(\d+)\/interes$/);
  if (m && metodo === "POST") {
    const b = await leerJSON(request);
    // Campo trampa: invisible para personas, los bots lo rellenan. Fingimos éxito y no guardamos.
    if (texto(b.web)) return json({ ok: true }, 201);
    const huella = await huellaIP(request);
    const haceUnaHora = new Date(Date.now() - 3600e3).toISOString();
    await db.prepare("DELETE FROM envios WHERE creado < ?").bind(haceUnaHora).run();
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM envios WHERE huella = ?").bind(huella).first();
    if (n >= MAX_ENVIOS_POR_HORA) return error("Demasiados envíos seguidos. Prueba dentro de un rato.", 429);
    const empresa = texto(b.empresa, 150), contacto = texto(b.contacto, 150);
    if (!empresa || !contacto) return error("Indica el nombre de la empresa y un contacto");
    const proyecto = await db.prepare(`${SQL_PROPUESTAS} AND p.estado = 'publicada' AND p.id = ?`)
      .bind(Number(m[1])).first();
    if (!proyecto) return error("Ese proyecto ya no está disponible", 404);
    if (conPlazas(proyecto).completa) return error("Ya no quedan plazas en este proyecto", 409);
    // Hectáreas que la empresa quiere apoyar (opcional; como mucho las de la propuesta, si las tiene).
    let ha = b.hectareas === undefined || b.hectareas === null || b.hectareas === "" ? null : numero(b.hectareas);
    if (ha !== null && (ha <= 0 || ha > 100000)) return error("hectareas: número mayor que 0");
    if (ha !== null && proyecto.hectareas > 0) ha = Math.min(ha, proyecto.hectareas);
    await db.prepare(
      "INSERT INTO interesados (proyecto_id, empresa, contacto, mensaje, hectareas, creado) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(proyecto.id, empresa, contacto, texto(b.mensaje, 1000), ha, ahora()).run();
    await db.prepare("INSERT INTO envios (huella, creado) VALUES (?, ?)").bind(huella, ahora()).run();
    // Impacto de su ayuda, para la animación del avión (sus hectáreas o, si no dice, las de la propuesta).
    const haImpacto = ha ?? (proyecto.hectareas > 0 ? proyecto.hectareas : null);
    return json({ ok: true, hectareas: ha, impacto: haImpacto ? impacto(haImpacto) : null }, 201);
  }

  ms = ruta.match(/^\/api\/interesados\/(\d+)$/);
  if (ms && metodo === "PUT") {
    if (!equipo) return soloEquipo();
    const { estado } = await leerJSON(request);
    if (!ESTADOS_RESERVA.includes(estado)) return error(`Estado no válido. Posibles: ${ESTADOS_RESERVA.join(", ")}`);
    const r = await db.prepare("UPDATE interesados SET estado = ?, actualizado_por = ? WHERE id = ?")
      .bind(estado, autor, Number(ms[1])).run();
    return r.meta.changes ? json({ ok: true }) : error("Esa reserva no existe", 404);
  }
  if (ms && metodo === "DELETE") {
    if (!equipo) return soloEquipo();
    await db.prepare("DELETE FROM interesados WHERE id = ?").bind(Number(ms[1])).run();
    return json({ ok: true });
  }

  if (ruta === "/api/interesados" && metodo === "GET") {
    if (!equipo) return soloEquipo();
    const { results } = await db.prepare(
      `SELECT i.id, i.proyecto_id, p.titulo AS proyecto, i.empresa, i.contacto, i.mensaje, i.hectareas, i.creado,
         i.estado, i.actualizado_por
       FROM interesados i JOIN proyectos p ON p.id = i.proyecto_id ORDER BY i.id DESC`,
    ).all();
    return json(results);
  }

  return error("Ruta no encontrada", 404);
}

export default {
  async fetch(request, env) {
    const ruta = new URL(request.url).pathname;
    if (ruta.startsWith("/api/")) {
      try {
        return await api(request, env, ruta);
      } catch (e) {
        console.error(e);
        return error("Error interno", 500);
      }
    }
    // Los datos del radar (convocatorias, empresas, validación) son solo para el equipo.
    if (ruta.startsWith("/data/")) {
      const usuario = await quienEs(request, env);
      if (!usuario || usuario.denegado) return error("Solo para el equipo de Reforesta", 401);
      let r = await env.ASSETS.fetch(request);
      if (ruta === "/data/convocatorias.json" && r.ok) {
        await prepararEsquema(env.DB);
        if (await modoDemo(env, env.DB)) r = Response.json(await convocatoriasConDemo(env, request));
      }
      if (ruta === "/data/empresas.json" && r.ok) r = Response.json(empresasConImpacto(await r.json()));
      const privado = new Response(r.body, r);
      privado.headers.set("cache-control", "private, no-store");
      return privado;
    }
    return env.ASSETS.fetch(request);  // la web React
  },
  // Cron diario (wrangler.jsonc → triggers.crons): correo de avisos.
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(avisosDiarios(env));
  },
};
