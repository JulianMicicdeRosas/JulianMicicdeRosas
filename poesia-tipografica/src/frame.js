// Formato de salida: un cuadro de proporción fija (p. ej. 1822 × 737) centrado en la ventana, o pantalla completa.
// Todas las capas (WebGL, logos, imágenes) leen el mismo rectángulo; fuera de él queda negro.

export const DEFAULT_FORMAT = '8400x690/3175,1775,3450';

// Con '@N' los primeros N px del ancho no se ven (p. ej. '13480x1080@1920': el primer proyector apagado): la salida
// ocupa la ventana entera pero todo se compone y se dibuja sólo en los 11560 px restantes.

// el lanzador puede fijar el formato en la URL (?formato=13480x1080@1920): manda sobre el panel C
const URL_FORMAT = new URLSearchParams(location.search).get('formato');
let fmt = parseFormat(URL_FORMAT || DEFAULT_FORMAT);

// Con '/A,B,C' la salida son paredes contiguas de A, B y C px de ancho (p. ej. '8400x690/3175,1775,3450': oeste,
// norte y este). La pared de frente es la del medio (o la marcada con *, p. ej. '/3175,*1775,3450'): ahí van el título,
// los logos, los nombres, el verso y los dibujos; en las esquinas no se parte ninguna palabra.

/** '1822x737' / '13480x1080@1920' / '8400x690/3175,1775,3450' → {w, h, skip, walls}; 'pantalla' → null = pantalla completa. */
export function parseFormat(s) {
  const str = String(s || '');
  const m = str.match(/(\d{3,5})\s*[x×X*]\s*(\d{3,5})(?:\s*@\s*(\d{1,5}))?/);
  if (!m) return null;
  const w = +m[1], h = +m[2], skip = Math.min(+(m[3] || 0), w - 100);
  let walls = null, front = 0;
  const wm = str.match(/\/\s*(\*?\d{2,5}(?:\s*,\s*\*?\d{2,5})+)/);
  if (wm) {
    const parts = wm[1].split(',').map((x) => x.trim());
    const ws = parts.map((x) => +x.replace('*', ''));
    const total = ws.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const star = parts.findIndex((x) => x.startsWith('*'));
      front = star >= 0 ? star : Math.floor((ws.length - 1) / 2);
      let acc = 0;
      // en fracción del ancho visible (si las paredes no suman el ancho, se reparten proporcionalmente)
      walls = ws.map((x) => {
        const r = { x0: acc / total, x1: (acc + x) / total, px: x };
        acc += x;
        return r;
      });
    }
  }
  return { w, h, skip, walls, front };
}

// ── franjas negras (panel C): tramos del ancho donde no se escribe nada y la salida queda en negro ──
// Se guardan en px del formato (p. ej. de 3175 a 4950 en el de 8400). Las palabras, el verso, el título y los logos
// se acomodan en lo que queda de cada pared; lo que igual cayera ahí lo tapa una máscara negra.
let franjas = [];

/** '3175-4950, 100-300' o [{desde, hasta}] → [{desde, hasta}] en px, ordenadas y sin superponerse. */
export function parseFranjas(v) {
  let list = [];
  if (typeof v === 'string') list = [...v.matchAll(/(\d+(?:\.\d+)?)\s*(?:-|–|a|:|\.\.)\s*(\d+(?:\.\d+)?)/g)].map((m) => ({ desde: +m[1], hasta: +m[2] }));
  else if (Array.isArray(v)) list = v.map((f) => ({ desde: +f?.desde, hasta: +f?.hasta }));
  list = list
    .filter((f) => Number.isFinite(f.desde) && Number.isFinite(f.hasta) && f.desde !== f.hasta)
    .map((f) => ({ desde: Math.round(Math.max(0, Math.min(f.desde, f.hasta))), hasta: Math.round(Math.max(f.desde, f.hasta)) }))
    .sort((a, b) => a.desde - b.desde);
  const out = [];
  for (const f of list) {
    const last = out[out.length - 1];
    if (last && f.desde <= last.hasta) last.hasta = Math.max(last.hasta, f.hasta);
    else out.push({ ...f });
  }
  return out.slice(0, 12);
}

/** Ancho total del formato, en px (el de la ventana, si es pantalla completa). */
export const formatWidth = () => (fmt ? fmt.w : Math.round(window.innerWidth * (window.devicePixelRatio || 1)));

/** Las franjas negras, en fracción 0..1 del cuadro visible. */
export function blockedZones() {
  const w = formatWidth(), skip = fmt ? fmt.skip : 0, vis = Math.max(1, w - skip);
  return franjas
    .map((f) => ({ x0: Math.max(0, (f.desde - skip) / vis), x1: Math.min(1, (f.hasta - skip) / vis) }))
    .filter((z) => z.x1 > z.x0);
}

/** Cambia las franjas negras y avisa a todas las capas (evento resize). */
export function setFranjas(v) {
  const next = parseFranjas(v);
  if (JSON.stringify(next) === JSON.stringify(franjas)) return;
  franjas = next;
  window.dispatchEvent(new Event('resize'));
}

/** Paredes tal cual las da el formato, sin descontar las franjas negras. */
export function physicalWalls() {
  if (!fmt || !fmt.walls) return { walls: [{ x0: 0, x1: 1 }], front: 0 };
  return { walls: fmt.walls, front: fmt.front };
}

/**
 * Paredes del formato actual (fracciones 0..1 del cuadro visible) y cuál es la de frente. Sin paredes: una sola.
 * Con franjas negras, cada pared queda partida en los tramos que se ven; la de frente es el tramo más ancho de la
 * pared de frente (o, si quedó toda en negro, el más ancho de todos).
 */
export function wallLayout() {
  const ph = physicalWalls(), zs = blockedZones();
  if (!zs.length) return ph;
  const MIN = 0.012; // un tramo más angosto que esto no sirve para escribir
  const pieces = [];
  ph.walls.forEach((w, wi) => {
    let x = w.x0;
    for (const z of zs) {
      if (z.x1 <= x || z.x0 >= w.x1) continue;
      if (z.x0 - x > MIN) pieces.push({ x0: x, x1: z.x0, wi });
      x = Math.max(x, z.x1);
    }
    if (w.x1 - x > MIN) pieces.push({ x0: x, x1: w.x1, wi });
  });
  if (!pieces.length) return ph; // todo en negro: no hay dónde escribir (la máscara lo tapa igual)
  const widest = (list) => list.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a));
  const own = pieces.filter((p) => p.wi === ph.front);
  const front = pieces.indexOf(widest(own.length ? own : pieces));
  return { walls: pieces.map(({ x0, x1 }) => ({ x0, x1 })), front };
}

/** La pared de frente, en fracción del cuadro visible ({x0, x1}). */
export function frontWall() {
  const { walls, front } = wallLayout();
  return walls[front] || walls[0];
}

/** El formato que se usa de verdad: el de la URL si lo hay, si no el elegido. */
export function effectiveFormat(s) {
  return URL_FORMAT || s;
}

export const formatFromUrl = () => !!URL_FORMAT;

/** Proporción (ancho/alto) del cuadro visible para un formato dado (o de la ventana, si es pantalla completa). */
export function visibleAspect(s) {
  const f = parseFormat(effectiveFormat(s));
  if (!f) return window.innerWidth / Math.max(1, window.innerHeight);
  return (f.w - f.skip) / f.h;
}

/** Rectángulo del cuadro visible en px CSS de la ventana. */
export function frameRect() {
  const vw = window.innerWidth, vh = window.innerHeight;
  if (!fmt) return { x: 0, y: 0, w: vw, h: vh };
  const s = Math.min(vw / fmt.w, vh / fmt.h);
  const w = Math.round(fmt.w * s), h = Math.round(fmt.h * s), cut = Math.round(fmt.skip * s);
  return { x: Math.floor((vw - w) / 2) + cut, y: Math.floor((vh - h) / 2), w: w - cut, h };
}

function applyCss() {
  const r = frameRect(), st = document.documentElement.style, fw = frontWall();
  st.setProperty('--fx', `${r.x}px`);
  st.setProperty('--fy', `${r.y}px`);
  st.setProperty('--fw', `${r.w}px`);
  st.setProperty('--fh', `${r.h}px`);
  // pared de frente (en px dentro del cuadro): imagen del loop y logo de FLAT de la tecla 0
  st.setProperty('--wx', `${Math.round(r.w * fw.x0)}px`);
  st.setProperty('--ww', `${Math.round(r.w * (fw.x1 - fw.x0))}px`);
  applyMask(r);
}

// máscara negra de las franjas: por encima del show (letras, logos, imágenes) y por debajo de los paneles
let maskEl = null;
const EN_CONTROL = new URLSearchParams(location.search).get('control') === '1'; // sólo en la ventana del operador se marca el borde
function applyMask(r) {
  const zs = blockedZones();
  if (!maskEl) {
    if (!zs.length || !document.body) return;
    maskEl = document.createElement('div');
    maskEl.id = 'franjas';
    document.body.appendChild(maskEl);
  }
  maskEl.style.cssText = `position:fixed;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;pointer-events:none;z-index:9;`;
  maskEl.replaceChildren(
    ...zs.map((z) => {
      const d = document.createElement('div');
      const x0 = Math.floor(r.w * z.x0), x1 = Math.ceil(r.w * z.x1);
      d.style.cssText = `position:absolute;top:0;height:100%;left:${x0}px;width:${x1 - x0}px;background:#000;box-sizing:border-box;${EN_CONTROL ? 'border:1px dashed #7a3b3b;' : ''}`;
      return d;
    }),
  );
}

/** Cambia el formato y avisa a todas las capas (evento resize). */
export function setFormat(s) {
  const next = parseFormat(effectiveFormat(s));
  if (JSON.stringify(next) === JSON.stringify(fmt)) return;
  fmt = next;
  window.dispatchEvent(new Event('resize'));
}

export function formatLabel() {
  if (!fmt) return 'pantalla completa';
  if (fmt.walls) return `${fmt.w} × ${fmt.h} · ${fmt.walls.length} paredes (${fmt.walls.map((x, i) => (i === fmt.front ? `frente ${x.px}` : x.px)).join(' + ')})`;
  return fmt.skip ? `${fmt.w} × ${fmt.h} (se ven ${fmt.w - fmt.skip} × ${fmt.h}, sin los primeros ${fmt.skip})` : `${fmt.w} × ${fmt.h}`;
}

// se registra antes que cualquier otra capa (este módulo se importa primero)
window.addEventListener('resize', applyCss);
applyCss();
