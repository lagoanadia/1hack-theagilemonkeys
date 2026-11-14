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
//   GET    /api/proyectos                   proyectos publicados por Reforesta       (público)
//   POST   /api/proyectos                   {titulo, lugar, hectareas, ...}          (equipo)
//   DELETE /api/proyectos/:id               retirar un proyecto                      (equipo)
//   POST   /api/proyectos/:id/interes       {empresa, contacto, mensaje}             (público)
//   GET    /api/interesados                 empresas que quieren ayudar              (equipo)
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

let esquemaListo = false;
async function prepararEsquema(db) {
  if (esquemaListo) return;
  await db.batch(ESQUEMA.map((sql) => db.prepare(sql)));
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

  // --- proyectos de Reforesta
  if (ruta === "/api/proyectos") {
    if (metodo === "GET") {
      const { results } = await db.prepare(
        "SELECT id, titulo, lugar, hectareas, presupuesto, descripcion, creado FROM proyectos WHERE activo = 1 ORDER BY id DESC",
      ).all();
      return json(results);
    }
    if (metodo === "POST") {
      if (!equipo) return soloEquipo();
      const b = await leerJSON(request);
      const titulo = texto(b.titulo, 150);
      if (!titulo) return error("El proyecto necesita un título");
      const r = await db.prepare(
        "INSERT INTO proyectos (titulo, lugar, hectareas, presupuesto, descripcion, creado) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(titulo, texto(b.lugar, 150), numero(b.hectareas), numero(b.presupuesto),
        texto(b.descripcion, 2000), ahora()).run();
      return json({ ok: true, id: r.meta.last_row_id }, 201);
    }
  }

  let m = ruta.match(/^\/api\/proyectos\/(\d+)$/);
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
    const proyecto = await db.prepare("SELECT id FROM proyectos WHERE id = ? AND activo = 1")
      .bind(Number(m[1])).first();
    if (!proyecto) return error("Ese proyecto ya no está disponible", 404);
    await db.prepare(
      "INSERT INTO interesados (proyecto_id, empresa, contacto, mensaje, creado) VALUES (?, ?, ?, ?, ?)",
    ).bind(proyecto.id, empresa, contacto, texto(b.mensaje, 1000), ahora()).run();
    await db.prepare("INSERT INTO envios (huella, creado) VALUES (?, ?)").bind(huella, ahora()).run();
    return json({ ok: true }, 201);
  }

  if (ruta === "/api/interesados" && metodo === "GET") {
    if (!equipo) return soloEquipo();
    const { results } = await db.prepare(
      `SELECT i.id, i.proyecto_id, p.titulo AS proyecto, i.empresa, i.contacto, i.mensaje, i.creado
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
