// ─────────────────────────────────────────────────────────────────────────────
//  show.js — Máquina de estados de la noche:
//
//    LOOP ──(1..9)──► ARTISTA (nombre hecho de letras) ──(S)──► POEMA (graba)
//      ▲                 ▲  (número: reinicia al nombre)            │ (T) ⇄
//      └──────(L)────────┴──────────────────────────────────── PALABRAS (graba)
//
//  Sólo se transcribe (y se paga OpenAI) mientras recording = true.
// ─────────────────────────────────────────────────────────────────────────────
import { sampleText, sampleImage } from './svgSampler.js';

export const DEFAULT_SETTINGS = {
  artists: [{ name: 'Nombre del artista 1' }, { name: 'Nombre del artista 2' }, { name: 'Nombre del artista 3' }],
  loop: [
    { tipo: 'imagen', contenido: 'loop/flat.png', render: 'letras', duracion: 10, letras: 'FLAT', alt: 'FLAT' },
    { tipo: 'imagen', contenido: 'loop/sponsors.png', render: 'imagen', duracion: 8, letras: '', alt: 'SPONSORS' },
    { tipo: 'texto', contenido: 'UMBRAL', render: 'letras', duracion: 12, letras: 'UMBRAL' },
  ],
  prompt_estetica: '',
  avisos: true,
  pointcloud: true, // estética nube de puntos (TouchDesigner)
  profundidad: 0.45, // extrusión en Z de las figuras
  nube: 1, // intensidad de la nube
  orbita: 0.6, // cuánto orbita la cámara alrededor de la figura
  device: '',
};

const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
          imageCache.delete(src);
          reject(new Error(`no se pudo cargar ${String(src).slice(0, 60)}`));
        };
        img.src = src;
      }),
    );
  }
  return imageCache.get(src);
}

export class Show {
  constructor({ field, onSession, notify, interiorTarget = 4000 }) {
    this.field = field;
    this.onSession = onSession;
    this.notify = notify;
    this.interiorTarget = interiorTarget;
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.state = 'loop';
    this.mode = 'poema';
    this.recording = false;
    this.artistIdx = -1;
    this.loopIndex = -1;
    this.loopTimer = 0;
    this.loopToken = 0;

    this.overlay = document.createElement('div');
    this.overlay.id = 'overlay';
    this.overlayImg = document.createElement('img');
    this.overlay.appendChild(this.overlayImg);
    document.body.appendChild(this.overlay);
  }

  setSettings(settings) {
    this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...settings };
  }

  get artists() {
    return (this.settings.artists || []).filter((a) => a && a.name && a.name.trim());
  }

  label() {
    if (this.state === 'loop') return 'loop';
    if (this.state === 'artist') return `artista ${this.artistIdx + 1}`;
    return `${this.mode} · grabando`;
  }

  // ── loop ─────────────────────────────────────────────────────────────────
  goLoop() {
    this._setRecording(false);
    clearTimeout(this.loopTimer);
    const f = this.field;
    f.clearScene();
    f.resetCorpus(this._loopCorpus());
    f.cursorEnabled = false;
    f.setSceneDensity(0.55);
    f.setPalette({});
    f.setPhysics({ modo: 'dispersion_ceniza', intensidad: 0.35, velocidad: 0.3, turbulencia: 0.35, densidad: 0.55 });
    this.state = 'loop';
    this.loopIndex = -1;
    this.notify('LOOP');
    this._nextLoop();
  }

  _loopCorpus() {
    const words = (this.settings.loop || []).map((s) => s.letras || (s.tipo === 'texto' ? s.contenido : s.alt) || '').filter(Boolean);
    return words.join('  ') || 'UMBRAL';
  }

  async _nextLoop() {
    clearTimeout(this.loopTimer);
    if (this.state !== 'loop') return;
    const steps = (this.settings.loop || []).filter((s) => s && s.contenido);
    if (!steps.length) return;
    this.loopIndex = (this.loopIndex + 1) % steps.length;
    const step = steps[this.loopIndex];
    const token = ++this.loopToken;
    try {
      await this._playStep(step, token);
    } catch (e) {
      console.warn('[loop]', e);
    }
    if (token !== this.loopToken || this.state !== 'loop') return;
    const secs = Math.min(600, Math.max(2, +step.duracion || 10));
    this.loopTimer = setTimeout(() => this._nextLoop(), secs * 1000);
  }

  async _playStep(step, token) {
    const f = this.field;
    this._hideImage();
    f.clearTitle();
    let kind = step.tipo === 'imagen' ? 'imagen' : 'texto';
    let content = String(step.contenido || '');
    let img = null;
    if (kind === 'imagen') {
      try {
        img = await loadImage(content);
      } catch (e) {
        console.warn('[loop]', e.message, '→ uso el texto alternativo');
        kind = 'texto';
        content = step.alt || step.letras || content.split('/').pop().replace(/\.[a-z0-9]+$/i, '').toUpperCase();
      }
    }
    if (token !== this.loopToken) return;
    const letras = step.letras || (kind === 'texto' ? content : this._loopCorpus());
    const dir = { modo_visual: 'concreto', relleno: 'ambos', tipografia: 'mixta', verso: letras, permanente: true, figura: content.slice(0, 40) };

    if (kind === 'imagen' && step.render === 'imagen') {
      f.releaseFigure(true);
      this._showImage(img.src);
      return;
    }
    if (kind === 'texto' && step.render === 'titulo') {
      f.releaseFigure(true);
      f.showTitle(content);
      return;
    }
    const fig = kind === 'imagen' ? sampleImage(img, { interiorTarget: this.interiorTarget }) : sampleText(content, { interiorTarget: this.interiorTarget });
    if (fig) f.formFigure(fig, dir);
    else if (kind === 'imagen') this._showImage(img.src); // logo inutilizable como máscara: mostrarlo tal cual
    else f.showTitle(content);
  }

  _showImage(src) {
    this.overlayImg.src = src;
    this.overlay.classList.add('on');
  }

  _hideImage() {
    this.overlay.classList.remove('on');
  }

  // ── artista ──────────────────────────────────────────────────────────────
  goArtist(n) {
    const a = this.artists[n - 1];
    if (!a) {
      this.notify(`No hay artista ${n} (configúralo con C)`);
      return false;
    }
    this._setRecording(false);
    clearTimeout(this.loopTimer);
    this.loopToken++;
    this._hideImage();
    const f = this.field;
    f.clearScene();
    f.resetCorpus(a.name);
    f.cursorEnabled = false;
    f.setSceneDensity(0.5);
    f.setPalette({});
    f.setPhysics({ modo: 'dispersion_ceniza', intensidad: 0.3, velocidad: 0.25, turbulencia: 0.3, densidad: 0.5 });
    f.showTitle(a.name);
    this.state = 'artist';
    this.artistIdx = n - 1;
    this.notify(`${n} · ${a.name} — S para comenzar`);
    return true;
  }

  // ── grabación ────────────────────────────────────────────────────────────
  start(mode = 'poema') {
    clearTimeout(this.loopTimer);
    this.loopToken++;
    this._hideImage();
    const f = this.field;
    if (this.state !== 'perform') {
      // desde el loop o el nombre: el título se disuelve y su nombre queda en el corpus
      f.releaseFigure(true);
      f.clearTitle();
    }
    if (mode === 'palabras') {
      f.releaseFigure(true);
      f.cursorEnabled = false;
      f.setSceneDensity(0.12);
      f.setPhysics({ modo: 'dispersion_ceniza', intensidad: 0.25, velocidad: 0.2, turbulencia: 0.25, densidad: 0.4 });
    } else {
      f.clearWords();
      f.cursorEnabled = true;
      f.setSceneDensity(1);
      f.setPhysics({ modo: 'lluvia_text_rain', intensidad: 0.5, velocidad: 0.45, turbulencia: 0.35, densidad: 0.6 });
    }
    this.state = 'perform';
    this.mode = mode;
    this._setRecording(true);
    this.notify(`● GRABANDO · ${mode === 'palabras' ? 'palabras' : 'poema'}`);
  }

  toggleWords() {
    this.start(this.state === 'perform' && this.mode === 'palabras' ? 'poema' : 'palabras');
  }

  _setRecording(on) {
    this.recording = on;
    this.onSession({ recording: on, mode: this.mode });
  }

  /** Reenvía el estado al backend tras una reconexión. */
  resync() {
    this.onSession({ recording: this.recording, mode: this.mode });
  }
}
