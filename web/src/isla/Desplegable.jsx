import { useEffect, useRef, useState } from 'react'

// Desplegable con la estética de la web (en vez del <select> del navegador).
//   valor, onCambio(v), opciones: [{ v, t, extra? }], etiqueta (para lectores de pantalla)
//   boton: lo que se ve en el botón cerrado; className: clases del botón (p. ej. un color por estado)
export default function Desplegable({ valor, opciones, onCambio, etiqueta, boton, className = '', alinear = 'izq' }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = e => { if (!caja.current?.contains(e.target)) setAbierto(false) }
    const tecla = e => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])
  const elegir = v => { setAbierto(false); if (v !== valor) onCambio(v) }
  return (
    <div className="dsp" ref={caja}>
      <button type="button" className={`dsp-btn ${className} ${abierto ? 'on' : ''}`} aria-haspopup="listbox" aria-expanded={abierto} aria-label={etiqueta} onClick={() => setAbierto(!abierto)}>
        {boton}
        <svg className="dsp-fl" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {abierto && (
        <ul className={`dsp-pop ${alinear}`} role="listbox" aria-label={etiqueta}>
          {opciones.map(o => (
            <li key={o.v} role="option" aria-selected={o.v === valor}>
              <button type="button" className={o.v === valor ? 'on' : ''} onClick={() => elegir(o.v)}>
                <span>{o.t}</span>{o.extra && <small>{o.extra}</small>}
                {o.v === valor && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
