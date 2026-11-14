import { useMemo, useState } from 'react'
import { ACTUACIONES } from '../data/actuaciones.js'
import { madridMap, spainMini, ZONAS, P, inPoly, COL, TIPO } from './mapa.js'

const Svg = ({ html, ...p }) => <span {...p} dangerouslySetInnerHTML={{ __html: html }} />
const zonaDe = a => { const pt = P(a.ll); const z = ZONAS.find(z => inPoly(pt, z[2].map(P))); return z ? z[0] : 'Madrid y área metropolitana' }

// TODO backend: mapa de plantaciones. Hace falta guardar dónde ha actuado Reforesta (nombre, coordenadas,
// hectáreas, año, tipo: convocatoria / empresa / voluntariado y con quién). Hoy todo es de EJEMPLO.
export default function Mapa({ top }) {
  const [anio, setAnio] = useState('Todo')
  const [ambito, setAmbito] = useState('Madrid')
  const sitios = useMemo(() => ACTUACIONES.filter(a => anio === 'Todo' || a.anio === Number(anio)), [anio])
  const [selId, setSelId] = useState(7)
  const sel = sitios.find(a => a.id === selId) || sitios[0]
  const svg = useMemo(() => madridMap(sitios, sel?.id), [sitios, sel?.id])
  const ha = sitios.reduce((s, a) => s + a.ha, 0)
  const porZona = ZONAS.map(z => { const l = sitios.filter(a => zonaDe(a) === z[0]); return [z[0], z[1], l.length, l.reduce((s, a) => s + a.ha, 0)] }).sort((a, b) => b[3] - a[3])
  const fmt = n => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  return (
    <>
      {top('Mapa', true)}
      <div className="i-head">
        <h2>Dónde habéis plantado</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="i-seg">{['Madrid', 'España'].map(k => <button key={k} className={ambito === k ? 'on' : ''} onClick={() => setAmbito(k)}>{k}</button>)}</div>
          <div className="i-seg">{['2024', '2025', '2026', 'Todo'].map(k => <button key={k} className={anio === k ? 'on' : ''} onClick={() => setAnio(k)}>{k}</button>)}</div>
        </div>
      </div>
      <div className="i-two" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px', marginTop: 16 }}>
        <div className="i-mapc">
          {ambito === 'Madrid'
            ? <Svg html={svg} onClick={e => { const g = e.target.closest('[data-id]'); if (g) setSelId(Number(g.dataset.id)) }} />
            : <div style={{ display: 'grid', placeItems: 'center', minHeight: 520, textAlign: 'center' }}><div><Svg html={spainMini().replace('width="240" height="160"', 'width="480" height="320"')} /><p className="i-sub" style={{ maxWidth: 380, margin: '10px auto 0' }}>Por ahora Reforesta solo actúa en la Comunidad de Madrid. Cuando activéis «Ampliar a toda España» en el Perfil, aquí aparecerán el resto de sitios.</p></div></div>}
          <div className="leg">{Object.keys(TIPO).map(t => <span key={t}><i style={{ background: COL[t] }} />{TIPO[t]}</span>)}<span style={{ color: 'var(--mut)' }}>· tamaño = hectáreas · <span className="i-ej">Ejemplo</span></span></div>
        </div>
        <div className="i-side" style={{ gap: 10 }}>
          <div className="i-tot3"><div><b>{sitios.length}</b><span>sitios</span></div><div><b>{fmt(ha)} ha</b><span>plantadas</span></div><div><b>{fmt(Math.round(ha * 800))}</b><span>árboles</span></div></div>
          {sel ? (
            <div className="i-selc">
              <div className="i-head" style={{ alignItems: 'center' }}><span className="i-tag" style={{ background: COL[sel.tipo] + '22', color: COL[sel.tipo] }}>{TIPO[sel.tipo]} · {sel.anio}</span><span style={{ fontSize: 12.5, color: 'var(--mut)', fontWeight: 600 }}>Seleccionado</span></div>
              <b className="t">{sel.nombre}</b>
              <div className="r"><span>Zona</span><b>{zonaDe(sel)}</b></div>
              <div className="r"><span>Superficie</span><b>{fmt(sel.ha)} ha · {fmt(Math.round(sel.ha * 800))} árboles</b></div>
              <div className="r"><span>Con</span><b>{sel.con}</b></div>
              <p style={{ fontSize: 12.5, color: 'var(--mut)', marginTop: 6 }}>Pulsad un globito del mapa para ver otro sitio.</p>
            </div>
          ) : <div className="i-selc">No hay actuaciones en {anio}.</div>}
          <div className="i-mini" style={{ padding: '12px 16px' }}><h4>POR ZONAS</h4>
            {porZona.map(([n, c, k, h]) => <div key={n} className="i-row" style={{ padding: '6px 0' }}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><i style={{ width: 14, height: 14, borderRadius: 4, background: c, border: '1px solid #D5DBD2' }} /><b style={{ fontSize: 13.5 }}>{n}</b></span><span style={{ fontSize: 12.5, color: 'var(--mut)', whiteSpace: 'nowrap' }}>{k} · {fmt(h)} ha</span></div>)}
          </div>
        </div>
      </div>
    </>
  )
}
