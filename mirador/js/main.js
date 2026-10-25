"use strict";
/* =====================================================================
   MIRADOR — arranque, bucle principal, teclado, diapositivas
   ===================================================================== */
let started = false, last = performance.now(), t0 = performance.now(), fpsAcc = 0, fpsN = 0, uiTick = 0;
const presetParam = urlParams.get('preset'), escenaParam = urlParams.get('escena'), audioParam = urlParams.get('audio');
const salidaParam = urlParams.get('salida'), sesionParam = urlParams.get('sesion'), returnUrl = urlParams.get('return'), mosaicoParam = urlParams.get('mosaico');
const inIframe = (() => { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();

/* ---------- puerta ---------- */
function fillGate(){
  const sel = $('gateSession'); sel.innerHTML = '<option value="">— sin sesión (no guarda) —</option>';
  for (const n of Sessions.names()) { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); }
  const lastS = sesionParam || Sessions.lastName(); if (lastS && Sessions.get(lastS)) sel.value = lastS;
  const go = $('gateOut'), ow = $('gateOutW'), oh = $('gateOutH');
  const s = Sessions.get(sel.value); const outMode = salidaParam || s?.out?.mode || 'ventana';
  if ([...go.options].some(o => o.value === outMode)) go.value = outMode; else { go.value = 'custom'; ow.value = s?.out?.w || 1920; oh.value = s?.out?.h || 1080; }
  const custom = () => { const c = go.value === 'custom'; ow.hidden = oh.hidden = !c; }; go.onchange = custom; custom();
  sel.onchange = () => { const s2 = Sessions.get(sel.value); if (s2?.out?.mode) { go.value = [...go.options].some(o => o.value === s2.out.mode) ? s2.out.mode : 'custom'; ow.value = s2.out.w; oh.value = s2.out.h; custom(); } if (s2?.P?.audio?.source) $('gateAudio').value = s2.P.audio.source; };
  $('gateAudio').value = audioParam === 'mic' ? 'mic' : (s?.P?.audio?.source || (audioParam ? 'cancion' : 'off'));
}
async function loadCDNFallback(){
  if (!window.__vendorMissing && typeof tf !== 'undefined' && typeof poseDetection !== 'undefined') return;
  const urls = ['https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.22.0/dist/tf-core.min.js', 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter@4.22.0/dist/tf-converter.min.js',
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.22.0/dist/tf-backend-webgl.min.js', 'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js'];
  for (const u of urls) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = u; s.onload = res; s.onerror = () => rej(new Error('sin internet para bajar ' + u)); document.head.appendChild(s); });
}
async function start(sim){
  if (started) return; const btn = $('start'); btn.disabled = $('startSim').disabled = true; btn.textContent = 'Encendiendo…';
  const sessName = $('gateSession').value, newName = $('gateNewName').value.trim();
  setOutputFormat($('gateOut').value, +$('gateOutW').value, +$('gateOutH').value);
  simMode = !!sim;
  if (!simMode) {
    try { const tmp = await navigator.mediaDevices.getUserMedia({ video:true, audio:false }); tmp.getTracks().forEach(t => t.stop()); await refreshCameraList(); if (!availableCameras.length) throw new Error('sin cámaras'); }
    catch (e) { btn.disabled = $('startSim').disabled = false; btn.textContent = 'Encender'; fail('No se pudo abrir la cámara (' + (e.name || e.message) + '). Dá permiso en el navegador, o abrí el programa desde localhost con el lanzador. También podés "Probar sin cámara".'); return; }
    try { await loadCDNFallback(); await initTF(); }
    catch (e) { console.error(e); toast('No se pudo iniciar TensorFlow (' + e.message + '). Sigo en modo simulación; revisá Sistema → Diagnóstico.', 7000); simMode = true; }
  }
  // sesión
  const sess = sessName ? Sessions.get(sessName) : null;
  if (!simMode) {
    let ids = sess?.zonas?.map(z => z.deviceId).filter(id => availableCameras.some(c => c.deviceId === id)) || [];
    if (!ids.length) ids = [availableCameras[0].deviceId];
    try { await setCameras(ids, sess?.zonas); }
    catch (e) { console.error(e); }
    if (!sources.length || sources.some(s => !s.detector)) {
      toast('No se pudo cargar el modelo de pose (¿sin internet y sin vendor/movenet?). Sigo en modo simulación.', 6000);
      simMode = true; sources.forEach(closeSource); sources.length = 0;
    }
  }
  if (simMode) { sources.length = 0; sources.push(makeSimSource()); }
  // perfil + medición
  const tier = presetParam && PROFILES[presetParam] ? presetParam : guessTier(); applyProfile(PROFILES[tier]); buildRefBuffer(); resize();
  if (!presetParam) { const b = await benchmark(); const fps = 1000 / Math.max(b.p95, .1); let rec = tier;
    if (fps < 28) rec = 'ligero'; else if (fps >= 52) rec = 'completo'; else rec = 'equilibrado';
    applyProfile(PROFILES[rec]); buildRefBuffer(); resize(); toast(`perfil ${PROFILES[rec].name} (~${Math.round(fps)} fps a tope en la prueba)`, 3500); }
  // estado visual inicial
  if (sess) { Sessions.current = sessName; localStorage.setItem(Sessions.CUR, sessName); await Sessions.apply(sess, { keepCams:true, keepOut:true }); }
  else { applyPlantilla('enjambre', { silent:true }); if (newName) Sessions.create(newName); else Sessions.updateName(); }
  if (escenaParam) applyPlantilla(ESCENA_ALIAS[escenaParam] || escenaParam, { silent:true });
  if (mosaicoParam && mosaicoParam !== '0') { P.map.mosaic = true; P.map.mosPreview = false; const m = mosaicoParam.match(/^(\d+)x(\d+)$/); if (m) { P.map.mosW = +m[1]; P.map.mosH = +m[2]; }
    if (P.map.slices < 2 && /^\d+x\d+$/.test(OUT.mode)) P.map.slices = Math.max(1, Math.round(OUT.w / (P.map.tileW || 1920))); resize(); }
  const audioSel = $('gateAudio').value; if (audioSel !== 'off' || P.audio.source !== 'off') { await Audio_.setSource(audioSel !== 'off' ? audioSel : P.audio.source); }
  await Playlist.autoFolder('canciones');
  if (audioParam && audioParam !== 'mic') { Playlist.fromUrlParam(audioParam); Playlist.play(); }
  syncModulesFromP(); UI.init(); $('gate').remove(); document.body.classList.add('show-hint');
  if (urlParams.get('panel') === '1') UI.togglePanel(true);
  started = true; running = true; Sessions.dirty = false; Sessions.updateName(); Playlist.updateCue();
  detectLoop(); requestAnimationFrame(loop);
}
$('start').addEventListener('click', () => start(false));
$('startSim').addEventListener('click', () => start(true));

/* ---------- bucle principal ---------- */
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, .05); last = now; const t = (now - t0) / 1000;
  simTick(dt); syncBodies(); Audio_.tick(dt);
  for (const m of plan) if (!m.producer && m.update) m.update(dt);
  drawScene(dt); render(t); drawCalib(); scalerTick(dt);
  fpsAcc += 1 / Math.max(dt, 1e-4); fpsN++;
  if (fpsN >= 20) { $('fFps').textContent = Math.round(fpsAcc / fpsN) + ' fps'; fpsAcc = 0; fpsN = 0; const n = bodies.size; $('fBodies').textContent = n === 0 ? 'sin cuerpos' : `${n} ${n === 1 ? 'cuerpo' : 'cuerpos'}`; }
  if ((uiTick++ % 6) === 0) { $('fAudio').firstElementChild.style.width = (clamp(AM.level, 0, 1) * 100).toFixed(0) + '%'; if (!document.body.classList.contains('panel-hidden')) UI.tick(); }
}

/* ---------- teclado ---------- */
addEventListener('keydown', e => {
  const tag = e.target.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape' || k === 'backspace') { e.preventDefault(); if (started) closeEmbedOrReturn(); return; }
  if (!started) return;
  if (k === ' ') { e.preventDefault(); Playlist.toggle(); }
  else if (k === 'enter') { if (Playlist.has() && !Playlist.started) Playlist.play(); }
  else if (k === 'arrowup' || k === 'arrowdown') { e.preventDefault(); Playlist.select(Playlist.selected + (k === 'arrowup' ? -1 : 1)); }
  else if (k === 'h') UI.togglePanel();
  else if (k === 'c') { P.map.calibrate = !P.map.calibrate; uiCanvas.classList.toggle('calibrating', P.map.calibrate); UI.refresh('proyeccion'); }
  else if (k === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
  else if (k === 'b' && e.shiftKey) learnBackground();
  else if (k === 'b') { P.map.blackout = !P.map.blackout; UI.refresh('proyeccion'); }
  else if (k === 'x') clearFeedback();
  else if (k === 'v') rotateCameras();
  else if (k === 'r') { Rec.toggle({ maxWidth:Rec.maxW || 3840 }); setTimeout(() => UI.refresh('proyeccion'), 100); }
  else if (k === 'm') { Audio_.setSource(P.audio.source === 'mic' ? 'off' : 'mic'); toast(P.audio.source === 'mic' ? 'micrófono encendido' : 'micrófono apagado'); }
  else if (k === 'g') Sessions.export(false);
  else if (k === 'l') $('jsonInput').click();
  else if (/^[0-9]$/.test(k)) { const t = PLANTILLAS.find(p => p.key === k); if (t) applyPlantilla(t.id); }
});
document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('is-fullscreen', !!document.fullscreenElement); notifySlidesFullscreen(); });

/* ---------- diapositivas (presentacion-scramble.html en un iframe) ---------- */
const slidesOverlay = $('slides-overlay'), slidesFrame = $('slides-frame'); let inPerformance = false;
function showSlidesOverlay(advance = false){ slidesOverlay.classList.remove('hidden'); track.pause(); slidesFrame.contentWindow?.postMessage({ type:'resume-slides', advance }, '*'); slidesFrame.focus(); }
function hideSlidesOverlay(){ slidesOverlay.classList.add('hidden'); window.focus(); }
function toggleParentFullscreen(){ if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else document.documentElement.requestFullscreen?.().catch(() => {}); }
function notifySlidesFullscreen(){ try { slidesFrame.contentWindow?.postMessage({ type:'fullscreen-changed', isFullscreen:!!document.fullscreenElement }, '*'); } catch (e) {} if (!slidesOverlay.classList.contains('hidden')) slidesFrame.focus(); }
slidesFrame.addEventListener('load', notifySlidesFullscreen);
window.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'start-performance') { inPerformance = true; hideSlidesOverlay();
    if (e.data.escena) applyPlantilla(ESCENA_ALIAS[e.data.escena] || e.data.escena, { silent:true });
    if (e.data.sesion && Sessions.get(e.data.sesion)) Sessions.load(e.data.sesion);
    if (e.data.audio) { Playlist.fromUrlParam(e.data.audio); Playlist.play(); } }
  else if (e.data.type === 'toggle-fullscreen') toggleParentFullscreen();
  else if (e.data.type === 'close-slides') hideSlidesOverlay();
});
function closeEmbedOrReturn(){
  if (inIframe) { try { window.parent.postMessage({ type:'flat-embed-close' }, '*'); } catch (e) {} return; }
  if (returnUrl) { location.href = returnUrl; return; }
  if (inPerformance) { inPerformance = false; showSlidesOverlay(true); } else showSlidesOverlay(false);
}

/* ---------- inicio ---------- */
fillGate(); layoutStage();
if (audioParam || presetParam || inIframe) { setTimeout(() => start(false), 50); }   // lanzado desde la presentación: arranca solo
