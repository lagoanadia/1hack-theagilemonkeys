import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import Desplegable from './Desplegable.jsx'
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
// Icono de cada tipo de documento (casillas).
const ICONO_TIPO = { solicitud: 'doc', estatutos: 'list', registro_entidad: 'building', cif: 'user', representante_legal: 'user', cert_hacienda: 'euro',
  cert_seg_social: 'verified', declaracion_responsable: 'check', memoria_actividades: 'bookmark', memoria_proyecto: 'leaf', presupuesto: 'pct',
  cuentas_anuales: 'euro', titularidad_bancaria: 'building', permiso_propietario: 'map', anexo: 'doc', otro: 'doc' }
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

// Descarga el ZIP con los documentos de la solicitud (GET /api/solicitudes/convocatoria/:codigo/zip).
// Devuelve el nº de documentos que faltan según el servidor (cabecera x-documentos-faltan).
async function descargarZip(a) {
  const r = await fetch(`/api/solicitudes/convocatoria/${a.id}/zip`, { headers: { 'x-clave-equipo': sesionGuardada() } })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `No se pudo preparar el ZIP (${r.status})`)
  const faltan = Number(r.headers.get('x-documentos-faltan') || 0)
  const nombre = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(r.headers.get('content-disposition') || '')?.[1]
  const url = URL.createObjectURL(await r.blob())
  const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre ? decodeURIComponent(nombre) : `solicitud-${a.id}.zip` })
  document.body.appendChild(enlace); enlace.click(); enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return faltan
}

function Papeles({ a, top, ir, presentadas, objetivo, presentar }) {
  const [biblio, setBiblio] = useState(null)
  const [almacen, setAlmacen] = useState(false)
  const [asig, setAsig] = useState({})
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(null)
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
  // Detectar los documentos que ya hay: si la biblioteca tiene uno del mismo tipo y el hueco está vacío, se
  // asigna solo (estado «sugerido»). Se puede cambiar o quitar como cualquier otro.
  const autoHecho = useRef(false)
  useEffect(() => {
    if (!biblio || autoHecho.current) return
    const pendientes = filas.filter(f => !f.s && f.sugerido)
    autoHecho.current = true
    if (!pendientes.length) return
    Promise.all(pendientes.map(f => api(`/solicitudes/convocatoria/${a.id}/documentos/${f.r.clave}`, { metodo: 'PUT', datos: { documento_id: f.sugerido.id, estado: 'sugerido' } })))
      .then(cargar).catch(e => setError(e.message))
  }, [biblio, filas, a.id, cargar])
  const detectados = filas.filter(f => f.s?.estado === 'sugerido' && f.doc).length
  const obligatorios = filas.filter(f => f.r.obligatorio !== false && f.estado !== 'no_aplica')
  const listos = obligatorios.filter(f => f.estado === 'listo').length
  const faltan = obligatorios.length - listos

  // Presentar: descarga el ZIP con los documentos y, si no falta ninguno, la pasa a Presentado.
  const [presentando, setPresentando] = useState(false)
  const presentarConZip = async () => {
    if (faltan > 0) return setError(`Requisitos incompletos: ${faltan === 1 ? 'falta 1 documento' : `faltan ${faltan} documentos`}. Subidlos o asignadlos antes de presentar.`)
    setPresentando(true); setError('')
    try {
      const f = await descargarZip(a)
      if (f > 0) setError(`Requisitos incompletos: el servidor dice que ${f === 1 ? 'falta 1 documento' : `faltan ${f} documentos`}. Revisad los papeles antes de presentar.`)
      else await presentar(a)
    } catch (e) { setError(e instanceof ErrorSesion ? 'La sesión ha caducado: volved a entrar.' : e.message) }
    setPresentando(false)
  }

  const soltar = (ev, req) => {
    ev.preventDefault(); setSobre(null)
    const archivo = ev.dataTransfer.files?.[0]
    if (archivo) return subirA(req, archivo)
    const id = Number(ev.dataTransfer.getData('text/documento'))
    if (id) asignar(req, id)
  }

  return (
    <>
      {top('Convocatorias · preparar', false, <button className="i-link" onClick={() => ir('preparando')}><Icon n="back" s={16} w={2.4} />Volver a Preparando</button>)}
      {error && <p className="i-err" role="alert">{error} <button className="i-link" onClick={cargar}>Reintentar</button></p>}

      <div className="i-split">
        {/* IZQUIERDA: lo que pide esta convocatoria */}
        <div className="i-card i-docs">
          {/* Casillas: cada documento es una casilla; el color dice el estado. Todo en una pantalla. */}
          <div className="cs-cab">
            <div className="cs-anillo" aria-hidden="true">
              <svg width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="29" fill="none" stroke="#E6E1D3" strokeWidth="9" />
                <circle cx="36" cy="36" r="29" fill="none" stroke="#3F9A66" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${obligatorios.length ? (listos / obligatorios.length) * 182 : 0} 182`} transform="rotate(-90 36 36)" /></svg>
              <b>{listos}/{obligatorios.length}</b>
            </div>
            <div className="cs-tit">
              <h3>{biblio ? (faltan === 0 ? '¡Tenéis todos los documentos!' : `Tenéis ${listos} de ${obligatorios.length} documentos`) : 'Cargando…'}</h3>
              <small title={`${a.titulo} · ${a.organo}`}>{a.titulo.length > 90 ? `${a.titulo.slice(0, 90)}…` : a.titulo}</small>
              {detectados > 0 && <small className="det">✨ {detectados} {detectados === 1 ? 'detectado' : 'detectados'} en vuestra biblioteca</small>}
            </div>
            <div className="cs-chips">
              <span className="ok">{filas.filter(f => f.estado === 'listo').length} listos</span>
              {filas.some(f => f.estado === 'revisar') && <span className="rev">{filas.filter(f => f.estado === 'revisar').length} revisar</span>}
              {filas.some(f => f.estado === 'falta') && <span className="fa">{filas.filter(f => f.estado === 'falta').length} faltan</span>}
            </div>
          </div>
          {general && <p className="cs-gen">El radar no encontró la lista en el PDF de esta convocatoria: es una lista general. Revisad las bases.</p>}
          <div className="cs-grid">
            {filas.map(({ r, doc, sugerido, aviso, estado }) => (
              <div key={r.clave} title={r.cita ? `«${r.cita}»` : undefined}
                className={`cs-t ${estado} ${ocupado === r.clave ? 'comprobando' : ''} ${sobre === r.clave ? 'sobre' : ''}`}
                onDragOver={ev => { ev.preventDefault(); setSobre(r.clave) }} onDragLeave={() => setSobre(null)} onDrop={ev => soltar(ev, r)}>
                <div className="cs-top">
                  <span className="cs-ic"><Icon n={ICONO_TIPO[r.tipo] || 'doc'} s={22} /></span>
                  {doc
                    ? <button type="button" className="cs-est quitable" title="Quitar este documento" aria-label={`Quitar «${doc.nombre}» de ${r.nombre}`} onClick={() => asignar(r, null)}>
                        <span className="si">{estado === 'listo' ? <><Icon n="check" s={13} w={3.4} />Listo</> : '! Revisar'}</span><span className="no"><Icon n="x" s={13} w={3} />Quitar</span></button>
                    : <span className="cs-est">{estado === 'no_aplica' ? 'No aplica' : '+ Falta'}</span>}
                </div>
                <b>{r.nombre}{r.obligatorio === false && <span className="i-opc"> · opcional</span>}</b>
                <small>{aviso || (doc ? <>{doc.nombre}{asig[r.clave]?.estado === 'sugerido' ? ' · detectado' : ''}</> : r.condicion || TIPO_NOMBRE[r.tipo])}</small>
                {sugerido && <button className="i-link cs-sug" onClick={() => asignar(r, sugerido.id)}>Usar «{sugerido.nombre}»</button>}
                {estado !== 'listo' && estado !== 'no_aplica' && (
                  <div className="cs-acc">
                    <label className="cs-b p"><Icon n="plus" s={13} w={2.6} />{estado === 'revisar' ? 'Subir uno nuevo' : 'Subir'}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.odt,.ods" hidden onChange={ev => { subirA(r, ev.target.files[0]); ev.target.value = '' }} /></label>
                    {estado === 'falta' && (biblio || []).length > 0 && (
                      <Desplegable className="cs-b" alinear="izq" etiqueta={`Elegir de la biblioteca para ${r.nombre}`} valor="" onCambio={v => asignar(r, Number(v))} boton="Biblioteca"
                        opciones={(biblio || []).map(d => ({ v: d.id, t: d.nombre, extra: d.caduca ? `caduca ${d.caduca}` : '' }))} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {(biblio || []).length > 0 && (
            <div className="cs-bib"><span>Vuestra biblioteca · arrastrad a una casilla:</span>
              {biblio.slice(0, 8).map(d => (
                <i key={d.id} draggable onDragStart={ev => { ev.dataTransfer.setData('text/documento', String(d.id)); ev.dataTransfer.effectAllowed = 'copy' }} title={d.caduca ? `Caduca el ${d.caduca}` : d.nombre}>{d.nombre}</i>
              ))}
              {biblio.length > 8 && <i className="mas">+ {biblio.length - 8}</i>}
            </div>
          )}
          {a.plantillas?.length > 0 && (
            <div className="i-plant"><b>Modelos oficiales para rellenar</b>
              {a.plantillas.map(p => <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer"><Icon n="doc" s={14} /> {p.nombre}</a>)}
            </div>
          )}
        </div>

        {/* DERECHA: biblioteca de Reforesta */}
        <div className="i-side">
          <div className="i-card i-dl">
            <span className="i-k">Plazo</span>
            <div className="big">{a.dias == null ? 'Sin fecha' : a.dias < 0 ? 'Cerrada' : `${a.dias} días`}</div>
            {plazo && <p>{a.plazoEstimado ? 'plazo estimado, ' : ''}hasta el {plazo.getDate()} de {MESL[plazo.getMonth()]}</p>}
            {biblio && (faltan > 0
              ? <p className="i-dl-aviso"><Icon n="alert" s={15} />{faltan === 1 ? 'Falta 1 documento para poder entregarla' : `Faltan ${faltan} documentos para poder entregarla`}</p>
              : <p className="i-dl-aviso ok"><Icon n="check" s={15} w={3} />Tenéis todos los documentos</p>)}
            <Svg html={island(300, 200, Math.min(presentadas + 1, objetivo), objetivo)} style={{ display: 'block', margin: '6px 0 0' }} />
            <p className="tree">Al presentarla plantáis el árbol n.º {presentadas + 1}</p>
            <button className="i-btn p" style={{ width: '100%' }} aria-disabled={faltan > 0 || presentando} onClick={presentarConZip}><Icon n={faltan > 0 ? 'alert' : 'check'} s={19} w={2.6} />{presentando ? 'Preparando el ZIP…' : 'Presentar'}</button>
            {a.url && <a className="i-link" style={{ marginTop: 10 }} href={a.url} target="_blank" rel="noopener noreferrer">Ver convocatoria en la BDNS ↗</a>}
          </div>
        </div>
      </div>
    </>
  )
}
