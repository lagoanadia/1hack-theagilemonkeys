import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { hectareas } from '../datos.js'

// «Vuestro impacto en vuelos»: globo low poly en un <canvas> (sin librerías). Un avión sale de Madrid
// hacia un destino lejano UNA vez (cuando el globo aparece en pantalla); la cámara lo sigue, se aleja en
// mitad del vuelo y se acerca al aterrizar, y el contador sube hasta los vuelos que compensa el bosque.
// Al terminar, el globo se puede girar arrastrando y «Volver a volar» repite el viaje. El backend elige el destino
// (`impacto.viaje`: entre 1 y 12 vuelos al año; cuanto más CO2, más lejos). Las cifras vienen de
// GET /api/impacto?ha=N, del campo `impacto` de cada propuesta o de la respuesta de «Reservar».

// Continentes muy simplificados [lon, lat]: con caras grandes queda el aspecto low poly.
const TIERRA = [
  [[-168, 66], [-140, 70], [-95, 72], [-80, 63], [-60, 55], [-52, 47], [-66, 44], [-76, 35], [-81, 25], [-97, 26], [-97, 18], [-87, 15], [-78, 8], [-85, 10], [-105, 20], [-117, 32], [-124, 40], [-125, 49], [-135, 58], [-150, 60], [-165, 60]],
  [[-50, 60], [-42, 60], [-20, 70], [-20, 80], [-60, 82], [-70, 76], [-55, 68]],
  [[-78, 8], [-60, 10], [-50, 0], [-35, -5], [-39, -15], [-48, -26], [-58, -38], [-65, -42], [-68, -55], [-74, -50], [-72, -30], [-71, -18], [-81, -5], [-80, 2]],
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [3, 51], [8, 54], [5, 58], [10, 63], [20, 70], [30, 71], [45, 68], [60, 70], [80, 73], [105, 78], [140, 72], [170, 70], [180, 66], [160, 60], [142, 52], [140, 45], [130, 42], [122, 40], [122, 30], [110, 20], [106, 10], [100, 13], [98, 8], [93, 20], [80, 15], [77, 8], [72, 20], [66, 25], [57, 25], [52, 27], [48, 30], [44, 13], [36, 26], [34, 30], [35, 36], [27, 36], [23, 38], [19, 40], [15, 38], [12, 44], [8, 44], [3, 43], [-1, 37], [-6, 36]],
  [[-17, 21], [-10, 30], [-6, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 11], [40, -3], [40, -15], [35, -25], [20, -35], [17, -30], [12, -17], [13, -5], [9, 4], [-8, 4], [-17, 14]],
  [[-6, 50], [2, 51], [0, 54], [-3, 58], [-6, 57], [-5, 54]],
  [[114, -22], [123, -17], [131, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [131, -31], [115, -34]],
  [[130, 31], [135, 34], [141, 36], [142, 43], [140, 41], [133, 35]],
  [[109, 1], [117, 7], [119, 1], [116, -4], [110, -3]],
  [[44, -25], [50, -15], [49, -12], [44, -17]],
]
const COL = { mar: '#8EC5E6', tierra: '#79C08A', hielo: '#EEF3F0', ruta: '#EE6A4A', fondo: '#24364D' }
const RAD = Math.PI / 180

function dentro([x, y], pol) {
  let d = false
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i], [xj, yj] = pol[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d
  }
  return d
}
const vec = ([lon, lat]) => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)]
const lonlat = ([x, y, z]) => [Math.atan2(x, z) / RAD, Math.asin(Math.max(-1, Math.min(1, y / Math.hypot(x, y, z)))) / RAD]
const norm = v => { const n = Math.hypot(...v); return v.map(c => c / n) }

// Icosfera (20 triángulos subdivididos n veces), cada cara con su color de tierra, mar o hielo.
function icosfera(n) {
  const t = (1 + Math.sqrt(5)) / 2
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm)
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
  for (let k = 0; k < n; k++) {
    const cache = {}, nf = []
    const medio = (a, b) => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (cache[key] == null) { v.push(norm(v[a].map((c, i) => (c + v[b][i]) / 2))); cache[key] = v.length - 1 }
      return cache[key]
    }
    for (const [a, b, c] of f) { const ab = medio(a, b), bc = medio(b, c), ca = medio(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]) }
    f = nf
  }
  return f.map(cara => {
    const p = cara.map(i => v[i])
    const centro = norm([0, 1, 2].map(i => (p[0][i] + p[1][i] + p[2][i]) / 3))
    const ll = lonlat(centro)
    const color = Math.abs(ll[1]) > 68 ? COL.hielo : TIERRA.some(pol => dentro(ll, pol)) ? COL.tierra : COL.mar
    return { p, centro, color }
  })
}
const CARAS = icosfera(4)

const tono = (hex, f) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${c.map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))).join(',')})`
}
// Gira el mundo para que el punto (lon0, lat0) quede de frente.
function girar([x, y, z], lon0, lat0) {
  const a = -lon0 * RAD, b = lat0 * RAD
  const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a)
  return [x1, y * Math.cos(b) - z1 * Math.sin(b), y * Math.sin(b) + z1 * Math.cos(b)]
}
// Punto del arco A→B (círculo máximo), con altura para que el avión «suba».
function arco(A, B, t, alto = 0.13) {
  const w = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])))
  const s = Math.sin(w) || 1
  const p = A.map((a, i) => (Math.sin((1 - t) * w) / s) * a + (Math.sin(t * w) / s) * B[i])
  const h = 1 + alto * Math.sin(Math.PI * t) * Math.min(1, w * 1.4)
  return p.map(c => c * h)
}
const suave = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

function Lienzo({ origen, viaje, quieto, ronda, onProgreso }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d'), dpr = window.devicePixelRatio || 1
    let ancho = 0, alto = 0, raf = 0, inicio = null, fin = false, empezado = false
    const medir = () => { ancho = cv.clientWidth; alto = cv.clientHeight; cv.width = ancho * dpr; cv.height = alto * dpr; if (fin || !inicio) pedir() }
    const ro = new ResizeObserver(medir)
    ro.observe(cv)
    const A = vec(origen.ll), B = vec(viaje.ll)
    const w = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])))
    const DUR = 3800 + 4200 * (w / Math.PI)
    // Zoom: muy cerca al despegar y al aterrizar; en mitad del vuelo se aleja más cuanto más larga es la ruta.
    const ZOOM_CERCA = 2.0, ZOOM_FINAL = 1.15, ZOOM_MEDIO = 2.0 - 1.05 * Math.min(1, w / 2.2)
    // Vista libre (arrastrar) cuando el vuelo ha terminado
    let libre = null, arrastre = null
    const estela = []

    function pedir() { if (!raf) raf = requestAnimationFrame(dibujar) }
    function dibujar(ahora) {
      raf = 0
      if (!ancho) return
      if (inicio === null && !quieto && empezado) inicio = ahora
      const t = quieto ? 1 : inicio === null ? 0 : Math.min(1, (ahora - inicio) / DUR)
      const te = suave(t)
      if (t >= 1 && !fin) { fin = true; onProgreso?.(1, true) } else if (!fin && inicio !== null) onProgreso?.(te, false)
      // Tras aterrizar, la cámara se aleja despacio para ver toda la ruta en el mundo.
      const despues = fin && !quieto ? Math.min(1, (ahora - inicio - DUR) / 1600) : 0
      const zoom = quieto ? ZOOM_FINAL
        : fin ? ZOOM_CERCA + (ZOOM_FINAL - ZOOM_CERCA) * suave(despues)
          : ZOOM_MEDIO + (ZOOM_CERCA - ZOOM_MEDIO) * (1 - Math.sin(Math.PI * te)) ** 1.6
      const R = Math.min(ancho, alto) * 0.5 * zoom, cx = ancho / 2, cy = alto / 2
      // Cámara: sigue al avión; al aterrizar vuelve hacia el centro de la ruta para verla entera.
      const tCam = quieto ? 0.5 : fin ? 1 - (w < 2.2 ? 0.5 : 0.2) * suave(despues) : te
      let [lon0, lat0] = lonlat(arco(A, B, tCam, 0))
      if (libre) [lon0, lat0] = libre
      else if (fin && despues >= 1) libre = [lon0, lat0]
      lat0 = Math.max(-60, Math.min(60, lat0))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, ancho, alto)
      const g = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.12)
      g.addColorStop(0, 'rgba(142,197,230,.45)'); g.addColorStop(1, 'rgba(142,197,230,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, 7); ctx.fill()
      const luz = norm([-0.5, 0.6, 0.65]), vis = []
      for (const c of CARAS) {
        const nn = girar(c.centro, lon0, lat0)
        if (nn[2] <= 0.02) continue
        const q0 = girar(c.p[0], lon0, lat0)
        if (Math.abs(cx + q0[0] * R - cx) > ancho * 0.75 + 40 || Math.abs(cy - q0[1] * R - cy) > alto * 0.75 + 40) continue
        vis.push({ c, nn })
      }
      vis.sort((a, b) => a.nn[2] - b.nn[2])
      for (const { c, nn } of vis) {
        const l = nn[0] * luz[0] + nn[1] * luz[1] + nn[2] * luz[2]
        ctx.fillStyle = ctx.strokeStyle = tono(c.color, (l - 0.55) * 0.55)
        ctx.beginPath()
        c.p.forEach((p, k) => { const q = girar(p, lon0, lat0); ctx[k ? 'lineTo' : 'moveTo'](cx + q[0] * R, cy - q[1] * R) })
        ctx.closePath(); ctx.fill(); ctx.lineWidth = 0.6; ctx.stroke()
      }
      const pantalla = p => { const q = girar(p, lon0, lat0); return [cx + q[0] * R, cy - q[1] * R, q[2]] }
      const trazo = (desde, hasta, estilo, grosor, guion = []) => {
        ctx.strokeStyle = estilo; ctx.lineWidth = grosor; ctx.setLineDash(guion); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
        ctx.beginPath()
        let sigue = false
        for (let s = 0; s <= 90; s++) {
          const [x, y, z] = pantalla(arco(A, B, desde + (s / 90) * (hasta - desde)))
          if (z > -0.08) { ctx[sigue ? 'lineTo' : 'moveTo'](x, y); sigue = true } else sigue = false
        }
        ctx.stroke(); ctx.setLineDash([])
      }
      // Ruta pendiente (discontinua) y recorrida (gruesa, con borde blanco)
      if (te < 1) trazo(te, 1, 'rgba(36,54,77,.35)', 2.5, [7, 8])
      if (te > 0) { trazo(0, te, 'rgba(255,255,255,.95)', 11); trazo(0, te, COL.ruta, 6) }
      // Origen y destino
      ctx.font = '700 16px "Instrument Sans", system-ui, sans-serif'
      const punto = (P, nombre, lleno, pulso = 0) => {
        const [x, y, z] = pantalla(P)
        if (z <= 0.05) return
        if (pulso > 0) { ctx.strokeStyle = `rgba(238,106,74,${1 - pulso})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 10 + pulso * 46, 0, 7); ctx.stroke() }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill()
        ctx.fillStyle = lleno ? COL.ruta : COL.fondo; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill()
        const wTxt = ctx.measureText(nombre).width
        ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.beginPath(); ctx.roundRect(x + 15, y - 15, wTxt + 18, 30, 15); ctx.fill()
        ctx.fillStyle = COL.fondo; ctx.fillText(nombre, x + 24, y + 6)
      }
      punto(A, origen.nombre, true)
      punto(B, viaje.destino, fin, despues > 0 && despues < 0.6 ? despues / 0.6 : 0)
      // Estela de humo y avión
      if (!fin) {
        const [x, y, z] = pantalla(arco(A, B, te)), [x2, y2] = pantalla(arco(A, B, Math.min(1, te + 0.004)))
        if (z > -0.05) {
          estela.push({ x, y, v: 1 })
          const ang = Math.atan2(y2 - y, x2 - x), e = 2.1 + 1.1 * Math.sin(Math.PI * t)
          for (const p of estela) { p.v -= 0.025; if (p.v > 0) { ctx.fillStyle = `rgba(255,255,255,${p.v * 0.7})`; ctx.beginPath(); ctx.arc(p.x, p.y, 3 + (1 - p.v) * 9, 0, 7); ctx.fill() } }
          while (estela.length && estela[0].v <= 0) estela.shift()
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(e, e)
          const sombra = 4 + 10 * Math.sin(Math.PI * t)
          ctx.fillStyle = 'rgba(36,54,77,.18)'; ctx.beginPath(); ctx.moveTo(10, sombra); ctx.lineTo(-8, sombra - 6); ctx.lineTo(-8, sombra + 6); ctx.fill()
          const ala = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([a, b], j) => ctx[j ? 'lineTo' : 'moveTo'](a, b)); ctx.closePath(); ctx.fill() }
          ala([[13, 0], [-9, -8], [-4, 0]], '#FFFFFF')
          ala([[13, 0], [-4, 0], [-9, 8]], '#D9E1EA')
          ala([[13, 0], [-4, 0], [-6, 2.5]], COL.ruta)
          ctx.restore()
        }
      }
      if (!quieto && empezado && (!fin || despues < 1 || estela.length)) pedir()
    }

    // Empieza cuando el globo se ve en pantalla (una sola vez por ronda).
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { empezado = true; pedir(); io.disconnect() } }, { threshold: 0.4 })
    io.observe(cv)
    // Arrastrar para girar el globo cuando el avión ya ha llegado.
    const baja = e => { if (libre) { arrastre = { x: e.clientX, y: e.clientY, ll: [...libre] }; cv.setPointerCapture(e.pointerId) } }
    const mueve = e => {
      if (!arrastre) return
      const k = 90 / Math.min(ancho, alto)
      libre = [arrastre.ll[0] - (e.clientX - arrastre.x) * k, Math.max(-60, Math.min(60, arrastre.ll[1] + (e.clientY - arrastre.y) * k))]
      pedir()
    }
    const suelta = () => { arrastre = null }
    cv.addEventListener('pointerdown', baja); cv.addEventListener('pointermove', mueve)
    cv.addEventListener('pointerup', suelta); cv.addEventListener('pointercancel', suelta)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect()
      cv.removeEventListener('pointerdown', baja); cv.removeEventListener('pointermove', mueve)
      cv.removeEventListener('pointerup', suelta); cv.removeEventListener('pointercancel', suelta)
    }
  }, [origen, viaje, quieto, ronda, onProgreso])
  return <canvas ref={ref} className="i-globo" role="img" aria-label={`Un avión vuela de ${origen.nombre} a ${viaje.destino}: ${viaje.vuelos_anio} vuelos compensados al año`} />
}

const num = n => Number(n).toLocaleString('es-ES')

export default function Globo({ impacto: inicial, ha = 8, titulo = 'Vuestro impacto, en vuelos' }) {
  const [imp, setImp] = useState(inicial || null)
  const [prog, setProg] = useState({ f: 0, fin: false })
  const [ronda, setRonda] = useState(0)
  const progreso = useRef((f, fin) => setProg(p => (p.fin === fin && Math.abs(p.f - f) < 0.01 ? p : { f, fin }))).current
  const quieto = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (inicial) { setImp(inicial); return }
    api(`/impacto?ha=${ha}`).then(setImp).catch(() => {})
  }, [inicial, ha])
  useEffect(() => setProg({ f: 0, fin: false }), [ronda, imp])

  if (!imp?.viaje) return null
  const v = imp.viaje
  const vistos = quieto || prog.fin ? v.vuelos_anio : Math.floor(prog.f * v.vuelos_anio)
  return (
    <div className="i-impacto">
      <div className="txt">
        <span className="i-tag" style={{ background: 'var(--co-l)', color: 'var(--co-d)' }}>✈️ {titulo}</span>
        <h3><b>{hectareas(imp.hectareas)}</b> de bosque compensan cada año</h3>
        <div className="grande"><b>{num(vistos)}</b><span>{v.vuelos_anio === 1 ? 'vuelo' : 'vuelos'} de ida y vuelta<br />{imp.origen.nombre} – {v.destino}</span></div>
        <div className="mini">
          <div><b>{num(imp.co2_anual)} t</b>de CO₂ al año</div>
          <div><b>{num(imp.coches_anio)}</b>{imp.coches_anio === 1 ? 'coche' : 'coches'} durante un año</div>
          <div><b>{imp.anios} años</b>absorbiendo CO₂</div>
        </div>
        <small>Estimación orientativa: 5 t de CO₂ por hectárea y año.</small>
      </div>
      <div className={`mundo${prog.fin ? ' fin' : ''}`}>
        <Lienzo key={ronda} origen={imp.origen} viaje={v} quieto={quieto} ronda={ronda} onProgreso={progreso} />
        <div className="contador">{prog.fin || quieto ? `🌳 ${num(v.vuelos_anio)} vuelos compensados` : `✈️ ${Math.round(prog.f * v.km).toLocaleString('es-ES')} km`}</div>
        {(prog.fin || quieto) && <span className="pista">Arrastrad para girar el mundo</span>}
        {prog.fin && !quieto && <button className="i-btn n sm otra" onClick={() => setRonda(r => r + 1)}>↻ Volver a volar</button>}
      </div>
    </div>
  )
}
