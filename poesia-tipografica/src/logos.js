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
  // logo oscuro sobre fondo claro → en monocromo, la tinta es lo que se ve
  for (let o = 0; o < d.length; o += 4) {
    let a = d[o + 3] / 255;
    if (opaque) {
      const dist = Math.hypot(d[o] - bg[0], d[o + 1] - bg[1], d[o + 2] - bg[2]);
      a *= Math.min(1, Math.max(0, (dist - 24) / 56));
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
