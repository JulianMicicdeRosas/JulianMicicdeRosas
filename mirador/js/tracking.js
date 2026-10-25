"use strict";
/* =====================================================================
   MIRADOR — tracking
   Zonas (cámaras) repartidas en la salida, un detector MoveNet por
   cámara (el tracker guarda estado y no se comparte), cuerpos
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
let modelBase = null;   // URL local del modelo si está en vendor/movenet

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
async function makeDetector(){
  const local = await probeLocalModel();
  const MN = poseDetection.SupportedModels.MoveNet;
  try {
    const cfg = { modelType:poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING, enableTracking:true, trackerType:poseDetection.TrackerType.BoundingBox, minPoseScore:.2 };
    if (local) cfg.modelUrl = local + '/multipose-lightning/model.json';
    return await poseDetection.createDetector(MN, cfg);
  } catch (e) {
    console.warn('MultiPose no disponible, uso SinglePose:', e.message);
    const cfg = { modelType:poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING };
    if (local) cfg.modelUrl = local + '/singlepose-lightning/model.json';
    return await poseDetection.createDetector(MN, cfg);
  }
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
async function ensureDetector(src){ if (!src.detector && !simMode) src.detector = await makeDetector(); }

async function detectLoop(){
  while (running) {
    const t0 = performance.now();
    if (!simMode) for (const src of sources) {
      if (!src.detector || src.video.readyState < 2) continue;
      try { src.poses = await src.detector.estimatePoses(src.video, { maxPoses:P.track.maxPoses, flipHorizontal:false }); } catch (e) {}
    }
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
    (src.poses || []).forEach((pose, idx) => {
      const id = src.id + ':' + (pose.id !== undefined ? pose.id : idx);
      if (!colorSlot.has(id)) colorSlot.set(id, (nextSlot++) % PALETTES.length);
      let b = bodies.get(id); if (!b) { b = { kp:[], hue:PALETTES[colorSlot.get(id)], seen:now, id, src:src.id }; bodies.set(id, b); }
      b.seen = now;
      for (let i = 0; i < pose.keypoints.length; i++) {
        const k = pose.keypoints[i], X = mapX(k.x), Y = mapY(k.y), S = k.score ?? 0, old = b.kp[i];
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
    detector:null, poses:[], videoTex:makeTex(2, 2), bgTex:makeTex(2, 2), cell:null, fit:null, rect:null, mirror:undefined };
}
function closeSource(src){
  try { src.stream?.getTracks().forEach(t => t.stop()); } catch (e) {}
  src.video.srcObject = null;
  gl.deleteTexture(src.videoTex); gl.deleteTexture(src.bgTex);
  for (const id of [...bodies.keys()]) if (id.startsWith(src.id + ':')) { bodies.delete(id); colorSlot.delete(id); }
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
  if (rects) sources.forEach((s, i) => { if (rects[i]) { s.rect = rects[i].rect || s.rect; s.mirror = rects[i].mirror; } });
  for (const src of sources) await ensureDetector(src);
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
const SIM = { n:3, t:0 };
function simPoses(time, n, vw, vh){
  const out = [];
  for (let p = 0; p < n; p++) {
    const cx = (p + .5) / n, ph = p * 1.7, sway = Math.sin(time * .6 + ph) * .06, bob = Math.sin(time * 2.1 + ph) * .02;
    const sc = vh * .22, hx = (cx + sway) * vw, hy = (.26 + bob) * vh;
    const arm = Math.sin(time * 1.3 + ph), arm2 = Math.cos(time * 1.1 + ph * 2), leg = Math.sin(time * 1.8 + ph) * .3;
    const K = (x, y) => ({ x, y, score:.9 });
    const kp = new Array(17).fill(null).map(() => K(hx, hy));
    kp[0] = K(hx, hy);                                                  // nariz
    kp[5] = K(hx - sc * .45, hy + sc * .55); kp[6] = K(hx + sc * .45, hy + sc * .55);   // hombros
    kp[7] = K(hx - sc * .75, hy + sc * .55 + sc * .7 * (.4 + arm * .6)); kp[8] = K(hx + sc * .75, hy + sc * .55 + sc * .7 * (.4 - arm * .6)); // codos
    kp[9] = K(kp[7].x - sc * .35 * arm2, kp[7].y + sc * .6 * (.3 + arm * .7)); kp[10] = K(kp[8].x + sc * .35 * arm2, kp[8].y + sc * .6 * (.3 - arm * .7)); // muñecas
    kp[11] = K(hx - sc * .3, hy + sc * 1.7); kp[12] = K(hx + sc * .3, hy + sc * 1.7);     // caderas
    kp[13] = K(hx - sc * .32 - leg * sc, hy + sc * 2.5); kp[14] = K(hx + sc * .32 + leg * sc, hy + sc * 2.5);   // rodillas
    kp[15] = K(kp[13].x - leg * sc * .5, hy + sc * 3.3); kp[16] = K(kp[14].x + leg * sc * .5, hy + sc * 3.3);  // tobillos
    for (let i = 1; i <= 4; i++) kp[i] = K(hx + (i % 2 ? -1 : 1) * sc * .12 * (i > 2 ? 2 : 1), hy - sc * .05);
    out.push({ id:p, keypoints:kp });
  }
  return out;
}
function simTick(dt){
  if (!simMode) return; SIM.t += dt;
  for (const src of sources) src.poses = simPoses(SIM.t, SIM.n, src.video.videoWidth, src.video.videoHeight);
}
