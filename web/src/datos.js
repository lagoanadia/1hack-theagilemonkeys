// Utilidades para leer las convocatorias que genera el radar (Python).
// El JSON vive en public/data/convocatorias.json; su formato está en el README.
import { datosEquipo } from "./api.js";

// La validación es opcional: si el archivo aún no existe, la web funciona igual.
export async function cargarValidacion() {
  return datosEquipo("validacion.json", { opcional: true }).catch(() => null);
}

export async function cargarConvocatorias() {
  return datosEquipo("convocatorias.json");
}

// Semáforo del wireframe. Si el radar ya trae "veredicto" se usa ese;
// si no (datos antiguos), se deduce de la puntuación con los mismos cortes.
export function veredicto(c) {
  if (c.veredicto) return c.veredicto;
  if ((c.metodo || "").includes("pendiente_ia")) return "pendiente";
  if (c.puntuacion >= 70) return "presenta";
  if (c.puntuacion >= 50) return "mira";
  return "descarta";
}

export const ETIQUETA_VEREDICTO = {
  presenta: "Presenta", mira: "Mira", descarta: "Descarta", pendiente: "Pendiente de análisis",
};

export function diasHasta(fecha) {
  if (!fecha) return null;
  const hoy = new Date(new Date().toDateString());
  return Math.ceil((new Date(fecha) - hoy) / 864e5);
}

export function euros(n) {
  if (!n) return null;
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
