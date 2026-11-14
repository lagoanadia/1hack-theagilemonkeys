import { useCallback, useEffect, useRef, useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { tree } from './lp.js'
import Convocatorias, { Descarte } from './Convocatorias.jsx'
import Presentar from './Presentar.jsx'
import Empresas from './Empresas.jsx'
import Propuestas from './Propuestas.jsx'
import Mapa from './Mapa.jsx'
import Perfil from './Perfil.jsx'
import { ErrorSesion, api, nombreGuardado } from '../api.js'
import { etapaDe, etapaEmpresa, ordenarRuta } from '../datos.js'
import { useRadar } from '../radar.js'
import { useTablero } from '../tablero.js'
import { useRecordado } from '../recordado.js'

// App del equipo de Reforesta (solo se muestra con la contraseña del equipo, ver App.jsx).
// Convocatorias y Empresas leen los JSON del radar (/data/*.json) y sus estados de /api/solicitudes.
// El siguiente paso de cada solicitud, su fecha y los avisos salen de GET /api/seguimiento.
const ETAPAS = ['revisar', 'preparando', 'presentadas', 'descartadas']
const pend = x => x.estado === 'por_revisar' || x.estado === 'mas_tarde'

export default function IslaApp({ salir }) {
  const radar = useRadar(salir)
  const tab = useTablero(salir)                // secciones y orden de los tableros (GET/PUT /api/tablero)
  const [seg, setSeg] = useState(null)             // GET /api/seguimiento: {en_marcha, avisos, resumen}
  const [perfil, setPerfil] = useState(null)
  // La pantalla en la que estáis se recuerda al recargar la página.
  const [vista, setVista] = useRecordado('vista', 'conv', ['conv', 'presentar', 'empresas', 'propuestas', 'mapa', 'perfil'])
  const [etapa, setEtapa] = useRecordado('etapa', 'revisar', ETAPAS)
  const [selId, setSelId] = useRecordado('sel', null)
  const [curId, setCurId] = useState(null)
  const [tocadas, setTocadas] = useState([])      // convocatorias clasificadas en esta sesión (siguen en la ruta)
  const [descartando, setDescartando] = useState(null)
  const [toast, setToast] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 7000); return () => clearTimeout(t) }, [toast])

  const cargarPerfil = useCallback(() => api('/perfil').then(setPerfil).catch(e => { if (e instanceof ErrorSesion) salir() }), [salir])
  useEffect(() => { cargarPerfil() }, [cargarPerfil])
  const guardarPerfil = async cambios => {
    const r = await api('/perfil', { metodo: 'PUT', datos: cambios })
    const nuevo = { ...perfil, ...r.perfil }
    setPerfil(nuevo)
    return nuevo
  }

  const cargarSeg = useCallback(() => api('/seguimiento').then(setSeg).catch(e => { if (e instanceof ErrorSesion) salir() }), [salir])
  useEffect(() => { if (radar.cargado) cargarSeg() }, [radar.cargado, cargarSeg])

  // Ejecuta una acción de la API: si falla, avisa (los cambios de estado ya se revierten solos).
  // Tras cada cambio se recalculan los siguientes pasos y los avisos.
  const intentar = async (accion, alExito) => {
    try { await accion() } catch (e) {
      if (!(e instanceof ErrorSesion)) setToast({ texto: `No se pudo guardar: ${e.message}` })
      return false
    }
    alExito?.()
    cargarSeg()
    return true
  }
  const marcar = id => setTocadas(t => (t.includes(id) ? t : [...t, id]))
  const deshacer = (tipo, id, despues) => intentar(() => radar.deshacer(tipo, id), () => { despues?.(); setToast({ texto: 'Deshecho' }) })
  const ir = (v, id = null) => {
    if (ETAPAS.includes(v)) { setVista('conv'); setEtapa(v) } else setVista(v)
    setSelId(id); document.querySelector('.isla')?.scrollTo?.(0, 0)
  }
  const { items } = radar
  // La ruta de revisión (con el buscador aplicado): lo que está por revisar + lo clasificado en esta sesión.
  const visibles = items.filter(a => !q || `${a.titulo} ${a.organo}`.toLowerCase().includes(q.toLowerCase()))
  const ruta = visibles.filter(a => etapaDe(a) === 'revisar' || tocadas.includes(a.id)).sort(ordenarRuta)
  const siguienteDe = a => {
    const i = ruta.findIndex(x => x.id === a.id)
    const n = [...ruta.slice(i + 1), ...ruta.slice(0, i)].find(x => pend(x) && x.id !== a.id)
    return n ? n.id : -1
  }

  // --- acciones sobre convocatorias (PUT /api/solicitudes/convocatoria/:codigo)
  // Presentar = pasa a «En proceso» (estado «preparando»); desde ahí se presenta o se descarta.
  const decidir = (a, estado) => {
    const sig = siguienteDe(a)
    marcar(a.id); setCurId(sig)
    intentar(() => radar.guardar('convocatoria', a.id, { estado }), () => setToast({
      texto: 'Movida a En proceso', undo: () => deshacer('convocatoria', a.id, () => setCurId(a.id)),
      go: ['Ver papeles', () => ir('presentar', a.id)],
    })).then(ok => { if (!ok) setCurId(a.id) })
  }
  const guardarDescarte = async (a, motivos, extra) => {
    const sig = siguienteDe(a)
    const ok = await intentar(async () => {
      if (extra.nuevo && extra.recordar) await api('/motivos', { metodo: 'POST', datos: { texto: extra.nuevo } })
      // La API conserva la nota entre estados: la de cofinanciación se pone al descartar por dinero y se limpia si ya no aplica.
      const PREFIJO = 'Pueden poner como máximo'
      const nota = extra.pct ? `${PREFIJO} el ${extra.pct} %` : (a.sol?.nota || '').startsWith(PREFIJO) ? '' : undefined
      await radar.guardar('convocatoria', a.id, { estado: 'descartada', motivos, ...(nota !== undefined ? { nota } : {}) })
    })
    if (!ok) return
    marcar(a.id); setDescartando(null); setCurId(sig)
    // Las reglas aprendidas se recalculan en el servidor (GET /api/reglas) con cada motivo nuevo.
    setToast({ texto: `${a.titulo.slice(0, 38)}…, descartada`, undo: () => deshacer('convocatoria', a.id, () => setCurId(a.id)) })
  }
  const cambiarEstado = (a, estado) => intentar(() => radar.guardar('convocatoria', a.id, { estado }),
    () => setToast({ texto: estado === 'presentada' ? 'Movida a Presentado' : `Actualizada: ${estado}`, undo: () => deshacer('convocatoria', a.id) }))
  // Cambia el siguiente paso o su fecha sin tocar el estado (PUT con siguiente_paso / fecha_paso).
  const cambiarPaso = (a, cambios) => intentar(() => radar.guardar('convocatoria', a.id, cambios),
    () => setToast({ texto: 'Fecha actualizada', undo: () => deshacer('convocatoria', a.id) }))
  const recuperar = a => intentar(() => radar.guardar('convocatoria', a.id, { estado: 'por_revisar' }), () => {
    setToast({ texto: 'Recuperada: vuelve al Radar', undo: () => deshacer('convocatoria', a.id), go: ['Verla', () => { setCurId(a.id); ir('revisar') }] })
  })
  // Arrastrar una descartada a otro motivo (o a «Sin motivo») cambia sus motivos.
  const reclasificar = (a, motivos) => intentar(() => radar.guardar('convocatoria', a.id, { estado: 'descartada', motivos }),
    () => setToast({ texto: motivos.length ? `Motivo: ${motivos[0]}` : 'Sin motivo', undo: () => deshacer('convocatoria', a.id) }))
  const presentar = a => intentar(() => radar.guardar('convocatoria', a.id, { estado: 'presentada' }), () => {
    setToast({ texto: `¡Presentada! Habéis plantado el árbol n.º ${radar.etapas.presentadas + 1}`, undo: () => deshacer('convocatoria', a.id) })
    ir('presentadas')
  })
  // --- acciones sobre empresas (PUT /api/solicitudes/empresa/:id)
  const cambiarEstadoEmpresa = (e, estado, texto, go) => intentar(() => radar.guardar('empresa', e.id, { estado }),
    () => setToast({ texto, go, undo: () => deshacer('empresa', e.id) }))

  const nPorRevisar = items.filter(a => etapaDe(a) === 'revisar' && pend(a)).length
  const nEmpresas = radar.empresas.filter(e => etapaEmpresa(e) === 'nueva').length
  const nav = [['conv', 'inbox', 'Convocatorias', nPorRevisar], ['empresas', 'building', 'Empresas', nEmpresas], ['propuestas', 'leaf', 'Propuestas', 0], ['mapa', 'map', 'Mapa', 0]]
  const top = (k, ejemplo = false, extra = null) => (
    <div className="i-top">
      <div className="i-izq">{ejemplo && <span className="i-ej">Ejemplo</span>}{extra}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <label className="i-srch"><Icon n="search" s={18} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar" /></label>
        {/* Avisos: los pasos que vencen (GET /api/seguimiento). Se pueden recibir también por correo (Perfil). */}
        <Campana seg={seg} ir={ir} />
      </div>
    </div>
  )

  const inicial = ((nombreGuardado().match(/\p{L}/gu) || []).slice(0, 2).join('') || 'R').toUpperCase()
  const objetivo = perfil?.objetivo_anual || 10
  let page
  if (radar.error) page = <div className="i-card i-empty" role="alert">No se pudieron cargar los datos: {radar.error}<br /><button className="i-btn p sm" style={{ margin: '14px auto 0' }} onClick={radar.reintentar}>Reintentar</button></div>
  else if (!radar.cargado) page = <div className="i-card i-empty">Cargando convocatorias…</div>
  else if (vista === 'conv') page = <Convocatorias {...{ radar, visibles, ruta, etapa, ir, top, curId, setCurId, decidir, setDescartando, cambiarEstado, cambiarPaso, recuperar, reclasificar, seg, perfil, tab, avisar: (texto, go) => setToast({ texto, go, aviso: true }) }} />
  else if (vista === 'presentar') page = <Presentar a={items.find(a => a.id === selId)} {...{ top, ir, presentar, perfil, objetivo }} presentadas={radar.etapas.presentadas} />
  else if (vista === 'empresas') page = <Empresas {...{ top, radar, q, tab }} cambiarEstado={cambiarEstadoEmpresa} />
  else if (vista === 'mapa') page = <Mapa {...{ top, salir }} />
  else if (vista === 'perfil') page = perfil ? <Perfil {...{ perfil, guardarPerfil, recargarPerfil: cargarPerfil, top, setToast, salir }} presentadas={radar.etapas.presentadas} /> : <div className="i-card i-empty">Cargando perfil…</div>
  // Propuestas no depende del radar: se muestra aunque los datos del radar fallen.
  if (vista === 'propuestas') page = <Propuestas {...{ top, setToast, salir }} />

  return (
    <div className="isla">
      <aside className="i-rail">
        <Svg className="mk" html={tree(40, 40, 30)} />
        {nav.map(([k, i, t, c]) => (
          <button key={k} className={`it ${vista === k || (k === 'conv' && vista === 'presentar') ? 'on' : ''}`} onClick={() => ir(k === 'conv' ? 'revisar' : k)}>
            <Icon n={i} s={22} />{t}{c ? <span className="cnt">{c}</span> : null}
          </button>
        ))}
        <button className={`me ${vista === 'perfil' ? 'on' : ''}`} onClick={() => ir('perfil')} title="Perfil">{inicial}</button>
      </aside>
      <div className={`i-page ${vista === 'conv' && etapa === 'revisar' && radar.cargado && !radar.error ? 'fit' : ''}`}>{page}</div>
      {descartando && <Descarte a={descartando} cerrar={() => setDescartando(null)} guardar={guardarDescarte} />}
      {toast && <div className={`i-toast ${toast.aviso ? 'aviso' : ''}`} role="status"><Icon n={toast.aviso ? 'alert' : 'check'} s={18} w={2.6} />{toast.texto}{toast.go && <button className="go" onClick={() => { toast.go[1](); setToast(null) }}>{toast.go[0]} →</button>}{toast.undo && <button onClick={() => { toast.undo(); setToast(null) }}><Icon n="undo" s={16} w={2.4} />Deshacer</button>}</div>}
    </div>
  )
}

// Campana de avisos: un desplegable como en cualquier app. Cada aviso dice qué toca, de qué y cuándo;
// al pulsarlo lleva a la pantalla donde se hace. Se cierra al pulsar fuera o con Escape.
const NIVEL_TXT = { vencido: 'Vencido', urgente: 'Urgente', pronto: 'Pronto' }
function Campana({ seg, ir }) {
  const [abierta, setAbierta] = useState(false)
  const caja = useRef(null)
  const avisos = seg?.avisos || []
  useEffect(() => {
    if (!abierta) return
    const fuera = e => { if (!caja.current?.contains(e.target)) setAbierta(false) }
    const esc = e => { if (e.key === 'Escape') setAbierta(false) }
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierta])
  const detalle = x => seg?.en_marcha?.find(m => m.tipo === x.tipo && m.id === x.id)
  const cuando = d => (d == null ? '' : d < 0 ? `venció hace ${-d} ${d === -1 ? 'día' : 'días'}` : d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`)
  return (
    <div className="i-camp" ref={caja}>
      <button className={`i-round i-campana ${abierta ? 'on' : ''}`} aria-expanded={abierta} aria-haspopup="dialog"
        aria-label={avisos.length ? `${avisos.length} avisos` : 'Avisos'} onClick={() => setAbierta(!abierta)}>
        <Icon n="bell" s={19} />{avisos.length > 0 && <span className="cnt">{avisos.length}</span>}
      </button>
      {abierta && (
        <div className="i-pop" role="dialog" aria-label="Avisos">
          <div className="cab"><b>Avisos</b>{avisos.length > 0 && <span>{avisos.length}</span>}</div>
          {avisos.length === 0 && <p className="vacio">Todo al día. No hay pasos que venzan pronto.</p>}
          <ul>
            {avisos.map(x => {
              const m = detalle(x)
              return (
                <li key={`${x.tipo}${x.id}`}>
                  <button onClick={() => { setAbierta(false); ir(x.tipo === 'empresa' ? 'empresas' : 'presentadas') }}>
                    <i className={`pt ${x.nivel}`} aria-hidden="true" />
                    <span className="tx">
                      <b>{m?.siguiente_paso || 'Siguiente paso'}</b>
                      <span className="t" title={m?.titulo}>{m?.titulo || x.texto}</span>
                    </span>
                    <span className={`cu ${x.nivel}`}>{NIVEL_TXT[x.nivel] ? `${cuando(x.dias)}` : ''}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button className="pie" onClick={() => { setAbierta(false); ir('perfil') }}><Icon n="bell" s={14} />Recibirlos también por correo</button>
        </div>
      )}
    </div>
  )
}
