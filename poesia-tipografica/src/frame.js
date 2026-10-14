// Formato de salida: un cuadro de proporción fija (p. ej. 1822 × 737) centrado en la ventana, o pantalla completa.
// Todas las capas (WebGL, logos, imágenes) leen el mismo rectángulo; fuera de él queda negro.

export const DEFAULT_FORMAT = '1822x737';
let fmt = parseFormat(DEFAULT_FORMAT);

/** '1822x737' / '1822 × 737' → {w, h}; 'pantalla' (o cualquier otra cosa) → null = pantalla completa. */
export function parseFormat(s) {
  const m = String(s || '').match(/(\d{3,5})\s*[x×X*]\s*(\d{3,5})/);
  return m ? { w: +m[1], h: +m[2] } : null;
}

/** Rectángulo del cuadro en px CSS de la ventana. */
export function frameRect() {
  const vw = window.innerWidth, vh = window.innerHeight;
  if (!fmt) return { x: 0, y: 0, w: vw, h: vh };
  const s = Math.min(vw / fmt.w, vh / fmt.h);
  const w = Math.round(fmt.w * s), h = Math.round(fmt.h * s);
  return { x: Math.floor((vw - w) / 2), y: Math.floor((vh - h) / 2), w, h };
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
  const next = parseFormat(s);
  if (JSON.stringify(next) === JSON.stringify(fmt)) return;
  fmt = next;
  window.dispatchEvent(new Event('resize'));
}

export function formatLabel() {
  return fmt ? `${fmt.w} × ${fmt.h}` : 'pantalla completa';
}

// se registra antes que cualquier otra capa (este módulo se importa primero)
window.addEventListener('resize', applyCss);
applyCss();
