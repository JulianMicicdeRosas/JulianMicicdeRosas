"use strict";
/* =====================================================================
   MIRADOR — calibración de la cámara a las paredes de la sala
   La cámara es fija y ve la sala en perspectiva (foto de referencia:
   referencia/camara-sala.jpg). En su imagen se marcan dos líneas, como
   las celestes de la foto: ARRIBA el borde superior de las paredes y
   ABAJO la base de las paredes (donde la pared toca el piso), con un
   vértice en cada esquina. Cada tramo entre vértices es una pared, que
   ocupa su parte del lienzo (Oeste 3175 · Norte 1775 · Este 3450 px).

   Dos maneras de llevar un cuerpo a las paredes:
   · piso (predeterminado): los pies del bailarín están en el piso; se
     traza una recta desde el punto de la cámara en el piso, pasando por
     los pies, hasta la base de las paredes. Ahí se para la figura, de pie,
     sobre la pared que el bailarín tiene detrás (vista desde la cámara).
     La recta se calcula en la imagen: las proyecciones conservan rectas
     e intersecciones, así que no hace falta medir la sala.
   · vista: lo que la cámara ve encima de cada pared se reproyecta tal
     cual (como una sombra). Solo sirve para cuerpos pegados a la pared.

   Se guarda por zona en la sesión (src.cal), con x,y en fracción de la
   imagen de la cámara.
   ===================================================================== */
function solveLinear(A, b){   // Gauss con pivoteo parcial, n ≤ 8
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; if (Math.abs(d) < 1e-12) return null;
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  return M.map((r, i) => r[n] / r[i]);
}
/* homografía que lleva 4 puntos src a 4 puntos dst (mismo orden) */
function computeHomography(src, dst){
  const A = [], b = [];
  for (let i = 0; i < 4; i++) { const { x, y } = src[i], { x:u, y:v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  const h = solveLinear(A, b); if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
function applyH(H, x, y){ const w = H[6] * x + H[7] * y + H[8]; return { x:(H[0] * x + H[1] * y + H[2]) / w, y:(H[3] * x + H[4] * y + H[5]) / w }; }
const UNIT = [{ x:0, y:0 }, { x:1, y:0 }, { x:1, y:1 }, { x:0, y:1 }];

/* Valores medidos sobre la foto de la cámara de la sala (1920×1080, líneas celestes). */
const SALA_FOTO = {
  top:    [{ x:0, y:.104 }, { x:.305, y:.083 }, { x:.667, y:.076 }, { x:1, y:.086 }],
  bottom: [{ x:0, y:.903 }, { x:.306, y:.341 }, { x:.666, y:.326 }, { x:1, y:.764 }],
  center: { x:.47, y:1.4 },                          // punto de la cámara en el piso (fuera de cuadro, abajo)
  ignore: [{ x0:0, y0:.64, x1:.135, y1:1 }],         // operador sentado abajo a la izquierda
};
function defaultCal(n = 3){
  const top = [], bottom = [];
  for (let i = 0; i <= n; i++) { const x = .08 + .84 * i / n; top.push({ x, y:.12 }); bottom.push({ x, y:.75 }); }
  return { enabled:false, mode:'piso', top, bottom, shares:new Array(n).fill(1), useWalls:true, center:{ x:.5, y:1.4 }, ignore:[], figH:.82, base:.97, depth:0 };
}
function salaCal(){ const c = defaultCal(3); Object.assign(c, deepClone(SALA_FOTO)); c.enabled = true; return c; }
function normCal(c){ const d = defaultCal(Math.max(1, (c?.top?.length || 4) - 1)); return Object.assign(d, c || {}); }

/* precalcula homografías por tramo (cámara en píxeles → unidad) y la geometría del modo piso */
function calPrepare(src){
  if (src.cal) src.cal = normCal(src.cal);
  const cal = src.cal; if (!cal || !cal.enabled || !cal.top || cal.top.length < 2) { src._calH = null; return; }
  const vw = src.video.videoWidth || 1280, vh = src.video.videoHeight || 720, n = cal.top.length - 1;
  const walls = wallRanges(); let shares = cal.shares;
  if (cal.useWalls && walls.length === n) shares = walls.map(w => w.w);
  const tot = shares.slice(0, n).reduce((a, b) => a + Math.max(0, b), 0) || 1; let u0 = 0; const Hs = [];
  for (let i = 0; i < n; i++) { const sh = Math.max(0, shares[i] ?? 1) / tot;
    const quad = [cal.top[i], cal.top[i + 1], cal.bottom[i + 1], cal.bottom[i]].map(p => ({ x:p.x * vw, y:p.y * vh }));
    Hs.push({ H:computeHomography(quad, UNIT), u0, u1:u0 + sh, nombre:(cal.useWalls && walls[i]) ? walls[i].nombre : '' }); u0 += sh; }
  src._calH = Hs; src._calB = cal.bottom.map(p => ({ x:p.x * vw, y:p.y * vh })); src._calC = { x:cal.center.x * vw, y:cal.center.y * vh };
  if (!src._calS) src._calS = new Map(); if (!src._calDbg) src._calDbg = new Map();
}
/* modo vista: un punto de la cámara (px) a la salida (px), por el tramo que lo contiene (o el más cercano) */
function calMap(src, x, y){
  const Hs = src._calH, c = src.cell; let best = null, bd = Infinity;
  for (const t of Hs) { if (!t.H) continue; const p = applyH(t.H, x, y);
    const d = Math.max(0, -p.x, p.x - 1) + Math.max(0, -p.y, p.y - 1) * .5;
    if (d < bd) { bd = d; best = { t, p }; } if (d === 0) break; }
  if (!best) return { x:c.x, y:c.y };
  const { t, p } = best; const u = t.u0 + clamp(p.x, -.25, 1.25) * (t.u1 - t.u0);
  return { x:c.x + u * c.w, y:c.y + p.y * c.h };
}
/* intersección de la recta C + t·d (t>0) con la base de las paredes (los tramos de las puntas se prolongan) */
function calRayHit(src, F){
  const B = src._calB, C = src._calC, n = B.length - 1, dx = F.x - C.x, dy = F.y - C.y; let best = null;
  for (let i = 0; i < n; i++) { const a = B[i], b = B[i + 1], ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - C.x) * ey - (a.y - C.y) * ex) / den, s = ((a.x - C.x) * dy - (a.y - C.y) * dx) / den;
    const lo = i === 0 ? -3 : -1e-6, hi = i === n - 1 ? 4 : 1 + 1e-6;
    if (t > 1e-6 && s >= lo && s <= hi && (!best || t < best.t)) best = { t, i, x:C.x + dx * t, y:C.y + dy * t }; }
  if (best) return best;
  // sin intersección (la recta va hacia el lado abierto): punta más cercana de la base
  const lft = dx < 0; return { t:1, i:lft ? 0 : n - 1, x:lft ? B[0].x : B[n].x, y:lft ? B[0].y : B[n].y };
}
/* modo piso: devuelve los 17 puntos de la figura ya en la salida (px), o null si no se ven los pies ni la cadera */
function calMapPose(src, pose, id){
  const kp = pose.keypoints, ms = P.track.minScore * .6, ok = i => kp[i] && (kp[i].score ?? 0) > ms, mid = (a, b) => ({ x:(kp[a].x + kp[b].x) / 2, y:(kp[a].y + kp[b].y) / 2 });
  const sh = ok(5) && ok(6) ? mid(5, 6) : ok(5) ? kp[5] : ok(6) ? kp[6] : null, hp = ok(11) && ok(12) ? mid(11, 12) : ok(11) ? kp[11] : ok(12) ? kp[12] : null;
  if (!hp && !sh) return null;
  const torso = sh && hp ? Math.hypot(sh.x - hp.x, sh.y - hp.y) : 0;
  let F = null;
  if (ok(15) && ok(16)) F = { x:(kp[15].x + kp[16].x) / 2, y:Math.max(kp[15].y, kp[16].y) };
  else if (ok(15) || ok(16)) F = ok(15) ? { x:kp[15].x, y:kp[15].y } : { x:kp[16].x, y:kp[16].y };
  else if (ok(13) || ok(14)) { const k = ok(13) && ok(14) ? mid(13, 14) : ok(13) ? kp[13] : kp[14]; F = { x:k.x, y:k.y + (torso || 30) * .9 }; }
  else if (hp) F = { x:hp.x, y:hp.y + (torso || 40) * 1.7 };
  if (!F) return null;
  const cal = src.cal, c = src.cell, hit = calRayHit(src, F), t = src._calH[hit.i];
  if (!t || !t.H) return null;
  const pw = applyH(t.H, hit.x, hit.y), u = clamp(t.u0 + clamp(pw.x, -.5, 1.5) * (t.u1 - t.u0), 0, 1);
  const X0 = c.x + u * c.w, Yb = c.y + cal.base * c.h;
  // escala: altura de pie estimada en la imagen (torso × 3.4) → figH del alto de la pared
  const hImg = Math.max(24, torso ? torso * 3.4 : (F.y - Math.min(...kp.filter((k, i) => ok(i)).map(k => k.y))) * 1.05);
  const near = clamp(Math.hypot(F.x - src._calC.x, F.y - src._calC.y) / Math.max(1, Math.hypot(hit.x - src._calC.x, hit.y - src._calC.y)), 0, 1);
  let s = cal.figH * c.h / hImg * (1 - cal.depth * (1 - near) * .6);
  const prev = src._calS.get(id); if (prev) s = prev + (s - prev) * .12; src._calS.set(id, s);
  src._calDbg.set(id, { F, hit, t:performance.now() });
  return kp.map(k => ({ x:X0 + (k.x - F.x) * s, y:Yb + (k.y - F.y) * s }));
}
/* cuerpos dentro de una zona ignorada (en la imagen de la cámara) */
function calIgnored(src, pose){
  const ig = src.cal?.ignore; if (!ig || !ig.length) return false;
  const vw = src.video.videoWidth || 1280, vh = src.video.videoHeight || 720, ms = P.track.minScore * .6;
  let sx = 0, sy = 0, n = 0; for (const k of pose.keypoints) if ((k.score ?? 0) > ms) { sx += k.x; sy += k.y; n++; }
  if (!n) return true; const x = sx / n / vw, y = sy / n / vh;
  return ig.some(r => x >= Math.min(r.x0, r.x1) && x <= Math.max(r.x0, r.x1) && y >= Math.min(r.y0, r.y1) && y <= Math.max(r.y0, r.y1));
}

/* ---------- vista de calibración (superpuesta a toda la ventana) ---------- */
const Calib = {
  on:false, zone:0, cv:null, ctx:null, drag:null, hover:null, ref:null,
  init(){ this.cv = $('calib'); this.ctx = this.cv.getContext('2d');
    this.cv.addEventListener('pointerdown', e => this.down(e)); this.cv.addEventListener('pointermove', e => this.move(e)); this.cv.addEventListener('pointerup', () => { if (this.drag) Sessions.touch(); this.drag = null; });
    addEventListener('resize', () => this.fit());
    this.ref = new Image(); this.ref.src = 'referencia/camara-sala.jpg'; },
  src(){ return sources[this.zone] || sources[0] || null; },
  toggle(v){ this.on = v === undefined ? !this.on : !!v; this.cv.hidden = !this.on; if (this.on) { const s = this.src(); if (s && !s.cal) { s.cal = salaCal(); calPrepare(s); } this.fit(); } if (typeof UI !== 'undefined') UI.refresh('camaras'); },
  fit(){ if (!this.on) return; this.cv.width = innerWidth * Math.min(devicePixelRatio || 1, 2); this.cv.height = innerHeight * Math.min(devicePixelRatio || 1, 2); },
  /* rectángulo donde se dibuja la cámara, dejando lugar abajo para el punto de la cámara en el piso */
  frame(){ const s = this.src(); const vw = s?.video.videoWidth || 1280, vh = s?.video.videoHeight || 720; const W_ = this.cv.width, H_ = this.cv.height, k = W_ / innerWidth, m = 30 * k, top = 40 * k;
    const extra = Math.max(.06, (s?.cal?.center?.y || 1) - 1 + .08);
    const sc = Math.min((W_ - 2 * m) / vw, (H_ - top - m) / (vh * (1 + extra))); const w = vw * sc, h = vh * sc; return { x:(W_ - w) / 2, y:top, w, h }; },
  toScreen(p){ const f = this.frame(); return { x:f.x + p.x * f.w, y:f.y + p.y * f.h }; },
  fromScreen(x, y){ const f = this.frame(); return { x:clamp((x - f.x) / f.w, -.3, 1.3), y:clamp((y - f.y) / f.h, -.3, 2) }; },
  pos(e){ const r = this.cv.getBoundingClientRect(); return { x:(e.clientX - r.left) / r.width * this.cv.width, y:(e.clientY - r.top) / r.height * this.cv.height }; },
  handles(){ const s = this.src(), c = s?.cal; if (!c) return []; const out = [];
    for (const line of ['top', 'bottom']) c[line].forEach((p, i) => out.push({ kind:line, i, p }));
    if (c.mode !== 'vista') out.push({ kind:'center', p:c.center });
    (c.ignore || []).forEach((r, i) => { out.push({ kind:'ign0', i, p:{ x:r.x0, y:r.y0 } }); out.push({ kind:'ign1', i, p:{ x:r.x1, y:r.y1 } }); });
    return out; },
  pick(m){ let best = null, bd = 22 * (this.cv.width / innerWidth); for (const h of this.handles()) { const q = this.toScreen(h.p); const d = Math.hypot(q.x - m.x, q.y - m.y); if (d < bd) { bd = d; best = h; } } return best; },
  down(e){ if (!this.on) return; const m = this.pos(e); this.drag = this.pick(m); if (this.drag) this.cv.setPointerCapture(e.pointerId); },
  move(e){ if (!this.on) return; const m = this.pos(e); if (!this.drag) { this.hover = this.pick(m); return; }
    const s = this.src(), c = s.cal, p = this.fromScreen(m.x, m.y), d = this.drag;
    if (d.kind === 'top' || d.kind === 'bottom') c[d.kind][d.i] = p; else if (d.kind === 'center') c.center = p;
    else if (d.kind === 'ign0') { c.ignore[d.i].x0 = p.x; c.ignore[d.i].y0 = p.y; } else if (d.kind === 'ign1') { c.ignore[d.i].x1 = p.x; c.ignore[d.i].y1 = p.y; }
    calPrepare(s); },
  setTramos(n){ const s = this.src(); if (!s) return; n = clamp(n | 0, 1, 12); const c = normCal(s.cal || defaultCal(n)); const old = c.top.length - 1;
    const resample = (line) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n * old; const k = Math.min(old - 1, Math.floor(t)), f = t - k; const a = line[k], b = line[k + 1] || a; out.push({ x:a.x + (b.x - a.x) * f, y:a.y + (b.y - a.y) * f }); } return out; };
    c.top = resample(c.top); c.bottom = resample(c.bottom); const sh = c.shares.slice(0, n); while (sh.length < n) sh.push(1); c.shares = sh; s.cal = c; calPrepare(s); Sessions.touch(); },
  reset(){ const s = this.src(); if (!s) return; s.cal = salaCal(); calPrepare(s); Sessions.touch(); },
  addIgnore(){ const s = this.src(); if (!s?.cal) return; s.cal.ignore.push({ x0:.4, y0:.6, x1:.6, y1:.9 }); calPrepare(s); Sessions.touch(); },
  clearIgnore(){ const s = this.src(); if (!s?.cal) return; s.cal.ignore = []; calPrepare(s); Sessions.touch(); },
  draw(){
    if (!this.on) return; const s = this.src(), c = this.ctx, W_ = this.cv.width, H_ = this.cv.height, k = W_ / innerWidth;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, W_, H_);
    const f = this.frame();
    if (s && s.video.readyState >= 2) c.drawImage(s.video, f.x, f.y, f.w, f.h);
    else if (this.ref && this.ref.complete && this.ref.naturalWidth) { c.globalAlpha = .75; c.drawImage(this.ref, f.x, f.y, f.w, f.h); c.globalAlpha = 1; c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(f.x, f.y + f.h - 26 * k, f.w, 26 * k); c.fillStyle = '#ffb347'; c.font = `${12 * k}px ui-monospace,monospace`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('foto de referencia de la sala (sin cámara en vivo)', f.x + 10 * k, f.y + f.h - 13 * k); }
    else { c.fillStyle = '#1a1e26'; c.fillRect(f.x, f.y, f.w, f.h); }
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1 * k; c.strokeRect(f.x, f.y, f.w, f.h);
    if (!s?.cal) return;
    const cal = s.cal, n = cal.top.length - 1, T = cal.top.map(p => this.toScreen(p)), B = cal.bottom.map(p => this.toScreen(p)), Hs = s._calH || [];
    for (let i = 0; i < n; i++) {
      c.fillStyle = `hsla(${(i * 67) % 360},80%,60%,.14)`; c.beginPath(); c.moveTo(T[i].x, T[i].y); c.lineTo(T[i + 1].x, T[i + 1].y); c.lineTo(B[i + 1].x, B[i + 1].y); c.lineTo(B[i].x, B[i].y); c.closePath(); c.fill();
      c.strokeStyle = `hsla(${(i * 67) % 360},90%,65%,.9)`; c.lineWidth = 2 * k; c.stroke();
      const cx = (T[i].x + T[i + 1].x + B[i].x + B[i + 1].x) / 4, cy = (T[i].y + T[i + 1].y) / 2 * .4 + (B[i].y + B[i + 1].y) / 2 * .6;
      const t = Hs[i], lab = t ? `${t.nombre || 'tramo ' + (i + 1)} · ${Math.round(t.u0 * outputSize().w)}–${Math.round(t.u1 * outputSize().w)} px` : `tramo ${i + 1}`;
      c.font = `${13 * k}px ui-monospace,monospace`; const tw = c.measureText(lab).width + 16 * k; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(cx - tw / 2, cy - 14 * k, tw, 28 * k);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lab, cx, cy); }
    for (const pts of [T, B]) { c.strokeStyle = '#3b9cff'; c.lineWidth = 3 * k; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke(); }
    // zonas ignoradas
    (cal.ignore || []).forEach(r => { const a = this.toScreen({ x:Math.min(r.x0, r.x1), y:Math.min(r.y0, r.y1) }), b = this.toScreen({ x:Math.max(r.x0, r.x1), y:Math.max(r.y0, r.y1) });
      c.fillStyle = 'rgba(255,80,80,.18)'; c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); c.strokeStyle = 'rgba(255,107,107,.95)'; c.setLineDash([6 * k, 5 * k]); c.lineWidth = 2 * k; c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); c.setLineDash([]);
      c.fillStyle = '#ff6b6b'; c.font = `${11 * k}px ui-monospace,monospace`; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('ignorar', a.x + 5 * k, a.y + 4 * k); });
    // modo piso: punto de la cámara en el piso y rectas a cada bailarín
    const vw = s.video.videoWidth || 1280, vh = s.video.videoHeight || 720, now = performance.now();
    if (cal.mode !== 'vista') { const C = this.toScreen(cal.center);
      for (const [, d] of s._calDbg || []) { if (now - d.t > 500) continue; const F = this.toScreen({ x:d.F.x / vw, y:d.F.y / vh }), Hh = this.toScreen({ x:d.hit.x / vw, y:d.hit.y / vh });
        c.strokeStyle = 'rgba(105,240,176,.7)'; c.lineWidth = 1.5 * k; c.setLineDash([4 * k, 4 * k]); c.beginPath(); c.moveTo(C.x, C.y); c.lineTo(Hh.x, Hh.y); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#69f0b0'; c.beginPath(); c.arc(F.x, F.y, 5 * k, 0, 6.2832); c.fill(); c.strokeStyle = '#fff'; c.beginPath(); c.arc(Hh.x, Hh.y, 7 * k, 0, 6.2832); c.stroke(); }
      c.fillStyle = '#ffd166'; c.beginPath(); c.arc(C.x, C.y, 9 * k, 0, 6.2832); c.fill(); c.fillStyle = '#ffd166'; c.font = `${12 * k}px ui-monospace,monospace`; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText('cámara en el piso', C.x, C.y + 12 * k); }
    // esqueletos detectados (amarillo; los ignorados en rojo)
    for (const pose of (s.poses || [])) { const ign = calIgnored(s, pose); c.strokeStyle = ign ? 'rgba(255,107,107,.8)' : 'rgba(255,220,80,.95)'; c.lineWidth = 2 * k; c.beginPath();
      for (const [a, b] of SKEL) { const ka = pose.keypoints[a], kb = pose.keypoints[b]; if (!ka || !kb || (ka.score ?? 0) < P.track.minScore || (kb.score ?? 0) < P.track.minScore) continue;
        const pa = this.toScreen({ x:ka.x / vw, y:ka.y / vh }), pb = this.toScreen({ x:kb.x / vw, y:kb.y / vh }); c.moveTo(pa.x, pa.y); c.lineTo(pb.x, pb.y); } c.stroke(); }
    for (const h of this.handles()) { const q = this.toScreen(h.p), hot = (this.drag && this.drag.kind === h.kind && this.drag.i === h.i) || (this.hover && this.hover.kind === h.kind && this.hover.i === h.i);
      const col = h.kind === 'center' ? '#ffd166' : h.kind.startsWith('ign') ? '#ff6b6b' : '#69f0b0';
      c.fillStyle = hot ? col : 'rgba(0,0,0,.6)'; c.strokeStyle = col; c.lineWidth = 2 * k; c.beginPath(); c.arc(q.x, q.y, 9 * k, 0, 6.2832); c.fill(); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(0, 0, W_, 34 * k); c.fillStyle = '#e8e6df'; c.font = `${13 * k}px ui-monospace,monospace`; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(`Calibración · ${s.label} · modo ${cal.mode === 'vista' ? 'vista' : 'piso'} · celeste arriba = borde superior de las paredes · celeste abajo = base de las paredes · amarillo = cámara en el piso · rojo = ignorar · K cierra`, 12 * k, 17 * k);
  },
};
