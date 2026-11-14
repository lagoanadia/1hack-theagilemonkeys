import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'

// Qué documentos pide una convocatoria y cuántos tenéis ya (compartido por «Preparar papeles» y las tarjetas).
export const LISTA_GENERAL = [
  { nombre: 'Estatutos inscritos', tipo: 'estatutos', obligatorio: true },
  { nombre: 'CIF de la entidad', tipo: 'cif', obligatorio: true },
  { nombre: 'Acreditación del representante legal', tipo: 'representante_legal', obligatorio: true },
  { nombre: 'Certificado de estar al corriente con Hacienda', tipo: 'cert_hacienda', obligatorio: true },
  { nombre: 'Certificado de estar al corriente con la Seguridad Social', tipo: 'cert_seg_social', obligatorio: true },
  { nombre: 'Memoria del proyecto', tipo: 'memoria_proyecto', obligatorio: true },
  { nombre: 'Presupuesto del proyecto', tipo: 'presupuesto', obligatorio: true },
]
const quitarTildes = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const clave = r => `${r.tipo}-${quitarTildes(r.nombre).replace(/[^a-z0-9]+/g, '-')}`.slice(0, 80).replace(/-+$/, '')
export const requisitos = a => (a.documentos_requeridos?.length ? a.documentos_requeridos : LISTA_GENERAL).map(r => ({ ...r, clave: clave(r) }))

// Documentos subidos / documentos que pide la convocatoria, de las convocatorias de la lista.
// → { [codigo]: {hechos, total} } (aún sin llegar = no está en el objeto).
export function useProgresoDocs(lista) {
  const [datos, setDatos] = useState({})
  const ids = useMemo(() => lista.map(a => a.id).join('|'), [lista])
  useEffect(() => {
    let vivo = true
    lista.forEach(a => {
      api(`/solicitudes/convocatoria/${a.id}/documentos`).then(filas => {
        if (!vivo) return
        const por = Object.fromEntries(filas.map(x => [x.requisito, x]))
        const obl = requisitos(a).filter(r => r.obligatorio !== false && por[r.clave]?.estado !== 'no_aplica')
        setDatos(d => ({ ...d, [a.id]: { hechos: obl.filter(r => por[r.clave]?.documento_id).length, total: obl.length } }))
      }).catch(() => {})
    })
    return () => { vivo = false }
  }, [ids]) // eslint-disable-line react-hooks/exhaustive-deps
  return datos
}
