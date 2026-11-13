// Backend de la webapp: un Worker de Cloudflare con base de datos D1 (SQLite).
// Solo atiende /api/*; todo lo demás (la web React) lo sirve Cloudflare como archivos estáticos.
//
// Rutas:
//   GET    /api/config                      Client ID de Google para el botón de login (público)
//   GET    /api/equipo                      ¿quién soy? (email del equipo)            (equipo)
//   GET    /api/estado                      marcas "interesa / no interesa"          (equipo)
//   PUT    /api/estado                      {tipo, id, estado, nota}                 (equipo)
//   GET    /api/proyectos                   proyectos publicados por Reforesta       (público)
//   POST   /api/proyectos                   {titulo, lugar, hectareas, ...}          (equipo)
//   DELETE /api/proyectos/:id               retirar un proyecto                      (equipo)
//   POST   /api/proyectos/:id/interes       {empresa, contacto, mensaje}             (público)
//   GET    /api/interesados                 empresas que quieren ayudar              (equipo)
//
// "equipo" = sesión de Google (cabecera Authorization: Bearer <id_token>) de un email incluido
// en el secreto EMAILS_EQUIPO (emails o dominios "@reforesta.es", separados por comas).
// Alternativa para pruebas locales: cabecera X-Clave-Equipo igual al secreto CLAVE_EQUIPO.
// Secretos del Worker: GOOGLE_CLIENT_ID, EMAILS_EQUIPO (y opcionalmente CLAVE_EQUIPO).

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
];
const ESTADOS = ["interesa", "descarta"];
const TIPOS = ["convocatoria", "empresa"];

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
    if (!env.GOOGLE_CLIENT_ID && !env.CLAVE_EQUIPO) {
      return error("Falta configurar GOOGLE_CLIENT_ID y EMAILS_EQUIPO en el Worker", 503);
    }
    if (usuario?.denegado) return error(`${usuario.email} no está en la lista del equipo de Reforesta`, 403);
    return error("Inicia sesión con la cuenta de Google del equipo", 401);
  };

  // --- equipo
  if (ruta === "/api/equipo" && metodo === "GET") {
    return equipo ? json({ ok: true, email: usuario.email }) : soloEquipo();
  }

  // --- interesa / no interesa
  if (ruta === "/api/estado") {
    if (!equipo) return soloEquipo();
    if (metodo === "GET") {
      const { results } = await db.prepare("SELECT tipo, id, estado, nota, actualizado FROM estados").all();
      return json(results);
    }
    if (metodo === "PUT") {
      const b = await leerJSON(request);
      const tipo = texto(b.tipo, 20), id = texto(b.id, 60);
      if (!TIPOS.includes(tipo) || !id) return error("tipo o id no válidos");
      if (!b.estado) {  // estado vacío = quitar la marca
        await db.prepare("DELETE FROM estados WHERE tipo = ? AND id = ?").bind(tipo, id).run();
        return json({ ok: true });
      }
      if (!ESTADOS.includes(b.estado)) return error("estado no válido");
      await db.prepare(
        `INSERT INTO estados (tipo, id, estado, nota, actualizado) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (tipo, id) DO UPDATE SET estado = excluded.estado, nota = excluded.nota,
         actualizado = excluded.actualizado`,
      ).bind(tipo, id, b.estado, texto(b.nota), ahora()).run();
      return json({ ok: true });
    }
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
    const empresa = texto(b.empresa, 150), contacto = texto(b.contacto, 150);
    if (!empresa || !contacto) return error("Indica el nombre de la empresa y un contacto");
    const proyecto = await db.prepare("SELECT id FROM proyectos WHERE id = ? AND activo = 1")
      .bind(Number(m[1])).first();
    if (!proyecto) return error("Ese proyecto ya no está disponible", 404);
    await db.prepare(
      "INSERT INTO interesados (proyecto_id, empresa, contacto, mensaje, creado) VALUES (?, ?, ?, ?, ?)",
    ).bind(proyecto.id, empresa, contacto, texto(b.mensaje, 1000), ahora()).run();
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
    return env.ASSETS.fetch(request);  // la web React
  },
};
