import { useRef, Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { plant } from './lp.js'
import { api } from '../api.js'
import { LINEAS, descartadaPor, etapaDe, fechaCorta } from '../datos.js'
import Menu from './Menu.jsx'
import { useRecordado } from '../recordado.js'
import { useProgresoDocs } from './papeles.js'

// Pantalla «Convocatorias»: Radar → En proceso → Presentado, y Descartadas (icono aparte).
// Datos: convocatorias.json (radar) + estados del equipo (API /solicitudes, ver radar.js)
// + siguiente paso, fecha y avisos de cada solicitud (GET /api/seguimiento).
// Estados de la API: por_revisar / mas_tarde = Radar · preparando = En proceso · presentada y siguientes = Presentado.
const pend = x => x.estado === 'por_revisar' || x.estado === 'mas_tarde'
const ETIQ_RUTA = { descartada: 'Descartada', preparando: 'En proceso' }
const VEREDICTO = {
  presenta: ['Sí, merece la pena presentarla', 'check', ''],
  mira: ['Mirad antes de decidir', 'eye', 'mira'],
  pendiente: ['Aún sin analizar por la IA', 'later', 'pen'],
  descarta: ['El radar la descartó', 'x', 'no'],
}
const plazoTxt = a => (a.plazo == null ? 'Sin fecha' : a.dias < 0 ? 'Cerrada' : a.dias === 0 ? 'Hoy' : `${a.plazoEstimado ? '≈ ' : ''}${a.dias} días`)
const AVISOS_TXT = { nunca: 'Sin avisos por correo', cada_manana: 'Avisos por correo cada mañana', semanal: 'Avisos por correo cada lunes' }
// Cuenta atrás de un siguiente paso (días que faltan según GET /api/seguimiento).
const cuenta = dias => (dias === null || dias === undefined ? 'Sin fecha' : dias < 0 ? `Hace ${-dias} ${dias === -1 ? 'día' : 'días'}` : dias === 0 ? 'Hoy' : `${dias} ${dias === 1 ? 'día' : 'días'}`)
const segDe = (seg, id) => (seg?.en_marcha || []).find(x => x.tipo === 'convocatoria' && x.id === id)

// Título breve: la frase-resumen del radar si es más corta que el nombre oficial (el nombre completo sale al pasar el ratón).
const tituloCorto = a => { const r = (a.resumen || '').trim(); return r && r !== a.titulo && r.length < a.titulo.length ? r : a.titulo }
// Enlace a la ficha oficial que resalta la frase en el navegador (fragmento de texto: #:~:text=inicio,fin).
const enlaceFrase = a => {
  const w = (a.cita || '').split(/\s+/).filter(Boolean), cod = t => encodeURIComponent(t).replace(/-/g, '%2D')
  if (w.length < 4) return a.url
  return `${a.url}#:~:text=${cod(w.slice(0, 4).join(' '))}${w.length > 8 ? ',' + cod(w.slice(-4).join(' ')) : ''}`
}

export default function Convocatorias(props) {
  const { radar, visibles, etapa, ir, top, seg, perfil } = props
  const menu = (
    <Menu etiqueta="Fase de las convocatorias" valor={etapa} onChange={ir} items={[
      { id: 'revisar', icono: 'radar', texto: 'Radar' }, { id: 'preparando', icono: 'doc', texto: 'En proceso' },
      { id: 'presentadas', icono: 'send', texto: 'Presentado' }, { id: 'descartadas', icono: 'archive', texto: 'Descartadas', separador: true }]} />
  )
  return (
    <>
      {top(null, false, menu)}
      {etapa === 'revisar' && <Revisar {...props} generado={radar.conv?.generado} />}
      {etapa === 'preparando' && <Preparando {...props} lista={visibles.filter(a => etapaDe(a) === 'preparando')} />}
      {etapa === 'presentadas' && <Presentado {...props} seg={seg} perfil={perfil} lista={visibles.filter(a => etapaDe(a) === 'presentadas')} />}
      {etapa === 'descartadas' && <Descartadas {...props} lista={visibles.filter(a => etapaDe(a) === 'descartadas')} />}
    </>
  )
}

// Barra de posición: un círculo por convocatoria de la ruta; el grande es en la que estáis.
function Pasos({ ruta, a, setCurId }) {
  const mucho = ruta.length > 8
  const cur = a ? ruta.indexOf(a) : ruta.length
  return (
    <div className={`i-pasos ${mucho ? 'many' : ''}`} role="group" aria-label={a ? `Convocatoria ${cur + 1} de ${ruta.length}` : `${ruta.length} convocatorias, todas clasificadas`}>
      {ruta.map((x, i) => {
        const actual = i === cur, hecha = !pend(x)
        return (
          <Fragment key={x.id}>
            <button className={`p ${actual ? 'cur' : hecha ? 'ok' : ''}`} onClick={() => setCurId(x.id)} title={x.titulo} aria-label={`Convocatoria ${i + 1}: ${x.titulo}`} aria-current={actual ? 'step' : undefined}>
              {actual ? i + 1 : hecha && !mucho ? <Icon n="check" s={13} w={3.4} /> : null}
            </button>
            {i < ruta.length - 1 && <i className={`l ${i < cur ? 'ok' : ''}`} />}
          </Fragment>
        )
      })}
    </div>
  )
}

function Revisar({ ruta, curId, setCurId, decidir, setDescartando, ir, generado }) {
  // ruta: lo que hay por revisar más lo que se ha clasificado en esta sesión (para poder cambiarlo).
  const a = curId === -1 ? null : ruta.find(x => x.id === curId) || ruta.find(pend) || null
  const hechas = ruta.filter(x => !pend(x)).length
  useEffect(() => {
    const k = e => {
      if (!a || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || document.querySelector('.i-dim')) return
      if (e.key === 'ArrowLeft') setDescartando(a)
      if (e.key === 'ArrowRight') decidir(a, 'preparando')
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })
  const decidida = a && !pend(a)
  const [vt, vi, vc] = a ? VEREDICTO[a.veredicto] : []
  return (
    <div className="i-oferta">
      {ruta.length > 1 && <Pasos {...{ ruta, a, setCurId }} />}
      {a ? (
        <>
          <div className="i-card i-hero">
            {decidida && <div className="i-ya"><Icon n="undo" s={16} w={2.4} />La clasificasteis como «{ETIQ_RUTA[a.estado]}». Elegid otra opción para cambiarla.</div>}
            <div className="i-head" style={{ alignItems: 'center' }}>
              <span className={`i-v ${vc}`}><i><Icon n={vi} s={14} w={3} /></i>{vt}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{a.demo && <span className="i-ej">Ejemplo real</span>}<span className="i-tag">BDNS {a.codigo}</span>{a.url && <a className="i-link" href={a.url} target="_blank" rel="noopener noreferrer">Ver convocatoria ↗</a>}</span>
            </div>
            <h3 className={tituloCorto(a).length > 110 ? 'long' : ''} title={a.titulo}>{tituloCorto(a)}</h3>
            <div style={{ color: 'var(--mut)' }}>{a.organo}</div>
            <div className="k4">
              <div><span>¿Cuánto dan?</span><b className={a.importe ? '' : 'i-ni'}>{a.importe || 'No indicado'}</b>{a.importeEsPresupuesto && <small>presupuesto total</small>}</div>
              <div><span>¿Qué parte pagan?</span><b className={a.cubierto ? '' : 'i-ni'}>{a.cubierto || 'No indicado'}</b></div>
              <div className="hot"><span>¿Hasta cuándo?</span><b>{plazoTxt(a)}</b>{a.plazo && <small>{a.plazoEstimado ? 'plazo estimado · ' : ''}{fechaCorta(a.plazo)}</small>}</div>
              <div className="why"><span>¿Por qué encaja?</span><b className={`enc ${(a.motivo || '').length > 240 ? 'largo' : ''}`}>{LINEAS[a.linea] && <em className="lin">{LINEAS[a.linea]}</em>}{a.motivo || 'Sin análisis todavía'}</b></div>
            </div>
            {a.avisos.length > 0 && <div className="i-cita aviso">{a.avisos.map(t => <div key={t}><Icon n="info" s={14} /> {t}</div>)}<small>Según vuestros criterios del Perfil</small></div>}
            {a.cita && (
              <div className="pie">
                <div className="cita solo">
                  <div className="lab">Frase del texto oficial <small><Icon n="verified" s={13} />comprobada</small>{a.url && <a className="i-link" href={enlaceFrase(a)} target="_blank" rel="noopener noreferrer">Verla en el documento ↗</a>}</div>
                  <p>«…<mark>{a.cita}</mark>…»</p>
                </div>
              </div>
            )}
          </div>
          {/* Solo dos decisiones, fuera de la tarjeta: descartar, o presentar (pasa a «En proceso»). */}
          <div className="i-dos">
            <button className={`i-btn ${a.estado === 'descartada' ? 'sel' : ''}`} onClick={() => setDescartando(a)}><Icon n="x" s={19} w={2.4} />Descartar<kbd>←</kbd></button>
            <button className="i-btn p" onClick={() => decidir(a, 'preparando')}><Icon n="send" s={19} />Presentar<kbd>→</kbd></button>
          </div>
        </>
      ) : (
        <div className="i-card i-vacio">
          <Svg html={plant(3)} />
          <h3>{ruta.length ? `Hecho por hoy · ${hechas} de ${ruta.length} clasificadas` : 'No hay nada por revisar'}</h3>
          <p>{ruta.length ? 'Pulsad un círculo de la barra para cambiar su decisión. ' : 'No hemos encontrado convocatorias nuevas. '}El radar vuelve a buscar mañana por la mañana.</p>
          {generado && <small>Actualizado el {new Date(generado).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</small>}
          {ruta.some(x => x.estado === 'preparando') && <button className="i-btn p" style={{ margin: '14px auto 0' }} onClick={() => ir('preparando')}><Icon n="doc" s={19} />Ir a las que están en proceso</button>}
        </div>
      )}
    </div>
  )
}

// Modal de motivos. Catálogo: GET /api/motivos; motivo nuevo: POST /api/motivos.
// Se guarda con PUT /api/solicitudes/convocatoria/:codigo {estado: "descartada", motivos, nota}.
export function Descarte({ a, cerrar, guardar }) {
  const [catalogo, setCatalogo] = useState(null)
  const [sel, setSel] = useState(a.sol?.motivos || [])
  const [pct, setPct] = useState(20)
  const [nuevo, setNuevo] = useState('')
  const [escribiendo, setEscribiendo] = useState(false)
  const [recordar, setRecordar] = useState(true)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { api('/motivos').then(l => setCatalogo(l.map(m => m.texto))).catch(() => setCatalogo([])) }, [])
  const toggle = m => setSel(sel.includes(m) ? sel.filter(x => x !== m) : [...sel, m])
  const final = [...sel, ...(nuevo.trim() && !sel.includes(nuevo.trim()) ? [nuevo.trim()] : [])]
  const dinero = sel.includes('Cofinanciación demasiado alta')
  const enviar = async (motivos, extra) => { setGuardando(true); await guardar(a, motivos, extra); setGuardando(false) }
  return (
    <div className="i-dim" onClick={cerrar}>
      <div className="i-modal i-why" onClick={e => e.stopPropagation()}>
        <div className="i-head" style={{ alignItems: 'center' }}><h2 style={{ fontSize: 26 }}>¿Por qué no os interesa?</h2><button className="i-round" style={{ background: '#F1F3EE' }} onClick={cerrar} aria-label="Cerrar"><Icon n="x" s={18} w={2.4} /></button></div>
        <p className="i-sub" style={{ margin: '2px 0 14px' }}>{a.titulo.length > 90 ? `${a.titulo.slice(0, 90)}…` : a.titulo} · Elegid uno o varios</p>
        <div className="chips">
          {!catalogo && <span className="i-sub" style={{ margin: 0 }}>Cargando motivos…</span>}
          {(catalogo || []).map(m => <button key={m} className={sel.includes(m) ? 'on' : ''} onClick={() => toggle(m)}>{m}</button>)}
          <button className="add" onClick={() => setEscribiendo(true)}>+ Añadir motivo</button>
        </div>
        {dinero && (
          <div className="fq"><b>¿Cuánto podéis poner como máximo?</b><div className="chips">{[10, 20, 30].map(p => <button key={p} className={pct === p ? 'on' : ''} onClick={() => setPct(p)}>{p} %</button>)}<button className={pct === 0 ? 'on' : ''} onClick={() => setPct(0)}>Depende</button></div></div>
        )}
        {escribiendo && (
          <div className="fq"><b>Vuestro motivo</b><input className="i-in" style={{ width: '100%', fontSize: 16, letterSpacing: 0 }} autoFocus maxLength={120} value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="Por ejemplo: exigen aval bancario" />
            <label className="cb"><input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)} />Guardarlo en la lista de motivos para las próximas</label></div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="i-btn p" style={{ flex: 1, height: 52 }} disabled={!final.length || guardando} onClick={() => enviar(final, { pct: dinero ? pct : null, nuevo: nuevo.trim(), recordar })}>Guardar motivo</button>
          <button className="i-btn" style={{ height: 52 }} disabled={guardando} onClick={() => enviar([], {})}>Saltar</button>
        </div>
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------------------------
// En proceso, Presentado y Descartadas comparten formato: secciones tipo Notion (<Tablero>) con
// tarjetas compactas que se arrastran de una sección a otra. Las secciones y el orden se guardan
// en GET/PUT /api/tablero (ver tablero.js).
const porPlazo = (a, b) => (a.plazo || '9999').localeCompare(b.plazo || '9999')

// Barra de documentos: subidos / los que pide la convocatoria. Ámbar mientras faltan, verde al completar.
function Prog({ p }) {
  if (!p) return <div className="tc-prog cargando"><div className="t">Contando los papeles…</div><div className="bar"><i style={{ width: '0%' }} /></div></div>
  if (!p.total) return null
  const ok = p.hechos >= p.total
  return (
    <div className={`tc-prog ${ok ? 'ok' : p.hechos ? 'am' : 'cero'}`} role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.hechos} aria-label={`${p.hechos} de ${p.total} documentos subidos`}>
      <div className="t"><Icon n={ok ? 'check' : 'doc'} s={14} w={ok ? 3 : 2} /><b>{p.hechos} de {p.total}</b> documentos{ok ? ' · ¡listos!' : ''}</div>
      <div className="bar"><i style={{ width: `${Math.max(p.hechos ? 8 : 0, (p.hechos / p.total) * 100)}%` }} /></div>
    </div>
  )
}

// Ruta corta de una solicitud presentada: en qué fase está y cuántas le quedan.
function Ruta({ p, estado }) {
  const mal = estado === 'subsanar' || estado === 'denegada'
  return (
    <ol className="tc-ruta" aria-label={`Fase ${Math.min(p + 1, 4)} de 4: ${estado === 'terminada' ? 'Terminada' : PASOS_TXT[p] || ''}`}>
      {PASOS_TXT.map((t, i) => <li key={t} className={i < p ? 'd' : i === p ? `now ${mal ? 'mal' : ''}` : ''}><i>{i < p && <Icon n="check" s={11} w={3.6} />}</i><span>{t}</span></li>)}
    </ol>
  )
}

// En proceso y Presentado: rejilla simple de tarjetas, sin secciones ni arrastrar.
function Rejilla({ izq, items, card, vacio }) {
  return (
    <div className="i-bd">
      {izq && <div className="i-bar"><div className="izq">{izq}</div></div>}
      <div className="i-sec-b i-rejilla">
        {items.length === 0 ? <div className="i-sec-v">{vacio}</div> : items.map(a => <div key={a.id} className="i-tc">{card(a)}</div>)}
      </div>
    </div>
  )
}

// ---------- Tarjetas «el plazo manda» (opción B): franja de color con la cuenta atrás ----------
// Organismo abreviado para que quepa en la burbuja (el nombre completo sale al pasar el ratón).
function orgCorto(o) {
  const t = (o || '').split('·')[0].trim()
  const n = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  if (/TRANSICION ECOLOGICA/.test(n)) return 'MITECO'
  if (/^FUNDACION BIODIVERSIDAD/.test(n)) return 'F. Biodiversidad'
  if (/^COMUNIDAD DE MADRID/.test(n)) return 'C. Madrid'
  const cap = x => x.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\s(De|Del|La|Las|Los|Y|E)\b/g, m => m.toLowerCase())
  const m = t.match(/^(AYUNTAMIENTO|DIPUTACI[ÓO]N PROVINCIAL|JUNTA|MINISTERIO|CONSEJER[ÍI]A|CONFEDERACI[ÓO]N HIDROGR[ÁA]FICA)\s+(DE(L| LA| LOS)?\s+)?(.+)$/i)
  const pre = { AYUNTAMIENTO: 'Ayto.', JUNTA: 'Junta', MINISTERIO: 'Min.' }
  if (m) { const k = m[1].toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return `${pre[k] || (k.startsWith('DIPUTACION') ? 'Dip.' : k.startsWith('CONSEJERIA') ? 'Cons.' : 'CH')} ${cap(m[4])}`.slice(0, 26) }
  const c = cap(t)
  return c.length > 24 ? `${c.slice(0, 23)}…` : c
}
const tonoDias = d => (d == null ? 'neutro' : d <= 7 ? 'hot' : d <= 30 ? 'am' : 'ok')
const importeCorto = n => (n == null ? null : n >= 1e6 ? `${(n / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M€` : `${n.toLocaleString('es-ES')} €`)

// Menú ⋯ de la tarjeta: lo secundario (descartar, ver convocatoria, cambiar fecha…).
function MenuMas({ children }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = e => { if (!caja.current?.contains(e.target)) setAbierto(false) }
    const esc = e => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  return (
    <div className="tb-menu" ref={caja}>
      <button className="tb-ib" aria-label="Más opciones" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></button>
      {abierto && <div className="tb-pop" role="menu" onClick={e => { if (e.target.closest('button,a')) setAbierto(false) }}>{children}</div>}
    </div>
  )
}
function Segmentos({ hechos, total }) {
  if (!total) return null
  if (total > 16) return <div className="tb-barra"><i style={{ width: `${(hechos / total) * 100}%` }} /></div>
  return <div className="tb-seg" aria-hidden="true">{Array.from({ length: total }, (_, i) => <i key={i} className={i < hechos ? 'on' : ''} />)}</div>
}

function Mas({ children, texto = 'Más detalles' }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button className="tc-mas" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>{abierto ? 'Menos detalles' : texto}<Icon n="keyD" s={14} w={2.8} /></button>
      {abierto && <div className="tc-det">{children}</div>}
    </>
  )
}

// En proceso: las que habéis elegido presentar. «Presentar» las pasa a Presentado.
function Preparando({ lista, ir, setDescartando, cambiarEstado, avisar }) {
  const prog = useProgresoDocs(lista)
  const items = useMemo(() => [...lista].sort(porPlazo), [lista])
  return (
    <Rejilla items={items} vacio="Nada en proceso. Las que marquéis «Presentar» en el Radar aparecerán aquí."
      card={a => {
        const p = prog[a.id], listo = Boolean(p) && p.hechos >= p.total
        // Hasta que no estén todos los documentos no se puede presentar: avisa con «Requisitos incompletos».
        const presentar = () => {
          if (listo) return cambiarEstado(a, 'presentada')
          avisar(p ? `Requisitos incompletos: faltan ${p.total - p.hechos} ${p.total - p.hechos === 1 ? 'documento' : 'documentos'}` : 'Estamos comprobando los papeles. Probad en un momento', ['Ver papeles', () => ir('presentar', a.id)])
        }
        const total = p?.total || 0, hechos = p?.hechos || 0
        return (
          <article className="tb">
            <div className={`tb-franja ${tonoDias(a.dias)}`}>
              {a.plazo ? <><b className="n">{a.dias < 0 ? '—' : a.dias}</b><small>{a.dias === 1 ? 'día' : 'días'}</small><small className="f">{fechaCorta(a.plazo)}</small></> : <><Icon n="clock" s={24} /><small>Sin fecha</small></>}
            </div>
            <div className="tb-cuerpo">
              <div className="tb-top">
                <span className="tb-org" title={a.organo}><Icon n="building" s={14} />{orgCorto(a.organo)}</span>
                <span className="tb-sp" />
                <MenuMas>
                  <button role="menuitem" onClick={() => ir('presentar', a.id)}><Icon n="doc" s={15} />Ver papeles</button>
                  {a.url && <a role="menuitem" href={a.url} target="_blank" rel="noopener noreferrer"><Icon n="ext" s={15} />Ver convocatoria</a>}
                  <span className="tb-dato">BDNS {a.codigo}{a.sol?.actualizado_por ? ` · elegida por ${a.sol.actualizado_por}` : ''}</span>
                  <button role="menuitem" className="mal" onClick={() => setDescartando(a)}><Icon n="x" s={15} w={2.4} />Descartar</button>
                </MenuMas>
              </div>
              <h4 title={a.titulo}>{tituloCorto(a)}</h4>
              <div className="tb-fila">
                <Icon n="euro" s={15} /><b>{importeCorto(a.importe_max ?? a.presupuesto) || 'Importe sin indicar'}</b>
                <span className="tb-sp" />
                {!p ? <span className="tb-mut">Contando papeles…</span>
                  : listo ? <span className="tb-chip ok"><Icon n="check" s={13} w={3} />Papeles listos</span>
                    : <span className="tb-mut"><b className="am">{hechos}</b>/{total} papeles</span>}
              </div>
              <Segmentos hechos={hechos} total={total} />
              <div className="tb-acc">
                {listo
                  ? <><button className="tb-btn ico" title="Ver papeles" aria-label="Ver papeles" onClick={() => ir('presentar', a.id)}><Icon n="doc" s={17} /></button>
                    <button className="tb-btn p" onClick={presentar}><Icon n="send" s={16} />Presentar</button></>
                  : <><button className="tb-btn" onClick={() => ir('presentar', a.id)}><Icon n="doc" s={16} />Papeles</button>
                    <button className="tb-btn off" aria-disabled="true" title="Faltan documentos: subidlos antes de presentar" onClick={presentar}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>Presentar</button></>}
              </div>
            </div>
          </article>
        )
      }} />
  )
}

// Presentado: estados reales de la API: presentada → concedida → plantar → justificar → terminada
// (y subsanar / denegada). Ruta: PUT /api/solicitudes/convocatoria/:codigo {estado}.
// Cada solicitud muestra su siguiente paso con la cuenta atrás de GET /api/seguimiento
// (por defecto, al presentarla: «Mirar si ha salido la resolución» a los 60 días).
const PASOS_TXT = ['Presentada', 'Concedida', 'Plantar', 'Justificar']
// Texto corto del botón principal de cada tarjeta presentada (cabe en una línea).
const BOTON_CORTO = { concedida: 'Concedida', presentada: 'Ya subsanada', plantar: 'A plantar', justificar: 'A justificar', terminada: 'Terminada' }
// Fase de cada estado: texto corto e icono de la franja.
const FASE = { presentada: ['Presentada', 'send'], subsanar: ['Subsanar', 'alert'], concedida: ['Concedida', 'verified'], plantar: ['Plantar', 'leaf'], justificar: ['Justificar', 'doc'], terminada: ['Terminada', 'check'], denegada: ['Denegada', 'x'] }
const PASO_DE = { presentada: 0, subsanar: 0, denegada: 0, concedida: 1, plantar: 2, justificar: 3, terminada: 4 }
const SIGUIENTE = {
  presentada: [['concedida', 'Concedida'], ['subsanar', 'Piden subsanar'], ['denegada', 'Denegada']],
  subsanar: [['presentada', 'Ya subsanada']],
  concedida: [['plantar', 'Empezamos a plantar']],
  plantar: [['justificar', 'Pasamos a justificar']],
  justificar: [['terminada', 'Terminada']],
  denegada: [], terminada: [],
}
const MENSAJE = {
  presentada: 'La están estudiando. No tenéis que hacer nada.', subsanar: 'Os piden corregir o completar documentación.',
  concedida: '¡Os la han concedido! Toca plantar.', plantar: 'Ahora toca plantar.', justificar: 'Último paso: justificar el gasto.',
  denegada: 'No ha sido concedida.', terminada: 'Terminada. ¡Un árbol más en la isla!',
}
function Presentado({ lista, cambiarEstado, cambiarPaso, seg, perfil, ir }) {
  const [vista, setVista] = useRecordado('presentado-vista', 'marcha', ['marcha', 'term'])
  const fin = a => a.estado === 'terminada' || a.estado === 'denegada'
  const enMarcha = useMemo(() => lista.filter(a => !fin(a)), [lista])
  const term = useMemo(() => lista.filter(fin), [lista])
  const ver = vista === 'marcha' ? enMarcha : term
  const cmp = useCallback((a, b) => (segDe(seg, a.id)?.dias ?? 9999) - (segDe(seg, b.id)?.dias ?? 9999), [seg])
  const items = useMemo(() => [...ver].sort(cmp), [ver, cmp])
  return (
    <>
      <Rejilla items={items} vacio={vista === 'marcha' ? 'No hay solicitudes en marcha. Las que presentéis aparecerán aquí.' : 'Aún no hay solicitudes finalizadas.'}
        izq={<div className="i-seg" role="group" aria-label="Filtro"><button aria-pressed={vista === 'marcha'} className={vista === 'marcha' ? 'on' : ''} onClick={() => setVista('marcha')}>En marcha · {enMarcha.length}</button><button aria-pressed={vista === 'term'} className={vista === 'term' ? 'on' : ''} onClick={() => setVista('term')}>Finalizado · {term.length}</button></div>}
        card={a => {
          const p = PASO_DE[a.estado], s = segDe(seg, a.id), sig = SIGUIENTE[a.estado] || []
          const alerta = a.estado === 'subsanar' || a.estado === 'denegada', cierre = fin(a)
          const fase = FASE[a.estado] || FASE.presentada
          const tono = cierre ? (a.estado === 'terminada' ? 'ok' : 'neutro') : alerta ? 'hot' : s?.nivel === 'urgente' || s?.nivel === 'vencido' ? 'hot' : s?.nivel === 'pronto' ? 'am' : 'ok'
          return (
            <article className="tb">
              <div className={`tb-franja ${tono}`}>
                <Icon n={fase[1]} s={26} />
                <small>{fase[0]}</small>
                {!cierre && <span className="tb-pasos" aria-label={`Paso ${Math.min(p + 1, 4)} de 4`}>{[0, 1, 2, 3].map(k => <i key={k} className={k < p ? 'd' : k === p ? 'now' : ''} />)}</span>}
              </div>
              <div className="tb-cuerpo">
                <div className="tb-top">
                  <span className="tb-org" title={a.organo}><Icon n="building" s={14} />{orgCorto(a.organo)}</span>
                  <span className="tb-sp" />
                  <MenuMas>
                    {sig.slice(1).map(([e, tx]) => <button key={e} role="menuitem" onClick={() => cambiarEstado(a, e)}><Icon n="flag" s={15} />{tx}</button>)}
                    {a.url && <a role="menuitem" href={a.url} target="_blank" rel="noopener noreferrer"><Icon n="ext" s={15} />Ver convocatoria</a>}
                    <span className="tb-dato">{importeCorto(a.importe_max ?? a.presupuesto) || 'Importe sin indicar'} · actualizada {a.sol?.actualizado ? fechaCorta(a.sol.actualizado) : '—'}{a.sol?.actualizado_por ? ` por ${a.sol.actualizado_por}` : ''}</span>
                  </MenuMas>
                </div>
                <h4 title={a.titulo}>{tituloCorto(a)}</h4>
                <div className="tb-fila" title={MENSAJE[a.estado]}>
                  {cierre ? <span className="tb-mut">{MENSAJE[a.estado]}</span>
                    : <><Icon n={alerta ? 'clock' : 'cal'} s={15} /><span className="tb-paso"><b>{s?.siguiente_paso || 'Siguiente paso'}</b> <span className={`tb-mut ${tono === 'hot' ? 'mal' : ''}`}>· {cuenta(s?.dias)}{s?.fecha_paso ? ` · ${fechaCorta(s.fecha_paso)}` : ''}</span></span></>}
                </div>
                {!cierre && (
                  <div className="tb-acc">
                    <label className="tb-btn ico" title="Cambiar la fecha del siguiente paso"><Icon n="cal" s={17} /><input type="date" aria-label="Cambiar la fecha del siguiente paso" value={s?.fecha_paso?.slice(0, 10) || ''} onChange={e => e.target.value && cambiarPaso(a, { fecha_paso: e.target.value })} /></label>
                    {sig[0] && <button className={`tb-btn ${tono === 'hot' || tono === 'am' ? 'p' : ''}`} onClick={() => cambiarEstado(a, sig[0][0])}><Icon n="check" s={15} w={3} />{BOTON_CORTO[sig[0][0]] || sig[0][1]}</button>}
                  </div>
                )}
              </div>
            </article>
          )
        }} />
      <p className="i-sub" style={{ margin: '14px 0 0' }}><Icon n="bell" s={15} /> {AVISOS_TXT[perfil?.avisos] || AVISOS_TXT.cada_manana}. <button className="i-link" onClick={() => ir('perfil')}>Cambiar en Perfil</button></p>
    </>
  )
}

// Descartadas: una sección por motivo. «Descartadas por el radar» recoge lo que el radar descartó (solo se
// puede sacar de ahí); el resto son los motivos del equipo (GET /api/motivos). Arrastrar una tarjeta a otro
// motivo la reclasifica (PUT con motivos); «Nueva sección» crea un motivo (POST /api/motivos).
// Por qué la descartó el radar: el motivo que escribe la IA, agrupado en pocas secciones.
const MOTIVOS_RADAR = [
  ['beneficiario', 'Radar · Reforesta no puede pedirla', /beneficiari|personas f[ií]sicas|propietari|comunidades de|municipios|entidad(es)? local|empresas|alumnos|dirigida a|solo pueden|no es (una )?entidad|no gestiona/i],
  ['tema', 'Radar · No es de medio ambiente', /medio ambiente|ambiental|tem[aá]tica|conservaci[oó]n|reforest|misi[oó]n/i],
  ['zona', 'Radar · Fuera de su zona', /[aá]mbito|zona|territori|comunidad aut|provincia/i],
  ['dinero', 'Radar · Importe o cofinanciación', /importe|cofinanc|aportaci|presupuesto/i],
]
const motivoRadar = a => (MOTIVOS_RADAR.find(([, , re]) => re.test(a.motivo || '')) || ['otros'])[0]

function Descartadas({ lista, recuperar, reclasificar }) {
  const [cat, setCat] = useState([])
  const [sel, setSel] = useState(null)        // grupo elegido (un filtro a la vez)
  const [arrastrando, setArrastrando] = useState(null)
  const [sobre, setSobre] = useState(null)
  const [creando, setCreando] = useState(false)
  const cargar = useCallback(() => api('/motivos').then(l => setCat(l.map(m => m.texto))).catch(() => {}), [])
  useEffect(() => { cargar() }, [cargar])
  const grupoDe = a => (descartadaPor(a) === 'radar' ? `radar:${motivoRadar(a)}` : a.sol?.motivos?.[0] ? `m:${a.sol.motivos[0]}` : 'sin')
  const porGrupo = useMemo(() => lista.reduce((o, a) => { (o[grupoDe(a)] ||= []).push(a); return o }, {}), [lista])
  const equipo = [...new Set([...cat, ...Object.keys(porGrupo).filter(k => k.startsWith('m:')).map(k => k.slice(2))])]
    .map(m => ({ id: `m:${m}`, nombre: m, n: porGrupo[`m:${m}`]?.length || 0 }))
    .concat([{ id: 'sin', nombre: 'Sin motivo', n: porGrupo.sin?.length || 0 }])
    .sort((x, y) => y.n - x.n)
  const radar = [...MOTIVOS_RADAR.map(([id, nombre]) => ({ id: `radar:${id}`, nombre: nombre.replace('Radar · ', '') })), { id: 'radar:otros', nombre: 'Otros motivos' }]
    .map(g => ({ ...g, n: porGrupo[g.id]?.length || 0 })).filter(g => g.n > 0).sort((x, y) => y.n - x.n)
  const visiblesEquipo = equipo.filter(g => g.n > 0 || arrastrando)
  const actual = (sel && porGrupo[sel]?.length ? sel : null) || visiblesEquipo.find(g => g.n)?.id || radar[0]?.id
  const tarjetas = [...(porGrupo[actual] || [])].sort(porPlazo)
  const esRadar = actual?.startsWith('radar')
  const soltar = (e, g) => {
    e.preventDefault(); setSobre(null)
    const a = lista.find(x => x.id === arrastrando); setArrastrando(null)
    if (a && grupoDe(a) !== g.id) reclasificar(a, g.id === 'sin' ? [] : [g.id.slice(2)])
  }
  const chip = (g, puedeSoltar) => (
    <button key={g.id} className={`ds-chip ${actual === g.id ? 'on' : ''} ${sobre === g.id ? 'sobre' : ''} ${g.n ? '' : 'vacio'}`} aria-pressed={actual === g.id}
      onClick={() => g.n && setSel(g.id)}
      {...(puedeSoltar ? { onDragOver: e => { e.preventDefault(); setSobre(g.id) }, onDragLeave: () => setSobre(null), onDrop: e => soltar(e, g) } : {})}>
      {g.nombre}<b>{g.n}</b>
    </button>
  )
  return (
    <div className="ds">
      <div className="ds-filtros">
        <div className="ds-grupo"><span className="ds-lbl">Vuestros motivos</span>
          {visiblesEquipo.map(g => chip(g, true))}
          {creando
            ? <input className="ds-nuevo" autoFocus maxLength={60} placeholder="Nuevo motivo…" onBlur={async e => { const v = e.target.value.trim(); setCreando(false); if (v) { try { await api('/motivos', { metodo: 'POST', datos: { texto: v } }); cargar() } catch { /* se reintenta */ } } }} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = ''; e.target.blur() } }} />
            : <button className="ds-chip mas" onClick={() => setCreando(true)}><Icon n="plus" s={14} w={2.6} />Motivo</button>}
        </div>
        {radar.length > 0 && <div className="ds-grupo radar"><span className="ds-lbl"><Icon n="radar" s={14} />El radar</span>{radar.map(g => chip(g, false))}</div>}
      </div>
      {arrastrando && <p className="ds-pista">Soltad la tarjeta en un motivo de arriba para reclasificarla</p>}
      {tarjetas.length === 0 ? <div className="i-card i-empty">No hay convocatorias descartadas.</div> : (
        <div className="ds-rejilla">
          {tarjetas.map(a => (
            <article key={a.id} className={`tc ds-tc ${arrastrando === a.id ? 'lev' : ''}`} draggable={!esRadar}
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setArrastrando(a.id) }} onDragEnd={() => { setArrastrando(null); setSobre(null) }}>
              <div className="tc-tags">
                <span className="i-tag" title={a.organo}>{orgCorto(a.organo)}</span>
                {a.plazo && <span className="tb-mut">plazo {fechaCorta(a.plazo)}</span>}
              </div>
              <h4 title={a.titulo}>{tituloCorto(a)}</h4>
              {esRadar && a.motivo && <p className="i-mot tc-mot"><b>Por qué la descarta el radar:</b> {a.motivo}</p>}
              {!esRadar && (a.sol?.nota || (a.sol?.motivos || []).length > 1) && <p className="i-mot tc-mot">{[(a.sol?.motivos || []).slice(1).join(' · '), a.sol?.nota].filter(Boolean).join(' · ')}</p>}
              <div className="tc-acc"><button className="i-link" onClick={() => recuperar(a)}><Icon n="undo" s={15} w={2.4} />Recuperar</button>{a.url && <a className="i-link" style={{ marginLeft: 'auto' }} href={a.url} target="_blank" rel="noopener noreferrer">Ver ↗</a>}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
