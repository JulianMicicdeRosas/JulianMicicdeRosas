"use strict";
/* =====================================================================
   MIRADOR — sincronizar la proyección con los cuerpos reales
   La cámara conectada mira la sala y la proyección. Para que lo que se
   proyecta caiga donde están los cuerpos, Mirador tiene que saber en qué
   lugar de la imagen de la cámara aparece cada parte del lienzo.

   Sincronización automática: se proyecta todo negro y, uno por uno, puntos
   blancos en posiciones conocidas de cada pared del lienzo. La cámara los
   busca (diferencia contra el negro), y con 4 o más puntos por pared se
   calcula la homografía pared ↔ cámara. De ahí salen las líneas de arriba
   y de abajo de la calibración (las mismas de la vista K), ahora medidas
   sobre la proyección real y no sobre una foto.

   Mientras corre: el panel, los avisos y las capas de ayuda se ocultan
   (se proyectan con la ventana), y la exposición y el balance de blancos
   de la cámara se fijan si el navegador lo permite. Esc cancela.
   ===================================================================== */
const Sync = {
  running:false, cancel:false, mark:null, overlay:false, overlayAlpha:.55, last:null,
  opts:{ cols:3, rows:2, radius:.045, wait:450 },
  cv:null, ctx:null,

  /* captura la cámara en pequeño y devuelve la luminancia */
  grab(src){
    const v = src.video, vw = v.videoWidth, vh = v.videoHeight, w = 480, h = Math.round(w * vh / vw);
    if (!this.cv) { this.cv = document.createElement('canvas'); this.ctx = this.cv.getContext('2d', { willReadFrequently:true }); }
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.ctx.drawImage(v, 0, 0, w, h); const d = this.ctx.getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
    for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = d[j] * .299 + d[j + 1] * .587 + d[j + 2] * .114;
    return { L, w, h };
  },
  async grabAvg(src, n = 2){ let acc = null, w, h; for (let i = 0; i < n; i++) { const g = this.grab(src); w = g.w; h = g.h; if (!acc) acc = g.L; else for (let k = 0; k < acc.length; k++) acc[k] += g.L[k]; if (i < n - 1) await this.sleep(70); }
    if (n > 1) for (let k = 0; k < acc.length; k++) acc[k] /= n; return { L:acc, w, h }; },
  sleep(ms){ return new Promise(r => setTimeout(r, ms)); },
  frame(){ return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); },

  /* busca el punto: lo que se encendió respecto del negro. Devuelve {x,y} en fracción de la imagen, o null */
  find(on, off){
    const { w, h } = on, D = new Float32Array(w * h); let max = 0;
    for (let i = 0; i < D.length; i++) { const d = on.L[i] - off.L[i]; D[i] = d > 0 ? d : 0; }
    // suavizado 3×3 para que un píxel suelto no gane
    const S = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { let a = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) a += D[(y + j) * w + x + i]; S[y * w + x] = a / 9; if (S[y * w + x] > max) max = S[y * w + x]; }
    if (max < 22) return null;
    const thr = Math.max(14, max * .5); let sx = 0, sy = 0, sw = 0, n = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = S[y * w + x]; if (v < thr) continue; const k = v - thr; sx += x * k; sy += y * k; sw += k; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (!sw || n > w * h * .08) return null;                                      // demasiado grande: cambió la luz, no es el punto
    if ((x1 - x0) > w * .35 || (y1 - y0) > h * .35) return null;                  // disperso: alguien se movió o hubo un reflejo
    return { x:(sx / sw + .5) / w, y:(sy / sw + .5) / h, peak:max, area:n };
  },

  /* homografía por mínimos cuadrados (N ≥ 4), de src a dst */
  fitH(src, dst){
    const A = Array.from({ length:8 }, () => new Array(8).fill(0)), b = new Array(8).fill(0);
    const add = (row, val) => { for (let i = 0; i < 8; i++) { b[i] += row[i] * val; for (let j = 0; j < 8; j++) A[i][j] += row[i] * row[j]; } };
    for (let i = 0; i < src.length; i++) { const { x, y } = src[i], { x:u, y:v } = dst[i];
      add([x, y, 1, 0, 0, 0, -u * x, -u * y], u); add([0, 0, 0, x, y, 1, -v * x, -v * y], v); }
    const h = solveLinear(A, b); return h ? [...h, 1] : null;
  },
  fitWall(pairs){   // pairs: [{loc:{x,y}, cam:{x,y}}] → H (pared → cámara) y error
    if (pairs.length < 4) return null;
    let use = pairs, H = this.fitH(use.map(p => p.loc), use.map(p => p.cam)); if (!H) return null;
    const res = q => q.map(p => { const m = applyH(H, p.loc.x, p.loc.y); return Math.hypot(m.x - p.cam.x, m.y - p.cam.y); });
    if (use.length >= 6) { const r = res(use), med = [...r].sort((a, b) => a - b)[r.length >> 1]; const keep = use.filter((p, i) => r[i] <= Math.max(med * 3, .004));
      if (keep.length >= 4 && keep.length < use.length) { const H2 = this.fitH(keep.map(p => p.loc), keep.map(p => p.cam)); if (H2) { H = H2; use = keep; } } }
    const r = res(use); return { H, err:r.reduce((a, v) => a + v, 0) / r.length, n:use.length };
  },

  /* tramos del lienzo a sincronizar: las paredes, o el lienzo entero */
  segments(){ const ws = wallRanges(); return ws.length ? ws : [{ nombre:'lienzo', u0:0, u1:1, w:outputSize().w }]; },

  async run(src){
    if (this.running) return;
    src = src || sources[Calib.zone] || sources[0];
    if (!src || simMode || !src.stream) { toast('Sincronizar necesita la cámara encendida (no la simulación).', 5000); return; }
    if (src.video.readyState < 2) { toast('La cámara todavía no da imagen.', 4000); return; }
    const segs = this.segments(), { cols, rows } = this.opts, pts = [];
    segs.forEach((sg, wi) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lx = cols === 1 ? .5 : .1 + .8 * c / (cols - 1), ly = rows === 1 ? .5 : .16 + .68 * r / (rows - 1);
      pts.push({ wi, loc:{ x:lx, y:ly } }); } });
    // tomar control: todo lo de la ventana se proyecta, así que se oculta; se fija la exposición de la cámara
    const wasPanel = !document.body.classList.contains('panel-hidden'), wasCalib = Calib.on, wasOverlay = this.overlay;
    UI.togglePanel(false); if (Calib.on) Calib.toggle(false); this.overlay = false; document.body.classList.add('syncing');
    const restoreCam = await this.lockCamera(src);
    this.running = true; this.cancel = false; this.mark = null;
    const found = [];
    try {
      await this.frame(); await this.sleep(700);
      let off = await this.grabAvg(src, 3), k = 0;
      for (const p of pts) { if (this.cancel) break;
        const sg = segs[p.wi], r = this.opts.radius;
        this.mark = { x:sg.u0 + p.loc.x * (sg.u1 - sg.u0), y:p.loc.y, r };
        await this.frame(); await this.sleep(this.opts.wait);
        const on = await this.grabAvg(src, 2), hit = this.find(on, off);
        if (hit) found.push({ wi:p.wi, loc:p.loc, cam:{ x:hit.x, y:hit.y }, peak:hit.peak });
        this.mark = null; await this.frame();
        if (++k % 3 === 0) { await this.sleep(this.opts.wait * .6); off = await this.grabAvg(src, 2); }   // el negro de nuevo, por si la cámara se reajustó
      }
    } catch (e) { console.error(e); toast('Falló la sincronización: ' + e.message, 6000); }
    finally { this.running = false; this.mark = null; document.body.classList.remove('syncing'); await restoreCam(); }
    if (this.cancel) { toast('Sincronización cancelada.'); this.restoreUI(wasPanel, wasCalib, wasOverlay); return; }
    this.apply(src, segs, found);
    this.restoreUI(true, wasCalib, true);
    UI.show('sync');
  },
  restoreUI(panel, calib, overlay){ if (panel) UI.togglePanel(true); if (calib && !Calib.on) Calib.toggle(true); this.overlay = overlay; },

  /* congela exposición y balance de blancos durante la medición; devuelve cómo volver */
  async lockCamera(src){
    const t = camTrack(src); if (!t) return async () => {};
    const caps = camCaps(src), set = camSettings(src), lock = {}, back = {};
    for (const k of ['exposureMode', 'whiteBalanceMode', 'focusMode']) if (Array.isArray(caps[k]) && caps[k].includes('manual') && set[k] && set[k] !== 'manual') { lock[k] = 'manual'; back[k] = set[k]; }
    if (!Object.keys(lock).length) return async () => {};
    try { await t.applyConstraints({ advanced:[lock] }); } catch (e) { return async () => {}; }
    return async () => { try { await t.applyConstraints({ advanced:[back] }); } catch (e) {} };
  },

  /* con los puntos encontrados arma las líneas de arriba y abajo de cada pared */
  apply(src, segs, found){
    const n = segs.length; let cal = normCal(src.cal || salaCal());
    if (cal.top.length !== n + 1) { cal.top = resampleLine(cal.top, n); cal.bottom = resampleLine(cal.bottom, n); cal.shares = new Array(n).fill(1); }
    const fits = segs.map((sg, wi) => this.fitWall(found.filter(f => f.wi === wi)));
    const per = this.opts.cols * this.opts.rows, report = segs.map((sg, wi) => ({ nombre:sg.nombre, vistos:found.filter(f => f.wi === wi).length, de:per, ok:!!fits[wi], err:fits[wi] ? fits[wi].err : null }));
    const okN = fits.filter(Boolean).length;
    this.last = { t:new Date().toISOString(), report, total:found.length, de:per * n, okN, n };
    if (!okN) { toast('La cámara no vio los puntos. Revisá que la cámara vea la proyección, bajá la luz de la sala y probá con puntos más grandes.', 9000); UI.refresh(); return; }
    const C = (wi, lx, ly) => { const f = fits[wi]; return f ? applyH(f.H, lx, ly) : null; };
    const mismatch = [];
    for (let i = 0; i <= n; i++) {
      for (const [line, ly] of [['top', 0], ['bottom', 1]]) {
        const c = [C(i - 1, 1, ly), C(i, 0, ly)].filter(Boolean);
        if (c.length === 2) mismatch.push(Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y));
        if (c.length) cal[line][i] = { x:c.reduce((a, p) => a + p.x, 0) / c.length, y:c.reduce((a, p) => a + p.y, 0) / c.length };
      }
    }
    cal.enabled = true; cal.useWalls = !!wallRanges().length;
    cal.synced = { t:this.last.t, okN, n, err:report.filter(r => r.err != null).map(r => r.err), view:{ zoom:P.view.zoom, x:P.view.x, y:P.view.y }, corners:deepClone(corners) };
    this.last.mismatch = mismatch.length ? Math.max(...mismatch) : 0;
    src.cal = cal; src.mirror = false; calPrepare(src); clearFeedback(); Sessions.touch();
    const vw = src.video.videoWidth || 1280, errPx = Math.max(0, ...report.filter(r => r.err != null).map(r => r.err)) * vw;
    toast(`Sincronizado: ${okN} de ${n} ${n === 1 ? 'tramo' : 'paredes'} · ${found.length}/${per * n} puntos · error ${errPx.toFixed(1)} px de cámara. Verificá con la cámara superpuesta (S).`, 8000);
  },
  /* el zoom, el corrimiento o las esquinas cambiaron después de sincronizar */
  stale(src){ const s = src?.cal?.synced; if (!s) return false; const v = s.view || {}; return Math.abs((v.zoom ?? 1) - P.view.zoom) > .001 || Math.abs((v.x || 0) - P.view.x) > .001 || Math.abs((v.y || 0) - P.view.y) > .001 || JSON.stringify(s.corners || corners) !== JSON.stringify(corners); },
};
function resampleLine(line, n){ const old = line.length - 1, out = []; for (let i = 0; i <= n; i++) { const t = i / n * old, k = Math.min(old - 1, Math.floor(t)), f = t - k, a = line[k], b = line[k + 1] || a; out.push({ x:a.x + (b.x - a.x) * f, y:a.y + (b.y - a.y) * f }); } return out; }
addEventListener('keydown', e => { if (Sync.running && e.key === 'Escape') { Sync.cancel = true; e.stopImmediatePropagation(); } }, true);
