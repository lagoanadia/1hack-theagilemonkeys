// Valida un CIF español: letra + 7 dígitos + control (dígito o letra según el tipo de entidad).
export const CIF_EJEMPLO = 'G12345674'
export function validarCif(v) {
  const c = (v || '').toUpperCase().replace(/[\s.-]/g, '')
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(c)) return [false, 'Debe ser una letra, 7 números y un dígito o letra de control (ej. G12345674).']
  const n = c.slice(1, 8).split('').map(Number)
  let suma = n[1] + n[3] + n[5]
  for (const i of [0, 2, 4, 6]) { const x = n[i] * 2; suma += Math.floor(x / 10) + (x % 10) }
  const d = (10 - (suma % 10)) % 10, letra = 'JABCDEFGHI'[d], ctl = c[8]
  const ok = 'NPQRSW'.includes(c[0]) ? ctl === letra : 'ABEH'.includes(c[0]) ? ctl === String(d) : ctl === String(d) || ctl === letra
  if (!ok) return [false, `El dígito de control no cuadra: debería terminar en ${'NPQRSW'.includes(c[0]) ? letra : d}.`]
  return [true, c[0] === 'G' ? 'CIF válido · asociación o fundación' : 'CIF válido']
}
