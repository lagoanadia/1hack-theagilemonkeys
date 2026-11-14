import { useState } from 'react'

// useState que sobrevive a recargar la página (sessionStorage): para volver a la misma pantalla.
export function useRecordado(clave, inicial, validos) {
  const [valor, setValor] = useState(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(`radar-reforesta:${clave}`))
      if (v !== null && (!validos || validos.includes(v))) return v
    } catch { /* sin almacenamiento */ }
    return inicial
  })
  const poner = v => {
    setValor(v)
    try { sessionStorage.setItem(`radar-reforesta:${clave}`, JSON.stringify(v)) } catch { /* sin almacenamiento */ }
  }
  return [valor, poner]
}
