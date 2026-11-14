import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { plant } from './lp.js'
import { api } from '../api.js'
import { LINEAS, descartadaPor, etapaDe, fechaCorta } from '../datos.js'
import { useSecciones } from '../tablero.js'
import Tablero from './Tablero.jsx'
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
  const n = { revisar: 0, preparando: 0, presentadas: 0, descartadas: 0 }
  visibles.forEach(a => { n[etapaDe(a)]++ })
  const etapas = [['revisar', 'Radar', 'radar', 'Por revisar'], ['preparando', 'En proceso', 'doc', 'Preparando papeles'], ['presentadas', 'Presentado', 'send', 'Enviadas']]
  // El ciclo de vida ocupa el sitio del título: Radar → En proceso → Presentado, y aparte Descartadas.
  const ciclo = (
    <nav className="i-ciclo" aria-label="Fase de las convocatorias">
      <ol>
        {etapas.map(([k, t, ic, sub], i) => (
          <Fragment key={k}>
            <li><button className={`e ${etapa === k ? 'on' : ''} ${k === 'revisar' && n.revisar ? 'hot' : ''}`} aria-current={etapa === k ? 'page' : undefined} aria-label={`${t}: ${n[k]}`} onClick={() => ir(k)}>
              <span className="ic"><Icon n={ic} s={25} /></span><span className="tx"><b>{t}</b><small>{sub}</small></span><span className="ct">{n[k]}</span>
            </button></li>
            {i < 2 && <li className="arr" aria-hidden="true"><Icon n="keyR" s={18} w={2.6} /></li>}
          </Fragment>
        ))}
      </ol>
      <span className="sep" aria-hidden="true" />
      <button className={`e ap ${etapa === 'descartadas' ? 'on' : ''}`} aria-current={etapa === 'descartadas' ? 'page' : undefined} aria-label={`Descartadas: ${n.descartadas}`} onClick={() => ir('descartadas')}>
        <span className="ic"><Icon n="archive" s={22} /></span><span className="tx"><b>Descartadas</b></span><span className="ct">{n.descartadas}</span>
      </button>
    </nav>
  )
  return (
    <>
      {top(null, false, ciclo)}
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
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="i-tag">BDNS {a.codigo}</span>{a.url && <a className="i-link" href={a.url} target="_blank" rel="noopener noreferrer">Ver convocatoria ↗</a>}</span>
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
  const dinero = sel.includes('Piden poner mucho dinero')
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
const urgente = a => a.dias != null && a.dias >= 0 && a.dias <= 15

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
function Preparando({ lista, ir, seg, setDescartando, cambiarEstado, avisar, tab }) {
  const prog = useProgresoDocs(lista)
  const t = useSecciones(tab, 'preparando', lista, porPlazo)
  return (
    <Tablero {...t} vacio="Nada en proceso. Las que marquéis «Presentar» en el Radar aparecerán aquí."
      izq={<span className="i-hint">{lista.length ? 'Arrastrad las tarjetas para ordenarlas o clasificarlas' : 'Aquí van las convocatorias que decidís presentar'}</span>}
      card={a => {
        const s = segDe(seg, a.id), p = prog[a.id], listo = Boolean(p) && p.hechos >= p.total
        // Hasta que no estén todos los documentos no se puede presentar: avisa con «Requisitos incompletos».
        const presentar = () => {
          if (listo) return cambiarEstado(a, 'presentada')
          avisar(p ? `Requisitos incompletos: faltan ${p.total - p.hechos} ${p.total - p.hechos === 1 ? 'documento' : 'documentos'}` : 'Estamos comprobando los papeles. Probad en un momento', ['Ver papeles', () => ir('presentar', a.id)])
        }
        return (
          <article className="tc">
            <div className="tc-tags"><span className="i-tag" title={a.organo}>{a.organo}</span></div>
            <h4 title={a.titulo}>{tituloCorto(a)}</h4>
            <div className="tc-cifras">
              <div><span>Importe</span><b className={a.importe ? '' : 'i-ni'}>{a.importe || 'No indicado'}</b></div>
              <div className={urgente(a) ? 'hot' : ''}><span>Plazo</span><b>{plazoTxt(a)}</b>{a.plazo && <small>{fechaCorta(a.plazo)}</small>}</div>
            </div>
            <Prog p={p} />
            <div className="tc-acc">
              <button className="i-link" onClick={() => ir('presentar', a.id)}><Icon n="doc" s={16} />Ver papeles</button>
              <span style={{ flex: 1 }} />
              <button className={`i-btn sm ${listo ? 'p' : 'bloq'}`} aria-disabled={!listo} title={listo ? 'Tenéis todos los documentos' : 'Faltan documentos: subidlos antes de presentar'} onClick={presentar}>{!listo && <Icon n="alert" s={16} />}Presentar</button>
            </div>
            <Mas>
              <p><b>Siguiente paso:</b> {s?.siguiente_paso || 'Presentar la solicitud'}</p>
              {a.sol?.actualizado_por && <p>Elegida por {a.sol.actualizado_por}</p>}
              <p><span className="i-tag">BDNS {a.codigo}</span></p>
              <div className="tc-acc"><button className="i-link" onClick={() => setDescartando(a)}><Icon n="x" s={15} w={2.4} />Descartar</button>{a.url && <a className="i-link" href={a.url} target="_blank" rel="noopener noreferrer">Ver convocatoria ↗</a>}</div>
            </Mas>
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
function Presentado({ lista, cambiarEstado, cambiarPaso, seg, perfil, ir, tab }) {
  const [vista, setVista] = useState('marcha')
  const fin = a => a.estado === 'terminada' || a.estado === 'denegada'
  const enMarcha = useMemo(() => lista.filter(a => !fin(a)), [lista])
  const term = useMemo(() => lista.filter(fin), [lista])
  const ver = vista === 'marcha' ? enMarcha : term
  const cmp = useCallback((a, b) => (segDe(seg, a.id)?.dias ?? 9999) - (segDe(seg, b.id)?.dias ?? 9999), [seg])
  const t = useSecciones(tab, 'presentadas', ver, cmp)
  const avisos = (seg?.avisos || []).filter(x => x.tipo === 'convocatoria')
  return (
    <>
      {avisos.length > 0 && vista === 'marcha' && (
        <div className="i-avisos" role="status" style={{ marginBottom: 10 }}>{avisos.map(x => <div key={`${x.tipo}${x.id}`} className={x.nivel}><Icon n="bell" s={16} />{x.texto}</div>)}</div>
      )}
      <Tablero {...t} vacio={vista === 'marcha' ? 'No hay solicitudes en marcha. Las que presentéis aparecerán aquí.' : 'Aún no hay solicitudes finalizadas.'}
        izq={<div className="i-seg" role="group" aria-label="Filtro"><button aria-pressed={vista === 'marcha'} className={vista === 'marcha' ? 'on' : ''} onClick={() => setVista('marcha')}>En marcha · {enMarcha.length}</button><button aria-pressed={vista === 'term'} className={vista === 'term' ? 'on' : ''} onClick={() => setVista('term')}>Finalizado · {term.length}</button></div>}
        card={a => {
          const p = PASO_DE[a.estado], s = segDe(seg, a.id), sig = SIGUIENTE[a.estado] || []
          const alerta = a.estado === 'subsanar' || a.estado === 'denegada', cierre = fin(a)
          return (
            <article className="tc">
              <div className="tc-tags"><span className="i-tag" title={a.organo}>{a.organo}</span>{alerta && <span className="i-tag mal">{a.estado === 'subsanar' ? 'Por subsanar' : 'Denegada'}</span>}</div>
              <h4 title={a.titulo}>{tituloCorto(a)}</h4>
              <Ruta p={p} estado={a.estado} />
              <div className="tc-cifras">
                <div><span>Importe</span><b className={a.importe ? '' : 'i-ni'}>{a.importe || 'No indicado'}</b></div>
                {cierre ? <div><span>Estado</span><b>{a.estado === 'terminada' ? 'Terminada' : 'Denegada'}</b></div>
                  : <div className={`cuenta ${s?.nivel || 'sin_fecha'}`}><span title={s?.siguiente_paso}>{s?.siguiente_paso || 'Siguiente paso'}</span><b>{cuenta(s?.dias)}</b>{s?.fecha_paso ? <small>{fechaCorta(s.fecha_paso)}</small> : <small>Sin fecha</small>}</div>}
              </div>
              <div className="i-msg tc-msg" style={{ background: alerta ? 'var(--co-l)' : 'var(--soft)', color: alerta ? 'var(--co-d)' : 'var(--nv)' }}>{MENSAJE[a.estado]}</div>
              {sig.length > 0 && <div className="tc-acc"><button className={`i-btn sm ${alerta || ['urgente', 'vencido', 'pronto'].includes(s?.nivel) ? 'p' : ''}`} style={{ flex: 1 }} onClick={() => cambiarEstado(a, sig[0][0])}>{sig[0][1]} →</button></div>}
              <Mas>
                {!cierre && <label className="i-fecha">Cambiar la fecha<input type="date" className="i-in" value={s?.fecha_paso?.slice(0, 10) || ''} onChange={e => e.target.value && cambiarPaso(a, { fecha_paso: e.target.value })} /></label>}
                <p><b>Última actualización:</b> {a.sol?.actualizado ? fechaCorta(a.sol.actualizado) : '—'}{a.sol?.actualizado_por ? ` · ${a.sol.actualizado_por}` : ''}</p>
                <div className="tc-acc">{sig.slice(1).map(([e, tx]) => <button key={e} className="i-link" style={{ color: 'var(--mut)' }} onClick={() => cambiarEstado(a, e)}>{tx}</button>)}{a.url && <a className="i-link" href={a.url} target="_blank" rel="noopener noreferrer">Ver convocatoria ↗</a>}</div>
              </Mas>
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
function Descartadas({ lista, recuperar, reclasificar, tab }) {
  const [cat, setCat] = useState([])
  const cargar = useCallback(() => api('/motivos').then(l => setCat(l.map(m => m.texto))).catch(() => {}), [])
  useEffect(() => { cargar() }, [cargar])
  const motivoDe = a => (descartadaPor(a) === 'radar' ? null : a.sol?.motivos?.[0] || '')
  const usos = useMemo(() => lista.reduce((o, a) => { const m = motivoDe(a); if (m) o[m] = (o[m] || 0) + 1; return o }, {}), [lista])
  const extra = useMemo(() => {
    const nombres = [...new Set([...cat, ...Object.keys(usos)])].sort((x, y) => (usos[y] || 0) - (usos[x] || 0))
    return {
      secs: [
        ...nombres.map(m => ({ id: `m:${m}`, nombre: m, plegadaInicial: !usos[m] })),
        { id: 'sin', nombre: 'Sin motivo', fija: true, plegadaInicial: !lista.some(a => motivoDe(a) === '') },
        { id: 'radar', nombre: 'Descartadas por el radar', color: 'azul', fija: true, noSoltar: true },
      ],
      posDe: a => { const m = motivoDe(a); return m === null ? 'radar' : m ? `m:${m}` : 'sin' },
    }
  }, [cat, usos, lista])
  const t = useSecciones(tab, 'descartadas', lista, porPlazo, { fija: true, disponer: extra })
  const mover = (id, dest, idx, desde) => {
    const a = lista.find(x => x.id === id)
    if (a && dest !== desde && dest !== 'radar') reclasificar(a, dest === 'sin' ? [] : [dest.slice(2)])
    t.onReordenar(id, dest, idx)
  }
  return (
    <Tablero {...t} onMover={mover} tope={9} vacio="Arrastrad una tarjeta aquí para darle este motivo"
      onNueva={async nombre => { try { await api('/motivos', { metodo: 'POST', datos: { texto: nombre } }); cargar() } catch { /* se reintenta al volver */ } }}
      izq={<span className="i-hint">Nada desaparece sin explicar por qué. Arrastrad una tarjeta a otro motivo para reclasificarla.</span>}
      card={(a, sec) => {
        const motivos = sec.id === 'radar' ? [] : (a.sol?.motivos || []).filter(m => `m:${m}` !== sec.id)
        return (
          <article className="tc">
            <div className="tc-tags">{sec.id === 'radar' ? <span className="i-tag">El radar</span> : motivos.map(m => <span key={m} className="i-tag">{m}</span>)}{sec.id !== 'radar' && !motivos.length && sec.id === 'sin' && <span className="i-tag">Sin motivo</span>}</div>
            <h4 title={a.titulo}>{tituloCorto(a)}</h4>
            <div className="tc-org">{a.organo}{a.plazo ? ` · plazo ${fechaCorta(a.plazo)}` : ''}</div>
            {sec.id === 'radar' && a.motivo && <p className="i-mot tc-mot">{a.motivo}</p>}
            {sec.id !== 'radar' && a.sol?.nota && <p className="i-mot tc-mot">{a.sol.nota}</p>}
            <div className="tc-acc"><button className="i-link" onClick={() => recuperar(a)}><Icon n="undo" s={15} w={2.4} />Recuperar</button></div>
            {a.cita && <Mas texto="Ver la frase oficial"><div className="i-cita" style={{ fontSize: 14, padding: '10px 14px' }}>«{a.cita}»<small><Icon n="verified" s={13} />Frase del texto oficial</small></div></Mas>}
          </article>
        )
      }} />
  )
}
