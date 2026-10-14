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
import { TypeField, PHYSICS_MODES } from './typeField.js';
import { createPostFX } from './postfx.js';
import { BackendSocket } from './socket.js';
import { DebugPanel } from './debugPanel.js';
import { localArtDirection, normalizeDirection } from './localDirector.js';
import { sampleFigure } from './svgSampler.js';
import { SHAPES, SHAPE_NAMES } from './shapeLibrary.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) && Number.isFinite(+params.get(k)) ? +params.get(k) : d);
const CONFIG = {
  pool: Math.round(Math.min(30000, Math.max(2000, num('pool', 12000)))),
  ws: params.get('ws') || 'ws://localhost:8765',
  worldH: 1000,
  bloom: num('bloom', 0.55),
  grain: num('grain', 0.055),
  dpr: Math.min(window.devicePixelRatio || 1, num('dpr', 1.5)),
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

  // ── audio reactivo ───────────────────────────────────────────────────────
  let lastRealAudio = -1e9;
  function onAudio(rms, freq, real) {
    if (real) lastRealAudio = performance.now();
    else if (performance.now() - lastRealAudio < 500) return; // el micrófono real manda
    field.setAudio(rms, freq);
    debug.setLevel(rms);
  }

  // ── backend ──────────────────────────────────────────────────────────────
  const socket = new BackendSocket(CONFIG.ws, {
    open: () => debug.setStatus({ backend: 'connected' }),
    close: () => debug.setStatus({ backend: 'offline', mic: '—', openai: '—' }),
    hello: (m) => debug.setStatus({ backend: 'connected', ...(m.status || {}) }),
    status: (m) => debug.setStatus(m.status || {}),
    audio_reactive: (m) => onAudio(+m.rms || 0, +m.freq || 0, true),
    speech: (m) => field.setSpeaking(m.state === 'started'),
    word_delta: (m) => field.typeDelta(m.item_id || 'voz', m.delta || ''),
    verse_completed: (m) => field.completeLine(m.item_id || 'voz', m.text || ''),
    art_direction: (m) => applyDirection(m.data || m),
  });

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
    field.setSpeaking(true);
    const parts = text.split(/(\s+)/);
    for (const part of parts) {
      if (token !== sim.token) return;
      if (!part.trim()) {
        sim.target = 0.05;
        field.typeDelta(itemId, part);
        await wait(70 + Math.random() * 90);
        continue;
      }
      // las palabras llegan en fragmentos, como los deltas reales del transcriptor
      for (let i = 0; i < part.length; ) {
        if (token !== sim.token) return;
        const len = 2 + ((Math.random() * 3) | 0);
        sim.target = 0.35 + Math.random() * 0.5;
        field.typeDelta(itemId, part.slice(i, i + len));
        i += len;
        await wait(55 + Math.random() * 60);
      }
    }
    sim.target = 0;
    field.setSpeaking(false);
    await wait(350);
    if (token !== sim.token) return;
    field.completeLine(itemId, text);
    requestDirection(text, itemId);
  }

  async function simulatePoem(lines) {
    const token = ++sim.token;
    for (const line of lines) {
      if (token !== sim.token) return;
      await simulateVerse(line, token);
      await wait(4200 + line.length * 60);
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

  // ── teclado / kiosk ──────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (debug.isTyping()) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'd') debug.toggle();
    else if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (k >= '1' && k <= '4') field.setPhysics({ modo: PHYSICS_MODES[+k - 1] });
    else if (k === 'c') {
      const name = SHAPE_NAMES[(Math.random() * SHAPE_NAMES.length) | 0];
      debug.actions.figure(name, Math.random() < 0.5 ? 'concreto' : 'hibrido', 'ambos');
    } else if (k === 'x') field.releaseFigure(true);
    else if (k === ' ') {
      e.preventDefault();
      debug.nextVerse();
    }
  });

  let cursorTimer = 0;
  const showCursor = () => {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => !debug.isOpen && document.body.classList.add('hide-cursor'), 2500);
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
  function frame() {
    const dt = clock.getDelta();
    const t = clock.elapsedTime + timeOffset;
    // deriva lentísima de cámara: revela la profundidad Z sin marear
    camera.position.x = Math.sin(t * 0.043) * 28;
    camera.position.y = Math.sin(t * 0.031) * 14;
    camera.lookAt(0, 0, 0);
    field.update(dt, t);
    fx.render(t);
    frames++;
    fpsT += dt;
    if (fpsT > 0.5) {
      debug.setStats({ fps: Math.round(frames / fpsT), ...field.stats() });
      frames = 0;
      fpsT = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  requestAnimationFrame(() => document.getElementById('boot')?.classList.add('gone'));

  // acceso desde consola para calibración
  window.poesia = { field, applyDirection, simulateVerse, simulatePoem, advance, CONFIG };
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;bottom:8px;left:8px;color:#8c8984;font:12px monospace">${String(e)}</pre>`);
});
