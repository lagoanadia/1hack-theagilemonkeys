// Estado de los tableros (secciones tipo Notion): En proceso, Presentado y Descartadas de Convocatorias,
// y la fase de contacto de Empresas. Un solo JSON compartido por el equipo:
//   GET/PUT /api/tablero  (guardado en D1) con copia en localStorage por si no hay red.
//
// {
//   tableros: { [clave]: { secs: [{id, nombre}], def: {nombre}, pos: {itemId: seccionId},
//                          orden: {seccionId: [itemId…]}, plegadas: {seccionId: bool}, colores: {seccionId: color} } },
//   vistas:    { [empresaId]: 'AAAA-MM-DD' }   primer día que el equipo vio cada empresa («Nuevas de hoy»)
//   contactos: { [empresaId]: { col, envios: [{plantilla, fecha}] } }   fase 2 de Empresas
// }
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorSesion, api } from './api.js'

const LS = 'radar-reforesta-tablero'
const leerLocal = () => { try { return JSON.parse(localStorage.getItem(LS)) || null } catch { return null } }
const guardarLocal = d => { try { localStorage.setItem(LS, JSON.stringify(d)) } catch { /* sin almacenamiento */ } }

export const COLORES = ['gris', 'navy', 'verde', 'ambar', 'azul', 'malva']
export const COLOR_NOMBRE = { gris: 'Gris', navy: 'Azul marino', verde: 'Verde', ambar: 'Ámbar', azul: 'Cielo', malva: 'Malva' }
const VACIO = { tableros: {}, vistas: {}, contactos: {} }
const normal = d => ({ ...VACIO, ...(d || {}), tableros: { ...(d?.tableros || {}) }, vistas: { ...(d?.vistas || {}) }, contactos: { ...(d?.contactos || {}) } })

export function useTablero(salir) {
  const [datos, setDatos] = useState(() => normal(leerLocal()))
  const [listo, setListo] = useState(false)
  const ref = useRef(datos)
  const sucio = useRef(false)

  useEffect(() => {
    let vivo = true
    api('/tablero').then(r => {
      if (!vivo) return
      // Lo guardado en el servidor manda, salvo que ya se haya tocado algo mientras cargaba.
      if (r.datos && !sucio.current) { ref.current = normal(r.datos); setDatos(ref.current); guardarLocal(ref.current) }
      setListo(true)
    }).catch(e => { if (e instanceof ErrorSesion) salir?.(); else setListo(true) })
    return () => { vivo = false }
  }, [salir])

  // Guarda 700 ms después del último cambio.
  useEffect(() => {
    if (!listo || !sucio.current) return
    const t = setTimeout(() => {
      sucio.current = false
      api('/tablero', { metodo: 'PUT', datos: { datos: ref.current } }).catch(e => { if (e instanceof ErrorSesion) salir?.() })
    }, 700)
    return () => clearTimeout(t)
  }, [datos, listo, salir])

  const cambiarRaiz = useCallback(fn => {
    const nuevo = fn(ref.current)
    if (nuevo === ref.current) return
    ref.current = nuevo; sucio.current = true
    setDatos(nuevo); guardarLocal(nuevo)
  }, [])
  const editar = useCallback((clave, fn) => cambiarRaiz(d => ({ ...d, tableros: { ...d.tableros, [clave]: fn(d.tableros[clave] || {}) } })), [cambiarRaiz])
  return useMemo(() => ({ datos, listo, cambiarRaiz, editar }), [datos, listo, cambiarRaiz, editar])
}

// Reparte la lista en las secciones: primero lo ordenado a mano, después el resto por `cmp`.
// `secs` y `posDe` solo se pasan cuando las secciones salen de los datos (Descartadas por motivo).
export function disponer(b, lista, cmp, { secs, posDe } = {}) {
  const todas = secs || [{ id: 'def', nombre: b.def?.nombre || 'Por defecto', fija: true }, ...(b.secs || [])]
  const ids = new Set(todas.map(s => s.id))
  const donde = a => { const s = posDe ? posDe(a) : b.pos?.[a.id]; return ids.has(s) ? s : todas[0].id }
  const por = Object.fromEntries(todas.map(s => [s.id, []]))
  const porId = new Map(lista.map(a => [a.id, a]))
  const puestos = new Set()
  for (const s of todas) for (const id of b.orden?.[s.id] || []) {
    const a = porId.get(id)
    if (a && !puestos.has(id) && donde(a) === s.id) { por[s.id].push(a); puestos.add(id) }
  }
  for (const a of lista.filter(x => !puestos.has(x.id)).sort(cmp)) por[donde(a)].push(a)
  return todas.map(s => ({ ...s, color: b.colores?.[s.id] || s.color || 'gris', items: por[s.id], plegada: b.plegadas?.[s.id] ?? Boolean(s.plegadaInicial) }))
}

// Mueve `id` a la posición `idx` de la sección `dest` (idx cuenta sin la propia tarjeta).
export function moverEn(b, arr, id, dest, idx) {
  const orden = {}, visibles = new Set(arr.flatMap(s => s.items.map(a => a.id)))
  for (const s of arr) orden[s.id] = s.items.map(a => a.id).filter(x => x !== id)
  orden[dest].splice(Math.max(0, Math.min(idx, orden[dest].length)), 0, id)
  // Lo que no se ve ahora (buscador) conserva su sitio al final.
  for (const s of arr) orden[s.id].push(...(b.orden?.[s.id] || []).filter(x => !visibles.has(x) && !orden[s.id].includes(x)))
  return { ...b, orden, pos: { ...(b.pos || {}), [id]: dest } }
}

// Todo lo que necesita <Tablero> para un tablero guardado en local (En proceso, Presentado, fase 2).
export function useSecciones(tab, clave, lista, cmp, extra = {}) {
  const guardado = tab.datos.tableros[clave]
  const secciones = useMemo(() => disponer(guardado || {}, lista, cmp, extra.disponer), [guardado, lista, cmp, extra.disponer])
  const ed = fn => tab.editar(clave, fn)
  return {
    secciones,
    onColor: (id, c) => ed(x => ({ ...x, colores: { ...(x.colores || {}), [id]: c } })),
    onPlegar: id => ed(x => ({ ...x, plegadas: { ...(x.plegadas || {}), [id]: !(secciones.find(s => s.id === id)?.plegada) } })),
    onReordenar: (id, dest, idx) => ed(x => moverEn(x, secciones, id, dest, idx)),
    ...(extra.fija ? {} : {
      onNueva: nombre => ed(x => ({ ...x, secs: [...(x.secs || []), { id: `s${Date.now().toString(36)}`, nombre }] })),
      onRenombrar: (id, nombre) => ed(x => id === 'def' ? { ...x, def: { ...(x.def || {}), nombre } } : { ...x, secs: (x.secs || []).map(s => s.id === id ? { ...s, nombre } : s) }),
      // Al borrar una sección, sus tarjetas vuelven a «Por defecto».
      onBorrar: id => ed(x => ({ ...x, secs: (x.secs || []).filter(s => s.id !== id), pos: Object.fromEntries(Object.entries(x.pos || {}).filter(([, s]) => s !== id)), orden: { ...(x.orden || {}), [id]: undefined } })),
    }),
  }
}
