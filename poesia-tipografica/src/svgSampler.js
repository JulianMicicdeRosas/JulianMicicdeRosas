// ─────────────────────────────────────────────────────────────────────────────
//  svgSampler.js — De SVG path a nube de puntos objetivo para un caligrama.
//
//  1. Rasteriza las capas en un canvas oculto 512×512 (encuadre automático
//     a partir del getBBox real, así toleramos cualquier viewBox del LLM).
//  2. Interior: máscara → desenfoque profundo → normal → luz rasante. Se obtiene
//     una luminancia volumétrica y se muestrea en retícula hexagonal (halftone).
//  3. Contorno: se recorre cada path con getPointAtLength (polilíneas ordenadas,
//     con su longitud acumulada), para que las palabras se lean siguiendo el trazo.
//  4. Perfil superior por columna (obstáculo para la lluvia de letras).
// ─────────────────────────────────────────────────────────────────────────────

export const RES = 512;
const NS = 'http://www.w3.org/2000/svg';
const PATH_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;
let host = null;

function svgHost() {
  if (host) return host;
  host = document.createElementNS(NS, 'svg');
  host.setAttribute('width', '512');
  host.setAttribute('height', '512');
  host.setAttribute('viewBox', '0 0 512 512');
  // Debe estar en el DOM y "renderizado" para que getBBox funcione; invisible y fuera de pantalla.
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', pointerEvents: 'none' });
  document.body.appendChild(host);
  return host;
}

export function isValidPath(d) {
  if (typeof d !== 'string') return false;
  const s = d.trim();
  if (s.length < 6 || s.length > 12000 || !PATH_RE.test(s) || !/^[Mm]/.test(s)) return false;
  return (s.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || []).length >= 6;
}

/** Desenfoque de caja separable (n pasadas ≈ gaussiano). */
function boxBlur(src, w, r, passes) {
  let a = Float32Array.from(src);
  let b = new Float32Array(a.length);
  const norm = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < w; y++) {
      const row = y * w;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc * norm;
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(w - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < w; y++) {
        a[y * w + x] = acc * norm;
        acc += b[Math.min(w - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

let canvas = null;
function rasterCanvas() {
  if (!canvas) {
    canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(RES, RES) : Object.assign(document.createElement('canvas'), { width: RES, height: RES });
  }
  return canvas;
}

/**
 * @param {Array<{d:string, op?:'fill'|'cut'|'stroke', width?:number}>} layers
 * @param {{interiorTarget?:number}} opts
 * @returns figura muestreada o null si el dibujo no es utilizable
 */
export function sampleFigure(layers, { interiorTarget = 5000 } = {}) {
  const valid = (layers || []).filter((l) => l && isValidPath(l.d)).slice(0, 24);
  if (!valid.length) return null;
  const svg = svgHost();
  const els = valid.map((l) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', l.d.trim());
    svg.appendChild(p);
    return p;
  });

  try {
    // ── encuadre ────────────────────────────────────────────────────────
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    els.forEach((el, i) => {
      let bb;
      try {
        bb = el.getBBox();
      } catch {
        return;
      }
      if (!bb || !isFinite(bb.x) || !isFinite(bb.width)) return;
      const pad = valid[i].op === 'stroke' ? (valid[i].width || 12) / 2 : 0;
      minX = Math.min(minX, bb.x - pad);
      minY = Math.min(minY, bb.y - pad);
      maxX = Math.max(maxX, bb.x + bb.width + pad);
      maxY = Math.max(maxY, bb.y + bb.height + pad);
    });
    const bw = maxX - minX, bh = maxY - minY;
    if (!isFinite(bw) || !isFinite(bh) || Math.max(bw, bh) < 1) return null;
    const scale = (RES * 0.9) / Math.max(bw, bh);
    const ox = RES / 2 - (minX + bw / 2) * scale;
    const oy = RES / 2 - (minY + bh / 2) * scale;

    // ── rasterizado ─────────────────────────────────────────────────────
    const cv = rasterCanvas();
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, RES, RES);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const l of valid) {
      let p;
      try {
        p = new Path2D(l.d);
      } catch {
        continue;
      }
      const op = l.op || 'fill';
      ctx.globalCompositeOperation = op === 'cut' ? 'destination-out' : 'source-over';
      if (op === 'stroke') {
        ctx.lineWidth = l.width || 12;
        ctx.stroke(p);
      } else {
        ctx.fill(p, 'nonzero');
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const img = ctx.getImageData(0, 0, RES, RES).data;
    const N = RES * RES;
    const mask = new Float32Array(N);
    let filled = 0, sx = 0, sy = 0;
    for (let i = 0; i < N; i++) {
      const a = img[i * 4 + 3] / 255;
      mask[i] = a;
      if (a > 0.5) {
        filled++;
        sx += i % RES;
        sy += (i / RES) | 0;
      }
    }
    const coverage = filled / N;
    if (coverage < 0.01 || coverage > 0.88) return null; // garabato o rectángulo lleno: no sirve

    // ── luz volumétrica ─────────────────────────────────────────────────
    const soft = boxBlur(mask, RES, 2, 2);
    const deep = boxBlur(mask, RES, 11, 3);
    const L = [-0.48, -0.62, 0.62]; // luz cenital-izquierda (canvas: y hacia abajo)
    const lum = new Float32Array(N);
    for (let y = 1; y < RES - 1; y++) {
      for (let x = 1; x < RES - 1; x++) {
        const i = y * RES + x;
        if (mask[i] < 0.5) continue;
        const gx = (deep[i + 1] - deep[i - 1]) * 9;
        const gy = (deep[i + RES] - deep[i - RES]) * 9;
        const inv = 1 / Math.hypot(gx, gy, 1);
        const lambert = Math.max(0, (-gx * L[0] - gy * L[1] + L[2]) * inv);
        lum[i] = Math.min(1, 0.12 + 0.5 * deep[i] * deep[i] + 0.6 * Math.pow(lambert, 1.4));
      }
    }

    // ── interior: retícula hexagonal (halftone tipográfico) ─────────────
    const spacing = Math.min(18, Math.max(3.2, Math.sqrt(filled / Math.max(200, interiorTarget))));
    const interior = [];
    let row = 0;
    for (let y = spacing / 2; y < RES; y += spacing * 0.866, row++) {
      const off = row % 2 ? spacing / 2 : 0;
      for (let x = off + spacing / 2; x < RES; x += spacing) {
        const jx = x + (Math.random() - 0.5) * spacing * 0.22;
        const jy = y + (Math.random() - 0.5) * spacing * 0.22;
        const ix = jx | 0, iy = jy | 0;
        if (ix < 0 || iy < 0 || ix >= RES || iy >= RES) continue;
        const i = iy * RES + ix;
        if (soft[i] > 0.9) interior.push(jx, jy, lum[i]);
      }
    }

    // ── contorno: polilíneas ordenadas a lo largo de los trazos ────────
    const polylines = [];
    const maxSamples = 9000;
    let budget = maxSamples;
    for (const el of els) {
      let total = 0;
      try {
        total = el.getTotalLength();
      } catch {
        continue;
      }
      if (!(total > 0) || budget <= 0) continue;
      const n = Math.max(2, Math.min(budget, Math.ceil((total * scale) / 1.5)));
      budget -= n;
      let xs = [], ys = [];
      let px = NaN, py = NaN;
      const flush = () => {
        if (xs.length >= 4) polylines.push(buildPolyline(xs, ys));
        xs = [];
        ys = [];
      };
      for (let k = 0; k <= n; k++) {
        const pt = el.getPointAtLength((k / n) * total);
        const cx = pt.x * scale + ox;
        const cy = pt.y * scale + oy;
        if (xs.length && Math.hypot(cx - px, cy - py) > 7) flush(); // salto entre sub-paths (M)
        xs.push(cx);
        ys.push(cy);
        px = cx;
        py = cy;
      }
      flush();
    }

    // ── perfil superior (para que la lluvia se acumule sobre la figura) ─
    const top = new Int16Array(RES).fill(-1);
    for (let x = 0; x < RES; x++) {
      for (let y = 0; y < RES; y++) {
        if (mask[y * RES + x] > 0.5) {
          top[x] = y;
          break;
        }
      }
    }

    return {
      res: RES,
      coverage,
      spacing,
      interior: Float32Array.from(interior),
      polylines,
      top,
      centroid: { x: sx / filled, y: sy / filled },
    };
  } finally {
    els.forEach((e) => e.remove());
  }
}

function buildPolyline(xs, ys) {
  const n = xs.length;
  const cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  return { xs: Float32Array.from(xs), ys: Float32Array.from(ys), cum, length: cum[n - 1] };
}

/** Punto y tangente a distancia `s` sobre la polilínea; `hint` acelera recorridos monótonos. */
export function pointAt(pl, s, hint = 0) {
  const { xs, ys, cum } = pl;
  let i = Math.max(0, Math.min(hint, cum.length - 2));
  while (i < cum.length - 2 && cum[i + 1] < s) i++;
  while (i > 0 && cum[i] > s) i--;
  const seg = cum[i + 1] - cum[i] || 1;
  const t = Math.min(1, Math.max(0, (s - cum[i]) / seg));
  const x = xs[i] + (xs[i + 1] - xs[i]) * t;
  const y = ys[i] + (ys[i + 1] - ys[i]) * t;
  // tangente suavizada sobre una ventana de ±3 muestras
  const a = Math.max(0, i - 3), b = Math.min(cum.length - 1, i + 4);
  return { x, y, tx: xs[b] - xs[a], ty: ys[b] - ys[a], index: i };
}
