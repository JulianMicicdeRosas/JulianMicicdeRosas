// Formato de salida: un cuadro de proporción fija (p. ej. 1822 × 737) centrado en la ventana, o pantalla completa.
// Todas las capas (WebGL, logos, imágenes) leen el mismo rectángulo; fuera de él queda negro.

export const DEFAULT_FORMAT = '1822x737';

// Con '@N' los primeros N px del ancho no se ven (p. ej. '13480x1080@1920': el primer proyector apagado): la salida
// ocupa la ventana entera pero todo se compone y se dibuja sólo en los 11560 px restantes.

// el lanzador puede fijar el formato en la URL (?formato=13480x1080@1920): manda sobre el panel C
const URL_FORMAT = new URLSearchParams(location.search).get('formato');
let fmt = parseFormat(URL_FORMAT || DEFAULT_FORMAT);

/** '1822x737' / '1822 × 737' / '13480x1080@1920' → {w, h, skip}; 'pantalla' (o cualquier otra cosa) → null = pantalla completa. */
export function parseFormat(s) {
  const m = String(s || '').match(/(\d{3,5})\s*[x×X*]\s*(\d{3,5})(?:\s*@\s*(\d{1,5}))?/);
  if (!m) return null;
  const w = +m[1], h = +m[2], skip = Math.min(+(m[3] || 0), w - 100);
  return { w, h, skip };
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
  const r = frameRect(), st = document.documentElement.style;
  st.setProperty('--fx', `${r.x}px`);
  st.setProperty('--fy', `${r.y}px`);
  st.setProperty('--fw', `${r.w}px`);
  st.setProperty('--fh', `${r.h}px`);
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
  return fmt.skip ? `${fmt.w} × ${fmt.h} (se ven ${fmt.w - fmt.skip} × ${fmt.h}, sin los primeros ${fmt.skip})` : `${fmt.w} × ${fmt.h}`;
}

// se registra antes que cualquier otra capa (este módulo se importa primero)
window.addEventListener('resize', applyCss);
applyCss();
