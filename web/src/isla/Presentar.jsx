import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { island } from './lp.js'
import { ErrorSesion, api, sesionGuardada, subirDocumento } from '../api.js'
import { fechaCorta } from '../datos.js'
import { LISTA_GENERAL, clave } from './papeles.js'

// Pantalla «Preparar papeles», con vista dividida:
//  · Izquierda: lo que pide ESTA convocatoria (el radar lo saca del PDF oficial: a.documentos_requeridos),
//    con la frase de donde sale y los modelos oficiales (a.plantillas).
//  · Derecha: la biblioteca de Reforesta (GET /api/documentos), lo que siempre se pide.
//  · Arrastrar un documento de la derecha a un hueco de la izquierda lo asigna
//    (PUT /api/solicitudes/convocatoria/:id/documentos/:hueco). También se puede soltar un archivo
//    del ordenador en un hueco, o usar el selector «Asignar» (accesible con teclado).
// Si el radar no encontró la lista en el PDF, se usa una lista general y se avisa.

const TIPO_NOMBRE = {
  estatutos: 'Estatutos', registro_entidad: 'Inscripción en registro', cif: 'CIF', representante_legal: 'Representante legal',
  cert_hacienda: 'Certificado de Hacienda', cert_seg_social: 'Certificado de la Seg. Social', declaracion_responsable: 'Declaración responsable',
  memoria_actividades: 'Memoria de actividades', memoria_proyecto: 'Memoria del proyecto', presupuesto: 'Presupuesto',
  cuentas_anuales: 'Cuentas anuales', titularidad_bancaria: 'Titularidad bancaria', permiso_propietario: 'Permiso del propietario',
  solicitud: 'Solicitud', anexo: 'Anexo', otro: 'Otro',
}
// Documentos propios de cada solicitud: no tienen sentido en la biblioteca general.
const PROPIOS = ['memoria_proyecto', 'presupuesto', 'permiso_propietario', 'solicitud', 'anexo']
const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// ¿Sirve este documento para esta convocatoria? Caducidad y antigüedad máxima.
function avisoValidez(doc, req, plazo) {
  if (!doc) return null
  const hoy = new Date(new Date().toDateString())
  if (doc.caduca) {
    const c = new Date(`${doc.caduca}T00:00:00`)
    if (c < hoy) return `Caducó el ${fechaCorta(doc.caduca)}: pedid uno nuevo`
    if (plazo && c < plazo) return `Caduca el ${fechaCorta(doc.caduca)}, antes del cierre`
  }
  if (req.antiguedad_max_meses && doc.emitido) {
    const limite = new Date(`${doc.emitido}T00:00:00`)
    limite.setMonth(limite.getMonth() + req.antiguedad_max_meses)
    if (limite < (plazo || hoy)) return `Debe tener menos de ${req.antiguedad_max_meses} meses (es del ${fechaCorta(doc.emitido)})`
  }
  return null
}

export default function Presentar({ a, top, ir, presentadas, objetivo, perfil, presentar }) {
  if (!a) return <>{top('Convocatorias · preparar')}<div className="i-card i-empty">Elegid una convocatoria desde Preparando.</div></>
  return <Papeles key={a.id} {...{ a, top, ir, presentadas, objetivo, perfil, presentar }} />
}

function Papeles({ a, top, ir, presentadas, objetivo, presentar }) {
  const [biblio, setBiblio] = useState(null)
  const [almacen, setAlmacen] = useState(false)
  const [asig, setAsig] = useState({})
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(null)
  const [arrastrando, setArrastrando] = useState(null)   // tipo del documento que se arrastra
  const [sobre, setSobre] = useState(null)

  const reqs = useMemo(() => (a.documentos_requeridos?.length ? a.documentos_requeridos : LISTA_GENERAL)
    .map(r => ({ ...r, clave: clave(r) })), [a.documentos_requeridos])
  const general = !a.documentos_requeridos?.length
  const plazo = a.plazo ? new Date(`${a.plazo}T00:00:00`) : null

  const cargar = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([api('/documentos'), api(`/solicitudes/convocatoria/${a.id}/documentos`)])
      setBiblio(b.documentos); setAlmacen(b.almacen)
      setAsig(Object.fromEntries(s.map(x => [x.requisito, x])))
      setError('')
    } catch (e) { setError(e instanceof ErrorSesion ? 'La sesión ha caducado: volved a entrar.' : e.message) }
  }, [a.id])
  useEffect(() => { cargar() }, [cargar])

  const asignar = async (req, documentoId) => {
    setOcupado(req.clave)
    try { await api(`/solicitudes/convocatoria/${a.id}/documentos/${req.clave}`, { metodo: 'PUT', datos: { documento_id: documentoId } }); await cargar() }
    catch (e) { setError(e.message) }
    setOcupado(null)
  }
  // Un archivo del ordenador: va a la biblioteca (con el tipo del hueco) y se asigna al hueco.
  const subirA = async (req, archivo) => {
    if (!archivo) return
    setOcupado(req.clave)
    try {
      const r = almacen
        ? await subirDocumento({ archivo, nombre: req.nombre, tipo: req.tipo })
        : await api('/documentos', { metodo: 'POST', datos: { nombre: `${req.nombre} (${archivo.name})`, tipo: req.tipo } })
      await api(`/solicitudes/convocatoria/${a.id}/documentos/${req.clave}`, { metodo: 'PUT', datos: { documento_id: r.id } })
      await cargar()
    } catch (e) { setError(e.message) }
    setOcupado(null)
  }

  const docDe = id => (biblio || []).find(d => d.id === id)
  const filas = reqs.map(r => {
    const s = asig[r.clave], doc = s?.documento_id ? docDe(s.documento_id) : null
    const sugerido = !doc && !PROPIOS.includes(r.tipo) ? (biblio || []).find(d => d.tipo === r.tipo) : null
    const aviso = avisoValidez(doc, r, plazo)
    const estado = s?.estado === 'no_aplica' ? 'no_aplica' : doc ? (aviso ? 'revisar' : 'listo') : 'falta'
    return { r, s, doc, sugerido, aviso, estado }
  })
  const obligatorios = filas.filter(f => f.r.obligatorio !== false && f.estado !== 'no_aplica')
  const listos = obligatorios.filter(f => f.estado === 'listo').length
  const faltan = obligatorios.length - listos

  const soltar = (ev, req) => {
    ev.preventDefault(); setSobre(null)
    const archivo = ev.dataTransfer.files?.[0]
    if (archivo) return subirA(req, archivo)
    const id = Number(ev.dataTransfer.getData('text/documento'))
    if (id) asignar(req, id)
  }

  return (
    <>
      {top('Convocatorias · preparar')}
      <button className="i-link" style={{ marginBottom: 8, alignSelf: 'flex-start' }} onClick={() => ir('preparando')}><Icon n="back" s={16} w={2.4} />Volver a Preparando</button>
      <h2 style={{ margin: '0 0 2px' }}>¿Qué hace falta para presentarla?</h2>
      <p className="i-sub">{a.titulo.length > 120 ? `${a.titulo.slice(0, 120)}…` : a.titulo} · {a.organo}</p>
      {error && <p className="i-err" role="alert">{error} <button className="i-link" onClick={cargar}>Reintentar</button></p>}

      <div className="i-split">
        {/* IZQUIERDA: lo que pide esta convocatoria */}
        <div className="i-card i-docs">
          <div className="i-docs-h">
            <b>{biblio ? `Tenéis ${listos} de ${obligatorios.length}` : 'Cargando…'}</b>
            <span>{general
              ? 'El radar no encontró la lista en el PDF de esta convocatoria: es una lista general. Revisad las bases.'
              : `Lo que pide esta convocatoria${a.documentos_fuente ? ` (sacado de «${a.documentos_fuente}»)` : ''}. Arrastrad aquí vuestros documentos.`}</span>
          </div>
          {filas.map(({ r, doc, sugerido, aviso, estado }) => (
            <div key={r.clave}
              className={`i-doc i-hueco ${ocupado === r.clave ? 'comprobando' : estado} ${sobre === r.clave ? 'sobre' : ''} ${arrastrando && arrastrando === r.tipo ? 'compatible' : ''}`}
              onDragOver={ev => { ev.preventDefault(); setSobre(r.clave) }} onDragLeave={() => setSobre(null)} onDrop={ev => soltar(ev, r)}>
              <span className="ico" aria-hidden="true">{estado === 'listo' ? <Icon n="check" s={16} w={3} /> : estado === 'revisar' ? '!' : null}</span>
              <div className="txt">
                <b>{r.nombre}{r.obligatorio === false && <span className="i-opc"> · opcional</span>}</b>
                <small>{doc ? <><Icon n="doc" s={13} /> {doc.nombre}{doc.tiene_archivo ? '' : ' (sin archivo)'}</> : r.condicion || TIPO_NOMBRE[r.tipo]}</small>
                {aviso && <em className="duda">{aviso}</em>}
                {sugerido && <em className="sug">Tenéis «{sugerido.nombre}» en la biblioteca <button className="i-link" onClick={() => asignar(r, sugerido.id)}>Usarlo</button></em>}
                {r.cita && <em className="cita">«{r.cita}»</em>}
              </div>
              <div className="acts">
                <select className="i-up" aria-label={`Asignar un documento a ${r.nombre}`} value={doc?.id || ''} onChange={e => asignar(r, e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{doc ? 'Quitar' : 'Asignar…'}</option>
                  {(biblio || []).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
                <label className={`i-up ${estado === 'falta' ? 'p' : ''}`}><Icon n="plus" s={15} w={2.4} />Subir<input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.odt,.ods" hidden onChange={ev => { subirA(r, ev.target.files[0]); ev.target.value = '' }} /></label>
              </div>
            </div>
          ))}
          {a.plantillas?.length > 0 && (
            <div className="i-plant"><b>Modelos oficiales para rellenar</b>
              {a.plantillas.map(p => <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer"><Icon n="doc" s={14} /> {p.nombre}</a>)}
            </div>
          )}
        </div>

        {/* DERECHA: biblioteca de Reforesta */}
        <div className="i-side">
          <div className="i-card i-biblio">
            <b>Documentos de Reforesta</b>
            <p className="i-sub" style={{ margin: '2px 0 10px' }}>Los que se piden siempre. Arrastradlos a la izquierda.</p>
            {biblio && biblio.length === 0 && <p className="i-sub">Aún no hay ninguno: subid uno en cualquier hueco de la izquierda.</p>}
            {(biblio || []).map(d => {
              const caducado = d.caduca && new Date(`${d.caduca}T00:00:00`) < new Date(new Date().toDateString())
              return (
                <div key={d.id} className="i-bdoc" draggable
                  onDragStart={ev => { ev.dataTransfer.setData('text/documento', String(d.id)); setArrastrando(d.tipo) }}
                  onDragEnd={() => { setArrastrando(null); setSobre(null) }}>
                  <Icon n="doc" s={18} />
                  <div><b>{d.nombre}</b><small>{TIPO_NOMBRE[d.tipo]}{d.caduca ? ` · ${caducado ? 'caducó' : 'caduca'} ${fechaCorta(d.caduca)}` : ''}</small></div>
                  {d.tiene_archivo && <a className="i-link" href={`/api/archivos/${d.id}`} onClick={ev => descargar(ev, d)} aria-label={`Descargar ${d.nombre}`}>↓</a>}
                </div>
              )
            })}
            {!almacen && <p className="i-priv"><Icon n="info" s={14} />Aún no hay almacén de archivos: se guarda qué documento es y su caducidad, sin el archivo.</p>}
          </div>
          <div className="i-card i-dl">
            <span className="i-k">Plazo</span>
            <div className="big">{a.dias == null ? 'Sin fecha' : a.dias < 0 ? 'Cerrada' : `${a.dias} días`}</div>
            {plazo && <p>{a.plazoEstimado ? 'plazo estimado, ' : ''}hasta el {plazo.getDate()} de {MESL[plazo.getMonth()]}</p>}
            <Svg html={island(300, 200, Math.min(presentadas + 1, objetivo), objetivo)} style={{ display: 'block', margin: '6px 0 0' }} />
            <p className="tree">Al presentarla plantáis el árbol n.º {presentadas + 1}</p>
            <button className="i-btn p" style={{ width: '100%' }} onClick={() => presentar(a)}><Icon n="check" s={19} w={2.6} />Presentar</button>
            {a.url && <a className="i-link" style={{ marginTop: 10 }} href={a.url} target="_blank" rel="noopener noreferrer">Ver convocatoria en la BDNS ↗</a>}
            {faltan > 0 && <small className="warn">Aún os {faltan === 1 ? 'falta 1 documento' : `faltan ${faltan} documentos`}</small>}
          </div>
        </div>
      </div>
    </>
  )
}

// La descarga necesita la contraseña en la cabecera: se pide con fetch y se guarda como archivo.
async function descargar(ev, d) {
  ev.preventDefault()
  const r = await fetch(`/api/archivos/${d.id}`, { headers: { 'x-clave-equipo': sesionGuardada() } })
  if (!r.ok) return
  const url = URL.createObjectURL(await r.blob())
  const enlace = Object.assign(document.createElement('a'), { href: url, download: d.archivo_nombre || d.nombre })
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
