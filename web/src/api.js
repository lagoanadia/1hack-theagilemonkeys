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

export class ErrorSesion extends Error {}

export async function api(ruta, { metodo = "GET", datos, token = sesionGuardada() } = {}) {
  const r = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: {
      ...(datos ? { "content-type": "application/json" } : {}),
      ...(token ? { "x-clave-equipo": token } : {}),
    },
    body: datos ? JSON.stringify(datos) : undefined,
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new ErrorSesion(cuerpo.error || "Sesión no válida");
  if (!r.ok) throw new Error(cuerpo.error || `Error ${r.status}`);
  return cuerpo;
}
