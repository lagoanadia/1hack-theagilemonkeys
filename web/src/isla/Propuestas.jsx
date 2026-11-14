import { useMemo, useCallback, useEffect, useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { island } from './lp.js'
import { mapaLugar } from './mapa.js'
import Desplegable from './Desplegable.jsx'
import { ErrorSesion, api } from '../api.js'
import { euros, hectareas } from '../datos.js'

// Propuestas del equipo: GET /api/proyectos?todas=1, POST (crear), PUT /api/proyectos/:id (publicar,
// ocultar, editar), DELETE (retirar). Reservas: GET /api/interesados, PUT /api/interesados/:id {estado}.
// Una reserva ocupa plaza salvo que esté descartada; sin plazas, la propuesta sale como «Completa».
const VACIA = { titulo: '', lugar: '', tipo: 'plantacion', incluye: '', descripcion: '', hectareas: '', presupuesto: '', plazas: '' }
const TIPOS = { plantacion: 'Plantación', restauracion: 'Restauración', voluntariado: 'Voluntariado', otro: 'Otro' }
const ESTADO_TAG = {
  publicada: ['Publicada', 'var(--gr-l)', 'var(--gr-d)'],
  borrador: ['Borrador', '#ECEEF2', '#4A5568'],
  oculta: ['Oculta', '#ECEEF2', '#4A5568'],
  completa: ['Completa · sin plazas', '#F7E3D4', '#9A5B2E'],
}
const RESERVA = { nueva: 'Nueva', contestada: 'Contestada', confirmada: 'Confirmada', descartada: 'Descartada' }

export default function Propuestas({ top, setToast, salir }) {
  const [proy, setProy] = useState(null)
  const [reservas, setReservas] = useState(null)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const fallo = useCallback(e => { if (e instanceof ErrorSesion) salir(); else setError(e.message) }, [salir])
  const recargar = useCallback(() => Promise.all([api('/proyectos?todas=1'), api('/interesados')])
    .then(([p, r]) => { setProy(p); setReservas(r); setError('') }).catch(fallo), [fallo])
  useEffect(() => { recargar() }, [recargar])

  const crear = async (e, estado = 'publicada') => {
    e.preventDefault()
    setGuardando(true)
    try {
      await api('/proyectos', { metodo: 'POST', datos: { ...form, estado, hectareas: form.hectareas || null, presupuesto: form.presupuesto || null, plazas: form.plazas || null } })
      setForm(null); setToast({ texto: estado === 'publicada' ? 'Propuesta publicada en vuestra página' : 'Guardada como borrador' })
      await recargar()
    } catch (err) { if (err instanceof ErrorSesion) salir(); else setToast({ texto: `No se pudo guardar: ${err.message}` }) }
    setGuardando(false)
  }
  const retirar = async p => {
    if (!confirm(`¿Retirar «${p.titulo}» de la página pública?`)) return
    try { await api(`/proyectos/${p.id}`, { metodo: 'DELETE' }); setToast({ texto: 'Propuesta retirada de la página pública' }); await recargar() }
    catch (err) { if (err instanceof ErrorSesion) salir(); else setToast({ texto: `No se pudo retirar: ${err.message}` }) }
  }
  const cambiar = async (p, estado) => {
    try { await api(`/proyectos/${p.id}`, { metodo: 'PUT', datos: { estado } }); setToast({ texto: estado === 'publicada' ? 'Publicada en vuestra página' : 'Ocultada de la página pública' }); await recargar() }
    catch (err) { if (err instanceof ErrorSesion) salir(); else setToast({ texto: `No se pudo cambiar: ${err.message}` }) }
  }
  const estadoReserva = async (r, estado) => {
    try { await api(`/interesados/${r.id}`, { metodo: 'PUT', datos: { estado } }); await recargar() }
    catch (err) { if (err instanceof ErrorSesion) salir(); else setToast({ texto: `No se pudo cambiar: ${err.message}` }) }
  }
  const borrarReserva = async r => {
    if (!confirm(`¿Borrar la reserva de «${r.empresa}»? No se puede deshacer.`)) return
    try { await api(`/interesados/${r.id}`, { metodo: 'DELETE' }); setToast({ texto: 'Reserva borrada' }); await recargar() }
    catch (err) { if (err instanceof ErrorSesion) salir(); else setToast({ texto: `No se pudo borrar: ${err.message}` }) }
  }
  const campo = k => ({ value: form[k], onChange: e => setForm({ ...form, [k]: e.target.value }) })
  return (
    <>
      {/* Acciones a la izquierda de la barra superior, como el menú de las demás pantallas. */}
      {top('Propuestas', false, <div style={{ display: 'flex', gap: 10 }}>
        <button className="i-btn p sm" onClick={() => setForm(VACIA)}><Icon n="plus" s={17} w={2.4} />Nueva propuesta</button>
        <a className="i-btn sm" href="#/propuestas" target="_blank" rel="noreferrer"><Icon n="ext" s={17} />Ver página pública</a>
      </div>)}
      {error && <p className="i-err" role="alert">{error} <button className="i-link" onClick={recargar}>Reintentar</button></p>}
      {form && (
        <form className="i-card i-form" onSubmit={crear}>
          <b>Nueva propuesta</b>
          <input className="i-in" required maxLength={150} placeholder="Título · ej. Plantación de 1 ha" {...campo('titulo')} />
          <input className="i-in" maxLength={150} placeholder="Dónde · ej. Sierra de Guadarrama" {...campo('lugar')} />
          <div style={{ display: 'flex', gap: 10 }}>
            <Desplegable className="i-in dsp-campo" etiqueta="Tipo de propuesta" valor={form.tipo} onCambio={v => setForm({ ...form, tipo: v })} boton={TIPOS[form.tipo] || 'Tipo'} opciones={Object.entries(TIPOS).map(([k, t]) => ({ v: k, t }))} />
            <input className="i-in" maxLength={300} placeholder="Qué incluye · ej. Plantas, plantación y seguimiento" {...campo('incluye')} />
          </div>
          <input className="i-in" maxLength={2000} placeholder="Descripción (opcional)" {...campo('descripcion')} />
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="i-in" type="number" min="0" step="0.1" placeholder="Hectáreas" {...campo('hectareas')} />
            <input className="i-in" type="number" min="0" step="100" placeholder="Presupuesto (€)" {...campo('presupuesto')} />
            <input className="i-in" type="number" min="1" step="1" placeholder="Plazas (vacío = sin límite)" {...campo('plazas')} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button className="i-btn p sm" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Publicar'}</button><button className="i-btn sm" type="button" disabled={guardando} onClick={e => crear(e, 'borrador')}>Guardar borrador</button><button className="i-btn sm" type="button" onClick={() => setForm(null)}>Cancelar</button></div>
        </form>
      )}
      {!proy && !error && <p className="i-sub">Cargando propuestas…</p>}
      {proy && proy.length === 0 && !form && <div className="i-card i-empty" style={{ margin: '16px 0 14px' }}>Aún no hay propuestas. Pulsad «Nueva propuesta».</div>}
      <div className="i-grid3" style={{ margin: '16px 0 14px' }}>
        {(proy || []).map((p, i) => {
          const n = Math.max(3, Math.min(8, Math.round((p.hectareas || 4) / 1.7)))
          const k = p.reservas
          const [et, bg, fg] = ESTADO_TAG[p.estado === 'publicada' && p.completa ? 'completa' : p.estado] || ESTADO_TAG.publicada
          return (
            <div key={p.id} className="i-card" style={{ padding: '12px 14px 16px', display: 'flex', flexDirection: 'column' }}>
              {mapaLugar(p.lugar)
                ? <div className="i-art i-art-mapa" title={p.lugar}><Svg html={mapaLugar(p.lugar)} /><span className="i-art-lugar">📍 {p.lugar.replace(/\s*\(Madrid\)/i, '')}</span></div>
                : <div className="i-art"><Svg html={island(220, 150, n, n, 20 + i)} /></div>}
              <div className="i-head" style={{ margin: '10px 0 4px', alignItems: 'center' }}><span className="i-tag" style={{ background: bg, color: fg }}>{et}</span><span className="i-tag">{p.plazas_libres == null ? (k === 0 ? 'Sin reservas' : k === 1 ? '1 reserva' : `${k} reservas`) : `${p.plazas_libres} de ${p.plazas} plazas libres`}</span></div>
              <b style={{ fontSize: 18 }}>{p.titulo}</b>
              <div style={{ color: 'var(--mut)', fontSize: 14 }}>{[TIPOS[p.tipo], p.lugar, hectareas(p.hectareas), euros(p.presupuesto), p.incluye || p.descripcion].filter(Boolean).join(' · ')}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 12 }}>
                {p.estado === 'publicada'
                  ? <button className="i-btn sm" style={{ flex: 1, height: 42 }} onClick={() => cambiar(p, 'oculta')}>Ocultar</button>
                  : <button className="i-btn p sm" style={{ flex: 1, height: 42 }} onClick={() => cambiar(p, 'publicada')}>Publicar</button>}
                <button className="i-btn sm" style={{ height: 42 }} onClick={() => retirar(p)}>Retirar</button>
              </div>
            </div>
          )
        })}
      </div>
      <Agenda reservas={reservas} estadoReserva={estadoReserva} borrarReserva={borrarReserva} />
    </>
  )
}

// Reservas como una agenda: agrupadas por la inicial de la empresa, con índice de letras arriba.
const TONOS_AG = ['#F7E3D4,#9A5B2E', '#DFF0E3,#256B45', '#E3ECF7,#2F5683', '#FFF0D6,#8A5300', '#F1E4F5,#6E3F86']
const ESTADO_AG = { nueva: ['Nueva', 'nueva'], contestada: ['Contestada', 'cont'], confirmada: ['Confirmada', 'conf'], descartada: ['Descartada', 'desc'] }
function inicialDe(t) { const c = (t || '#').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')[0]?.toUpperCase() || '#'; return /[A-Z]/.test(c) ? c : '#' }
function Agenda({ reservas, estadoReserva, borrarReserva }) {
  const grupos = useMemo(() => {
    const g = {}
    for (const r of [...(reservas || [])].sort((a, b) => a.empresa.localeCompare(b.empresa, 'es'))) (g[inicialDe(r.empresa)] ||= []).push(r)
    return Object.entries(g)
  }, [reservas])
  return (
    <div className="i-card i-agenda">
      <div className="ag-cab">
        <b>Agenda de empresas{reservas ? <span>{reservas.length}</span> : null}</b>
        <nav aria-label="Ir a la letra">{grupos.map(([l]) => <a key={l} href={`#ag-${l}`} onClick={e => { e.preventDefault(); document.getElementById(`ag-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{l}</a>)}</nav>
      </div>
      {reservas && reservas.length === 0 && <p className="ag-vacio">Aún no hay reservas. Compartid vuestra página pública con empresas.</p>}
      {grupos.map(([letra, lista]) => (
        <section key={letra} id={`ag-${letra}`} className="ag-grupo" aria-label={`Letra ${letra}`}>
          <h3 className="ag-letra">{letra}</h3>
          <ul>
            {lista.map(r => {
              const mail = (r.contacto.match(/[^\s·<>]+@[^\s·<>]+/) || [])[0]
              const persona = r.contacto.split('·')[0].trim()
              const [bg, fg] = TONOS_AG[[...r.empresa].reduce((n, c) => n + c.charCodeAt(0), 0) % TONOS_AG.length].split(',')
              const [txt, cls] = ESTADO_AG[r.estado] || ESTADO_AG.nueva
              return (
                <li key={r.id} className="ag-fila">
                  <span className="ag-av" style={{ background: bg, color: fg }} aria-hidden="true">{r.empresa.trim().slice(0, 2).toUpperCase()}</span>
                  <div className="ag-quien">
                    <b>{r.empresa}</b>
                    <span>{persona}{mail && persona !== mail ? ` · ${mail}` : ''}</span>
                    {r.mensaje && <i>«{r.mensaje}»</i>}
                  </div>
                  <div className="ag-que">
                    <span className="ag-proy" title={r.proyecto}><Icon n="leaf" s={14} />{r.proyecto || '—'}</span>
                    <small>{r.hectareas ? `${r.hectareas} ha · ` : ''}{new Date(r.creado).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</small>
                  </div>
                  <Desplegable etiqueta={`Estado de la reserva de ${r.empresa}`} valor={r.estado || 'nueva'} className={`ag-est ${cls}`} alinear="der"
                    onCambio={v => estadoReserva(r, v)} boton={txt}
                    opciones={Object.entries(ESTADO_AG).map(([k, [t]]) => ({ v: k, t }))} />
                  <div className="ag-acc">
                    {mail && <a className="ag-ib" href={`mailto:${mail}?subject=${encodeURIComponent('Reforesta · ' + (r.proyecto || 'vuestra reserva'))}`} title={`Escribir a ${mail}`} aria-label={`Escribir a ${r.empresa}`}><Icon n="send" s={16} /></a>}
                    <button className="ag-ib" onClick={() => borrarReserva(r)} title="Borrar la reserva" aria-label={`Borrar la reserva de ${r.empresa}`}><Icon n="x" s={16} w={2.4} /></button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
