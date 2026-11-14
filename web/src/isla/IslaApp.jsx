import { useCallback, useEffect, useState } from 'react'
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
import { useReglasEjemplo } from '../data/ejemplos.js'

// App del equipo de Reforesta (solo se muestra con la contraseña del equipo, ver App.jsx).
// Convocatorias y Empresas leen los JSON del radar (/data/*.json) y sus estados de /api/solicitudes.
const ETAPAS = ['revisar', 'preparando', 'presentadas', 'descartadas']

export default function IslaApp({ salir }) {
  const radar = useRadar(salir)
  const [ej, setEj] = useReglasEjemplo()          // ejemplo: reglas aprendidas (sin backend)
  const [perfil, setPerfil] = useState(null)
  const [vista, setVista] = useState('conv')
  const [etapa, setEtapa] = useState('revisar')
  const [selId, setSelId] = useState(null)
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

  // Ejecuta una acción de la API: si falla, avisa (los cambios de estado ya se revierten solos).
  const intentar = async (accion, alExito) => {
    try { await accion() } catch (e) {
      if (!(e instanceof ErrorSesion)) setToast({ texto: `No se pudo guardar: ${e.message}` })
      return false
    }
    alExito?.()
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
    const n = [...ruta.slice(i + 1), ...ruta.slice(0, i)].find(x => x.estado === 'por_revisar' && x.id !== a.id)
    return n ? n.id : -1
  }

  // --- acciones sobre convocatorias (PUT /api/solicitudes/convocatoria/:codigo)
  const decidir = (a, estado) => {
    const sig = siguienteDe(a)
    marcar(a.id); setCurId(sig)
    const texto = estado === 'mas_tarde' ? 'Guardada para más tarde' : 'Movida a Preparando'
    intentar(() => radar.guardar('convocatoria', a.id, { estado }), () => setToast({
      texto, undo: () => deshacer('convocatoria', a.id, () => setCurId(a.id)),
      go: estado === 'preparando' ? ['Preparar papeles', () => ir('presentar', a.id)] : null,
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
    // Ejemplo (reglas aprendidas, sin backend): el motivo suma al historial de muestra.
    setEj(s => ({ ...s, historial: [...s.historial, ...motivos] }))
    setToast({ texto: `${a.titulo.slice(0, 38)}…, descartada`, undo: () => deshacer('convocatoria', a.id, () => setCurId(a.id)) })
  }
  const cambiarEstado = (a, estado) => intentar(() => radar.guardar('convocatoria', a.id, { estado }),
    () => setToast({ texto: `Actualizada: ${estado === 'presentada' ? 'ya presentada' : estado}`, undo: () => deshacer('convocatoria', a.id) }))
  const recuperar = a => intentar(() => radar.guardar('convocatoria', a.id, { estado: 'por_revisar' }), () => {
    setToast({ texto: 'Recuperada: vuelve a «Por revisar»', undo: () => deshacer('convocatoria', a.id), go: ['Verla', () => { setCurId(a.id); ir('revisar') }] })
  })
  const volverARevisar = a => intentar(() => radar.guardar('convocatoria', a.id, { estado: 'por_revisar' }),
    () => setToast({ texto: 'Vuelve a «Por revisar»', undo: () => deshacer('convocatoria', a.id) }))
  const presentar = a => intentar(() => radar.guardar('convocatoria', a.id, { estado: 'presentada' }), () => {
    setToast({ texto: `¡Presentada! Habéis plantado el árbol n.º ${radar.etapas.presentadas + 1}`, undo: () => deshacer('convocatoria', a.id) })
    ir('presentadas')
  })
  // --- acciones sobre empresas (PUT /api/solicitudes/empresa/:id)
  const cambiarEstadoEmpresa = (e, estado, texto) => intentar(() => radar.guardar('empresa', e.id, { estado }),
    () => setToast({ texto, undo: () => deshacer('empresa', e.id) }))

  const nPorRevisar = items.filter(a => etapaDe(a) === 'revisar' && a.estado === 'por_revisar').length
  const nEmpresas = radar.empresas.filter(e => etapaEmpresa(e) === 'nueva').length
  const nav = [['conv', 'inbox', 'Convocatorias', nPorRevisar], ['empresas', 'building', 'Empresas', nEmpresas], ['propuestas', 'leaf', 'Propuestas', 0], ['mapa', 'map', 'Mapa', 0]]
  const top = (k, ejemplo = false) => (
    <div className="i-top">
      <div className="i-k">{k}{ejemplo && <> · <span className="i-ej">Ejemplo</span></>}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <label className="i-srch"><Icon n="search" s={18} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar" /></label>
        {/* TODO backend: avisos por email (el perfil guarda la preferencia, pero aún no se envía nada). */}
        <button className="i-round" aria-label="Avisos" title="Avisos por email" onClick={() => setToast({ texto: 'Los avisos por email aún no están activos' })}><Icon n="bell" s={19} /></button>
      </div>
    </div>
  )

  const inicial = ((nombreGuardado().match(/\p{L}/gu) || []).slice(0, 2).join('') || 'R').toUpperCase()
  const objetivo = perfil?.objetivo_anual || 10
  let page
  if (radar.error) page = <div className="i-card i-empty" role="alert">No se pudieron cargar los datos: {radar.error}<br /><button className="i-btn p sm" style={{ margin: '14px auto 0' }} onClick={radar.reintentar}>Reintentar</button></div>
  else if (!radar.cargado) page = <div className="i-card i-empty">Cargando convocatorias…</div>
  else if (vista === 'conv') page = <Convocatorias {...{ radar, visibles, ruta, etapa, ir, top, curId, setCurId, decidir, setDescartando, ej, setEj, volverARevisar, cambiarEstado, recuperar }} />
  else if (vista === 'presentar') page = <Presentar a={items.find(a => a.id === selId)} {...{ top, ir, presentar, perfil, objetivo }} presentadas={radar.etapas.presentadas} />
  else if (vista === 'empresas') page = <Empresas {...{ top, radar, q }} cambiarEstado={cambiarEstadoEmpresa} />
  else if (vista === 'mapa') page = <Mapa {...{ top }} />
  else if (vista === 'perfil') page = perfil ? <Perfil {...{ perfil, guardarPerfil, top, setToast, salir }} presentadas={radar.etapas.presentadas} /> : <div className="i-card i-empty">Cargando perfil…</div>
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
      <div className="i-page">{page}</div>
      {descartando && <Descarte a={descartando} cerrar={() => setDescartando(null)} guardar={guardarDescarte} />}
      {toast && <div className="i-toast" role="status"><Icon n="check" s={18} w={2.6} />{toast.texto}{toast.go && <button className="go" onClick={() => { toast.go[1](); setToast(null) }}>{toast.go[0]} →</button>}{toast.undo && <button onClick={() => { toast.undo(); setToast(null) }}><Icon n="undo" s={16} w={2.4} />Deshacer</button>}</div>}
    </div>
  )
}
