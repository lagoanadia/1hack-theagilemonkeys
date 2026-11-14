import { Fragment, useEffect, useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { plant } from './lp.js'
import { api } from '../api.js'
import { LINEAS, descartadaPor, etapaDe, fechaCorta } from '../datos.js'

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

export default function Convocatorias(props) {
  const { radar, visibles, etapa, ir, top, seg, perfil } = props
  const n = { revisar: 0, preparando: 0, presentadas: 0, descartadas: 0 }
  visibles.forEach(a => { n[etapaDe(a)]++ })
  const etapas = [['revisar', 'Radar'], ['preparando', 'En proceso'], ['presentadas', 'Presentado']]
  return (
    <>
      {top('Convocatorias')}
      <div className="i-estado">
        <div className="i-linea" role="group" aria-label="Estado de las convocatorias">
          {etapas.map(([k, t], i) => (
            <Fragment key={k}>
              <button className={`seg ${etapa === k ? 'on' : ''} ${k === 'revisar' && n.revisar ? 'hot' : ''}`} aria-pressed={etapa === k} onClick={() => ir(k)}><b>{n[k]}</b>{t}</button>
              {i < 2 && <span className="arr"><Icon n="keyR" s={14} w={2.4} /></span>}
            </Fragment>
          ))}
        </div>
        <button className={`i-arch ${etapa === 'descartadas' ? 'on' : ''}`} onClick={() => ir('descartadas')} title="Descartadas" aria-label={`Descartadas: ${n.descartadas}`}><Icon n="archive" s={22} /><span className="n">{n.descartadas}</span></button>
      </div>
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
      {ruta.length > 0 && <Pasos {...{ ruta, a, setCurId }} />}
      {a ? (
        <>
          <div className="i-card i-hero">
            {decidida && <div className="i-ya"><Icon n="undo" s={16} w={2.4} />La clasificasteis como «{ETIQ_RUTA[a.estado]}». Elegid otra opción para cambiarla.</div>}
            <div className="i-head" style={{ alignItems: 'center' }}>
              <span className={`i-v ${vc}`}><i><Icon n={vi} s={14} w={3} /></i>{vt}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="i-tag">BDNS {a.codigo}</span>{a.url && <a className="i-link" href={a.url} target="_blank" rel="noopener noreferrer">Ver convocatoria ↗</a>}</span>
            </div>
            <h3 className={a.titulo.length > 110 ? 'long' : ''}>{a.titulo}</h3>
            <div style={{ color: 'var(--mut)' }}>{a.organo}</div>
            <div className="k4">
              <div><span>¿Cuánto dan?</span><b className={a.importe ? '' : 'i-ni'}>{a.importe || 'No indicado'}</b>{a.importeEsPresupuesto && <small>presupuesto total</small>}</div>
              <div><span>¿Qué parte pagan?</span><b className={a.cubierto ? '' : 'i-ni'}>{a.cubierto || 'No indicado'}</b></div>
              <div className="hot"><span>¿Hasta cuándo?</span><b>{plazoTxt(a)}</b>{a.plazo && <small>{a.plazoEstimado ? 'plazo estimado · ' : ''}{fechaCorta(a.plazo)}</small>}</div>
              <div><span>¿Por qué encaja?</span><b className="enc">{LINEAS[a.linea] && <em className="lin">{LINEAS[a.linea]}</em>}{a.motivo || 'Sin análisis todavía'}</b></div>
            </div>
            {a.requisitos?.length > 0 && (
              <ul className="i-req">
                {a.requisitos.map(r => <li key={r.texto} className={r.estado}><i>{r.estado === 'cumple' ? '✓' : r.estado === 'no' ? '✗' : '?'}</i>{r.texto}</li>)}
              </ul>
            )}
            {a.avisos.length > 0 && <div className="i-cita aviso">{a.avisos.map(t => <div key={t}><Icon n="info" s={14} /> {t}</div>)}<small>Según vuestros criterios del Perfil</small></div>}
            {a.cita && <div className="i-cita">«…<mark>{a.cita}</mark>…»<small><Icon n="verified" s={14} />Comprobado en el texto oficial</small></div>}
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

// En proceso: las que habéis elegido presentar. Se quedan aquí hasta que las presentéis
// («Ya la he presentado» las pasa a Presentado) o las descartéis.
function Preparando({ lista, ir, seg, setDescartando, cambiarEstado }) {
  return (
    <div className="i-lista">
      <div className="i-head" style={{ alignItems: 'flex-end' }}>
        <div><h2>En proceso</h2><p className="i-sub" style={{ margin: '4px 0 0' }}>Las que habéis elegido presentar. Cuando las presentéis, pasan a Presentado.</p></div>
        <span className="i-tag">Por plazo</span>
      </div>
      {lista.length === 0 && <div className="i-card i-empty">Nada en proceso. Las que marquéis «Presentar» aparecerán aquí.</div>}
      {[...lista].sort((a, b) => (a.plazo || '9999').localeCompare(b.plazo || '9999')).map(a => {
        const s = segDe(seg, a.id)
        return (
          <div key={a.id} className="i-card i-proc">
            <div className="tags"><span className="i-tag">{a.organo}</span><span className="i-tag">BDNS {a.codigo}</span><span className="i-tag">Pendiente</span></div>
            <h3>{a.titulo}</h3>
            <div className="facts">
              <div><span>Importe</span><b className={a.importe ? '' : 'i-ni'}>{a.importe || 'No indicado'}</b></div>
              <div className="hot"><span>Plazo</span><b>{plazoTxt(a)}</b>{a.plazo && <small>{fechaCorta(a.plazo)}</small>}</div>
              <div><span>Siguiente paso</span><b className="paso">{s?.siguiente_paso || 'Presentar la solicitud'}</b>{a.sol?.actualizado_por && <small>Elegida por {a.sol.actualizado_por}</small>}</div>
            </div>
            <div className="acc">
              <button className="i-link" onClick={() => ir('presentar', a.id)}><Icon n="doc" s={16} />Ver papeles</button>
              <span style={{ flex: 1 }} />
              <button className="i-btn sm" onClick={() => setDescartando(a)}>Descartar</button>
              <button className="i-btn p sm" onClick={() => cambiarEstado(a, 'presentada')}>Ya la he presentado</button>
            </div>
          </div>
        )
      })}
    </div>
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
function Presentado({ lista, cambiarEstado, cambiarPaso, seg, perfil, ir }) {
  const [vista, setVista] = useState('marcha')
  const fin = a => a.estado === 'terminada' || a.estado === 'denegada'
  const enMarcha = lista.filter(a => !fin(a)).sort((a, b) => (segDe(seg, a.id)?.dias ?? 9999) - (segDe(seg, b.id)?.dias ?? 9999)), term = lista.filter(fin)
  const ver = vista === 'marcha' ? enMarcha : term
  const avisos = (seg?.avisos || []).filter(x => x.tipo === 'convocatoria')
  return (
    <div className="i-lista">
      <div className="i-head" style={{ alignItems: 'flex-end' }}>
        <div><h2>Presentado</h2><p className="i-sub" style={{ margin: '4px 0 0' }}>Ya enviadas. Os avisamos cuando se acerque cada paso.</p></div>
        <div className="i-seg"><button className={vista === 'marcha' ? 'on' : ''} onClick={() => setVista('marcha')}>En marcha · {enMarcha.length}</button><button className={vista === 'term' ? 'on' : ''} onClick={() => setVista('term')}>Terminadas · {term.length}</button></div>
      </div>
      {avisos.length > 0 && vista === 'marcha' && (
        <div className="i-avisos" role="status">{avisos.map(x => <div key={`${x.tipo}${x.id}`} className={x.nivel}><Icon n="bell" s={16} />{x.texto}</div>)}</div>
      )}
      {ver.length === 0 && <div className="i-card i-empty">{vista === 'marcha' ? 'No hay solicitudes en marcha.' : 'Aún no hay solicitudes terminadas.'}</div>}
      {ver.map(a => {
        const p = PASO_DE[a.estado], s = segDe(seg, a.id), sig = SIGUIENTE[a.estado] || []
        const alerta = a.estado === 'subsanar' || a.estado === 'denegada'
        return (
          <div key={a.id} className="i-card i-proc">
            <div className="tags"><span className="i-tag">{a.organo}</span><span className="i-tag">BDNS {a.codigo}</span><span className="i-tag">{a.estado === 'subsanar' ? 'Por subsanar' : a.estado === 'denegada' ? 'Denegada' : a.estado === 'terminada' ? 'Terminada' : PASOS_TXT[p]}</span></div>
            <h3>{a.titulo}</h3>
            <div className="facts">
              <div><span>Importe</span><b className={a.importe ? '' : 'i-ni'}>{a.importe || 'No indicado'}</b></div>
              <div className={`cuenta ${s?.nivel || 'sin_fecha'}`}>
                <span>{s?.siguiente_paso || (fin(a) ? 'Cerrada' : 'Siguiente paso')}</span>
                <b>{fin(a) ? '—' : cuenta(s?.dias)}</b>
                <small>{s?.fecha_paso ? `Previsto el ${fechaCorta(s.fecha_paso)}` : fin(a) ? '' : 'Sin fecha: poned una'}</small>
              </div>
              <div><span>Última actualización</span><b className="paso">{a.sol?.actualizado ? fechaCorta(a.sol.actualizado) : '—'}</b>{a.sol?.actualizado_por && <small>por {a.sol.actualizado_por}</small>}</div>
            </div>
            <div className="i-stp">{PASOS_TXT.map((t, i) => <span key={t} className={i < p ? 'd' : i === p ? 'now' : ''}>{i < p && <Icon n="check" s={13} w={3} />}{t}</span>)}</div>
            <div className="i-msg" style={{ marginTop: 12, maxWidth: 'none', background: alerta ? 'var(--co-l)' : 'var(--soft)', color: alerta ? 'var(--co-d)' : 'var(--nv)' }}>{MENSAJE[a.estado]}</div>
            <div className="acc">
              {!fin(a) && (
                <label className="i-fecha">Cambiar la fecha
                  <input type="date" className="i-in" value={s?.fecha_paso?.slice(0, 10) || ''} onChange={e => e.target.value && cambiarPaso(a, { fecha_paso: e.target.value })} />
                </label>
              )}
              <span style={{ flex: 1 }} />
              {sig.map(([e, t], i) => <button key={e} className={i === 0 ? 'i-btn p sm' : 'i-link'} style={i ? { color: 'var(--mut)' } : null} onClick={() => cambiarEstado(a, e)}>{i === 0 ? `${t} →` : t}</button>)}
            </div>
          </div>
        )
      })}
      <p className="i-sub" style={{ margin: '4px 0 0' }}><Icon n="bell" s={15} /> {AVISOS_TXT[perfil?.avisos] || AVISOS_TXT.cada_manana}. <button className="i-link" onClick={() => ir('perfil')}>Cambiar en Perfil</button></p>
    </div>
  )
}

function Descartadas({ lista, recuperar }) {
  const [seg, setSeg] = useState('radar')
  const [tope, setTope] = useState(30)
  const por = { radar: lista.filter(a => descartadaPor(a) === 'radar'), equipo: lista.filter(a => descartadaPor(a) === 'equipo') }
  const ver = por[seg]
  return (
    <>
      <div className="i-head"><h2 style={{ fontSize: 26 }}>Lo que no os encaja, con su motivo</h2><div className="i-seg"><button className={seg === 'radar' ? 'on' : ''} onClick={() => { setSeg('radar'); setTope(30) }}>Por el radar · {por.radar.length}</button><button className={seg === 'equipo' ? 'on' : ''} onClick={() => { setSeg('equipo'); setTope(30) }}>Por vosotros · {por.equipo.length}</button></div></div>
      <p className="i-sub">Nada desaparece sin explicar por qué. Si el radar se equivoca, recuperadla.</p>
      <div className="i-grid2">
        {ver.length === 0 && <div className="i-card i-empty" style={{ gridColumn: '1/3' }}>Nada por aquí.</div>}
        {ver.slice(0, tope).map(a => (
          <div key={a.id} className="i-card" style={{ padding: '18px 22px' }}>
            <div className="i-head" style={{ alignItems: 'center' }}>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {seg === 'equipo' ? (a.sol?.motivos?.length ? a.sol.motivos.map(m => <span key={m} className="i-tag">{m}</span>) : <span className="i-tag">Sin motivo</span>) : <span className="i-tag">El radar</span>}
              </span>
              <button className="i-link" onClick={() => recuperar(a)}><Icon n="undo" s={15} w={2.4} />Recuperar</button>
            </div>
            <b className="i-dt">{a.titulo}</b>
            <div style={{ color: 'var(--mut)', fontSize: 14.5 }}>{a.organo}{a.plazo ? ` · plazo ${fechaCorta(a.plazo)}` : ''}</div>
            {seg === 'radar' && a.motivo && <p className="i-mot">{a.motivo}</p>}
            {seg === 'equipo' && a.sol?.nota && <p className="i-mot">{a.sol.nota}</p>}
            {a.cita && <div className="i-cita" style={{ marginTop: 10, fontSize: 15, padding: '10px 14px' }}>«{a.cita}»<small style={{ color: 'var(--mut)' }}><Icon n="verified" s={13} />Frase del texto oficial</small></div>}
          </div>
        ))}
      </div>
      {ver.length > tope && <button className="i-btn sm" style={{ margin: '16px auto 0' }} onClick={() => setTope(tope + 30)}>Ver más ({ver.length - tope})</button>}
    </>
  )
}
