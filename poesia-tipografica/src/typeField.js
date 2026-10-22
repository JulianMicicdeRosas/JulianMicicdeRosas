// ─────────────────────────────────────────────────────────────────────────────
//  typeField.js — Campo tipográfico: 8 000-15 000 glifos instanciados, un único
//  draw call. Cada partícula es una letra real del poema.
//
//  Estados de una partícula:
//    FREE    → obedece a la física simbólica activa (lluvia / enjambre / vórtice / ceniza)
//    LINE    → forma parte del verso que se está pronunciando (subtítulo vivo)
//    FIGURE  → reclutada por un caligrama: viaja a su punto objetivo (contorno o halftone)
//    CURSOR  → partícula 0: cabezal de escritura que respira con la voz
//
//  La física corre en CPU sobre typed arrays (O(N), sin vecinos cuadráticos:
//  el enjambre usa una rejilla espacial agregada). La reactividad acústica de
//  latencia cero vive en el vertex shader (uniforms uRms / uFreq).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { glyphVertex, glyphFragment } from './shaders.js';
import { pointAt, RES } from './svgSampler.js';
import { ASCII_SYMBOLS } from './glyphAtlas.js';

const FREE = 0;
const LINE = 1;
const FIGURE = 2;
const TITLE = 3;  // nombre del artista / títulos tipográficos
const WORD = 4;   // modo palabras (T): palabras dispersas por la pared
const BGW = 5;    // telón de fondo: bloque de texto mono del que se desprenden letras
const CURSOR = 9;

export const PHYSICS_MODES = ['lluvia_text_rain', 'enjambre_lozano', 'vortice_sandison', 'dispersion_ceniza'];
const RAIN = 0, SWARM = 1, VORTEX = 2, ASH = 3;

const RAIN_COLS = 240;
const GRID_CELL = 90;
const TAU = Math.PI * 2;

const fract = (x) => x - Math.floor(x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
};
const STOP = new Set('la el los las lo y o u e de del en se un una unos unas al que por con sin su sus mi mis tu tus a es no ni le les me te nos ya muy mas pero como para cuando donde entre sobre hasta desde este esta eso esa ese aqui alli hay fue era son'.split(' '));
const normalizeWord = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9]/g, '');

// Campo de ruido "curl" analítico (divergencia nula, ~6 trig por llamada).
const _c = { x: 0, y: 0 };
function curl(x, y, t, freq) {
  const X = x * freq, Y = y * freq;
  const a1 = X + t * 0.31, b1 = Y * 1.3 - t * 0.23;
  const sa = Math.sin(a1), ca = Math.cos(a1), sb = Math.sin(b1), cb = Math.cos(b1);
  const c2 = Math.cos(X * 2.1 + Y * 1.7 + t * 0.47);
  const s3 = Math.sin(X * 4.3 - Y * 3.9 - t * 0.61);
  const dpx = ca * cb + 1.05 * c2 - 1.075 * s3;
  const dpy = -1.3 * sa * sb + 0.85 * c2 + 0.975 * s3;
  _c.x = dpy * 0.5;
  _c.y = -dpx * 0.5;
  return _c;
}

export class TypeField {
  constructor({ atlas, count = 12000, aspect = 16 / 9, worldH = 1000, idleText = '' }) {
    this.atlas = atlas;
    this.N = count;
    this.H = worldH;
    this.W = worldH * aspect;
    this.time = 0;
    const N = count;

    const F = () => new Float32Array(N);
    this.px = F(); this.py = F(); this.pz = F();
    this.vx = F(); this.vy = F(); this.vz = F();
    this.rot = F(); this.size = F(); this.sizeT = F();
    this.alpha = F(); this.alphaT = F();
    this.slot = F(); this.tint = F(); this.accent = F();
    this.birth = F(); this.seed = F(); this.seed2 = F(); this.level = F();
    this.tx = F(); this.ty = F(); this.tz = F(); this.trot = F(); this.tsize = F(); this.talpha = F();
    this.delay = F(); this.life = F();
    // glifo pendiente: se aplica cuando la letra parte hacia su lugar en el caligrama
    this.pslot = F().fill(-1); this.ptint = F(); this.paccent = F();
    this.grp = F(); // semilla compartida por palabra/título: respiran como un bloque
    this.rest = F(); this.restY = F(); this.restH = F();
    this.restCol = new Int16Array(N);
    this.state = new Uint8Array(N);

    // ── corpus: el poema acumulado alimenta el reciclaje de glifos ─────────
    this.corpus = (idleText || 'la voz escribe en la oscuridad').trim();
    this.corpusChars = 0; // caracteres de poema real (no el texto de reposo)
    this.cursorC = 0;
    this.keywords = new Set();
    this.accentUse = 0;

    // ── física ─────────────────────────────────────────────────────────────
    this.phys = { modo: 'lluvia_text_rain', intensidad: 0.5, velocidad: 0.45, turbulencia: 0.35, densidad: 0.6 };
    this.modeW = new Float32Array([1, 0, 0, 0]);
    this.modeTarget = RAIN;
    this.transitionBoost = 0;
    this.floorBase = new Float32Array(RAIN_COLS);
    this.accum = new Float32Array(RAIN_COLS);
    this.restingActive = false;
    this.shelf = null;
    this.figure = null;
    this.figureDensity = 1;
    this.figureAlpha = 1;

    // ── voz / línea ────────────────────────────────────────────────────────
    this.rms = 0;
    this.freq = 0;
    this.speaking = false;
    this.speakingUntil = 0;
    this.line = null;
    this.allocCursor = 1;
    this.depth = 220;          // extrusión Z de las figuras (compartida con la nube de puntos)
    this.onFigure = null;      // (fig, mapping) → nube de puntos
    this.onRelease = null;
    this.cursorEnabled = true;
    this.sceneDensity = 1;
    this.title = null;
    this.words = [];
    this.wordRects = [];
    this.wordBufs = new Map();
    // muro de palabras (modo T): grilla monoespaciada estricta
    this.wallMode = true;
    this.wordsToBackdrop = false; // modo palabras: lo dicho se escribe en el telón (donde se calan las ilustraciones)
    // marca aplicada a todo (tipografía y mayúsculas del manual)
    this.brandAll = false;
    this.brandUpper = false;
    this.wallRows = 34;
    this.wallUpper = true;
    this.wall = null;
    this.wordSeen = new Set();
    // telón de fondo (bloque de palabras repetidas, como un muro de texto) y transiciones con glitch
    this.backdrop = null;
    this.backdropOn = false;
    this.backdropHoles = [];
    this.shape = null;       // grilla de texto del LLM: { grid, gw, gh, pol: 'positivo'|'negativo', until }
    this.bdFill = null;      // llenado progresivo del telón hasta la próxima imagen: { t0, dur }
    this.bdRows = 40; // filas del muro = resolución de las ilustraciones (≈ 11 000 celdas: entra en el pool)
    this.edgeAccent = true; // contorno de las ilustraciones en el color de acento
    // muro de artistas: palabras grandes alineadas a la grilla (2×, 3×, 4× del tamaño mínimo)
    this.wallFx = false;
    this.bigWords = []; // {c0, r0, k, len, idx[], until}
    this.titleFade = null; // el nombre se borra de a poco: su hueco en el muro dura hasta que termina
    // placas de artista hablando (modo «muro»): palabras de muchos tamaños + sólo el dibujo del telón
    this.artistWall = false;
    this.artistCross = false; // «cruce»: palabras horizontales y verticales, como un crucigrama
    this.sparseMax = 9;
    this.sparseKeep = 0;
    this.flowMode = null; // 6 «sedimento» · 7 «partitura»
    this.flow = []; // tecla 0: párrafos que se acumulan antes de borrar (0 = cada palabra vence sola)
    this.sparsePara = 0;
    this.backdropOnlyShape = false; // el telón sólo se ve donde está el dibujo
    this.fxVer = 0;
    this.fxNext = 0;
    this.breaking = []; // letras que se rompen con glitch y luego se apagan: {i, at}
    this.wmask = null; // dónde hay palabras vivas (grilla del telón): nada se dibuja encima de ellas
    this.maskNext = 0;
    this.flowLead = 0;
    // tecla 0: pocas palabras que arman figuras entre ellas
    this.sparseMode = false;
    this.sparse = []; // {idx[], x, y, until, broken}
    this.sparseFig = null;
    this.glitchMoves = true; // toda letra que cambia de lugar lo hace a saltos con cortes, no volando
    this.ambientRain = true; // sin letras flotando: el ambiente es sólo lluvia que cae del telón
    this.gph = new Int32Array(N).fill(-1);
    this.keepFall = new Uint8Array(N);
    this.onTransition = null; // (intensidad) → ráfaga de glitch de pantalla
    this.idleText = (idleText || 'la voz escribe en la oscuridad').trim();

    this._buildMesh();
    this._seedParticles();
    this.resize(aspect, worldH);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  GPU
  // ════════════════════════════════════════════════════════════════════════
  _buildMesh() {
    const N = this.N;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    this.posRot = new Float32Array(N * 4);
    this.data = new Float32Array(N * 4);
    this.meta = new Float32Array(N * 4);
    this.aPosRot = new THREE.InstancedBufferAttribute(this.posRot, 4).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage);
    this.aMeta = new THREE.InstancedBufferAttribute(this.meta, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPosRot', this.aPosRot);
    geo.setAttribute('iData', this.aData);
    geo.setAttribute('iMeta', this.aMeta);
    geo.instanceCount = N;

    this.uniforms = {
      uAtlas: { value: this.atlas.texture },
      uCols: { value: this.atlas.cols },
      uRows: { value: this.atlas.rows },
      uCell: { value: this.atlas.cell / this.atlas.size },
      uTime: { value: 0 },
      uRms: { value: 0 },
      uFreq: { value: 0 },
      uFreshness: { value: 0.85 },
      uGlitch: { value: 0 },
      uGlitchSeed: { value: 0 },
      uSlots: { value: 1 },
      uGlobalAlpha: { value: 1 },
      uBase: { value: new THREE.Color('#F4F1EA') },
      uSecond: { value: new THREE.Color('#8C8984') },
      uAccent: { value: new THREE.Color('#C9C4BA') },
    };
    this.paletteTarget = {
      base: this.uniforms.uBase.value.clone(),
      second: this.uniforms.uSecond.value.clone(),
      accent: this.uniforms.uAccent.value.clone(),
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: glyphVertex,
      fragmentShader: glyphFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.metaDirty = true;
  }

  _seedParticles() {
    for (let i = 0; i < this.N; i++) {
      const s = Math.random();
      this.seed[i] = s;
      this.seed2[i] = Math.random();
      this.px[i] = (Math.random() - 0.5) * this.W;
      this.py[i] = (Math.random() - 0.5) * this.H;
      this.pz[i] = (s - 0.5) * 260;
      this.size[i] = this.sizeT[i] = this._ambientSize(i);
      this.birth[i] = -100;
      this.state[i] = FREE;
      this.life[i] = Math.random() * 8;
      this._recycleGlyph(i);
    }
    // partícula 0 = cursor de escritura
    this.state[0] = CURSOR;
    this.slot[0] = this.atlas.slot('|', 'serif');
    this.tint[0] = 0;
    this.accent[0] = 0;
  }

  _ambientSize(i) {
    const s = this.seed[i];
    return this.H * (0.013 + 0.017 * s * s + (this.seed2[i] > 0.985 ? 0.02 : 0));
  }

  resize(aspect, worldH = this.H) {
    this.H = worldH;
    this.W = worldH * aspect;
    this.lineSize = clamp(this.H * 0.05, 34, 70);
    this.lineY = -this.lineSize * 0.5; // centrada: el muro le abre un hueco (ver _bdHoles)
    this.lineMaxW = this.W * 0.78;
    this.colW = this.W / RAIN_COLS;
    this.gridCols = Math.ceil(this.W / GRID_CELL) + 2;
    this.gridRows = Math.ceil(this.H / GRID_CELL) + 2;
    const cells = this.gridCols * this.gridRows;
    this.gCount = new Float32Array(cells);
    this.gSx = new Float32Array(cells);
    this.gSy = new Float32Array(cells);
    this.gVx = new Float32Array(cells);
    this.gVy = new Float32Array(cells);
    this._recomputeFloor();
    if (this.line) this._layoutLine();
    if (this.backdrop) this._bdClear(); // cambio de formato: el telón se rearma a la medida nueva
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Entradas
  // ════════════════════════════════════════════════════════════════════════
  setAudio(rms, freq) {
    this.rms = rms;
    this.freq = freq;
    this.uniforms.uRms.value = rms;
    this.uniforms.uFreq.value = freq;
  }

  setSpeaking(on) {
    this.speaking = on;
    if (on) this.speakingUntil = this.time + 30;
    else this.speakingUntil = this.time + 1.2;
  }

  setPalette(p = {}) {
    const safe = (hex, fallback) => (/^#[0-9a-fA-F]{6}$/.test(hex || '') ? hex : fallback);
    this.paletteTarget.base.set(safe(p.base, '#F4F1EA'));
    this.paletteTarget.second.set(safe(p.secundario, '#8C8984'));
    this.paletteTarget.accent.set(safe(p.acento, '#C9C4BA'));
    this.accentUse = clamp(+p.uso_acento || 0, 0, 0.25);
  }

  setPhysics(f = {}) {
    const idx = this.ambientRain ? RAIN : PHYSICS_MODES.indexOf(f.modo);
    if (idx >= 0) this.modeTarget = idx;
    const n = (v, d) => (Number.isFinite(+v) ? clamp(+v, 0, 1) : d);
    this.phys = {
      modo: PHYSICS_MODES[this.modeTarget],
      intensidad: n(f.intensidad, this.phys.intensidad),
      velocidad: n(f.velocidad, this.phys.velocidad),
      turbulencia: n(f.turbulencia, this.phys.turbulencia),
      densidad: n(f.densidad, this.phys.densidad),
    };
  }

  setKeywords(list = []) {
    this.keywords = new Set(list.map(normalizeWord).filter(Boolean));
  }

  addCorpus(text) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    if (!t) return;
    if (this.corpusChars === 0) this.corpus = '';
    this.corpus = (this.corpus + '  ' + t).slice(-6000);
    this.corpusChars += t.length;
    this.cursorC = Math.max(0, this.corpus.length - t.length - 2); // reciclar primero lo recién dicho
  }

  _nextCorpusChar() {
    const c = this.corpus;
    const start = Math.max(0, c.length - 2400);
    const span = c.length - start;
    for (let k = 0; k < 12; k++) {
      const ch = c[start + (this.cursorC++ % span)];
      if (ch && ch.trim()) return ch;
    }
    return '·';
  }

  _recycleGlyph(i) {
    const ch = this._nextCorpusChar();
    this.slot[i] = this.atlas.slot(this._u(ch), this._k(this.seed[i] < 0.64 ? 'serif' : 'mono'));
    this.tint[i] = fract(this.seed[i] * 7.31) * 0.85;
    this.accent[i] = Math.random() < this.accentUse * 0.22 ? 1 : 0;
    this.metaDirty = true;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Verso en vivo (subtítulo): las letras nacen donde se pronuncian
  // ════════════════════════════════════════════════════════════════════════
  /** Familia a usar: la de la marca si está aplicada a todo. */
  _k(kind) {
    if (!this.brandAll) return kind;
    return kind === 'serif' ? 'brandText' : 'brand'; // serif → Roboto · mono → Geist Mono
  }

  _u(text) {
    return this.brandUpper ? String(text).toUpperCase() : text;
  }

  _allocParticle(preferVisible = false) {
    const N = this.N;
    let pick = -1, fallback = -1;
    for (let k = 0; k < 900; k++) {
      const i = 1 + ((this.allocCursor + k) % (N - 1));
      const st = this.state[i];
      if (st === FREE) {
        if (preferVisible ? this.alpha[i] > 0.15 : this.alpha[i] < 0.12) {
          pick = i;
          break;
        }
        if (fallback < 0) fallback = i;
      } else if (st === FIGURE && fallback < 0 && this.time < this.delay[i]) {
        fallback = i;
      }
    }
    if (pick < 0) pick = fallback;
    if (pick < 0) {
      for (let k = 0; k < N - 1; k++) {
        const i = 1 + ((this.allocCursor + k) % (N - 1));
        if (this.state[i] !== LINE && this.state[i] !== CURSOR && this.state[i] !== TITLE) {
          pick = i;
          break;
        }
      }
    }
    if (pick < 0) return -1;
    this.allocCursor = pick + 1;
    this._unrest(pick);
    this.state[pick] = LINE;
    return pick;
  }

  _newLine(itemId) {
    return { itemId, rows: [[]], text: '', releaseAt: Infinity, completed: false };
  }

  /** word_delta: añade texto al verso vivo. */
  typeDelta(itemId, delta, { stagger = 0, level = null } = {}) {
    if (!delta) return;
    if (!this.line || this.line.itemId !== itemId || this.line.completed) {
      if (this.line) this.releaseLine();
      this.line = this._newLine(itemId);
    }
    const line = this.line;
    const t = this.time;
    const S = this.lineSize;
    const born = clamp(level ?? Math.max(0.18, this.rms), 0, 1);
    const spaceAdv = S * 0.26;
    let n = 0;
    for (const ch of delta) {
      let row = line.rows[line.rows.length - 1];
      if (ch === '\n') {
        if (row.length) line.rows.push([]);
        continue;
      }
      if (!ch.trim()) {
        if (row.length && row[row.length - 1].i !== -1) row.push({ i: -1, adv: spaceAdv });
        continue;
      }
      const i = this._allocParticle();
      if (i < 0) break;
      const slot = this.atlas.slot(this._u(ch), this._k('serif'));
      this.slot[i] = slot;
      this.pslot[i] = -1;
      this.tint[i] = 0;
      this.accent[i] = 0;
      this.birth[i] = t + n * stagger;
      this.delay[i] = t + n * stagger;
      this.level[i] = born;
      this.tsize[i] = S;
      this.rot[i] = 0;
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      this.metaDirty = true;
      row.push({ i, adv: this.atlas.adv(slot) * S * 1.02, fresh: true });
      n++;
      // ajuste de línea por palabras
      const width = row.reduce((a, e) => a + e.adv, 0);
      if (width > this.lineMaxW) {
        let k = row.length - 1;
        while (k > 0 && row[k].i !== -1) k--;
        const moved = k > 0 ? row.splice(k + 1) : row.splice(row.length - 1);
        if (k > 0) row.pop();
        line.rows.push(moved);
      }
    }
    line.text += delta;
    // máximo 3 renglones vivos: el más antiguo se libera al campo
    while (line.rows.length > 3) {
      const row = line.rows.shift();
      this._releaseEntries(row);
      // su lugar lo toma el renglón siguiente: se suelta un renglón más arriba y cae por detrás del verso
      for (const e of row) if (e.i >= 0) this.py[e.i] += S * 0.98;
    }
    this._layoutLine();
  }

  _layoutLine() {
    const line = this.line;
    if (!line) return;
    this.maskNext = 0; // la máscara de palabras se entera en el próximo cuadro
    const S = this.lineSize;
    const rows = line.rows;
    let maxW = 0;
    for (const row of rows) maxW = Math.max(maxW, row.reduce((a, e) => a + e.adv, 0));
    const pad = S * 0.6;
    line.rect = { x0: -maxW / 2 - pad, x1: maxW / 2 + pad, y0: this.lineY - S * 0.5 - pad, y1: this.lineY + (rows.length - 0.5) * S * 0.98 + pad };
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      let width = 0;
      for (const e of row) width += e.adv;
      let x = -width / 2;
      const y = this.lineY + (rows.length - 1 - r) * S * 0.98;
      for (const e of row) {
        const cx = x + e.adv / 2;
        x += e.adv;
        if (e.i < 0) continue;
        this.tx[e.i] = cx;
        this.ty[e.i] = y;
        this.tz[e.i] = 0;
        // el verso se recentra de una vez, como bloque: si cada letra viajara por su cuenta, se pisarían
        this.px[e.i] = cx;
        this.py[e.i] = y;
        if (e.fresh) {
          // nacimiento exacto en su lugar del verso: sin vuelo, sin retardo
          this.px[e.i] = cx;
          this.py[e.i] = y;
          this.pz[e.i] = 0;
          this.alpha[e.i] = this.delay[e.i] <= this.time ? 1 : 0;
          this.size[e.i] = S;
          e.fresh = false;
        }
      }
    }
  }

  /** verse_completed: reconcilia con la transcripción final y programa la liberación. */
  completeLine(itemId, text) {
    const final = (text || '').replace(/\s+/g, ' ').trim();
    if (!final) return;
    const norm = (s) => s.replace(/\s+/g, '').toLowerCase();
    if (!this.line || this.line.itemId !== itemId) {
      this.typeDelta(itemId, final, { stagger: 0.022 });
    } else if (norm(this.line.text) !== norm(final)) {
      const old = this.line;
      this.line = null;
      for (const row of old.rows) this._releaseEntries(row, true, true); // la versión corregida reemplaza a la vieja en el acto
      this.typeDelta(itemId, final, { stagger: 0.008, level: 0.15 });
    }
    if (this.line) {
      this.line.completed = true;
      this.line.releaseAt = this.time + clamp(1.8 + final.length * 0.035, 2.2, 5.5);
    }
    this.addCorpus(final);
  }

  _releaseEntries(row, quiet = false, swap = false) {
    for (const e of row) {
      if (e.i < 0) continue;
      const i = e.i;
      this.state[i] = FREE;
      this.vx[i] = (Math.random() - 0.5) * 24;
      this.vy[i] = quiet ? 0 : 12 + Math.random() * 30;
      this.vz[i] = (Math.random() - 0.5) * 40;
      this.life[i] = 0;
      if (quiet) this.alphaT[i] = 0;
      if (swap) this.alpha[i] = 0; // no se superpone con la que la reemplaza
    }
  }

  /** El transcriptor descartó el segmento (era una anotación o una frase inventada): se desvanece. */
  discardLine(itemId) {
    if (this.line && this.line.itemId === itemId) {
      const old = this.line;
      this.line = null;
      for (const row of old.rows) this._releaseEntries(row, true);
    }
    this.wordBufs.delete(itemId);
    this.wordSeen.delete(itemId);
  }

  releaseLine() {
    const line = this.line;
    if (!line) return;
    let x0 = Infinity, x1 = -Infinity, y = -Infinity;
    for (const row of line.rows) {
      for (const e of row) {
        if (e.i < 0) continue;
        x0 = Math.min(x0, this.px[e.i] - e.adv / 2);
        x1 = Math.max(x1, this.px[e.i] + e.adv / 2);
        y = Math.max(y, this.py[e.i] + this.lineSize * 0.3);
      }
      this._releaseEntries(row);
    }
    this.line = null;
    // el verso recién dicho queda como repisa invisible para la lluvia (Text Rain)
    if (isFinite(x0)) {
      this.shelf = { x0, x1, y, until: this.time + 14 };
      this._recomputeFloor();
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Caligramas
  // ════════════════════════════════════════════════════════════════════════
  _stream(text, skipSpaces) {
    const src = (text && text.trim() ? text.trim() : this.corpus.slice(-400)).replace(/\s+/g, ' ').replace(/ \/ /g, '  ') + '   ';
    const flags = new Uint8Array(src.length);
    if (this.keywords.size) {
      const re = /[\p{L}\p{N}]+/gu;
      let m;
      while ((m = re.exec(src))) {
        if (this.keywords.has(normalizeWord(m[0]))) flags.fill(1, m.index, m.index + m[0].length);
      }
    }
    let idx = 0;
    return () => {
      for (let guard = 0; guard < src.length + 1; guard++) {
        const k = idx++ % src.length;
        const ch = src[k];
        if (skipSpaces && ch === ' ') continue;
        return [ch, flags[k]];
      }
      return ['·', 0];
    };
  }

  /**
   * Forma una figura con las letras del poema.
   * @param fig  salida de sampleFigure()
   * @param dir  dirección de arte normalizada
   */
  formFigure(fig, dir) {
    const t = this.time;
    this.releaseFigure(true);
    const atlas = this.atlas;
    // escala por la caja real de la figura: una palabra o un logo apaisado ocupa el ancho
    const bb = fig.bbox || { x: 0, y: 0, w: RES, h: RES };
    const k = Math.min((this.H * 0.74) / bb.h, (this.W * 0.84) / bb.w) * clamp(+dir.escala || 1, 0.2, 1.5);
    const ox = bb.x + bb.w / 2, oy = bb.y + bb.h / 2; // centro de la figura en el lienzo
    const cx = 0;
    const cy = Number.isFinite(dir.cy) ? dir.cy * this.H : this.H * 0.055;
    const typo = dir.tipografia || 'mixta';
    const brand = dir.estilo === 'marca' || this.brandAll;
    if (this.brandUpper) dir = { ...dir, mayusculas: true };
    const kindC = brand ? 'brandText' : typo === 'mono' ? 'mono' : 'serif';
    const kindI = brand ? 'brand' : typo === 'serif' ? 'serif' : 'mono';
    if (dir.mayusculas) dir = { ...dir, verso: (dir.verso || '').toUpperCase(), palabras_clave: (dir.palabras_clave || []).map((w) => w.toUpperCase()) };
    const fill = dir.relleno || 'ambos';
    const useKeys = this.accentUse > 0;

    let lineCount = 0;
    if (this.line) for (const row of this.line.rows) for (const e of row) if (e.i >= 0) lineCount++;
    const capacity = Math.max(0, this.N - 1 - lineCount - Math.round(this.N * 0.06));

    // targets planos: x, y, z, rot, size, alpha, tint, slot, accent, delay, key
    const T = [];
    let contourCount = 0;

    if (dir.estilo === 'ascii' && fig.mask) {
      contourCount = this._asciiTargets(T, fig, dir, k, ox, oy, cx, cy, capacity);
    } else if (fill !== 'volumen' || fig.interior.length === 0) {
      const next = this._stream(dir.verso, false);
      const S = clamp(this.H * 0.027, 16, 36);
      const spaceAdvPx = (S * 0.28) / k;
      for (const pl of fig.polylines) {
        let s = 0, hint = 0;
        while (s < pl.length && T.length / 11 < capacity) {
          const [ch, key] = next();
          if (ch === ' ') {
            s += spaceAdvPx;
            continue;
          }
          const slot = atlas.slot(ch, kindC);
          const advPx = (atlas.adv(slot) * S) / k;
          const mid = s + advPx / 2;
          if (mid > pl.length) break;
          const p = pointAt(pl, mid, hint);
          hint = p.index;
          T.push((p.x - ox) * k + cx, (oy - p.y) * k + cy, 8, Math.atan2(-p.ty, p.tx), S, 1, 0, slot, useKeys && key ? 1 : 0, 0, contourCount++);
          s += advPx * 1.04;
        }
      }
      // figuras sin path (texto, logos): bordes aclarados en una rejilla del tamaño de la letra
      const E = fig.edges;
      if (E && E.length) {
        const g = (S * 0.8) / k;
        const seen = new Set();
        for (let e = 0; e < E.length && T.length / 11 < capacity; e += 4) {
          const key2 = ((E[e] / g) | 0) * 100000 + ((E[e + 1] / g) | 0);
          if (seen.has(key2)) continue;
          seen.add(key2);
          let [ch, key] = next();
          while (ch === ' ') [ch, key] = next();
          let ang = Math.atan2(-E[e + 3], E[e + 2]);
          if (ang > Math.PI / 2) ang -= Math.PI; // sin letras cabeza abajo en bordes desordenados
          else if (ang < -Math.PI / 2) ang += Math.PI;
          T.push((E[e] - ox) * k + cx, (oy - E[e + 1]) * k + cy, 8, ang, S * 0.9, 1, 0, atlas.slot(ch, kindC), useKeys && key ? 1 : 0, 0, contourCount++);
        }
      }
    }
    const contourTargets = T.length / 11;

    if (fill !== 'contorno' && dir.estilo !== 'ascii') {
      const pts = fig.interior;
      const count = pts.length / 3;
      const budget = capacity - contourTargets;
      const keep = count > budget ? budget / count : 1;
      const next = this._stream((dir.palabras_clave || []).join(' ') + ' ' + (dir.verso || ''), true);
      const cell = fig.spacing * k;
      for (let j = 0; j < count; j++) {
        if (keep < 1 && Math.random() > keep) continue;
        const lum = pts[j * 3 + 2];
        const [ch, key] = next();
        const slot = atlas.slot(ch, kindI);
        T.push(
          (pts[j * 3] - ox) * k + cx,
          (oy - pts[j * 3 + 1]) * k + cy,
          (lum - 0.5) * this.depth * 0.85,
          (Math.random() - 0.5) * 0.12,
          cell * (0.95 + 1.45 * lum),
          0.16 + 0.66 * lum,
          (1 - lum) * 0.9,
          slot,
          useKeys && key && Math.random() < 0.5 ? 1 : 0,
          1,
          j,
        );
      }
    }
    let nT = T.length / 11;
    if (nT === 0) return;

    // candidatos: todas las partículas libres; primero las visibles (vuelan desde donde están)
    const cand = [];
    for (let i = 1; i < this.N; i++) if (this.state[i] === FREE || this.state[i] === FIGURE) cand.push(i);
    cand.sort((a, b) => this.alpha[b] - this.alpha[a]);
    nT = Math.min(nT, cand.length);
    const chosen = cand.slice(0, nT);

    // correspondencia espacial barata: ordenar ambos conjuntos por ángulo alrededor del centro
    const angP = new Float32Array(this.N);
    for (const i of chosen) angP[i] = Math.atan2(this.py[i] - cy, this.px[i] - cx);
    chosen.sort((a, b) => angP[a] - angP[b]);
    const order = Array.from({ length: T.length / 11 }, (_, j) => j).slice(0, nT);
    const angT = new Float32Array(T.length / 11);
    let maxR = 1;
    for (const j of order) {
      angT[j] = Math.atan2(T[j * 11 + 1] - cy, T[j * 11] - cx);
      maxR = Math.max(maxR, Math.hypot(T[j * 11] - cx, T[j * 11 + 1] - cy));
    }
    order.sort((a, b) => angT[a] - angT[b]);

    for (let q = 0; q < nT; q++) {
      const i = chosen[q];
      const j = order[q] * 11;
      this._unrest(i);
      this.state[i] = FIGURE;
      this.tx[i] = T[j];
      this.ty[i] = T[j + 1];
      this.tz[i] = T[j + 2];
      this.trot[i] = T[j + 3];
      this.tsize[i] = T[j + 4];
      this.talpha[i] = T[j + 5];
      this.ptint[i] = T[j + 6];
      this.pslot[i] = T[j + 7];
      this.paccent[i] = T[j + 8];
      const r = Math.hypot(T[j] - cx, T[j + 1] - cy) / maxR;
      // el contorno se "dibuja" en el orden del trazo; el volumen florece desde el centro
      this.delay[i] = T[j + 9] === 2
        ? t + 0.5 + 3.2 * (T[j + 10] / Math.max(1, contourCount)) // ASCII: se escribe de arriba abajo
        : T[j + 9] === 0
          ? t + 0.9 + 2.6 * (T[j + 10] / Math.max(1, contourCount))
          : t + 1.4 + 2.2 * r + Math.random() * 0.4;
    }
    this.metaDirty = true;

    const concrete = dir.modo_visual === 'concreto';
    this.figureDensity = concrete ? 0.18 : 0.62;
    this.figureAlpha = concrete ? 1 : 0.78;
    this.figure = {
      k, cx, cy, ox, oy, top: fig.top, mask: fig.mask || null,
      rect: { x0: (bb.x - ox) * k + cx, x1: (bb.x + bb.w - ox) * k + cx, y0: (oy - bb.y - bb.h) * k + cy, y1: (oy - bb.y) * k + cy },
      until: dir.permanente ? Infinity : t + clamp(+dir.duracion_s || 14, 6, 40) + 3.5,
      name: dir.figura || '',
      count: nT,
    };
    this._recomputeFloor();
    this.onTransition?.(0.7);
    this.onFigure?.(fig, this.figure);
  }

  /**
   * Estilo ASCII de densidad: grilla monoespaciada estricta; cada celda toma el glifo cuya tinta
   * corresponde a la luz de la figura (rampa hecha con las letras de la estrofa + signos).
   */
  _asciiTargets(T, fig, dir, k, ox, oy, cx, cy, capacity) {
    const atlas = this.atlas;
    const kind = dir.estilo === 'marca' || this.brandAll ? 'brand' : 'mono';
    // rampa: letras del verso + signos, ordenadas por tinta
    const chars = [...new Set(((dir.verso || '') + ASCII_SYMBOLS).replace(/\s/g, ''))];
    const ramp = chars.map((ch) => atlas.slot(ch, kind)).sort((a, b) => atlas.ink[a] - atlas.ink[b]);
    const R = fig.res;
    const bb = fig.bbox;
    const rows = Math.round(clamp(+dir.ascii_filas || 40, 20, 110));
    const cellH = bb.h / rows; // en px del lienzo
    const cellW = cellH * 0.62; // proporción monoespaciada
    const cols = Math.max(1, Math.floor(bb.w / cellW));
    const S = cellH * k * 1.7; // lado del quad en mundo (la mono ocupa ~el alto de la celda)
    const { mask, lum } = fig;
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (T.length / 11 >= capacity) return n;
        const x0 = bb.x + (bb.w - cols * cellW) / 2 + c * cellW, y0 = bb.y + r * cellH;
        // promedio de la celda (4 muestras): densidad = cobertura × luz
        let m = 0, l = 0;
        for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          const ix = Math.min(R - 1, Math.max(0, Math.round(x0 + fx * cellW)));
          const iy = Math.min(R - 1, Math.max(0, Math.round(y0 + fy * cellH)));
          m += mask[iy * R + ix] / 4;
          l += lum[iy * R + ix] / 4;
        }
        if (m < 0.12 && Math.random() > 0.015) continue; // fondo: casi vacío (alguna mota suelta)
        const v = clamp(m * (0.3 + 0.7 * l) + (Math.random() - 0.5) * 0.08, 0, 1);
        const slot = ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];
        T.push((x0 + cellW / 2 - ox) * k + cx, (oy - (y0 + cellH / 2)) * k + cy, 0, 0, S, 0.55 + 0.45 * v, 0, slot, 0, 2, n++);
      }
    }
    return n;
  }

  releaseFigure(impulse = true) {
    if (!this.figure) return;
    this.onRelease?.(this.figure);
    const { cx, cy } = this.figure;
    for (let i = 1; i < this.N; i++) {
      if (this.state[i] !== FIGURE) continue;
      this.state[i] = FREE;
      this.pslot[i] = -1;
      this.life[i] = Math.random() * 2;
      if (impulse) {
        const dx = this.px[i] - cx, dy = this.py[i] - cy;
        const d = Math.hypot(dx, dy) + 1;
        const f = 30 + Math.random() * 90;
        this.vx[i] += (dx / d) * f;
        this.vy[i] += (dy / d) * f + 15;
        this.vz[i] += (Math.random() - 0.5) * 140;
      }
    }
    this.figure = null;
    this.figureDensity = 1;
    this.figureAlpha = 1;
    this.transitionBoost = 1;
    this.onTransition?.(0.45);
    this._recomputeFloor();
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Lluvia: suelo por columnas (terreno + figura + repisa del verso previo)
  // ════════════════════════════════════════════════════════════════════════
  _recomputeFloor() {
    const fig = this.figure;
    const shelf = this.shelf && this.shelf.until > this.time ? this.shelf : null;
    for (let c = 0; c < RAIN_COLS; c++) {
      const x = -this.W / 2 + (c + 0.5) * this.colW;
      let f = -this.H / 2 + 4 + 5 * Math.sin(c * 0.11) + 3 * Math.sin(c * 0.37);
      if (fig) {
        const fx = Math.round((x - fig.cx) / fig.k + fig.ox);
        if (fx >= 0 && fx < RES && fig.top[fx] >= 0) f = Math.max(f, fig.cy + (fig.oy - fig.top[fx]) * fig.k);
      }
      if (shelf && x >= shelf.x0 && x <= shelf.x1) f = Math.max(f, shelf.y);
      this.floorBase[c] = f;
    }
    this._releaseAllResting();
  }

  _releaseAllResting() {
    for (let i = 0; i < this.N; i++) if (this.rest[i] > 0) this.rest[i] = 0;
    this.accum.fill(0);
    this.restingActive = false;
  }

  _unrest(i) {
    if (this.rest[i] > 0) {
      const c = this.restCol[i];
      this.accum[c] = Math.max(0, this.accum[c] - this.restH[i]);
      this.rest[i] = 0;
    }
  }

  _respawn(i, mode) {
    const W = this.W, H = this.H;
    this._unrest(i);
    this.keepFall[i] = 0;
    if (mode === RAIN) {
      this.px[i] = (Math.random() - 0.5) * W * 1.02;
      this.py[i] = H / 2 + 20 + Math.random() * H * 0.3;
      this.vx[i] = 0;
      this.vy[i] = -40;
    } else if (mode === VORTEX) {
      const a = Math.random() * TAU, r = 15 + Math.random() * 110;
      this.px[i] = Math.cos(a) * r;
      this.py[i] = -H * 0.08 + Math.sin(a) * r;
      this.vx[i] = this.vy[i] = 0;
    } else {
      this.px[i] = (Math.random() - 0.5) * W;
      this.py[i] = (Math.random() - 0.5) * H;
      this.vx[i] = this.vy[i] = 0;
    }
    this.pz[i] = (this.seed[i] - 0.5) * 260;
    this.vz[i] = 0;
    this.alpha[i] = 0;
    this.life[i] = 0;
    this._recycleGlyph(i);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Simulación
  // ════════════════════════════════════════════════════════════════════════
  update(dt, t) {
    dt = Math.min(dt, 1 / 20);
    this.time = t;
    const U = this.uniforms;
    U.uTime.value = t;
    U.uSlots.value = this.atlas.next;
    const kp = 1 - Math.exp(-dt * 0.9);
    U.uBase.value.lerp(this.paletteTarget.base, kp);
    U.uSecond.value.lerp(this.paletteTarget.second, kp);
    U.uAccent.value.lerp(this.paletteTarget.accent, kp);

    // pesos de modo (fundido suave entre físicas)
    const km = 1 - Math.exp(-dt * 0.8);
    let dom = 0;
    for (let m = 0; m < 4; m++) {
      this.modeW[m] += ((m === this.modeTarget ? 1 : 0) - this.modeW[m]) * km;
      if (this.modeW[m] > this.modeW[dom]) dom = m;
    }
    const wR = this.modeW[RAIN], wS = this.modeW[SWARM], wV = this.modeW[VORTEX], wA = this.modeW[ASH];
    if (wR < 0.45 && this.restingActive) this._releaseAllResting();
    this.transitionBoost *= Math.exp(-dt * 0.7);

    if (this.figure && t > this.figure.until) this.releaseFigure(true);
    if (this.shelf && t > this.shelf.until) {
      this.shelf = null;
      this._recomputeFloor();
    }
    if (this.line && t > this.line.releaseAt) this.releaseLine();

    if (t >= this.maskNext) {
      this.maskNext = t + 0.06;
      this._maskUpdate(t);
    }
    this._bdUpdate(dt, t);
    this._breakingUpdate(t);
    if (this.flow.length) this._flowUpdate(dt, t);
    if (this.sparse.length) this._sparseUpdate(t);
    const { intensidad: inten, velocidad: vel, turbulencia: turb, densidad: dens } = this.phys;
    const corpusFactor = clamp(0.1 + this.corpusChars / 2600, 0.1, 1);
    const density = corpusFactor * (0.3 + 0.7 * dens) * this.figureDensity * this.sceneDensity * (wR > 0.5 ? 0.75 : 1) * (this.shape ? 0.12 : 1); // con ilustración: casi sin letras sueltas (la forma se lee limpia)
    const ambient = 0.42 + 0.4 * inten;
    const W = this.W, H = this.H, halfW = W / 2, halfH = H / 2;
    const MK = this.wmask && this.wmask.any ? this.wmask : null;

    // ── rejilla agregada para el enjambre ─────────────────────────────────
    const gc = this.gridCols, gr = this.gridRows;
    if (wS > 0.02) {
      this.gCount.fill(0); this.gSx.fill(0); this.gSy.fill(0); this.gVx.fill(0); this.gVy.fill(0);
      for (let i = 1; i < this.N; i++) {
        if (this.state[i] !== FREE || this.alpha[i] < 0.01) continue;
        const c = clamp(Math.floor((this.px[i] + halfW) / GRID_CELL + 1), 0, gc - 1) + clamp(Math.floor((this.py[i] + halfH) / GRID_CELL + 1), 0, gr - 1) * gc;
        this.gCount[c]++; this.gSx[c] += this.px[i]; this.gSy[c] += this.py[i]; this.gVx[c] += this.vx[i]; this.gVy[c] += this.vy[i];
      }
    }
    const att = [];
    for (let a = 0; a < 3; a++) {
      att.push(W * 0.3 * Math.sin(t * 0.07 * (a + 1) + a * 2.1), H * 0.26 * Math.cos(t * 0.09 * (a + 1.3) + a * 1.7), a % 2 ? 1 : -1);
    }
    const vcx = 0, vcy = -H * 0.08;
    const maxR = 0.62 * Math.max(W, H);

    const { px, py, pz, vx, vy, vz, rot, size, alpha, alphaT, state, seed, seed2 } = this;
    const posRot = this.posRot, data = this.data;
    const kAlpha = 1 - Math.exp(-dt * 2.2);
    const kSize = 1 - Math.exp(-dt * 3);
    const kRot = 1 - Math.exp(-dt * 3.5);
    const kLine = 1 - Math.exp(-dt * 11);
    let visible = 0;

    for (let i = 0; i < this.N; i++) {
      const st = state[i];
      const s = seed[i];
      const o = i * 4;

      if (st === CURSOR) {
        this._updateCursor(dt, t);
      } else if (st === LINE) {
        px[i] += (this.tx[i] - px[i]) * kLine;
        py[i] += (this.ty[i] - py[i]) * kLine;
        pz[i] += (this.tz[i] - pz[i]) * kLine;
        rot[i] += angDiff(0, rot[i]) * kLine;
        size[i] += (this.tsize[i] - size[i]) * kLine;
        if (t >= this.delay[i]) {
          if (alpha[i] < 0.5 && this.delay[i] > t - dt * 1.5) alpha[i] = 1; // aparición seca en su instante
          alphaT[i] = 1;
        } else alphaT[i] = 0;
        alpha[i] += (alphaT[i] - alpha[i]) * kLine;
      } else if (st === FIGURE && t >= this.delay[i]) {
        if (this.pslot[i] >= 0) {
          this.slot[i] = this.pslot[i];
          this.tint[i] = this.ptint[i];
          this.accent[i] = this.paccent[i];
          this.pslot[i] = -1;
          this.metaDirty = true;
        }
        // resorte críticamente amortiguado hacia el punto del caligrama + respiración mínima
        const bx = Math.sin(t * 0.8 + s * 40) * 1.6, by = Math.cos(t * 0.7 + s * 23) * 1.6;
        let arrived = 1;
        if (this.glitchMoves) arrived = this._glitchMove(i, t, bx, by);
        else {
          const w = 3.6 + s * 2.6, w2 = w * w, c2 = 2 * w;
          vx[i] += (w2 * (this.tx[i] + bx - px[i]) - c2 * vx[i]) * dt;
          vy[i] += (w2 * (this.ty[i] + by - py[i]) - c2 * vy[i]) * dt;
          vz[i] += (w2 * (this.tz[i] - pz[i]) - c2 * vz[i]) * dt;
          px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
        }
        rot[i] += angDiff(this.trot[i], rot[i]) * (arrived ? kRot : 1);
        size[i] += (this.tsize[i] - size[i]) * (arrived ? kSize : 0.5);
        alphaT[i] = this.talpha[i] * this.figureAlpha;
        if (arrived) alpha[i] += (alphaT[i] - alpha[i]) * kAlpha;
        else alpha[i] = alphaT[i] * (Math.random() < 0.3 ? 0.15 : 1); // parpadeo en tránsito
      } else if ((st === TITLE || st === WORD || st === BGW) && t >= this.delay[i]) {
        if (this.pslot[i] >= 0) {
          this.slot[i] = this.pslot[i];
          this.tint[i] = this.ptint[i];
          this.accent[i] = this.paccent[i];
          this.pslot[i] = -1;
          this.metaDirty = true;
        }
        const title = st === TITLE;
        const amp = title ? 0.8 : this.wallMode || st === BGW ? 0 : 2.5; // en los muros, grilla estricta
        const g = this.grp[i];
        const bx = Math.sin(t * (title ? 0.6 : 0.17) + g * 40) * amp, by = Math.cos(t * (title ? 0.5 : 0.13) + g * 23) * amp;
        let arrived = 1;
        if (this.glitchMoves) arrived = this._glitchMove(i, t, bx, by);
        else {
          const w = title ? 3 + s * 1.4 : 2.6, w2 = w * w, c2 = 2 * w;
          vx[i] += (w2 * (this.tx[i] + bx - px[i]) - c2 * vx[i]) * dt;
          vy[i] += (w2 * (this.ty[i] + by - py[i]) - c2 * vy[i]) * dt;
          vz[i] += (w2 * (this.tz[i] - pz[i]) - c2 * vz[i]) * dt;
          px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
        }
        rot[i] += angDiff(this.trot[i], rot[i]) * (arrived ? kRot : 1);
        size[i] += (this.tsize[i] - size[i]) * (arrived ? kSize : 0.5);
        alphaT[i] = this.talpha[i];
        if (arrived) alpha[i] += (alphaT[i] - alpha[i]) * (title || st === BGW ? kAlpha * 2 : 1 - Math.exp(-dt * 1.4));
        else alpha[i] = alphaT[i] * (Math.random() < 0.3 ? 0.15 : 1);
      } else {
        // ── FREE (o FIGURE esperando su turno) ─────────────────────────────
        const awaiting = st !== FREE; // reclutada (figura, título o palabra) esperando su turno
        const vis = awaiting || seed2[i] < density || this.keepFall[i] === 1;
        if (!vis && alpha[i] < 0.004) {
          if (this.rest[i] > 0) this._unrest(i);
          alpha[i] = 0;
          data[o + 1] = 0;
          continue; // dormida: coste cero
        }
        let ax = 0, ay = 0, az = 0;
        let rotT = rot[i];
        const resting = this.rest[i] > 0;
        let lifeFade = 1;

        // turbulencia de transición entre figuras
        if (!resting && (this.transitionBoost > 0.02 || turb > 0.01)) {
          const c = curl(px[i], py[i], t * 0.6, 0.0042);
          const g = 22 * turb + 150 * this.transitionBoost;
          ax += c.x * g; ay += c.y * g;
        }

        if (wR > 0.01) {
          if (this.rest[i] > 0) {
            this.rest[i] -= dt;
            py[i] = this.restY[i];
            vx[i] *= 0.5; vy[i] = 0;
            if (this.rest[i] <= 0) {
              this.rest[i] = 1e-6; // para que _respawn descuente su altura de la pila
              this._respawn(i, RAIN);
            }
          } else {
            const tvy = -(26 + 70 * s) * (0.45 + vel * 1.4);
            ay += (tvy - vy[i]) * 1.6 * wR;
            ax += (Math.sin(t * 0.6 + s * 40) * 7 - vx[i]) * 0.7 * wR;
          }
          if (dom === RAIN) rotT = Math.sin(t * 0.7 + s * 30) * 0.05;
        }
        if (wS > 0.01) {
          // Campo de densidad/velocidad interpolado bilinealmente entre centros de celda:
          // separación = −∇densidad, alineación = velocidad media local (sin artefactos de rejilla).
          const fx = (px[i] + halfW) / GRID_CELL + 0.5, fy = (py[i] + halfH) / GRID_CELL + 0.5;
          const ix0 = clamp(Math.floor(fx), 0, gc - 2), iy0 = clamp(Math.floor(fy), 0, gr - 2);
          const ux = clamp(fx - ix0, 0, 1), uy = clamp(fy - iy0, 0, 1);
          const c00 = ix0 + iy0 * gc, c10 = c00 + 1, c01 = c00 + gc, c11 = c01 + 1;
          const G = this.gCount, GX = this.gVx, GY = this.gVy;
          const w00 = (1 - ux) * (1 - uy), w10 = ux * (1 - uy), w01 = (1 - ux) * uy, w11 = ux * uy;
          const n = G[c00] * w00 + G[c10] * w10 + G[c01] * w01 + G[c11] * w11;
          let sx = 0, sy = 0;
          if (n > 0.5) {
            const avx = (GX[c00] * w00 + GX[c10] * w10 + GX[c01] * w01 + GX[c11] * w11) / n;
            const avy = (GY[c00] * w00 + GY[c10] * w10 + GY[c01] * w01 + GY[c11] * w11) / n;
            sx += (avx - vx[i]) * 0.5;
            sy += (avy - vy[i]) * 0.5;
            const gxn = ((G[c10] - G[c00]) * (1 - uy) + (G[c11] - G[c01]) * uy) / GRID_CELL;
            const gyn = ((G[c01] - G[c00]) * (1 - ux) + (G[c11] - G[c10]) * ux) / GRID_CELL;
            const k = 420 * (0.5 + inten);
            sx -= clamp(gxn * k, -140, 140);
            sy -= clamp(gyn * k, -140, 140);
          }
          const nz = curl(px[i] * 1.7 + s * 500, py[i] * 1.7, t * 0.8, 0.006);
          sx += nz.x * 45;
          sy += nz.y * 45;
          const a = (i % 3) * 3;
          const dx = att[a] - px[i], dy = att[a + 1] - py[i];
          const d = Math.hypot(dx, dy) + 30;
          const orb = (60 + 110 * vel) * att[a + 2];
          sx += (dx / d) * (40 + 50 * inten) - (dy / d) * orb * 0.9;
          sy += (dy / d) * (40 + 50 * inten) + (dx / d) * orb * 0.9;
          if (px[i] > halfW * 0.94) sx -= (px[i] - halfW * 0.94) * 3;
          if (px[i] < -halfW * 0.94) sx -= (px[i] + halfW * 0.94) * 3;
          if (py[i] > halfH * 0.92) sy -= (py[i] - halfH * 0.92) * 3;
          if (py[i] < -halfH * 0.92) sy -= (py[i] + halfH * 0.92) * 3;
          ax += sx * wS; ay += sy * wS;
          if (dom === SWARM) {
            const sp = Math.abs(vx[i]) + Math.abs(vy[i]);
            if (sp > 8) rotT = clamp(Math.atan2(vy[i], Math.abs(vx[i])), -0.6, 0.6);
          }
        }
        if (wV > 0.01) {
          const dx = px[i] - vcx, dy = py[i] - vcy;
          const r = Math.hypot(dx, dy) + 1;
          const vt = (50 + 150 * vel) * (0.55 + 0.45 * s) * (1 + 120 / (r + 60));
          const tvx = (-dy / r) * vt + (dx / r) * vt * 0.17;
          const tvy = (dx / r) * vt + (dy / r) * vt * 0.17 + 16;
          ax += (tvx - vx[i]) * 2.2 * wV;
          ay += (tvy - vy[i]) * 2.2 * wV;
          az += ((Math.sin(Math.atan2(dy, dx) * 2 + t * 0.35 + s * 6) * r * 0.28 - pz[i]) * 0.7 - vz[i] * 0.6) * wV;
          if (dom === VORTEX) rotT = Math.atan2(vy[i], vx[i]);
        }
        if (wA > 0.01) {
          const c = curl(px[i] + 913, py[i] - 377, t * 0.9, 0.0105);
          const g = 50 + 140 * turb;
          ax += (c.x * g + (24 + 22 * Math.sin(t * 0.05) - vx[i]) * 0.45) * wA;
          ay += (c.y * g + (7 - vy[i]) * 0.4) * wA;
          this.life[i] += dt * wA;
          const dur = 5 + s * 9;
          const lf = this.life[i] / dur;
          lifeFade = 1 - wA + wA * Math.min(1, this.life[i] * 1.2) * (1 - clamp((lf - 0.55) / 0.45, 0, 1));
          if (dom === ASH) rotT = rot[i] + (s - 0.5) * 1.4 * dt * 20;
          if (dom === ASH && lf > 1 && !awaiting) this._respawn(i, ASH);
        }
        if (dom !== VORTEX) az += ((s - 0.5) * 260 - pz[i]) * 0.3 - vz[i] * 0.6;

        // integración semi-implícita + arrastre
        vx[i] += ax * dt; vy[i] += ay * dt; vz[i] += az * dt;
        const drag = Math.exp(-dt * (0.35 + 0.5 * wS));
        vx[i] *= drag; vy[i] *= drag; vz[i] *= drag;
        const vmax = 260 + 200 * this.transitionBoost;
        const sp2 = vx[i] * vx[i] + vy[i] * vy[i];
        if (sp2 > vmax * vmax) {
          const f = vmax / Math.sqrt(sp2);
          vx[i] *= f; vy[i] *= f;
        }
        if (this.rest[i] > 0) {
          vx[i] = vy[i] = 0; // apoyada sobre la pila: inmóvil hasta derretirse
          py[i] = this.restY[i];
        } else {
          px[i] += vx[i] * dt; py[i] += vy[i] * dt;
        }
        pz[i] += vz[i] * dt;

        // colisiones / reciclaje según el modo dominante
        if (!awaiting) {
          if (dom === RAIN) {
            if (this.rest[i] <= 0 && vy[i] < 0) {
              const col = clamp(((px[i] + halfW) / this.colW) | 0, 0, RAIN_COLS - 1);
              const floor = this.floorBase[col] + this.accum[col];
              const hh = size[i] * 0.32;
              if (py[i] - hh < floor && py[i] - hh > floor - 40 && this.accum[col] < H * 0.32) {
                py[i] = floor + hh;
                this.rest[i] = 2.5 + s * 9 * (0.5 + inten);
                this.restY[i] = py[i];
                this.restCol[i] = col;
                this.restH[i] = size[i] * 0.55;
                this.accum[col] += this.restH[i];
                vy[i] = 0;
                this.restingActive = true;
              }
            }
            if (py[i] < -halfH - 60) this._respawn(i, RAIN);
          } else if (dom === VORTEX) {
            if (Math.hypot(px[i] - vcx, py[i] - vcy) > maxR || py[i] > halfH + 120) this._respawn(i, VORTEX);
          } else if (Math.abs(px[i]) > halfW + 160 || Math.abs(py[i]) > halfH + 160) {
            this._respawn(i, dom === ASH ? ASH : SWARM);
          }
        }

        rot[i] += angDiff(rotT, rot[i]) * kRot;
        const sizeTarget = awaiting ? size[i] : this._ambientSize(i);
        size[i] += (sizeTarget - size[i]) * kSize;
        alphaT[i] = vis ? ambient * (0.3 + 0.7 * fract(s * 13.7)) * lifeFade : 0;
        // sobre una palabra viva no se ve: la letra que cae pasa por detrás (las palabras no se pisan)
        if (MK && alpha[i] + alphaT[i] > 0.02) {
          const hx = size[i] * 0.2, hy = size[i] * 0.15;
          for (let q = 0; q < 5; q++) {
            const qx = px[i] + (q === 1 ? -hx : q === 2 ? hx : 0), qy = py[i] + (q === 3 ? -hy : q === 4 ? hy : 0);
            const mc = Math.floor((qx - MK.x0) / MK.cw), mr = Math.floor((MK.top - qy) / MK.rh);
            if (mc >= 0 && mc < MK.colsN && mr >= 0 && mr < MK.rowsN && MK.m[mr * MK.colsN + mc]) {
              alphaT[i] = 0;
              alpha[i] *= 0.3;
              break;
            }
          }
        }
        alpha[i] += (alphaT[i] - alpha[i]) * kAlpha;
      }

      posRot[o] = px[i];
      posRot[o + 1] = py[i];
      posRot[o + 2] = pz[i];
      posRot[o + 3] = rot[i];
      data[o] = size[i];
      data[o + 1] = alpha[i];
      data[o + 2] = this.slot[i];
      data[o + 3] = this.tint[i];
      if (alpha[i] > 0.01) visible++;
    }

    if (this.metaDirty) {
      const m = this.meta;
      for (let i = 0; i < this.N; i++) {
        const o = i * 4;
        m[o] = this.birth[i];
        m[o + 1] = this.seed[i];
        m[o + 2] = this.accent[i];
        m[o + 3] = this.level[i];
      }
      this.aMeta.needsUpdate = true;
      this.metaDirty = false;
    }
    this.aPosRot.needsUpdate = true;
    this.aData.needsUpdate = true;
    this.atlas.flush();
    this.visible = visible;
  }

  _updateCursor(dt, t) {
    const i = 0;
    const line = this.line;
    let x = 0;
    let y = this.lineY;
    if (line) {
      const row = line.rows[line.rows.length - 1];
      let width = 0;
      for (const e of row) width += e.adv;
      x = width / 2 + this.lineSize * 0.18;
    }
    const k = 1 - Math.exp(-dt * 14);
    this.px[i] += (x - this.px[i]) * k;
    this.py[i] += (y - this.py[i]) * k;
    this.pz[i] = 0;
    this.rot[i] = 0;
    const active = this.cursorEnabled && (this.speaking || t < this.speakingUntil || (line && !line.completed));
    const blink = 0.5 + 0.5 * Math.sin(t * 5.5);
    this.alphaT[i] = active ? clamp(0.18 + blink * 0.15 + this.rms * 1.3, 0, 0.95) : 0;
    this.alpha[i] += (this.alphaT[i] - this.alpha[i]) * (1 - Math.exp(-dt * 10));
    this.size[i] = this.lineSize * (0.92 + this.rms * 0.5);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Escenas del show: título de artista, modo palabras, limpieza
  // ════════════════════════════════════════════════════════════════════════
  /**
   * Desplazamiento con glitch: la letra no vuela; salta en escalones (~12 por segundo, cada una a
   * su ritmo) con cortes horizontales compartidos por franja, y parpadea hasta llegar.
   * Devuelve 1 si ya está en su lugar.
   */
  _glitchMove(i, t, bx, by) {
    const dx = this.tx[i] + bx - this.px[i], dy = this.ty[i] + by - this.py[i];
    const d2 = dx * dx + dy * dy;
    if (d2 < 9) {
      this.px[i] += dx;
      this.py[i] += dy;
      this.pz[i] += (this.tz[i] - this.pz[i]) * 0.3;
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      return 1;
    }
    const ph = Math.floor(t * 12 + this.seed[i] * 5);
    if (ph !== this.gph[i]) {
      this.gph[i] = ph;
      const d = Math.sqrt(d2);
      const f = d < 30 ? 1 : 0.28 + 0.45 * Math.random();
      const band = Math.floor(this.py[i] / 36);
      const tear = (fract(Math.sin(band * 12.9898 + ph * 78.233) * 43758.5453) - 0.5) * Math.min(160, d * 0.7);
      this.px[i] += dx * f + (f < 1 ? tear : 0);
      this.py[i] += dy * f;
      this.pz[i] += (this.tz[i] - this.pz[i]) * f;
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
    }
    return 0;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Telón de fondo: bloque de texto monoespaciado hecho con lo dicho (palabras repetidas),
  //  del que se desprenden letras que caen y se apilan. Título y figura lo calan (huecos negros).
  // ════════════════════════════════════════════════════════════════════════
  setBackdrop(on, { fall = true } = {}) {
    this.backdropOn = !!on;
    if (!on) {
      this.clearWallFx();
      this._bdClear(fall);
    }
  }

  /** Rectángulos extra (mundo) que el telón deja en negro: {x0, x1, y0, y1}. */
  setBackdropHoles(rects = []) {
    this.backdropHoles = rects;
  }

  /**
   * Ilustración en grilla de texto: grid = filas de '#' (figura) y '.' (fondo).
   * positivo: sólo quedan las palabras dentro de la figura · negativo: la figura es un hueco en el muro.
   * Las letras que sobran caen con glitch; las que faltan aparecen con un salto.
   */
  setShape(grid, { polaridad = 'negativo', duracion = 20, chars = false } = {}) {
    if (!grid || (!grid.tone && !grid.length)) {
      if (this.shape) this.onTransition?.(0.45);
      this.shape = null;
      return;
    }
    // chars: arte ASCII con letras propias (una letra de la grilla = una celda del muro, sólo positivo)
    // grid.tone: imagen en tonos (treatments.js) → cada letra se enciende según su tono; grid.accent: color de marca
    const pol = chars || polaridad === 'positivo' ? 'positivo' : 'negativo';
    this.shapeId = (this.shapeId || 0) + 1;
    if (grid.tone) this.shape = { tone: grid.tone, accent: grid.accent, gw: grid.gw, gh: grid.gh, pol, id: this.shapeId, until: this.time + duracion };
    else this.shape = { grid, gw: Math.max(...grid.map((r) => r.length)), gh: grid.length, pol, chars, id: this.shapeId, until: this.time + duracion };
    this.bdFill = null; // la imagen se muestra completa
    this.onTransition?.(0.75);
  }

  /** El muro se va escribiendo durante `segundos` (hasta la próxima imagen) en lugar de aparecer entero. */
  setBackdropFill(segundos) {
    this.bdFill = segundos > 0 ? { t0: this.time, dur: segundos } : null;
  }

  /** ¿La celda visible (x, y) toca el borde de la ilustración? (alguna vecina queda vacía) */
  _shapeEdge(x, y) {
    const B = this.backdrop;
    return this._shapeHides(x + B.cw, y) || this._shapeHides(x - B.cw, y) || this._shapeHides(x, y + B.rh) || this._shapeHides(x, y - B.rh);
  }

  /** ¿La celda (x, y) del telón queda vacía por la ilustración en grilla? */
  _shapeHides(x, y) {
    if (this.shape.tone) {
      const i = this._toneIndex(x, y), v = i < 0 ? 0 : this.shape.tone[i];
      return this.shape.pol === 'positivo' ? v < 0.1 : v > 0.5;
    }
    const ch = this._shapeChar(x, y);
    const inside = this.shape.chars ? !!ch && ch !== ' ' : ch === '#';
    return this.shape.pol === 'positivo' ? !inside : inside;
  }

  /** Índice de la celda de tonos en (x, y) (celdas 1 × 2 que cubren el alto del muro), o -1. */
  _toneIndex(x, y) {
    const S = this.shape, B = this.backdrop;
    const cellH = (B.top - B.bottom) / S.gh, cellW = cellH / 2;
    const gx = Math.floor((x - ((B.x0 + B.x1) / 2 - (cellW * S.gw) / 2)) / cellW), gy = Math.floor((B.top - y) / cellH);
    return gx >= 0 && gx < S.gw && gy >= 0 && gy < S.gh ? gy * S.gw + gx : -1;
  }

  /** Carácter de la grilla que cae en (x, y). Silueta: celdas 1 × 2 que cubren el alto del muro.
   *  Letras: una letra por celda del muro, centrada. */
  _shapeChar(x, y) {
    const S = this.shape, B = this.backdrop;
    let gx, gy;
    if (S.chars) {
      gx = Math.floor((x - ((B.x0 + B.x1) / 2 - (S.gw * B.cw) / 2)) / B.cw);
      gy = Math.floor((B.top - y) / B.rh - (B.rowsN - S.gh) / 2);
    } else {
      const cellH = (B.top - B.bottom) / S.gh, cellW = cellH / 2;
      gx = Math.floor((x - ((B.x0 + B.x1) / 2 - (cellW * S.gw) / 2)) / cellW);
      gy = Math.floor((B.top - y) / cellH);
    }
    return gx >= 0 && gy >= 0 && gy < S.gh ? S.grid[gy][gx] || null : null;
  }

  /** Grilla del telón (también la de la máscara de palabras cuando no hay telón). */
  _bdGeom() {
    const rowsN = Math.round(clamp(this.bdRows, 10, 60));
    // centrado en el cuadro: mismo margen arriba/abajo y a los lados
    const top = this.H * 0.45, bottom = -this.H * 0.45;
    const rh = (top - bottom) / rowsN;
    const size = rh * 1.12;
    const kind = this._k('mono');
    const cw = this.atlas.adv(this.atlas.slot('M', kind)) * size;
    const colsN = Math.max(8, Math.floor((this.W * 0.94) / cw));
    return { rowsN, top, bottom, rh, size, kind, cw, colsN, x0: -(colsN * cw) / 2, x1: (colsN * cw) / 2 };
  }

  _bdBuild() {
    const { rowsN, top, bottom, rh, size, kind, cw, colsN, x0, x1 } = this._bdGeom();
    const cells = [];
    for (let r = 0; r < rowsN; r++) {
      for (let c = 0; c < colsN; c++) cells.push({ x: x0 + (c + 0.5) * cw, y: top - (r + 0.5) * rh, ch: ' ', i: -1, at: 0 });
    }
    this.backdrop = { rowsN, colsN, rh, size, cw, kind, cells, top, bottom, x0, x1, tick: 0, ver: this.corpusChars, next: null, rw: 0, fx: new Uint8Array(cells.length), fxVer: -1 };
    const txt = this._bdText(cells.length);
    cells.forEach((c, j) => (c.ch = txt[j] || ' '));
  }

  /**
   * Texto del telón: las últimas palabras dichas, repetidas en ciclo hasta llenar todas las celdas
   * (cuantas menos palabras haya, más veces se repite cada una).
   */
  _bdText(n) {
    const words = this.corpus.slice(-1600).split(/\s+/).filter(Boolean).slice(-60);
    if (!words.length) words.push('umbral');
    let out = '';
    let k = (Math.random() * words.length) | 0;
    while (out.length < n) out += words[k++ % words.length] + ' ';
    return this._u(out);
  }

  _bdUpdate(dt, t) {
    if (!this.backdropOn) return;
    if (!this.backdrop) this._bdBuild();
    const B = this.backdrop;
    B.tick += dt;
    if (B.tick < 0.06) return;
    const step = B.tick;
    B.tick = 0;
    // lo nuevo que se dice reescribe el telón de arriba abajo (cada letra cambia con un salto)
    if (this.corpusChars !== B.ver && !B.next) {
      B.next = this._bdText(B.cells.length);
      B.rw = 0;
      B.ver = this.corpusChars;
    }
    if (B.next) {
      for (let q = 0, qn = Math.max(70, Math.round(1000 * step)); q < qn && B.rw < B.cells.length; q++, B.rw++) {
        const c = B.cells[B.rw];
        c.ch = B.next[B.rw] || ' ';
        if (c.i < 0 || this.shape?.chars) continue; // con arte de letras, la celda muestra la letra de la imagen
        if (c.ch === ' ') this._bdDrop(c, t);
        else {
          this.slot[c.i] = this.atlas.slot(c.ch, B.kind);
          this.birth[c.i] = t;
          c.shown = c.ch;
        }
      }
      if (B.rw >= B.cells.length) B.next = null;
      this.metaDirty = true;
    }
    if (this.shape && this.time > this.shape.until) {
      this.setShape(null);
      if (this.refillSecs) this.setBackdropFill(this.refillSecs); // el muro se reescribe hasta la próxima imagen
    }
    const holes = this._bdHoles();
    if (this.wallFx) this._wallFxStep(t, holes);
    else if (this.bigWords.length) this.clearWallFx();
    this._fxRecompute(holes); // las palabras se mueven (partitura, sedimento): se recalcula en cada paso
    const FX = B.fx;
    // llenado progresivo: sólo se escribe la fracción del muro que corresponde al tiempo transcurrido
    const F = this.bdFill;
    const limit = F ? Math.floor(B.cells.length * clamp((t - F.t0) / F.dur, 0.04, 1)) : B.cells.length;
    let budget = Math.max(60, Math.round(1400 * step)); // ~2 s para llenar el telón, a cualquier FPS
    for (let j = 0; j < B.cells.length; j++) {
      const c = B.cells[j];
      if (c.i >= 0 && this.state[c.i] !== BGW) {
        c.i = -1; // otra escena tomó la partícula
        c.at = t + 1;
      }
      // lo que la ilustración le pide a esta celda (se calcula una vez por imagen)
      const S = this.shape;
      if (S && c.sid !== S.id) {
        c.sid = S.id;
        c.hide = this._shapeHides(c.x, c.y);
        if (S.tone) {
          const ti = this._toneIndex(c.x, c.y), v = ti < 0 ? 0 : S.tone[ti];
          c.alpha = S.pol === 'positivo' ? 0.22 + 0.78 * v : 0.82 * (1 - 0.75 * Math.min(1, v / 0.5));
          c.acc = this.edgeAccent && ti >= 0 && S.accent && S.accent[ti] ? 1 : 0;
        } else {
          c.acc = this.edgeAccent && !c.hide && this._shapeEdge(c.x, c.y) ? 1 : 0;
          c.alpha = c.acc ? 1 : 0.82;
        }
      } else if (!S && c.sid) {
        c.sid = 0;
        c.hide = false;
        c.acc = 0;
        c.alpha = 0.82;
      }
      const fx = FX[j];
      if (fx === 2) {
        // debajo de una palabra: ni el telón ni el dibujo la pisan; vuelve cuando la palabra se va
        if (c.i >= 0) {
          this._bdDrop(c, t, false);
          c.at = t + 0.4 + Math.random() * 0.8;
        }
        continue;
      }
      if ((holes.length && this._inHoles(c.x, c.y, B.cw * 0.5, holes)) || (S && c.hide) || fx === 1 || (this.backdropOnlyShape && !S)) {
        if (c.i >= 0) this._bdDrop(c, t, Math.random() < 0.05); // casi todas se apagan; pocas caen (forma limpia)
        continue;
      }
      // tono y acento de la ilustración: cada letra se enciende según la imagen; el acento dibuja líneas de marca
      if (c.i >= 0) {
        const a = S ? c.acc : 0;
        const al = S ? (a ? 1 : c.alpha) : 0.82;
        if (this.accent[c.i] !== a || Math.abs(this.talpha[c.i] - al) > 0.01) {
          this.accent[c.i] = a;
          this.talpha[c.i] = al;
          this.metaDirty = true;
        }
      }
      // arte de letras: la celda muestra la letra de la imagen (cambia con un salto)
      const want = this.shape?.chars ? this._shapeChar(c.x, c.y) || ' ' : c.ch;
      if (c.i >= 0 && c.shown !== want && want !== ' ') {
        this.slot[c.i] = this.atlas.slot(want, B.kind);
        this.birth[c.i] = t;
        c.shown = want;
        this.metaDirty = true;
      }
      if (c.i < 0 && want !== ' ' && (j < limit || this.shape?.chars) && t >= c.at && budget-- > 0) this._bdPlace(c, t, want);
    }
    // letras que se desprenden y caen (más con la voz fuerte)
    const rate = (0.8 + 5 * this.phys.intensidad + 14 * this.rms) * step;
    let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    while (n-- > 0) {
      const c = B.cells[(Math.random() * B.cells.length) | 0];
      if (c.i >= 0) this._bdDrop(c, t);
    }
  }

  /** Escribe la palabra recién dicha en el telón, a continuación de la anterior (cada letra cambia con un salto). */
  _bdWrite(word) {
    if (!this.backdrop) this._bdBuild();
    const B = this.backdrop, t = this.time;
    const chars = [...this._u(word + ' ')];
    let k = B.wc || 0;
    if (k % B.colsN + chars.length > B.colsN) k = (Math.floor(k / B.colsN) + 1) * B.colsN; // no partir palabras
    for (const ch of chars) {
      k %= B.cells.length;
      const c = B.cells[k++];
      c.ch = ch;
      if (c.i < 0) continue;
      if (ch === ' ') this._bdDrop(c, t, false);
      else {
        this.slot[c.i] = this.atlas.slot(ch, B.kind);
        this.birth[c.i] = t; // destello
        c.shown = ch;
        this.talpha[c.i] = 1;
      }
    }
    B.wc = k % B.cells.length;
    this.onTransition?.(0.15);
    this.metaDirty = true;
  }

  _bdPlace(c, t, ch = c.ch) {
    const B = this.backdrop;
    const i = this._allocParticle(false);
    if (i < 0) return;
    this.state[i] = BGW;
    this.grp[i] = 0;
    this.px[i] = c.x + (Math.random() - 0.5) * B.cw * 6; // aparece con un salto corto, no cruzando la pantalla
    this.py[i] = c.y;
    this.pz[i] = 0;
    this.alpha[i] = 0;
    this.tx[i] = c.x;
    this.ty[i] = c.y;
    this.tz[i] = 0;
    this.trot[i] = 0;
    this.rot[i] = 0;
    this.tsize[i] = B.size;
    this.size[i] = B.size;
    this.talpha[i] = 0.82;
    this.pslot[i] = this.atlas.slot(ch, B.kind);
    c.shown = ch;
    this.ptint[i] = 0;
    this.paccent[i] = 0;
    this.delay[i] = t + Math.random() * 0.4;
    this.birth[i] = this.delay[i];
    this.level[i] = 0.1;
    c.i = i;
    this.metaDirty = true;
  }

  /** La letra del telón se suelta y cae (lluvia) hasta apilarse abajo. */
  _bdDrop(c, t, fall = true) {
    const i = c.i;
    c.i = -1;
    c.at = t + 1.5 + Math.random() * 5;
    if (i < 0 || this.state[i] !== BGW) return;
    this.state[i] = FREE;
    this.pslot[i] = -1;
    this.keepFall[i] = fall ? 1 : 0;
    if (!fall) this.alpha[i] *= 0.4; // se apaga con un parpadeo en su lugar
    this.vx[i] = (Math.random() - 0.5) * 10;
    this.vy[i] = -5;
    this.life[i] = 0;
  }

  _bdClear(fall = true) {
    if (!this.backdrop) return;
    for (const c of this.backdrop.cells) if (c.i >= 0) this._bdDrop(c, this.time, fall);
    this.backdrop = null;
  }

  _bdHoles() {
    const H = this.backdropHoles.slice();
    if (this.title?.rect) H.push(this.title.rect);
    if (this.titleFade) {
      if (this.time < this.titleFade.until) H.push(this.titleFade.rect);
      else this.titleFade = null;
    }
    if (this.line?.rect) H.push(this.line.rect); // la transcripción en vivo se lee sobre negro
    if (this.figure) H.push(this.figure);
    return H;
  }

  /** ¿La celda (x, y) cae dentro de algún hueco? Las figuras se calan por su máscara (con margen r). */
  _inHoles(x, y, r, holes) {
    for (const h of holes) {
      if (h.k) {
        const R = h.rect;
        if (x < R.x0 - r || x > R.x1 + r || y < R.y0 - r || y > R.y1 + r) continue;
        if (!h.mask) return true;
        for (const [ex, ey] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
          const fx = Math.round((x + ex - h.cx) / h.k + h.ox), fy = Math.round(h.oy - (y + ey - h.cy) / h.k);
          if (fx >= 0 && fx < RES && fy >= 0 && fy < RES && h.mask[fy * RES + fx] > 0.5) return true;
        }
      } else if (x > h.x0 && x < h.x1 && y > h.y0 && y < h.y1) return true;
    }
    return false;
  }

  resetCorpus(text) {
    this.corpus = (text || this.idleText).trim() || this.idleText;
    this.corpusChars = 0;
    this.cursorC = 0;
  }

  setSceneDensity(v) {
    this.sceneDensity = clamp(v, 0, 1);
  }

  /** Disuelve todo lo compuesto (verso, figura, título, palabras) de vuelta al campo. */
  clearScene() {
    this.backdropHoles = [];
    this.clearFlow();
    this.setShape(null); // el dibujo de la escena anterior no pasa a la siguiente
    this.titleFade = null;
    this.clearSparse();
    this.clearWallFx();
    if (this.line) {
      const old = this.line;
      this.line = null;
      for (const row of old.rows) this._releaseEntries(row);
    }
    this.releaseFigure(true);
    this.clearTitle();
    this.clearWords();
    this.speaking = false;
    this.speakingUntil = 0;
  }

  /** Nombre de artista (o cualquier título) compuesto con letras que vuelan desde el campo. */
  showTitle(text, { cy = 0, maxSize = 0.13 } = {}) {
    this.clearTitle();
    const words = this._u(String(text || '')).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const atlas = this.atlas;
    const tk = this.brandAll ? 'brand' : 'serif'; // títulos y destacados: Geist Mono
    const slotsOf = (w) => [...w].map((ch) => atlas.slot(ch, tk));
    const widthOf = (w, S) => slotsOf(w).reduce((a, sl) => a + atlas.adv(sl) * S, 0);
    let S = clamp(this.H * maxSize, 40, 200);
    let rows = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      const maxW = this.W * 0.86, space = S * 0.3;
      rows = [];
      let cur = [], cw = 0, fits = true;
      for (const w of words) {
        const ww = widthOf(w, S);
        if (ww > maxW) fits = false;
        if (cur.length && cw + space + ww > maxW) {
          rows.push(cur);
          cur = [];
          cw = 0;
        }
        cw += (cur.length ? space : 0) + ww;
        cur.push(w);
      }
      if (cur.length) rows.push(cur);
      if (fits && rows.length * S * 1.05 <= this.H * 0.62) break;
      S *= 0.86;
    }
    const t = this.time;
    const idx = [];
    const g = Math.random();
    const lineH = S * 1.02;
    const y0 = cy * this.H + ((rows.length - 1) * lineH) / 2;
    let n = 0;
    rows.forEach((row, r) => {
      const text2 = row.join(' ');
      const slots = [...text2].map((ch) => (ch === ' ' ? -1 : atlas.slot(ch, tk)));
      const total = slots.reduce((a, sl) => a + (sl < 0 ? S * 0.3 : atlas.adv(sl) * S), 0);
      let x = -total / 2;
      for (const sl of slots) {
        const adv = sl < 0 ? S * 0.3 : atlas.adv(sl) * S;
        if (sl >= 0) {
          const i = this._allocParticle(true);
          if (i < 0) break;
          this.state[i] = TITLE;
          this.grp[i] = g;
          this.tx[i] = x + adv / 2;
          this.ty[i] = y0 - r * lineH;
          this.tz[i] = 0;
          this.trot[i] = 0;
          this.tsize[i] = S;
          this.talpha[i] = 1;
          this.pslot[i] = sl;
          this.ptint[i] = 0;
          this.paccent[i] = 0;
          this.delay[i] = t + 0.15 + n * 0.05;
          this.birth[i] = this.delay[i] + 0.7; // destello al llegar
          this.level[i] = 0.35;
          idx.push(i);
          n++;
        }
        x += adv;
      }
    });
    const half = Math.max(...rows.map((row) => widthOf(row.join(' '), S) + S * 0.3 * (row.length - 1))) / 2;
    const pad = S * 0.35;
    this.title = { text, idx, rect: { x0: -half - pad, x1: half + pad, y0: y0 - (rows.length - 1) * lineH - S * 0.62 - pad, y1: y0 + S * 0.62 + pad } };
    this.metaDirty = true;
    this.onTransition?.(0.6);
  }

  /** El nombre se borra letra por letra con glitch durante `secs` (cuando la persona empieza a hablar). */
  dissolveTitle(secs = 2.4) {
    if (!this.title) return;
    const t = this.time;
    const order = this.title.idx.filter((i) => this.state[i] === TITLE).sort(() => Math.random() - 0.5);
    order.forEach((i, n) => {
      this.state[i] = WORD;
      const at = t + (n / Math.max(1, order.length)) * secs + Math.random() * 0.15;
      this.breaking.push({ i, jumpAt: at, at: at + 0.3 + Math.random() * 0.3, span: this.H * 0.07 });
    });
    if (this.title.rect) this.titleFade = { rect: this.title.rect, until: t + secs + 0.5 };
    this.title = null;
    this.onTransition?.(0.5);
  }

  clearTitle() {
    if (!this.title) return;
    for (const i of this.title.idx) {
      if (this.state[i] !== TITLE) continue;
      this.state[i] = FREE;
      this.pslot[i] = -1;
      this.vx[i] = (Math.random() - 0.5) * 60;
      this.vy[i] = 10 + Math.random() * 50;
      this.life[i] = 0;
    }
    this.title = null;
    this.onTransition?.(0.4);
  }

  // ── modo palabras ───────────────────────────────────────────────────────
  wordsDelta(itemId, delta) {
    if (!delta) return;
    this.wordSeen.add(itemId);
    const buf = (this.wordBufs.get(itemId) || '') + delta;
    const parts = buf.split(/\s+/);
    const rest = /\s$/.test(buf) ? '' : parts.pop();
    for (const w of parts) if (w) this.placeWord(w);
    this.wordBufs.set(itemId, rest);
  }

  completeWords(itemId, text) {
    if (this.wordSeen.has(itemId)) {
      const rest = this.wordBufs.get(itemId);
      if (rest) this.placeWord(rest);
    } else {
      for (const w of String(text || '').split(/\s+/)) if (w) this.placeWord(w);
    }
    this.wordBufs.delete(itemId);
    this.wordSeen.delete(itemId);
    this.addCorpus(text);
  }

  // ── muro en grilla ───────────────────────────────────────────────────────
  _wallInit() {
    const rowsN = Math.round(clamp(this.wallRows, 12, 90));
    const rh = (this.H * 0.94) / rowsN; // alto de módulo (mundo)
    const cw = this.atlas.adv(this.atlas.slot('M', this._k('mono'))) * rh * 1.62; // = avance real de la mono: interletrado natural
    const colsN = Math.floor((this.W * 0.96) / cw);
    this.wall = {
      rowsN, colsN, rh, cw,
      x0: -(colsN * cw) / 2,
      y0: (rowsN * rh) / 2,
      occ: new Int32Array(rowsN * colsN).fill(-1), // id de palabra que ocupa cada celda
      cursor: 0,
      words: new Map(), // id → {cells, idx}
      nextId: 0,
    };
  }

  /**
   * Palabra al muro: ocupa k módulos de alto (1, 2 o 3) y largo×k de ancho, siempre alineada a la grilla.
   * Llena la pared en orden de lectura; cuando se completa, reescribe desde arriba (las viejas se disuelven).
   */
  _placeWallWord(word, big) {
    if (!this.wall) this._wallInit();
    const W = this.wall;
    const text = this.wallUpper ? word.toUpperCase() : word;
    const len = [...text].length;
    const roll = Math.random();
    let kk = roll < 0.72 ? 1 : roll < 0.93 ? 2 : 3;
    if (big) kk = Math.max(kk, this.rms > 0.6 ? 3 : 2);
    while (kk > 1 && (len + 1) * kk > W.colsN) kk--;
    const wCells = Math.min(W.colsN, len * kk), gap = kk; // separación de un "espacio" del mismo tamaño
    const fits = (r, c) => {
      if (r + kk > W.rowsN || c + wCells > W.colsN) return false;
      for (let dr = 0; dr < kk; dr++) {
        for (let dc = -1; dc < wCells + gap && c + dc < W.colsN; dc++) {
          if (c + dc < 0) continue;
          if (W.occ[(r + dr) * W.colsN + c + dc] !== -1) return false;
        }
      }
      return true;
    };
    const total = W.rowsN * W.colsN;
    let pos = -1;
    for (let n = 0; n < total; n++) {
      const p = (W.cursor + n) % total;
      if (fits((p / W.colsN) | 0, p % W.colsN)) {
        pos = p;
        break;
      }
    }
    if (pos < 0) {
      // muro lleno: escribir encima en el cursor (al inicio de renglón si no entra)
      let r = (W.cursor / W.colsN) | 0, c = W.cursor % W.colsN;
      if (c + wCells > W.colsN) {
        r++;
        c = 0;
      }
      if (r + kk > W.rowsN) r = 0;
      pos = r * W.colsN + c;
    }
    const r0 = (pos / W.colsN) | 0, c0 = pos % W.colsN;
    // desalojar lo que haya debajo
    const evict = new Set();
    for (let dr = 0; dr < kk; dr++) {
      for (let dc = 0; dc < wCells + gap && c0 + dc < W.colsN; dc++) {
        const id = W.occ[(r0 + dr) * W.colsN + c0 + dc];
        if (id !== -1) evict.add(id);
      }
    }
    for (const id of evict) this._wallEvict(id);
    const id = W.nextId++;
    const cells = [];
    for (let dr = 0; dr < kk; dr++) {
      for (let dc = 0; dc < wCells && c0 + dc < W.colsN; dc++) {
        const ci = (r0 + dr) * W.colsN + c0 + dc;
        W.occ[ci] = id;
        cells.push(ci);
      }
    }
    W.cursor = (pos + wCells + gap) % total;

    const t = this.time;
    const alphaW = 0.5 + Math.random() * 0.5;
    const born = clamp(Math.max(0.15, this.rms), 0, 1);
    const S = W.rh * kk * 1.62; // lado del quad para que la mono ocupe el módulo
    const idx = [];
    [...text].forEach((ch, n) => {
      if (n * kk >= wCells) return;
      const i = this._allocParticle();
      if (i < 0) return;
      this.state[i] = WORD;
      this.grp[i] = 0;
      this.slot[i] = this.atlas.slot(ch, this._k('mono'));
      this.pslot[i] = -1;
      this.tint[i] = Math.random() * 0.3;
      this.accent[i] = 0;
      this.tx[i] = W.x0 + (c0 + n * kk + kk / 2) * W.cw;
      this.ty[i] = W.y0 - (r0 + kk / 2) * W.rh;
      this.tz[i] = 0;
      this.trot[i] = 0;
      this.tsize[i] = S;
      this.talpha[i] = alphaW;
      this.px[i] = this.tx[i];
      this.py[i] = this.ty[i];
      this.pz[i] = 0;
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      this.rot[i] = 0;
      this.size[i] = S;
      this.alpha[i] = 0;
      this.delay[i] = t + n * 0.03;
      this.birth[i] = this.delay[i];
      this.level[i] = born * 0.5;
      this.words.push(i);
      idx.push(i);
    });
    W.words.set(id, { cells, idx });
    this.metaDirty = true;
  }

  /**
   * Placas de artista: cada palabra dicha en la grilla del muro, en tamaños muy distintos (el módulo es el mínimo;
   * algunas hasta un tercio del alto). Lugar libre al azar; si la pantalla se satura, las más viejas se rompen.
   */
  _placeArtistWord(raw) {
    if (!this.wall) this._wallInit();
    const W = this.wall;
    W.order = W.order || [];
    const text = this.wallUpper ? raw.toUpperCase() : raw;
    const len = [...text].length;
    const u = Math.random();
    let k = u < 0.42 ? 1 : u < 0.64 ? 2 : u < 0.79 ? 3 : u < 0.89 ? 5 : u < 0.96 ? 8 : 12;
    const nw = normalizeWord(raw);
    if (this.keywords.has(nw) || this.rms > 0.7) k = Math.max(k, 5);
    // los tamaños grandes, para palabras con peso: las cortas y de enlace (la, el, y, de…) quedan chicas
    if (STOP.has(nw) || nw.length <= 2) k = Math.min(k, 2);
    else if (nw.length <= 3) k = Math.min(k, 3);
    while (k > 1 && (len * k > W.colsN * 0.92 || k > W.rowsN * 0.4)) k--;
    // «cruce»: la mitad de las palabras van en vertical (letras de arriba abajo), si entran
    const vert = this.artistCross && Math.random() < 0.5 && len * k <= W.rowsN;
    const wC = vert ? k : len * k, hR = vert ? len * k : k;
    // con un dibujo en pantalla, las palabras nuevas buscan lugar fuera de él
    const overShape = (r, c) => {
      if (!this.shape || !this.backdrop) return false;
      for (let n = 0; n < len; n++) {
        const x = W.x0 + (c + (vert ? 0 : n * k) + k / 2) * W.cw, y = W.y0 - (r + (vert ? n * k : 0) + k / 2) * W.rh;
        const h = W.rh * k * 0.5;
        for (const [dx, dy] of [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]]) if (!this._shapeHides(x + dx, y + dy)) return true;
      }
      return false;
    };
    const free = (r, c) => {
      if (r < 0 || c < 0 || r + hR > W.rowsN || c + wC > W.colsN) return false;
      if (overShape(r, c)) return false;
      for (let dr = -1; dr <= hR; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= W.rowsN) continue;
        for (let dc = -1; dc <= wC; dc++) {
          const cc = c + dc;
          if (cc < 0 || cc >= W.colsN) continue;
          if (W.occ[rr * W.colsN + cc] !== -1) return false;
        }
      }
      return true;
    };
    let pos = null;
    for (let attempt = 0; attempt < 4 && !pos; attempt++) {
      for (let n = 0; n < 160; n++) {
        const r = Math.floor(Math.random() * (W.rowsN - hR + 1)), c = Math.floor(Math.random() * (W.colsN - wC + 1));
        if (free(r, c)) {
          pos = [r, c];
          break;
        }
      }
      // no entra: se rompen las más viejas hasta que haya lugar
      if (!pos) for (let q = 0; q < 3 && W.order.length; q++) this._wallBreak(W.order.shift());
    }
    if (!pos) return;
    const [r0, c0] = pos, id = W.nextId++, cells = [];
    for (let dr = 0; dr < hR; dr++) for (let dc = 0; dc < wC; dc++) {
      const ci = (r0 + dr) * W.colsN + c0 + dc;
      W.occ[ci] = id;
      cells.push(ci);
    }
    const t = this.time, S = W.rh * k * 1.62, idx = [];
    const accent = k >= 5 && (this.keywords.has(normalizeWord(raw)) || Math.random() < 0.35) ? 1 : 0;
    [...text].forEach((ch, n) => {
      const i = this._allocParticle();
      if (i < 0) return;
      this.state[i] = WORD;
      this.grp[i] = 0;
      this.pslot[i] = this.atlas.slot(ch, this._k('mono'));
      this.ptint[i] = 0;
      this.paccent[i] = accent;
      this.tx[i] = W.x0 + (c0 + (vert ? 0 : n * k) + k / 2) * W.cw;
      this.ty[i] = W.y0 - (r0 + (vert ? n * k : 0) + k / 2) * W.rh;
      this.tz[i] = 0;
      this.trot[i] = this.rot[i] = 0;
      this.tsize[i] = this.size[i] = S;
      this.talpha[i] = k >= 5 ? 1 : 0.6 + Math.random() * 0.4;
      this.px[i] = this.tx[i] + (Math.random() - 0.5) * W.cw * Math.min(10, k * 2); // llega con saltos, sin salir de su lugar
      this.py[i] = this.ty[i];
      this.pz[i] = 0;
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      this.alpha[i] = 0;
      this.delay[i] = t + n * 0.03;
      this.birth[i] = this.delay[i];
      this.level[i] = 0.2;
      this.words.push(i);
      idx.push(i);
    });
    W.words.set(id, { cells, idx });
    W.order.push(id);
    this.metaDirty = true;
    this.onTransition?.(k >= 5 ? 0.3 : 0.1);
    // saturación: si el muro pasa de ~45 % ocupado, se rompen las más viejas hasta bajar a ~30 %
    let used = 0;
    for (let q = 0; q < W.occ.length; q++) if (W.occ[q] !== -1) used++;
    if (used / W.occ.length > 0.45) {
      while (W.order.length > 1 && used / W.occ.length > 0.3) {
        const old = W.order.shift();
        used -= W.words.get(old)?.cells.length || 0;
        this._wallBreak(old);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  6 «sedimento» y 7 «partitura»
  // ════════════════════════════════════════════════════════════════════════
  /** Tamaño en módulos: el del muro es el mínimo; las grandes sólo para palabras con peso. */
  _wordK(raw, weights = [0.45, 0.68, 0.82, 0.92, 0.98]) {
    const u = Math.random(), nw = normalizeWord(raw);
    const sizes = [1, 2, 3, 5, 8, 12];
    let k = sizes[weights.findIndex((w) => u < w)] ?? 12;
    if (this.keywords.has(nw) || this.rms > 0.7) k = Math.max(k, 5);
    if (STOP.has(nw) || nw.length <= 2) k = Math.min(k, 2);
    else if (nw.length <= 3) k = Math.min(k, 3);
    return k;
  }

  /** Letras de una palabra como partículas WORD (pos. inicial px/py, destino tx/ty, tamaño S). */
  _spawnLetters(text, S, place, { accent = 0, alpha = 1 } = {}) {
    const t = this.time, idx = [];
    [...text].forEach((ch, n) => {
      const i = this._allocParticle();
      if (i < 0) return;
      const p = place(n);
      this.state[i] = WORD;
      this.grp[i] = 0;
      this.pslot[i] = this.atlas.slot(ch, this._k('mono'));
      this.ptint[i] = 0;
      this.paccent[i] = accent;
      this.tx[i] = p.tx;
      this.ty[i] = p.ty;
      this.px[i] = p.px ?? p.tx;
      this.py[i] = p.py ?? p.ty;
      this.tz[i] = this.pz[i] = 0;
      this.trot[i] = this.rot[i] = 0;
      this.tsize[i] = this.size[i] = S;
      this.talpha[i] = alpha;
      this.alpha[i] = 0;
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      this.delay[i] = t + n * 0.03;
      this.birth[i] = this.delay[i];
      this.level[i] = 0.2;
      idx.push(i);
    });
    this.metaDirty = true;
    return idx;
  }

  _placeFlowWord(raw) {
    if (!this.wall) this._wallInit();
    const W = this.wall, text = this.wallUpper ? raw.toUpperCase() : raw, len = [...text].length;
    if (this.flowMode === 'sedimento') return this._placeSediment(raw, text, len, W);
    return this._placeScore(raw, text, len, W);
  }

  /** 6 · sedimento: la palabra cae desde arriba (a saltos) y se apoya sobre las capas, rellenando los valles. */
  _placeSediment(raw, text, len, W) {
    let k = Math.min(5, this._wordK(raw, [0.42, 0.7, 0.88, 1, 1])); // capas finas: nada más grande que 5×
    while (k > 1 && len * k > W.colsN * 0.9) k--;
    const wC = Math.min(W.colsN, len * k + (k > 1 ? 1 : 0));
    W.sky = W.sky || new Int32Array(W.colsN);
    let best = 0, bestBase = Infinity;
    for (let n = 0; n < 48; n++) {
      const c0 = Math.floor(Math.random() * (W.colsN - wC + 1));
      let base = 0;
      for (let c = c0; c < c0 + wC; c++) base = Math.max(base, W.sky[c]);
      const score = base + Math.random() * 1.5; // los valles primero, con algo de azar
      if (score < bestBase) {
        bestBase = score;
        best = c0;
      }
    }
    const word = { text, k, c0: best, wC, idx: [], accent: k >= 5 && Math.random() < 0.4 ? 1 : 0 };
    const S = W.rh * k * 1.62;
    word.idx = this._spawnLetters(text, S, () => ({ tx: 0, ty: 0 }), { accent: word.accent, alpha: k >= 5 ? 1 : 0.8 });
    this.flow.push(word);
    this._restack(true, word);
    // la pila llegó a la mitad: las capas más viejas se rompen y el resto se asienta
    let top = 0;
    for (let c = 0; c < W.colsN; c++) top = Math.max(top, W.sky[c]);
    if (top > W.rowsN * 0.5) {
      // erosión: el estrato de abajo (lo más viejo) se desarma y todo lo demás baja un escalón
      const n = Math.max(1, Math.ceil(this.flow.length * 0.25));
      for (const w of this.flow.splice(0, n)) this._breakLetters(w.idx, this.time, W.cw * 4);
      this._restack(false);
      this.onTransition?.(0.12);
    }
  }

  /** Recalcula la pila en orden de llegada (después de romper capas, todo baja). */
  _restack(onlyLast, last = null) {
    const W = this.wall;
    if (!onlyLast) W.sky.fill(0);
    const words = onlyLast ? [last] : this.flow;
    for (const w of words) {
      let base = 0;
      for (let c = w.c0; c < w.c0 + w.wC; c++) base = Math.max(base, W.sky[c]);
      for (let c = w.c0; c < w.c0 + w.wC; c++) W.sky[c] = base + w.k;
      const y = -W.y0 + (base + w.k / 2) * W.rh; // desde el piso del muro
      w.idx.forEach((i, n) => {
        this.tx[i] = W.x0 + (w.c0 + n * w.k + w.k / 2) * W.cw;
        this.ty[i] = y;
        this.px[i] = this.tx[i];
        // la nueva aparece unas filas arriba y cae a saltos sobre la pila; tras una erosión, todo baja de un salto
        // (en el mismo glitch: las capas no se cruzan en el camino)
        this.py[i] = onlyLast ? Math.min(this.H / 2, y + (5 + w.k) * W.rh) : y;
      });
    }
  }

  /** 7 · partitura: cinco carriles que se deslizan a distinta velocidad; las grandes, lentas. */
  _placeScore(raw, text, len, W) {
    if (!this.lanes) {
      const ks = [1, 3, 2, 5, 1];
      // los carriles, centrados en el alto
      let y = (ks.reduce((a, k) => a + k * W.rh, 0) + W.rh * 2.6 * (ks.length - 1)) / 2;
      this.lanes = ks.map((k, n) => {
        // velocidad según el alto (no el ancho): en un formato muy apaisado se lee igual, sólo tarda más en cruzar
        const lane = { k, y: y - (k * W.rh) / 2, v: this.H * (0.4 / (0.6 + k * 0.3)) * (n % 2 ? 1 : 1.15), cur: 0, tail: -Infinity };
        y -= k * W.rh + W.rh * 2.6;
        return lane;
      });
    }
    const want = this._wordK(raw, [0.4, 0.62, 0.8, 0.95, 1]);
    // carril con el tamaño más parecido; entre iguales, el más libre
    const lane = this.lanes.slice().sort((a, b) => Math.abs(a.k - want) - Math.abs(b.k - want) || a.tail - b.tail)[0];
    const k = lane.k, S = W.rh * k * 1.62, adv = W.cw * k, width = adv * len;
    // aparece a la derecha del centro (o detrás de la anterior) y se desliza hacia la izquierda
    const x0 = Math.max(this.W * (-0.1 + Math.random() * 0.3), lane.tail + adv * 1.2);
    lane.tail = x0 + width;
    const word = { lane, x: x0, width, adv, idx: [] };
    word.idx = this._spawnLetters(text, S, (n) => ({ tx: x0 + adv * (n + 0.5), ty: lane.y }), { accent: k >= 5 && Math.random() < 0.5 ? 1 : 0, alpha: k >= 3 ? 1 : 0.8 });
    this.flow.push(word);
  }

  _flowUpdate(dt) {
    if (this.flowMode !== 'partitura') return;
    this.flowLead = 0;
    for (const lane of this.lanes || []) {
      // si se acumula cola fuera de cuadro, el carril acelera hasta descargarla
      const over = Math.max(0, lane.tail - this.W / 2) / (this.W * 0.25);
      lane.cur = lane.v * (1 + over);
      lane.tail -= lane.cur * dt;
      this.flowLead = Math.max(this.flowLead, lane.cur * 0.2); // lo que avanza hasta que el telón se entera
    }
    for (let k = this.flow.length - 1; k >= 0; k--) {
      const w = this.flow[k];
      w.x -= w.lane.cur * dt;
      w.idx.forEach((i, n) => {
        if (this.state[i] !== WORD) return;
        this.tx[i] = w.x + w.adv * (n + 0.5);
        this.px[i] = this.tx[i]; // deslizamiento continuo (sin saltos)
      });
      if (w.x + w.width < -this.W / 2 - w.adv) {
        for (const i of w.idx) if (this.state[i] === WORD) {
          this.state[i] = FREE;
          this.alpha[i] = 0;
          this.pslot[i] = -1;
        }
        this.flow.splice(k, 1);
      }
    }
  }

  clearFlow() {
    for (const w of this.flow) this._breakLetters(w.idx, this.time, (this.wall?.cw || 10) * 8);
    this.flow = [];
    this.lanes = null;
    if (this.wall) this.wall.sky = null;
  }

  /** La palabra se rompe con glitch y libera su lugar. */
  _wallBreak(id) {
    const W = this.wall, w = W && W.words.get(id);
    if (!w) return;
    for (const ci of w.cells) if (W.occ[ci] === id) W.occ[ci] = -1;
    this._breakLetters(w.idx, this.time, W.cw * 10);
    W.words.delete(id);
    if (W.order) W.order = W.order.filter((x) => x !== id);
  }

  /** Al llegar un dibujo: las palabras que lo tapan se rompen (el dibujo se lee limpio). */
  breakWordsOverShape() {
    const W = this.wall || { words: new Map() };
    if (!this.shape || !this.backdrop) return;
    // cada letra se revisa en su centro y en sus cuatro esquinas: si alguna cae sobre el dibujo, la palabra se rompe
    const over = (i) => {
      const h = this.tsize[i] * 0.32;
      for (const [dx, dy] of [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]]) if (!this._shapeHides(this.tx[i] + dx, this.ty[i] + dy)) return true;
      return false;
    };
    for (const [id, w] of [...W.words]) {
      if (w.idx.some((i) => this.state[i] === WORD && over(i))) this._wallBreak(id);
    }
    // constelación: las palabras sueltas que tapan el dibujo también se rompen
    for (let k = this.sparse.length - 1; k >= 0; k--) {
      if (this.sparse[k].idx.some((i) => this.state[i] === WORD && over(i))) this._breakSparse(this.sparse.splice(k, 1)[0], this.time);
    }
  }

  /** Toda la placa (muro y nombre) se borra con glitch, letra por letra, durante `secs`. */
  dissolveBackdrop(secs = 2.6) {
    const B = this.backdrop, t = this.time;
    if (!B) return;
    for (const c of B.cells) {
      if (c.i < 0) continue;
      const i = c.i;
      c.i = -1;
      if (this.state[i] !== BGW) continue;
      this.state[i] = WORD;
      const at = t + Math.random() * secs;
      this.breaking.push({ i, jumpAt: at, at: at + 0.25 + Math.random() * 0.3, span: B.cw * 8 });
    }
    this.clearWallFx();
  }

  _wallEvict(id) {
    const W = this.wall;
    const w = W.words.get(id);
    if (!w) return;
    for (const ci of w.cells) if (W.occ[ci] === id) W.occ[ci] = -1;
    for (const i of w.idx) {
      if (this.state[i] !== WORD) continue;
      this.state[i] = FREE;
      this.vy[i] = -10 - Math.random() * 20;
      this.life[i] = 0;
    }
    W.words.delete(id);
  }

  /** Coloca una palabra en un lugar poco ocupado, con tamaño y brillo levemente variables. */
  placeWord(raw) {
    const word = String(raw).replace(/^[^\p{L}\p{N}¿¡]+|[^\p{L}\p{N}?!]+$/gu, '');
    if (!word) return;
    this.maskNext = 0; // la máscara de palabras se entera en el próximo cuadro
    if (this.sparseMode) {
      this._placeSparse(word);
      return;
    }
    if (this.artistWall) {
      this._placeArtistWord(word);
      return;
    }
    if (this.flowMode) {
      this._placeFlowWord(word);
      return;
    }
    if (this.wordsToBackdrop && this.backdropOn) {
      this._bdWrite(word);
      return;
    }
    if (this.wallMode) {
      const big = this.keywords.has(normalizeWord(word)) || this.rms > 0.55 || (word.length >= 9 && Math.random() < 0.3);
      this._placeWallWord(word, big);
      return;
    }
    const atlas = this.atlas;
    const base = clamp(this.H * 0.034, 20, 52);
    const S = base * (0.72 + Math.pow(Math.random(), 1.8) * 1.05);
    const slots = [...this._u(word)].map((ch) => atlas.slot(ch, this._k('serif')));
    const width = slots.reduce((a, sl) => a + atlas.adv(sl) * S, 0);
    const mX = this.W * 0.05, mY = this.H * 0.07;
    const pad = S * 0.35;
    let best = null, bestScore = Infinity;
    for (let c = 0; c < 56 && bestScore > 0; c++) {
      const x = -this.W / 2 + mX + width / 2 + Math.random() * Math.max(1, this.W - 2 * mX - width);
      const y = -this.H / 2 + mY + Math.random() * (this.H - 2 * mY);
      const r = { x0: x - width / 2 - pad, x1: x + width / 2 + pad, y0: y - S * 0.45 - pad, y1: y + S * 0.45 + pad };
      let score = 0;
      for (const q of this.wordRects) {
        const ox2 = Math.min(r.x1, q.x1) - Math.max(r.x0, q.x0);
        const oy2 = Math.min(r.y1, q.y1) - Math.max(r.y0, q.y0);
        if (ox2 > 0 && oy2 > 0) score += ox2 * oy2 * q.w;
      }
      if (score < bestScore) {
        bestScore = score;
        best = { x, y, r };
      }
    }
    // sin lugar libre: las palabras que quedarían debajo (las más viejas pesan menos) se rompen, nunca se pisan
    for (const q of this.wordRects) q.w *= 0.995;
    if (bestScore > 0) {
      const R = best.r;
      this.wordRects = this.wordRects.filter((q) => {
        const over = Math.min(R.x1, q.x1) > Math.max(R.x0, q.x0) && Math.min(R.y1, q.y1) > Math.max(R.y0, q.y0);
        if (over) this._breakLetters(q.idx || [], this.time, S);
        return !over;
      });
    }
    const rect = { ...best.r, w: 1, idx: [] };
    this.wordRects.push(rect);
    if (this.wordRects.length > 700) this.wordRects.shift();

    const t = this.time;
    const rotW = (Math.random() - 0.5) * 0.06;
    const alphaW = 0.42 + Math.random() * 0.45;
    const born = clamp(Math.max(0.15, this.rms), 0, 1);
    const g = Math.random();
    const zW = (g - 0.5) * 40;
    let x = best.x - width / 2;
    slots.forEach((sl, n) => {
      const adv = atlas.adv(sl) * S;
      const i = this._allocParticle();
      if (i < 0) return;
      this.state[i] = WORD;
      this.grp[i] = g;
      this.slot[i] = sl;
      this.pslot[i] = -1;
      this.tint[i] = Math.random() * 0.25;
      this.accent[i] = 0;
      const off = x + adv / 2 - best.x; // letras sobre la línea base inclinada de la palabra
      this.tx[i] = best.x + off * Math.cos(rotW);
      this.ty[i] = best.y + off * Math.sin(rotW);
      this.tz[i] = zW;
      this.trot[i] = rotW;
      this.tsize[i] = S;
      this.talpha[i] = alphaW;
      this.px[i] = this.tx[i];
      this.py[i] = this.ty[i] - S * 0.25; // asoma subiendo un poco
      this.pz[i] = this.tz[i];
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      this.rot[i] = rotW;
      this.size[i] = S;
      this.alpha[i] = 0;
      this.delay[i] = t + n * 0.035;
      this.birth[i] = this.delay[i];
      this.level[i] = born * 0.6;
      this.words.push(i);
      rect.idx.push(i);
      x += adv;
    });
    this.metaDirty = true;
  }

  clearWords() {
    for (const i of this.words) {
      if (this.state[i] !== WORD) continue;
      this.state[i] = FREE;
      this.vx[i] = (Math.random() - 0.5) * 40;
      this.vy[i] = (Math.random() - 0.5) * 40;
      this.life[i] = 0;
    }
    this.words = [];
    this.wordRects = [];
    this.wall = null;
    this.wordBufs.clear();
    this.wordSeen.clear();
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Muro de artistas: fragmentos con glitch + palabras grandes en grilla
  // ════════════════════════════════════════════════════════════════════════
  _wallFxStep(t, holes = []) {
    const B = this.backdrop;
    if (!B) return;
    let changed = false;
    for (let k = this.bigWords.length - 1; k >= 0; k--) {
      if (t > this.bigWords[k].until) {
        this._breakLetters(this.bigWords[k].idx, t, B.cw * 6);
        this.bigWords.splice(k, 1);
        changed = true;
      }
    }
    if (t >= this.fxNext) {
      this.fxNext = t + 2 + Math.random() * 2.5;
      if (this.bigWords.length < 5 && this._spawnBigWord(t, holes)) {
        changed = true;
        this.onTransition?.(0.25);
      }
    }
    if (changed) this.fxVer++;
  }

  /** Una palabra dicha, 2, 3 o 4 veces más grande, ocupando exactamente k × k celdas por letra. */
  _spawnBigWord(t, holes = []) {
    const B = this.backdrop;
    const words = this.corpus.slice(-1600).split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length >= 3 && w.length <= 10);
    if (!words.length) return false;
    const keys = words.filter((w) => this.keywords.has(normalizeWord(w)));
    const pool = keys.length && Math.random() < 0.5 ? keys : words.slice(-40); // las palabras clave, más seguido
    const word = this._u(pool[Math.floor(Math.random() * pool.length)]);
    const u = Math.random();
    let k = u < 0.55 ? 2 : u < 0.85 ? 3 : 4;
    while (k > 1 && word.length * k > B.colsN * 0.6) k--;
    if (k < 2 || k > B.rowsN / 3) return false;
    const len = [...word].length;
    for (let tries = 0; tries < 24; tries++) {
      const r0 = Math.floor(Math.random() * (B.rowsN - k + 1)), c0 = Math.floor(Math.random() * (B.colsN - len * k + 1));
      const hit = this.bigWords.some((b) => c0 < b.c0 + b.len * b.k + 2 && c0 + len * k + 2 > b.c0 && r0 < b.r0 + b.k + 1 && r0 + k + 1 > b.r0);
      if (hit || this._bigWordBlocked(r0 - 1, c0 - 1, k + 2, len * k + 2, holes)) continue;
      const idx = [];
      const accent = this.keywords.has(normalizeWord(word)) || Math.random() < 0.18 ? 1 : 0;
      [...word].forEach((ch, j) => {
        const c = B.cells[r0 * B.colsN + c0 + j * k];
        if (!c) return;
        const i = this._allocParticle(false);
        if (i < 0) return;
        this.state[i] = WORD;
        this.grp[i] = 0;
        this.tx[i] = c.x + ((k - 1) * B.cw) / 2;
        this.ty[i] = c.y - ((k - 1) * B.rh) / 2;
        this.tz[i] = 0;
        this.px[i] = this.tx[i] + (Math.random() - 0.5) * B.cw * k * 2; // llega con saltos, sin salir de su lugar
        this.py[i] = this.ty[i];
        this.pz[i] = 0;
        this.trot[i] = this.rot[i] = 0;
        this.tsize[i] = this.size[i] = B.size * k;
        this.talpha[i] = 1;
        this.alpha[i] = 0;
        this.pslot[i] = this.atlas.slot(ch, B.kind);
        this.ptint[i] = 0;
        this.paccent[i] = accent;
        this.delay[i] = t + j * 0.05;
        this.birth[i] = this.delay[i];
        this.level[i] = 0.1;
        idx.push(i);
      });
      this.bigWords.push({ c0, r0, k, len, idx, until: t + 9 + Math.random() * 10 });
      this.metaDirty = true;
      return true;
    }
    return false;
  }

  /**
   * ¿El rectángulo de celdas (r0, c0, alto, ancho) toca algo que una palabra grande no puede tapar?
   * Palabras vivas, el verso en vivo, el nombre, una figura o el dibujo.
   */
  _bigWordBlocked(r0, c0, hR, wC, holes) {
    const B = this.backdrop, M = this.wmask, S = this.shape;
    for (let r = Math.max(0, r0); r < Math.min(B.rowsN, r0 + hR); r++) {
      for (let c = Math.max(0, c0); c < Math.min(B.colsN, c0 + wC); c++) {
        const j = r * B.colsN + c;
        if (M && M.m.length === B.cells.length && M.m[j] === 1) return true;
        const cell = B.cells[j];
        if (holes.length && this._inHoles(cell.x, cell.y, B.cw * 0.5, holes)) return true;
        if (S && (S.pol === 'positivo') !== this._shapeHides(cell.x, cell.y)) return true; // parte del dibujo
      }
    }
    return false;
  }

  /** Celdas del telón que no se dibujan: 1 = bajo una palabra grande · 2 = bajo una palabra viva. */
  _fxRecompute(holes = []) {
    const B = this.backdrop, M = this.wmask;
    // una palabra grande que quedó encima de algo nuevo (una palabra dicha, el verso, un dibujo) se rompe
    for (let k = this.bigWords.length - 1; k >= 0; k--) {
      const b = this.bigWords[k];
      if (this._bigWordBlocked(b.r0, b.c0, b.k, b.len * b.k, holes)) {
        this._breakLetters(b.idx, this.time, B.cw * 3);
        this.bigWords.splice(k, 1);
      }
    }
    B.fx.fill(0);
    if (M && M.any && M.m.length === B.fx.length) for (let j = 0; j < M.m.length; j++) if (M.m[j] === 1) B.fx[j] = 2;
    for (const b of this.bigWords) {
      for (let r = b.r0; r < Math.min(B.rowsN, b.r0 + b.k); r++) {
        for (let c = b.c0; c < Math.min(B.colsN, b.c0 + b.len * b.k); c++) B.fx[r * B.colsN + c] = 1;
      }
    }
    B.fxVer = this.fxVer;
  }

  /**
   * Máscara de palabras vivas (en la grilla del telón): cada letra de una palabra, el verso en vivo y las palabras
   * grandes marcan las celdas que tapan (con medio módulo de margen). Lo que se está rompiendo y queda debajo de
   * una palabra nueva (el nombre de la placa, el telón que se borra) se apaga ya: nada se superpone.
   */
  _maskUpdate(t) {
    const G = this.backdrop || this._bdGeom();
    let M = this.wmask;
    if (!M || M.colsN !== G.colsN || M.rowsN !== G.rowsN || M.cw !== G.cw || M.top !== G.top) {
      M = this.wmask = { x0: G.x0, top: G.top, cw: G.cw, rh: G.rh, colsN: G.colsN, rowsN: G.rowsN, m: new Uint8Array(G.colsN * G.rowsN), any: false };
    }
    M.m.fill(0);
    M.any = false;
    const skip = new Set();
    for (const b of this.breaking) skip.add(b.i);
    const big = new Set();
    for (const b of this.bigWords) for (const i of b.idx) big.add(i);
    // 1 = palabra dicha / verso · 2 = palabra grande del muro (ya tapa su rectángulo en el telón)
    const mark = (x, y, hw, hh, v, lead = 0) => {
      const c0 = Math.max(0, Math.floor((x - hw - lead - M.x0) / M.cw)), c1 = Math.min(M.colsN - 1, Math.floor((x + hw - M.x0) / M.cw));
      const r0 = Math.max(0, Math.floor((M.top - y - hh) / M.rh)), r1 = Math.min(M.rowsN - 1, Math.floor((M.top - y + hh) / M.rh));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (M.m[r * M.colsN + c] !== 1) M.m[r * M.colsN + c] = v;
      if (r0 <= r1 && c0 <= c1) M.any = true;
    };
    const st = this.state, atlas = this.atlas, slide = this.flowMode === 'partitura'; // en la partitura las palabras avanzan
    for (let i = 1; i < this.N; i++) {
      const s = st[i];
      if (s === WORD) {
        if (skip.has(i) || this.talpha[i] <= 0.01) continue;
        const S = this.tsize[i], sl = this.pslot[i] >= 0 ? this.pslot[i] : this.slot[i];
        // caja de la letra: su avance de ancho y un módulo de alto (S = módulo × 1,62), con un poco de aire
        const hw = (atlas.adv(sl) * S) / 2 + M.cw * 0.25, hh = S * 0.31 + M.rh * 0.25, v = big.has(i) ? 2 : 1;
        mark(this.tx[i], this.ty[i], hw, hh, v, slide ? this.flowLead : 0); // en la partitura, también lo que viene
        // en camino (cae, llega con saltos): también donde está ahora
        const dx = Math.abs(this.px[i] - this.tx[i]), dy = Math.abs(this.py[i] - this.ty[i]);
        if (dx > M.cw * 0.5 || dy > M.rh * 0.5) mark((this.px[i] + this.tx[i]) / 2, (this.py[i] + this.ty[i]) / 2, hw + dx / 2, hh + dy / 2, v); // abre su camino
      }
    }
    // el verso en vivo, entero apenas existe (sus letras aparecen con fundido)
    if (this.line) {
      for (const row of this.line.rows) {
        for (const e of row) {
          if (e.i < 0 || st[e.i] !== LINE) continue;
          const S = this.tsize[e.i];
          mark(this.tx[e.i], this.ty[e.i], (atlas.adv(this.slot[e.i]) * S) / 2 + M.cw * 0.25, S * 0.36 + M.rh * 0.25, 1);
        }
      }
    }
    if (!M.any) return;
    // lo que se rompe con glitch y cae sobre una palabra viva se apaga en el acto
    for (const b of this.breaking) {
      const i = b.i;
      if (t >= b.at || big.has(i)) continue;
      const c = Math.floor((this.px[i] - M.x0) / M.cw), r = Math.floor((M.top - this.py[i]) / M.rh);
      if (c >= 0 && c < M.colsN && r >= 0 && r < M.rowsN && M.m[r * M.colsN + c]) {
        b.jumped = true;
        b.at = t;
      }
    }
  }

  clearWallFx() {
    for (const b of this.bigWords) this._breakLetters(b.idx, this.time, (this.backdrop?.cw || 10) * 6);
    this.bigWords = [];
    this.fxVer++;
  }

  /** Las letras se rompen con glitch (saltos a lugares cercanos) y se apagan. */
  _breakLetters(idx, t, span) {
    for (const i of idx) {
      if (this.state[i] !== WORD) continue;
      this.tx[i] += (Math.random() - 0.5) * span;
      this.ty[i] += (Math.random() - 0.5) * span * 0.35;
      this.breaking.push({ i, at: t + 0.25 + Math.random() * 0.35 });
    }
  }

  _breakingUpdate(t) {
    if (!this.breaking.length) return;
    const keep = [];
    for (const b of this.breaking) {
      if (b.jumpAt != null && !b.jumped && t >= b.jumpAt) {
        b.jumped = true; // el salto con glitch, en su turno (nombre que se borra de a poco)
        this.tx[b.i] += (Math.random() - 0.5) * b.span;
        this.ty[b.i] += (Math.random() - 0.5) * b.span * 0.35;
        this.onTransition?.(0.12);
      }
      if (t < b.at) {
        keep.push(b);
        continue;
      }
      if (this.state[b.i] !== WORD) continue;
      this.state[b.i] = FREE;
      this.alpha[b.i] = 0;
      this.pslot[b.i] = -1;
      this.keepFall[b.i] = 0;
    }
    this.breaking = keep;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Tecla 0: pocas palabras que arman figuras entre ellas y se rompen con glitch
  // ════════════════════════════════════════════════════════════════════════
  _sparseFigure() {
    const kinds = ['circulo', 'espiral', 'diagonal', 'onda', 'columna', 'constelacion'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const F = { kind, n: 0, total: 7 + Math.floor(Math.random() * 4), cx: (Math.random() - 0.5) * this.W * 0.3, cy: (Math.random() - 0.5) * this.H * 0.2, rot: Math.random() * Math.PI * 2, last: null, sc: 1 };
    if (this.sparseKeep) {
      // tecla 0 acumulando: cada párrafo en la zona más libre del cuadro, con una figura más compacta
      F.sc = 0.5;
      const centers = [];
      for (const p of new Set(this.sparse.map((w) => w.para))) {
        const ws = this.sparse.filter((w) => w.para === p);
        centers.push([ws.reduce((a, w) => a + w.x, 0) / ws.length, ws.reduce((a, w) => a + w.y, 0) / ws.length]);
      }
      let best = -1;
      for (let n = 0; n < 40; n++) {
        const x = (Math.random() - 0.5) * this.W * 0.7, y = (Math.random() - 0.5) * this.H * 0.6;
        const d = centers.length ? Math.min(...centers.map(([a, b]) => Math.hypot((a - x) / this.W, (b - y) / this.H))) : Math.random();
        if (d > best) {
          best = d;
          F.cx = x;
          F.cy = y;
        }
      }
    }
    return F;
  }

  _sparsePoint(F) {
    const n = F.n, T = F.total, u = n / Math.max(1, T - 1), W = this.W * F.sc, H = this.H * F.sc;
    switch (F.kind) {
      case 'circulo': {
        const a = F.rot + (n / T) * Math.PI * 2;
        return [F.cx + Math.cos(a) * H * 0.42, F.cy + Math.sin(a) * H * 0.3];
      }
      case 'espiral': {
        const a = F.rot + n * 0.9, r = H * (0.05 + 0.04 * n);
        return [F.cx + Math.cos(a) * r * 1.4, F.cy + Math.sin(a) * r];
      }
      case 'diagonal':
        return [F.cx + (u - 0.5) * W * 0.62, F.cy + (0.5 - u) * H * 0.6 * (F.rot > Math.PI ? 1 : -1)];
      case 'onda':
        return [F.cx + (u - 0.5) * W * 0.66, F.cy + Math.sin(u * Math.PI * 2 + F.rot) * H * 0.22];
      case 'columna':
        return [F.cx + (n % 2 ? 1 : -1) * W * 0.04, F.cy * (1 - F.sc) + (0.42 - u * 0.84) * H];
      default: {
        // constelación: cada palabra cerca de la anterior; si se acerca al borde, gira hacia el centro
        const p = F.last || [F.cx, F.cy];
        F.rot += (Math.random() - 0.5) * 1.4;
        let x = p[0] + Math.cos(F.rot) * W * 0.11, y = p[1] + Math.sin(F.rot) * H * 0.17;
        if (Math.abs(x - F.cx) > W * 0.34 || Math.abs(y - F.cy) > H * 0.32 || Math.abs(x) > this.W * 0.42 || Math.abs(y) > this.H * 0.4) {
          F.rot = Math.atan2(F.cy - p[1], F.cx - p[0]) + (Math.random() - 0.5) * 0.8;
          x = p[0] + Math.cos(F.rot) * W * 0.11;
          y = p[1] + Math.sin(F.rot) * H * 0.17;
        }
        return [x, y];
      }
    }
  }

  _placeSparse(word) {
    const t = this.time;
    if (!this.sparseFig || this.sparseFig.n >= this.sparseFig.total) {
      this.sparseFig = this._sparseFigure();
      if (this.sparseKeep) this.sparseFig.total = 14 + Math.floor(Math.random() * 8); // un párrafo, una figura
    }
    const F = this.sparseFig;
    let [x, y] = this._sparsePoint(F);
    F.n++;
    F.last = [x, y];
    // tamaños en grilla: el del muro es el mínimo; algunas palabras 2 o 3 veces más grandes
    const base = clamp(this.H * 0.034, 18, 48) * 1.3; // tecla 0: todo un 30 % más grande
    const u = Math.random();
    const nw = normalizeWord(word);
    let k = this.keywords.has(nw) || u > (this.sparseKeep ? 0.93 : 0.86) ? 3 : u > (this.sparseKeep ? 0.72 : 0.6) ? 2 : 1;
    if (STOP.has(nw) || nw.length <= 2) k = 1; // las palabras de enlace, chicas
    const S = base * k;
    const slots = [...this._u(word)].map((ch) => this.atlas.slot(ch, this._k('mono')));
    const adv = this.atlas.adv(this.atlas.slot('M', this._k('mono'))) * S; // monoespaciada: avance fijo
    const cw = this.atlas.adv(this.atlas.slot('M', this._k('mono'))) * base, rh = base * 1.1;
    const width = adv * slots.length;
    // alineada a la grilla del módulo mínimo y dentro del cuadro
    const snapX = (xx) => Math.round((clamp(xx, -this.W / 2 + width / 2 + cw, this.W / 2 - width / 2 - cw) - width / 2) / cw) * cw + width / 2;
    const snapY = (yy) => Math.round(clamp(yy, -this.H / 2 + S, this.H / 2 - S) / rh) * rh;
    x = snapX(x);
    y = snapY(y);
    // sin taparse: ni otra palabra viva ni (en la constelación) el dibujo
    const hitsWord = (w, xx, yy) => Math.abs(w.y - yy) < (w.k * base + S) * 0.62 && Math.abs(w.x - xx) < (w.w + width) / 2 + cw;
    const overShape = (xx, yy) => {
      if (!this.shape || !this.backdrop || !this.backdropOnlyShape) return false;
      const h = S * 0.32;
      for (let j = 0; j < slots.length; j++) {
        const lx = xx - width / 2 + adv * (j + 0.5);
        for (const [dx, dy] of [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]]) if (!this._shapeHides(lx + dx, yy + dy)) return true;
      }
      return false;
    };
    const free = (xx, yy) => !this.sparse.some((w) => hitsWord(w, xx, yy)) && !overShape(xx, yy);
    let ok = free(x, y);
    // 1) correrse de a una fila, arriba y abajo
    for (let k2 = 1; k2 <= 12 && !ok; k2++) {
      const yy = snapY(y + (k2 % 2 ? 1 : -1) * Math.ceil(k2 / 2) * rh * Math.max(1, k));
      if (free(x, yy)) {
        y = yy;
        ok = true;
      }
    }
    // 2) el lugar libre más cercano, cada vez más lejos
    if (!ok) {
      let best = null, bd = Infinity;
      for (let n = 0; n < 160; n++) {
        const r = 0.15 + (n / 160) * 0.85;
        const xx = snapX(x + (Math.random() - 0.5) * this.W * r), yy = snapY(y + (Math.random() - 0.5) * this.H * r);
        const d = Math.hypot((xx - x) / this.W, (yy - y) / this.H);
        if (d < bd && free(xx, yy)) {
          bd = d;
          best = [xx, yy];
        }
      }
      if (best) {
        [x, y] = best;
        ok = true;
      }
    }
    // 3) no hay lugar: las más viejas que estorban se rompen (nunca quedan encimadas)
    if (!ok) {
      for (let q = this.sparse.length - 1; q >= 0; q--) if (hitsWord(this.sparse[q], x, y)) this._breakSparse(this.sparse.splice(q, 1)[0], t);
    }
    const idx = [];
    slots.forEach((sl, j) => {
      const i = this._allocParticle(false);
      if (i < 0) return;
      this.state[i] = WORD;
      this.grp[i] = 0;
      this.tx[i] = x - width / 2 + adv * (j + 0.5);
      this.ty[i] = y;
      this.tz[i] = 0;
      this.px[i] = this.tx[i] + (Math.random() - 0.5) * cw * 2 * k; // llega con saltos, sin salir de su lugar
      this.py[i] = this.ty[i] + (Math.random() - 0.5) * rh * 0.5;
      this.pz[i] = 0;
      this.trot[i] = this.rot[i] = 0;
      this.tsize[i] = this.size[i] = S;
      this.talpha[i] = 1;
      this.alpha[i] = 0;
      this.pslot[i] = sl;
      this.ptint[i] = 0;
      this.paccent[i] = k === 3 ? 1 : 0;
      this.delay[i] = t + j * 0.03;
      this.birth[i] = this.delay[i];
      this.level[i] = 0.1;
      idx.push(i);
    });
    const keep = this.sparseKeep > 0;
    this.sparse.push({ idx, x, y, k, w: width, para: this.sparsePara, until: keep ? Infinity : t + 7 + Math.random() * 5 });
    this.metaDirty = true;
    this.onTransition?.(0.18);
    const cap = keep ? 160 : this.sparseMax;
    while (this.sparse.length > cap) this._breakSparse(this.sparse.shift(), t);
  }

  /** Tecla 0: empieza un párrafo nuevo (pausa larga): su propia figura; si hay más de `sparseKeep`, se rompe el más viejo. */
  newParagraph() {
    this.sparsePara++;
    this.sparseFig = null;
    if (!this.sparseKeep) return;
    const paras = [...new Set(this.sparse.map((w) => w.para))];
    while (paras.length >= this.sparseKeep) { // con el nuevo, nunca más de sparseKeep
      const old = paras.shift();
      for (let k = this.sparse.length - 1; k >= 0; k--) if (this.sparse[k].para === old) this._breakSparse(this.sparse.splice(k, 1)[0], this.time);
    }
  }

  _breakSparse(w, t) {
    this._breakLetters(w.idx, t, this.H * 0.12);
    this.onTransition?.(0.22);
  }

  _sparseUpdate(t) {
    for (let k = this.sparse.length - 1; k >= 0; k--) {
      if (t > this.sparse[k].until) this._breakSparse(this.sparse.splice(k, 1)[0], t);
    }
  }

  /** Todo se apaga en su lugar (sin caer): ni muro, ni lluvia, ni pila. */
  wipe() {
    this.setBackdrop(false, { fall: false });
    for (let i = 1; i < this.N; i++) {
      this.keepFall[i] = 0;
      if (this.state[i] === FREE && this.rest[i] > 0) this._unrest(i);
    }
    this.setSceneDensity(0);
  }

  clearSparse() {
    for (const w of this.sparse) this._breakLetters(w.idx, this.time, this.H * 0.12);
    this.sparse = [];
    this.sparseFig = null;
  }

  stats() {
    let line = 0, fig = 0, other = 0;
    for (let i = 0; i < this.N; i++) {
      if (this.state[i] === LINE) line++;
      else if (this.state[i] === FIGURE) fig++;
      else if (this.state[i] === TITLE || this.state[i] === WORD) other++;
    }
    return { total: this.N, visible: this.visible || 0, line, figure: fig, words: other, mode: this.phys.modo, figureName: this.figure?.name || '—', atlas: `${this.atlas.next}/${this.atlas.capacity}` };
  }
}
