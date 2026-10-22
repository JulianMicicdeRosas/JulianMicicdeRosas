// ─────────────────────────────────────────────────────────────────────────────
//  main.js — Poesía Tipográfica · frontend de proyección (Three.js, kiosk).
//
//  Parámetros de URL (opcionales):
//    ?pool=12000     glifos activos (8 000 – 15 000 recomendado)
//    ?ws=ws://localhost:8765
//    ?bloom=0.55  ?grain=0.055  ?dpr=1.5
//    ?debug          abre el panel de calibración al inicio
// ─────────────────────────────────────────────────────────────────────────────
import { frameRect, setFormat, visibleAspect, DEFAULT_FORMAT } from './frame.js'; // primero: fija el cuadro de salida
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/ibm-plex-mono/400.css';
// Manual de marca FLAT: Geist Mono (títulos y destacados) y Roboto (texto). Empaquetadas: funcionan sin internet.
import '@fontsource/geist-mono/500.css';
import '@fontsource/roboto/400.css';
import * as THREE from 'three';
import { GlyphAtlas, loadFonts } from './glyphAtlas.js';
import { TypeField } from './typeField.js';
import { createPostFX } from './postfx.js';
import { BackendSocket } from './socket.js';
import { DebugPanel } from './debugPanel.js';
import { localArtDirection, normalizeDirection } from './localDirector.js';
import { sampleFigure } from './svgSampler.js';
import { SHAPES } from './shapeLibrary.js';
import { Show, DEFAULT_SETTINGS, TITULO } from './show.js';
import { ConfigPanel } from './configPanel.js';
import { PointCloud } from './pointCloud.js';
import { Overlay } from './overlay.js';
import { TREATMENTS, treat, pickTreatment, seedOf, composeFigure, figureToTone, rowsToTone, toneToText } from './treatments.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) && Number.isFinite(+params.get(k)) ? +params.get(k) : d);
const LS_KEY = 'poesia.settings.v1';
// el telón tiene tantas columnas como entren a lo ancho: un formato muy apaisado (p. ej. 11560 × 1080 visibles)
// necesita más letras que el de FLAT (1822 × 737). El pool se dimensiona al arrancar según el formato guardado.
function poolFor() {
  let fmt = DEFAULT_FORMAT;
  try {
    fmt = JSON.parse(localStorage.getItem(LS_KEY) || 'null')?.formato || fmt;
  } catch {
    /* sin localStorage: formato por defecto */
  }
  return Math.round(18000 * Math.max(1, visibleAspect(fmt) / 2.47));
}
const CONFIG = {
  pool: Math.round(Math.min(100000, Math.max(2000, num('pool', poolFor())))), // muro de 40 filas ≈ 11 000 letras (en 1822 × 737) + caída + títulos
  points: Math.round(Math.min(300000, Math.max(0, num('points', 80000)))),
  ws: params.get('ws') || 'ws://localhost:8765',
  worldH: 1000,
  bloom: num('bloom', 0.55),
  grain: num('grain', 0.055),
  // En Mac (pantallas Retina, equipos sin ventilador) se limita la resolución interna: en el
  // proyector (1x) no cambia nada y en la pantalla del portátil ahorra mucho calor.
  dpr: Math.min(window.devicePixelRatio || 1, num('dpr', /Macintosh|Mac OS X/.test(navigator.userAgent) ? 1.25 : 1.5)),
  idleText: 'FLAT',
};

async function boot() {
  await loadFonts();

  // ── render ───────────────────────────────────────────────────────────────
  const stage = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
  // un cuadro muy ancho (13480 px) con escalado de Windows pasaría el máximo de textura de la placa (16 384):
  // la densidad de píxeles se recorta para que el lienzo y los pases de posproceso entren
  const maxTex = Math.min(renderer.capabilities.maxTextureSize || 16384, 16384);
  const fitDpr = (d, w = frameRect().w, h = frameRect().h) => Math.min(d, maxTex / Math.max(1, w), maxTex / Math.max(1, h));
  renderer.setPixelRatio(fitDpr(CONFIG.dpr));
  const fr0 = frameRect();
  renderer.setSize(fr0.w, fr0.h);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const fov = 30;
  const camera = new THREE.PerspectiveCamera(fov, fr0.w / fr0.h, 10, 8000);
  const camDist = CONFIG.worldH / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  camera.position.set(0, 0, camDist);

  const atlas = new GlyphAtlas(renderer);
  const field = new TypeField({ atlas, count: CONFIG.pool, aspect: camera.aspect, worldH: CONFIG.worldH, idleText: CONFIG.idleText });
  scene.add(field.mesh);
  const lines = new Overlay(field); // líneas finas: fragmentos del muro y figura de la tecla 0

  // nube de puntos estilo TouchDesigner: acompaña a cada figura
  const cloud = new PointCloud({ count: CONFIG.points, W: field.W, H: field.H });
  scene.add(cloud.points);
  field.onFigure = (fig, map) => {
    if (settings.pointcloud !== false && CONFIG.points > 0) cloud.setFigure(fig, map, field.depth);
  };
  field.onRelease = () => cloud.scatter();

  const fx = createPostFX(renderer, scene, camera, { bloomStrength: CONFIG.bloom, grain: CONFIG.grain });

  // ── dirección de arte ────────────────────────────────────────────────────
  let pendingDirection = null;
  // ── estilos de imagen que oscilan: caligrama · ascii · glitch · marca ─────
  const STYLES = ['caligrama', 'ascii', 'glitch', 'marca'];
  let styleSeq = 0, lastStyle = '', currentStyle = 'caligrama';
  function chooseStyle(suggested) {
    const est = settings.estilos || {};
    const act = (est.activos || []).filter((x) => STYLES.includes(x));
    const pool = act.length ? act : ['caligrama'];
    let st;
    if (est.modo === 'secuencia') st = pool[styleSeq++ % pool.length];
    else if (est.modo !== 'azar' && pool.includes(suggested)) st = suggested; // lo eligió el LLM
    else {
      const others = pool.length > 1 ? pool.filter((x) => x !== lastStyle) : pool;
      st = others[(Math.random() * others.length) | 0];
    }
    lastStyle = st;
    return st;
  }

  function applyDirection(raw) {
    clearTimeout(pendingDirection);
    let dir = normalizeDirection(raw);
    const estilo = chooseStyle(raw.estilo);
    currentStyle = estilo;
    const marca = settings.marca || {};
    if (estilo === 'glitch') dir = { ...dir, estilo: Math.random() < 0.5 ? 'ascii' : 'caligrama' };
    else if (estilo === 'marca') {
      dir = {
        ...dir,
        estilo: 'marca',
        mayusculas: marca.mayusculas !== false,
        paleta: { base: marca.base || '#F4F1EA', secundario: marca.secundario || '#8C8984', acento: marca.acento || '#E3A14B', uso_acento: 0.18 },
      };
    } else dir = { ...dir, estilo };
    if (marca.global) {
      // la marca manda sobre la paleta del LLM (conserva cuánto acento pidió)
      dir.paleta = { base: marca.base || '#F4F1EA', secundario: marca.secundario || '#8C8984', acento: marca.acento || '#E3A14B', uso_acento: dir.paleta?.uso_acento ?? 0.08 };
    }
    dir.ascii_filas = settings.ascii_filas || 40;
    field.setKeywords(dir.palabras_clave);
    field.setPalette(dir.paleta);
    field.setPhysics(dir.fisica);
    // cada estrofa produce una imagen: si llegara «simbolico», se dibuja igual (más tenue)
    if (dir.modo_visual === 'simbolico' && raw.source !== 'forzar-simbolico') dir = { ...dir, modo_visual: 'hibrido' };
    if ((settings.imagenes || 'grilla') === 'grilla' || raw.forzar_grilla) {
      // ilustración en grilla de texto: compuesta con las palabras del muro (positivo o negativo)
      // fuente de la imagen → tonos con la resolución del muro → tratamiento gráfico → muro de palabras
      const gh = field.bdRows, gw = gh * 3;
      const re = raw.grilla_origen === 'reintento' ? ' (2.º intento)' : '';
      const src = (tone, origen) => (tone ? { tone, origen } : null);
      const comp = () => (Array.isArray(raw.formas) && raw.formas.length ? src(figureToTone(composeFigure(raw.formas), gw, gh), `composición del LLM (${raw.formas.length} formas)${re}`) : null);
      const llmGrid = () => (dir.grilla ? src(rowsToTone(dir.grilla, gw, gh), `grilla del LLM${re}`) : null);
      const fromSvg = () => {
        const f = dir.svg_paths?.length && sampleFigure(dir.svg_paths.map((d) => ({ d, op: 'fill' })), {});
        return f ? src(figureToTone(f, gw, gh), 'silueta SVG del LLM') : null;
      };
      const fromEmoji = (e, o) => (e ? src(figureToTone(emojiFigure(e), gw, gh), o) : null);
      const emo = () => fromEmoji(raw.emoji, `emoji ${raw.emoji || ''}`);
      const lib = SHAPES[dir.figura] ? dir.figura : 'luna';
      const fromLib = () => fromEmoji(LIB_EMOJI[lib], `biblioteca (${lib})`) || src(figureToTone(sampleFigure(SHAPES[lib], {}), gw, gh), `biblioteca (${lib})`);
      // «letras»: arte ASCII hecho con las letras transcriptas; se muestra tal cual (sólo positivo, sin tratamiento)
      const letras = Array.isArray(raw.grilla_letras) && raw.grilla_letras.length ? { grid: raw.grilla_letras, origen: `letras transcriptas (ASCII)${re}`, chars: true } : null;
      const order = settings.forma_grilla === 'emoji' ? [emo, comp, llmGrid, fromSvg] : [comp, llmGrid, fromSvg, emo];
      const pick = [() => letras, ...order].reduce((a, f) => a || f(), null) || fromLib();
      // semilla estable: la misma estrofa da la misma imagen (re-proyección idéntica)
      const seed = seedOf(JSON.stringify([dir.figura, raw.emoji, raw.formas, raw.grilla, raw.verso || dir.verso, dir.palabras_clave]));
      const pref = settings.tratamiento || 'azar';
      const kind = pick.chars ? 'letras' : TREATMENTS.includes(pref) ? pref : pref === 'llm' && TREATMENTS.includes(raw.tratamiento) ? raw.tratamiento : pickTreatment(seed);
      let shapeArg = pick.grid, preview = pick.grid;
      if (!pick.chars) {
        const t = treat(pick.tone, gw, gh, kind, seed);
        shapeArg = { tone: t.tone, accent: t.accent, gw, gh };
        preview = toneToText(t.tone, t.accent, gw, gh);
      }
      const origen = `${pick.origen} · ${kind}`;
      const artistWall = show.mode === 'muro' && show.state === 'perform'; // muro, cruce o constelación
      const pol = pick.chars || artistWall ? 'positivo' : choosePolarity(dir); // en las placas, el dibujo sobre negro
      lastGrid = { grid: preview, origen, pol };
      // el contorno de la forma va en el color de acento de la marca
      field.edgeAccent = settings.contorno_acento !== false;
      field.setPalette({ ...(dir.paleta || {}), acento: (settings.marca && settings.marca.acento) || '#ff9898' });
      field.releaseFigure(true);
      field.setBackdrop(true); // la ilustración se cala en el muro: tiene que estar visible
      field.refillSecs = (settings.cadencia && settings.cadencia.min_s) || 14;
      field.setShape(shapeArg, { polaridad: pol, duracion: Math.max(8, +dir.duracion_s || 16), chars: !!pick.chars });
      if (artistWall) field.breakWordsOverShape(); // las palabras que tapan el dibujo se rompen
      config.setLastDirection({ ...dir, origen: `${origen} · ${pol}`, pidio: 'grilla', estiloVisto: 'grilla' });
      debug.setDirection(dir);
      return;
    }
    if (dir.modo_visual === 'concreto' || dir.modo_visual === 'hibrido') {
      const interiorTarget = Math.min(4200, CONFIG.pool * 0.32);
      let fig = null;
      let origen = 'biblioteca';
      if (dir.svg_paths.length) {
        fig = sampleFigure(dir.svg_paths.map((d) => ({ d, op: 'fill' })), { interiorTarget });
        if (fig) origen = 'llm';
      }
      if (!fig) fig = sampleFigure(SHAPES[dir.figura], { interiorTarget }); // biblioteca de respaldo
      if (fig) field.formFigure(fig, { ...dir, figura: dir.figura_libre || dir.figura });
      config.setLastDirection({ ...dir, origen, pidio: dir.imagenes, estiloVisto: estilo });
    } else {
      field.releaseFigure(true);
      config.setLastDirection({ ...dir, origen: 'sin figura' });
    }
    debug.setDirection(dir);
  }

  // polaridad de la grilla: fija (positivo / negativo), alternada, o la que elija el LLM
  let polFlip = false;
  let lastGrid = null; // última grilla aplicada (para mostrarla en el panel C)
  function choosePolarity(dir) {
    const p = settings.polaridad || 'alternar';
    if (p === 'positivo' || p === 'negativo') return p;
    if (p === 'llm' && (dir.polaridad === 'positivo' || dir.polaridad === 'negativo')) return dir.polaridad;
    polFlip = !polFlip;
    return polFlip ? 'negativo' : 'positivo';
  }

  /** Máscara de una figura (SVG o biblioteca) → grilla 48×26 de '#'/'.' (celdas el doble de altas que anchas). */
  // resolución de la ilustración = filas del muro (cada celda de la grilla es una letra del muro)
  // resolución de la imagen = filas del muro (field.bdRows); el ancho cubre hasta 3 veces el alto

  /**
   * Máscara (SVG, emoji o biblioteca) → grilla de '#'/'.' con celdas el doble de altas que anchas.
   * Cobertura promediada (bordes sin dientes) y un pase de suavizado: sin celdas sueltas ni agujeritos.
   */
  function maskToGrid(fig, gw = field.bdRows * 3, gh = field.bdRows, alto = 0.8) {
    if (!fig || !fig.mask) return null;
    const R = 512, bb = fig.bbox || { x: 0, y: 0, w: R, h: R };
    // la figura ocupa ~80 % del alto; el ancho respeta la proporción real (cada celda cubre cell/2 × cell)
    const cell = Math.max(bb.h / (gh * alto), (2 * bb.w) / (gw * 0.92));
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    const at = (mx, my) => (mx >= 0 && mx < R && my >= 0 && my < R ? fig.mask[(my | 0) * R + (mx | 0)] : 0);
    const on = [];
    for (let y = 0; y < gh; y++) {
      const row = new Uint8Array(gw);
      for (let x = 0; x < gw; x++) {
        const x0 = cx + (x - gw / 2) * (cell / 2), y0 = cy + (y - gh / 2) * cell;
        let c = 0;
        for (const fy of [0.2, 0.5, 0.8]) for (const fx of [0.25, 0.75]) c += at(x0 + fx * (cell / 2), y0 + fy * cell) > 0.5 ? 1 : 0;
        row[x] = c >= 3 ? 1 : 0; // ≥ la mitad de la celda cubierta
      }
      on.push(row);
    }
    // suavizado: una celda sola se apaga, un hueco aislado se rellena
    const rows = [];
    for (let y = 0; y < gh; y++) {
      let line = '';
      for (let x = 0; x < gw; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && on[y + dy]?.[x + dx]) n++;
        const v = on[y][x] ? n >= 2 : n >= 6;
        line += v ? '#' : '.';
      }
      rows.push(line);
    }
    return rows.some((r) => r.includes('#')) ? rows : null;
  }

  // silueta de un emoji del sistema (Apple / Segoe / Noto): formas diseñadas para leerse al instante
  const emojiCache = new Map();
  function emojiFigure(emoji) {
    if (!emoji) return null;
    if (emojiCache.has(emoji)) return emojiCache.get(emoji);
    const R = 512, c = document.createElement('canvas');
    c.width = c.height = R;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.font = `${Math.round(R * 0.74)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff'; // si sale el glifo monocromo, también tiene alfa
    g.fillText(emoji, R / 2, R / 2);
    const d = g.getImageData(0, 0, R, R).data;
    const mask = new Float32Array(R * R);
    let x0 = R, y0 = R, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < R; x++) {
        if (d[(y * R + x) * 4 + 3] > 110) {
          mask[y * R + x] = 1;
          n++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    let fig = null;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    // sin glifo (cuadradito «tofu») o casi nada: no sirve
    if (n > R * R * 0.01 && !(n / (w * h) > 0.93 && Math.abs(w / h - 1) < 0.35)) fig = { mask, bbox: { x: x0, y: y0, w, h }, res: R };
    emojiCache.set(emoji, fig);
    return fig;
  }
  // figuras de la biblioteca → su emoji (respaldo cuando no hay nada del LLM)
  const LIB_EMOJI = { luna: '🌙', corazon: '❤', gota: '💧', ojo: '👁', sol: '☀', estrella: '⭐', espiral: '🌀', ola: '🌊', arbol: '🌳', pajaro: '🐦', pez: '🐟', hoja: '🍃', flor: '🌷', montana: '⛰', llama: '🔥', mariposa: '🦋', reloj: '⌛', casa: '🏠', mano: '✋', nube: '☁' };

  function requestDirection(text, itemId) {
    clearTimeout(pendingDirection);
    // con backend: el verso entra a la cadencia (estrofa) y la imagen llega cuando corresponda
    if (!socket.send({ type: 'inject_verse', text, item_id: itemId })) {
      pendingDirection = setTimeout(() => applyDirection(localArtDirection(text)), 300);
    }
  }

  // ── voz → escena según el modo del show ─────────────────────────────────
  // force = simulador del panel D (permite probar sin estar grabando)
  function onDelta(itemId, delta, force = false) {
    if (!show.recording && !force) return;
    if (show.mode === 'palabras' || show.mode === 'pocas' || show.mode === 'muro') field.wordsDelta(itemId, delta);
    else field.typeDelta(itemId, delta);
  }
  function onCompleted(itemId, text, force = false) {
    if (!show.recording && !force) return;
    if (show.mode === 'palabras' || show.mode === 'pocas' || show.mode === 'muro') field.completeWords(itemId, text);
    else field.completeLine(itemId, text);
  }

  // ── audio reactivo ───────────────────────────────────────────────────────
  let lastRealAudio = -1e9;
  // placa del artista: cuando la persona empieza a hablar, el nombre se borra y arranca la animación
  let voiceFor = 0, lastVoiceT = 0;
  function detectVoice(rms) {
    const now = performance.now(), dt = Math.min(0.1, (now - lastVoiceT) / 1000);
    lastVoiceT = now;
    // los primeros 3 s de la placa no cuentan (presentación, aplausos)
    if (replayMode || show.state !== 'artist' || settings.inicio_por_voz === false || now - (show.artistAt || 0) < 3000) {
      voiceFor = 0;
      return;
    }
    if (rms > (settings.umbral_voz ?? 0.35)) voiceFor += dt;
    else voiceFor = Math.max(0, voiceFor - dt * 0.5);
    if (voiceFor > 0.35) {
      voiceFor = 0;
      logUi({ action: 'voz' });
      show.start(...show.nextRecording());
      config.setState(show.label());
    }
  }
  function onAudio(rms, freq, real) {
    if (real) {
      lastRealAudio = performance.now();
      detectVoice(rms);
    }
    else if (performance.now() - lastRealAudio < 500) return; // el micrófono real manda
    field.setAudio(rms, freq);
    debug.setLevel(rms);
  }

  // ── ajustes del show (backend = fuente de verdad, localStorage = respaldo) ─
  let settings = structuredClone(DEFAULT_SETTINGS);
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved && typeof saved === 'object') settings = { ...settings, ...saved };
  } catch {
    /* sin localStorage: se usan los valores por defecto */
  }
  let saveTimer = 0;
  let brandFontLoaded = '';
  function applyLiveSettings() {
    setFormat(settings.formato || DEFAULT_FORMAT);
    field.wallMode = (settings.muro?.tipo || 'grilla') === 'grilla';
    field.brandAll = settings.marca?.global === true;
    field.brandUpper = field.brandAll && settings.marca?.mayusculas !== false;
    field.wallRows = settings.muro?.filas || 34;
    field.wallUpper = settings.muro?.mayusculas !== false;
    const fuente = settings.marca?.fuente || '';
    if (fuente && fuente !== brandFontLoaded) {
      brandFontLoaded = fuente;
      atlas.setBrandFont(fuente);
    }
  }

  // loop de versiones anteriores (FLAT + sponsors + título) → nuevo loop de grupos de logos
  function migrate(s) {
    const old = (s.loop || []).some((st) => st && (st.contenido === 'loop/flat.png' || st.carpeta === 'public/loop/sponsors'));
    if (old) s = { ...s, loop: structuredClone(DEFAULT_SETTINGS.loop) };
    // v4: las ilustraciones pasan a ser grilla de texto (una sola vez; después se respeta lo elegido en el panel)
    if (!s.imagenes_v5) s = { ...s, imagenes: 'grilla', imagenes_v4: true, imagenes_v5: true }; // la ilustración es la grilla de texto
    // ilustraciones: composición abstracta del LLM (no emoji) con tratamiento gráfico
    if (!s.imagenes_v7) s = { ...s, forma_grilla: 'llm', grilla_preset: 'composicion', tratamiento: s.tratamiento || 'azar', imagenes_v7: true };
    // v8: el título del loop pasa a ser el del ciclo (una sola vez; después se respeta lo escrito en el panel)
    if (!s.titulo_flat_v8) {
      const viejo = (v) => /^\s*umbral\s*$/i.test(String(v || ''));
      const loop = (s.loop || []).map((st) => (st && st.tipo === 'texto' && (viejo(st.contenido) || viejo(st.letras)) ? { ...st, contenido: TITULO, letras: TITULO.toUpperCase() } : st));
      s = { ...s, loop, titulo_flat_v8: true };
    }
    return s;
  }

  function setSettings(next, { persist = true } = {}) {
    settings = migrate({ ...structuredClone(DEFAULT_SETTINGS), ...next });
    show.setSettings(settings);
    applyLiveSettings();
    if (!persist) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(settings));
    } catch {
      /* lleno (imágenes grandes): queda en el backend */
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => socket.send({ type: 'save_settings', settings }), 400);
    checkPool();
  }

  // se eligió un formato más apaisado que el del arranque: no entran todas las letras del telón → se recarga
  // una vez con un pool más grande (el formato ya quedó guardado)
  function checkPool() {
    if (params.has('pool') || 18000 * Math.max(1, visibleAspect(settings.formato) / 2.47) <= field.N * 1.05) return;
    try {
      const key = 'poesia.poolReload', tag = String(settings.formato);
      if (sessionStorage.getItem(key) === tag) return; // ya se recargó por este formato: no insistir
      sessionStorage.setItem(key, tag);
      localStorage.setItem(LS_KEY, JSON.stringify(settings));
    } catch {
      return;
    }
    clearTimeout(saveTimer);
    socket.send({ type: 'save_settings', settings });
    setTimeout(() => location.reload(), 300);
  }

  // El estado del show nunca se escribe en la pared: sólo en el panel C.
  function notify(text) {
    config?.setState(show?.label?.() || text);
  }

  // pedir al backend los logos de una carpeta (responde con data URLs)
  const logoRequests = new Map();
  let logoReqId = 0;
  // al arrancar, el loop puede pedir logos antes de que el backend conecte: esperar hasta 5 s
  const waitBackend = (ms = 5000) =>
    new Promise((res) => {
      const t0 = performance.now();
      const tick = () => (socket?.open || performance.now() - t0 > ms ? res() : setTimeout(tick, 100));
      tick();
    });
  async function fetchLogos(carpeta) {
    await waitBackend();
    return new Promise((resolve, reject) => {
      const id = ++logoReqId;
      if (!socket?.send({ type: 'list_logos', carpeta, id })) return reject(new Error('backend desconectado'));
      const t = setTimeout(() => {
        logoRequests.delete(id);
        reject(new Error('el backend no respondió la lista de logos'));
      }, 5000);
      logoRequests.set(id, (logos) => {
        clearTimeout(t);
        resolve(logos.map((l) => l.src));
      });
    });
  }

  const show = new Show({
    field,
    fetchLogos,
    notify: (t) => notify(t),
    interiorTarget: Math.min(4200, CONFIG.pool * 0.32),
    onSession: (st) => socket?.send({ type: 'session', ...st }),
    onPrerollReset: () => socket?.send({ type: 'preroll_reset' }),
  });
  show.setSettings(settings);
  applyLiveSettings();

  // ── backend ──────────────────────────────────────────────────────────────
  let backendSettingsLoaded = false;
  // grabación de la sesión: teclas y botones del show van al backend (eventos.jsonl) para re-proyectar
  let replayMode = false;
  let bootLogged = false;
  const logUi = (ev) => !replayMode && socket?.send({ type: 'ui', ...ev });
  let lastSpeechStop = 0; // tecla 0: pausas largas → párrafo nuevo
  const socket = new BackendSocket(CONFIG.ws, {
    open: () => {
      debug.setStatus({ backend: 'connected' });
      config.setBackend(true);
      show.resync();
      if (config.isOpen) socket.send({ type: 'list_devices' });
    },
    close: () => {
      debug.setStatus({ backend: 'offline', mic: '—', openai: '—' });
      config.setBackend(false);
    },
    hello: (m) => {
      replayMode = !!m.replay;
      if (m.replay) notify(`RE-PROYECCIÓN · ${String(m.replay.carpeta || '').split(/[\\/]/).pop()}`);
      else if (!bootLogged) {
        bootLogged = true;
        logUi({ action: 'arranque' }); // la escena empieza de cero (al re-proyectar se reinicia aquí)
      }
      config.setRecInfo(m.grabacion, m.replay);
      debug.setStatus({ backend: 'connected', ...(m.status || {}) });
      config.setMicStatus(m.status || {});
      config.setDefaultPrompt(m.default_prompt);
      config.setDefaultPromptGrid(m.default_prompt_grilla);
      if (m.grid_presets) config.setGridPresets(m.grid_presets);
      config.setUserDir(m.user_dir);
      if (m.key) {
        config.setKeyStatus(m.key);
        if (!m.key.has_key) config.toggle(true); // sin clave: abrir el panel para pegarla
      }
      const remote = m.settings || {};
      if (!backendSettingsLoaded && Object.keys(remote).length) {
        // el archivo del backend manda; lo de este navegador sólo completa lo que falte
        backendSettingsLoaded = true;
        setSettings({ ...settings, ...remote }, { persist: false });
        // si una migración cambió algo (p. ej. imágenes → grilla), el backend tiene que enterarse
        if (!m.replay && Object.keys(settings).some((k) => JSON.stringify(settings[k]) !== JSON.stringify(remote[k]))) {
          socket.send({ type: 'save_settings', settings });
        }
        if (!m.replay) checkPool();
        if (config.isOpen) config.render();
        if (show.state === 'loop') show.goLoop();
      } else if (!Object.keys(remote).length) {
        socket.send({ type: 'save_settings', settings }); // primera vez: sembrar el archivo
      }
    },
    key_status: (m) => config.setKeyStatus(m),
    grabacion: (m) => config.setRecInfo(m),
    // ── re-proyección: el backend repite lo que pasó, en su segundo exacto ──
    replay_ui: (m) => {
      if (m.action === 'arranque') {
        field.clearScene();
        show.goLoop();
      } else if (m.action === 'grabar') show.start(...show.nextRecording());
      else if (m.action === 'voz') show.start(...show.nextRecording());
      else if (m.action === 'detener') show.stop();
      else if (m.key) doKey(m.key);
      config.setState(show.label());
    },
    replay_settings: (m) => setSettings({ ...settings, ...(m.settings || {}) }, { persist: false }),
    replay_end: () => notify('Fin de la re-proyección'),
    prompt_preview: (m) => config.setPromptPreview(m),
    grid_test: (m) => {
      lastGrid = null;
      // verla también en la pared: si la grilla del LLM falló, se usa su silueta SVG o la biblioteca
      if (m.direction) applyDirection({ ...m.direction, verso: m.text, forzar_grilla: true });
      config.setGridTest({ ...m, usada: lastGrid });
    },
    cadence: (m) => config.setCadence(m),
    status: (m) => {
      debug.setStatus(m.status || {});
      config.setMicStatus(m.status || {});
    },
    devices: (m) => config.setDevices(m.devices, m.current, m.channel),
    settings: () => {},
    logos: (m) => {
      logoRequests.get(m.id)?.(m.logos || []);
      logoRequests.delete(m.id);
      config.setLogoCount(m.carpeta, (m.logos || []).length);
    },
    audio_reactive: (m) => {
      onAudio(+m.rms || 0, +m.freq || 0, true);
      config.setLevel(+m.level || 0, +m.db);
    },
    speech: (m) => {
      if (show.recording && show.mode === 'poema') field.setSpeaking(m.state === 'started');
      // tecla 0: una pausa de más de 1 s empieza un párrafo nuevo
      if (show.mode === 'pocas') {
        const now = performance.now();
        if (m.state === 'started' && now - lastSpeechStop > 1000) field.newParagraph();
        if (m.state === 'stopped') lastSpeechStop = now;
      }
    },
    word_delta: (m) => onDelta(m.item_id || 'voz', m.delta || ''),
    verse_completed: (m) => onCompleted(m.item_id || 'voz', m.text || ''),
    verse_discard: (m) => field.discardLine(m.item_id || 'voz'),
    art_direction: (m) => {
      const d = m.data || m;
      // las direcciones del simulador siempre se aplican; las de la voz, grabando (poema o palabras)
      // en «pocas palabras» (tecla 0) no hay ilustraciones: sólo la transcripción
      if (d.source === 'debug' || (show.recording && show.mode !== 'pocas')) applyDirection(d);
    },
  });

  const config = new ConfigPanel({
    getSettings: () => settings,
    onChange: (next) => setSettings(next),
    onDevice: (dev) => socket.send({ type: 'set_device', device: dev }),
    onChannel: (ch) => socket.send({ type: 'set_channel', channel: ch }),
    requestDevices: () => socket.send({ type: 'list_devices' }),
    onSaveKey: (key) => socket.send({ type: 'set_api_key', key }),
    onOpenFolder: (que) => socket.send({ type: 'open_folder', que }),
    onTestGrid: (text) => {
      socket.send({ type: 'save_settings', settings }); // primero lo último elegido en el panel
      if (!socket.send({ type: 'test_grid', text })) config.setGridTest({ ok: false, error: 'sin conexión con el backend' });
    },
    onPreviewStyle: (estilo) => {
      // vista previa con el último verso: fuerza el estilo una vez
      const prev = settings.estilos;
      settings = { ...settings, estilos: { activos: [estilo], modo: 'azar' } };
      applyDirection({ ...localArtDirection(field.corpus.slice(-120) || 'flat'), modo_visual: 'concreto', verso: field.corpus.slice(-160) });
      settings = { ...settings, estilos: prev };
    },
    onRecord: () => {
      logUi({ action: 'grabar' });
      show.start(...show.nextRecording());
      config.setState(show.label());
    },
    onStop: () => {
      logUi({ action: 'detener' });
      show.stop();
      config.setState(show.label());
    },
    onShowPrompt: (text) => (socket.send({ type: 'save_settings', settings }), socket.send({ type: 'get_prompt', text })) || config.setPromptPreview({ error: 'sin conexión con el backend' }),
    onScanLogos: (carpeta) => fetchLogos(carpeta).catch(() => config.setLogoCount(carpeta, 0)),
  });
  setInterval(() => config.tick(), 400);

  // ── simulador (modo D) ───────────────────────────────────────────────────
  const sim = {
    token: 0,
    level: 0,
    target: 0,
    timer: setInterval(() => {
      sim.level += (sim.target - sim.level) * (sim.target > sim.level ? 0.6 : 0.15);
      if (sim.level > 0.002 || sim.target > 0) onAudio(sim.level, 160 + sim.level * 140 + Math.random() * 30, false);
    }, 16),
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function simulateVerse(text, token = ++sim.token) {
    const itemId = `sim-${Date.now()}`;
    if (show.mode === 'poema') field.setSpeaking(true);
    const parts = text.split(/(\s+)/);
    for (const part of parts) {
      if (token !== sim.token) return;
      if (!part.trim()) {
        sim.target = 0.05;
        onDelta(itemId, part, true);
        await wait(70 + Math.random() * 90);
        continue;
      }
      // las palabras llegan en fragmentos, como los deltas reales del transcriptor
      for (let i = 0; i < part.length; ) {
        if (token !== sim.token) return;
        const len = 2 + ((Math.random() * 3) | 0);
        sim.target = 0.35 + Math.random() * 0.5;
        onDelta(itemId, part.slice(i, i + len), true);
        i += len;
        await wait(55 + Math.random() * 60);
      }
    }
    sim.target = 0;
    field.setSpeaking(false);
    await wait(350);
    if (token !== sim.token) return;
    onCompleted(itemId, text, true);
    requestDirection(text, itemId);
  }

  async function simulatePoem(lines) {
    const token = ++sim.token;
    for (const line of lines) {
      if (token !== sim.token) return;
      await simulateVerse(line, token);
      await wait((show.mode === 'palabras' ? 900 : 4200) + line.length * 60);
    }
  }

  const debug = new DebugPanel({
    startOpen: params.has('debug'),
    verse: (text) => simulateVerse(text),
    poem: (lines) => simulatePoem(lines),
    stop: () => {
      sim.token++;
      sim.target = 0;
      field.setSpeaking(false);
    },
    physics: (modo) => field.setPhysics({ modo }),
    figure: (name, mode, relleno) =>
      applyDirection({ ...localArtDirection(name), modo_visual: mode, figura: name, relleno, svg_paths: [], fisica: { ...field.phys }, verso: field.corpus.slice(-160) }),
    release: () => field.releaseFigure(true),
  });
  debug.setStatus({ backend: 'offline' });

  // ── teclado del operador ─────────────────────────────────────────────────
  // teclas que cambian lo que se ve: se graban y, al re-proyectar, las repite el backend
  const SHOW_KEY = /^(arrowright|arrowleft|[0-9]|s|p|t|l)$/;
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (SHOW_KEY.test(k) || show.artistForKey(k) >= 0) {
      if (replayMode) return; // re-proyectando: el show lo conduce la grabación
      e.preventDefault();
      logUi({ key: k });
    }
    doKey(k, e);
  });

  function doKey(k, e = null) {
    if (k === 'arrowright' || k === 'arrowleft') {
      show.step(k === 'arrowright' ? 1 : -1);
      config.setState(show.label());
      return;
    }
    if (k === 'c') config.toggle();
    else if (k === 'd') debug.toggle();
    else if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (k === '5') show.goFlatFinal(); // cierre: todo se desarma y queda el logo de FLAT
    else if (k === '0') show.goSparse(); // sólo transcripción: pocas palabras que arman figuras y se rompen
    else if (k === 's') show.toggleRecord();
    else if (k === 'p') show.stop();
    else if (k === 't') show.startWords();
    else if (k === 'l') show.goLoop();
    else if (show.artistForKey(k) >= 0) show.goArtist(show.artistForKey(k) + 1); // la tecla elegida en el panel C
    else if (/^[1-9]$/.test(k)) show.notify(`Ningún artista tiene la tecla ${k} (panel C → Artistas)`);
    else if (k === 'escape') {
      config.toggle(false);
      debug.toggle(false);
    } else if (k === ' ' && debug.isOpen) {
      e?.preventDefault();
      debug.nextVerse();
    } else return;
    config.setState(show.label());
  }

  let cursorTimer = 0;
  const showCursor = () => {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => !debug.isOpen && !config.isOpen && document.body.classList.add('hide-cursor'), 2500);
  };
  window.addEventListener('mousemove', showCursor);
  showCursor();

  let dprScale = 1; // lo baja la calidad adaptativa
  function onResize() {
    const { w, h } = frameRect();
    renderer.setPixelRatio(fitDpr(CONFIG.dpr * dprScale, w, h));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    field.resize(camera.aspect, CONFIG.worldH);
    fx.setSize(w, h);
    cloud.resize(field.W, field.H, renderer.domElement.height, fov, camDist);
  }
  window.addEventListener('resize', onResize);
  onResize(); // el formato guardado pudo cambiar el cuadro antes de que existiera este listener

  // ── bucle ────────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let frames = 0, fpsT = 0, timeOffset = 0;
  // avance rápido determinista (calibración y pruebas automáticas)
  function advance(seconds, step = 1 / 60) {
    const t0 = clock.elapsedTime + timeOffset;
    const n = Math.round(seconds / step);
    for (let k = 1; k <= n; k++) field.update(step, t0 + k * step);
    timeOffset += n * step;
  }
  let orbit = 0;

  // ── glitch azaroso: ráfagas de duración e intensidad al azar (la voz fuerte las provoca) ──
  const glitch = { level: 0, burst: 0, amp: 0, wait: 1, frame: 0 };
  // toda transición (figura, título, palabras) dispara una ráfaga de glitch de pantalla
  let lastSmallGlitch = 0;
  field.onTransition = (amp) => {
    if ((settings.glitch_transiciones ?? 1) <= 0) return;
    // las transiciones chicas (cada palabra, cada letra que se rompe) no encadenan glitches de pantalla:
    // a lo sumo uno cada 1,5 s, para que las letras se lean; las grandes (dibujo, escena) siempre
    const now = performance.now();
    if (amp < 0.4) {
      if (now - lastSmallGlitch < 1500) return;
      lastSmallGlitch = now;
    }
    amp *= settings.glitch_transiciones ?? 1;
    glitch.amp = Math.max(glitch.burst > 0 ? glitch.amp : 0, amp);
    glitch.burst = Math.max(glitch.burst, 0.18 + amp * 0.4);
  };
  function updateGlitch(dt) {
    const active = currentStyle === 'glitch' && field.figure;
    const ambient = settings.glitch_ambiente ?? 0; // glitch ocasional en todos los estilos
    const rate = active ? 1 : ambient * 0.25;
    glitch.wait -= dt;
    if (glitch.burst > 0) {
      glitch.burst -= dt;
      glitch.level = glitch.amp * (0.6 + 0.4 * Math.random());
      if (++glitch.frame % 2 === 0) {
        field.uniforms.uGlitchSeed.value = Math.random() * 1000;
        fx.film.uniforms.uGlitchSeed.value = Math.random() * 1000;
      }
    } else {
      glitch.level = 0;
      const voice = field.rms > 0.55 && Math.random() < dt * 4 * rate;
      if (rate > 0 && (glitch.wait <= 0 || voice)) {
        glitch.burst = 0.05 + Math.random() ** 2 * (active ? 0.7 : 0.25);
        glitch.amp = (active ? 0.35 : 0.15) + Math.random() * (active ? 0.65 : 0.3);
        glitch.wait = (-Math.log(1 - Math.random()) * (active ? 1.4 : 9)) / Math.max(rate, 0.05);
      }
    }
    field.uniforms.uGlitch.value = glitch.level;
    fx.film.uniforms.uGlitch.value = glitch.level;
  }

  // ── calidad adaptativa ───────────────────────────────────────────────────
  // Pensada para portátiles sin ventilador (MacBook Air): tras horas de show el chip
  // baja su frecuencia por temperatura. Si los FPS caen, se baja la resolución interna
  // y la cantidad de puntos; si sobran, se recupera. Desactivar con ?adaptativo=0.
  const QUALITY = [
    { name: 'alta', dpr: 1, points: 1 },
    { name: 'media', dpr: 0.85, points: 0.72 },
    { name: 'baja', dpr: 0.7, points: 0.5 },
    { name: 'mínima', dpr: 0.6, points: 0.3 },
  ];
  let quality = 0, slowFor = 0, fastFor = 0;
  const adaptive = num('adaptativo', 1) !== 0;
  function applyQuality() {
    const q = QUALITY[quality];
    dprScale = q.dpr;
    renderer.setPixelRatio(fitDpr(CONFIG.dpr * q.dpr));
    fx.setSize(frameRect().w, frameRect().h);
    cloud.points.geometry.setDrawRange(0, Math.round(CONFIG.points * q.points));
    cloud.resize(field.W, field.H, renderer.domElement.height, fov, camDist);
  }
  function adaptQuality(fps) {
    if (!adaptive || document.hidden) return;
    if (fps < 48) {
      slowFor += 0.5;
      fastFor = 0;
    } else if (fps > 58) {
      fastFor += 0.5;
      slowFor = 0;
    } else {
      slowFor = fastFor = 0;
    }
    if (slowFor >= 4 && quality < QUALITY.length - 1) {
      quality++;
      slowFor = 0;
      applyQuality();
      console.info('[calidad] baja a', QUALITY[quality].name);
    } else if (fastFor >= 45 && quality > 0) {
      quality--;
      fastFor = 0;
      applyQuality();
      console.info('[calidad] sube a', QUALITY[quality].name);
    }
  }
  cloud.resize(field.W, field.H, renderer.domElement.height, fov, camDist);
  function frame() {
    const dt = clock.getDelta();
    const t = clock.elapsedTime + timeOffset;
    // deriva lentísima de cámara: revela la profundidad Z sin marear
    // estética nube de puntos: con figura en pantalla la cámara orbita y revela el relieve
    const pc = settings.pointcloud !== false;
    field.depth = 80 + 380 * (settings.profundidad ?? 0.45);
    const orbitGoal = pc && field.figure ? settings.orbita ?? 0.6 : 0;
    orbit += (orbitGoal - orbit) * (1 - Math.exp(-dt * 0.35));
    // en formatos muy anchos el mismo giro corre y deforma mucho los bordes: se achica en proporción
    const wide = Math.min(1, 2.5 / camera.aspect);
    const yaw = (Math.sin(t * 0.055) * 0.55 * orbit + Math.sin(t * 0.043) * 0.015) * wide;
    const pitch = Math.sin(t * 0.037) * 0.16 * orbit + Math.sin(t * 0.031) * 0.008;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * camDist, Math.sin(pitch) * camDist, Math.cos(yaw) * Math.cos(pitch) * camDist);
    camera.lookAt(0, field.figure ? field.figure.cy * orbit : 0, 0);
    updateGlitch(dt);
    field.update(dt, t);
    cloud.setPalette(field.uniforms.uBase.value, field.uniforms.uSecond.value);
    // sin nube en nombres, modo palabras y logos mostrados como imagen (que se lean limpios)
    const quiet = show.state === 'artist' || (show.state === 'perform' && show.mode === 'palabras') || show.stage.visible;
    const styleCloud = !field.figure ? 1 : currentStyle === 'ascii' ? 0.1 : currentStyle === 'marca' ? 0.5 : 1;
    cloud.update(dt, t, field.rms, { visible: pc && !quiet, intensity: (settings.nube ?? 1) * styleCloud });
    fx.render(t);
    lines.draw(field.time);
    frames++;
    fpsT += dt;
    if (fpsT > 0.5) {
      const fps = frames / fpsT;
      adaptQuality(fps);
      debug.setStats({ fps: Math.round(fps), calidad: QUALITY[quality].name, ...field.stats() });
      frames = 0;
      fpsT = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  requestAnimationFrame(() => document.getElementById('boot')?.classList.add('gone'));

  // acceso desde consola para calibración
  window.poesia = {
    field, show, config, applyDirection, simulateVerse, simulatePoem, advance, CONFIG, emojiFigure, maskToGrid, treat, composeFigure, figureToTone,
    setTestSettings: (o) => (settings = { ...settings, ...o }),
    feedAudio: (rms) => onAudio(rms, 150, true), // pruebas: nivel de micrófono simulado
    // pruebas / calibración: forzar un estilo
    setStyleForTest: (e) => (settings = { ...settings, estilos: { activos: [e], modo: 'azar' } }),
    glitchNow: (secs = 0.6, amp = 0.9) => Object.assign(glitch, { burst: secs, amp }),
  };

  show.goLoop(); // la noche empieza en el loop
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;bottom:8px;left:8px;color:#8c8984;font:12px monospace">${String(e)}</pre>`);
});
