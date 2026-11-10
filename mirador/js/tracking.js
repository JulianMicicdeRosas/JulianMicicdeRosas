"use strict";
/* =====================================================================
   MIRADOR — tracking
   Zonas (cámaras) repartidas en la salida, un detector MoveNet
   compartido (la imagen se corta en partes para ver cuerpos chicos), cuerpos
   suavizados en coordenadas de salida, y un simulador sin cámara.
   ===================================================================== */
const SKEL = [[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16],[0,5],[0,6]];
const MAX_CAMS = 4;
/* Disposición de zonas: 'columnas' | 'filas' | 'libre' (cada zona con su rectángulo en fracciones) */
const LAYOUT = { orient:'columnas' };
const sources = [];              // {id, deviceId, label, video, stream, detector, poses, videoTex, bgTex, cell, fit, rect, mirror}
let running = false, simMode = false, inferBudgetMs = 33;
const bodies = new Map(); const colorSlot = new Map(); let nextSlot = 0;
let availableCameras = [], srcCounter = 0;
const camLabel = (c, i) => c.label || `Cámara ${i + 1}`;
let modelBase = null;
let verEsqueletos = false;   // E: esqueletos encima de todo, aunque la plantilla los oculte (para revisar la detección)   // URL local del modelo si está en vendor/movenet

async function refreshCameraList(){
  try { availableCameras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); }
  catch (e) { console.error('Error al listar cámaras:', e); }
}
async function openStream(deviceId){
  const base = deviceId ? { deviceId:{ exact:deviceId } } : { facingMode:'user' };
  try { return await navigator.mediaDevices.getUserMedia({ video:{ ...base, width:{ ideal:1280 }, height:{ ideal:720 }, frameRate:{ ideal:30 } }, audio:false }); }
  catch (e) { return await navigator.mediaDevices.getUserMedia({ video:base, audio:false }); }   // varias USB en el mismo hub: baja a lo que ofrezca
}
async function probeLocalModel(){
  if (modelBase !== null) return modelBase;
  try { const r = await fetch('vendor/movenet/multipose-lightning/model.json', { method:'HEAD' }); modelBase = r.ok ? 'vendor/movenet' : ''; }
  catch (e) { modelBase = ''; }
  return modelBase;
}
/* ---------- detector ----------
   Un solo MoveNet MultiPose para todas las cámaras (sin tracker interno: no guarda estado, se puede
   compartir). La resolución de entrada (multiPoseMaxDimension) se fija al crearlo; si cambia en el
   panel, se rehace. Las ids estables las pone trackPoses(), también entre mitades de la imagen. */
const DET = { detector:null, key:'', single:false, building:null, error:'' };
/* sensibilidad: cuántos píxeles le llegan al modelo (res), en cuántas partes se corta la imagen (tiles),
   y desde qué puntaje se acepta un cuerpo (minPose) y un punto del esqueleto (P.track.minScore) */
const DET_PRESETS = {
  rapida: { label:'rápida: cuerpos grandes, cerca de la cámara', res:256, tiles:1, minPose:.2,  minScore:.3 },
  normal: { label:'normal: una persona o dos a media distancia', res:320, tiles:1, minPose:.15, minScore:.25 },
  sala:   { label:'sala: cámara lejos, cuerpos chicos (2 mitades)', res:384, tiles:2, minPose:.12, minScore:.22 },
  maxima: { label:'máxima: fondo de la sala, poca luz (3 partes)', res:384, tiles:3, minPose:.1,  minScore:.18 },
};
function applyDetPreset(name){ const d = DET_PRESETS[name]; if (!d) return; P.det.preset = name; P.det.res = d.res; P.det.tiles = d.tiles; P.det.minPose = d.minPose; P.track.minScore = d.minScore; }
async function makeDetector(res){
  const local = await probeLocalModel();
  const MN = poseDetection.SupportedModels.MoveNet;
  try {
    const cfg = { modelType:poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING, enableTracking:false, minPoseScore:.05, multiPoseMaxDimension:res };
    if (local) cfg.modelUrl = local + '/multipose-lightning/model.json';
    DET.single = false; return await poseDetection.createDetector(MN, cfg);
  } catch (e) {
    console.warn('MultiPose no disponible, uso SinglePose:', e.message);
    const cfg = { modelType:poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING };
    if (local) cfg.modelUrl = local + '/singlepose-lightning/model.json';
    DET.single = true; return await poseDetection.createDetector(MN, cfg);
  }
}
async function ensureDetector(){
  if (simMode) return null;
  const res = clamp(Math.round((P.det?.res || 384) / 32) * 32, 160, 640), key = 'mp' + res;
  if (DET.detector && DET.key === key) return DET.detector;
  if (DET.building) return DET.building;
  DET.building = (async () => {
    try { const d = await makeDetector(res); const old = DET.detector; DET.detector = d; DET.key = key; DET.error = ''; try { old?.dispose(); } catch (e) {} return d; }
    catch (e) { DET.error = e.message; console.error('No se pudo crear el detector:', e); return DET.detector; }
    finally { DET.building = null; }
  })();
  return DET.building;
}
/* partes horizontales con solapamiento: 2 → [0–.6] [.4–1]; 3 → [0–.47] [.27–.73] [.53–1] */
function detTiles(n, ov = .2){ n = Math.max(1, Math.min(4, n | 0)); if (n === 1) return [{ x0:0, x1:1 }]; const w = (1 + (n - 1) * ov) / n; return Array.from({ length:n }, (_, i) => ({ x0:i * (w - ov), x1:Math.min(1, i * (w - ov) + w) })); }
function kpBox(p, ms = .2){ let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (const k of p.keypoints) if ((k.score ?? 0) > ms) { x0 = Math.min(x0, k.x); x1 = Math.max(x1, k.x); y0 = Math.min(y0, k.y); y1 = Math.max(y1, k.y); n++; }
  if (n < 2) return ms > -1 ? kpBox(p, -2) : { x0:0, y0:0, x1:1, y1:1 };
  return { x0, y0, x1, y1 }; }
/* ---------- imagen para la detección: exposición, negros, blancos, medios tonos ----------
   Todo en la GPU con tensores (no cambia lo que se proyecta, solo lo que ve el modelo):
   salida = ((entrada × exposición − negros) / (blancos − negros)) ^ (1 / medios), recortado a 0–1.
   Dinámico: cada ~200 ms se mide el histograma donde están los cuerpos (o el piso, o todo) y se
   ajustan negros, blancos y medios para que los cuerpos queden en un gris medio, suavizado en el tiempo. */
function detLevels(src){
  const d = P.det;
  if (d.expo === 'auto') { const lv = src._lv || { black:0, white:1, gamma:1 }; return { gain:1, black:lv.black, white:lv.white, gamma:lv.gamma, gray:!!d.gray }; }
  return { gain:+d.light || 1, black:+d.black || 0, white:+d.white || 1, gamma:+d.gamma || 1, gray:!!d.gray };
}
function levelsIdentity(L){ return Math.abs(L.gain - 1) < .01 && L.black < .005 && L.white > .995 && Math.abs(L.gamma - 1) < .01 && !L.gray; }
function detProcess(t, L){   // t: [h,w,3] 0–255 → float 0–255
  return tf.tidy(() => {
    let f = tf.div(tf.cast(t, 'float32'), 255 / L.gain);
    if (L.gray) f = tf.tile(tf.sum(tf.mul(f, tf.tensor1d([.299, .587, .114])), 2, true), [1, 1, 3]);
    f = tf.clipByValue(tf.div(tf.sub(f, L.black), Math.max(.04, L.white - L.black)), 0, 1);
    if (Math.abs(L.gamma - 1) > .01) f = tf.pow(f, 1 / L.gamma);
    return tf.mul(f, 255);
  });
}
const METER_W = 160;
async function meterExposure(src, frame, vw, vh){
  const now = performance.now(); if (now - (src._meterT || 0) < 200) return; const dt = Math.min(1, (now - (src._meterT || now)) / 1000); src._meterT = now;
  const mw = METER_W, mh = Math.max(9, Math.round(METER_W * vh / vw));
  const sm = tf.tidy(() => tf.cast(tf.image.resizeBilinear(frame, [mh, mw]), 'int32')); const px = await sm.data(); sm.dispose();
  const sx = vw / mw, sy = vh / mh, ig = src.cal?.ignore || [], B = src._calB;
  const boxes = (src.poses || []).filter(p => p._box && !(src._calH && calIgnored(src, p))).map(p => { const b = p._box, pw = (b.x1 - b.x0) * .15, ph = (b.y1 - b.y0) * .1; return { x0:b.x0 - pw, x1:b.x1 + pw, y0:b.y0 - ph, y1:b.y1 + ph }; });
  const ybAt = x => { if (!B || B.length < 2) return 0; if (x <= B[0].x) return B[0].y; for (let i = 0; i < B.length - 1; i++) { const a = B[i], c = B[i + 1]; if (x <= c.x) return a.y + (c.y - a.y) * (x - a.x) / Math.max(1e-6, c.x - a.x); } return B[B.length - 1].y; };
  let mode = P.det.meter || 'auto'; if (mode === 'auto') mode = boxes.length ? 'cuerpos' : (B ? 'piso' : 'todo'); if (mode === 'cuerpos' && !boxes.length) mode = B ? 'piso' : 'todo'; if (mode === 'piso' && !B) mode = 'todo';
  const count = m => { const h = new Uint32Array(256); let n = 0;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const X = (x + .5) * sx, Y = (y + .5) * sy, nx = X / vw, ny = Y / vh;
      if (ig.some(r => nx >= Math.min(r.x0, r.x1) && nx <= Math.max(r.x0, r.x1) && ny >= Math.min(r.y0, r.y1) && ny <= Math.max(r.y0, r.y1))) continue;
      if (m === 'cuerpos' && !boxes.some(b => X >= b.x0 && X <= b.x1 && Y >= b.y0 && Y <= b.y1)) continue;
      if (m === 'piso' && Y < ybAt(X)) continue;
      const i = (y * mw + x) * 3; h[Math.min(255, (px[i] * .299 + px[i + 1] * .587 + px[i + 2] * .114) | 0)]++; n++; }
    return { h, n }; };
  let { h, n } = count(mode); if (n < 40) { mode = 'todo'; ({ h, n } = count(mode)); } if (!n) return;
  const pct = q => { let acc = 0; const tgt = q * n; for (let i = 0; i < 256; i++) { acc += h[i]; if (acc >= tgt) return i / 255; } return 1; };
  const lo = pct(.01), hi = pct(.995), med = pct(.5);
  let black = Math.min(lo, .45), white = Math.max(hi, black + .2); white = Math.min(1, white);
  const mid = clamp((med - black) / (white - black), .02, .98), target = clamp(P.det.target || .45, .15, .8);
  const gamma = clamp(Math.log(mid) / Math.log(target), .5, 2.8);
  const k = 1 - Math.exp(-dt / clamp(P.det.speed || .8, .05, 5)), lv = src._lv ||= { black, white, gamma };
  lv.black += (black - lv.black) * k; lv.white += (white - lv.white) * k; lv.gamma += (gamma - lv.gamma) * k;
  src._meter = { mode, n, lo, hi, med };
}
const DETPREV = { src:null };   // cámara que muestra la vista previa del panel (pide la imagen procesada)
/* detecta en una cámara: corta en partes, une los duplicados del solapamiento y pone ids estables */
async function detectSource(src){
  const det = DET.detector, v = src.video, vw = v.videoWidth, vh = v.videoHeight; if (!det || !vw || !vh) return src.poses || [];
  const tiles = DET.single ? [{ x0:0, x1:1 }] : detTiles(P.det.tiles), raw = [];
  const t0 = performance.now(), frame = tf.browser.fromPixels(v);
  try {
    if (P.det.expo === 'auto') await meterExposure(src, frame, vw, vh);
    const L = detLevels(src), same = levelsIdentity(L);
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i], sx = Math.round(t.x0 * vw), sw = Math.round((t.x1 - t.x0) * vw);
      const input = tf.tidy(() => { const c = tiles.length > 1 ? tf.slice(frame, [0, sx, 0], [vh, sw, 3]) : tf.clone(frame); return same ? c : detProcess(c, L); });
      let ps = []; try { ps = await det.estimatePoses(input, { maxPoses:Math.min(6, P.track.maxPoses + 2), flipHorizontal:false }); } catch (e) { DET.error = e.message; } finally { input.dispose(); }
      for (const p of ps) { if (sx) for (const k of p.keypoints) k.x += sx;
        const b = kpBox(p), edge = (i > 0 && b.x0 < sx + sw * .03) || (i < tiles.length - 1 && b.x1 > sx + sw * .97);
        p._tile = i; p._box = b; p._q = (p.score ?? .5) * (edge ? .6 : 1); raw.push(p); }
    }
    // vista previa del panel: la imagen tal como la recibe el modelo
    const now = performance.now();
    if (DETPREV.src === src && typeof UI !== 'undefined' && UI.tab === 'camaras' && !document.body.classList.contains('panel-hidden') && now - (src._prevT || 0) > 150) { src._prevT = now;
      const pw = 320, ph = Math.max(18, Math.round(pw * vh / vw));
      const sm = tf.tidy(() => { const r = tf.image.resizeBilinear(frame, [ph, pw]); return tf.cast(tf.clipByValue(same ? r : detProcess(r, L), 0, 255), 'int32'); });
      try { const px = await tf.browser.toPixels(sm); src._prevImg = new ImageData(px, pw, ph); } finally { sm.dispose(); } }
  } finally { frame.dispose(); }
  src._raw = raw; const diag = src._diag ||= {}; diag.raw = raw.length; diag.low = raw.filter(p => (p.score ?? 1) < P.det.minPose).length; diag.ms = performance.now() - t0; diag.tiles = tiles.length;
  diag.best = raw.reduce((m, p) => Math.max(m, p.score ?? 0), 0);
  let poses = raw.filter(p => (p.score ?? 1) >= P.det.minPose).sort((a, b) => b._q - a._q);
  if (tiles.length > 1) { const kept = [];   // la misma persona vista en dos partes: queda la más completa
    for (const p of poses) { const a = p._box, aA = Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));
      const dup = kept.some(q => { if (q._tile === p._tile) return false; const b = q._box, ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ix <= 0 || iy <= 0) return false; const bA = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0)); return ix * iy / Math.min(aA, bA) > .45; });
      if (!dup) kept.push(p); else p._dup = true; }
    poses = kept; }
  // fuera de las zonas ignoradas (el operador no ocupa un lugar), ids estables, y el tope de cuerpos:
  // se quedan primero los que ya se venían siguiendo (con 1 cuerpo no salta de bailarín en bailarín)
  if (src._calH) poses = poses.filter(p => !calIgnored(src, p));
  poses = selectBodies(src, trackPoses(src, poses));
  diag.kept = poses.length;
  return poses;
}
function selectBodies(src, poses){
  const max = Math.max(1, P.track.maxPoses | 0), prev = src._sel || new Set();
  if (poses.length > max) poses = poses.map((p, i) => ({ p, k:(prev.has(p.id) ? 1 : 0) * 10 + (p._q ?? p.score ?? 0) })).sort((a, b) => b.k - a.k).slice(0, max).map(o => o.p);
  src._sel = new Set(poses.map(p => p.id)); return poses;
}
/* ids estables por cercanía al cuadro anterior (el color de cada bailarín no salta) */
function trackPoses(src, poses){
  const T = src._trk ||= { next:0, list:[] }, now = performance.now();
  const items = poses.map(p => { const b = p._box || kpBox(p); return { p, cx:(b.x0 + b.x1) / 2, cy:(b.y0 + b.y1) / 2, s:Math.max(b.x1 - b.x0, b.y1 - b.y0, 12) }; });
  const pairs = []; items.forEach((it, i) => T.list.forEach((tr, j) => { const d = Math.hypot(it.cx - tr.cx, it.cy - tr.cy) / Math.max(it.s, tr.s); if (d < .9) pairs.push([d, i, j]); }));
  pairs.sort((a, b) => a[0] - b[0]); const ui = new Set(), uj = new Set();
  for (const [, i, j] of pairs) { if (ui.has(i) || uj.has(j)) continue; ui.add(i); uj.add(j); const it = items[i], tr = T.list[j]; Object.assign(tr, { cx:it.cx, cy:it.cy, s:it.s, t:now }); it.p.id = tr.id; }
  items.forEach((it, i) => { if (ui.has(i)) return; const tr = { id:T.next++, cx:it.cx, cy:it.cy, s:it.s, t:now }; T.list.push(tr); it.p.id = tr.id; });
  T.list = T.list.filter(tr => now - tr.t < 800);
  return poses;
}
async function initTF(){
  // El backend de TF exige una GPU "sin salvedades" (failIfMajorPerformanceCaveat). Si el navegador no la da
  // (GPU en lista negra, render por software, máquina virtual), le pasamos un contexto propio sin esa exigencia
  // ANTES de iniciar, porque TF guarda el resultado de la primera prueba.
  const strict = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat:true }) || document.createElement('canvas').getContext('webgl', { failIfMajorPerformanceCaveat:true });
  const setCtx = tf.setWebGLContext || (tf.webgl && tf.webgl.setWebGLContext);
  if (!strict && setCtx) {
    const cv = document.createElement('canvas'), attrs = { alpha:false, antialias:false, premultipliedAlpha:false, preserveDrawingBuffer:false, depth:false, stencil:false, failIfMajorPerformanceCaveat:false };
    let v = 2, ctx = cv.getContext('webgl2', attrs); if (!ctx) { v = 1; ctx = cv.getContext('webgl', attrs); }
    if (!ctx) throw new Error('sin WebGL para TensorFlow');
    setCtx(v, ctx); try { tf.env().set('HAS_WEBGL', true); tf.env().set('WEBGL_VERSION', v); } catch (e) {}
    console.warn('TF: WebGL con salvedad de rendimiento (render por software?)');
  }
  if (!(await tf.setBackend('webgl'))) throw new Error('el backend WebGL de TensorFlow no inicia'); await tf.ready();
}

async function detectLoop(){
  while (running) {
    const t0 = performance.now();
    if (!simMode) { await ensureDetector();
      for (const src of sources) { if (!DET.detector || src.video.readyState < 2) continue;
        try { src.poses = await detectSource(src); } catch (e) { DET.error = e.message; } } }
    inferBudgetMs = inferBudgetMs * .9 + (performance.now() - t0) * .1;
    const period = 1000 / Math.max(15, prof.inferHz), wait = Math.max(0, period - (performance.now() - t0));
    await new Promise(r => setTimeout(r, wait));
  }
}

/* ---------- zonas: reparto de la salida entre cámaras ---------- */
function defaultRect(i, n){ return LAYOUT.orient === 'filas' ? { x:0, y:i / n, w:1, h:1 / n } : { x:i / n, y:0, w:1 / n, h:1 }; }
function layoutCells(){
  const n = sources.length || 1;
  sources.forEach((src, i) => {
    const r = LAYOUT.orient === 'libre' && src.rect ? src.rect : defaultRect(i, n);
    if (LAYOUT.orient !== 'libre') src.rect = r;
    const c = { x:r.x * W, y:r.y * H, w:Math.max(1, r.w * W), h:Math.max(1, r.h * H) };
    src.cell = c;
    const vw = src.video.videoWidth || 640, vh = src.video.videoHeight || 480;
    const sc = Math.min(c.w / vw, c.h / vh);     // "contain": no recorta la cámara, deja bandas si hace falta
    src.fit = { vscale:sc, vox:c.x + (c.w - vw * sc) / 2, voy:c.y + (c.h - vh * sc) / 2 };
    if (typeof calPrepare === 'function') calPrepare(src);
  });
}
function zoneMirror(src){ return src.mirror === undefined ? P.cam.mirror : src.mirror; }
function syncBodies(){
  const now = performance.now(), sm = P.track.smoothing;
  for (const src of sources) {
    if (!src.fit) continue;
    const { vscale, vox, voy } = src.fit, c = src.cell, mir = zoneMirror(src);
    const mapX = x => { const px = x * vscale + vox; return mir ? (c.x + c.w - (px - c.x)) : px; };
    const mapY = y => y * vscale + voy;
    const useCal = !!src._calH, piso = useCal && src.cal.mode !== 'vista';   // calibración por tramos (calib.js)
    (src.poses || []).forEach((pose, idx) => {
      const id = src.id + ':' + (pose.id !== undefined ? pose.id : idx);
      if (useCal && calIgnored(src, pose)) return;                        // zona ignorada (operador, público…)
      const fig = piso ? calMapPose(src, pose, id) : null; if (piso && !fig) return;
      if (!colorSlot.has(id)) colorSlot.set(id, (nextSlot++) % PALETTES.length);
      let b = bodies.get(id); if (!b) { b = { kp:[], hue:PALETTES[colorSlot.get(id)], seen:now, id, src:src.id }; bodies.set(id, b); }
      b.seen = now; b.hue = P.color.oneHue ? P.color.bodyHue : PALETTES[colorSlot.get(id)];
      for (let i = 0; i < pose.keypoints.length; i++) {
        const k = pose.keypoints[i], S = k.score ?? 0, old = b.kp[i]; let X, Y;
        if (fig) { X = fig[i].x; Y = fig[i].y; } else if (useCal) { const m = calMap(src, k.x, k.y); X = m.x; Y = m.y; } else { X = mapX(k.x); Y = mapY(k.y); }
        if (!old || S < P.track.minScore * .5) b.kp[i] = { x:X, y:Y, s:S, vx:0, vy:0 };
        else { const nx = old.x + (X - old.x) * (1 - sm), ny = old.y + (Y - old.y) * (1 - sm); old.vx = nx - old.x; old.vy = ny - old.y; old.x = nx; old.y = ny; old.s = S; }
      }
    });
  }
  for (const [id, b] of bodies) if (now - b.seen > 900) { bodies.delete(id); colorSlot.delete(id); }
}
function centerOfMass(b){ let sx = 0, sy = 0, n = 0; for (const i of [5, 6, 11, 12]) { const k = b.kp[i]; if (k && k.s > P.track.minScore) { sx += k.x; sy += k.y; n++; } } return n ? { x:sx / n, y:sy / n } : null; }
function bodyScale(b){
  const ls = b.kp[5], rs = b.kp[6], lh = b.kp[11], ms = P.track.minScore; let s = 0;
  if (ls && rs && ls.s > ms && rs.s > ms) s = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  if (ls && lh && ls.s > ms && lh.s > ms) s = Math.max(s, Math.hypot(ls.x - lh.x, ls.y - lh.y));
  return s || 120 * DPR;
}
function bodySpeed(b){
  let tot = 0, n = 0; const ms = P.track.minScore;
  for (const i of [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) { const k = b.kp[i]; if (!k || k.s < ms) continue; tot += Math.hypot(k.vx || 0, k.vy || 0); n++; }
  if (!n) return 0;
  const raw = (tot / n) / bodyScale(b) * 16, dead = .18;
  return raw <= dead ? 0 : (raw - dead) / (1 - dead);
}

/* ---------- alta y baja de cámaras ---------- */
async function addSource(deviceId){
  const stream = await openStream(deviceId);
  const v = document.createElement('video'); v.autoplay = v.playsInline = v.muted = true; v.srcObject = stream; await v.play();
  const idx = availableCameras.findIndex(c => c.deviceId === deviceId);
  return { id:'c' + (srcCounter++), deviceId, label:idx >= 0 ? camLabel(availableCameras[idx], idx) : 'Cámara', video:v, stream,
    detector:null, poses:[], videoTex:makeTex(2, 2), bgTex:makeTex(2, 2), cell:null, fit:null, rect:null, mirror:undefined, cal:null };
}
function closeSource(src){
  try { src.stream?.getTracks().forEach(t => t.stop()); } catch (e) {}
  src.video.srcObject = null;
  gl.deleteTexture(src.videoTex); gl.deleteTexture(src.bgTex);
  for (const id of [...bodies.keys()]) if (id.startsWith(src.id + ':')) { bodies.delete(id); colorSlot.delete(id); }
}
/* ---------- ajustes de la cámara física (exposición, balance de blancos…) ----------
   Lo que la cámara exponga al navegador (track.getCapabilities). Webcams UVC en Windows y Linux
   suelen dar exposición y balance de blancos; en Mac muchas veces no hay nada. Se guardan por zona. */
const CAM_HW = [
  ['exposureMode', 'exposición de la cámara'], ['exposureTime', 'tiempo de exposición'], ['exposureCompensation', 'compensación de exposición'], ['iso', 'ISO / ganancia'],
  ['whiteBalanceMode', 'balance de blancos'], ['colorTemperature', 'temperatura de color (K)'],
  ['brightness', 'brillo (cámara)'], ['contrast', 'contraste (cámara)'], ['saturation', 'saturación (cámara)'], ['sharpness', 'nitidez (cámara)'],
  ['focusMode', 'foco'], ['focusDistance', 'distancia de foco'],
];
const CAM_HW_DEP = { exposureTime:['exposureMode', 'manual'], exposureCompensation:null, iso:['exposureMode', 'manual'], colorTemperature:['whiteBalanceMode', 'manual'], focusDistance:['focusMode', 'manual'] };
function camTrack(src){ return src?.stream?.getVideoTracks?.()[0] || null; }
function camCaps(src){ const t = camTrack(src); try { return (t && t.getCapabilities) ? t.getCapabilities() : {}; } catch (e) { return {}; } }
function camSettings(src){ const t = camTrack(src); try { return t ? t.getSettings() : {}; } catch (e) { return {}; } }
async function setCamHW(src, key, val){
  const t = camTrack(src); if (!t) return false; const caps = camCaps(src), c = { [key]:val }, dep = CAM_HW_DEP[key];
  if (dep && Array.isArray(caps[dep[0]]) && caps[dep[0]].includes(dep[1])) c[dep[0]] = dep[1];
  try { await t.applyConstraints({ advanced:[c] }); src.hw = Object.assign(src.hw || {}, c); if (typeof Sessions !== 'undefined') Sessions.touch(); return true; }
  catch (e) { toast('La cámara no aceptó ' + key + ' (' + (e.message || e.name) + ')'); return false; }
}
async function camHWAuto(src){
  const t = camTrack(src); if (!t) return; const caps = camCaps(src), c = {};
  for (const k of ['exposureMode', 'whiteBalanceMode', 'focusMode']) if (Array.isArray(caps[k]) && caps[k].includes('continuous')) c[k] = 'continuous';
  try { await t.applyConstraints({ advanced:[c] }); } catch (e) {} src.hw = null; if (typeof Sessions !== 'undefined') Sessions.touch();
}
async function applyCamHW(src){
  if (!src.hw) return; const t = camTrack(src); if (!t) return; const caps = camCaps(src), c = {};
  for (const k in src.hw) if (k in caps) c[k] = src.hw[k];
  if (Object.keys(c).length) try { await t.applyConstraints({ advanced:[c] }); } catch (e) { console.warn('ajustes de cámara:', e); }
}
/* ids = deviceIds en el orden de las zonas */
async function setCameras(ids, rects){
  ids = [...new Set(ids.filter(Boolean))].slice(0, MAX_CAMS); if (!ids.length) return;
  for (const src of [...sources]) if (!ids.includes(src.deviceId)) { sources.splice(sources.indexOf(src), 1); closeSource(src); }
  const next = [];
  for (const id of ids) {
    let src = sources.find(x => x.deviceId === id);
    if (!src) { try { src = await addSource(id); } catch (e) { toast('No se pudo abrir una cámara (' + e.name + ')'); } }
    if (src) next.push(src);
  }
  if (!next.length) return;
  sources.length = 0; sources.push(...next);
  if (rects) sources.forEach((s, i) => { if (rects[i]) { s.rect = rects[i].rect || s.rect; s.mirror = rects[i].mirror; if (rects[i].cal) s.cal = deepClone(rects[i].cal); if (rects[i].hw) { s.hw = deepClone(rects[i].hw); applyCamHW(s); } } });
  await ensureDetector();
  layoutCells(); if (fbFeed[0]) clearFeedback();
  if (typeof Sessions !== 'undefined') Sessions.touch();
  if (typeof UI !== 'undefined') UI.refresh('camaras');
}
function rotateCameras(){
  if (sources.length < 2) { toast('Solo hay una cámara activa'); return; }
  const ids = sources.map(x => x.deviceId); ids.push(ids.shift()); setCameras(ids);
}
navigator.mediaDevices?.addEventListener?.('devicechange', async () => { await refreshCameraList(); if (typeof UI !== 'undefined') UI.refresh('camaras'); });

/* ---------- simulador: cuerpos sintéticos (sin cámara, para probar estéticas y formato) ---------- */
function makeSimSource(){
  const v = document.createElement('canvas'); v.width = 1280; v.height = 720;
  Object.defineProperty(v, 'videoWidth', { value:1280 }); Object.defineProperty(v, 'videoHeight', { value:720 });
  Object.defineProperty(v, 'readyState', { value:0 });   // nunca se dibuja como video
  return { id:'sim' + (srcCounter++), deviceId:'sim', label:'Simulación', video:v, stream:null, detector:null, poses:[], videoTex:makeTex(2, 2), bgTex:makeTex(2, 2), cell:null, fit:null, rect:null, mirror:false };
}
const SIM = { n:3, t:0, operador:true };
/* bailarines simulados que caminan por el piso de la sala, con perspectiva (más chicos al fondo) */
function simPoses(time, n, vw, vh){
  const out = [];
  for (let p = 0; p < n; p++) {
    const ph = p * 1.7;
    const fy = .47 + .34 * (.5 + .5 * Math.sin(time * .21 + ph * 1.3));          // profundidad (pies) en la imagen
    const fx = .14 + .72 * ((p + .5) / n) + .1 * Math.sin(time * .29 + ph * 2);    // lado
    const hImg = vh * (.2 + .34 * (fy - .35) / .6), sc = hImg / 3.6;
    const bob = Math.sin(time * 2.1 + ph) * sc * .08;
    const hx = fx * vw, hy = fy * vh - sc * 3.3 + bob;
    const arm = Math.sin(time * 1.3 + ph), arm2 = Math.cos(time * 1.1 + ph * 2), leg = Math.sin(time * 1.8 + ph) * .3;
    const K = (x, y) => ({ x, y, score:.9 });
    const kp = new Array(17).fill(null).map(() => K(hx, hy));
    kp[0] = K(hx, hy);
    kp[5] = K(hx - sc * .45, hy + sc * .55); kp[6] = K(hx + sc * .45, hy + sc * .55);
    kp[7] = K(hx - sc * .75, hy + sc * .55 + sc * .7 * (.4 + arm * .6)); kp[8] = K(hx + sc * .75, hy + sc * .55 + sc * .7 * (.4 - arm * .6));
    kp[9] = K(kp[7].x - sc * .35 * arm2, kp[7].y + sc * .6 * (.3 + arm * .7)); kp[10] = K(kp[8].x + sc * .35 * arm2, kp[8].y + sc * .6 * (.3 - arm * .7));
    kp[11] = K(hx - sc * .3, hy + sc * 1.7); kp[12] = K(hx + sc * .3, hy + sc * 1.7);
    kp[13] = K(hx - sc * .32 - leg * sc, hy + sc * 2.5); kp[14] = K(hx + sc * .32 + leg * sc, hy + sc * 2.5);
    kp[15] = K(kp[13].x - leg * sc * .5, hy + sc * 3.3); kp[16] = K(kp[14].x + leg * sc * .5, hy + sc * 3.3);
    for (let i = 1; i <= 4; i++) kp[i] = K(hx + (i % 2 ? -1 : 1) * sc * .12 * (i > 2 ? 2 : 1), hy - sc * .05);
    out.push({ id:p, keypoints:kp });
  }
  // operador sentado abajo a la izquierda (como en la foto de la sala): sirve para probar la zona ignorada
  if (SIM.operador) { const sc = vh * .09, hx = vw * .05, hy = vh * .75, K = (x, y) => ({ x, y, score:.8 }); const kp = new Array(17).fill(null).map(() => K(hx, hy));
    kp[5] = K(hx - sc * .5, hy + sc * .7); kp[6] = K(hx + sc * .5, hy + sc * .7); kp[11] = K(hx - sc * .3, hy + sc * 2); kp[12] = K(hx + sc * .3, hy + sc * 2); kp[9] = K(hx + sc, hy + sc * 2.2); kp[10] = K(hx + sc * 1.2, hy + sc * 2.1);
    out.push({ id:99, keypoints:kp }); }
  return out;
}
function simTick(dt){
  if (!simMode) return; SIM.t += dt;
  for (const src of sources) { let ps = simPoses(SIM.t, SIM.n, src.video.videoWidth, src.video.videoHeight); ps.forEach(p => { p._q = .9; }); if (src._calH) ps = ps.filter(p => !calIgnored(src, p)); src._simAll = ps.length; src.poses = selectBodies(src, ps); }
}
