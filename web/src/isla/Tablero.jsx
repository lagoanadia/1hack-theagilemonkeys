import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { COLORES, COLOR_NOMBRE } from '../tablero.js'

// Tablero de secciones tipo Notion: secciones con nombre y color, plegables, y tarjetas que se arrastran
// de una a otra. Solo HTML5 nativo, y también funciona con teclado:
//   · Ratón: arrastrar la tarjeta. Se «levanta» (sombra y giro), la sección de destino se resalta
//     y un hueco punteado marca dónde caerá.
//   · Teclado: en el asa de la tarjeta (⠿) Intro la levanta, ← → la mueven, ↑ ↓ cambian de sección,
//     Intro la suelta y Esc cancela. Lo que pasa se anuncia en voz alta (aria-live).
//
// Props
//   secciones   [{id, nombre, color, items, plegada, fija?, noSoltar?, nota?}]  (ver tablero.js → disponer)
//   card        (item, sec) => nodo con el contenido de la tarjeta
//   onMover     (itemId, destId, idx, origenId) se llama al soltar (por defecto onReordenar)
//   onReordenar (itemId, destId, idx) guarda el orden
//   onColor / onPlegar / onNueva / onRenombrar / onBorrar: si no se pasan, esa opción no aparece
//   izq         nodo a la izquierda de la barra (filtros, ayuda)
//   ocultarVacias  no enseña las secciones sin tarjetas (salvo mientras se arrastra, para poder soltar en ellas)
//   layout      'franjas' (por defecto: secciones apiladas con tarjetas en rejilla) | 'columnas'
export default function Tablero({ secciones, card, onMover, onReordenar, onColor, onPlegar, onNueva, onRenombrar, onBorrar, izq, layout = 'franjas', tope = 12, ocultarVacias = false, vacio = 'Arrastrad una tarjeta aquí', nombreItem = a => a.titulo }) {
  const [drag, setDrag] = useState(null)       // {id, from, teclado}
  const [over, setOver] = useState(null)       // {sec, idx}
  const [menu, setMenu] = useState(null)       // id de sección con el menú abierto
  const [editando, setEditando] = useState(null)
  const [creando, setCreando] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [topes, setTopes] = useState({})
  const [anuncio, setAnuncio] = useState('')
  const [foco, setFoco] = useState(null)
  const huecoRef = useRef(null)
  const dragRef = useRef(null), overRef = useRef(null)   // copias síncronas: los eventos de arrastre llegan más rápido que el render
  const ponDrag = v => { dragRef.current = v; setDrag(v) }
  const ponOver = f => { overRef.current = typeof f === 'function' ? f(overRef.current) : f; setOver(overRef.current) }
  const col = layout === 'columnas'

  useEffect(() => { // cierra el menú al pulsar fuera
    if (!menu) return
    const f = e => { if (!e.target.closest?.('.i-sec-menu,.i-sec-mb')) setMenu(null) }
    addEventListener('pointerdown', f)
    return () => removeEventListener('pointerdown', f)
  }, [menu])
  useEffect(() => { if (foco) { document.querySelector(`[data-grip="${CSS.escape(String(foco))}"]`)?.focus(); setFoco(null) } }, [foco])
  useEffect(() => { if (drag?.teclado) huecoRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [over, drag])

  const nombreSec = id => secciones.find(s => s.id === id)?.nombre
  const sinArrastrada = s => s.items.filter(a => a.id !== dragRef.current?.id)
  const soltar = () => {
    const d = dragRef.current, o = overRef.current
    if (d && o) (onMover || onReordenar)?.(d.id, o.sec, o.idx, d.from)
    if (d?.teclado && o) { setAnuncio(`Soltada en «${nombreSec(o.sec)}»`); setFoco(d.id) }
    ponDrag(null); ponOver(null)
  }

  // --- ratón
  const empezar = (e, a, sec) => {
    const el = e.currentTarget, r = el.getBoundingClientRect(), g = el.cloneNode(true)
    g.classList.add('i-ghost'); g.style.width = `${r.width}px`
    ;(el.closest('.isla') || document.body).appendChild(g)
    e.dataTransfer.setData('text/plain', String(a.id)); e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setDragImage(g, Math.min(e.clientX - r.left, r.width - 20), Math.min(e.clientY - r.top, 80))
    setTimeout(() => g.remove(), 0)
    dragRef.current = { id: a.id, from: sec.id }
    requestAnimationFrame(() => { if (dragRef.current) setDrag(dragRef.current) })
  }
  const indiceEn = (e, cuerpo) => {
    const hijos = [...cuerpo.querySelectorAll(':scope > .i-tc')].filter(x => !x.classList.contains('lev'))
    const { clientX: x, clientY: y } = e
    for (let i = 0; i < hijos.length; i++) {
      const r = hijos[i].getBoundingClientRect()
      if (y < r.bottom && (y < r.top || (col ? y < r.top + r.height / 2 : x < r.left + r.width / 2))) return i
    }
    return hijos.length
  }
  const sobre = (e, sec, fin) => {
    if (!dragRef.current || sec.noSoltar) return
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    const idx = fin ? sinArrastrada(sec).length : indiceEn(e, e.currentTarget)
    ponOver(o => (o && o.sec === sec.id && o.idx === idx ? o : { sec: sec.id, idx }))
    const cont = e.currentTarget.closest('.isla')
    if (cont) { if (e.clientY < 90) cont.scrollBy(0, -18); else if (e.clientY > innerHeight - 90) cont.scrollBy(0, 18) }
  }
  const salida = (e, sec) => { if (!e.currentTarget.contains(e.relatedTarget)) ponOver(o => (o && o.sec === sec.id ? null : o)) }

  // --- teclado (asa de la tarjeta)
  const tecla = (e, a, sec) => {
    const k = e.key
    const drag = dragRef.current, over = overRef.current
    if (!drag) {
      if (k === 'Enter' || k === ' ') {
        e.preventDefault()
        const idx = sec.items.findIndex(x => x.id === a.id)
        ponDrag({ id: a.id, from: sec.id, teclado: true }); ponOver({ sec: sec.id, idx })
        setAnuncio(`Tarjeta levantada. Está en «${sec.nombre}», posición ${idx + 1} de ${sec.items.length}. Flechas izquierda y derecha para moverla, arriba y abajo para cambiar de sección, Intro para soltarla, Escape para cancelar.`)
      }
      return
    }
    if (!drag.teclado) return
    if (k === 'Escape') { e.preventDefault(); ponDrag(null); ponOver(null); setAnuncio('Movimiento cancelado'); return }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); soltar(); return }
    const posibles = secciones.filter(s => !s.noSoltar && (!s.plegada || s.id === over?.sec))
    const slots = posibles.flatMap(s => Array.from({ length: sinArrastrada(s).length + 1 }, (_, i) => ({ sec: s.id, idx: i })))
    const i = slots.findIndex(s => s.sec === over?.sec && s.idx === over?.idx)
    let nuevo = null
    if (k === 'ArrowLeft') nuevo = slots[Math.max(0, i - 1)]
    else if (k === 'ArrowRight') nuevo = slots[Math.min(slots.length - 1, i + 1)]
    else if (k === 'ArrowUp' || k === 'ArrowDown') {
      const j = posibles.findIndex(s => s.id === over?.sec), s = posibles[Math.max(0, Math.min(posibles.length - 1, j + (k === 'ArrowDown' ? 1 : -1)))]
      nuevo = { sec: s.id, idx: Math.min(over?.idx ?? 0, sinArrastrada(s).length) }
    } else return
    e.preventDefault()
    if (nuevo) { ponOver(nuevo); setAnuncio(`«${nombreSec(nuevo.sec)}», posición ${nuevo.idx + 1} de ${sinArrastrada(secciones.find(s => s.id === nuevo.sec)).length + 1}`) }
  }

  const cabecera = sec => {
    const abierta = !sec.plegada
    return (
      <header className="i-sec-h" onDragOver={e => sobre(e, sec, true)} onDragLeave={e => salida(e, sec)} onDrop={e => { e.preventDefault(); soltar() }}>
        {!col && onPlegar && <button className="i-sec-ch" aria-expanded={abierta} aria-label={`${abierta ? 'Plegar' : 'Desplegar'} ${sec.nombre}`} onClick={() => onPlegar(sec.id)}><Icon n="keyD" s={16} w={2.6} /></button>}
        <i className="dot" aria-hidden="true" />
        {editando === sec.id ? (
          <input className="i-sec-in" autoFocus maxLength={40} defaultValue={sec.nombre} aria-label="Nombre de la sección"
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== sec.nombre) onRenombrar(sec.id, v); setEditando(null) }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = sec.nombre; e.target.blur() } }} />
        ) : <h3 className="nm" title={sec.nombre} onDoubleClick={() => onRenombrar && setEditando(sec.id)}>{sec.nombre}</h3>}
        <span className="n" aria-label={`${sec.items.length} tarjetas`}>{sec.items.length}</span>
        {sec.nota && <span className="nota">{sec.nota}</span>}
        <span style={{ flex: 1 }} />
        {(onColor || onRenombrar || (onBorrar && !sec.fija)) && (
          <span className="i-sec-m">
            <button className="i-sec-mb" aria-label={`Opciones de ${sec.nombre}`} aria-expanded={menu === sec.id} onClick={() => { setMenu(menu === sec.id ? null : sec.id); setConfirmar(null) }}><Icon n="dot3" s={20} w={3} /></button>
            {menu === sec.id && (
              <div className="i-sec-menu" role="menu">
                {onRenombrar && <button role="menuitem" onClick={() => { setEditando(sec.id); setMenu(null) }}>Cambiar nombre</button>}
                {onColor && <div className="cols" role="group" aria-label="Color de la sección">{COLORES.map(c => <button key={c} className={`sw c-${c} ${sec.color === c ? 'on' : ''}`} aria-label={COLOR_NOMBRE[c]} aria-pressed={sec.color === c} title={COLOR_NOMBRE[c]} onClick={() => onColor(sec.id, c)} />)}</div>}
                {onBorrar && !sec.fija && (confirmar === sec.id
                  ? <div className="conf"><span>Las tarjetas pasan a «{secciones[0].nombre}».</span><button className="no" role="menuitem" onClick={() => { onBorrar(sec.id); setMenu(null) }}>Sí, borrar</button></div>
                  : <button className="no" role="menuitem" onClick={() => setConfirmar(sec.id)}>Borrar sección</button>)}
              </div>
            )}
          </span>
        )}
      </header>
    )
  }

  return (
    <div className={`i-bd ${col ? 'col' : ''}`}>
      <div className="i-bar">
        <div className="izq">{izq}</div>
        {onNueva && (creando
          ? <input className="i-sec-in nueva" autoFocus maxLength={40} placeholder="Nombre de la sección" aria-label="Nombre de la nueva sección"
              onBlur={e => { const v = e.target.value.trim(); if (v) onNueva(v); setCreando(false) }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = ''; e.target.blur() } }} />
          : <button className="i-btn sm i-nueva" onClick={() => setCreando(true)}><Icon n="plus" s={17} w={2.6} />Nueva sección</button>)}
      </div>
      <div className="i-sr" role="status" aria-live="assertive">{anuncio}</div>
      <div className="i-secs">
        {secciones.filter(sec => !ocultarVacias || sec.items.length > 0 || (drag && !sec.noSoltar)).map(sec => {
          const abierta = col || !sec.plegada, resaltada = over?.sec === sec.id && drag
          const lim = topes[sec.id] || tope, hueco = resaltada ? over.idx : -1
          const huecoNodo = <div key="hueco" className="i-tc-hueco" ref={huecoRef} aria-hidden="true" />
          const filas = []
          let k = 0
          sec.items.forEach((a, i) => {
            if (i >= lim && a.id !== drag?.id) return
            const arrastrada = drag?.id === a.id
            if (!arrastrada) { if (k === hueco) filas.push(huecoNodo); k++ }
            filas.push(
              <div key={a.id} className={`i-tc ${arrastrada ? 'lev' : ''}`} data-id={a.id}
                draggable={!arrastrada || undefined}
                onPointerDown={e => { e.currentTarget.draggable = !e.target.closest('input,select,textarea,a,button:not(.i-grip)') }}
                onDragStart={e => empezar(e, a, sec)} onDragEnd={() => { ponDrag(null); ponOver(null) }}>
                <button className="i-grip" data-grip={a.id} aria-pressed={drag?.id === a.id && drag.teclado ? true : undefined}
                  aria-label={`Mover «${nombreItem(a).slice(0, 60)}». Intro para levantarla, flechas para moverla.`} title="Arrastrar para mover"
                  onKeyDown={e => tecla(e, a, sec)} onBlur={() => { if (dragRef.current?.teclado && dragRef.current.id === a.id) { ponDrag(null); ponOver(null) } }}>
                  <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">{[3, 9, 15].map(y => [3, 11].map(x => <circle key={`${x}${y}`} cx={x} cy={y} r="1.5" />))}</svg>
                </button>
                {card(a, sec)}
              </div>,
            )
          })
          if (k === hueco || (hueco > k && resaltada)) filas.push(huecoNodo)
          const ocultas = sec.items.length - Math.min(sec.items.length, lim)
          return (
            <section key={sec.id} className={`i-sec c-${sec.color} ${resaltada ? 'over' : ''} ${sec.noSoltar && drag ? 'cerrada' : ''} ${abierta ? '' : 'plegada'}`} aria-label={sec.nombre}>
              {cabecera(sec)}
              {abierta ? (
                <div className="i-sec-b" onDragOver={e => sobre(e, sec)} onDragLeave={e => salida(e, sec)} onDrop={e => { e.preventDefault(); soltar() }}>
                  {filas}
                  {sec.items.length === 0 && !resaltada && <div className="i-sec-v">{sec.noSoltar ? 'Nada por aquí' : vacio}</div>}
                  {ocultas > 0 && <button className="i-btn sm i-mas" onClick={() => setTopes({ ...topes, [sec.id]: lim + 12 })}>Ver más ({ocultas})</button>}
                </div>
              ) : resaltada && <div className="i-sec-v suelta">Soltar aquí</div>}
            </section>
          )
        })}
      </div>
    </div>
  )
}
