import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import Tablero from './Tablero.jsx'
import { useSecciones } from '../tablero.js'
import { nombreGuardado } from '../api.js'
import { etapaEmpresa, hectareas } from '../datos.js'

// Pantalla «Empresas»: datos de empresas.json (declaraciones de impacto ambiental del BOE) y su estado
// de contacto con PUT /api/solicitudes/empresa/:id (nueva, contactada, reunion, acuerdo, cerrada, descartada).
//  · Nuevas: las 5 que más encajan, las «nuevas de hoy» y el resto.
//  · Contacto (segunda fase): tablero de arrastrar y soltar con una plantilla de mensaje por columna.
const SEGS = [['nueva', 'Nuevas'], ['contactada', 'En contacto'], ['cerrada', 'Cerradas'], ['descartada', 'Descartadas']]
const ACCION = { contactar: 'Obligada a reforestar', mira: 'Mirad si encaja', descarta: 'El radar la descarta' }
const SECTOR = { hibrido: 'Eólico + solar', infraestructura: 'Infraestructura', eolico: 'Eólico', solar: 'Solar', linea_electrica: 'Línea eléctrica', otro: 'Otro sector' }
const TONOS = ['t0', 't1', 't2', 't3', 't4']
const hash = t => [...String(t)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const iniciales = e => (nombreCorto(e).match(/\p{L}/gu) || ['?'])[0].toUpperCase()
// «Corporación Eólica de Valdivia, SL» → «Corporación Eólica de Valdivia»; si hay varias sociedades, la primera.
const nombreCorto = e => (e.promotor || 'Promotor sin identificar').split(';')[0].replace(/,?\s+(S\.?A\.?U?\.?|S\.?L\.?U?\.?|SAU|SLU|SA|SL)\.?$/i, '').trim()
const mw = e => { const m = (e.titulo || '').match(/(\d[\d.]*(?:,\d+)?)\s*MW/i); return m ? `${m[1]} MW` : null }
const nPlantacion = e => (e.medidas || []).filter(m => /plant|forest|vegetaci|arbol|árbol|arbust|restaur|repobl/i.test(m.texto)).length
const nivel = n => (n >= 75 ? 'alto' : n >= 50 ? 'medio' : 'bajo')
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const diasDesde = f => Math.round((new Date(new Date().toDateString()) - new Date(`${f}T00:00:00`)) / 864e5)
const fechaLarga = f => new Date(`${String(f).slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const porEncaje = (a, b) => (b.encaje ?? 0) - (a.encaje ?? 0) || (b.fecha || '').localeCompare(a.fecha || '')

// Fase de contacto: columnas del tablero, cada una con su plantilla de mensaje (o su estado).
const COLUMNAS = [
  { id: 'por_escribir', nombre: 'Por escribir', color: 'gris', nota: 'sin mensaje aún' },
  { id: 'm1', nombre: 'Primer mensaje', color: 'azul', plantilla: 'm1', nota: '✉ plantilla' },
  { id: 'rec', nombre: 'Recordatorio', color: 'ambar', plantilla: 'rec', nota: '✉ plantilla' },
  { id: 'reunion', nombre: 'Reunión', color: 'navy', estado: 'reunion' },
  { id: 'acuerdo', nombre: 'Acuerdo', color: 'verde', estado: 'acuerdo' },
]
const SIGUE = { por_escribir: ['m1', 'Escribir primer mensaje'], m1: ['rec', 'Escribir recordatorio'], rec: ['reunion', 'Hemos quedado'], reunion: ['acuerdo', 'Hay acuerdo'], acuerdo: ['cerrada', 'Cerrar'] }
const PLANTILLAS = {
  m1: {
    nombre: 'Primer contacto', espera: 7,
    asunto: 'Propuesta para ejecutar las plantaciones de {proyecto}',
    cuerpo: `Hola,

Somos Reforesta, una ONG que restaura terreno con plantaciones de especies autóctonas. Hemos visto que la declaración de impacto ambiental de {proyecto} ({ubicacion}) incluye medidas de plantación ({medida}).

Nos encantaría ofreceros ejecutarlas: nos encargamos del diseño, la plantación y el mantenimiento, y os damos fotos y datos para justificar el cumplimiento ante el órgano ambiental.

¿Podríamos hablar 15 minutos esta semana?

Un saludo,
{nombre}
Reforesta`,
  },
  rec: {
    nombre: 'Recordatorio', espera: 10,
    asunto: 'Re: Propuesta para ejecutar las plantaciones de {proyecto}',
    cuerpo: `Hola de nuevo,

Hace unos días os escribimos sobre las medidas de plantación de {proyecto}. Sabemos que hay mucho en marcha, así que os lo dejamos a mano por si os encaja: podemos pasaros una propuesta sencilla (superficie, especies y calendario) sin ningún compromiso.

¿Os viene bien una llamada breve?

Un saludo,
{nombre}
Reforesta`,
  },
}
const rellenar = (t, e) => t
  .replaceAll('{proyecto}', e.proyecto || 'vuestro proyecto').replaceAll('{promotor}', nombreCorto(e)).replaceAll('{ubicacion}', e.ubicacion || 'la zona')
  .replaceAll('{medida}', (e.medidas || []).find(m => /plant|forest|vegetaci|arbol|árbol|arbust|restaur|repobl/i.test(m.texto))?.texto.toLowerCase().slice(0, 90) || 'medidas ambientales')
  .replaceAll('{boe}', e.url || '').replaceAll('{nombre}', nombreGuardado() || 'El equipo de')

export default function Empresas({ top, radar, q, cambiarEstado, tab }) {
  const [seg, setSeg] = useState('nueva')
  const [borrador, setBorrador] = useState(null)   // {e, plantilla}
  const todas = radar.empresas
  const hoy = hoyISO()
  const vistas = tab.datos.vistas

  // «Nuevas de hoy»: el primer día que el equipo ve una empresa se apunta (compartido, en /api/tablero).
  // La primera vez que se abre solo se consideran nuevas las publicadas en el BOE en las últimas dos semanas.
  useEffect(() => {
    if (!tab.listo || !radar.emp) return
    const faltan = todas.filter(e => !vistas[e.id])
    if (!faltan.length) return
    const primera = Object.keys(vistas).length === 0
    tab.cambiarRaiz(d => ({ ...d, vistas: { ...d.vistas, ...Object.fromEntries(faltan.map(e => [e.id, primera && !(e.fecha && diasDesde(e.fecha) <= 14) ? 'antes' : hoy])) } }))
  }, [tab.listo, radar.emp, todas.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const cuenta = k => todas.filter(e => etapaEmpresa(e) === k).length
  const filtro = e => !q || `${e.promotor} ${e.proyecto} ${e.ubicacion}`.toLowerCase().includes(q.toLowerCase())
  const nuevas = useMemo(() => todas.filter(e => etapaEmpresa(e) === 'nueva' && filtro(e)), [todas, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const top5 = useMemo(() => nuevas.filter(e => e.accion !== 'descarta').sort(porEncaje).slice(0, 5), [nuevas])
  const deHoy = useMemo(() => nuevas.filter(e => vistas[e.id] === hoy).sort(porEncaje), [nuevas, vistas, hoy])
  const resto = useMemo(() => nuevas.filter(e => !top5.includes(e) && !deHoy.includes(e)).sort(porEncaje), [nuevas, top5, deHoy])
  const otras = useMemo(() => todas.filter(e => etapaEmpresa(e) === seg && filtro(e)).sort(porEncaje), [todas, seg, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const ofrecer = e => cambiarEstado(e, 'contactada', 'Pasa a «En contacto»', ['Escribirles', () => { setSeg('contactada'); setBorrador({ e, plantilla: 'm1' }) }])
  const acciones = e => (
    <div className="em-acc">
      <button className="i-btn p sm" onClick={() => ofrecer(e)}><Icon n="send" s={17} />Ofrecernos a ejecutarlo</button>
      <button className="i-link" onClick={() => cambiarEstado(e, 'descartada', 'Empresa descartada')}>No nos interesa</button>
    </div>
  )

  return (
    <>
      {top('Empresas · BOE')}
      <div className="em">
        <div className="i-head" style={{ alignItems: 'center', marginBottom: 6 }}>
          <div className="i-seg" role="group" aria-label="Fase">{SEGS.map(([k, l]) => <button key={k} aria-pressed={seg === k} className={seg === k ? 'on' : ''} onClick={() => setSeg(k)}>{l} · {cuenta(k)}</button>)}</div>
          <p className="i-hint" style={{ maxWidth: 520, textAlign: 'right' }}>Tienen una declaración de impacto ambiental favorable que les obliga a plantar. Podéis ofreceros siempre por su canal público.</p>
        </div>
        {radar.emp == null && <div className="i-card i-empty">Todavía no hay datos de empresas. El radar los genera cada mañana.</div>}

        {radar.emp != null && seg === 'nueva' && (
          <>
            {nuevas.length === 0 && <div className="i-card i-empty">Nada nuevo por ahora. El radar vuelve a mirar el BOE mañana.</div>}
            {top5.length > 0 && (
              <section className="em-bloque" aria-labelledby="em-top">
                <div className="em-tit"><h2 id="em-top">Las 5 que más encajan</h2><span>Ordenadas por encaje con lo que hace Reforesta</span></div>
                <div className="em-top">{top5.map((e, i) => <Ficha key={e.id} e={e} puesto={i + 1} grande={i === 0} nueva={vistas[e.id] === hoy} pie={acciones(e)} />)}</div>
              </section>
            )}
            {nuevas.length > 0 && (
              <section className="em-bloque em-hoy" aria-labelledby="em-hoy">
                <div className="em-hoy-h">
                  <span className="em-ic"><Icon n="bell" s={22} /></span>
                  <div><h2 id="em-hoy">Nuevas de hoy</h2><p>{deHoy.length
                    ? 'Ey, siguen apareciendo muchas ofertas de empresas, pero estas son las nuevas.'
                    : 'Hoy no ha aparecido ninguna nueva. Os lo diremos en cuanto haya alguna.'}</p></div>
                </div>
                {deHoy.length > 0 && <div className="em-grid">{deHoy.map(e => <Ficha key={e.id} e={e} nueva pie={acciones(e)} />)}</div>}
              </section>
            )}
            {resto.length > 0 && (
              <section className="em-bloque" aria-labelledby="em-resto">
                <div className="em-tit"><h2 id="em-resto">El resto</h2><span>{resto.length} empresas más</span></div>
                <div className="em-grid">{resto.map(e => <Ficha key={e.id} e={e} pie={acciones(e)} />)}</div>
              </section>
            )}
          </>
        )}

        {radar.emp != null && seg === 'contactada' && <Contacto lista={otras} {...{ tab, cambiarEstado, setBorrador }} />}

        {radar.emp != null && (seg === 'cerrada' || seg === 'descartada') && (
          <div className="em-grid">
            {otras.length === 0 && <div className="i-card i-empty" style={{ gridColumn: '1/-1' }}>Nada en esta pestaña.</div>}
            {otras.map(e => <Ficha key={e.id} e={e} pie={<div className="em-acc"><button className="i-btn sm" onClick={() => cambiarEstado(e, 'nueva', 'Vuelve a nuevas')}><Icon n="undo" s={17} />Reabrir</button></div>} />)}
          </div>
        )}
      </div>
      {borrador && <Borrador {...borrador} cerrar={() => setBorrador(null)} tab={tab} />}
    </>
  )
}

// Tarjeta de empresa en bloques: identidad · qué tienen que hacer · datos clave · medidas · acción.
function Ficha({ e, puesto, grande, nueva, pie }) {
  const [ver, setVer] = useState(false)
  const ha = e.superficie_total_ha, tam = mw(e), n = e.encaje ?? 0
  return (
    <article className={`em-card ${grande ? 'grande' : ''}`}>
      <header className="em-id">
        <span className={`em-ini ${TONOS[hash(e.id) % TONOS.length]}`} aria-hidden="true">{iniciales(e)}</span>
        <div className="em-nom"><h3 title={e.promotor}>{nombreCorto(e)}</h3><p title={e.proyecto}>{e.proyecto}</p></div>
        <div className="em-et">{puesto && <span className="i-tag em-pos">Nº {puesto}</span>}{nueva && <span className="i-tag em-nueva">Nueva</span>}</div>
      </header>
      <div className="em-res"><p>{e.resumen}</p></div>
      <dl className="em-datos">
        <div><dt>Sector</dt><dd>{SECTOR[e.tipo] || 'Otro'}</dd></div>
        <div><dt>Ubicación</dt><dd title={e.ubicacion}>{e.ubicacion || 'No indicada'}</dd></div>
        <div><dt>Tamaño</dt><dd className={tam || ha ? '' : 'i-ni'}>{tam || hectareas(ha) || 'No indicado'}</dd></div>
        <div className={`enc ${nivel(n)}`}><dt>Encaje</dt><dd><b>{n}</b><span>/ 100</span></dd></div>
      </dl>
      <div className="em-por">
        <span className="i-tag" style={{ background: 'var(--soft)' }}>{ACCION[e.accion] || ACCION.descarta}</span>
        {nPlantacion(e) > 0 && <span className="i-tag" style={{ background: 'var(--gr-l)', color: 'var(--gr-d)' }}>{nPlantacion(e)} {nPlantacion(e) === 1 ? 'medida' : 'medidas'} de plantación</span>}
        {ha > 0 && <span className="i-tag">{hectareas(ha)} a plantar</span>}
      </div>
      <div className="em-links">
        {(e.medidas || []).length > 0 ? <button className="tc-mas" aria-expanded={ver} onClick={() => setVer(!ver)}>{ver ? 'Ocultar medidas' : `Ver las ${e.medidas.length} medidas`}<Icon n="keyD" s={14} w={2.8} /></button> : <span />}
        {e.url && <a className="i-link" href={e.url} target="_blank" rel="noopener noreferrer">BOE{e.fecha ? ` · ${fechaLarga(e.fecha)}` : ''} ↗</a>}
      </div>
      {ver && <ul className="em-med">{e.medidas.map((m, i) => <li key={i}>{m.texto}{m.superficie_ha ? ` · ${hectareas(m.superficie_ha)}` : ''}</li>)}</ul>}
      {pie && <footer className="em-pie">{pie}</footer>}
    </article>
  )
}

// Segunda fase: tablero de columnas. Arrastrar una empresa a «Primer mensaje» o «Recordatorio» abre el borrador
// con su plantilla; «Reunión» y «Acuerdo» actualizan el estado. Todo se puede hacer con teclado (asa ⠿ o el botón de cada tarjeta).
function Contacto({ lista, tab, cambiarEstado, setBorrador }) {
  const contactos = tab.datos.contactos
  const colDe = useCallback(e => (e.estado === 'reunion' ? 'reunion' : e.estado === 'acuerdo' ? 'acuerdo' : contactos[e.id]?.col || 'por_escribir'), [contactos])
  const extra = useMemo(() => ({ fija: true, disponer: { secs: COLUMNAS.map(c => ({ ...c, fija: true })), posDe: colDe } }), [colDe])
  const t = useSecciones(tab, 'contacto', lista, porEncaje, extra)
  const fijar = (e, col, mas = {}) => tab.cambiarRaiz(d => ({ ...d, contactos: { ...d.contactos, [e.id]: { ...(d.contactos[e.id] || {}), col, ...mas } } }))
  const ir = (e, dest) => {
    const c = COLUMNAS.find(x => x.id === dest)
    if (dest === 'cerrada') return cambiarEstado(e, 'cerrada', 'Movida a cerradas')
    if (c.plantilla) { setBorrador({ e, plantilla: c.plantilla, destino: dest }); return }   // se coloca al marcar como enviado
    fijar(e, dest)
    if (c.estado) cambiarEstado(e, c.estado, `Actualizada: ${c.nombre.toLowerCase()}`)
    else if (e.estado !== 'contactada') cambiarEstado(e, 'contactada', 'Vuelve a «Por escribir»')
  }
  const mover = (id, dest, idx, desde) => {
    const e = lista.find(x => x.id === id)
    if (!e) return
    if (dest === desde) { t.onReordenar(id, dest, idx); return }
    ir(e, dest)
  }
  return (
    <Tablero {...t} layout="columnas" onMover={mover} onColor={undefined} nombreItem={e => nombreCorto(e)} vacio="Arrastrad una empresa aquí"
      izq={<span className="i-hint">Arrastrad cada empresa a la columna siguiente: se prepara el mensaje solo.</span>}
      card={(e, col) => {
        const c = contactos[e.id], ult = c?.envios?.at(-1), toca = c?.recordar && c.recordar <= hoyISO() && col.id === 'm1'
        const sig = SIGUE[col.id]
        return (
          <article className="em-k">
            <div className="em-id">
              <span className={`em-ini peq ${TONOS[hash(e.id) % TONOS.length]}`} aria-hidden="true">{iniciales(e)}</span>
              <div className="em-nom"><h3 title={e.promotor}>{nombreCorto(e)}</h3><p title={e.proyecto}>{e.proyecto}</p></div>
            </div>
            <div className="em-por"><span className="i-tag">{e.ubicacion || 'Sin ubicación'}</span><span className={`i-tag em-enc-t ${nivel(e.encaje ?? 0)}`}>Encaje {e.encaje ?? 0}</span></div>
            {ult && <p className="em-ult"><Icon n="send" s={13} />{PLANTILLAS[ult.plantilla]?.nombre || 'Mensaje'} · {fechaLarga(ult.fecha)}</p>}
            {c?.recordar && col.id === 'm1' && <p className={`em-rec ${toca ? 'toca' : ''}`}><Icon n="clock" s={14} />{toca ? 'Toca escribir el recordatorio' : `Recordatorio el ${fechaLarga(c.recordar)}`}</p>}
            {sig && <button className={`i-btn sm ${toca ? 'p' : ''}`} onClick={() => ir(e, sig[0])}>{`${sig[1]}${sig[0] === 'cerrada' ? '' : ' →'}`}</button>}
            {col.id !== 'por_escribir' && <button className="i-link em-menos" onClick={() => ir(e, 'por_escribir')}>Volver a «Por escribir»</button>}
          </article>
        )
      }} />
  )
}

// Borrador del mensaje: la plantilla ya viene rellena con los datos de la empresa; se puede editar.
function Borrador({ e, plantilla, destino, cerrar, tab }) {
  const pl = PLANTILLAS[plantilla]
  const [asunto, setAsunto] = useState(() => rellenar(pl.asunto, e))
  const [cuerpo, setCuerpo] = useState(() => rellenar(pl.cuerpo, e))
  const [recordar, setRecordar] = useState(plantilla === 'm1')
  const [copiado, setCopiado] = useState(false)
  useEffect(() => { const k = ev => { if (ev.key === 'Escape') cerrar() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [cerrar])
  const copiar = async () => { try { await navigator.clipboard.writeText(`${asunto}\n\n${cuerpo}`); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sin portapapeles */ } }
  const enviado = () => {
    const mas = new Date(); mas.setDate(mas.getDate() + pl.espera)
    const rec = `${mas.getFullYear()}-${String(mas.getMonth() + 1).padStart(2, '0')}-${String(mas.getDate()).padStart(2, '0')}`
    tab.cambiarRaiz(d => {
      const c = d.contactos[e.id] || {}
      return { ...d, contactos: { ...d.contactos, [e.id]: { ...c, col: destino || plantilla, envios: [...(c.envios || []), { plantilla, fecha: hoyISO() }], recordar: recordar ? rec : plantilla === 'm1' ? '' : c.recordar } } }
    })
    cerrar()
  }
  return (
    <div className="i-dim" onClick={cerrar}>
      <div className="i-modal em-bor" role="dialog" aria-modal="true" aria-labelledby="em-bor-t" onClick={ev => ev.stopPropagation()}>
        <div className="i-head" style={{ alignItems: 'center' }}>
          <div><span className="i-tag" style={{ background: 'var(--gr-l)', color: 'var(--gr-d)' }}>Plantilla · {pl.nombre}</span><h2 id="em-bor-t" style={{ fontSize: 26, marginTop: 8 }}>Mensaje para {nombreCorto(e)}</h2></div>
          <button className="i-round" style={{ background: '#F1F3EE' }} onClick={cerrar} aria-label="Cerrar"><Icon n="x" s={18} w={2.4} /></button>
        </div>
        <p className="i-sub" style={{ margin: '4px 0 12px' }}>Ya está rellenado con los datos del proyecto. Cambiad lo que queráis.</p>
        <label className="em-camp">Asunto<input className="i-in" value={asunto} onChange={ev => setAsunto(ev.target.value)} /></label>
        <label className="em-camp">Mensaje<textarea className="i-in" rows={11} value={cuerpo} onChange={ev => setCuerpo(ev.target.value)} autoFocus /></label>
        <p className="em-aviso"><Icon n="info" s={15} />El BOE no publica correos: buscad el de contacto de la empresa por su canal público (web o registro) y pegadlo al enviar.</p>
        {plantilla === 'm1' && <label className="cb"><input type="checkbox" checked={recordar} onChange={ev => setRecordar(ev.target.checked)} />Recordarme en {pl.espera} días si no contestan</label>}
        <div className="em-bor-acc">
          <a className="i-btn" href={`mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`}><Icon n="send" s={18} />Abrir en mi correo</a>
          <button className="i-btn" onClick={copiar}><Icon n={copiado ? 'check' : 'doc'} s={18} w={copiado ? 3 : 2} />{copiado ? 'Copiado' : 'Copiar'}</button>
          <span style={{ flex: 1 }} />
          <button className="i-btn p" onClick={enviado}><Icon n="check" s={19} w={2.6} />Ya lo he enviado</button>
        </div>
      </div>
    </div>
  )
}
