import { Fragment, useEffect, useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { plant } from './lp.js'
import { api } from '../api.js'
import { REGLA } from '../data/ejemplos.js'
import { LINEAS, descartadaPor, etapaDe, fechaCorta } from '../datos.js'

// Pantalla «Convocatorias»: Por revisar → Preparando → Presentadas, y Descartadas.
// Datos: convocatorias.json (radar) + estados del equipo (API /solicitudes, ver radar.js).
const ESTADO_RUTA = { por_revisar: 'pend', mas_tarde: 'lt', descartada: 'no', preparando: 'ok' }
const ETIQ_RUTA = { pend: 'Pendiente', lt: 'Más tarde', no: 'No interesa', ok: 'A presentar' }
const VEREDICTO = {
  presenta: ['Sí, merece la pena presentarla', 'check', ''],
  mira: ['Mirad antes de decidir', 'eye', 'mira'],
  pendiente: ['Aún sin analizar por la IA', 'later', 'pen'],
  descarta: ['El radar la descartó', 'x', 'no'],
}
const plazoTxt = a => (a.plazo == null ? 'Sin fecha' : a.dias < 0 ? 'Cerrada' : a.dias === 0 ? 'Hoy' : `${a.plazoEstimado ? '≈ ' : ''}${a.dias} días`)

export default function Convocatorias(props) {
  const { radar, visibles, etapa, ir, top } = props
  const n = { revisar: 0, preparando: 0, presentadas: 0, descartadas: 0 }
  visibles.forEach(a => { n[etapaDe(a)]++ })
  const etapas = [['revisar', 'Por revisar', 'El radar las encontró', 0], ['preparando', 'Preparando', 'Reunís los papeles', 1], ['presentadas', 'Presentadas', 'Esperando respuesta', 2]]
  return (
    <>
      {top('Convocatorias')}
      <div className="i-pipe">
        {etapas.map(([k, t, s, p], i) => (
          <Fragment key={k}>
            <button className={`stg ${etapa === k ? 'on' : ''}`} onClick={() => ir(k)}><Svg className="pl" html={plant(p)} /><b>{n[k]}</b><span>{t}<small>{s}</small></span></button>
            {i < 2 && <span className="arr"><Icon n="keyR" s={18} w={2.4} /></span>}
          </Fragment>
        ))}
        <span />
        <button className={`stg dis ${etapa === 'descartadas' ? 'on' : ''}`} onClick={() => ir('descartadas')}><Icon n="eye" s={22} /><b>{n.descartadas}</b><span>Descartadas<small>con su motivo</small></span></button>
      </div>
      {etapa === 'revisar' && <Revisar {...props} generado={radar.conv?.generado} />}
      {etapa === 'preparando' && <Preparando {...props} lista={visibles.filter(a => etapaDe(a) === 'preparando')} />}
      {etapa === 'presentadas' && <Seguimiento {...props} lista={visibles.filter(a => etapaDe(a) === 'presentadas')} />}
      {etapa === 'descartadas' && <Descartadas {...props} lista={visibles.filter(a => etapaDe(a) === 'descartadas')} />}
    </>
  )
}

function Revisar({ ruta, curId, setCurId, decidir, setDescartando, ir, ej, setEj, generado }) {
  // ruta: lo que hay por revisar más lo que se ha clasificado en esta sesión (para poder cambiarlo).
  const a = curId === -1 ? null : ruta.find(x => x.id === curId) || ruta.find(x => x.estado === 'por_revisar') || null
  const hechas = ruta.filter(x => x.estado !== 'por_revisar').length
  useEffect(() => {
    const k = e => {
      if (!a || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || document.querySelector('.i-dim')) return
      if (e.key === 'ArrowLeft') setDescartando(a)
      if (e.key === 'ArrowDown') decidir(a, 'mas_tarde')
      if (e.key === 'ArrowRight') decidir(a, 'preparando')
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })
  const decidida = a && a.estado !== 'por_revisar'
  const [vt, vi, vc] = a ? VEREDICTO[a.veredicto] : []
  return (
    <div className="i-two" style={{ gridTemplateColumns: 'minmax(0,1fr) 330px' }}>
      <div>
        <h2>El radar tiene {ruta.length} por revisar · <span>{a ? `vais por la ${ruta.indexOf(a) + 1}` : 'todas clasificadas'}</span></h2>
        {generado && <p className="i-sub" style={{ margin: '2px 0 10px' }}>Actualizado el {new Date(generado).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>}
        <div className="i-ruta">
          {ruta.map((x, i) => {
            const s = ESTADO_RUTA[x.estado] || 'pend'
            return (
              <Fragment key={x.id}>
                <button className={`nd ${s} ${a && a.id === x.id ? 'cur' : ''}`} onClick={() => setCurId(x.id)} title={s === 'pend' ? 'Abrir' : 'Pulsad para volver a clasificarla'}>
                  <span className="dot">{s === 'no' ? <Icon n="x" s={17} w={2.8} /> : s === 'lt' ? <Icon n="later" s={17} w={2.6} /> : s === 'ok' ? <Icon n="check" s={17} w={3} /> : i + 1}</span>
                  <b>{x.titulo}</b><small>{a && a.id === x.id ? 'Revisando' : ETIQ_RUTA[s]}{s !== 'pend' && <em> · cambiar ↺</em>}</small>
                </button>
                {i < ruta.length - 1 && <i className={`ln ${s}`} />}
              </Fragment>
            )
          })}
        </div>
        {a ? (
          <div className="i-card i-hero">
            {decidida && <div className="i-ya"><Icon n="undo" s={16} w={2.4} />La clasificasteis como «{ETIQ_RUTA[ESTADO_RUTA[a.estado]]}». Elegid otra opción para cambiarla.</div>}
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
            {a.avisos.length > 0 && <div className="i-cita" style={{ background: '#FBF1DC', borderColor: '#E5B54A' }}>{a.avisos.map(t => <div key={t}><Icon n="info" s={14} /> {t}</div>)}<small>Según vuestros criterios del Perfil</small></div>}
            {a.cita && <div className="i-cita">«…<mark>{a.cita}</mark>…»<small><Icon n="verified" s={14} />Comprobado en el texto oficial</small></div>}
            <div className="acts3">
              <button className={`i-btn ${a.estado === 'descartada' ? 'sel' : ''}`} onClick={() => setDescartando(a)}><Icon n="x" s={19} w={2.4} />No nos interesa</button>
              <button className={`i-btn ${a.estado === 'mas_tarde' ? 'sel' : ''}`} onClick={() => decidir(a, 'mas_tarde')}><Icon n="later" s={19} />Más tarde</button>
              <button className="i-btn p" onClick={() => decidir(a, 'preparando')}><Icon n="send" s={19} />Vamos a presentarla</button>
            </div>
          </div>
        ) : (
          <div className="i-card" style={{ padding: 34, textAlign: 'center' }}>
            <Svg html={plant(3)} />
            <h3 style={{ fontSize: 26, margin: '6px 0' }}>{ruta.length ? `Hecho por hoy · ${hechas} de ${ruta.length} clasificadas` : 'No hay nada por revisar'}</h3>
            <p className="i-sub">{ruta.length ? 'Pulsad cualquier convocatoria de la ruta para cambiar su decisión. ' : ''}El radar vuelve a buscar mañana por la mañana.</p>
            {ruta.some(x => x.estado === 'preparando') && <button className="i-btn p" style={{ margin: '0 auto' }} onClick={() => ir('preparando')}><Icon n="doc" s={19} />Ir a preparar las que vais a presentar</button>}
          </div>
        )}
      </div>
      <Aprendido {...{ ej, setEj }} />
    </div>
  )
}

// TODO backend: reglas aprendidas (ver data/ejemplos.js). Todo este panel es de EJEMPLO.
function Aprendido({ ej, setEj }) {
  const cuenta = ej.historial.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {})
  const total = ej.historial.length
  const detectadas = Object.entries(cuenta).filter(([m, c]) => REGLA[m] && c >= 2 && ej.reglas[m] !== 'no').sort((x, y) => y[1] - x[1])
  const set = (m, v) => setEj(s => ({ ...s, reglas: { ...s.reglas, [m]: v } }))
  const nueva = () => { const t = prompt('Escribid la regla, por ejemplo: «No nos interesan las que exigen aval bancario»'); if (t) setEj(s => ({ ...s, propias: [...s.propias, { id: Date.now(), texto: t, autor: 'Vosotros', fecha: 'hoy' }] })) }
  const editar = r => { const t = prompt('Editad la regla', r.texto); if (t) setEj(s => ({ ...s, propias: s.propias.map(x => (x.id === r.id ? { ...x, texto: t } : x)) })) }
  return (
    <aside className="i-learn">
      <div className="h"><Icon n="info" s={20} />Lo que el radar ha aprendido <span className="i-ej">Ejemplo</span></div>
      <p>Ejemplo de cómo se verá: el radar aún no aplica reglas. Basado en {total} motivos de descarte de muestra.</p>
      {detectadas.map(([m, c]) => (
        <div key={m} className="rule">
          <span className="who">Detectado</span>
          <b>{REGLA[m][0]}</b><small>{c} {c === 1 ? 'vez' : 'veces'}{ej.reglas[m] === 'si' ? ' · aplicada' : ''}</small>
          <div className="act">{ej.reglas[m] === 'si'
            ? <><span className="ok">✓ {REGLA[m][1].replace('Ocultarlas', 'Ocultándolas').replace('Marcarlas', 'Marcándolas').replace('Avisadme antes', 'Avisando antes')}</span><button onClick={() => set(m, undefined)}>Quitar</button></>
            : <><button className="p" onClick={() => set(m, 'si')}>{REGLA[m][1]}</button><button onClick={() => set(m, 'no')}>No</button></>}</div>
        </div>
      ))}
      {ej.propias.map(r => (
        <div key={r.id} className="rule mine">
          <span className="who me">Añadida por vosotros</span>
          <b>{r.texto}</b><small>{r.autor} · {r.fecha}</small>
          <div className="act"><button onClick={() => editar(r)}>Editar</button><button onClick={() => setEj(s => ({ ...s, propias: s.propias.filter(x => x.id !== r.id) }))}>Quitar</button></div>
        </div>
      ))}
      <button className="addr" onClick={nueva}><Icon n="plus" s={17} w={2.4} />Añadir una regla</button>
    </aside>
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

function Preparando({ lista, ir, volverARevisar }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontSize: 26 }}>Las que vais a presentar</h2>
      {lista.length === 0 && <div className="i-card i-empty">Nada en preparación. Las que marquéis «Vamos a presentarla» aparecerán aquí.</div>}
      {[...lista].sort((a, b) => (a.plazo || '9999').localeCompare(b.plazo || '9999')).map(a => (
        <div key={a.id} className="i-card i-fila">
          <Svg html={plant(1)} />
          <div><b style={{ fontSize: 20 }}>{a.titulo}</b>
            <div style={{ color: 'var(--mut)', fontSize: 15 }}>{a.organo}{a.plazo ? ` · plazo el ${fechaCorta(a.plazo)}${a.dias >= 0 ? ` · quedan ${a.dias} días` : ' · cerrado'}` : ''}</div>
            {a.sol?.actualizado_por && <div className="i-stp"><span className="now">Marcada por {a.sol.actualizado_por}</span></div>}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <button className="i-btn p sm" onClick={() => ir('presentar', a.id)}><Icon n="doc" s={17} />Preparar papeles</button>
            <button className="i-link" onClick={() => volverARevisar(a)}><Icon n="undo" s={14} w={2.4} />Volver a revisar</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// Seguimiento por estados reales de la API: presentada → concedida → plantar → justificar → terminada
// (y subsanar / denegada). Ruta: PUT /api/solicitudes/convocatoria/:codigo {estado}.
// TODO backend: seguimiento por pasos con fechas, responsable y avisos (la API ya guarda
// responsable, siguiente_paso y fecha_paso, pero aún no tienen pantalla ni avisos).
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
function Seguimiento({ lista, cambiarEstado }) {
  const [seg, setSeg] = useState('marcha')
  const fin = a => a.estado === 'terminada' || a.estado === 'denegada'
  const enMarcha = lista.filter(a => !fin(a)), term = lista.filter(fin)
  const ver = seg === 'marcha' ? enMarcha : term
  return (
    <>
      <div className="i-head"><h2 style={{ fontSize: 26 }}>¿Cómo van vuestras solicitudes?</h2><div className="i-seg"><button className={seg === 'marcha' ? 'on' : ''} onClick={() => setSeg('marcha')}>En marcha · {enMarcha.length}</button><button className={seg === 'term' ? 'on' : ''} onClick={() => setSeg('term')}>Terminadas · {term.length}</button></div></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {ver.length === 0 && <div className="i-card i-empty">{seg === 'marcha' ? 'No hay solicitudes en marcha.' : 'Aún no hay solicitudes terminadas.'}</div>}
        {ver.map(a => {
          const p = PASO_DE[a.estado], aviso = a.estado === 'subsanar' || a.estado === 'denegada'
          const sig = SIGUIENTE[a.estado] || []
          return (
            <div key={a.id} className="i-card i-fila">
              <Svg html={plant(Math.min(3, p + 1))} />
              <div>
                <b style={{ fontSize: 20 }}>{a.titulo}</b>
                <div style={{ color: 'var(--mut)', fontSize: 15 }}>{a.organo}{a.sol?.actualizado ? ` · actualizada el ${fechaCorta(a.sol.actualizado)}${a.sol.actualizado_por ? ` por ${a.sol.actualizado_por}` : ''}` : ''}</div>
                <div className="i-stp">{PASOS_TXT.map((s, i) => <span key={s} className={i < p ? 'd' : i === p ? 'now' : ''}>{i < p && <Icon n="check" s={13} w={3} />}{s}</span>)}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                <div className="i-msg" style={{ background: aviso ? 'var(--co-l)' : 'var(--soft)', color: aviso ? '#B2432A' : 'var(--nv)' }}>{MENSAJE[a.estado]}</div>
                {sig.map(([e, t], i) => <button key={e} className="i-link" style={i ? { color: 'var(--mut)' } : null} onClick={() => cambiarEstado(a, e)}>{i === 0 ? `${t} →` : t}</button>)}
              </div>
            </div>
          )
        })}
      </div>
    </>
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

