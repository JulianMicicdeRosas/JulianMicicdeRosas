// ─────────────────────────────────────────────────────────────────────────────
//  glyphAtlas.js — Atlas tipográfico dinámico en Canvas 2D.
//
//  Una grilla de celdas cuadradas (por defecto 2048² px, celdas de 128 px → 256
//  slots). Cada slot = (carácter, familia). El juego latino/español completo se
//  pre-rasteriza en ambas familias; cualquier carácter nuevo se dibuja al vuelo
//  y la textura se re-sube sólo en ese frame.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const FONTS = {
  serif: { family: '"Cormorant Garamond", "Bodoni Moda", "Bodoni 72", Georgia, serif', weight: 500, em: 0.72 },
  mono: { family: '"IBM Plex Mono", "JetBrains Mono", Consolas, monospace', weight: 400, em: 0.56 },
  // tipografía de marca (FLAT): se carga desde el panel C; hasta entonces usa la mono
  brand: { family: '"Marca FLAT", "IBM Plex Mono", Consolas, monospace', weight: 500, em: 0.6 },
};

// Rampa de densidad para el estilo ASCII (además de las letras del verso)
export const ASCII_SYMBOLS = '.,:;!*+=%$&08QgZS2a@#';

const PRESET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'áéíóúüñÁÉÍÓÚÜÑçÇàèìòù' +
  '0123456789' +
  '.,;:¡!¿?«»"\'()-—–…·|/*';

export class GlyphAtlas {
  constructor(renderer, { size = 2048, cell = 96 } = {}) {
    this.size = size;
    this.cell = cell;
    this.cols = Math.floor(size / cell);
    this.rows = this.cols;
    this.capacity = this.cols * this.rows;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.clearRect(0, 0, size, size);
    this.map = new Map();
    this.advance = new Float32Array(this.capacity); // avance horizontal / lado de celda
    this.ink = new Float32Array(this.capacity); // tinta (0..1) de cada glifo: rampa ASCII
    this.kindOf = [];
    this.charOf = [];
    this.next = 0;
    this.dirty = false;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.texture.colorSpace = THREE.NoColorSpace;

    for (const kind of ['serif', 'mono']) for (const ch of PRESET) this.slot(ch, kind);
    for (const ch of ASCII_SYMBOLS) this.slot(ch, 'mono');
    this.fallback = { serif: this.slot('·', 'serif'), mono: this.slot('·', 'mono') };
    this.flush();
  }

  /** Devuelve el índice de slot para (carácter, familia); lo rasteriza si es nuevo. */
  slot(ch, kind = 'serif') {
    const key = kind + ch;
    const hit = this.map.get(key);
    if (hit !== undefined) return hit;
    if (this.next >= this.capacity) return this.fallback ? this.fallback[kind] : 0;
    const s = this.next++;
    this.kindOf[s] = kind;
    this.charOf[s] = ch;
    this._draw(s, ch, kind);
    this.map.set(key, s);
    this.dirty = true;
    return s;
  }

  _draw(s, ch, kind) {
    const { ctx, cell } = this;
    const f = FONTS[kind];
    const px = Math.round(cell * f.em);
    const x = (s % this.cols) * cell;
    const y = Math.floor(s / this.cols) * cell;
    ctx.save();
    ctx.clearRect(x, y, cell, cell);
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, cell - 2, cell - 2); // 1 px de margen contra el sangrado de mipmaps
    ctx.clip();
    ctx.font = `${f.weight} ${px}px ${f.family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ch, x + cell / 2, y + cell * 0.7);
    ctx.restore();
    const pix = ctx.getImageData(x, y, cell, cell).data;
    let sum = 0;
    for (let i = 3; i < pix.length; i += 4) sum += pix[i];
    this.ink[s] = sum / (255 * cell * cell);
    ctx.font = `${f.weight} ${px}px ${f.family}`;
    this.advance[s] = Math.max(0.18, ctx.measureText(ch).width / cell);
  }

  /** Carga la tipografía de marca (url o data URL de .woff2/.ttf/.otf) y redibuja sus glifos. */
  async setBrandFont(src) {
    if (!src) return false;
    try {
      const face = new FontFace('Marca FLAT', `url(${src})`);
      await face.load();
      document.fonts.add(face);
      for (let s = 0; s < this.next; s++) if (this.kindOf[s] === 'brand') this._draw(s, this.charOf[s], 'brand');
      this.dirty = true;
      return true;
    } catch (e) {
      console.warn('[atlas] no pude cargar la tipografía de marca', e);
      return false;
    }
  }

  /** Ancho de avance (en unidades de "lado de quad") de un slot. */
  adv(s) {
    return this.advance[s];
  }

  flush() {
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }
}

/** Espera a que las fuentes empaquetadas (@fontsource) estén listas antes de rasterizar. */
export async function loadFonts() {
  if (!document.fonts) return;
  const probes = [
    `${FONTS.serif.weight} 64px "Cormorant Garamond"`,
    `${FONTS.mono.weight} 64px "IBM Plex Mono"`,
  ];
  try {
    await Promise.race([
      Promise.all(probes.map((p) => document.fonts.load(p, 'AaÁñ¿'))),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch (e) {
    console.warn('[atlas] fuentes no cargadas, uso las del sistema', e);
  }
}
