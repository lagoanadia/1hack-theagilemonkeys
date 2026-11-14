// Utilidades para leer lo que genera el radar (public/data/*.json). Formato: README.
import { datosEquipo } from "./api.js";

export const cargarConvocatorias = () => datosEquipo("convocatorias.json");
export const cargarEmpresas = () => datosEquipo("empresas.json", { opcional: true }).catch(() => null);

// Semáforo del radar. Si el JSON trae "veredicto" se usa ese; si no (datos antiguos), se deduce.
export function veredicto(c) {
  if (c.veredicto) return c.veredicto;
  if ((c.metodo || "").includes("pendiente_ia")) return "pendiente";
  if (c.puntuacion >= 70) return "presenta";
  if (c.puntuacion >= 50) return "mira";
  return "descarta";
}

export const LINEAS = {
  restauracion: "Restauración", conservacion: "Conservación", educacion: "Educación", agroambiental: "Agroambiental",
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const hoy = () => new Date(new Date().toDateString());
const aFecha = (f) => new Date(`${String(f).slice(0, 10)}T00:00:00`);

// Días que quedan desde hoy (negativo si ya pasó, null si no hay fecha).
export function diasHasta(f) {
  return f ? Math.ceil((aFecha(f) - hoy()) / 864e5) : null;
}
export function fechaCorta(f) {
  const d = aFecha(f);
  return `${d.getDate()} ${MESES[d.getMonth()]}.`;
}
export function euros(n) {
  return n ? n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : null;
}
export function hectareas(n) {
  return n ? `${Number(n).toLocaleString("es-ES", { maximumFractionDigits: 1 })} ha` : null;
}

// Estados de una convocatoria cuando ya se ha presentado, en el orden en que avanzan.
export const PASOS = ["presentada", "concedida", "plantar", "justificar", "terminada"];
export const ESTADOS_PRESENTADA = ["presentada", "subsanar", "concedida", "denegada", "plantar", "justificar", "terminada"];

// Convocatoria del radar + estado guardado por el equipo (API) = lo que pintan las pantallas.
// El estado guardado manda sobre el veredicto; sin estado, está "por revisar".
export function modelo(c, sol) {
  const plazo = c.fin || c.plazo_estimado || null;
  return {
    ...c,
    id: c.codigo,
    veredicto: veredicto(c),
    estado: sol ? sol.estado : "por_revisar",
    sol: sol || null,
    importe: euros(c.importe_max ?? c.presupuesto),
    importeEsPresupuesto: c.importe_max == null && Boolean(c.presupuesto),
    cubierto: c.porcentaje_financiado != null ? `El ${c.porcentaje_financiado} %` : null,
    plazo,
    plazoEstimado: !c.fin && Boolean(c.plazo_estimado),
    dias: diasHasta(plazo),
    // Avisos de vuestros criterios del Perfil (importe mínimo, cofinanciación, días): los pone el radar.
    avisos: c.avisos_criterios || [],
  };
}

// En qué pestaña de Convocatorias va.
export function etapaDe(a) {
  if (a.estado === "preparando") return "preparando";
  if (ESTADOS_PRESENTADA.includes(a.estado)) return "presentadas";
  if (a.estado === "descartada") return "descartadas";
  // por revisar / más tarde. Si el radar la descartó y el equipo no la ha tocado, va a descartadas.
  if (!a.sol && a.veredicto === "descarta") return "descartadas";
  return "revisar";
}
export const descartadaPor = (a) => (a.estado === "descartada" ? "equipo" : "radar");

// Empresas (empresas.json + estado de contacto). Sin estado guardado = "nueva".
export function modeloEmpresa(e, sol) {
  return { ...e, estado: sol ? sol.estado : "nueva", sol: sol || null };
}
export function etapaEmpresa(e) {
  if (e.estado === "descartada" || (!e.sol && e.accion === "descarta")) return "descartada";
  if (e.estado === "cerrada") return "cerrada";
  if (e.estado === "nueva") return "nueva";
  return "contactada"; // contactada, reunion, acuerdo
}

// Orden de la ruta de revisión: primero lo que más merece la pena y, a igualdad, lo que antes cierra.
const ORDEN_VEREDICTO = { presenta: 0, mira: 1, pendiente: 2, descarta: 3 };
export const ordenarRuta = (a, b) =>
  ORDEN_VEREDICTO[a.veredicto] - ORDEN_VEREDICTO[b.veredicto] || (a.plazo || "9999").localeCompare(b.plazo || "9999");
