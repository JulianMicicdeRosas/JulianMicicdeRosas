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
import { processLogo, paginate, composeLogos, LogoStage } from './logos.js';

export const DEFAULT_SETTINGS = {
  artists: [{ name: 'Nombre del artista 1' }, { name: 'Nombre del artista 2' }, { name: 'Nombre del artista 3' }],
  // Loop hasta que empieza la noche (categorías de flatfestival.org): organizadores → socio cultural (más
  // tiempo) → patrocinadores → acompañan → embajadas → media partner → UMBRAL. Carpeta vacía = se salta.
  // Las carpetas se leen de Documentos/Umbral/logos/… (fuera del programa: no se pierden al actualizar).
  loop: [
    // FLAT es el centro del evento: abre el loop. Si falta el PNG (logos/flat), se escribe «FLAT».
    { tipo: 'logos', carpeta: 'logos/flat', imagenes: [], render: 'imagen', duracion: 10, por_pagina: 1, de_a_uno: true, monocromo: true, letras: '', alt: 'FLAT', fondo: true },
    { tipo: 'logos', carpeta: 'logos/organizadores', imagenes: [], render: 'imagen', duracion: 8, por_pagina: 6, de_a_uno: false, monocromo: true, letras: '', alt: 'ORGANIZAN' },
    { tipo: 'logos', carpeta: 'logos/socio-cultural', imagenes: [], render: 'imagen', duracion: 16, por_pagina: 6, de_a_uno: false, monocromo: true, letras: '', alt: 'SOCIO CULTURAL' },
    { tipo: 'logos', carpeta: 'logos/patrocinadores', imagenes: [], render: 'imagen', duracion: 8, por_pagina: 8, de_a_uno: false, monocromo: true, letras: '', alt: 'PATROCINAN' },
    { tipo: 'logos', carpeta: 'logos/acompanan', imagenes: [], render: 'imagen', duracion: 8, por_pagina: 10, de_a_uno: false, monocromo: true, letras: '', alt: 'ACOMPAÑAN' },
    { tipo: 'logos', carpeta: 'logos/embajadas', imagenes: [], render: 'imagen', duracion: 8, por_pagina: 8, de_a_uno: false, monocromo: true, letras: '', alt: 'EMBAJADAS' },
    { tipo: 'logos', carpeta: 'logos/media-partner', imagenes: [], render: 'imagen', duracion: 6, por_pagina: 6, de_a_uno: false, monocromo: true, letras: '', alt: 'MEDIA PARTNER' },
    { tipo: 'texto', contenido: 'UMBRAL', render: 'letras', duracion: 12, letras: 'UMBRAL' },
  ],
  prompt_estetica: '',
  curaduria: '', // texto curatorial en lenguaje normal (guía principal del director de arte)
  imagenes: 'grilla', // 'grilla' = el LLM devuelve la figura como texto · 'llm' = trazado SVG · 'biblioteca' = curadas
  polaridad: 'alternar', // grilla: positivo | negativo | alternar | llm
  formato: '1822x737', // salida: 'ANCHOxALTO' (cuadro centrado) o 'pantalla'
  prompt_grilla: '', // parte estética del pedido de la grilla ('' = la de fábrica)
  director: 'openai', // openai | ollama | deepseek
  cadencia: { preset: 'estrofa' },
  // estilos de imagen que oscilan; el LLM elige entre los activos (o azar / secuencia)
  estilos: { activos: ['caligrama', 'ascii', 'glitch'], modo: 'llm' },
  glitch_ambiente: 0, // 0..1: glitch ocasional también en los otros estilos
  ascii_filas: 40, // resolución de la grilla ASCII
  // marca FLAT (completar con el manual de marca)
  // Manual de marca FLAT: acento ROSA «Ciclo Umbral» #ff9898, gris #cccccc; Geist Mono + Roboto
  marca: { base: '#FFFFFF', secundario: '#CCCCCC', acento: '#FF9898', fuente: '', fuente_nombre: '', mayusculas: true, global: true },
  // modo T: muro de palabras
  muro: { tipo: 'grilla', filas: 34, mayusculas: true }, // cada cuánto una imagen: verso | estrofa | contemplativa | personalizada
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
    this.stage = new LogoStage(); // logos con transición glitch
  }

  /** Paleta de base: la de la marca si está aplicada a todo. */
  basePalette() {
    const m = this.settings.marca || {};
    return m.global ? { base: m.base, secundario: m.secundario, acento: m.acento, uso_acento: 0.08 } : {};
  }

  setSettings(settings) {
    this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...settings };
    this._addNewLogoGroups();
    this._addFlatStep();
    this._flatLogoCentered();
  }

  /** FLAT: su logo al centro con el muro de palabras alrededor (ya no la palabra escrita). */
  _flatLogoCentered() {
    const loop = this.settings.loop;
    if (!Array.isArray(loop) || this.settings.loop_flat_v4) return;
    for (const s of loop) {
      if (s && s.carpeta === 'logos/flat') {
        s.fondo = true;
        delete s.si_vacia;
      }
    }
    this.settings.loop_flat_v4 = true;
  }

  /** Loops guardados antes de que FLAT tuviera su paso propio: se le agrega al principio. */
  _addFlatStep() {
    const loop = this.settings.loop;
    if (!Array.isArray(loop) || this.settings.loop_flat_v3) return;
    if (!loop.some((s) => s && s.carpeta === 'logos/flat')) loop.unshift(structuredClone(DEFAULT_SETTINGS.loop[0]));
    this.settings.loop_flat_v3 = true;
  }

  /** Un loop guardado con una versión anterior (3 grupos) recibe los grupos nuevos detrás del último. */
  _addNewLogoGroups() {
    const loop = this.settings.loop;
    if (!Array.isArray(loop) || this.settings.loop_grupos_v2) return;
    const has = (c) => loop.some((s) => s && s.carpeta === c);
    if (has('logos/organizadores') || has('logos/patrocinadores')) {
      const extra = DEFAULT_SETTINGS.loop.filter((s) => s.tipo === 'logos' && !has(s.carpeta));
      let at = loop.reduce((i, s, k) => (s && s.tipo === 'logos' ? k + 1 : i), 0);
      for (const s of extra) loop.splice(at++, 0, structuredClone(s));
    }
    this.settings.loop_grupos_v2 = true;
  }

  get artists() {
    return (this.settings.artists || []).filter((a) => a && a.name && a.name.trim());
  }

  label() {
    if (this.state === 'loop') return 'loop';
    if (this.state === 'title') return 'título (T para comenzar)';
    if (this.state === 'artist') return `artista ${this.artistIdx + 1}`;
    return `${this.mode} · ${this.recording ? 'grabando' : 'detenido'}`;
  }

  /** S: graba / deja de grabar (en el nombre del artista no empieza sola). */
  toggleRecord() {
    if (this.recording) this.stop();
    else this.start(this.state === 'perform' ? this.mode : 'poema');
  }

  /** Detener la grabación (tecla S o P): la composición queda en pantalla; S reanuda. */
  stop() {
    if (!this.recording) return;
    this._setRecording(false);
    this.field.cursorEnabled = false;
    this.field.setSpeaking(false);
    this.notify('detenido');
  }

  // ── loop ─────────────────────────────────────────────────────────────────
  goLoop(fromIndex = -1) {
    this._setRecording(false);
    clearTimeout(this.loopTimer);
    const f = this.field;
    f.clearScene();
    f.resetCorpus(this._loopCorpus());
    f.cursorEnabled = false;
    f.setSceneDensity(0.06);
    f.setPalette(this.basePalette());
    f.setPhysics({ modo: 'lluvia_text_rain', intensidad: 0.3, velocidad: 0.35, turbulencia: 0.15, densidad: 0.4 });
    this.state = 'loop';
    this.loopIndex = fromIndex;
    this.notify('LOOP');
    this._nextLoop();
  }

  /** Texto del telón antes de la lectura: títulos del loop + FLAT + la curaduría (no los nombres de las categorías). */
  _loopCorpus() {
    const words = (this.settings.loop || []).filter((s) => s.tipo === 'texto').map((s) => s.letras || s.contenido || '');
    words.push('FLAT');
    const cur = String(this.settings.curaduria || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (cur) words.push(cur);
    return words.filter(Boolean).join('  ') || 'UMBRAL';
  }

  _loopSteps() {
    return (this.settings.loop || []).filter((s) => s && (s.contenido || s.tipo === 'logos'));
  }

  /**
   * Flecha derecha: avanza al paso siguiente del loop; desde el último paso pasa al título UMBRAL
   * (que queda fijo hasta T). Flecha izquierda: paso anterior.
   */
  step(dir = 1) {
    if (this.state === 'title' && dir < 0) {
      this.goLoop(this._loopSteps().length - 2);
      return;
    }
    if (this.state !== 'loop') {
      if (this.state !== 'title') this.goLoop();
      return;
    }
    const n = this._loopSteps().length;
    if (dir > 0 && this.loopIndex >= n - 1) {
      const cur = this._loopSteps()[this.loopIndex];
      if (cur && cur.tipo === 'texto') this._holdTitle(cur.contenido || 'UMBRAL');
      else this.goTitle();
      return;
    }
    this.loopIndex = dir > 0 ? this.loopIndex : Math.max(-1, this.loopIndex - 2);
    this._nextLoop();
  }

  async _nextLoop() {
    clearTimeout(this.loopTimer);
    if (this.state !== 'loop') return;
    const steps = this._loopSteps();
    if (!steps.length) return;
    this.loopIndex = (this.loopIndex + 1) % steps.length;
    const step = steps[this.loopIndex];
    const token = ++this.loopToken;
    let secs = Math.min(600, Math.max(2, +step.duracion || 10));
    try {
      const custom = await this._playStep(step, token);
      if (custom === -1) {
        // carpeta vacía: saltar sin dejar la pared en negro (si todo está vacío, esperar un poco)
        this.emptySkips = (this.emptySkips || 0) + 1;
        secs = this.emptySkips >= steps.length ? 4 : 0.05;
      } else {
        this.emptySkips = 0;
        if (Number.isFinite(custom) && custom > 0) secs = custom; // p. ej. varias páginas de logos
      }
    } catch (e) {
      console.warn('[loop]', e);
    }
    if (token !== this.loopToken || this.state !== 'loop') return;
    this.loopTimer = setTimeout(() => this._nextLoop(), secs * 1000);
  }

  async _playStep(step, token) {
    const f = this.field;
    this._hideImage(step.tipo === 'logos'); // entre grupos de logos: glitch de logo a logo, sin pasar por negro
    f.clearTitle();
    if (step.tipo === 'logos') {
      f.setBackdrop(!!step.fondo); // fondo: el muro de palabras rodea al logo
      f.setBackdropHoles([]);
      const total = await this._playLogos(step, token);
      if (total === null && step.si_vacia === 'texto' && token === this.loopToken) {
        this.stage.hide();
        f.releaseFigure(true);
        f.setBackdrop(true);
        f.showTitle(step.alt || 'FLAT', { maxSize: 0.2 });
        return;
      }
      return total === null ? -1 : total; // -1: carpeta vacía → saltar
    }
    this.stage.hide();
    f.setBackdrop(true);
    f.setBackdropHoles([]);
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
    // de a uno: cada logo es su propia «página»; si no, grilla adaptativa paginada
    const pages = step.de_a_uno ? logos.map((l) => [l]) : paginate(logos, +step.por_pagina || 8);
    const per = Math.min(600, Math.max(2, +step.duracion || 8));
    pages.forEach((page, p) => {
      const t = setTimeout(() => token === this.loopToken && this._showLogoPage(page, step), p * per * 1000);
      this.pageTimers.push(t);
    });
    return per * pages.length;
  }

  _showLogoPage(page, step) {
    const f = this.field;
    if (step.render === 'letras') {
      this.stage.hide();
      const fig = sampleImage(composeLogos(page), { interiorTarget: this.interiorTarget });
      if (fig) {
        f.formFigure(fig, { modo_visual: 'concreto', relleno: 'volumen', tipografia: 'mono', verso: step.letras || step.alt || 'LOGOS', permanente: true, figura: 'logos' });
        return;
      }
    }
    f.releaseFigure(true);
    if (step.fondo && page.length) {
      // logo chico al centro y un hueco negro en el muro a su medida (con aire alrededor)
      const area = { w: 0.42, h: 0.4 };
      const a = page[0].width / page[0].height;
      const w = Math.min(f.W * area.w, f.H * area.h * a), h = w / a;
      const pad = f.H * 0.05;
      f.setBackdropHoles([{ x0: -w / 2 - pad, x1: w / 2 + pad, y0: -h / 2 - pad, y1: h / 2 + pad }]);
      this.stage.show(page, { area });
      return;
    }
    this.stage.show(page); // glitch entre el logo anterior y éste
  }

  _showImage(src) {
    this.overlayImg.src = src;
    this.overlay.classList.add('on');
  }

  _hideImage(keepStage = false) {
    this.overlay.classList.remove('on');
    if (!keepStage) this.stage.hide();
    this.pageTimers.forEach(clearTimeout);
    this.pageTimers = [];
  }

  // ── título ───────────────────────────────────────────────────────────────
  /** UMBRAL fijo, calado en el telón de palabras, hasta que se aprieta T. */
  /** La placa UMBRAL del loop queda fija como título (sin una segunda placa igual) hasta T. */
  _holdTitle(name) {
    clearTimeout(this.loopTimer);
    this.loopToken++;
    for (const t of this.pageTimers) clearTimeout(t);
    this.pageTimers = [];
    this.state = 'title';
    this.notify(`${name} — T para comenzar`);
  }

  goTitle() {
    this._setRecording(false);
    clearTimeout(this.loopTimer);
    this.loopToken++;
    this._hideImage();
    const f = this.field;
    f.clearScene();
    const txt = this._loopSteps().find((s) => s.tipo === 'texto');
    const name = (txt && txt.contenido) || 'UMBRAL';
    f.resetCorpus(this._loopCorpus());
    f.cursorEnabled = false;
    f.setSceneDensity(0.06);
    f.setPalette(this.basePalette());
    f.setPhysics({ modo: 'lluvia_text_rain', intensidad: 0.3, velocidad: 0.35, turbulencia: 0.15, densidad: 0.4 });
    f.setBackdrop(true);
    f.showTitle(name);
    this.state = 'title';
    this.notify(`${name} — T para comenzar`);
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
    f.setSceneDensity(0.06);
    f.setPalette(this.basePalette());
    f.setPhysics({ modo: 'lluvia_text_rain', intensidad: 0.3, velocidad: 0.35, turbulencia: 0.15, densidad: 0.4 });
    f.setBackdrop(true);
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
    f.setBackdropHoles([]); // el hueco del logo (paso FLAT) no sigue en la performance
    if (this.state !== 'perform') {
      // desde el loop o el nombre: el título se disuelve y su nombre queda en el corpus
      f.releaseFigure(true);
      f.clearTitle();
    }
    if (mode === 'palabras') {
      f.releaseFigure(true);
      f.setBackdrop(true); // lo dicho se escribe en el muro; las ilustraciones se calan en él
      f.wordsToBackdrop = true;
      f.cursorEnabled = false;
      f.setSceneDensity(0.05);
      f.setPhysics({ modo: 'lluvia_text_rain', intensidad: 0.25, velocidad: 0.3, turbulencia: 0.1, densidad: 0.4 });
    } else {
      f.clearWords();
      f.setBackdrop(true);
      f.wordsToBackdrop = false;
      f.cursorEnabled = true;
      f.setSceneDensity(0.18);
      f.setPhysics({ modo: 'lluvia_text_rain', intensidad: 0.5, velocidad: 0.45, turbulencia: 0.2, densidad: 0.6 });
    }
    this.state = 'perform';
    this.mode = mode;
    this._setRecording(true);
    this.notify(`● GRABANDO · ${mode === 'palabras' ? 'palabras' : 'poema'}`);
  }

  /** T: modo palabras grabando (desde el título o en cualquier momento). */
  startWords() {
    if (this.state === 'perform' && this.mode === 'palabras' && this.recording) return;
    this.start('palabras');
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
