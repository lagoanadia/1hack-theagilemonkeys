// Llamadas al backend (worker/index.js → base de datos D1).
// La clave del equipo se guarda solo en este navegador; sin ella se puede ver y pedir ayuda,
// pero no marcar convocatorias ni publicar proyectos.

const CLAVE = "radar-reforesta-clave";

export function claveGuardada() {
  try {
    return localStorage.getItem(CLAVE) || "";
  } catch {
    return "";
  }
}

export function guardarClave(clave) {
  try {
    if (clave) localStorage.setItem(CLAVE, clave);
    else localStorage.removeItem(CLAVE);
  } catch {
    /* navegador sin almacenamiento: habrá que escribir la clave cada vez */
  }
}

export async function api(ruta, { metodo = "GET", datos, clave = claveGuardada() } = {}) {
  const r = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: {
      ...(datos ? { "content-type": "application/json" } : {}),
      ...(clave ? { "x-clave-equipo": clave } : {}),
    },
    body: datos ? JSON.stringify(datos) : undefined,
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(cuerpo.error || `Error ${r.status}`);
  return cuerpo;
}
