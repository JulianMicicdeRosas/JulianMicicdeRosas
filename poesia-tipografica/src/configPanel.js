// ─────────────────────────────────────────────────────────────────────────────
//  configPanel.js — Panel de operador (tecla C).
//  Atajos · micrófono con vúmetro · artistas numerados · loop · prompt estético.
//  Se guarda solo (en el backend → settings.local.json, y en este navegador).
// ─────────────────────────────────────────────────────────────────────────────

const SHORTCUTS = [
  ['C', 'abrir / cerrar este panel'],
  ['→ / ←', 'loop: alterna FLAT ↔ UMBRAL (desde otro paso vuelve a FLAT). Los logos pasan solos en el loop automático'],
  ['T', 'desde el título (o cuando sea): empieza a grabar en modo palabras, hasta elegir artista'],
  ['1 … 9, 0', 'nombre del artista (0 = artista 10; el 5 no: es el cierre): deja de grabar y espera la S'],
  ['5', 'cierre: todo se desarma y queda el logo de FLAT, que cada 4 s se rompe con glitch y se vuelve a armar'],
  ['S', 'grabar / dejar de grabar (el poema dibuja; lo dibujado queda en pantalla)'],
  ['P', 'detener la grabación (igual que S cuando está grabando)'],
  ['L', 'volver al loop (deja de grabar)'],
  ['F', 'pantalla completa'],
  ['D', 'panel técnico / simulación sin micrófono'],
];

export const CADENCE_PRESETS = {
  verso: { min_s: 0, palabras: 1, pausa_s: 0, max_s: 0 },
  estrofa: { min_s: 14, palabras: 10, pausa_s: 1.8, max_s: 45 },
  contemplativa: { min_s: 25, palabras: 20, pausa_s: 2.5, max_s: 70 },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class ConfigPanel {
  constructor({ getSettings, onChange, onDevice, onChannel, onShowPrompt, requestDevices, onScanLogos, onSaveKey, onRecord, onStop, onPreviewStyle, defaultPrompt }) {
    this.onPreviewStyle = onPreviewStyle;
    this.onOpenFolder = arguments[0].onOpenFolder;
    this.onTestGrid = arguments[0].onTestGrid;
    this.onRecord = onRecord;
    this.onStop = onStop;
    this.onSaveKey = onSaveKey;
    this.onScanLogos = onScanLogos;
    this.getSettings = getSettings;
    this.onChange = onChange;
    this.onDevice = onDevice;
    this.onChannel = onChannel;
    this.onShowPrompt = onShowPrompt;
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
        <div class="row rec">
          <button data-act="record" class="rec-on">● Grabar (S)</button>
          <button data-act="stop" class="rec-off">■ Detener (P)</button>
        </div>
      </section>
      <section>
        <h2>Curaduría</h2>
        <p class="hint">Escribe con tus palabras de qué trata la muestra, qué buscas que se vea y qué no. El director de
        arte lo lee antes de cada verso y lo toma como guía principal. Se aplica al siguiente verso.</p>
        <textarea data-curaduria rows="7" spellcheck="true" placeholder="Ej.: Umbral es una muestra sobre lo que pasa en el borde entre decir y callar. Me interesa que las imágenes sean frágiles, a medio formar, como si la voz las sostuviera. Nada literal ni decorativo; preferir el cuerpo, la casa y el agua. Que el silencio también ocupe lugar."></textarea>
      </section>
      <section>
        <h2>Imágenes</h2>
        <label><input type="radio" name="imagenes" value="grilla" data-sopt="imagenes"> Grilla de texto: el LLM devuelve la figura como texto y se compone con las palabras dichas</label><br>
        <label><input type="radio" name="imagenes" value="llm" data-sopt="imagenes"> Caligrama: el LLM dibuja un trazado y las letras lo recorren</label><br>
        <label><input type="radio" name="imagenes" value="biblioteca" data-sopt="imagenes"> Curadas: biblioteca de 20 figuras (más rápido)</label>
        <div class="row">
          <span>Director de arte:</span>
          <select data-sopt="director">
            <option value="openai">OpenAI (rápido, misma clave)</option>
            <option value="ollama">Ollama (local, sin internet)</option>
            <option value="deepseek">DeepSeek (requiere su clave)</option>
          </select>
        </div>
        <div class="vu-info"><span>Última imagen</span><span data-last>—</span></div>
        <h2>Estilos de imagen (oscilan entre los activos)</h2>
        <div class="styles">
          <label><input type="checkbox" data-style="caligrama"> Caligrama + nube de puntos</label>
          <button data-act="preview" data-style-preview="caligrama">ver</button>
          <label><input type="checkbox" data-style="ascii"> ASCII de densidad (grilla mono)</label>
          <button data-act="preview" data-style-preview="ascii">ver</button>
          <label><input type="checkbox" data-style="glitch"> Glitch azaroso</label>
          <button data-act="preview" data-style-preview="glitch">ver</button>
          <label><input type="checkbox" data-style="marca"> Manual de marca FLAT</label>
          <button data-act="preview" data-style-preview="marca">ver</button>
        </div>
        <div class="row">
          <span>Quién elige el estilo:</span>
          <select data-estmodo>
            <option value="llm">el LLM, según la estrofa y la curaduría</option>
            <option value="azar">azar</option>
            <option value="secuencia">secuencia</option>
          </select>
        </div>
        <div class="slider"><span>Glitch ambiente</span><input type="range" min="0" max="1" step="0.01" data-opt="glitch_ambiente"><output></output></div>
        <div class="slider"><span>Filas del ASCII</span><input type="range" min="24" max="100" step="1" data-opt="ascii_filas"><output></output></div>
        <h2>Marca FLAT</h2>
        <div class="row brand">
          <label>base <input type="color" data-marca="base"></label>
          <label>secundario <input type="color" data-marca="secundario"></label>
          <label>acento <input type="color" data-marca="acento"></label>
          <label><input type="checkbox" data-marca="mayusculas"> MAYÚSCULAS</label>
        </div>
        <label><input type="checkbox" data-marca="global"> Aplicar la marca a todo (subtítulos, nombres, muro, figuras, colores)</label>
        <div class="row">
          <button data-act="brand-font">Cargar tipografía de marca…</button>
          <span class="unit" data-brand-font>—</span>
        </div>
        <div class="swatches" title="colores del manual FLAT: clic = acento">
          ${[['#ff9898', 'Ciclo Umbral'], ['#9999ff', 'Ciclo Refracción'], ['#3333cb', 'Cinema Liminal'], ['#cccccc', 'Talleres y charlas'], ['#9900cc', 'Espacio Inmersivo'], ['#30d618', 'Blockchain'], ['#0074ff', 'Hackatón'], ['#ccff00', 'Conexión Sonora'], ['#e6005c', 'Exposición'], ['#8ecddd', 'Órbita Performer']]
            .map(([c, n]) => `<button data-act="swatch" data-color="${c}" title="${n} ${c}" style="background:${c}"></button>`).join('')}
        </div>
        <p class="hint">Manual de marca FLAT: Geist Mono (títulos, nombres, muro, figuras) y Roboto (texto). Acento por
        defecto: rosa «Ciclo Umbral». Clic en un color = acento.</p>
        <h2>Cadencia: cada cuánto una imagen nueva</h2>
        <div class="row">
          <select data-cad="preset">
            <option value="estrofa">Por estrofa (recomendado)</option>
            <option value="verso">Cada verso</option>
            <option value="contemplativa">Contemplativa</option>
            <option value="personalizada">Personalizada</option>
          </select>
        </div>
        <div class="cad">
          <label>mínimo entre imágenes <input data-cad="min_s" type="number" min="0" max="300" step="1"> s</label>
          <label>palabras para una imagen <input data-cad="palabras" type="number" min="1" max="200" step="1"></label>
          <label>pausa que cierra la estrofa <input data-cad="pausa_s" type="number" min="0" max="15" step="0.1"> s</label>
          <label>tope sin imagen <input data-cad="max_s" type="number" min="0" max="600" step="1"> s (0 = sin tope)</label>
        </div>
        <div class="vu-info"><span>Próxima imagen</span><span data-cadence>—</span></div>
        <p class="hint">Se juntan los versos hasta reunir esas palabras y una pausa de cierre; el LLM recibe la estrofa
        entera y hace una sola imagen. Nunca antes del mínimo entre imágenes; si se lee de corrido, la fuerza el tope
        (o el triple de palabras). Entre imágenes las letras siguen vivas con la física.</p>
        <p class="hint">Si las imágenes en vivo tardan demasiado (más de ~6 s), prueba OpenAI como director o pasa a «Curadas».
        Si el director falla, se usa el siguiente disponible y, al final, la biblioteca.</p>
      </section>
      <section>
        <h2>Muro de palabras (modo T)</h2>
        <div class="row">
          <select data-muro="tipo">
            <option value="grilla">Muro en grilla (monoespaciado, tamaños por módulo)</option>
            <option value="disperso">Palabras dispersas</option>
          </select>
          <label class="unit"><input type="checkbox" data-muro="mayusculas"> MAYÚSCULAS</label>
        </div>
        <div class="slider"><span>Filas del muro</span><input type="range" min="16" max="70" step="1" data-muro="filas"><output></output></div>
        <p class="hint">Cada palabra dicha ocupa 1, 2 o 3 módulos de alto (las palabras clave y las dichas con más voz,
        más grandes), siempre alineada a la grilla. Llena la pared en orden de lectura; al completarla reescribe desde arriba.</p>
      </section>
      <section>
        <h2>Clave de OpenAI</h2>
        <div class="row">
          <input data-key type="password" placeholder="pega acá tu clave (sk-…)" autocomplete="off" spellcheck="false">
          <button data-act="save-key">Guardar clave</button>
        </div>
        <div class="vu-info"><span data-key-status>—</span></div>
        <p class="hint">Se guarda en el Llavero de la Mac (fuera de la carpeta del proyecto): actualizar o volver a
        descargar no la borra. Al guardarla, la transcripción se reconecta sola.</p>
      </section>
      <section>
        <h2>Micrófono</h2>
        <div class="row">
          <select data-device><option value="">(micrófono por defecto del sistema)</option></select>
          <button data-act="devices">Actualizar lista</button>
        </div>
        <div class="row">
          <span>Entrada de la placa:</span>
          <select data-channel><option value="1">1</option></select>
          <span class="hint" data-channel-hint></span>
        </div>
        <div class="vu"><i data-vu></i><b data-peak></b></div>
        <div class="vu-info"><span data-db>—</span><span data-signal>—</span></div>
        <div class="vu-info"><span>Transcripción (OpenAI)</span><span data-openai>—</span></div>
        <p class="hint" data-recinfo>Grabación de la sesión: —</p>
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
        <div class="row">
          <button data-act="open-logos">Abrir carpeta de logos</button>
          <span class="unit" data-userdir>Documentos/Umbral/logos</span>
        </div>
        <div data-loop></div>
        <button data-act="add-step">+ Agregar paso</button>
      </section>
      <section>
        <h2>Formato de salida</h2>
        <p class="hint">Tamaño del cuadro proyectado. Con un formato fijo la imagen se compone para esa proporción y se
        centra en la ventana (lo que sobra queda negro). Escribe otro como «ancho x alto».</p>
        <div class="row">
          <select data-formato>
            <option value="1822x737">1822 × 737 (FLAT)</option>
            <option value="1920x1080">1920 × 1080</option>
            <option value="pantalla">Pantalla completa</option>
            <option value="otro">Otro…</option>
          </select>
          <input data-formato-otro type="text" placeholder="ancho x alto" style="width:9em">
        </div>
      </section>
      <section>
        <h2>Grilla de texto</h2>
        <p class="hint">La ilustración es texto: el modelo devuelve una grilla de 48×26 («#» figura, «.» fondo) y el muro
        de palabras la compone. <b>Positivo</b>: la figura hecha de palabras sobre negro. <b>Negativo</b>: la figura es
        un hueco negro en el muro. Abajo, la parte estética del pedido (el formato técnico se agrega solo).</p>
        <div class="row">
          <span>Forma:</span>
          <select data-sopt="forma_grilla">
            <option value="llm">Dibujada por el LLM (elegir el formato abajo; recomendado: composición)</option>
            <option value="emoji">Silueta de emoji elegido por el LLM (más literal)</option>
            <option value="letras">Arte ASCII sólo con las letras transcriptas (la imagen es el texto)</option>
          </select>
        </div>
        <div class="row" data-preset-row>
          <span>Formato del dibujo:</span>
          <select data-sopt="grilla_preset"></select>
        </div>
        <p class="hint" data-preset-desc></p>
        <div class="row">
          <span>Tratamiento:</span>
          <select data-sopt="tratamiento">
            <option value="azar">Variado (cambia en cada imagen)</option>
            <option value="topografia">Topografía: curvas de nivel de la forma</option>
            <option value="trama">Trama: semitono granulado</option>
            <option value="erosion">Erosión: la forma se deshace y se dispersa</option>
            <option value="eco">Eco: repeticiones que se desvanecen</option>
            <option value="silueta">Silueta: la forma plena con sus grises</option>
            <option value="llm">Que lo elija el LLM según la estrofa</option>
          </select>
        </div>
        <div class="row">
          <span>Polaridad:</span>
          <select data-sopt="polaridad">
            <option value="alternar">Alternar positivo / negativo</option>
            <option value="positivo">Siempre positivo</option>
            <option value="negativo">Siempre negativo</option>
            <option value="llm">Que la elija el LLM según la estrofa</option>
          </select>
        </div>
        <textarea data-prompt-grilla spellcheck="false" rows="8"></textarea>
        <div class="row"><button data-act="reset-prompt-grilla">Restaurar por defecto</button></div>
        <div class="row">
          <input data-grid-text type="text" placeholder="Texto de prueba (ej.: la luna se moja en el agua quieta del patio)" style="flex:1">
          <button data-act="test-grid">Probar</button>
        </div>
        <pre data-grid-preview class="grid-preview"></pre>
        <div class="row"><button data-act="show-prompt">Ver el prompt exacto que se envía</button></div>
        <pre data-prompt-preview class="grid-preview prompt-preview"></pre>
      </section>
      <section>
        <h2>Reglas visuales (avanzado)</h2>
        <p class="hint">Reglas finas para el director (modos, físicas, paleta). Lo habitual es dejarlas como están y
        escribir arriba, en «Curaduría». El formato técnico se agrega solo.</p>
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
      for (const st of this.getSettings().loop || []) if (st.tipo === 'logos' && st.carpeta) this.onScanLogos?.(st.carpeta);
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
        if (st.tipo === 'logos') return this._logosStep(st, i);
        const isData = String(st.contenido || '').startsWith('data:');
        return `<div class="item step" data-i="${i}">
          <span class="num">${i + 1}</span>
          ${this._tipoSelect(st)}
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
    const cur = this.$('[data-curaduria]');
    if (document.activeElement !== cur) cur.value = s.curaduria || '';
    for (const r of this.el.querySelectorAll('input[data-sopt="imagenes"]')) r.checked = r.value === (s.imagenes || 'grilla');
    this.$('select[data-sopt="polaridad"]').value = s.polaridad || 'alternar';
    const forma = ['emoji', 'llm', 'letras'].includes(s.forma_grilla) ? s.forma_grilla : 'llm';
    this.$('select[data-sopt="tratamiento"]').value = s.tratamiento || 'azar';
    this.$('select[data-sopt="forma_grilla"]').value = forma;
    this._renderPresets(s, forma);
    const fmt = s.formato || '1822x737';
    const fsel = this.$('select[data-formato]');
    fsel.value = [...fsel.options].some((o) => o.value === fmt) ? fmt : 'otro';
    const fo = this.$('[data-formato-otro]');
    if (document.activeElement !== fo) fo.value = fsel.value === 'otro' ? fmt : '';
    fo.style.display = fsel.value === 'otro' ? '' : 'none';
    const pg = this.$('[data-prompt-grilla]');
    if (document.activeElement !== pg) pg.value = s.prompt_grilla || this.defaultPromptGrid || '';
    this.$('select[data-sopt="director"]').value = s.director || 'openai';
    const est = s.estilos || { activos: ['caligrama'], modo: 'llm' };
    for (const el of this.el.querySelectorAll('[data-style]')) el.checked = (est.activos || []).includes(el.dataset.style);
    this.$('[data-estmodo]').value = est.modo || 'llm';
    const marca = s.marca || {};
    for (const el of this.el.querySelectorAll('[data-marca]')) {
      if (el.type === 'checkbox') el.checked = el.dataset.marca === 'global' ? marca.global === true : marca[el.dataset.marca] !== false;
      else el.value = marca[el.dataset.marca] || '#F4F1EA';
    }
    this.$('[data-brand-font]').textContent = marca.fuente_nombre || '(sin cargar: usa la mono)';
    const muro = s.muro || {};
    for (const el of this.el.querySelectorAll('[data-muro]')) {
      const k = el.dataset.muro;
      if (el.type === 'checkbox') el.checked = muro[k] !== false;
      else {
        el.value = muro[k] ?? (k === 'filas' ? 34 : 'grilla');
        if (el.type === 'range') el.nextElementSibling.textContent = el.value;
      }
    }
    const cad = this._cadence(s);
    for (const el of this.el.querySelectorAll('[data-cad]')) {
      if (document.activeElement !== el) el.value = cad[el.dataset.cad];
      if (el.type === 'number') el.disabled = cad.preset !== 'personalizada';
    }
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

  _tipoSelect(st) {
    const opt = (v, label) => `<option value="${v}"${st.tipo === v ? ' selected' : ''}>${label}</option>`;
    return `<select data-field="tipo">${opt('texto', 'texto')}${opt('imagen', 'imagen')}${opt('logos', 'logos')}</select>`;
  }

  /** Paso «logos»: carpeta + subidos; la grilla se adapta a cuántos haya. */
  _logosStep(st, i) {
    const imgs = st.imagenes || [];
    const count = this.logoCounts?.[st.carpeta];
    const thumbs = imgs
      .map((src, k) => `<span class="thumb"><img src="${esc(src)}" alt=""><button data-act="del-logo" data-k="${k}" title="quitar">✕</button></span>`)
      .join('');
    return `<div class="item step logos" data-i="${i}">
      <span class="num">${i + 1}</span>
      ${this._tipoSelect(st)}
      <input data-field="carpeta" value="${esc(st.carpeta)}" placeholder="public/loop/sponsors" title="carpeta (dentro del proyecto) con los logos">
      <button data-act="scan">Revisar carpeta</button>
      <span class="unit">${count === undefined ? '' : `${count} en carpeta`}</span>
      <button data-act="upload-logos">Subir logos…</button>
      <select data-field="render">
        <option value="imagen"${st.render !== 'letras' ? ' selected' : ''}>imagen</option>
        <option value="letras"${st.render === 'letras' ? ' selected' : ''}>letras</option>
      </select>
      <input data-field="duracion" type="number" min="2" max="600" value="${+st.duracion || 8}" title="segundos por página"><span class="unit">s/pág</span>
      <input data-field="por_pagina" type="number" min="1" max="40" value="${+st.por_pagina || 8}" title="logos por página"><span class="unit">por pág.</span>
      <label class="unit"><input type="checkbox" data-field="monocromo"${st.monocromo !== false ? ' checked' : ''}> monocromo</label>
      <button data-act="up">↑</button><button data-act="down">↓</button><button data-act="del">✕</button>
      <div class="thumbs">${thumbs}</div>
    </div>`;
  }

  setLogoCount(carpeta, n) {
    this.logoCounts = { ...(this.logoCounts || {}), [carpeta]: n };
    if (this.isOpen && document.activeElement?.dataset?.field !== 'carpeta') this.render();
  }

  _renderDevices() {
    const sel = this.$('[data-device]');
    const opts = ['<option value="">(micrófono por defecto del sistema)</option>'].concat(
      this.devices.map((d) => `<option value="${d.index}">[${d.index}] ${esc(d.name)} — ${esc(d.hostapi)}${d.default ? ' ★' : ''}${d.virtual ? '  (virtual: NO es un micrófono)' : ''}</option>`),
    );
    sel.innerHTML = opts.join('');
    sel.value = String(this.currentDevice ?? '');
    this._renderChannels();
    if (sel.value !== String(this.currentDevice ?? '') && this.currentDevice) {
      // configurado por nombre en .env: mostrarlo igual
      sel.insertAdjacentHTML('beforeend', `<option value="${esc(this.currentDevice)}">${esc(this.currentDevice)}</option>`);
      sel.value = this.currentDevice;
    }
  }

  /** Placas multicanal (Focusrite 18i20…): elegir en qué entrada está el micrófono. */
  _renderChannels() {
    const csel = this.$('[data-channel]');
    if (!csel) return;
    const d = this.devices.find((x) => String(x.index) === String(this.currentDevice)) || this.devices.find((x) => x.default);
    const n = Math.max(1, Math.min(32, d?.channels || 1));
    const cur = Math.min(n, Math.max(1, +this.currentChannel || 1));
    csel.innerHTML = Array.from({ length: n }, (_, k) => `<option value="${k + 1}">${k + 1}</option>`).join('');
    csel.value = String(cur);
    csel.disabled = n <= 1;
    this.$('[data-channel-hint]').textContent = n > 1 ? `${n} entradas en este dispositivo` : 'una sola entrada';
  }

  setDevices(devices, current, channel) {
    this.devices = devices || [];
    this.currentDevice = current ?? '';
    if (channel) this.currentChannel = channel;
    if (this.isOpen) this._renderDevices();
  }

  /** Resultado de «Probar» en la sección Grilla: muestra la grilla como texto. */
  setGridTest(m) {
    const pre = this.$('[data-grid-preview]');
    if (!pre) return;
    if (m.error) {
      pre.textContent = `Error: ${m.error}`;
      return;
    }
    const d = m.direction || {};
    const u = m.usada;
    const modo = this.getSettings().imagenes || 'grilla';
    const aviso = modo !== 'grilla' ? `\n⚠ «Imágenes» está en «${modo}»: en vivo NO se usa la grilla. Elige «Grilla de texto» arriba.` : '';
    const hint = m.provider === 'heuristic' ? '\n(No respondió ningún LLM: revisa la clave de OpenAI con el diagnóstico.)' : '';
    const head = `${d.figura_libre || d.figura || ''}${d.emoji ? ' ' + d.emoji : ''} · director: ${m.provider || '?'}${m.ms ? ` · ${m.ms} ms` : ''}`;
    const prob = m.problema ? `\nAviso del modelo: ${m.problema}.` : '';
    pre.textContent = u
      ? `${head}\nForma: ${u.origen} · ${u.pol}${prob}${hint}${aviso}\n\n${u.grid.join('\n')}`
      : `${head}\nSin forma.${prob}${hint}${aviso}`;
  }

  /** Formatos de dibujo de la grilla (vienen del backend: GRID_PRESETS). */
  setGridPresets(list) {
    this.gridPresets = list || [];
    if (this.isOpen) this._renderPresets(this.getSettings());
  }

  _renderPresets(s, forma = s.forma_grilla || 'emoji') {
    const sel = this.$('select[data-sopt="grilla_preset"]');
    if (!sel) return;
    const list = this.gridPresets || [];
    if (sel.options.length !== list.length) sel.innerHTML = list.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('');
    const cur = list.some((p) => p.id === s.grilla_preset) ? s.grilla_preset : 'composicion';
    sel.value = cur;
    this.$('[data-preset-row]').style.display = forma === 'llm' ? '' : 'none';
    const p = list.find((x) => x.id === cur);
    this.$('[data-preset-desc]').textContent = forma === 'llm' && p ? p.desc : forma === 'letras' ? 'El modelo dibuja la figura en arte ASCII usando sólo las letras de lo que se dijo; se muestra tal cual, en positivo, sobre negro.' : forma === 'emoji' ? 'El modelo elige un emoji para el concepto y el programa calca su silueta (después pasa por el tratamiento).' : '';
  }

  /** «Ver el prompt exacto»: system + user tal como salen hacia el LLM. */
  setPromptPreview(m) {
    const pre = this.$('[data-prompt-preview]');
    if (!pre) return;
    pre.textContent = m.error ? `Error: ${m.error}` : `── SISTEMA (max_tokens ${m.max_tokens}) ──\n${m.system}\n\n── USUARIO ──\n${m.user}`;
  }

  setDefaultPromptGrid(p) {
    this.defaultPromptGrid = p || this.defaultPromptGrid;
    if (this.isOpen) this.render();
  }

  setDefaultPrompt(p) {
    this.defaultPrompt = p || this.defaultPrompt;
    if (this.isOpen) this.render();
  }

  setState(text) {
    this.$('[data-state]').textContent = text;
  }

  /** Estado del micrófono que reporta el backend (permiso de macOS, errores de dispositivo). */
  setMicStatus(status) {
    this.micStatus = status.mic;
    this.micDetail = status.mic_device || '';
    const oa = this.$('[data-openai]');
    if (status.openai !== undefined) {
      const st = status.openai;
      oa.textContent = st === 'connected' ? `conectada · ${status.openai_detail || ''}` : `${st}${status.openai_detail ? ` — ${status.openai_detail}` : ''}`;
      oa.className = st === 'connected' ? 'ok' : st === 'error' || st === 'reconnecting' ? 'bad' : '';
    }
  }

  /** Estado de la clave: {has_key, masked, source, ok?, error?} */
  setKeyStatus(k = {}) {
    const el = this.$('[data-key-status]');
    if (k.ok === false) {
      el.textContent = k.error || 'clave no válida';
      el.className = 'bad';
      return;
    }
    el.textContent = k.has_key ? `guardada ✓ ${k.masked} · ${k.source || ''}` : 'sin clave: pégala arriba';
    el.className = k.has_key ? 'ok' : 'bad';
  }

  /** Latencia y origen de la última imagen (para decidir entre en vivo y curadas). */
  setLastDirection(d) {
    const el = this.$('[data-last]');
    const secs = Number.isFinite(d.latencia_ms) ? `${(d.latencia_ms / 1000).toFixed(1)} s` : '—';
    const origen = d.origen === 'llm' ? `dibujada por el LLM («${d.figura_libre || d.figura}»)`
      : d.origen === 'biblioteca' ? (d.pidio === 'llm' ? `biblioteca (el dibujo del LLM no sirvió) · ${d.figura}` : `biblioteca · ${d.figura}`)
      : 'sin figura (modo simbólico)';
    el.textContent = `${secs} · ${d.estiloVisto ? d.estiloVisto + ' · ' : ''}${origen} · ${d.provider || ''}`;
    el.className = d.latencia_ms > 6000 ? 'bad' : 'ok';
  }

  _cadence(s) {
    const c = s.cadencia || {};
    const preset = c.preset || 'estrofa';
    return { preset, ...(CADENCE_PRESETS[preset] || CADENCE_PRESETS.estrofa), ...(preset === 'personalizada' ? c : {}) };
  }

  /** Estado en vivo de la estrofa que se está acumulando. */
  setCadence(m) {
    const el = this.$('[data-cadence]');
    if (m.disparo) {
      el.textContent = `pedida (${m.disparo}) · dibujando…`;
      el.className = 'ok';
      return;
    }
    const falta = Math.max(0, (m.min_s || 0) - (m.desde_imagen || 0));
    el.textContent = `${m.palabras}/${m.objetivo} palabras` + (falta > 0.5 ? ` · faltan ${Math.ceil(falta)} s de mínimo` : ' · al cerrar la estrofa');
    el.className = '';
  }

  /** Dónde se está grabando la sesión (audio + eventos) y cuánto lleva; o la sesión que se re-proyecta. */
  setRecInfo(info, replay = null) {
    if (replay) this.recText = `RE-PROYECTANDO ${replay.carpeta} (${Math.round(replay.duracion / 60)} min). Nada se graba.`;
    else if (info && info.carpeta) {
      const s = Math.round(info.segundos || 0);
      this.recText = `● Grabando la sesión desde que arrancó: ${info.carpeta} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} de audio · ${info.eventos || 0} eventos`;
    } else if (info === null) this.recText = 'La sesión no se está grabando (backend con --no-record o sin permiso de escritura).';
    const el = this.$('[data-recinfo]');
    if (el && this.recText) el.textContent = this.recText;
  }

  setUserDir(dir) {
    if (dir) this.$('[data-userdir]').textContent = `${dir}/logos  (organizadores · socio-cultural · patrocinadores · acompanan · embajadas · media-partner)`;
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
    if (this.micStatus === 'silencio' || this.micStatus === 'error') return; // lo informa tick()
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
    } else if (this.micStatus === 'silencio' || this.micStatus === 'error') {
      const sig = this.$('[data-signal]');
      sig.textContent = this.micStatus === 'silencio' ? `silencio absoluto: ${this.micDetail}` : `error: ${this.micDetail}`;
      sig.className = 'bad';
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
    else if (act === 'show-prompt') this.onShowPrompt?.(this.$('[data-grid-text]')?.value || '');
    else if (act === 'add-artist') this._commit((s) => (s.artists = [...(s.artists || []), { name: '' }]));
    else if (act === 'add-step') this._commit((s) => (s.loop = [...(s.loop || []), { tipo: 'texto', contenido: '', render: 'letras', duracion: 10, letras: '' }]));
    else if (act === 'up') this._commit((s) => move(s[list], -1));
    else if (act === 'down') this._commit((s) => move(s[list], +1));
    else if (act === 'del') this._commit((s) => s[list].splice(i, 1));
    else if (act === 'reset-prompt') this._commit((s) => (s.prompt_estetica = ''));
    else if (act === 'swatch') this._commit((s) => (s.marca = { ...(s.marca || {}), acento: ev.target.dataset.color.toUpperCase() }));
    else if (act === 'open-logos') this.onOpenFolder?.('logos');
    else if (act === 'reset-prompt-grilla') this._commit((s) => (s.prompt_grilla = ''));
    else if (act === 'test-grid') {
      this.$('[data-grid-preview]').textContent = 'Pidiendo la grilla…';
      this.onTestGrid?.(this.$('[data-grid-text]').value.trim());
    }
    else if (act === 'preview') this.onPreviewStyle?.(ev.target.dataset.stylePreview);
    else if (act === 'brand-font') {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.woff2,.woff,.ttf,.otf' });
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => this._commit((s) => (s.marca = { ...(s.marca || {}), fuente: r.result, fuente_nombre: f.name }));
        r.readAsDataURL(f);
      };
      input.click();
    } else if (act === 'record') this.onRecord?.();
    else if (act === 'stop') this.onStop?.();
    else if (act === 'save-key') {
      const input = this.$('[data-key]');
      const key = input.value.trim();
      if (!key) return;
      if (!this.onSaveKey(key)) this.setKeyStatus({ ok: false, error: 'backend desconectado: abre start_mac.command' });
      else {
        input.value = '';
        this.$('[data-key-status]').textContent = 'guardando…';
      }
    } else if (act === 'scan') this.onScanLogos?.(this.getSettings().loop[i].carpeta);
    else if (act === 'del-logo') this._commit((s) => s.loop[i].imagenes.splice(+ev.target.dataset.k, 1));
    else if (act === 'upload-logos') {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true });
      input.onchange = async () => {
        const files = [...(input.files || [])];
        const urls = await Promise.all(
          files.map((f) => new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(f);
          })),
        );
        this._commit((s) => (s.loop[i].imagenes = [...(s.loop[i].imagenes || []), ...urls]));
      };
      input.click();
    }
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
    if (t.matches('[data-channel]')) {
      if (ev.type === 'change') {
        this.currentChannel = +t.value;
        this.peak = 0;
        this.onChannel?.(+t.value);
        this.flashSaved();
      }
      return;
    }
    if (t.matches('[data-device]')) {
      if (ev.type === 'change') {
        this.currentDevice = t.value;
        this._renderChannels();
        this.peak = 0;
        this.onDevice(t.value);
        this.flashSaved();
      }
      return;
    }
    if (t.matches('[data-prompt-grilla]')) {
      clearTimeout(this._promptGT);
      this._promptGT = setTimeout(() => {
        const v = t.value.trim();
        this._commit((s) => (s.prompt_grilla = v === (this.defaultPromptGrid || '').trim() ? '' : v), false);
      }, 500);
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
    if (t.dataset.style) {
      this._commit((s) => {
        const est = { activos: [], modo: 'llm', ...(s.estilos || {}) };
        const set = new Set(est.activos);
        if (t.checked) set.add(t.dataset.style);
        else set.delete(t.dataset.style);
        s.estilos = { ...est, activos: [...set] };
      }, false);
      return;
    }
    if (t.matches('[data-estmodo]')) {
      if (ev.type === 'input') return;
      this._commit((s) => (s.estilos = { ...(s.estilos || {}), modo: t.value }), false);
      return;
    }
    if (t.dataset.marca) {
      if (ev.type === 'input' && t.type === 'checkbox') return;
      this._commit((s) => (s.marca = { ...(s.marca || {}), [t.dataset.marca]: t.type === 'checkbox' ? t.checked : t.value }), false);
      return;
    }
    if (t.dataset.muro) {
      const k = t.dataset.muro;
      if (t.type === 'range') t.nextElementSibling.textContent = t.value;
      if (ev.type === 'input' && t.tagName === 'SELECT') return;
      this._commit((s) => (s.muro = { ...(s.muro || {}), [k]: t.type === 'checkbox' ? t.checked : t.type === 'range' ? +t.value : t.value }), false);
      return;
    }
    if (t.dataset.cad) {
      if (ev.type === 'input' && t.tagName === 'SELECT') return;
      const k = t.dataset.cad;
      this._commit((s) => {
        const cad = this._cadence(s);
        if (k === 'preset') Object.assign(cad, { preset: t.value }, CADENCE_PRESETS[t.value] || {});
        else cad[k] = Math.max(0, +t.value || 0);
        s.cadencia = cad;
      }, k === 'preset');
      return;
    }
    if (t.matches('select[data-formato]')) {
      if (t.value === 'otro') {
        this.$('[data-formato-otro]').style.display = '';
        this.$('[data-formato-otro]').focus();
      } else this._commit((s) => (s.formato = t.value), false);
      return;
    }
    if (t.matches('[data-formato-otro]')) {
      if (/^\s*\d{3,5}\s*[x×X*]\s*\d{3,5}\s*$/.test(t.value)) this._commit((s) => (s.formato = t.value.replace(/\s|×|\*/g, 'x').replace(/x+/g, 'x')), false);
      return;
    }
    if (t.dataset.sopt) {
      if (t.type === 'radio' && !t.checked) return;
      const k = t.dataset.sopt;
      this._commit((s) => (s[k] = t.value), false);
      if (k === 'forma_grilla' || k === 'grilla_preset') this._renderPresets(this.getSettings());
      return;
    }
    if (t.matches('[data-curaduria]')) {
      clearTimeout(this._curT);
      this._curT = setTimeout(() => this._commit((s) => (s.curaduria = t.value.trim()), false), 500);
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
      else if (field === 'por_pagina') st.por_pagina = Math.max(1, +t.value || 8);
      else if (field === 'monocromo') st.monocromo = t.checked;
      else if (field === 'contenido' && t.readOnly) return;
      else st[field] = t.value;
      if (field === 'tipo') {
        st.render = st.tipo === 'logos' ? 'imagen' : 'letras';
        if (st.tipo === 'logos') Object.assign(st, { carpeta: st.carpeta || 'public/loop/sponsors', imagenes: st.imagenes || [], por_pagina: st.por_pagina || 8, monocromo: st.monocromo ?? true });
      }
    }, rerender);
  }
}
