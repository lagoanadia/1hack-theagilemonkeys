import { LP } from './lp.js'
export const COL={c:'#3F9A66',e:'#EE6A4A',v:'#E59A2F'}, TIPO={c:'Convocatoria',e:'Empresa',v:'Voluntariado'}
const W=720,H=600, LON0=-4.62, LAT1=41.20, KX=Math.cos(40.4*Math.PI/180)*415, KY=415, OX=104, OY=18;
export const P=([lo,la])=>[OX+(lo-LON0)*KX, OY+(LAT1-la)*KY];
const OUTLL=[[-3.58,41.165],[-3.50,41.14],[-3.41,41.09],[-3.39,41.03],[-3.32,40.98],[-3.20,40.93],[-3.17,40.86],[-3.06,40.81],[-3.09,40.72],[-3.06,40.62],[-3.12,40.53],[-3.08,40.43],[-3.17,40.34],[-3.07,40.24],[-3.10,40.13],[-3.17,40.08],[-3.32,40.07],[-3.45,40.03],[-3.53,39.95],[-3.59,39.88],[-3.65,39.90],[-3.72,39.98],[-3.84,40.02],[-3.95,40.05],[-4.05,40.10],[-4.18,40.14],[-4.27,40.20],[-4.38,40.25],[-4.58,40.29],[-4.55,40.36],[-4.45,40.43],[-4.38,40.52],[-4.30,40.56],[-4.25,40.63],[-4.17,40.70],[-4.10,40.76],[-4.03,40.81],[-3.95,40.87],[-3.88,40.93],[-3.80,41.00],[-3.70,41.08],[-3.62,41.14]];
const OUT=OUTLL.map(P);
export const ZONAS=[
 ['Sierra Norte','#CFE6C7',[[-4.0,41.3],[-2.9,41.3],[-2.9,40.86],[-3.45,40.84],[-3.70,40.86],[-3.98,40.89]],[-3.48,41.0],2,6],
 ['Sierra de Guadarrama','#B4D9AE',[[-4.7,41.3],[-4.0,41.3],[-3.98,40.89],[-3.70,40.86],[-3.80,40.56],[-4.15,40.52],[-4.7,40.52]],[-4.08,40.66],2,8],
 ['Sierra Oeste','#DCEAC6',[[-4.7,40.52],[-4.15,40.52],[-4.0,40.40],[-4.0,40.10],[-4.7,40.10]],[-4.36,40.30],1,5],
 ['Madrid y área metropolitana','#E6EAE2',[[-4.15,40.52],[-3.80,40.56],[-3.70,40.86],[-3.45,40.84],[-3.45,40.55],[-3.50,40.30],[-4.0,40.30],[-4.0,40.40]],[-3.82,40.48],1,0.6],
 ['Corredor del Henares','#ECE6CC',[[-3.45,40.84],[-2.9,40.86],[-2.9,40.30],[-3.50,40.30],[-3.45,40.55]],[-3.26,40.62],1,1.5],
 ['Las Vegas y Sur','#F1DFC2',[[-4.0,40.30],[-2.9,40.30],[-2.9,39.8],[-4.7,39.8],[-4.7,40.10],[-4.0,40.10]],[-3.45,40.18],2,15],
];
const LABS={'Sierra Norte':[[-3.40,40.95]],'Sierra de Guadarrama':[[-4.24,40.66],'SIERRA DE|GUADARRAMA'],'Sierra Oeste':[[-4.24,40.24]],'Madrid y área metropolitana':[[-3.99,40.43],'MADRID Y ÁREA|METROPOLITANA'],'Corredor del Henares':[[-3.24,40.66],'CORREDOR DEL|HENARES'],'Las Vegas y Sur':[[-3.30,40.17],'LAS VEGAS|Y SUR']};
export const inPoly=(pt,poly)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if(((yi>pt[1])!=(yj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi))c=!c}return c};
// opc.mini: sin rótulos ni brújula (tarjetas pequeñas); opc.pin: [lon,lat] de una chincheta.
export function madridMap(SITES, selId, opc = {}){
 LP.setSeed(8);
 const outline=OUT.map(p=>p.join(',')).join(' ');
 const ZP=ZONAS.map(z=>z[2].map(P));
 const xs=OUT.map(p=>p[0]),ys=OUT.map(p=>p[1]);const x0=Math.min(...xs)-60,x1=Math.max(...xs)+60,y0=Math.min(...ys)-60,y1=Math.max(...ys)+60;
 const st=62,pts=[];for(let y=y0,r=0;y<=y1+st;y+=st*.87,r++){const row=[];for(let x=x0+(r%2?st/2:0);x<=x1+st;x+=st)row.push([x+(LP.rnd()-.5)*st*.45,y+(LP.rnd()-.5)*st*.4]);pts.push(row)}
 let tri='';const face=(A,B,C)=>{const c=[(A[0]+B[0]+C[0])/3,(A[1]+B[1]+C[1])/3];let zi=ZP.findIndex(z=>inPoly(c,z));if(zi<0)zi=3;
  tri+=LP.poly([A,B,C],LP.shade(ZONAS[zi][1],(LP.rnd()-.5)*.12+(c[0]<360?.02:-.03)))};
 for(let r=0;r<pts.length-1;r++){const A=pts[r],B=pts[r+1];const n=Math.min(A.length,B.length)-1;for(let i=0;i<n;i++){if(r%2===0){face(A[i],A[i+1],B[i]);face(A[i+1],B[i+1],B[i])}else{face(A[i],B[i+1],B[i]);face(A[i],A[i+1],B[i+1])}}}
 let s=`<defs><clipPath id="cm"><polygon points="${outline}"/></clipPath><filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="14" flood-color="#1B2742" flood-opacity=".16"/></filter></defs>`;
 s+=`<g filter="url(#sh)"><polygon points="${OUT.map(p=>[p[0],p[1]+18].join(',')).join(' ')}" fill="#8F6646"/><polygon points="${OUT.map(p=>[p[0],p[1]+9].join(',')).join(' ')}" fill="#B98A5E"/></g><g clip-path="url(#cm)">${tri}`;
 ZP.forEach(z=>{s+=`<polygon points="${z.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-opacity=".95"/>`});
 const T=[[-3.20,40.13],[-3.40,40.05],[-3.55,40.02],[-3.70,40.0],[-3.85,40.04],[-4.0,40.08]].map(P);
 s+=`<path d="M${T.map(p=>p.map(v=>v.toFixed(1)).join(' ')).join(' L')}" fill="none" stroke="#7FB4DC" stroke-width="3" stroke-linecap="round"/></g>`;
 s+=`<polygon points="${outline}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>`;
 if(!opc.mini) ZONAS.forEach(([n])=>{const [ll,txt]=LABS[n];const [x,y]=P(ll);(txt||n.toUpperCase()).split('|').forEach((t,i)=>{s+=`<text x="${x}" y="${y+i*15}" text-anchor="middle" font-family="Instrument Sans" font-size="12" font-weight="700" letter-spacing="1" fill="#33423A" stroke="#fff" stroke-opacity=".55" stroke-width="3" paint-order="stroke">${t}</text>`})});
 const m=P([-3.70,40.42]); s+=`<circle cx="${m[0]}" cy="${m[1]}" r="${opc.mini?7:4}" fill="#1B2742"/>`; if(!opc.mini) s+=`<text x="${m[0]+9}" y="${m[1]+4}" font-family="Instrument Sans" font-size="12.5" font-weight="700" fill="#1B2742" stroke="#fff" stroke-width="3" paint-order="stroke">Madrid</text>`;
 SITES.slice().sort((a,b)=>b.ha-a.ha).forEach(({id,ll,ha,tipo:t})=>{const [x,y]=P(ll);const r=9+Math.sqrt(ha)*7;
  s+=`<g data-id="${id}" style="cursor:pointer"><circle cx="${x}" cy="${y+3}" r="${r}" fill="#1B2742" opacity=".1"/><circle cx="${x}" cy="${y}" r="${r}" fill="${COL[t]}" fill-opacity=".28" stroke="${COL[t]}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${Math.max(6,r*.42)}" fill="${COL[t]}" stroke="#fff" stroke-width="2.5"/></g>`;
  if(id===selId) s+=`<circle cx="${x}" cy="${y}" r="${r+7}" fill="none" stroke="#1B2742" stroke-width="2.5" stroke-dasharray="5 5" pointer-events="none"/>`;});
 if(opc.pin){const [x,y]=P(opc.pin);
  s+=`<ellipse cx="${x}" cy="${y+4}" rx="26" ry="9" fill="#1B2742" opacity=".18"/><circle cx="${x}" cy="${y}" r="46" fill="#EE6A4A" fill-opacity=".18"/><path d="M${x} ${y} C ${x-10} ${y-26} ${x-30} ${y-40} ${x-30} ${y-62} A 30 30 0 1 1 ${x+30} ${y-62} C ${x+30} ${y-40} ${x+10} ${y-26} ${x} ${y}Z" fill="#EE6A4A" stroke="#fff" stroke-width="5"/><circle cx="${x}" cy="${y-62}" r="11" fill="#fff"/>`}
 if(!opc.mini && opc.brujula !== false) s+=`<g transform="translate(660 60)"><circle r="22" fill="#fff"/><path d="M0 -14 L6 4 L0 0 L-6 4Z" fill="#1B2742"/><text y="17" text-anchor="middle" font-family="Instrument Sans" font-size="10" font-weight="700" fill="#1B2742">N</text></g>`;
 if(opc.mini){const mx=Math.min(...xs)-14,my=Math.min(...ys)-80,w=Math.max(...xs)-mx+14,h=Math.max(...ys)+30-my;return `<svg viewBox="${mx.toFixed(0)} ${my.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" width="100%" style="display:block">${s}</svg>`}
 return `<svg viewBox="0 0 ${W} ${H+30}" width="100%" style="display:block;max-height:640px">${s}</svg>`;
}
export function spainMini(){
 const S=[[0,40],[30,18],[90,12],[150,10],[205,22],[230,40],[214,62],[200,92],[176,120],[150,140],[110,146],[70,140],[44,120],[30,96],[14,70]];
 let s=LP.poly(S.map(p=>[p[0]+6,p[1]+8]),'#D3DACF');LP.setSeed(3);
 const c=[118,78];for(let i=0;i<S.length;i++){const a=S[i],b=S[(i+1)%S.length];s+=LP.poly([a,b,c],LP.shade('#E7ECE3',(LP.rnd()-.5)*.1))}
 s+=`<path d="M112 70 l10 -6 l8 8 l-4 10 l-10 2 z" fill="#3F9A66"/><circle cx="120" cy="76" r="14" fill="#3F9A66" fill-opacity=".2" stroke="#3F9A66" stroke-width="1.5"/>`;
 return `<svg viewBox="0 0 240 160" width="240" height="160">${s}</svg>`;
}

// Municipios de la Comunidad de Madrid más habituales, para situar una propuesta por su «lugar».
const LUGARES = {
  'valdemorillo': [-4.07, 40.50], 'soto del real': [-3.78, 40.75], 'cercedilla': [-4.06, 40.74], 'manzanares el real': [-3.86, 40.73],
  'aranjuez': [-3.60, 40.03], 'casa de campo': [-3.75, 40.42], 'colmenar viejo': [-3.77, 40.66], 'rascafria': [-3.88, 40.90],
  'guadarrama': [-4.09, 40.67], 'navacerrada': [-4.01, 40.73], 'el escorial': [-4.13, 40.58], 'san lorenzo de el escorial': [-4.15, 40.59],
  'alcala de henares': [-3.36, 40.48], 'buitrago': [-3.64, 40.99], 'torrelaguna': [-3.54, 40.83], 'miraflores de la sierra': [-3.76, 40.81],
  'chinchon': [-3.42, 40.14], 'rivas': [-3.52, 40.36], 'getafe': [-3.73, 40.31], 'alcobendas': [-3.64, 40.55], 'boadilla': [-3.88, 40.40],
  'villaviciosa de odon': [-3.90, 40.36], 'collado villalba': [-4.00, 40.63], 'galapagar': [-3.98, 40.58], 'torrelodones': [-3.93, 40.58],
  'pozuelo': [-3.81, 40.43], 'las rozas': [-3.87, 40.49], 'majadahonda': [-3.87, 40.47], 'tres cantos': [-3.71, 40.60], 'lozoya': [-3.79, 40.95],
  'robledo de chavela': [-4.24, 40.50], 'cadalso de los vidrios': [-4.43, 40.30], 'san martin de valdeiglesias': [-4.40, 40.36],
  'villa del prado': [-4.30, 40.28], 'el pardo': [-3.77, 40.52], 'monte de el pardo': [-3.77, 40.52], 'madrid': [-3.70, 40.42],
  'fuenlabrada': [-3.80, 40.28], 'leganes': [-3.76, 40.33], 'mostoles': [-3.86, 40.32], 'alcorcon': [-3.82, 40.35], 'parla': [-3.77, 40.24],
  'arganda': [-3.44, 40.30], 'torrejon': [-3.48, 40.46], 'coslada': [-3.56, 40.42], 'san sebastian de los reyes': [-3.63, 40.55],
  'el molar': [-3.58, 40.73], 'patones': [-3.48, 40.86], 'montejo de la sierra': [-3.53, 41.06], 'somosierra': [-3.58, 41.13],
}
const sinTildes = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export function lugarLL(lugar) {
  const t = sinTildes(lugar)
  const k = Object.keys(LUGARES).filter(n => t.includes(n)).sort((a, b) => b.length - a.length)[0]
  return k ? LUGARES[k] : null
}
// Mini mapa de la Comunidad de Madrid con una chincheta en el lugar de la propuesta (null si no se reconoce).
const cacheMini = {}
export function mapaLugar(lugar) {
  const ll = lugarLL(lugar)
  if (!ll) return null
  const k = ll.join(',')
  return (cacheMini[k] ||= madridMap([], null, { mini: true, pin: ll }))
}
