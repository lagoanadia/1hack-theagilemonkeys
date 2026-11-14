import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { nombreGuardado } from '../api.js'
import { etapaEmpresa, hectareas } from '../datos.js'

// Pantalla «Empresas»: datos de empresas.json (declaraciones de impacto ambiental del BOE) y su estado
// de contacto con PUT /api/solicitudes/empresa/:id (nueva, contactada, reunion, acuerdo, cerrada, descartada).
//  · Nuevas: rejilla de fichas; cada una se añade a «En contacto» o se descarta.
//  · En contacto (segunda fase): tabla con una fila por empresa y sus fases, con fechas y plantillas de mensaje.
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

// Fase de contacto (segunda fase): una fila por empresa y una celda por fase. Contactadas y Recordatorio llevan plantilla.
const FASES = [
  { id: 'contactada', nombre: 'Contactadas', plantilla: 'm1' },
  { id: 'recordatorio', nombre: 'Recordatorio', plantilla: 'rec' },
  { id: 'reunion', nombre: 'Reunión', estado: 'reunion' },
  { id: 'cerrada', nombre: 'Cerradas', estado: 'cerrada' },
]
const mas = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
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
  const nuevas = useMemo(() => todas.filter(e => etapaEmpresa(e) === 'nueva' && filtro(e)).sort(porEncaje), [todas, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const otras = useMemo(() => todas.filter(e => etapaEmpresa(e) === seg && filtro(e)).sort(porEncaje), [todas, seg, q]) // eslint-disable-line react-hooks/exhaustive-deps

  // «Añadir a En contacto» las pasa a la segunda fase (y se puede escribir el primer mensaje desde el aviso).
  const anadir = e => {
    tab.cambiarRaiz(d => ({ ...d, contactos: { ...d.contactos, [e.id]: { col: 'contactada', fechas: { contactada: hoyISO() }, envios: [] } } }))
    cambiarEstado(e, 'contactada', 'Añadida a «En contacto»', ['Escribir mensaje', () => { setSeg('contactada'); setBorrador({ e, plantilla: 'm1', destino: 'contactada' }) }])
  }
  const acciones = e => (
    <div className="em-acc">
      <button className="i-btn p sm" onClick={() => anadir(e)}><Icon n="plus" s={17} w={2.6} />Añadir a En contacto</button>
      <button className="i-link" onClick={() => cambiarEstado(e, 'descartada', 'Empresa descartada')}>Descartar</button>
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
          nuevas.length === 0
            ? <div className="i-card i-empty">Nada nuevo por ahora. El radar vuelve a mirar el BOE mañana.</div>
            : <div className="em-grid em-g4">{nuevas.map(e => <Ficha key={e.id} e={e} nueva={vistas[e.id] === hoy} pie={acciones(e)} />)}</div>
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

// Segunda fase: una fila por empresa y una celda por fase. La fase actual se marca y lleva su fecha (cuándo se
// contactó, cuándo volver a contactar, cuándo es la reunión); las anteriores salen hechas y las siguientes vacías.
// Se mueve arrastrando la fila a otra fase o pulsando la celda («Mover aquí»); Contactadas y Recordatorio abren el borrador.
function Contacto({ lista, tab, cambiarEstado, setBorrador }) {
  const contactos = tab.datos.contactos
  const [arrastra, setArrastra] = useState(null)
  const dragId = useRef(null)   // síncrono: los eventos de arrastre llegan antes que el render
  const [sobre, setSobre] = useState(null)
  const hoy = hoyISO()
  const faseDe = e => (e.estado === 'reunion' ? 'reunion' : contactos[e.id]?.col === 'recordatorio' ? 'recordatorio' : 'contactada')
  const fijar = (e, col, fechas = {}) => tab.cambiarRaiz(d => { const c = d.contactos[e.id] || {}; return { ...d, contactos: { ...d.contactos, [e.id]: { ...c, col, fechas: { ...(c.fechas || {}), ...fechas } } } } })
  const fecha = (e, k, v) => tab.cambiarRaiz(d => { const c = d.contactos[e.id] || {}; return { ...d, contactos: { ...d.contactos, [e.id]: { ...c, fechas: { ...(c.fechas || {}), [k]: v } } } } })
  const ir = (e, dest) => {
    if (dest === faseDe(e)) return
    const f = FASES.find(x => x.id === dest)
    if (f.plantilla) { if (e.estado === 'reunion') cambiarEstado(e, 'contactada', 'Vuelve a contactadas'); return setBorrador({ e, plantilla: f.plantilla, destino: dest }) }   // se coloca al marcar como enviado
    if (dest === 'cerrada') return cambiarEstado(e, 'cerrada', 'Movida a cerradas')
    fijar(e, dest, { [dest]: contactos[e.id]?.fechas?.[dest] || hoy })
    if (f.estado) cambiarEstado(e, f.estado, `Actualizada: ${f.nombre.toLowerCase()}`)
  }
  return (
    <div className="ec" role="table" aria-label="Empresas en contacto, por fase">
      <div className="ec-cab" role="row"><span role="columnheader">Empresas</span>{FASES.map(f => <span key={f.id} role="columnheader">{f.nombre}</span>)}</div>
      {lista.length === 0 && <div className="i-card i-empty">Ninguna en contacto. Añadid empresas desde «Nuevas».</div>}
      {lista.map(e => {
        const c = contactos[e.id] || {}, fs = c.fechas || {}, k = FASES.findIndex(f => f.id === faseDe(e))
        const toca = fs.volver && fs.volver <= hoy && k < 2
        return (
          <div key={e.id} role="row" className={`ec-fila ${arrastra === e.id ? 'lev' : ''}`} draggable
            onPointerDown={ev => { ev.currentTarget.draggable = !ev.target.closest('input,select,textarea,a,button') }}
            onDragStart={ev => { ev.dataTransfer.setData('text/plain', e.id); ev.dataTransfer.effectAllowed = 'move'; dragId.current = e.id; requestAnimationFrame(() => setArrastra(dragId.current)) }}
            onDragEnd={() => { dragId.current = null; setArrastra(null); setSobre(null) }}>
            <div className="ec-emp" role="cell">
              <span className="em-grip" aria-hidden="true"><svg width="12" height="16" viewBox="0 0 14 18" fill="currentColor">{[3, 9, 15].map(y => [3, 11].map(x => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" />))}</svg></span>
              <span className={`em-ini peq ${TONOS[hash(e.id) % TONOS.length]}`} aria-hidden="true">{iniciales(e)}</span>
              <div className="em-nom"><h3 title={e.promotor}>{nombreCorto(e)}</h3><p title={e.proyecto}>{e.proyecto}</p>
                <div className="ec-pie"><span className={`i-tag em-enc-t ${nivel(e.encaje ?? 0)}`}>Encaje {e.encaje ?? 0}</span>{toca && <span className="i-tag em-nueva">Toca volver a contactar</span>}
                  <button className="i-link" onClick={() => cambiarEstado(e, 'descartada', 'Empresa descartada')}>Descartar</button></div></div>
            </div>
            {FASES.map((f, i) => {
              const hecha = i < k, actual = i === k, abajo = sobre && sobre.id === e.id && sobre.f === f.id
              return (
                <div key={f.id} role="cell" className={`ec-cel ${hecha ? 'hecha' : actual ? 'actual' : ''} ${abajo ? 'sobre' : ''}`}
                  onDragOver={ev => { if (dragId.current === e.id) { ev.preventDefault(); setSobre({ id: e.id, f: f.id }) } }} onDragLeave={() => setSobre(null)}
                  onDrop={ev => { ev.preventDefault(); setSobre(null); if (dragId.current === e.id) ir(e, f.id); dragId.current = null }}>
                  <i className="ec-nodo" aria-hidden="true">{hecha && <Icon n="check" s={12} w={3.6} />}</i>
                  {hecha && <span className="ec-t">{fs[f.id] ? `${f.id === 'contactada' ? 'Contactada' : f.id === 'recordatorio' ? 'Recordatorio enviado' : f.nombre} · ${fechaLarga(fs[f.id])}` : f.nombre}</span>}
                  {actual && f.id === 'contactada' && <>
                    <b>{fs.contactada ? `Desde el ${fechaLarga(fs.contactada)}` : 'En contacto'}</b>
                    {c.envios?.length ? <label className="ec-f">Volver a contactar<input type="date" className="i-in" value={fs.volver || ''} onChange={ev => fecha(e, 'volver', ev.target.value)} /></label>
                      : <button className="i-btn sm p" onClick={() => setBorrador({ e, plantilla: 'm1', destino: 'contactada' })}>Escribir mensaje</button>}</>}
                  {actual && f.id === 'recordatorio' && <>
                    <b>Enviado el {fs.recordatorio ? fechaLarga(fs.recordatorio) : '—'}</b>
                    <label className="ec-f">Volver a contactar<input type="date" className="i-in" value={fs.volver || ''} onChange={ev => fecha(e, 'volver', ev.target.value)} /></label></>}
                  {actual && f.id === 'reunion' && <>
                    <b>{fs.reunion ? `Reunión el ${fechaLarga(fs.reunion)}` : 'Reunión'}</b>
                    <label className="ec-f">{fs.reunion ? 'Cambiar fecha' : 'Poner fecha'}<input type="date" className="i-in" value={fs.reunion || ''} onChange={ev => fecha(e, 'reunion', ev.target.value)} /></label></>}
                  {i > k && <button className="ec-mover" onClick={() => ir(e, f.id)} aria-label={`Mover ${nombreCorto(e)} a ${f.nombre}`}>{i === k + 1 ? 'Siguiente fase →' : 'Mover aquí'}</button>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// Borrador del mensaje: la plantilla ya viene rellena con los datos de la empresa; se puede editar.
function Borrador({ e, plantilla, destino, cerrar, tab }) {
  const pl = PLANTILLAS[plantilla]
  const [asunto, setAsunto] = useState(() => rellenar(pl.asunto, e))
  const [cuerpo, setCuerpo] = useState(() => rellenar(pl.cuerpo, e))
  const [recordar, setRecordar] = useState(true)
  const [copiado, setCopiado] = useState(false)
  useEffect(() => { const k = ev => { if (ev.key === 'Escape') cerrar() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [cerrar])
  const copiar = async () => { try { await navigator.clipboard.writeText(`${asunto}\n\n${cuerpo}`); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sin portapapeles */ } }
  const enviado = () => {
    const fase = destino || (plantilla === 'rec' ? 'recordatorio' : 'contactada')
    tab.cambiarRaiz(d => {
      const c = d.contactos[e.id] || {}
      return { ...d, contactos: { ...d.contactos, [e.id]: { ...c, col: fase, envios: [...(c.envios || []), { plantilla, fecha: hoyISO() }],
        fechas: { ...(c.fechas || {}), [fase]: hoyISO(), ...(recordar ? { volver: mas(pl.espera) } : {}) } } } }
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
        <label className="cb"><input type="checkbox" checked={recordar} onChange={ev => setRecordar(ev.target.checked)} />Recordarme en {pl.espera} días si no contestan</label>
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
