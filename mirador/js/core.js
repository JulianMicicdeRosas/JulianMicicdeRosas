"use strict";
/* =====================================================================
   MIRADOR — núcleo
   Parámetros, contexto WebGL, shaders, formato de salida y utilidades.
   Scripts clásicos: todo lo declarado arriba del archivo es global.
   ===================================================================== */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const deepClone = o => JSON.parse(JSON.stringify(o));
function fail(m){ const e = $('err'); if (e) e.textContent = m; console.error(m); }

const urlParams = new URLSearchParams(location.search);

/* ---------- ruido simplex 2D (dominio público) ---------- */
const Noise = (() => { const grad = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  const pr = new Uint8Array(512); for (let i = 0; i < 512; i++) pr[i] = p[i & 255];
  const F2 = .5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return (xin, yin) => { const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2, x0 = xin - (i - t), y0 = yin - (j - t); const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2; const ii = i & 255, jj = j & 255; let n = 0;
    let t0 = .5 - x0 * x0 - y0 * y0; if (t0 > 0) { t0 *= t0; const g = grad[pr[ii + pr[jj]] & 7]; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = .5 - x1 * x1 - y1 * y1; if (t1 > 0) { t1 *= t1; const g = grad[pr[ii + i1 + pr[jj + j1]] & 7]; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = .5 - x2 * x2 - y2 * y2; if (t2 > 0) { t2 *= t2; const g = grad[pr[ii + 1 + pr[jj + 1]] & 7]; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * n; }; })();

/* =====================================================================
   PARÁMETROS (intención artística). Se guardan completos en la sesión.
   ===================================================================== */
const P_DEFAULT = {
  cam:   { mirror:true, showVideo:false, videoOpacity:.5, contrast:1.15, brightness:1, saturate:.7 },
  track: { minScore:.32, smoothing:.55, showSkeleton:true, boneWidth:3, showJoints:false, jointSize:5, showId:false, glow:.85, maxPoses:5 },
  link:  { enabled:true, range:.4, width:2.2, energy:1 },
  mask:  { source:'esqueleto', threshold:.34, softness:.12, learnBg:false, bodyWidth:1 },
  // módulos
  fog:      { enabled:false, zDepth:.28, drift:.4, size:2.6, hue:200, hueSpread:60 },
  vivas:    { enabled:false, selMin:.4, soft:.18, scatter:.6, keepForm:.5, size:2.4, hue:160 },
  push:     { enabled:false, force:1.2, size:2.2, hue:330 },
  scribble: { enabled:false, iso:.5, jitter:.011, width:2, hue:48, glow:.8 },
  swarm:    { enabled:false, density:240, sensitivity:5, keepForm:.25, size:2.4, useBodyHue:true, hue:190, glow:.9 },
  silueta:  { enabled:false, hue:0, white:1, opacity:.95, soft:.06, edge:0, edgeHue:200, fill:true },
  lluvia:   { enabled:false, text:'cuerpo señal luz sombra mirador movimiento', density:1, size:22, speed:1, hue:48, white:.4, font:'serif' },
  pintura:  { enabled:false, width:14, fade:.012, useBodyHue:true, hue:300, parts:'manos', glow:.8 },
  grilla:   { enabled:false, cell:26, gap:.2, inertia:.86, hue:190, white:.3, useBodyHue:false, square:true },
  cortinas: { enabled:false, spacing:22, force:1, radius:.22, segments:18, width:1.2, hue:200, white:.6, glow:.7 },
  aves:     { enabled:false, rate:1, lift:1, size:3, hue:30, white:.6, life:1 },
  // mezcla y posproceso
  echo: { mode:'screen', decay:.9, zoom:1.004, rotate:0, drift:0 },
  fx:   { bloom:1, threshold:.42, radius:1.6, chroma:.9, glitch:0, glitchBlocks:38, vignette:.35, gamma:1 },
  map:  { blackout:false, testGrid:false, calibrate:false, scale:1, slices:1, blend:0,
          mosaic:false, mosW:7680, mosH:4320, tileW:1920, tileH:1080, mosCols:4, mosOrder:'filas', mosMap:'', mosPreview:false },
  perf: { targetFps:30, autoScale:true, scene2d:1 },
  // audio
  audio:{ source:'off', gain:1, smooth:.6, react:{ size:.8, glow:.6, bloom:.8, scatter:.5, hue:.3, echo:.4, flash:.3, speed:.5 } },
};
const P = deepClone(P_DEFAULT);
const PALETTES = [200, 330, 48, 130, 275];
const MODULE_IDS = ['silueta','swarm','scribble','lluvia','pintura','grilla','cortinas','aves','fog','vivas','push'];

/* =====================================================================
   PERFIL DE HARDWARE (topes). eff(obj,key,cap)=min(preset,tope)
   ===================================================================== */
const prof = { name:'—', renderScale:1, gridN:200, bloomIter:2, allowChroma:true, allowGlitch:true, inferHz:30,
  caps:{ 'fx.radius':6, 'fog.size':14, 'vivas.size':14, 'push.size':14 } };
const eff = (obj, key, cap) => cap !== undefined ? Math.min(obj[key], cap) : obj[key];

/* =====================================================================
   FORMATO DE SALIDA
   OUT.w/OUT.h = tamaño lógico de la imagen proyectada (px). W/H = tamaño
   interno de render (OUT * escala). DPR = W/OUT.w: todas las medidas en
   píxeles "de salida" se multiplican por DPR al dibujar.
   ===================================================================== */
const OUT = { mode:'ventana', w:1920, h:1080, cssW:0, cssH:0 };
let W = 2, H = 2, DPR = 1, MAX_TEX = 4096;
function setOutputFormat(mode, w, h){
  OUT.mode = mode;
  if (mode === 'ventana') { OUT.w = innerWidth; OUT.h = innerHeight; }
  else if (/^\d+x\d+$/.test(mode)) { const [a, b] = mode.split('x').map(Number); OUT.w = a; OUT.h = b; }
  else { OUT.w = Math.max(64, w | 0 || 1920); OUT.h = Math.max(64, h | 0 || 1080); }
}
function outputSize(){
  if (typeof multiMode !== 'undefined' && multiMode && virt) return { w: virt.w, h: virt.h };
  if (OUT.mode === 'ventana') return { w: innerWidth, h: innerHeight };
  return { w: OUT.w, h: OUT.h };
}
/* El canvas se ve "contenido" en la ventana si el formato es fijo (previsualización a escala). */
/* Mosaico 8K: la salida (panorama) se recorta en franjas y se acomoda en un cuadro grande
   (p. ej. 7680×4320) que un splitter vuelve a repartir en proyectores Full HD. */
function mosaicActive(){ return !!(P.map.mosaic && !P.map.mosPreview && !(typeof multiMode !== 'undefined' && multiMode)); }
function mosaicTiles(){
  const n = Math.max(1, Math.round(P.map.slices)), tw = P.map.tileW | 0 || 1920, th = P.map.tileH | 0 || 1080, cols = Math.max(1, P.map.mosCols | 0 || 1);
  const out = [];
  const custom = String(P.map.mosMap || '').trim();
  if (custom) { custom.split(/[;\n]+/).forEach((pair, i) => { const m = pair.trim().match(/^(-?\d+)\s*[, ]\s*(-?\d+)$/); if (m && i < n) out.push({ i, x:+m[1], y:+m[2], w:tw, h:th }); }); }
  for (let i = out.length; i < n; i++) { const c = P.map.mosOrder === 'columnas' ? Math.floor(i / Math.max(1, Math.round(P.map.mosH / th))) : i % cols, r = P.map.mosOrder === 'columnas' ? i % Math.max(1, Math.round(P.map.mosH / th)) : Math.floor(i / cols); out.push({ i, x:c * tw, y:r * th, w:tw, h:th }); }
  return out;
}
function canvasSize(){ return mosaicActive() ? { w:P.map.mosW | 0 || 7680, h:P.map.mosH | 0 || 4320 } : outputSize(); }
function layoutStage(){
  const o = canvasSize(), stage = $('stage'), vw = innerWidth, vh = innerHeight;
  let cw = vw, ch = vh, left = 0, top = 0;
  if (OUT.mode !== 'ventana' || mosaicActive() || (typeof multiMode !== 'undefined' && multiMode)) {
    const s = Math.min(vw / o.w, vh / o.h); cw = Math.round(o.w * s); ch = Math.round(o.h * s);
    left = Math.round((vw - cw) / 2); top = Math.round((vh - ch) / 2);
  }
  stage.style.left = left + 'px'; stage.style.top = top + 'px'; stage.style.width = cw + 'px'; stage.style.height = ch + 'px';
  OUT.cssW = cw; OUT.cssH = ch;
}

/* =====================================================================
   ELEMENTOS / CONTEXTOS
   ===================================================================== */
const glCanvas = $('gl'), uiCanvas = $('ui'), uiCtx = uiCanvas.getContext('2d');
const scene = document.createElement('canvas'), sctx = scene.getContext('2d', { alpha:true, desynchronized:true });
let S2 = 1;   // escala de la capa 2D (scene) respecto de W,H

const gl = glCanvas.getContext('webgl', { alpha:false, antialias:false, premultipliedAlpha:false, powerPreference:'high-performance', preserveDrawingBuffer:true });
if (!gl) fail('Este navegador no expone WebGL.');
const EXT_VTF = gl ? gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0 : false;
if (gl) MAX_TEX = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

/* ---------- helpers GL ---------- */
function sh(t, src){ const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src); return s; }
function prog(fs, vs){ const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); p._u = {}; p._a = {}; return p; }
const U = (p, n) => p._u[n] !== undefined ? p._u[n] : (p._u[n] = gl.getUniformLocation(p, n));
const AT = (p, n) => p._a[n] !== undefined ? p._a[n] : (p._a[n] = gl.getAttribLocation(p, n));
const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
function drawQuad(p){ const l = AT(p, 'a_pos'); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
function makeTex(w, h){ const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
function fboFixed(w, h){ const t = makeTex(w, h), f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); if (!ok) console.warn('FBO incompleto', w, h); return { t, f, w, h, ok }; }
function freeFBO(o){ if (o) { gl.deleteTexture(o.t); gl.deleteFramebuffer(o.f); } }
function bindFBO(o){ gl.bindFramebuffer(gl.FRAMEBUFFER, o ? o.f : null); gl.viewport(0, 0, o ? o.w : glCanvas.width, o ? o.h : glCanvas.height); }
function useTex(unit, tex, p, name){ gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U(p, name), unit); }
function uploadCanvas(tex, cv){ gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); }

/* =====================================================================
   SHADERS
   ===================================================================== */
const VS_QUAD = `attribute vec2 a_pos;varying vec2 v_uv;void main(){v_uv=a_pos*.5+.5;gl_Position=vec4(a_pos,0.,1.);}`;
const VS_KEY = `attribute vec2 a_pos;uniform mat3 uH;varying vec2 v_uv;
void main(){vec2 uv=a_pos*.5+.5;v_uv=uv;vec3 p=uH*vec3(uv,1.);gl_Position=vec4(p.xy,0.,p.z);}`;
const FS_BLIT = `precision mediump float;varying vec2 v_uv;uniform sampler2D uTex;void main(){gl_FragColor=vec4(texture2D(uTex,v_uv).rgb,1.);}`;
/* Máscara. uMode: 0 brillo · 1 fondo aprendido · 2 esqueleto · 3 esqueleto y brillo (ambos).
   R = silueta, G = luminancia del video (para la niebla), B = esqueleto solo. */
const FS_MASK = `precision mediump float;varying vec2 v_uv;uniform sampler2D uVid,uBg,uSkel;uniform float uThr,uSoft,uMir;uniform int uMode;uniform vec2 uScale,uMaskRes;
void main(){vec2 q=(v_uv-.5)*uScale+.5;float inside=step(0.,q.x)*step(q.x,1.)*step(0.,q.y)*step(q.y,1.);
  if(uMir>.5)q.x=1.-q.x;q=clamp(q,0.,1.);
  vec3 c=texture2D(uVid,q).rgb;float l=dot(c,vec3(.299,.587,.114))*inside;float bg=texture2D(uBg,q).g;
  float sk=texture2D(uSkel,gl_FragCoord.xy/uMaskRes).r;
  float sig=uMode==1?abs(l-bg):l;float sb=smoothstep(uThr-uSoft,uThr+uSoft,sig)*inside;
  float sil=uMode==2?sk:(uMode==3?max(sk*.6,sb*sk):sb);
  gl_FragColor=vec4(sil,l,sk,1.);}`;
const FS_FEED = `precision highp float;varying vec2 v_uv;uniform sampler2D uScene,uPrev;uniform float uDecay,uZoom,uRot,uDrift;uniform int uMode;
void main(){vec2 c=v_uv-.5;float s=sin(uRot),co=cos(uRot);c=mat2(co,-s,s,co)*c/uZoom;vec2 puv=c+.5+vec2(uDrift,0.);
  vec3 sc=texture2D(uScene,v_uv).rgb;vec3 pv=texture2D(uPrev,puv).rgb*uDecay;
  if(puv.x<0.||puv.x>1.||puv.y<0.||puv.y>1.)pv=vec3(0.);
  vec3 o;if(uMode==0)o=sc;else if(uMode==1)o=sc+pv;else if(uMode==2)o=1.-(1.-sc)*(1.-pv);else o=max(sc,sc*(.35+pv*1.9)+pv*.25);
  gl_FragColor=vec4(o,1.);}`;
const FS_BRIGHT = `precision mediump float;varying vec2 v_uv;uniform sampler2D uTex;uniform float uThr;
void main(){vec3 c=texture2D(uTex,v_uv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));float k=max(l-uThr,0.)/max(l,1e-4);gl_FragColor=vec4(c*k,1.);}`;
const FS_BLUR = `precision mediump float;varying vec2 v_uv;uniform sampler2D uTex;uniform vec2 uDir;
void main(){vec3 s=texture2D(uTex,v_uv).rgb*.227027;
  s+=(texture2D(uTex,v_uv+uDir*1.3846).rgb+texture2D(uTex,v_uv-uDir*1.3846).rgb)*.316216;
  s+=(texture2D(uTex,v_uv+uDir*3.2307).rgb+texture2D(uTex,v_uv-uDir*3.2307).rgb)*.070270;gl_FragColor=vec4(s,1.);}`;
const FS_COMP = `precision mediump float;varying vec2 v_uv;uniform sampler2D uBase,uBloom;
uniform float uBloomAmt,uChroma,uGlitch,uBlocks,uTime,uVig,uGamma,uFlash,uSlices,uBlend;
float hash(vec2 v){return fract(sin(dot(v,vec2(12.9898,78.233)))*43758.5453);}
void main(){vec2 uv=v_uv;
  if(uGlitch>.001){float row=floor(uv.y*uBlocks),seed=floor(uTime*14.),r=hash(vec2(row,seed));
    if(r>1.-uGlitch*.55){uv.x+=(hash(vec2(row,seed+7.))-.5)*uGlitch*.22;uv.y+=(hash(vec2(row,seed+3.))-.5)*uGlitch*.012;}}
  vec2 d=uv-.5;float ca=uChroma*.012*(.35+length(d));
  vec3 b;b.r=texture2D(uBase,uv+d*ca).r;b.g=texture2D(uBase,uv).g;b.b=texture2D(uBase,uv-d*ca).b;
  vec3 c=b+texture2D(uBloom,uv).rgb*uBloomAmt;c*=1.-uVig*dot(d,d)*2.1;c+=uFlash;
  if(uSlices>1.5&&uBlend>0.){float fx=fract(uv.x*uSlices);float e=min(fx,1.-fx)/uBlend;c*=clamp(e,0.,1.)*.5+.5;}
  c=pow(max(c,0.),vec3(1./uGamma));gl_FragColor=vec4(c,1.);}`;
const FS_FINAL = `precision mediump float;varying vec2 v_uv;uniform sampler2D uTex;
void main(){vec2 uv=v_uv;if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.){gl_FragColor=vec4(0.,0.,0.,1.);return;}gl_FragColor=vec4(texture2D(uTex,uv).rgb,1.);}`;
/* silueta sólida a partir de la máscara (dibuja en el pase GL aditivo) */
const FS_SIL = `precision mediump float;varying vec2 v_uv;uniform sampler2D uMask;uniform vec3 uCol,uEdgeCol;uniform float uOpacity,uSoft,uEdge,uFill;uniform vec2 uRes;
void main(){vec4 m=texture2D(uMask,v_uv);float s=smoothstep(.5-uSoft,.5+uSoft,m.r);
  vec3 c=uCol*s*uOpacity*uFill;
  if(uEdge>0.){vec2 tx=1.5/uRes;float gx=texture2D(uMask,v_uv+vec2(tx.x,0.)).r-texture2D(uMask,v_uv-vec2(tx.x,0.)).r;
    float gy=texture2D(uMask,v_uv+vec2(0.,tx.y)).r-texture2D(uMask,v_uv-vec2(0.,tx.y)).r;c+=uEdgeCol*clamp(length(vec2(gx,gy))*2.,0.,1.)*uEdge;}
  gl_FragColor=vec4(c,1.);}`;
/* puntos: un programa, uMode elige módulo (niebla 0, líneas vivas 1, empuje 2) */
const VS_POINTS = `precision highp float;attribute vec2 a_ref;
uniform sampler2D uMask;uniform vec2 uRes;uniform float uTime;uniform int uMode;
uniform float uZ,uDrift,uScatter,uSelMin,uSoft,uKeep,uForce,uSize;
varying float v_b,v_z;
void main(){
  vec2 ref=a_ref;vec4 m=texture2D(uMask,ref);float sil=m.r,br=m.g;
  vec2 pos=ref*2.-1.;float z=0.;float show=br;
  if(uMode==0){z=br*uZ;pos.x+=sin(uTime*.7+ref.y*30.)*uDrift*.04*br;pos.y+=cos(uTime*.6+ref.x*28.)*uDrift*.04*br;show=br;}
  else if(uMode==1){float sel=smoothstep(uSelMin-uSoft,uSelMin+uSoft,sil);
    vec2 dsp=vec2(sin(ref.x*60.+uTime),cos(ref.y*57.-uTime))*uScatter*.5;pos+=dsp*sel*(1.-uKeep);show=sil;}
  else{vec2 tx=1./uRes;float sx=texture2D(uMask,ref+vec2(tx.x,0.)).r-texture2D(uMask,ref-vec2(tx.x,0.)).r;
    float sy=texture2D(uMask,ref+vec2(0.,tx.y)).r-texture2D(uMask,ref-vec2(0.,tx.y)).r;
    vec2 g=vec2(sx,sy);pos-=g*uForce*.5;show=max(sil,length(g)*4.);}
  if(show<.04){gl_Position=vec4(3.,3.,0.,1.);return;}
  gl_Position=vec4(pos,0.,1.);v_b=show;v_z=z;
  gl_PointSize=clamp(uSize*(.5+show*1.4),1.,42.);}`;
const FS_POINTS = `precision mediump float;varying float v_b,v_z;uniform float uHue,uSpread;
vec3 hsv(float h,float s,float v){vec3 k=vec3(1.,2./3.,1./3.);vec3 p=abs(fract(vec3(h)+k)*6.-3.);return v*mix(vec3(1.),clamp(p-1.,0.,1.),s);}
void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d);if(r>.25)discard;float a=(1.-r*4.)*v_b;
  float h=fract((uHue+v_z*180.+v_b*uSpread)/360.);gl_FragColor=vec4(hsv(h,.85,1.)*a,a);}`;

const VS_TILE = `attribute vec2 a_pos;uniform vec2 uOff,uScale;varying vec2 v_uv;void main(){v_uv=(a_pos*.5+.5)*uScale+uOff;gl_Position=vec4(a_pos,0.,1.);}`;
let pBlit, pMask, pFeed, pBright, pBlur, pComp, pFinal, pPoints, pSil, pTile;
try {
  pBlit = prog(FS_BLIT, VS_QUAD); pMask = prog(FS_MASK, VS_QUAD); pFeed = prog(FS_FEED, VS_QUAD);
  pBright = prog(FS_BRIGHT, VS_QUAD); pBlur = prog(FS_BLUR, VS_QUAD); pComp = prog(FS_COMP, VS_QUAD); pFinal = prog(FS_FINAL, VS_KEY);
  pSil = prog(FS_SIL, VS_QUAD); pTile = prog(FS_BLIT, VS_TILE);
  if (EXT_VTF) pPoints = prog(FS_POINTS, VS_POINTS);
} catch (e) { fail('Fallo al compilar shaders: ' + e.message); }

/* =====================================================================
   RECURSOS PERSISTENTES
   ===================================================================== */
let sceneTex = makeTex(2, 2), skelTex = makeTex(2, 2);
let fbScene = null, fbFeed = [null, null], fbBright = null, fbB1 = null, fbB2 = null, fbComp = null, fbMask = null, fbKey = null;
let MASK_W = 384, MASK_H = 216;
const maskCv = document.createElement('canvas'), mctx = maskCv.getContext('2d');   // silueta por esqueleto
let readBuf = new Uint8Array(4);   // lectura CPU de la máscara (garabato, lluvia, grilla)
let refBuf = null, refCount = 0;

function buildRefBuffer(){
  const N = Math.round(prof.gridN), asp = Math.sqrt(W / H);
  const Nx = Math.max(8, Math.round(N * asp)), Ny = Math.max(8, Math.round(N / asp));
  const arr = new Float32Array(Nx * Ny * 2); let k = 0;
  for (let y = 0; y < Ny; y++) for (let x = 0; x < Nx; x++) { arr[k++] = (x + .5) / Nx; arr[k++] = (y + .5) / Ny; }
  if (refBuf) gl.deleteBuffer(refBuf);
  refBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, refBuf); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  refCount = Nx * Ny;
}
function resize(){
  layoutStage();
  const o = outputSize();
  const dprWin = OUT.mode === 'ventana' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  let scale = dprWin * prof.renderScale;
  // tope del hardware: ningún FBO puede superar MAX_TEXTURE_SIZE (en 13440 px eso importa)
  const capScale = Math.min(MAX_TEX / o.w, MAX_TEX / o.h, 1.5);
  if (scale > capScale) scale = capScale;
  W = Math.max(2, Math.floor(o.w * scale)); H = Math.max(2, Math.floor(o.h * scale)); DPR = W / o.w;
  S2 = clamp(P.perf.scene2d, .3, 1);
  const cs = canvasSize(); if (mosaicActive()) { glCanvas.width = Math.min(cs.w, MAX_TEX); glCanvas.height = Math.min(cs.h, MAX_TEX); } else { glCanvas.width = W; glCanvas.height = H; }
  uiCanvas.width = W; uiCanvas.height = H;
  scene.width = Math.max(2, Math.round(W * S2)); scene.height = Math.max(2, Math.round(H * S2));
  [fbScene, fbFeed[0], fbFeed[1], fbComp, fbBright, fbB1, fbB2, fbMask, fbKey].forEach(freeFBO); fbKey = null;
  fbScene = fboFixed(W, H); fbFeed[0] = fboFixed(W, H); fbFeed[1] = fboFixed(W, H); fbComp = fboFixed(W, H);
  if (mosaicActive()) fbKey = fboFixed(W, H);
  const hw = Math.max(2, W >> 1), hh = Math.max(2, H >> 1);
  fbBright = fboFixed(hw, hh); fbB1 = fboFixed(hw, hh); fbB2 = fboFixed(hw, hh);
  MASK_H = 216; MASK_W = clamp(Math.round(MASK_H * W / H), 64, Math.min(4096, MAX_TEX));
  fbMask = fboFixed(MASK_W, MASK_H); maskCv.width = MASK_W; maskCv.height = MASK_H;
  readBuf = new Uint8Array(MASK_W * MASK_H * 4);
  if (typeof layoutCells === 'function') layoutCells();
  if (typeof onResizeModules === 'function') onResizeModules();
  clearFeedback();
}
function clearFeedback(){ [fbFeed[0], fbFeed[1], fbComp].forEach(o => { if (!o) return; bindFBO(o); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }); bindFBO(null); }
addEventListener('resize', () => { if (typeof running !== 'undefined' && running) { resize(); if (typeof updateMainOut === 'function') updateMainOut(); } else layoutStage(); });

/* =====================================================================
   HOMOGRAFÍA (keystone global)
   ===================================================================== */
let corners = [{ x:0, y:0 }, { x:1, y:0 }, { x:1, y:1 }, { x:0, y:1 }];
const resetCorners = () => { corners = [{ x:0, y:0 }, { x:1, y:0 }, { x:1, y:1 }, { x:0, y:1 }]; };
function homography(){
  const s = P.map.scale, q = corners.map(c => ({ x:(c.x - .5) * 2 * s, y:(c.y - .5) * 2 * s })); const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let a, b, c, d, e, f, g, h;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = p1.x - p0.x; b = p2.x - p1.x; c = p0.x; d = p1.y - p0.y; e = p2.y - p1.y; f = p0.y; g = 0; h = 0; }
  else { const den = dx1 * dy2 - dy1 * dx2; g = (dx3 * dy2 - dy3 * dx2) / den; h = (dx1 * dy3 - dy1 * dx3) / den;
    a = p1.x - p0.x + g * p1.x; b = p3.x - p0.x + h * p3.x; c = p0.x; d = p1.y - p0.y + g * p1.y; e = p3.y - p0.y + h * p3.y; f = p0.y; }
  return new Float32Array([a, d, g, b, e, h, c, f, 1]);
}

/* =====================================================================
   AVISOS
   ===================================================================== */
const toastEl = $('toast'); let toastT = 0;
function toast(msg, ms = 2500){ toastEl.textContent = msg; toastEl.classList.remove('hide'); clearTimeout(toastT); if (ms > 0) toastT = setTimeout(() => toastEl.classList.add('hide'), ms); }
function hideToast(){ toastEl.classList.add('hide'); }
const cueEl = $('cue');
function showCue(msg){ cueEl.textContent = msg; cueEl.classList.add('show'); }
function hideCue(){ cueEl.classList.remove('show'); }
function hsl(h, s, l, a = 1){ return `hsla(${h},${s}%,${l}%,${a})`; }
function hsvToRgb(h, s, v){ h = ((h % 360) + 360) % 360 / 60; const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]; }
