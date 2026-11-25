/* Cain OS interface · Kairn Labs
   Runs inside the Android app (window.CainNative is the bridge to the device) and, for previewing
   the design, in a normal browser (demo.js stands in for the device). */
'use strict';
const $=s=>document.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const stage=$('#stage'), TAU=Math.PI*2;
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

/* ── the device bridge ── */
const NV=window.CainNative||null, DEMO=window.CainDemo||{};
const N={
  native:!!NV,
  call(name,...a){ if(NV){ try{ return NV[name](...a); }catch(e){ return undefined; } } try{ return DEMO[name]?DEMO[name](...a):undefined; }catch(e){ return undefined; } },
  json(name,...a){ try{ const r=N.call(name,...a); return r?JSON.parse(r):null; }catch(e){ return null; } }
};
const HANDLERS={};
window.CainOS={
  on(n,f){ (HANDLERS[n]=HANDLERS[n]||[]).push(f); },
  emit(n,d){ (HANDLERS[n]||[]).forEach(f=>{ try{ f(d); }catch(e){ console.error(e); } }); },
  key(k){ try{ onKey(k); }catch(e){ console.error(e); } }
};
const INFO=N.json('info')||{};
if(N.native) document.body.classList.add('native');

let SC=.4;
function fit(){
  document.body.classList.toggle('full',innerWidth>=1900&&innerHeight>=1040);
  const r=$('#fit').getBoundingClientRect(); SC=Math.min(r.width/1920,r.height/1080)||.4; stage.style.setProperty('--s',SC);
}
fit();
/* art is painted at the screen's real pixel size, capped at 4K; moving layers are capped at 1080p to stay light */
const calcRes=()=>clamp(SC*(devicePixelRatio||1),1,INFO.lowRam?1:2);
let RES=calcRes();

/* ── saved settings (kept on this device) ── */
const LS={get(k,d){try{const v=localStorage.getItem(k); return v?JSON.parse(v):d}catch(e){return d}}, set(k,v){try{localStorage.setItem(k,JSON.stringify(v)); return true}catch(e){return false}}};
const PREF=LS.get('cain.prefs',{})||{};
const savePref=()=>LS.set('cain.prefs',PREF);

/* ── helpers ── */
const hx=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const rgba=(h,a)=>{const[r,g,b]=hx(h);return `rgba(${r},${g},${b},${a})`};
const mix=(a,b,t)=>{const A=hx(a),B=hx(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')};
const hexOk=c=>/^#[0-9a-f]{6}$/i.test(c||'')?c:'#1d1a17';
function rnd(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function el(html){const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstChild;}
/* every piece of outside text (app names, channel names, song titles) goes through esc() before it touches the page */
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cssUrl=u=>'url("'+String(u).replace(/["\\\n\r()]/g,c=>encodeURIComponent(c))+'")';
const fmtS=s=>{s=Math.max(0,Math.round(s)); const h=s/3600|0,m=(s%3600)/60|0; return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(s%60).padStart(2,'0')};
const fmtB=b=>b>=1e9?(b/1e9).toFixed(b>=1e10?0:1)+' GB':b>=1e6?(b/1e6).toFixed(0)+' MB':Math.max(1,Math.round(b/1e3))+' KB';
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;

/* ══ wallpaper scenes (procedural) ══════════════════════ */
const SCN={
 lowtide:{kind:'coast',seed:11,hz:.63,sky:['#160d26','#46204a','#a8446a','#ee8a5e','#f8c27c'],sun:[.7,.6,1.1,'#ffe0b0'],sea:['#6b3350','#120a16'],land:'#0d080e',fx:.62},
 northfall:{kind:'forest',seed:5,hz:.58,sky:['#08110f','#1b3430','#6c9488','#c9d4c2'],sun:[.62,.34,.8,'#eef2e2'],far:'#7d9b90',near:'#040807',fog:'#a9bdb2',fx:.5},
 staticbloom:{kind:'city',seed:7,hz:.7,sky:['#05030c','#1a0a2e','#47154f','#93305e'],glow:'#ff6a7a',far:'#2a1236',near:'#0b0610',win:['#ffb36b','#ff7aa8','#9fd8ff'],water:['#1c0b22','#050308'],fx:.5},
 meridian:{kind:'ridge',seed:4,hz:.5,sky:['#060b18','#172a4b','#5a6f96','#d9ab8c'],sun:[.74,.2,.55,'#f1ece0'],far:'#7d84a6',near:'#06080f',fog:'#9aa2bd',fx:.6},
 emberline:{kind:'ridge',seed:13,hz:.52,sky:['#100605','#3b120a','#a23a16','#f2853f'],sun:[.5,.55,1.6,'#ffd29a'],far:'#a8502a',near:'#0a0403',fog:'#e07a40',fx:.5},
 papermoon:{kind:'city',seed:2,hz:.68,sky:['#02050a','#081a26','#16394a','#2f7072'],glow:'#7fe0d0',far:'#0f2a33',near:'#03080b',win:['#ffe1a3','#8ff0e0','#ffffff'],water:['#0a1d24','#020507'],fx:.5},
 sandyear:{kind:'dunes',seed:21,hz:.56,sky:['#1f110a','#6e3418','#cf743a','#f4c98c'],sun:[.3,.5,2.2,'#fff1cf'],far:'#c27a45',near:'#2a140a',fx:.35},
 saltmarsh:{kind:'dunes',seed:44,hz:.6,sky:['#0e1210','#33402f','#8d9a6c','#e6dcae'],sun:[.7,.52,1.4,'#fff6d8'],far:'#8c9466',near:'#11150e',fx:.6},
 undertow:{kind:'coast',seed:31,hz:.6,sky:['#03060e','#0b1932','#27456c','#7a8fae'],sun:[.3,.3,.45,'#e8eef8'],sea:['#1d3150','#03060c'],land:'#020409',fx:.3},
};
const SCENES=[['lowtide','Coast at dusk'],['northfall','Pine forest'],['staticbloom','City in the rain'],['meridian','Mountain night'],['emberline','Ember hills'],['papermoon','Harbor city'],['sandyear','Desert'],['saltmarsh','Marsh'],['undertow','Moonlit bay']];

/* ── procedural scenes: drawn in a 1280×720 space, scaled to any resolution ── */
function ridgePath(c,w,h,r,base,amp,col,det=1){
  const p=[r()*9,r()*9,r()*9,r()*9]; c.beginPath(); c.moveTo(0,h);
  for(let i=0;i<=480;i++){const t=i/480;
    c.lineTo(t*w,base-amp*(.55*Math.sin(t*3.1+p[0])+.3*Math.sin(t*7.7+p[1])+.12*det*Math.sin(t*19+p[2])+.05*det*Math.sin(t*47+p[3])));}
  c.lineTo(w,h); c.closePath(); c.fillStyle=col; c.fill();
}
function fogBand(c,w,y0,y1,col,a){const g=c.createLinearGradient(0,y0,0,y1); g.addColorStop(0,rgba(col,0)); g.addColorStop(1,rgba(col,a)); c.fillStyle=g; c.fillRect(0,y0,w,y1-y0);}
const PAINT={
 coast(c,w,h,r,A,H){
  const g=c.createLinearGradient(0,H,0,h); g.addColorStop(0,A.sea[0]); g.addColorStop(1,A.sea[1]); c.fillStyle=g; c.fillRect(0,H,w,h-H);
  const [sx,,,col]=A.sun;
  for(let y=H;y<h;y+=2.4){const k=(y-H)/(h-H),wd=w*(.015+k*.22)*(.3+r()*.7),x=sx*w+(r()-.5)*k*w*.1;
    c.fillStyle=rgba(col,(1-k)*.55*r()+.03); c.fillRect(x-wd/2,y,wd,1.3);}
  for(let i=0;i<280;i++){const y=H+r()*(h-H),k=(y-H)/(h-H); c.fillStyle=`rgba(255,255,255,${.05*r()})`; c.fillRect(r()*w,y,w*(.01+k*.05),1);}
  fogBand(c,w,H-h*.05,H+1,A.sky[A.sky.length-1],.3);
  c.save(); c.beginPath(); c.rect(w*.76,0,w*.24,H+1); c.clip(); ridgePath(c,w,H+1,r,H+2,h*.03,mix(A.land,A.sky[2],.5)); c.restore();
  c.beginPath(); c.moveTo(0,h); const p=[r()*9,r()*9];
  for(let i=0;i<=300;i++){const t=i/300;
    c.lineTo(t*w*.48,H-h*.25*Math.pow(1-t,1.4)-h*.02*Math.sin(t*14+p[0])*(1-t)-h*.008*Math.sin(t*43+p[1]));}
  c.lineTo(w*.5,H+2); c.quadraticCurveTo(w*.42,h*.86,w*.3,h); c.closePath(); c.fillStyle=A.land; c.fill();
 },
 ridge(c,w,h,r,A,H){
  const n=5; for(let i=0;i<n;i++){const t=i/(n-1),b=H+t*h*.36-h*.04;
    ridgePath(c,w,h,r,b,h*(.16-t*.06),mix(A.far,A.near,Math.pow(t,.8)),1+t);
    if(i<n-1) fogBand(c,w,b-h*.02,b+h*.12,A.fog,.2*(1-t));}
 },
 city(c,w,h,r,A,H,k){
  const q=c.createRadialGradient(w*.5,H,0,w*.5,H,w*.6); q.addColorStop(0,rgba(A.glow,.35)); q.addColorStop(1,rgba(A.glow,0)); c.fillStyle=q; c.fillRect(0,0,w,H);
  const rec=A._wins?null:(A._wins=[]);
  [[A.far,.6,.05],[A.near,1,.14]].forEach(([col,sc,lit],L)=>{let x=-10;
    while(x<w){const bw=w*(.018+r()*.04),bh=h*(.06+Math.pow(r(),1.6)*.36)*sc*(1-Math.abs(x/w-.5)*.6);
      c.fillStyle=col; c.fillRect(x,H-bh,bw,bh+1); if(r()<.25) c.fillRect(x+bw*.45,H-bh-h*.04,1.5,h*.04);
      for(let yy=H-bh+6;yy<H-4;yy+=7) for(let xx=x+4;xx<x+bw-4;xx+=6) if(r()<lit){
        const ci=(r()*A.win.length)|0; c.fillStyle=rgba(A.win[ci],.35+r()*.6); c.fillRect(xx,yy,2.6,3.4); if(rec&&L) rec.push([xx,yy,ci]);}
      x+=bw+(L?0:w*.004);}});
  const g=c.createLinearGradient(0,H,0,h); g.addColorStop(0,A.water[0]); g.addColorStop(1,A.water[1]); c.fillStyle=g; c.fillRect(0,H,w,h-H);
  const rh=h-H; c.save(); c.globalAlpha=.3; c.translate(0,2*H); c.scale(1,-1); c.drawImage(c.canvas,0,(H-rh)*k,w*k,rh*k,0,H-rh,w,rh); c.restore();
  for(let y=H;y<h;y+=3){c.fillStyle=`rgba(0,0,0,${.3*r()})`; c.fillRect(0,y,w,1.3);}
 },
 dunes(c,w,h,r,A,H){
  fogBand(c,w,H-h*.08,H+h*.02,A.sky[A.sky.length-1],.4);
  const n=6; for(let i=0;i<n;i++){const t=i/(n-1),base=H+t*(h-H)*.95+h*.02,amp=h*(.05+t*.05),p=[r()*9,r()*9],col=mix(A.far,A.near,Math.pow(t,.7)),pts=[];
    c.beginPath(); c.moveTo(0,h);
    for(let j=0;j<=320;j++){const u=j/320,x=u*w,y=base-amp*(.65*Math.sin(u*(2+t*1.5)+p[0])+.35*Math.sin(u*(5.3+t*2)+p[1])); pts.push([x,y]); c.lineTo(x,y);}
    c.lineTo(w,h); c.closePath();
    const g=c.createLinearGradient(0,base-amp,0,base+amp*1.6); g.addColorStop(0,mix(col,A.sun[3],.25)); g.addColorStop(1,col); c.fillStyle=g; c.fill();
    c.beginPath(); pts.forEach(([x,y],k)=>k?c.lineTo(x,y):c.moveTo(x,y)); c.strokeStyle=rgba(A.sun[3],.18*(1-t)+.04); c.lineWidth=1.2; c.stroke();}
 },
 forest(c,w,h,r,A,H){
  ridgePath(c,w,h,r,H-h*.02,h*.1,mix(A.far,A.sky[3],.3),1); fogBand(c,w,H-h*.08,H+h*.06,A.fog,.35);
  for(let L=0;L<4;L++){const t=L/3,gy=H+t*h*.3+h*.03,col=mix(A.far,A.near,.25+t*.75); let x=-20; c.fillStyle=col; c.beginPath();
    while(x<w+20){const th=h*(.07+r()*.08)*(1+t*1.3),tw=th*.36;
      for(let k=0;k<4;k++){const yy=gy-th+k*th*.22,ww=tw*(.35+k*.22); c.moveTo(x,yy-th*.08); c.lineTo(x+ww,yy+th*.28); c.lineTo(x-ww,yy+th*.28); c.closePath();}
      c.rect(x-th*.03,gy-th*.1,th*.06,th*.12); x+=tw*(.7+r()*1.1);}
    c.fill(); c.fillRect(0,gy,w,h-gy); fogBand(c,w,gy-h*.1,gy+h*.04,A.fog,.22*(1-t));}
 }
};
function paint(cv,A){
  const c=cv.getContext('2d'),k=cv.width/1280,w=1280,h=720,r=rnd(A.seed),H=h*A.hz;
  c.setTransform(k,0,0,k,0,0); c.imageSmoothingQuality='high';
  const g=c.createLinearGradient(0,0,0,H); A.sky.forEach((s,i)=>g.addColorStop(i/(A.sky.length-1),s)); c.fillStyle=g; c.fillRect(0,0,w,h);
  if(A.kind==='ridge'||A.kind==='city'||A.seed===31) for(let i=0;i<160;i++){c.fillStyle=`rgba(255,255,255,${r()*r()*.6})`; c.fillRect(r()*w,r()*H*.6,1.3,1.3);}
  if(A.sun){const[sx,sy,sr,col]=A.sun,x=sx*w,y=sy*h,R=sr*h*.05,q=c.createRadialGradient(x,y,0,x,y,h*.75);
    q.addColorStop(0,rgba(col,.5)); q.addColorStop(.18,rgba(col,.16)); q.addColorStop(1,rgba(col,0)); c.fillStyle=q; c.fillRect(0,0,w,h);
    c.beginPath(); c.arc(x,y,R,0,TAU); c.fillStyle=col; c.fill();}
  PAINT[A.kind](c,w,h,r,A,H,k);
  const v=c.createRadialGradient(w*.5,h*.5,h*.3,w*.5,h*.5,h*1.05); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,.55)'); c.fillStyle=v; c.fillRect(0,0,w,h);
  c.setTransform(1,0,0,1,0,0);
}
function cover(dst,src,fx=.5,fy=.5){const c=dst.getContext('2d'),dw=dst.width,dh=dst.height,sw=src.width,sh=src.height,s=Math.max(dw/sw,dh/sh),cw=dw/s,ch=dh/s;
  c.imageSmoothingQuality='high'; c.drawImage(src,(sw-cw)*fx,(sh-ch)*fy,cw,ch,0,0,dw,dh);}

/* ══ live effects ══════════════════════════════════════ */
const SPR={};
function glow(col){ if(SPR['g'+col]) return SPR['g'+col];
  const s=document.createElement('canvas'); s.width=s.height=64; const x=s.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,rgba(col,1)); g.addColorStop(.22,rgba(col,.55)); g.addColorStop(1,rgba(col,0)); x.fillStyle=g; x.fillRect(0,0,64,64); return SPR['g'+col]=s; }
function puff(col,seed){ const key='p'+col+seed; if(SPR[key]) return SPR[key];
  const s=document.createElement('canvas'); s.width=512; s.height=160; const x=s.getContext('2d'),r=rnd(seed*13+1);
  for(let i=0;i<16;i++){const gx=50+r()*412,gy=62+r()*40,R=34+r()*56,g=x.createRadialGradient(gx,gy,0,gx,gy,R);
    g.addColorStop(0,rgba(col,.32)); g.addColorStop(1,rgba(col,0)); x.fillStyle=g; x.fillRect(gx-R,gy-R,R*2,R*2);}
  return SPR[key]=s; }
const LIVECFG={
  lowtide:{clouds:4,glints:90}, undertow:{stars:40,glints:50,fog:2},
  meridian:{stars:70,fog:3,shoot:1}, emberline:{embers:70,fog:2},
  staticbloom:{wins:70,rain:170,shimmer:44}, papermoon:{wins:90,shimmer:44,plane:1},
  sandyear:{dust:80,birds:2,clouds:2}, saltmarsh:{dust:36,birds:6,clouds:3},
  northfall:{flies:46,fog:3}
};
function mkLive(id){
  const A=SCN[id],C=LIVECFG[id]||{},r=rnd(A.seed*97+5),w=1280,h=720,H=h*A.hz,st={A,H,r,w,h};
  st.sun=A.sun?A.sun[3]:'#ffffff';
  if(C.clouds){st.cloudSpr=puff(mix(A.sky[A.sky.length-1],'#ffffff',.35),A.seed);
    st.clouds=Array.from({length:C.clouds},()=>({x:r()*w*1.3-.15*w,y:H*(.16+r()*.5),s:.9+r()*1.3,v:3+r()*5,a:.07+r()*.08}));}
  if(C.glints){const sx=A.sun[0]*w; st.glints=Array.from({length:C.glints},()=>{const k=Math.pow(r(),1.7);
    return {x:sx+(r()-.5)*(.03+k*.32)*w,y:H+2+k*(h-H)*.9,wd:w*(.004+k*.03)*(.4+r()*.6),ph:r()*TAU,sp:.8+r()*2.4,k};});}
  if(C.stars) st.stars=Array.from({length:C.stars},()=>({x:r()*w,y:r()*H*.55,ph:r()*TAU,sp:.6+r()*2,s:.7+r()*1.1}));
  if(C.shoot) st.shoot={next:3+r()*5,on:null};
  if(C.fog){st.fogSpr=puff(A.fog||A.sky[A.sky.length-1],A.seed+1);
    st.fog=Array.from({length:C.fog*2},(_,i)=>({x:r()*w*1.5-.25*w,y:H+(i%C.fog)*(h-H)*.24-h*.01,s:2.2+r()*1.6,v:4+r()*7,a:.09+r()*.07}));}
  if(C.embers) st.embers=Array.from({length:C.embers},()=>ember(st,true));
  if(C.wins&&A._wins&&A._wins.length) st.wins=Array.from({length:C.wins},()=>({W:A._wins[(r()*A._wins.length)|0],ph:r()*TAU,sp:.25+r()*1.4}));
  if(C.rain) st.rain=Array.from({length:C.rain},()=>({x:r()*w*1.1,y:r()*h,l:10+r()*18,v:420+r()*260}));
  if(C.shimmer) st.shim=Array.from({length:C.shimmer},()=>({x:w*(.12+r()*.76),y:H+3+Math.pow(r(),1.4)*(h-H)*.85,wd:8+r()*40,ph:r()*TAU,sp:.6+r()*1.8}));
  if(C.plane) st.plane={x:w+60,y:H*.25,v:26,wait:3};
  if(C.dust) st.dust=Array.from({length:C.dust},()=>({x:r()*w,y:H+r()*(h-H)*.9,v:14+r()*40,s:.6+r()*1.3,a:.15+r()*.4,ph:r()*TAU}));
  if(C.birds){const bx=r()*w,by=H*(.25+r()*.35); st.birds=Array.from({length:C.birds},(_,i)=>({x:bx-i*(14+r()*22),y:by+(r()-.5)*36,v:18+r()*6,ph:r()*TAU,s:2.6+r()*2.2}));}
  if(C.flies) st.flies=Array.from({length:C.flies},()=>({x:r()*w,y:H+r()*(h-H)*.85,a:r()*TAU,v:6+r()*10,ph:r()*TAU,sp:.6+r()*1.4,s:5+r()*7}));
  return st;
}
function ember(st,init){const r=st.r; return {x:r()*st.w,y:init?st.H+r()*(st.h-st.H):st.h+8,vy:-(14+r()*30),vx:4+r()*10,s:2+r()*4,ph:r()*TAU};}
function drawLive(c,st,dt,t){
  const {A,H,w,h,r}=st;
  if(st.clouds) for(const o of st.clouds){o.x+=o.v*dt; const hw=256*o.s; if(o.x-hw>w) o.x=-hw; c.globalAlpha=o.a; c.drawImage(st.cloudSpr,o.x-hw,o.y-80*o.s,512*o.s,160*o.s);}
  if(st.stars){c.fillStyle='#ffffff'; for(const s of st.stars){const q=.5+.5*Math.sin(t*s.sp+s.ph); c.globalAlpha=.12+.6*q*q; c.fillRect(s.x,s.y,s.s,s.s);}}
  if(st.shoot){const S=st.shoot; S.next-=dt;
    if(!S.on&&S.next<=0){S.on={x:w*(.25+r()*.5),y:H*(.05+r()*.25),age:0}; S.next=9+r()*14;}
    if(S.on){const o=S.on; o.age+=dt; const p=o.age/.9;
      if(p>=1) S.on=null; else {const x=o.x+p*190,y=o.y+p*72,g=c.createLinearGradient(x-95,y-36,x,y);
        g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(1,`rgba(255,255,255,${.85*(1-p)})`); c.globalAlpha=1; c.strokeStyle=g; c.lineWidth=1.2;
        c.beginPath(); c.moveTo(x-95,y-36); c.lineTo(x,y); c.stroke();}}}
  if(st.fog) for(const f of st.fog){f.x+=f.v*dt; const hw=256*f.s; if(f.x-hw>w) f.x=-hw; c.globalAlpha=f.a; c.drawImage(st.fogSpr,f.x-hw,f.y-48*f.s,512*f.s,96*f.s);}
  c.globalCompositeOperation='lighter';
  if(st.glints){c.fillStyle=st.sun; for(const g of st.glints){const s=Math.max(0,Math.sin(t*g.sp+g.ph)),a=s*s*s*s*s*s*(1-g.k)*.85; if(a<.02) continue; c.globalAlpha=a; c.fillRect(g.x-g.wd/2,g.y,g.wd,1.3);}}
  if(st.shim){c.fillStyle=A.glow; for(const g of st.shim){const s=Math.max(0,Math.sin(t*g.sp+g.ph)),a=s*s*s*s*.45; if(a<.02) continue; c.globalAlpha=a; c.fillRect(g.x,g.y,g.wd,1);}}
  if(st.wins) for(const o of st.wins){const s=Math.max(0,Math.sin(t*o.sp+o.ph)),a=s*s*.85; if(a<.03) continue; c.globalAlpha=a; c.fillStyle=A.win[o.W[2]]; c.fillRect(o.W[0]-.5,o.W[1]-.5,3.6,4.4);}
  if(st.embers){const sp=glow('#ffb06a'); for(const e of st.embers){e.y+=e.vy*dt; e.x+=(e.vx+Math.sin(t*1.7+e.ph)*9)*dt;
      if(e.y<H*.12||e.x>w+10) Object.assign(e,ember(st,false));
      const life=clamp((e.y-H*.12)/(h-H*.12),0,1),fl=.5+.5*Math.sin(t*7+e.ph); c.globalAlpha=life*(.35+.55*fl); c.drawImage(sp,e.x-e.s*2,e.y-e.s*2,e.s*4,e.s*4);}}
  if(st.flies){const sp=glow('#e6ff98'); for(const f of st.flies){f.a+=(r()-.5)*dt*3; f.x+=Math.cos(f.a)*f.v*dt; f.y+=Math.sin(f.a)*f.v*dt*.6;
      if(f.x<0||f.x>w) f.a=Math.PI-f.a; if(f.y<H||f.y>h*.97) f.a=-f.a; f.x=clamp(f.x,0,w); f.y=clamp(f.y,H,h*.97);
      const q=.5+.5*Math.sin(t*f.sp+f.ph); c.globalAlpha=q*q*q; c.drawImage(sp,f.x-f.s,f.y-f.s,f.s*2,f.s*2);}}
  if(st.dust){c.fillStyle=st.sun; for(const d of st.dust){d.x+=d.v*dt; d.y+=Math.sin(t*.8+d.ph)*6*dt; if(d.x>w+4){d.x=-4; d.y=H+r()*(h-H)*.9;} c.globalAlpha=d.a*.55; c.fillRect(d.x,d.y,d.s*2.2,d.s*.8);}}
  if(st.plane){const p=st.plane; if(p.x<w+40){p.x+=p.v*dt; const sp=glow('#ff4040'); c.globalAlpha=.55; c.fillStyle='#ffffff'; c.fillRect(p.x,p.y,1.6,1.6);
      if((t%1.3)<.14){c.globalAlpha=1; c.drawImage(sp,p.x-6,p.y-6,12,12);}}
    else {p.wait-=dt; if(p.wait<=0){p.x=-40; p.y=H*(.1+r()*.3); p.wait=18+r()*24;}}}
  c.globalCompositeOperation='source-over';
  if(st.rain){c.globalAlpha=1; c.strokeStyle='rgba(205,220,255,.16)'; c.lineWidth=.8; c.beginPath();
    for(const d of st.rain){d.y+=d.v*dt; d.x-=d.v*dt*.12; if(d.y>h){d.y=-d.l; d.x=r()*w*1.15;} c.moveTo(d.x,d.y); c.lineTo(d.x-d.l*.12,d.y+d.l);} c.stroke();}
  if(st.birds){c.globalAlpha=.8; c.strokeStyle=A.near; c.lineWidth=1.3; c.beginPath();
    for(const b of st.birds){b.x+=b.v*dt; if(b.x>w+30){b.x=-30-r()*260; b.y=H*(.2+r()*.45);} const f=Math.sin(t*7+b.ph),s=b.s;
      c.moveTo(b.x-s*2,b.y-s*f*.8); c.quadraticCurveTo(b.x-s*.8,b.y-s*.25,b.x,b.y); c.quadraticCurveTo(b.x+s*.8,b.y-s*.25,b.x+s*2,b.y-s*f*.8);} c.stroke();}
  c.globalAlpha=1;
}
class Live{
  constructor(cv){this.cv=cv; this.c=cv.getContext('2d'); this.st=null; this.id=null; this.ft=0; this.blank=true;}
  size(){const q=Math.min(RES,1),W=Math.round(1920*q),H=Math.round(1080*q); if(this.cv.width!==W||this.cv.height!==H){this.cv.width=W; this.cv.height=H;}}
  fade(id){ if(this.id===id&&(this.st||!id)) return; this.id=id; clearTimeout(this.ft); this.cv.style.opacity=0;
    this.ft=setTimeout(()=>{this.st=id&&LIVECFG[id]?mkLive(id):null; this.clear(); this.cv.style.opacity='';},380); }
  clear(){ if(this.blank) return; this.c.setTransform(1,0,0,1,0,0); this.c.clearRect(0,0,this.cv.width,this.cv.height); this.blank=true; }
  draw(dt,t){ if(!this.st){this.clear(); return;} this.blank=false; const c=this.c; c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,this.cv.width,this.cv.height);
    const k=this.cv.width/1280; c.setTransform(k,0,0,k,0,0); drawLive(c,this.st,dt,t); }
}
const live=new Live($('#live')); live.size();

/* ── generated cover art for songs that have none ── */
function drawCover(cv,S,seed){
  const c=cv.getContext('2d'),n=512,r=rnd(seed*31+7),[a,b,d]=S.c; c.setTransform(cv.width/512,0,0,cv.width/512,0,0);
  let g=c.createLinearGradient(0,0,n,n); g.addColorStop(0,a); g.addColorStop(1,b); c.fillStyle=g; c.fillRect(0,0,n,n);
  if(S.k==='sun'){const cx=n*.5,cy=n*.47,R=n*.27,sg=c.createLinearGradient(0,cy-R,0,cy+R); sg.addColorStop(0,d); sg.addColorStop(1,b);
    const q=c.createRadialGradient(cx,cy,R*.6,cx,cy,R*2.4); q.addColorStop(0,rgba(d,.35)); q.addColorStop(1,rgba(d,0)); c.fillStyle=q; c.fillRect(0,0,n,n);
    c.fillStyle=sg; c.beginPath(); c.arc(cx,cy,R,0,TAU); c.fill(); c.fillStyle=mix(a,b,.35);
    for(let i=0;i<6;i++){c.fillRect(cx-R-2,cy+R*(.1+i*.15),2*R+4,3+i*2.4);}
    c.fillStyle=rgba(a,.9); c.fillRect(0,n*.76,n,n*.24); c.fillStyle=rgba(d,.5); c.fillRect(0,n*.76,n,2);}
  if(S.k==='waves'){const q=c.createRadialGradient(n*.7,n*.25,0,n*.7,n*.25,n*.5); q.addColorStop(0,rgba(d,.55)); q.addColorStop(1,rgba(d,0)); c.fillStyle=q; c.fillRect(0,0,n,n);
    c.beginPath(); c.arc(n*.7,n*.25,n*.07,0,TAU); c.fillStyle=d; c.fill();
    for(let i=0;i<7;i++){const y0=n*(.45+i*.08),p=r()*9,am=8+i*3; c.beginPath(); c.moveTo(0,n);
      for(let x=0;x<=n;x+=4) c.lineTo(x,y0+am*Math.sin(x/n*TAU*(1.2+i*.15)+p)); c.lineTo(n,n); c.closePath();
      c.fillStyle=mix(b,a,clamp(.2+i*.13,0,1)); c.fill(); c.strokeStyle=rgba(d,.35-i*.04); c.lineWidth=1.5; c.stroke();}}
  if(S.k==='rings'){const cx=n*.62,cy=n*.42; for(let i=14;i>=1;i--){c.beginPath(); c.arc(cx,cy,i*24,0,TAU); c.strokeStyle=rgba(d,(1-i/15)*.8); c.lineWidth=2+(i%3)*1.5; c.stroke();}
    c.beginPath(); c.arc(cx,cy,26,0,TAU); c.fillStyle=d; c.fill();}
  if(S.k==='grid'){const hy=n*.55,q=c.createRadialGradient(n/2,hy,0,n/2,hy,n*.55); q.addColorStop(0,rgba(d,.6)); q.addColorStop(1,rgba(d,0)); c.fillStyle=q; c.fillRect(0,0,n,hy);
    c.fillStyle=a; c.fillRect(0,hy,n,n-hy); c.strokeStyle=rgba(d,.6); c.lineWidth=1.6; c.beginPath();
    for(let i=-10;i<=10;i++){c.moveTo(n/2+i*7,hy); c.lineTo(n/2+i*64,n);} for(let j=1;j<=10;j++){const y=hy+(n-hy)*Math.pow(j/10,2); c.moveTo(0,y); c.lineTo(n,y);} c.stroke();
    c.fillStyle=d; c.fillRect(0,hy-1,n,2.5);}
  if(S.k==='arch'){const x0=n*.29,x1=n*.71,yb=n*.84,rr=(x1-x0)/2,yt=n*.3; const ag=c.createLinearGradient(0,yt-rr,0,yb); ag.addColorStop(0,d); ag.addColorStop(1,mix(d,b,.6));
    c.fillStyle=ag; c.beginPath(); c.moveTo(x0,yb); c.lineTo(x0,yt); c.arc(n/2,yt,rr,Math.PI,0); c.lineTo(x1,yb); c.closePath(); c.fill();
    c.beginPath(); c.arc(n*.56,n*.5,n*.05,0,TAU); c.fillStyle=rgba(a,.55); c.fill();
    c.fillStyle=rgba(a,.7); c.fillRect(n/2-1.5,yt-rr,3,yb-yt+rr); c.fillRect(x0,n*.56,x1-x0,3); c.fillStyle=mix(a,b,.2); c.fillRect(n*.22,yb,n*.56,10);}
  const v=c.createRadialGradient(n/2,n/2,n*.3,n/2,n/2,n*.75); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,.45)'); c.fillStyle=v; c.fillRect(0,0,n,n);
  c.setTransform(1,0,0,1,0,0);
}

/* ══ state ═════════════════════════════════════════════ */
const S={view:'home',zone:'main',nav:0,mem:{home:{r:0,c:0}},boot:true,overlay:null,saver:false,off:false,asking:false,busy:false,hidden:false,live:PREF.live!==false};
let cur=null, hoverBlock=0;
const isRM=()=>RM||!!PREF.rmotion;
const TR=Math.max(1.5,RES);

let toastT=0;
function toast(msg,ms){const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'),ms||3000);}
let AC=null;
function snd(kind){ if(!PREF.navsound) return; try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume();
  const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain(),sel=kind==='sel';
  o.type='sine'; o.frequency.setValueAtTime(sel?660:1250,t); if(sel) o.frequency.exponentialRampToValueAtTime(1180,t+.09);
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(sel?.07:.028,t+.008); g.gain.exponentialRampToValueAtTime(.0001,t+(sel?.2:.07));
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t+.22); }catch(_){} }

/* text entry: a dialog with a real text box, so the TV's own keyboard (or the phone) can type into it */
let askCb=null;
function ask(title,val,eb){ return new Promise(res=>{ if(askCb) askDone(false); askCb=res; $('#askT').textContent=title; $('#askEb').textContent=eb||'Cain OS';
  $('#askH').textContent=N.native?'Type, then press Done on the keyboard · Back to cancel':'Enter to save · Esc to cancel';
  const i=$('#askI'),a=$('#ask'); i.value=val||''; a.hidden=false; S.asking=true; N.call('typing',true);
  requestAnimationFrame(()=>{a.classList.add('on'); i.focus(); try{i.select();}catch(_){}}); }); }
function askDone(ok){ const a=$('#ask'),i=$('#askI'),cb=askCb; if(!cb) return; askCb=null; a.classList.remove('on'); a.hidden=true; S.asking=false; i.blur(); N.call('typing',false); cb(ok?i.value.trim():null); }
$('#askI').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); askDone(true); } else if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); askDone(false); } });

function showBusy(eb,title,pct,hint){ const b=$('#busy'); $('#busyEb').textContent=eb; $('#busyT').textContent=title; $('#busyBar').style.width=clamp(pct||0,2,100)+'%'; $('#busyH').textContent=hint||'';
  if(!S.busy){ S.busy=true; b.hidden=false; requestAnimationFrame(()=>b.classList.add('on')); } }
function hideBusy(){ if(!S.busy) return; S.busy=false; const b=$('#busy'); b.classList.remove('on'); b.hidden=true; }

function pickFile(accept,cb,multiple){ const f=$('#fileIn'); f.value=''; f.accept=accept; f.multiple=!!multiple; f.onchange=()=>{ if(f.files&&f.files.length) cb(multiple?[...f.files]:f.files[0]); }; f.click(); }

/* ══ profiles ══════════════════════════════════════════ */
const PCOL=['#FF5A1F','#3B82F6','#22A55E','#A855F7','#E0A50B','#EC4899'];
let PROF=LS.get('cain.profiles',null);
if(!PROF||!PROF.list||!PROF.list.length) PROF={list:[{id:'p1',name:'Profile 1',photo:null,color:0,wall:'lowtide'}],cur:'p1',n:1};
const saveProf=()=>{ LS.set('cain.profiles',PROF); N.call('setPref','profile',PROF.cur); pushLinkState(); };
const me=()=>PROF.list.find(p=>p.id===PROF.cur)||PROF.list[0];
/* photos and backgrounds sent from a phone live in the app's private folder; MEDIA maps profile → file */
let MEDIA={wall:{},photo:{}};
function loadUserMedia(){ const m=N.json('userMedia'); MEDIA=m&&m.wall&&m.photo?m:{wall:{},photo:{}}; }
const photoOf=p=>MEDIA.photo[p.id]||p.photo||null;
function paintAv(node,p){
  const ph=photoOf(p), col=PCOL[p.color%PCOL.length];
  node.style.backgroundImage=ph?cssUrl(ph):`radial-gradient(circle at 35% 28%,${mix(col,'#ffffff',.35)},${col} 55%,${mix(col,'#000000',.6)})`;
  node.textContent=ph?'':(p.name.trim()[0]||'?').toUpperCase();
}
let watchFor=null;
function renderProfiles(){
  if(watchFor!==me().id&&typeof loadWatch==='function'){ watchFor=me().id; loadWatch(); if(typeof renderShelves==='function') renderShelves(); }
  paintAv($('#meAv'),me());
  const box=$('#profs'); box.innerHTML='';
  PROF.list.forEach(p=>{const w=el(`<div class="pw${p.id===PROF.cur?' cur':''}"><div class="av f" data-f data-act="prof:pick" data-id="${esc(p.id)}"></div><div class="nm">${esc(p.name)}</div></div>`); paintAv(w.firstChild,p); box.appendChild(w);});
  if(PROF.list.length<6) box.appendChild(el(`<div class="pw"><div class="av add f" data-f data-act="prof:add">+</div><div class="nm">Add profile</div></div>`));
  $('#photoLbl').textContent=photoOf(me())?'Change photo':'Add photo';
  greet(); updSet();
}
function greet(){
  const h=new Date().getHours(), part=h<5?'Good night':h<12?'Good morning':h<17?'Good afternoon':'Good evening', n=me().name;
  $('#greet').textContent=/^Profile \d+$/.test(n)?part:`${part}, ${n}`;
}
let removeArm=0;
function profAct(cmd,e){
  if(cmd==='pick'){ const id=e.dataset.id; if(id!==PROF.cur){ PROF.cur=id; saveProf(); renderProfiles(); applyWall(); toast(`Switched to ${me().name}`); focusEl($(`#profs [data-id="${id}"]`)); } else goHome(); return; }
  if(cmd==='add'){ const n=++PROF.n, p={id:'p'+Date.now().toString(36),name:'Profile '+(PROF.list.length+1),photo:null,color:(n-1)%PCOL.length,wall:SCENES[(n-1)%SCENES.length][0]};
    PROF.list.push(p); PROF.cur=p.id; saveProf(); renderProfiles(); applyWall(); focusEl($(`#profs [data-id="${p.id}"]`)); openName(); return; }
  if(cmd==='rename'){ openName(); return; }
  if(cmd==='photo'){ if(N.native){ toast('Send a photo from your phone: choose “Profile photo” on the Phone Link page.',5000); openLink(); } else pickFile('image/*',loadPhoto); return; }
  if(cmd==='remove'){
    if(PROF.list.length<2){ toast('There has to be at least one profile.'); return; }
    if(performance.now()-removeArm>3000){ removeArm=performance.now(); toast(`Press Remove again to delete ${me().name}.`); return; }
    removeArm=0; const gone=me(); N.call('deleteUserMedia','wall',gone.id); N.call('deleteUserMedia','photo',gone.id);
    PROF.list=PROF.list.filter(p=>p!==gone); PROF.cur=PROF.list[0].id; saveProf(); loadUserMedia(); renderProfiles(); applyWall();
    toast(`Removed ${gone.name}`); focusEl($(`#profs [data-id="${PROF.cur}"]`));
  }
}
function openName(){ const p=me(); ask('Name this profile',p.name,'Profiles').then(v=>{ if(v){ p.name=v.slice(0,20); saveProf(); renderProfiles(); } }); }
function loadPhoto(file){ /* browser preview only */
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{ const c=document.createElement('canvas'); c.width=c.height=256; const s=Math.max(256/img.width,256/img.height),w=img.width*s,h=img.height*s;
    const x=c.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(img,(256-w)/2,(256-h)/2,w,h); URL.revokeObjectURL(url);
    me().photo=c.toDataURL('image/jpeg',.86); saveProf(); toast('Profile photo updated'); renderProfiles(); };
  img.onerror=()=>{ URL.revokeObjectURL(url); toast('That file isn’t an image.'); };
  img.src=url;
}

/* ══ wallpaper: built-in live scenes or your own photo / video ══ */
let wFlip=false, wallCur=null;
const DEMOWALL={};
const customWall=()=>MEDIA.wall[me().id]||DEMOWALL[me().id]||null;
function setScene(id){
  if(!SCN[id]) id='lowtide';
  if(wallCur===id) return; wallCur=id;
  $('#wCustom').innerHTML=''; $('#wCustom').hidden=true;
  const a=$(wFlip?'#wA':'#wB'),b=$(wFlip?'#wB':'#wA'); wFlip=!wFlip;
  a.width=Math.round(1920*RES); a.height=Math.round(1080*RES); paint(a,SCN[id]);
  a.classList.add('on'); b.classList.remove('on'); live.fade(id);
}
function setCustom(){
  const w=customWall(); if(!w){ me().wall='lowtide'; setScene('lowtide'); return; }
  wallCur='custom'; live.fade(null); $$('.wl').forEach(c=>c.classList.remove('on'));
  const box=$('#wCustom'); box.innerHTML=''; box.hidden=false;
  const fail=()=>{ if(wallCur==='custom'){ wallCur=null; setScene('lowtide'); } };
  if(w.kind==='video'){ const v=el(`<video muted loop playsinline autoplay></video>`); v.onerror=fail; v.src=w.url; box.appendChild(v); v.play().catch(()=>{}); }
  else { const im=el(`<img alt="">`); im.onerror=fail; im.src=w.url; box.appendChild(im); }
}
function applyWall(){ wallCur=wallCur==='custom'?null:wallCur; if(me().wall==='custom') setCustom(); else setScene(me().wall||'lowtide'); updSet(); }
function wallName(){ const w=me().wall; return w==='custom'&&customWall()?'Your own':(SCENES.find(s=>s[0]===w)||SCENES[0])[1]; }
function wallVisible(){ return S.saver||(S.view==='home'&&!M.active&&!S.overlay); }
function updLayers(){
  const home=S.view==='home'&&!S.overlay;
  stage.classList.toggle('wall-on',wallVisible());
  stage.classList.toggle('mbg-on',home&&M.active&&!S.saver);
  stage.classList.toggle('m-paused',!M.playing);
  const v=$('#wCustom video'); if(v){ if(wallVisible()&&!S.hidden) v.play().catch(()=>{}); else v.pause(); }
}

/* ══ apps: whatever is installed on this device ════════ */
let APPS=[], appsLoaded=false;
const CHEV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>';
const LIVEIC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="17" r="1.8" fill="currentColor" stroke="none"/><path d="M8.3 13.3a5.2 5.2 0 0 1 7.4 0"/><path d="M5.2 10.2a9.6 9.6 0 0 1 13.6 0"/><path d="M2.3 7.2a13.8 13.8 0 0 1 19.4 0"/></svg>';
/* a sensible first dock: well-known streaming apps, if they're installed */
const FAVORITES=['com.netflix.ninja','com.google.android.youtube.tv','com.amazon.firetv.youtube','com.amazon.amazonvideo.livingroom','com.amazon.avod','com.disney.disneyplus','com.spotify.tv.android','com.stremio.one',
  'com.nst.iptvsmarterstvbox','com.apple.atve.androidtv.appletv','com.apple.atve.amazon.appletv','com.wbd.stream','com.hulu.livingroomplus','com.plexapp.android','tv.twitch.android.app','tv.twitch.android.viewer','org.xbmc.kodi','org.videolan.vlc'];
const appBy=pkg=>APPS.find(a=>a.pkg===pkg);
function dockList(){
  if(Array.isArray(PREF.dock)) return PREF.dock.map(appBy).filter(Boolean).slice(0,6);
  const out=FAVORITES.map(appBy).filter(Boolean);
  for(const a of APPS){ if(out.length>=6) break; if(a.tv&&!out.includes(a)) out.push(a); }
  return out.slice(0,6);
}
function appTile(a,big,pin){
  const d=el(`<div class="tile f${big?' big':''}" data-f data-act="app" data-pkg="${esc(a.pkg)}"></div>`), col=hexOk(a.color);
  if(a.logo){ d.style.background=a.bg; d.innerHTML=a.logo; }
  else if(a.banner){ d.style.background=col; d.innerHTML=`<img class="bn" alt="" src="${esc(a.img)}"><span class="apn" style="max-width:86%;text-align:center">${esc(a.label)}</span>`; d.firstChild.onload=function(){ if(this.nextSibling) this.nextSibling.remove(); }; d.firstChild.onerror=function(){ this.remove(); }; }
  else { d.style.background=`linear-gradient(160deg,${mix(col,'#ffffff',.1)},${mix(col,'#000000',.5)})`; d.innerHTML=`<img class="ic" alt="" src="${esc(a.img)}"><span class="apn">${esc(a.label)}</span>`; d.firstChild.onerror=function(){ this.remove(); }; }
  d.insertAdjacentHTML('beforeend',(pin?'<span class="pin"></span>':'')+'<i class="gl"></i>');
  return d;
}
function renderDock(){
  const tr=$('#tApps'); tr.innerHTML=''; tr.style.transform=''; tr.dataset.off=0;
  dockList().forEach(a=>tr.appendChild(appTile(a)));
  tr.appendChild(el(`<div class="tile lt f" data-f data-act="view:live">${LIVEIC}LIVE TV<i class="gl"></i></div>`));
  tr.appendChild(el(`<div class="tile more f" data-f data-act="view:apps">${CHEV}<i class="gl"></i></div>`));
  refocus('home');
}
function gridRows(root,nodes,per,top,step,vis,gap){
  for(let r=0;r*per<nodes.length;r++){
    const row=el(`<div class="grow" data-row data-shift="${Math.max(0,r-(vis-1))*step}" style="top:${top+r*step}px;gap:${gap}px"></div>`);
    nodes.slice(r*per,r*per+per).forEach(n=>row.appendChild(n)); root.appendChild(row);
  }
}
function renderApps(){
  const root=$('#appsRoot'), dock=dockList().map(a=>a.pkg);
  root.innerHTML=`<div class="vsm"><div class="eyebrow">Apps</div><h1>Your apps</h1><p>${APPS.length?`${plural(APPS.length,'app')} on this device. Hold OK on an app to pin it to the Home dock or take it off.`:(appsLoaded?'No apps were found on this device.':'Looking for your apps…')}</p></div>
    <div class="chips" data-row data-shift="0"><div class="track">
      <button class="chipb f" data-f data-act="store">Get more apps</button>
      <button class="chipb f" data-f data-act="sideload">Install from a link</button>
      <button class="chipb f" data-f data-act="sys:apps">Manage apps</button>
      <span class="chip" style="margin:0 0 0 10px"><i></i><span id="appsFree">${STO?fmtB(STO.free)+' free':''}</span></span>
    </div></div>`;
  root.style.transform=''; root.dataset.y=0;
  gridRows(root,APPS.map(a=>appTile(a,true,dock.includes(a.pkg))),6,310,176,4,30);
  refocus('apps');
}
CainOS.on('apps',list=>{ APPS=Array.isArray(list)?list:[]; appsLoaded=true; renderDock(); renderApps(); if(S.view==='search') renderQ(); });
function togglePin(pkg){
  const a=appBy(pkg); if(!a) return; const list=dockList().map(x=>x.pkg), i=list.indexOf(pkg);
  if(i>=0){ list.splice(i,1); toast(`${a.label} taken off the Home dock`); }
  else { if(list.length>=6){ toast('The dock holds six apps. Take one off first.'); return; } list.push(pkg); toast(`${a.label} pinned to the Home dock`); }
  PREF.dock=list; savePref(); renderDock(); renderApps();
}

/* opening an app: the tile springs open with a burst of light, then Android switches to the app */
let lFrom=null, launchT=[];
function launchApp(pkg,e){
  const a=appBy(pkg); if(!a) return;
  const o=$('#launch'), lg=o.querySelector('.llogo'), lin=o.querySelector('.llin'), burst=o.querySelector('.lburst'), col=hexOk(a.color);
  const sr=stage.getBoundingClientRect(), r=e.getBoundingClientRect();
  const x=(r.left-sr.left)/SC, y=(r.top-sr.top)/SC, w=r.width/SC, h=r.height/SC, cx0=x+w/2, cy0=y+h/2;
  S.overlay='launch'; S.app=pkg;
  if(a.logo){ o.style.background=a.bg; o.style.color=a.fg||'#fff'; lin.innerHTML=a.logo; }
  else { o.style.background=`radial-gradient(120% 120% at 50% 40%,${mix(col,'#000000',.35)},${mix(col,'#000000',.82)})`; o.style.color='#fff';
    lin.innerHTML=a.banner?`<img alt="" src="${esc(a.img)}" width="160" height="90">`:`<img alt="" src="${esc(a.img)}" width="72" height="72">`; }
  o.querySelector('.lmsg').textContent=`Opening ${a.label}`;
  lFrom={clip:`inset(${y}px ${1920-x-w}px ${1080-y-h}px ${x}px round 24px)`, t:`translate(${cx0-960}px,${cy0-540}px) scale(1)`};
  o.getAnimations().forEach(n=>n.cancel()); lg.getAnimations().forEach(n=>n.cancel());
  o.hidden=false;
  if(!isRM()){
    e.animate([{filter:'brightness(1)'},{filter:'brightness(1.5)'},{filter:'brightness(1)'}],{duration:220});
    o.animate([{clipPath:lFrom.clip},{clipPath:'inset(0px 0px 0px 0px round 0px)'}],{duration:300,easing:'cubic-bezier(.2,.9,.1,1)',fill:'forwards'});
    lg.animate([{transform:lFrom.t},{transform:'translate(0px,-40px) scale(2.45)',offset:.62},{transform:'translate(0px,-40px) scale(2.15)',offset:.84},{transform:'translate(0px,-40px) scale(2.25)'}],{duration:440,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    burst.style.left=cx0+'px'; burst.style.top=cy0+'px';
    burst.animate([{transform:'scale(.3)',opacity:.95},{transform:'scale(9)',opacity:0}],{duration:560,easing:'cubic-bezier(.1,.7,.2,1)'});
  } else lg.style.transform='translate(0px,-40px) scale(2.25)';
  requestAnimationFrame(()=>o.classList.add('on')); updLayers(); updIsland();
  launchT.forEach(clearTimeout);
  launchT=[setTimeout(()=>{ if(S.overlay!=='launch'||S.app!==pkg) return; const ok=N.call('launch',pkg); if(ok===false){ closeOverlay(true); toast(`${a.label} couldn’t be opened.`); } },isRM()?60:360),
           setTimeout(()=>{ if(N.native&&S.overlay==='launch'&&S.app===pkg&&!S.hidden) closeOverlay(true); },7000)];
}
function closeOverlay(instant){
  if(S.overlay==='launch'){ const o=$('#launch'), lg=o.querySelector('.llogo'); o.classList.remove('on'); launchT.forEach(clearTimeout);
    const done=()=>{ o.hidden=true; o.getAnimations().forEach(a=>a.cancel()); lg.getAnimations().forEach(a=>a.cancel()); lg.style.transform=''; };
    if(instant||isRM()||!lFrom) done();
    else { const opt={duration:240,easing:'cubic-bezier(.6,0,.4,1)',fill:'forwards'};
      o.animate([{clipPath:'inset(0px 0px 0px 0px round 0px)'},{clipPath:lFrom.clip}],opt).onfinish=done;
      lg.animate([{transform:'translate(0px,-40px) scale(2.25)'},{transform:lFrom.t}],opt); }
    S.app=null; }
  S.overlay=null; updLayers(); updIsland();
}
CainOS.on('launchFailed',()=>{ if(S.overlay==='launch'){ closeOverlay(true); toast('That app couldn’t be opened.'); } });

/* ══ music ═════════════════════════════════════════════
   Two sources. "ext": whatever another app is playing (Spotify, YouTube Music…), followed through
   Android's media sessions. "lib": songs you sent to this TV, played here. */
const LIB=[];
const M={mode:'none',i:0,pos:0,dur:0,playing:false,active:false,q:false,amp:.07,ext:null,dismissed:false};
const PLAYI='<path d="M7 4.6v14.8L19.4 12z"/>', PAUSEI='<rect x="6" y="4.8" width="4.2" height="14.4" rx="1.2"/><rect x="13.8" y="4.8" width="4.2" height="14.4" rx="1.2"/>';
const curT=()=>M.mode==='ext'?M.ext:M.mode==='lib'?LIB[M.i]:null;
const tkey=T=>T?(T.id||((T.pkg||'')+'|'+T.t+'|'+T.a)):'';
$('#mThumb').width=$('#mThumb').height=Math.round(206*TR);

/* cover art: the real picture when there is one, otherwise a generated cover in colours picked from the title */
const COVERS=new Map();
function genCover(T){
  const cv=document.createElement('canvas'); cv.width=cv.height=INFO.lowRam?512:1024;
  let h=0; for(const ch of (T.t||'')+(T.a||'')) h=(h*31+ch.charCodeAt(0))|0; const hue=Math.abs(h)%360;
  const hsl=(l)=>{ const s=.7,a=s*Math.min(l,1-l),f=n=>{const k=(n+hue/30)%12; return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))))}; return '#'+[f(0),f(8),f(4)].map(v=>v.toString(16).padStart(2,'0')).join(''); };
  drawCover(cv,{k:['sun','waves','rings','grid','arch'][Math.abs(h)%5],c:[hsl(.12),hsl(.42),hsl(.8)]},Math.abs(h)%97);
  return {cv,wc:[hsl(.8),'#FF5A1F']};
}
function coverFor(T){
  const key=tkey(T)+'|'+(T.art||''); let c=COVERS.get(key); if(c) return c;
  c=genCover(T); c.ready=!T.art; COVERS.set(key,c);
  if(COVERS.size>24) COVERS.delete(COVERS.keys().next().value);
  if(T.art){ const im=new Image();
    im.onload=()=>{ const x=c.cv.getContext('2d'),n=c.cv.width,s=Math.max(n/im.width,n/im.height); x.imageSmoothingQuality='high'; x.clearRect(0,0,n,n);
      x.drawImage(im,(n-im.width*s)/2,(n-im.height*s)/2,im.width*s,im.height*s);
      try{ const t=document.createElement('canvas'); t.width=t.height=1; const tx=t.getContext('2d'); tx.drawImage(c.cv,0,0,1,1); const q=tx.getImageData(0,0,1,1).data;
        c.wc=[mix('#'+[q[0],q[1],q[2]].map(v=>v.toString(16).padStart(2,'0')).join(''),'#ffffff',.45),'#FF5A1F']; }catch(_){}
      c.ready=true; if(tkey(curT())===tkey(T)) paintCover(); renderQueue(); };
    im.onerror=()=>{ c.ready=true; };
    im.src=T.art; }
  return c;
}
let msFlip=false, paintedKey='';
function paintCover(swap){
  const T=curT(); if(!T) return; const src=coverFor(T).cv, th=$('#mThumb'), tx=th.getContext('2d');
  tx.imageSmoothingQuality='high'; tx.drawImage(src,0,0,th.width,th.height);
  if(swap) msFlip=!msFlip;
  const slot=$(msFlip?'#msB':'#msA'),old=$(msFlip?'#msA':'#msB');
  const big=slot.querySelector('.big'); big.width=big.height=Math.round(1140*Math.min(RES,1)); const bx=big.getContext('2d'); bx.imageSmoothingQuality='high'; bx.drawImage(src,0,0,big.width,big.height);
  const t=document.createElement('canvas'); t.width=t.height=6; t.getContext('2d').drawImage(src,0,0,6,6);
  const wash=slot.querySelector('.wash'),wx=wash.getContext('2d'); wx.imageSmoothingQuality='high'; wx.drawImage(t,0,0,wash.width,wash.height);
  slot.classList.add('on'); old.classList.remove('on');
  const ic=$('#isCov').getContext('2d'); ic.imageSmoothingQuality='high'; ic.drawImage(src,0,0,96,96);
}
function renderTrack(){
  const T=curT(); if(!T){ renderPlay(); return; }
  const k=tkey(T), changed=k!==paintedKey; paintedKey=k;
  paintCover(changed);
  if(changed&&!isRM()) $('#mThumb').animate([{opacity:.3,transform:'scale(.96)'},{opacity:1,transform:'none'}],{duration:380,easing:'cubic-bezier(.2,.8,.2,1)'});
  const src=M.mode==='ext'?{n:T.app||'Another app',c:'#1ED760'}:{n:'Your music',c:'#FF5A1F'};
  $('#mT').textContent=T.t; $('#mA').textContent=[T.a,T.al].filter(Boolean).join(' · '); $('#mDur').textContent=M.dur?fmtS(M.dur):'';
  $('#svNowT').textContent=[T.t,T.a].filter(Boolean).join(' · ');
  $('#mpSrcT').textContent=`Now playing · ${src.n}`; $('.mpSrc b').style.background=src.c;
  $('#isT').innerHTML=`<span>${esc(T.t)}</span>`; $('#isA span').textContent=[T.a,src.n].filter(Boolean).join(' · '); $('#isA b').style.background=src.c;
  requestAnimationFrame(()=>{ const t=$('#isT'),sp=t.firstChild; if(sp&&sp.offsetWidth>t.clientWidth+2){ t.classList.add('mq'); sp.innerHTML=`${esc(T.t)}<i>•</i>${esc(T.t)}<i>•</i>`; } else t.classList.remove('mq'); });
  $('#upNext').hidden=M.mode!=='lib';
  renderProg(true); renderQueue(); renderPlay(); pushLinkState();
}
function renderProg(jump){
  const f=$('#mFill'), frac=M.dur>0?clamp(M.pos/M.dur,0,1):0;
  if(jump||!M.playing||!M.dur){ f.style.transition='none'; f.style.transform=`scaleX(${frac})`; void f.offsetWidth; f.style.transition=''; }
  else f.style.transform=`scaleX(${clamp((M.pos+1)/M.dur,0,1)})`;
  $('#mCur').textContent=fmtS(M.pos);
}
function renderPlay(){
  M.active=M.mode!=='none'&&!!curT()&&!(M.mode==='ext'&&M.dismissed);
  $('#ppI').innerHTML=M.playing?PAUSEI:PLAYI; $('#svNow').classList.toggle('paused',!M.playing); $('#svNow').hidden=!M.active;
  $('#mp').hidden=!M.active; $('#mIdle').hidden=M.active;
  $('#idlePlay').hidden=!LIB.length;
  $('#idleP').textContent=LIB.length?`${plural(LIB.length,'song')} in your library.`:new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
  if(!M.active&&M.q) setQueue(false);
  updLayers(); updIsland(); refocus('home');
}
function renderQueue(){
  const q=$('#mQ'),had=cur&&q.contains(cur); q.innerHTML='<div class="eyebrow">Up next</div>';
  if(M.mode==='lib') for(let k=1;k<=Math.min(3,LIB.length-1);k++){ const j=(M.i+k)%LIB.length,T=LIB[j];
    const d=el(`<div class="qi f" data-f data-act="m:pick" data-i="${j}"><canvas width="96" height="96"></canvas><div><b>${esc(T.t)}</b><small>${esc(T.a)}</small></div><span>${fmtS(T.d)}</span></div>`);
    d.querySelector('canvas').getContext('2d').drawImage(coverFor(T).cv,0,0,96,96); q.appendChild(d); }
  q.appendChild(el(`<div class="qi add f" data-f data-act="m:add"><span class="qplus">+</span><div><b>Add your music</b><small>${N.native?'Send songs from your phone':'Songs from this device'}</small></div></div>`));
  if(had) focusEl($('#upNext'));
}

/* library playback (real audio) */
const AU=new Audio(); AU.preload='auto';
let AN=null, ANd=null, anLive=0;
AU.addEventListener('ended',()=>{ if(M.mode==='lib') music('next'); });
AU.addEventListener('error',()=>{ if(M.mode==='lib'&&M.playing&&AU.dataset.id){ toast('That song couldn’t be played.'); M.playing=false; renderPlay(); } });
function ensureGraph(){ if(AN) return; try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); const src=AC.createMediaElementSource(AU); AN=AC.createAnalyser(); AN.fftSize=64; AN.smoothingTimeConstant=.72; src.connect(AN); AN.connect(AC.destination); ANd=new Uint8Array(AN.frequencyBinCount); }catch(_){ AN=null; } }
function syncAudio(){
  const T=M.mode==='lib'?LIB[M.i]:null;
  if(T){
    if(AU.dataset.id!==T.id){ AU.src=T.url; AU.dataset.id=T.id; }
    if(M.playing){ ensureGraph(); if(AC&&AC.state==='suspended') AC.resume().catch(()=>{}); if(AU.paused) AU.play().catch(()=>{ M.playing=false; renderPlay(); toast('Press play to start your song'); }); }
    else if(!AU.paused) AU.pause();
  } else if(!AU.paused) AU.pause();
}
function playLib(i){ if(!LIB.length) return; M.mode='lib'; M.i=((i%LIB.length)+LIB.length)%LIB.length; M.pos=0; M.dur=LIB[M.i].d||0; M.playing=true; M.dismissed=false; try{ AU.currentTime=0; }catch(_){} renderTrack(); syncAudio(); }
function music(cmd,e){
  if(cmd==='add'){ setQueue(false); if(N.native){ toast('Send songs from your phone: choose “Music” on the Phone Link page.',5000); openLink(); } else pickFile('audio/*',importDemoMusic,true); return; }
  if(cmd==='start'){ if(LIB.length){ playLib(M.i); focusEl($('#mp [data-act="m:toggle"]')); } return; }
  if(cmd==='home'){ if(S.zone==='island'){ S.zone='main'; paintIsland(); } if(S.overlay) closeOverlay(true); openView('home'); focusEl($('#mp [data-act="m:toggle"]')); return; }
  if(cmd==='queue'){ if(M.mode==='lib') setQueue(!M.q); return; }
  if(M.mode==='ext'){
    if(cmd==='toggle'||cmd==='play'||cmd==='pause'||cmd==='next'||cmd==='prev'){ N.call('mediaCmd',cmd); if(cmd==='toggle'){ M.playing=!M.playing; renderPlay(); } }
    else if(cmd==='stop'){ N.call('mediaCmd','pause'); M.dismissed=true; M.playing=false; renderPlay(); focusHomeMain(); }
    return;
  }
  if(M.mode!=='lib') return;
  const n=LIB.length;
  if(cmd==='toggle'){ M.playing=!M.playing; renderPlay(); renderProg(true); syncAudio(); }
  else if(cmd==='play'){ if(!M.playing){ M.playing=true; renderPlay(); syncAudio(); } }
  else if(cmd==='pause'){ if(M.playing){ M.playing=false; renderPlay(); syncAudio(); } }
  else if(cmd==='prev'){ if(M.pos>3||n<2){ M.pos=0; try{AU.currentTime=0;}catch(_){} renderProg(true); } else playLib(M.i-1); }
  else if(cmd==='next'){ if(n<2){ M.playing=false; M.pos=0; try{AU.currentTime=0;}catch(_){} renderPlay(); renderProg(true); syncAudio(); } else playLib(M.i+1); }
  else if(cmd==='pick'){ setQueue(false); playLib(+e.dataset.i); focusEl($('#mp [data-act="m:toggle"]')); }
  else if(cmd==='stop'){ M.playing=false; M.mode='none'; setQueue(false); syncAudio(); renderPlay(); focusHomeMain(); }
}
/* Up Next: the panel unfolds out of the button, rows cascade in and covers pop */
function setQueue(on){
  const q=$('#mQ'); if(!!on===!!M.q&&q.hidden===!on) return; M.q=on; $('#upNext').classList.toggle('on',on);
  q.getAnimations().forEach(a=>a.cancel()); $$('#mQ > *').forEach(c=>c.getAnimations().forEach(a=>a.cancel()));
  if(on){
    q.hidden=false; if(isRM()) return;
    const b=$('#upNext').getBoundingClientRect(),r=q.getBoundingClientRect(),ox=(b.left+b.width/2-r.left)/SC,oy=(b.top+b.height/2-r.top)/SC;
    q.style.transformOrigin=`${ox}px ${oy}px`;
    q.animate([{opacity:0,transform:'scale(.5)'},{opacity:1,transform:'scale(1)'}],{duration:460,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});
    [...q.children].forEach((c,i)=>c.animate([{opacity:0,transform:'translateX(-30px)'},{opacity:1,transform:'none'}],{duration:440,delay:110+i*60,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'}));
    q.querySelectorAll('canvas,.qplus').forEach((c,i)=>c.animate([{transform:'scale(.4) rotate(-14deg)',opacity:0},{transform:'none',opacity:1}],{duration:560,delay:170+i*60,easing:'cubic-bezier(.3,1.55,.5,1)',fill:'backwards'}));
  } else {
    if(cur&&q.contains(cur)) focusEl($('#upNext'));
    if(isRM()){ q.hidden=true; return; }
    q.animate([{opacity:1,transform:'none'},{opacity:0,transform:'scale(.6)'}],{duration:220,easing:'cubic-bezier(.5,0,.75,0)'}).onfinish=()=>{ if(!M.q) q.hidden=true; };
  }
}
setInterval(()=>{ if(!M.playing||!M.active) return;
  if(M.mode==='lib'){ M.pos=Math.floor(AU.currentTime||0); if(isFinite(AU.duration)&&AU.duration>0){ const d=Math.round(AU.duration); if(d!==M.dur){ M.dur=d; LIB[M.i].d=d; $('#mDur').textContent=fmtS(d); } } renderProg(); }
  else if(M.mode==='ext'){ if(!M.dur||M.pos<M.dur) M.pos++; renderProg(); } },1000);

/* what other apps are playing */
function onExternal(d){
  if(d&&d.t){
    const same=M.mode==='ext'&&tkey(M.ext)===tkey(d);
    if(d.playing&&M.mode==='lib'&&M.playing){ M.playing=false; syncAudio(); }
    if(d.playing||M.mode!=='lib'){
      if(d.playing) M.dismissed=false;
      M.mode='ext'; M.ext=d; M.pos=d.pos||0; M.dur=d.d||0; M.playing=!!d.playing;
      if(same){ $('#mDur').textContent=M.dur?fmtS(M.dur):''; if(coverFor(d).ready) paintCover(); renderProg(true); renderPlay(); } else renderTrack();
    }
  } else if(M.mode==='ext'){ M.mode='none'; M.ext=null; M.playing=false; renderPlay(); }
}
CainOS.on('media',onExternal);

/* your library */
function loadLibrary(announce){
  const list=N.json('musicList')||[], playingId=M.mode==='lib'&&LIB[M.i]?LIB[M.i].id:null, before=LIB.length;
  const device=LIB.filter(t=>t.device);
  LIB.length=0; list.forEach(t=>{ if(t&&t.url&&t.t) LIB.push(t); }); device.forEach(t=>{ if(!LIB.some(x=>x.id===t.id)) LIB.push(t); });
  if(playingId){ const j=LIB.findIndex(t=>t.id===playingId); if(j>=0) M.i=j; else { M.mode='none'; M.playing=false; syncAudio(); } } else M.i=clamp(M.i,0,Math.max(0,LIB.length-1));
  renderQueue(); renderPlay(); updSet();
  if(announce&&LIB.length>before) toast(`${plural(LIB.length-before,'song')} added to your library`);
}
CainOS.on('deviceMusic',list=>{
  if(!list){ toast('Cain OS wasn’t allowed to look for music on this device.'); return; }
  let n=0; list.forEach(t=>{ if(t&&t.url&&!LIB.some(x=>x.id===t.id)){ t.device=true; LIB.push(t); n++; } });
  renderQueue(); renderPlay(); updSet(); toast(n?`Found ${plural(n,'song')} on this device`:(list.length?'Those songs are already in your library.':'No music was found on this device or its USB drive.'));
});
function importDemoMusic(files){ /* browser preview only */
  files.forEach(f=>{ const base=f.name.replace(/\.[^.]+$/,'').replace(/_/g,' '), m=base.split(/\s+-\s+/);
    LIB.push({id:'b'+Math.random().toString(36).slice(2),t:m.length>1?m.slice(1).join(' - '):base,a:m.length>1?m[0]:'Unknown artist',al:'',d:0,url:URL.createObjectURL(f),art:''}); });
  renderPlay(); updSet(); if(LIB.length) playLib(LIB.length-files.length);
}

/* sound waves: glowing bars that follow the real sound of your own songs, and keep time otherwise */
function drawWave(cv,t,n){
  const c=cv.getContext('2d'),W=cv.width,H=cv.height,T=curT(); if(!T) return;
  const wc=coverFor(T).wc, gap=W/n,bw=gap*.56,beat=Math.pow(Math.max(0,Math.sin(t*Math.PI*100/60)),6);
  c.clearRect(0,0,W,H); const g=c.createLinearGradient(0,H,0,0); g.addColorStop(0,wc[1]); g.addColorStop(1,wc[0]);
  c.fillStyle=g; c.shadowColor=wc[1]; c.shadowBlur=H*.22;
  let real=false;
  if(M.mode==='lib'&&AN&&!AU.paused){ AN.getByteFrequencyData(ANd); let s=0; for(let i=0;i<ANd.length;i++) s+=ANd[i]; if(s>0) anLive=t; real=t-anLive<1.5; }
  for(let i=0;i<n;i++){
    const env=Math.pow(Math.sin(Math.PI*(i+.5)/n),.65); let v;
    if(real){ const k=Math.abs(i-(n-1)/2)/((n-1)/2), bin=1+Math.floor(k*k*(ANd.length*.7)); v=clamp((ANd[bin]/255)*1.15*(.55+.45*env),.08,1)*M.amp; }
    else { v=.42+.3*Math.sin(t*2.3+i*.62)+.2*Math.sin(t*4.1-i*1.1)+.16*Math.sin(t*7.3+i*2.3); v=clamp(v*env*(.72+.5*beat),.08,1)*M.amp; }
    const bh=Math.max(bw,H*.92*v),x=i*gap+(gap-bw)/2,y=(H-bh)/2;
    c.beginPath(); if(c.roundRect) c.roundRect(x,y,bw,bh,bw/2); else c.rect(x,y,bw,bh); c.fill();
  }
}
function sizeWaves(){ const q=Math.max(1,Math.min(2,SC*(devicePixelRatio||1))); [['#isWave',128,42],['#mpWave',112,28]].forEach(([id,w,h])=>{const c=$(id); c.width=Math.round(w*q); c.height=Math.round(h*q);}); }
sizeWaves();

/* the island: shows what's playing whenever you're away from the Home player */
const islandOn=()=>M.active&&!S.saver&&!S.boot&&!S.off&&!S.overlay&&!S.busy&&(S.view!=='home'||$('#v-home').classList.contains('deep'));
function updIsland(){
  const on=islandOn(); $('#island').classList.toggle('on',on);
  $('#isPPI').innerHTML=M.playing?PAUSEI:PLAYI;
  if(!on&&S.zone==='island') leaveIsland();
}
function enterIsland(){ S.zone='island'; S.isI=1; cur&&cur.classList.remove('is-focus'); paintIsland(); }
function paintIsland(){ $$('#island [data-f]').forEach((e,i)=>e.classList.toggle('is-focus',S.zone==='island'&&i===S.isI)); }
function leaveIsland(){ S.zone='main'; paintIsland(); refocus(); }

/* ══ IPTV: Movies, Shows and Live TV from your own provider ═════════════
   The app downloads the provider's catalogue into small per-category files; this page reads one
   category at a time, so a provider with 50,000 titles stays as quick as one with 50. */
let IPTV=LS.get('cain.iptv',null), META=null, bgSync=false;
const KINDS=['live','vod','series'];
const KV={live:{view:'live',root:'#liveRoot',title:'Live TV',noun:'channel',per:5,step:156,vis:4,gap:24},
          vod:{view:'movies',root:'#vodRoot',title:'Movies',noun:'movie',per:7,step:328,vis:2,gap:24},
          series:{view:'shows',root:'#seriesRoot',title:'Shows',noun:'series',per:7,step:328,vis:2,gap:24}};
const CAT={live:{cats:null,sel:0,list:[],shown:0},vod:{cats:null,sel:0,list:[],shown:0},series:{cats:null,sel:0,list:[],shown:0}};
function readJson(name){ const t=N.call('iptvRead',name); if(!t) return null; try{ return JSON.parse(t); }catch(e){ return null; } }
function loadMeta(){ META=IPTV?readJson('meta.json'):null; KINDS.forEach(k=>{ CAT[k].cats=null; CAT[k].sel=0; CAT[k].list=[]; CAT[k].shown=0; }); }
/* must match IptvSync.normalizeBase in the app */
function normBase(h){ h=String(h||'').trim(); if(!h) return ''; if(!/^https?:\/\//.test(h)) h='http://'+h; const se=h.indexOf('://')+3, sl=h.indexOf('/',se); if(sl>=0) h=h.slice(0,sl); const q=h.indexOf('?'); if(q>=0) h=h.slice(0,q); return h.length<=se?'':h; }
function streamOf(kind,it,title,sub){
  const o={t:title||it[1],s:sub||''};
  if(IPTV&&IPTV.type==='m3u'){ o.u=it[3]; return o; }
  const b=normBase(IPTV.host),u=encodeURIComponent(IPTV.user),p=encodeURIComponent(IPTV.pass);
  if(kind==='live'){ o.u=`${b}/live/${u}/${p}/${it[0]}.m3u8`; o.a=`${b}/live/${u}/${p}/${it[0]}.ts`; }
  else if(kind==='vod') o.u=`${b}/movie/${u}/${p}/${it[0]}.${it[3]||'mp4'}`;
  else o.u=`${b}/series/${u}/${p}/${it[0]}.${it[3]||'mp4'}`;
  return o;
}
const imgOk=u=>/^(https?:|file:|data:image\/)/i.test(u||'');
const imgTag=u=>imgOk(u)?`<img alt="" loading="lazy" decoding="async" src="${esc(u)}" onerror="this.remove()">`:'';
function chanCard(it,act,extra){ return el(`<div class="chan f" data-f data-act="${act}" ${extra||''}><span class="lg2">${esc((it[1]||'?').trim()[0]||'?')}${imgTag(it[2])}</span><b>${esc(it[1])}</b></div>`); }
function posterCard(it,act,extra){ return el(`<div class="poster post f" data-f data-act="${act}" ${extra||''}><div class="clip">${imgTag(it[2])}<div class="cshade"></div><div class="pmeta"><div class="pn">${esc(it[1])}</div></div></div></div>`); }

function renderCat(kind){
  const V=KV[kind], C=CAT[kind], root=$(V.root); root.style.transform=''; root.dataset.y=0;
  if(!IPTV||!META){
    root.innerHTML=`<div class="vhead"><div class="eyebrow">${V.title}</div><h1>${IPTV?'Your channel list isn’t on this device yet':'Add your IPTV provider'}</h1>
      <p>${IPTV?'Refresh it once and everything your provider offers shows up here.':`${V.title} comes from the IPTV service you already pay for. Enter the same server address, username and password you use in IPTV Smarters Pro, or an M3U playlist link.`}</p></div>
      <div class="vrow btns" style="top:470px" data-row><button class="btn primary f" data-f data-act="${IPTV?'iptv:refresh':'view:iptv'}">${IPTV?'Refresh now':'Set up IPTV'}</button>${IPTV?'<button class="btn f" data-f data-act="view:iptv">Provider details</button>':''}<button class="btn f" data-f data-act="view:apps">Open your apps</button></div>`;
    refocus(V.view); return;
  }
  if(!C.cats){ C.cats=readJson(kind+'_cats.json')||[]; C.sel=clamp(LS.get('cain.cat.'+kind,0)||0,0,Math.max(0,C.cats.length-1)); }
  const total=META[kind]||0;
  if(!C.cats.length){
    root.innerHTML=`<div class="vhead"><div class="eyebrow">${V.title}</div><h1>Nothing here from ${esc(META.label||'your provider')}</h1><p>This provider doesn’t list any ${V.noun==='series'?'series':V.noun+'s'}. If that’s unexpected, refresh the channel list.</p></div>
      <div class="vrow btns" style="top:470px" data-row><button class="btn primary f" data-f data-act="iptv:refresh">Refresh now</button></div>`;
    refocus(V.view); return;
  }
  root.innerHTML=`<div class="vsm"><div class="eyebrow">${esc(META.label||'IPTV')}</div><h1>${V.title}</h1></div>
    <div class="chips" data-row data-shift="0"><div class="track">${C.cats.map((c,i)=>`<button class="chipb f${i===C.sel?' sel':''}" data-f data-act="cat" data-kind="${kind}" data-i="${i}">${esc(c[1])}<small>${+c[2]||0}</small></button>`).join('')}</div></div>`;
  C.list=readJson(`${kind}_${C.cats[C.sel][0]}.json`)||[]; C.shown=0;
  if(!C.list.length) root.appendChild(el(`<div class="note" style="top:320px">This category is empty.</div>`));
  growCat(kind);
  const tr=root.querySelector('.chips .track'), sel=tr.children[C.sel]; if(sel) requestAnimationFrame(()=>scrollRow(tr.parentNode,sel));
  root.querySelector('.vsm h1').insertAdjacentHTML('beforeend',` <span class="chip" style="margin:0 0 0 18px;vertical-align:14px"><i></i>${total.toLocaleString()} ${total===1?V.noun:(V.noun==='series'?'series':V.noun+'s')}</span>`);
  refocus(V.view);
}
/* adds the next screenful of a long category as you approach its end */
function growCat(kind){
  const V=KV[kind], C=CAT[kind], root=$(V.root); if(C.shown>=C.list.length) return;
  const from=C.shown, to=Math.min(C.list.length,from+V.per*8), r0=Math.floor(from/V.per);
  const nodes=[]; for(let i=from;i<to;i++){ const it=C.list[i]; nodes.push(kind==='live'?chanCard(it,'live',`data-i="${i}"`):posterCard(it,kind,`data-i="${i}"`)); }
  for(let r=0;r*V.per<nodes.length;r++){
    const R=r0+r, row=el(`<div class="grow" data-row data-grid="${kind}" data-shift="${Math.max(0,R-(V.vis-1))*V.step}" style="top:${310+R*V.step}px;gap:${V.gap}px"></div>`);
    nodes.slice(r*V.per,r*V.per+V.per).forEach(n=>row.appendChild(n)); root.appendChild(row);
  }
  C.shown=to;
}
function pickCat(kind,i){ const C=CAT[kind]; if(i===C.sel) return; C.sel=i; LS.set('cain.cat.'+kind,i); renderCat(kind); focusEl($(`${KV[kind].root} .chipb.sel`)); }

/* watch history, kept on this device per profile */
let WATCH={cont:[],recent:[]};
const watchKey=()=>'cain.watch.'+me().id;
function loadWatch(){ const w=LS.get(watchKey(),null); WATCH=w&&Array.isArray(w.cont)&&Array.isArray(w.recent)?w:{cont:[],recent:[]}; }
const saveWatch=()=>LS.set(watchKey(),WATCH);
function renderShelves(){
  const tc=$('#tCont'), tr=$('#tRecent'), ok=!!IPTV;
  tc.innerHTML=''; tr.innerHTML=''; tc.style.transform=tr.style.transform=''; tc.dataset.off=tr.dataset.off=0;
  if(ok) WATCH.cont.forEach((c,i)=>{ const left=Math.max(0,(c.dur||0)-(c.pos||0)), pct=c.dur?clamp(c.pos/c.dur*100,2,100):0;
    tc.appendChild(el(`<div class="cw f" data-f data-act="cont" data-i="${i}"><span class="th">${imgTag(c.icon)}</span><div style="min-width:0"><b>${esc(c.name)}</b><small>${esc([c.sub,c.dur?Math.max(1,Math.round(left/60))+' min left':''].filter(Boolean).join(' · '))}</small></div><span class="prog"><i style="width:${pct}%"></i></span></div>`)); });
  if(ok) WATCH.recent.forEach((it,i)=>tr.appendChild(chanCard(it,'recent',`data-i="${i}"`)));
  const hc=tc.children.length>0, hr=tr.children.length>0, rc=$('#rowCont'), rr=$('#rowRecent');
  rc.hidden=!hc; rr.hidden=!hr; rc.style.top='930px'; rc.dataset.shift=450;
  rr.style.top=(hc?1166:930)+'px'; rr.dataset.shift=450;
  refocus('home');
}
let PLAYCTX=null;
function startPlayer(ctx,items,index,live,start){
  if(!N.native&&!DEMO.play){ toast('Video plays on the TV.'); return; }
  if(M.mode==='lib'&&M.playing) music('pause');
  PLAYCTX=ctx; N.call('play',JSON.stringify({items,index,live:!!live,key:ctx.key||'',start:Math.max(0,Math.round((start||0)*1000))}));
}
function playLive(list,i){
  if(!IPTV||!list[i]) return; const lo=Math.max(0,i-120), hi=Math.min(list.length,i+120), win=list.slice(lo,hi);
  startPlayer({kind:'live',list:win,key:'live'},win.map(it=>streamOf('live',it,it[1],'Live TV')),i-lo,true,0);
}
function playVod(it){ if(!IPTV||!it) return; const c=WATCH.cont.find(x=>x.key==='vod:'+it[0]);
  startPlayer({kind:'vod',it,key:'vod:'+it[0]},[streamOf('vod',it,it[1],'Movie')],0,false,c?c.pos:0); }
const epSub=(s,e)=>`S${s} · E${e[3]}${e[2]?' · '+e[2]:''}`;
function playEps(ser,season,eps,i,start){ /* ser=[id,name,icon]; eps=[[id,ext,title,num]] */
  if(!IPTV||!eps[i]) return;
  startPlayer({kind:'ep',ser,season,eps,key:'series:'+ser[0]},eps.map(e=>streamOf('ep',[e[0],'', '',e[1]],ser[1],epSub(season,e))),i,false,start||0);
}
CainOS.on('player',r=>{
  const ctx=PLAYCTX; PLAYCTX=null; if(!r||!ctx) return;
  if(ctx.kind==='live'){ const it=ctx.list[clamp(r.index|0,0,ctx.list.length-1)]; if(it){ WATCH.recent=[it,...WATCH.recent.filter(x=>x[0]!==it[0])].slice(0,12); saveWatch(); renderShelves(); } return; }
  WATCH.cont=WATCH.cont.filter(c=>c.key!==ctx.key);
  if(ctx.kind==='vod'){ if(!r.done&&r.pos>20) WATCH.cont.unshift({key:ctx.key,kind:'vod',it:ctx.it,name:ctx.it[1],icon:ctx.it[2],sub:'Movie',pos:r.pos,dur:r.dur,at:Date.now()}); }
  else { let i=clamp(r.index|0,0,ctx.eps.length-1), pos=r.pos, dur=r.dur;
    if(r.done){ i++; pos=0; dur=0; }
    if(i<ctx.eps.length&&(pos>20||r.done||i>0||r.index>0)) WATCH.cont.unshift({key:ctx.key,kind:'ep',ser:ctx.ser,season:ctx.season,eps:ctx.eps.slice(0,80),i,name:ctx.ser[1],icon:ctx.ser[2],sub:epSub(ctx.season,ctx.eps[i]),pos,dur,at:Date.now()}); }
  WATCH.cont=WATCH.cont.slice(0,12); saveWatch(); renderShelves(); if(S.view==='series') paintEps();
});
function playCont(i){ const c=WATCH.cont[i]; if(!c) return; if(c.kind==='vod') playVod(c.it); else playEps(c.ser,c.season,c.eps,c.i,c.pos); }

/* provider API calls go through the app (a web page can't make them itself) */
let httpId=0; const httpWait=new Map();
function httpGet(url){ return new Promise(res=>{ const id=++httpId; httpWait.set(id,res); N.call('http',id,url); setTimeout(()=>{ if(httpWait.has(id)){ httpWait.delete(id); res({code:-1,body:''}); } },25000); }); }
CainOS.on('http',r=>{ const f=r&&httpWait.get(r.id); if(f){ httpWait.delete(r.id); f(r); } });

/* a series: seasons along the top, episodes below */
let SER=null;
function openSeries(it){
  if(IPTV.type==='m3u'){ startPlayer({kind:'vod',it,key:'vod:'+it[0]},[streamOf('vod',it,it[1],'')],0,false,0); return; }
  SER={it,from:S.view,seasons:null,sel:0,plot:'',err:''}; openView('series'); paintEps();
  const b=normBase(IPTV.host), want=SER;
  httpGet(`${b}/player_api.php?username=${encodeURIComponent(IPTV.user)}&password=${encodeURIComponent(IPTV.pass)}&action=get_series_info&series_id=${encodeURIComponent(it[0])}`).then(r=>{
    if(SER!==want) return;
    try{ if(r.code!==200) throw 0; const j=JSON.parse(r.body), E=j&&j.episodes; if(!E||typeof E!=='object') throw 0;
      const seasons=[]; Object.keys(E).forEach(k=>{ const arr=Array.isArray(E[k])?E[k]:Object.values(E[k]||{}); const eps=arr.filter(e=>e&&e.id!=null).map((e,n)=>[String(e.id),String(e.container_extension||'mp4'),String(e.title||''),String(e.episode_num||n+1)]);
        if(eps.length) seasons.push({n:String(arr[0]&&arr[0].season!=null?arr[0].season:k),eps}); });
      seasons.sort((a,b)=>(+a.n||0)-(+b.n||0)); if(!seasons.length) throw 0;
      SER.seasons=seasons; SER.plot=String((j.info&&j.info.plot)||'').replace(/<[^>]*>/g,'').replace(/&[a-z#0-9]+;/gi,' ').trim(); if(j.info&&imgOk(j.info.cover)&&!imgOk(it[2])) it[2]=j.info.cover;
      const c=WATCH.cont.find(x=>x.key==='series:'+it[0]); if(c){ const si=seasons.findIndex(s=>s.n===String(c.season)); if(si>=0) SER.sel=si; }
    }catch(e){ SER.err=r.code===-1?'The provider didn’t answer. Check the internet connection and try again.':'The provider didn’t send an episode list for this series.'; }
    paintEps(); });
}
function paintEps(){
  if(!SER) return; const root=$('#epRoot'), it=SER.it; root.style.transform=''; root.dataset.y=0;
  const head=`<div class="vsm"><div class="eyebrow">Series</div><h1>${esc(it[1])}</h1></div><div class="epside">${imgOk(it[2])?`<img alt="" src="${esc(it[2])}" onerror="this.remove()">`:''}<p>${esc(SER.plot)}</p></div>`;
  if(!SER.seasons){ root.innerHTML=head+`<div class="note" style="top:240px">${esc(SER.err||'Loading episodes…')}</div><div class="vrow btns" style="top:310px" data-row><button class="btn f" data-f data-act="ser:back">Back</button></div>`; refocus('series'); return; }
  const s=SER.seasons[SER.sel], c=WATCH.cont.find(x=>x.key==='series:'+it[0]&&String(x.season)===s.n);
  root.innerHTML=head+`<div class="chips" data-row data-shift="0"><div class="track">${SER.seasons.map((x,i)=>`<button class="chipb f${i===SER.sel?' sel':''}" data-f data-act="ser:season" data-i="${i}">Season ${esc(x.n)}<small>${x.eps.length}</small></button>`).join('')}</div></div>
    <div class="eplist">${s.eps.map((e,i)=>`<div data-row data-shift="${Math.max(0,i-7)*78}"><div class="srow f" data-f data-act="ser:ep" data-i="${i}"><span class="sl">${esc(e[3])}. ${esc(e[2]||'Episode '+e[3])}</span><span class="sr"><span class="sv mono">${c&&c.i===i?(c.pos>20?'Resume · '+fmtS(c.pos):'Up next'):''}</span>${CHEV_SM}</span></div></div>`).join('')}</div>`;
  S.mem.series={r:c?1+clamp(c.i,0,s.eps.length-1):1,c:0}; if(S.view==='series'&&S.zone==='main'){ cur=null; focusAt(S.mem.series.r,0); }
}
function serAct(cmd,e){
  if(cmd==='back'){ back(); return; }
  if(cmd==='season'){ SER.sel=+e.dataset.i; paintEps(); focusEl($('#epRoot .chipb.sel')); return; }
  if(cmd==='ep'){ const s=SER.seasons[SER.sel], i=+e.dataset.i, c=WATCH.cont.find(x=>x.key==='series:'+SER.it[0]&&String(x.season)===s.n&&x.i===i);
    playEps([SER.it[0],SER.it[1],SER.it[2]],s.n,s.eps,i,c?c.pos:0); }
}

/* connecting a provider */
let IDR=null;
function iptvDraft(){ return IDR||(IDR=IPTV?Object.assign({},IPTV):{type:'xtream',host:'',user:'',pass:'',url:''}); }
function renderIptv(){
  const d=iptvDraft(), x=d.type!=='m3u', root=$('#iptvRoot');
  const row=(k,l,v)=>`<div data-row><div class="srow f" data-f data-act="iptv:field" data-k="${k}"><span class="sl">${l}</span><span class="sr"><span class="sv mono">${esc(v||'Not set')}</span>${CHEV_SM}</span></div></div>`;
  const mask=p=>p?'•'.repeat(Math.min(12,p.length)):'';
  const short=u=>u&&u.length>34?u.slice(0,31)+'…':u;
  root.innerHTML=`<div class="vhead" style="top:92px"><div class="eyebrow">IPTV</div><h1>${META?esc(META.label||'Your provider'):'Connect your provider'}</h1></div>
    <div class="chips" style="top:250px" data-row><div class="track"><button class="chipb f${x?' sel':''}" data-f data-act="iptv:type" data-t="xtream">Server login (Xtream)</button><button class="chipb f${x?'':' sel'}" data-f data-act="iptv:type" data-t="m3u">M3U playlist link</button></div></div>
    <div class="slist" style="top:336px">${x?row('host','Server address',short(d.host))+row('user','Username',d.user)+row('pass','Password',mask(d.pass)):row('url','Playlist link',short(d.url))}</div>
    <div class="vrow btns" style="top:${x?580:440}px" data-row><button class="btn primary f" data-f data-act="iptv:connect">${META?'Save and refresh':'Connect'}</button><button class="btn f" data-f data-act="iptv:phone">Type on your phone instead</button>${IPTV?'<button class="btn f" data-f data-act="iptv:remove">Remove</button>':''}</div>
    <div class="kv">${META?`<p><b>${(META.live||0).toLocaleString()}</b> channels · <b>${(META.vod||0).toLocaleString()}</b> movies · <b>${(META.series||0).toLocaleString()}</b> series<br>Last refreshed ${esc(new Date(META.at||Date.now()).toLocaleDateString([],{month:'short',day:'numeric'}))}${META.expires?`<br>Subscription runs until ${esc(META.expires)}`:''}</p>`:''}
      <p><b>Where do I find these?</b><br>They’re the same three things you typed into IPTV Smarters Pro: the server address (often with a port, like example.com:8080), your username and your password. They’re also in the welcome email from your provider.</p>
      <p>Your details stay on this device and are only ever sent to your provider.</p></div>`;
  refocus('iptv');
}
let removeIptvArm=0;
function iptvAct(cmd,e){
  const d=iptvDraft();
  if(cmd==='type'){ d.type=e.dataset.t; renderIptv(); focusEl($('#iptvRoot .chipb.sel')); return; }
  if(cmd==='field'){ const k=e.dataset.k, T={host:'Server address',user:'Username',pass:'Password',url:'Playlist link'}[k];
    ask(T,d[k]||'','IPTV').then(v=>{ if(v===null) return; d[k]=v; renderIptv(); focusEl($(`#iptvRoot [data-k="${k}"]`)); }); return; }
  if(cmd==='phone'){ openLink(); return; }
  if(cmd==='connect'){ syncIptv(d,false); return; }
  if(cmd==='refresh'){ if(IPTV) syncIptv(IPTV,false); return; }
  if(cmd==='remove'){ if(performance.now()-removeIptvArm>3000){ removeIptvArm=performance.now(); toast('Press Remove again to take this provider off the TV.'); return; }
    removeIptvArm=0; IPTV=null; IDR=null; LS.set('cain.iptv',null); N.call('iptvClear'); META=null; loadMeta(); renderAllCats(); renderIptv(); renderShelves(); updSet(); pushLinkState(); toast('Provider removed'); }
}
let syncing=null;
function syncIptv(d,quiet){
  if(syncing) return;
  const c=d.type==='m3u'?{type:'m3u',url:String(d.url||'').trim()}:{type:'xtream',host:String(d.host||'').trim(),user:String(d.user||'').trim(),pass:String(d.pass||'')};
  if(c.type==='m3u'?!/^https?:\/\/.+/i.test(c.url):!(normBase(c.host)&&c.user&&c.pass)){ if(!quiet) toast(c.type==='m3u'?'Enter the full playlist link, starting with http.':'Enter the server address, username and password first.'); return; }
  syncing=c; bgSync=!!quiet; if(!quiet) showBusy('IPTV','Connecting to your provider',3,'This can take a minute for a big channel list.');
  N.call('iptvSync',JSON.stringify(c));
}
CainOS.on('iptvProgress',p=>{ if(syncing&&!bgSync&&p) showBusy('IPTV',p.msg||'Working…',p.pct,'This can take a minute for a big channel list.'); });
CainOS.on('iptvDone',r=>{
  const c=syncing, quiet=bgSync; syncing=null; bgSync=false; hideBusy(); if(!c) return;
  if(r&&r.ok){ IPTV=c; IDR=null; LS.set('cain.iptv',IPTV); loadMeta(); renderAllCats(); renderIptv(); renderShelves(); updSet(); pushLinkState();
    if(!quiet){ toast(`Connected: ${(r.live||0).toLocaleString()} channels, ${(r.vod||0).toLocaleString()} movies, ${(r.series||0).toLocaleString()} series`,4500); if(S.view==='iptv'){ openView(r.live?'live':r.vod?'movies':'shows'); refocus(); } } }
  else if(!quiet) toast((r&&r.error)||'That didn’t work. Check the details and try again.',6000);
  refocus();
});
const DIRTY={live:true,vod:true,series:true};
function renderAllCats(){ KINDS.forEach(k=>{ DIRTY[k]=true; if(S.view===KV[k].view){ DIRTY[k]=false; renderCat(k); } }); }
function autoRefresh(){ const every=[0,864e5,6048e5][PREF.iptvAuto??1]; if(IPTV&&every&&(!META||Date.now()-(META.at||0)>every)&&(N.json('net')||{}).online!==false) syncIptv(IPTV,true); }

/* ══ search: your apps and your provider's catalogue ═══ */
const K=[[...'abcdefghijklm'],[...'nopqrstuvwxyz'],[...'1234567890','space','delete','clear']];
K.forEach((row,i)=>row.forEach(k=>$('#k'+(i+1)).appendChild(el(`<div class="key f${k.length>1?' wide':''}" data-f data-act="key" data-k="${k}">${k}</div>`))));
const MIC_IC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/></svg>';
let Q='', listening=false, searchId=0, searchT=0, SRES=null;
const voiceOK=()=>!!INFO.voice&&PREF.voice!==false;
function typeKey(k){ if(k==='space'){ if(Q&&!Q.endsWith(' ')) Q+=' '; } else if(k==='delete')Q=Q.slice(0,-1); else if(k==='clear')Q=''; else if(Q.length<40)Q+=k; renderQ(); }
function setQuery(t){ Q=String(t||'').toLowerCase().replace(/\s+/g,' ').trim().slice(0,40); renderQ(); }
function renderSTop(){
  const r=$('#sTop'), items=[];
  if(voiceOK()) items.push(`<button class="qchip mic f${listening?' on':''}" data-f data-act="voice">${MIC_IC}<span>${listening?'Listening…':'Voice search'}</span></button>`);
  const h=PREF.shist!==false?(PREF.hist||[]):[];
  if(h.length){ items.push('<span class="rlbl">Recent</span>'); h.forEach(q=>items.push(`<button class="qchip f" data-f data-act="q" data-q="${esc(q)}">${esc(q)}</button>`)); }
  r.innerHTML=items.join(''); refocus('search');
}
function startVoice(){
  if(!INFO.voice){ toast('This device has no voice typing. Use the letters, or type from your phone with Phone Link.',4500); return; }
  if(PREF.voice===false){ toast('Voice search is off. Turn it on in Settings → Voice & Search.'); return; }
  if(N.call('voice')===false){ toast('Voice search isn’t available right now.'); return; }
  listening=true; renderSTop();
}
CainOS.on('voice',t=>{ listening=false; renderSTop(); if(t){ setQuery(t); remember(); } });
function voiceAnywhere(){ if(S.zone==='nav') leaveNav(); if(S.zone==='island') leaveIsland(); openView('search'); focusAt(0,0); if(voiceOK()) startVoice(); }
function remember(){ const q=Q.trim(); if(q.length>1&&PREF.shist!==false){ PREF.hist=[q,...(PREF.hist||[]).filter(x=>x!==q)].slice(0,5); savePref(); renderSTop(); updSet(); } }
function renderQ(){
  $('#q').textContent=Q; $('#qph').hidden=!!Q;
  clearTimeout(searchT); const q=Q.trim();
  if(!q){ SRES=null; paintResults(); return; }
  paintResults();
  if(IPTV&&META){ const id=++searchId; searchT=setTimeout(()=>N.call('iptvSearch',id,q),260); }
}
CainOS.on('iptvSearch',r=>{ if(r&&r.id===searchId&&Q.trim()){ SRES=r.r||null; paintResults(); } });
function paintResults(){
  const root=$('#resRoot'), q=Q.trim(), hadFocus=cur&&root.contains(cur); root.innerHTML='';
  if(!q){ refocus('search'); return; }
  const apps=APPS.filter(a=>a.label.toLowerCase().includes(q)).slice(0,12), R=SRES||{};
  const secs=[];
  if(apps.length) secs.push({h:'Apps',hgt:140,nodes:apps.map(a=>appTile(a,true))});
  if(R.live&&R.live.length) secs.push({h:'Channels',hgt:132,nodes:R.live.map((it,i)=>chanCard(it,'slive',`data-i="${i}"`))});
  if(R.vod&&R.vod.length) secs.push({h:'Movies',hgt:300,nodes:R.vod.map((it,i)=>posterCard(it,'svod',`data-i="${i}"`))});
  if(R.series&&R.series.length) secs.push({h:'Shows',hgt:300,nodes:R.series.map((it,i)=>posterCard(it,'sseries',`data-i="${i}"`))});
  let y=664;
  secs.forEach(s=>{ const sh=el(`<div class="shelf" style="top:${y}px" data-row data-shift="${Math.max(0,y-230)}"><h2>${s.h}</h2><div class="track"></div></div>`);
    s.nodes.forEach(n=>sh.lastChild.appendChild(n)); root.appendChild(sh); y+=s.hgt+50+44; });
  if(!secs.length) root.appendChild(el(`<p class="note" style="top:664px;margin:0">${IPTV&&META&&!SRES?'Searching…':`Nothing called “${esc(q)}” in your apps${IPTV&&META?' or your provider’s list':''}.`}</p>`));
  if(hadFocus||(cur&&!document.contains(cur))) refocus('search');
}

/* ══ inputs (TVs with HDMI ports of their own) ═════════ */
const IN_IC='<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2.2"/><path d="M12 20v-3M8.5 20.5h7"/><path d="m10 9 3 2-3 2"/></svg>';
function renderInputs(){
  const list=N.json('inputs')||[], root=$('#inRoot');
  root.innerHTML=`<div class="vhead"><div class="eyebrow">Inputs</div><h1>${list.length?'Switch input':'No inputs on this device'}</h1><p>${list.length?'Pick what’s plugged into your TV. Press Home to come back to Cain OS.':'A streaming stick or box is itself one of your TV’s inputs, so it can’t switch to the others. Use the Input or Source button on your TV’s own remote. On a TV with Google TV built in, its HDMI ports are listed here.'}</p></div>
    <div class="vrow" style="top:${list.length?430:520}px;display:flex;gap:26px;flex-wrap:wrap;max-width:1660px" data-row>${list.slice(0,6).map(i=>`<div class="itile f" data-f data-act="input" data-id="${esc(i.id)}">${IN_IC}<div><b>${esc(i.label)}</b></div></div>`).join('')||'<button class="btn primary f" data-f data-act="view:home">Back to Home</button>'}</div>`;
  refocus('inputs');
}

/* ══ Phone Link: use your phone as the keyboard, remote and uploader ═════ */
let LINK={on:false,ip:'',port:0,code:'',paired:0};
function linkRefresh(){ LINK=N.json('linkInfo')||{on:false}; }
function openLink(){ if(S.zone==='nav') leaveNav(); if(!LINK.on){ LINK=N.json('linkStart')||{on:false}; } openView('link'); renderLink(); refocus(); }
function renderLink(){
  linkRefresh(); const root=$('#linkRoot'), net=N.json('net')||{};
  if(!LINK.on||!LINK.ip){
    root.innerHTML=`<div class="vhead"><div class="eyebrow">Phone Link</div><h1>Use your phone with this TV</h1><p>${LINK.on?'This TV isn’t on a network right now, so a phone can’t reach it. Connect it to Wi-Fi, then come back.':'Type with your phone’s keyboard, use it as a remote, and send music, photos and backgrounds to this TV. Nothing to install: it works in your phone’s browser over your home Wi-Fi.'}</p></div>
      <div class="vrow btns" style="top:480px" data-row><button class="btn primary f" data-f data-act="${LINK.on?'sys:wifi':'link:on'}">${LINK.on?'Network settings':'Turn on Phone Link'}</button>${LINK.on?'<button class="btn f" data-f data-act="link:off">Turn off</button>':''}</div>`;
  } else {
    root.innerHTML=`<div class="vhead" style="top:92px"><div class="eyebrow">Phone Link</div><h1>Connect your phone</h1></div>
      <div class="steps"><div class="step"><i>1</i><div>Put your phone on the same Wi-Fi as this TV${net.type?` (${esc(net.type)})`:''}.</div></div>
        <div class="step"><i>2</i><div>Open your phone’s browser and go to<br><b>http://${esc(LINK.ip)}:${LINK.port}</b></div></div>
        <div class="step"><i>3</i><div>Enter the code shown on the right.</div></div></div>
      <div class="linkCode"><div class="eyebrow">Pairing code</div><div class="code">${esc(LINK.code)}</div><p>${LINK.paired?`${plural(LINK.paired,'phone')} already paired.`:'No phones paired yet.'} Only phones on your own network can reach this TV, and they need this code.</p></div>
      <div class="vrow btns" style="top:800px" data-row><button class="btn primary f" data-f data-act="view:home">Done</button><button class="btn f" data-f data-act="link:off">Turn off</button>${LINK.paired?'<button class="btn f" data-f data-act="link:forget">Forget paired phones</button>':''}</div>`;
  }
  refocus('link'); updSet();
}
function linkAct(cmd){
  if(cmd==='on'){ LINK=N.json('linkStart')||{on:false}; if(!LINK.on) toast('Phone Link couldn’t start on this device.'); pushLinkState(); }
  else if(cmd==='off'){ N.call('linkStop'); toast('Phone Link is off'); }
  else if(cmd==='forget'){ N.call('linkForget'); toast('Paired phones forgotten. They’ll need the code again.'); }
  renderLink();
}
let linkT=0;
function pushLinkState(){ clearTimeout(linkT); linkT=setTimeout(()=>{ if(!LINK.on) return; const T=curT();
  N.call('linkState',JSON.stringify({name:PREF.dev||'Cain OS',view:S.view,asking:S.asking?$('#askT').textContent:'',profile:me().id,profiles:PROF.list.map(p=>({id:p.id,name:p.name})),
    now:T&&M.active?{t:T.t,a:T.a||'',playing:M.playing}:null,iptv:META?{label:META.label||'',live:META.live||0,vod:META.vod||0,series:META.series||0}:null,songs:LIB.filter(t=>!t.device).length})); },120); }
CainOS.on('linkPaired',()=>{ toast('Phone connected'); if(S.view==='link') renderLink(); pushLinkState(); });
CainOS.on('rkey',k=>{ if(typeof k==='string') onKey(k); });
CainOS.on('rmedia',c=>{ if(['toggle','play','pause','next','prev'].includes(c)) music(c); });
CainOS.on('rtext',t=>{ if(typeof t!=='string') return; poke();
  if(S.asking){ $('#askI').value=t.slice(0,300); askDone(true); return; }
  if(S.boot||S.busy) return; if(S.saver) stopSaver(); if(S.overlay) closeOverlay(true); if(S.zone!=='main'){ S.zone='main'; stage.classList.remove('nav-open'); paintIsland(); }
  openView('search'); setQuery(t); remember(); refocus(); });
CainOS.on('riptv',c=>{ if(!c||S.busy) return; if(S.asking) askDone(false); if(S.saver) stopSaver();
  IDR={type:c.type==='m3u'?'m3u':'xtream',host:c.host||'',user:c.user||'',pass:c.pass||'',url:c.url||''}; if(S.zone==='nav') leaveNav(); openView('iptv'); renderIptv(); syncIptv(IDR,false); });
CainOS.on('upload',u=>{ if(!u) return;
  if(u.kind==='music'){ if(u.ok) loadLibrary(true); else toast('That file isn’t music this TV can play.'); return; }
  if(!u.ok) return; loadUserMedia(); const p=PROF.list.find(x=>x.id===u.profile)||me();
  if(u.kind==='wallpaper'){ p.wall='custom'; saveProf(); if(p===me()){ wallCur=null; applyWall(); } toast(`New background for ${p.name}`); }
  else if(u.kind==='photo'){ p.photo=null; saveProf(); renderProfiles(); toast(`New photo for ${p.name}`); } });

/* installing an app from a download link */
function sideload(){
  ask('Link to the app file (.apk)','https://','Install an app').then(v=>{ if(!v||!/^https?:\/\/.+/i.test(v)){ if(v) toast('That isn’t a web link.'); return; }
    if(!N.native){ toast('Apps install on the TV.'); return; }
    if(N.call('canInstall')===false){ toast('First allow Cain OS to install apps, then try again.',5000); N.call('openSettings','unknown'); return; }
    showBusy('Install an app','Downloading…',2,'Only install apps from sources you trust.'); N.call('installFromUrl',v); });
}
CainOS.on('install',s=>{ if(!s) return; if(s.state==='download') showBusy('Install an app',s.msg||'Downloading…',s.pct,'Only install apps from sources you trust.'); else { hideBusy(); if(s.state==='error') toast(s.msg||'The install didn’t work.',6000); refocus(); } });

/* ══ settings ══════════════════════════════════════════
   Everything here either works inside Cain OS or opens the matching screen in the device's own settings. */
const LOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
const CHEV_SM='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
const SAVER_MIN=[0,1,5,10], OFF_MIN=[0,15,30,60];
let STO=null, NET={online:navigator.onLine,type:'',ip:''}, HOME={service:false,redirect:true};
const WIFI_IC='<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.8 12.4a9.3 9.3 0 0 1 12.4 0"/><path d="M9.1 15.8a4.6 4.6 0 0 1 5.8 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/>';
const conn=()=>NET.online?('Online'+(NET.type?' · '+NET.type:'')):'Offline';
const tg=(k,l,def,d,x)=>Object.assign({k,l,tog:true,on:PREF[k]??def,d},x||{});
const cy=(k,l,opts,def,d,x)=>Object.assign({k,l,cycle:opts,i:clamp(PREF[k]??def,0,opts.length-1),d},x||{});
const SYS=' Opens this device’s own settings; press Home to come back.';
const userSongs=()=>LIB.filter(t=>!t.device).length;
const VER=INFO.version||'1.0';
const SETTINGS=[
 {k:'conn',l:'Connection',v:conn,d:''},
 {k:'ip',l:'Address on your network',v:()=>NET.ip||'None',d:'This device’s address on your home network. Phone Link uses it.'},
 {k:'sysWifi',l:'Wi-Fi and network',v:'Open',go:1,sys:'wifi',d:'Join a Wi-Fi network or check the cable connection.'+SYS},
 {k:'sysVpn',l:'VPN',v:'Open',go:1,sys:'vpn',d:'Cain OS doesn’t run a VPN itself. Install your VPN provider’s app from Apps and connect there; it then covers everything on this device, Cain OS included. This opens the device’s VPN screen where there is one.'},

 {k:'iptvAcct',l:'Provider',v:()=>META?(META.label||'Connected'):IPTV?'Needs a refresh':'Not set up',go:1,d:'The IPTV service that fills Live TV, Movies and Shows. Use the same server address, username and password as in IPTV Smarters Pro, or an M3U playlist link.'},
 {k:'iptvSync',l:'Refresh channel list',v:()=>META?new Date(META.at||0).toLocaleDateString([],{month:'short',day:'numeric'}):'Never',go:1,d:'Downloads the newest list of channels, movies and series from your provider.'},
 cy('iptvAuto','Refresh automatically',['Off','Every day','Every week'],1,'Keeps the list current in the background when Cain OS starts.'),
 {k:'iptvClearW',l:'Clear watch history',v:()=>{const n=WATCH.cont.length+WATCH.recent.length; return n?`${n} saved`:'Empty';},go:1,d:'Empties Continue Watching and Recent Channels for this profile.'},

 {k:'disp',l:'This screen',v:()=>`${HZ?HZ+' Hz':'…'} · ${resLabel()}`,d:''},
 tg('nightlight','Night light',false,'Warms the colours of Cain OS to go easier on your eyes at night. It tints the Cain OS screens, not other apps.'),
 tg('h24','24-hour clock',false,'Shows 21:40 instead of 9:40 PM on Home and the screensaver.'),
 {k:'sysDisplay',l:'Resolution, HDR and frame rate',v:'Open',go:1,sys:'display',d:'4K output, HDR, and matching the screen to each video’s frame rate are set by the device.'+SYS},
 {k:'sysDate',l:'Date and time zone',v:'Open',go:1,sys:'date',d:'The clock follows the device’s date, time and time zone.'+SYS},

 {k:'nowAccess',l:'Show music from other apps',v:()=>N.call('mediaAccess')?'On':'Off',go:1,d:''},
 {k:'musicAdd',l:'Add music from your phone',v:()=>{const n=userSongs(); return n?`${plural(n,'song')}`:'Open Phone Link';},go:1,d:'Send MP3, M4A, FLAC, WAV or OGG files from your phone’s browser. They’re stored on this device, play from Home, and their cover art comes along when the file has it.'},
 {k:'musicScan',l:'Find music on this device',v:'Look',go:1,d:'Looks for music already on this device or on a USB drive plugged into it. Android asks for permission the first time.'},
 {k:'musicClear',l:'Remove your music',v:()=>{const n=userSongs(); return n?'Remove':'Nothing to remove';},go:1,d:'Deletes every song you sent to this device. Press twice to confirm.'},
 tg('navsound','Navigation sounds',false,'A soft click as you move around and a little chime when you select something.'),
 {k:'sysSound',l:'Speakers, audio format and Bluetooth',v:'Open',go:1,sys:'sound',d:'Surround sound, audio output and Bluetooth headphones are set by the device.'+SYS},

 {k:'wall',l:'Background',v:()=>wallName(),d:'What fills Home when no music is playing, and what the screensaver shows. Each profile keeps its own. Press to cycle through the built-in scenes and your own.'},
 {k:'wallAdd',l:'Add your own',v:'Open Phone Link',go:1,d:'Send any photo, GIF or short video from your phone and it becomes this profile’s background. Videos loop silently.'},
 {k:'wallRemove',l:'Remove your own background',v:()=>customWall()?'Remove':'None added',go:1,d:'Deletes the background this profile added and goes back to a built-in scene.'},
 tg('live','Moving backgrounds',true,'The built-in scenes move: glints on the water, drifting fog, fireflies, city lights, rain. They pause whenever you’re on another screen or in an app.'),

 cy('saver','Screensaver',['Off','After 1 min','After 5 min','After 10 min'],2,'When nothing happens for a while, Cain OS fades to your background with a large clock, the date, a quote and what’s playing. The text drifts slowly so nothing burns into the screen. Set to Off to use the device’s own screensaver.'),
 {k:'saverNow',l:'Preview screensaver',v:'Start',go:1,d:'Starts the screensaver now. Press any button to come back.'},
 cy('clockstyle','Screensaver clock',['Classic','Bold','Pixel'],0,'How the big clock on the screensaver looks. Pixel gives it a blocky, retro look.'),
 cy('off','Go dark when idle',['Never','After 15 min','After 30 min','After 1 hour'],2,'After this long with no button pressed and nothing playing, Cain OS turns the picture black and stops holding the device awake, so the device’s own sleep timer takes over. Any button brings it back.'),

 tg('voice','Voice search',true,'Press the microphone or search button on your remote, or the mic in Search, and say what you want. It uses the voice typing built into this device.'),
 tg('shist','Search history',true,'Remembers your last few searches on this device so you can run them again in one press.'),
 {k:'sclear',l:'Clear search history',v:()=>{const n=(PREF.hist||[]).length; return n?`${n} saved`:'Empty';},go:1,d:'Forgets every recent search on this device.'},

 tg('rmotion','Reduce motion',false,'Turns off the big animations, moving backgrounds and drifting art.'),
 tg('hfocus','High-contrast focus',false,'Makes the highlight around whatever you’ve selected thicker and orange, so it’s easier to spot from the couch.'),
 {k:'sysCaptions',l:'Captions',v:'Open',go:1,sys:'captions',d:'Subtitle size and style for apps that follow the device’s caption settings.'+SYS},
 {k:'sysA11y',l:'Screen reader and more',v:'Open',go:1,sys:'accessibility',d:'The device’s accessibility tools.'+SYS},

 {k:'homeSvc',l:'Home button opens Cain OS',v:()=>HOME.service?(HOME.redirect?'On':'Paused'):'Not set up',go:1,d:''},
 tg('homeRedirect','Come back here on Home',true,'When the Home-button helper is on, pressing Home returns to Cain OS instead of the device’s own home screen. Turn off to pause it without removing the helper.'),
 {k:'stockHome',l:'Open the original home screen',v:'Open',go:1,d:'Shows the home screen that came with this device. Open Cain OS again from its app list to return.'},
 {k:'store',l:'Get more apps',v:'Open store',go:1,d:'Opens this device’s app store. Anything you install shows up under Apps.'},
 {k:'sideload',l:'Install an app from a link',v:'Enter link',go:1,d:'Downloads an app file (.apk) from a web address and hands it to Android’s installer. Only install apps from sources you trust.'},
 {k:'sysApps',l:'Manage apps',v:'Open',go:1,sys:'apps',d:'Uninstall apps, clear their storage or force them to stop.'+SYS},
 {k:'dockReset',l:'Reset the Home dock',v:()=>Array.isArray(PREF.dock)?'Custom':'Automatic',go:1,d:'Goes back to picking your streaming apps for the dock automatically. To choose your own, hold OK on any app under Apps.'},

 {k:'devname',l:'Device name',v:()=>PREF.dev||'Cain OS',go:1,d:'What this device is called on the Phone Link page.'},
 {k:'storage',l:'Storage',v:()=>STO?fmtB(STO.free)+' free':'…',d:''},
 {k:'sysAll',l:'All device settings',v:'Open',go:1,sys:'',d:'Everything else: remotes and accessories, accounts, system updates.'+SYS},
 {k:'boot',l:'Start-up animation',v:'Replay',go:1,d:'Plays the Kairn Labs start-up sequence again. It runs each time Cain OS starts, and any button skips it.'},
 {k:'restart',l:'Restart Cain OS',v:'Restart',go:1,d:'Reloads Cain OS. Your profiles and settings stay.'},
 {k:'reset',l:'Erase Cain OS data',v:'Erase',go:1,d:'Removes profiles, your IPTV details, music, backgrounds, paired phones and settings from this device and starts fresh. Your other apps aren’t touched. Press twice to confirm.'},
 {k:'about',l:'About',v:'Cain OS '+VER,d:''},
];
const CATS=[
 {k:'net',n:'Network & Internet',c:'#2f7cf6',ic:WIFI_IC,rows:['conn','ip','sysWifi','sysVpn'],sum:()=>conn()},
 {k:'iptv',n:'IPTV',c:'#e50914',ic:'<rect x="3.5" y="7.6" width="17" height="12.6" rx="2.2"/><path d="m8.6 3.6 3.4 4 3.4-4"/><path d="M10.3 11.3v5.4l4.4-2.7z"/>',rows:['iptvAcct','iptvSync','iptvAuto','iptvClearW'],sum:()=>META?`${(META.live||0).toLocaleString()} channels · ${(META.vod||0).toLocaleString()} movies`:'Not set up'},
 {k:'prof',n:'Profiles',c:'#ec4899',ic:'<circle cx="9" cy="8.5" r="3.4"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0"/><circle cx="17" cy="9.5" r="2.6"/><path d="M15.8 14.2a5 5 0 0 1 5.6 5.3"/>',rows:null,sum:()=>`${me().name} · ${plural(PROF.list.length,'profile')}`},
 {k:'link',n:'Phone Link',c:'#8b5cf6',ic:'<rect x="7" y="2.8" width="10" height="18.4" rx="2.4"/><path d="M10.6 17.8h2.8"/>',rows:null,sum:()=>LINK.on?(LINK.paired?`On · ${plural(LINK.paired,'phone')} paired`:'On'):'Off'},
 {k:'disp',n:'Display & Clock',c:'#e0a50b',ic:'<rect x="3" y="4.5" width="18" height="12.5" rx="2.2"/><path d="M8.5 20.3h7M12 17v3.3"/><path d="M7 13.5 10 10l2.4 2.4L14.5 10l2.5 3.5"/>',rows:['disp','nightlight','h24','sysDisplay','sysDate'],sum:()=>`${HZ?HZ+' Hz':'…'} · ${resLabel()}${PREF.nightlight?' · Night light':''}`},
 {k:'sound',n:'Sound & Music',c:'#0ea5e9',ic:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18.3 6.4a8 8 0 0 1 0 11.2"/>',rows:['nowAccess','musicAdd','musicScan','musicClear','navsound','sysSound'],sum:()=>LIB.length?plural(LIB.length,'song'):'No songs yet'},
 {k:'bg',n:'Backgrounds',c:'#22a55e',ic:'<rect x="3" y="4" width="18" height="16" rx="2.4"/><circle cx="9" cy="9.5" r="1.8"/><path d="m3.5 17 5-4.5 3.5 3 3-2.5 5.5 4.5"/>',rows:['wall','wallAdd','wallRemove','live'],sum:()=>wallName()},
 {k:'pow',n:'Screensaver & Power',c:'#a855f7',ic:'<path d="M12 3v8"/><path d="M6.4 6.6a8 8 0 1 0 11.2 0"/>',rows:['saver','saverNow','clockstyle','off'],sum:()=>{const sv=setting('saver'),of=setting('off'); return `Saver ${sv.cycle[sv.i].replace('After ','').toLowerCase()} · Dark ${of.cycle[of.i].replace('After ','').toLowerCase()}`;}},
 {k:'voice',n:'Voice & Search',c:'#ff3b5c',ic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>',rows:['voice','shist','sclear'],sum:()=>!INFO.voice?'Typing only on this device':voiceOK()?'Voice on':'Voice off'},
 {k:'a11y',n:'Accessibility',c:'#10b981',ic:'<circle cx="12" cy="4.6" r="1.8"/><path d="M5 8.5c2.3.6 4.6.9 7 .9s4.7-.3 7-.9"/><path d="M12 9.4V14l-3 6.5M12 14l3 6.5"/>',rows:['rmotion','hfocus','sysCaptions','sysA11y'],sum:()=>[PREF.rmotion&&'Reduce motion',PREF.hfocus&&'High-contrast focus'].filter(Boolean).join(' · ')||'Default'},
 {k:'home',n:'Home Button & Apps',c:'#f97316',ic:'<path d="M4 10.4 12 4l8 6.4V19a1.6 1.6 0 0 1-1.6 1.6H15v-5.4H9v5.4H5.6A1.6 1.6 0 0 1 4 19z"/>',rows:['homeSvc','homeRedirect','stockHome','store','sideload','sysApps','dockReset'],sum:()=>HOME.service?'Home button: Cain OS':`${plural(APPS.length,'app')}`},
 {k:'sys',n:'System',c:'#6b645a',ic:'<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',rows:['devname','storage','sysAll','boot','restart','reset','about'],sum:()=>`Cain OS ${VER}${STO?' · '+fmtB(STO.free)+' free':''}`},
];
const setting=k=>SETTINGS.find(x=>x.k===k);
const valOf=s=>s.cycle?s.cycle[s.i]:typeof s.v==='function'?s.v():s.v;
let SCAT=null;
function rowHTML(s){
  const val=s.tog?`<span class="sv mono">${s.on?'On':'Off'}</span><span class="sw${s.on?' on':''}"><i></i></span>`:`<span class="sv mono">${esc(valOf(s))}</span>${s.lock?LOCK:s.go?CHEV_SM:''}`;
  return `<div data-row><div class="srow f" data-f data-act="set" data-k="${s.k}"><span class="sl">${s.l}</span><span class="sr">${val}</span></div></div>`;
}
function renderSettings(back){
  const root=$('#setRoot');
  if(!SCAT){
    const tile=C=>`<div class="scat f" data-f data-act="scat" data-k="${C.k}" style="--c:${C.c}"><span class="ico"><svg viewBox="0 0 24 24">${C.ic}</svg></span><div><b>${C.n}</b><small>${esc(C.sum())}</small></div></div>`;
    root.innerHTML=`<div class="vhead" style="top:104px"><h1>Settings</h1></div>
      <div class="sgrid">${[0,4,8].map(o=>`<div class="sgrow" data-row>${CATS.slice(o,o+4).map(tile).join('')}</div>`).join('')}</div>`;
    const i=back?Math.max(0,CATS.findIndex(c=>c.k===back)):0; S.mem.settings={r:Math.floor(i/4),c:i%4};
  } else {
    const C=CATS.find(c=>c.k===SCAT);
    root.innerHTML=`<div class="vhead dhead" style="top:92px;max-width:1500px"><span class="dico" style="--c:${C.c}"><svg viewBox="0 0 24 24">${C.ic}</svg></span><div><div class="eyebrow">Settings</div><h1>${C.n}</h1></div></div>
      <div class="slist" style="top:262px">${C.rows.map(k=>rowHTML(setting(k))).join('')}</div>
      <div class="sdesc" style="top:274px"><div class="eyebrow">${C.n}</div><div id="sdT"></div><p id="sdP"></p><div class="sbar" id="sbar" hidden><i></i></div></div>`;
    S.mem.settings={r:0,c:0};
  }
  if(S.view==='settings'&&S.zone==='main'){ const m=S.mem.settings; cur=null; focusAt(m.r,m.c); }
}
/* opening a category: the tile grows into the page and its icon flies into the header */
function ghostOf(root){ const g=root.cloneNode(true); g.removeAttribute('id'); g.className='ghost'; g.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
  g.querySelectorAll('[data-row]').forEach(n=>n.removeAttribute('data-row')); g.querySelectorAll('[data-f]').forEach(n=>n.removeAttribute('data-f'));
  g.querySelectorAll('.f').forEach(n=>n.classList.remove('f','is-focus')); stage.appendChild(g); return g; }
function stageBox(n){ const sr=stage.getBoundingClientRect(),r=n.getBoundingClientRect(); return {x:(r.left-sr.left)/SC,y:(r.top-sr.top)/SC,w:r.width/SC,h:r.height/SC}; }
function staggerIn(root,base){
  const head=root.querySelector('.dhead'); if(head) head.animate([{opacity:0},{opacity:1}],{duration:380,delay:base,fill:'backwards'});
  [...root.querySelectorAll('.slist [data-row]'),root.querySelector('.sdesc')].forEach((n,i)=>n&&n.animate([{opacity:0,transform:'translateY(28px)'},{opacity:1,transform:'none'}],{duration:520,delay:base+60+i*45,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'}));
}
function tilesIn(root,from,base){
  const T=[...root.querySelectorAll('.scat')]; T.forEach((t,i)=>{ if(t.classList.contains('is-focus')) return; t.animate([{opacity:0,transform:'scale(.9)'},{opacity:1,transform:'none'}],{duration:440,delay:base+Math.abs(i-from)*28,easing:'cubic-bezier(.2,.9,.2,1)',fill:'backwards'}); });
  const h=root.querySelector('.vhead'); if(h) h.animate([{opacity:0,transform:'translateY(-14px)'},{opacity:1,transform:'none'}],{duration:400,delay:base,fill:'backwards'});
}
function openCat(tile){
  const k=tile.dataset.k, C=CATS.find(c=>c.k===k), root=$('#setRoot');
  if(k==='prof'){ openView('profiles'); refocus(); return; }
  if(k==='link'){ openLink(); return; }
  refreshFacts();
  if(isRM()){ SCAT=k; renderSettings(); return; }
  const T=stageBox(tile), I=stageBox(tile.querySelector('.ico')), idx=[...root.querySelectorAll('.scat')].indexOf(tile);
  const g=ghostOf(root);
  [...g.querySelectorAll('.scat')].forEach((t,i)=>{ if(i===idx){t.style.visibility='hidden'; return;}
    t.animate([{opacity:1,transform:'none'},{opacity:0,transform:'scale(.9)'}],{duration:230,delay:Math.abs(i-idx)*16,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'}); });
  const gh=g.querySelector('.vhead'); if(gh) gh.animate([{opacity:1},{opacity:0,transform:'translateY(-16px)'}],{duration:180,fill:'forwards'});
  const m=el('<div class="morph"></div>'); stage.appendChild(m);
  m.animate([{clipPath:`inset(${T.y}px ${1920-T.x-T.w}px ${1080-T.y-T.h}px ${T.x}px round 30px)`,background:mix(C.c,'#1d1a17',.72),opacity:1},
             {clipPath:'inset(0px 0px 0px 0px round 0px)',background:'#060504',opacity:1,offset:.72},
             {clipPath:'inset(0px 0px 0px 0px round 0px)',background:'#060504',opacity:0}],{duration:640,easing:'cubic-bezier(.2,.9,.1,1)',fill:'forwards'}).onfinish=()=>m.remove();
  SCAT=k; renderSettings();
  const d=root.querySelector('.dico'), D=stageBox(d); d.style.visibility='hidden';
  const f=el(`<div class="flier" style="--c:${C.c};left:${I.x}px;top:${I.y}px;width:${I.w}px;height:${I.h}px"><svg viewBox="0 0 24 24">${C.ic}</svg></div>`); stage.appendChild(f);
  f.animate([{transform:'translate(0px,0px) scale(1)'},{transform:`translate(${D.x-I.x}px,${D.y-I.y}px) scale(${D.w/I.w})`}],{duration:580,easing:'cubic-bezier(.3,1.25,.4,1)',fill:'forwards'}).onfinish=()=>{d.style.visibility=''; f.remove();};
  setTimeout(()=>{ d.style.visibility=''; f.remove(); },900);
  setTimeout(()=>g.remove(),320);
  staggerIn(root,360);
}
function closeCat(){
  const k=SCAT, root=$('#setRoot'); SCAT=null;
  if(isRM()){ renderSettings(k); return; }
  const g=ghostOf(root); g.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(36px) scale(.98)'}],{duration:220,easing:'ease-in',fill:'forwards'}).onfinish=()=>g.remove();
  setTimeout(()=>g.remove(),400);
  renderSettings(k); tilesIn(root,CATS.findIndex(c=>c.k===k),120);
}
function updSet(){
  $$('#setRoot .srow').forEach(r=>{const s=setting(r.dataset.k); if(s&&!s.tog){const n=r.querySelector('.sv'); if(n) n.textContent=valOf(s);}});
  $$('#setRoot .scat').forEach(t=>{const C=CATS.find(c=>c.k===t.dataset.k); if(C) t.querySelector('small').textContent=C.sum();});
  const af=$('#appsFree'); if(af&&STO) af.textContent=fmtB(STO.free)+' free';
  if(S.view==='settings'&&cur&&cur.dataset.k) descFor(cur.dataset.k);
}
function refreshFacts(){
  NET=N.json('net')||{online:navigator.onLine,type:'',ip:''};
  STO=N.json('storage'); if(STO&&!(STO.total>0)) STO=null;
  HOME=N.json('homeStatus')||{service:false,redirect:true};
  linkRefresh(); updSet();
}
addEventListener('online',refreshFacts); addEventListener('offline',refreshFacts);
function descFor(k){
  const s=setting(k); if(!s||!$('#sdT')) return; $('#sdT').textContent=s.l;
  let d=s.d; const bar=$('#sbar'); bar.hidden=true;
  if(k==='conn') d=NET.online?`This device is online${NET.type?' over '+NET.type:''}. Cain OS uses the device’s own connection; change networks under “Wi-Fi and network”.`:'This device is offline. Check the Wi-Fi or cable under “Wi-Fi and network”. Apps and IPTV need the internet; your own music still plays.';
  if(k==='disp') d=dispDesc();
  if(k==='about') d=`Cain OS ${VER} by Kairn Labs. © 2026 Kairn Labs. All rights reserved.${INFO.model?` Running on ${[INFO.maker,INFO.model].filter(Boolean).join(' ')}, ${INFO.fireos?'Fire OS (Android '+INFO.android+')':'Android '+INFO.android}${INFO.webview?', WebView '+String(INFO.webview).split('.')[0]:''}.`:''} Cain OS has no ads and sends nothing about what you watch to Kairn Labs: profiles, history and provider details stay on this device.`;
  if(k==='storage'){ if(STO){ d=`${fmtB(STO.free)} free of ${fmtB(STO.total)} on this device. Cain OS itself is using ${fmtB(STO.used||0)} for your music, backgrounds and channel list.`; bar.hidden=false; bar.firstChild.style.width=clamp((1-STO.free/STO.total)*100,1,100)+'%'; } else d='This device won’t say how much space is free.'; }
  if(k==='nowAccess') d=N.call('mediaAccess')?'On. When Spotify, YouTube Music or another app is playing, Home shows the song with its cover and controls, and the little island follows you around the menus.':'Lets Home show what Spotify, YouTube Music and other apps are playing, with cover art and play controls. Android calls this “notification access”: press to open that screen, then switch on Cain OS. Cain OS only reads what’s playing, not your notifications.'+(INFO.fireos?' Some Fire TV models hide that screen; the install guide shows the one-line command that turns it on instead.':'');
  if(k==='homeSvc') d=HOME.service?'The helper is on: pressing Home on your remote brings you to Cain OS. To stop it, switch off “Cain OS Home button” in the device’s accessibility settings, or pause it with the switch below.':'Android TV and Fire TV don’t let you pick a different home screen, so Cain OS uses a small helper that notices when the device’s own home screen appears and switches back to Cain OS. Press to open accessibility settings, then turn on “Cain OS Home button”.'+(INFO.fireos?' Fire TV hides that list; the install guide has the one-line command that turns it on from a computer.':'');
  if(k==='voice'&&!INFO.voice) d='This device has no voice typing built in, so search uses the on-screen letters, or your phone’s keyboard through Phone Link.';
  if(k==='iptvSync'&&META) d+=` Last refreshed ${new Date(META.at||0).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}.`;
  $('#sdP').textContent=d;
}

/* ── rail ── */
const NAV=['home','search','movies','shows','live','apps','inputs','settings'];
const NAVL=['Home','Search','Movies','Shows','Live TV','Apps','Inputs','Settings'];
const ICON={
 home:'<path d="M4 10.4 12 4l8 6.4V19a1.6 1.6 0 0 1-1.6 1.6H15v-5.4H9v5.4H5.6A1.6 1.6 0 0 1 4 19z"/>',
 search:'<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.6 15.6 4.6 4.6"/>',
 movies:'<rect x="3.5" y="4" width="17" height="16" rx="2.2"/><path d="M7.6 4v16M16.4 4v16M3.5 9.3h4.1M3.5 14.7h4.1M16.4 9.3h4.1M16.4 14.7h4.1"/>',
 shows:'<rect x="3" y="4.5" width="18" height="12.5" rx="2.2"/><path d="M8.5 20.3h7M12 17v3.3"/>',
 live:'<rect x="3.5" y="7.6" width="17" height="12.6" rx="2.2"/><path d="m8.6 3.6 3.4 4 3.4-4"/><path d="M10.3 11.3v5.4l4.4-2.7z"/>',
 apps:'<rect x="4" y="4" width="6.8" height="6.8" rx="1.8"/><rect x="13.2" y="4" width="6.8" height="6.8" rx="1.8"/><rect x="4" y="13.2" width="6.8" height="6.8" rx="1.8"/><rect x="13.2" y="13.2" width="6.8" height="6.8" rx="1.8"/>',
 inputs:'<rect x="3" y="5" width="18" height="12" rx="2.2"/><path d="M12 20v-3M8.5 20.5h7"/><path d="m10 9 3 2-3 2"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
};
NAV.forEach((v,i)=>$('#nav').appendChild(el(`<div class="ni" data-nav="${i}" style="top:${150+i*84}px;--i:${i}"><span class="ic"><svg viewBox="0 0 24 24">${ICON[v]}</svg></span><span class="lb">${NAVL[i]}</span></div>`)));

/* ── boot wordmark ── */
(()=>{let i=0,h='';
  for(const ch of 'Kairn') h+=`<span class="m"><span style="--i:${i++}">${ch}</span></span>`;
  h+='<span class="gap"></span>';
  for(const ch of 'Labs') h+=`<span class="m labs"><span style="--i:${i++}">${ch}</span></span>`;
  $('#bwm').innerHTML=h;})();

/* ══ focus engine ══════════════════════════════════════ */
const itemsOf=row=>$$('[data-f]',row).filter(e=>!e.closest('[hidden]'));
const rowsOf=()=>{const R=$$(`#v-${S.view} [data-row]`); if(S.view==='home') R.unshift($('#status')); return R.filter(r=>itemsOf(r).length);};
const cx=e=>{const r=e.getBoundingClientRect();return r.left+r.width/2};
function where(R){ if(cur) for(let r=0;r<R.length;r++){ const c=itemsOf(R[r]).indexOf(cur); if(c>=0) return {r,c}; } const m=S.mem[S.view]||{r:0,c:0}; return {r:clamp(m.r,0,R.length-1),c:m.c}; }
function focusAt(r,c,mouse){
  const R=rowsOf(); if(!R.length){ if(cur){ cur.classList.remove('is-focus'); cur=null; } return; }
  r=clamp(r,0,R.length-1); const I=itemsOf(R[r]); c=clamp(c,0,I.length-1);
  S.mem[S.view]={r,c};
  if(cur&&cur!==I[c]){ cur.classList.remove('is-focus'); if(!mouse) snd('move'); }
  cur=I[c]; cur.classList.add('is-focus');
  if(!mouse) scrollRow(R[r],cur);
  shift(R[r],mouse);
  if(S.view==='settings') descFor(cur.dataset.k);
  const g=R[r].dataset.grid; if(g&&r>=R.length-2&&CAT[g].shown<CAT[g].list.length) growCat(g);
}
function focusEl(e){ if(!e) return false; const R=rowsOf(); for(let r=0;r<R.length;r++){const c=itemsOf(R[r]).indexOf(e); if(c>=0){ if(S.zone==='main') focusAt(r,c); else S.mem[S.view]={r,c}; return true; }} return false; }
function refocus(v){
  if(v&&S.view!==v) return; if(S.zone!=='main') return;
  if(cur&&document.contains(cur)&&!cur.closest('[hidden]')&&cur.closest('#v-'+S.view+',#status')){ const R=rowsOf(), w=where(R); S.mem[S.view]=w; return; }
  if(cur){ cur.classList.remove('is-focus'); cur=null; }
  if(S.view==='home'&&focusHomeMain()) return;
  const m=S.mem[S.view]||{r:0,c:0}; focusAt(m.r,m.c);
}
function focusHomeMain(){ return focusEl($('#tApps [data-f]')); }
function scrollRow(row,it){
  const tr=row.querySelector('.track'); if(!tr) return;
  const vw=1920-184-60, pad=150; let off=+tr.dataset.off||0;
  const L=it.offsetLeft, Rr=L+it.offsetWidth;
  if(Rr-off>vw-pad) off=Rr-(vw-pad);
  if(L-off<pad) off=L-pad;
  off=clamp(off,0,Math.max(0,tr.offsetWidth-vw+40));
  tr.dataset.off=off; tr.style.transform=`translateX(${-off}px)`;
}
function shift(row,mouse){
  const sc=$(`#v-${S.view} .scroller`); if(!sc) return;
  const y=+(row.dataset.shift||0), was=sc.dataset.y||'0';
  if(String(y)!==was){ sc.dataset.y=y; sc.style.transform=`translateY(${-y}px)`; if(mouse) hoverBlock=performance.now()+600; }
  if(S.view==='home'){ $('#v-home').classList.toggle('deep',y>0); updIsland(); }
}
function move(dx,dy){
  if(S.zone==='island'){ if(dx){S.isI=clamp(S.isI+dx,0,1); paintIsland();} if(dy>0) leaveIsland(); return; }
  if(S.zone==='nav'){
    if(dy){S.nav=clamp(S.nav+dy,0,NAV.length-1); paintNav();}
    if(dx>0) leaveNav();
    return;
  }
  const R=rowsOf(); if(!R.length){ if(dx<0) enterNav(); return; } const m=where(R);
  if(dx){ const I=itemsOf(R[m.r]); if(m.c+dx<0){enterNav();return} if(m.c+dx<I.length) focusAt(m.r,m.c+dx); return; }
  if(dy){ const nr=m.r+dy; if(nr<0&&islandOn()){ enterIsland(); return; } if(nr<0||nr>=R.length) return;
    const I=itemsOf(R[m.r]), x=cx(I[clamp(m.c,0,I.length-1)]); let best=0,bd=1e9;
    itemsOf(R[nr]).forEach((e,i)=>{const d=Math.abs(cx(e)-x); if(d<bd){bd=d;best=i}});
    focusAt(nr,best); }
}
function paintNav(){
  const vi=NAV.indexOf(S.view);
  $$('.ni').forEach((n,i)=>{n.classList.toggle('act',i===vi); n.classList.toggle('nf',S.zone==='nav'&&i===S.nav);});
  $('#navBar').style.transform=`translateY(${Math.max(0,vi)*84}px)`; $('#navBar').style.visibility=vi<0?'hidden':'';
}
function enterNav(){ S.zone='nav'; S.nav=Math.max(0,NAV.indexOf(S.view)); cur&&cur.classList.remove('is-focus'); stage.classList.add('nav-open'); paintNav(); }
function leaveNav(){ S.zone='main'; stage.classList.remove('nav-open'); paintNav(); if(cur&&document.contains(cur)&&cur.closest('#v-'+S.view+',#status')&&!cur.closest('[hidden]')) cur.classList.add('is-focus'); else { cur=null; refocus(); } }
const SUBVIEW=['profiles','iptv','link','series'];
function openView(v){
  if(v===S.view) return;
  if(M.q) setQueue(false);
  if(SUBVIEW.includes(v)&&!SUBVIEW.includes(S.view)) S.from=S.view;
  if(cur){ cur.classList.remove('is-focus'); }
  $('#v-'+S.view).classList.remove('on'); S.view=v; $('#v-'+v).classList.add('on'); cur=null;
  if(!S.mem[v]) S.mem[v]={r:0,c:0};
  if(v==='profiles'){ const i=PROF.list.findIndex(p=>p.id===PROF.cur); S.mem[v]={r:0,c:Math.max(0,i)}; }
  if(v==='settings'){ SCAT=null; refreshFacts(); renderSettings(); if(!isRM()) tilesIn($('#setRoot'),0,60); }
  if(v==='apps'){ refreshFacts(); }
  if(v==='inputs') renderInputs();
  if(v==='iptv') renderIptv();
  if(v==='link') renderLink();
  if(v==='search') renderSTop();
  KINDS.forEach(k=>{ if(KV[k].view===v&&DIRTY[k]){ DIRTY[k]=false; renderCat(k); } });
  paintNav(); updLayers(); updIsland(); pushLinkState();
}
function goHome(){
  if(S.asking) askDone(false); if(S.busy) return;
  if(S.overlay) closeOverlay(true);
  if(S.zone==='island'){ S.zone='main'; paintIsland(); }
  if(S.zone==='nav'){ S.zone='main'; stage.classList.remove('nav-open'); }
  if(M.q) setQueue(false);
  openView('home'); paintNav(); cur&&cur.classList.remove('is-focus'); cur=null; focusHomeMain()||refocus();
}

/* ── display ── */
let HZ=INFO.dispHz||0; const hzHist=[];
function resLabel(){ const h=INFO.dispH?Math.min(INFO.dispW||0,INFO.dispH)>=2000||Math.max(INFO.dispW||0,INFO.dispH)>=3800?2160:Math.min(INFO.dispW,INFO.dispH):Math.min(2160,Math.round(1080*SC*(devicePixelRatio||1))); return h>=2000?'4K':h>=1400?'1440p':h>=1000?'1080p':h+'p'; }
function dispDesc(){
  const ui=Math.round(1080*SC*(devicePixelRatio||1));
  return `Cain OS draws every frame in step with the screen${HZ?', here '+HZ+' Hz':''}. ${INFO.dispW?`The device is sending ${INFO.dispW}×${INFO.dispH} to your TV. `:''}Menus are drawn at ${ui>=2000?'4K':ui+'p'} (devices usually draw menus at 1080p and save 4K for video). Video from Live TV, Movies and Shows plays at the stream’s own quality, up to 4K HDR when the stream and device support it.`;
}

/* ── actions ── */
function applyPrefs(){
  stage.classList.toggle('nl',!!PREF.nightlight); stage.classList.toggle('rmo',!!PREF.rmotion); stage.classList.toggle('hc',!!PREF.hfocus);
  $('#svClk').className=['','bold','pixel'][setting('clockstyle').i]||''; tick(); syncAwake();
}
function openSys(kind){
  const r=N.call('openSettings',kind||'');
  if(!N.native&&r!=='exact'){ toast('That opens on the TV.'); return; }
  if(r==='general') toast('This device keeps that inside its main Settings, so those opened instead.',4500);
  else if(r!=='exact') toast('This device doesn’t offer that setting.');
}
function openStore(){ if(!N.native){ toast('The app store opens on the TV.'); return; } if(N.call('openStore','')===false) toast('No app store was found on this device. Use “Install from a link” instead.',5000); }
function activate(e){
  const a=e.dataset.act||'', i=+e.dataset.i; snd('sel');
  if(a==='app'){ if(S.view==='search') remember(); launchApp(e.dataset.pkg,e); }
  else if(a==='scat') openCat(e);
  else if(a==='set') setAct(e);
  else if(a==='key') typeKey(e.dataset.k);
  else if(a==='q') setQuery(e.dataset.q);
  else if(a==='voice') startVoice();
  else if(a==='cat') pickCat(e.dataset.kind,i);
  else if(a==='live') playLive(CAT.live.list,i);
  else if(a==='vod') playVod(CAT.vod.list[i]);
  else if(a==='series') openSeries(CAT.series.list[i]);
  else if(a==='slive'){ remember(); playLive((SRES&&SRES.live)||[],i); }
  else if(a==='svod'){ remember(); playVod(((SRES&&SRES.vod)||[])[i]); }
  else if(a==='sseries'){ remember(); const it=((SRES&&SRES.series)||[])[i]; if(it) openSeries(it); }
  else if(a==='cont') playCont(i);
  else if(a==='recent') playLive(WATCH.recent,i);
  else if(a==='store') openStore();
  else if(a==='sideload') sideload();
  else if(a==='input'){ if(N.call('openInput',e.dataset.id)===false) toast('That input couldn’t be opened.'); }
  else if(a.startsWith('sys:')) openSys(a.slice(4));
  else if(a.startsWith('ser:')) serAct(a.slice(4),e);
  else if(a.startsWith('iptv:')) iptvAct(a.slice(5),e);
  else if(a.startsWith('link:')) linkAct(a.slice(5));
  else if(a.startsWith('m:')) music(a.slice(2),e);
  else if(a.startsWith('prof:')) profAct(a.slice(5),e);
  else if(a.startsWith('view:')){ const v=a.slice(5); if(v==='home'){ goHome(); return; } if(v==='link'){ openLink(); return; } if(v==='iptv') IDR=null; openView(v); refocus(); }
}
/* long-press OK (or Menu): pin apps, remove history entries */
function holdAct(){
  if(S.zone!=='main'||!cur) return; const a=cur.dataset.act;
  if(a==='app'&&S.view==='apps'){ togglePin(cur.dataset.pkg); focusEl($(`#appsRoot [data-pkg="${CSS.escape(cur.dataset.pkg||'')}"]`)||$('#appsRoot .tile')); }
  else if(a==='app'&&S.view==='home'){ const p=cur.dataset.pkg; if(N.native) N.call('appInfo',p); else toast('App details open on the TV.'); }
  else if(a==='cont'){ WATCH.cont.splice(+cur.dataset.i,1); saveWatch(); renderShelves(); toast('Removed from Continue Watching'); }
  else if(a==='recent'){ WATCH.recent.splice(+cur.dataset.i,1); saveWatch(); renderShelves(); toast('Removed from Recent Channels'); }
}
let ARM=null;
const armed=(k,msg)=>{ if(ARM&&ARM.k===k&&performance.now()-ARM.t<3000){ ARM=null; return true; } ARM={k,t:performance.now()}; toast(msg); return false; };
function setAct(e){
  const s=setting(e.dataset.k); if(!s) return; const k=s.k;
  if(s.sys!==undefined){ openSys(s.sys); return; }
  if(k==='boot'){ boot(); return; }
  if(k==='saverNow'){ startSaver(); return; }
  if(k==='restart'){ if(N.native) N.call('reload'); else location.reload(); return; }
  if(k==='iptvAcct'){ IDR=null; openView('iptv'); refocus(); return; }
  if(k==='iptvSync'){ if(IPTV) syncIptv(IPTV,false); else { IDR=null; openView('iptv'); refocus(); } return; }
  if(k==='iptvClearW'){ WATCH={cont:[],recent:[]}; saveWatch(); renderShelves(); updSet(); toast('Watch history cleared'); return; }
  if(k==='nowAccess'){ if(N.native&&N.call('mediaAccess')) toast('Already on. To turn it off, open notification access in the device settings.',4500); else { openSys('notif'); if(N.native) toast('Find “Cain OS” in the list and switch it on.',5000); } return; }
  if(k==='musicAdd'){ music('add'); return; }
  if(k==='musicScan'){ if(N.native) N.call('musicScan'); else pickFile('audio/*',importDemoMusic,true); return; }
  if(k==='musicClear'){ if(!userSongs()){ toast('There’s no added music to remove.'); return; } if(!armed(k,'Press again to remove all your songs.')) return;
    if(M.mode==='lib'){ M.playing=false; M.mode='none'; syncAudio(); AU.removeAttribute('src'); AU.dataset.id=''; } N.call('musicClear'); for(let i=LIB.length-1;i>=0;i--) if(!LIB[i].device) LIB.splice(i,1); M.i=0; renderQueue(); renderPlay(); updSet(); toast('Your music was removed'); return; }
  if(k==='wall'){ const opts=SCENES.map(x=>x[0]); if(customWall()) opts.push('custom'); const i=opts.indexOf(me().wall); me().wall=opts[(i+1)%opts.length]; saveProf(); applyWall(); return; }
  if(k==='wallAdd'){ if(N.native){ toast('Choose “Background” on the Phone Link page.',4500); openLink(); } else pickFile('image/*,video/*',f=>{ DEMOWALL[me().id]={url:URL.createObjectURL(f),kind:f.type.startsWith('video')?'video':'image'}; me().wall='custom'; saveProf(); wallCur=null; applyWall(); toast('Background added'); }); return; }
  if(k==='wallRemove'){ if(!customWall()){ toast('This profile hasn’t added a background.'); return; } N.call('deleteUserMedia','wall',me().id); delete DEMOWALL[me().id]; loadUserMedia(); if(me().wall==='custom') me().wall='lowtide'; saveProf(); wallCur=null; applyWall(); toast('Background removed'); return; }
  if(k==='sclear'){ PREF.hist=[]; savePref(); updSet(); renderSTop(); toast('Search history cleared'); return; }
  if(k==='homeSvc'){ if(HOME.service) toast('Already on. Switch it off in the device’s accessibility settings.',4500); else { openSys('accessibility'); if(N.native) toast('Turn on “Cain OS Home button” in the list.',5000); } return; }
  if(k==='stockHome'){ if(!N.native){ toast('That opens on the TV.'); return; } if(N.call('openStockHome')===false) toast('The original home screen couldn’t be opened from here.'); return; }
  if(k==='store'){ openStore(); return; }
  if(k==='sideload'){ sideload(); return; }
  if(k==='dockReset'){ delete PREF.dock; savePref(); renderDock(); renderApps(); updSet(); toast('The dock picks your apps automatically again'); return; }
  if(k==='devname'){ ask('Name this device',PREF.dev||'Cain OS','System').then(v=>{ if(!v) return; PREF.dev=v.slice(0,30); savePref(); updSet(); pushLinkState(); toast(`This device is now “${PREF.dev}”`); }); return; }
  if(k==='reset'){ if(!armed(k,'Press Erase again to remove everything Cain OS saved on this device.')) return;
    try{ Object.keys(localStorage).filter(x=>x.startsWith('cain.')).forEach(x=>localStorage.removeItem(x)); }catch(_){}
    N.call('iptvClear'); N.call('musicClear'); N.call('deleteUserMedia','wall','*'); N.call('deleteUserMedia','photo','*'); N.call('linkForget'); N.call('linkStop');
    toast('Erasing…'); setTimeout(()=>{ if(N.native) N.call('reload'); else location.reload(); },700); return; }
  if(s.tog){
    if(k==='voice'&&!INFO.voice){ toast('This device has no voice typing built in.'); return; }
    s.on=!s.on; PREF[k]=s.on; savePref(); e.querySelector('.sw').classList.toggle('on',s.on); e.querySelector('.sv').textContent=s.on?'On':'Off';
    if(k==='live'){ S.live=s.on; live.clear(); }
    if(k==='homeRedirect'){ N.call('setPref','homeRedirect',s.on?'1':'0'); HOME.redirect=s.on; updSet(); }
    if(k==='voice'||k==='shist') renderSTop();
    applyPrefs(); return; }
  if(s.cycle){ s.i=(s.i+1)%s.cycle.length; e.querySelector('.sv').textContent=s.cycle[s.i]; PREF[k]=s.i; savePref(); applyPrefs(); return; }
  descFor(k);
}
function back(){
  if(S.zone==='island'){ leaveIsland(); return; }
  if(S.zone==='nav'){ if(S.view==='home') leaveNav(); else { S.zone='main'; stage.classList.remove('nav-open'); goHome(); } return; }
  if(S.view==='home'){ if(M.q){ setQueue(false); return; } if(!(cur&&cur.closest('#rowDock'))&&focusHomeMain()) return; enterNav(); return; }
  if(S.view==='series'){ SER=null; openView(S.from&&S.from!=='series'?S.from:'shows'); refocus(); return; }
  if(SUBVIEW.includes(S.view)){ const to=S.from||'home'; if(to==='home') goHome(); else { openView(to); refocus(); } return; }
  if(S.view==='settings'&&SCAT){ closeCat(); return; }
  enterNav();
}

/* ══ screensaver + power ═══════════════════════════════ */
const QUOTES=[
 ['First say to yourself what you would be; and then do what you have to do.','Epictetus'],
 ['Very little is needed to make a happy life.','Marcus Aurelius'],
 ['Adopt the pace of nature: her secret is patience.','Ralph Waldo Emerson'],
 ['Our life is frittered away by detail. Simplify, simplify.','Henry David Thoreau'],
 ['A journey of a thousand miles begins with a single step.','Lao Tzu'],
];
let svI=0, svQi=0, svTimers=[], idleAt=performance.now(), hintT=0;
function poke(){ idleAt=performance.now(); }
function svQuote(first){
  const [q,by]=QUOTES[svQi%QUOTES.length]; svQi++;
  const set=()=>{const i=q.indexOf(' '); $('#svQ').innerHTML=`<em>${q.slice(0,i)}</em>${q.slice(i)}`; $('#svBy').textContent='— '+by; $('#svQ').style.opacity=$('#svBy').style.opacity='';};
  if(first){set(); return;} $('#svQ').style.opacity=$('#svBy').style.opacity=0; setTimeout(set,900);
}
function svShift(){ const dx=Math.round((Math.random()-.5)*48),dy=Math.round((Math.random()-.5)*36); $('#svText').style.transform=$('#svNow').style.transform=`translate(${dx}px,${dy}px)`; }
function startSaver(){
  if(S.saver||S.boot||S.off||S.asking||S.busy||S.hidden) return; S.saver=true;
  if(S.zone==='nav'){S.zone='main'; stage.classList.remove('nav-open');} if(S.zone==='island'){ S.zone='main'; paintIsland(); }
  const s=$('#saver'); s.hidden=false; stage.classList.add('saving'); svQuote(true); tick(); renderPlay();
  void s.offsetWidth; s.classList.add('on','hint'); clearTimeout(hintT); hintT=setTimeout(()=>s.classList.remove('hint'),4000);
  const builtIn=!(me().wall==='custom'&&customWall()); svI=Math.max(0,SCENES.findIndex(x=>x[0]===me().wall));
  updIsland(); svTimers.forEach(clearInterval); svTimers=[setInterval(()=>{ if(builtIn){svI=(svI+1)%SCENES.length; setScene(SCENES[svI][0]);} svQuote(); },90000), setInterval(svShift,45000)];
  updLayers();
}
function stopSaver(){
  if(!S.saver) return; S.saver=false; svTimers.forEach(clearInterval); svTimers=[]; const s=$('#saver'); s.classList.remove('on'); stage.classList.remove('saving');
  setTimeout(()=>{ if(!S.saver) s.hidden=true; },950); if(!(me().wall==='custom'&&customWall())) setScene(me().wall); poke(); updLayers(); updIsland(); refocus();
}
/* going dark: black picture, and stop holding the device awake so its own sleep timer can run */
function syncAwake(){ N.call('keepAwake',!S.off&&!S.hidden&&(SAVER_MIN[setting('saver').i]>0||OFF_MIN[setting('off').i]>0)); }
function screenOff(){ if(S.off) return; stopSaver(); if(S.overlay) closeOverlay(true); S.off=true; const o=$('#off'); o.hidden=false; void o.offsetWidth; o.classList.add('on'); syncAwake(); }
function wake(){ if(!S.off) return; S.off=false; const o=$('#off'); o.classList.remove('on'); o.hidden=true; poke(); syncAwake(); boot(); }
setInterval(()=>{
  if(S.hidden||S.asking||S.busy) { poke(); return; }
  const idle=performance.now()-idleAt;
  const offM=OFF_MIN[setting('off').i]; if(offM&&!S.off&&!S.overlay&&!M.playing&&idle>offM*60000){ screenOff(); return; }
  const mins=SAVER_MIN[setting('saver').i]; if(!mins||S.saver||S.boot||S.off||S.overlay) return; if(idle>mins*60000) startSaver();
},1000);

/* ══ input: the remote (through the app), a keyboard, or a mouse ═════════ */
function onKey(k){
  poke();
  if(S.off){ wake(); return; }
  if(S.saver){ stopSaver(); return; }
  if(S.boot){ if(k!=='home') fly(); return; }
  if(k==='home'){ goHome(); return; }
  if(S.asking){ if(k==='back') askDone(false); return; }
  if(S.busy) return;
  if(k==='mtoggle'||k==='mplay'||k==='mpause'||k==='mnext'||k==='mprev'){ if(M.active||LIB.length){ if(!M.active&&LIB.length) music('start'); else music(k.slice(1)); } return; }
  if(S.overlay){ if(k==='back'||k==='ok') closeOverlay(); return; }
  if(k==='left') move(-1,0); else if(k==='right') move(1,0);
  else if(k==='up') move(0,-1); else if(k==='down') move(0,1);
  else if(k==='ok'){ if(S.zone==='nav'){ const v=NAV[S.nav]; S.zone='main'; stage.classList.remove('nav-open'); if(v==='home') goHome(); else { openView(v); paintNav(); refocus(); } } else if(S.zone==='island') activate($$('#island [data-f]')[S.isI]); else if(cur&&document.contains(cur)) activate(cur); else refocus(); }
  else if(k==='back') back();
  else if(k==='hold'||k==='menu') holdAct();
  else if(k==='search') voiceAnywhere();
}
const KEYMAP={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Enter:'ok',' ':'ok',Escape:'back',ContextMenu:'menu',F2:'hold',MediaPlayPause:'mtoggle',MediaTrackNext:'mnext',MediaTrackPrevious:'mprev'};
addEventListener('keydown',e=>{
  const k=e.key;
  if(S.asking){ poke(); if(e.target!==$('#askI')){ if(k==='Escape'){ e.preventDefault(); askDone(false); } else $('#askI').focus(); } return; }
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  if(KEYMAP[k]){ e.preventDefault(); onKey(KEYMAP[k]); return; }
  if(k==='Backspace'){ e.preventDefault(); poke(); if(S.off||S.saver||S.boot||S.busy||S.overlay){ onKey('back'); return; } if(S.view==='search'&&S.zone==='main'&&Q) typeKey('delete'); else onKey('back'); return; }
  if(S.off||S.saver||S.boot){ onKey('any'); return; }
  if(S.busy||S.overlay) return;
  if(S.view==='search'&&/^[a-z0-9]$/i.test(k)){ poke(); typeKey(k.toLowerCase()); }
  else if(S.view!=='search'&&(k==='v'||k==='V'||k==='/')){ e.preventDefault(); onKey('search'); }
});
let wheelT=0;
stage.addEventListener('wheel',e=>{
  e.preventDefault(); poke(); if(S.off){wake(); return;} if(S.saver){ stopSaver(); return; }
  const n=performance.now(); if(S.boot||S.overlay||S.asking||S.busy||n-wheelT<180) return; wheelT=n;
  if(Math.abs(e.deltaX)>Math.abs(e.deltaY)) move(Math.sign(e.deltaX),0); else move(0,Math.sign(e.deltaY));
},{passive:false});
let lmx=-1,lmy=-1;
addEventListener('mousemove',e=>{ if(Math.abs(e.clientX-lmx)+Math.abs(e.clientY-lmy)>6){ if(lmx>=0){ poke(); if(S.saver) stopSaver(); } lmx=e.clientX; lmy=e.clientY; } });
stage.addEventListener('mouseover',e=>{
  if(S.boot||S.overlay||S.saver||S.off||S.asking||S.busy||performance.now()<hoverBlock) return;
  const n=e.target.closest('#nav');
  if(n){ const ni=e.target.closest('.ni'); if(S.zone!=='nav') enterNav(); if(ni){S.nav=+ni.dataset.nav; paintNav();} return; }
  const f=e.target.closest('[data-f]'); if(!f||(f===cur&&S.zone==='main')||f.closest('#island')) return;
  const R=rowsOf(); for(let r=0;r<R.length;r++){const c=itemsOf(R[r]).indexOf(f);
    if(c>=0){ if(S.zone==='nav'){S.zone='main'; stage.classList.remove('nav-open'); paintNav();} if(S.zone==='island'){ S.zone='main'; paintIsland(); } focusAt(r,c,true); return; }}
});
$('#nav').addEventListener('mouseleave',()=>{ if(S.zone==='nav'&&!S.boot&&!S.saver) leaveNav(); });
stage.addEventListener('click',e=>{
  poke();
  if(S.asking){ if(!e.target.closest('.askIn')) askDone(false); return; }
  if(S.off){ wake(); return; }
  if(S.saver){ stopSaver(); return; }
  if(S.boot){ fly(); return; }
  if(S.busy) return;
  if(S.overlay){ closeOverlay(); return; }
  const n=e.target.closest('.ni'); if(n&&S.zone==='nav'){ S.nav=+n.dataset.nav; onKey('ok'); return; }
  const f=e.target.closest('[data-f]'); if(!f) return;
  if(f.closest('#island')){ activate(f); return; }
  if(f!==cur){ const R=rowsOf(); R.forEach((row,r)=>{const c=itemsOf(row).indexOf(f); if(c>=0) focusAt(r,c,true);}); }
  if(cur===f) activate(f);
});
stage.addEventListener('contextmenu',e=>{ const f=e.target.closest('[data-f]'); if(f&&f===cur){ e.preventDefault(); holdAct(); } });

/* ── coming back from an app, the player or the device settings ── */
CainOS.on('pause',()=>{ S.hidden=true; if(M.mode==='lib'&&M.playing) music('pause'); const v=$('#wCustom video'); if(v) v.pause(); });
CainOS.on('resume',()=>{
  S.hidden=false; poke(); if(S.overlay==='launch') closeOverlay(true);
  if(listening){ listening=false; renderSTop(); }
  N.call('loadApps'); onExternal(N.json('media')); refreshFacts(); tick(); syncAwake(); updLayers(); if(S.view==='link') renderLink(); refocus();
});
document.addEventListener('visibilitychange',()=>{ if(!N.native) S.hidden=document.hidden; });

/* ── clock ── */
function tick(){const d=new Date(),tm=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:!PREF.h24});
  $('#clk').textContent=tm;
  if(S.saver){ $('#svClk').textContent=tm.replace(/\s?[AP]\.?M\.?$/i,''); $('#svDate').textContent=d.toLocaleDateString([],{weekday:'long'})+' · '+d.toLocaleDateString([],{month:'short',day:'numeric'}); }}
setInterval(()=>{tick(); greet();},5000);

/* ══ frame loop: runs at the display's own refresh rate (60, 120, 144 Hz…) ══ */
let lastT=0, fc=0, ft0=0;
function loop(now){
  requestAnimationFrame(loop);
  const dt=lastT?Math.min(.05,(now-lastT)/1000):0; lastT=now;
  if(!ft0) ft0=now; fc++;
  if(now-ft0>=1000){const raw=fc*1000/(now-ft0); fc=0; ft0=now;
    if(raw>20&&!document.hidden&&!S.hidden){const RATES=[24,30,48,50,60,72,75,90,100,120,144,165,240];
      hzHist.push(RATES.reduce((a,b)=>Math.abs(b-raw)<Math.abs(a-raw)?b:a)); if(hzHist.length>6) hzHist.shift();
      const nh=Math.max(...hzHist); if(nh!==HZ&&!INFO.dispHz){HZ=nh; updSet();}}}
  if(document.hidden||S.hidden||S.off) return;
  if(isRM()){ live.clear(); return; }
  if(S.live&&wallVisible()&&wallCur!=='custom') live.draw(dt,now/1000); else live.clear();
  M.amp+=((M.playing?1:.07)-M.amp)*Math.min(1,dt*5);
  const t=now/1000;
  if($('#island').classList.contains('on')) drawWave($('#isWave'),t,18);
  if(M.active&&S.view==='home'&&!S.overlay&&!S.saver) drawWave($('#mpWave'),t,12);
}
requestAnimationFrame(loop);

let rzT=0;
addEventListener('resize',()=>{ fit(); sizeWaves(); clearTimeout(rzT); rzT=setTimeout(()=>{ updSet(); const n=calcRes(); if(n>RES+.2){ RES=n; live.size(); const w=wallCur; wallCur=null; if(w&&w!=='custom') setScene(w); } },300); });

/* ══ boot ══════════════════════════════════════════════ */
let bootT=[];
function boot(){
  const b=$('#boot'); S.boot=true; S.zone='main'; $('#island').classList.remove('on'); stage.classList.remove('live','nav-open');
  if(S.overlay) closeOverlay(true);
  b.hidden=false; b.className='reset'; void b.offsetWidth; b.className='run';
  bootT.forEach(clearTimeout); bootT=[setTimeout(fly,isRM()?500:3800)];
}
function fly(){
  const b=$('#boot'); if(!S.boot||b.classList.contains('fly')) return;
  bootT.forEach(clearTimeout); b.classList.add('fly'); stage.classList.add('live');
  paintNav(); cur=null; refocus();
  bootT=[setTimeout(()=>{ b.hidden=true; S.boot=false; poke(); updIsland(); },1150)];
}

/* ══ start ═════════════════════════════════════════════ */
loadUserMedia(); loadWatch(); loadMeta(); linkRefresh();
N.call('setPref','profile',PROF.cur); N.call('setPref','homeRedirect',PREF.homeRedirect===false?'0':'1');
paintNav(); renderProfiles(); applyWall(); renderDock(); renderApps(); renderShelves(); renderSTop(); renderQ(); renderSettings(); applyPrefs();
loadLibrary(false); onExternal(N.json('media')); renderPlay(); refreshFacts(); pushLinkState();
N.call('loadApps');
setTimeout(autoRefresh,8000);
setInterval(()=>{ if(!S.hidden&&M.mode!=='lib') onExternal(N.json('media')); },15000);
Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1500))]).then(()=>requestAnimationFrame(()=>requestAnimationFrame(boot)));
