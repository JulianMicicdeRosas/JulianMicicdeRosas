"use strict";
/* =====================================================================
   MIRADOR — efectos tomados de técnicas de TouchDesigner para danza
   · reaccion: reacción-difusión (Gray-Scott) en un lazo de feedback,
     sembrada por el borde del cuerpo. En TD: Feedback TOP + GLSL.
   · cintas: estelas en manos, pies y cabeza. En TD: Trail CHOP +
     instancing (instalación GO ROBOTS, Derivative).
   · crono: copias del cuerpo en el tiempo (Cache TOP) y slit-scan /
     Time Machine (cada parte del cuerpo con otro retraso).
   El eco con campo de flujo (Feedback + Displace) está en FS_FEED.
   Todo acotado: historias de largo fijo, nada crece con el tiempo.
   ===================================================================== */

/* ---------- reacción-difusión ---------- */
const FS_RD = FL_HEAD + `float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
uniform float uT;uniform vec2 uTx;uniform sampler2D uS,uMask,uMB,uMBf;uniform float uF,uK,uSeed,uReach,uDa,uDb;
void main(){vec4 c=texture2D(uS,v_uv);vec2 dx=vec2(vR.x-v_uv.x,0.),dy=vec2(0.,vT.y-v_uv.y);
vec4 lap=(texture2D(uS,vL)+texture2D(uS,vR)+texture2D(uS,vT)+texture2D(uS,vB))*.2+(texture2D(uS,v_uv+dx+dy)+texture2D(uS,v_uv+dx-dy)+texture2D(uS,v_uv-dx+dy)+texture2D(uS,v_uv-dx-dy))*.05-c;
float a=1.-c.r,b=c.g;float lapA=-lap.r,lapB=lap.g;
float m=texture2D(uMask,v_uv).r,n=texture2D(uMB,v_uv).r,f=texture2D(uMBf,v_uv).r;
float near=clamp((f*10.+m)*uReach,0.,1.);float k=uK+(1.-near)*.01;
float r=a*b*b;a+=uDa*lapA-r+uF*(1.-a);b+=uDb*lapB+r-(k+uF)*b;
float ring=clamp(n*(1.-m)*4.,0.,1.);float spot=step(.985,hash12(floor(v_uv/(uTx*3.))+floor(uT*4.)));b=max(b,ring*spot*uSeed);
gl_FragColor=vec4(1.-clamp(a,0.,1.),clamp(b,0.,1.),0.,1.);}`;
const FS_RDDRAW = GLSL_HP + `varying vec2 v_uv;uniform sampler2D uS;uniform vec3 uC0,uC1,uC2;uniform float uAlpha;uniform vec2 uTx;
vec3 pal(float t,vec3 a,vec3 b,vec3 c){t=clamp(t,0.,1.);return t<.5?mix(a,b,t*2.):mix(b,c,t*2.-1.);}
void main(){float b=texture2D(uS,v_uv).g;float bx=texture2D(uS,v_uv+vec2(uTx.x,0.)).g-b,by=texture2D(uS,v_uv+vec2(0.,uTx.y)).g-b;
float v=smoothstep(.08,.38,b);float rim=clamp(length(vec2(bx,by))*9.,0.,1.);
gl_FragColor=vec4((pal(v*.75,uC0,uC1,uC2)*v+uC2*rim*.6)*uAlpha,1.);}`;
const rd = { s:null, w:0, h:0 }; let pRD = null, pRDDraw = null;
const RD_TIPOS = { coral:[.0545, .062], laberinto:[.029, .057], manchas:[.035, .065], gusanos:[.046, .063], burbujas:[.012, .05] };
registerModule('reaccion', { needs:['mask', 'maskblur'], param:P.reaccion, label:'Reacción-difusión', desc:'Un tejido vivo (coral, laberinto, manchas) que crece desde el borde del cuerpo y se disuelve lejos de él. Técnica clásica de feedback en TouchDesigner.',
  alloc(){ this.resize(); },
  resize(){ this.free(); if (!FX_OK) return; const asp = W / H, h = Math.round(clamp(Math.min(({ ligero:150, equilibrado:200, completo:256 })[prof.tier] || 200, 2048 / asp), 64, 256)); rd.h = h; rd.w = Math.round(h * asp); rd.s = dfbo(rd.w, rd.h, FX.f16, FX.lin16); },
  free(){ freeD(rd.s); rd.s = null; },
  clear(){ if (rd.s) { clearF(rd.s.read); clearF(rd.s.write); } },
  draw(){ if (!rd.s || !pRD || !mblur.b) return; const R = P.reaccion, fk = RD_TIPOS[R.tipo] || RD_TIPOS.coral;
    gl.disable(gl.BLEND); gl.useProgram(pRD); gl.uniform2f(U(pRD, 'uTx'), 1 / rd.w, 1 / rd.h);
    useTex(1, fbMask.t, pRD, 'uMask'); useTex(2, mblur.b.t, pRD, 'uMB'); useTex(3, mblur.b2.t, pRD, 'uMBf');
    gl.uniform1f(U(pRD, 'uF'), fk[0]); gl.uniform1f(U(pRD, 'uK'), fk[1]); gl.uniform1f(U(pRD, 'uSeed'), R.siembra); gl.uniform1f(U(pRD, 'uReach'), R.alcance);
    gl.uniform1f(U(pRD, 'uT'), nowT % 1000); gl.uniform1f(U(pRD, 'uDa'), 1); gl.uniform1f(U(pRD, 'uDb'), .5);
    const it = Math.round((({ ligero:5, equilibrado:8, completo:12 })[prof.tier] || 8) * clamp(R.velocidad * AM.speed, .2, 2.5));
    for (let i = 0; i < it; i++) { bindFBO(rd.s.write); useTex(0, rd.s.read.t, pRD, 'uS'); drawQuad(pRD); rd.s.swap(); }
    bindFBO(fbScene); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(pRDDraw); useTex(0, rd.s.read.t, pRDDraw, 'uS'); setPalette(pRDDraw, R.paleta, R.hue);
    gl.uniform1f(U(pRDDraw, 'uAlpha'), R.brillo * AM.glow); gl.uniform2f(U(pRDDraw, 'uTx'), 1 / rd.w, 1 / rd.h); drawQuad(pRDDraw); } });

/* ---------- color CSS desde una paleta ---------- */
function palCss(name, hue, t, a){ const c = paletteRGB(name, hue), k = clamp(t, 0, 1), x = k < .5 ? k * 2 : k * 2 - 1, A = k < .5 ? c[0] : c[1], B = k < .5 ? c[1] : c[2];
  return `rgba(${Math.round((A[0] + (B[0] - A[0]) * x) * 255)},${Math.round((A[1] + (B[1] - A[1]) * x) * 255)},${Math.round((A[2] + (B[2] - A[2]) * x) * 255)},${a})`; }

/* ---------- cintas: estelas en las extremidades ---------- */
const CINTA_SETS = { manos:[9, 10], 'manos y pies':[9, 10, 15, 16], todo:[0, 9, 10, 15, 16] };
const cintas = new Map();   // id:articulación → puntos (largo fijo)
registerModule('cintas', { needs:[], param:P.cintas, label:'Cintas', desc:'Cintas de luz que salen de manos, pies y cabeza y siguen el recorrido, como una gimnasta con cinta (Trail CHOP + instancing en TouchDesigner).',
  free(){ cintas.clear(); },
  update(){ const C = P.cintas, set = CINTA_SETS[C.partes] || CINTA_SETS.manos, ms = P.track.minScore, N = clamp(Math.round(C.largo), 6, 90), live = new Set();
    for (const b of bodies.values()) for (const i of set) { const k = b.kp[i]; if (!k || k.s < ms) continue; const key = b.id + '|' + i; live.add(key);
      let r = cintas.get(key); if (!r) { r = { pts:[], hue:b.hue }; cintas.set(key, r); }
      r.hue = b.hue; r.pts.push({ x:k.x, y:k.y }); while (r.pts.length > N) r.pts.shift(); }
    for (const [key, r] of cintas) if (!live.has(key)) { r.pts.shift(); r.pts.shift(); if (!r.pts.length) cintas.delete(key); } },
  draw2d(){ const C = P.cintas, wMax = C.ancho * DPR * AM.size, t = nowT * AM.speed; sctx.globalCompositeOperation = 'lighter'; sctx.lineCap = 'round'; sctx.lineJoin = 'round';
    for (const r of cintas.values()) { const p = r.pts, n = p.length; if (n < 3) continue;
      for (let i = 1; i < n - 1; i++) { const f = i / (n - 1), w = Math.max(.5, wMax * Math.pow(f, .8) * (1 + .35 * Math.sin(f * 9 - t * 4) * C.ondular));
        const ox = Noise(i * .21, t * .7 + p[i].y * .002) * C.ondular * 10 * DPR * (1 - f), a = p[i - 1], b = p[i], c = p[i + 1];
        sctx.strokeStyle = palCss(C.paleta, r.hue, .25 + f * .75, (.15 + .8 * f) * C.brillo); sctx.lineWidth = w;
        sctx.beginPath(); sctx.moveTo((a.x + b.x) / 2 + ox, (a.y + b.y) / 2); sctx.quadraticCurveTo(b.x + ox, b.y, (b.x + c.x) / 2 + ox, (b.y + c.y) / 2); sctx.stroke(); } }
    sctx.globalCompositeOperation = 'source-over'; } });

/* ---------- crono: copias en el tiempo y slit-scan ---------- */
const CRONO_MAX = 120; const cronoH = new Map();   // id → anillo de poses
registerModule('crono', { needs:[], param:P.crono, label:'Cuerpo en el tiempo', desc:'Copias del cuerpo que quedan atrás (cronofotografía de Marey, Pas de deux de McLaren; Cache TOP en TouchDesigner) o slit-scan: cada parte del cuerpo llega con otro retraso y la figura se estira como goma (Time Machine).',
  free(){ cronoH.clear(); },
  update(){ for (const id of [...cronoH.keys()]) if (!bodies.has(id)) cronoH.delete(id);
    for (const b of bodies.values()) { let h = cronoH.get(b.id); if (!h) { h = []; cronoH.set(b.id, h); }
      h.push({ kp:b.kp.map(k => k ? { x:k.x, y:k.y, s:k.s } : null), sc:bodyScale(b) }); if (h.length > CRONO_MAX) h.shift(); } },
  figure(kp, sc, col, wMul){ const ms = P.track.minScore; sctx.strokeStyle = col; sctx.fillStyle = col; sctx.lineWidth = Math.max(1, sc * .2 * wMul); sctx.beginPath();
    for (const [a, c] of SKEL) { const ka = kp[a], kc = kp[c]; if (ka && kc && ka.s > ms && kc.s > ms) { sctx.moveTo(ka.x, ka.y); sctx.lineTo(kc.x, kc.y); } } sctx.stroke();
    const n = kp[0]; if (n && n.s > ms) { sctx.beginPath(); sctx.arc(n.x, n.y - sc * .08, sc * .22 * wMul, 0, 6.2832); sctx.fill(); } },
  draw2d(){ const C = P.crono; sctx.globalCompositeOperation = 'lighter'; sctx.lineCap = 'round'; sctx.lineJoin = 'round';
    for (const b of bodies.values()) { const h = cronoH.get(b.id); if (!h || h.length < 2) continue; const last = h.length - 1;
      if (C.modo === 'slitscan') { const cur = h[last].kp; let y0 = 1e9, y1 = -1e9; for (const k of cur) if (k && k.s > P.track.minScore) { y0 = Math.min(y0, k.y); y1 = Math.max(y1, k.y); }
        const span = Math.max(1, y1 - y0), maxD = Math.min(last, Math.round(C.retraso * 60));
        const kp = cur.map((k, i) => { if (!k) return null; let f = (k.y - y0) / span; if (C.desde === 'cabeza') f = 1 - f; const o = h[last - Math.round(clamp(f, 0, 1) * maxD)].kp[i]; return o && o.s > P.track.minScore ? { x:o.x, y:o.y, s:k.s } : k; });
        this.figure(kp, h[last].sc, palCss(C.paleta, b.hue, .8, .85 * C.brillo), C.grosor); }
      else { const n = clamp(Math.round(C.copias), 1, 12), step = Math.max(1, Math.round(C.retraso * 60 / n));
        for (let i = n; i >= 0; i--) { const j = last - i * step; if (j < 0) continue; const f = 1 - i / (n + 1);
          this.figure(h[j].kp, h[j].sc, palCss(C.paleta, b.hue, .15 + f * .85, (i ? .12 + .5 * f * f : .9) * C.brillo), C.grosor * (i ? .55 + .45 * f : 1)); } } }
    sctx.globalCompositeOperation = 'source-over'; } });

(function compileFX2(){ if (!gl || !FX_OK) return; try { pRD = prog(FS_RD, VS_FL); pRDDraw = prog(FS_RDDRAW, VS_QUAD); } catch (e) { console.error('efectos2:', e); } })();
{ const base = fxAvailable; fxAvailable = function(id){ return id === 'reaccion' ? FX_OK && !!pRD : base(id); };
  const baseC = clearFX; clearFX = function(){ baseC(); const m = Modules.get('reaccion'); if (m && m._alloc) m.clear(); }; }
