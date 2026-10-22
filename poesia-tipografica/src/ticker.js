// ─────────────────────────────────────────────────────────────────────────────
//  ticker.js — Cuadros que no se frenan.
//  Mientras la ventana se ve, los cuadros los da requestAnimationFrame. Si el navegador la da por oculta
//  (Alt+Tab con otra ventana encima, minimizada, otro escritorio) deja de dar cuadros y frena los
//  temporizadores; un worker (que no se frena) sigue marcando el paso ~30 veces por segundo, así el show
//  sigue tomando lo que se dice y cambiando, y al volver está al día.
// ─────────────────────────────────────────────────────────────────────────────

let queue = [];
let rafPending = false;
let lastFlush = performance.now();

function flush(ts) {
  lastFlush = performance.now();
  const q = queue;
  queue = [];
  for (const cb of q) {
    try {
      cb(ts ?? lastFlush);
    } catch (e) {
      console.error('[ticker]', e);
    }
  }
}

/** Como requestAnimationFrame, pero también corre con la ventana oculta. */
export function nextFrame(cb) {
  queue.push(cb);
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame((ts) => {
      rafPending = false;
      flush(ts);
    });
  }
}

// ── temporizadores que no se frenan (duración de cada paso del loop, glitch del cierre, arranques demorados) ──
const timers = new Map();
let nextId = 1;
let worker = null;

try {
  const src = `
    const t = new Map();
    setInterval(() => postMessage(0), 33);
    onmessage = (e) => {
      const { id, ms, rep, cancel } = e.data;
      if (cancel) { clearTimeout(t.get(cancel)); clearInterval(t.get(cancel)); t.delete(cancel); return; }
      t.set(id, (rep ? setInterval : setTimeout)(() => { postMessage(id); if (!rep) t.delete(id); }, ms));
    };`;
  worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  worker.onmessage = (e) => {
    if (e.data === 0) {
      // cuadro de respaldo: sólo cuando requestAnimationFrame no llegó a tiempo (ventana oculta o tapada)
      if (queue.length && performance.now() - lastFlush > 100) flush();
      return;
    }
    const tm = timers.get(e.data);
    if (!tm) return;
    if (!tm.rep) timers.delete(e.data);
    try {
      tm.cb();
    } catch (err) {
      console.error('[ticker]', err);
    }
  };
} catch {
  worker = null; /* sin workers: requestAnimationFrame y los temporizadores comunes */
}

function schedule(cb, ms, rep) {
  if (!worker) return { native: rep ? setInterval(cb, ms) : setTimeout(cb, ms), rep };
  const id = nextId++;
  timers.set(id, { cb, rep });
  worker.postMessage({ id, ms: Math.max(0, +ms || 0), rep });
  return id;
}

/** Como setTimeout, pero no se frena con la ventana oculta. */
export const later = (cb, ms) => schedule(cb, ms, false);
/** Como setInterval, pero no se frena con la ventana oculta. */
export const every = (cb, ms) => schedule(cb, ms, true);
/** Cancela un `later` o un `every` (acepta 0 / undefined). */
export function cancel(id) {
  if (!id) return;
  if (typeof id === 'object') {
    (id.rep ? clearInterval : clearTimeout)(id.native);
    return;
  }
  timers.delete(id);
  worker?.postMessage({ cancel: id });
}
