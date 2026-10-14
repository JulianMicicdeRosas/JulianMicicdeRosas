// ─────────────────────────────────────────────────────────────────────────────
//  treatments.js — De la imagen al muro de palabras.
//
//  1. composeFigure(formas): la composición del LLM (elipses, anillos, arcos, trazos,
//     polígonos con tono 0..1, sumando y restando) se dibuja en un lienzo 512² con grises.
//  2. figureToTone(fig): ese lienzo (o una máscara de emoji / SVG / biblioteca) pasa a
//     un campo de tonos con la resolución del muro (celdas 1 × 2).
//  3. treat(tone, …): un tratamiento gráfico lo vuelve dibujo — topografía, trama,
//     erosión, eco o silueta. Devuelve tono por celda (cuánto se enciende cada letra)
//     y acento (qué letras van en el color de la marca).
//
//  Todo es determinista a partir de una semilla: la re-proyección repite la misma imagen.
// ─────────────────────────────────────────────────────────────────────────────

export const TREATMENTS = ['topografia', 'trama', 'erosion', 'eco', 'silueta'];
const WEIGHTS = { topografia: 0.3, trama: 0.24, erosion: 0.2, eco: 0.14, silueta: 0.12 };
const R = 512;

/** Semilla estable de un texto (misma estrofa → misma imagen al re-proyectar). */
export function seedOf(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido de valor suave con octavas (fbm) en [0, 1]. */
function noise2(seed) {
  const r = rng(seed);
  const P = new Float32Array(512);
  for (let i = 0; i < 512; i++) P[i] = r();
  const h = (x, y) => P[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 512];
  const sm = (t) => t * t * (3 - 2 * t);
  const v = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y) => (v(x, y) * 0.55 + v(x * 2.03 + 7.1, y * 2.03 + 3.3) * 0.3 + v(x * 4.1 + 1.7, y * 4.1 + 9.2) * 0.15);
}

export function pickTreatment(seed) {
  const r = rng(seed ^ 0x9e3779b9)();
  let acc = 0;
  for (const k of TREATMENTS) {
    acc += WEIGHTS[k];
    if (r < acc) return k;
  }
  return 'topografia';
}

// ── 1. composición del LLM → lienzo con grises ──────────────────────────────
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

export function composeFigure(formas) {
  if (!Array.isArray(formas) || !formas.length) return null;
  const c = document.createElement('canvas');
  c.width = c.height = R;
  const g = c.getContext('2d', { willReadFrequently: true });
  const k = R / 100;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  let drawn = 0;
  for (const s of formas.slice(0, 60)) {
    if (!s || typeof s !== 'object') continue;
    const t = String(s.tipo || '').toLowerCase();
    const tono = Math.min(1, Math.max(0.08, num(s.tono, 1)));
    g.globalCompositeOperation = s.restar ? 'destination-out' : 'source-over';
    g.globalAlpha = s.restar ? 1 : tono;
    g.fillStyle = g.strokeStyle = '#fff';
    g.save();
    try {
      if (t.startsWith('elip') || t.startsWith('circ')) {
        const rx = Math.max(0.3, num(s.rx, num(s.r, 5))), ry = Math.max(0.3, num(s.ry, num(s.r, rx)));
        g.beginPath();
        g.ellipse(num(s.cx, 50) * k, num(s.cy, 50) * k, rx * k, ry * k, (num(s.giro) * Math.PI) / 180, 0, Math.PI * 2);
        g.fill();
      } else if (t.startsWith('anil') || t.startsWith('ring')) {
        g.lineWidth = Math.max(0.5, num(s.grosor, 2)) * k;
        g.beginPath();
        g.arc(num(s.cx, 50) * k, num(s.cy, 50) * k, Math.max(0.5, num(s.r, 10)) * k, 0, Math.PI * 2);
        g.stroke();
      } else if (t.startsWith('arc')) {
        g.lineWidth = Math.max(0.5, num(s.grosor, 2)) * k;
        g.beginPath();
        g.arc(num(s.cx, 50) * k, num(s.cy, 50) * k, Math.max(0.5, num(s.r, 10)) * k, (num(s.desde) * Math.PI) / 180, (num(s.hasta, 180) * Math.PI) / 180);
        g.stroke();
      } else if (t.startsWith('rect')) {
        const w = num(s.w, 10), h = num(s.h, 10), x = num(s.x, 45), y = num(s.y, 45);
        g.translate((x + w / 2) * k, (y + h / 2) * k);
        g.rotate((num(s.giro) * Math.PI) / 180);
        g.fillRect((-w / 2) * k, (-h / 2) * k, w * k, h * k);
      } else {
        const pts = (Array.isArray(s.puntos) ? s.puntos : []).filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [num(p[0]) * k, num(p[1]) * k]);
        if (pts.length < 2) throw 0;
        g.beginPath();
        g.moveTo(...pts[0]);
        if (t.startsWith('pol') && pts.length >= 3) {
          for (const p of pts.slice(1)) g.lineTo(...p);
          g.closePath();
          g.fill();
        } else {
          // trazo: curva suave por los puntos (un gesto, no una poligonal)
          for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
          g.lineTo(...pts[pts.length - 1]);
          g.lineWidth = Math.max(0.5, num(s.grosor, 2)) * k;
          g.stroke();
        }
      }
      drawn++;
    } catch {
      /* forma mal descrita: se saltea */
    }
    g.restore();
  }
  if (drawn < 2) return null;
  return figureFromAlpha(g.getImageData(0, 0, R, R).data, 0.04);
}

/** Lienzo RGBA → {mask (alfa 0..1), bbox}. */
export function figureFromAlpha(d, min = 0.43) {
  const mask = new Float32Array(R * R);
  let x0 = R, y0 = R, x1 = -1, y1 = -1, n = 0;
  for (let i = 0; i < R * R; i++) {
    const a = d[i * 4 + 3] / 255;
    if (a < min) continue;
    mask[i] = a;
    n++;
    const x = i % R, y = (i / R) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (n < R * R * 0.004) return null;
  return { mask, bbox: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, res: R };
}

// ── 2. figura → tonos con la resolución del muro ────────────────────────────
/** Promedia la máscara en celdas 1 × 2; la figura ocupa ~`alto` del alto, centrada y sin deformar. */
export function figureToTone(fig, gw, gh, alto = 0.84) {
  if (!fig || !fig.mask) return null;
  const bb = fig.bbox || { x: 0, y: 0, w: R, h: R };
  const cell = Math.max(bb.h / (gh * alto), (2 * bb.w) / (gw * 0.9));
  const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
  const tone = new Float32Array(gw * gh);
  const at = (x, y) => (x >= 0 && x < R && y >= 0 && y < R ? fig.mask[(y | 0) * R + (x | 0)] : 0);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const x0 = cx + (x - gw / 2) * (cell / 2), y0 = cy + (y - gh / 2) * cell;
      let s = 0, m = 0;
      for (const fy of [0.17, 0.5, 0.83]) {
        for (const fx of [0.25, 0.75]) {
          const v = at(x0 + fx * (cell / 2), y0 + fy * cell);
          s += v;
          if (v > m) m = v;
        }
      }
      tone[y * gw + x] = 0.55 * (s / 6) + 0.45 * m; // los trazos finos sobreviven a la reducción
    }
  }
  return tone;
}

/** Grilla de '#'/'.' (de un LLM) → tonos 0/1 centrados en el muro. */
export function rowsToTone(rows, gw, gh) {
  const c = document.createElement('canvas');
  c.width = c.height = R;
  const g = c.getContext('2d');
  const rh = rows.length, rw = Math.max(...rows.map((r) => r.length));
  // celdas 1 × 2: el ancho físico de la grilla es rw / 2
  const k = R / Math.max(rh, rw / 2);
  g.fillStyle = '#fff';
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && g.fillRect((x * k) / 2, y * k, k / 2 + 0.6, k + 0.6)));
  return figureToTone(figureFromAlpha(g.getImageData(0, 0, R, R).data), gw, gh);
}

// ── 3. tratamientos ─────────────────────────────────────────────────────────
/** Distancia con signo al borde (en filas; celdas 1 × 2 → una columna vale media fila). Negativa adentro. */
function signedDistance(inside, gw, gh) {
  const B = [];
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const v = inside[y * gw + x];
      if ((x > 0 && inside[y * gw + x - 1] !== v) || (y > 0 && inside[(y - 1) * gw + x] !== v)) B.push(x * 0.5, y);
    }
  }
  const d = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let m = 1e9;
      const px = x * 0.5;
      for (let i = 0; i < B.length; i += 2) {
        const dx = B[i] - px, dy = B[i + 1] - y;
        const q = dx * dx + dy * dy;
        if (q < m) m = q;
      }
      const s = Math.sqrt(m);
      d[y * gw + x] = inside[y * gw + x] ? -s : s;
    }
  }
  return d;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * Tratamiento gráfico: tone (Float32 gw×gh, 0..1) → { tone, accent }.
 *  topografia: curvas de nivel de la forma, dentro y fuera, onduladas; la figura emerge de líneas concéntricas.
 *  trama:      semitono por trama ordenada: denso en el núcleo, granulado hacia el borde, con halo.
 *  erosion:    la forma se deshace por el borde y se agrieta; restos que se desprenden hacia un lado.
 *  eco:        la forma repetida en ecos que se desvanecen (movimiento, tiempo) con bandas desplazadas.
 *  silueta:    la forma con sus grises, borde limpio.
 */
export function treat(src, gw, gh, kind, seed) {
  const N = gw * gh;
  const tone = new Float32Array(N), accent = new Uint8Array(N);
  const inside = new Uint8Array(N);
  for (let i = 0; i < N; i++) inside[i] = src[i] > 0.22 ? 1 : 0;
  const d = signedDistance(inside, gw, gh);
  const nz = noise2(seed), nz2 = noise2(seed ^ 0x5bd1e995);
  const r = rng(seed);
  const at = (x, y) => y * gw + x;

  if (kind === 'topografia') {
    // curvas de nivel: el borde (acento), anillos interiores que siguen la forma y dos o tres ondas hacia afuera
    const spacing = 1.7 + r() * 0.6, amp = 0.9 + r() * 1.1, rings = 2 + Math.floor(r() * 2);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = at(x, y), di = d[i];
        if (di > spacing * (rings + 0.5)) continue;
        const w = di + (nz(x * 0.07, y * 0.14) - 0.5) * 2 * amp * Math.min(1, Math.abs(di) / 3 + 0.15);
        const v = w / spacing, n = Math.round(v), f = Math.abs(v - n);
        const width = n === 0 ? 0.3 : di <= 0 ? 0.17 + 0.12 * src[i] : 0.16;
        if (f > width) continue;
        if (n === 0) {
          tone[i] = 1;
          accent[i] = 1; // la curva del borde, en el color de la marca
        } else if (di <= 0) tone[i] = 0.45 + 0.55 * Math.min(1, src[i] * 1.3); // las capas claras dan líneas tenues
        else tone[i] = 0.75 * Math.pow(0.6, n - 1);
      }
    }
  } else if (kind === 'trama') {
    // luz y grano: todas las letras de la forma están, con brillo según la profundidad (núcleo pleno, borde que
    // se apaga) y un grano de ruido; alrededor, un halo tenue. Con letras, el tono se lee por brillo, no por puntos.
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = at(x, y), di = d[i];
        const grain = (nz(x * 0.23, y * 0.46) - 0.5) * 0.5 + (r() - 0.5) * 0.18;
        if (di <= 0) {
          const core = Math.min(1, 0.35 + -di / 3.2);
          tone[i] = Math.max(0.16, Math.min(1, core * (0.55 + 0.45 * Math.min(1, src[i] * 1.4)) + grain));
          if (core > 0.95 && r() < 0.05) accent[i] = 1; // chispas en el núcleo
        } else if (di < 3.5) {
          const h = 0.3 * Math.exp(-di / 1.2) + grain * 0.5;
          if (h > 0.12 && r() < 0.7) tone[i] = h;
        }
      }
    }
  } else if (kind === 'erosion') {
    const dir = r() < 0.5 ? -1 : 1, reach = 6 + r() * 10;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = at(x, y), di = d[i];
        const n = nz(x * 0.09, y * 0.18), crack = nz2(x * 0.16, y * 0.32);
        if (di <= 0) {
          if (-di > n * 2.2 - 0.3 && crack < 0.8) tone[i] = 0.6 + 0.4 * Math.min(1, src[i] * 1.3);
          else if (r() < 0.35) tone[i] = 0.3;
        }
      }
    }
    // restos que se desprenden hacia un lado (como ceniza al viento)
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = at(x, y);
        if (!inside[i] || d[i] < -2.2 || r() > 0.4) continue;
        const L = 1 + Math.floor(r() * reach);
        const tx = x + dir * L * 2, ty = y + Math.round((r() - 0.65) * L * 0.4);
        if (tx < 0 || tx >= gw || ty < 0 || ty >= gh) continue;
        const j = at(tx, ty);
        if (inside[j]) continue;
        tone[j] = Math.max(tone[j], 0.85 * (1 - L / (reach + 2)));
        if (r() < 0.3) accent[j] = 1;
      }
    }
  } else if (kind === 'eco') {
    const dx = (r() < 0.5 ? -1 : 1) * (9 + Math.floor(r() * 7)), dy = Math.round((r() - 0.5) * 3);
    const tones = [1, 0.62, 0.38, 0.2];
    for (let k = tones.length - 1; k >= 0; k--) {
      for (let y = 0; y < gh; y++) {
        // bandas desplazadas (interferencia) sólo en los ecos
        const band = k > 0 && nz2(0.5, y * 0.35) > 0.62 ? Math.round((nz2(3.3, y * 0.35) - 0.5) * 8) : 0;
        for (let x = 0; x < gw; x++) {
          const sx = x - dx * k - band, sy = y - dy * k;
          if (sx < 0 || sx >= gw || sy < 0 || sy >= gh) continue;
          const s = at(sx, sy);
          if (!inside[s]) continue;
          const i = at(x, y);
          const v = tones[k] * (0.6 + 0.4 * src[s]);
          if (v > tone[i]) tone[i] = v;
          if (k === 0 && d[s] > -0.6) accent[i] = 1; // contorno de la figura presente
          else if (k === 0) accent[i] = 0;
        }
      }
    }
  } else {
    // silueta: la forma con sus grises; el borde en acento
    for (let i = 0; i < N; i++) {
      if (src[i] < 0.12) continue;
      tone[i] = 0.35 + 0.65 * Math.min(1, src[i] * 1.2);
      if (d[i] > -0.6 && src[i] > 0.5) accent[i] = 1; // sólo el borde de las masas plenas
    }
  }
  return { tone, accent };
}

/** Vista previa en texto (panel C): rampa de densidad, acento con «▒». */
export function toneToText(tone, accent, gw, gh) {
  const ramp = ' .:-=+*#%@';
  const rows = [];
  for (let y = 0; y < gh; y++) {
    let s = '';
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      s += accent && accent[i] && tone[i] > 0 ? '▒' : ramp[Math.min(9, Math.round(tone[i] * 9))];
    }
    rows.push(s.replace(/\s+$/, ''));
  }
  return rows;
}
