// Datos de EJEMPLO para lo que el backend aún no tiene. Las pantallas que los usan lo muestran
// con la etiqueta «Ejemplo». No son datos reales ni se envían a ningún sitio (solo localStorage).
import { useEffect, useState } from 'react'

// TODO backend: reglas aprendidas. Hace falta (1) detectar patrones en los motivos de descarte
// (GET /api/motivos ya da los usos de cada motivo), (2) guardar las reglas del equipo (crear,
// editar, quitar) y (3) que el radar las aplique al puntuar (ocultar, marcar «Mirad antes», avisar).
export const REGLA = {
  'No es reforestación': ['Las que no son de plantar no os interesan', 'Ocultarlas'],
  'Piden poner mucho dinero': ['Descartáis las que piden poner más del 20 %', 'Marcarlas «Mirad antes»'],
  'Plazo muy corto': ['Con plazos muy cortos soléis dejarlas', 'Avisadme antes'],
  'Fuera de nuestra zona': ['Las de fuera de Madrid no os interesan', 'Ocultarlas'],
  'Importe pequeño': ['Los importes pequeños no os compensan', 'Marcarlas «Mirad antes»'],
  'Sin capacidad ahora': ['Ahora mismo no tenéis capacidad para más', 'Avisadme antes'],
}
const KEY = 'radar-ejemplo-reglas-v1'
const BASE = {
  historial: ['Piden poner mucho dinero', 'Piden poner mucho dinero', 'Piden poner mucho dinero', 'Fuera de nuestra zona', 'Fuera de nuestra zona', 'Fuera de nuestra zona', 'Plazo muy corto'],
  reglas: { 'Fuera de nuestra zona': 'si' },
  propias: [{ id: 1, texto: 'No nos interesan las que exigen aval bancario', autor: 'Marta', fecha: 'hace 2 días' }],
}
export function useReglasEjemplo() {
  const [st, setSt] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.historial ? s : BASE } catch { return BASE }
  })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(st)) } catch { /* sin almacenamiento */ } }, [st])
  return [st, setSt]
}
export const olvidarEjemplos = () => {
  try { Object.keys(localStorage).filter(k => k.startsWith('radar-ejemplo-')).forEach(k => localStorage.removeItem(k)) } catch { /* nada que borrar */ }
}
