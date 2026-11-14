import { useState } from 'react'
import Icon from './Icon.jsx'
import { nombreGuardado } from '../api.js'

// «Soy de Reforesta»: contraseña del equipo y nombre (el nombre aparece en el historial de cambios).
export default function Entrar({ cerrar, entrar }) {
  const [clave, setClave] = useState('')
  const [nombre, setNombre] = useState(nombreGuardado)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviar = async e => {
    e.preventDefault()
    setEnviando(true); setError('')
    try { await entrar(clave.trim(), nombre.trim().slice(0, 40)) }
    catch (err) { setError(err.message || 'No se pudo entrar'); setEnviando(false) }
  }
  return (
    <div className="i-dim" onClick={cerrar}>
      <form className="i-modal i-why" onClick={e => e.stopPropagation()} onSubmit={enviar}>
        <div className="i-head" style={{ alignItems: 'center' }}>
          <h2 style={{ fontSize: 26 }}>Soy de Reforesta</h2>
          <button type="button" className="i-round" style={{ background: '#F1F3EE' }} onClick={cerrar} aria-label="Cerrar"><Icon n="x" s={18} w={2.4} /></button>
        </div>
        <p className="i-sub" style={{ margin: '2px 0 14px' }}>Entrad con la contraseña del equipo. Vuestro nombre aparecerá en el historial de cambios.</p>
        <div className="i-form" style={{ padding: 0, margin: 0, maxWidth: 'none' }}>
          <input className="i-in" type="password" required autoFocus placeholder="Contraseña del equipo" autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} />
          <input className="i-in" required maxLength={40} placeholder="¿Cómo te llamas?" autoComplete="name" value={nombre} onChange={e => setNombre(e.target.value)} />
          {error && <p className="i-err" role="alert">{error}</p>}
          <button className="i-btn p" style={{ height: 52 }} type="submit" disabled={enviando || !clave.trim() || !nombre.trim()}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        </div>
      </form>
    </div>
  )
}
