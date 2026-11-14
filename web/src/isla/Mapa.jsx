import { useEffect, useMemo, useState } from 'react'
import { ErrorSesion, api } from '../api.js'
import Icon from './Icon.jsx'
import Desplegable from './Desplegable.jsx'
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
  // Años acumulados: «Hasta 2024» enseña todo lo plantado hasta ese año (se entiende mejor que un año suelto).
  const delAnio = useMemo(() => todos.filter(a => anio === 'Todo' || a.anio <= Number(anio)), [todos, anio])
  const sitios = useMemo(() => delAnio.filter(enMadrid), [delAnio])
  const fuera = delAnio.filter(a => !enMadrid(a))
  const sel = sitios.find(a => a.id === selId) || null
  const svg = useMemo(() => madridMap(sitios, sel?.id, { brujula: false }), [sitios, sel?.id])
  const ha = sitios.reduce((s, a) => s + (a.ha || 0), 0)
  const estimados = sitios.some(a => a.arboles == null)
  const arboles = sitios.reduce((s, a) => s + (a.arboles ?? Math.round((a.ha || 0) * ARBOLES_HA)), 0)
  const porZona = ZONAS.map(z => { const l = sitios.filter(a => zonaDe(a) === z[0]); return [z[0], z[1], l.length, l.reduce((s, a) => s + (a.ha || 0), 0)] }).filter(z => z[2] > 0).sort((a, b) => b[3] - a[3]).slice(0, 4)
  const haHasta = y => todos.filter(a => enMadrid(a) && (y === 'Todo' || a.anio <= Number(y))).reduce((s, a) => s + (a.ha || 0), 0)
  const porTipo = Object.keys(TIPO).map(t => [t, sitios.filter(a => a.tipo === t).length])
  const arbolesDe = a => (a.arboles != null ? `${fmt(a.arboles)} árboles` : `≈ ${fmt(Math.round((a.ha || 0) * ARBOLES_HA))} árboles`)
  if (error) return <>{top('Mapa')}<div className="i-card i-empty" role="alert">No se pudo cargar el mapa: {error}</div></>
  if (!datos) return <>{top('Mapa')}<div className="i-card i-empty">Cargando plantaciones…</div></>
  const sp = sel ? P(sel.ll) : null
  const controles = (
    <div className="mp-ctl">
      <div className="i-seg">{['Madrid', 'España'].map(k => <button key={k} className={ambito === k ? 'on' : ''} onClick={() => setAmbito(k)}>{k}</button>)}</div>
      <Desplegable etiqueta="Ver lo plantado hasta el año" valor={anio} className="mp-anio"
        onCambio={v => { setAnio(v); setSelId(null) }}
        boton={<><Icon n="cal" s={16} />{anio === 'Todo' ? 'Todo' : anio === String(anios[0]) ? `Solo ${anio}` : `Hasta ${anio}`}<small>{fmt(haHasta(anio))} ha</small></>}
        opciones={[{ v: 'Todo', t: 'Todo', extra: `${fmt(haHasta('Todo'))} ha` },
          ...[...anios].reverse().slice(1).map(y => ({ v: String(y), t: y === anios[0] ? `Solo ${y}` : `Hasta ${y}`, extra: `${fmt(haHasta(y))} ha` }))]} />
    </div>
  )
  return (
    <>
      {top('Mapa', false, controles)}
      {todos.length === 0 ? (
        <div className="i-card i-empty">Todavía no hay plantaciones en el mapa. Cuando el equipo las dé de alta, aparecerán aquí con sus hectáreas y sus árboles.</div>
      ) : ambito === 'España' ? (
        <div className="i-card mp-lienzo" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: 20 }}>
          <div>
            <Svg html={spainMini().replace('width="240" height="160"', 'width="480" height="320"')} />
            {fuera.length === 0
              ? <p className="i-sub" style={{ maxWidth: 380, margin: '10px auto 0' }}>Por ahora todas vuestras plantaciones están en la Comunidad de Madrid.</p>
              : <div style={{ maxWidth: 420, margin: '10px auto 0', textAlign: 'left' }}>{fuera.map(a => <div key={a.id} className="i-row"><b>{a.nombre}</b><span className="d">{fmt(a.ha || 0)} ha · {a.anio}</span></div>)}</div>}
          </div>
        </div>
      ) : (
        <div className="i-card mp-lienzo">
          {/* El mapa ocupa todo; lo demás flota encima. Pulsar un círculo abre su bocadillo. */}
          <div className="mp-mapa" onClick={e => { const g = e.target.closest('[data-id]'); setSelId(g ? Number(g.dataset.id) : null) }}>
            <Svg html={svg} />
            {sel && (
              <div className={`mp-pop ${sp[1] < 260 ? 'abajo' : ''} ${sp[0] > 520 ? 'izq' : ''}`} style={{ left: `${(sp[0] / 720) * 100}%`, top: `${(sp[1] / 630) * 100}%` }} onClick={e => e.stopPropagation()}>
                <button className="x" aria-label="Cerrar" onClick={() => setSelId(null)}><Icon n="x" s={14} w={2.6} /></button>
                <span className="pill" style={{ background: COL[sel.tipo] + '22', color: COL[sel.tipo] }}><i style={{ background: COL[sel.tipo] }} />{TIPO[sel.tipo]} · {sel.anio}</span>
                <b>{sel.nombre}</b>
                <span className="d">{fmt(sel.ha || 0)} ha · {arbolesDe(sel)}{sel.especies ? ` · ${sel.especies}` : ''}</span>
                {sel.con && <span className="d">Con {sel.con}</span>}
                <span className="d">{zonaDe(sel)}</span>
              </div>
            )}
          </div>
          <div className="mp-fl mp-kpi">
            <span className="cab">Plantado en Madrid · {anio === 'Todo' ? 'desde el principio' : anio === String(anios[0]) ? `en ${anio}` : `hasta ${anio}`}</span>
            <div className="tres">
              <div><i className="gr"><Icon n="leaf" s={18} /></i><b>{fmt(ha)}</b><span>hectáreas</span></div>
              <div><i className="am"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 6 12h3l-4 6h14l-4-6h3z" /><path d="M12 18v3" /></svg></i><b>{estimados ? '≈' : ''}{fmt(arboles)}</b><span>árboles</span></div>
              <div><i className="co"><Icon n="pin" s={18} /></i><b>{sitios.length}</b><span>{sitios.length === 1 ? 'sitio' : 'sitios'}</span></div>
            </div>
          </div>
          <div className="mp-fl mp-ley">
            <h4>Qué es cada círculo</h4>
            {porTipo.map(([t, n]) => <div key={t} className="it"><i style={{ background: COL[t] }} /><b>{t === 'e' ? 'Empresa (RSC)' : t === 'c' ? 'Convocatoria pública' : TIPO[t]}</b><span>{n}</span></div>)}
            <div className="tam"><span><i style={{ width: 10, height: 10 }} />1 ha</span><span><i style={{ width: 20, height: 20 }} />5 ha</span><small>tamaño = hectáreas</small></div>
          </div>
          {porZona.length > 0 && (
            <div className="mp-fl mp-zonas">
              <h4>Dónde más</h4>
              {porZona.map(([n, , , h]) => <div key={n} className="z">{n}<span>{fmt(h)} ha</span><i><u style={{ width: `${(h / porZona[0][3]) * 100}%` }} /></i></div>)}
            </div>
          )}
        </div>
      )}
    </>
  )
}
