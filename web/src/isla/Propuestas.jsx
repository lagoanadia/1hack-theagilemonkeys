import { useCallback, useEffect, useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { island } from './lp.js'
import { ErrorSesion, api } from '../api.js'
import { euros, hectareas } from '../datos.js'

// Propuestas del equipo: GET/POST /api/proyectos, DELETE /api/proyectos/:id (retirar) y
// reservas de empresas en GET /api/interesados (llegan de POST /api/proyectos/:id/interes).
// TODO backend: editar un proyecto, borrador/publicado, plazas libres y el estado de cada reserva
// (nueva / contestada / confirmada). Hoy un proyecto está publicado hasta que se retira.
const VACIA = { titulo: '', lugar: '', descripcion: '', hectareas: '', presupuesto: '' }

export default function Propuestas({ top, setToast, salir }) {
  const [proy, setProy] = useState(null)
  const [reservas, setReservas] = useState(null)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const fallo = useCallback(e => { if (e instanceof ErrorSesion) salir(); else setError(e.message) }, [salir])
  const recargar = useCallback(() => Promise.all([api('/proyectos'), api('/interesados')])
    .then(([p, r]) => { setProy(p); setReservas(r); setError('') }).catch(fallo), [fallo])
  useEffect(() => { recargar() }, [recargar])

  const crear = async e => {
    e.preventDefault()
    setGuardando(true)
    try {
      await api('/proyectos', { metodo: 'POST', datos: { ...form, hectareas: form.hectareas || null, presupuesto: form.presupuesto || null } })
      setForm(null); setToast({ texto: 'Propuesta publicada en vuestra página' })
      await recargar()
    } catch (err) { if (err instanceof ErrorSesion) salir(); else setToast({ texto: `No se pudo guardar: ${err.message}` }) }
    setGuardando(false)
  }
  const retirar = async p => {
    if (!confirm(`¿Retirar «${p.titulo}» de la página pública?`)) return
    try { await api(`/proyectos/${p.id}`, { metodo: 'DELETE' }); setToast({ texto: 'Propuesta retirada de la página pública' }); await recargar() }
    catch (err) { if (err instanceof ErrorSesion) salir(); else setToast({ texto: `No se pudo retirar: ${err.message}` }) }
  }
  const borrarReserva = async r => {
    if (!confirm(`¿Borrar la reserva de «${r.empresa}»? No se puede deshacer.`)) return
    try { await api(`/interesados/${r.id}`, { metodo: 'DELETE' }); setToast({ texto: 'Reserva borrada' }); await recargar() }
    catch (err) { if (err instanceof ErrorSesion) salir(); else setToast({ texto: `No se pudo borrar: ${err.message}` }) }
  }
  const campo = k => ({ value: form[k], onChange: e => setForm({ ...form, [k]: e.target.value }) })
  return (
    <>
      {top('Propuestas')}
      <div className="i-head">
        <div><h2>Lo que ofrecéis a las empresas</h2><p className="i-sub" style={{ margin: '2px 0 0' }}>Publicad propuestas; las empresas las ven en vuestra página y reservan sin compromiso.</p></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a className="i-btn sm" href="#/propuestas" target="_blank" rel="noreferrer"><Icon n="ext" s={17} />Ver página pública</a>
          <button className="i-btn p sm" onClick={() => setForm(VACIA)}><Icon n="plus" s={17} w={2.4} />Nueva propuesta</button>
        </div>
      </div>
      {error && <p className="i-err" role="alert">{error} <button className="i-link" onClick={recargar}>Reintentar</button></p>}
      {form && (
        <form className="i-card i-form" onSubmit={crear}>
          <b>Nueva propuesta</b>
          <input className="i-in" required maxLength={150} placeholder="Título · ej. Plantación de 1 ha" {...campo('titulo')} />
          <input className="i-in" maxLength={150} placeholder="Dónde · ej. Sierra de Guadarrama" {...campo('lugar')} />
          <input className="i-in" maxLength={2000} placeholder="Qué incluye · ej. Plantas, plantación y seguimiento" {...campo('descripcion')} />
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="i-in" type="number" min="0" step="0.1" placeholder="Hectáreas" {...campo('hectareas')} />
            <input className="i-in" type="number" min="0" step="100" placeholder="Presupuesto (€)" {...campo('presupuesto')} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button className="i-btn p sm" type="submit" disabled={guardando}>{guardando ? 'Publicando…' : 'Publicar'}</button><button className="i-btn sm" type="button" onClick={() => setForm(null)}>Cancelar</button></div>
        </form>
      )}
      {!proy && !error && <p className="i-sub">Cargando propuestas…</p>}
      {proy && proy.length === 0 && !form && <div className="i-card i-empty" style={{ margin: '16px 0 14px' }}>Aún no hay propuestas publicadas. Pulsad «Nueva propuesta».</div>}
      <div className="i-grid3" style={{ margin: '16px 0 14px' }}>
        {(proy || []).map((p, i) => {
          const n = Math.max(3, Math.min(8, Math.round((p.hectareas || 4) / 1.7)))
          const k = (reservas || []).filter(r => r.proyecto_id === p.id).length
          return (
            <div key={p.id} className="i-card" style={{ padding: '12px 14px 16px', display: 'flex', flexDirection: 'column' }}>
              <div className="i-art"><Svg html={island(220, 150, n, n, 20 + i)} /></div>
              <div className="i-head" style={{ margin: '10px 0 4px', alignItems: 'center' }}><span className="i-tag" style={{ background: 'var(--gr-l)', color: 'var(--gr-d)' }}>Publicada</span><span className="i-tag">{k === 0 ? 'Sin reservas' : k === 1 ? '1 reserva' : `${k} reservas`}</span></div>
              <b style={{ fontSize: 18 }}>{p.titulo}</b>
              <div style={{ color: 'var(--mut)', fontSize: 14 }}>{[p.lugar, hectareas(p.hectareas), euros(p.presupuesto), p.descripcion].filter(Boolean).join(' · ')}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 12 }}>
                <button className="i-btn sm" style={{ flex: 1, height: 42 }} onClick={() => retirar(p)}>Retirar</button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="i-card" style={{ padding: '14px 20px' }}>
        <div className="i-head" style={{ alignItems: 'center' }}><b style={{ fontSize: 18 }}>Reservas recibidas{reservas ? ` · ${reservas.length}` : ''}</b></div>
        {reservas && reservas.length === 0 && <p style={{ color: 'var(--mut)', padding: '10px 0' }}>Aún no hay reservas. Compartid vuestra página pública con empresas.</p>}
        {(reservas || []).map(r => {
          const mail = (r.contacto.match(/[^\s·<>]+@[^\s·<>]+/) || [])[0]
          return (
            <div key={r.id} className="i-rs i-rs3">
              <div><b>{r.empresa}</b><small>{r.contacto}</small>{r.mensaje && <small>«{r.mensaje}»</small>}</div>
              <div>{r.proyecto || '—'}<small>{new Date(r.creado).toLocaleDateString('es-ES')}</small></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {mail && <a className="i-btn sm" style={{ height: 40 }} href={`mailto:${mail}?subject=${encodeURIComponent('Reforesta · ' + (r.proyecto || 'vuestra reserva'))}`}><Icon n="send" s={15} />Escribir</a>}
                <button className="i-btn sm" style={{ height: 40 }} onClick={() => borrarReserva(r)} aria-label={`Borrar la reserva de ${r.empresa}`}>Borrar</button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
