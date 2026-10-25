"use strict";
/* =====================================================================
   MIRADOR — render
   Capa 2D (scene) → GL: escena + módulos GL aditivos → eco (feedback)
   → bloom → composición (aberración, glitch, viñeta, flash, bordes de
   proyector) → homografía a pantalla. Escalador con histéresis.
   ===================================================================== */
function drawScene(dt){
  sctx.setTransform(S2, 0, 0, S2, 0, 0); sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over'; sctx.clearRect(0, 0, W, H);
  if (P.cam.showVideo && !P.map.blackout) {
    for (const src of sources) { if (src.video.readyState < 2 || !src.cell) continue;
      const c = src.cell, { vscale, vox, voy } = src.fit;
      sctx.save(); sctx.beginPath(); sctx.rect(c.x, c.y, c.w, c.h); sctx.clip(); sctx.globalAlpha = P.cam.videoOpacity;
      sctx.filter = `contrast(${P.cam.contrast}) brightness(${P.cam.brightness}) saturate(${P.cam.saturate})`;
      if (zoneMirror(src)) { sctx.translate(2 * c.x + c.w, 0); sctx.scale(-1, 1); }
      sctx.drawImage(src.video, vox, voy, src.video.videoWidth * vscale, src.video.videoHeight * vscale);
      sctx.restore(); }
    sctx.filter = 'none';
  }
  if (P.map.testGrid) drawGrid();
  if (P.map.blackout) return;
  const list = [...bodies.values()];
  if (P.link.enabled && list.length > 1) drawLinks(list);
  if (P.track.showSkeleton || P.track.showJoints || P.track.showId) drawSkeletons(list);
  for (const m of plan) if (m.draw2d && m.active) m.draw2d();
}

let feedIdx = 0;
const MODES = { directo:0, additive:1, screen:2, multiply:3 };
function render(t){
  nowT = t;
  if (producersNeeded.has('mask')) { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    for (const src of sources) { if (src.video.readyState < 2) continue; gl.bindTexture(gl.TEXTURE_2D, src.videoTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src.video); }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); }
  for (const m of plan) if (m.producer) m.produce();
  uploadCanvas(sceneTex, scene);
  bindFBO(fbScene); gl.disable(gl.BLEND); gl.useProgram(pBlit); useTex(0, sceneTex, pBlit, 'uTex'); drawQuad(pBlit);
  if (!P.map.blackout) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); for (const m of plan) if (!m.producer && m.draw) m.draw(); gl.disable(gl.BLEND); }
  const cur = feedIdx, prev = 1 - feedIdx;
  const decay = P.echo.mode === 'directo' ? 0 : clamp(P.echo.decay + AM.echo * (.995 - P.echo.decay), 0, .995);
  gl.useProgram(pFeed); bindFBO(fbFeed[cur]); useTex(0, fbScene.t, pFeed, 'uScene'); useTex(1, fbFeed[prev].t, pFeed, 'uPrev');
  gl.uniform1f(U(pFeed, 'uDecay'), decay); gl.uniform1f(U(pFeed, 'uZoom'), P.echo.zoom);
  gl.uniform1f(U(pFeed, 'uRot'), P.echo.rotate * .01); gl.uniform1f(U(pFeed, 'uDrift'), P.echo.drift * .001); gl.uniform1i(U(pFeed, 'uMode'), MODES[P.echo.mode] ?? 2); drawQuad(pFeed);
  gl.useProgram(pBright); bindFBO(fbBright); useTex(0, fbFeed[cur].t, pBright, 'uTex'); gl.uniform1f(U(pBright, 'uThr'), P.fx.threshold); drawQuad(pBright);
  gl.useProgram(pBlur); const r = eff(P.fx, 'radius', prof.caps['fx.radius']); let src = fbBright;
  for (let i = 0; i < prof.bloomIter; i++) { bindFBO(fbB1); useTex(0, src.t, pBlur, 'uTex'); gl.uniform2f(U(pBlur, 'uDir'), r * (1 + i) / fbB1.w, 0); drawQuad(pBlur);
    bindFBO(fbB2); useTex(0, fbB1.t, pBlur, 'uTex'); gl.uniform2f(U(pBlur, 'uDir'), 0, r * (1 + i) / fbB2.h); drawQuad(pBlur); src = fbB2; }
  gl.useProgram(pComp); bindFBO(fbComp); useTex(0, fbFeed[cur].t, pComp, 'uBase'); useTex(1, src.t, pComp, 'uBloom');
  gl.uniform1f(U(pComp, 'uBloomAmt'), P.fx.bloom + AM.bloom); gl.uniform1f(U(pComp, 'uChroma'), prof.allowChroma ? P.fx.chroma : 0);
  gl.uniform1f(U(pComp, 'uGlitch'), prof.allowGlitch ? P.fx.glitch : 0); gl.uniform1f(U(pComp, 'uBlocks'), P.fx.glitchBlocks);
  gl.uniform1f(U(pComp, 'uTime'), t); gl.uniform1f(U(pComp, 'uVig'), P.fx.vignette); gl.uniform1f(U(pComp, 'uGamma'), P.fx.gamma);
  gl.uniform1f(U(pComp, 'uFlash'), P.map.blackout ? 0 : AM.flash); gl.uniform1f(U(pComp, 'uSlices'), P.map.slices); gl.uniform1f(U(pComp, 'uBlend'), P.map.blend); drawQuad(pComp);
  gl.useProgram(pFinal); bindFBO(null); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  useTex(0, fbComp.t, pFinal, 'uTex'); gl.uniformMatrix3fv(U(pFinal, 'uH'), false, homography()); drawQuad(pFinal);
  feedIdx = prev;
  if (typeof pushOutputs === 'function') pushOutputs();
  if (typeof Rec !== 'undefined') Rec.frame();
}

/* =====================================================================
   ESCALADOR (histéresis) y perfiles
   ===================================================================== */
const scaler = { hist:new Array(60).fill(16), hi:0, cooldown:0, step:0, moved:0,
  ladder:[
    { name:'capa 2D más liviana', apply:() => { P.perf.scene2d = Math.max(.5, P.perf.scene2d - .2); }, redo:true },
    { name:'resolución más baja', apply:() => prof.renderScale = Math.max(.5, prof.renderScale - .1), redo:true },
    { name:'menos puntos', apply:() => prof.gridN = Math.max(96, Math.round(prof.gridN * .8)), grid:true },
    { name:'bloom simple', apply:() => prof.bloomIter = 1 },
    { name:'sin aberración', apply:() => prof.allowChroma = false },
    { name:'sin glitch', apply:() => prof.allowGlitch = false },
    { name:'inferencia más lenta', apply:() => prof.inferHz = Math.max(15, prof.inferHz - 5) },
  ] };
let slowCount = 0, fastCount = 0, chosenProfile = null;
function scalerTick(dt){
  scaler.hist[scaler.hi] = dt * 1000; scaler.hi = (scaler.hi + 1) % 60;
  if (!P.perf.autoScale) return;
  if (scaler.cooldown > 0) { scaler.cooldown--; return; }
  const sorted = [...scaler.hist].sort((a, b) => a - b), p95 = sorted[56], target = 1000 / P.perf.targetFps;
  if (p95 > target * 1.15) { slowCount++; fastCount = 0;
    if (slowCount >= 30 && scaler.step < scaler.ladder.length) { const s = scaler.ladder[scaler.step++]; s.apply();
      if (s.redo) resize(); if (s.grid) buildRefBuffer(); scaler.cooldown = 90; slowCount = 0; scaler.moved = performance.now(); toast('adaptando: ' + s.name, 2500); } }
  else if (p95 < target * .75) { fastCount++; slowCount = 0;
    if (fastCount >= 180 && scaler.step > 0) { scaler.step--; const s = scaler.ladder[scaler.step]; recoverLadder(scaler.step);
      if (s.redo) resize(); if (s.grid) buildRefBuffer(); scaler.cooldown = 120; fastCount = 0; scaler.moved = performance.now(); toast('recuperando: ' + s.name, 2500); } }
  else { slowCount = Math.max(0, slowCount - 1); fastCount = Math.max(0, fastCount - 1); }
}
function recoverLadder(i){ const base = chosenProfile; if (!base) return;
  switch (i) { case 0: P.perf.scene2d = Math.min(base.scene2d ?? 1, P.perf.scene2d + .2); break;
    case 1: prof.renderScale = Math.min(base.renderScale, prof.renderScale + .1); break;
    case 2: prof.gridN = Math.min(base.gridN, Math.round(prof.gridN * 1.25)); break;
    case 3: prof.bloomIter = base.bloomIter; break; case 4: prof.allowChroma = base.allowChroma; break;
    case 5: prof.allowGlitch = base.allowGlitch; break; case 6: prof.inferHz = Math.min(base.inferHz, prof.inferHz + 5); break; }
}
const PROFILES = {
  ligero:      { name:'Ligero', renderScale:.6, gridN:128, bloomIter:1, allowChroma:false, allowGlitch:false, inferHz:20, scene2d:.6, targetFps:24 },
  equilibrado: { name:'Equilibrado', renderScale:.85, gridN:180, bloomIter:2, allowChroma:true, allowGlitch:true, inferHz:26, scene2d:.8, targetFps:30 },
  completo:    { name:'Completo', renderScale:1, gridN:220, bloomIter:2, allowChroma:true, allowGlitch:true, inferHz:30, scene2d:1, targetFps:60 },
};
function applyProfile(pr){
  Object.assign(prof, { name:pr.name, renderScale:pr.renderScale, gridN:pr.gridN, bloomIter:pr.bloomIter, allowChroma:pr.allowChroma, allowGlitch:pr.allowGlitch, inferHz:pr.inferHz });
  P.perf.scene2d = pr.scene2d ?? 1; P.perf.targetFps = pr.targetFps || 30;
  chosenProfile = Object.assign({}, prof, { scene2d:P.perf.scene2d }); scaler.step = 0;
}
function gpuName(){ const info = gl.getExtension('WEBGL_debug_renderer_info'); return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'GPU'; }
function guessTier(){
  const r = gpuName(), mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 4;
  const weak = /(intel).*(hd|uhd|iris)|mali|adreno [1-5]|swiftshader|llvmpipe/i.test(r);
  if (weak || mem <= 4 || cores <= 4) return 'ligero';
  if (/rtx|radeon rx|apple m[1-9]|apple gpu|arc/i.test(r) && mem >= 8) return 'completo';
  return 'equilibrado';
}
/* medición breve: 90 cuadros con cuerpos sintéticos y los módulos pesados prendidos */
async function benchmark(){
  const savedActive = new Map([...Modules.values()].map(m => [m.id, m.active]));
  const savedP = deepClone(P), savedProf = Object.assign({}, prof), wasSim = simMode;
  ['silueta', 'swarm', 'scribble'].forEach(id => setModule(id, true)); if (EXT_VTF) setModule('vivas', true);
  Object.assign(prof, PROFILES.completo, { name:'test' }); buildRefBuffer(); resize(); rebuildPlan();
  const times = []; let f = 0; const t0 = SIM.t, tStart = performance.now();
  await new Promise(res => { function step(t){ const a = performance.now();
    SIM.t += .016; for (const src of sources) src.poses = simPoses(SIM.t, 4, src.video.videoWidth || 1280, src.video.videoHeight || 720);
    syncBodies(); for (const m of plan) if (!m.producer && m.update) m.update(.016); drawScene(.016); render(t / 1000);
    const dt = performance.now() - a; if (f++ >= 10) times.push(dt); toast(`midiendo la computadora · ${f}/90`, 0);
    if (f < 90 && performance.now() - tStart < 4000) requestAnimationFrame(step); else res(); } requestAnimationFrame(step); });
  SIM.t = t0; if (!wasSim) sources.forEach(x => x.poses = []); bodies.clear();
  for (const [id, a] of savedActive) { const m = Modules.get(id); if (m) m.active = a; }
  Object.keys(P).forEach(k => Object.assign(P[k], savedP[k])); Object.assign(prof, savedProf);
  times.sort((a, b) => a - b); if (!times.length) times.push(16);
  return { med:times[times.length >> 1], p95:times[Math.floor(times.length * .95)], vtf:EXT_VTF };
}

/* =====================================================================
   CALIBRACIÓN (esquinas) sobre el canvas ui
   ===================================================================== */
const toScreen = c => ({ x:c.x * W, y:(1 - c.y) * H }); let dragIdx = -1;
function drawCalib(){
  uiCtx.setTransform(1, 0, 0, 1, 0, 0); uiCtx.clearRect(0, 0, W, H); if (!P.map.calibrate) return;
  const pts = corners.map(toScreen); uiCtx.strokeStyle = 'rgba(105,240,176,.85)'; uiCtx.lineWidth = 2 * DPR; uiCtx.setLineDash([9 * DPR, 7 * DPR]);
  uiCtx.beginPath(); pts.forEach((p, i) => i ? uiCtx.lineTo(p.x, p.y) : uiCtx.moveTo(p.x, p.y)); uiCtx.closePath(); uiCtx.stroke(); uiCtx.setLineDash([]);
  const names = ['inf. izq', 'inf. der', 'sup. der', 'sup. izq'];
  pts.forEach((p, i) => { uiCtx.fillStyle = dragIdx === i ? '#69f0b0' : 'rgba(0,0,0,.55)'; uiCtx.strokeStyle = '#69f0b0'; uiCtx.lineWidth = 2 * DPR;
    uiCtx.beginPath(); uiCtx.arc(p.x, p.y, 13 * DPR, 0, 6.283); uiCtx.fill(); uiCtx.stroke(); uiCtx.fillStyle = '#69f0b0';
    uiCtx.font = `${12 * DPR}px ui-monospace,monospace`; uiCtx.textAlign = p.x > W / 2 ? 'right' : 'left'; uiCtx.fillText(names[i], p.x + (p.x > W / 2 ? -22 * DPR : 22 * DPR), p.y + 4 * DPR); });
}
function pointerPos(e){ const r = uiCanvas.getBoundingClientRect(); return { x:(e.clientX - r.left) / r.width * W, y:(e.clientY - r.top) / r.height * H }; }
uiCanvas.addEventListener('pointerdown', e => { if (!P.map.calibrate) return; const m = pointerPos(e); let best = -1, bd = 40 * DPR;
  corners.map(toScreen).forEach((p, i) => { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < bd) { bd = d; best = i; } }); dragIdx = best; if (best >= 0) uiCanvas.setPointerCapture(e.pointerId); });
uiCanvas.addEventListener('pointermove', e => { if (dragIdx < 0) return; const m = pointerPos(e); corners[dragIdx] = { x:m.x / W, y:1 - m.y / H }; });
uiCanvas.addEventListener('pointerup', () => { if (dragIdx >= 0 && typeof Sessions !== 'undefined') Sessions.touch(); dragIdx = -1; });

/* =====================================================================
   FONDO APRENDIDO (para la fuente de silueta "fondo")
   ===================================================================== */
function learnBackground(){
  const ok = sources.filter(x => x.video.readyState >= 2);
  if (!ok.length) { toast('cámara sin señal aún'); return; }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  for (const src of ok) { gl.bindTexture(gl.TEXTURE_2D, src.bgTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src.video); }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  P.mask.source = 'fondo'; P.mask.learnBg = true; toast('fondo aprendido — volvé al cuadro'); if (typeof UI !== 'undefined') UI.refresh();
}

/* =====================================================================
   GRABACIÓN (MediaRecorder desde el canvas; audio si hay)
   ===================================================================== */
const Rec = { rec:null, chunks:[], cv:null, ctx:null, scale:1, t0:0,
  frame(){ if (this.cv && this.rec && this.rec.state === 'recording') this.ctx.drawImage(glCanvas, 0, 0, this.cv.width, this.cv.height); },
  start(opts = {}){
    if (this.rec) return;
    const maxW = opts.maxWidth || 3840;
    this.scale = Math.min(1, maxW / W); let srcCv = glCanvas;
    if (this.scale < 1) { this.cv = document.createElement('canvas'); this.cv.width = Math.round(W * this.scale); this.cv.height = Math.round(H * this.scale); this.ctx = this.cv.getContext('2d'); srcCv = this.cv; }
    const stream = srcCv.captureStream(30);
    try { const a = typeof Audio_ !== 'undefined' && Audio_.recordStream(); if (a) a.getAudioTracks().forEach(t => stream.addTrack(t)); } catch (e) {}
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    this.chunks = []; this.rec = new MediaRecorder(stream, { mimeType:mime || undefined, videoBitsPerSecond:opts.bitrate || 24e6 });
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => { const blob = new Blob(this.chunks, { type:'video/webm' }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `mirador-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000); this.rec = null; this.cv = null; $('fRec').hidden = true; toast('grabación guardada (.webm)'); };
    this.rec.start(1000); this.t0 = performance.now(); $('fRec').hidden = false; toast(`grabando ${srcCv.width}×${srcCv.height} (R para parar)`);
  },
  stop(){ if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); },
  toggle(opts){ this.rec ? this.stop() : this.start(opts); },
  get active(){ return !!this.rec; } };
