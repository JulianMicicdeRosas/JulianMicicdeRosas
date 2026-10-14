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
    // marca aplicada a todo (tipografía y mayúsculas del manual)
    this.brandAll = false;
    this.brandUpper = false;
    this.wallRows = 34;
    this.wallUpper = true;
    this.wall = null;
    this.wordSeen = new Set();
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
    this.lineY = -this.H * 0.385;
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
    const idx = PHYSICS_MODES.indexOf(f.modo);
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
    return this.brandAll ? 'brand' : kind;
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
    while (line.rows.length > 3) this._releaseEntries(line.rows.shift());
    this._layoutLine();
  }

  _layoutLine() {
    const line = this.line;
    if (!line) return;
    const S = this.lineSize;
    const rows = line.rows;
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
      for (const row of old.rows) this._releaseEntries(row, true);
      this.typeDelta(itemId, final, { stagger: 0.008, level: 0.15 });
    }
    if (this.line) {
      this.line.completed = true;
      this.line.releaseAt = this.time + clamp(1.8 + final.length * 0.035, 2.2, 5.5);
    }
    this.addCorpus(final);
  }

  _releaseEntries(row, quiet = false) {
    for (const e of row) {
      if (e.i < 0) continue;
      const i = e.i;
      this.state[i] = FREE;
      this.vx[i] = (Math.random() - 0.5) * 24;
      this.vy[i] = quiet ? 0 : 12 + Math.random() * 30;
      this.vz[i] = (Math.random() - 0.5) * 40;
      this.life[i] = 0;
      if (quiet) this.alphaT[i] = 0;
    }
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
    const src = (text && text.trim() ? text.trim() : this.corpus.slice(-400)).replace(/\s+/g, ' ') + ' · ';
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
        if (skipSpaces && (ch === ' ' || ch === '·')) continue;
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
    const kindC = brand ? 'brand' : typo === 'mono' ? 'mono' : 'serif';
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
      k, cx, cy, ox, oy, top: fig.top,
      until: dir.permanente ? Infinity : t + clamp(+dir.duracion_s || 14, 6, 40) + 3.5,
      name: dir.figura || '',
      count: nT,
    };
    this._recomputeFloor();
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

    const { intensidad: inten, velocidad: vel, turbulencia: turb, densidad: dens } = this.phys;
    const corpusFactor = clamp(0.1 + this.corpusChars / 2600, 0.1, 1);
    const density = corpusFactor * (0.3 + 0.7 * dens) * this.figureDensity * this.sceneDensity * (wR > 0.5 ? 0.75 : 1);
    const ambient = 0.42 + 0.4 * inten;
    const W = this.W, H = this.H, halfW = W / 2, halfH = H / 2;

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
        const w = 3.6 + s * 2.6, w2 = w * w, c2 = 2 * w;
        const bx = Math.sin(t * 0.8 + s * 40) * 1.6, by = Math.cos(t * 0.7 + s * 23) * 1.6;
        vx[i] += (w2 * (this.tx[i] + bx - px[i]) - c2 * vx[i]) * dt;
        vy[i] += (w2 * (this.ty[i] + by - py[i]) - c2 * vy[i]) * dt;
        vz[i] += (w2 * (this.tz[i] - pz[i]) - c2 * vz[i]) * dt;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
        rot[i] += angDiff(this.trot[i], rot[i]) * kRot;
        size[i] += (this.tsize[i] - size[i]) * kSize;
        alphaT[i] = this.talpha[i] * this.figureAlpha;
        alpha[i] += (alphaT[i] - alpha[i]) * kAlpha;
      } else if ((st === TITLE || st === WORD) && t >= this.delay[i]) {
        if (this.pslot[i] >= 0) {
          this.slot[i] = this.pslot[i];
          this.tint[i] = this.ptint[i];
          this.accent[i] = this.paccent[i];
          this.pslot[i] = -1;
          this.metaDirty = true;
        }
        const title = st === TITLE;
        const w = title ? 3 + s * 1.4 : 2.6, w2 = w * w, c2 = 2 * w;
        const amp = title ? 0.8 : this.wallMode ? 0 : 2.5; // en el muro, grilla estricta
        const g = this.grp[i];
        const bx = Math.sin(t * (title ? 0.6 : 0.17) + g * 40) * amp, by = Math.cos(t * (title ? 0.5 : 0.13) + g * 23) * amp;
        vx[i] += (w2 * (this.tx[i] + bx - px[i]) - c2 * vx[i]) * dt;
        vy[i] += (w2 * (this.ty[i] + by - py[i]) - c2 * vy[i]) * dt;
        vz[i] += (w2 * (this.tz[i] - pz[i]) - c2 * vz[i]) * dt;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
        rot[i] += angDiff(this.trot[i], rot[i]) * kRot;
        size[i] += (this.tsize[i] - size[i]) * kSize;
        alphaT[i] = this.talpha[i];
        alpha[i] += (alphaT[i] - alpha[i]) * (title ? kAlpha : 1 - Math.exp(-dt * 1.4));
      } else {
        // ── FREE (o FIGURE esperando su turno) ─────────────────────────────
        const awaiting = st !== FREE; // reclutada (figura, título o palabra) esperando su turno
        const vis = awaiting || seed2[i] < density;
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
  showTitle(text, { cy = 0.03, maxSize = 0.13 } = {}) {
    this.clearTitle();
    const words = this._u(String(text || '')).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const atlas = this.atlas;
    const tk = this._k('serif');
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
    this.title = { text, idx };
    this.metaDirty = true;
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
    // las palabras viejas pesan menos: con el tiempo se aceptan superposiciones
    for (const q of this.wordRects) q.w *= 0.995;
    this.wordRects.push({ ...best.r, w: 1 });
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
