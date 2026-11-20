"use strict";
/* =====================================================================
   MIRADOR · ACREDITACIONES FLAT — ventana de SALIDA
   Lienzo de la sala (Oeste · Norte · Este). En la pared del medio va la
   página https://www.flatfestival.org/acreditaciones/ (QR, actividades del
   día). Detrás, en las tres paredes, las partículas de la web de FLAT:
   la figura que se transforma (centrada en la pared del medio) y un campo
   que cubre todo el lienzo. Todas se apartan, giran y se agitan donde hay
   gente.

   La ventana de control (index.html?app=acreditaciones) manda por
   BroadcastChannel dónde está cada persona en el PISO de la sala:
     x = posición a lo ancho (0 = pared Oeste, 1 = pared Este)
     z = distancia a la pared Norte (en px del lienzo)
   y acá se decide qué parte de cada pared se modifica: sobre Norte, frente
   a la persona; sobre Oeste y Este, a la altura de su profundidad. Cuanto
   más cerca de una pared, más chica y más fuerte es la huella.

   Sin control: ?demo=3 mueve tres personas de prueba.
   ===================================================================== */
(() => {
const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FLAT_URL = 'https://www.flatfestival.org/acreditaciones/';

/* valores de fábrica: los mismos que P.acred en js/core.js (el control manda los suyos en cada cuadro) */
const DEF = { modo:'sala', alcance:.7, radio:260, altura:.55, fuerza:1, remolino:.5, agitar:1, quieto:.45, tinte:.6, crecer:.6,
  cantidad:1, tamano:1, deriva:1, brillo:1, figura:true, figuraEscala:1, paralaje:.35,
  pagina:true, pagEscala:1, velo:.55, color1:'#ccff00', color2:'#9999ff', ahorrar:true, verMirador:false };
let cfg = Object.assign({}, DEF);
let room = { W:8400, H:690, walls:[{ nombre:'Oeste', w:3175 }, { nombre:'Norte', w:1775 }, { nombre:'Este', w:3450 }] };
let fit = Q.get('ajuste') === 'contener' ? 'contener' : 'estirar';
let people = [], peopleT = 0;
const demoN = +(Q.get('demo') || 0);

/* ---------- sala: paredes en px del lienzo ---------- */
function paredes(){
  const ws = room.walls && room.walls.length ? room.walls : [{ nombre:'', w:room.W }];
  const tot = ws.reduce((a, w) => a + w.w, 0) || 1; let x = 0;
  return ws.map(w => { const o = { nombre:w.nombre, x0:x / tot * room.W, w:w.w / tot * room.W }; x += w.w; return o; });
}
function paredMedio(){ const p = paredes(); return p.find(w => /norte/i.test(w.nombre)) || p[Math.floor(p.length / 2)]; }

/* ---------- de la persona en el piso a las huellas en las paredes ---------- */
function huellas(p){
  const ps = paredes(), H = room.H, out = [], R0 = cfg.radio, y = H * cfg.altura;
  const una = (key, X, dn, w) => { const rx = R0 * (.55 + .9 * Math.min(dn, 1.5)); out.push({ key:p.id + ':' + key, x:X, y, rx, ry:Math.max(rx * .9, H * .45), w }); };
  if (cfg.modo === 'sala' && ps.length === 3 && p.x != null && p.z != null) {
    const [O, N, E] = ps, alc = Math.max(40, cfg.alcance * N.w);
    const cand = [
      ['N', N.x0 + clamp(p.x, 0, 1) * N.w, p.z],                              // Norte: frente a la persona
      ['O', O.x0 + clamp(O.w - p.z, 0, O.w), p.x * N.w],                      // Oeste: a la altura de su profundidad
      ['E', E.x0 + clamp(p.z, 0, E.w), (1 - p.x) * N.w],                      // Este: lo mismo, del otro lado
    ].map(([k, X, d]) => ({ k, X, dn:Math.max(0, d) / alc, w:Math.exp(-((Math.max(0, d) / alc) ** 2)) }));
    const wm = Math.max(...cand.map(c => c.w)); const up = wm > 1e-4 && wm < .6 ? .6 / wm : 1;   // lejos de todo: la pared más cercana igual responde
    for (const c of cand) if (c.w * up > .02) una(c.k, c.X, c.dn, Math.min(1, c.w * up));
  } else if (p.u != null) {
    una('u', clamp(p.u, 0, 1) * room.W, p.t != null ? clamp(1 - p.t, 0, 1.5) : .5, 1);   // pared que la persona tiene detrás (como Mirador)
  }
  return out;
}

/* ---------- huellas suavizadas (entran y salen de a poco) ---------- */
const INF = new Map(); const MAXI = 32;
const hex = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0xccff00; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const slotDe = new Map(); let slotN = 0;
function actualizarHuellas(dt, now){
  const vivos = now - peopleT < 700 ? people : [];
  const seen = new Set(), k = 1 - Math.exp(-dt * 7), kw = 1 - Math.exp(-dt * 3.5);
  for (const p of vivos) {
    if (!slotDe.has(p.id)) slotDe.set(p.id, slotN++);
    const e = clamp(cfg.quieto + (1 - cfg.quieto) * Math.min(1, p.e || 0), 0, 1);
    for (const h of huellas(p)) { seen.add(h.key);
      let a = INF.get(h.key); if (!a) { a = { x:h.x, y:h.y, rx:h.rx, ry:h.ry, w:0, e:0, c:slotDe.get(p.id) % 2 }; INF.set(h.key, a); }
      a.x += (h.x - a.x) * k; a.y += (h.y - a.y) * k; a.rx += (h.rx - a.rx) * k; a.ry += (h.ry - a.ry) * k;
      a.w += (h.w * e - a.w) * kw; a.e += (Math.min(1.5, p.e || 0) - a.e) * kw; }
  }
  for (const [key, a] of INF) if (!seen.has(key)) { a.w += (0 - a.w) * kw; a.e *= 1 - kw; if (a.w < .004) INF.delete(key); }
  if (slotDe.size > 200) slotDe.clear();
}

/* ---------- personas de prueba ---------- */
function demoPeople(t){
  const ps = paredes(), zMax = ps.length === 3 ? Math.max(ps[0].w, ps[2].w) : 3000, out = [];
  for (let i = 0; i < demoN; i++) { const ph = i * 2.1;
    out.push({ id:'demo' + i, x:.5 + .46 * Math.sin(t * .23 + ph), z:zMax * (.5 + .46 * Math.sin(t * .17 + ph * 1.7)), u:.5 + .4 * Math.sin(t * .2 + ph), h:.6, e:.5 + .5 * Math.sin(t * .9 + ph) }); }
  return out;
}

/* =====================================================================
   WebGL
   ===================================================================== */
const cv = $('fx');
const gl = cv.getContext('webgl2', { alpha:false, antialias:false, depth:true, powerPreference:'high-performance' });
const SNOISE = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+1.0*C.xxx;vec3 x2=x0-i2+2.0*C.xxx;vec3 x3=x0-1.0+3.0*C.xxx;i=mod(i,289.0);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));float n_=1.0/7.0;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){float value=0.0;float amp=0.5;float freq=1.5;for(int i=0;i<3;i++){value+=amp*snoise(p*freq);freq*=2.0;amp*=0.5;}return value;}
`;
/* parte común: la gente modifica las partículas (todo en px del lienzo) y salida a la ventana */
const COMUN = `
uniform vec4 uInf[${MAXI}];   /* x, y, radio x, radio y */
uniform vec4 uInfB[${MAXI}];  /* peso, movimiento */
uniform vec3 uInfC[${MAXI}];  /* color */
uniform int uInfN;
uniform float uTime,uPush,uSwirl,uAgit,uTint,uGrow,uBright,uMinPx;
uniform vec2 uWall,uScale;
out vec3 vCol; out vec2 vAx;
vec2 influir(vec2 p,float rnd,out float glow,out vec3 tint){
  vec2 disp=vec2(0.);float agit=0.;glow=0.;tint=vec3(0.);
  for(int i=0;i<${MAXI};i++){ if(i>=uInfN)break;
    vec4 a=uInf[i];vec4 b=uInfB[i];vec2 q=(p-a.xy)/a.zw;float f=exp(-dot(q,q)*1.6)*b.x;
    if(f<.002)continue;
    vec2 n=normalize(q+vec2(1e-4,2e-4));
    disp+=n*a.zw*f*.42*uPush;
    disp+=vec2(-n.y,n.x)*a.z*f*.25*uSwirl*sin(uTime*.7+rnd*6.283+float(i)*1.3);
    agit+=f*b.y;glow+=f;tint+=uInfC[i]*f; }
  if(glow>1e-4)tint/=glow;
  if(agit>.004){vec2 j=vec2(snoise(vec3(p*.012,uTime*2.6+rnd*9.)),snoise(vec3(p*.012+41.,uTime*2.6+rnd*5.)));disp+=j*agit*uAgit*46.;}
  return disp;
}
void emitir(vec2 p,float D,float z){
  gl_Position=vec4(p.x/uWall.x*2.-1.,1.-p.y/uWall.y*2.,z,1.);
  vec2 s=max(vec2(D)*uScale,vec2(uMinPx));float ps=max(s.x,s.y);gl_PointSize=D>0.?ps:0.;vAx=s/ps;
}
`;
const VS_CAMPO = `#version 300 es
precision highp float;
in vec2 aHome; in vec2 aRnd;
uniform float uSize,uDrift,uCount;
${SNOISE}${COMUN}
void main(){
  vec2 p=aHome*uWall;
  p.x=mod(p.x+uTime*uDrift*(4.+aRnd.x*9.),uWall.x);
  p+=vec2(snoise(vec3(aHome*vec2(11.,1.)*1.3,uTime*.05+aRnd.y*3.)),snoise(vec3(aHome.yx*vec2(1.,11.)*1.3+17.,uTime*.05)))*80.*min(uDrift,2.);
  float glow;vec3 tint;p+=influir(p,aRnd.x,glow,tint);
  float g=clamp(glow,0.,1.);
  float lum=mix(.2,.95,pow(aRnd.y,2.2));vec3 col=vec3(lum,lum,lum*1.05);
  col=mix(col,tint*(.55+.6*lum)+.08,g*uTint);
  vCol=col*uBright*(1.+g*.5);
  float D=(2.4+aRnd.x*3.2)*uSize*(1.+g*uGrow);
  if(fract(aRnd.x*91.7+aRnd.y*13.3)>uCount)D=0.;
  emitir(p,D,.9);
}`;
const VS_FIGURA = `#version 300 es
precision highp float;
in vec3 position; in vec3 aTargetPosition; in float aRandom; in float aType;
uniform float uProgress,uVibration,uMorphProgress,uRingReveal,uFigScale,uFocal,uSize;
uniform mat3 uRot; uniform mat4 uView; uniform vec2 uCenter;
${SNOISE}${COMUN}
void main(){
  /* la figura de la web de FLAT (comun/fondo.js): planeta que se deshace en lenguas + anillos */
  vec3 p=mix(position,aTargetPosition,uMorphProgress);vec3 newPos=p;
  if(aType<0.5){
    vec3 dir=normalize(p+vec3(0.0001));float patchNoise=snoise(dir*2.2);float patchFactor=smoothstep(-0.25,0.25,patchNoise);
    float localStart=patchFactor*0.45+(floor(aRandom*6.0)/6.0)*0.08;float activeProgress=max(0.0,uProgress-localStart);
    float speedMultiplier=0.6+patchFactor*0.7;float moveDistance=pow(activeProgress*1.5,1.8)*15.0*speedMultiplier;
    vec3 tongueDir=normalize(dir+vec3(snoise(vec3(dir.xy*1.5,1.0)),snoise(vec3(dir.yz*1.5,2.0)),snoise(vec3(dir.zx*1.5,3.0)))*0.15);
    vec3 solidPos=p+dir*(fbm(dir*4.0)*0.01);newPos=solidPos+(tongueDir*moveDistance);
    if(uVibration>0.01){vec3 vibNoise=vec3(snoise(p*12.0+vec3(uTime*25.0,0.0,0.0)),snoise(p*12.0+vec3(0.0,uTime*25.0,0.0)),snoise(p*12.0+vec3(0.0,0.0,uTime*25.0)));newPos+=vibNoise*0.12*uVibration*(1.0+activeProgress);}
  } else {
    float waveMotion=sin(uTime*1.2+p.x*1.5+p.z*1.5+aRandom*6.28)*0.15;vec3 wavePos=vec3(p.x,p.y+waveMotion,p.z);
    float angleOffset=uTime*0.1*(0.8+aRandom*0.3);float cosA=cos(angleOffset),sinA=sin(angleOffset);mat2 rot=mat2(cosA,-sinA,sinA,cosA);vec2 rotatedXZ=rot*vec2(wavePos.x,wavePos.z);
    vec3 disturbedPos=vec3(rotatedXZ.x,wavePos.y,rotatedXZ.y);float ringProgress=max(0.0,uProgress-0.1);
    vec3 ringTurbulence=vec3(snoise(disturbedPos*1.2+uTime*0.08),snoise(disturbedPos*1.2+uTime*0.08+5.0),snoise(disturbedPos*1.2+uTime*0.08+10.0));
    vec3 scatterDir=normalize(disturbedPos+ringTurbulence*0.25+vec3(0.001));newPos=disturbedPos+scatterDir*(pow(ringProgress*1.4,1.7)*12.0*(0.8+aRandom*0.4));
    if(uVibration>0.01){vec3 vibNoise=vec3(snoise(p*8.0+vec3(uTime*20.0,0.0,0.0)),snoise(p*8.0+vec3(0.0,uTime*20.0,0.0)),snoise(p*8.0+vec3(0.0,0.0,uTime*20.0)));newPos+=vibNoise*0.08*uVibration;}
  }
  vec3 lightDir=normalize(vec3(0.8,1.0,0.5));vec3 normal=normalize(newPos+vec3(0.0001));float diff=max(dot(normal,lightDir),0.0);
  vec3 col=mix(vec3(0.45,0.45,0.48),vec3(0.95,0.95,1.0),diff*0.7);
  float reveal=(aType<0.5)?1.0:smoothstep(aRandom-0.12,aRandom+0.12,uRingReveal);
  /* a la pared: perspectiva centrada en la pared del medio */
  vec4 v=uView*vec4(uRot*newPos*uFigScale,1.);float zz=-v.z;
  vec2 w=uCenter+uFocal*vec2(v.x,-v.y)/max(zz,.3);
  float glow;vec3 tint;w+=influir(w,aRandom,glow,tint);
  float g=clamp(glow,0.,1.);
  col=mix(col,tint*(.6+.5*diff)+.08,g*uTint);
  vCol=col*uBright*(1.+g*.5);
  float D=(3.6+aRandom*3.0)*reveal*(10./max(zz,.3))*.64*uSize*(1.+g*uGrow);
  if(zz<.3)D=0.;
  emitir(w,D,clamp(zz/40.,0.,.85)*2.-1.);
}`;
const FS = `#version 300 es
precision mediump float;
in vec3 vCol; in vec2 vAx; out vec4 o;
void main(){vec2 c=(gl_PointCoord-.5)*2./vAx;float d=length(c);if(d>1.)discard;o=vec4(vCol*smoothstep(1.,.8,d),1.);}`;

function prog(vs, fs){
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; return { p, U:n => (n in u ? u[n] : (u[n] = gl.getUniformLocation(p, n))) };
}

/* ---------- figuras (generadores de comun/fondo.js) ---------- */
function generateSphere(count, p) { for (let i=0;i<count;i++){const u=Math.random(),v=Math.random();const t=2*Math.PI*u;const ph=Math.acos(2*v-1);const r=1.2+(Math.random()-0.5)*0.04;p[i*3]=r*Math.sin(ph)*Math.cos(t);p[i*3+1]=r*Math.sin(ph)*Math.sin(t);p[i*3+2]=r*Math.cos(ph);} }
function generateKleinBottle(count, p) { for (let i=0;i<count;i++){const u=Math.random()*Math.PI*2,v=Math.random()*Math.PI*2,r0=0.8;const x=(r0+Math.cos(u/2)*Math.sin(v)-Math.sin(u/2)*Math.sin(2*v))*Math.cos(u);const y=(r0+Math.cos(u/2)*Math.sin(v)-Math.sin(u/2)*Math.sin(2*v))*Math.sin(u);const z=Math.sin(u/2)*Math.sin(v)+Math.cos(u/2)*Math.sin(2*v);const s=0.95+(Math.random()-0.5)*0.03;p[i*3]=x*s;p[i*3+1]=y*s;p[i*3+2]=z*s;} }
function generateMobiusStrip(count, p) { for (let i=0;i<count;i++){const u=Math.random()*Math.PI*2,v=(Math.random()-0.5)*1.0,R=1.15;const x=(R+v*Math.cos(u/2))*Math.cos(u);const y=(R+v*Math.cos(u/2))*Math.sin(u);const z=v*Math.sin(u/2);const s=1.0+(Math.random()-0.5)*0.02;p[i*3]=x*s;p[i*3+1]=z*s;p[i*3+2]=y*s;} }
function generateTorusKnot(count, p) { for (let i=0;i<count;i++){const t=Math.random()*Math.PI*2,phi=Math.random()*Math.PI*2;const tr=0.28+(Math.random()-0.5)*0.06;const kx=(Math.sin(t)+2*Math.sin(2*t))*0.42;const ky=(Math.cos(t)-2*Math.cos(2*t))*0.42;const kz=-Math.sin(3*t)*0.42;p[i*3]=kx+tr*Math.cos(phi)*Math.cos(t);p[i*3+1]=ky+tr*Math.sin(phi);p[i*3+2]=kz+tr*Math.cos(phi)*Math.sin(t);} }
function generateBoySurface(count, p) { for (let i=0;i<count;i++){const u=Math.random()*Math.PI,v=Math.random()*Math.PI,s=1.25;const x=s*Math.sin(2*u)*Math.pow(Math.sin(v),2);const y=s*Math.sin(u)*Math.sin(2*v);const z=s*Math.cos(u)*Math.sin(2*v);const n=(Math.random()-0.5)*0.03;p[i*3]=x+n;p[i*3+1]=y+n;p[i*3+2]=z+n;} }
function generateEnneperSurface(count, p) { for (let i=0;i<count;i++){const u=(Math.random()-0.5)*2.2,v=(Math.random()-0.5)*2.2;const x=u-(u*u*u)/3+u*v*v;const y=v-(v*v*v)/3+v*u*u;const z=u*u-v*v;const s=0.55+(Math.random()-0.5)*0.02;p[i*3]=x*s;p[i*3+1]=z*s;p[i*3+2]=y*s;} }
function generateTesseract(count, p) { const V=[];for(let a=-1;a<=1;a+=2)for(let b=-1;b<=1;b+=2)for(let c=-1;c<=1;c+=2)for(let d=-1;d<=1;d+=2)V.push([a,b,c,d]);const E=[];for(let i=0;i<16;i++)for(let j=i+1;j<16;j++){let df=0;for(let k=0;k<4;k++)if(V[i][k]!==V[j][k])df++;if(df===1)E.push([V[i],V[j]]);}const rxw=0.6,ryw=0.4;for(let i=0;i<count;i++){const e=E[i%E.length],t=Math.random();const x4=e[0][0]*(1-t)+e[1][0]*t,y4=e[0][1]*(1-t)+e[1][1]*t,z4=e[0][2]*(1-t)+e[1][2]*t,w4=e[0][3]*(1-t)+e[1][3]*t;const x4r=x4*Math.cos(rxw)-w4*Math.sin(rxw);const w4r=x4*Math.sin(rxw)+w4*Math.cos(rxw);const y4r=y4*Math.cos(ryw)-w4r*Math.sin(ryw);const w4f=y4*Math.sin(ryw)+w4r*Math.cos(ryw);const dist=2.4;const fov=dist/(dist-w4f*0.4);const j=(Math.random()-0.5)*0.06;p[i*3]=x4r*fov*0.75+j;p[i*3+1]=y4r*fov*0.75+j;p[i*3+2]=z4*fov*0.75+j;} }
function generateTorus(count, p) { for (let i=0;i<count;i++){const u=Math.random()*Math.PI*2,v=Math.random()*Math.PI*2,R=1.1;const r=0.45+(Math.random()-0.5)*0.04;p[i*3]=(R+r*Math.cos(v))*Math.cos(u);p[i*3+1]=r*Math.sin(v);p[i*3+2]=(R+r*Math.cos(v))*Math.sin(u);} }
function generateDiniSurface(count, p) { for (let i=0;i<count;i++){const u=0.05+Math.random()*1.95,v=Math.random()*Math.PI*4,a=0.9,b=0.18;const su=Math.sin(u),cu=Math.cos(u);const x=a*Math.cos(v)*su;const y=a*Math.sin(v)*su;const z=a*(cu+Math.log(Math.tan(u/2)))+b*v-1.1;const s=0.65,n=(Math.random()-0.5)*0.03;p[i*3]=x*s+n;p[i*3+1]=z*s+n;p[i*3+2]=y*s+n;} }
function generateGyroid(count, p) { let f=0;while(f<count){const x=(Math.random()-0.5)*3.0,y=(Math.random()-0.5)*3.0,z=(Math.random()-0.5)*3.0;const d=Math.sqrt(x*x+y*y+z*z);if(d>1.45)continue;const g=Math.sin(x*2.5)*Math.cos(y*2.5)+Math.sin(y*2.5)*Math.cos(z*2.5)+Math.sin(z*2.5)*Math.cos(x*2.5);if(Math.abs(g)<0.4){p[f*3]=x*0.85;p[f*3+1]=y*0.85;p[f*3+2]=z*0.85;f++;}} }
function generatePenroseTriangle(count, p) { const n=[[-1.1,-0.6,0.2],[1.1,-0.6,-0.2],[0.0,1.2,0.4]];for(let i=0;i<count;i++){const ei=i%3,s=n[ei],e=n[(ei+1)%3],t=Math.random(),an=Math.random()*Math.PI*2,rb=0.18+(Math.random()-0.5)*0.05;const bx=s[0]*(1-t)+e[0]*t,by=s[1]*(1-t)+e[1]*t,bz=s[2]*(1-t)+e[2]*t;p[i*3]=bx+rb*Math.cos(an);p[i*3+1]=by+rb*Math.sin(an);p[i*3+2]=bz+rb*Math.cos(an*2.0);} }
function generateHelicoidCatenoid(count, p) { const al=0.8;for(let i=0;i<count;i++){const u=(Math.random()-0.5)*2.2,v=(Math.random()-0.5)*Math.PI*2;const sh=Math.sinh(u),ch=Math.cosh(u);const x=Math.cos(al)*ch*Math.sin(v)+Math.sin(al)*sh*Math.cos(v);const y=Math.cos(al)*ch*Math.cos(v)-Math.sin(al)*sh*Math.sin(v);const z=Math.cos(al)*u+Math.sin(al)*v;const s=0.5,n=(Math.random()-0.5)*0.03;p[i*3]=x*s+n;p[i*3+1]=(z-0.5)*s+n;p[i*3+2]=y*s+n;} }
const SHAPES = [generateKleinBottle, generatePenroseTriangle, generateTesseract, generateBoySurface, generateMobiusStrip, generateDiniSurface, generateGyroid, generateTorusKnot, generateEnneperSurface, generateHelicoidCatenoid, generateTorus, generateSphere];
function applyEulerRotation(x,y,z,rx,ry,rz){let cx=Math.cos(rx),sx=Math.sin(rx);let y1=y*cx-z*sx,z1=y*sx+z*cx,x1=x;let cy=Math.cos(ry),sy=Math.sin(ry);let x2=x1*cy+z1*sy,z2=-x1*sy+z1*cy,y2=y1;let cz=Math.cos(rz),sz=Math.sin(rz);let x3=x2*cz-y2*sz,y3=x2*sz+y2*cz,z3=z2;return [x3,y3,z3];}
const ringConfigs = [
  { minR:1.28,maxR:1.52,rx:0.2,ry:0.1,rz:0.0,vSpread:0.064,waveAmp:0.20 }, { minR:1.68,maxR:2.24,rx:-0.65,ry:0.4,rz:0.3,vSpread:0.28,waveAmp:0.36 },
  { minR:2.48,maxR:2.64,rx:0.85,ry:-0.5,rz:-0.2,vSpread:0.04,waveAmp:0.12 }, { minR:2.88,maxR:3.60,rx:-0.2,ry:-0.9,rz:0.6,vSpread:0.36,waveAmp:0.44 },
  { minR:1.44,maxR:1.92,rx:1.25,ry:0.8,rz:-0.7,vSpread:0.16,waveAmp:0.24 }, { minR:3.84,maxR:4.16,rx:-0.1,ry:0.2,rz:-0.1,vSpread:0.08,waveAmp:0.16 }];
function generateRingWaves(count, startIndex, p) {
  for (let i=0;i<count;i++){const idx=startIndex+i;const ri=i%ringConfigs.length;const c=ringConfigs[ri];const an=Math.random()*Math.PI*2;const r=c.minR+Math.random()*(c.maxR-c.minR);const h=Math.sin(an*3.0+ri*1.5)*c.waveAmp+(Math.random()-0.5)*c.vSpread;const x0=r*Math.cos(an),y0=h,z0=r*Math.sin(an);const [rx,ry,rz]=applyEulerRotation(x0,y0,z0,c.rx,c.ry,c.rz);p[idx*3]=rx;p[idx*3+1]=ry;p[idx*3+2]=rz;}
}
const PLANET = 26000, RING = 9000, TOTAL = PLANET + RING, CAMPO_MAX = 90000, CAMPO_BASE = 40000;

let pCampo, pFig, vaoCampo, vaoFig, bufPos, bufTgt, posArr, tgtArr, glOk = false;
let curShape = 0, nextShape = 1, hasReset = false, uProg = 0, rotY = 0, rotZ = 0, camX = 0, camY = 0;
function figura(i, arr){ SHAPES[i](PLANET, arr); generateRingWaves(RING, PLANET, arr); }
function otra(i){ let n; do { n = Math.floor(Math.random() * SHAPES.length); } while (n === i); return n; }
function initGL(){
  pCampo = prog(VS_CAMPO, FS); pFig = prog(VS_FIGURA, FS);
  const attr = (p, name, buf, size, usage) => { const loc = gl.getAttribLocation(p.p, name); if (loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
  const buffer = (data, usage) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW); return b; };
  // campo: parte suelta por todo el lienzo y parte en cintas onduladas que cruzan las tres paredes
  const home = new Float32Array(CAMPO_MAX * 2), rnd = new Float32Array(CAMPO_MAX * 2);
  for (let i = 0; i < CAMPO_MAX; i++) { const x = Math.random(); let y = Math.random();
    if (i % 5 < 2) { const b = i % 3; y = .5 + .34 * Math.sin(x * (9 + b * 4) + b * 2.1) * (.6 + .4 * Math.sin(x * 3.1 + b)) + (Math.random() - .5) * .09; }
    home[i * 2] = x; home[i * 2 + 1] = y; rnd[i * 2] = Math.random(); rnd[i * 2 + 1] = Math.random(); }
  vaoCampo = gl.createVertexArray(); gl.bindVertexArray(vaoCampo);
  attr(pCampo, 'aHome', buffer(home), 2); attr(pCampo, 'aRnd', buffer(rnd), 2);
  // figura
  posArr = new Float32Array(TOTAL * 3); tgtArr = new Float32Array(TOTAL * 3); const ra = new Float32Array(TOTAL), ty = new Float32Array(TOTAL);
  for (let i = 0; i < TOTAL; i++) { ra[i] = Math.random(); ty[i] = i < PLANET ? 0 : 1; }
  curShape = Math.floor(Math.random() * SHAPES.length); nextShape = otra(curShape); figura(curShape, posArr); figura(nextShape, tgtArr);
  vaoFig = gl.createVertexArray(); gl.bindVertexArray(vaoFig);
  bufPos = buffer(posArr, gl.DYNAMIC_DRAW); attr(pFig, 'position', bufPos, 3);
  bufTgt = buffer(tgtArr, gl.DYNAMIC_DRAW); attr(pFig, 'aTargetPosition', bufTgt, 3);
  attr(pFig, 'aRandom', buffer(ra), 1); attr(pFig, 'aType', buffer(ty), 1);
  gl.bindVertexArray(null); glOk = true;
}

/* ciclo de la figura (120 s), igual que en la web: quieta, se deshace, vibra y vuelve transformada en otra */
const TOTAL_CYCLE = 120, P1_TIME = 42, P2_TIME = 54;
function ciclo(elapsed){
  const ct = elapsed % TOTAL_CYCLE; let prog_ = 0, vib = 0, morph = 0;
  if (ct < P1_TIME) { hasReset = false; prog_ = ct < 15 ? 0 : (ct - 15) / (P1_TIME - 15) * .2; }
  else if (ct < P1_TIME + P2_TIME) { prog_ = .2 + Math.pow((ct - P1_TIME) / P2_TIME, 1.8) * .75; }
  else { const ph = ct - (P1_TIME + P2_TIME);
    if (ph < 12) { prog_ = 1; vib = Math.sin(ph / 12 * Math.PI); }
    else { const rt = (ph - 12) / 12; prog_ = 1 - Math.pow(rt, 1.5); vib = (1 - rt) * .5;
      if (!hasReset) { const x = clamp(rt / .9, 0, 1); morph = x * x * (3 - 2 * x);
        if (rt >= .9) { hasReset = true; posArr.set(tgtArr); curShape = nextShape; nextShape = otra(curShape); figura(nextShape, tgtArr);
          gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, posArr); gl.bindBuffer(gl.ARRAY_BUFFER, bufTgt); gl.bufferSubData(gl.ARRAY_BUFFER, 0, tgtArr); morph = 0; } } } }
  uProg += (prog_ - uProg) * .08;
  return { vib, morph };
}

/* ---------- disposición: lienzo en la ventana, página en la pared del medio ---------- */
const stage = $('stage'), frame = $('pagina'), mir = $('mir');
let rect = { x:0, y:0, w:1, h:1 }, layoutKey = '';
function layout(){
  const vw = innerWidth, vh = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  if (fit === 'estirar') rect = { x:0, y:0, w:vw, h:vh };
  else { const s = Math.min(vw / room.W, vh / room.H); rect = { w:room.W * s, h:room.H * s, x:(vw - room.W * s) / 2, y:(vh - room.H * s) / 2 }; }
  const N = paredMedio(), k = clamp(cfg.pagEscala || 1, .3, 3);
  const key = [vw, vh, dpr, fit, room.W, room.H, N.x0, N.w, k, cfg.pagina].join();
  if (key === layoutKey) return; layoutKey = key;
  cv.style.cssText = `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px`;
  cv.width = Math.max(2, Math.round(rect.w * dpr)); cv.height = Math.max(2, Math.round(rect.h * dpr));
  stage.style.width = room.W + 'px'; stage.style.height = room.H + 'px';
  stage.style.transform = `translate(${rect.x}px,${rect.y}px) scale(${rect.w / room.W},${rect.h / room.H})`;
  frame.style.left = N.x0 + 'px'; frame.style.width = (N.w / k) + 'px'; frame.style.height = (room.H / k) + 'px'; frame.style.transform = `scale(${k})`;
  frame.style.display = cfg.pagina ? '' : 'none';
}
addEventListener('resize', layout);

/* ---------- la página de FLAT ---------- */
const Pagina = { modo:'', qr:'',
  async cargar(){
    // por el servidor local (servidor.py la trae de flatfestival.org sin su fondo, para que se vean las partículas de la sala);
    // si no está ese servidor, se muestra la página tal cual, con su propio fondo
    let ok = false; try { const r = await fetch('flat/acreditaciones/', { method:'HEAD', cache:'no-store' }); ok = r.ok; } catch (e) {}
    this.modo = ok ? 'integrada' : 'directa'; frame.classList.toggle('directa', !ok);
    frame.src = ok ? 'flat/acreditaciones/?t=' + Date.now() : FLAT_URL;
  },
  doc(){ try { return frame.contentDocument; } catch (e) { return null; } },
  tick(){ const d = this.modo === 'integrada' ? this.doc() : null; if (!d || !d.documentElement) return;
    d.documentElement.style.setProperty('--velo', String(cfg.velo)); // (la página guarda el texto real en __f mientras corre su efecto de letras)
    const u = d.getElementById('url'); this.qr = u ? ((u.firstChild && u.firstChild.__f) || u.textContent) : ''; },
};

/* ---------- canal con la ventana de control ---------- */
let ch = null; try { ch = new BroadcastChannel('mirador-acred'); } catch (e) {}
if (ch) ch.onmessage = e => { const d = e.data || {};
  if (d.k === 'f') { people = d.people || []; peopleT = performance.now(); if (d.cfg) cfg = Object.assign({}, DEF, d.cfg); if (d.room) room = d.room; if (d.fit) fit = d.fit; $('m')?.remove(); }
  else if (d.k === 'recargar') Pagina.cargar(); };
addEventListener('keydown', e => { if (e.key === 'F11') return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const d = Pagina.doc(); if (d) d.dispatchEvent(new KeyboardEvent('keydown', { key:e.key, bubbles:true })); e.preventDefault(); return; }
  if (ch) ch.postMessage({ k:'key', key:e.key, shift:e.shiftKey }); if (e.key === ' ') e.preventDefault(); });
addEventListener('dblclick', () => document.documentElement.requestFullscreen?.().catch(() => {}));

/* ---------- bucle ---------- */
let t0 = performance.now(), last = t0, fpsA = 0, fpsN = 0, fps = 0, stT = 0, err = '';
const fI = new Float32Array(MAXI * 4), fB = new Float32Array(MAXI * 4), fC = new Float32Array(MAXI * 3);
function comunes(p, n, t){
  gl.uniform4fv(p.U('uInf'), fI); gl.uniform4fv(p.U('uInfB'), fB); gl.uniform3fv(p.U('uInfC'), fC); gl.uniform1i(p.U('uInfN'), n);
  gl.uniform1f(p.U('uTime'), t); gl.uniform1f(p.U('uPush'), cfg.fuerza); gl.uniform1f(p.U('uSwirl'), cfg.remolino); gl.uniform1f(p.U('uAgit'), cfg.agitar);
  gl.uniform1f(p.U('uTint'), cfg.tinte); gl.uniform1f(p.U('uGrow'), cfg.crecer); gl.uniform1f(p.U('uBright'), cfg.brillo); gl.uniform1f(p.U('uMinPx'), 1.25);
  gl.uniform2f(p.U('uWall'), room.W, room.H); gl.uniform2f(p.U('uScale'), cv.width / room.W, cv.height / room.H);
}
function dibujar(now){
  requestAnimationFrame(dibujar);
  const dt = Math.min((now - last) / 1000, .1); last = now; const t = (now - t0) / 1000;
  if (demoN) { people = demoPeople(t); peopleT = now; }
  layout(); actualizarHuellas(dt, now);
  if (glOk) {
    const c1 = hex(cfg.color1), c2 = hex(cfg.color2); let n = 0, sx = 0, sw = 0; const N = paredMedio();
    for (const a of INF.values()) { if (n >= MAXI) break; fI.set([a.x, a.y, a.rx, a.ry], n * 4); fB.set([a.w, a.e, 0, 0], n * 4); fC.set(a.c ? c2 : c1, n * 3); n++; sx += (a.x - (N.x0 + N.w / 2)) / room.W * a.w; sw += a.w; }
    const { vib, morph } = ciclo(t);
    // la cámara de la figura acompaña a la gente (como el mouse en la web)
    const tx = sw > .01 ? clamp(sx / sw * 2, -1, 1) * 8 * cfg.paralaje : 0; camX += (tx - camX) * .03; camY += (0 - camY) * .03; rotY += .0008 * dt * 60; rotZ += .0003 * dt * 60;
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.disable(gl.BLEND);
    gl.useProgram(pCampo.p); comunes(pCampo, n, t);
    gl.uniform1f(pCampo.U('uSize'), cfg.tamano); gl.uniform1f(pCampo.U('uDrift'), cfg.deriva);
    const cant = clamp(Math.round(CAMPO_BASE * cfg.cantidad), 0, CAMPO_MAX); gl.uniform1f(pCampo.U('uCount'), 1.1);
    gl.bindVertexArray(vaoCampo); if (cant) gl.drawArrays(gl.POINTS, 0, cant);
    if (cfg.figura) {
      gl.useProgram(pFig.p); comunes(pFig, n, t);
      gl.uniform1f(pFig.U('uSize'), cfg.tamano); gl.uniform1f(pFig.U('uProgress'), uProg); gl.uniform1f(pFig.U('uVibration'), vib); gl.uniform1f(pFig.U('uMorphProgress'), morph); gl.uniform1f(pFig.U('uRingReveal'), 1);
      gl.uniform1f(pFig.U('uFigScale'), cfg.figuraEscala); gl.uniform1f(pFig.U('uFocal'), room.H * 1.2071); gl.uniform2f(pFig.U('uCenter'), N.x0 + N.w / 2, room.H / 2);
      const cy = Math.cos(rotY), sy = Math.sin(rotY), cz = Math.cos(rotZ), sz = Math.sin(rotZ);   // Ry · Rz
      gl.uniformMatrix3fv(pFig.U('uRot'), false, [cy * cz, sz, -sy * cz, -cy * sz, cz, sy * sz, sy, 0, cy]);
      // vista: cámara en (camX, camY, 7.5) mirando al centro
      const e = [camX, camY, 7.5], l = Math.hypot(e[0], e[1], e[2]), f = [-e[0] / l, -e[1] / l, -e[2] / l];
      let s = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0]; const sl = Math.hypot(s[0], s[1], s[2]); s = s.map(v => v / sl);
      const u = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      gl.uniformMatrix4fv(pFig.U('uView'), false, [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, e), -dot(u, e), dot(f, e), 1]);
      gl.bindVertexArray(vaoFig); gl.drawArrays(gl.POINTS, 0, TOTAL);
    }
    gl.bindVertexArray(null);
  }
  fpsA += 1 / Math.max(dt, 1e-4); fpsN++;
  if (now - stT > 1000) { stT = now; fps = Math.round(fpsA / Math.max(1, fpsN)); fpsA = fpsN = 0; Pagina.tick();
    if (ch) ch.postMessage({ k:'s', fps, huellas:INF.size, pagina:Pagina.modo, qr:Pagina.qr, w:innerWidth, h:innerHeight, err }); }
}
/* para probar y diagnosticar desde la consola */
window.ACRED = { get cfg(){ return cfg; }, set cfg(v){ cfg = Object.assign({}, DEF, v); }, get room(){ return room; }, INF, Pagina, get fps(){ return fps; }, huellas,
  set people(v){ people = v; peopleT = performance.now() + 1e9; } };

try { if (!gl) throw new Error('este navegador no tiene WebGL 2'); initGL(); }
catch (e) { err = e.message; console.error(e); const m = $('m'); if (m) m.textContent = 'No se pudieron iniciar las partículas: ' + e.message; }
gl && cv.addEventListener('webglcontextlost', e => { e.preventDefault(); setTimeout(() => location.reload(), 500); });
layout(); Pagina.cargar(); requestAnimationFrame(dibujar);
})();
