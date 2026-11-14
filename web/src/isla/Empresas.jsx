import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import { Fecha } from './Campos.jsx'
import Menu from './Menu.jsx'
import Tablero from './Tablero.jsx'
import { useSecciones } from '../tablero.js'
import { nombreGuardado } from '../api.js'
import { useRecordado } from '../recordado.js'
import { diasHasta, etapaEmpresa, hectareas } from '../datos.js'

// Pantalla «Empresas»: datos de empresas.json (declaraciones de impacto ambiental del BOE) y su estado
// de contacto con PUT /api/solicitudes/empresa/:id (nueva, contactada, reunion, acuerdo, cerrada, descartada).
//  · Nuevas: rejilla de fichas; cada una se añade a «En contacto» o se descarta.
//  · En contacto (segunda fase): tabla con una fila por empresa y sus fases, con fechas y plantillas de mensaje.
const ICONOS = { nueva: 'inbox', contactada: 'chat', cerrada: 'check', descartada: 'archive' }
const SEGS = [['nueva', 'Nuevas'], ['contactada', 'En contacto'], ['cerrada', 'Cerradas'], ['descartada', 'Descartadas']]
const ACCION = { contactar: 'Contactar', mira: 'Valorar', descarta: 'Descartar' }
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
  const [seg, setSeg] = useRecordado('empresas-seg', 'nueva', ['nueva', 'contactada', 'cerrada', 'descartada'])
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

  const filtro = e => (!q || `${e.promotor} ${e.proyecto} ${e.ubicacion}`.toLowerCase().includes(q.toLowerCase()))
  const nuevas = useMemo(() => todas.filter(e => etapaEmpresa(e) === 'nueva' && filtro(e)).sort(porEncaje), [todas, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const otras = useMemo(() => todas.filter(e => etapaEmpresa(e) === seg && filtro(e)).sort(porEncaje), [todas, seg, q]) // eslint-disable-line react-hooks/exhaustive-deps

  // «Añadir a En contacto» las pasa a la segunda fase (y se puede escribir el primer mensaje desde el aviso).
  const anadir = e => {
    tab.cambiarRaiz(d => ({ ...d, contactos: { ...d.contactos, [e.id]: { col: 'pendiente', fechas: { contactada: hoyISO() }, envios: [] } } }))
    cambiarEstado(e, 'contactada', 'Añadida a «En contacto»', ['Escribir mensaje', () => { setSeg('contactada'); setBorrador({ e, plantilla: 'm1' }) }])
  }
  const acciones = e => (
    <div className="em-acc">
      <button className="i-btn p sm" onClick={() => anadir(e)}><Icon n="plus" s={17} w={2.6} />Añadir a En contacto</button>
      <button className="i-link" onClick={() => cambiarEstado(e, 'descartada', 'Empresa descartada')}>Descartar</button>
    </div>
  )

  return (
    <>
      {top(null, false, <Menu etiqueta="Fase de las empresas" valor={seg} onChange={setSeg} items={SEGS.map(([id, texto]) => ({ id, texto, icono: ICONOS[id] }))} />)}
      <div className="em">
        {radar.emp == null && <div className="i-card i-empty">Todavía no hay datos de empresas. El radar los genera cada mañana.</div>}

        {radar.emp != null && seg === 'nueva' && (
          nuevas.length === 0
            ? <div className="i-card i-empty">Nada nuevo por ahora. El radar vuelve a mirar el BOE mañana.</div>
            : <div className="em-grid em-g4">{nuevas.map(e => <Ficha key={e.id} e={e} nueva={vistas[e.id] === hoy} pie={acciones(e)} />)}</div>
        )}

        {radar.emp != null && seg === 'contactada' && <Contacto lista={otras} {...{ tab, cambiarEstado, setBorrador }} />}

        {radar.emp != null && (seg === 'cerrada' || seg === 'descartada') && (
          otras.length === 0
            ? <div className="i-card i-empty">Nada en esta pestaña.</div>
            : <div className="em-grid em-g4">{otras.map(e => <Ficha key={e.id} e={e} pie={<div className="em-acc"><button className="i-btn sm" onClick={() => cambiarEstado(e, 'nueva', 'Vuelve a nuevas')}><Icon n="undo" s={17} />Reabrir</button></div>} />)}</div>
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
      <div className="em-res"><small className="em-que">Qué abarca</small><p>{e.que_abarca || e.resumen}</p></div>
      <dl className="em-datos">
        <div className="ubi"><dt>Ubicación</dt><dd title={e.ubicacion}>{e.ubicacion || 'No indicada'}</dd></div>
        <div><dt>Sector</dt><dd>{SECTOR[e.tipo] || 'Otro'}</dd></div>
        <div><dt>Tamaño</dt><dd className={tam || ha ? '' : 'i-ni'}>{tam || hectareas(ha) || 'No indicado'}</dd></div>
        <div className={`enc ${nivel(n)}`}><dt>Afinidad</dt><dd><b>{n}</b><span>/ 100</span></dd></div>
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

// Segunda fase, agrupada por lo que toca hacer: Toca escribir → Esperando respuesta → Reunión.
// Cada empresa muestra su contacto (correo, teléfono, web; el BOE no lo trae, se añade a mano o se busca con un clic)
// y el siguiente paso con su botón. Los recordatorios y reuniones se pueden bajar al calendario (.ics).
const diaSemana = f => new Date(`${f}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
function descargarIcs({ titulo, fecha, descripcion }) {
  const ymd = fecha.replace(/-/g, '')
  const sig = new Date(`${fecha}T00:00:00`); sig.setDate(sig.getDate() + 1)
  const fin = `${sig.getFullYear()}${String(sig.getMonth() + 1).padStart(2, '0')}${String(sig.getDate()).padStart(2, '0')}`
  const esc = t => String(t).replace(/[\\;,]/g, m => `\\${m}`).replace(/\n/g, '\\n')
  const cuerpo = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Radar de Reforesta//ES', 'BEGIN:VEVENT', `UID:${ymd}-${Math.random().toString(36).slice(2)}@radar-reforesta`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${fin}`, `SUMMARY:${esc(titulo)}`, `DESCRIPTION:${esc(descripcion || '')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const url = URL.createObjectURL(new Blob([cuerpo], { type: 'text/calendar' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'recordatorio-reforesta.ics' })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
const IcoMail = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 8 8 6 8-6" /></svg>

// Contacto de una empresa: el que guarda el equipo y, si no hay, el que encontró la IA del radar en internet
// (e.contacto_ia: web, email, teléfono y formulario corporativos, con sus fuentes). ia: true = sin comprobar.
function contactoDe(tab, e) {
  const c = tab.datos.contactos[e.id]?.contacto || {}
  if (c.email || c.telefono || c.web) return { ...c, ia: false }
  const ia = e.contacto_ia
  return ia ? { email: ia.email || '', telefono: ia.telefono || '', web: ia.web || '', formulario: ia.formulario || '', grupo: ia.grupo || '', fuentes: ia.fuentes || [], ia: true } : {}
}

// Correo, teléfono y web de la empresa (guardados en el tablero compartido). Si no hay, se enseña lo que
// encontró la IA («Encontrado con IA · comprobadlo») con un botón para darlo por bueno.
function Contactos({ e, tab }) {
  const c = contactoDe(tab, e)
  const [editando, setEditando] = useState(false)
  const [f, setF] = useState({ email: c.email || '', telefono: c.telefono || '', web: c.web || '' })
  const [copiado, setCopiado] = useState('')
  const hay = c.email || c.telefono || c.web
  const guardarComo = v => tab.cambiarRaiz(d => { const x = d.contactos[e.id] || {}; return { ...d, contactos: { ...d.contactos, [e.id]: { ...x, contacto: v } } } })
  const guardar = ev => {
    ev.preventDefault()
    guardarComo({ email: f.email.trim(), telefono: f.telefono.trim(), web: f.web.trim() })
    setEditando(false)
  }
  const usarIA = () => guardarComo({ email: c.email, telefono: c.telefono, web: c.web })
  const copiar = async (t, k) => { try { await navigator.clipboard.writeText(t); setCopiado(k); setTimeout(() => setCopiado(''), 1800) } catch { /* sin portapapeles */ } }
  const buscar = `https://www.google.com/search?q=${encodeURIComponent(`${nombreCorto(e)} contacto`)}`
  const chip = (k, icono, texto, href) => (
    <span key={k} className="n2-c">{icono}{href ? <a href={href} target={k === 'web' ? '_blank' : undefined} rel="noopener noreferrer"><b>{texto}</b></a> : <b>{texto}</b>}
      <button type="button" aria-label={`Copiar ${texto}`} onClick={() => copiar(texto, k)}>{copiado === k ? <Icon n="check" s={15} w={3} /> : <Icon n="doc" s={15} />}</button></span>
  )
  if (editando) {
    return (
      <form className="n2-form" onSubmit={guardar}>
        <label>Correo<input className="i-in" type="email" autoFocus maxLength={120} placeholder="info@empresa.es" value={f.email} onChange={ev => setF({ ...f, email: ev.target.value })} /></label>
        <label>Teléfono<input className="i-in" maxLength={40} placeholder="91 000 00 00" value={f.telefono} onChange={ev => setF({ ...f, telefono: ev.target.value })} /></label>
        <label>Web<input className="i-in" maxLength={120} placeholder="empresa.es" value={f.web} onChange={ev => setF({ ...f, web: ev.target.value })} /></label>
        <div className="acc"><button className="i-btn p sm" type="submit">Guardar</button><button type="button" className="i-btn sm" onClick={() => setEditando(false)}>Cancelar</button></div>
      </form>
    )
  }
  return (
    <>
      {c.email && chip('email', IcoMail, c.email, `mailto:${c.email}`)}
      {c.telefono && chip('tel', <Icon n="phone" s={16} />, c.telefono, `tel:${c.telefono.replace(/\s/g, '')}`)}
      {c.web && chip('web', <Icon n="globe" s={16} />, c.web.replace(/^https?:\/\//, ''), /^https?:/.test(c.web) ? c.web : `https://${c.web}`)}
      {c.ia && c.formulario && chip('form', <Icon n="ext" s={16} />, 'Formulario de contacto', c.formulario)}
      {!hay && !c.formulario && <div className="n2-no">Aún no tenéis un contacto de esta empresa. El BOE no lo publica.</div>}
      {c.ia && (
        <p className="n2-ia"><span>✨ Encontrado con IA en internet · comprobadlo</span>
          {c.grupo && <> Es del grupo <b>{c.grupo}</b>.</>}
          {c.fuentes?.[0] && <> <a href={c.fuentes[0]} target="_blank" rel="noopener noreferrer">Ver fuente ↗</a></>}</p>
      )}
      <div className="n2-bot">
        {c.ia && hay && <button className="i-btn sm p" onClick={usarIA}><Icon n="check" s={16} w={3} />Es correcto</button>}
        <button className="i-btn sm" onClick={() => { setF({ email: c.email || '', telefono: c.telefono || '', web: c.web || '' }); setEditando(true) }}><Icon n={hay ? 'undo' : 'plus'} s={16} w={2.6} />{hay ? (c.ia ? 'Corregir' : 'Cambiar contacto') : 'Añadir correo o teléfono'}</button>
        {!hay && <a className="i-btn sm" href={buscar} target="_blank" rel="noopener noreferrer"><Icon n="search" s={16} />Buscar contacto</a>}
      </div>
      {!c.ia && <p className="n2-f">{hay ? 'Añadido por vosotros' : 'La búsqueda se abre en otra pestaña'}</p>}
    </>
  )
}

// Columnas de «En contacto», estilo Trello. Se pasa de una a otra arrastrando la tarjeta o con el botón de cada paso.
const COLS = [
  { id: 'pendiente', nombre: 'Pendiente de contactar', color: 'ambar', nota: 'Aún sin mensaje', fija: true },
  { id: 'contacto', nombre: 'En contacto', color: 'azul', nota: 'Esperando respuesta', fija: true },
  { id: 'reunion', nombre: 'Reunión', color: 'verde', nota: 'Acordada', fija: true },
]
function Contacto({ lista, tab, cambiarEstado, setBorrador }) {
  // Tarjetas plegadas: solo la cabecera; al pulsarla se despliega el resto.
  const [abiertas, setAbiertas] = useState(() => new Set())
  const alternar = id => setAbiertas(x => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const contactos = tab.datos.contactos
  const datosDe = e => contactos[e.id] || {}
  const colDe = e => (e.estado === 'reunion' ? 'reunion' : datosDe(e).col === 'pendiente' ? 'pendiente' : datosDe(e).col === 'contacto' || datosDe(e).envios?.length ? 'contacto' : 'pendiente')
  const extra = useMemo(() => ({ fija: true, disponer: { secs: COLS, posDe: colDe } }), [contactos]) // eslint-disable-line react-hooks/exhaustive-deps
  const t = useSecciones(tab, 'contacto', lista, porEncaje, extra)
  const poner = (e, mas) => tab.cambiarRaiz(d => { const c = d.contactos[e.id] || {}; return { ...d, contactos: { ...d.contactos, [e.id]: { ...c, ...mas } } } })
  const fecha = (e, k, v) => poner(e, { fechas: { ...(datosDe(e).fechas || {}), [k]: v } })
  const ir = (e, dest) => {
    if (dest === colDe(e)) return
    if (dest === 'contacto') {
      if (e.estado === 'reunion') cambiarEstado(e, 'contactada', 'Vuelve a «En contacto»')
      if (datosDe(e).envios?.length) return poner(e, { col: 'contacto' })
      return setBorrador({ e, plantilla: 'm1' })        // se coloca al marcar el mensaje como enviado
    }
    if (dest === 'reunion') { poner(e, { col: 'contacto' }); return cambiarEstado(e, 'reunion', 'Pasa a «Reunión»') }
    if (e.estado === 'reunion') cambiarEstado(e, 'contactada', 'Vuelve a «Pendiente de contactar»')
    poner(e, { col: 'pendiente' })
  }
  const mover = (id, dest, idx, desde) => {
    const e = lista.find(x => x.id === id)
    if (!e) return
    if (dest === desde) t.onReordenar(id, dest, idx)
    else ir(e, dest)
  }
  const Cal = ({ e, f, titulo, texto }) => (
    <button className="i-btn sm" onClick={() => descargarIcs({ titulo: `${titulo} ${nombreCorto(e)}`, fecha: f, descripcion: `${e.proyecto}. ${e.url || ''}` })}><Icon n="cal" s={16} />{texto}</button>
  )
  return (
    <Tablero {...t} layout="columnas" onMover={mover} onColor={undefined} nombreItem={e => nombreCorto(e)} vacio="Arrastrad una empresa aquí"
      izq={<span className="i-hint">Arrastrad cada empresa a la columna siguiente.</span>}
      card={(e, col) => {
        const c = datosDe(e), fs = c.fechas || {}, ult = c.envios?.at(-1)
        const cc = contactoDe(tab, e), tiene = cc.email || cc.telefono || cc.web
        const dias = fs.volver ? diasHasta(fs.volver) : null, toca = dias !== null && dias <= 0
        return (
          <article className={`tc k3 ${abiertas.has(e.id) ? 'abierta' : 'plegada'}`}>
            <button type="button" className="k3-cab" aria-expanded={abiertas.has(e.id)} onClick={() => alternar(e.id)}>
              <span className={`em-ini peq ${TONOS[hash(e.id) % TONOS.length]}`} aria-hidden="true">{iniciales(e)}</span>
              <span className="em-nom"><b title={e.promotor}>{nombreCorto(e)}</b><small title={e.proyecto}>{e.proyecto}</small>
                <span className={`k3-res ${toca ? 'hot' : ''}`}>
                  {col.id === 'pendiente' && (tiene ? <><Icon n="check" s={12} w={3} />Contacto listo · falta escribir</> : 'Sin contacto todavía')}
                  {col.id === 'contacto' && (fs.volver ? (toca ? 'Toca volver a escribir' : `Volver a escribir el ${fechaLarga(fs.volver)}`) : 'Esperando respuesta')}
                  {col.id === 'reunion' && (fs.reunion ? `Reunión el ${fechaLarga(fs.reunion)}` : 'Falta fecha de reunión')}
                </span></span>
              <span className={`i-tag em-enc-t ${nivel(e.encaje ?? 0)}`}>{e.encaje ?? 0}</span>
              <svg className="k3-fl" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {abiertas.has(e.id) && <>
            <div className="k3-tags"><span className="tb-mut">Afinidad {e.encaje ?? 0} / 100</span><button className="i-link" onClick={() => cambiarEstado(e, 'descartada', 'Empresa descartada')}>Descartar</button></div>
            <div className="k3-con"><small>Contacto</small><Contactos e={e} tab={tab} /></div>
            {col.id === 'pendiente' && (
              <div className="k3-acc"><button className={`i-btn sm ${tiene ? 'p' : ''}`} onClick={() => setBorrador({ e, plantilla: 'm1' })}><Icon n="send" s={16} />Escribir mensaje</button></div>
            )}
            {col.id === 'contacto' && (
              <div className="k3-paso">
                {ult && <p className="k3-f ok"><Icon n="check" s={13} w={3} />{ult.plantilla === 'rec' ? 'Recordatorio enviado' : 'Mensaje enviado'} el {fechaLarga(ult.fecha)}</p>}
                <b className={toca ? 'hot' : ''}>{fs.volver ? (toca ? 'Toca volver a escribir' : `Volver a escribir el ${fechaLarga(fs.volver)}`) : 'Poned una fecha para volver a escribir'}</b>
                {dias !== null && !toca && <span>Faltan {dias} {dias === 1 ? 'día' : 'días'}</span>}
                <div className="i-fecha">Volver a contactar<Fecha etiqueta="Volver a contactar" valor={fs.volver || ''} onCambio={v => fecha(e, 'volver', v)} /></div>
                <div className="k3-acc"><button className={`i-btn sm ${toca ? 'p' : ''}`} onClick={() => setBorrador({ e, plantilla: 'rec' })}><Icon n="send" s={16} />Escribir recordatorio</button>
                  {fs.volver && <Cal e={e} f={fs.volver} titulo="Volver a escribir a" texto="Añadir al calendario" />}
                  <button className="i-btn sm" onClick={() => ir(e, 'reunion')}>Han contestado</button></div>
              </div>
            )}
            {col.id === 'reunion' && (
              <div className="k3-paso">
                <b>{fs.reunion ? diaSemana(fs.reunion) : 'Poned la fecha de la reunión'}</b>
                <span>Preparad: superficie, especies y calendario de plantación.</span>
                <div className="i-fecha">Fecha de la reunión<Fecha etiqueta="Fecha de la reunión" valor={fs.reunion || ''} onCambio={v => fecha(e, 'reunion', v)} /></div>
                <div className="k3-acc">{fs.reunion && <Cal e={e} f={fs.reunion} titulo="Reunión con" texto="Añadir al calendario" />}
                  <button className="i-btn sm" onClick={() => cambiarEstado(e, 'cerrada', 'Movida a cerradas')}>Hay acuerdo</button></div>
              </div>
            )}
            </>}
          </article>
        )
      }} />
  )
}

// Borrador del mensaje: la plantilla ya viene rellena con los datos de la empresa; se puede editar.
function Borrador({ e, plantilla, cerrar, tab }) {
  const pl = PLANTILLAS[plantilla]
  const [asunto, setAsunto] = useState(() => rellenar(pl.asunto, e))
  const [cuerpo, setCuerpo] = useState(() => rellenar(pl.cuerpo, e))
  const [recordar, setRecordar] = useState(true)
  const [copiado, setCopiado] = useState(false)
  useEffect(() => { const k = ev => { if (ev.key === 'Escape') cerrar() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [cerrar])
  const copiar = async () => { try { await navigator.clipboard.writeText(`${asunto}\n\n${cuerpo}`); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sin portapapeles */ } }
  const enviado = () => {
    const fase = plantilla === 'rec' ? 'recordatorio' : 'contactada'
    tab.cambiarRaiz(d => {
      const c = d.contactos[e.id] || {}
      return { ...d, contactos: { ...d.contactos, [e.id]: { ...c, col: 'contacto', envios: [...(c.envios || []), { plantilla, fecha: hoyISO() }],
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
        {!contactoDe(tab, e).email && <p className="em-aviso"><Icon n="info" s={15} />Aún no tenéis el correo de esta empresa (el BOE no lo publica). Añadidlo en su ficha o pegadlo al enviar.</p>}
        <label className="cb"><input type="checkbox" checked={recordar} onChange={ev => setRecordar(ev.target.checked)} />Recordarme en {pl.espera} días si no contestan</label>
        <div className="em-bor-acc">
          <a className="i-btn" href={`mailto:${contactoDe(tab, e).email || ''}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`}><Icon n="send" s={18} />Abrir en mi correo</a>
          <button className="i-btn" onClick={copiar}><Icon n={copiado ? 'check' : 'doc'} s={18} w={copiado ? 3 : 2} />{copiado ? 'Copiado' : 'Copiar'}</button>
          <span style={{ flex: 1 }} />
          <button className="i-btn p" onClick={enviado}><Icon n="check" s={19} w={2.6} />Ya lo he enviado</button>
        </div>
      </div>
    </div>
  )
}
