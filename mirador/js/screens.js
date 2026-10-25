"use strict";
/* =====================================================================
   MIRADOR — pantallas múltiples por ventanas (opción B)
   La opción A (recomendada para 7 proyectores) es UNA ventana que cruza
   todo el escritorio extendido con el formato 13440×1080 (ver lanzadores).
   Esta opción B usa la Window Management API de Chrome/Edge: la salida
   se reparte en tiras, una por pantalla, cada una en una ventana propia.
   Requiere permiso de "gestión de ventanas" y pop-ups permitidos.
   ===================================================================== */
const SC = { details:null, list:[], order:[], enabled:false };
let multiMode = false, outs = [], virt = null;
function computeVirtual(){
  const scr = SC.order.map(i => SC.list[i]), hRef = Math.max(...scr.map(x => x.height));
  const ws = scr.map(x => x.width * hRef / x.height), tot = ws.reduce((a, b) => a + b, 0); let acc = 0;
  const fr = ws.map(w => { const a = acc / tot; acc += w; return [a, acc / tot]; });
  const cap = Math.min(1, MAX_TEX / tot);   // tope real del hardware, no 4096 fijo
  virt = { w:Math.round(tot * cap), h:Math.round(hRef * cap), fr };
}
async function detectScreens(){
  if (!('getScreenDetails' in window)) { toast('Este navegador no expone las pantallas (usá Chrome o Edge)', 3000); return; }
  try { SC.details = await window.getScreenDetails(); }
  catch (e) { toast('Permiso de pantallas denegado', 2500); return; }
  SC.list = [...SC.details.screens].sort((a, b) => a.left - b.left || a.top - b.top);
  SC.order = SC.list.map((_, i) => i);
  SC.details.addEventListener('screenschange', () => { if (SC.enabled) { SC.enabled = false; applyScreens(); } detectScreens(); });
  toast(SC.list.length > 1 ? `${SC.list.length} pantallas detectadas` : 'Solo hay una pantalla conectada');
  if (typeof UI !== 'undefined') UI.refresh('proyeccion');
}
function closeOutputs(){ outs.forEach(o => { try { if (o.win && !o.win.closed) o.win.close(); } catch (e) {} }); outs = []; }
function updateMainOut(){ const c = $('out'); c.width = Math.round(innerWidth * Math.min(devicePixelRatio || 1, 2)); c.height = Math.round(innerHeight * Math.min(devicePixelRatio || 1, 2)); }
function openOutputWindow(scr, k){
  const w = window.open('', `mirador-out-${k}`, `popup=yes,left=${scr.availLeft ?? scr.left},top=${scr.availTop ?? scr.top},width=${scr.availWidth ?? scr.width},height=${scr.availHeight ?? scr.height}`);
  if (!w) return null;
  w.document.open(); w.document.write('<!doctype html><title>Mirador · salida ' + (k + 1) + '</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden;cursor:none}canvas{width:100%;height:100%;display:block}</style><canvas id="c"></canvas>'); w.document.close();
  const goFS = () => { const el = w.document.documentElement; (el.requestFullscreen ? el.requestFullscreen({ screen:scr }).catch(() => el.requestFullscreen()) : 0); };
  w.document.addEventListener('dblclick', goFS); w.document.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') goFS(); });
  w.moveTo?.(scr.availLeft ?? scr.left, scr.availTop ?? scr.top);
  return w;
}
function applyScreens(){
  closeOutputs();
  if (!SC.enabled || SC.list.length < 2) { multiMode = false; virt = null; document.body.classList.remove('multi'); resize(); return; }
  multiMode = true; computeVirtual(); document.body.classList.add('multi');
  P.map.calibrate = false; uiCanvas.classList.remove('calibrating');   // esquinas y mosaico no aplican al reparto por ventanas
  resize(); updateMainOut();
  const cur = SC.details.currentScreen; let blocked = 0;
  SC.order.forEach((si, k) => { const scr = SC.list[si];
    if (scr === cur || (scr.left === cur.left && scr.top === cur.top)) { const c = $('out'); outs.push({ main:true, cv:c, ctx:c.getContext('2d'), fr:virt.fr[k] }); }
    else { const w = openOutputWindow(scr, k); if (!w) { blocked++; return; } const c = w.document.getElementById('c'); outs.push({ cv:c, ctx:c.getContext('2d'), win:w, fr:virt.fr[k] }); } });
  if (blocked) toast('El navegador bloqueó ventanas de salida: permití los pop-ups y volvé a aplicar', 4000);
  clearFeedback();
}
function pushOutputs(){
  if (!multiMode) return;
  for (const o of outs) {
    if (o.win) { if (o.win.closed) continue; const d = Math.min(o.win.devicePixelRatio || 1, 2), tw = Math.max(2, Math.round(o.win.innerWidth * d)), th = Math.max(2, Math.round(o.win.innerHeight * d));
      if (o.cv.width !== tw || o.cv.height !== th) { o.cv.width = tw; o.cv.height = th; } }
    o.ctx.drawImage(glCanvas, o.fr[0] * W, 0, (o.fr[1] - o.fr[0]) * W, H, 0, 0, o.cv.width, o.cv.height);
  }
}
addEventListener('beforeunload', closeOutputs);
