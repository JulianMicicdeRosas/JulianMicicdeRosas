// ─────────────────────────────────────────────────────────────────────────────
//  overlay.js — Líneas finas sobre el muro (canvas 2D, mismo cuadro de salida):
//  · fragmentos: el contorno del bloque, una trama de puntos en los salpicados,
//    líneas que se prolongan hacia el borde y dos verticales rojas de la grilla.
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
    this.reds = null;
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
    const g = this.g, f = this.field, B = f.backdrop, W = this.canvas.width, H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    const px = this.dpr;
    // ── fragmentos del muro ──
    if (B && f.backdropOn && f.frags.length) {
      if (!this.reds || this.reds.cols !== B.colsN) {
        // dos verticales rojas sobre líneas de la grilla modular (fijas durante el muro)
        const { mc } = f._module();
        const n = Math.max(2, Math.floor(B.colsN / mc));
        const a = 1 + Math.floor(Math.random() * (n - 2)), b = Math.min(n - 1, a + 1 + Math.floor(Math.random() * 2));
        this.reds = { cols: B.colsN, xs: [a * mc, b * mc] };
      }
      const cellX = (c) => this.sx(B.x0 + c * B.cw), cellY = (r) => this.sy(B.top - r * B.rh);
      g.lineWidth = px;
      for (const fr of f.frags) {
        const age = t - fr.born, left = fr.until - t;
        // aparece y se va con parpadeo (glitch)
        const flick = age < 0.45 || left < 0.35 ? (Math.random() < 0.5 ? 0.15 : 1) : 1;
        const x0 = cellX(fr.c0), x1 = cellX(fr.c0 + fr.w), y0 = cellY(fr.r0), y1 = cellY(fr.r0 + fr.h);
        if (fr.mode === 'gris') {
          // bloque gris pleno (sin letras), cada uno con su valor
          g.fillStyle = `rgba(150,150,150,${(0.14 + ((fr.seed * 7) % 1) * 0.28) * flick})`;
          g.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
        g.strokeStyle = `rgba(220,220,220,${0.32 * flick})`;
        g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
        if (fr.mode === 'mancha') {
          // trama de puntos sobre el bloque
          g.fillStyle = `rgba(235,235,235,${0.5 * flick})`;
          const step = Math.max(2, Math.round((x1 - x0) / 14));
          for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) g.fillRect(x, y, px * 1.4, px * 1.4);
        }
        if (fr.mode === 'vacio' && (fr.seed | 0) % 3 === 0) {
          // una línea que se prolonga desde el bloque hacia el borde
          g.strokeStyle = `rgba(200,200,200,${0.16 * flick})`;
          g.beginPath();
          const yy = (fr.seed | 0) % 2 ? y0 : y1;
          g.moveTo((fr.seed | 0) % 2 ? 0 : x0, yy + 0.5);
          g.lineTo((fr.seed | 0) % 2 ? x1 : W, yy + 0.5);
          g.stroke();
        }
      }
      g.strokeStyle = 'rgba(214,40,40,0.75)';
      for (const c of this.reds.xs) {
        const x = Math.round(cellX(c)) + 0.5;
        g.beginPath();
        g.moveTo(x, cellY(0));
        g.lineTo(x, cellY(B.rowsN));
        g.stroke();
      }
    } else if (!f.frags.length) this.reds = null;
    // ── tecla 0: la figura que arman las palabras ──
    if (f.sparse.length > 1) {
      g.lineWidth = px;
      g.strokeStyle = 'rgba(220,220,220,0.22)';
      g.beginPath();
      f.sparse.forEach((w, k) => (k ? g.lineTo(this.sx(w.x), this.sy(w.y)) : g.moveTo(this.sx(w.x), this.sy(w.y))));
      g.stroke();
      g.fillStyle = 'rgba(255,152,152,0.9)'; // un punto de marca en cada nodo
      for (const w of f.sparse) g.fillRect(this.sx(w.x) - px * 1.5, this.sy(w.y) - px * 1.5, px * 3, px * 3);
    }
  }
}
