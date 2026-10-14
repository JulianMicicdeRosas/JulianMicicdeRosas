// ─────────────────────────────────────────────────────────────────────────────
//  shapeLibrary.js — Biblioteca base de figuras (viewBox 0 0 512 512).
//
//  Cada figura es una lista de capas:
//    { d, op: 'fill' }              → se une al volumen
//    { d, op: 'cut' }               → perfora el volumen (ojos, puertas…)
//    { d, op: 'stroke', width }     → trazo grueso (espirales, rayos, dedos)
//  Todas las capas aportan también su trazo como contorno tipográfico.
//  Es el respaldo cuando el LLM no envía svg_paths válidos.
// ─────────────────────────────────────────────────────────────────────────────

const f = (n) => +n.toFixed(1);

function circle(cx, cy, r) {
  return `M ${f(cx + r)} ${cy} A ${r} ${r} 0 1 0 ${f(cx - r)} ${cy} A ${r} ${r} 0 1 0 ${f(cx + r)} ${cy} Z`;
}

function ellipse(cx, cy, rx, ry, rotDeg = 0) {
  const a = (rotDeg * Math.PI) / 180;
  const dx = Math.cos(a) * rx;
  const dy = Math.sin(a) * rx;
  return `M ${f(cx + dx)} ${f(cy + dy)} A ${rx} ${ry} ${rotDeg} 1 0 ${f(cx - dx)} ${f(cy - dy)} A ${rx} ${ry} ${rotDeg} 1 0 ${f(cx + dx)} ${f(cy + dy)} Z`;
}

function polygon(pts) {
  return 'M ' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ') + ' Z';
}

function polyline(pts) {
  return 'M ' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ');
}

function star(cx, cy, n, rOut, rIn, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? rIn : rOut;
    const a = rot + (i * Math.PI) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return polygon(pts);
}

function spiral(cx, cy, turns, r0, r1) {
  const pts = [];
  const steps = Math.round(turns * 90);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return polyline(pts);
}

function wave(y, amp, periods, phase, x0 = 30, x1 = 482) {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const x = x0 + (x1 - x0) * t;
    pts.push([x, y + Math.sin(t * periods * Math.PI * 2 + phase) * amp * (0.55 + 0.45 * Math.sin(t * Math.PI))]);
  }
  return polyline(pts);
}

function sunRays() {
  const out = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r0 = 128;
    const r1 = i % 2 ? 196 : 232;
    out.push({ d: `M ${f(256 + Math.cos(a) * r0)} ${f(256 + Math.sin(a) * r0)} L ${f(256 + Math.cos(a) * r1)} ${f(256 + Math.sin(a) * r1)}`, op: 'stroke', width: 16 });
  }
  return out;
}

function flowerPetals() {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    out.push({ d: ellipse(256 + Math.cos(a) * 82, 196 + Math.sin(a) * 82, 70, 38, (a * 180) / Math.PI), op: 'fill' });
  }
  return out;
}

export const SHAPES = {
  luna: [{ d: 'M 330 78 A 180 180 0 1 0 330 434 A 220 220 0 0 1 330 78 Z', op: 'fill' }],
  corazon: [
    {
      d: 'M 256 446 C 120 344 40 262 40 170 C 40 100 95 58 155 58 C 200 58 235 84 256 124 C 277 84 312 58 357 58 C 417 58 472 100 472 170 C 472 262 392 344 256 446 Z',
      op: 'fill',
    },
  ],
  gota: [{ d: 'M 256 42 C 256 42 384 214 384 318 C 384 394 326 456 256 456 C 186 456 128 394 128 318 C 128 214 256 42 256 42 Z', op: 'fill' }],
  ojo: [
    { d: 'M 30 256 Q 256 52 482 256 Q 256 460 30 256 Z', op: 'fill' },
    { d: circle(256, 256, 92), op: 'cut' },
    { d: circle(256, 256, 54), op: 'fill' },
  ],
  sol: [{ d: circle(256, 256, 98), op: 'fill' }, ...sunRays()],
  estrella: [{ d: star(256, 268, 5, 232, 94), op: 'fill' }],
  espiral: [{ d: spiral(256, 256, 4.2, 10, 222), op: 'stroke', width: 22 }],
  ola: [
    { d: wave(150, 46, 1.6, 0.0), op: 'stroke', width: 20 },
    { d: wave(250, 56, 1.6, 0.9), op: 'stroke', width: 24 },
    { d: wave(352, 46, 1.6, 1.8), op: 'stroke', width: 20 },
  ],
  arbol: [
    { d: polygon([[236, 470], [242, 300], [210, 250], [226, 244], [252, 282], [286, 228], [300, 236], [270, 300], [276, 470]]), op: 'fill' },
    { d: circle(256, 170, 96), op: 'fill' },
    { d: circle(170, 214, 70), op: 'fill' },
    { d: circle(342, 214, 70), op: 'fill' },
    { d: circle(196, 124, 62), op: 'fill' },
    { d: circle(318, 124, 62), op: 'fill' },
  ],
  pajaro: [
    {
      d: 'M 34 232 C 116 146 200 156 256 252 C 312 156 396 146 478 232 C 394 202 322 216 272 292 L 256 312 L 240 292 C 190 216 118 202 34 232 Z',
      op: 'fill',
    },
  ],
  pez: [
    { d: 'M 70 256 C 150 140 316 140 382 256 C 316 372 150 372 70 256 Z', op: 'fill' },
    { d: 'M 376 256 L 474 168 L 446 256 L 474 344 Z', op: 'fill' },
    { d: circle(148, 236, 13), op: 'cut' },
  ],
  hoja: [
    { d: 'M 256 36 C 384 120 426 300 256 476 C 86 300 128 120 256 36 Z', op: 'fill' },
    { d: 'M 256 80 L 256 450', op: 'stroke', width: 8 },
  ],
  flor: [
    ...flowerPetals(),
    { d: circle(256, 196, 46), op: 'fill' },
    { d: 'M 256 260 C 250 330 266 400 252 480', op: 'stroke', width: 14 },
    { d: ellipse(300, 390, 46, 18, -30), op: 'fill' },
  ],
  montana: [
    { d: polygon([[16, 452], [168, 168], [236, 286], [330, 104], [496, 452]]), op: 'fill' },
    { d: polygon([[330, 104], [362, 166], [342, 158], [326, 178], [306, 152], [300, 162]]), op: 'cut' },
  ],
  llama: [
    {
      d: 'M 256 28 C 302 118 392 170 382 300 C 374 400 312 472 256 472 C 190 472 130 410 132 320 C 134 250 180 220 190 158 C 220 200 226 240 240 250 C 250 180 230 100 256 28 Z',
      op: 'fill',
    },
    { d: 'M 256 300 C 286 340 300 380 290 414 C 280 444 232 444 222 414 C 212 380 236 350 256 300 Z', op: 'cut' },
  ],
  mariposa: [
    { d: ellipse(166, 190, 110, 76, -28), op: 'fill' },
    { d: ellipse(346, 190, 110, 76, 28), op: 'fill' },
    { d: ellipse(186, 330, 74, 52, 34), op: 'fill' },
    { d: ellipse(326, 330, 74, 52, -34), op: 'fill' },
    { d: ellipse(256, 262, 14, 120, 0), op: 'fill' },
    { d: 'M 252 150 C 240 110 214 86 190 76 M 260 150 C 272 110 298 86 322 76', op: 'stroke', width: 6 },
  ],
  reloj: [
    { d: circle(256, 256, 214), op: 'fill' },
    { d: circle(256, 256, 184), op: 'cut' },
    { d: 'M 256 256 L 256 104', op: 'stroke', width: 18 },
    { d: 'M 256 256 L 362 316', op: 'stroke', width: 22 },
    { d: circle(256, 256, 20), op: 'fill' },
  ],
  casa: [
    { d: polygon([[92, 472], [92, 250], [256, 96], [420, 250], [420, 472]]), op: 'fill' },
    { d: polygon([[220, 472], [220, 352], [292, 352], [292, 472]]), op: 'cut' },
    { d: polygon([[138, 286], [138, 236], [190, 236], [190, 286]]), op: 'cut' },
    { d: polygon([[322, 286], [322, 236], [374, 236], [374, 286]]), op: 'cut' },
  ],
  mano: [
    { d: ellipse(262, 340, 106, 120, 0), op: 'fill' },
    { d: 'M 196 300 L 176 106', op: 'stroke', width: 48 },
    { d: 'M 244 290 L 238 70', op: 'stroke', width: 50 },
    { d: 'M 290 290 L 302 84', op: 'stroke', width: 48 },
    { d: 'M 330 310 L 362 138', op: 'stroke', width: 44 },
    { d: 'M 172 370 L 90 270', op: 'stroke', width: 46 },
  ],
  nube: [
    { d: circle(190, 280, 82), op: 'fill' },
    { d: circle(282, 226, 106), op: 'fill' },
    { d: circle(372, 290, 74), op: 'fill' },
    { d: polygon([[110, 300], [446, 300], [446, 364], [110, 364]]), op: 'fill' },
    { d: 'M 150 412 L 130 470 M 230 412 L 210 470 M 310 412 L 290 470 M 390 412 L 370 470', op: 'stroke', width: 6 },
  ],
};

export const SHAPE_NAMES = Object.keys(SHAPES);
