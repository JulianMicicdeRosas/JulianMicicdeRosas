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

/** Paredes del formato actual (fracciones 0..1 del cuadro visible) y cuál es la de frente. Sin paredes: una sola. */
export function wallLayout() {
  if (!fmt || !fmt.walls) return { walls: [{ x0: 0, x1: 1 }], front: 0 };
  return { walls: fmt.walls, front: fmt.front };
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
