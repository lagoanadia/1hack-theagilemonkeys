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
//   GET    /api/reglas                      reglas del equipo + sugerencias detectadas (equipo)
//   POST   /api/reglas                      {motivo, accion: aceptar|ignorar} o {texto} (equipo)
//   PUT    /api/reglas/:id                  {texto}                                   (equipo)
//   DELETE /api/reglas/:id                  quitar (y deshacer su criterio)           (equipo)
//   GET    /api/perfil                      lo que el radar sabe de Reforesta        (equipo)
//   PUT    /api/perfil                      {nombre, zonas, ampliar_espana, ...}     (equipo)
//   GET    /api/proyectos                   propuestas publicadas, con plazas libres  (público)
//   GET    /api/proyectos?todas=1           también borradores y ocultas              (equipo)
//   POST   /api/proyectos                   {titulo, lugar, tipo, incluye, plazas,
//                                            hectareas, presupuesto, estado}         (equipo)
//   PUT    /api/proyectos/:id               editar, publicar u ocultar                (equipo)
//   DELETE /api/proyectos/:id               retirar (archivar) una propuesta          (equipo)
//   POST   /api/proyectos/:id/interes       {empresa, contacto, mensaje}             (público)
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
  // Biblioteca de documentos de la entidad (archivos en R2, binding ARCHIVOS).
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
    (SELECT COUNT(*) FROM interesados i WHERE i.proyecto_id = p.id AND i.estado != 'descartada') AS reservas
  FROM proyectos p WHERE p.activo = 1`;
function conPlazas(p) {
  const libres = p.plazas == null ? null : Math.max(0, p.plazas - p.reservas);
  return { ...p, plazas_libres: libres, completa: libres === 0 };
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
      const existe = await db.prepare("SELECT 1 FROM solicitudes WHERE tipo = ? AND id = ?").bind(tipo, id).first();
      if (!existe && !cambios.estado) return error("La primera vez hay que indicar el estado");
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
      return json({ almacen: Boolean(env.ARCHIVOS), documentos: results.map((d) => ({ ...d, tiene_archivo: Boolean(d.tiene_archivo) })) });
    }
    if (metodo === "POST") {
      const esArchivo = (request.headers.get("content-type") || "").includes("multipart/form-data");
      let campos, archivo = null;
      if (esArchivo) {
        const form = await request.formData();
        campos = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
        archivo = form.get("archivo");
        if (!archivo || typeof archivo === "string") return error("Falta el archivo");
        if (!env.ARCHIVOS) return error("Aún no hay almacén de archivos (bucket R2 ARCHIVOS). Podéis guardarlo sin archivo.", 503);
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
        key = `docs/${crypto.randomUUID()}`;
        await env.ARCHIVOS.put(key, archivo.stream(), { httpMetadata: { contentType: archivo.type } });
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
      if (d.archivo_key && env.ARCHIVOS) await env.ARCHIVOS.delete(d.archivo_key);
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
    if (!d?.archivo_key || !env.ARCHIVOS) return error("Ese documento no tiene archivo", 404);
    const obj = await env.ARCHIVOS.get(d.archivo_key);
    if (!obj) return error("Archivo no encontrado", 404);
    return new Response(obj.body, { headers: {
      "content-type": d.mime || "application/octet-stream", "cache-control": "private, no-store",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.archivo_nombre || "documento")}`,
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

  // --- reglas aprendidas
  if (ruta === "/api/reglas") {
    if (!equipo) return soloEquipo();
    const sugerencias = async () => {
      const { results: desc } = await db.prepare(
        "SELECT id, motivos, nota FROM solicitudes WHERE tipo = 'convocatoria' AND estado = 'descartada'").all();
      const { results: hechas } = await db.prepare("SELECT motivo FROM reglas WHERE motivo != ''").all();
      const yaTratados = new Set(hechas.map((r) => r.motivo));
      let convocatorias = {};
      try {
        const r = await env.ASSETS.fetch(new Request(new URL("/data/convocatorias.json", request.url)));
        convocatorias = Object.fromEntries((await r.json()).convocatorias.map((c) => [c.codigo, c]));
      } catch { /* sin datos del radar: valores por defecto */ }
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
    await db.prepare(
      "INSERT INTO interesados (proyecto_id, empresa, contacto, mensaje, creado) VALUES (?, ?, ?, ?, ?)",
    ).bind(proyecto.id, empresa, contacto, texto(b.mensaje, 1000), ahora()).run();
    await db.prepare("INSERT INTO envios (huella, creado) VALUES (?, ?)").bind(huella, ahora()).run();
    return json({ ok: true }, 201);
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
      `SELECT i.id, i.proyecto_id, p.titulo AS proyecto, i.empresa, i.contacto, i.mensaje, i.creado,
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
      const r = await env.ASSETS.fetch(request);
      const privado = new Response(r.body, r);
      privado.headers.set("cache-control", "private, no-store");
      return privado;
    }
    return env.ASSETS.fetch(request);  // la web React
  },
};
