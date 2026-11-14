import { useCallback, useEffect, useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { AutoTexto, Fecha, ListaLineas } from './Campos.jsx'
import Desplegable from './Desplegable.jsx'
import Menu from './Menu.jsx'
import { island } from './lp.js'
import { validarCif } from './cif.js'
import { api, apiTexto } from '../api.js'
import { useRecordado } from '../recordado.js'

// Perfil editable: GET/PUT /api/perfil. El radar lo lee cada mañana y lo usa para puntuar y filtrar por zona.
// Además: las reglas que el radar ha aprendido (/api/reglas) y la vista previa del correo de avisos (/api/avisos/correo).
const CAMPOS = ['nombre', 'cif', 'tipo_entidad', 'equipo', 'zonas', 'comunidades_extra', 'ampliar_espana', 'descripcion',
  'lineas', 'no_sirve', 'objetivo_anual', 'documentos', 'avisos', 'email_avisos']
const AVISOS = { nunca: 'Nunca', cada_manana: 'Cada mañana', semanal: 'Cada semana' }
const aLineas = t => t.split('\n').map(x => x.trim()).filter(Boolean)

// Ficha de elegibilidad (ficha.* del perfil): lo que piden las convocatorias para poder presentarse.
// La IA compara cada requisito con ella; lo que no consta (null) cuenta como «duda», no como «no».
// Se guarda con PUT /api/perfil enviando solo los campos que cambian (el Worker mezcla campo a campo).
const FICHA_VACIA = {
  forma_juridica: 'asociacion', anio_constitucion: null, utilidad_publica: null, sede: '', ambito_actuacion: null,
  registros: [], al_corriente_pagos: null, presupuesto_anual: null, voluntarios: null, aval_bancario: null, ongd: null, certificaciones: [],
}
const CAMPOS_FICHA = Object.keys(FICHA_VACIA)
const FORMAS = { asociacion: 'Asociación', fundacion: 'Fundación', cooperativa: 'Cooperativa', federacion: 'Federación', otra: 'Otra' }
const AMBITOS = { local: 'Local', autonomico: 'Autonómico', estatal: 'Estatal', internacional: 'Internacional' }
const fichaDe = p => ({ ...FICHA_VACIA, ...(p.ficha || {}) })
const aNumero = v => (v === '' ? null : Number(v))
const TRI = v => (v === true ? 'Sí' : v === false ? 'No' : 'No consta')

// Sí / No / No consta (null): los tres estados que entiende el radar.
function Tri({ valor, onChange, label }) {
  return (
    <div className="i-seg" role="group" aria-label={label}>
      {[[true, 'Sí'], [false, 'No'], [null, 'No consta']].map(([v, t]) => (
        <button type="button" key={t} className={valor === v ? 'on' : ''} aria-pressed={valor === v} onClick={() => onChange(v)}>{t}</button>
      ))}
    </div>
  )
}

// Lista de textos cortos con etiquetas y un campo para añadir (registros, certificaciones).
function Lista({ items, onChange, placeholder, etiqueta, max = 10 }) {
  const [t, setT] = useState('')
  return (
    <div className="tags">
      {items.map(x => <span key={x} className="i-tag" style={{ background: 'var(--nv)', color: '#fff' }}>{x}<button type="button" aria-label={`Quitar ${x}`} onClick={() => onChange(items.filter(y => y !== x))}>×</button></span>)}
      {items.length < max && (
        <form className="add" onSubmit={e => { e.preventDefault(); const v = t.trim(); if (v && !items.includes(v)) onChange([...items, v]); setT('') }}>
          <input className="i-in" maxLength={120} placeholder={placeholder} aria-label={etiqueta} value={t} onChange={e => setT(e.target.value)} />
        </form>
      )}
    </div>
  )
}

// Criterios de búsqueda (criterios.* del perfil, sin IA) y requisitos de la entidad (texto libre para la IA).
// Nunca ocultan nada: cambian el veredicto y el radar explica por qué. null = sin límite.
// Se guarda con PUT /api/perfil enviando solo lo que cambia (el Worker mezcla los criterios campo a campo).
const CRITERIOS = [
  ['importe_minimo', 'Importe mínimo (€)', 'Por debajo de esta cifra, el radar la descarta.', 0, 100000000, 'Sin mínimo'],
  ['cofinanciacion_maxima', 'Lo máximo que podéis poner (%)', 'Si piden poner más, el radar la marca «Mirad antes».', 0, 100, 'Sin límite'],
  ['dias_minimos', 'Días mínimos para preparar una solicitud', 'Si quedan menos días, el radar la marca «Mirad antes».', 0, 365, 'Sin mínimo'],
]
const criteriosDe = p => ({ importe_minimo: null, cofinanciacion_maxima: null, dias_minimos: null, ...(p.criterios || {}) })
function Criterios({ perfil, guardarPerfil, setToast }) {
  const guardado = criteriosDe(perfil)
  const [c, setC] = useState(guardado)
  const [req, setReq] = useState((perfil.requisitos_entidad || []).join('\n'))
  const [guardando, setGuardando] = useState(false)
  const cambiosC = CRITERIOS.map(x => x[0]).filter(k => c[k] !== guardado[k])
  const reqNuevos = aLineas(req)
  const cambiaReq = JSON.stringify(reqNuevos) !== JSON.stringify(perfil.requisitos_entidad || [])
  const n = cambiosC.length + (cambiaReq ? 1 : 0)
  const guardar = async () => {
    setGuardando(true)
    try {
      await guardarPerfil({
        ...(cambiosC.length ? { criterios: Object.fromEntries(cambiosC.map(k => [k, c[k]])) } : {}),
        ...(cambiaReq ? { requisitos_entidad: reqNuevos } : {}),
      })
      setToast({ texto: 'Criterios guardados. El radar los aplicará en su próxima ejecución' })
    } catch (e) { setToast({ texto: `No se pudieron guardar los criterios: ${e.message}` }) }
    setGuardando(false)
  }
  return (
    <div className="i-card i-perfil">
      <div className="i-field wide" style={{ background: 'none', padding: 0 }}>
        <b>Criterios de búsqueda</b>
        <span style={{ fontWeight: 400 }}>Reglas con números que el radar aplica sin IA. Nunca ocultan una convocatoria: solo cambian su veredicto y explican por qué.</span>
      </div>
      {CRITERIOS.map(([k, t, ayuda, min, max, vacio]) => (
        <label key={k} className="i-field"><span>{t}</span>
          <input className="i-in" type="number" min={min} max={max} placeholder={vacio} value={c[k] ?? ''} onChange={e => setC(x => ({ ...x, [k]: aNumero(e.target.value) }))} />
          <small className="mut">{ayuda}</small></label>
      ))}
      <label className="i-field wide"><span>Otros datos de la entidad que debe tener en cuenta la IA</span>
        <ListaLineas valor={req} onCambio={setReq} placeholder="Escribid un dato y pulsad Intro" />
        <small className="mut">Por ejemplo: «No podemos adelantar el dinero de la actuación».</small></label>
      <div className="i-field wide" style={{ background: 'none', padding: 0, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="i-btn p" disabled={!n || guardando} onClick={guardar}><Icon n="check" s={19} w={2.6} />{guardando ? 'Guardando…' : 'Guardar criterios'}</button>
        {n > 0 && <button className="i-btn" onClick={() => { setC(guardado); setReq((perfil.requisitos_entidad || []).join('\n')) }}>Descartar cambios</button>}
        {n > 0 && <small className="mut">{n} {n === 1 ? 'campo cambiado' : 'campos cambiados'}</small>}
      </div>
    </div>
  )
}

// Lo que el radar ha aprendido: GET /api/reglas → {sugerencias, reglas}. Cuando un motivo de descarte se
// repite 3 veces el servidor lo propone: aceptarlo (POST {motivo, accion:"aceptar"}) lo convierte en un criterio
// que el radar aplica sin IA; «No» (accion:"ignorar") lo descarta para siempre. Reglas propias: POST {texto}.
function Reglas({ setToast, recargarPerfil }) {
  const [datos, setDatos] = useState(null)
  const [texto, setTexto] = useState('')
  const [edit, setEdit] = useState(null)   // {id, texto}
  const cargar = useCallback(() => api('/reglas').then(setDatos).catch(e => setToast({ texto: `No se pudieron cargar las reglas: ${e.message}` })), [setToast])
  useEffect(() => { cargar() }, [cargar])
  // recargar: aceptar o quitar una regla cambia los criterios del perfil en el servidor; se vuelve a pedir
  // GET /api/perfil para que la pantalla los muestre al día antes de que nadie pulse Guardar.
  const hacer = async (accion, aviso, recargar = false) => {
    try { await accion(); await cargar(); if (recargar) await recargarPerfil?.(); if (aviso) setToast({ texto: aviso }) } catch (e) { setToast({ texto: `No se pudo guardar: ${e.message}` }) }
  }
  const fecha = f => (f ? new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '')
  return (
    <aside className="i-learn" aria-label="Lo que el radar ha aprendido">
      <div className="h"><Icon n="info" s={20} />Lo que el radar ha aprendido</div>
      <p>Cuando descartáis varias por el mismo motivo, el radar os propone una regla. Vosotros decidís si se aplica.</p>
      {!datos && <p>Cargando reglas…</p>}
      {(datos?.sugerencias || []).map(s => (
        <div key={s.motivo} className="rule">
          <span className="who">Detectado</span>
          <b>{s.texto}</b><small>{s.veces} veces</small>
          <div className="act"><button className="p" onClick={() => hacer(() => api('/reglas', { metodo: 'POST', datos: { motivo: s.motivo, accion: 'aceptar' } }), 'Regla aplicada. El radar la usará desde su próxima ejecución', true)}>{s.accion}</button>
            <button onClick={() => hacer(() => api('/reglas', { metodo: 'POST', datos: { motivo: s.motivo, accion: 'ignorar' } }), 'Entendido: no volveremos a proponerla')}>No</button></div>
        </div>
      ))}
      {(datos?.reglas || []).map(r => (
        <div key={r.id} className={`rule ${r.origen === 'equipo' ? 'mine' : ''}`}>
          <span className={`who ${r.origen === 'equipo' ? 'me' : ''}`}>{r.origen === 'equipo' ? 'Añadida por vosotros' : 'Aplicada'}</span>
          {edit?.id === r.id ? (
            <form className="act" style={{ flexWrap: 'nowrap' }} onSubmit={e => { e.preventDefault(); hacer(() => api(`/reglas/${r.id}`, { metodo: 'PUT', datos: { texto: edit.texto } }), 'Regla actualizada').then(() => setEdit(null)) }}>
              <input className="i-in" maxLength={200} autoFocus value={edit.texto} onChange={e => setEdit({ ...edit, texto: e.target.value })} aria-label="Texto de la regla" />
              <button className="p" type="submit">Guardar</button>
            </form>
          ) : <><b>{r.texto}</b><small>{[r.autor, fecha(r.creado)].filter(Boolean).join(' · ')}</small></>}
          <div className="act">
            {!r.criterio && edit?.id !== r.id && <button onClick={() => setEdit({ id: r.id, texto: r.texto })}>Editar</button>}
            <button onClick={() => hacer(() => api(`/reglas/${r.id}`, { metodo: 'DELETE' }), 'Regla quitada', true)}>Quitar</button>
          </div>
        </div>
      ))}
      {datos && !datos.sugerencias?.length && !datos.reglas?.length && <p>Todavía no hay reglas. Aparecerán aquí cuando un motivo de descarte se repita 3 veces.</p>}
      <form className="nueva" onSubmit={e => { e.preventDefault(); const t = texto.trim(); if (t) hacer(() => api('/reglas', { metodo: 'POST', datos: { texto: t } }), 'Regla añadida').then(() => setTexto('')) }}>
        <input className="i-in" maxLength={200} placeholder="+ Escribid una regla, por ejemplo: no queremos las que exigen aval" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Nueva regla" />
      </form>
    </aside>
  )
}

// Avisos por correo: GET /api/avisos/correo (vista previa del correo de hoy) y POST (enviarlo ahora, de prueba).
// Usa el correo ya guardado en el perfil; el envío necesita la clave de Resend en el servidor.
function CorreoAvisos({ setToast, cambiado }) {
  const [vista, setVista] = useState(null)
  const [html, setHtml] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const previa = async () => {
    setOcupado(true)
    try { const v = await api('/avisos/correo'); setVista(v); setHtml(await apiTexto('/avisos/correo?html=1')) } catch (e) { setToast({ texto: `No se pudo preparar la vista previa: ${e.message}` }) }
    setOcupado(false)
  }
  const enviar = async () => {
    setOcupado(true)
    try { const r = await api('/avisos/correo', { metodo: 'POST' }); setToast({ texto: `Correo de prueba enviado a ${r.para}` }) } catch (e) { setToast({ texto: `No se pudo enviar: ${e.message}` }) }
    setOcupado(false)
  }
  return (
    <div className="i-correo">
      <small className="mut">Cada mañana os llega un resumen con los pasos que vencen, las convocatorias nuevas que encajan y las empresas que esperan respuesta. Solo se envía si hay novedades.{cambiado && ' Guardad los cambios para probar con el correo nuevo.'}</small>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" className="i-btn sm" disabled={ocupado} onClick={previa}><Icon n="eye" s={17} />Ver vista previa</button>
        <button type="button" className="i-btn n sm" disabled={ocupado || !vista?.listo} onClick={enviar}><Icon n="send" s={17} />Enviar prueba ahora</button>
      </div>
      {vista && (
        <div className="prev">
          <p><b>{vista.asunto}</b></p>
          <p>{vista.para ? <>Para: {vista.para}</> : 'Todavía no hay un correo guardado en el perfil.'}{!vista.listo && vista.para ? ' · El envío aún no está activado en el servidor.' : ''}</p>
          {html && <iframe title="Vista previa del correo" sandbox="" srcDoc={html} />}
        </div>
      )}
    </div>
  )
}

export default function Perfil({ perfil, guardarPerfil, recargarPerfil, top, presentadas, salir, setToast }) {
  const [d, setD] = useState(perfil)
  const [zona, setZona] = useState('')
  const [doc, setDoc] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [lin, setLin] = useState(() => ({ lineas: perfil.lineas.join('\n'), no_sirve: perfil.no_sirve.join('\n') }))
  const set = (k, v) => setD(x => ({ ...x, [k]: v }))
  const borrador = { ...d, lineas: aLineas(lin.lineas), no_sirve: aLineas(lin.no_sirve) }
  const cambios = CAMPOS.filter(k => JSON.stringify(borrador[k]) !== JSON.stringify(perfil[k]))
  const [cifOk, cifMsg] = d.cif ? validarCif(d.cif) : [true, '']
  const [f, setF] = useState(() => fichaDe(perfil))
  const [guardandoF, setGuardandoF] = useState(false)
  const setFi = (k, v) => setF(x => ({ ...x, [k]: v }))
  const fichaGuardada = fichaDe(perfil)
  const cambiosFicha = CAMPOS_FICHA.filter(k => JSON.stringify(f[k]) !== JSON.stringify(fichaGuardada[k]))
  const anioHoy = new Date().getFullYear()
  const antiguedad = f.anio_constitucion >= 1800 && f.anio_constitucion <= anioHoy ? anioHoy - f.anio_constitucion : null
  const guardarFicha = async () => {
    setGuardandoF(true)
    try {
      // PUT /api/perfil con { ficha: {…} }: solo lo que ha cambiado, el resto lo conserva el servidor.
      const nuevo = await guardarPerfil({ ficha: Object.fromEntries(cambiosFicha.map(k => [k, f[k]])) })
      setF(fichaDe(nuevo))
      setToast({ texto: 'Ficha guardada. El radar la usará para descartar con más criterio' })
    } catch (e) { setToast({ texto: `No se pudo guardar la ficha: ${e.message}` }) }
    setGuardandoF(false)
  }
  const guardar = async () => {
    setGuardando(true)
    try {
      const nuevo = await guardarPerfil(Object.fromEntries(CAMPOS.map(k => [k, borrador[k]])))
      setD(nuevo); setLin({ lineas: nuevo.lineas.join('\n'), no_sirve: nuevo.no_sirve.join('\n') })
      setToast({ texto: 'Perfil guardado. El radar lo usará en su próxima ejecución' })
    } catch (e) { setToast({ texto: `No se pudo guardar: ${e.message}` }) }
    setGuardando(false)
  }
  const Sw = ({ on, onClick, label }) => <button type="button" className={`i-sw ${on ? '' : 'off'}`} aria-pressed={on} aria-label={label} onClick={onClick} />
  const comunidades = perfil.opciones?.comunidades || []
  const objetivo = d.objetivo_anual
  const [tab, setTab] = useRecordado('perfil-tab', 'entidad', ['entidad', 'elegibilidad', 'busqueda', 'docs'])
  const PESTANAS = [
    ['entidad', 'building', 'La entidad', `${d.nombre || 'Sin nombre'} · ${d.equipo || '?'} personas`, ['nombre', 'cif', 'tipo_entidad', 'equipo', 'descripcion', 'lineas', 'no_sirve', 'objetivo_anual']],
    ['elegibilidad', 'verified', 'Elegibilidad', `${CAMPOS_FICHA.filter(k => { const v = f[k]; return !(v === null || v === '' || (Array.isArray(v) && !v.length)) }).length} de ${CAMPOS_FICHA.length} datos rellenados`, []],
    ['busqueda', 'filter', 'Qué busca el radar', `${d.zonas.length} ${d.zonas.length === 1 ? 'zona' : 'zonas'} · ${Object.values(criteriosDe(perfil)).filter(v => v !== null).length} criterios`, ['zonas', 'ampliar_espana', 'comunidades_extra']],
    ['docs', 'doc', 'Documentos y avisos', `${d.documentos.filter(x => x.tengo).length} de ${d.documentos.length} documentos · avisos ${AVISOS[d.avisos]?.toLowerCase() || ''}`, ['documentos', 'avisos', 'email_avisos']],
  ]
  const sucia = ([k, , , , campos]) => campos.some(c => cambios.includes(c)) || (k === 'elegibilidad' && cambiosFicha.length > 0)
  return (
    <>
      {top(null, false, <Menu tabs etiqueta="Apartados del perfil" valor={tab} onChange={setTab} items={PESTANAS.map(x => ({ id: x[0], icono: x[1], texto: x[2], punto: sucia(x) }))} />)}
      {!perfil.guardado && <p className="i-sub" style={{ margin: '0 0 12px' }}>Todavía es el perfil de partida: guardadlo para que quede como vuestro.</p>}
      {tab === 'entidad' && (
        <div className="pf-dos">
          <div className="pf-col">
            <div className="i-card i-perfil">
            <label className="i-field"><span>Nombre</span><input className="i-in" maxLength={120} value={d.nombre} onChange={e => set('nombre', e.target.value)} /></label>
            <label className="i-field"><span>CIF</span><input className={`i-in ${d.cif ? (cifOk ? 'ok' : 'no') : ''}`} maxLength={20} placeholder="G12345674" value={d.cif} onChange={e => set('cif', e.target.value)} />{d.cif && <small className={cifOk ? 'okm' : 'nom'}>{cifOk ? '✓ ' : '✕ '}{cifMsg}</small>}</label>
            <label className="i-field"><span>Tipo de entidad</span><input className="i-in" maxLength={120} value={d.tipo_entidad} onChange={e => set('tipo_entidad', e.target.value)} /></label>
            <label className="i-field"><span>Personas en el equipo</span><input className="i-in" type="number" min="1" max="500" value={d.equipo} onChange={e => set('equipo', e.target.value === '' ? '' : Number(e.target.value))} /></label>
            </div>
            <div className="i-card i-perfil">
            <label className="i-field wide"><span>Descripción: qué hace Reforesta</span><AutoTexto maxLength={1500} value={d.descripcion} onChange={e => set('descripcion', e.target.value)} /></label>
            <label className="i-field"><span>Líneas de trabajo</span><ListaLineas valor={lin.lineas} onCambio={v => setLin({ ...lin, lineas: v })} placeholder="Nueva línea de trabajo" /></label>
            <label className="i-field"><span>Lo que no os sirve</span><ListaLineas valor={lin.no_sirve} onCambio={v => setLin({ ...lin, no_sirve: v })} placeholder="Algo que no os sirve" /></label>
            </div>
          </div>
          <div className="pf-col">
            <div className="i-isle">
              <span className="i-k">Objetivo del año</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '8px 0' }}>
                <button type="button" className="i-round" style={{ fontSize: 22 }} aria-label="Menos" onClick={() => set('objetivo_anual', Math.max(1, objetivo - 1))}>−</button>
                <span className="n">{objetivo}</span>
                <button type="button" className="i-round" style={{ fontSize: 22 }} aria-label="Más" onClick={() => set('objetivo_anual', Math.min(200, objetivo + 1))}>+</button>
              </div>
              <p>solicitudes. Un árbol por cada una. Lleváis {presentadas}.</p>
              <Svg html={island(310, 250, Math.min(presentadas, objetivo), objetivo)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
              <a href="#/propuestas" className="i-link">Ver la página pública de propuestas para empresas →</a>
              <button className="i-link" onClick={salir}>Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'elegibilidad' && (
        <div className="i-card i-perfil seis">
          <div className="i-field wide" style={{ background: 'none', padding: 0 }}>
            <b>Ficha de elegibilidad</b>
            <span style={{ fontWeight: 400 }}>Lo que piden las convocatorias para poder presentarse. Lo que no sepáis, dejadlo en «No consta»: el radar lo tratará como una duda, no como un no.</span>
          </div>
            <label className="i-field"><span>Forma jurídica</span>
              <Desplegable bloque className="i-in dsp-campo" etiqueta="Forma jurídica" valor={f.forma_juridica} onCambio={v => setFi('forma_juridica', v)}
                boton={FORMAS[f.forma_juridica] || 'Elegir'} opciones={Object.entries(FORMAS).map(([k, t]) => ({ v: k, t }))} /></label>
            <label className="i-field"><span>Año de constitución</span>
              <input className="i-in" type="number" min="1800" max="2100" placeholder="Año" value={f.anio_constitucion ?? ''} onChange={e => setFi('anio_constitucion', aNumero(e.target.value))} />
              {antiguedad !== null && <small className="mut">Antigüedad: {antiguedad} {antiguedad === 1 ? 'año' : 'años'}</small>}</label>
            <label className="i-field"><span>Sede</span>
              <input className="i-in" maxLength={120} value={f.sede} onChange={e => setFi('sede', e.target.value)} /></label>
            <label className="i-field"><span>Ámbito de actuación</span>
              <Desplegable bloque className="i-in dsp-campo" etiqueta="Ámbito de actuación" valor={f.ambito_actuacion ?? ''} onCambio={v => setFi('ambito_actuacion', v || null)}
                boton={AMBITOS[f.ambito_actuacion] || 'No consta'} opciones={[{ v: '', t: 'No consta' }, ...Object.entries(AMBITOS).map(([k, t]) => ({ v: k, t }))]} /></label>
            <label className="i-field"><span>Presupuesto anual (€)</span>
              <input className="i-in" type="number" min="0" step="any" placeholder="No consta" value={f.presupuesto_anual ?? ''} onChange={e => setFi('presupuesto_anual', aNumero(e.target.value))} /></label>
            <label className="i-field"><span>Voluntarios</span>
              <input className="i-in" type="number" min="0" max="100000" placeholder="No consta" value={f.voluntarios ?? ''} onChange={e => setFi('voluntarios', aNumero(e.target.value))} /></label>
            {[['utilidad_publica', 'Declarada de utilidad pública'], ['al_corriente_pagos', 'Al corriente con Hacienda y la Seguridad Social'],
              ['aval_bancario', 'Puede presentar un aval bancario'], ['ongd', 'Inscrita como ONGD (cooperación al desarrollo)']].map(([k, t]) => (
              <div key={k} className="i-field m3 sw"><div><span>{t}</span><b>{TRI(f[k])}</b></div><Tri valor={f[k]} label={t} onChange={v => setFi(k, v)} /></div>
            ))}
            <div className="i-field wide"><span>Registros en los que está inscrita</span>
              <Lista items={f.registros} onChange={v => setFi('registros', v)} placeholder="+ Registro" etiqueta="Añadir registro" /></div>
            <div className="i-field wide"><span>Certificaciones</span>
              <Lista items={f.certificaciones} onChange={v => setFi('certificaciones', v)} placeholder="+ Certificación" etiqueta="Añadir certificación" /></div>
            <div className="i-field wide" style={{ background: 'none', padding: 0, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="i-btn p" disabled={!cambiosFicha.length || guardandoF} onClick={guardarFicha}><Icon n="check" s={19} w={2.6} />{guardandoF ? 'Guardando…' : 'Guardar ficha'}</button>
              {cambiosFicha.length > 0 && <button className="i-btn" onClick={() => setF(fichaGuardada)}>Descartar cambios</button>}
              {cambiosFicha.length > 0 && <small className="mut">{cambiosFicha.length} {cambiosFicha.length === 1 ? 'campo cambiado' : 'campos cambiados'}</small>}
            </div>
        </div>
      )}

      {tab === 'busqueda' && (
        <div className="pf-dos">
          <div className="pf-col">
            <div className="i-card i-perfil">
            <div className="i-field wide"><span>¿Dónde trabajáis?</span>
              <div className="tags">{d.zonas.map(z => <span key={z} className="i-tag" style={{ background: 'var(--nv)', color: '#fff' }}>{z}<button type="button" aria-label={`Quitar ${z}`} onClick={() => set('zonas', d.zonas.filter(x => x !== z))}>×</button></span>)}
                <form className="add" onSubmit={e => { e.preventDefault(); const z = zona.trim(); if (z && !d.zonas.includes(z)) set('zonas', [...d.zonas, z]); setZona('') }}><input className="i-in" maxLength={60} placeholder="+ Añadir zona" value={zona} onChange={e => setZona(e.target.value)} /></form></div></div>
            <div className="i-field wide sw"><div><span>Ampliar a toda España</span><b>{d.ampliar_espana ? 'Activado' : 'Solo vuestras zonas'}</b></div><Sw on={d.ampliar_espana} label="Ampliar a toda España" onClick={() => set('ampliar_espana', !d.ampliar_espana)} /></div>
            {!d.ampliar_espana && comunidades.length > 0 && (
              <div className="i-field wide"><span>Buscar también ayudas de otras comunidades</span>
                <div className="tags">{comunidades.map(c => { const on = d.comunidades_extra.includes(c.codigo); return <button type="button" key={c.codigo} className="i-tag" style={on ? { background: 'var(--gr-l)', color: 'var(--gr-d)' } : { background: '#fff', border: '1.5px dashed #BFC6BC' }} onClick={() => set('comunidades_extra', on ? d.comunidades_extra.filter(x => x !== c.codigo) : [...d.comunidades_extra, c.codigo])}>{on ? '✓ ' : '+ '}{c.nombre}</button> })}</div></div>
            )}
            </div>
            <Reglas setToast={setToast} recargarPerfil={recargarPerfil} />
          </div>
          <div className="pf-col">
            <Criterios key={JSON.stringify([perfil.criterios, perfil.requisitos_entidad])} {...{ perfil, guardarPerfil, setToast }} />
          </div>
        </div>
      )}

      {tab === 'docs' && (
        <div className="pf-dos">
          <div className="pf-col"><div className="i-card i-perfil">
            <div className="i-field wide"><span>Documentos de la entidad</span>
              {d.documentos.map((x, i) => (
                <div key={x.nombre} className="i-docrow">
                  <Sw on={x.tengo} label={`Tenemos ${x.nombre}`} onClick={() => set('documentos', d.documentos.map((y, j) => (j === i ? { ...y, tengo: !y.tengo } : y)))} />
                  <b>{x.nombre}</b>
                  <Fecha etiqueta={`Caduca ${x.nombre}`} placeholder="Caduca…" valor={x.caduca} alinear="der" onCambio={v => set('documentos', d.documentos.map((y, j) => (j === i ? { ...y, caduca: v } : y)))} />
                  <button type="button" className="i-link" onClick={() => set('documentos', d.documentos.filter((_, j) => j !== i))}>Quitar</button>
                </div>
              ))}
              <form className="add" onSubmit={e => { e.preventDefault(); const n = doc.trim(); if (n && !d.documentos.some(x => x.nombre === n)) set('documentos', [...d.documentos, { nombre: n, tengo: false, caduca: '' }]); setDoc('') }}><input className="i-in" maxLength={80} placeholder="+ Añadir documento" value={doc} onChange={e => setDoc(e.target.value)} /></form></div>
          </div></div>
          <div className="pf-col"><div className="i-card i-perfil">
            <div className="i-field wide"><span>Avisos por correo</span>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <Desplegable className="i-in dsp-campo" etiqueta="Avisos por correo" valor={d.avisos} onCambio={v => set('avisos', v)}
                  boton={AVISOS[d.avisos] || 'Elegir'} opciones={Object.entries(AVISOS).map(([k, t]) => ({ v: k, t }))} />
                <input className="i-in" type="email" maxLength={120} placeholder="correo@reforesta.org" value={d.email_avisos} onChange={e => set('email_avisos', e.target.value)} />
              </div>
              <CorreoAvisos setToast={setToast} cambiado={d.email_avisos !== perfil.email_avisos} /></div>
          </div></div>
        </div>
      )}

      {(cambios.length > 0 || guardando) && (
        <div className="pf-guardar" role="region" aria-label="Cambios sin guardar">
          <span><b>{cambios.length}</b> {cambios.length === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}</span>
          <span style={{ flex: 1 }} />
          <button className="i-btn" onClick={() => { setD(perfil); setLin({ lineas: perfil.lineas.join('\n'), no_sirve: perfil.no_sirve.join('\n') }) }}>Descartar</button>
          <button className="i-btn p" disabled={guardando || !cifOk} onClick={guardar}><Icon n="check" s={19} w={2.6} />{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      )}
    </>
  )
}
