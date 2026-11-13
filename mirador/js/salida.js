"use strict";
/* =====================================================================
   MIRADOR — dos ventanas: CONTROL y SALIDA
   La ventana de control (esta) corre todo: cámara, detección, efectos y
   panel. La ventana de SALIDA solo muestra la imagen final, sin panel,
   avisos ni capas de ayuda: es la que captura OBS (título distinto:
   "Mirador · SALIDA"). La imagen pasa por captureStream del canvas GL
   (sin copias por CPU); si el navegador no lo tiene, se copia cuadro a
   cuadro. Las teclas apretadas en la salida llegan al control.
   ?ventanas=2 la abre sola al encender (los lanzadores la piden).
   ===================================================================== */
const Salida = { win:null, video:null, stream:null, cv:null, ctx:null, mode:'', NAME:'mirador-salida', STREAM_MAX:4096,
  want:urlParams.get('ventanas') === '2',
  open(){
    // window.open tiene que correr dentro del clic (o con los pop-ups permitidos, como en los lanzadores)
    let w = null;
    try { w = window.open('', this.NAME, 'popup=yes,width=1920,height=1080,left=40,top=40'); } catch (e) {}
    if (!w) { toast('El navegador bloqueó la ventana de salida: permití las ventanas emergentes para 127.0.0.1 y apretá O.', 7000); return false; }
    this.win = w; this.build(); return true;
  },
  build(){
    const w = this.win, d = w.document, fit = STRETCH ? 'fill' : 'contain';
    d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>Mirador · SALIDA</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;cursor:none}video,canvas{position:fixed;inset:0;width:100%;height:100%;object-fit:${fit};display:block;background:#000}
#m{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);color:#555;font:14px ui-monospace,monospace;text-align:center}</style></head>
<body><video id="v" autoplay muted playsinline></video><canvas id="c" hidden></canvas><div id="m">Mirador · salida<br>esperando imagen…</div></body></html>`); d.close();
    this.video = d.getElementById('v'); this.cv = d.getElementById('c'); this.ctx = null;
    // Con el lienzo muy ancho (sala: 8400 px) el video de captureStream queda en negro en la ventana (visto en la PC de la sala,
    // Chrome + RTX 3070 Ti): el flujo trae cuadros, pero el compositor no los muestra. Ahí se copia cuadro a cuadro.
    this.mode = '';
    if (glCanvas.captureStream && Math.max(glCanvas.width, glCanvas.height) <= this.STREAM_MAX) {
      try { if (!this.stream) this.stream = glCanvas.captureStream(60); this.video.srcObject = this.stream; this.mode = 'stream';
        this.video.play?.().catch(() => {}); this.video.addEventListener('playing', () => { const m = d.getElementById('m'); if (m) m.remove(); }, { once:true }); }
      catch (e) { this.mode = ''; } }
    if (this.mode !== 'stream') this.aCopia();
    // teclas en la salida → control (para no tener que cambiar de ventana)
    w.addEventListener('keydown', e => { if (e.key === 'F11') return; window.dispatchEvent(new KeyboardEvent('keydown', { key:e.key, shiftKey:e.shiftKey, altKey:e.altKey })); if (e.key === ' ') e.preventDefault(); });
    w.addEventListener('dblclick', () => { const el = d.documentElement; el.requestFullscreen?.().catch(() => {}); });
    w.addEventListener('beforeunload', () => setTimeout(() => { if (this.win && this.win.closed) { this.win = null; this.refresh(); } }, 300));
    document.body.classList.add('dos-ventanas'); this.refresh();
  },
  aCopia(){ if (!this.win || !this.cv) return; this.video.hidden = true; this.video.style.display = 'none'; try { this.video.srcObject = null; } catch (e) {}
    this.cv.hidden = false; this.ctx = this.cv.getContext('2d'); this.mode = 'copia'; this.win.document.getElementById('m')?.remove(); },
  isOpen(){ return !!(this.win && !this.win.closed); },
  close(){ try { this.win?.close(); } catch (e) {} this.win = null; document.body.classList.remove('dos-ventanas'); this.refresh(); },
  toggle(){ if (this.isOpen()) this.close(); else this.open(); },
  /* se llama después de cada cuadro (render) */
  frame(){
    if (!this.win) return;
    if (this.win.closed) { this.win = null; document.body.classList.remove('dos-ventanas'); this.refresh(); return; }
    // el lienzo toma su tamaño después de abrir la salida (al recargar se abre con el lienzo todavía chico): se revisa en cada cuadro
    if (this.mode === 'stream' && Math.max(glCanvas.width, glCanvas.height) > this.STREAM_MAX) this.aCopia();
    if (this.mode === 'copia' && this.ctx) { const d = Math.min(this.win.devicePixelRatio || 1, 2), tw = Math.max(2, Math.round(this.win.innerWidth * d)), th = Math.max(2, Math.round(this.win.innerHeight * d));
      if (this.cv.width !== tw || this.cv.height !== th) { this.cv.width = tw; this.cv.height = th; }
      if (STRETCH) this.ctx.drawImage(glCanvas, 0, 0, tw, th);
      else { const s = Math.min(tw / glCanvas.width, th / glCanvas.height), w = glCanvas.width * s, h = glCanvas.height * s; this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, tw, th); this.ctx.drawImage(glCanvas, (tw - w) / 2, (th - h) / 2, w, h); } }
    else if (this.mode === 'stream' && this.stream) { const tr = this.stream.getVideoTracks()[0]; if (tr && tr.requestFrame) tr.requestFrame(); }
  },
  refresh(){ if (typeof UI !== 'undefined') UI.refresh('proyeccion'); },
};
addEventListener('beforeunload', () => {   // al recargar (o si el guardián recupera), la salida queda abierta y se vuelve a enganchar
  try { if (Salida.isOpen()) { const d = Salida.win.document, m = d.createElement('div'); m.id = 'm'; m.textContent = 'Mirador se está recargando…'; m.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);color:#555;font:14px ui-monospace,monospace'; d.body.appendChild(m); } } catch (e) {}
});
