import { useEffect, useMemo, useState } from 'react'
import { ErrorSesion, api } from '../api.js'
import { madridMap, spainMini, ZONAS, P, inPoly, COL, TIPO } from './mapa.js'

const Svg = ({ html, ...p }) => <span {...p} dangerouslySetInnerHTML={{ __html: html }} />
const zonaDe = a => { const pt = P(a.ll); const z = ZONAS.find(z => inPoly(pt, z[2].map(P))); return z ? z[0] : 'Madrid y área metropolitana' }
// El mapa dibuja la Comunidad de Madrid: lo que cae fuera va a la lista de «España».
const enMadrid = a => a.ll[0] >= -4.7 && a.ll[0] <= -2.9 && a.ll[1] >= 39.8 && a.ll[1] <= 41.3
const ARBOLES_HA = 800   // estimación cuando una plantación no trae el número de árboles
const fmt = n => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })

// Dónde ha plantado Reforesta: GET /api/plantaciones (público) → {plantaciones, totales}.
// Cada sitio: {id, nombre, ll:[lon,lat], ha, arboles, especies, tipo c/e/v, anio, con}.
export default function Mapa({ top, salir }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [anio, setAnio] = useState('Todo')
  const [ambito, setAmbito] = useState('Madrid')
  const [selId, setSelId] = useState(null)
  useEffect(() => {
    let vivo = true
    api('/plantaciones').then(d => { if (vivo) setDatos(d) }).catch(e => {
      if (!vivo) return
      if (e instanceof ErrorSesion) salir?.(); else setError(e.message)
    })
    return () => { vivo = false }
  }, [salir])
  const todos = useMemo(() => datos?.plantaciones || [], [datos])
  const anios = useMemo(() => [...new Set(todos.map(a => a.anio))].sort(), [todos])
  const delAnio = useMemo(() => todos.filter(a => anio === 'Todo' || a.anio === Number(anio)), [todos, anio])
  const sitios = useMemo(() => delAnio.filter(enMadrid), [delAnio])
  const fuera = delAnio.filter(a => !enMadrid(a))
  const sel = sitios.find(a => a.id === selId) || sitios[0]
  const svg = useMemo(() => madridMap(sitios, sel?.id), [sitios, sel?.id])
  const ha = sitios.reduce((s, a) => s + (a.ha || 0), 0)
  const estimados = sitios.some(a => a.arboles == null)
  const arboles = sitios.reduce((s, a) => s + (a.arboles ?? Math.round((a.ha || 0) * ARBOLES_HA)), 0)
  const porZona = ZONAS.map(z => { const l = sitios.filter(a => zonaDe(a) === z[0]); return [z[0], z[1], l.length, l.reduce((s, a) => s + (a.ha || 0), 0)] }).sort((a, b) => b[3] - a[3])
  const arbolesDe = a => (a.arboles != null ? `${fmt(a.arboles)} árboles` : `≈ ${fmt(Math.round((a.ha || 0) * ARBOLES_HA))} árboles`)
  if (error) return <>{top('Mapa')}<div className="i-card i-empty" role="alert">No se pudo cargar el mapa: {error}</div></>
  if (!datos) return <>{top('Mapa')}<div className="i-card i-empty">Cargando plantaciones…</div></>
  return (
    <>
      {top('Mapa')}
      <div className="i-head">
        <h2>Dónde habéis plantado</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="i-seg">{['Madrid', 'España'].map(k => <button key={k} className={ambito === k ? 'on' : ''} onClick={() => setAmbito(k)}>{k}</button>)}</div>
          <div className="i-seg">{[...anios.map(String), 'Todo'].map(k => <button key={k} className={anio === k ? 'on' : ''} onClick={() => setAnio(k)}>{k}</button>)}</div>
        </div>
      </div>
      {todos.length === 0 ? (
        <div className="i-card i-empty" style={{ marginTop: 16 }}>Todavía no hay plantaciones en el mapa. Cuando el equipo las dé de alta, aparecerán aquí con sus hectáreas y sus árboles.</div>
      ) : (
        <div className="i-two" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px', marginTop: 16 }}>
          <div className="i-mapc">
            {ambito === 'Madrid'
              ? <Svg html={svg} onClick={e => { const g = e.target.closest('[data-id]'); if (g) setSelId(Number(g.dataset.id)) }} />
              : (
                <div style={{ display: 'grid', placeItems: 'center', minHeight: 520, textAlign: 'center', padding: 20 }}>
                  <div>
                    <Svg html={spainMini().replace('width="240" height="160"', 'width="480" height="320"')} />
                    {fuera.length === 0
                      ? <p className="i-sub" style={{ maxWidth: 380, margin: '10px auto 0' }}>Por ahora todas vuestras plantaciones están en la Comunidad de Madrid.</p>
                      : <div style={{ maxWidth: 420, margin: '10px auto 0', textAlign: 'left' }}>{fuera.map(a => <div key={a.id} className="i-row"><b>{a.nombre}</b><span className="d">{fmt(a.ha || 0)} ha · {a.anio}</span></div>)}</div>}
                  </div>
                </div>
              )}
            <div className="leg">{Object.keys(TIPO).map(t => <span key={t}><i style={{ background: COL[t] }} />{TIPO[t]}</span>)}<span style={{ color: 'var(--mut)' }}>· tamaño = hectáreas</span></div>
          </div>
          <div className="i-side" style={{ gap: 10 }}>
            <div className="i-tot3"><div><b>{sitios.length}</b><span>sitios</span></div><div><b>{fmt(ha)} ha</b><span>plantadas</span></div><div><b>{estimados ? '≈\u00A0' : ''}{fmt(arboles)}</b><span>árboles</span></div></div>
            {estimados && <p style={{ fontSize: 12.5, color: 'var(--mut)' }}>Donde no consta el número de árboles se estiman {ARBOLES_HA} por hectárea.</p>}
            {sel ? (
              <div className="i-selc">
                <div className="i-head" style={{ alignItems: 'center' }}><span className="i-tag" style={{ background: COL[sel.tipo] + '22', color: COL[sel.tipo] }}>{TIPO[sel.tipo]} · {sel.anio}</span><span style={{ fontSize: 12.5, color: 'var(--mut)', fontWeight: 600 }}>Seleccionado</span></div>
                <b className="t">{sel.nombre}</b>
                <div className="r"><span>Zona</span><b>{zonaDe(sel)}</b></div>
                <div className="r"><span>Superficie</span><b>{fmt(sel.ha || 0)} ha · {arbolesDe(sel)}</b></div>
                {sel.especies && <div className="r"><span>Especies</span><b>{sel.especies}</b></div>}
                {sel.con && <div className="r"><span>Con</span><b>{sel.con}</b></div>}
                {sel.notas && <div className="r"><span>Notas</span><b>{sel.notas}</b></div>}
                <p style={{ fontSize: 12.5, color: 'var(--mut)', marginTop: 6 }}>Pulsad un globito del mapa para ver otro sitio.</p>
              </div>
            ) : <div className="i-selc">No hay actuaciones en {ambito === 'Madrid' ? 'Madrid' : 'el mapa'}{anio === 'Todo' ? '' : ` en ${anio}`}.</div>}
            <div className="i-mini" style={{ padding: '12px 16px' }}><h4>POR ZONAS</h4>
              {porZona.map(([n, c, k, h]) => <div key={n} className="i-row" style={{ padding: '6px 0' }}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><i style={{ width: 14, height: 14, borderRadius: 4, background: c, border: '1px solid #D5DBD2' }} /><b style={{ fontSize: 13.5 }}>{n}</b></span><span style={{ fontSize: 12.5, color: 'var(--mut)', whiteSpace: 'nowrap' }}>{k} · {fmt(h)} ha</span></div>)}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
