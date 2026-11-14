// Monta la ventana común (fondo de relieve, barra de título y barra lateral) alrededor de #page.
const PAL = {
  mapa: ['#B8C79A', '#C9D2A6', '#D8D9B4', '#E2DDBE', '#D9CFA6', '#C8B98A', '#B3A57A'],
  bosque: ['#466B3A', '#5E8048', '#7E9658', '#A2A86E', '#BFB487'],
  pradera: ['#9DB57A', '#B4C48C', '#CBD3A2', '#DCDCB6'],
  ocre: ['#B58A4A', '#C9A266', '#D8BC86', '#E4D2A8'],
  gris: ['#B9B9AF', '#C9C8BE', '#D6D4CA', '#E2E0D6'],
  agua: ['#6F93A8', '#8DAAB9', '#AAC1CB', '#C9D7DB'],
};
function tiles() {
  document.querySelectorAll('svg[data-t]').forEach((s) => {
    const [pal, seed, sc] = s.dataset.t.split(':');
    const w = +s.getAttribute('width'), h = +s.getAttribute('height');
    terrain(s, { w, h, seed: +seed, scale: +(sc || 1.4), levels: 11, cols: Math.max(40, Math.round(w / 3)), palette: PAL[pal], stroke: 'rgba(30,40,25,.22)', sw: .7 });
  });
}
function shell({ titulo, seg, nav, extra = '' }) {
  const page = document.getElementById('page');
  aplicarTema();
  const tb = page.querySelector('.toolbar h1');
  if (tb) { const w = document.createElement('div'); w.className = 'ttl'; w.innerHTML = `<span class="tag">${nav === 'Bandeja' && /Ficha/.test(titulo) ? 'Ficha de convocatoria' : nav}</span>`; tb.replaceWith(w); w.appendChild(tb); }
  const NAV = [['Panel', '', 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z'], ['Bandeja', '98', 'M3 12h18M3 6h18M3 18h12'],
    ['Mapa', '', 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15'], ['Empresas BOE', '28', 'M3 21V8l6-4 6 4v13M15 21V12h6v9'],
    ['Flujo de solicitudes', '9', 'M3 4h5v16H3zM10 4h5v10h-5zM17 4h4v13h-4z'], ['Proyectos', '3', 'M12 21v-9M12 12c0-4 3-7 8-7 0 5-3 8-8 7z']];
  const segs = ['Bandeja', 'Mapa', 'Flujo'].map((s) => `<span class="${s === seg ? 'on' : ''}">${s}</span>`).join('');
  document.body.insertAdjacentHTML('afterbegin', `<svg id="wall" width="1760" height="1160" viewBox="0 0 1760 1160" aria-hidden="true"></svg>
  <div class="win"><div class="tb"><div class="lights"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>
   <div class="seg">${segs}</div><div class="tbtitle">${titulo}</div>
   <div class="tbtools"><span class="ti"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M7 12h10M10 18h4"/></svg></span><span class="ti on"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg></span>
   <div style="display:flex;margin-left:8px"><span class="av" style="background:#CFE3B8;color:#1F4D2E;border:2px solid #F4F3EE">SN</span><span class="av" style="background:#E9C46A;color:#4A3500;border:2px solid #F4F3EE;margin-left:-8px">NA</span></div></div></div>
   <div class="body"><aside class="side">
    <div style="display:flex;align-items:center;gap:10px;padding:2px 8px 10px"><span style="width:30px;height:30px;border-radius:9px;background:#1F4D2E;display:grid;place-items:center"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#CFE3B8" stroke-width="2.2" stroke-linecap="round"><path d="M12 21v-9"/><path d="M12 12c0-4 3-7 8-7 0 5-3 8-8 7z"/><path d="M12 14c0-3-2-6-7-6 0 4 3 6 7 6z"/></svg></span><div><div style="font-weight:700;font-size:14px">Reforesta</div><div style="font-size:11.5px;color:#7A847C">Radar · 6 personas</div></div></div>
    ${NAV.map(([n, b, d]) => `<div class="ni ${n === nav ? 'on' : ''}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${d}"/></svg>${n}${b ? `<b>${b}</b>` : ''}</div>`).join('')}
    ${extra || `<div class="sh">Vistas guardadas</div><div class="view"><i style="background:#1F4D2E"></i>Madrid · cierran ≤ 30 días</div><div class="view"><i style="background:#2C6E91"></i>Estatales · restauración</div><div class="view"><i style="background:#E9C46A"></i>Marcadas por el equipo</div>
    <div class="sh">Fuentes</div><div class="view mono" style="font-size:11.5px;color:#4A554D;line-height:1.7;display:block">BDNS · 5.117 revisadas<br>BOE · 32 declaraciones<br>Sincronizado hoy 05:17</div>`}
    <div style="margin-top:auto;padding:12px;border-radius:12px;background:#E3E7D8"><div class="k">Objetivo 2026</div><div style="display:flex;align-items:baseline;gap:6px;margin-top:4px"><span style="font-size:28px;font-weight:800;letter-spacing:-.03em">3</span><span style="color:#5A665D">de 10 solicitudes</span></div><div class="bar" style="margin-top:8px;background:#CED5C0"><i style="width:30%"></i></div></div>
   </aside><section class="content" id="slot"></section></div></div>`);
  document.getElementById('slot').appendChild(page);
  page.style.display = 'contents';
  terrain(document.getElementById('wall'), { w: 1760, h: 1160, seed: 3, scale: 3, levels: 14, palette: ['#5C7A47', '#7E9658', '#A9B072', '#C8BC8A', '#D9CDAA'], stroke: 'rgba(20,30,20,.25)' });
  tiles();
}

function aplicarTema() {
  if (document.getElementById('tema')) return;
  document.head.insertAdjacentHTML('beforeend', '<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,300..700&display=swap" rel="stylesheet"><link id="tema" rel="stylesheet" href="theme.css">');
}
