import { useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { island } from './lp.js'
import { etapaEmpresa, hectareas } from '../datos.js'

// Pantalla «Empresas»: datos de empresas.json (declaraciones de impacto ambiental del BOE) y su estado
// de contacto con PUT /api/solicitudes/empresa/:id (nueva, contactada, reunion, acuerdo, cerrada, descartada).
const SEGS = [['nueva', 'Nuevas'], ['contactada', 'Contactadas'], ['cerrada', 'Cerradas'], ['descartada', 'Descartadas']]
const ACCION = {
  contactar: ['Obligada a reforestar', '#F7E3D4', '#9A5B2E'],
  mira: ['Mirad si encaja', '#FFF0D6', '#8A5300'],
  descarta: ['El radar la descarta', '#F1F3EE', '#4D5662'],
}
const ESTADO_TXT = { contactada: 'Contactada', reunion: 'En reunión', acuerdo: 'Con acuerdo' }
const SIGUIENTE = { contactada: ['reunion', 'Hemos quedado (reunión)'], reunion: ['acuerdo', 'Hay acuerdo'], acuerdo: ['cerrada', 'Marcar como cerrada'] }
const ORDEN = { contactar: 0, mira: 1, descarta: 2 }
const arboles = ha => (ha ? Math.max(3, Math.min(8, Math.round(ha / 1.7))) : 4)

export default function Empresas({ top, radar, q, cambiarEstado }) {
  const [seg, setSeg] = useState('nueva')
  const todas = radar.empresas
  const cuenta = k => todas.filter(e => etapaEmpresa(e) === k).length
  const lista = todas
    .filter(e => etapaEmpresa(e) === seg && (!q || `${e.promotor} ${e.proyecto} ${e.ubicacion}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => ORDEN[a.accion] - ORDEN[b.accion] || (b.fecha || '').localeCompare(a.fecha || ''))
  return (
    <>
      {top('Empresas · BOE')}
      <div className="i-head"><h2>Empresas que tienen que reforestar</h2><div className="i-seg">{SEGS.map(([k, l]) => <button key={k} className={seg === k ? 'on' : ''} onClick={() => setSeg(k)}>{l} · {cuenta(k)}</button>)}</div></div>
      <p className="i-sub">Tienen una declaración de impacto ambiental favorable que les obliga a plantar. Podéis ofreceros a hacerlo, siempre por su canal público.</p>
      {radar.emp == null && <div className="i-card i-empty">Todavía no hay datos de empresas. El radar los genera cada mañana.</div>}
      <div className="i-grid3">
        {radar.emp != null && lista.length === 0 && <div className="i-card i-empty" style={{ gridColumn: '1/4' }}>Nada en esta pestaña.</div>}
        {lista.map(e => {
          const [t, bg, fg] = ACCION[e.accion] || ACCION.descarta
          const ha = e.superficie_total_ha
          const sig = SIGUIENTE[e.estado]
          return (
            <div key={e.id} className="i-card" style={{ padding: '14px 16px 18px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: 'linear-gradient(#F8FAF6,#EAF1E6)', borderRadius: 22, height: 170, display: 'grid', placeItems: 'center', overflow: 'hidden' }}><Svg html={island(260, 190, arboles(ha), arboles(ha), 10 + (e.id.length % 17))} style={{ width: 260 }} /></div>
              <div className="i-head" style={{ margin: '12px 0 6px', alignItems: 'center' }}>
                <span className="i-tag" style={{ background: bg, color: fg }}>{t}</span>
                {ESTADO_TXT[e.estado] && <span className="i-tag" style={{ background: 'var(--gr-l)', color: 'var(--gr-d)' }}>{ESTADO_TXT[e.estado]}</span>}
              </div>
              <b style={{ fontSize: 19, lineHeight: 1.2 }}>{e.promotor || 'Promotor sin identificar'} · {e.proyecto}</b>
              <p style={{ fontSize: 14.5, color: 'var(--mut)', margin: '4px 0 0' }}>{e.resumen}</p>
              {e.cita && <p className="i-mot" style={{ fontStyle: 'italic' }}>«{e.cita}»</p>}
              <div style={{ display: 'flex', gap: 20, margin: '10px 0 8px' }}><div><span style={{ fontSize: 13, color: 'var(--mut)' }}>¿Cuánto plantar?</span><b style={{ display: 'block', fontSize: 20 }} className={ha ? '' : 'i-ni'}>{hectareas(ha) || 'No indicado'}</b></div><div><span style={{ fontSize: 13, color: 'var(--mut)' }}>¿Dónde?</span><b style={{ display: 'block', fontSize: 17, lineHeight: 1.25 }}>{e.ubicacion || 'No indicado'}</b></div></div>
              {e.url && <a className="i-link" style={{ marginBottom: 12 }} href={e.url} target="_blank" rel="noopener noreferrer">Ver en el BOE{e.fecha ? ` · ${new Date(e.fecha).toLocaleDateString('es-ES')}` : ''} ↗</a>}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                {seg === 'nueva' && <><button className="i-btn p sm" onClick={() => cambiarEstado(e, 'contactada', 'Marcada como contactada')}><Icon n="send" s={17} />Ofrecernos a ejecutarlo</button><button className="i-link" style={{ alignSelf: 'center' }} onClick={() => cambiarEstado(e, 'descartada', 'Empresa descartada')}>No nos interesa</button></>}
                {seg === 'contactada' && <><button className="i-btn sm" onClick={() => cambiarEstado(e, sig[0], sig[1] === 'Marcar como cerrada' ? 'Movida a cerradas' : `Actualizada: ${sig[1].toLowerCase()}`)}><Icon n="check" s={17} w={2.6} />{sig[1]}</button>{e.estado !== 'acuerdo' && <button className="i-link" style={{ alignSelf: 'center' }} onClick={() => cambiarEstado(e, 'cerrada', 'Movida a cerradas')}>Cerrar sin acuerdo</button>}</>}
                {(seg === 'cerrada' || seg === 'descartada') && <button className="i-btn sm" onClick={() => cambiarEstado(e, 'nueva', 'Vuelve a nuevas')}><Icon n="undo" s={17} />Reabrir</button>}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
