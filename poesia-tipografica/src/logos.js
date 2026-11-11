import { frameRect, frontWall } from './frame.js';
import { nextFrame } from './ticker.js';
// ─────────────────────────────────────────────────────────────────────────────
//  logos.js — Paso de loop «logos»: cualquier cantidad de logos en una grilla
//  que se adapta sola.
//
//  · Limpieza: si el logo tiene fondo opaco (JPG, PNG sin transparencia) el fondo
//    se vuelve transparente por distancia de color a las esquinas.
//  · Monocromo: opcionalmente todos los logos pasan a silueta hueso #F4F1EA, para
//    que convivan con la estética de la sala sin chocar colores corporativos.
//  · Grilla: se prueban todas las combinaciones filas × columnas y se elige la que
//    da a cada logo el mayor tamaño posible. Cada logo se dimensiona por ÁREA
//    visual (no por caja), así uno apaisado y uno cuadrado pesan parecido.
//  · Paginación: más de `porPagina` logos se reparten en varias pantallas.
// ─────────────────────────────────────────────────────────────────────────────

const BONE = [244, 241, 234];
const lum = (d, o) => (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255;

/** Imagen → canvas con fondo transparente (y opcionalmente silueta monocroma). */
export function processLogo(img, { monocromo = true, maxSide = 900 } = {}) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const sc = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * sc)), h = Math.max(1, Math.round(h0 * sc));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
  const opaque = corners.every((o) => d[o + 3] > 200);
  const bg = [0, 1, 2].map((c) => corners.reduce((a, o) => a + d[o + c], 0) / 4);
  // logo transparente (versión para fondo oscuro): en monocromo, la intensidad sigue al brillo del
  // logo; así lo claro queda hueso y lo oscuro (texto sobre placas, detalles) se lee calado,
  // en lugar de una silueta llena. Se normaliza al punto más claro: un logo todo gris oscuro no se apaga.
  // Logo oscuro sobre transparente (hecho para fondo claro: texto negro, tinta gris oscura): se invierte, así la
  // tinta es lo que se enciende. Se decide por el brillo medio de lo opaco.
  let lumMax = 0, dark = false;
  if (monocromo && !opaque) {
    let sum = 0, n = 0;
    for (let o = 0; o < d.length; o += 4) if (d[o + 3] > 128) {
      sum += lum(d, o);
      n++;
    }
    dark = n > 0 && sum / n < 0.45;
    for (let o = 0; o < d.length; o += 4) if (d[o + 3] > 128) lumMax = Math.max(lumMax, dark ? 1 - lum(d, o) : lum(d, o));
  }
  // logo oscuro sobre fondo claro → en monocromo, la tinta es lo que se ve
  for (let o = 0; o < d.length; o += 4) {
    let a = d[o + 3] / 255;
    if (opaque) {
      const dist = Math.hypot(d[o] - bg[0], d[o + 1] - bg[1], d[o + 2] - bg[2]);
      a *= Math.min(1, Math.max(0, (dist - 24) / 56));
    } else if (lumMax > 0) {
      const l = dark ? 1 - lum(d, o) : lum(d, o);
      a *= Math.min(1, Math.max(0, (l / lumMax - 0.18) / 0.5));
    }
    if (monocromo) {
      d[o] = BONE[0];
      d[o + 1] = BONE[1];
      d[o + 2] = BONE[2];
    }
    d[o + 3] = Math.round(a * 255);
  }
  ctx.putImageData(im, 0, 0);
  return trim(cv);
}

/** Recorta los márgenes transparentes (los logos suelen venir con aire desparejo). */
function trim(cv) {
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = cv;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return cv;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/**
 * Grilla adaptativa.
 * @param aspects  ancho/alto de cada logo
 * @param W,H      área disponible
 * @returns rectángulos {x, y, w, h} (centrados en su celda; última fila centrada)
 */
export function layoutLogos(aspects, W, H, { gap = 0.22 } = {}) {
  const n = aspects.length;
  if (!n) return [];
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = W / cols, ch = H / rows;
    // área objetivo común: la mayor que entra en una celda para TODOS los logos
    let area = Infinity;
    for (const ar of aspects) {
      const maxW = cw * (1 - gap), maxH = ch * (1 - gap);
      // área máxima de un rectángulo de proporción ar dentro de maxW × maxH
      const fitW = Math.min(maxW, maxH * ar);
      area = Math.min(area, fitW * (fitW / ar));
    }
    // castigo leve a grillas muy alargadas para que se lea como composición
    const score = area * (1 - 0.04 * Math.abs(cols - rows));
    if (!best || score > best.score) best = { cols, rows, cw, ch, area, score };
  }
  const { cols, rows, cw, ch, area } = best;
  const rects = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const c = i - r * cols;
    const offset = ((cols - inRow) * cw) / 2; // centrar la última fila incompleta
    const ar = aspects[i];
    let w = Math.sqrt(area * ar), h = w / ar;
    const k = Math.min(1, (cw * (1 - gap)) / w, (ch * (1 - gap)) / h);
    w *= k;
    h *= k;
    rects.push({ x: offset + c * cw + (cw - w) / 2, y: r * ch + (ch - h) / 2, w, h });
  }
  // centrar verticalmente el bloque completo
  return rects;
}

/** Reparte en páginas de hasta `porPagina` (equilibradas: 10 con máx. 8 → 5 + 5). */
export function paginate(items, porPagina = 8) {
  const per = Math.max(1, porPagina | 0);
  const pages = Math.ceil(items.length / per);
  if (pages <= 1) return [items];
  const size = Math.ceil(items.length / pages);
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Compone una página de logos en un solo canvas (para formarla con letras / puntos). */
export function composeLogos(canvases, W = 1600, H = 900) {
  const rects = layoutLogos(canvases.map((c) => c.width / c.height), W, H);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  canvases.forEach((c, i) => ctx.drawImage(c, rects[i].x, rects[i].y, rects[i].w, rects[i].h));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//  LogoStage: un lienzo de pantalla completa para los logos, con transición de
//  glitch entre una página (o un logo) y la siguiente: cortes horizontales,
//  separación de color rojo/cian y bloques desplazados. El negro sigue negro.
// ─────────────────────────────────────────────────────────────────────────────
export class LogoStage {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'logostage';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.cur = null; // buffer de la página visible
    this.anim = 0;
    this.visible = false;
    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
      if (this.cur && this.page) this.cur = this._render(this.page);
      if (!this.anim && this.cur) this._blit(this.cur);
    });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = frameRect();
    this.canvas.width = Math.round(r.w * dpr);
    this.canvas.height = Math.round(r.h * dpr);
  }

  _render(page) {
    const W = this.canvas.width, H = this.canvas.height;
    const buf = document.createElement('canvas');
    buf.width = W;
    buf.height = H;
    const g = buf.getContext('2d');
    const A = this.area || { w: 0.8, h: 0.62 }; // fracción de la pared de frente que ocupan los logos
    const F = frontWall(), fx0 = W * F.x0, fw = W * (F.x1 - F.x0);
    const aw = fw * A.w, ah = H * A.h;
    const rects = layoutLogos(page.map((c) => c.width / c.height), aw, ah);
    // dónde quedó cada uno, en px del lienzo (el título sólido se desarma desde ahí)
    this.rects = rects.map((r) => ({ x: fx0 + (fw - aw) / 2 + r.x, y: (H - ah) / 2 + r.y, w: r.w, h: r.h }));
    page.forEach((c, i) => g.drawImage(c, this.rects[i].x, this.rects[i].y, this.rects[i].w, this.rects[i].h));
    return buf;
  }

  _tint(buf, color) {
    const t = document.createElement('canvas');
    t.width = buf.width;
    t.height = buf.height;
    const g = t.getContext('2d');
    g.drawImage(buf, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, t.width, t.height);
    return t;
  }

  _blit(buf) {
    const { ctx, canvas } = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (buf) ctx.drawImage(buf, 0, 0);
  }

  /** Muestra una página de logos; si había otra, transición glitch. */
  show(page, { duration = 0.75, intensity = 1, area = null } = {}) {
    this.page = page;
    this.area = area;
    const next = this._render(page);
    const prev = this.cur;
    this.cur = next;
    this.visible = true;
    this.canvas.classList.add('on');
    this._transition(prev, next, duration, intensity);
  }

  /** Sale con glitch hacia negro. */
  hide({ duration = 0.5 } = {}) {
    if (!this.visible) return;
    this.visible = false;
    const prev = this.cur;
    this.cur = null;
    this.page = null;
    this._transition(prev, null, duration, 1, () => this.canvas.classList.remove('on'));
  }

  /**
   * Se desarma en letras: el sólido se borra celda por celda (cada celda, en su momento, pasa a ser una letra que
   * se suelta con glitch; las letras las pone el campo). Devuelve las celdas {x, y, at} en px del lienzo y segundos.
   */
  crumble({ cell = 20, secs = 1.6, cover = 0.55 } = {}) {
    if (!this.visible || !this.cur) return [];
    const W = this.canvas.width, H = this.canvas.height;
    const R = this.rects?.[0] || { x: 0, y: 0, w: W, h: H };
    const x0 = Math.max(0, Math.floor(R.x)), y0 = Math.max(0, Math.floor(R.y));
    const w = Math.min(W - x0, Math.ceil(R.w)), h = Math.min(H - y0, Math.ceil(R.h));
    if (w < 2 || h < 2) return [];
    const d = this.cur.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
    const cells = [];
    const c = Math.max(4, Math.round(cell));
    for (let cy = 0; cy < h; cy += c) {
      for (let cx = 0; cx < w; cx += c) {
        let on = 0, n = 0;
        for (let yy = cy + 1; yy < Math.min(h, cy + c); yy += 3) for (let xx = cx + 1; xx < Math.min(w, cx + c); xx += 3) {
          n++;
          if (d[(yy * w + xx) * 4 + 3] > 120) on++;
        }
        if (!on) continue;
        // barrido de izquierda a derecha con azar: el sólido se va soltando en letras
        const at = secs * (0.55 * (cx / w) + 0.45 * Math.random());
        cells.push({ x: x0 + cx, y: y0 + cy, s: c, at, letter: n > 0 && on / n >= cover });
      }
    }
    // el lienzo se va borrando en sincronía con las letras
    const buf = document.createElement('canvas');
    buf.width = W;
    buf.height = H;
    const g = buf.getContext('2d');
    g.drawImage(this.cur, 0, 0);
    const order = [...cells].sort((a, b) => a.at - b.at);
    const tok = (this.animTok = (this.animTok || 0) + 1);
    this.anim = tok;
    this.visible = false;
    this.cur = null;
    this.page = null;
    const t0 = performance.now();
    let k = 0;
    const step = () => {
      if (tok !== this.animTok) return;
      const e = (performance.now() - t0) / 1000;
      while (k < order.length && order[k].at <= e) {
        const q = order[k++];
        g.clearRect(q.x - 1, q.y - 1, q.s + 2, q.s + 2);
      }
      this._blit(buf);
      if (k < order.length) nextFrame(step);
      else {
        this.anim = 0;
        this._blit(null);
        this.canvas.classList.remove('on');
      }
    };
    nextFrame(step);
    return cells;
  }

  _transition(prev, next, duration, intensity, done) {
    const tok = (this.animTok = (this.animTok || 0) + 1); // una transición nueva corta la anterior
    this.anim = tok;
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    // separación de color con la paleta FLAT: rosa y lila «Ciclo Refracción»
    const [ca, cb] = this.colors || ['#ff9898', '#9999ff'];
    const layers = [prev, next].map((b) => (b ? { b, r: this._tint(b, ca), c: this._tint(b, cb) } : null));
    const t0 = performance.now();
    let lastShuffle = 0, slices = [];
    const step = () => {
      if (tok !== this.animTok) return;
      const now = performance.now();
      const p = Math.min(1, (now - t0) / (duration * 1000));
      const chaos = Math.sin(Math.PI * p) * intensity; // máximo a mitad de la transición
      if (now - lastShuffle > 45) {
        // nueva disposición de cortes cada ~3 frames (salto digital, no fundido)
        lastShuffle = now;
        slices = [];
        let y = 0;
        while (y < H) {
          const h = Math.max(2, Math.round((Math.random() ** 2) * H * 0.09));
          slices.push({ y, h, dx: (Math.random() - 0.5) * W * 0.18 * chaos * (Math.random() < 0.35 ? 2.2 : 1), src: Math.random() < p ? 1 : 0, split: Math.random() < 0.6 });
          y += h;
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (const s of slices) {
        const L = layers[s.src] || layers[1 - s.src];
        if (!L) continue;
        const sep = s.split ? W * 0.012 * chaos : 0;
        if (sep) {
          ctx.drawImage(L.r, 0, s.y, W, s.h, s.dx + sep, s.y, W, s.h);
          ctx.drawImage(L.c, 0, s.y, W, s.h, s.dx - sep, s.y, W, s.h);
        } else {
          ctx.drawImage(L.b, 0, s.y, W, s.h, s.dx, s.y, W, s.h);
        }
      }
      // bloques sueltos (datamosh) a mitad de la transición
      if (chaos > 0.4) {
        for (let k = 0; k < 6; k++) {
          const L = layers[Math.random() < p ? 1 : 0];
          if (!L) continue;
          const bw = W * (0.05 + Math.random() * 0.25), bh = H * (0.01 + Math.random() * 0.05);
          const sx = Math.random() * (W - bw), sy = Math.random() * (H - bh);
          ctx.drawImage(L.b, sx, sy, bw, bh, sx + (Math.random() - 0.5) * W * 0.2, sy, bw, bh);
        }
      }
      if (p < 1) nextFrame(step);
      else {
        this.anim = 0;
        this._blit(next);
        done?.();
      }
    };
    nextFrame(step); // con la ventana oculta (Alt+Tab) la transición también termina
  }
}

/**
 * Título sólido con la tipografía de FLAT (la de marca cargada en el panel C o Geist Mono Bold, la de títulos del
 * manual), en hueso como los logos. Se parte en renglones según la proporción del lugar donde va.
 */
export function solidTitle(text, { aspect = 4, upper = true } = {}) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  const str = upper ? t.toUpperCase() : t;
  const words = str.split(' ');
  const PX = 480; // rasterizado grande: en 8400 × 690 el título ocupa ~1500 px y no se agranda (no se pixela)
  const font = `700 ${PX}px "Marca FLAT", "Geist Mono", "IBM Plex Mono", monospace`;
  const m = document.createElement('canvas').getContext('2d');
  m.font = font;
  const wOf = (s) => m.measureText(s).width;
  const lineH = PX * 1.04;
  // renglones parejos: se prueba de 1 a 4 y gana el que, ajustado a la proporción, queda más grande
  let best = null;
  for (let n = 1; n <= Math.min(4, words.length); n++) {
    const target = wOf(str) / n;
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && wOf(next) > target * 1.08 && lines.length < n - 1) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    lines.push(cur);
    const bw = Math.max(...lines.map(wOf)), bh = lines.length * lineH;
    const scale = Math.min(aspect / bw, 1 / bh); // tamaño relativo dentro de una caja de aspect × 1
    if (!best || scale > best.scale * 1.02) best = { lines, bw, bh, scale };
  }
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(best.bw + PX * 0.1);
  cv.height = Math.ceil(best.bh + PX * 0.1);
  const g = cv.getContext('2d');
  g.font = font;
  g.fillStyle = `rgb(${BONE.join(',')})`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  best.lines.forEach((l, i) => g.fillText(l, cv.width / 2, PX * 0.05 + lineH * (i + 0.5)));
  return trim(cv);
}
