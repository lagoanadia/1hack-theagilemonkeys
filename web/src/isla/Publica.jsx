import { useEffect, useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { island, tree } from './lp.js'
import { mapaLugar } from './mapa.js'
import { GloboInfo } from './Globo.jsx'
import { api } from '../api.js'
import { euros, hectareas } from '../datos.js'

// Página pública para empresas: lista de GET /api/proyectos y reserva con POST /api/proyectos/:id/interes.
// No pide contraseña. Anti-spam: campo trampa «web» (invisible) y límite de envíos en el servidor.
const VACIO = { empresa: '', persona: '', email: '', mensaje: '', hectareas: '', web: '', ok: false }
// Solo llegan las propuestas publicadas; cada una trae plazas_libres (null = sin límite) y completa.
// TODO backend: «avisadme si quedan plazas».

export default function Publica({ equipo, onEntrar }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(null)
  const [f, setF] = useState(VACIO)
  const [estado, setEstado] = useState('form')   // form · enviada · error
  const [msg, setMsg] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => { api('/proyectos').then(setLista).catch(e => setError(e.message)) }, [])

  const ha = (lista || []).reduce((s, p) => s + (p.hectareas || 0), 0)
  const eur = (lista || []).reduce((s, p) => s + (p.presupuesto || 0), 0)
  const enviar = async e => {
    e.preventDefault()
    setEnviando(true)
    try {
      await api(`/proyectos/${sel.id}/interes`, {
        metodo: 'POST',
        datos: { empresa: f.empresa, contacto: `${f.persona} · ${f.email}`, mensaje: f.mensaje, web: f.web,
          hectareas: f.hectareas === '' ? null : Number(f.hectareas) },
      })
      setEstado('enviada')
    } catch (err) { setMsg(err.message); setEstado('error') }
    setEnviando(false)
  }
  const volver = () => { setSel(null); setF(VACIO); setEstado('form'); setMsg('') }
  const campo = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) })
  return (
    <div className="isla i-pub">
      <div className="phead">
        <span className="brand"><Svg className="mk" html={tree(34, 34, 28, '#79C08A')} />Reforesta</span>
        <span className="sub" style={{ color: 'var(--mut)', fontWeight: 600 }}>Proyectos de reforestación · Madrid</span>
        {equipo
          ? <a className="i-btn n sm" href="#/">Volver al panel</a>
          : <button className="i-btn n sm" onClick={onEntrar}>Soy de Reforesta</button>}
      </div>
      {!sel && (<>
        <section className="hero">
          <div><span className="i-tag" style={{ background: '#F7E3D4', color: '#9A5B2E' }}>Para empresas</span>
            <h1>Planta un bosque <span>con Reforesta</span></h1>
            <p>Elegid un proyecto y reservad sin compromiso. Os contactamos en unos días con el presupuesto.</p>
            {lista && lista.length > 0 && (
              <div className="nums">
                <div><b>{lista.length}</b>{lista.length === 1 ? 'proyecto abierto' : 'proyectos abiertos'}</div>
                {ha > 0 && <div><b>{hectareas(ha)}</b>por restaurar</div>}
                {eur > 0 && <div><b>{euros(eur)}</b>en proyectos</div>}
              </div>
            )}
          </div>
          <GloboInfo />
        </section>
        <section className="i-grid3 cards">
          {error && <p className="i-err" role="alert">No se pudieron cargar los proyectos: {error}</p>}
          {!error && !lista && <p className="i-sub">Cargando proyectos…</p>}
          {lista && lista.length === 0 && <p className="i-sub" style={{ gridColumn: '1/4' }}>Pronto habrá proyectos.</p>}
          {(lista || []).map((p, i) => {
            const n = Math.max(3, Math.min(8, Math.round((p.hectareas || 4) / 1.7)))
            return (
              <div key={p.id} className="i-card" style={{ padding: '14px 16px 18px', display: 'flex', flexDirection: 'column' }}>
                {mapaLugar(p.lugar)
                  ? <div className="i-art i-art-mapa" title={p.lugar}><Svg html={mapaLugar(p.lugar)} /><span className="i-art-lugar">📍 {p.lugar.replace(/\s*\(Madrid\)/i, '')}</span></div>
                  : <div className="i-art"><Svg html={island(220, 150, n, n, 20 + i)} /></div>}
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 0' }}>
                  {p.hectareas > 0 && <span className="i-tag">{hectareas(p.hectareas)}</span>}
                  {p.presupuesto > 0 && <span className="i-tag">{euros(p.presupuesto)}</span>}
                  {p.plazas_libres != null && <span className="i-tag" style={p.completa ? { background: '#F7E3D4', color: '#9A5B2E' } : undefined}>{p.completa ? 'Completa' : `${p.plazas_libres} ${p.plazas_libres === 1 ? 'plaza libre' : 'plazas libres'}`}</span>}
                </span>
                <b style={{ fontSize: 20, margin: '8px 0 2px' }}>{p.titulo}</b>
                <div style={{ color: 'var(--mut)', fontSize: 14.5, minHeight: 40 }}>{[p.lugar, p.incluye || p.descripcion].filter(Boolean).join(' · ')}</div>
                <button className="i-btn p sm" style={{ marginTop: 12 }} disabled={p.completa} onClick={() => setSel(p)}>{p.completa ? 'Sin plazas por ahora' : 'Reservar sin compromiso'}</button>
              </div>
            )
          })}
        </section>
      </>)}
      {sel && estado !== 'enviada' && (
        <form className="i-card i-form box" onSubmit={enviar}>
          <button type="button" className="i-link" onClick={volver}><Icon n="back" s={15} w={2.4} />Volver a los proyectos</button>
          <h2>Reservar · {sel.titulo}</h2>
          <input className="i-in" required maxLength={150} placeholder="Empresa" {...campo('empresa')} />
          <input className="i-in" required maxLength={60} placeholder="Persona de contacto" {...campo('persona')} />
          <input className="i-in" required type="email" maxLength={80} placeholder="Email" {...campo('email')} />
          <input className="i-in" type="number" min="0.1" step="0.1" max={sel.hectareas || undefined}
            placeholder={`Hectáreas que queréis apoyar (opcional${sel.hectareas ? `, hasta ${sel.hectareas}` : ''})`} {...campo('hectareas')} />
          <textarea className="i-in" maxLength={1000} placeholder="Mensaje (opcional)" {...campo('mensaje')} />
          {/* Campo trampa: las personas no lo ven; los bots lo rellenan y el servidor los ignora. */}
          <input className="i-trampa" tabIndex={-1} autoComplete="off" aria-hidden="true" name="web" {...campo('web')} />
          <label className="cb"><input required type="checkbox" checked={f.ok} onChange={e => setF({ ...f, ok: e.target.checked })} />Acepto el tratamiento de mis datos</label>
          {estado === 'error' && <p className="i-err" role="alert">{msg}</p>}
          <button className="i-btn p" type="submit" disabled={enviando}>{enviando ? 'Enviando…' : 'Reservar sin compromiso'}</button>
          <small style={{ color: 'var(--mut)' }}>No supone compromiso de pago.</small>
        </form>
      )}
      {sel && estado === 'enviada' && (
        <section className="i-card box" style={{ textAlign: 'center' }}>
          <h2>Reserva recibida</h2>
          <p className="i-sub">Reforesta os responderá en unos días. No supone compromiso de pago.</p>
          <button className="i-btn p" style={{ margin: '0 auto' }} onClick={volver}>Ver otros proyectos</button>
        </section>
      )}
    </div>
  )
}
