"use strict";
/* =====================================================================
   MIRADOR — efectos por GPU (todo en shaders, nada crece en la CPU)
   Inspirados en:
   · Adrien M & Claire B, Pixel (2014): partículas proyectadas que el
     cuerpo aparta, cortinas verticales de luz.            → particulas
   · Klaus Obermaier, Apparition (2004): una trama que el cuerpo
     deforma y por la que pasa.                             → membrana
   · Golan Levin, Augmented Hand Series (2014): el contorno del cuerpo
     deformado en tiempo real.                              → liquida, ondas
   · Optical Flow de TouchDesigner: velocidad del movimiento inyectada
     en partículas y fluidos. Acá sale del esqueleto (no de la imagen,
     que el proyector contamina).                           → motion, fluido
   Productores: 'motion' (campo de velocidad del cuerpo) y 'maskblur'
   (silueta difuminada en dos escalas, para gradientes y distancias).
   ===================================================================== */

/* ---------- texturas de punto flotante ---------- */
const FX = { f32:null, f16:null, lin16:false, lin32:false, deriv:false };
(function detectFloat(){
  if (!gl) return;
  const e16 = gl.getExtension('OES_texture_half_float'); gl.getExtension('EXT_color_buffer_half_float');
  FX.lin16 = !!gl.getExtension('OES_texture_half_float_linear');
  const e32 = gl.getExtension('OES_texture_float'); gl.getExtension('WEBGL_color_buffer_float');
  FX.lin32 = !!gl.getExtension('OES_texture_float_linear');
  FX.deriv = !!gl.getExtension('OES_standard_derivatives');
  const test = type => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, type, null);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); gl.deleteTexture(t); return ok; };
  if (e32 && test(gl.FLOAT)) FX.f32 = gl.FLOAT;
  if (e16 && test(e16.HALF_FLOAT_OES)) FX.f16 = e16.HALF_FLOAT_OES;
  if (!FX.f16 && FX.f32) { FX.f16 = FX.f32; FX.lin16 = FX.lin32; }
})();
const FX_OK = !!(FX.f16 || FX.f32);
function fboF(w, h, type, linear){
  type = type || FX.f16; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
  const flt = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, flt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, flt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { t, f, w, h };
}
function dfbo(w, h, type, linear){ const a = fboF(w, h, type, linear), b = fboF(w, h, type, linear); return { w, h, read:a, write:b, swap(){ const x = this.read; this.read = this.write; this.write = x; } }; }
function freeD(d){ if (d) { freeFBO(d.read); freeFBO(d.write); } }
function clearF(o){ gl.bindFramebuffer(gl.FRAMEBUFFER, o.f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }

/* ---------- paletas (3 colores: sombra → medio → luz) ---------- */
const PALETAS = {
  aurora:  ['#06122e', '#00d6a0', '#eafff4'], fuego:  ['#2a0200', '#ff4d00', '#fff0b8'], hielo: ['#00101f', '#38a8ff', '#ffffff'],
  oro:     ['#140b00', '#d9a03a', '#fff6dc'], neon:   ['#22003a', '#ff2fb3', '#62f4ff'], tinta: ['#000612', '#2d55ff', '#d8efff'],
  coral:   ['#22000f', '#ff6a5c', '#ffe3c8'], bosque: ['#00140a', '#4be37a', '#f1ffcf'], lavanda:['#0e0420', '#9a6bff', '#ffe6ff'],
  sangre:  ['#120000', '#c3002f', '#ffd0d0'], mono:   ['#000000', '#7d7d7d', '#ffffff'], cuerpo:['', '', ''],
};
const PALETA_OPTS = [['aurora', 'aurora (verde agua)'], ['fuego', 'fuego'], ['hielo', 'hielo'], ['oro', 'oro'], ['neon', 'neón'], ['tinta', 'tinta azul'], ['coral', 'coral'], ['bosque', 'bosque'], ['lavanda', 'lavanda'], ['sangre', 'sangre'], ['mono', 'blanco y negro'], ['cuerpo', 'color de cada cuerpo']];
function paletteRGB(name, hue){
  if (name === 'cuerpo' || !PALETAS[name]) { const h = (hue ?? 200) + AM.hue; return [hsvToRgb(h, 1, .12), hsvToRgb(h, .85, .9), hsvToRgb(h + 20, .25, 1)]; }
  const p = PALETAS[name]; if (!AM.hue) return p.map(hexRGB);
  return p.map(hexRGB).map(c => { const [h, s, v] = rgbToHsv(c); return hsvToRgb(h + AM.hue, s, v); });
}
function rgbToHsv([r, g, b]){ const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, mx ? d / mx : 0, mx]; }
function setPalette(p, name, hue){ const c = paletteRGB(name, hue); gl.uniform3f(U(p, 'uC0'), ...c[0]); gl.uniform3f(U(p, 'uC1'), ...c[1]); gl.uniform3f(U(p, 'uC2'), ...c[2]); }
const tWrap = () => nowT % 1000;   // tiempo acotado: en fp16 (Mac) más de ~2000 s pierde precisión

/* ---------- GLSL común ---------- */
const GLSL_HP = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
const GLSL_NOISE = `vec3 permute(vec3 x){return mod(((x*34.)+1.)*x,289.);}
float snoise(vec2 v){const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod(i,289.);
vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m=m*m;m=m*m;
vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 ox=floor(x+.5);vec3 a0=x-ox;
m*=1.79284291400159-.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.*dot(m,g);}
vec2 curl(vec2 p){float e=.07;float a=snoise(p+vec2(0.,e)),b=snoise(p-vec2(0.,e)),c=snoise(p+vec2(e,0.)),d=snoise(p-vec2(e,0.));return vec2(a-b,-(c-d))/(2.*e);}
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec3 pal(float t,vec3 a,vec3 b,vec3 c){t=clamp(t,0.,1.);return t<.5?mix(a,b,t*2.):mix(b,c,t*2.-1.);}`;

/* splats en lote: hasta 24 por pasada (x,y,radio²) y (valor rgb) */
const MAXS = 24;
const FS_SPLAT = GLSL_HP + `varying vec2 v_uv;uniform sampler2D uT;uniform vec4 uP[${MAXS}];uniform vec4 uV[${MAXS}];uniform int uN;uniform float uAsp,uKeep;
void main(){vec4 base=texture2D(uT,v_uv)*uKeep;vec3 add=vec3(0.);
for(int i=0;i<${MAXS};i++){if(i>=uN)break;vec2 d=v_uv-uP[i].xy;d.x*=uAsp;add+=exp(-dot(d,d)/uP[i].z)*uV[i].xyz;}
gl_FragColor=vec4(base.xyz+add,1.);}`;
let pSplat = null;
/* splats del cuerpo: articulaciones con su velocidad (alto de la imagen por segundo) */
const _spl = { frame:-1, list:[] }; let _frameNo = 0;
function bodySplats(dt){
  if (_spl.frame === _frameNo) return _spl.list;
  _spl.frame = _frameNo; const L = _spl.list; L.length = 0; const ms = P.track.minScore, inv = 1 / Math.max(dt, 1 / 120);
  for (const b of bodies.values()) { const sc = bodyScale(b) / H;
    for (const i of [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) { const k = b.kp[i]; if (!k || k.s < ms) continue;
      const hand = i === 9 || i === 10 || i === 15 || i === 16;
      L.push({ x:k.x / W, y:1 - k.y / H, vx:clamp(k.vx * inv / H, -6, 6), vy:clamp(-k.vy * inv / H, -6, 6), r:sc * (hand ? .22 : .34), hue:b.hue, hand }); } }
  return L;
}
/* aplica splats a un doble FBO. val(s) → [r,g,b]; radio en alto de imagen */
function applySplats(target, list, val, rMul, keep = 1){
  if (!pSplat) return; gl.useProgram(pSplat); gl.disable(gl.BLEND);
  const P4 = new Float32Array(MAXS * 4), V4 = new Float32Array(MAXS * 4); const asp = W / H;
  let n = 0, any = false;
  const flush = () => { bindFBO(target.write); useTex(0, target.read.t, pSplat, 'uT');
    gl.uniform4fv(U(pSplat, 'uP[0]'), P4); gl.uniform4fv(U(pSplat, 'uV[0]'), V4); gl.uniform1i(U(pSplat, 'uN'), n);
    gl.uniform1f(U(pSplat, 'uAsp'), asp); gl.uniform1f(U(pSplat, 'uKeep'), any ? 1 : keep); drawQuad(pSplat); target.swap(); any = true; n = 0; };
  for (const s of list) { const v = val(s); if (!v) continue; const r = Math.max(.002, s.r * rMul);
    P4.set([s.x, s.y, r * r, 0], n * 4); V4.set([v[0], v[1], v[2], 0], n * 4); if (++n === MAXS) flush(); }
  if (n || (!any && keep !== 1)) flush();
}

/* ===================== PRODUCTOR: motion (campo de velocidad del cuerpo) ===================== */
const motion = { d:null, w:0, h:0 };
registerModule('motion', { producer:true, res:'motion', needs:[],
  alloc(){ this.resize(); }, resize(){ if (!FX_OK) return; freeD(motion.d); motion.h = 64; motion.w = clamp(Math.round(64 * W / H), 32, 1024); motion.d = dfbo(motion.w, motion.h, FX.f16, FX.lin16); },
  free(){ freeD(motion.d); motion.d = null; },
  produce(){ if (!motion.d) return; const dt = motion.dt || 1 / 60;
    // el campo se apaga solo en ~0.4 s y suma la velocidad de cada articulación
    applySplats(motion.d, bodySplats(dt), s => [s.vx * .35, s.vy * .35, 0], 1.3, Math.exp(-dt / .4)); } });

/* ===================== PRODUCTOR: maskblur (silueta difuminada) ===================== */
const mblur = { a:null, b:null, a2:null, b2:null };
registerModule('maskblur', { producer:true, res:'maskblur', needs:['mask'],
  alloc(){ this.resize(); },
  resize(){ this.free(); const lin = FX.f16 ? FX.lin16 : true, mk = (w, h) => FX.f16 ? fboF(w, h, FX.f16, lin) : fboFixed(w, h);
    const w1 = Math.max(8, MASK_W >> 1), h1 = Math.max(8, MASK_H >> 1), w2 = Math.max(4, MASK_W >> 3), h2 = Math.max(4, MASK_H >> 3);
    mblur.a = mk(w1, h1); mblur.b = mk(w1, h1); mblur.a2 = mk(w2, h2); mblur.b2 = mk(w2, h2); },
  free(){ [mblur.a, mblur.b, mblur.a2, mblur.b2].forEach(freeFBO); mblur.a = mblur.b = mblur.a2 = mblur.b2 = null; },
  produce(){ if (!mblur.a) return; gl.disable(gl.BLEND); gl.useProgram(pBlur);
    const pass = (src, dst, dx, dy) => { bindFBO(dst); useTex(0, src.t, pBlur, 'uTex'); gl.uniform2f(U(pBlur, 'uDir'), dx / dst.w, dy / dst.h); drawQuad(pBlur); };
    pass(fbMask, mblur.a, 1.5, 0); pass(mblur.a, mblur.b, 0, 1.5); pass(mblur.b, mblur.a, 3, 0); pass(mblur.a, mblur.b, 0, 3);   // cerca: mblur.b
    pass(mblur.b, mblur.a2, 2, 0); pass(mblur.a2, mblur.b2, 0, 2); pass(mblur.b2, mblur.a2, 4, 0); pass(mblur.a2, mblur.b2, 0, 4); pass(mblur.b2, mblur.a2, 6, 0); pass(mblur.a2, mblur.b2, 0, 6);   // lejos: mblur.b2
  } });

/* ===================== FLUIDO — humo / tinta de luz ===================== */
const VS_FL = `attribute vec2 a_pos;varying vec2 v_uv,vL,vR,vT,vB;uniform vec2 uTx;
void main(){v_uv=a_pos*.5+.5;vL=v_uv-vec2(uTx.x,0.);vR=v_uv+vec2(uTx.x,0.);vT=v_uv+vec2(0.,uTx.y);vB=v_uv-vec2(0.,uTx.y);gl_Position=vec4(a_pos,0.,1.);}`;
const FL_HEAD = GLSL_HP + `varying vec2 v_uv,vL,vR,vT,vB;`;
const FS_ADV = FL_HEAD + `uniform sampler2D uVel,uSrc;uniform vec2 uTx;uniform float uDt,uDiss;
void main(){vec2 c=v_uv-uDt*texture2D(uVel,v_uv).xy*uTx;gl_FragColor=vec4(texture2D(uSrc,c).xyz*uDiss,1.);}`;
const FS_DIV = FL_HEAD + `uniform sampler2D uVel;void main(){float L=texture2D(uVel,vL).x,R=texture2D(uVel,vR).x,T=texture2D(uVel,vT).y,B=texture2D(uVel,vB).y;
vec2 C=texture2D(uVel,v_uv).xy;if(vL.x<0.)L=-C.x;if(vR.x>1.)R=-C.x;if(vT.y>1.)T=-C.y;if(vB.y<0.)B=-C.y;gl_FragColor=vec4(.5*(R-L+T-B),0.,0.,1.);}`;
const FS_CURL = FL_HEAD + `uniform sampler2D uVel;void main(){float L=texture2D(uVel,vL).y,R=texture2D(uVel,vR).y,T=texture2D(uVel,vT).x,B=texture2D(uVel,vB).x;gl_FragColor=vec4(.5*(R-L-T+B),0.,0.,1.);}`;
const FS_VORT = FL_HEAD + `uniform sampler2D uVel,uCurl;uniform float uCurlAmt,uDt;
void main(){float L=texture2D(uCurl,vL).x,R=texture2D(uCurl,vR).x,T=texture2D(uCurl,vT).x,B=texture2D(uCurl,vB).x,C=texture2D(uCurl,v_uv).x;
vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+1e-4;f*=uCurlAmt*C;f.y*=-1.;vec2 v=texture2D(uVel,v_uv).xy+f*uDt;gl_FragColor=vec4(clamp(v,-1000.,1000.),0.,1.);}`;
const FS_PRES = FL_HEAD + `uniform sampler2D uP,uDiv;void main(){float L=texture2D(uP,vL).x,R=texture2D(uP,vR).x,T=texture2D(uP,vT).x,B=texture2D(uP,vB).x,d=texture2D(uDiv,v_uv).x;gl_FragColor=vec4((L+R+B+T-d)*.25,0.,0.,1.);}`;
const FS_GRAD = FL_HEAD + `uniform sampler2D uP,uVel;void main(){float L=texture2D(uP,vL).x,R=texture2D(uP,vR).x,T=texture2D(uP,vT).x,B=texture2D(uP,vB).x;vec2 v=texture2D(uVel,v_uv).xy-vec2(R-L,T-B);gl_FragColor=vec4(v,0.,1.);}`;
const FS_MUL = FL_HEAD + `uniform sampler2D uT;uniform float uK;void main(){gl_FragColor=vec4(texture2D(uT,v_uv).xyz*uK,1.);}`;
/* fuerzas: el cuerpo empuja hacia afuera desde su borde, el humo caliente sube, y una corriente de ruido muy suave */
const FS_FORCE = FL_HEAD + GLSL_NOISE + `uniform sampler2D uVel,uDye,uMB,uMot;uniform float uDt,uPush,uBuoy,uAmb,uTime,uAsp,uMotK;uniform vec2 uMTx;
void main(){vec2 v=texture2D(uVel,v_uv).xy;
float mx=texture2D(uMB,v_uv+vec2(uMTx.x,0.)).r-texture2D(uMB,v_uv-vec2(uMTx.x,0.)).r,my=texture2D(uMB,v_uv+vec2(0.,uMTx.y)).r-texture2D(uMB,v_uv-vec2(0.,uMTx.y)).r;
v-=vec2(mx,my)*uPush*uDt;
float heat=dot(texture2D(uDye,v_uv).rgb,vec3(.33));v.y+=heat*uBuoy*uDt;
v+=curl(vec2(v_uv.x*uAsp,v_uv.y)*2.2+uTime*.05)*uAmb*uDt;
v+=texture2D(uMot,v_uv).xy*uMotK*uDt;
gl_FragColor=vec4(v,0.,1.);}`;
/* tinta: el cuerpo emite su color desde el borde (o todo el cuerpo) */
const FS_EMIT = FL_HEAD + GLSL_NOISE + `uniform sampler2D uDye,uMask,uMB;uniform vec3 uC0,uC1,uC2;uniform float uEmit,uEdge,uTime,uDt;
void main(){vec3 d=texture2D(uDye,v_uv).rgb;float m=texture2D(uMask,v_uv).r,b=texture2D(uMB,v_uv).r;
float ring=clamp(b*(1.-m)*5.,0.,1.);float edge=mix(m*.6+ring*.4,ring,uEdge);
float n=snoise(v_uv*vec2(9.,4.)+uTime*.3)*.5+.5;vec3 c=pal(.35+n*.65,uC0,uC1,uC2);
gl_FragColor=vec4(d+c*edge*uEmit*uDt*2.8,1.);}`;
const FS_FLDISP = GLSL_HP + `varying vec2 v_uv;uniform sampler2D uDye;uniform float uExp,uSat,uAlpha;
void main(){vec3 c=texture2D(uDye,v_uv).rgb*uExp;c=1.-exp(-c*c*1.6-c*.25);float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,uSat);gl_FragColor=vec4(c*uAlpha,1.);}`;
const fl = { vel:null, dye:null, pres:null, div:null, curl:null, sw:0, sh:0, dw:0, dh:0, dt:1 / 60 };
let pAdv, pDiv, pCurl, pVort, pPres, pGrad, pMul, pForce, pEmit, pFlDisp;
registerModule('fluido', { needs:['mask', 'maskblur', 'motion'], param:P.fluido, label:'Fluido de luz', desc:'Humo o tinta luminosa que el cuerpo empuja, arrastra y deja detrás (Navier-Stokes en GPU). El movimiento de manos y pies agita el fluido; el borde del cuerpo emite color.',
  alloc(){ this.resize(); },
  resize(){ this.free(); if (!FX_OK) return; const cells = { ligero:30000, equilibrado:60000, completo:110000 }[prof.tier] || 60000, asp = W / H;
    fl.sh = clamp(Math.round(Math.sqrt(cells / asp)), 24, 512); fl.sw = clamp(Math.round(fl.sh * asp), 24, Math.min(2048, MAX_TEX));
    const dk = P.fluido.detalle || 2; fl.dh = clamp(fl.sh * dk, 32, 1024); fl.dw = clamp(fl.sw * dk, 32, Math.min(4096, MAX_TEX));
    fl.vel = dfbo(fl.sw, fl.sh, FX.f16, FX.lin16); fl.dye = dfbo(fl.dw, fl.dh, FX.f16, FX.lin16); fl.pres = dfbo(fl.sw, fl.sh, FX.f16, false);
    fl.div = fboF(fl.sw, fl.sh, FX.f16, false); fl.curl = fboF(fl.sw, fl.sh, FX.f16, false); },
  free(){ freeD(fl.vel); freeD(fl.dye); freeD(fl.pres); freeFBO(fl.div); freeFBO(fl.curl); fl.vel = fl.dye = fl.pres = fl.div = fl.curl = null; },
  update(dt){ fl.dt = dt; motion.dt = dt; },
  clear(){ if (!fl.vel) return; [fl.vel.read, fl.vel.write, fl.dye.read, fl.dye.write, fl.pres.read, fl.pres.write].forEach(clearF); },
  draw(){ if (!fl.vel || !motion.d || !mblur.b) return; const F = P.fluido, dt = Math.min(fl.dt, 1 / 30), tx = [1 / fl.sw, 1 / fl.sh];
    gl.disable(gl.BLEND);
    const run = (p, dst, setup) => { gl.useProgram(p); bindFBO(dst); gl.uniform2f(U(p, 'uTx'), ...tx); setup(p); drawQuad(p); };
    // fuerzas
    run(pForce, fl.vel.write, p => { useTex(0, fl.vel.read.t, p, 'uVel'); useTex(1, fl.dye.read.t, p, 'uDye'); useTex(2, mblur.b.t, p, 'uMB'); useTex(3, motion.d.read.t, p, 'uMot');
      gl.uniform1f(U(p, 'uDt'), dt); gl.uniform1f(U(p, 'uPush'), F.empuje * fl.sh * 40 * AM.scatter); gl.uniform1f(U(p, 'uBuoy'), F.ascenso * fl.sh * .8);
      gl.uniform1f(U(p, 'uAmb'), F.corriente * fl.sh * .25); gl.uniform1f(U(p, 'uTime'), tWrap() * AM.speed); gl.uniform1f(U(p, 'uAsp'), W / H);
      gl.uniform1f(U(p, 'uMotK'), F.agitar * fl.sh * 6); gl.uniform2f(U(p, 'uMTx'), 2 / mblur.b.w, 2 / mblur.b.h); }); fl.vel.swap();
    // las manos y los pies agitan fuerte (splats de velocidad en celdas por segundo)
    applySplats(fl.vel, bodySplats(dt).filter(s => s.hand || F.todoElCuerpo), s => [s.vx * fl.sh * F.agitar * .9, s.vy * fl.sh * F.agitar * .9, 0], 1);
    // vorticidad
    run(pCurl, fl.curl, p => useTex(0, fl.vel.read.t, p, 'uVel'));
    run(pVort, fl.vel.write, p => { useTex(0, fl.vel.read.t, p, 'uVel'); useTex(1, fl.curl.t, p, 'uCurl'); gl.uniform1f(U(p, 'uCurlAmt'), F.remolino * 40); gl.uniform1f(U(p, 'uDt'), dt); }); fl.vel.swap();
    // presión (incompresible)
    run(pDiv, fl.div, p => useTex(0, fl.vel.read.t, p, 'uVel'));
    run(pMul, fl.pres.write, p => { useTex(0, fl.pres.read.t, p, 'uT'); gl.uniform1f(U(p, 'uK'), .8); }); fl.pres.swap();
    const it = { ligero:10, equilibrado:16, completo:22 }[prof.tier] || 16;
    for (let i = 0; i < it; i++) { run(pPres, fl.pres.write, p => { useTex(0, fl.pres.read.t, p, 'uP'); useTex(1, fl.div.t, p, 'uDiv'); }); fl.pres.swap(); }
    run(pGrad, fl.vel.write, p => { useTex(0, fl.pres.read.t, p, 'uP'); useTex(1, fl.vel.read.t, p, 'uVel'); }); fl.vel.swap();
    // advección
    run(pAdv, fl.vel.write, p => { useTex(0, fl.vel.read.t, p, 'uVel'); useTex(1, fl.vel.read.t, p, 'uSrc'); gl.uniform1f(U(p, 'uDt'), dt); gl.uniform1f(U(p, 'uDiss'), Math.exp(-dt * (1 - F.memoria) * 3)); }); fl.vel.swap();
    // tinta: emisión + advección + desvanecer
    gl.useProgram(pEmit); bindFBO(fl.dye.write); gl.uniform2f(U(pEmit, 'uTx'), 1 / fl.dw, 1 / fl.dh); useTex(0, fl.dye.read.t, pEmit, 'uDye'); useTex(1, fbMask.t, pEmit, 'uMask'); useTex(2, mblur.b.t, pEmit, 'uMB');
    setPalette(pEmit, F.paleta, F.hue); gl.uniform1f(U(pEmit, 'uEmit'), F.emision * Math.min(1, 4 / Math.max(.3, F.duracion)) * (1 + AM.level * 1.5));   // cuanto más dura el humo, menos se emite: no se satura gl.uniform1f(U(pEmit, 'uEdge'), F.soloBorde ? 1 : .45); gl.uniform1f(U(pEmit, 'uTime'), tWrap()); gl.uniform1f(U(pEmit, 'uDt'), dt); drawQuad(pEmit); fl.dye.swap();
    applySplats(fl.dye, bodySplats(dt).filter(s => s.hand), s => { const sp = Math.hypot(s.vx, s.vy); if (sp < .05) return null; const c = paletteRGB(F.paleta, s.hue)[1]; const k = Math.min(1.5, sp) * F.emision * .12; return [c[0] * k, c[1] * k, c[2] * k]; }, .8);
    gl.useProgram(pAdv); bindFBO(fl.dye.write); gl.uniform2f(U(pAdv, 'uTx'), 1 / fl.sw, 1 / fl.sh); useTex(0, fl.vel.read.t, pAdv, 'uVel'); useTex(1, fl.dye.read.t, pAdv, 'uSrc');
    gl.uniform1f(U(pAdv, 'uDt'), dt); gl.uniform1f(U(pAdv, 'uDiss'), Math.exp(-dt / Math.max(.2, F.duracion))); drawQuad(pAdv); fl.dye.swap();
    // a la escena (aditivo)
    bindFBO(fbScene); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(pFlDisp); useTex(0, fl.dye.read.t, pFlDisp, 'uDye');
    gl.uniform1f(U(pFlDisp, 'uExp'), F.brillo * 7 * AM.glow); gl.uniform1f(U(pFlDisp, 'uSat'), F.saturacion); gl.uniform1f(U(pFlDisp, 'uAlpha'), 1); drawQuad(pFlDisp);
  } });

/* ===================== PARTÍCULAS GPU — Pixel ===================== */
const FS_PUPD = GLSL_HP + GLSL_NOISE + `varying vec2 v_uv;uniform sampler2D uS,uMB,uMBf,uMot;uniform float uDt,uTime,uAsp,uMode,uFlow,uScale,uRepel,uAttract,uDrag,uGrav,uMotK,uRespawn,uSpeed;uniform vec2 uMTx;
vec2 grad(sampler2D t,vec2 p,vec2 e){return vec2(texture2D(t,p+vec2(e.x,0.)).r-texture2D(t,p-vec2(e.x,0.)).r,texture2D(t,p+vec2(0.,e.y)).r-texture2D(t,p-vec2(0.,e.y)).r);}
void main(){vec4 s=texture2D(uS,v_uv);vec2 p=s.xy,v=s.zw;float seed=hash12(v_uv*977.+uTime);
if(s.x==0.&&s.y==0.&&s.z==0.){p=vec2(hash12(v_uv*31.7),hash12(v_uv*91.3));v=vec2(0.);}
vec2 q=vec2(p.x*uAsp,p.y);vec2 f=vec2(0.);
float mN=texture2D(uMB,p).r,mF=texture2D(uMBf,p).r;vec2 gN=grad(uMB,p,uMTx),gF=grad(uMBf,p,uMTx*4.);
if(uMode<.5){f+=curl(q*uScale+vec2(0.,uTime*.06))*uFlow;}
else if(uMode<1.5){f+=vec2(curl(q*uScale*2.+uTime*.1).x*.15*uFlow,-uGrav);}
else if(uMode<2.5){f+=curl(q*uScale+uTime*.04)*uFlow*.35;f+=gF*uAttract*3.;f+=gN*uAttract;}
else{vec2 c=vec2(.5*uAsp,.5);f+=curl(q*uScale+uTime*.05)*uFlow*.4;f+=vec2(-gF.y,gF.x)*uAttract*4.;}
f-=(gN*1.4+gF*.6)*uRepel;
vec2 mot=texture2D(uMot,p).xy;v+=mot*uMotK*uDt*40.;
v+=f*uDt;v*=exp(-uDt*uDrag);
p+=vec2(v.x/uAsp,v.y)*uDt*uSpeed;
bool out_=p.x<-.02||p.x>1.02||p.y<-.05||p.y>1.05;
if(out_||seed<uRespawn*uDt){float a=hash12(v_uv*13.1+uTime*1.7),b=hash12(v_uv*7.3-uTime*1.3);
 if(uMode>.5&&uMode<1.5){p=vec2(a,1.02+b*.05);v=vec2(0.,-uGrav*.2);}else{p=vec2(a,b);v=vec2(0.);}}
gl_FragColor=vec4(p,v);}`;
const VS_PDRAW = `precision highp float;attribute vec2 a_ref;uniform sampler2D uS,uMB;uniform float uSize,uAsp;varying float v_sp,v_m;
void main(){vec4 s=texture2D(uS,a_ref);vec2 p=s.xy;float sp=length(s.zw);v_sp=sp;v_m=texture2D(uMB,p).r;
gl_Position=vec4(p*2.-1.,0.,1.);gl_PointSize=clamp(uSize*(.7+min(sp*1.5,1.6)),1.,24.);}`;
const FS_PDRAW = `precision mediump float;varying float v_sp,v_m;uniform vec3 uC0,uC1,uC2;uniform float uAlpha,uBodyGlow,uHot;
vec3 pal(float t,vec3 a,vec3 b,vec3 c){t=clamp(t,0.,1.);return t<.5?mix(a,b,t*2.):mix(b,c,t*2.-1.);}
void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d);if(r>.25)discard;float a=pow(1.-r*4.,1.8);
float t=clamp(.35+v_sp*uHot+v_m*uBodyGlow,0.,1.);gl_FragColor=vec4(pal(t,uC0,uC1,uC2)*a*uAlpha*(.5+t),1.);}`;
const parts = { s:null, n:0, side:0, buf:null };
let pPUpd, pPDraw;
const PMODES = { flujo:0, lluvia:1, atraer:2, orbita:3 };
registerModule('particulas', { needs:['mask', 'maskblur', 'motion'], param:P.particulas, label:'Partículas de luz', desc:'Cientos de miles de partículas en la GPU: corrientes que el cuerpo aparta y agita, cascada vertical que se abre a su paso, polvo que se junta en la silueta, órbitas (Pixel, Adrien M & Claire B).',
  alloc(){ this.resize(); },
  resize(){ if (!FX.f32 && !FX.f16 || !EXT_VTF) return; const side = { ligero:192, equilibrado:320, completo:448 }[prof.tier] || 320, wide = Math.sqrt(clamp(W / H / 1.78, 1, 3)), s2 = Math.min(900, Math.round(side * wide * clamp(P.particulas.cantidad, .25, 2)));   // lienzo ancho de la sala: más partículas para la misma densidad
    if (parts.s && parts.side === s2) return; this.free(); parts.side = s2; parts.n = s2 * s2;
    parts.s = dfbo(s2, s2, FX.f32 || FX.f16, false);
    const arr = new Float32Array(parts.n * 2); let k = 0; for (let y = 0; y < s2; y++) for (let x = 0; x < s2; x++) { arr[k++] = (x + .5) / s2; arr[k++] = (y + .5) / s2; }
    parts.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, parts.buf); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); },
  free(){ freeD(parts.s); parts.s = null; if (parts.buf) gl.deleteBuffer(parts.buf); parts.buf = null; parts.side = 0; },
  update(dt){ parts.dt = dt; motion.dt = dt; this.resize(); },
  clear(){ if (parts.s) { clearF(parts.s.read); clearF(parts.s.write); } },
  draw(){ if (!parts.s || !pPUpd || !motion.d || !mblur.b) return; const Q = P.particulas, dt = Math.min(parts.dt || 1 / 60, 1 / 30);
    gl.disable(gl.BLEND); gl.useProgram(pPUpd); bindFBO(parts.s.write); useTex(0, parts.s.read.t, pPUpd, 'uS'); useTex(1, mblur.b.t, pPUpd, 'uMB'); useTex(2, mblur.b2.t, pPUpd, 'uMBf'); useTex(3, motion.d.read.t, pPUpd, 'uMot');
    const u = (n, v) => gl.uniform1f(U(pPUpd, n), v);
    u('uDt', dt); u('uTime', tWrap()); u('uAsp', W / H); u('uMode', PMODES[Q.modo] ?? 0); u('uFlow', Q.corriente * 1.2); u('uScale', Q.escala * 3);
    u('uRepel', Q.apartar * 6 * AM.scatter); u('uAttract', Q.atraer * 6); u('uDrag', 1.5 + Q.friccion * 6); u('uGrav', Q.caida * .9); u('uMotK', Q.agitar * 1.5); u('uRespawn', Q.modo === 'atraer' ? .02 : .06); u('uSpeed', AM.speed);
    gl.uniform2f(U(pPUpd, 'uMTx'), 1.5 / mblur.b.w, 1.5 / mblur.b.h); drawQuad(pPUpd); parts.s.swap();
    bindFBO(fbScene); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(pPDraw);
    const l = AT(pPDraw, 'a_ref'); gl.bindBuffer(gl.ARRAY_BUFFER, parts.buf); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    useTex(0, parts.s.read.t, pPDraw, 'uS'); useTex(1, mblur.b.t, pPDraw, 'uMB'); setPalette(pPDraw, Q.paleta, Q.hue);
    gl.uniform1f(U(pPDraw, 'uSize'), Q.tamano * DPR * 1.6 * AM.size); gl.uniform1f(U(pPDraw, 'uAlpha'), Q.brillo * .34 * Math.sqrt(60000 * (W * H) / (1920 * 1080) / parts.n) * AM.glow); gl.uniform1f(U(pPDraw, 'uBodyGlow'), Q.cuerpoBrilla); gl.uniform1f(U(pPDraw, 'uHot'), .8);
    gl.drawArrays(gl.POINTS, 0, parts.n);
  } });

/* ===================== MEMBRANA — Apparition ===================== */
const VS_MESH = `precision highp float;attribute vec4 a_l;uniform sampler2D uMB,uMBf,uMot;uniform float uPush,uWake,uWave,uTime,uWidth,uAsp,uReach;uniform vec2 uRes,uMTx;varying float v_b;
vec2 base(float x,float t,float o){return o<.5?vec2(x,t):vec2(t,x);}
vec2 disp(vec2 p){float mN=texture2D(uMB,p).r,mF=texture2D(uMBf,p).r;
vec2 g=vec2(texture2D(uMBf,p+vec2(uMTx.x,0.)).r-texture2D(uMBf,p-vec2(uMTx.x,0.)).r,texture2D(uMBf,p+vec2(0.,uMTx.y)).r-texture2D(uMBf,p-vec2(0.,uMTx.y)).r);
vec2 m=texture2D(uMot,p).xy;vec2 dh=-g*uPush*uReach+m*uWake;vec2 d=vec2(dh.x/uAsp,dh.y);d+=vec2(sin(p.y*23.+uTime*1.3)/uAsp,sin(p.x*uAsp*7.+uTime))*uWave*.002;return p+d;}
void main(){float x=a_l.x,t=a_l.y,side=a_l.z,o=a_l.w;vec2 P0=base(x,t,o);float e=.004;
vec2 A=disp(base(x,t-e,o)),B=disp(base(x,t+e,o)),C=disp(P0);vec2 tg=(B-A)*uRes;vec2 n=normalize(vec2(-tg.y,tg.x)+1e-6);
float mF=texture2D(uMBf,P0).r,mN=texture2D(uMB,C).r;v_b=.38+mF*1.4+mN*.9+length(texture2D(uMot,P0).xy)*2.;
vec2 pos=C+n*side*max(.75,uWidth*(.6+mF*1.2))/uRes;gl_Position=vec4(pos*2.-1.,0.,1.);}`;
const FS_MESH = `precision mediump float;varying float v_b;uniform vec3 uC0,uC1,uC2;uniform float uAlpha;
vec3 pal(float t,vec3 a,vec3 b,vec3 c){t=clamp(t,0.,1.);return t<.5?mix(a,b,t*2.):mix(b,c,t*2.-1.);}
void main(){gl_FragColor=vec4(pal(v_b*.6,uC0,uC1,uC2)*v_b*uAlpha,1.);}`;
const mesh = { buf:null, n:0, key:'' };
let pMesh;
registerModule('membrana', { needs:['mask', 'maskblur', 'motion'], param:P.membrana, label:'Membrana', desc:'Una trama de hilos de luz (verticales, horizontales o grilla) que el cuerpo empuja como una tela elástica y deja vibrando al pasar (Apparition, Klaus Obermaier).',
  alloc(){ this.build(); }, resize(){ this.build(); },
  build(){ if (!EXT_VTF) return; const M = P.membrana, sp = Math.max(4, M.separacion) * DPR, seg = 6 * DPR, key = [W, H, M.separacion, M.trama].join();
    if (mesh.buf && mesh.key === key) return; this.free(); mesh.key = key; const out = [];
    const add = (o, nLines, along) => { const nSeg = Math.max(8, Math.round(along / seg));
      for (let i = 0; i < nLines; i++) { const x = (i + .5) / nLines;
        for (let s = 0; s < nSeg; s++) { const t0 = s / nSeg, t1 = (s + 1) / nSeg;
          out.push(x, t0, -1, o, x, t0, 1, o, x, t1, -1, o, x, t1, -1, o, x, t0, 1, o, x, t1, 1, o); } } };
    if (M.trama !== 'horizontal') add(0, Math.max(2, Math.round(W / sp)), H);
    if (M.trama !== 'vertical') add(1, Math.max(2, Math.round(H / sp)), W);
    mesh.n = out.length / 4; mesh.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW); },
  free(){ if (mesh.buf) gl.deleteBuffer(mesh.buf); mesh.buf = null; mesh.key = ''; },
  update(dt){ motion.dt = dt; this.build(); },
  draw(){ if (!mesh.buf || !pMesh || !motion.d || !mblur.b) return; const M = P.membrana; gl.useProgram(pMesh);
    const l = AT(pMesh, 'a_l'); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 0, 0);
    useTex(0, mblur.b.t, pMesh, 'uMB'); useTex(1, mblur.b2.t, pMesh, 'uMBf'); useTex(2, motion.d.read.t, pMesh, 'uMot'); setPalette(pMesh, M.paleta, M.hue);
    const u = (n, v) => gl.uniform1f(U(pMesh, n), v);
    u('uPush', M.empuje * AM.scatter); u('uWake', M.estela * .07); u('uWave', M.ondular); u('uTime', tWrap() * AM.speed); u('uWidth', M.grosor * DPR * AM.size); u('uAsp', W / H); u('uReach', .12); u('uAlpha', M.brillo * AM.glow);
    gl.uniform2f(U(pMesh, 'uRes'), W, H); gl.uniform2f(U(pMesh, 'uMTx'), 1.5 / mblur.b2.w, 1.5 / mblur.b2.h);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.n); } });

/* ===================== ONDAS DE CONTORNO — topografía del cuerpo ===================== */
const FS_RINGS = (FX.deriv ? '#extension GL_OES_standard_derivatives : enable\n' : '') + GLSL_HP + GLSL_NOISE + `varying vec2 v_uv;uniform sampler2D uMask,uMB,uMBf;uniform vec3 uC0,uC1,uC2;uniform float uTime,uN,uSpeed,uWidth,uFill,uAlpha,uWarp,uAsp;
void main(){vec2 q=vec2(v_uv.x*uAsp,v_uv.y);vec2 w=vec2(snoise(q*3.+uTime*.1),snoise(q*3.-uTime*.1+7.))*uWarp*.004;w.x/=uAsp;vec2 p=v_uv+w;
float m=texture2D(uMask,p).r,b=texture2D(uMB,p).r,f=texture2D(uMBf,p).r;float fld=clamp(f*.75+b*.25,0.,1.);
float h=sqrt(fld)*uN-uTime*uSpeed;float k=fract(h);float dist=min(k,1.-k);
${FX.deriv ? 'float aa=fwidth(h)*uWidth;' : 'float aa=.04*uWidth;'}
float line=1.-smoothstep(aa*.6,aa*1.6,dist);float fade=smoothstep(.003,.06,fld)*(1.-m*.85);
float idx=floor(h);vec3 c=pal(.55+.45*fract(idx*.137)*0.+fld*.6,uC0,uC1,uC2)*(1.2-fld*.4);vec3 o=c*line*fade*1.4+pal(.25,uC0,uC1,uC2)*m*uFill;gl_FragColor=vec4(o*uAlpha,1.);}`;
let pRings;
registerModule('ondas', { needs:['mask', 'maskblur'], param:P.ondas, label:'Ondas de contorno', desc:'Curvas de nivel alrededor de cada cuerpo, como un mapa topográfico que late hacia afuera. Dos cuerpos cerca funden sus ondas.',
  draw(){ if (!pRings || !mblur.b) return; const R = P.ondas; gl.useProgram(pRings); useTex(0, fbMask.t, pRings, 'uMask'); useTex(1, mblur.b.t, pRings, 'uMB'); useTex(2, mblur.b2.t, pRings, 'uMBf'); setPalette(pRings, R.paleta, R.hue);
    const u = (n, v) => gl.uniform1f(U(pRings, n), v); u('uTime', tWrap() * AM.speed); u('uN', R.cantidad); u('uSpeed', R.velocidad * (1 + AM.beat)); u('uWidth', R.grosor * AM.size); u('uFill', R.relleno); u('uAlpha', R.brillo * AM.glow); u('uWarp', R.temblor); u('uAsp', W / H);
    drawQuad(pRings); } });

/* ===================== SILUETA LÍQUIDA — Augmented Hand Series ===================== */
const FS_LIQ = GLSL_HP + GLSL_NOISE + `varying vec2 v_uv;uniform sampler2D uMask,uMB,uMot;uniform vec3 uC0,uC1,uC2;uniform float uTime,uAmp,uFreq,uSplit,uEdge,uFill,uAlpha,uAsp,uMotK;
float sil(vec2 p){return smoothstep(.35,.65,texture2D(uMask,p).r);}
void main(){vec2 q=vec2(v_uv.x*uAsp,v_uv.y);vec2 m=texture2D(uMot,v_uv).xy;
vec2 w=curl(q*uFreq+uTime*.15)*uAmp*.006+vec2(snoise(q*uFreq*2.3-uTime*.2),snoise(q*uFreq*2.3+uTime*.2+3.))*uAmp*.003-m*uMotK*.02;w.x/=uAsp;
vec2 s=vec2(uSplit*.004/uAsp,0.);float r=sil(v_uv+w+s),g=sil(v_uv+w),b=sil(v_uv+w-s);
float e=texture2D(uMB,v_uv+w).r;float edge=smoothstep(.05,.6,e)*(1.-g)*(1.-smoothstep(.6,1.,e)*.5);
vec3 c=pal(.45+.4*snoise(q*2.+uTime*.1),uC0,uC1,uC2);vec3 body=vec3(r,g,b)*c*1.15;
vec3 o=body*uFill*.7+pal(.75,uC0,uC1,uC2)*edge*uEdge*.55;gl_FragColor=vec4(o*uAlpha,1.);}`;
let pLiq;
registerModule('liquida', { needs:['mask', 'maskblur', 'motion'], param:P.liquida, label:'Silueta líquida', desc:'La silueta como un líquido que tiembla, se estira con el movimiento y se separa en colores en los bordes (Augmented Hand Series, Golan Levin).',
  update(dt){ motion.dt = dt; },
  draw(){ if (!pLiq || !motion.d || !mblur.b) return; const Lq = P.liquida; gl.useProgram(pLiq); useTex(0, fbMask.t, pLiq, 'uMask'); useTex(1, mblur.b.t, pLiq, 'uMB'); useTex(2, motion.d.read.t, pLiq, 'uMot'); setPalette(pLiq, Lq.paleta, Lq.hue);
    const u = (n, v) => gl.uniform1f(U(pLiq, n), v); u('uTime', tWrap() * AM.speed); u('uAmp', Lq.deformar * AM.scatter); u('uFreq', Lq.escala * 3); u('uSplit', Lq.separarColor);
    u('uEdge', Lq.borde * AM.glow); u('uFill', Lq.relleno); u('uAlpha', Lq.brillo); u('uAsp', W / H); u('uMotK', Lq.estirar);
    drawQuad(pLiq); } });

/* ---------- compilar ---------- */
(function compileFX(){
  if (!gl) return;
  try {
    pSplat = prog(FS_SPLAT, VS_QUAD);
    pAdv = prog(FS_ADV, VS_FL); pDiv = prog(FS_DIV, VS_FL); pCurl = prog(FS_CURL, VS_FL); pVort = prog(FS_VORT, VS_FL); pPres = prog(FS_PRES, VS_FL); pGrad = prog(FS_GRAD, VS_FL);
    pMul = prog(FS_MUL, VS_FL); pForce = prog(FS_FORCE, VS_FL); pEmit = prog(FS_EMIT, VS_FL); pFlDisp = prog(FS_FLDISP, VS_QUAD);
    pRings = prog(FS_RINGS, VS_QUAD); pLiq = prog(FS_LIQ, VS_QUAD);
    if (EXT_VTF) { pPUpd = prog(FS_PUPD, VS_QUAD); pPDraw = prog(FS_PDRAW, VS_PDRAW); pMesh = prog(FS_MESH, VS_MESH); }
  } catch (e) { console.error('efectos GPU:', e); toast && toast('Algunos efectos GPU no compilaron en esta placa: ' + String(e.message).slice(0, 120), 8000); }
})();
function fxAvailable(id){
  if (id === 'fluido') return FX_OK && !!pForce;
  if (id === 'particulas') return FX_OK && EXT_VTF && !!pPUpd;
  if (id === 'membrana') return EXT_VTF && FX_OK && !!pMesh;
  if (id === 'ondas') return !!pRings;
  if (id === 'liquida') return FX_OK && !!pLiq;
  return true;
}
function clearFX(){ for (const id of ['fluido', 'particulas']) { const m = Modules.get(id); if (m && m._alloc && m.clear) m.clear(); } }
