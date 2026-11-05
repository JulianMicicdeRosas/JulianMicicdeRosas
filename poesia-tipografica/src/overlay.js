// ─────────────────────────────────────────────────────────────────────────────
//  overlay.js — Líneas finas sobre el muro (canvas 2D, mismo cuadro de salida):
//  · tecla 0: las líneas que unen las pocas palabras (la figura que arman).
//  Coordenadas del mundo (plano z = 0) → píxeles: la cámara encuadra field.W × field.H.
// ─────────────────────────────────────────────────────────────────────────────
import { frameRect } from './frame.js';

export class Overlay {
  constructor(field) {
    this.field = field;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'overlay-lines';
    document.body.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const r = frameRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.w * dpr);
    this.canvas.height = Math.round(r.h * dpr);
    this.dpr = dpr;
  }

  sx(x) {
    return (x / this.field.W + 0.5) * this.canvas.width;
  }

  sy(y) {
    return (0.5 - y / this.field.H) * this.canvas.height;
  }

  draw(t) {
    const g = this.g, f = this.field, W = this.canvas.width, H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    const px = this.dpr;
    // ── tecla 0: la figura que arman las palabras ──
    const modo = f.sparseCfg?.lineas || 'figura';
    if (f.sparse.length > 1 && modo !== 'no') {
      const gain = Math.min(3, f.gainPalabras ?? 1); // el brillo de las palabras también lleva sus líneas
      g.lineWidth = px * 1.2;
      g.strokeStyle = `rgba(220,220,220,${Math.min(1, (f.sparse.length > 40 ? 0.12 : 0.22) * gain)})`; // con muchas palabras, líneas más tenues
      g.beginPath();
      // una línea por figura (cada una entera en una pared: nunca cruzan una esquina); con «oración», además se corta
      // donde termina cada oración: sólo se unen las palabras que la construyen
      const joined = (a, b) => a.para === b.para && a.fig === b.fig && (modo !== 'oracion' || a.sent === b.sent);
      f.sparse.forEach((w, k) => (k && joined(f.sparse[k - 1], w) ? g.lineTo(this.sx(w.x), this.sy(w.y)) : g.moveTo(this.sx(w.x), this.sy(w.y))));
      g.stroke();
      g.fillStyle = `rgba(255,152,152,${Math.min(1, 0.9 * gain)})`; // un punto de marca en cada nodo
      for (const w of f.sparse) g.fillRect(this.sx(w.x) - px * 1.5, this.sy(w.y) - px * 1.5, px * 3, px * 3);
    }
  }
}
