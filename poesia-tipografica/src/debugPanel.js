// ─────────────────────────────────────────────────────────────────────────────
//  debugPanel.js — Modo simulación / calibración (tecla D).
//  Permite inyectar versos sin micrófono, forzar figuras y físicas, y ver el
//  estado del backend (micrófono, OpenAI, LLM) mientras se ajusta el proyector.
// ─────────────────────────────────────────────────────────────────────────────
import { SHAPE_NAMES } from './shapeLibrary.js';
import { PHYSICS_MODES } from './typeField.js';

export const SAMPLE_POEM = [
  'La luna se quiebra sobre el agua negra',
  'y cada letra cae como una lluvia lenta',
  'somos un enjambre de voces en la ciudad',
  'el tiempo gira y nos lleva en su remolino',
  'un pájaro de tinta abre sus alas en mi pecho',
  'tus ojos son dos lámparas encendidas en la noche',
  'de tu nombre sólo queda ceniza y polvo',
].join('\n');

const PHYS_LABEL = {
  lluvia_text_rain: 'Lluvia · Utterback',
  enjambre_lozano: 'Enjambre · Lozano-Hemmer',
  vortice_sandison: 'Vórtice · Sandison',
  dispersion_ceniza: 'Ceniza',
};

export class DebugPanel {
  constructor(actions) {
    this.actions = actions;
    const el = document.createElement('div');
    el.id = 'debug';
    el.innerHTML = `
      <h1>Poesía Tipográfica</h1>
      <div class="keys">Panel técnico. Espacio = siguiente verso de prueba · C = panel de operación</div>
      <h2>Estado</h2>
      <div class="status" data-status></div>
      <div class="meter"><i data-meter></i></div>
      <h2>Versos de prueba (uno por línea)</h2>
      <textarea data-text spellcheck="false"></textarea>
      <div class="row">
        <button data-act="verse">Leer siguiente verso</button>
        <button data-act="poem">Leer poema completo</button>
        <button data-act="stop">Detener</button>
      </div>
      <h2>Física simbólica</h2>
      <div class="row" data-phys></div>
      <h2>Caligrama</h2>
      <div class="row">
        <select data-fig>${SHAPE_NAMES.map((n) => `<option>${n}</option>`).join('')}</select>
        <select data-mode><option>concreto</option><option>hibrido</option></select>
        <select data-fill><option>ambos</option><option>contorno</option><option>volumen</option></select>
        <button data-act="figure">Formar</button>
        <button data-act="release">Disolver</button>
      </div>
      <h2>Última dirección de arte</h2>
      <pre data-dir>—</pre>
    `;
    document.body.appendChild(el);
    this.el = el;
    this.text = el.querySelector('[data-text]');
    this.text.value = SAMPLE_POEM;
    this.statusEl = el.querySelector('[data-status]');
    this.meter = el.querySelector('[data-meter]');
    this.dirEl = el.querySelector('[data-dir]');
    this.lineIndex = 0;
    this.status = {};
    this.stats = {};

    const phys = el.querySelector('[data-phys]');
    this.physButtons = PHYSICS_MODES.map((m, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1} ${PHYS_LABEL[m]}`;
      b.onclick = () => actions.physics(m);
      phys.appendChild(b);
      return b;
    });

    el.addEventListener('click', (ev) => {
      const act = ev.target?.dataset?.act;
      if (!act) return;
      if (act === 'verse') this.nextVerse();
      if (act === 'poem') actions.poem(this.lines());
      if (act === 'stop') actions.stop();
      if (act === 'figure')
        actions.figure(el.querySelector('[data-fig]').value, el.querySelector('[data-mode]').value, el.querySelector('[data-fill]').value);
      if (act === 'release') actions.release();
    });
    if (actions.startOpen) this.toggle(true);
  }

  lines() {
    return this.text.value.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  nextVerse() {
    const lines = this.lines();
    if (!lines.length) return;
    const line = lines[this.lineIndex % lines.length];
    this.lineIndex++;
    this.actions.verse(line);
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  isTyping() {
    return this.isOpen && document.activeElement === this.text;
  }

  toggle(force) {
    this.el.classList.toggle('open', force ?? !this.isOpen);
  }

  setStatus(patch) {
    Object.assign(this.status, patch);
    this._renderStatus();
  }

  setStats(stats) {
    this.stats = stats;
    if (this.isOpen) this._renderStatus();
    this.physButtons.forEach((b, i) => b.classList.toggle('on', PHYSICS_MODES[i] === stats.mode));
  }

  setLevel(rms) {
    if (this.isOpen) this.meter.style.width = `${Math.round(Math.min(1, rms) * 100)}%`;
  }

  setDirection(dir) {
    const { verso, modo_visual, figura, fisica, relleno, tipografia, palabras_clave, paleta, provider, latencia_ms } = dir;
    this.dirEl.textContent = JSON.stringify({ verso, modo_visual, figura, relleno, tipografia, fisica, paleta, palabras_clave, provider, latencia_ms }, null, 1);
  }

  _renderStatus() {
    const s = { ...this.status, ...this.stats };
    const cls = (v) => (['ok', 'connected', 'ollama', 'deepseek'].includes(v) ? 'ok' : ['error', 'reconnecting', 'offline', 'unavailable'].includes(v) ? 'bad' : '');
    const rows = [
      ['backend', s.backend], ['micrófono', s.mic], ['openai', s.openai], ['llm', s.llm],
      ['fps', s.fps], ['calidad', s.calidad], ['glifos', s.total ? `${s.visible} visibles / ${s.total}` : ''],
      ['verso vivo', s.line], ['figura', s.figure ? `${s.figureName} (${s.figure})` : s.figureName], ['física', s.mode], ['atlas', s.atlas],
    ];
    this.statusEl.innerHTML = rows.map(([k, v]) => `<b>${k}</b><span class="${cls(v)}">${v ?? '—'}</span>`).join('');
  }
}
