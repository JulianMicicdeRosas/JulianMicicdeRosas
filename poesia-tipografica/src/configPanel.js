// ─────────────────────────────────────────────────────────────────────────────
//  configPanel.js — Panel de operador (tecla C).
//  Atajos · micrófono con vúmetro · artistas numerados · loop · prompt estético.
//  Se guarda solo (en el backend → settings.local.json, y en este navegador).
// ─────────────────────────────────────────────────────────────────────────────

const SHORTCUTS = [
  ['C', 'abrir / cerrar este panel'],
  ['1 … 9, 0', 'ir al nombre del artista (0 = artista 10). Otra vez: reinicia el nombre'],
  ['S', 'comenzar a grabar: el poema dibuja con sus letras'],
  ['T', 'modo palabras: todo lo dicho, disperso y sutil (otra vez T: vuelve a poema)'],
  ['L', 'volver al loop (deja de grabar)'],
  ['F', 'pantalla completa'],
  ['D', 'panel técnico / simulación sin micrófono'],
];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class ConfigPanel {
  constructor({ getSettings, onChange, onDevice, requestDevices, defaultPrompt }) {
    this.getSettings = getSettings;
    this.onChange = onChange;
    this.onDevice = onDevice;
    this.requestDevices = requestDevices;
    this.defaultPrompt = defaultPrompt || '';
    this.devices = [];
    this.currentDevice = '';
    this.peak = 0;
    this.lastAudio = 0;
    this.backend = false;

    const el = document.createElement('div');
    el.id = 'config';
    el.innerHTML = `
      <header><h1>Umbral · operación</h1><span class="saved" data-saved></span><button data-act="close">Cerrar (C)</button></header>
      <section>
        <h2>Atajos</h2>
        <dl class="keys">${SHORTCUTS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        <div class="state">Estado: <b data-state>—</b></div>
      </section>
      <section>
        <h2>Micrófono</h2>
        <div class="row">
          <select data-device><option value="">(dispositivo por defecto de Windows)</option></select>
          <button data-act="devices">Actualizar lista</button>
        </div>
        <div class="vu"><i data-vu></i><b data-peak></b></div>
        <div class="vu-info"><span data-db>—</span><span data-signal>—</span></div>
        <p class="hint">Habla al micrófono: la barra debe moverse. Verde = señal, rojo = saturación. El micrófono lo abre el
        backend (server.py); si aparece «backend desconectado», arráncalo.</p>
      </section>
      <section>
        <h2>Artistas (orden = número de tecla)</h2>
        <div data-artists></div>
        <button data-act="add-artist">+ Agregar artista</button>
      </section>
      <section>
        <h2>Loop</h2>
        <p class="hint">Cada paso: texto (p. ej. UMBRAL) o imagen (ruta dentro de <code>public/</code>, p. ej.
        <code>loop/flat.png</code>, o subir archivo). «letras» = la figura se forma con letras; «imagen» = se muestra tal cual;
        «título» = texto compuesto en tipografía.</p>
        <div data-loop></div>
        <button data-act="add-step">+ Agregar paso</button>
      </section>
      <section>
        <h2>Prompt estético del director de arte</h2>
        <p class="hint">Cómo debe interpretar los versos (figuras, físicas, paleta). El formato técnico de la respuesta se
        agrega solo y no hace falta escribirlo. Se aplica al siguiente verso.</p>
        <textarea data-prompt spellcheck="false" rows="10"></textarea>
        <div class="row"><button data-act="reset-prompt">Restaurar por defecto</button></div>
      </section>
      <section>
        <h2>Estética de las figuras</h2>
        <label><input type="checkbox" data-opt="pointcloud"> Nube de puntos (estilo pointcloud de TouchDesigner)</label>
        <div class="slider"><span>Profundidad</span><input type="range" min="0" max="1" step="0.01" data-opt="profundidad"><output></output></div>
        <div class="slider"><span>Intensidad de la nube</span><input type="range" min="0" max="1.5" step="0.01" data-opt="nube"><output></output></div>
        <div class="slider"><span>Órbita de cámara</span><input type="range" min="0" max="1" step="0.01" data-opt="orbita"><output></output></div>
        <p class="hint">Se aplica a la próxima figura (la profundidad) o al instante (intensidad, órbita).</p>
      </section>
      <section>
        <h2>Opciones</h2>
        <label><input type="checkbox" data-avisos> Mostrar avisos de operador en pantalla (2 s, discretos)</label>
      </section>
    `;
    document.body.appendChild(el);
    this.el = el;
    this.$ = (sel) => el.querySelector(sel);
    this.fileInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });

    el.addEventListener('click', (ev) => this._click(ev));
    el.addEventListener('input', (ev) => this._input(ev));
    el.addEventListener('change', (ev) => this._input(ev));
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  toggle(force) {
    const open = force ?? !this.isOpen;
    this.el.classList.toggle('open', open);
    if (open) {
      this.render();
      this.requestDevices();
    } else if (document.activeElement && this.el.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  // ── render ───────────────────────────────────────────────────────────────
  render() {
    const s = this.getSettings();
    const artists = s.artists || [];
    this.$('[data-artists]').innerHTML = artists
      .map(
        (a, i) => `<div class="item" data-i="${i}">
          <span class="num">${i < 9 ? i + 1 : i === 9 ? 0 : '–'}</span>
          <input data-field="artist" value="${esc(a.name)}" placeholder="Nombre del artista">
          <button data-act="up" title="subir">↑</button><button data-act="down" title="bajar">↓</button>
          <button data-act="del" title="quitar">✕</button></div>`,
      )
      .join('');
    const loop = s.loop || [];
    this.$('[data-loop]').innerHTML = loop
      .map((st, i) => {
        const isData = String(st.contenido || '').startsWith('data:');
        return `<div class="item step" data-i="${i}">
          <span class="num">${i + 1}</span>
          <select data-field="tipo"><option value="texto"${st.tipo === 'texto' ? ' selected' : ''}>texto</option><option value="imagen"${st.tipo === 'imagen' ? ' selected' : ''}>imagen</option></select>
          <input data-field="contenido" value="${isData ? '(archivo subido)' : esc(st.contenido)}" ${isData ? 'readonly' : ''} placeholder="${st.tipo === 'imagen' ? 'loop/logo.png' : 'UMBRAL'}">
          ${st.tipo === 'imagen' ? '<button data-act="upload">Subir…</button>' : ''}
          <select data-field="render">
            <option value="letras"${st.render === 'letras' ? ' selected' : ''}>letras</option>
            ${st.tipo === 'imagen' ? `<option value="imagen"${st.render === 'imagen' ? ' selected' : ''}>imagen</option>` : `<option value="titulo"${st.render === 'titulo' ? ' selected' : ''}>título</option>`}
          </select>
          <input data-field="duracion" type="number" min="2" max="600" value="${+st.duracion || 10}" title="segundos"><span class="unit">s</span>
          <input data-field="letras" value="${esc(st.letras)}" placeholder="texto de las letras" title="con qué texto se forman las letras">
          <button data-act="up">↑</button><button data-act="down">↓</button><button data-act="del">✕</button></div>`;
      })
      .join('');
    const prompt = this.$('[data-prompt]');
    if (document.activeElement !== prompt) prompt.value = s.prompt_estetica || this.defaultPrompt;
    this.$('[data-avisos]').checked = s.avisos !== false;
    for (const el of this.el.querySelectorAll('[data-opt]')) {
      const k = el.dataset.opt;
      if (el.type === 'checkbox') el.checked = s[k] !== false;
      else {
        el.value = s[k];
        el.nextElementSibling.textContent = (+s[k]).toFixed(2);
      }
    }
    this._renderDevices();
  }

  _renderDevices() {
    const sel = this.$('[data-device]');
    const opts = ['<option value="">(dispositivo por defecto de Windows)</option>'].concat(
      this.devices.map((d) => `<option value="${d.index}">[${d.index}] ${esc(d.name)} — ${esc(d.hostapi)}${d.default ? ' ★' : ''}</option>`),
    );
    sel.innerHTML = opts.join('');
    sel.value = String(this.currentDevice ?? '');
    if (sel.value !== String(this.currentDevice ?? '') && this.currentDevice) {
      // configurado por nombre en .env: mostrarlo igual
      sel.insertAdjacentHTML('beforeend', `<option value="${esc(this.currentDevice)}">${esc(this.currentDevice)}</option>`);
      sel.value = this.currentDevice;
    }
  }

  setDevices(devices, current) {
    this.devices = devices || [];
    this.currentDevice = current ?? '';
    if (this.isOpen) this._renderDevices();
  }

  setDefaultPrompt(p) {
    this.defaultPrompt = p || this.defaultPrompt;
    if (this.isOpen) this.render();
  }

  setState(text) {
    this.$('[data-state]').textContent = text;
  }

  setBackend(on) {
    this.backend = on;
  }

  /** Vúmetro: nivel instantáneo (0..1), dB y retención de pico. */
  setLevel(level, db) {
    this.lastAudio = performance.now();
    this.peak = Math.max(level, this.peak * 0.97);
    if (!this.isOpen) return;
    const bar = this.$('[data-vu]');
    bar.style.width = `${Math.round(Math.min(1, level) * 100)}%`;
    bar.className = level > 0.95 ? 'hot' : level > 0.08 ? 'ok' : '';
    this.$('[data-peak]').style.left = `${Math.round(Math.min(1, this.peak) * 100)}%`;
    this.$('[data-db]').textContent = Number.isFinite(db) ? `${db.toFixed(1)} dBFS` : '—';
    const sig = this.$('[data-signal]');
    sig.textContent = level > 0.95 ? 'saturando: baja la ganancia' : this.peak > 0.08 ? 'señal OK' : 'silencio / sin señal';
    sig.className = level > 0.95 ? 'bad' : this.peak > 0.08 ? 'ok' : '';
  }

  /** Llamar periódicamente: detecta micrófono muerto o backend caído. */
  tick() {
    if (!this.isOpen) return;
    if (!this.backend) {
      this.$('[data-signal]').textContent = 'backend desconectado';
      this.$('[data-signal]').className = 'bad';
      this.$('[data-vu]').style.width = '0%';
    } else if (performance.now() - this.lastAudio > 1200) {
      this.$('[data-signal]').textContent = 'el micrófono no entrega audio';
      this.$('[data-signal]').className = 'bad';
      this.$('[data-vu]').style.width = '0%';
    }
  }

  flashSaved() {
    const s = this.$('[data-saved]');
    s.textContent = 'guardado ✓';
    clearTimeout(this._savedT);
    this._savedT = setTimeout(() => (s.textContent = ''), 1500);
  }

  // ── edición ──────────────────────────────────────────────────────────────
  _commit(mutator, rerender = true) {
    const s = structuredClone(this.getSettings());
    mutator(s);
    this.onChange(s);
    if (rerender) this.render();
    this.flashSaved();
  }

  _click(ev) {
    const act = ev.target?.dataset?.act;
    if (!act) return;
    const item = ev.target.closest('.item');
    const i = item ? +item.dataset.i : -1;
    const list = item?.parentElement?.matches('[data-artists]') ? 'artists' : 'loop';
    const move = (arr, d) => {
      const j = i + d;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    };
    if (act === 'close') this.toggle(false);
    else if (act === 'devices') this.requestDevices();
    else if (act === 'add-artist') this._commit((s) => (s.artists = [...(s.artists || []), { name: '' }]));
    else if (act === 'add-step') this._commit((s) => (s.loop = [...(s.loop || []), { tipo: 'texto', contenido: '', render: 'letras', duracion: 10, letras: '' }]));
    else if (act === 'up') this._commit((s) => move(s[list], -1));
    else if (act === 'down') this._commit((s) => move(s[list], +1));
    else if (act === 'del') this._commit((s) => s[list].splice(i, 1));
    else if (act === 'reset-prompt') this._commit((s) => (s.prompt_estetica = ''));
    else if (act === 'upload') {
      this.fileInput.value = '';
      this.fileInput.onchange = () => {
        const file = this.fileInput.files?.[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = () => this._commit((s) => (s.loop[i].contenido = r.result));
        r.readAsDataURL(file);
      };
      this.fileInput.click();
    }
  }

  _input(ev) {
    const t = ev.target;
    if (t.matches('[data-device]')) {
      if (ev.type === 'change') {
        this.currentDevice = t.value;
        this.peak = 0;
        this.onDevice(t.value);
        this.flashSaved();
      }
      return;
    }
    if (t.matches('[data-prompt]')) {
      clearTimeout(this._promptT);
      this._promptT = setTimeout(() => {
        const v = t.value.trim();
        this._commit((s) => (s.prompt_estetica = v === this.defaultPrompt.trim() ? '' : v), false);
      }, 500);
      return;
    }
    if (t.dataset.opt) {
      const k = t.dataset.opt;
      if (t.type !== 'checkbox') t.nextElementSibling.textContent = (+t.value).toFixed(2);
      this._commit((s) => (s[k] = t.type === 'checkbox' ? t.checked : +t.value), false);
      return;
    }
    if (t.matches('[data-avisos]')) {
      this._commit((s) => (s.avisos = t.checked), false);
      return;
    }
    const field = t.dataset.field;
    const item = t.closest('.item');
    if (!field || !item) return;
    const i = +item.dataset.i;
    if (field === 'artist') {
      this._commit((s) => (s.artists[i].name = t.value), false);
      return;
    }
    if (ev.type === 'input' && (field === 'tipo' || field === 'render')) return; // los select llegan por change
    const rerender = field === 'tipo';
    this._commit((s) => {
      const st = s.loop[i];
      if (field === 'duracion') st.duracion = Math.max(2, +t.value || 10);
      else if (field === 'contenido' && t.readOnly) return;
      else st[field] = t.value;
      if (field === 'tipo') st.render = 'letras';
    }, rerender);
  }
}
