import { useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { island } from './lp.js'
import { validarCif } from './cif.js'
import { fechaCorta } from '../datos.js'

// Pantalla «Preparar papeles». Real: la convocatoria, sus requisitos y el botón «Ya la hemos presentado»
// (PUT estado: "presentada"). Los documentos salen de la lista del perfil (GET /api/perfil → documentos).
// TODO backend: documentos que pide CADA convocatoria (el radar aún no los extrae), subida y
// verificación de archivos. Hoy la comprobación se hace en el navegador y no se guarda ningún archivo.
const quitarTildes = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const VACIAS = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'al', 'para', 'por']
async function verificar(file, doc) {
  const checks = [], ext = file.name.split('.').pop().toLowerCase()
  const firmas = { pdf: '%PDF', png: '\x89PNG', jpg: '\xff\xd8', jpeg: '\xff\xd8', docx: 'PK' }
  if (!firmas[ext]) return { estado: 'error', checks: [['no', 'Formato no admitido. Subid PDF, JPG, PNG o Word (.docx).']] }
  checks.push(['ok', `Formato ${ext.toUpperCase()}`])
  if (file.size < 1024) return { estado: 'error', checks: [...checks, ['no', 'El archivo está vacío o casi vacío.']] }
  if (file.size > 10 * 1024 * 1024) return { estado: 'error', checks: [...checks, ['no', 'Pesa más de 10 MB: la mayoría de sedes no lo aceptan.']] }
  checks.push(['ok', `Tamaño correcto (${file.size < 1048576 ? Math.round(file.size / 1024) + ' KB' : (file.size / 1048576).toFixed(1) + ' MB'})`])
  const bytes = new Uint8Array(await file.slice(0, 300000).arrayBuffer())
  const texto = Array.from(bytes, b => String.fromCharCode(b)).join('')
  if (!texto.startsWith(firmas[ext])) return { estado: 'error', checks: [...checks, ['no', 'El archivo está dañado o no es lo que dice su extensión.']] }
  checks.push(['ok', 'Se puede abrir'])
  const claves = quitarTildes(doc).split(/\s+/).filter(w => w.length > 3 && !VACIAS.includes(w))
  const donde = quitarTildes(file.name + ' ' + (ext === 'pdf' ? texto : ''))
  const hallada = claves.find(k => donde.includes(k.slice(0, 6)))
  if (hallada) { checks.push(['ok', `Parece «${doc}»`]); return { estado: 'ok', checks } }
  checks.push(['duda', `No encontramos «${claves[0] || doc}» en el archivo. Comprobad que es el documento correcto.`])
  return { estado: 'duda', checks }
}

// Documentos de ejemplo de esta solicitud: se guardan solo en este navegador.
const claveDocs = id => `radar-ejemplo-docs-${id}`
function leerDocs(id, perfil) {
  try { const g = JSON.parse(localStorage.getItem(claveDocs(id))); if (Array.isArray(g)) return g } catch { /* usar los del perfil */ }
  return (perfil?.documentos || []).map(d => [d.nombre, d.tengo ? (d.caduca ? `Válido hasta ${fechaCorta(d.caduca)}` : 'Guardado en vuestro perfil') : 'Pendiente de conseguir', Boolean(d.tengo)])
}

export default function Presentar({ a, top, ir, presentadas, objetivo, perfil, presentar }) {
  if (!a) return <>{top('Convocatorias · preparar')}<div className="i-card i-empty">Elegid una convocatoria desde Preparando.</div></>
  return <Papeles key={a.id} {...{ a, top, ir, presentadas, objetivo, perfil, presentar }} />
}

function Papeles({ a, top, ir, presentadas, objetivo, perfil, presentar }) {
  const [docs, setDocsState] = useState(() => leerDocs(a.id, perfil))
  const [revisando, setRevisando] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const setDocs = d => { setDocsState(d); try { localStorage.setItem(claveDocs(a.id), JSON.stringify(d)) } catch { /* sin almacenamiento */ } }
  const toggle = i => setDocs(docs.map((d, j) => (j === i ? [d[0], d[1], !d[2]] : d)))
  const tiene = docs.map((d, i) => [d, i]).filter(([d]) => d[2]), falta = docs.map((d, i) => [d, i]).filter(([d]) => !d[2])
  const subir = async (i, file) => {
    if (!file) return
    setRevisando(i)
    const r = await verificar(file, docs[i][0])
    setRevisando(null)
    setDocs(docs.map((d, j) => (j === i ? [d[0], d[1], r.estado !== 'error', { nombre: file.name, ...r }] : d)))
  }
  const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const estadoDoc = d => (!d[2] ? 'falta' : d[3]?.estado === 'duda' ? 'revisar' : 'listo')
  const orden = { falta: 0, revisar: 1, listo: 2 }
  const lista = docs.map((d, i) => [d, i]).sort((x, y) => orden[estadoDoc(x[0])] - orden[estadoDoc(y[0])])
  const setDoc = (i, cambios) => setDocs(docs.map((d, j) => (j === i ? Object.assign([...d], cambios) : d)))
  const Doc = ([d, i]) => {
    const f = d[3], e = revisando === i ? 'comprobando' : estadoDoc(d)
    const avisos = f ? f.checks.filter(c => c[0] !== 'ok') : []
    const etiqueta = { falta: 'Falta', revisar: 'Revisadlo', listo: 'Listo', comprobando: 'Comprobando…' }[e]
    return (
      <div key={i} className={`i-doc ${e}`}>
        <button className="ico" title="Marcar a mano" onClick={() => toggle(i)}>{e === 'listo' ? <Icon n="check" s={16} w={3} /> : e === 'revisar' ? '!' : null}</button>
        <div className="txt">
          <b>{d[0]}</b>
          <small>{f ? <><Icon n="doc" s={13} /> {f.nombre}{e === 'listo' && ' · verificado'}</> : d[1]}{d[4]?.ok && ' · revisado por vosotros'}</small>
          {e !== 'comprobando' && avisos.map(([k, t]) => <em key={t} className={k}>{t}</em>)}
        </div>
        <span className="st">{etiqueta}</span>
        <div className="acts">{e !== 'falta' && e !== 'comprobando' && <button className={`i-up ${abierto === i ? 'on' : ''}`} onClick={() => setAbierto(abierto === i ? null : i)}><Icon n="eye" s={15} />Revisar</button>}
          <label className={`i-up ${e === 'falta' ? 'p' : ''}`}><Icon n={f ? 'undo' : 'plus'} s={15} w={2.4} />{f ? 'Cambiar' : 'Subir'}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" hidden onChange={ev => { subir(i, ev.target.files[0]); ev.target.value = '' }} /></label></div>
        {abierto === i && <Revision d={d} cif={perfil?.cif} cerrar={() => setAbierto(null)} set={c => setDoc(i, c)} />}
      </div>
    )
  }
  const n = falta.length
  const dudas = (a.requisitos || []).filter(r => r.estado === 'duda' || r.estado === 'no')
  const plazo = a.plazo ? new Date(`${a.plazo}T00:00:00`) : null
  return (
    <>
      {top('Convocatorias · preparar')}
      <button className="i-link" style={{ marginBottom: 8, alignSelf: 'flex-start' }} onClick={() => ir('preparando')}><Icon n="back" s={16} w={2.4} />Volver a Preparando</button>
      <div className="i-two">
        <div>
          <h2>¿Qué hace falta para presentarla?</h2>
          <p className="i-sub">{a.titulo.length > 120 ? `${a.titulo.slice(0, 120)}…` : a.titulo} · {a.organo}</p>
          <div className="i-card i-docs">
            <div className="i-docs-h"><b>Tenéis {tiene.length} de {docs.length} documentos</b><span>{docs.length === 0 ? 'Añadid los documentos de la entidad en el Perfil.' : n ? `Os ${n === 1 ? 'falta 1' : `faltan ${n}`}. Subidlos y el radar comprobará que son válidos.` : '¡Lo tenéis todo! Ya podéis presentarla.'} <span className="i-ej">Ejemplo</span></span></div>
            {lista.map(Doc)}
            <p className="i-priv"><Icon n="info" s={14} />Lista de documentos de vuestro perfil, no la que pide esta convocatoria (aún no la extrae el radar). Los archivos se comprueban en vuestro ordenador y no se envían a ningún sitio.</p>
          </div>
          {a.requisitos?.length > 0 && (
            <div className="i-card" style={{ padding: '16px 22px', marginTop: 14 }}>
              <b style={{ fontSize: 18 }}>Requisitos de la convocatoria</b>
              <ul className="i-req" style={{ marginTop: 10 }}>{a.requisitos.map(r => <li key={r.texto} className={r.estado}><i>{r.estado === 'cumple' ? '✓' : r.estado === 'no' ? '✗' : '?'}</i>{r.texto}</li>)}</ul>
            </div>
          )}
          {dudas.length > 0 && <div className="i-tip"><span className="ic"><Icon n="info" s={20} w={2.2} /></span><div><b>Antes de presentarla, comprobad</b>{dudas.map(r => r.texto).join(' · ')}</div></div>}
          {a.cita && <div className="i-cita" style={{ marginTop: 14 }}>«…<mark>{a.cita}</mark>…»<small><Icon n="verified" s={14} />Comprobado en las bases</small></div>}
        </div>
        <div className="i-side">
          <div className="i-card i-dl">
            <span className="i-k">Plazo</span>
            <div className="big">{a.dias == null ? 'Sin fecha' : a.dias < 0 ? 'Cerrada' : `${a.dias} días`}</div>
            {plazo && <p>{a.plazoEstimado ? 'plazo estimado, ' : ''}hasta el {plazo.getDate()} de {MESL[plazo.getMonth()]}</p>}
            <Svg html={island(300, 200, Math.min(presentadas + 1, objetivo), objetivo)} style={{ display: 'block', margin: '6px 0 0' }} />
            <p className="tree">Al presentarla plantáis el árbol n.º {presentadas + 1}</p>
            <button className="i-btn p" style={{ width: '100%' }} onClick={() => presentar(a)}><Icon n="check" s={19} w={2.6} />Ya la hemos presentado</button>
            {a.url && <a className="i-link" style={{ marginTop: 10 }} href={a.url} target="_blank" rel="noopener noreferrer">Ver convocatoria en la BDNS ↗</a>}
            {n > 0 && <small className="warn">Aún os {n === 1 ? 'falta 1 documento' : `faltan ${n} documentos`}</small>}
          </div>
        </div>
      </div>
    </>
  )
}

function Revision({ d, cif: cifPerfil, cerrar, set }) {
  const esCif = /cif/i.test(d[0]), f = d[3]
  const [cif, setCif] = useState(d[4]?.valor || cifPerfil || '')
  const [ok, msg] = validarCif(cif)
  const confirmar = () => { set({ 2: true, 4: { ok: true, valor: esCif ? cif.toUpperCase() : undefined } }); cerrar() }
  return (
    <div className="i-rev">
      {esCif ? (<>
        <label className="lab">CIF de la entidad</label>
        <input className={`i-in ${ok ? 'ok' : 'no'}`} value={cif} onChange={e => setCif(e.target.value)} spellCheck="false" />
        <p className={ok ? 'okm' : 'nom'}>{ok ? '✓ ' : '✕ '}{msg}</p>
        <p className="mut">Sale de vuestro perfil. Si lo cambiáis aquí, solo se usa en esta pantalla; para cambiarlo de verdad, editadlo en el Perfil.</p>
      </>) : f ? (<>
        <p className="lab">Comprobaciones de «{f.nombre}»</p>
        {f.checks.map(([k, t]) => <p key={t} className={k === 'ok' ? 'okm' : k === 'duda' ? 'dum' : 'nom'}>{k === 'ok' ? '✓' : k === 'duda' ? '!' : '✕'} {t}</p>)}
        <p className="mut">El radar comprueba formato, tamaño y que parezca el documento. Revisad vosotros fechas y firmas.</p>
      </>) : (<>
        <p className="lab">{d[1]}</p>
        <p className="mut">Lo tenéis guardado en vuestro perfil. Comprobad que sigue vigente antes de presentarlo.</p>
      </>)}
      <div className="row">
        <button className="i-btn sm p" disabled={esCif && !ok} style={esCif && !ok ? { opacity: .45, cursor: 'not-allowed' } : null} onClick={confirmar}><Icon n="check" s={16} w={2.6} />Es correcto</button>
        <button className="i-btn sm" onClick={() => { set({ 2: false, 3: undefined, 4: undefined }); cerrar() }}><Icon n="x" s={16} w={2.4} />No lo tenemos</button>
      </div>
    </div>
  )
}
