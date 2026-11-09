/* ═══════════════════════════════════════════════════════════════════════════
   GLOBAL GAME JAM MENDOZA 2027 — SHOWREEL (60 s · 1920×1080 · 60 fps)
   Motor de motion graphics determinista: renderFrame(t) dibuja el instante t.
   Misma grilla rítmica que music.py: 128 BPM, 32 compases.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const W = 1920, H = 1080, FPS = 60, DUR = 60;
const BPM = 128, B = 60 / BPM, BAR = 4 * B;

// ── paleta (marca GGJ + navy MEGA) ─────────────────────────────────────────
const NAVY = '#070B1A', NAVY2 = '#0E1630', NAVY3 = '#16224A';
const BLUE = '#22A9E0', YEL = '#F3EB33', WHITE = '#F4F6FA', RED = '#FF4D5E';

// ── matemática / easing ────────────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const fract = x => x - Math.floor(x);
const ease = {
  lin: k => k,
  outCubic: k => 1 - Math.pow(1 - k, 3),
  inCubic: k => k * k * k,
  inOutCubic: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
  outExpo: k => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k),
  inExpo: k => k <= 0 ? 0 : Math.pow(2, 10 * k - 10),
  inOutExpo: k => k <= 0 ? 0 : k >= 1 ? 1 : k < .5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2,
  outBack: k => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  outElastic: k => k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - .75) * (2 * Math.PI) / 3) + 1,
  outQuart: k => 1 - Math.pow(1 - k, 4),
};
// progreso 0..1 entre dos beats, con easing
const P = (b, b0, len, e = ease.outExpo) => e(clamp((b - b0) / len));
const hash = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
const hash2 = (a, b) => hash(a * 57.31 + b * 13.97);
// envolvente de golpe: 1 en el beat, decae
const hit = (b, b0, decay = .35) => b < b0 ? 0 : Math.exp(-(b - b0) / decay);

// ── canvas ─────────────────────────────────────────────────────────────────
const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const src = mk();
const ctx = src.getContext('2d');
const layers = [0, 1, 2, 3].map(() => { const c = mk(); return { c, g: c.getContext('2d') }; });
function layer(i) { const L = layers[i]; L.g.setTransform(1, 0, 0, 1, 0, 0); L.g.globalCompositeOperation = 'source-over'; L.g.globalAlpha = 1; L.g.clearRect(0, 0, W, H); return L; }

// ── assets ─────────────────────────────────────────────────────────────────
const PHOTO_FILES = ['p01_a01_01', 'p02_a01_03', 'p03_a01_05', 'p04_a01_06', 'p05_a01_13', 'p06_a01_14', 'p07_a01_12', 'p08_a02_03', 'p09_a02_06', 'p10_a02_09', 'p11_a02_10', 'p12_a02_11', 'p13_a02_12', 'p14_a02_14', 'p15_a03_04', 'p16_a03_07', 'p17_a03_09', 'p18_a03_13', 'p19_a03_14', 'p20_a04_10', 'p21_a05_03', 'p22_a05_04', 'p23_a05_10', 'p24_a05_11', 'p25_a05_14', 'p26_a07_01', 'p27_a07_02', 'p28_a07_04', 'p29_a07_05', 'p30_a07_06', 'p31_a07_07', 'p32_a07_09', 'p33_a07_10', 'p34_a07_14', 'p35_a21_02', 'p36_a21_03', 'p37_a21_07', 'p38_a21_11', 'p39_a21_12', 'p40_a21_13', 'p41_a22_02', 'p42_a22_04', 'p43_a22_05', 'p44_a22_08', 'p45_a22_09', 'p46_a22_10', 'p47_a22_13', 'p48_a23_02', 'p49_a23_04', 'p50_a23_05', 'p51_a23_07', 'p52_a23_09', 'p53_a23_10', 'p54_a23_11', 'p55_a23_12', 'p56_a23_13', 'p57_a23_14', 'p58_a24_08', 'p59_a24_09', 'p60_a24_10', 'p61_a06_09', 'p62_a10_14'];
const PH = [];          // PH[n] (1-based): { raw, duo, mono }
const LOGO = {};
const FAM = { anton: 'Anton', arch: 'Archivo', mono: 'JBMono', sg: 'SpaceG' };

function loadImg(url) { return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; }); }

function rgb(hex) { const v = parseInt(hex.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
let PIXELS_OK = true;   // false si el navegador no deja leer píxeles (página abierta con file://)
function toneFast(img, dark, light, w) {
  const h = Math.round(img.height * w / img.width);
  const c = mk(w, h), x = c.getContext('2d');
  x.filter = 'grayscale(1) contrast(1.35)';
  x.drawImage(img, 0, 0, w, h);
  x.filter = 'none';
  x.globalCompositeOperation = 'multiply'; x.fillStyle = light; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'screen'; x.fillStyle = dark; x.fillRect(0, 0, w, h);
  return c;
}
function tone(img, dark, mid, light, w = 960, contrast = [0.06, 0.9]) {
  if (!PIXELS_OK) return toneFast(img, dark, light, w);
  try { return toneExact(img, dark, mid, light, w, contrast); }
  catch (e) { PIXELS_OK = false; return toneFast(img, dark, light, w); }
}
function toneExact(img, dark, mid, light, w, contrast) {
  const h = Math.round(img.height * w / img.width);
  const c = mk(w, h), x = c.getContext('2d');
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h), p = d.data;
  const A = rgb(dark), M = rgb(mid), Z = rgb(light);
  for (let i = 0; i < p.length; i += 4) {
    let l = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
    l = clamp((l - contrast[0]) / (contrast[1] - contrast[0]));
    l = l * l * (3 - 2 * l);
    let r, g, b;
    if (l < .5) { const k = l * 2; r = A[0] + (M[0] - A[0]) * k; g = A[1] + (M[1] - A[1]) * k; b = A[2] + (M[2] - A[2]) * k; }
    else { const k = (l - .5) * 2; r = M[0] + (Z[0] - M[0]) * k; g = M[1] + (Z[1] - M[1]) * k; b = M[2] + (Z[2] - M[2]) * k; }
    p[i] = r; p[i + 1] = g; p[i + 2] = b;
  }
  x.putImageData(d, 0, 0);
  return c;
}
function tint(img, color) {
  const c = mk(img.width, img.height), x = c.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}

async function loadAll(onProgress = () => {}) {
  const total = 4 + PHOTO_FILES.length * 2 + 2;  // fuentes + fotos + duotonos + logos
  let done = 0;
  const tick = () => onProgress(++done / total);
  const fonts = [
    new FontFace('Anton', 'url(assets/fonts/anton.woff2)'),
    new FontFace('Archivo', 'url(assets/fonts/archivo-wdth.woff2)', { weight: '100 900', stretch: '62% 125%' }),
    new FontFace('JBMono', 'url(assets/fonts/jbmono.woff2)', { weight: '100 800' }),
    new FontFace('SpaceG', 'url(assets/fonts/spacegrotesk.woff2)', { weight: '300 700' }),
  ];
  await Promise.all(fonts.map(f => f.load().then(ff => { document.fonts.add(ff); tick(); })));
  const imgs = await Promise.all(PHOTO_FILES.map(f => loadImg(`assets/photos/${f}.jpg`).then(im => { tick(); return im; })));
  for (let i = 0; i < imgs.length; i++) {
    const im = imgs[i];
    PH[i + 1] = { raw: im, duo: tone(im, '#050817', '#1A5C9A', '#7FD4F5') };
    if (i + 1 === 14) PH[14].mono = tone(im, '#04060F', '#2A3350', '#C9D2E6', 640);
    tick();
    if (i % 4 === 3) await new Promise(r => setTimeout(r));   // deja respirar a la UI
  }
  LOGO.ggj = await loadImg('assets/logos/ggj_light.png'); tick();
  const mega = await loadImg('assets/logos/mega_negative.png'); tick();
  LOGO.mega = mega; LOGO.megaNavy = tint(mega, NAVY);
  // precalentar fuentes en canvas
  for (const f of Object.values(FAM)) { ctx.font = `900 40px ${f}`; ctx.fillText('ÁÉÍÓÚÑ0123', -500, -500); }
}

// ── primitivas de dibujo ───────────────────────────────────────────────────
function setFont(g, fam, size, o = {}) {
  g.font = `${o.italic ? 'italic ' : ''}${o.weight || (fam === 'arch' ? 900 : fam === 'mono' ? 600 : 400)} ${size}px ${FAM[fam]}`;
  g.fontStretch = o.stretch || 'normal';
  g.letterSpacing = (o.track || 0) + 'px';
}
function txt(g, s, x, y, size, o = {}) {
  g.save();
  setFont(g, o.fam || 'arch', size, o);
  g.textAlign = o.align || 'center';
  g.textBaseline = o.base || 'middle';
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  const dx = (o.align || 'center') === 'center' ? (o.track || 0) / 2 : 0;
  if (o.stroke) { g.lineWidth = o.stroke; g.lineJoin = 'round'; g.strokeStyle = o.color || WHITE; g.strokeText(s, x + dx, y); }
  else { g.fillStyle = o.color || WHITE; g.fillText(s, x + dx, y); }
  g.restore();
}
function measure(g, s, size, o = {}) { g.save(); setFont(g, o.fam || 'arch', size, o); const w = g.measureText(s).width; g.restore(); return w; }
function fit(g, s, maxW, size, o = {}) { const w = measure(g, s, size, o); return w > maxW ? size * maxW / w : size; }
// texto por caracter: fn(i, n) -> {dx, dy, s, a, r, color}
function chars(g, s, x, y, size, o, fn) {
  g.save();
  setFont(g, o.fam || 'arch', size, { ...o, track: 0 });
  const tr = o.track || 0;
  const ws = [...s].map(c => g.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + tr * (ws.length - 1);
  let cx = (o.align === 'left') ? x : (o.align === 'right' ? x - total : x - total / 2);
  g.textAlign = 'center'; g.textBaseline = o.base || 'middle';
  [...s].forEach((c, i) => {
    const f = fn(i, ws.length) || {};
    const px = cx + ws[i] / 2;
    g.save();
    g.translate(px + (f.dx || 0), y + (f.dy || 0));
    if (f.r) g.rotate(f.r);
    const sc = f.s ?? 1; g.scale(sc * (f.sx ?? 1), sc * (f.sy ?? 1));
    g.globalAlpha *= clamp(f.a ?? 1);
    if (o.stroke) { g.lineWidth = o.stroke; g.strokeStyle = f.color || o.color || WHITE; g.strokeText(c, 0, 0); }
    else { g.fillStyle = f.color || o.color || WHITE; g.fillText(c, 0, 0); }
    g.restore();
    cx += ws[i] + tr;
  });
  g.restore();
  return total;
}
// foto que cubre un rectángulo (zoom, paneo -1..1)
function cover(g, im, x, y, w, h, z = 1, px = 0, py = 0, alpha = 1) {
  if (!im) return;
  const iw = im.width, ih = im.height;
  const s = Math.max(w / iw, h / ih) * z;
  const dw = iw * s, dh = ih * s;
  const ox = x + (w - dw) / 2 + px * (dw - w) / 2, oy = y + (h - dh) / 2 + py * (dh - h) / 2;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.globalAlpha *= alpha;
  g.drawImage(im, ox, oy, dw, dh);
  g.restore();
}
const ph = (n, v = 'raw') => { const p = PH[n]; if (!p) return; if (!p[v] && v === 'mono') p.mono = tone(p.raw, '#04060F', '#2A3350', '#C9D2E6', 640); return p[v]; };
function rect(g, x, y, w, h, c, a = 1) { g.save(); g.globalAlpha *= a; g.fillStyle = c; g.fillRect(x, y, w, h); g.restore(); }
function bg(g, c) { g.fillStyle = c; g.fillRect(-200, -200, W + 400, H + 400); }
function rrect(g, x, y, w, h, r, c, a = 1) { g.save(); g.globalAlpha *= a; g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); g.restore(); }
function vgrad(g, y0, y1, c0, c1) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(0, y0, W, y1 - y0); }
function line(g, x0, y0, x1, y1, c, w = 2, a = 1) { g.save(); g.globalAlpha *= a; g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore(); }
function ring(g, x, y, r, w, c, a = 1) { if (r <= 0 || w <= 0) return; g.save(); g.globalAlpha *= a; g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.restore(); }
// foto dentro del texto (máscara)
function photoText(g, s, x, y, size, o, im, z = 1, px = 0, py = 0) {
  const L = layer(3);
  txt(L.g, s, x, y, size, { ...o, color: '#fff' });
  L.g.globalCompositeOperation = 'source-in';
  cover(L.g, im, 0, 0, W, H, z, px, py);
  g.drawImage(L.c, 0, 0);
}
// ventana con forma de texto: pantalla de color con el texto "agujereado"
function knockout(g, s, x, y, size, o, color, alpha = 1) {
  const L = layer(2);
  rect(L.g, 0, 0, W, H, color);
  L.g.globalCompositeOperation = 'destination-out';
  txt(L.g, s, x, y, size, { ...o, color: '#000' });
  g.save(); g.globalAlpha *= alpha; g.drawImage(L.c, 0, 0); g.restore();
}
function dotGrid(g, gap, color, a, t, reveal = 99999, cx = W / 2, cy = H / 2) {
  g.save(); g.fillStyle = color;
  for (let y = gap / 2; y < H; y += gap) for (let x = gap / 2; x < W; x += gap) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > reveal) continue;
    const wob = .5 + .5 * Math.sin(d * .02 - t * 3);
    g.globalAlpha = a * (.4 + .6 * wob);
    g.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  g.restore();
}
function burst(g, cx, cy, k, n, color, seed = 1, r0 = 120, r1 = 1300, w = 6) {
  if (k <= 0 || k >= 1) return;
  g.save(); g.strokeStyle = color; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(seed + i) * .2;
    const rr = lerp(r0, r1, ease.outExpo(k)) * (.6 + .4 * hash(seed * 3 + i));
    const len = (1 - k) * 220 * (.4 + hash(seed + i * 7));
    g.globalAlpha = 1 - k;
    g.lineWidth = w * (1 - k);
    g.beginPath(); g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    g.lineTo(cx + Math.cos(a) * (rr + len), cy + Math.sin(a) * (rr + len)); g.stroke();
  }
  g.restore();
}
function particles(g, cx, cy, k, n, seed, colors, spread = 1100) {
  if (k <= 0 || k >= 1) return;
  g.save();
  for (let i = 0; i < n; i++) {
    const a = hash(seed + i) * Math.PI * 2, v = (.3 + hash(seed + i * 3.1)) * spread;
    const e = ease.outExpo(k);
    const x = cx + Math.cos(a) * v * e, y = cy + Math.sin(a) * v * e + k * k * 200;
    const s = (6 + hash(i + seed * 9) * 18) * (1 - k);
    g.globalAlpha = 1 - k * k;
    g.fillStyle = colors[i % colors.length];
    g.save(); g.translate(x, y); g.rotate(k * 6 * (hash(i) - .5)); g.fillRect(-s / 2, -s / 2, s, s); g.restore();
  }
  g.restore();
}
// esquinas de encuadre tipo visor
function corners(g, inset, len, color, a = 1, w = 3) {
  g.save(); g.globalAlpha *= a; g.strokeStyle = color; g.lineWidth = w;
  const pts = [[inset, inset, 1, 1], [W - inset, inset, -1, 1], [inset, H - inset, 1, -1], [W - inset, H - inset, -1, -1]];
  for (const [x, y, sx, sy] of pts) { g.beginPath(); g.moveTo(x + sx * len, y); g.lineTo(x, y); g.lineTo(x, y + sy * len); g.stroke(); }
  g.restore();
}
function chip(g, s, x, y, size, fg, bgc, o = {}) {
  const w = measure(g, s, size, { fam: o.fam || 'mono', weight: 700, track: o.track ?? 2 }) + size * 1.4;
  const h = size * 2;
  const xx = o.align === 'left' ? x : x - w / 2;
  if (o.outline) { g.save(); g.strokeStyle = bgc; g.lineWidth = 2; g.beginPath(); g.roundRect(xx, y - h / 2, w, h, h / 2); g.stroke(); g.restore(); }
  else rrect(g, xx, y - h / 2, w, h, h / 2, bgc, o.alpha ?? 1);
  txt(g, s, xx + w / 2, y + 1, size, { fam: o.fam || 'mono', weight: 700, color: fg, track: o.track ?? 2, alpha: o.alpha ?? 1 });
  return w;
}
// cifra que rueda tipo tragamonedas
function rollNumber(g, value, x, y, size, k, o = {}) {
  const s = String(value);
  const digits = [...s];
  const L = layer(1);
  setFont(L.g, o.fam || 'anton', size, o);
  const wDigit = L.g.measureText('0').width;
  const total = wDigit * digits.length;
  let x0 = (o.align === 'left') ? x : x - total / 2;
  digits.forEach((d, i) => {
    const target = +d;
    if (isNaN(target)) { txt(L.g, d, x0 + wDigit / 2, y, size, { ...o, color: o.color }); x0 += wDigit; return; }
    const kk = clamp(k * (1 + i * .25) - i * .12);
    const spins = 2 + i;
    const pos = lerp(0, spins * 10 + target, ease.outCubic(kk));
    const lh = size * 1.45;
    for (let j = -1; j <= 1; j++) {
      const v = Math.floor(pos) + j;
      const off = (v - pos) * lh;
      txt(L.g, String(((v % 10) + 10) % 10), x0 + wDigit / 2, y + off, size, { ...o, fam: o.fam || 'anton' });
    }
    x0 += wDigit;
  });
  // recorte vertical
  g.save(); g.beginPath(); g.rect(0, y - size * .5, W, size * 1.0); g.clip(); g.drawImage(L.c, 0, 0); g.restore();
}
function typeOn(s, k) { const n = Math.floor(s.length * clamp(k)); return s.slice(0, n) + (k > 0 && k < 1 && Math.floor(k * 30) % 2 ? '▌' : ''); }
function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = Math.floor(sec) % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ── estado de post-proceso por cuadro ─────────────────────────────────────
const FX = { ab: 0, glitch: 0, flash: 0, grain: .05, vig: .55, zoom: 1, rot: 0, sx: 0, sy: 0, invert: 0 };
function resetFX() { Object.assign(FX, { ab: .15, glitch: 0, flash: 0, grain: .05, vig: .55, zoom: 1, rot: 0, sx: 0, sy: 0, invert: 0 }); }
const DROPS = [[8, 16], [20, 28], [28, 30]];
function kickPulse(b) {
  const bar = b / 4;
  if (!DROPS.some(([a, z]) => bar >= a && bar < z)) return 0;
  if (bar % 8 >= 7.75 && (bar < 16 || (bar >= 20 && bar < 28))) return 0;   // corte antes del cambio
  return Math.exp(-fract(b) * B / .09);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ESCENAS  —  cada una recibe (g, b, lb):  b = beat global, lb = beat local
   ═══════════════════════════════════════════════════════════════════════════ */

// 01 · BOOT — el cronómetro de 48 h
function sBoot(g, b, lb) {
  bg(g, NAVY);
  const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 1100);
  gr.addColorStop(0, '#101a3a'); gr.addColorStop(1, '#03050c'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  dotGrid(g, 48, BLUE, .22, b * B, P(lb, 0, 2.5, ease.outCubic) * 1300);
  const k1 = P(lb, 0, 1.2);
  line(g, W / 2 - k1 * W / 2, H / 2, W / 2 + k1 * W / 2, H / 2, WHITE, 1, .25);
  line(g, W / 2, H / 2 - k1 * H / 2, W / 2, H / 2 + k1 * H / 2, WHITE, 1, .25);
  ring(g, W / 2, H / 2, 40 + P(lb, 0, 1) * 330, 1.5, WHITE, .2 * (1 - P(lb, 2.5, 1.5)));
  // reloj
  const kc = ease.inCubic(clamp((lb - .3) / 3.2));
  const secs = kc * 48 * 3600;
  const done = lb >= 3.5;
  const s = done ? '48:00:00' : fmtTime(secs);
  const pulse = hit(lb, 3.5, .4);
  g.save(); g.translate(W / 2, H / 2); g.scale(1 + pulse * .12, 1 + pulse * .12);
  txt(g, s, 0, 0, 190, { fam: 'mono', weight: 700, color: done ? YEL : WHITE, track: 6, alpha: P(lb, 0, .4) });
  g.restore();
  txt(g, typeOn('TIEMPO DE DESARROLLO', P(lb, .5, 1.2, ease.lin)), W / 2, H / 2 - 160, 26, { fam: 'mono', weight: 500, color: BLUE, track: 8 });
  const fr = Math.floor((b * B * FPS)) % 60;
  txt(g, `FRAME ${String(fr).padStart(2, '0')}`, W / 2, H / 2 + 150, 22, { fam: 'mono', weight: 500, color: WHITE, track: 6, alpha: .45 });
  FX.ab = .3 + pulse; FX.grain = .08;
}

// 02 · "48 HORAS"
function s48(g, b, lb) {
  bg(g, NAVY);
  const beat = Math.floor(lb);
  const k = P(lb, 0, .45);
  const sc = lerp(2.2, 1, k) + hit(lb, Math.floor(lb), .25) * .04;
  const cx = W / 2, cy = H / 2 - 10;
  g.save(); g.translate(cx, cy); g.scale(sc, sc); g.translate(-cx, -cy);
  const o = { fam: 'anton', track: -10 };
  if (beat === 0) txt(g, '48', cx, cy, 900, { ...o, color: WHITE });
  else if (beat === 1) { cover(g, ph(34, 'duo'), 0, 0, W, H, 1.25 - lb * .03, 0, 0, .35); photoText(g, '48', cx, cy, 900, o, ph(34), 1.3 - lb * .04); }
  else if (beat === 2) txt(g, '48', cx, cy, 900, { ...o, color: YEL });
  else { cover(g, ph(39, 'duo'), 0, 0, W, H, 1.1, 0, 0, .55); txt(g, '48', cx, cy, 900, { ...o, stroke: 10, color: BLUE }); }
  g.restore();
  // banda amarilla con HORAS
  const kb = P(lb, .5, .6, ease.inOutExpo);
  const bw = 1500 * kb;
  g.save();
  g.translate(W / 2, H / 2 + 40); g.rotate(-.06);
  rect(g, -bw / 2, -95, bw, 190, YEL);
  g.beginPath(); g.rect(-bw / 2, -95, bw, 190); g.clip();
  chars(g, 'HORAS', 0, 6, 170, { fam: 'arch', stretch: 'expanded', weight: 900, color: NAVY, track: 40 }, (i, n) => {
    const kk = P(lb, .7 + i * .06, .5, ease.outExpo);
    return { dy: (1 - kk) * 200 };
  });
  g.restore();
  txt(g, typeOn('UNA JAM ES UN DESAFÍO CONTRARRELOJ', P(lb, .2, 1.6, ease.lin)), W / 2, 150, 28, { fam: 'mono', weight: 600, color: WHITE, track: 8 });
  txt(g, 'PARA CREAR UN VIDEOJUEGO', W / 2, H - 140, 28, { fam: 'mono', weight: 600, color: BLUE, track: 8, alpha: P(lb, 2, .5) });
  FX.flash = hit(lb, 0, .25) * .55;
  FX.ab = .3 + hit(lb, Math.floor(lb), .3) * .8;
}

// 03 · 1 TEMA · 1 EQUIPO · 1 JUEGO
function sOne(g, b, lb) {
  bg(g, NAVY);
  cover(g, ph(16, 'duo'), 0, 0, W, H, 1.15 + lb * .02, 0, 0, .45);
  vgrad(g, 0, H, 'rgba(7,11,26,.55)', 'rgba(7,11,26,.9)');
  const rows = [['TEMA SECRETO', BLUE], ['EQUIPO', YEL], ['JUEGO', WHITE]];
  const out = P(lb, 3.2, .7, ease.inExpo);
  rows.forEach(([w, c], i) => {
    const y = 300 + i * 240;
    const t0 = i;
    const kIn = P(lb, t0, .3, ease.inOutCubic), kOut = P(lb, t0 + .3, .35, ease.inOutCubic);
    const x0 = 360, wMax = 1300;
    const sx = -out * (1400 + i * 300);
    g.save(); g.translate(sx, 0);
    if (lb >= t0 + .3) {
      txt(g, '1', x0, y + 6, 210, { fam: 'anton', color: YEL, align: 'center' });
      chars(g, w, x0 + 140, y, 180, { fam: 'arch', stretch: 'condensed', weight: 900, color: WHITE, align: 'left', track: 2 }, (j) => ({ dy: 0, a: 1 }));
    }
    // barra de revelado
    const bx = x0 - 120 + kOut * wMax, bw2 = Math.max(0, kIn * wMax - kOut * wMax);
    rect(g, bx, y - 125, bw2, 250, c);
    g.restore();
  });
  FX.ab = .2 + hit(lb, Math.floor(lb), .3) * .6;
  FX.glitch = out * .8;
}

// 04 · GLOBO GGJ en construcción
function sGlobe(g, b, lb) {
  bg(g, NAVY);
  const cx = W / 2, cy = 470;
  const grow = 1 + ease.inCubic(clamp(lb / 4)) * .25;
  const r = 230 * grow;
  dotGrid(g, 60, BLUE, .12, b * B);
  // órbita trasera
  const ko = P(lb, .6, 2.2, ease.inOutCubic);
  const tilt = -.28;
  const orbit = (front) => {
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    g.strokeStyle = YEL; g.lineWidth = 30 * grow; g.lineCap = 'round';
    g.beginPath();
    const a0 = front ? 0 : Math.PI, a1 = a0 + Math.PI * ko;
    g.ellipse(0, 0, r * 1.75, r * .42, 0, a0, a1);
    g.stroke(); g.restore();
  };
  orbit(false);
  // globo
  const kc = P(lb, 0, 1.4, ease.inOutCubic);
  const kf = P(lb, 1.2, .8, ease.outCubic);
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.globalAlpha = kf; g.fillStyle = WHITE; g.fill(); g.globalAlpha = 1;
  g.clip();
  // meridianos que giran
  g.strokeStyle = BLUE; g.lineWidth = 5;
  for (let i = 0; i < 6; i++) {
    const ph_ = fract(i / 6 + b * .06);
    const rx = Math.abs(Math.cos(ph_ * Math.PI)) * r;
    g.globalAlpha = .9 * kf; g.beginPath(); g.ellipse(cx, cy, rx, r, 0, 0, Math.PI * 2); g.stroke();
  }
  for (let j = -2; j <= 2; j++) { g.beginPath(); g.ellipse(cx, cy + j * r * .38, r * Math.sqrt(1 - Math.pow(j * .38, 2)), r * .09, 0, 0, Math.PI * 2); g.stroke(); }
  g.restore();
  ring(g, cx, cy, r, 7, WHITE, 1 - kf * .0);
  // dibujo del contorno
  g.save(); g.strokeStyle = WHITE; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * kc); g.stroke(); g.restore();
  orbit(true);
  // "GLOBAL GAME JAM" con tracking que se cierra
  const kt = P(lb, 1.2, 2.2, ease.outExpo);
  txt(g, 'GLOBAL GAME JAM', cx, 870, 112, { fam: 'arch', stretch: 'expanded', weight: 900, color: WHITE, track: lerp(140, 12, kt), alpha: kt });
  txt(g, 'LA GAME JAM MÁS GRANDE DEL MUNDO', cx, 960, 26, { fam: 'mono', weight: 600, color: BLUE, track: 10, alpha: P(lb, 2.2, .6) });
  FX.flash = ease.inExpo(clamp((lb - 3.4) / .6)) * .95;
  FX.ab = .2 + lb * .15;
  FX.zoom = 1 + ease.inCubic(clamp(lb / 4)) * .04;
}

// 05 · MENDOZA (fotos dentro de las letras)
function sMendoza(g, b, lb) {
  bg(g, NAVY);
  const imgs = [20, 34, 60, 39];
  const beat = Math.floor(lb);
  const im = ph(imgs[beat % 4]);
  dotGrid(g, 48, BLUE, .12, b * B);
  const size = 470;
  const o = { fam: 'anton', track: 8 };
  // ecos de contorno
  for (let i = 3; i >= 1; i--) {
    const e = hit(lb, beat, .5) * 30 + 14;
    txt(g, 'MENDOZA', W / 2, H / 2 + i * e, size, { ...o, stroke: 2.5, color: i % 2 ? BLUE : YEL, alpha: .55 - i * .12 });
    txt(g, 'MENDOZA', W / 2, H / 2 - i * e, size, { ...o, stroke: 2.5, color: i % 2 ? BLUE : YEL, alpha: .55 - i * .12 });
  }
  const kin = P(lb, 0, .5);
  g.save(); g.translate(W / 2, H / 2); g.scale(lerp(1.3, 1, kin), lerp(1.3, 1, kin)); g.translate(-W / 2, -H / 2);
  photoText(g, 'MENDOZA', W / 2, H / 2, size, o, im, 1.25 - fract(lb) * .08, 0, 0);
  g.restore();
  txt(g, typeOn('32°53′S  68°50′O', P(lb, .3, 1.2, ease.lin)), W / 2, 150, 30, { fam: 'mono', weight: 600, color: WHITE, track: 10 });
  chars(g, 'ARGENTINA', W / 2, H - 150, 54, { fam: 'arch', stretch: 'expanded', weight: 800, color: YEL, track: 46 }, (i) => ({ a: P(lb, 1 + i * .05, .3), dy: (1 - P(lb, 1 + i * .05, .4)) * 30 }));
  FX.ab = .25 + hit(lb, beat, .3) * .9;
  FX.zoom = 1 + hit(lb, beat, .25) * .02;
}

// 06 · tríptico de fotos + COMUNIDAD / DESDE 2012
function sTriptych(g, b, lb) {
  bg(g, NAVY);
  const sets = [[21, 27, 37], [46, 30, 52], [45, 11, 49], [3, 31, 28]];
  const gap = 14, pw = (W - gap * 4) / 3;
  const beat = Math.floor(lb);
  for (let i = 0; i < 3; i++) {
    const x = gap + i * (pw + gap);
    const dir = i % 2 ? 1 : -1;
    const kin = P(lb, i * .12, .6, ease.outExpo);
    const yoff = dir * (1 - kin) * H;
    const n = sets[beat % 4][i];
    const sw = P(lb, beat + i * .08, .35, ease.inOutCubic);
    g.save(); g.translate(0, yoff);
    cover(g, ph(n), x, gap, pw, H - gap * 2, 1.15 + fract(lb) * .05, 0, dir * .3 * (lb / 4));
    // barrido vertical al cambiar
    if (beat > 0) { const prev = sets[(beat - 1) % 4][i]; g.save(); g.beginPath(); g.rect(x, gap + (H - gap * 2) * sw, pw, (H - gap * 2) * (1 - sw)); g.clip(); cover(g, ph(prev), x, gap, pw, H - gap * 2, 1.2, 0, 0); g.restore(); }
    g.restore();
  }
  // texto en modo diferencia
  g.save(); g.globalCompositeOperation = 'difference';
  const word = lb < 2 ? 'COMUNIDAD' : 'DESDE 2012';
  const lk = lb < 2 ? P(lb, 0, .5) : P(lb, 2, .5);
  txt(g, word, W / 2, H / 2, fit(g, word, 1700, 330, { fam: 'anton' }), { fam: 'anton', color: '#fff', track: lerp(60, 6, lk), alpha: lk });
  g.restore();
  txt(g, lb < 2 ? 'DESARROLLADORES · ARTISTAS · MÚSICOS · CURIOSOS' : 'MENDOZA ES SEDE DE LA GGJ AÑO TRAS AÑO', W / 2, H - 120, 26, { fam: 'mono', weight: 700, color: WHITE, track: 6, alpha: lk });
  FX.ab = .3 + hit(lb, beat, .3) * .7;
}

// 07 · 15 EDICIONES (contador + años)
function sEditions(g, b, lb) {
  bg(g, NAVY);
  cover(g, ph(14, 'mono'), 0, 0, W, H, 1.1, 0, 0, .35);
  vgrad(g, 0, H, 'rgba(7,11,26,.6)', 'rgba(7,11,26,.95)');
  const k = P(lb, 0, 2.6, ease.inOutCubic);
  const n = Math.round(k * 15);
  rollNumber(g, String(Math.max(1, n)).padStart(2, '0'), 560, 470, 560, 1, { fam: 'anton', color: YEL });
  txt(g, 'EDICIONES', 1340, 380, 150, { fam: 'arch', stretch: 'condensed', weight: 900, color: WHITE, alpha: P(lb, .2, .4) });
  txt(g, 'CONSECUTIVAS', 1340, 540, 108, { fam: 'arch', stretch: 'condensed', weight: 900, color: BLUE, alpha: P(lb, .5, .4), track: 4 });
  // fila de años
  const y = 880, sq = 82, gp = 16, total = 16 * sq + 15 * gp, x0 = (W - total) / 2;
  for (let i = 0; i < 16; i++) {
    const year = 2012 + i;
    const x = x0 + i * (sq + gp);
    const on = i < n;
    const appear = P(lb, i * .04, .3);
    if (i < 15) {
      rrect(g, x, y - sq / 2 + (1 - appear) * 40, sq, sq, 8, on ? YEL : NAVY3, appear);
      txt(g, String(year).slice(2), x + sq / 2, y + 2, 34, { fam: 'mono', weight: 700, color: on ? NAVY : '#4d5b85', alpha: appear });
    } else {
      const bl = lb > 2.8 ? (Math.floor(lb * 4) % 2 ? 1 : .35) : 0;
      g.save(); g.globalAlpha = bl; g.strokeStyle = BLUE; g.lineWidth = 4; g.beginPath(); g.roundRect(x, y - sq / 2, sq, sq, 8); g.stroke(); g.restore();
      txt(g, '27', x + sq / 2, y + 2, 34, { fam: 'mono', weight: 700, color: BLUE, alpha: bl });
    }
  }
  txt(g, 'DESDE 2012  →  VAMOS POR LA 16ª', W / 2, y + 90, 26, { fam: 'mono', weight: 700, color: WHITE, track: 6, alpha: P(lb, 2.8, .4) });
  FX.ab = .2 + hit(lb, Math.floor(lb), .3) * .5;
}

// 08 · 3 · 2 · 1 · PRESS START
function sCount(g, b, lb) {
  const beat = Math.floor(lb);
  bg(g, '#000');
  if (beat < 3) {
    const imgs = [33, 18, 49], cols = [NAVY, NAVY, NAVY];
    const k = fract(lb);
    cover(g, ph(imgs[beat]), 0, 0, W, H, 1.3 - k * .15, 0, 0);
    const s = String(3 - beat);
    g.save(); g.translate(W / 2, H / 2); const sc = lerp(1.6, 1, ease.outExpo(clamp(k * 2.2))); g.scale(sc, sc); g.translate(-W / 2, -H / 2);
    knockout(g, s, W / 2, H / 2 + 30, 980, { fam: 'anton' }, cols[beat], .94);
    g.restore();
    ring(g, W / 2, H / 2, 200 + ease.outExpo(k) * 800, 14 * (1 - k), [YEL, BLUE, WHITE][beat], 1 - k);
    corners(g, 60, 70, WHITE, .8);
    FX.ab = .4 + hit(lb, beat, .25) * 1.2;
    FX.zoom = 1 + hit(lb, beat, .2) * .03;
  } else {
    bg(g, '#020308');
    const blink = Math.floor(lb * 8) % 2;
    txt(g, 'PRESS START', W / 2, H / 2, 64, { fam: 'mono', weight: 800, color: YEL, track: 18, alpha: lb < 3.75 ? (blink ? 1 : .2) : 0 });
    FX.sx = (hash(Math.floor(b * 16)) - .5) * 14 * fract(lb);
    FX.sy = (hash(Math.floor(b * 16) + 9) - .5) * 14 * fract(lb);
    FX.glitch = fract(lb) * .6;
  }
}

// 09 · DROP — impacto + grilla de fotos + SEDE Nº1
function sGrid(g, b, lb) {
  bg(g, NAVY);
  const cols = 4, rows = 3, gap = 10;
  const tw = (W - gap * (cols + 1)) / cols, th = (H - gap * (rows + 1)) / rows;
  const imgs = [36, 52, 9, 46, 34, 23, 12, 50, 38, 27, 54, 44];
  const zout = lerp(1.18, 1, P(lb, 0, 3.5, ease.outCubic));
  g.save(); g.translate(W / 2, H / 2); g.scale(zout, zout); g.translate(-W / 2, -H / 2);
  for (let i = 0; i < cols * rows; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const order = Math.floor(hash(i + 3) * 12);
    const k = P(lb, .05 + order * .0625, .45, ease.outBack);
    if (k <= 0) continue;
    const x = gap + c * (tw + gap), y = gap + r * (th + gap);
    g.save(); g.translate(x + tw / 2, y + th / 2); g.scale(k, k); g.translate(-(x + tw / 2), -(y + th / 2));
    cover(g, ph(imgs[i]), x, y, tw, th, 1.1 + .05 * Math.sin(lb + i), 0, 0);
    // flash de color al entrar
    const fl = 1 - P(lb, .05 + order * .0625, .3, ease.outCubic);
    rect(g, x, y, tw, th, [YEL, BLUE, WHITE][i % 3], fl);
    g.restore();
  }
  g.restore();
  burst(g, W / 2, H / 2, clamp(lb / 1.2), 64, WHITE, 7);
  ring(g, W / 2, H / 2, ease.outExpo(clamp(lb / 1.2)) * 1500, 90 * (1 - clamp(lb / 1.2)), YEL, 1 - clamp(lb / 1.2));
  // tarjeta central
  const kc = P(lb, 1.4, .5, ease.outBack);
  if (kc > 0) {
    g.save(); g.translate(W / 2, H / 2); g.scale(kc, kc); g.rotate(-.03);
    rect(g, -640, -170, 1280, 340, NAVY);
    rect(g, -640, -170, 22, 340, YEL);
    txt(g, 'SEDE Nº1', -600, -40, 190, { fam: 'anton', color: WHITE, align: 'left' });
    txt(g, 'DE ARGENTINA', -600, 96, 76, { fam: 'arch', stretch: 'expanded', weight: 900, color: YEL, align: 'left', track: 6 });
    chip(g, 'GGJ 2025', 470, -110, 22, NAVY, BLUE);
    g.restore();
  }
  FX.flash = hit(lb, 0, .3) * .9;
  FX.ab = .3 + kickPulse(b) * .9;
}

// 10 · 120 JAMMERS → 20 JUEGOS
function sStats(g, b, lb) {
  const beat = Math.floor(lb);
  const imgs = [21, 38, 53, 46];
  bg(g, NAVY);
  cover(g, ph(imgs[beat]), 0, 0, W, H, 1.12 - fract(lb) * .06 + hit(lb, beat, .15) * .05, (beat % 2 ? -1 : 1) * .2, 0);
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(7,11,26,.92)'); gr.addColorStop(.62, 'rgba(7,11,26,.55)'); gr.addColorStop(1, 'rgba(7,11,26,.1)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const first = lb < 2;
  const k = first ? P(lb, 0, 1.4, ease.outCubic) : P(lb, 2, 1.2, ease.outCubic);
  const slide = first ? -P(lb, 1.75, .25, ease.inExpo) * 300 : (1 - P(lb, 2, .3)) * 300;
  g.save(); g.translate(0, slide); g.globalAlpha = first ? 1 - P(lb, 1.8, .2) : P(lb, 2, .15);
  const val = first ? Math.round(k * 120) : Math.round(k * 20);
  txt(g, String(val), 130, 470, 560, { fam: 'anton', color: WHITE, align: 'left' });
  rect(g, 140, 760, 880 * (first ? P(lb, .3, .8) : P(lb, 2.3, .8)), 10, YEL);
  txt(g, first ? 'JAMMERS' : 'JUEGOS PUBLICADOS', 140, 830, 92, { fam: 'arch', stretch: first ? 'expanded' : 'condensed', weight: 900, color: YEL, align: 'left', track: first ? 10 : 2 });
  txt(g, first ? 'GGJ 2025 · EL DOBLE QUE EN 2024' : 'GGJ 2025 · +43 % VS 2024', 144, 920, 28, { fam: 'mono', weight: 700, color: WHITE, align: 'left', track: 5 });
  g.restore();
  corners(g, 50, 60, WHITE, .7);
  FX.ab = .25 + kickPulse(b) * 1.1;
  FX.zoom = 1 + kickPulse(b) * .012;
}

// 11 · RANKING — 172° → 45°
function sRank(g, b, lb) {
  bg(g, BLUE);
  // patrón de líneas diagonales
  g.save(); g.globalAlpha = .12; g.strokeStyle = NAVY; g.lineWidth = 2;
  for (let i = -20; i < 40; i++) { const x = i * 70 + fract(lb / 4) * 70; g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 500, H); g.stroke(); }
  g.restore();
  txt(g, 'RANKING MUNDIAL DE SEDES · GGJ 2025', 120, 120, 28, { fam: 'mono', weight: 800, color: NAVY, align: 'left', track: 6 });
  // 172 tachado → 45
  const k1 = P(lb, 0, .3);
  txt(g, '172°', 120, 270, 170, { fam: 'anton', color: NAVY, align: 'left', alpha: k1 * .55, stroke: 4 });
  const ks = P(lb, .5, .3, ease.inOutCubic);
  line(g, 110, 280, 110 + 330 * ks, 250, RED, 14, 1);
  const k2 = P(lb, 1, .45, ease.outBack);
  g.save(); g.translate(120, 640); g.scale(k2, k2);
  txt(g, '45°', 12, 12, 440, { fam: 'anton', color: NAVY, align: 'left' });
  txt(g, '45°', 0, 0, 440, { fam: 'anton', color: WHITE, align: 'left' });
  g.restore();
  txt(g, 'GLOBAL', 130, 940, 60, { fam: 'arch', stretch: 'expanded', weight: 900, color: NAVY, align: 'left', track: 20, alpha: P(lb, 1.2, .3) });
  // barras
  const bars = [['SUDAMÉRICA', 15, 6], ['HISPANOAMÉRICA', 24, 9], ['ARGENTINA', 3, 1]];
  bars.forEach(([name, from, to], i) => {
    const y = 330 + i * 200;
    const k = P(lb, 1.2 + i * .35, .9, ease.outExpo);
    const x0 = 1000;
    txt(g, name, x0, y - 50, 34, { fam: 'mono', weight: 800, color: NAVY, align: 'left', track: 4, alpha: P(lb, 1 + i * .35, .3) });
    rect(g, x0, y - 18, 780, 36, NAVY, .25);
    rect(g, x0, y - 18, 780 * k, 36, NAVY);
    const val = Math.round(lerp(from, to, k));
    txt(g, `${from}° → ${val}°`, x0 + 780, y - 52, 44, { fam: 'anton', color: WHITE, align: 'right', alpha: P(lb, 1 + i * .35, .3) });
  });
  const kst = P(lb, 3, .35, ease.outBack);
  if (kst > 0) {
    g.save(); g.translate(1390, 920); g.rotate(-.07); g.scale(kst, kst);
    rect(g, -330, -70, 660, 140, YEL);
    txt(g, '+127 PUESTOS', 0, 6, 92, { fam: 'anton', color: NAVY });
    g.restore();
  }
  FX.ab = .2 + kickPulse(b) * .8; FX.vig = .35;
}

// 12 · CARRUSEL TALLERES — 175 CAPACITADOS
function sCarousel(g, b, lb) {
  bg(g, NAVY);
  dotGrid(g, 48, BLUE, .1, b * B);
  const imgs = [42, 2, 43, 24, 23, 47, 5, 13];
  const n = imgs.length;
  const step = Math.floor(lb) + ease.outExpo(fract(lb));
  const base = -step * (Math.PI * 2 / n) * 1;
  const cards = imgs.map((im, i) => {
    const a = base + i * Math.PI * 2 / n;
    return { im, x: Math.sin(a) * 760, z: Math.cos(a), i };
  }).sort((p, q) => p.z - q.z);
  const cy = 600;
  for (const c of cards) {
    const s = .45 + .55 * ((c.z + 1) / 2);
    const w = 560 * s, h = 360 * s;
    const x = W / 2 + c.x - w / 2, y = cy - h / 2 + (1 - s) * -60;
    g.save();
    cover(g, ph(c.im), x, y, w, h, 1.1, 0, 0);
    rect(g, x, y, w, h, NAVY, (1 - (c.z + 1) / 2) * .75);
    if (c.z > .95) { g.strokeStyle = YEL; g.lineWidth = 6; g.strokeRect(x - 3, y - 3, w + 6, h + 6); }
    g.restore();
  }
  const kh = P(lb, 0, .5);
  chars(g, '175', 470, 165, 210, { fam: 'anton', color: YEL }, (i) => ({ dy: (1 - P(lb, i * .08, .5)) * -120, a: P(lb, i * .08, .3) }));
  txt(g, 'PERSONAS CAPACITADAS', 1190, 165, 92, { fam: 'arch', stretch: 'condensed', weight: 900, color: WHITE, alpha: kh });
  const items = ['ARTE 3D', 'GODOT', 'GIT', 'PRODUCCIÓN', 'AUDIO'];
  let x = W / 2 - 520;
  items.forEach((s, i) => {
    const a = P(lb, 1 + i * .25, .3);
    const w = chip(g, s, x, 975, 24, i === Math.floor(lb * 2) % 5 ? NAVY : WHITE, i === Math.floor(lb * 2) % 5 ? YEL : NAVY3, { align: 'left', alpha: a });
    x += w + 18;
  });
  txt(g, '7 TALLERES PRE-GGJ 2026', W / 2, 1040, 20, { fam: 'mono', weight: 700, color: BLUE, track: 6, alpha: P(lb, 1, .4) });
  FX.ab = .25 + kickPulse(b) * .9;
}

// 13 · MARQUESINA DE JUEGOS — 41 JUEGOS
const GAMES = ['BURPOCALYPSE', 'MAGIC BUBBLE GIRL', 'BUGBUBBLE', 'OZONO', 'COBAYO SMASH', 'BOOM', 'BUBBLE TOWER', 'FURBALL', 'BUBBLEMANCER', 'SLIME POPPER', 'RISE OF PATAGONS', 'BURBUJA MENTAL', 'BUBBLE RUBBLE RAT', 'UNDER ZOMOK', 'MASKREATE', 'IN PLAIN SIGHT', 'MASK A CRIME', 'PAZU', 'GOODLES', 'VOID HUNTER VR', 'THE BALLROOM TRADER', 'RUPU ELKA', 'SAPO BASURA', 'FUNNY SLAPPY', "WHO'S NEXT?", 'NO FACE', 'KIVULI', 'SARCOPHAGUS ODYSSEY', 'LIFE IN A BUBBLE', 'ALQUILER IMPAGO'];
function sMarquee(g, b, lb) {
  bg(g, NAVY);
  g.save(); g.translate(W / 2, H / 2); g.rotate(-.12); g.scale(1.25, 1.25); g.translate(-W / 2, -H / 2);
  const rows = 7, rh = 190;
  for (let r = 0; r < rows; r++) {
    const y = -140 + r * rh;
    const dir = r % 2 ? 1 : -1;
    const speed = 340 + r * 40;
    const line_ = Array.from({ length: 6 }, (_, j) => GAMES[(r * 5 + j * 7) % GAMES.length]).join('  ·  ') + '  ·  ';
    setFont(g, 'anton', 150, {});
    const lw = g.measureText(line_).width;
    let off = (lb * B * speed * dir) % lw; if (off > 0) off -= lw;
    for (let k = 0; k < 3; k++) {
      const style = r % 3;
      txt(g, line_, off + k * lw - 300, y, 150, { fam: 'anton', align: 'left', color: style === 0 ? WHITE : style === 1 ? BLUE : YEL, stroke: style === 1 ? 3 : 0, alpha: style === 2 ? .9 : .85 });
    }
  }
  g.restore();
  vgrad(g, 0, H, 'rgba(7,11,26,.0)', 'rgba(7,11,26,.0)');
  const kb = P(lb, .4, .5, ease.outBack);
  const pul = 1 + kickPulse(b) * .03;
  if (kb > 0) {
    g.save(); g.translate(W / 2, H / 2); g.scale(kb * pul, kb * pul); g.rotate(.04);
    rect(g, -470, -230, 940, 460, YEL);
    rect(g, -470, 230, 940, 18, NAVY, .35);
    txt(g, '41 JUEGOS', 0, -38, 230, { fam: 'anton', color: NAVY });
    txt(g, 'EN LAS ÚLTIMAS 2 GLOBAL GAME JAMS', 0, 140, 34, { fam: 'mono', weight: 800, color: NAVY, track: 3 });
    g.restore();
  }
  FX.flash = hit(lb, 0, .25) * .5;
  FX.ab = .3 + kickPulse(b);
}

// 14 · MEGAJAM DE INVIERNO 2025
function sWinter(g, b, lb) {
  bg(g, NAVY);
  const imgs = [[2, 1, 4, 3], [5, 6, 3, 1], [4, 2, 1, 5], [6, 3, 2, 4]];
  const beat = Math.floor(lb);
  const gx = 960, gw = 960, gh = 540;
  for (let i = 0; i < 4; i++) {
    const c = i % 2, r = Math.floor(i / 2);
    const x = gx + c * (gw / 2), y = r * gh;
    const flip = Math.abs(Math.cos(Math.PI * clamp((lb - beat - i * .06) / .35)));
    const im = (lb - beat - i * .06) < .175 && beat > 0 ? imgs[beat - 1][i] : imgs[beat][i];
    const kin = P(lb, i * .1, .5, ease.outExpo);
    g.save(); g.translate(x + gw / 4, y + gh / 2); g.scale(beat === 0 ? kin : Math.max(.02, flip), beat === 0 ? kin : 1); g.translate(-(x + gw / 4), -(y + gh / 2));
    cover(g, ph(im), x + 5, y + 5, gw / 2 - 10, gh - 10, 1.1, 0, 0);
    g.restore();
  }
  // columna izquierda
  rect(g, 0, 0, 960, H, NAVY);
  txt(g, 'MEGAJAM', 110, 250, 210, { fam: 'anton', color: WHITE, align: 'left', alpha: P(lb, 0, .3) });
  txt(g, 'DE INVIERNO 2025', 116, 390, 72, { fam: 'arch', stretch: 'condensed', weight: 900, color: BLUE, align: 'left', track: 4, alpha: P(lb, .2, .3) });
  const stats = [['130', 'PARTICIPANTES'], ['14', 'JUEGOS'], ['87', 'EN TALLERES']];
  stats.forEach(([n, l], i) => {
    const k = P(lb, .7 + i * .8, .4, ease.outBack);
    const y = 560 + i * 150;
    g.save(); g.translate(116, y); g.scale(k, k);
    txt(g, n, 0, 0, 140, { fam: 'anton', color: YEL, align: 'left' });
    txt(g, l, 290, 8, 48, { fam: 'arch', stretch: 'condensed', weight: 800, color: WHITE, align: 'left', track: 3 });
    g.restore();
  });
  txt(g, 'CON UNIVERSIDAD CHAMPAGNAT', 116, 1010, 22, { fam: 'mono', weight: 700, color: '#7d89ad', align: 'left', track: 5, alpha: P(lb, 1, .4) });
  rect(g, 956, 0, 8, H, YEL, P(lb, 0, .4));
  FX.ab = .25 + kickPulse(b) * .9;
}

// 15 · TORMENTA DE FOTOS — verbos
function sStorm(g, b, lb) {
  const step = Math.floor(lb * 2);           // corcheas
  const n = 1 + Math.floor(hash(step + 41) * 62);
  const v = step % 3 === 1 ? 'duo' : 'raw';
  bg(g, NAVY);
  cover(g, ph(n, v), 0, 0, W, H, 1.15 + hash(step) * .25 - fract(lb * 2) * .05, hash(step + 1) * 2 - 1, hash(step + 2) * 2 - 1);
  rect(g, 0, 0, W, H, NAVY, .35);
  const words = ['IDEAR', 'PROGRAMAR', 'DIBUJAR', 'COMPONER'];
  const beat = Math.floor(lb);
  const w = words[beat];
  const k = P(lb, beat, .3);
  const size = fit(g, w, 1650, 360, { fam: 'arch', stretch: 'extra-condensed', weight: 900 });
  g.save(); g.translate(W / 2, H / 2); g.scale(lerp(1.25, 1, k), lerp(1.25, 1, k));
  txt(g, w, 8, 8, size, { fam: 'arch', stretch: 'extra-condensed', weight: 900, color: NAVY, alpha: .6 });
  txt(g, w, 0, 0, size, { fam: 'arch', stretch: 'extra-condensed', weight: 900, color: WHITE });
  rect(g, -300 * k, size * .42, 600 * k, 16, YEL);
  g.restore();
  // contador de juego
  txt(g, `${String(beat + 1).padStart(2, '0')} / 04`, W - 120, 110, 26, { fam: 'mono', weight: 700, color: YEL, align: 'right', track: 4 });
  corners(g, 50, 60, WHITE, .7);
  FX.ab = .6 + kickPulse(b) * 1.2;
  FX.glitch = step % 4 === 3 ? .35 : 0;
}

// 16 · FRANJAS — EL PRIMER PASO HACIA LA INDUSTRIA
function sSlices(g, b, lb) {
  bg(g, NAVY);
  cover(g, ph(34), 0, 0, W, H, 1.1 + lb * .02, 0, 0);
  const n = 12, sh = H / n;
  for (let i = 0; i < n; i++) {
    const k = P(lb, i * .05, .7, ease.inOutExpo);
    const dir = i % 2 ? 1 : -1;
    const x = dir > 0 ? -W + k * W : W - k * W;
    rect(g, x, i * sh, W, sh + 1, NAVY);
  }
  const kt = P(lb, .8, .5);
  const zoomOut = ease.inExpo(clamp((lb - 3.2) / .8));
  g.save(); g.translate(W / 2, H / 2); g.scale(1 + zoomOut * 3, 1 + zoomOut * 3); g.translate(-W / 2, -H / 2);
  chars(g, 'EL PRIMER PASO', W / 2, 430, 190, { fam: 'anton', color: WHITE, track: 4 }, (i) => ({ dy: (1 - P(lb, .8 + i * .03, .5)) * 160, a: P(lb, .8 + i * .03, .3) }));
  chars(g, 'HACIA LA INDUSTRIA', W / 2, 640, 150, { fam: 'anton', color: YEL, track: 4 }, (i) => ({ dy: (1 - P(lb, 1.3 + i * .03, .5)) * 160, a: P(lb, 1.3 + i * .03, .3) }));
  txt(g, 'DE LOS VIDEOJUEGOS', W / 2, 800, 32, { fam: 'mono', weight: 700, color: BLUE, track: 14, alpha: kt * P(lb, 1.8, .4) });
  g.restore();
  // círculo blanco que se abre hacia el breakdown
  const kw = P(lb, 3.35, .65, ease.inExpo);
  if (kw > 0) { g.save(); g.fillStyle = WHITE; g.beginPath(); g.arc(W / 2, H / 2, kw * 1200, 0, Math.PI * 2); g.fill(); g.restore(); }
  FX.ab = .3 + kickPulse(b) * .9;
}

// 17 · ¿QUÉ ES MEGA? (fondo blanco)
function sMega(g, b, lb) {
  bg(g, WHITE);
  // grilla fina
  g.save(); g.strokeStyle = NAVY; g.globalAlpha = .06; g.lineWidth = 1;
  const kg = P(lb, 0, 2, ease.outCubic);
  for (let x = 0; x <= W; x += 96) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H * kg); g.stroke(); }
  for (let y = 0; y <= H; y += 96) { g.beginPath(); g.moveTo(0, y); g.lineTo(W * kg, y); g.stroke(); }
  g.restore();
  const lg = LOGO.megaNavy;
  const lw = 940, lh = lw * lg.height / lg.width;
  const kr = P(lb, .1, 1.2, ease.inOutExpo);
  const lx = (W - lw) / 2, ly = 170;
  g.save(); g.beginPath(); g.rect(lx, ly + lh * (1 - kr), lw, lh * kr); g.clip();
  g.drawImage(lg, lx, ly + (1 - kr) * 60, lw, lh);
  g.restore();
  const words = 'La comunidad de desarrolladores de videojuegos de Mendoza.'.split(' ');
  // dos líneas
  const l1 = words.slice(0, 4), l2 = words.slice(4);
  const drawLine = (ws, y, t0) => {
    const size = 60;
    const full = ws.join(' ');
    const total = measure(g, full, size, { fam: 'sg', weight: 500 });
    let x = W / 2 - total / 2;
    ws.forEach((w, i) => {
      const k = P(lb, t0 + i * .12, .5, ease.outCubic);
      txt(g, w, x, y + (1 - k) * 40, size, { fam: 'sg', weight: 500, color: NAVY, align: 'left', alpha: k });
      x += measure(g, w + ' ', size, { fam: 'sg', weight: 500 });
    });
  };
  drawLine(l1, 760, 1.3); drawLine(l2, 840, 1.7);
  txt(g, 'ASOCIACIÓN MEGA', 110, 90, 24, { fam: 'mono', weight: 800, color: NAVY, align: 'left', track: 6, alpha: P(lb, .3, .4) });
  txt(g, '04 — QUIÉNES SOMOS', W - 110, 90, 24, { fam: 'mono', weight: 800, color: BLUE, align: 'right', track: 6, alpha: P(lb, .3, .4) });
  rect(g, W / 2 - 60, 935, 120 * P(lb, 2.4, .6), 8, YEL);
  FX.vig = .15; FX.grain = .03; FX.ab = .1;
  FX.flash = (1 - P(lb, 0, .5, ease.outCubic)) * .0;
}

// 18 · DISCIPLINAS (iconos animados)
function iconPixel(g, cx, cy, s, t) {
  const heart = ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000', '00000000'];
  const p = s / 9;
  let idx = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (heart[y][x] === '1') { idx++; if (idx / 40 > t) continue; rect(g, cx - 4 * p + x * p, cy - 4 * p + y * p, p - 3, p - 3, (x + y) % 5 === 0 ? WHITE : YEL); }
  }
}
function iconCube(g, cx, cy, s, t) {
  const a = t * 2.2 + .6, bb = .5;
  const V = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    let X = x * Math.cos(a) - z * Math.sin(a), Z = x * Math.sin(a) + z * Math.cos(a);
    let Y = y * Math.cos(bb) - Z * Math.sin(bb); Z = y * Math.sin(bb) + Z * Math.cos(bb);
    const pz = 3.2 / (3.2 + Z);
    V.push([cx + X * s * .28 * pz, cy + Y * s * .28 * pz]);
  }
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  g.save(); g.strokeStyle = BLUE; g.lineWidth = 6; g.lineCap = 'round';
  for (const [i, j] of E) { g.beginPath(); g.moveTo(...V[i]); g.lineTo(...V[j]); g.stroke(); }
  g.fillStyle = WHITE; for (const v of V) { g.beginPath(); g.arc(v[0], v[1], 7, 0, 7); g.fill(); }
  g.restore();
}
function iconCode(g, cx, cy, s, t) {
  txt(g, '</>', cx, cy - s * .12, s * .42, { fam: 'mono', weight: 800, color: YEL });
  for (let i = 0; i < 3; i++) { const w = s * (.25 + hash(i + 3) * .35) * clamp(t * 3 - i); rect(g, cx - s * .32, cy + s * .14 + i * s * .1, w, s * .05, i === 1 ? BLUE : WHITE, .9); }
  if (Math.floor(t * 8) % 2) rect(g, cx + s * .1, cy + s * .14 + 2 * s * .1, s * .04, s * .05, WHITE);
}
function iconWave(g, cx, cy, s, t) {
  const n = 11;
  for (let i = 0; i < n; i++) {
    const h = (.2 + .8 * Math.abs(Math.sin(t * 6 + i * .7) * Math.cos(t * 2.3 + i * .3))) * s * .55;
    rrect(g, cx - s * .36 + i * s * .072, cy - h / 2, s * .045, h, 6, i % 3 === 0 ? YEL : BLUE);
  }
}
function iconPad(g, cx, cy, s, t) {
  const u = s * .1;
  rrect(g, cx - s * .38, cy - u * .6, u * 3.4, u * 1.2, 6, WHITE);
  rrect(g, cx - s * .38 + u * 1.1, cy - u * 1.7, u * 1.2, u * 3.4, 6, WHITE);
  const pressed = Math.floor(t * 4) % 4;
  [[.2, -.1, YEL], [.3, .02, BLUE], [.1, .02, BLUE], [.2, .14, YEL]].forEach(([dx, dy, c], i) => {
    g.save(); g.fillStyle = c; g.globalAlpha = i === pressed ? 1 : .55; g.beginPath(); g.arc(cx + dx * s, cy + dy * s, u * .55 * (i === pressed ? 1.15 : 1), 0, 7); g.fill(); g.restore();
  });
}
function sDisc(g, b, lb) {
  bg(g, WHITE);
  const head = P(lb, 0, .5);
  chars(g, 'UN ESPACIO MULTIDISCIPLINARIO', W / 2, 190, 96, { fam: 'arch', stretch: 'condensed', weight: 900, color: NAVY, track: 2 }, (i) => ({ a: P(lb, i * .015, .3), dy: (1 - P(lb, i * .015, .4)) * 40 }));
  const items = [['ARTE 2D', iconPixel], ['ARTE 3D', iconCube], ['PROGRAMACIÓN', iconCode], ['SONIDO', iconWave], ['GAME DESIGN', iconPad]];
  const tw = 300, gp = 40, total = items.length * tw + (items.length - 1) * gp, x0 = (W - total) / 2;
  items.forEach(([label, fn], i) => {
    const k = P(lb, .4 + i * .45, .5, ease.outBack);
    if (k <= 0) return;
    const x = x0 + i * (tw + gp), y = 330;
    const cx = x + tw / 2, cy = y + tw / 2;
    g.save(); g.translate(cx, cy); g.scale(k, k); g.translate(-cx, -cy);
    rrect(g, x, y, tw, tw, 36, NAVY);
    fn(g, cx, cy, tw, clamp((lb - .4 - i * .45) / 2.5) + lb * .2);
    g.restore();
    txt(g, label, cx, y + tw + 70, 44, { fam: 'arch', stretch: 'condensed', weight: 900, color: NAVY, alpha: P(lb, .6 + i * .45, .3), track: 2 });
  });
  txt(g, 'TALLERES PRÁCTICOS CON GODOT, BLENDER, PIXEL ART Y AUDIO', W / 2, 920, 26, { fam: 'mono', weight: 700, color: BLUE, track: 4, alpha: P(lb, 2.8, .5) });
  FX.vig = .15; FX.grain = .03; FX.ab = .1;
  // colapso al final del compás: el blanco se cierra en una línea
  const kc = P(lb, 3.6, .4, ease.inExpo);
  if (kc > 0) { const hh = H / 2 * kc; rect(g, 0, 0, W, hh, NAVY); rect(g, 0, H - hh, W, hh, NAVY); }
}

// 19 · PARA QUIÉN
function sWho(g, b, lb) {
  bg(g, NAVY);
  const open = 1 - P(lb, 0, .35, ease.outExpo);
  txt(g, 'PARA QUIEN QUIERA EMPEZAR', W / 2, 150, 92, { fam: 'arch', stretch: 'condensed', weight: 900, color: WHITE, alpha: P(lb, .1, .3), track: 2 });
  const cards = [[27, 'PROFESIONALES', 'DE OTRAS INDUSTRIAS'], [31, 'PRINCIPIANTES', 'EN VIDEOJUEGOS'], [26, 'ESTUDIANTES', 'Y ENTUSIASTAS']];
  const cw = 520, ch = 560, gp = 50, x0 = (W - (cw * 3 + gp * 2)) / 2;
  cards.forEach(([im, t1, t2], i) => {
    const k = P(lb, .35 + i * .3, .6, ease.outExpo);
    const x = x0 + i * (cw + gp), y = 250 + (1 - k) * 700;
    g.save(); g.globalAlpha = k;
    g.save(); g.beginPath(); g.roundRect(x, y, cw, ch, 24); g.clip();
    cover(g, ph(im), x, y, cw, ch, 1.15 - lb * .02, 0, -.2);
    vgrad(g, y + ch * .45, y + ch, 'rgba(7,11,26,0)', 'rgba(7,11,26,.95)');
    g.restore();
    txt(g, t1, x + 36, y + ch - 110, 58, { fam: 'anton', color: [YEL, BLUE, WHITE][i], align: 'left' });
    txt(g, t2, x + 38, y + ch - 50, 26, { fam: 'mono', weight: 700, color: WHITE, align: 'left', track: 3 });
    g.restore();
  });
  const chips = [['+18 AÑOS', YEL], ['SIN EXPERIENCIA PREVIA', BLUE], ['CON MENTORES', WHITE]];
  let x = W / 2 - 520;
  chips.forEach(([s, c], i) => {
    const a = P(lb, 2 + i * .4, .3);
    const w = chip(g, s, x, 940, 28, NAVY, c, { align: 'left', alpha: a });
    x += w + 26;
  });
  if (open > 0) { const hh = H / 2 * open; rect(g, 0, 0, W, hh, NAVY); rect(g, 0, H - hh, W, hh, NAVY); line(g, 0, H / 2, W, H / 2, WHITE, 3, open); }
  FX.ab = .2;
}

// 20 · TÚNEL — herramientas, riser
function sTunnel(g, b, lb) {
  bg(g, '#03050c');
  const speed = .35 + ease.inCubic(clamp(lb / 3)) * 1.6;
  const pos = lb * .35 + ease.inCubic(clamp(lb / 3.2)) * 2.2;
  const imgs = [52, 55, 5, 17, 49, 23, 44, 40];
  for (let i = 7; i >= 0; i--) {
    const z = fract(pos + i / 8);
    const s = Math.pow(2.6, z * 6) / 30;
    const w = W * s, h = H * s;
    const a = clamp(z * 4) * clamp((1 - z) * 6);
    const n = imgs[(i + Math.floor(pos + i / 8) * 3) % imgs.length];
    g.save(); g.globalAlpha = a;
    cover(g, ph(n, i % 2 ? 'duo' : 'raw'), W / 2 - w / 2, H / 2 - h / 2, w, h, 1.05, 0, 0);
    g.strokeStyle = i % 2 ? YEL : BLUE; g.lineWidth = Math.max(2, 10 * s); g.strokeRect(W / 2 - w / 2, H / 2 - h / 2, w, h);
    g.restore();
  }
  const tools = ['GODOT', 'BLENDER', 'PIXEL ART', 'AUDIO', 'GIT', 'GAME DESIGN', 'PROTOTIPOS', 'EQUIPO'];
  if (lb < 3) {
    const rate = lb < 1.5 ? 2 : 4;
    const i = Math.floor(lb * rate);
    const w = tools[i % tools.length];
    rect(g, 0, H / 2 - 120, W, 240, NAVY, .55);
    txt(g, w, W / 2, H / 2 + 6, 200, { fam: 'anton', color: WHITE, track: 10 });
  } else {
    bg(g, '#000');
    const k = P(lb, 3, .3);
    txt(g, '¿TE SUMÁS?', W / 2, H / 2, 210, { fam: 'anton', color: YEL, alpha: lb < 3.8 ? k : 0, track: 6 });
  }
  FX.ab = .3 + lb * .35; FX.glitch = lb > 2 && lb < 3 ? .3 : 0;
  FX.sx = (hash(Math.floor(b * 16)) - .5) * 10 * clamp(lb - 2); FX.sy = (hash(Math.floor(b * 16) + 5) - .5) * 10 * clamp(lb - 2);
}

// 21 · REVEAL GGJ MENDOZA 2027
function sReveal(g, b, lb) {
  bg(g, NAVY);
  // rayos
  g.save(); g.translate(W / 2, 470); g.rotate(lb * .05);
  for (let i = 0; i < 24; i++) { g.fillStyle = i % 2 ? BLUE : NAVY2; g.globalAlpha = .1 + kickPulse(b) * .06; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 2000, i * Math.PI / 12, (i + .5) * Math.PI / 12); g.fill(); }
  g.restore();
  const k = P(lb, 0, .6, ease.outExpo);
  const lw = 700 * lerp(1.5, 1, k), lh = lw * LOGO.ggj.height / LOGO.ggj.width;
  g.save(); g.globalAlpha = clamp(lb * 4);
  g.drawImage(LOGO.ggj, W / 2 - lw / 2, 300 - lh / 2, lw, lh);
  g.restore();
  for (let i = 0; i < 3; i++) { const kk = clamp((lb - i * .12) / 1.2); ring(g, W / 2, 300, ease.outExpo(kk) * 1400, 50 * (1 - kk), [YEL, BLUE, WHITE][i], 1 - kk); }
  particles(g, W / 2, 300, clamp(lb / 2), 90, 20, [YEL, BLUE, WHITE]);
  chars(g, 'MENDOZA', W / 2, 610, 84, { fam: 'arch', stretch: 'expanded', weight: 900, color: WHITE, track: 46 }, (i, n) => ({ a: P(lb, .3 + Math.abs(i - 3) * .06, .4), dy: (1 - P(lb, .3 + Math.abs(i - 3) * .06, .5)) * 50 }));
  const kn = P(lb, .5, 2.2, ease.lin);
  rollNumber(g, '2027', W / 2, 840, 360, kn, { fam: 'anton', color: YEL });
  FX.flash = hit(lb, 0, .3) * .95;
  FX.ab = .4 + kickPulse(b) * 1.1;
  FX.zoom = 1 + kickPulse(b) * .015;
}

// 22 · FECHAS 29 · 30 · 31
function sDates(g, b, lb) {
  bg(g, NAVY);
  const cols = [[BLUE, 'VIERNES', '29'], [YEL, 'SÁBADO', '30'], [WHITE, 'DOMINGO', '31']];
  const cw = W / 3;
  cols.forEach(([c, d, n], i) => {
    const k = P(lb, i, .5, ease.outExpo);
    const x = i * cw;
    const hh = H * k;
    rect(g, x, 0, cw + 1, hh, c);
    g.save(); g.beginPath(); g.rect(x, 0, cw, hh); g.clip();
    const kn = P(lb, i + .1, .55, ease.outBack);
    txt(g, n, x + cw / 2, lerp(-300, 470, kn), 520, { fam: 'anton', color: NAVY });
    txt(g, d, x + cw / 2, 140, 52, { fam: 'arch', stretch: 'expanded', weight: 900, color: NAVY, track: 14, alpha: P(lb, i + .2, .3) });
    g.restore();
  });
  const kb = P(lb, 3, .4, ease.outExpo);
  rect(g, 0, 790, W * kb, 180, NAVY);
  g.save(); g.beginPath(); g.rect(0, 790, W * kb, 180); g.clip();
  txt(g, 'ENERO 2027', 120, 884, 130, { fam: 'anton', color: WHITE, align: 'left', track: 6 });
  chip(g, 'PRESENCIAL · MENDOZA', W - 120 - 470, 880, 30, NAVY, YEL, { align: 'left' });
  g.restore();
  FX.ab = .3 + kickPulse(b) * .9;
}

// 23 · CRONOGRAMA — línea de tiempo jugable (2 compases)
function sTimeline(g, b, lb) {
  bg(g, NAVY);
  dotGrid(g, 48, BLUE, .09, b * B);
  txt(g, '3 DÍAS · 48 HORAS · 1 VIDEOJUEGO', 120, 110, 30, { fam: 'mono', weight: 800, color: WHITE, align: 'left', track: 6, alpha: P(lb, 0, .3) });
  const prog = clamp(lb / 7.6);
  txt(g, fmtTime(ease.inOutCubic(prog) * 48 * 3600), W - 120, 110, 44, { fam: 'mono', weight: 700, color: YEL, align: 'right', track: 4 });
  const nodes = [
    { x: 330, t: 0, day: 'VIE 29', hr: '17–21 H', d: 'TEMA + ARMADO DE EQUIPOS', im: 34 },
    { x: 960, t: 2.6, day: 'SÁB 30', hr: '9–19 H', d: 'DESARROLLO Y MENTORÍAS', im: 52 },
    { x: 1590, t: 5.2, day: 'DOM 31', hr: '9–19 H', d: 'CIERRE Y EXPOSICIÓN', im: 17 },
  ];
  const ly = 690;
  const kl = P(lb, 0, .8, ease.outExpo);
  line(g, 120, ly, 120 + (W - 240) * kl, ly, NAVY3, 14);
  const px = lerp(120, W - 120, ease.inOutCubic(prog));
  line(g, 120, ly, px, ly, YEL, 14);
  nodes.forEach((nd, i) => {
    const on = px >= nd.x;
    const kc = P(lb, nd.t + .2, .6, ease.outExpo);
    const pulse = on ? hit(lb, nd.t + .3, .4) : 0;
    ring(g, nd.x, ly, 22 + pulse * 40, 6, on ? YEL : '#3b4a7a', 1);
    g.save(); g.fillStyle = on ? YEL : NAVY3; g.beginPath(); g.arc(nd.x, ly, 14, 0, 7); g.fill(); g.restore();
    if (kc > 0) {
      const cw = 500, ch = 300, x = nd.x - cw / 2, y = 180 + (1 - kc) * 80;
      g.save(); g.globalAlpha = kc;
      g.save(); g.beginPath(); g.roundRect(x, y, cw, ch, 18); g.clip(); cover(g, ph(nd.im), x, y, cw, ch, 1.15, 0, 0); g.restore();
      g.strokeStyle = on ? YEL : BLUE; g.lineWidth = 4; g.beginPath(); g.roundRect(x, y, cw, ch, 18); g.stroke();
      line(g, nd.x, y + ch, nd.x, ly - 24, on ? YEL : BLUE, 3);
      chip(g, nd.day, nd.x, ly + 70, 26, NAVY, [BLUE, YEL, WHITE][i]);
      txt(g, nd.hr, nd.x, ly + 160, 96, { fam: 'anton', color: WHITE });
      txt(g, nd.d, nd.x, ly + 235, 28, { fam: 'arch', stretch: 'condensed', weight: 800, color: '#b8c3e0', track: 2 });
      g.restore();
    }
  });
  // "jugador" sobre la línea
  const bob = Math.abs(Math.sin(lb * Math.PI)) * 26;
  g.save(); g.translate(px, ly - 50 - bob); g.rotate(lb * Math.PI / 2);
  rect(g, -18, -18, 36, 36, WHITE); g.restore();
  for (let i = 1; i < 6; i++) { const tx = px - i * 26; if (tx > 120) rect(g, tx - 6, ly - 56, 12, 12, YEL, .5 - i * .08); }
  FX.ab = .25 + kickPulse(b) * .8;
}

// 24 · OBJETIVOS — una palabra por beat
function sGoals(g, b, lb) {
  const beat = Math.floor(lb);
  const items = [
    [BLUE, NAVY, 'APRENDER', 'UN ESPACIO PRÁCTICO PARA APRENDER HACIENDO', 11],
    [YEL, NAVY, 'CONECTAR', 'COMUNIDAD Y NETWORKING CON LA INDUSTRIA', 45],
    [WHITE, NAVY, 'COLABORAR', 'EQUIPOS MULTIDISCIPLINARIOS: ARTE, CÓDIGO, SONIDO, DISEÑO', 51],
    [NAVY, YEL, 'PROFESIONALIZARSE', 'EL PRIMER PASO HACIA UNA CARRERA EN VIDEOJUEGOS', 38],
  ];
  const [c, fg, w, sub, im] = items[beat];
  bg(g, c);
  const k = fract(lb);
  // foto en franja
  g.save(); g.globalAlpha = .9;
  const bandH = 420;
  cover(g, ph(im, beat === 3 ? 'raw' : 'duo'), 0, H / 2 - bandH / 2, W, bandH, 1.25 - k * .1, (beat % 2 ? 1 : -1) * k * .6, 0);
  g.restore();
  rect(g, 0, H / 2 - bandH / 2, W, bandH, c, beat === 3 ? .35 : .55);
  const size = fit(g, w, 1760, 400, { fam: 'arch', stretch: 'extra-condensed', weight: 900 });
  const s = lerp(1.18, 1, ease.outExpo(clamp(k * 2.5)));
  g.save(); g.translate(W / 2, H / 2); g.scale(s, s);
  txt(g, w, 0, 10, size, { fam: 'arch', stretch: 'extra-condensed', weight: 900, color: fg });
  g.restore();
  txt(g, sub, W / 2, H / 2 + 300, 30, { fam: 'mono', weight: 800, color: fg, track: 4, alpha: P(lb, beat + .1, .3) });
  txt(g, `OBJETIVO 0${beat + 1}`, W / 2, H / 2 - 300, 26, { fam: 'mono', weight: 800, color: fg, track: 10 });
  FX.flash = beat === 0 ? hit(lb, 0, .25) * .5 : 0;
  FX.ab = .3 + kickPulse(b) * 1.0;
  FX.zoom = 1 + kickPulse(b) * .02;
}

// 25 · MOSAICO DE ROSTROS
function sMosaic(g, b, lb) {
  bg(g, NAVY);
  const cols = 10, rows = 6, tw = W / cols, th = H / rows;
  const focus = 33, fc = 4, fr = 2;
  const kz = P(lb, 0, 2.6, ease.inOutExpo);
  const z = lerp(cols, 1, kz);
  const fx = (fc + .5) * tw, fy = (fr + .5) * th;
  g.save();
  g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-lerp(fx, W / 2, kz), -lerp(fy, H / 2, kz));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    const n = (c === fc && r === fr) ? focus : 1 + Math.floor(hash(i * 3.7 + 1) * 62);
    cover(g, ph(n), c * tw + 2, r * th + 2, tw - 4, th - 4, 1.2, 0, 0);
    const blink = hash(i + Math.floor(lb * 4) * 17);
    if (blink < .08 && kz > .6) rect(g, c * tw + 2, r * th + 2, tw - 4, th - 4, blink < .04 ? YEL : BLUE, .85);
  }
  g.restore();
  const kb = P(lb, 2.6, .5, ease.outExpo);
  if (kb > 0) {
    rect(g, 0, H / 2 - 150, W * kb, 300, NAVY, .92);
    g.save(); g.beginPath(); g.rect(0, H / 2 - 150, W * kb, 300); g.clip();
    txt(g, 'TU PRIMER JUEGO EMPIEZA ACÁ', W / 2, H / 2 + 8, 150, { fam: 'anton', color: WHITE, track: 2 });
    g.restore();
  }
  FX.ab = .3 + kickPulse(b) * .9;
}

// 26 · COMUNIDAD — fotos grupales tipo polaroid
function sGroups(g, b, lb) {
  bg(g, NAVY2);
  dotGrid(g, 48, BLUE, .1, b * B);
  const pics = [[58, -330, -40, -.12], [20, 320, -70, .09], [59, -120, 60, .05], [60, 180, 40, -.04]];
  pics.forEach(([n, x, y, r], i) => {
    const k = P(lb, i * .5, .5, ease.outBack);
    if (k <= 0) return;
    const w = 820, h = 560;
    g.save(); g.translate(W / 2 + x, H / 2 + y + (1 - k) * -900); g.rotate(r * k + (1 - k) * .6);
    rect(g, -w / 2 - 18, -h / 2 - 18, w + 36, h + 90, WHITE);
    rect(g, -w / 2 + 10, -h / 2 + 10, w, h, '#000', .2);
    cover(g, ph(n), -w / 2, -h / 2, w, h, 1.05, 0, 0);
    txt(g, ['GGJ 2025', 'JAM DE PRIMAVERA', 'GGJ 2025', 'GGJ 2025'][i], -w / 2 + 10, h / 2 + 36, 28, { fam: 'mono', weight: 800, color: NAVY, align: 'left', track: 3 });
    g.restore();
  });
  const kt = P(lb, 2.2, .5);
  g.save(); g.globalAlpha = kt;
  rect(g, 0, H - 210, W, 210, YEL, 1);
  txt(g, 'SOMOS COMUNIDAD', W / 2, H - 100, 150, { fam: 'anton', color: NAVY, track: 6 });
  g.restore();
  FX.ab = .3 + kickPulse(b) * .9;
}

// 27 · FOTO GRUPAL HEROICA + colapso
function sHero(g, b, lb) {
  bg(g, '#000');
  const kc = P(lb, 3, 1, ease.inExpo);
  const w = lerp(W, 40, kc), h = lerp(H, 40, kc);
  g.save(); g.beginPath(); g.roundRect(W / 2 - w / 2, H / 2 - h / 2, w, h, lerp(0, 20, kc)); g.clip();
  cover(g, ph(60), W / 2 - w / 2, H / 2 - h / 2, w, h, 1.18 - lb * .03, 0, -.3);
  rect(g, 0, 0, W, H, NAVY, .15 + kc * .8);
  g.restore();
  if (kc < .5) {
    vgrad(g, 0, 420, 'rgba(7,11,26,.85)', 'rgba(7,11,26,0)'); vgrad(g, H - 420, H, 'rgba(7,11,26,0)', 'rgba(7,11,26,.85)');
    chars(g, 'HACEMOS JUEGOS', W / 2, 190, 200, { fam: 'anton', color: WHITE, track: 6 }, (i) => ({ a: P(lb, i * .04, .3), dy: (1 - P(lb, i * .04, .5)) * -120 }));
    chars(g, 'HACEMOS AMIGOS', W / 2, 890, 200, { fam: 'anton', color: YEL, track: 6 }, (i) => ({ a: P(lb, 1 + i * .04, .3), dy: (1 - P(lb, 1 + i * .04, .5)) * 120 }));
  }
  FX.ab = .3 + kickPulse(b) * .9;
}

// 28 · LOCKUP FINAL
function sLockup(g, b, lb) {
  bg(g, NAVY);
  dotGrid(g, 48, BLUE, .1, b * B, P(lb, 0, 2, ease.outCubic) * 1400);
  g.save(); g.translate(W / 2, H / 2); g.rotate(-lb * .03);
  for (let i = 0; i < 24; i++) { g.fillStyle = BLUE; g.globalAlpha = .045; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 2000, i * Math.PI / 12, (i + .5) * Math.PI / 12); g.fill(); }
  g.restore();
  const k = P(lb, 0, .7, ease.outExpo);
  const lw = 620, lh = lw * LOGO.ggj.height / LOGO.ggj.width;
  g.save(); g.globalAlpha = k; g.drawImage(LOGO.ggj, 560 - lw / 2 - (1 - k) * 200, 420 - lh / 2, lw, lh); g.restore();
  const kd = P(lb, .3, .6, ease.inOutExpo);
  line(g, 960, 420 - 230 * kd, 960, 420 + 230 * kd, WHITE, 3, .5);
  const right = (s, y, size, o, t0) => {
    const kk = P(lb, t0, .5, ease.outExpo);
    g.save(); g.beginPath(); g.rect(1010, y - size, 900, size * 2); g.clip();
    txt(g, s, 1030, y + (1 - kk) * size * 1.2, size, { ...o, align: 'left' });
    g.restore();
  };
  right('MENDOZA', 236, 96, { fam: 'arch', stretch: 'expanded', weight: 900, color: WHITE, track: 20 }, .4);
  right('2027', 440, 230, { fam: 'anton', color: YEL, track: 4 }, .55);
  right('29 — 31 DE ENERO', 625, 60, { fam: 'arch', stretch: 'condensed', weight: 900, color: BLUE, track: 6 }, .7);
  // franja inferior
  const kf = P(lb, 1.2, .6, ease.outExpo);
  rect(g, 0, 800, W, 280, NAVY2, kf);
  line(g, 0, 800, W * kf, 800, BLUE, 3, .7);
  g.save(); g.globalAlpha = kf;
  txt(g, 'ORGANIZA', 120, 880, 22, { fam: 'mono', weight: 800, color: '#7d89ad', align: 'left', track: 6 });
  const mw = 330, mh = mw * LOGO.mega.height / LOGO.mega.width;
  g.drawImage(LOGO.mega, 112, 900, mw, mh);
  txt(g, 'JUNTO AL GOBIERNO DE MENDOZA', 560, 880, 22, { fam: 'mono', weight: 800, color: '#7d89ad', align: 'left', track: 6 });
  txt(g, 'Subsecretaría de Empleo y Capacitación', 560, 930, 30, { fam: 'sg', weight: 500, color: WHITE, align: 'left' });
  g.restore();
  txt(g, typeOn('globalgamejammendoza.com', P(lb, 2, 1.2, ease.lin)), W - 120, 900, 40, { fam: 'mono', weight: 700, color: YEL, align: 'right' });
  txt(g, typeOn('linktr.ee/comunidad.mega', P(lb, 3, 1.2, ease.lin)), W - 120, 960, 30, { fam: 'mono', weight: 600, color: WHITE, align: 'right' });
  FX.flash = hit(lb, 0, .3) * .9;
  FX.ab = .2 + kickPulse(b) * .6;
}

// 29 · ¿JUGAMOS? — final
function sEnd(g, b, lb) {
  bg(g, '#000');
  const k = P(lb, 0, .5, ease.outExpo);
  const fade = 1 - P(lb, 5.6, 1.6, ease.inOutCubic);
  g.save(); g.globalAlpha = fade;
  const cx = W / 2, cy = 470;
  // botón play que se dibuja
  const kp = P(lb, .2, .9, ease.inOutCubic);
  g.save(); g.translate(cx, cy - 20); g.scale(lerp(.6, 1, k), lerp(.6, 1, k));
  ring(g, 0, 0, 150, 10, WHITE, .25);
  g.strokeStyle = YEL; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 150, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * kp); g.stroke();
  g.fillStyle = YEL; g.globalAlpha = P(lb, .8, .4);
  g.beginPath(); g.moveTo(-40, -65); g.lineTo(75, 0); g.lineTo(-40, 65); g.closePath(); g.fill();
  g.restore();
  chars(g, '¿JUGAMOS?', W / 2, 790, 210, { fam: 'anton', color: WHITE, track: 8 }, (i) => ({ a: P(lb, .6 + i * .05, .3), s: lerp(1.6, 1, P(lb, .6 + i * .05, .5)) }));
  txt(g, 'GLOBAL GAME JAM MENDOZA · 29—31.01.2027', W / 2, 950, 26, { fam: 'mono', weight: 700, color: BLUE, track: 8, alpha: P(lb, 1.6, .6) });
  g.restore();
  FX.flash = hit(lb, 0, .35) * .9;
  FX.ab = .2;
  FX.vig = .7;
}

// ── línea de tiempo (en compases) ─────────────────────────────────────────
const SCENES = [
  [0, 1, sBoot], [1, 2, s48], [2, 3, sOne], [3, 4, sGlobe],
  [4, 5, sMendoza], [5, 6, sTriptych], [6, 7, sEditions], [7, 8, sCount],
  [8, 9, sGrid], [9, 10, sStats], [10, 11, sRank], [11, 12, sCarousel],
  [12, 13, sMarquee], [13, 14, sWinter], [14, 15, sStorm], [15, 16, sSlices],
  [16, 17, sMega], [17, 18, sDisc], [18, 19, sWho], [19, 20, sTunnel],
  [20, 21, sReveal], [21, 22, sDates], [22, 24, sTimeline], [24, 25, sGoals],
  [25, 26, sMosaic], [26, 27, sGroups], [27, 28, sHero], [28, 30, sLockup],
  [30, 32, sEnd],
];
const CHAPTERS = [[0, '01', '48 HORAS'], [4, '02', 'MENDOZA'], [8, '03', 'COMUNIDAD'], [16, '04', 'MEGA'], [20, '05', 'GGJ 2027'], [28, '06', 'TE ESPERAMOS']];

// HUD persistente tipo broadcast
function hud(g, b, t) {
  const bar = b / 4;
  if (bar >= 28) return;
  const light = (bar >= 16 && bar < 18);
  const c = light ? NAVY : WHITE;
  const ch = [...CHAPTERS].reverse().find(([s]) => bar >= s);
  const kIn = P(b, ch[0] * 4, 1, ease.outExpo);
  g.save(); g.globalAlpha = .9;
  txt(g, `${ch[1]}`, 60, H - 52, 20, { fam: 'mono', weight: 800, color: light ? BLUE : YEL, align: 'left', track: 2 });
  txt(g, `— ${ch[2]}`.slice(0, Math.ceil(kIn * (ch[2].length + 2))), 96, H - 52, 20, { fam: 'mono', weight: 600, color: c, align: 'left', track: 4 });
  const fr = Math.floor(t * FPS);
  const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}:${String(fr % FPS).padStart(2, '0')}`;
  txt(g, tc, W - 60, H - 52, 20, { fam: 'mono', weight: 600, color: c, align: 'right', track: 3 });
  // barra de progreso del reel
  rect(g, 60, H - 30, W - 120, 2, c, .18);
  rect(g, 60, H - 30, (W - 120) * (t / DUR), 2, light ? BLUE : YEL, .9);
  // beat dots
  for (let i = 0; i < 4; i++) rect(g, W - 60 - 150 + i * 14 - 60, H - 58, 8, 8, Math.floor(b) % 4 === i ? (light ? BLUE : YEL) : c, Math.floor(b) % 4 === i ? 1 : .25);
  if (bar < 4) {
    txt(g, 'GGJ MENDOZA', 60, 56, 20, { fam: 'mono', weight: 800, color: c, align: 'left', track: 4 });
    const blink = Math.floor(t * 2) % 2;
    g.fillStyle = RED; g.globalAlpha = blink ? .95 : .25; g.beginPath(); g.arc(W - 150, 56, 8, 0, 7); g.fill(); g.globalAlpha = .9;
    txt(g, 'REC', W - 60, 56, 20, { fam: 'mono', weight: 800, color: c, align: 'right', track: 4 });
  }
  g.restore();
}

// ── post-proceso WebGL ────────────────────────────────────────────────────
let out = document.getElementById('out');
let gl = null;
try { gl = out.getContext('webgl', { preserveDrawingBuffer: true, antialias: false }); } catch (e) { gl = null; }
let POST = !!gl, out2d = null, vigGrad = null;
// si WebGL no está o no acepta la imagen (file://), se reemplaza el lienzo por uno 2D
function fallback2D() {
  POST = false;
  const c = document.createElement('canvas');
  c.width = W; c.height = H; c.id = 'out';
  if (out.getAttribute('aria-label')) c.setAttribute('aria-label', out.getAttribute('aria-label'));
  out.replaceWith(c); out = c;
  out2d = c.getContext('2d');
  vigGrad = out2d.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * 1.05);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)'); vigGrad.addColorStop(1, 'rgba(0,0,0,1)');
}

const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = p*.5+.5; uv.y = 1.-uv.y; gl_Position = vec4(p,0.,1.); }`;
const FS = `precision highp float; varying vec2 uv; uniform sampler2D tex;
uniform float t, ab, glitch, grain, flash, vig;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec2 u = uv;
  if (glitch > 0.) {
    float row = floor(u.y * 36.);
    float r = h(vec2(row, floor(t * 24.)));
    if (r < glitch * .45) u.x += (h(vec2(row, t)) - .5) * .12 * glitch;
    float bk = h(vec2(floor(u.y*9.), floor(u.x*7.) + floor(t*12.)));
    if (bk < glitch * .08) u += vec2(.03, 0.) * glitch;
  }
  vec2 d = u - .5;
  float r2 = dot(d, d);
  vec2 off = d * ab * .012 * (.4 + r2 * 3.);
  vec3 c;
  c.r = texture2D(tex, u + off).r;
  c.g = texture2D(tex, u).g;
  c.b = texture2D(tex, u - off).b;
  c *= 1. - vig * smoothstep(.12, .62, r2);
  float n = h(uv * vec2(1920., 1080.) + fract(t * 7.13) * 100.) - .5;
  c += n * grain;
  c = mix(c, vec3(1.), clamp(flash, 0., 1.));
  gl_FragColor = vec4(c, 1.);
}`;
const U = {};
let texo = null;
if (gl) {
  try {
  function sh(type, s) { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; }
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  texo = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texo);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  for (const n of ['t', 'ab', 'glitch', 'grain', 'flash', 'vig']) U[n] = gl.getUniformLocation(prog, n);
  gl.viewport(0, 0, W, H);
  } catch (e) { console.warn('WebGL no disponible, salida 2D', e); POST = false; }
}

// ── cuadro ────────────────────────────────────────────────────────────────
function renderFrame(t) {
  t = clamp(t, 0, DUR - 1e-6);
  const b = t / B, bar = b / 4;
  resetFX();
  const sc = SCENES.find(([a, z]) => bar >= a && bar < z) || SCENES[SCENES.length - 1];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
  // la escena define FX; la dibujamos en una capa para aplicar cámara después
  const L = layer(0);
  sc[2](L.g, b, b - sc[0] * 4);
  // destello de corte en cambio de escena (sutil)
  const cut = b - sc[0] * 4;
  if (cut < .12 && sc[0] > 0) FX.ab += (1 - cut / .12) * .8;
  // cámara
  ctx.save();
  ctx.translate(W / 2 + FX.sx, H / 2 + FX.sy); ctx.scale(FX.zoom, FX.zoom); ctx.rotate(FX.rot); ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(L.c, 0, 0);
  ctx.restore();
  hud(ctx, b, t);
  // post
  if (POST) {
    try { gl.bindTexture(gl.TEXTURE_2D, texo); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); }
    catch (e) { fallback2D(); }
  } else if (!out2d) fallback2D();
  if (!POST) {
    out2d.drawImage(src, 0, 0);
    if (FX.vig > 0) { out2d.globalAlpha = clamp(FX.vig * .6); out2d.fillStyle = vigGrad; out2d.fillRect(0, 0, W, H); out2d.globalAlpha = 1; }
    if (FX.flash > 0) { out2d.globalAlpha = clamp(FX.flash); out2d.fillStyle = '#fff'; out2d.fillRect(0, 0, W, H); out2d.globalAlpha = 1; }
    return;
  }
  gl.uniform1f(U.t, t); gl.uniform1f(U.ab, FX.ab); gl.uniform1f(U.glitch, FX.glitch); gl.uniform1f(U.grain, FX.grain);
  gl.uniform1f(U.flash, FX.flash); gl.uniform1f(U.vig, FX.vig);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// ── modos: render (Playwright) o preview (navegador) ──────────────────────
window.REEL = { W, H, FPS, DUR, ready: false, renderFrame, grab: (q = .93) => out.toDataURL('image/jpeg', q) };
window.addEventListener('error', e => { const el = document.getElementById('loadtxt'); if (el && !document.body.classList.contains('loaded')) el.textContent = 'ERROR AL CARGAR · ' + (e.message || ''); });
const isRender = new URLSearchParams(location.search).has('render');
const $ = id => document.getElementById(id);
loadAll(k => { if (!isRender && $('bar')) $('bar').style.transform = `scaleX(${k})`; }).catch(e => {
  console.error(e);
  if ($('loadtxt')) $('loadtxt').textContent = 'NO SE PUDO CARGAR · ' + (e && e.message ? e.message : e);
  throw e;
}).then(() => {
  window.REEL.ready = true;
  if (isRender) { document.body.classList.add('render'); renderFrame(0); return; }

  // ── reproductor web ──
  const audio = $('music'), stage = $('stage');
  renderFrame(38.6);           // portada: el reveal de 2027 (si hace falta, acá se cambia a salida 2D)
  let playing = false, started = false, t0 = 0, tStart = 0, hideTimer = 0;
  const now = () => playing ? (performance.now() - tStart) / 1000 + t0 : t0;
  let lastSync = 0;
  const syncAudio = t => {
    if (!playing || audio.paused || audio.readyState < 2) return;
    const pn = performance.now();
    if (pn - lastSync < 400) return;
    lastSync = pn;
    const drift = audio.currentTime - t;
    // el audio manda si está sano: corremos el reloj hacia él; si se fue lejos (seek fallido), lo reubicamos
    if (Math.abs(drift) < .25) { tStart -= drift * 1000 * .5; }
    else { try { audio.currentTime = t; } catch (e) {} }
  };
  const setUI = () => {
    document.body.classList.toggle('playing', playing);
    document.body.classList.toggle('started', started);
    $('pp').textContent = playing ? '❚❚' : '▶';
    $('pp').setAttribute('aria-label', playing ? 'Pausa' : 'Reproducir');
  };
  const play = () => {
    if (t0 >= DUR - .05) t0 = 0;
    started = true; playing = true;
    try { audio.currentTime = t0; } catch (e) {}
    audio.play().catch(() => {});
    tStart = performance.now(); lastSync = performance.now();
    document.body.classList.remove('ended');
    setUI(); poke();
  };
  const pause = () => { t0 = now(); playing = false; audio.pause(); setUI(); poke(); };
  const toggle = () => playing ? pause() : play();
  const seek = s => { t0 = clamp(s, 0, DUR - .01); tStart = performance.now(); lastSync = performance.now(); try { audio.currentTime = t0; } catch (e) {} if (!playing) renderFrame(t0); poke(); };
  const fs = () => {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else (stage.requestFullscreen || stage.webkitRequestFullscreen || (() => {})).call(stage);
  };
  // los controles se esconden mientras corre
  const poke = () => { document.body.classList.add('ui'); clearTimeout(hideTimer); if (playing) hideTimer = setTimeout(() => document.body.classList.remove('ui'), 2200); };
  addEventListener('pointermove', poke);

  $('start').onclick = play;
  $('replay').onclick = () => { t0 = 0; play(); };
  $('pp').onclick = toggle;
  $('fs').onclick = fs;
  $('out').onclick = () => { if (started) toggle(); };
  $('scrub').oninput = e => seek(+e.target.value / 1000 * DUR);
  addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); started ? toggle() : play(); }
    else if (e.code === 'ArrowRight') seek(now() + 2);
    else if (e.code === 'ArrowLeft') seek(now() - 2);
    else if (e.code === 'KeyF') fs();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause(); });

  document.body.classList.add('loaded');
  setUI();
  let lastDrawn = -1;
  const loop = () => {
    const t = now();
    if (playing && t >= DUR - .02) { playing = false; t0 = DUR - .02; audio.pause(); document.body.classList.add('ended'); setUI(); poke(); }
    syncAudio(t);
    if (started && (playing || t !== lastDrawn)) { renderFrame(Math.min(t, DUR - .001)); lastDrawn = t; }
    $('scrub').value = Math.round(t / DUR * 1000);
    const s = Math.floor(t);
    $('tc').textContent = `0:${String(Math.min(s, 59)).padStart(2, '0')} / 1:00`;
    requestAnimationFrame(loop);
  };
  loop();
});
