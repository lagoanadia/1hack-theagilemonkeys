import { useCallback, useEffect, useState } from 'react'
import IslaApp from './isla/IslaApp.jsx'
import Publica from './isla/Publica.jsx'
import Entrar from './isla/Entrar.jsx'
import { ErrorSesion, api, guardarNombre, guardarSesion, sesionGuardada } from './api.js'
import './isla/isla.css'

// Privacidad: sin contraseña solo se ve la página pública de propuestas para empresas.
// Lo demás pide entrar con «Soy de Reforesta» (contraseña del equipo + nombre).
const esPublica = () => location.hash === '#/propuestas'

export default function App() {
  const [equipo, setEquipo] = useState(null)   // null = comprobando · false = visitante · true = equipo
  const [publica, setPublica] = useState(esPublica)
  const [entrando, setEntrando] = useState(false)

  useEffect(() => {
    const f = () => setPublica(esPublica())
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])

  useEffect(() => {
    const token = sesionGuardada()
    if (!token) { setEquipo(false); return }
    api('/equipo', { token })
      .then(() => setEquipo(true))
      .catch(e => {
        if (e instanceof ErrorSesion) { guardarSesion(''); setEquipo(false) }
        else setEquipo(true)   // sin red: se conserva la sesión y el panel mostrará el error con «Reintentar»
      })
  }, [])

  const salir = useCallback(() => { guardarSesion(''); setEquipo(false) }, [])
  const entrar = async (clave, nombre) => {
    await api('/equipo', { token: clave })   // lanza ErrorSesion si la contraseña no vale
    guardarSesion(clave)
    guardarNombre(nombre)
    setEquipo(true)
    setEntrando(false)
    if (esPublica()) location.hash = ''
  }

  if (equipo === null) return <div className="isla i-carga">Cargando…</div>
  return (
    <>
      {equipo && !publica
        ? <IslaApp salir={salir} />
        : <Publica equipo={equipo} onEntrar={() => setEntrando(true)} />}
      {entrando && <Entrar cerrar={() => setEntrando(false)} entrar={entrar} />}
    </>
  )
}
