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
    if (f.sparse.length > 1) {
      g.lineWidth = px;
      g.strokeStyle = `rgba(220,220,220,${f.sparse.length > 40 ? 0.12 : 0.22})`; // con muchas palabras, líneas más tenues
      g.beginPath();
      // una línea por párrafo: las palabras de cada párrafo arman su figura
      f.sparse.forEach((w, k) => (k && f.sparse[k - 1].para === w.para ? g.lineTo(this.sx(w.x), this.sy(w.y)) : g.moveTo(this.sx(w.x), this.sy(w.y))));
      g.stroke();
      g.fillStyle = 'rgba(255,152,152,0.9)'; // un punto de marca en cada nodo
      for (const w of f.sparse) g.fillRect(this.sx(w.x) - px * 1.5, this.sy(w.y) - px * 1.5, px * 3, px * 3);
    }
  }
}
