/* Simulador Copa de España de Clubes de Natación – División de Honor 2026 */
(function(){
'use strict';
const D = window.COPA_DATA;
const M = window.COPA_MEDIA || {escudos:{},fotos:{}};
const $ = s => document.querySelector(s);
const app = $('#app');

/* ---------- Reglamento 2026-27 (normativa RFEN 26-465) ---------- */
const PROGRAM = [
 [1,'M','200L',1],[2,'F','400X',1],[3,'M','50E',1],[4,'F','50E',1],[5,'M','200M',1],[6,'F','200M',1],[7,'M','100B',1],[8,'F','100B',1],[9,'M','1500L',1],[10,'F','R200L',1],[11,'M','R100L',1],
 [12,'F','200L',2],[13,'M','400X',2],[14,'F','50M',2],[15,'M','50M',2],[16,'F','200B',2],[17,'M','200B',2],[18,'F','100E',2],[19,'M','100E',2],[20,'F','1500L',2],[21,'M','R200L',2],[22,'F','R100L',2],
 [23,'M','R50L',3],[24,'F','R50L',3],[25,'M','800L',3],[26,'F','400L',3],[27,'M','100X',3],[28,'F','100X',3],[29,'M','200E',3],[30,'F','200E',3],[31,'M','100L',3],[32,'F','100L',3],[33,'M','R50X',3],[34,'F','R50X',3],
 [35,'F','50L',4],[36,'M','50L',4],[37,'F','200X',4],[38,'M','200X',4],[39,'F','50B',4],[40,'M','50B',4],[41,'F','100M',4],[42,'M','100M',4],[43,'F','800L',4],[44,'M','400L',4],[45,'F','R100X',4],[46,'M','R100X',4]
].map(([n,g,k,s])=>({n,g,k,s,relay:k[0]==='R'}));
const SESSIONS = {1:'Viernes 18 · tarde',2:'Sábado 19 · mañana',3:'Sábado 19 · tarde',4:'Domingo 20 · mañana'};
const PTS_IND = [19,16,14,13,12,11,10,9,8,7,6,5,4,3,2,1];
const PTS_REL = [38,32,28,26,24,22,20,18];
const MAX_IND = 4, MAX_SESSION = 2, MAX_ROSTER = 14, PER_EVENT = 2;
const OFFICIAL = {
  M:['terrassa','sabadell','santandreu','canoe','nados','gsd','mediterrani','santaolaya'],
  F:['santandreu','canoe','sabadell','gsd','barcelona','ferca','terrassa','elvalle']
};
const START = new Date('2026-12-18T16:30:00+01:00');
const STROKES = {L:'Libre',E:'Espalda',B:'Braza',M:'Mariposa',X:'Estilos'};
function evName(k){ const r=k[0]==='R'; const m=k.replace('R','').match(/(\d+)(\w)/); return (r?'4x':'')+m[1]+' '+STROKES[m[2]]; }

/* ---------- Estado guardado en el móvil ---------- */
const KEY='copadh26'; const MINE='santaolaya';
let S = load();
function load(){
  let s={}; try{ s=JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){}
  return Object.assign({g:'M', clubs:{M:OFFICIAL.M.slice(),F:OFFICIAL.F.slice()}, mine:'santaolaya', sw:{}, add:[], ev:{}, rel:{}, nextId:100000, man:{on:false,ev:{}}, legs:{}, obj:{}}, s, {g:'M', mine:MINE});
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

const CLUB = Object.fromEntries(D.clubs.map(c=>[c.id,c]));
function swimmers(){
  // base + edits + added
  const out=[];
  for(const b of D.swimmers.concat(S.add)){
    const e=S.sw[b.id]||{};
    if(e.del) continue;
    out.push({id:b.id,n:b.n,y:b.y,g:b.g,c:e.c||b.c,t:Object.assign({},b.t,e.t||{}),e:b.e||{},f:b.f||{},off:!!e.off,added:!!b.added,moved:!!e.c&&e.c!==b.c});
  }
  return out;
}
// Solo tiempos reales (2025 o los que metas) y, para el Santa Olaya, la marca que prevé el entrenador. Nada inventado.
function bestTime(s,k){ const o=S.obj&&S.obj[s.id]&&S.obj[s.id][k]; if(o!=null) return {t:o,est:false,obj:true}; if(s.t[k]!=null) return {t:s.t[k],est:false}; return null; }

/* ---------- Tiempos ---------- */
function fmt(t){ if(t==null||isNaN(t)) return '—'; if(t>=60){ const m=Math.floor(t/60); const s=(t-m*60).toFixed(2).padStart(5,'0'); return m+':'+s; } return t.toFixed(2); }
function parseT(v){ v=String(v).trim().replace(',','.'); if(!v) return null; if(/^dq$|^dsq$|^desc/i.test(v)) return 'DQ';
  let m=v.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/); if(m) return +m[1]*60+ +m[2];
  m=v.match(/^(\d+)[.:](\d{2})[.:](\d{1,2})$/); if(m) return +m[1]*60+ +m[2]+ +('0.'+m[3]);
  if(/^\d+(\.\d+)?$/.test(v)) return +v; return null; }

/* ---------- Tiempos de relevo base (Copa 2025, editables) ---------- */
const REL2025 = {};
for(const div of ['p1','dh']) for(const n in D.res2025[div]){ const ev=D.res2025[div][n]; if(ev.k[0]!=='R') continue;
  for(const r of ev.rows) if(r.t!=null) REL2025[ev.g+'|'+ev.k+'|'+r.c]=r.t; } // División de Honor tiene prioridad
function relayTime(g,k,c){ if(c===MINE){ const q=soRelay(k); if(q&&q.use&&q.est!=null) return {t:q.est,ov:true,sum:true}; } const o=S.rel[g+'|'+k+'|'+c]; if(o!=null) return {t:o,ov:true}; const b=REL2025[g+'|'+k+'|'+c]; return b!=null?{t:b,ov:false}:null; }

/* ---------- Alineación automática (respeta el reglamento) ---------- */
function buildLineup(g,fixed){
  const clubs=S.clubs[g];
  const evs=PROGRAM.filter(e=>e.g===g&&!e.relay);
  const pool=swimmers().filter(s=>s.g===g&&!s.off&&clubs.includes(s.c));
  const byClub={}; clubs.forEach(c=>byClub[c]=pool.filter(s=>s.c===c));
  // campo inicial: 2 mejores por club y prueba
  let field={};
  for(const e of evs){ field[e.n]=[]; for(const c of clubs){ const cand=byClub[c].map(s=>({s,b:bestTime(s,e.k)})).filter(x=>x.b).sort((a,b)=>a.b.t-b.b.t).slice(0,2); cand.forEach(x=>field[e.n].push({c,t:x.b.t})); } }
  let lineup;
  for(let iter=0;iter<2;iter++){
    lineup={};
    for(const c of clubs){
      if(c===MINE&&S.man.on){ lineup[c]=manualLineup(evs); continue; }
      const opts=[];
      for(const e of evs) for(const s of byClub[c]){ const b=bestTime(s,e.k); if(!b) continue;
        const faster=field[e.n].filter(x=>x.c!==c&&x.t<b.t).length; const pts=PTS_IND[faster]||0;
        opts.push({s,e,t:b.t,est:b.est,v:pts+(b.est?-1.5:0)}); }
      opts.sort((a,b)=>b.v-a.v||a.t-b.t);
      const cnt={},ses={},slot={},roster=new Set();
      const L=lineup[c]={};
      if(c===MINE&&fixed) for(const n in fixed){ const e=evs.find(x=>x.n===+n); if(!e) continue; for(const id of fixed[n]){ const s=byClub[c].find(x=>x.id===id); if(!s) continue; const b=bestTime(s,e.k);
        (L[e.n]=L[e.n]||[]).push({s,e,t:b?b.t:null,est:false,v:0}); slot[e.n]=(slot[e.n]||0)+1; cnt[id]=(cnt[id]||0)+1; ses[id+'|'+e.s]=(ses[id+'|'+e.s]||0)+1; roster.add(id); } }
      for(const o of opts){
        const sid=o.s.id, en=o.e.n;
        if((slot[en]||0)>=PER_EVENT) continue;
        if((cnt[sid]||0)>=MAX_IND) continue;
        if((ses[sid+'|'+o.e.s]||0)>=MAX_SESSION) continue;
        if(L[en]&&L[en].some(x=>x.s.id===sid)) continue;
        if(!roster.has(sid)&&roster.size>=MAX_ROSTER) continue;
        (L[en]=L[en]||[]).push(o); slot[en]=(slot[en]||0)+1; cnt[sid]=(cnt[sid]||0)+1; ses[sid+'|'+o.e.s]=(ses[sid+'|'+o.e.s]||0)+1; roster.add(sid);
      }
      // repaso: rellenar huecos con quien aún pueda nadar (aunque puntúe poco)
      for(const e of evs){ while((slot[e.n]||0)<PER_EVENT){
        const cand=byClub[c].map(s=>({s,b:bestTime(s,e.k)})).filter(x=>x.b&&(cnt[x.s.id]||0)<MAX_IND&&(ses[x.s.id+'|'+e.s]||0)<MAX_SESSION&&!(L[e.n]||[]).some(o=>o.s.id===x.s.id)&&(roster.has(x.s.id)||roster.size<MAX_ROSTER)).sort((a,b)=>a.b.t-b.b.t)[0];
        if(!cand) break; const sid=cand.s.id;
        (L[e.n]=L[e.n]||[]).push({s:cand.s,e,t:cand.b.t,est:cand.b.est,v:0}); slot[e.n]=(slot[e.n]||0)+1; cnt[sid]=(cnt[sid]||0)+1; ses[sid+'|'+e.s]=(ses[sid+'|'+e.s]||0)+1; roster.add(sid); } }
      L._roster=roster;
    }
    if(lineup[MINE]) for(const k in S.legs) for(const id of (S.legs[k].ids||[])) if(id) lineup[MINE]._roster.add(id);
    field={}; for(const e of evs){ field[e.n]=[]; for(const c of clubs) (lineup[c][e.n]||[]).forEach(o=>field[e.n].push({c,t:o.t})); }
  }
  return lineup;
}

/* ---------- Puntuación ---------- */
function scoreEvent(entries, table){
  // entries: [{key,c,t}] t numérico o 'DQ'/null
  const ok=entries.filter(x=>typeof x.t==='number').sort((a,b)=>a.t-b.t);
  let i=0;
  while(i<ok.length){ let j=i; while(j+1<ok.length&&Math.abs(ok[j+1].t-ok[i].t)<0.001) j++;
    let sum=0; for(let p=i;p<=j;p++) sum+=table[p]||0; const each=sum/(j-i+1);
    for(let p=i;p<=j;p++){ ok[p].place=i+1; ok[p].pts=each; } i=j+1; }
  entries.filter(x=>typeof x.t!=='number').forEach(x=>{x.place=null;x.pts=0;});
  return ok.concat(entries.filter(x=>typeof x.t!=='number'));
}
function eventEntries(e, lineup){
  const g=e.g, clubs=S.clubs[g], ov=S.ev[e.n]||{};
  const list=[];
  if(e.relay){
    for(const c of clubs){ const r=relayTime(g,e.k,c); const key='R:'+c; let t=r?r.t:null, o=r&&r.ov;
      if(ov.t&&key in ov.t){ t=ov.t[key]; o=true; }
      if(t!=null) list.push({key,c,t,ov:o}); }
    return scoreEvent(list,PTS_REL);
  }
  for(const c of clubs) for(const o of (lineup[c][e.n]||[])){ const key=String(o.s.id); let t=o.t, ovr=false;
    if(ov.t&&key in ov.t){ t=ov.t[key]; ovr=true; }
    list.push({key,c,t,s:o.s,est:o.est&&!ovr,ov:ovr}); }
  // nadadores añadidos a mano en esta prueba (resultado real)
  if(ov.extra) for(const x of ov.extra){ const s=swimmers().find(z=>z.id===x.id); if(s) list.push({key:String(s.id),c:s.c,t:x.t,s,ov:true}); }
  return scoreEvent(list,PTS_IND);
}
let CACHE={};
function simulate(g){
  if(CACHE[g]) return CACHE[g];
  const lineup=buildLineup(g);
  const clubs=S.clubs[g];
  const tot=Object.fromEntries(clubs.map(c=>[c,0])), bySes={}, wins=Object.fromEntries(clubs.map(c=>[c,[]]));
  const events={};
  for(const e of PROGRAM.filter(e=>e.g===g)){
    const r=eventEntries(e,lineup); events[e.n]=r;
    for(const x of r){ tot[x.c]+=x.pts; if(x.place) wins[x.c].push(x.place); }
    bySes[e.s]=Object.assign({},tot);
  }
  const order=clubs.slice().sort((a,b)=>tot[b]-tot[a]||tieBreak(wins[a],wins[b]));
  return CACHE[g]={lineup,events,tot,order,bySes};
}
function tieBreak(a,b){ for(let p=1;p<=16;p++){ const d=b.filter(x=>x===p).length-a.filter(x=>x===p).length; if(d) return d; } return 0; }
function invalidate(){ CACHE={}; PROB={}; save(); }

/* ---------- Probabilidades (simulación Monte Carlo) ---------- */
let PROB={};
function gauss(){ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function montecarlo(g,N){
  if(PROB[g]) return PROB[g];
  const base=simulate(g), clubs=S.clubs[g];
  const res=Object.fromEntries(clubs.map(c=>[c,{pos:new Array(clubs.length).fill(0),pts:0}]));
  for(let it=0;it<N;it++){
    const tot=Object.fromEntries(clubs.map(c=>[c,0]));
    for(const e of PROGRAM.filter(e=>e.g===g)){
      const done=(S.ev[e.n]||{}).done; const ent=base.events[e.n];
      if(done){ ent.forEach(x=>tot[x.c]+=x.pts); continue; }
      const sd=e.relay?0.006:0.009;
      const arr=ent.filter(x=>typeof x.t==='number').map(x=>({c:x.c,t:x.t*(1+sd*gauss())}));
      if(!e.relay) for(const x of arr) if(Math.random()<0.012) x.t=1e9; // descalificación
      arr.sort((a,b)=>a.t-b.t); const tb=e.relay?PTS_REL:PTS_IND;
      arr.forEach((x,i)=>{ if(x.t<1e8) tot[x.c]+=tb[i]||0; });
    }
    const ord=clubs.slice().sort((a,b)=>tot[b]-tot[a]+(Math.random()-.5)*1e-6);
    ord.forEach((c,i)=>res[c].pos[i]++); clubs.forEach(c=>res[c].pts+=tot[c]);
  }
  clubs.forEach(c=>{ res[c].pos=res[c].pos.map(x=>x/N); res[c].pts/=N; });
  return PROB[g]=res;
}

/* ---------- Piezas visuales ---------- */
function badge(c,size){ size=size||36; const m=M.escudos[c];
  if(m) return `<span class="crest" style="width:${size}px;height:${size}px"><img src="${m.f}" alt="${esc((CLUB[c]||{}).s||'')}" loading="lazy"></span>`;
  const k=CLUB[c]||{a:'?',c1:'#555',c2:'#fff'}; const fs=Math.round(size*(k.a.length>3?.28:.34));
  return `<span class="badge" style="width:${size}px;height:${size}px;font-size:${fs}px;background:linear-gradient(135deg,${k.c1} 0 58%,${k.c2==='#ffffff'?shade(k.c1):k.c2} 58%)">${k.a}</span>`; }
function ava(s,size){ size=size||36; const f=M.fotos[s.id]; const k=CLUB[s.c]||{c1:'#888'};
  const ini=s.n.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  const inner=f?`<img src="${f.f}" alt="" loading="lazy">`:ini;
  return `<span class="ava" style="width:${size}px;height:${size}px;font-size:${Math.round(size*.36)}px;background:${f?'#ddd':`linear-gradient(135deg,${k.c1},${shade(k.c1)})`}">${inner}</span>`; }
function shade(hex){ const n=parseInt(hex.slice(1),16); const r=Math.max(0,(n>>16)-50),g=Math.max(0,((n>>8)&255)-50),b=Math.max(0,(n&255)-50); return `rgb(${r},${g},${b})`; }
function cname(c){ return (CLUB[c]||{s:c}).s; }
function esc(s){ return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function pfmt(p){ return (Math.round(p*2)/2).toLocaleString('es-ES'); }
function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('on'),2200); }
function gTxt(g){ return g==='M'?'masculina':'femenina'; }

/* ---------- Vistas ---------- */
function vHome(){
  const g=S.g, R=simulate(g), clubs=S.clubs[g];
  const max=Math.max(...clubs.map(c=>R.tot[c]))||1;
  const doneN=PROGRAM.filter(e=>e.g===g&&(S.ev[e.n]||{}).done).length;
  const ms=START-new Date(); const days=Math.max(0,Math.floor(ms/864e5)), hrs=Math.max(0,Math.floor(ms%864e5/36e5));
  let h=`<section class="hero"><img class="logo" src="icons/mark.png" alt="CNSO DH Simulator"><div class="k">XXXVI Copa de España de Clubes</div><h1>División de Honor ${gTxt(g)}</h1>
   <div class="row"><span>📍 Can Llong, Sabadell</span><span>📅 18 al 20 de diciembre de 2026</span><span>🏊 25 m · 10 calles</span></div>
   ${ms>0?`<div class="count"><div><b>${days}</b><span>días</span></div><div><b>${hrs}</b><span>horas</span></div></div>`:''}</section>`;
  h+=`<div class="row" style="justify-content:space-between"><h2 style="margin:6px 0">Clasificación ${doneN?'en directo + previsión':'prevista'}</h2>
     ${doneN?`<span class="chip done">${doneN}/23 pruebas reales</span>`:''}</div><div class="stand">`;
  R.order.forEach((c,i)=>{ const p=i+1; const k=CLUB[c];
    if(p===7&&clubs.length>=8) h+=`<div class="zone">▼ Descenso a Primera</div>`;
    const medal=p===1?'🥇':p===2?'🥈':p===3?'🥉':p;
    h+=`<a href="#/equipo/${c}" class="srow p${p} ${p>=7&&clubs.length>=8?'rel':''} ${c===S.mine?'mine':''}"><div class="bar" style="width:${R.tot[c]/max*100}%;background:${k.c1}"></div>
      <div class="pos">${medal}</div>${badge(c,38)}<div class="nm"><b>${esc(k.s)}</b><span class="mut small">${esc(k.city)}</span></div>
      <div class="pts">${pfmt(R.tot[c])}<small>${i?'-'+pfmt(R.tot[R.order[0]]-R.tot[c]):'puntos'}</small></div></a>`;
  });
  h+=`</div>`;
  h+=`<h2>Cómo va la Copa sesión a sesión</h2><div class="card">${raceChart(g,R)}</div>`;
  h+=`<div class="grid2"><a class="tile" href="#/prob"><span style="font-size:26px">🎲</span><b>Probabilidades</b><span class="mut small">Mil Copas simuladas</span></a>
      <a class="tile" href="#/pruebas"><span style="font-size:26px">⏱️</span><b>Prueba a prueba</b><span class="mut small">Cambia tiempos y mira qué pasa</span></a></div>`;
  h+=`<p class="note" style="margin-top:14px">La previsión usa los tiempos de cada nadador en la Copa de 2025 y elige automáticamente la mejor alineación de cada club cumpliendo el reglamento: 2 nadadores por club y prueba, 4 pruebas individuales por nadador (máximo 2 por sesión) y 14 nadadores por equipo. Puntos: 19-16-14-13-12…1 en individuales y 38-32-28-26-24-22-20-18 en relevos.</p>`;
  return h;
}
function raceChart(g,R){
  const clubs=R.order, W=340, H=190, P={l:26,r:72,t:10,b:22};
  const max=Math.max(...clubs.map(c=>R.tot[c]))||1;
  const x=s=>P.l+(W-P.l-P.r)*s/4, y=v=>H-P.b-(H-P.t-P.b)*v/max;
  let svg=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Puntos acumulados por sesión">`;
  for(let i=0;i<=4;i++){ svg+=`<line x1="${x(i)}" x2="${x(i)}" y1="${P.t}" y2="${H-P.b}" stroke="var(--sep)"/>`; svg+=`<text x="${x(i)}" y="${H-6}" text-anchor="middle">${i?'S'+i:'0'}</text>`; }
  const labels=[];
  clubs.forEach(c=>{ const k=CLUB[c]; const pts=[0,1,2,3,4].map(s=>s?R.bySes[s][c]:0);
    svg+=`<polyline fill="none" stroke="${k.c1==='#ffcc00'||k.c1==='#ffd400'?k.c1:k.c1}" stroke-width="${c===S.mine?3.5:2.2}" stroke-linejoin="round" points="${pts.map((v,i)=>x(i)+','+y(v)).join(' ')}"/>`;
    labels.push({c,y:y(pts[4]),k}); });
  labels.sort((a,b)=>a.y-b.y); for(let i=1;i<labels.length;i++) if(labels[i].y-labels[i-1].y<11) labels[i].y=labels[i-1].y+11;
  labels.forEach(l=>{ svg+=`<circle cx="${x(4)}" cy="${y(R.tot[l.c])}" r="3" fill="${l.k.c1}"/><text x="${x(4)+6}" y="${l.y+3}" style="fill:var(--txt)">${esc(l.k.s.length>12?l.k.a:l.k.s)}</text>`; });
  return svg+`</svg><div class="note">S1 viernes tarde · S2 sábado mañana · S3 sábado tarde · S4 domingo mañana</div>`;
}
function vPruebas(){
  const g=S.g, R=simulate(g);
  let h=`<h1>Prueba a prueba</h1><p class="mut small" style="margin-top:0">Programa oficial ${gTxt(g)}. Toca una prueba para ver la previsión y cambiar tiempos.</p>`;
  let ses=0;
  for(const e of PROGRAM.filter(e=>e.g===g)){
    if(e.s!==ses){ ses=e.s; h+=`<div class="sess">Sesión ${ses} · ${SESSIONS[ses]}</div>`; }
    const r=R.events[e.n]; const w=r[0]; const mine=r.filter(x=>x.c===S.mine).reduce((a,x)=>a+x.pts,0);
    const done=(S.ev[e.n]||{}).done;
    h+=`<a class="evrow" href="#/prueba/${e.n}"><div class="num">${e.n}</div><div class="grow"><b>${evName(e.k)}</b>
      <div>${w?(e.relay?'Gana '+esc(cname(w.c)):'Gana '+esc(w.s.n)+' · '+esc(cname(w.c)))+' · '+fmt(w.t):'Sin datos'}</div></div>
      ${done?'<span class="chip done">Real</span>':''}${S.clubs[g].includes(S.mine)&&mine?`<span class="chip acc">+${pfmt(mine)}</span>`:''}</a>`;
  }
  return h;
}
function vPrueba(n){
  n=+n; const e=PROGRAM.find(x=>x.n===n); if(!e) return vPruebas();
  if(e.g!=='M') return vPruebas();
  const R=simulate(e.g), r=R.events[n], ov=S.ev[n]||{};
  let h=`<a class="back" href="#/pruebas">‹ Pruebas</a><h1>${evName(e.k)} ${e.g==='M'?'masculino':'femenino'}</h1>
   <p class="mut small" style="margin-top:0">Prueba ${n} · Sesión ${e.s} (${SESSIONS[e.s]}) · ${e.relay?'1 equipo por club':'2 nadadores por club, contrarreloj en 2 series'}</p>
   <label class="toggle"><input type="checkbox" id="doneTg" ${ov.done?'checked':''}><div><b>Ya se ha nadado</b><div class="note">Márcalo cuando metas los tiempos reales. Así la clasificación mezcla lo real con la previsión.</div></div></label><div class="spacer"></div>
   <div class="card"><div class="list">`;
  r.forEach(x=>{ const pl=x.place, cls=pl===1?'g':pl===2?'s':pl===3?'b':'';
    h+=`<div class="li"><div class="place ${cls}">${pl||(x.t==='DQ'?'DQ':'—')}</div>${e.relay?badge(x.c,34):ava(x.s,36)}<div class="grow"><b>${e.relay?esc(CLUB[x.c].s):esc(x.s.n)}</b><span class="mut small" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">${e.relay?'Relevo':badge(x.c,15)+esc(cname(x.c))+(x.s.y?' · '+x.s.y:'')}${x.est?'<span class="est">ESTIMADO</span>':''}</span></div>
      <input class="timein ${x.ov?'ov':''}" inputmode="decimal" data-k="${x.key}" value="${x.t==='DQ'?'DQ':fmt(x.t)}"><div class="ptag">${x.pts?pfmt(x.pts):'0'}</div></div>`; });
  h+=`</div></div><div class="row"><a class="btn sm" href="${e.relay?'#/so/relevos':'#/so/prueba/'+n}">Cambiar nadadores del Santa Olaya</a><button class="btn ghost sm" id="resetEv">Volver a los tiempos de previsión</button></div>
  <p class="note">Escribe un tiempo (por ejemplo 1:43.50 o 23.10) o DQ si descalifican. Los tiempos cambiados se ven en dorado. ${e.relay?'Los relevos parten del tiempo de cada club en la Copa 2025.':'Solo cuentan marcas reales o las que pongas tú: quien no tiene marca en la prueba no puntúa.'}</p>`;
  setTimeout(()=>{
    $('#doneTg').onchange=ev=>{ S.ev[n]=Object.assign(S.ev[n]||{}, {done:ev.target.checked}); invalidate(); toast(ev.target.checked?'Prueba marcada como nadada':'Prueba vuelve a previsión'); };
    $('#resetEv').onclick=()=>{ if(S.ev[n]) delete S.ev[n].t; invalidate(); render(); toast('Tiempos de previsión restaurados'); };
    document.querySelectorAll('.timein').forEach(inp=>inp.onchange=()=>{ const v=parseT(inp.value); if(v==null){ toast('Tiempo no válido'); return; }
      const o=S.ev[n]=S.ev[n]||{}; o.t=o.t||{}; o.t[inp.dataset.k]=v; invalidate(); render(); });
  });
  return h;
}
function vEquipos(){
  const g=S.g, R=simulate(g);
  let h=`<h1>Equipos</h1><p class="mut small" style="margin-top:0">Los 8 clubes de División de Honor ${gTxt(g)} 2026. Toca uno para ver su equipo, sus pruebas y cambiar nadadores.</p><div class="grid2">`;
  R.order.forEach((c,i)=>{ const k=CLUB[c]; const n=(R.lineup[c]._roster||new Set()).size;
    h+=`<a class="tile" href="#/equipo/${c}">${badge(c,52)}<b>${esc(k.s)}</b><span class="mut small">${i+1}º previsto · ${pfmt(R.tot[c])} pts · ${n} nadadores</span></a>`; });
  h+=`</div><div class="spacer"></div><a class="btn ghost" href="#/clubes">Cambiar los clubes participantes</a>`;
  return h;
}
function vEquipo(c){
  const k=CLUB[c]; if(!k) return vEquipos();
  const g=S.g, inComp=S.clubs[g].includes(c); const R=simulate(g);
  const all=swimmers().filter(s=>s.g===g&&s.c===c).sort((a,b)=>a.n.localeCompare(b.n));
  const L=inComp?R.lineup[c]:{}; const roster=L._roster||new Set();
  const evOf={}; if(inComp) for(const e of PROGRAM.filter(e=>e.g===g&&!e.relay)) for(const o of (L[e.n]||[])) (evOf[o.s.id]=evOf[o.s.id]||[]).push(e);
  const ptsOf={}; if(inComp) for(const n in R.events) for(const x of R.events[n]) if(x.c===c&&x.s) ptsOf[x.s.id]=(ptsOf[x.s.id]||0)+x.pts;
  const relPts=inComp?PROGRAM.filter(e=>e.g===g&&e.relay).reduce((a,e)=>a+(R.events[e.n].find(x=>x.c===c)||{pts:0}).pts,0):0;
  const pos=R.order.indexOf(c)+1;
  let h=`<a class="back" href="#/equipos">‹ Equipos</a><div class="teamhead">${badge(c,64)}<div><h1 style="margin:0">${esc(k.n)}</h1><div class="mut small">${esc(k.city)} · ${g==='M'?'Masculino':'Femenino'}</div>
   ${inComp?`<div class="chips" style="margin-top:6px"><span class="chip acc">${pos}º previsto</span><span class="chip">${pfmt(R.tot[c])} puntos</span><span class="chip">${roster.size}/14 nadadores</span></div>`:'<div class="chip" style="margin-top:6px">No está en la División de Honor elegida</div>'}</div></div>`;
  h+=`<div class="row">${c===MINE?'<a class="btn sm" href="#/so">Abrir modo entrenador</a>':''}<a class="btn ghost sm" href="#/fichar/${c}">+ Añadir nadador</a></div>`;
  if(inComp) h+=`<h2>Relevos (${pfmt(relPts)} pts)</h2><div class="card"><div class="list">${PROGRAM.filter(e=>e.g===g&&e.relay).map(e=>{ const x=R.events[e.n].find(z=>z.c===c);
     return `<div class="li"><div class="grow"><b>${evName(e.k)}</b><span class="mut small">${x?x.place+'º previsto':'Sin tiempo'}</span></div>
     <input class="timein relin ${x&&x.ov?'ov':''}" inputmode="decimal" data-k="${e.k}" value="${x?fmt(x.t):''}" placeholder="—"><div class="ptag">${x?pfmt(x.pts):0}</div></div>`; }).join('')}</div></div>`;
  h+=`<h2>Nadadores</h2>`;
  if(!all.length) h+=`<div class="empty">Este club no tiene nadadores ${g==='M'?'masculinos':'femeninos'} en los datos de 2025. Añádelos con “Añadir nadador”.</div>`;
  const sorted=all.sort((a,b)=>(roster.has(b.id)-roster.has(a.id))||((ptsOf[b.id]||0)-(ptsOf[a.id]||0)));
  h+=`<div class="card"><div class="list">`;
  for(const s of sorted){ const evs=evOf[s.id]||[];
    h+=`<a class="li" href="#/nadador/${s.id}">${ava(s,40)}<div class="grow"><b>${esc(s.n)}${s.off?' <span class="chip">No nada</span>':''}${s.moved?' <span class="chip acc">Fichaje</span>':''}</b>
     <div class="chips" style="margin-top:4px">${evs.length?evs.map(e=>`<span class="chip">${evName(e.k)}</span>`).join(''):`<span class="mut small">${s.off?'Fuera del equipo':roster.has(s.id)?'Relevos':'Sin prueba en la alineación'}</span>`}</div></div>
     <div class="ptag">${ptsOf[s.id]?pfmt(ptsOf[s.id]):''}</div></a>`; }
  h+=`</div></div>`;
  setTimeout(()=>{
    document.querySelectorAll('.relin').forEach(inp=>inp.onchange=()=>{ const v=parseT(inp.value); if(v==null||v==='DQ'){ toast('Tiempo no válido'); return; } S.rel[g+'|'+inp.dataset.k+'|'+c]=v; invalidate(); render(); });
  });
  return h;
}
function vNadador(id){
  id=+id; const s=swimmers().find(x=>x.id===id) || (D.swimmers.concat(S.add)).find(x=>x.id===id); if(!s) return vEquipos();
  const R=simulate(s.g); const myEv=[];
  for(const e of PROGRAM.filter(e=>e.g===s.g&&!e.relay)){ const x=R.events[e.n].find(z=>z.s&&z.s.id===id); if(x) myEv.push([e,x]); }
  const keys=['50L','100L','200L','400L','800L','1500L','50E','100E','200E','50B','100B','200B','50M','100M','200M','100X','200X','400X'];
  const ph=M.fotos[s.id];
  let h=`<a class="back" href="#/equipo/${s.c}">‹ ${esc(cname(s.c))}</a><div class="teamhead">${ava(s,84)}<div><h1 style="margin:0;font-size:28px">${esc(s.n)}</h1><div class="mut small" style="display:flex;align-items:center;gap:6px;margin-top:4px">${badge(s.c,20)}${esc(CLUB[s.c].n)}${s.y?' · '+s.y:''}</div>${ph?`<div class="credit">Foto: <a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(ph.file)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>`:''}</div></div>`;
  h+=`<h2>En la Copa 2026 (previsión)</h2>`;
  h+= myEv.length?`<div class="card"><div class="list">${myEv.map(([e,x])=>`<a class="li" href="#/prueba/${e.n}"><div class="grow"><b>${evName(e.k)}</b><span class="mut small">Sesión ${e.s}</span></div><span class="t">${fmt(x.t)}</span><div class="ptag">${x.place?x.place+'º':''}</div></a>`).join('')}</div></div>`:`<div class="empty">No entra en ninguna prueba individual de la alineación automática.</div>`;
  h+=`<h2>Mejores marcas (piscina 25 m)</h2><div class="card"><div class="list">`;
  for(const k of keys){ const b=bestTime(s,k);
    h+=`<div class="li"><div class="grow"><b>${evName(k)}</b>${b&&b.est?'<span class="est">ESTIMADO</span>':''}</div><input class="timein swt ${S.sw[id]&&S.sw[id].t&&S.sw[id].t[k]!=null?'ov':''}" inputmode="decimal" data-k="${k}" value="${b?fmt(b.t):''}" placeholder="—"></div>`; }
  h+=`</div></div><p class="note">Pon aquí sus marcas de esta temporada (válidas desde el 18 de octubre de 2025) y la alineación se recalcula sola.</p>
  <h2>Opciones</h2><div class="row"><button class="btn ghost sm" id="offBtn">${s.off?'Vuelve a nadar':'No nada esta Copa'}</button>
   <select id="moveSel" style="max-width:220px"><option value="">Cambiar de club…</option>${D.clubs.map(c=>`<option value="${c.id}" ${c.id===s.c?'disabled':''}>${esc(c.s)}</option>`).join('')}</select>
   ${s.added||id>=100000?'<button class="btn red sm" id="delBtn">Borrar</button>':''}</div>`;
  setTimeout(()=>{
    const ed=()=>S.sw[id]=S.sw[id]||{};
    document.querySelectorAll('.swt').forEach(inp=>inp.onchange=()=>{ const v=inp.value.trim()?parseT(inp.value):null; if(inp.value.trim()&&(v==null||v==='DQ')){ toast('Tiempo no válido'); return; }
      const e=ed(); e.t=e.t||{}; if(v==null) delete e.t[inp.dataset.k]; else e.t[inp.dataset.k]=v;
      if(id>=100000){ const a=S.add.find(x=>x.id===id); if(v==null) delete a.t[inp.dataset.k]; else a.t[inp.dataset.k]=v; }
      invalidate(); render(); toast('Marca guardada'); });
    $('#offBtn').onclick=()=>{ ed().off=!s.off; invalidate(); render(); };
    $('#moveSel').onchange=ev=>{ if(!ev.target.value) return; ed().c=ev.target.value; invalidate(); toast('Ahora nada en '+cname(ev.target.value)); location.hash='#/nadador/'+id; render(); };
    const d=$('#delBtn'); if(d) d.onclick=()=>{ S.add=S.add.filter(x=>x.id!==id); delete S.sw[id]; invalidate(); location.hash='#/equipo/'+s.c; };
  });
  return h;
}
function vFichar(c){
  const g=S.g; const k=CLUB[c];
  let h=`<a class="back" href="#/equipo/${c}">‹ ${esc(k.s)}</a><h1>Añadir nadador</h1>
   <div class="card pad"><h3>Nuevo nadador</h3><div class="row"><input type="text" id="newName" placeholder="Nombre y apellidos" style="flex:1;min-width:180px"><input type="text" id="newYear" placeholder="Año" inputmode="numeric" style="width:80px"></div><div class="spacer"></div><button class="btn" id="addBtn">Añadir a ${esc(k.s)}</button>
   <p class="note">Después podrás ponerle sus marcas.</p></div>
   <div class="card pad"><h3>Fichar de otro club</h3><input type="search" id="q" placeholder="Busca por nombre"><div class="list" id="res" style="margin-top:6px"></div></div>`;
  setTimeout(()=>{
    $('#addBtn').onclick=()=>{ const n=$('#newName').value.trim(); if(!n){ toast('Escribe el nombre'); return; } const y=parseInt($('#newYear').value)||null;
      const id=S.nextId++; S.add.push({id,n,y,g,c,t:{},added:true}); invalidate(); location.hash='#/nadador/'+id; };
    const q=$('#q'), res=$('#res');
    const run=()=>{ const v=q.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); if(v.length<2){ res.innerHTML='<div class="mut small">Escribe al menos 2 letras</div>'; return; }
      const hits=swimmers().filter(s=>s.g===g&&s.c!==c&&s.n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes(v)).slice(0,30);
      res.innerHTML=hits.map(s=>`<div class="li">${ava(s,34)}<div class="grow"><b>${esc(s.n)}</b><span class="mut small">${esc(cname(s.c))}${s.y?' · '+s.y:''}</span></div><button class="btn sm" data-id="${s.id}">Fichar</button></div>`).join('')||'<div class="mut small">Nadie con ese nombre</div>';
      res.querySelectorAll('button').forEach(b=>b.onclick=()=>{ const id=+b.dataset.id; S.sw[id]=S.sw[id]||{}; S.sw[id].c=c; invalidate(); toast('Fichado por '+k.s); run(); }); };
    q.oninput=run; run();
  });
  return h;
}
function vProb(){
  const g=S.g, N=1000; const P=montecarlo(g,N); const clubs=S.clubs[g].slice().sort((a,b)=>P[b].pos[0]-P[a].pos[0]||P[b].pts-P[a].pts);
  const n=clubs.length;
  let h=`<h1>Probabilidades</h1><p class="mut small" style="margin-top:0">Hemos simulado la Copa ${N.toLocaleString('es-ES')} veces. En cada una los nadadores van un poco más rápido o más lento, y alguno descalifica, como pasa en la realidad.</p>
   <div class="card"><div class="probrow h"><span></span><span>Club</span><span class="c">Gana</span><span class="c">Podio</span><span class="c">Baja</span></div>`;
  for(const c of clubs){ const p=P[c].pos; const win=p[0], pod=p.slice(0,3).reduce((a,b)=>a+b,0), rel=n>=8?p.slice(6).reduce((a,b)=>a+b,0):0;
    h+=`<a class="probrow" href="#/equipo/${c}">${badge(c,30)}<div><b style="font-size:14px">${esc(cname(c))}</b><div class="meter"><i style="width:${pod*100}%;background:${CLUB[c].c1}"></i></div></div>
      <span class="c pct" style="color:var(--gold)">${pc(win)}</span><span class="c pct">${pc(pod)}</span><span class="c pct" style="color:${rel>.05?'var(--red)':'var(--mut)'}">${pc(rel)}</span></a>`; }
  h+=`</div><h2>Puesto más probable</h2><div class="card">`;
  for(const c of S.clubs[g].slice().sort((a,b)=>P[b].pts-P[a].pts)){ const p=P[c].pos;
    h+=`<div class="li">${badge(c,28)}<div class="grow"><b>${esc(cname(c))}</b><div style="display:flex;gap:2px;margin-top:5px">${p.map((v,i)=>`<div title="${i+1}º ${pc(v)}" style="flex:1;height:22px;border-radius:4px;background:rgba(26,154,82,${Math.max(.06,Math.min(1,v*1.6)).toFixed(2)});display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:600;color:${v>.3?'#fff':'var(--mut)'}">${i+1}º</div>`).join('')}</div></div><span class="mut small" style="width:52px;text-align:right">${pfmt(P[c].pts)}</span></div>`; }
  h+=`</div><div class="row"><button class="btn ghost" id="again">🎲 Volver a simular</button></div>`;
  setTimeout(()=>{ $('#again').onclick=()=>{ PROB={}; render(); toast('Nueva simulación hecha'); }; });
  return h;
}
function pc(v){ return v<0.005&&v>0?'<1%':Math.round(v*100)+'%'; }
function vMas(){
  return `<img class="applogo" src="icons/logo.jpg" alt="CNSO DH Simulator"><h1>Más</h1><div class="list card">
   <a class="li" href="#/2025"><span style="font-size:22px">🏆</span><div class="grow"><b>Copa 2025: resultados reales</b><span class="mut small">Clasificación y todas las pruebas de Sabadell 2025</span></div>›</a>
   <a class="li" href="#/clubes"><span style="font-size:22px">🔁</span><div class="grow"><b>Clubes participantes</b><span class="mut small">Cambia qué 8 clubes compiten (para inventar escenarios)</span></div>›</a>
   <a class="li" href="#/reglamento"><span style="font-size:22px">📘</span><div class="grow"><b>Reglamento 2026</b><span class="mut small">Pruebas, puntos, ascensos y descensos</span></div>›</a>
   <a class="li" href="#/instalar"><span style="font-size:22px">📲</span><div class="grow"><b>Instalar en el móvil</b><span class="mut small">Tenerla como una app más</span></div>›</a>
   <a class="li" href="#/reset"><span style="font-size:22px">🧹</span><div class="grow"><b>Empezar de cero</b><span class="mut small">Borra tus cambios de tiempos y fichajes</span></div>›</a></div>
   <p class="note">Datos: resultados oficiales de la XXXV Copa de España de Clubes 2025 (División de Honor en Sabadell y Primera División en Pontevedra) y normativa RFEN 2026-27. App no oficial.</p>`;
}
function v2025(sub){
  const g=S.g; const res=D.res2025.dh;
  const tot={}; for(const n in res){ const ev=res[n]; if(ev.g!==g) continue; for(const r of ev.rows) if(r.pts) tot[r.c]=(tot[r.c]||0)+r.pts; }
  const ord=Object.keys(tot).sort((a,b)=>tot[b]-tot[a]); const max=tot[ord[0]];
  if(sub){ const ev=res[sub]; if(!ev) return v2025();
    const swm=Object.fromEntries(D.swimmers.map(s=>[s.id,s]));
    return `<a class="back" href="#/2025">‹ Copa 2025</a><h1>${evName(ev.k)} ${ev.g==='M'?'masculino':'femenino'}</h1><p class="mut small" style="margin-top:0">Resultado real · Sabadell, diciembre de 2025</p><div class="card"><div class="list">${ev.rows.map(r=>`<div class="li"><div class="place ${r.p===1?'g':r.p===2?'s':r.p===3?'b':''}">${r.p||(r.x?'DQ':'=')}</div>${badge(r.c,30)}<div class="grow"><b>${r.s?esc(swm[r.s].n):esc(cname(r.c))}</b><span class="mut small">${r.sw?r.sw.map(i=>esc(swm[i].n.split(' ')[0])).join(', '):esc(cname(r.c))}</span></div><span class="t">${r.t?fmt(r.t):'DQ'}</span><div class="ptag">${r.pts?pfmt(r.pts):''}</div></div>`).join('')}</div></div>`; }
  let h=`<a class="back" href="#/mas">‹ Más</a><h1>Copa 2025</h1><p class="mut small" style="margin-top:0">XXXV Copa de España · Can Llong, Sabadell · 19-21 de diciembre de 2025 · ${gTxt(g)}</p><div class="stand">`;
  ord.forEach((c,i)=>{ const p=i+1; h+=`<div class="srow p${p} ${p>=7?'rel':''}"><div class="bar" style="width:${tot[c]/max*100}%;background:${CLUB[c].c1}"></div><div class="pos">${p===1?'🥇':p===2?'🥈':p===3?'🥉':p}</div>${badge(c,34)}<div class="nm"><b>${esc(CLUB[c].s)}</b><span class="mut small">${p>=7?'Descendió':p===1?'Campeón':''}</span></div><div class="pts">${pfmt(tot[c])}</div></div>`; });
  h+=`</div><h2>Pruebas</h2>`;
  for(const e of PROGRAM.filter(e=>e.g===g)){ const ev=res[e.n]; const w=ev.rows[0]; const swm=w.s?D.swimmers.find(s=>s.id===w.s):null;
    h+=`<a class="evrow" href="#/2025/${e.n}"><div class="num">${e.n}</div><div class="grow"><b>${evName(e.k)}</b><div>${swm?esc(swm.n)+' · ':''}${esc(cname(w.c))} · ${fmt(w.t)}</div></div>›</a>`; }
  return h;
}
function vClubes(){
  const g=S.g; const sel=S.clubs[g];
  const have=new Set(D.swimmers.filter(s=>s.g===g).map(s=>s.c));
  const pool=D.clubs.filter(c=>have.has(c.id)||sel.includes(c.id));
  let h=`<a class="back" href="#/mas">‹ Más</a><h1>Clubes participantes</h1><p class="mut small" style="margin-top:0">Elige los 8 clubes de la División de Honor ${gTxt(g)}. Por defecto están los 8 oficiales de 2026.</p>
   <div class="row" style="margin-bottom:10px"><span class="chip acc">${sel.length} elegidos</span><button class="btn ghost sm" id="offi">Volver a los oficiales</button></div><div class="pickgrid">`;
  for(const c of pool) h+=`<button class="pick ${sel.includes(c.id)?'on':''}" data-c="${c.id}">${badge(c.id,26)}<span>${esc(c.s)}${OFFICIAL[g].includes(c.id)?' ★':''}</span></button>`;
  h+=`</div><p class="note">★ = club de División de Honor 2026. Con más o menos de 8 clubes la simulación funciona igual, pero el reglamento real es de 8.</p>`;
  setTimeout(()=>{
    document.querySelectorAll('.pick').forEach(b=>b.onclick=()=>{ const c=b.dataset.c; const i=sel.indexOf(c); if(i>=0){ if(sel.length<=2) return; sel.splice(i,1); } else sel.push(c); invalidate(); render(); });
    $('#offi').onclick=()=>{ S.clubs[g]=OFFICIAL[g].slice(); invalidate(); render(); };
  });
  return h;
}
function vReglamento(){
  return `<a class="back" href="#/mas">‹ Más</a><h1>Reglamento 2026</h1><div class="card pad note" style="font-size:14px;color:var(--txt);line-height:1.6">
  <p><b>Cuándo y dónde:</b> 18 al 20 de diciembre de 2026, piscina Can Llong (Sabadell), 25 metros y 10 calles. 4 sesiones.</p>
  <p><b>Clubes:</b> 8. Masculina: Terrassa, Sabadell, Sant Andreu, Real Canoe, Nados Castellón, Gredos San Diego y los ascendidos Mediterrani y Santa Olaya.</p>
  <p><b>Nadadores:</b> hasta 14 por club. 2 por prueba individual y 1 relevo por prueba. Cada nadador puede hacer 4 pruebas individuales, como mucho 2 en la misma sesión. Máximo 3 nacidos en 2012-2013 y 2 que no sean de formación local.</p>
  <p><b>Formato:</b> todo contrarreloj. Primera serie con el segundo mejor de cada club y segunda serie con el mejor.</p>
  <p><b>Puntos:</b> individuales 19-16-14-13-12-11-10-9-8-7-6-5-4-3-2-1. Relevos 38-32-28-26-24-22-20-18. Si hay empate se reparten los puntos. Si empatan dos clubes al final, gana el que tenga más primeros puestos, luego segundos, etc.</p>
  <p><b>Descensos:</b> bajan a Primera el 7º y el 8º. Suben de Primera el 1º y el 2º.</p>
  <p><b>Marcas válidas:</b> del 18 de octubre de 2025 al 29 de noviembre de 2026, en piscina de 25 o 50 m. Inscripciones hasta el 2 de diciembre.</p></div>
  <p class="note">Fuente: normativa RFEN de la XXXVI Copa de España de Clubes (26-465).</p>`;
}
function vInstalar(){
  return `<a class="back" href="#/mas">‹ Más</a><h1>Instalar en el móvil</h1>
  <div class="card pad"><h3>iPhone (Safari)</h3><p class="note">Toca el botón Compartir (el cuadrado con la flecha) y luego “Añadir a pantalla de inicio”.</p></div>
  <div class="card pad"><h3>Android (Chrome)</h3><p class="note">Toca los tres puntos de arriba a la derecha y luego “Instalar aplicación” o “Añadir a pantalla de inicio”.</p>${deferred?'<button class="btn" id="inst">Instalar ahora</button>':''}</div>
  <p class="note">Funciona sin conexión una vez abierta. Tus cambios se guardan en el móvil.</p>`;
}
function vReset(){
  setTimeout(()=>{ $('#yes').onclick=()=>{ localStorage.removeItem(KEY); S=load(); invalidate(); location.hash='#/'; toast('Todo como al principio'); }; });
  return `<a class="back" href="#/mas">‹ Más</a><h1>Empezar de cero</h1><div class="card pad"><p>Se borrarán los tiempos que hayas cambiado, los fichajes, los nadadores añadidos y las pruebas marcadas como nadadas.</p><button class="btn red" id="yes">Sí, borrar mis cambios</button></div>`;
}

/* ---------- Modo entrenador: Santa Olaya ---------- */
const LANZADA=0.6; // segundos que se ganan por cada salida lanzada en un relevo
function soAll(){ return swimmers().filter(s=>s.g==='M'&&s.c===MINE); }
function soById(id){ return swimmers().find(s=>s.id===id); }
function manualLineup(evs){
  const L={}, roster=new Set();
  for(const e of evs) for(const id of (S.man.ev[e.n]||[])){ const s=soById(id); if(!s||s.off||s.c!==MINE) continue;
    const b=bestTime(s,e.k); (L[e.n]=L[e.n]||[]).push({s,e,t:b?b.t:null,est:b?b.est:false,v:0}); roster.add(id); }
  L._roster=roster; return L;
}
function manualOn(){ // pasa a manual partiendo de la alineación automática
  if(S.man.on) return; const was=S.man.on; S.man.on=false; CACHE={}; const L=simulate('M').lineup[MINE]||{};
  S.man.ev={}; for(const e of PROGRAM.filter(e=>e.g==='M'&&!e.relay)) S.man.ev[e.n]=(L[e.n]||[]).map(o=>o.s.id);
  S.man.on=true; invalidate();
}
function legKeys(k){ const m=k.match(/R(\d+)(\w)/); return m[2]==='X'?['E','B','M','L'].map(x=>m[1]+x):[0,1,2,3].map(()=>m[1]+'L'); }
function soRelay(k){ const q=S.legs&&S.legs[k]; if(!q) return null; const lk=legKeys(k);
  const legs=(q.ids||[]).map((id,i)=>{ const s=id&&soById(id); const own=q.lt&&q.lt[i]; const b=s&&bestTime(s,lk[i]); return {id,s,t:own!=null&&s?own:(b?b.t:null),own:own!=null}; });
  const full=legs.length===4&&legs.every(x=>x.t!=null); const sum=full?legs.reduce((a,x)=>a+x.t,0):null;
  return {legs,sum,est:sum!=null?Math.round((sum-3*LANZADA)*100)/100:null,use:!!q.use}; }
function proposeRelay(k){ const lk=legKeys(k); const pool=soAll().filter(s=>!s.off);
  const top=lk.map(key=>pool.map(s=>({s,b:bestTime(s,key)})).filter(x=>x.b).sort((a,b)=>a.b.t-b.b.t).slice(0,5));
  if(lk[0]===lk[1]) return top[0].slice(0,4).map(x=>x.s.id);
  let best=null, bt=1e9;
  for(const a of top[0]) for(const b of top[1]) for(const c of top[2]) for(const d of top[3]){
    const ids=[a.s.id,b.s.id,c.s.id,d.s.id]; if(new Set(ids).size<4) continue; const t=a.b.t+b.b.t+c.b.t+d.b.t; if(t<bt){ bt=t; best=ids; } }
  return best||[]; }
function soCheck(L){
  const w=[], cnt={}, ses={}; const name=id=>{ const s=soById(+id); return s?s.n:'?'; };
  for(const e of PROGRAM.filter(e=>e.g==='M'&&!e.relay)){ const arr=L[e.n]||[];
    if(arr.length<2) w.push({lvl:'info',t:`${evName(e.k)}: ${arr.length?'solo 1 nadador':'nadie inscrito'}`});
    for(const o of arr){ cnt[o.s.id]=(cnt[o.s.id]||0)+1; const k=o.s.id+'|'+e.s; ses[k]=(ses[k]||0)+1; if(o.t==null) w.push({lvl:'info',t:`${o.s.n} no tiene marca en ${evName(e.k)}`}); } }
  for(const id in cnt) if(cnt[id]>MAX_IND) w.push({lvl:'err',t:`${name(id)} tiene ${cnt[id]} pruebas individuales (máximo 4)`});
  for(const k in ses) if(ses[k]>MAX_SESSION){ const [id,se]=k.split('|'); w.push({lvl:'err',t:`${name(id)} nada ${ses[k]} pruebas en la sesión ${se} (máximo 2)`}); }
  const n=(L._roster||new Set()).size; if(n>MAX_ROSTER) w.push({lvl:'err',t:`Hay ${n} nadadores en el equipo (máximo 14, contando relevos)`});
  for(const k in S.legs){ const ids=(S.legs[k].ids||[]).filter(Boolean); if(new Set(ids).size<ids.length) w.push({lvl:'err',t:`${evName(k)}: un nadador está repetido`}); }
  return {w,cnt,ses};
}
function soLoad(id,e){ // cuántas pruebas lleva un nadador (total y en esa sesión) en la alineación actual
  const L=simulate('M').lineup[MINE]||{}; let tot=0, se=0;
  for(const x of PROGRAM.filter(x=>x.g==='M'&&!x.relay)) if((L[x.n]||[]).some(o=>o.s.id===id)){ tot++; if(e&&x.s===e.s) se++; }
  return {tot,se}; }
function vSO(sub,arg){
  const R=simulate('M'), L=R.lineup[MINE]||{}; const k=CLUB[MINE]; const pos=R.order.indexOf(MINE)+1;
  const chk=soCheck(L); const errs=chk.w.filter(x=>x.lvl==='err');
  if(sub==='prueba') return vSOPrueba(+arg,R,L);
  let h=`<div class="teamhead">${badge(MINE,64)}<div><div class="mut small" style="font-weight:600;text-transform:uppercase;letter-spacing:.04em">Modo entrenador</div><h1 style="margin:0">${esc(k.s)}</h1>
   <div class="chips" style="margin-top:6px"><span class="chip acc">${pos}º previsto</span><span class="chip">${pfmt(R.tot[MINE])} puntos</span><span class="chip ${(L._roster||new Set()).size>14?'bad':''}">${(L._roster||new Set()).size}/14 nadadores</span></div></div></div>`;
  const tabs=[['','Alineación'],['relevos','Relevos'],['plantilla','Plantilla'],['calc','Tiempos']];
  h+=`<div class="seg wide">${tabs.map(([r,t])=>`<a href="#/so${r?'/'+r:''}" class="${(sub||'')===r?'on':''}">${t}</a>`).join('')}</div><div class="spacer"></div>`;
  if(errs.length) h+=`<div class="card pad warn"><b>⚠️ Fuera de reglamento</b><ul>${errs.map(x=>`<li>${esc(x.t)}</li>`).join('')}</ul></div>`;
  if(sub==='relevos') h+=soRelevos(R);
  else if(sub==='plantilla') h+=soPlantilla(R,L);
  else if(sub==='calc') h+=soCalc();
  else h+=soAlineacion(R,L,chk);
  return h;
}
function soRecommend(){
  const evs=PROGRAM.filter(e=>e.g==='M'); const next=evs.find(e=>!(S.ev[e.n]||{}).done); if(!next) return null; const ns=next.s;
  const L=simulate('M').lineup[MINE]||{}; const fixed={};
  for(const e of evs) if(!e.relay&&(e.s<ns||(S.ev[e.n]||{}).done)) fixed[e.n]=(L[e.n]||[]).map(o=>o.s.id);
  const was=S.man.on; S.man.on=false; const RL=buildLineup('M',fixed)[MINE]; S.man.on=was;
  const out={s:ns,ev:{}}; for(const e of evs) if(!e.relay&&e.s===ns&&!(S.ev[e.n]||{}).done) out.ev[e.n]=(RL[e.n]||[]).map(o=>o.s.id);
  return out; }
function soAlineacion(R,L,chk){
  const ptsI=PROGRAM.filter(e=>e.g==='M'&&!e.relay).reduce((a,e)=>a+R.events[e.n].filter(x=>x.c===MINE).reduce((b,x)=>b+x.pts,0),0);
  let h=`<label class="toggle"><input type="checkbox" id="manTg" ${S.man.on?'checked':''}><div><b>Alineación manual</b><div class="note">${S.man.on?'Tú eliges quién nada cada prueba. Toca una prueba para cambiar nadadores.':'Ahora la app elige la mejor alineación sola. Actívalo (o toca cualquier prueba) para elegir tú.'}</div></div></label>`;
  if(S.man.on) h+=`<div class="row"><button class="btn ghost sm" id="manReset">Volver a la alineación automática</button></div>`;
  const doneN=PROGRAM.filter(e=>e.g==='M'&&(S.ev[e.n]||{}).done).length; const rec=soRecommend();
  if(rec){ const diff=Object.keys(rec.ev).filter(n=>{ const a=(L[n]||[]).map(o=>o.s.id).sort().join(), b=rec.ev[n].slice().sort().join(); return a!==b; });
    h+=`<div class="card pad"><h3 style="margin:0 0 4px">${doneN?'💡 Recomendado para la siguiente sesión':'💡 Alineación recomendada'} · sesión ${rec.s}</h3><div class="note" style="margin-top:0">${doneN?'Calculada con los resultados reales de lo ya nadado y las pruebas que le quedan a cada nadador.':'La mejor combinación con las marcas que hay ahora.'}</div><div class="list">`+
      Object.keys(rec.ev).map(n=>{ const e=PROGRAM.find(x=>x.n===+n); return `<div class="li slim"><div class="grow"><b style="font-size:14px">${evName(e.k)}</b><span class="mut small">${rec.ev[n].map(id=>{ const s=soById(id); return s?esc(s.n):''; }).join(' · ')||'Nadie con marca'}</span></div>${diff.includes(n)?'<span class="chip acc">Cambio</span>':'<span class="mut small">✓</span>'}</div>`; }).join('')+
      `</div>${diff.length?`<button class="btn sm" id="recApply">Aplicar a mi alineación</button>`:'<div class="note">Tu alineación ya es la recomendada.</div>'}</div>`; }
  h+=`<h2>Pruebas individuales · ${pfmt(ptsI)} pts</h2>`;
  let ses=0;
  for(const e of PROGRAM.filter(e=>e.g==='M'&&!e.relay)){
    if(e.s!==ses){ ses=e.s; h+=`<div class="sess">Sesión ${ses} · ${SESSIONS[ses]}</div>`; }
    const ents=R.events[e.n].filter(x=>x.c===MINE); const pts=ents.reduce((a,x)=>a+x.pts,0);
    h+=`<a class="card soev" href="#/so/prueba/${e.n}"><div class="row" style="justify-content:space-between;margin:0"><b>${e.n}. ${evName(e.k)}</b><span class="chip acc">+${pfmt(pts)}</span></div>`;
    for(let i=0;i<2;i++){ const x=ents[i];
      h+= x?`<div class="li slim">${ava(x.s,30)}<div class="grow"><b style="font-size:14.5px">${esc(x.s.n)}</b>${x.est?'<span class="est">ESTIMADO</span>':''}</div><span class="t">${fmt(x.t)}</span><span class="mut small" style="width:34px;text-align:right">${x.place?x.place+'º':'—'}</span></div>`
          :`<div class="li slim empty-slot"><span class="ava" style="width:30px;height:30px">+</span><div class="grow mut">Hueco libre</div></div>`; }
    h+=`</a>`;
  }
  const info=chk.w.filter(x=>x.lvl==='info'); if(info.length) h+=`<div class="note">${info.map(x=>esc(x.t)).join(' · ')}</div>`;
  setTimeout(()=>{
    $('#manTg').onchange=ev=>{ if(ev.target.checked){ manualOn(); toast('Alineación manual: ahora decides tú'); } else { S.man.on=false; invalidate(); toast('Alineación automática'); } render(); };
    const ra=$('#recApply'); if(ra) ra.onclick=()=>{ manualOn(); for(const n in rec.ev) S.man.ev[n]=rec.ev[n].slice(); invalidate(); render(); toast('Recomendación aplicada'); };
    const r=$('#manReset'); if(r) r.onclick=()=>{ S.man.on=false; S.man.ev={}; invalidate(); render(); toast('Alineación automática restaurada'); };
  });
  return h;
}
function vSOPrueba(n,R,L){
  const e=PROGRAM.find(x=>x.n===n&&x.g==='M'&&!x.relay); if(!e) return vSO();
  const cur=(L[n]||[]).map(o=>o.s.id);
  const others=R.events[n].filter(x=>x.c!==MINE&&typeof x.t==='number').map(x=>x.t);
  const placeFor=t=>t==null?null:others.filter(o=>o<t).length+1;
  const cands=soAll().filter(s=>!s.off).map(s=>({s,b:bestTime(s,e.k),ld:soLoad(s.id,e)})).sort((a,b)=>(a.b?a.b.t:1e9)-(b.b?b.b.t:1e9));
  let h=`<a class="back" href="#/so">‹ Alineación</a><h1>${evName(e.k)}</h1><p class="mut small" style="margin-top:0">Prueba ${n} · Sesión ${e.s} (${SESSIONS[e.s]}) · 2 nadadores por club</p>`;
  h+=`<h2>Nadan por el Santa Olaya</h2><div class="card"><div class="list">`;
  for(let i=0;i<2;i++){ const id=cur[i]; const x=id&&R.events[n].find(z=>z.s&&z.s.id===id);
    h+= x?`<div class="li">${ava(x.s,38)}<div class="grow"><b>${esc(x.s.n)}</b><span class="mut small">${x.place?x.place+'º previsto · '+pfmt(x.pts)+' pts':'Sin marca'}</span></div><input class="timein objin ${x.s&&S.obj[x.s.id]&&S.obj[x.s.id][e.k]!=null?'ov':''}" inputmode="decimal" data-id="${id}" value="${x.t!=null&&x.t!=='DQ'?fmt(x.t):''}" placeholder="—"><button class="btn red sm" data-out="${id}">Quitar</button></div>`
       :`<div class="li"><span class="ava" style="width:38px;height:38px">+</span><div class="grow mut">Hueco libre: mete a alguien de la lista</div></div>`; }
  h+=`</div></div><h2>Plantilla</h2><div class="card"><div class="list">`;
  for(const c of cands){ if(cur.includes(c.s.id)) continue; const pl=placeFor(c.b&&c.b.t);
    const over=c.ld.tot>=MAX_IND||c.ld.se>=MAX_SESSION;
    h+=`<div class="li">${ava(c.s,34)}<div class="grow"><b>${esc(c.s.n)}</b><span class="mut small" style="${over?'color:var(--red)':''}">${c.ld.tot}/4 · sesión ${c.ld.se}/2</span>${c.b&&c.b.est?' <span class="est">ESTIMADO</span>':''}</div>
     <input class="timein objin ${c.b&&c.b.obj?'ov':''}" inputmode="decimal" data-id="${c.s.id}" value="${c.b?fmt(c.b.t):''}" placeholder="—"><span class="mut small" style="width:30px;text-align:right">${pl?pl+'º':''}</span><button class="btn sm ${over?'ghost':''}" data-in="${c.s.id}">Meter</button></div>`; }
  h+=`</div></div><p class="note">Escribe en cada nadador la marca que crees que puede hacer (se ve en dorado). Si no escribes nada se usa su mejor marca real; sin marca no puntúa. El puesto es el que sacaría contra los rivales. Puedes meter a alguien aunque se pase del máximo: la app te avisará arriba en rojo. Para cambiar una marca toca el nadador en Plantilla.</p>`;
  setTimeout(()=>{
    document.querySelectorAll('.objin').forEach(inp=>inp.onchange=()=>{ const id=+inp.dataset.id; const v=inp.value.trim()?parseT(inp.value):null; if(inp.value.trim()&&typeof v!=='number'){ toast('Tiempo no válido'); return; }
      const o=S.obj[id]=S.obj[id]||{}; if(v==null) delete o[e.k]; else o[e.k]=v; invalidate(); render(); toast('Marca prevista guardada'); });
    document.querySelectorAll('[data-out]').forEach(b=>b.onclick=()=>{ manualOn(); S.man.ev[n]=(S.man.ev[n]||[]).filter(x=>x!==+b.dataset.out); invalidate(); render(); });
    document.querySelectorAll('[data-in]').forEach(b=>b.onclick=()=>{ manualOn(); const a=S.man.ev[n]=S.man.ev[n]||[]; if(a.length>=2){ toast('Ya hay 2: quita primero a uno'); return; } a.push(+b.dataset.in); invalidate(); render(); toast('Metido en '+evName(e.k)); });
  });
  return h;
}
function soRelevos(R){
  const pool=soAll().filter(s=>!s.off).sort((a,b)=>a.n.localeCompare(b.n));
  let h=`<p class="note" style="margin-top:0">Elige los 4 relevistas y escribe al lado lo que crees que hará cada uno en su posta (si no, se usa su marca real). La app suma las postas y resta ${LANZADA.toString().replace('.',',')} s por cada una de las 3 salidas lanzadas. Si activas “Usar en la simulación”, ese tiempo es el que cuenta para la clasificación.</p>`;
  for(const e of PROGRAM.filter(e=>e.g==='M'&&e.relay)){
    const q=soRelay(e.k)||{legs:[],sum:null,est:null,use:false}; const lk=legKeys(e.k);
    const x=R.events[e.n].find(z=>z.c===MINE); const b25=REL2025['M|'+e.k+'|'+MINE];
    h+=`<div class="card pad"><div class="row" style="justify-content:space-between;margin:0 0 6px"><h3 style="margin:0">${e.n}. ${evName(e.k)}</h3><span class="chip acc">${x?x.place+'º · +'+pfmt(x.pts):'Sin tiempo'}</span></div>`;
    for(let i=0;i<4;i++){ const leg=q.legs[i]||{}; 
      h+=`<div class="leg"><span class="lg">${lk[0]===lk[1]?(i+1)+'º':STROKES[lk[i].replace(/\d+/,'')]}</span><select data-k="${e.k}" data-i="${i}"><option value="">Elegir…</option>${pool.map(s=>{ const bt=bestTime(s,lk[i]); return `<option value="${s.id}" ${leg.id===s.id?'selected':''}>${esc(s.n)} · ${bt?fmt(bt.t):'sin marca'}</option>`; }).join('')}</select><input class="timein lgt ${leg.own?'ov':''}" inputmode="decimal" data-k="${e.k}" data-i="${i}" value="${leg.t!=null?fmt(leg.t):''}" placeholder="—"></div>`; }
    h+=`<div class="relsum"><div><span class="mut small">Suma</span><b>${fmt(q.sum)}</b></div><div><span class="mut small">Con salidas lanzadas</span><b style="color:var(--acc)">${fmt(q.est)}</b></div><div><span class="mut small">Copa 2025</span><b>${b25?fmt(b25):'—'}</b></div></div>
      <div class="row"><button class="btn ghost sm" data-prop="${e.k}">Proponer los 4 más rápidos</button><label class="mini"><input type="checkbox" data-use="${e.k}" ${q.use?'checked':''} ${q.est==null?'disabled':''}> Usar en la simulación</label></div></div>`;
  }
  setTimeout(()=>{
    const get=k=>S.legs[k]=S.legs[k]||{ids:[null,null,null,null],use:false};
    document.querySelectorAll('.leg select').forEach(sel=>sel.onchange=()=>{ const q=get(sel.dataset.k); q.ids[+sel.dataset.i]=sel.value?+sel.value:null; invalidate(); render(); });
    document.querySelectorAll('[data-prop]').forEach(b=>b.onclick=()=>{ const q=get(b.dataset.prop); q.ids=proposeRelay(b.dataset.prop); if(q.ids.length===4) q.use=true; invalidate(); render(); toast('Relevo propuesto'); });
    document.querySelectorAll('.lgt').forEach(inp=>inp.onchange=()=>{ const q=get(inp.dataset.k); q.lt=q.lt||[]; const v=inp.value.trim()?parseT(inp.value):null; if(inp.value.trim()&&typeof v!=='number'){ toast('Tiempo no válido'); return; } q.lt[+inp.dataset.i]=v; invalidate(); render(); });
    document.querySelectorAll('[data-use]').forEach(c=>c.onchange=()=>{ get(c.dataset.use).use=c.checked; invalidate(); render(); });
  });
  return h;
}
function soPlantilla(R,L){
  const all=soAll().sort((a,b)=>a.off-b.off||a.n.localeCompare(b.n)); const roster=L._roster||new Set();
  const evOf={}; for(const e of PROGRAM.filter(e=>e.g==='M'&&!e.relay)) for(const o of (L[e.n]||[])) (evOf[o.s.id]=evOf[o.s.id]||[]).push(e);
  const relOf={}; for(const k in S.legs) (S.legs[k].ids||[]).forEach(id=>{ if(id) (relOf[id]=relOf[id]||[]).push(k); });
  let h=`<div class="row"><a class="btn sm" href="#/fichar/${MINE}">+ Meter nadador</a><span class="mut small">${all.filter(s=>!s.off).length} disponibles · ${roster.size} en la alineación</span></div><div class="card"><div class="list">`;
  for(const s of all){ const evs=evOf[s.id]||[], rl=relOf[s.id]||[];
    h+=`<div class="li">${ava(s,40)}<a class="grow" href="#/nadador/${s.id}" style="color:inherit;text-decoration:none"><b>${esc(s.n)}${s.y?` <span class="mut small">${s.y}</span>`:''}${s.moved?' <span class="chip acc">Fichaje</span>':''}${s.added?' <span class="chip acc">Nuevo</span>':''}</b>
     <div class="chips" style="margin-top:4px">${evs.map(e=>`<span class="chip">${evName(e.k)}</span>`).join('')}${rl.map(k=>`<span class="chip">${evName(k)}</span>`).join('')}${!evs.length&&!rl.length?`<span class="mut small">${s.off?'Quitado del equipo':'Sin pruebas'}</span>`:''}</div></a>
     <label class="toggle bare" title="Disponible"><input type="checkbox" data-av="${s.id}" ${s.off?'':'checked'}></label></div>`; }
  h+=`</div></div><p class="note">El interruptor quita o mete a un nadador en el equipo (lesión, no viaja…). Toca su nombre para cambiar sus marcas, borrarlo o cambiarlo de club. Con “Meter nadador” puedes añadir a alguien nuevo con sus tiempos o fichar a uno de otro club.</p>`;
  setTimeout(()=>{ document.querySelectorAll('[data-av]').forEach(c=>c.onchange=()=>{ const id=+c.dataset.av; S.sw[id]=S.sw[id]||{}; S.sw[id].off=!c.checked; invalidate(); render(); toast(c.checked?'Vuelve al equipo':'Quitado del equipo'); }); });
  return h;
}
function soCalc(){
  const rows=S.calc&&S.calc.length?S.calc:['','','',''];
  let h=`<div class="card pad"><h3>Suma de tiempos</h3><p class="note" style="margin-top:0">Escribe parciales o tiempos (por ejemplo 27.85 o 1:02.30) y la app los suma.</p><div id="calcRows">`;
  rows.forEach((v,i)=>h+=`<div class="leg"><span class="lg">${i+1}</span><input type="text" class="cin" inputmode="decimal" value="${esc(v)}" placeholder="0.00"></div>`);
  h+=`</div><div class="row"><button class="btn ghost sm" id="cAdd">+ Fila</button><button class="btn ghost sm" id="cClr">Borrar</button></div>
   <div class="relsum"><div><span class="mut small">Total</span><b id="cTot">—</b></div><div><span class="mut small">Media</span><b id="cAvg">—</b></div><div><span class="mut small">− lanzadas</span><b id="cLz" style="color:var(--acc)">—</b></div></div>
   <p class="note">“− lanzadas” resta ${LANZADA.toString().replace('.',',')} s a todos menos al primero, como en un relevo.</p></div>
  <div class="card pad"><h3>Diferencia entre dos tiempos</h3><div class="row"><input type="text" id="dA" inputmode="decimal" placeholder="Tiempo A" style="flex:1"><input type="text" id="dB" inputmode="decimal" placeholder="Tiempo B" style="flex:1"></div><div class="relsum"><div><span class="mut small">Diferencia</span><b id="dD">—</b></div><div><span class="mut small">En %</span><b id="dP">—</b></div></div></div>`;
  setTimeout(()=>{
    const calc=()=>{ const vals=[...document.querySelectorAll('.cin')].map(i=>i.value); S.calc=vals; save();
      const ts=vals.map(v=>parseT(v)).filter(t=>typeof t==='number');
      const tot=ts.reduce((a,b)=>a+b,0); $('#cTot').textContent=ts.length?fmt(tot):'—'; $('#cAvg').textContent=ts.length?fmt(tot/ts.length):'—';
      $('#cLz').textContent=ts.length>1?fmt(tot-LANZADA*(ts.length-1)):'—'; };
    document.querySelectorAll('.cin').forEach(i=>i.oninput=calc); calc();
    $('#cAdd').onclick=()=>{ S.calc=[...document.querySelectorAll('.cin')].map(i=>i.value).concat(['']); save(); render(); };
    $('#cClr').onclick=()=>{ S.calc=['','','','']; save(); render(); };
    const dif=()=>{ const a=parseT($('#dA').value), b=parseT($('#dB').value); if(typeof a!=='number'||typeof b!=='number'){ $('#dD').textContent='—'; $('#dP').textContent='—'; return; }
      const d=b-a; $('#dD').textContent=(d>0?'+':d<0?'−':'')+fmt(Math.abs(d)); $('#dP').textContent=(d>0?'+':'')+(d/a*100).toFixed(2).replace('.',',')+'%'; };
    $('#dA').oninput=dif; $('#dB').oninput=dif;
  });
  return h;
}

/* ---------- Navegación ---------- */
function render(){
  const parts=location.hash.replace(/^#\/?/,'').split('/'); const r=parts[0]||'';
  let h, tab='home';
  switch(r){
    case '': h=vHome(); break;
    case 'pruebas': h=vPruebas(); tab='pruebas'; break;
    case 'prueba': h=vPrueba(parts[1]); tab='pruebas'; break;
    case 'equipos': h=vEquipos(); tab='equipos'; break;
    case 'equipo': h=vEquipo(parts[1]); tab='equipos'; break;
    case 'nadador': h=vNadador(parts[1]); tab='equipos'; break;
    case 'fichar': h=vFichar(parts[1]); tab='equipos'; break;
    case 'prob': h=vProb(); tab='home'; break;
    case 'so': h=vSO(parts[1],parts[2]); tab='so'; break;
    case 'mas': h=vMas(); tab='mas'; break;
    case '2025': h=v2025(parts[1]); tab='mas'; break;
    case 'clubes': h=vClubes(); tab='mas'; break;
    case 'reglamento': h=vReglamento(); tab='mas'; break;
    case 'instalar': h=vInstalar(); tab='mas'; break;
    case 'reset': h=vReset(); tab='mas'; break;
    default: h=vHome();
  }
  app.innerHTML=h;
  document.querySelectorAll('#tabs a').forEach(a=>a.classList.toggle('on',a.dataset.t===tab));
  const ib=$('#inst'); if(ib) ib.onclick=()=>{ deferred.prompt(); deferred=null; };
}
function syncSeg(){ document.querySelectorAll('#genderSeg button').forEach(b=>b.classList.toggle('on',b.dataset.g===S.g)); }
let lastHash=location.hash;
window.addEventListener('hashchange',()=>{ render(); if(location.hash!==lastHash) window.scrollTo(0,0); lastHash=location.hash; });
let deferred=null; window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferred=e; });
syncSeg(); render();
if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
window.__copa={simulate,montecarlo,buildLineup,S:()=>S};
})();
