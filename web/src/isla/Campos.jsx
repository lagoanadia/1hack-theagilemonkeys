import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Campos de texto que se ven enteros mientras se escribe.

// Textarea que crece con el texto (sin barra de desplazamiento).
export function AutoTexto({ value, onChange, minFilas = 2, className = 'i-in', ref: refFuera, ...resto }) {
  const ref = useRef(null)
  const poner = el => { ref.current = el; if (typeof refFuera === 'function') refFuera(el) }
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return <textarea ref={poner} className={`${className} auto-txt`} rows={minFilas} value={value} onChange={onChange} {...resto} />
}

// Lista «una por línea» como filas editables: Intro añade una fila debajo, Retroceso en una fila vacía la
// borra, ✕ la quita. Por fuera sigue siendo un texto con saltos de línea (lo que espera el formulario).
export function ListaLineas({ valor, onCambio, placeholder = 'Escribe y pulsa Intro', max = 300 }) {
  const filas = (valor || '').split('\n')
  const refs = useRef([])
  const [foco, setFoco] = useState(null)
  useEffect(() => {
    if (foco === null) return
    const el = refs.current[foco]
    if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n) }
    setFoco(null)
  }, [foco])
  const poner = l => onCambio(l.join('\n'))
  const cambiar = (i, t) => poner(filas.map((f, k) => (k === i ? t.replace(/\n/g, ' ') : f)))
  const tecla = (e, i) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      poner([...filas.slice(0, i + 1), '', ...filas.slice(i + 1)]); setFoco(i + 1)
    } else if (e.key === 'Backspace' && filas[i] === '' && filas.length > 1) {
      e.preventDefault()
      poner(filas.filter((_, k) => k !== i)); setFoco(Math.max(0, i - 1))
    }
  }
  const quitar = i => { poner(filas.length > 1 ? filas.filter((_, k) => k !== i) : ['']); setFoco(Math.max(0, i - 1)) }
  const llenas = filas.filter(f => f.trim()).length
  return (
    <div className="ll">
      {filas.map((f, i) => (
        <div key={i} className="ll-fila">
          <span className="ll-pt" aria-hidden="true" />
          <AutoTexto minFilas={1} className="ll-in" maxLength={max} value={f} placeholder={i === filas.length - 1 ? placeholder : ''}
            aria-label={`Línea ${i + 1}`} onChange={e => cambiar(i, e.target.value)} onKeyDown={e => tecla(e, i)}
            ref={el => { refs.current[i] = el }} />
          {(f || filas.length > 1) && <button type="button" className="ll-x" aria-label={`Quitar la línea ${i + 1}`} onClick={() => quitar(i)}>×</button>}
        </div>
      ))}
      <div className="ll-pie">
        <button type="button" className="ll-mas" onClick={() => { poner([...filas, '']); setFoco(filas.length) }}>+ Añadir línea</button>
        <small>{llenas} {llenas === 1 ? 'línea' : 'líneas'}</small>
      </div>
    </div>
  )
}

// Calendario con la estética de la web (en vez del selector de fecha del navegador). valor: 'AAAA-MM-DD' o ''.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fechaBonita = v => (v ? new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
export function Fecha({ valor, onCambio, etiqueta = 'Elegir fecha', placeholder = 'Elegir fecha', className = 'i-in fecha-btn', boton, alinear = 'izq' }) {
  const [abierto, setAbierto] = useState(false)
  const base = valor ? new Date(`${valor.slice(0, 10)}T00:00:00`) : new Date()
  const [mes, setMes] = useState(new Date(base.getFullYear(), base.getMonth(), 1))
  const caja = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = e => { if (!caja.current?.contains(e.target)) setAbierto(false) }
    const tecla = e => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])
  const abrir = () => { setMes(new Date(base.getFullYear(), base.getMonth(), 1)); setAbierto(!abierto) }
  const elegir = v => { setAbierto(false); onCambio(v) }
  const hoy = ymd(new Date())
  const hueco = (mes.getDay() + 6) % 7  // la semana empieza en lunes
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const celdas = [...Array(hueco).fill(null), ...Array.from({ length: dias }, (_, i) => ymd(new Date(mes.getFullYear(), mes.getMonth(), i + 1)))]
  const mover = n => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1))
  return (
    <div className="fch" ref={caja}>
      <button type="button" className={`${className} ${abierto ? 'on' : ''}`} aria-haspopup="dialog" aria-expanded={abierto} aria-label={etiqueta} title={valor ? fechaBonita(valor) : etiqueta} onClick={abrir}>
        {boton || <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          <span className={valor ? '' : 'vacio'}>{valor ? fechaBonita(valor) : placeholder}</span></>}
      </button>
      {abierto && (
        <div className={`fch-pop ${alinear}`} role="dialog" aria-label={etiqueta}>
          <div className="fch-cab">
            <button type="button" aria-label="Mes anterior" onClick={() => mover(-1)}>‹</button>
            <b>{MESES[mes.getMonth()]} {mes.getFullYear()}</b>
            <button type="button" aria-label="Mes siguiente" onClick={() => mover(1)}>›</button>
          </div>
          <div className="fch-sem" aria-hidden="true">{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => <span key={d}>{d}</span>)}</div>
          <div className="fch-dias">
            {celdas.map((v, i) => v === null ? <span key={`h${i}`} /> : (
              <button type="button" key={v} className={`${v === valor?.slice(0, 10) ? 'sel' : ''} ${v === hoy ? 'hoy' : ''}`} aria-pressed={v === valor?.slice(0, 10)} onClick={() => elegir(v)}>{Number(v.slice(8))}</button>
            ))}
          </div>
          <div className="fch-pie">
            <button type="button" onClick={() => elegir(hoy)}>Hoy</button>
            {valor && <button type="button" className="quitar" onClick={() => elegir('')}>Quitar</button>}
          </div>
        </div>
      )}
    </div>
  )
}
