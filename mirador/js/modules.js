"use strict";
/* =====================================================================
   MIRADOR — módulos visuales
   Bus de recursos: un productor (mask, maskcpu) solo corre si algún
   módulo activo lo necesita. Cada módulo puede tener:
     update(dt)  lógica CPU · draw2d() dibuja en la capa 2D (scene) ·
     draw() dibuja en GL aditivo sobre la escena · alloc()/free().
   AM = multiplicadores que deja el audio (ver audio.js).
   ===================================================================== */
const AM = { size:1, glow:1, bloom:0, scatter:1, hue:0, echo:0, flash:0, speed:1, level:0, beat:0, bass:0, mid:0, high:0 };
const Modules = new Map();
let plan = [], producersNeeded = new Set(), nowT = 0;
function registerModule(id, def){ Modules.set(id, Object.assign({ id, active:false }, def)); }
function rebuildPlan(){
  const active = [...Modules.values()].filter(m => m.active && !m.producer);
  producersNeeded = new Set();
  active.forEach(m => (m.needs || []).forEach(r => producersNeeded.add(r)));
  let changed = true;
  while (changed) { changed = false; for (const m of Modules.values()) if (m.producer && producersNeeded.has(m.res))
    (m.needs || []).forEach(r => { if (!producersNeeded.has(r)) { producersNeeded.add(r); changed = true; } }); }
  const prods = [...Modules.values()].filter(m => m.producer && producersNeeded.has(m.res));
  prods.sort((a, b) => (a.needs?.includes(b.res) ? 1 : (b.needs?.includes(a.res) ? -1 : 0)));
  plan = [...prods, ...active];
  for (const m of Modules.values()) {
    const want = (m.producer && producersNeeded.has(m.res)) || (m.active && !m.producer);
    if (want && !m._alloc) { m.alloc && m.alloc(); m._alloc = true; }
    if (!want && m._alloc) { m.free && m.free(); m._alloc = false; }
  }
  if (typeof UI !== 'undefined') UI.refresh('modulos');
}
function setModule(id, on){ const m = Modules.get(id); if (!m) return; m.active = !!on; if (m.param) m.param.enabled = !!on; }
function syncModulesFromP(){ for (const id of MODULE_IDS) { const m = Modules.get(id); if (m && P[id]) m.active = !!P[id].enabled; } rebuildPlan(); }
function onResizeModules(){ for (const m of Modules.values()) if (m._alloc && m.resize) m.resize(); }

/* ===================== PRODUCTOR: mask (GPU) ===================== */
const MASK_MODE = { brillo:0, fondo:1, esqueleto:2, ambos:3 };
function drawSkeletonMask(){
  // silueta dibujada a partir del esqueleto: cápsulas por hueso + torso + cabeza (robusta a la luz del proyector)
  const k = MASK_W / W, ms = P.track.minScore, bw = P.mask.bodyWidth;
  mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, MASK_W, MASK_H);
  mctx.fillStyle = '#fff'; mctx.strokeStyle = '#fff'; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
  for (const b of bodies.values()) {
    const sc = bodyScale(b) * k, kp = b.kp, ok = i => kp[i] && kp[i].s > ms;
    const thick = Math.max(2, sc * .34 * bw);
    mctx.lineWidth = thick; mctx.beginPath();
    for (const [a, c] of SKEL) if (ok(a) && ok(c)) { mctx.moveTo(kp[a].x * k, kp[a].y * k); mctx.lineTo(kp[c].x * k, kp[c].y * k); }
    mctx.stroke();
    if (ok(5) && ok(6) && ok(11) && ok(12)) { mctx.beginPath(); mctx.moveTo(kp[5].x * k, kp[5].y * k); mctx.lineTo(kp[6].x * k, kp[6].y * k); mctx.lineTo(kp[12].x * k, kp[12].y * k); mctx.lineTo(kp[11].x * k, kp[11].y * k); mctx.closePath(); mctx.fill(); mctx.lineWidth = thick * .8; mctx.stroke(); }
    if (ok(0)) { let r = sc * .32 * bw; if (ok(5) && ok(6)) r = Math.max(r, Math.hypot(kp[5].x - kp[6].x, kp[5].y - kp[6].y) * k * .36 * bw);
      mctx.beginPath(); mctx.arc(kp[0].x * k, kp[0].y * k - r * .25, r, 0, 6.2832); mctx.fill(); }
  }
}
registerModule('mask', { producer:true, res:'mask', needs:[],
  produce(){
    const mode = MASK_MODE[P.mask.source] ?? 2;
    if (mode >= 2) { drawSkeletonMask(); uploadCanvas(skelTex, maskCv); }
    bindFBO(fbMask); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.BLEND); gl.useProgram(pMask);
    gl.uniform2f(U(pMask, 'uMaskRes'), MASK_W, MASK_H); gl.uniform1i(U(pMask, 'uMode'), mode);
    gl.uniform1f(U(pMask, 'uThr'), P.mask.threshold); gl.uniform1f(U(pMask, 'uSoft'), Math.max(.01, P.mask.softness));
    useTex(2, skelTex, pMask, 'uSkel');
    const kx = MASK_W / W, ky = MASK_H / H;
    const list = sources.length ? sources : [null];
    for (const src of list) {
      const c = src?.cell || { x:0, y:0, w:W, h:H };
      gl.viewport(Math.round(c.x * kx), Math.round((H - c.y - c.h) * ky), Math.max(1, Math.round(c.w * kx)), Math.max(1, Math.round(c.h * ky)));
      const hasVid = src && src.video.readyState >= 2;
      useTex(0, hasVid ? src.videoTex : skelTex, pMask, 'uVid'); useTex(1, src ? src.bgTex : skelTex, pMask, 'uBg');
      if (hasVid) { const vw = src.video.videoWidth || 640, vh = src.video.videoHeight || 480, sc = Math.min(c.w / vw, c.h / vh);
        gl.uniform2f(U(pMask, 'uScale'), c.w / (vw * sc), c.h / (vh * sc)); gl.uniform1f(U(pMask, 'uMir'), zoneMirror(src) ? 1 : 0); }
      else { gl.uniform2f(U(pMask, 'uScale'), 1, 1); gl.uniform1f(U(pMask, 'uMir'), 0); }
      drawQuad(pMask);
    }
    gl.viewport(0, 0, MASK_W, MASK_H);
  } });
/* ===================== PRODUCTOR: maskcpu (lectura a CPU, cada 2 cuadros) ===================== */
let maskTick = 0, maskFresh = false;
registerModule('maskcpu', { producer:true, res:'maskcpu', needs:['mask'],
  produce(){ maskFresh = (maskTick++ % 2) === 0; if (!maskFresh) return; bindFBO(fbMask); gl.readPixels(0, 0, MASK_W, MASK_H, gl.RGBA, gl.UNSIGNED_BYTE, readBuf); } });
/* valor de máscara (0..255) en coordenadas de salida internas (W,H); el FBO está invertido en Y */
function maskAt(x, y){ const mx = (x * MASK_W / W) | 0, my = (y * MASK_H / H) | 0; if (mx < 0 || my < 0 || mx >= MASK_W || my >= MASK_H) return 0; return readBuf[((MASK_H - 1 - my) * MASK_W + mx) * 4]; }

/* ===================== puntos GL (niebla, líneas vivas, empuje) ===================== */
function drawPoints(mode, cfg){
  if (!pPoints) return;
  gl.useProgram(pPoints);
  const l = AT(pPoints, 'a_ref'); gl.bindBuffer(gl.ARRAY_BUFFER, refBuf);
  gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
  useTex(0, fbMask.t, pPoints, 'uMask');
  gl.uniform2f(U(pPoints, 'uRes'), MASK_W, MASK_H);
  gl.uniform1f(U(pPoints, 'uTime'), nowT * AM.speed); gl.uniform1i(U(pPoints, 'uMode'), mode);
  gl.uniform1f(U(pPoints, 'uZ'), cfg.z || 0); gl.uniform1f(U(pPoints, 'uDrift'), cfg.drift || 0);
  gl.uniform1f(U(pPoints, 'uScatter'), (cfg.scatter || 0) * AM.scatter); gl.uniform1f(U(pPoints, 'uSelMin'), cfg.selMin || .5);
  gl.uniform1f(U(pPoints, 'uSoft'), cfg.soft || .1); gl.uniform1f(U(pPoints, 'uKeep'), cfg.keep || 0);
  gl.uniform1f(U(pPoints, 'uForce'), cfg.force || 0); gl.uniform1f(U(pPoints, 'uSize'), (cfg.size || 2) * DPR * AM.size);
  gl.uniform1f(U(pPoints, 'uHue'), (cfg.hue || 200) + AM.hue); gl.uniform1f(U(pPoints, 'uSpread'), cfg.spread || 60);
  gl.drawArrays(gl.POINTS, 0, refCount);
}
registerModule('fog', { needs:['mask'], param:P.fog, label:'Niebla de puntos', desc:'El brillo del video como nube de puntos con profundidad. Necesita ver el video (fuente brillo).',
  draw(){ drawPoints(0, { z:P.fog.zDepth, drift:P.fog.drift, size:eff(P.fog, 'size', prof.caps['fog.size']), hue:P.fog.hue, spread:P.fog.hueSpread }); } });
registerModule('vivas', { needs:['mask'], param:P.vivas, label:'Líneas vivas', desc:'Puntos de la silueta que se dispersan y vuelven.',
  draw(){ drawPoints(1, { selMin:P.vivas.selMin, soft:P.vivas.soft, scatter:P.vivas.scatter, keep:P.vivas.keepForm, size:eff(P.vivas, 'size', prof.caps['vivas.size']), hue:P.vivas.hue, spread:40 }); } });
registerModule('push', { needs:['mask'], param:P.push, label:'Empuje', desc:'Un campo de puntos que el cuerpo desplaza por el borde.',
  draw(){ drawPoints(2, { force:P.push.force, size:eff(P.push, 'size', prof.caps['push.size']), hue:P.push.hue, spread:30 }); } });

/* ===================== Silueta (GL) — Videoplace / Treachery of Sanctuary ===================== */
registerModule('silueta', { needs:['mask'], param:P.silueta, label:'Silueta', desc:'Sombra sólida del cuerpo (Videoplace, Krueger 1974). Con borde luminoso opcional.',
  draw(){ const s = P.silueta; gl.useProgram(pSil); useTex(0, fbMask.t, pSil, 'uMask');
    const c = hsvToRgb(s.hue + AM.hue, 1 - s.white, 1), e = hsvToRgb(s.edgeHue + AM.hue, .8, 1);
    gl.uniform3f(U(pSil, 'uCol'), c[0], c[1], c[2]); gl.uniform3f(U(pSil, 'uEdgeCol'), e[0], e[1], e[2]);
    gl.uniform1f(U(pSil, 'uOpacity'), s.opacity * (1 + AM.beat * P.audio.react.flash * .5)); gl.uniform1f(U(pSil, 'uSoft'), Math.max(.005, s.soft));
    gl.uniform1f(U(pSil, 'uEdge'), s.edge * AM.glow); gl.uniform1f(U(pSil, 'uFill'), s.fill ? 1 : 0); gl.uniform2f(U(pSil, 'uRes'), MASK_W, MASK_H); drawQuad(pSil); } });

/* ===================== Garabato (contorno 2D) ===================== */
let contourSegs = [];
registerModule('scribble', { needs:['maskcpu'], param:P.scribble, label:'Garabato', desc:'Contorno de la silueta trazado a mano temblorosa.',
  update(){ if (maskFresh) marchingSquares(); },
  draw2d(){ if (!contourSegs.length) return; const s = P.scribble;
    sctx.globalCompositeOperation = 'lighter'; sctx.lineCap = 'round'; sctx.lineWidth = s.width * DPR * AM.size;
    sctx.strokeStyle = hsl(s.hue + AM.hue, 95, 55 + 25 * s.glow * AM.glow, .5 + .45 * s.glow);
    const j = s.jitter * Math.min(W, H) * AM.scatter, t = nowT * AM.speed; sctx.beginPath();
    for (const g of contourSegs) { const n1 = Noise(g.x1 * .01 + t, g.y1 * .01) * j, n2 = Noise(g.x1 * .01, g.y1 * .01 - t) * j,
      n3 = Noise(g.x2 * .01 + t, g.y2 * .01) * j, n4 = Noise(g.x2 * .01, g.y2 * .01 - t) * j;
      sctx.moveTo(g.x1 + n1, g.y1 + n2); sctx.lineTo(g.x2 + n3, g.y2 + n4); }
    sctx.stroke(); sctx.globalCompositeOperation = 'source-over'; } });
function marchingSquares(){
  contourSegs.length = 0; const iso = P.scribble.iso * 255, gw = MASK_W, gh = MASK_H, step = 2, sx = W / gw, sy = H / gh;
  const at = (x, y) => readBuf[((gh - 1 - y) * gw + x) * 4];
  for (let y = 0; y < gh - step; y += step) for (let x = 0; x < gw - step; x += step) {
    const a = at(x, y) > iso, b = at(x + step, y) > iso, c = at(x + step, y + step) > iso, d = at(x, y + step) > iso;
    const idx = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0); if (idx === 0 || idx === 15) continue;
    const L = { x:x * sx, y:(y + .5 * step) * sy }, R = { x:(x + step) * sx, y:(y + .5 * step) * sy }, T = { x:(x + .5 * step) * sx, y:y * sy }, B = { x:(x + .5 * step) * sx, y:(y + step) * sy };
    const push = (p, q) => contourSegs.push({ x1:p.x, y1:p.y, x2:q.x, y2:q.y });
    switch (idx) { case 1: case 14: push(L, B); break; case 2: case 13: push(B, R); break; case 3: case 12: push(L, R); break;
      case 4: case 11: push(T, R); break; case 6: case 9: push(T, B); break; case 7: case 8: push(L, T); break;
      case 5: push(L, T); push(B, R); break; case 10: push(T, R); push(L, B); break; }
  }
}

/* ===================== Enjambre (partículas por cuerpo) ===================== */
const swarmPools = new Map();
function pointInQuad(p1, p2, p3, p4, u, v){ const tx = p1.x + (p2.x - p1.x) * u, ty = p1.y + (p2.y - p1.y) * u, bx = p4.x + (p3.x - p4.x) * u, by = p4.y + (p3.y - p4.y) * u; return { x:tx + (bx - tx) * v, y:ty + (by - ty) * v }; }
function pointInCapsule(k1, k2, radius, u, r, a){ const cx = k1.x + (k2.x - k1.x) * u, cy = k1.y + (k2.y - k1.y) * u, o = r * radius; return { x:cx + Math.cos(a) * o, y:cy + Math.sin(a) * o }; }
function getStableKP(kp, anchor, key, threshold = 4.5 * DPR){
  if (!kp || kp.s < P.track.minScore) return null;
  if (!anchor[key]) { anchor[key] = { x:kp.x, y:kp.y }; return anchor[key]; }
  const cur = anchor[key], dist = Math.hypot(kp.x - cur.x, kp.y - cur.y);
  if (dist > threshold) { cur.x += (kp.x - cur.x) * .35; cur.y += (kp.y - cur.y) * .35; }
  return cur;
}
function swarmTargets(b, pool, total){
  if (!pool.volRand || pool.volRand.length !== total) { pool.volRand = []; for (let i = 0; i < total; i++) pool.volRand.push({ region:Math.random(), u:Math.random(), v:Math.random(), r:Math.sqrt(Math.random()), a:Math.random() * 6.28318 }); }
  const targets = [], scale = bodyScale(b), limbThick = scale * .18, A = pool.anchor;
  const ls = getStableKP(b.kp[5], A, 'ls'), rs = getStableKP(b.kp[6], A, 'rs'), lh = getStableKP(b.kp[11], A, 'lh'), rh = getStableKP(b.kp[12], A, 'rh');
  const nose = getStableKP(b.kp[0], A, 'nose'), le = getStableKP(b.kp[7], A, 'le'), re = getStableKP(b.kp[8], A, 're'), lw = getStableKP(b.kp[9], A, 'lw'), rw = getStableKP(b.kp[10], A, 'rw');
  const lk = getStableKP(b.kp[13], A, 'lk'), rk = getStableKP(b.kp[14], A, 'rk'), la = getStableKP(b.kp[15], A, 'la'), ra = getStableKP(b.kp[16], A, 'ra');
  const limb = (a, m, c, rnd, t1, t2) => rnd.u < .5 && a && m ? pointInCapsule(a, m, limbThick * t1, rnd.v, rnd.r, rnd.a) : (rnd.u >= .5 && m && c ? pointInCapsule(m, c, limbThick * t2, rnd.v, rnd.r, rnd.a) : (a ? { x:a.x + Math.cos(rnd.a) * limbThick * rnd.r, y:a.y + Math.sin(rnd.a) * limbThick * rnd.r } : null));
  for (const rnd of pool.volRand) {
    let pt = null; const r = rnd.region;
    if (r < .15) pt = limb(ls, le, lw, rnd, 1, .8);
    else if (r < .30) pt = limb(rs, re, rw, rnd, 1, .8);
    else if (r < .45) pt = limb(lh, lk, la, rnd, 1.1, .8);
    else if (r < .60) pt = limb(rh, rk, ra, rnd, 1.1, .8);
    else if (r < .70 && nose) { const hr = scale * .35 * rnd.r; pt = { x:nose.x + Math.cos(rnd.a) * hr, y:(nose.y - scale * .05) + Math.sin(rnd.a) * hr }; }
    if (!pt) { if (ls && rs && rh && lh) pt = pointInQuad(ls, rs, rh, lh, rnd.u, rnd.v);
      else { const com = centerOfMass(b) || { x:W / 2, y:H / 2 }; pt = { x:com.x + (rnd.u - .5) * scale * .8, y:com.y + (rnd.v - .5) * scale * .8 }; } }
    targets.push(pt);
  }
  return targets;
}
class SwarmParticle {
  constructor(cx, cy, spread){ this.x = cx + (Math.random() - .5) * spread; this.y = cy + (Math.random() - .5) * spread; this.vx = 0; this.vy = 0; this.tx = this.x; this.ty = this.y; }
  update(speed, sensitivity, keepForm){
    if (speed <= 0) { this.x = this.tx; this.y = this.ty; this.vx = 0; this.vy = 0; return; }
    const stillness = 1 - Math.min(speed, 1), cohesion = Math.max(stillness, keepForm), spring = .02 + cohesion * cohesion * .16;
    const noise = speed * (sensitivity / 5) * 1.6 * DPR * (1 - keepForm) * AM.scatter;
    if (noise > .02 * DPR) { this.vx += (Math.random() - .5) * noise; this.vy += (Math.random() - .5) * noise; }
    this.vx = (this.vx + (this.tx - this.x) * spring) * .90; this.vy = (this.vy + (this.ty - this.y) * spring) * .90;
    this.x += this.vx; this.y += this.vy;
    if (this.x < -60) this.x = -60; else if (this.x > W + 60) this.x = W + 60;
    if (this.y < -60) this.y = -60; else if (this.y > H + 60) this.y = H + 60;
  }
}
registerModule('swarm', { needs:[], param:P.swarm, label:'Enjambre', desc:'Partículas que arman el cuerpo cuando está quieto y se dispersan al moverse (particle-swarm-pose).',
  free(){ swarmPools.clear(); },
  update(){
    const per = Math.round(P.swarm.density);
    for (const id of [...swarmPools.keys()]) if (!bodies.has(id)) swarmPools.delete(id);
    for (const b of bodies.values()) {
      let pool = swarmPools.get(b.id); if (!pool) { pool = { parts:[], speed:0, anchor:{} }; swarmPools.set(b.id, pool); }
      const raw = bodySpeed(b); pool.speed = raw === 0 ? 0 : pool.speed + (raw - pool.speed) * .25;
      const targets = swarmTargets(b, pool, per), com = centerOfMass(b) || { x:W / 2, y:H / 2 }, spread = bodyScale(b) * 1.6;
      if (pool.parts.length < per) for (let i = pool.parts.length; i < per; i++) pool.parts.push(new SwarmParticle(com.x, com.y, spread));
      else if (pool.parts.length > per) pool.parts.length = per;
      for (let i = 0; i < pool.parts.length; i++) { const p = pool.parts[i]; if (targets[i]) { p.tx = targets[i].x; p.ty = targets[i].y; } p.update(pool.speed, P.swarm.sensitivity, P.swarm.keepForm); }
    }
  },
  draw2d(){
    if (!swarmPools.size) return;
    sctx.globalCompositeOperation = 'lighter'; const sz = P.swarm.size * DPR * AM.size, alpha = .5 + .45 * P.swarm.glow;
    for (const b of bodies.values()) {
      const pool = swarmPools.get(b.id); if (!pool || !pool.parts.length) continue;
      const sp = Math.min(pool.speed, 1), base = P.swarm.useBodyHue ? b.hue : P.swarm.hue;
      sctx.fillStyle = hsl((base + sp * 45 + AM.hue) % 360, 92, 56 + sp * 18 + 10 * (AM.glow - 1), alpha); sctx.beginPath();
      for (const p of pool.parts) { const r = sz * (.6 + (sp > 0 ? Math.random() * .5 : .2)); sctx.moveTo(p.x + r, p.y); sctx.arc(p.x, p.y, r, 0, 6.28318); }
      sctx.fill();
    }
    sctx.globalCompositeOperation = 'source-over';
  } });

/* ===================== Lluvia de letras — Text Rain (Utterback & Achituv, 1999) ===================== */
const rain = { letters:[], text:'' };
function rainChars(){ const t = (P.lluvia.text || 'mirador').replace(/\s+/g, ' '); return t.length ? t : 'mirador'; }
registerModule('lluvia', { needs:['maskcpu'], param:P.lluvia, label:'Lluvia de letras', desc:'Letras que caen y se posan sobre el cuerpo; al moverse las dejás caer (Text Rain).',
  free(){ rain.letters.length = 0; },
  update(dt){
    const L = P.lluvia, size = L.size * DPR, chars = rainChars();
    const want = Math.round((W / (1000 * DPR)) * 90 * L.density);
    while (rain.letters.length < want) rain.letters.push({ x:Math.random() * W, y:-Math.random() * H, v:0, c:chars[(Math.random() * chars.length) | 0], rest:0 });
    if (rain.letters.length > want) rain.letters.length = want;
    const g = 220 * DPR * L.speed * AM.speed, vmax = 420 * DPR * L.speed * AM.speed;
    for (const l of rain.letters) {
      const below = maskAt(l.x, l.y + size * .15) > 110;
      if (below) { // apoyada: sube un poco si quedó dentro del cuerpo
        l.v = 0; l.rest++; if (maskAt(l.x, l.y - size * .35) > 110) l.y -= 60 * DPR * dt;
      } else { l.rest = 0; l.v = Math.min(vmax, l.v + g * dt); l.y += l.v * dt; }
      if (l.y > H + size) { l.y = -size - Math.random() * H * .3; l.x = Math.random() * W; l.v = 0; l.c = chars[(Math.random() * chars.length) | 0]; }
    }
  },
  draw2d(){
    const L = P.lluvia, size = L.size * DPR; if (!rain.letters.length) return;
    sctx.globalCompositeOperation = 'lighter'; sctx.font = `${size}px ${L.font === 'mono' ? 'ui-monospace,monospace' : L.font === 'sans' ? 'system-ui,sans-serif' : 'Georgia,serif'}`;
    sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
    sctx.fillStyle = hsl(L.hue + AM.hue, 90 * (1 - L.white), 60 + 35 * L.white, .9);
    for (const l of rain.letters) sctx.fillText(l.c, l.x, l.y);
    sctx.globalCompositeOperation = 'source-over';
  } });

/* ===================== Pintura — Body Paint (Memo Akten, 2009) ===================== */
const paint = { cv:null, ctx:null, last:new Map() };
const PART_SETS = { manos:[9, 10], 'manos y pies':[9, 10, 15, 16], todo:[0, 9, 10, 15, 16, 7, 8, 13, 14], cabeza:[0] };
registerModule('pintura', { needs:[], param:P.pintura, label:'Pintura', desc:'Manos y pies dejan pintura que se desvanece lentamente (Body Paint).',
  alloc(){ paint.cv = document.createElement('canvas'); paint.ctx = paint.cv.getContext('2d'); this.resize(); },
  resize(){ if (paint.cv) { paint.cv.width = scene.width; paint.cv.height = scene.height; } },
  free(){ paint.cv = null; paint.ctx = null; paint.last.clear(); },
  update(){
    const c = paint.ctx; if (!c) return; const Pn = P.pintura, k = S2;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-out'; c.fillStyle = `rgba(0,0,0,${clamp(Pn.fade * (1 + AM.level * P.audio.react.echo), 0, 1)})`; c.fillRect(0, 0, paint.cv.width, paint.cv.height);
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    const parts = PART_SETS[Pn.parts] || PART_SETS.manos, ms = P.track.minScore;
    for (const b of bodies.values()) for (const i of parts) {
      const kp = b.kp[i]; const key = b.id + ':' + i; if (!kp || kp.s < ms) { paint.last.delete(key); continue; }
      const prev = paint.last.get(key); paint.last.set(key, { x:kp.x, y:kp.y });
      if (!prev) continue;
      const sp = Math.hypot(kp.x - prev.x, kp.y - prev.y) / DPR, wdt = Pn.width * DPR * k * clamp(.4 + sp / 25, .4, 2.2) * AM.size;
      const hue = (Pn.useBodyHue ? b.hue : Pn.hue) + AM.hue;
      c.strokeStyle = hsl(hue, 90, 55 + 20 * Pn.glow, .75); c.lineWidth = wdt; c.beginPath(); c.moveTo(prev.x * k, prev.y * k); c.lineTo(kp.x * k, kp.y * k); c.stroke();
    }
    for (const key of [...paint.last.keys()]) if (!bodies.has(key.split(':').slice(0, 2).join(':'))) paint.last.delete(key);
  },
  draw2d(){ if (!paint.cv) return; sctx.save(); sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalCompositeOperation = 'lighter'; sctx.drawImage(paint.cv, 0, 0); sctx.restore(); sctx.globalCompositeOperation = 'source-over'; } });

/* ===================== Grilla — Pixel (Adrien M & Claire B) / Rozin ===================== */
const grid = { cells:null, cols:0, rows:0 };
registerModule('grilla', { needs:['maskcpu'], param:P.grilla, label:'Grilla de píxeles', desc:'La silueta encendida en una trama de celdas con inercia; se apaga despacio al pasar.',
  free(){ grid.cells = null; },
  update(){
    const G = P.grilla, cell = Math.max(6, G.cell * DPR), cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
    if (!grid.cells || grid.cols !== cols || grid.rows !== rows) { grid.cells = new Float32Array(cols * rows); grid.cols = cols; grid.rows = rows; grid.hue = new Float32Array(cols * rows); }
    const c = grid.cells, inertia = G.inertia;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x, m = maskFresh ? maskAt((x + .5) * cell, (y + .5) * cell) / 255 : 0;
      c[i] = m > c[i] ? m : c[i] * inertia;
    }
  },
  draw2d(){
    if (!grid.cells) return; const G = P.grilla, cell = Math.max(6, G.cell * DPR), sz = cell * (1 - G.gap), off = (cell - sz) / 2;
    sctx.globalCompositeOperation = 'lighter';
    let hue = G.hue + AM.hue; if (G.useBodyHue) { const b = bodies.values().next().value; if (b) hue = b.hue + AM.hue; }
    const col = hsl(hue, 90 * (1 - G.white), 55 + 40 * G.white, 1);
    sctx.fillStyle = col;
    for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) {
      const v = grid.cells[y * grid.cols + x]; if (v < .03) continue;
      sctx.globalAlpha = Math.min(1, v) * (.7 + .3 * AM.glow);
      const s = sz * (G.square ? 1 : (.5 + .5 * v));
      if (G.square) sctx.fillRect(x * cell + off, y * cell + off, s, s);
      else { sctx.beginPath(); sctx.arc(x * cell + cell / 2, y * cell + cell / 2, s / 2, 0, 6.2832); sctx.fill(); }
    }
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over';
  } });

/* ===================== Cortinas — Apparition (Obermaier & Ars Electronica Futurelab, 2004) ===================== */
registerModule('cortinas', { needs:[], param:P.cortinas, label:'Cortinas de líneas', desc:'Líneas verticales que el cuerpo curva y aparta a su paso (Apparition).',
  draw2d(){
    const C = P.cortinas, sp = Math.max(6, C.spacing * DPR), seg = clamp(Math.round(C.segments), 4, 48), rad = C.radius * Math.min(W, H), ms = P.track.minScore;
    const pts = []; for (const b of bodies.values()) for (const i of [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) { const k = b.kp[i]; if (k && k.s > ms) pts.push(k); }
    sctx.globalCompositeOperation = 'lighter'; sctx.lineWidth = C.width * DPR * AM.size; sctx.lineCap = 'round';
    sctx.strokeStyle = hsl(C.hue + AM.hue, 90 * (1 - C.white), 55 + 35 * C.white, .35 + .6 * C.glow * AM.glow);
    sctx.beginPath();
    for (let x = sp / 2; x < W; x += sp) {
      for (let s = 0; s <= seg; s++) {
        const y = s / seg * H; let dx = 0, dy = 0;
        for (const k of pts) { const ddx = x - k.x, ddy = y - k.y, d = Math.hypot(ddx, ddy); if (d < rad && d > 1) { const f = Math.pow(1 - d / rad, 2) * C.force * rad * .5 * AM.scatter; dx += ddx / d * f; dy += ddy / d * f * .25; } }
        const nx = x + dx + Noise(x * .003, y * .003 + nowT * .2 * AM.speed) * 3 * DPR, ny = y + dy;
        if (s === 0) sctx.moveTo(nx, ny); else sctx.lineTo(nx, ny);
      }
    }
    sctx.stroke(); sctx.globalCompositeOperation = 'source-over';
  } });

/* ===================== Aves / cenizas — The Treachery of Sanctuary (Chris Milk, 2012) ===================== */
const ash = { parts:[] };
registerModule('aves', { needs:['maskcpu'], param:P.aves, label:'Cenizas que vuelan', desc:'Partículas que se desprenden del borde del cuerpo y suben como una bandada (Treachery of Sanctuary).',
  free(){ ash.parts.length = 0; },
  update(dt){
    const A = P.aves, max = Math.round(2500 * A.rate * (W / (1920 * DPR)));
    if (maskFresh) sampleEdges();
    const spawn = Math.round(A.rate * 18 * (1 + AM.level * 2) * (contourLike.length ? 1 : 0));
    for (let i = 0; i < spawn && ash.parts.length < max; i++) { const e = contourLike[(Math.random() * contourLike.length) | 0]; if (!e) break;
      ash.parts.push({ x:e.x, y:e.y, vx:(Math.random() - .5) * 20 * DPR, vy:-(10 + Math.random() * 40) * DPR, life:1, size:(.6 + Math.random()) * A.size * DPR, ph:Math.random() * 6.28 }); }
    const lift = 90 * DPR * A.lift * AM.speed, decay = .35 / Math.max(.2, A.life);
    for (let i = ash.parts.length - 1; i >= 0; i--) { const p = ash.parts[i]; p.ph += dt * 6;
      p.vy -= lift * dt; p.vx += Math.sin(p.ph + p.y * .01) * 30 * DPR * dt + Noise(p.x * .002, nowT) * 40 * DPR * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= decay * dt;
      if (p.life <= 0 || p.y < -20) { ash.parts[i] = ash.parts[ash.parts.length - 1]; ash.parts.pop(); } }
  },
  draw2d(){
    const A = P.aves; if (!ash.parts.length) return; sctx.globalCompositeOperation = 'lighter';
    sctx.fillStyle = hsl(A.hue + AM.hue, 90 * (1 - A.white), 60 + 30 * A.white, 1);
    for (const p of ash.parts) { sctx.globalAlpha = p.life * .9; const w = p.size * (1 + Math.abs(Math.sin(p.ph)) * 1.5); sctx.fillRect(p.x - w / 2, p.y - p.size / 2, w, p.size * .7); }
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over';
  } });
const contourLike = [];
function sampleEdges(){   // bordes de la máscara (muestra barata, sin marching squares completo)
  contourLike.length = 0; const gw = MASK_W, gh = MASK_H, sx = W / gw, sy = H / gh;
  const at = (x, y) => readBuf[((gh - 1 - y) * gw + x) * 4];
  for (let y = 1; y < gh - 1; y += 2) for (let x = 1; x < gw - 1; x += 2) { const v = at(x, y); if (v < 120) continue;
    if (at(x, y - 1) < 120 || at(x - 1, y) < 120 || at(x + 1, y) < 120) contourLike.push({ x:(x + .5) * sx, y:(y + .5) * sy }); }
}

/* ===================== Esqueleto, enlaces, cuadrícula de ajuste (siempre disponibles) ===================== */
function drawSkeletons(list){
  sctx.globalCompositeOperation = 'lighter'; sctx.lineCap = 'round'; sctx.lineJoin = 'round';
  for (const b of list) {
    if (P.track.showSkeleton) { sctx.lineWidth = P.track.boneWidth * DPR * AM.size; sctx.strokeStyle = hsl(b.hue + AM.hue, 95, 66, .55 + .4 * P.track.glow * AM.glow); sctx.beginPath();
      for (const [a, c] of SKEL) { const ka = b.kp[a], kc = b.kp[c]; if (ka && kc && ka.s > P.track.minScore && kc.s > P.track.minScore) { sctx.moveTo(ka.x, ka.y); sctx.lineTo(kc.x, kc.y); } } sctx.stroke(); }
    if (P.track.showJoints) { sctx.fillStyle = hsl((b.hue + 30) % 360, 100, 78, .9);
      for (const k of b.kp) if (k && k.s > P.track.minScore) { sctx.beginPath(); sctx.arc(k.x, k.y, P.track.jointSize * DPR * .5, 0, 6.283); sctx.fill(); } }
    if (P.track.showId) { const c = centerOfMass(b); if (c) { sctx.globalCompositeOperation = 'source-over'; sctx.fillStyle = hsl(b.hue, 90, 80, .85);
      sctx.font = `${13 * DPR}px ui-monospace,monospace`; sctx.fillText('#' + b.id, c.x + 10 * DPR, c.y); sctx.globalCompositeOperation = 'lighter'; } }
  }
  sctx.globalCompositeOperation = 'source-over';
}
function drawLinks(list){
  const range = P.link.range * Math.min(W, H), CONTACT = [9, 10, 15, 16, 0];
  sctx.globalCompositeOperation = 'lighter'; sctx.lineCap = 'round';
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const Aa = list[i], Bb = list[j];
    for (const ai of CONTACT) { const ka = Aa.kp[ai]; if (!ka || ka.s < P.track.minScore) continue;
      for (const bi of CONTACT) { const kb = Bb.kp[bi]; if (!kb || kb.s < P.track.minScore) continue;
        const d = Math.hypot(ka.x - kb.x, ka.y - kb.y); if (d > range) continue; const it = Math.pow(1 - d / range, 1.6) * P.link.energy;
        const gr = sctx.createLinearGradient(ka.x, ka.y, kb.x, kb.y); gr.addColorStop(0, hsl(Aa.hue, 100, 70, it)); gr.addColorStop(1, hsl(Bb.hue, 100, 70, it));
        sctx.strokeStyle = gr; sctx.lineWidth = P.link.width * DPR * (.4 + it); sctx.beginPath(); sctx.moveTo(ka.x, ka.y);
        for (let s = 1; s < 6; s++) { const f = s / 6, nx = Noise(f * 3 + nowT * 1.7 + i, j) * 26 * DPR * it, ny = Noise(f * 3 - nowT * 1.7 + j, i) * 26 * DPR * it; sctx.lineTo(ka.x + (kb.x - ka.x) * f + nx, ka.y + (kb.y - ka.y) * f + ny); }
        sctx.lineTo(kb.x, kb.y); sctx.stroke(); } } }
  sctx.globalCompositeOperation = 'source-over';
}
function drawGrid(){
  sctx.save(); sctx.strokeStyle = 'rgba(120,255,200,.5)'; sctx.lineWidth = DPR; const step = Math.min(W, H) / 12; sctx.beginPath();
  for (let x = 0; x <= W; x += step) { sctx.moveTo(x, 0); sctx.lineTo(x, H); } for (let y = 0; y <= H; y += step) { sctx.moveTo(0, y); sctx.lineTo(W, y); } sctx.stroke();
  sctx.strokeStyle = 'rgba(255,255,255,.9)'; sctx.lineWidth = 3 * DPR; sctx.strokeRect(1.5 * DPR, 1.5 * DPR, W - 3 * DPR, H - 3 * DPR);
  sctx.beginPath(); sctx.moveTo(0, 0); sctx.lineTo(W, H); sctx.moveTo(W, 0); sctx.lineTo(0, H); sctx.stroke();
  // proyectores: una franja numerada por cada uno, para alinear y ver solapes
  const n = Math.max(1, Math.round(P.map.slices)); if (n > 1) { const sw = W / n; sctx.font = `${Math.round(Math.min(H * .3, sw * .3))}px ui-monospace,monospace`; sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) { sctx.strokeStyle = 'rgba(255,180,80,.9)'; sctx.lineWidth = 2 * DPR; sctx.strokeRect(i * sw + DPR, DPR, sw - 2 * DPR, H - 2 * DPR); sctx.fillStyle = 'rgba(255,255,255,.75)'; sctx.fillText(String(i + 1), i * sw + sw / 2, H / 2);
      sctx.beginPath(); sctx.arc(i * sw + sw / 2, H / 2, Math.min(sw, H) * .4, 0, 6.2832); sctx.stroke(); } }
  // zonas de cámara
  for (const src of sources) if (src.cell) { const c = src.cell; sctx.strokeStyle = 'rgba(105,240,176,.9)'; sctx.setLineDash([8 * DPR, 6 * DPR]); sctx.lineWidth = 2 * DPR; sctx.strokeRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4); sctx.setLineDash([]);
    sctx.fillStyle = 'rgba(105,240,176,.9)'; sctx.font = `${14 * DPR}px ui-monospace,monospace`; sctx.textAlign = 'left'; sctx.textBaseline = 'top'; sctx.fillText(src.label, c.x + 10 * DPR, c.y + 10 * DPR); }
  sctx.restore();
}
