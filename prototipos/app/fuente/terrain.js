// Mapas de relieve generados: ruido fractal -> curvas de nivel (d3.contours) con tintas hipsométricas.
(function () {
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function perlin(seed) {
    const r = rng(seed), p = new Uint8Array(512), g = [];
    for (let i = 0; i < 256; i++) { p[i] = i; const a = r() * Math.PI * 2; g.push([Math.cos(a), Math.sin(a)]); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 256; i++) p[i + 256] = p[i];
    const f = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const dot = (h, x, y) => { const v = g[h & 255]; return v[0] * x + v[1] * y; };
    return function (x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
      const u = f(x), v = f(y), a = p[X] + Y, b = p[X + 1] + Y;
      const l1 = dot(p[a], x, y) + u * (dot(p[b], x - 1, y) - dot(p[a], x, y));
      const l2 = dot(p[a + 1], x, y - 1) + u * (dot(p[b + 1], x - 1, y - 1) - dot(p[a + 1], x, y - 1));
      return l1 + v * (l2 - l1);
    };
  }
  window.terrain = function (svg, o) {
    const W = o.w, H = o.h, n = o.cols || 220, m = Math.round(n * H / W), noise = perlin(o.seed || 7);
    const sc = o.scale || 3.2, vals = new Float64Array(n * m);
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
      let x = i / n * sc, y = j / m * sc * (H / W), a = 0, amp = 1, fr = 1;
      for (let k = 0; k < 5; k++) { a += amp * noise(x * fr + 13.1 * k, y * fr - 7.7 * k); amp *= 0.5; fr *= 2.03; }
      // cresta (sierra) opcional
      if (o.ridge) { const d = (y - o.ridge.y - (x - o.ridge.x) * o.ridge.slope); a += o.ridge.h * Math.exp(-d * d / o.ridge.w); }
      vals[j * n + i] = a;
    }
    let mn = Infinity, mx = -Infinity; for (const v of vals) { if (v < mn) mn = v; if (v > mx) mx = v; }
    const levels = o.levels || 16, th = d3.range(levels).map((k) => mn + (mx - mn) * k / levels);
    const cs = d3.contours().size([n, m]).thresholds(th)(Array.from(vals));
    const path = d3.geoPath(d3.geoIdentity().scale(W / (n - 1)));
    const col = d3.scaleLinear().domain(o.palette.map((_, i) => i / (o.palette.length - 1))).range(o.palette).interpolate(d3.interpolateLab);
    const ns = 'http://www.w3.org/2000/svg', gF = document.createElementNS(ns, 'g'), gL = document.createElementNS(ns, 'g');
    cs.forEach((c, k) => {
      const d = path(c);
      const f = document.createElementNS(ns, 'path'); f.setAttribute('d', d); f.setAttribute('fill', col(k / (cs.length - 1))); gF.appendChild(f);
      const l = document.createElementNS(ns, 'path'); l.setAttribute('d', d); l.setAttribute('fill', 'none');
      l.setAttribute('stroke', o.stroke || 'rgba(0,0,0,.18)'); l.setAttribute('stroke-width', k % 4 === 0 ? (o.sw || 1) * 1.8 : (o.sw || 1)); gL.appendChild(l);
    });
    if (o.fill !== false) svg.appendChild(gF);
    svg.appendChild(gL);
  };
})();
