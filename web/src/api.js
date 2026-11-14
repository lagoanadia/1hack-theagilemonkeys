// Llamadas al backend (worker/index.js → base de datos D1).
// El equipo de Reforesta entra con la contraseña del equipo; se guarda solo en este navegador.
// Sin sesión se puede ver todo y pedir ayuda en Proyectos, pero no marcar ni publicar.

const SESION = "radar-reforesta-sesion";

export function sesionGuardada() {
  try {
    return localStorage.getItem(SESION) || "";
  } catch {
    return "";
  }
}

export function guardarSesion(token) {
  try {
    if (token) localStorage.setItem(SESION, token);
    else localStorage.removeItem(SESION);
  } catch {
    /* navegador sin almacenamiento: habrá que iniciar sesión cada vez */
  }
}

const NOMBRE = "radar-reforesta-nombre";

// Nombre de quien usa este navegador: aparece en el historial ("Marta · hace 2 días").
export function nombreGuardado() {
  try {
    return localStorage.getItem(NOMBRE) || "";
  } catch {
    return "";
  }
}

export function guardarNombre(nombre) {
  try {
    if (nombre) localStorage.setItem(NOMBRE, nombre);
  } catch {
    /* sin almacenamiento: se envía sin nombre */
  }
}

export class ErrorSesion extends Error {}

// Datos del radar (public/data/*.json): el Worker solo los entrega al equipo.
export async function datosEquipo(archivo, { opcional = false } = {}) {
  const token = sesionGuardada();
  const r = await fetch(`/data/${archivo}`, {
    cache: "no-store",
    headers: token ? { "x-clave-equipo": token } : {},
  });
  if (r.ok) return r.json();
  if (opcional) return null;
  throw new Error(`No se pudo cargar ${archivo} (${r.status})`);
}

export async function api(ruta, { metodo = "GET", datos, token = sesionGuardada() } = {}) {
  const r = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: {
      ...(datos ? { "content-type": "application/json" } : {}),
      ...(token ? { "x-clave-equipo": token } : {}),
      ...(nombreGuardado() ? { "x-autor": encodeURIComponent(nombreGuardado()) } : {}),
    },
    body: datos ? JSON.stringify(datos) : undefined,
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new ErrorSesion(cuerpo.error || "Sesión no válida");
  if (!r.ok) throw new Error(cuerpo.error || `Error ${r.status}`);
  return cuerpo;
}

// Respuestas que no son JSON (la vista previa del correo: GET /api/avisos/correo?html=1).
export async function apiTexto(ruta) {
  const token = sesionGuardada();
  const r = await fetch(`/api${ruta}`, { headers: token ? { "x-clave-equipo": token } : {} });
  if (r.status === 401 || r.status === 403) throw new ErrorSesion("Sesión no válida");
  if (!r.ok) throw new Error(`Error ${r.status}`);
  return r.text();
}

// Subir un archivo a la biblioteca de documentos (multipart). Devuelve { ok, id }.
export async function subirDocumento({ archivo, nombre, tipo, emitido, caduca }) {
  const form = new FormData();
  form.append("archivo", archivo);
  form.append("nombre", nombre || archivo.name);
  form.append("tipo", tipo || "otro");
  if (emitido) form.append("emitido", emitido);
  if (caduca) form.append("caduca", caduca);
  const token = sesionGuardada();
  const r = await fetch("/api/documentos", {
    method: "POST",
    headers: {
      ...(token ? { "x-clave-equipo": token } : {}),
      ...(nombreGuardado() ? { "x-autor": encodeURIComponent(nombreGuardado()) } : {}),
    },
    body: form,
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new ErrorSesion(cuerpo.error || "Sesión no válida");
  if (!r.ok) throw new Error(cuerpo.error || `Error ${r.status}`);
  return cuerpo;
}
