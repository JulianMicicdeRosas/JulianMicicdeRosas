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
import { processLogo, layoutLogos, paginate, composeLogos } from './logos.js';

export const DEFAULT_SETTINGS = {
  artists: [{ name: 'Nombre del artista 1' }, { name: 'Nombre del artista 2' }, { name: 'Nombre del artista 3' }],
  loop: [
    { tipo: 'imagen', contenido: 'loop/flat.png', render: 'letras', duracion: 10, letras: 'FLAT', alt: 'FLAT' },
    // «logos»: todos los archivos de la carpeta (+ los subidos), en una grilla que se adapta a la cantidad
    { tipo: 'logos', carpeta: 'public/loop/sponsors', imagenes: [], render: 'imagen', duracion: 8, por_pagina: 8, monocromo: true, letras: '', alt: 'SPONSORS' },
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
  constructor({ field, onSession, notify, fetchLogos, interiorTarget = 4000 }) {
    this.field = field;
    this.fetchLogos = fetchLogos; // carpeta → Promise<string[]> (el backend lee la carpeta)
    this.pageTimers = [];
    this.logoCache = new Map();
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
    this.logoBox = document.createElement('div');
    this.logoBox.id = 'logos';
    document.body.appendChild(this.logoBox);
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
    const steps = (this.settings.loop || []).filter((s) => s && (s.contenido || s.tipo === 'logos'));
    if (!steps.length) return;
    this.loopIndex = (this.loopIndex + 1) % steps.length;
    const step = steps[this.loopIndex];
    const token = ++this.loopToken;
    let secs = Math.min(600, Math.max(2, +step.duracion || 10));
    try {
      const custom = await this._playStep(step, token);
      if (Number.isFinite(custom) && custom > 0) secs = custom; // p. ej. varias páginas de logos
    } catch (e) {
      console.warn('[loop]', e);
    }
    if (token !== this.loopToken || this.state !== 'loop') return;
    this.loopTimer = setTimeout(() => this._nextLoop(), secs * 1000);
  }

  async _playStep(step, token) {
    const f = this.field;
    this._hideImage();
    f.clearTitle();
    if (step.tipo === 'logos') {
      const total = await this._playLogos(step, token);
      if (total !== null) return total;
      step = { ...step, tipo: 'texto', contenido: step.alt || 'SPONSORS', render: 'letras' }; // sin logos: su nombre
    }
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

  // ── logos ────────────────────────────────────────────────────────────────
  async _playLogos(step, token) {
    const srcs = [];
    if (step.carpeta && this.fetchLogos) {
      try {
        srcs.push(...(await this.fetchLogos(step.carpeta)));
      } catch (e) {
        console.warn('[logos]', e.message);
      }
    }
    srcs.push(...(step.imagenes || []).filter(Boolean));
    const loaded = await Promise.allSettled(srcs.map((src) => loadImage(src)));
    if (token !== this.loopToken) return 0;
    const mono = step.monocromo !== false;
    const logos = [];
    loaded.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const key = `${mono ? 'm' : 'c'}|${srcs[i].length}|${srcs[i].slice(0, 80)}|${srcs[i].slice(-80)}`;
      if (!this.logoCache.has(key)) this.logoCache.set(key, processLogo(r.value, { monocromo: mono }));
      logos.push(this.logoCache.get(key));
    });
    if (!logos.length) return null;
    const pages = paginate(logos, +step.por_pagina || 8);
    const per = Math.min(600, Math.max(2, +step.duracion || 8));
    pages.forEach((page, p) => {
      const t = setTimeout(() => token === this.loopToken && this._showLogoPage(page, step, p > 0), p * per * 1000);
      this.pageTimers.push(t);
    });
    return per * pages.length;
  }

  _showLogoPage(page, step, crossfade) {
    const f = this.field;
    if (step.render === 'letras') {
      this.logoBox.classList.remove('on');
      const fig = sampleImage(composeLogos(page), { interiorTarget: this.interiorTarget });
      if (fig) {
        f.formFigure(fig, { modo_visual: 'concreto', relleno: 'volumen', tipografia: 'mono', verso: step.letras || step.alt || 'SPONSORS', permanente: true, figura: 'logos' });
        return;
      }
    }
    f.releaseFigure(true);
    const place = () => {
      const W = window.innerWidth * 0.8, H = window.innerHeight * 0.62;
      const x0 = (window.innerWidth - W) / 2, y0 = (window.innerHeight - H) / 2;
      const rects = layoutLogos(page.map((c) => c.width / c.height), W, H);
      this.logoBox.replaceChildren(...page);
      page.forEach((c, i) => {
        Object.assign(c.style, { left: `${x0 + rects[i].x}px`, top: `${y0 + rects[i].y}px`, width: `${rects[i].w}px`, height: `${rects[i].h}px` });
      });
      this.logoBox.classList.add('on');
    };
    if (crossfade && this.logoBox.classList.contains('on')) {
      this.logoBox.classList.remove('on');
      this.pageTimers.push(setTimeout(place, 900));
    } else place();
  }

  _showImage(src) {
    this.overlayImg.src = src;
    this.overlay.classList.add('on');
  }

  _hideImage() {
    this.overlay.classList.remove('on');
    this.logoBox.classList.remove('on');
    this.pageTimers.forEach(clearTimeout);
    this.pageTimers = [];
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
