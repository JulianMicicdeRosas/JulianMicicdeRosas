// ─────────────────────────────────────────────────────────────────────────────
//  main.js — Poesía Tipográfica · frontend de proyección (Three.js, kiosk).
//
//  Parámetros de URL (opcionales):
//    ?pool=12000     glifos activos (8 000 – 15 000 recomendado)
//    ?ws=ws://localhost:8765
//    ?bloom=0.55  ?grain=0.055  ?dpr=1.5
//    ?debug          abre el panel de calibración al inicio
// ─────────────────────────────────────────────────────────────────────────────
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import * as THREE from 'three';
import { GlyphAtlas, loadFonts } from './glyphAtlas.js';
import { TypeField } from './typeField.js';
import { createPostFX } from './postfx.js';
import { BackendSocket } from './socket.js';
import { DebugPanel } from './debugPanel.js';
import { localArtDirection, normalizeDirection } from './localDirector.js';
import { sampleFigure } from './svgSampler.js';
import { SHAPES } from './shapeLibrary.js';
import { Show, DEFAULT_SETTINGS } from './show.js';
import { ConfigPanel } from './configPanel.js';
import { PointCloud } from './pointCloud.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) && Number.isFinite(+params.get(k)) ? +params.get(k) : d);
const CONFIG = {
  pool: Math.round(Math.min(30000, Math.max(2000, num('pool', 12000)))),
  points: Math.round(Math.min(300000, Math.max(0, num('points', 80000)))),
  ws: params.get('ws') || 'ws://localhost:8765',
  worldH: 1000,
  bloom: num('bloom', 0.55),
  grain: num('grain', 0.055),
  // En Mac (pantallas Retina, equipos sin ventilador) se limita la resolución interna: en el
  // proyector (1x) no cambia nada y en la pantalla del portátil ahorra mucho calor.
  dpr: Math.min(window.devicePixelRatio || 1, num('dpr', /Macintosh|Mac OS X/.test(navigator.userAgent) ? 1.25 : 1.5)),
  idleText: 'escucha la voz que todavía no ha llegado',
};

async function boot() {
  await loadFonts();

  // ── render ───────────────────────────────────────────────────────────────
  const stage = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(CONFIG.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const fov = 30;
  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 10, 8000);
  const camDist = CONFIG.worldH / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  camera.position.set(0, 0, camDist);

  const atlas = new GlyphAtlas(renderer);
  const field = new TypeField({ atlas, count: CONFIG.pool, aspect: camera.aspect, worldH: CONFIG.worldH, idleText: CONFIG.idleText });
  scene.add(field.mesh);

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
  function applyDirection(raw) {
    clearTimeout(pendingDirection);
    const dir = normalizeDirection(raw);
    field.setKeywords(dir.palabras_clave);
    field.setPalette(dir.paleta);
    field.setPhysics(dir.fisica);
    if (dir.modo_visual === 'concreto' || dir.modo_visual === 'hibrido') {
      const interiorTarget = Math.min(4200, CONFIG.pool * 0.32);
      let fig = null;
      if (dir.svg_paths.length) fig = sampleFigure(dir.svg_paths.map((d) => ({ d, op: 'fill' })), { interiorTarget });
      if (!fig) fig = sampleFigure(SHAPES[dir.figura], { interiorTarget }); // biblioteca de respaldo
      if (fig) field.formFigure(fig, dir);
    } else {
      field.releaseFigure(true);
    }
    debug.setDirection(dir);
  }

  function requestDirection(text, itemId) {
    clearTimeout(pendingDirection);
    if (socket.send({ type: 'inject_verse', text, item_id: itemId })) {
      pendingDirection = setTimeout(() => applyDirection(localArtDirection(text)), 9000); // LLM colgado
    } else {
      pendingDirection = setTimeout(() => applyDirection(localArtDirection(text)), 300);
    }
  }

  // ── voz → escena según el modo del show ─────────────────────────────────
  // force = simulador del panel D (permite probar sin estar grabando)
  function onDelta(itemId, delta, force = false) {
    if (!show.recording && !force) return;
    if (show.mode === 'palabras') field.wordsDelta(itemId, delta);
    else field.typeDelta(itemId, delta);
  }
  function onCompleted(itemId, text, force = false) {
    if (!show.recording && !force) return;
    if (show.mode === 'palabras') field.completeWords(itemId, text);
    else field.completeLine(itemId, text);
  }

  // ── audio reactivo ───────────────────────────────────────────────────────
  let lastRealAudio = -1e9;
  function onAudio(rms, freq, real) {
    if (real) lastRealAudio = performance.now();
    else if (performance.now() - lastRealAudio < 500) return; // el micrófono real manda
    field.setAudio(rms, freq);
    debug.setLevel(rms);
  }

  // ── ajustes del show (backend = fuente de verdad, localStorage = respaldo) ─
  const LS_KEY = 'poesia.settings.v1';
  let settings = structuredClone(DEFAULT_SETTINGS);
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved && typeof saved === 'object') settings = { ...settings, ...saved };
  } catch {
    /* sin localStorage: se usan los valores por defecto */
  }
  let saveTimer = 0;
  function setSettings(next, { persist = true } = {}) {
    settings = { ...structuredClone(DEFAULT_SETTINGS), ...next };
    show.setSettings(settings);
    if (!persist) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(settings));
    } catch {
      /* lleno (imágenes grandes): queda en el backend */
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => socket.send({ type: 'save_settings', settings }), 400);
  }

  let toastTimer = 0;
  const toast = document.createElement('div');
  toast.id = 'toast';
  document.body.appendChild(toast);
  function notify(text) {
    config?.setState(show?.label?.() || text);
    if (settings.avisos === false) return;
    toast.textContent = text;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), 2200);
  }

  // pedir al backend los logos de una carpeta (responde con data URLs)
  const logoRequests = new Map();
  let logoReqId = 0;
  function fetchLogos(carpeta) {
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
  });
  show.setSettings(settings);

  // ── backend ──────────────────────────────────────────────────────────────
  let backendSettingsLoaded = false;
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
      debug.setStatus({ backend: 'connected', ...(m.status || {}) });
      config.setMicStatus(m.status || {});
      config.setDefaultPrompt(m.default_prompt);
      const remote = m.settings || {};
      if (!backendSettingsLoaded && Object.keys(remote).length) {
        // el archivo del backend manda; lo de este navegador sólo completa lo que falte
        backendSettingsLoaded = true;
        setSettings({ ...settings, ...remote }, { persist: false });
        if (config.isOpen) config.render();
        if (show.state === 'loop') show.goLoop();
      } else if (!Object.keys(remote).length) {
        socket.send({ type: 'save_settings', settings }); // primera vez: sembrar el archivo
      }
    },
    status: (m) => {
      debug.setStatus(m.status || {});
      config.setMicStatus(m.status || {});
    },
    devices: (m) => config.setDevices(m.devices, m.current),
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
    speech: (m) => show.recording && show.mode === 'poema' && field.setSpeaking(m.state === 'started'),
    word_delta: (m) => onDelta(m.item_id || 'voz', m.delta || ''),
    verse_completed: (m) => onCompleted(m.item_id || 'voz', m.text || ''),
    art_direction: (m) => {
      const d = m.data || m;
      // las direcciones del simulador siempre se aplican; las de la voz sólo grabando en modo poema
      if (d.source === 'debug' || (show.recording && show.mode === 'poema')) applyDirection(d);
    },
  });

  const config = new ConfigPanel({
    getSettings: () => settings,
    onChange: (next) => setSettings(next),
    onDevice: (dev) => socket.send({ type: 'set_device', device: dev }),
    requestDevices: () => socket.send({ type: 'list_devices' }),
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
    if (show.mode === 'poema') requestDirection(text, itemId);
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
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'c') config.toggle();
    else if (k === 'd') debug.toggle();
    else if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (/^[0-9]$/.test(k)) show.goArtist(k === '0' ? 10 : +k);
    else if (k === 's') show.start('poema');
    else if (k === 't') show.toggleWords();
    else if (k === 'l') show.goLoop();
    else if (k === 'escape') {
      config.toggle(false);
      debug.toggle(false);
    } else if (k === ' ' && debug.isOpen) {
      e.preventDefault();
      debug.nextVerse();
    } else return;
    config.setState(show.label());
  });

  let cursorTimer = 0;
  const showCursor = () => {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => !debug.isOpen && !config.isOpen && document.body.classList.add('hide-cursor'), 2500);
  };
  window.addEventListener('mousemove', showCursor);
  showCursor();

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    field.resize(camera.aspect, CONFIG.worldH);
    fx.setSize(w, h);
    cloud.resize(field.W, field.H, renderer.domElement.height, fov, camDist);
  }
  window.addEventListener('resize', onResize);

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
    renderer.setPixelRatio(CONFIG.dpr * q.dpr);
    fx.setSize(window.innerWidth, window.innerHeight);
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
    const yaw = Math.sin(t * 0.055) * 0.55 * orbit + Math.sin(t * 0.043) * 0.015;
    const pitch = Math.sin(t * 0.037) * 0.16 * orbit + Math.sin(t * 0.031) * 0.008;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * camDist, Math.sin(pitch) * camDist, Math.cos(yaw) * Math.cos(pitch) * camDist);
    camera.lookAt(0, field.figure ? field.figure.cy * orbit : 0, 0);
    field.update(dt, t);
    cloud.setPalette(field.uniforms.uBase.value, field.uniforms.uSecond.value);
    // sin nube en nombres, modo palabras y logos mostrados como imagen (que se lean limpios)
    const quiet = show.state === 'artist' || (show.state === 'perform' && show.mode === 'palabras') || show.logoBox.classList.contains('on');
    cloud.update(dt, t, field.rms, { visible: pc && !quiet, intensity: settings.nube ?? 1 });
    fx.render(t);
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
  window.poesia = { field, show, config, applyDirection, simulateVerse, simulatePoem, advance, CONFIG };

  show.goLoop(); // la noche empieza en el loop
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;bottom:8px;left:8px;color:#8c8984;font:12px monospace">${String(e)}</pre>`);
});
