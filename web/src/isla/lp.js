// Low-poly helpers (flat-shaded facets, light from upper-left)
export const LP = (() => {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const setSeed = s => { seed = s; };
  const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const shade = (h, f) => { const c = hx(h); return toHex(c.map(v => f >= 0 ? v + (255 - v) * f : v * (1 + f))); };
  const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  const poly = (pts, fill) => `<polygon points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="${fill}" stroke="${fill}" stroke-width=".6" stroke-linejoin="round"/>`;

  function conifer(x, y, h, col, trunk = '#6B4A35') {
    let s = poly([[x - h * .05, y], [x + h * .05, y], [x + h * .04, y - h * .22], [x - h * .04, y - h * .22]], trunk);
    for (let k = 0; k < 3; k++) {
      const w = h * (.36 - k * .08), by = y - h * .16 - k * h * .21, ay = by - h * .36;
      const cx = x + (rnd() - .5) * h * .03;
      s += poly([[x - w, by], [cx, ay], [x + w * .08, by + h * .03]], shade(col, .16 + k * .04));
      s += poly([[x + w * .08, by + h * .03], [cx, ay], [x + w, by]], shade(col, -.22 + k * .03));
    }
    return s;
  }
  function roundTree(x, y, h, col, trunk = '#6B4A35') {
    let s = poly([[x - h * .045, y], [x + h * .045, y], [x + h * .035, y - h * .4], [x - h * .035, y - h * .4]], trunk);
    const cx = x, cy = y - h * .6, r = h * .32, n = 7, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + .3; const rr = r * (.86 + rnd() * .22); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .92]); }
    const c2 = [cx - r * .12, cy - r * .1];
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const ang = Math.atan2((p[1] + q[1]) / 2 - cy, (p[0] + q[0]) / 2 - cx);
      const f = .26 * Math.cos(ang + 2.36) + (rnd() - .5) * .06;
      s += poly([c2, p, q], shade(col, f));
    }
    return s;
  }
  function flag(x, y, h, col, pole = '#4A3A2E') {
    let s = `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - h}" stroke="${pole}" stroke-width="2.6" stroke-linecap="round"/>`;
    s += poly([[x + 1, y - h], [x + 24, y - h + 7], [x + 1, y - h + 8]], shade(col, .08));
    s += poly([[x + 1, y - h + 8], [x + 24, y - h + 7], [x + 1, y - h + 16]], shade(col, -.18));
    return s;
  }
  // terrain strip; returns {svg, yAt}
  function strip({ W, H, ridge, amp = 16, season = [0, 0], green, dry, far, seed: sd = 3 }) {
    setSeed(sd);
    const step = 64, r0 = [], r1 = [];
    for (let x = -64; x <= W + 64; x += step) {
      const jx = x + (rnd() - .5) * 18;
      r0.push([jx, ridge + Math.sin(x / 230) * amp + (rnd() - .5) * 12]);
      r1.push([jx + (rnd() - .5) * 26, ridge + 40 + (rnd() - .5) * 16 + Math.sin(x / 230) * amp * .5]);
    }
    const colAt = x => { const [a, b] = season; const t = x < a ? 1 : x > b + 70 ? 1 : x > b ? (x - b) / 70 : 0; return x <= b ? green : mix(green, dry, Math.min(1, t)); };
    let s = '';
    if (far) {
      const fr = []; for (let x = -80; x <= W + 80; x += 110) fr.push([x + (rnd() - .5) * 40, ridge - 46 - rnd() * 48]);
      for (let i = 0; i < fr.length - 1; i++) {
        const a = fr[i], b = fr[i + 1], m = [(a[0] + b[0]) / 2 + (rnd() - .5) * 30, ridge + 10];
        s += poly([a, b, m], shade(far, .1 + rnd() * .06));
        s += poly([a, m, [a[0] - 40, ridge + 10]], shade(far, -.05 + rnd() * .05));
      }
    }
    for (let i = 0; i < r0.length - 1; i++) {
      const a = r0[i], b = r0[i + 1], c = r1[i], d = r1[i + 1];
      const cx = (a[0] + b[0]) / 2, base = colAt(cx);
      const slope = (b[1] - a[1]) / (b[0] - a[0]);
      s += poly([a, b, c], shade(base, .1 - slope * .9 + (rnd() - .5) * .07));
      s += poly([b, d, c], shade(base, -.04 + (rnd() - .5) * .07));
      s += poly([c, d, [d[0], H + 4]], shade(base, -.12 + (rnd() - .5) * .05));
      s += poly([c, [d[0], H + 4], [c[0], H + 4]], shade(base, -.18 + (rnd() - .5) * .05));
    }
    const yAt = x => { for (let i = 0; i < r0.length - 1; i++) { const a = r0[i], b = r0[i + 1]; if (x >= a[0] && x <= b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return ridge; };
    return { svg: s, yAt };
  }
  // floating island (isometric), returns {svg, spots}
  function island(cx, cy, rx, { top, cliff, rock, seed: sd = 5 }) {
    setSeed(sd);
    const n = 9, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const r = rx * (.82 + rnd() * .22); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * .5]); }
    let s = '';
    // underside rock cone
    const tip = [cx + rx * .08, cy + rx * 1.05];
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n]; if (Math.sin(i / n * Math.PI * 2) < -.2) continue;
      const d = rx * .18;
      const p2 = [p[0], p[1] + d], q2 = [q[0], q[1] + d];
      const lit = Math.cos(i / n * Math.PI * 2) < 0 ? .06 : -.2;
      s += poly([p2, q2, tip], shade(rock, lit + (rnd() - .5) * .08));
      s += poly([p, q, q2, p2], shade(cliff, lit + (rnd() - .5) * .06));
    }
    const c0 = [cx - rx * .05, cy - rx * .03];
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; s += poly([c0, p, q], shade(top, (rnd() - .5) * .12 + (p[0] < cx ? .06 : -.04))); }
    return { svg: s };
  }
  return { conifer, roundTree, flag, strip, island, shade, mix, rnd, setSeed, poly };
})();

export function island(w, h, planted, total, sd = 4) {
  LP.setSeed(sd)
  const cx = w / 2, cy = h * .38, rx = w * .38
  let s = LP.island(cx, cy, rx, { top: '#86C27A', cliff: '#C79466', rock: '#8F6C56', seed: sd }).svg
  const sp = [], cols = Math.ceil(total / 2)
  for (let j = 0; j < 2; j++) for (let i = 0; i < cols; i++) { if (sp.length >= total) break; sp.push([cx + (i - (cols - 1) / 2) * rx * .36 + (j ? rx * .16 : -rx * .1), cy + (j - .5) * rx * .3]) }
  sp.sort((a, b) => a[1] - b[1])
  const sel = []; for (let i = 0; i < Math.min(planted, total); i++) sel.push(Math.floor(i * total / Math.max(planted, 1) + 1) % total)
  sp.forEach((p, i) => {
    if (sel.includes(i)) s += i % 2 ? LP.conifer(p[0], p[1], rx * .55, '#2F7650') : LP.roundTree(p[0], p[1], rx * .46, '#45935F')
    else s += `<ellipse cx="${p[0]}" cy="${p[1]}" rx="${rx * .05}" ry="${rx * .025}" fill="#63A257"/>` + LP.poly([[p[0] - 1.6, p[1]], [p[0] + 1.6, p[1]], [p[0] + 1.2, p[1] - rx * .13], [p[0] - 1.2, p[1] - rx * .13]], '#C79466') + `<line x1="${p[0]}" y1="${p[1] - rx * .1}" x2="${p[0] + rx * .05}" y2="${p[1] - rx * .085}" stroke="#EE6A4A" stroke-width="2"/>`
  })
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;display:block;margin:0 auto">${s}</svg>`
}
export function plant(stage) {
  LP.setSeed(stage + 3)
  let s = '<ellipse cx="40" cy="70" rx="26" ry="7" fill="#D9E7D2"/>'
  if (stage === 0) s += LP.poly([[36, 70], [44, 70], [40, 60]], '#8F6C56') + LP.poly([[40, 60], [44, 70], [42, 64]], '#6E5040')
  else if (stage === 1) s += `<line x1="40" y1="70" x2="40" y2="52" stroke="#4F8A3A" stroke-width="3"/>` + LP.poly([[40, 56], [52, 48], [46, 58]], '#7CC060') + LP.poly([[40, 58], [28, 50], [34, 60]], '#5FA048')
  else if (stage === 2) s += LP.conifer(40, 72, 44, '#3F8A5C')
  else s += LP.roundTree(40, 72, 60, '#3F8A5C')
  return `<svg viewBox="0 0 80 80" width="80" height="80">${s}</svg>`
}
export const tree = (w, h, size, col = '#79C08A') => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${LP.conifer(w / 2, h, size, col)}</svg>`
// Logo de Reforesta: un brote (la «semilla») con hojas facetadas, como el icono de la web.
export const semilla = (w, h) => `<svg viewBox="0 0 512 512" width="${w}" height="${h}" aria-hidden="true">
<path d="M256 372V226" stroke="#F1F6F2" stroke-width="26" stroke-linecap="round"/>
<path d="M256 244c-62 0-100-38-100-96 62 0 100 38 100 96z" fill="#9BD3A8"/><path d="M256 244c-62 0-100-38-100-96 42 30 72 62 100 96z" fill="#79C08A"/>
<path d="M256 288c0-52 38-90 100-90 0 58-38 90-100 90z" fill="#9BD3A8"/><path d="M256 288c0-52 38-90 100-90-34 24-66 54-100 90z" fill="#B7E2C1"/>
<path d="M166 376h180c0 42-40 66-90 66s-90-24-90-66z" fill="#E5D8C5"/><path d="M256 376h90c0 42-40 66-90 66z" fill="#CDBEA8"/></svg>`
