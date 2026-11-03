"use strict";
/* =====================================================================
   MIRADOR — calibración de cámara por tramos
   La superficie proyectada dobla por las paredes (izquierda, fondo,
   derecha…). En la imagen de la cámara se marcan dos líneas, arriba y
   abajo, con un vértice en cada esquina de pared. Cada tramo (entre dos
   vértices consecutivos) es un cuadrilátero de la cámara que se mapea,
   por homografía, a su porción del panorama (según cuántos proyectores
   cubre). Los cuerpos detectados pasan por ese mapa; la silueta por
   esqueleto lo hereda sola.
   Se guarda por zona en la sesión: src.cal = { enabled, top:[{x,y}…],
   bottom:[{x,y}…], shares:[…] } con x,y en fracción de la imagen de cámara.
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

function defaultCal(n = 3){
  const top = [], bottom = [];
  for (let i = 0; i <= n; i++) { const x = .08 + .84 * i / n; top.push({ x, y:.12 }); bottom.push({ x, y:.75 }); }
  return { enabled:false, top, bottom, shares:new Array(n).fill(1) };
}
/* precalcula homografías por tramo (cámara en píxeles → unidad) */
function calPrepare(src){
  const cal = src.cal; if (!cal || !cal.enabled || !cal.top || cal.top.length < 2) { src._calH = null; return; }
  const vw = src.video.videoWidth || 1280, vh = src.video.videoHeight || 720, n = cal.top.length - 1;
  const tot = cal.shares.slice(0, n).reduce((a, b) => a + Math.max(0, b), 0) || 1; let u0 = 0; const Hs = [];
  for (let i = 0; i < n; i++) { const sh = Math.max(0, cal.shares[i] ?? 1) / tot;
    const quad = [cal.top[i], cal.top[i + 1], cal.bottom[i + 1], cal.bottom[i]].map(p => ({ x:p.x * vw, y:p.y * vh }));
    const H = computeHomography(quad, UNIT); Hs.push({ H, u0, u1:u0 + sh }); u0 += sh; }
  src._calH = Hs;
}
/* mapea un punto de la cámara (px) a la salida (px) por el tramo que lo contiene (o el más cercano) */
function calMap(src, x, y){
  const Hs = src._calH, c = src.cell; let best = null, bd = Infinity;
  for (const t of Hs) { if (!t.H) continue; const p = applyH(t.H, x, y);
    const d = Math.max(0, -p.x, p.x - 1) + Math.max(0, -p.y, p.y - 1) * .5;   // distancia fuera del cuadrilátero
    if (d < bd) { bd = d; best = { t, p }; } if (d === 0) break; }
  if (!best) return { x:c.x, y:c.y };
  const { t, p } = best; const u = t.u0 + clamp(p.x, -.25, 1.25) * (t.u1 - t.u0);
  return { x:c.x + u * c.w, y:c.y + p.y * c.h };
}

/* ---------- vista de calibración (superpuesta a toda la ventana) ---------- */
const Calib = {
  on:false, zone:0, cv:null, ctx:null, drag:null, hover:null,
  init(){ this.cv = $('calib'); this.ctx = this.cv.getContext('2d');
    this.cv.addEventListener('pointerdown', e => this.down(e)); this.cv.addEventListener('pointermove', e => this.move(e)); this.cv.addEventListener('pointerup', () => { if (this.drag) Sessions.touch(); this.drag = null; });
    addEventListener('resize', () => this.fit()); },
  src(){ return sources[this.zone] || sources[0] || null; },
  toggle(v){ this.on = v === undefined ? !this.on : !!v; this.cv.hidden = !this.on; if (this.on) { const s = this.src(); if (s && !s.cal) s.cal = defaultCal(3); this.fit(); } if (typeof UI !== 'undefined') UI.refresh('camaras'); },
  fit(){ if (!this.on) return; this.cv.width = innerWidth * Math.min(devicePixelRatio || 1, 2); this.cv.height = innerHeight * Math.min(devicePixelRatio || 1, 2); },
  /* rectángulo donde se dibuja la cámara dentro del overlay (contain, con margen) */
  frame(){ const s = this.src(); const vw = s?.video.videoWidth || 1280, vh = s?.video.videoHeight || 720; const W_ = this.cv.width, H_ = this.cv.height, m = 40 * (W_ / innerWidth);
    const sc = Math.min((W_ - 2 * m) / vw, (H_ - 2 * m) / vh); const w = vw * sc, h = vh * sc; return { x:(W_ - w) / 2, y:(H_ - h) / 2, w, h, mir:s ? zoneMirror(s) : false }; },
  toScreen(p){ const f = this.frame(); return { x:f.x + (f.mir ? 1 - p.x : p.x) * f.w, y:f.y + p.y * f.h }; },
  fromScreen(x, y){ const f = this.frame(); let px = (x - f.x) / f.w; if (f.mir) px = 1 - px; return { x:clamp(px, -.2, 1.2), y:clamp((y - f.y) / f.h, -.2, 1.2) }; },
  pos(e){ const r = this.cv.getBoundingClientRect(); return { x:(e.clientX - r.left) / r.width * this.cv.width, y:(e.clientY - r.top) / r.height * this.cv.height }; },
  pick(m){ const s = this.src(); if (!s?.cal) return null; let best = null, bd = 22 * (this.cv.width / innerWidth);
    for (const line of ['top', 'bottom']) s.cal[line].forEach((p, i) => { const q = this.toScreen(p); const d = Math.hypot(q.x - m.x, q.y - m.y); if (d < bd) { bd = d; best = { line, i }; } });
    return best; },
  down(e){ if (!this.on) return; const m = this.pos(e); this.drag = this.pick(m); if (this.drag) this.cv.setPointerCapture(e.pointerId); },
  move(e){ if (!this.on) return; const m = this.pos(e); if (this.drag) { const s = this.src(); s.cal[this.drag.line][this.drag.i] = this.fromScreen(m.x, m.y); calPrepare(s); } else this.hover = this.pick(m); },
  setTramos(n){ const s = this.src(); if (!s) return; n = clamp(n | 0, 1, 12); const c = s.cal || defaultCal(n); const old = c.top.length - 1;
    const resample = (line) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n * old; const k = Math.min(old - 1, Math.floor(t)), f = t - k; const a = line[k], b = line[k + 1] || a; out.push({ x:a.x + (b.x - a.x) * f, y:a.y + (b.y - a.y) * f }); } return out; };
    c.top = resample(c.top); c.bottom = resample(c.bottom); const sh = c.shares.slice(0, n); while (sh.length < n) sh.push(1); c.shares = sh; s.cal = c; calPrepare(s); Sessions.touch(); },
  reset(){ const s = this.src(); if (!s) return; const n = s.cal ? s.cal.top.length - 1 : 3; const en = s.cal?.enabled; s.cal = defaultCal(n); s.cal.enabled = !!en; calPrepare(s); Sessions.touch(); },
  draw(){
    if (!this.on) return; const s = this.src(), c = this.ctx, W_ = this.cv.width, H_ = this.cv.height, k = W_ / innerWidth;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, W_, H_);
    const f = this.frame();
    if (s && s.video.readyState >= 2) { c.save(); if (f.mir) { c.translate(2 * f.x + f.w, 0); c.scale(-1, 1); } c.drawImage(s.video, f.x, f.y, f.w, f.h); c.restore(); }
    else { c.fillStyle = '#1a1e26'; c.fillRect(f.x, f.y, f.w, f.h); c.fillStyle = '#8a8e99'; c.font = `${16 * k}px ui-monospace,monospace`; c.textAlign = 'center'; c.fillText(simMode ? 'simulación: sin imagen de cámara' : 'esperando cámara…', f.x + f.w / 2, f.y + f.h / 2); }
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1 * k; c.strokeRect(f.x, f.y, f.w, f.h);
    if (!s?.cal) return;
    const cal = s.cal, n = cal.top.length - 1, T = cal.top.map(p => this.toScreen(p)), B = cal.bottom.map(p => this.toScreen(p));
    // tramos
    const tot = cal.shares.slice(0, n).reduce((a, b) => a + Math.max(0, b), 0) || 1; let u0 = 0;
    for (let i = 0; i < n; i++) { const sh = Math.max(0, cal.shares[i] ?? 1);
      c.fillStyle = `hsla(${(i * 67) % 360},80%,60%,.13)`; c.beginPath(); c.moveTo(T[i].x, T[i].y); c.lineTo(T[i + 1].x, T[i + 1].y); c.lineTo(B[i + 1].x, B[i + 1].y); c.lineTo(B[i].x, B[i].y); c.closePath(); c.fill();
      c.strokeStyle = `hsla(${(i * 67) % 360},90%,65%,.9)`; c.lineWidth = 2 * k; c.stroke();
      const cx = (T[i].x + T[i + 1].x + B[i].x + B[i + 1].x) / 4, cy = (T[i].y + T[i + 1].y + B[i].y + B[i + 1].y) / 4;
      const p0 = Math.round(u0 / tot * P.map.slices * 10) / 10, p1 = Math.round((u0 + sh) / tot * P.map.slices * 10) / 10; u0 += sh;
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(cx - 70 * k, cy - 16 * k, 140 * k, 32 * k); c.fillStyle = '#fff'; c.font = `${13 * k}px ui-monospace,monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(`tramo ${i + 1} · proy. ${p0}–${p1}`, cx, cy); }
    // líneas y vértices
    for (const [pts, col] of [[T, '#3b9cff'], [B, '#3b9cff']]) { c.strokeStyle = col; c.lineWidth = 3 * k; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke(); }
    [['top', T], ['bottom', B]].forEach(([line, pts]) => pts.forEach((p, i) => { const hot = (this.drag && this.drag.line === line && this.drag.i === i) || (this.hover && this.hover.line === line && this.hover.i === i);
      c.fillStyle = hot ? '#69f0b0' : 'rgba(0,0,0,.6)'; c.strokeStyle = '#69f0b0'; c.lineWidth = 2 * k; c.beginPath(); c.arc(p.x, p.y, 9 * k, 0, 6.2832); c.fill(); c.stroke(); }));
    // cuerpos detectados, en coordenadas de cámara, para ver si caen dentro
    const vw = s.video.videoWidth || 1280, vh = s.video.videoHeight || 720;
    for (const pose of (s.poses || [])) { c.strokeStyle = 'rgba(255,220,80,.9)'; c.lineWidth = 2 * k; c.beginPath();
      for (const [a, b] of SKEL) { const ka = pose.keypoints[a], kb = pose.keypoints[b]; if (!ka || !kb || (ka.score ?? 0) < P.track.minScore || (kb.score ?? 0) < P.track.minScore) continue;
        const pa = this.toScreen({ x:ka.x / vw, y:ka.y / vh }), pb = this.toScreen({ x:kb.x / vw, y:kb.y / vh }); c.moveTo(pa.x, pa.y); c.lineTo(pb.x, pb.y); } c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, W_, 34 * k); c.fillStyle = '#e8e6df'; c.font = `${13 * k}px ui-monospace,monospace`; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(`Calibración de cámara · ${s.label} · arrastrá los puntos: línea de arriba = borde superior de la pared, línea de abajo = donde pisan los bailarines · un vértice por esquina de pared · K cierra`, 12 * k, 17 * k);
  },
};
