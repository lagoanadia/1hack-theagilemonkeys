import { useState } from 'react'
import Icon, { Svg } from './Icon.jsx'
import { island } from './lp.js'
import { validarCif } from './cif.js'
import { olvidarEjemplos } from '../data/ejemplos.js'

// Perfil editable: GET/PUT /api/perfil. El radar lo lee cada mañana y lo usa para puntuar y filtrar por zona.
// TODO backend: el aviso por email (avisos / email_avisos se guardan, pero aún no se envía ningún correo).
const CAMPOS = ['nombre', 'cif', 'tipo_entidad', 'equipo', 'zonas', 'comunidades_extra', 'ampliar_espana', 'descripcion',
  'lineas', 'no_sirve', 'objetivo_anual', 'documentos', 'avisos', 'email_avisos']
const AVISOS = { nunca: 'Nunca', cada_manana: 'Cada mañana', semanal: 'Cada semana' }
const aLineas = t => t.split('\n').map(x => x.trim()).filter(Boolean)

export default function Perfil({ perfil, guardarPerfil, top, presentadas, salir, setToast }) {
  const [d, setD] = useState(perfil)
  const [zona, setZona] = useState('')
  const [doc, setDoc] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [lin, setLin] = useState(() => ({ lineas: perfil.lineas.join('\n'), no_sirve: perfil.no_sirve.join('\n') }))
  const set = (k, v) => setD(x => ({ ...x, [k]: v }))
  const borrador = { ...d, lineas: aLineas(lin.lineas), no_sirve: aLineas(lin.no_sirve) }
  const cambios = CAMPOS.filter(k => JSON.stringify(borrador[k]) !== JSON.stringify(perfil[k]))
  const [cifOk, cifMsg] = d.cif ? validarCif(d.cif) : [true, '']
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
  return (
    <>
      {top('Perfil')}
      <h2>Lo que el radar sabe de Reforesta</h2>
      <p className="i-sub">Si algo cambia, editadlo aquí y el radar lo tendrá en cuenta.{perfil.actualizado && <> Última vez: {new Date(perfil.actualizado).toLocaleDateString('es-ES')}{perfil.actualizado_por ? ` · ${perfil.actualizado_por}` : ''}.</>}{!perfil.guardado && ' Todavía es el perfil de partida: guardadlo para que quede como vuestro.'}</p>
      <div className="i-two">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="i-card i-perfil">
            <label className="i-field"><span>Nombre</span><input className="i-in" maxLength={120} value={d.nombre} onChange={e => set('nombre', e.target.value)} /></label>
            <label className="i-field"><span>CIF</span><input className={`i-in ${d.cif ? (cifOk ? 'ok' : 'no') : ''}`} maxLength={20} placeholder="G12345674" value={d.cif} onChange={e => set('cif', e.target.value)} />{d.cif && <small className={cifOk ? 'okm' : 'nom'}>{cifOk ? '✓ ' : '✕ '}{cifMsg}</small>}</label>
            <label className="i-field"><span>Tipo de entidad</span><input className="i-in" maxLength={120} value={d.tipo_entidad} onChange={e => set('tipo_entidad', e.target.value)} /></label>
            <label className="i-field"><span>Personas en el equipo</span><input className="i-in" type="number" min="1" max="500" value={d.equipo} onChange={e => set('equipo', e.target.value === '' ? '' : Number(e.target.value))} /></label>
            <div className="i-field wide"><span>¿Dónde trabajáis?</span>
              <div className="tags">{d.zonas.map(z => <span key={z} className="i-tag" style={{ background: 'var(--nv)', color: '#fff' }}>{z}<button type="button" aria-label={`Quitar ${z}`} onClick={() => set('zonas', d.zonas.filter(x => x !== z))}>×</button></span>)}
                <form className="add" onSubmit={e => { e.preventDefault(); const z = zona.trim(); if (z && !d.zonas.includes(z)) set('zonas', [...d.zonas, z]); setZona('') }}><input className="i-in" maxLength={60} placeholder="+ Añadir zona" value={zona} onChange={e => setZona(e.target.value)} /></form></div></div>
            <div className="i-field wide sw"><div><span>Ampliar a toda España</span><b>{d.ampliar_espana ? 'Activado' : 'Solo vuestras zonas'}</b></div><Sw on={d.ampliar_espana} label="Ampliar a toda España" onClick={() => set('ampliar_espana', !d.ampliar_espana)} /></div>
            {!d.ampliar_espana && comunidades.length > 0 && (
              <div className="i-field wide"><span>Buscar también ayudas de otras comunidades</span>
                <div className="tags">{comunidades.map(c => { const on = d.comunidades_extra.includes(c.codigo); return <button type="button" key={c.codigo} className="i-tag" style={on ? { background: 'var(--gr-l)', color: 'var(--gr-d)' } : { background: '#fff', border: '1.5px dashed #BFC6BC' }} onClick={() => set('comunidades_extra', on ? d.comunidades_extra.filter(x => x !== c.codigo) : [...d.comunidades_extra, c.codigo])}>{on ? '✓ ' : '+ '}{c.nombre}</button> })}</div></div>
            )}
            <div className="i-field wide"><span>Documentos de la entidad</span>
              {d.documentos.map((x, i) => (
                <div key={x.nombre} className="i-docrow">
                  <Sw on={x.tengo} label={`Tenemos ${x.nombre}`} onClick={() => set('documentos', d.documentos.map((y, j) => (j === i ? { ...y, tengo: !y.tengo } : y)))} />
                  <b>{x.nombre}</b>
                  <input className="i-in" type="date" aria-label={`Caduca ${x.nombre}`} value={x.caduca} onChange={e => set('documentos', d.documentos.map((y, j) => (j === i ? { ...y, caduca: e.target.value } : y)))} />
                  <button type="button" className="i-link" onClick={() => set('documentos', d.documentos.filter((_, j) => j !== i))}>Quitar</button>
                </div>
              ))}
              <form className="add" onSubmit={e => { e.preventDefault(); const n = doc.trim(); if (n && !d.documentos.some(x => x.nombre === n)) set('documentos', [...d.documentos, { nombre: n, tengo: false, caduca: '' }]); setDoc('') }}><input className="i-in" maxLength={80} placeholder="+ Añadir documento" value={doc} onChange={e => setDoc(e.target.value)} /></form></div>
            <div className="i-field wide"><span>Avisos por correo</span>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <select className="i-in" style={{ width: 180 }} value={d.avisos} onChange={e => set('avisos', e.target.value)}>{Object.entries(AVISOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                <input className="i-in" type="email" maxLength={120} placeholder="correo@reforesta.org" value={d.email_avisos} onChange={e => set('email_avisos', e.target.value)} />
              </div>
              <small className="mut">Se guarda vuestra preferencia, pero el envío de correos todavía no está activo.</small></div>
          </div>
          <div className="i-card i-perfil">
            <label className="i-field wide"><span>Descripción: qué hace Reforesta</span><textarea className="i-in" maxLength={1500} value={d.descripcion} onChange={e => set('descripcion', e.target.value)} /></label>
            <label className="i-field wide"><span>Líneas de trabajo (una por línea)</span><textarea className="i-in" rows={4} value={lin.lineas} onChange={e => setLin({ ...lin, lineas: e.target.value })} /></label>
            <label className="i-field wide"><span>Lo que no os sirve (una por línea)</span><textarea className="i-in" rows={4} value={lin.no_sirve} onChange={e => setLin({ ...lin, no_sirve: e.target.value })} /></label>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="i-btn p" disabled={!cambios.length || guardando || !cifOk} onClick={guardar}><Icon n="check" s={19} w={2.6} />{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
            {cambios.length > 0 && <button className="i-btn" onClick={() => { setD(perfil); setLin({ lineas: perfil.lineas.join('\n'), no_sirve: perfil.no_sirve.join('\n') }) }}>Descartar cambios</button>}
            <a href="#/propuestas" className="i-link">Ver la página pública de propuestas para empresas →</a>
          </div>
        </div>
        <div className="i-isle">
          <span className="i-k">Objetivo del año</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '8px 0' }}>
            <button type="button" className="i-round" style={{ fontSize: 22 }} aria-label="Menos" onClick={() => set('objetivo_anual', Math.max(1, objetivo - 1))}>−</button>
            <span className="n">{objetivo}</span>
            <button type="button" className="i-round" style={{ fontSize: 22 }} aria-label="Más" onClick={() => set('objetivo_anual', Math.min(200, objetivo + 1))}>+</button>
          </div>
          <p>solicitudes. Un árbol por cada una. Lleváis {presentadas}.</p>
          <Svg html={island(310, 250, Math.min(presentadas, objetivo), objetivo)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start', marginTop: 8 }}>
            <button className="i-link" onClick={() => { if (confirm('¿Borrar los datos de ejemplo guardados en este navegador (reglas aprendidas y documentos)?')) { olvidarEjemplos(); location.reload() } }}>Restablecer datos de ejemplo</button>
            <button className="i-link" onClick={salir}>Cerrar sesión</button>
          </div>
        </div>
      </div>
    </>
  )
}
