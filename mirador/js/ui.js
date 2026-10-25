"use strict";
/* =====================================================================
   MIRADOR — interfaz
   Panel lateral con pestañas. Los controles se generan desde P con
   helpers (range/hue/toggle/select/text); UI.refresh() reconstruye la
   pestaña visible después de cargar una plantilla o una sesión.
   ===================================================================== */
const UI = {
  tab:'plantillas', built:false, liveFns:[],
  TABS:[['sesion', 'Sesión'], ['plantillas', 'Plantillas'], ['modulos', 'Módulos'], ['camaras', 'Cámaras'], ['audio', 'Audio'], ['proyeccion', 'Proyección'], ['sistema', 'Sistema']],
  init(){
    const nav = $('tabs'); nav.innerHTML = '';
    for (const [id, label] of this.TABS) { const b = document.createElement('button'); b.textContent = label; b.dataset.tab = id; b.setAttribute('role', 'tab'); b.onclick = () => this.show(id); nav.appendChild(b); }
    $('panelClose').onclick = () => this.togglePanel(false);
    this.built = true; this.show(this.tab);
  },
  togglePanel(v){ const hidden = v === undefined ? !document.body.classList.contains('panel-hidden') : !v; document.body.classList.toggle('panel-hidden', hidden); document.body.classList.toggle('show-hint', !hidden); },
  show(id){ this.tab = id; $('tabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === id)); this.rebuild(); },
  refresh(tab){ if (!this.built) return; if (!tab || tab === this.tab || tab === 'all') this.rebuild(); },
  rebuild(){
    const body = $('tabBody'); const st = body.scrollTop; body.innerHTML = ''; this.liveFns = [];
    const fn = this['tab_' + this.tab]; if (fn) fn.call(this, body);
    body.scrollTop = st;
  },
  tick(){ for (const f of this.liveFns) { try { f(); } catch (e) {} } },

  /* ---------- helpers de controles ---------- */
  group(parent, title, opts = {}){
    const g = document.createElement('div'); g.className = 'group' + (opts.closed ? ' closed' : ''); const h = document.createElement('h3'); h.textContent = title;
    h.onclick = e => { if (e.target.closest('.sw')) return; g.classList.toggle('closed'); };
    g.appendChild(h); const b = document.createElement('div'); b.className = 'body'; g.appendChild(b); parent.appendChild(g);
    if (opts.toggle) { const sw = this.makeSwitch(opts.toggle.get(), v => opts.toggle.set(v)); sw.classList.add('sw'); h.appendChild(sw); }
    if (opts.desc) { const n = document.createElement('div'); n.className = 'note'; n.textContent = opts.desc; b.appendChild(n); }
    return b;
  },
  makeSwitch(on, onchange){ const b = document.createElement('button'); b.className = 'sw' + (on ? ' on' : ''); b.type = 'button'; b.onclick = e => { e.stopPropagation(); const v = !b.classList.contains('on'); b.classList.toggle('on', v); onchange(v); }; return b; },
  row(parent, label){ const r = document.createElement('div'); r.className = 'ctl'; const l = document.createElement('label'); l.textContent = label; l.title = label; r.appendChild(l); parent.appendChild(r); return r; },
  range(parent, obj, key, min, max, step, label, onchange){
    const r = this.row(parent, label); const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = obj[key];
    const n = document.createElement('input'); n.className = 'num'; n.value = fmt(obj[key]);
    const set = v => { v = clamp(+v, min, max); if (isNaN(v)) return; obj[key] = v; i.value = v; n.value = fmt(v); Sessions.touch(); onchange && onchange(v); };
    i.oninput = () => set(i.value); n.onchange = () => set(n.value); r.appendChild(i); r.appendChild(n);
    this.liveFns.push(() => { if (document.activeElement !== n && +i.value !== obj[key]) { i.value = obj[key]; n.value = fmt(obj[key]); } });
    return r;
  },
  hue(parent, obj, key, label){
    const r = this.row(parent, label); const w = document.createElement('div'); w.className = 'hue'; const i = document.createElement('input'); i.type = 'range'; i.min = 0; i.max = 360; i.step = 1; i.value = obj[key]; w.appendChild(i);
    const n = document.createElement('input'); n.className = 'num'; n.value = Math.round(obj[key]) + '°';
    i.oninput = () => { obj[key] = +i.value; n.value = i.value + '°'; Sessions.touch(); }; r.appendChild(w); r.appendChild(n); return r;
  },
  toggle(parent, obj, key, label, onchange){ const r = this.row(parent, label); r.classList.add('wide'); const sw = this.makeSwitch(!!obj[key], v => { obj[key] = v; Sessions.touch(); onchange && onchange(v); }); r.appendChild(sw); return r; },
  select(parent, obj, key, options, label, onchange){
    const r = this.row(parent, label); r.classList.add('wide'); const s = document.createElement('select');
    const entries = Array.isArray(options) ? options.map(o => Array.isArray(o) ? o : [o, o]) : Object.entries(options);
    for (const [v, t] of entries) { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); }
    s.value = String(obj[key]); s.onchange = () => { const raw = s.value; const v = entries.find(e => String(e[0]) === raw)?.[0]; obj[key] = typeof obj[key] === 'number' ? +v : v; Sessions.touch(); onchange && onchange(obj[key]); }; r.appendChild(s); return s;
  },
  text(parent, obj, key, label, multiline){ const r = this.row(parent, label); r.classList.add('wide'); const t = document.createElement(multiline ? 'textarea' : 'input'); if (!multiline) t.type = 'text'; t.value = obj[key] ?? ''; t.onchange = () => { obj[key] = t.value; Sessions.touch(); }; r.appendChild(t); return t; },
  button(parent, label, fn, cls = ''){ const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; parent.appendChild(b); return b; },
  buttons(parent, list){ const r = document.createElement('div'); r.className = 'row'; for (const [label, fn, cls] of list) this.button(r, label, fn, cls); parent.appendChild(r); return r; },
  note(parent, html){ const n = document.createElement('div'); n.className = 'note'; n.innerHTML = html; parent.appendChild(n); return n; },
  kv(parent, pairs){ const d = document.createElement('div'); d.className = 'kv'; d.innerHTML = pairs.map(([k, v]) => `${k}: <b>${v}</b>`).join('<br>'); parent.appendChild(d); return d; },

  /* =================== Sesión =================== */
  tab_sesion(body){
    const g = this.group(body, 'Sesión actual');
    const r = document.createElement('div'); r.className = 'row'; const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'nombre de la sesión'; inp.value = Sessions.current; inp.style.cssText = 'background:#0d1015;border:1px solid var(--line);border-radius:4px;padding:6px 8px';
    r.appendChild(inp); this.button(r, 'Guardar', () => { if (!Sessions.current) Sessions.create(inp.value); else if (inp.value.trim() !== Sessions.current) Sessions.rename(Sessions.current, inp.value); Sessions.save(); }, 'primary'); g.appendChild(r);
    this.buttons(g, [['Nueva (vacía)', () => { const n = prompt('Nombre de la nueva sesión'); if (n) { Sessions.current = ''; applyPlantilla('enjambre', { silent:true }); Sessions.create(n); } }], ['Duplicar', () => { const n = prompt('Nombre de la copia', Sessions.current + ' 2'); if (n) Sessions.duplicate(n); }], ['Exportar .json', () => Sessions.export(false)], ['Importar .json', () => $('jsonInput').click()]]);
    this.note(g, 'Se autoguarda unos segundos después de cada cambio. Exportá la sesión para llevarla a la otra computadora.');
    const notes = this.text(g, Sessions, 'notes', 'notas', true); notes.placeholder = 'intérpretes, obra, cues…'; notes.onchange = () => { Sessions.notes = notes.value; Sessions.touch(); };

    const gl_ = this.group(body, 'Sesiones guardadas');
    const list = document.createElement('div'); list.className = 'list';
    const names = Sessions.names(); if (!names.length) this.note(gl_, 'Todavía no hay sesiones guardadas.');
    for (const n of names) { const s = Sessions.get(n); const it = document.createElement('div'); it.className = 'item' + (n === Sessions.current ? ' pick' : '');
      it.innerHTML = `<span class="nm">${esc(n)}</span><small>${(s.canciones || []).length}♪ · ${esc((PLANTILLAS.find(p => p.id === s.plantilla) || {}).nombre || '—')}</small><span class="x" title="borrar">×</span>`;
      it.onclick = e => { if (e.target.classList.contains('x')) { if (confirm('¿Borrar la sesión "' + n + '"?')) Sessions.remove(n); } else Sessions.load(n); }; list.appendChild(it); }
    gl_.appendChild(list); this.buttons(gl_, [['Exportar todas', () => Sessions.export(true)]]);

    const gc = this.group(body, 'Canciones de la sesión');
    const pl = document.createElement('div'); pl.className = 'list';
    if (!Playlist.items.length) this.note(gc, 'Sin canciones. Agregá archivos o dejalos en la carpeta <code>canciones/</code> junto al programa.');
    Playlist.items.forEach((t, i) => { const it = document.createElement('div'); it.className = 'item' + (i === Playlist.selected ? ' pick' : '');
      it.innerHTML = `<span class="nm">${i === Playlist.selected && Playlist.started && !track.paused ? '▶ ' : ''}${esc(t.name)}</span>${t.url ? '' : '<small title="falta el archivo en esta computadora">sin archivo</small>'}<span class="x" title="subir">↑</span><span class="x" title="bajar">↓</span><span class="x" title="quitar">×</span>`;
      const xs = it.querySelectorAll('.x'); xs[0].onclick = e => { e.stopPropagation(); Playlist.move(i, -1); }; xs[1].onclick = e => { e.stopPropagation(); Playlist.move(i, 1); }; xs[2].onclick = e => { e.stopPropagation(); Playlist.remove(i); };
      it.onclick = () => Playlist.play(i); pl.appendChild(it); });
    gc.appendChild(pl);
    this.buttons(gc, [['Agregar archivos…', () => Playlist.pick()], ['Carpeta…', () => $('folderInput').click()], ['Leer canciones/', async () => { const ok = await Playlist.autoFolder(); toast(ok ? 'canciones agregadas desde la carpeta' : 'no encontré archivos en canciones/ (hay que servir con el lanzador)'); }]]);
    this.buttons(gc, [[Playlist.started && !track.paused ? '❚❚ Pausa' : '▶ Reproducir', () => Playlist.toggle()], ['■ Detener', () => Playlist.stop()], ['◀◀', () => Playlist.select(Playlist.selected - 1)], ['▶▶', () => Playlist.select(Playlist.selected + 1)]]);
    this.note(gc, 'Espacio reproduce/pausa · ↑/↓ cambian de canción. Los archivos quedan en la Mac/PC (no en la sesión); si cambiás de computadora, volvé a agregarlos o usá la carpeta <code>canciones/</code>.');
  },

  /* =================== Plantillas =================== */
  tab_plantillas(body){
    this.note(body, 'Una plantilla fija los módulos, los ecos y el posproceso. Después ajustás todo en <b>Módulos</b>. Teclas 1‑9 y 0 cambian rápido. Referencias y enlaces en <code>PLANTILLAS.md</code>.');
    const cards = document.createElement('div'); cards.className = 'cards';
    for (const t of PLANTILLAS) { const c = document.createElement('div'); c.className = 'card-t' + (t.id === plantillaActual ? ' pick' : '');
      c.innerHTML = `<b>${esc(t.nombre)}</b><small>${esc(t.desc)}</small><small style="margin-top:4px;color:#6f7482">${esc(t.origen)}</small>${t.key ? `<span class="k">${t.key}</span>` : ''}`;
      c.onclick = () => applyPlantilla(t.id); cards.appendChild(c); }
    body.appendChild(cards);
    const g = this.group(body, 'Combinar', { closed:true });
    this.note(g, 'Las plantillas no son excluyentes: después de elegir una, en <b>Módulos</b> podés prender otros (por ejemplo Silueta + Lluvia de letras) y guardar el resultado en la sesión.');
  },

  /* =================== Módulos =================== */
  tab_modulos(body){
    const modGroup = (id, build) => { const m = Modules.get(id); const g = this.group(body, m.label, { closed:!m.active, desc:m.desc, toggle:{ get:() => m.active, set:v => { setModule(id, v); rebuildPlan(); Sessions.touch(); } } }); build(g, P[id]); };
    modGroup('silueta', (g, p) => { this.hue(g, p, 'hue', 'color'); this.range(g, p, 'white', 0, 1, .01, 'blanco'); this.range(g, p, 'opacity', 0, 1, .01, 'opacidad'); this.range(g, p, 'soft', .005, .3, .005, 'borde suave'); this.toggle(g, p, 'fill', 'relleno'); this.range(g, p, 'edge', 0, 2, .01, 'borde luminoso'); this.hue(g, p, 'edgeHue', 'color del borde'); });
    modGroup('swarm', (g, p) => { this.range(g, p, 'density', 60, 800, 10, 'partículas por cuerpo'); this.range(g, p, 'sensitivity', 1, 10, .5, 'dispersión'); this.range(g, p, 'keepForm', 0, 1, .01, 'conservar forma'); this.range(g, p, 'size', .5, 8, .1, 'tamaño'); this.toggle(g, p, 'useBodyHue', 'color por cuerpo'); this.hue(g, p, 'hue', 'color fijo'); this.range(g, p, 'glow', 0, 1, .01, 'resplandor'); });
    modGroup('scribble', (g, p) => { this.range(g, p, 'iso', .1, .9, .01, 'nivel de trazo'); this.range(g, p, 'jitter', 0, .05, .001, 'temblor'); this.range(g, p, 'width', .5, 8, .1, 'grosor'); this.hue(g, p, 'hue', 'color'); this.range(g, p, 'glow', 0, 1, .01, 'resplandor'); });
    modGroup('lluvia', (g, p) => { this.text(g, p, 'text', 'texto', true); this.range(g, p, 'density', .2, 3, .1, 'densidad'); this.range(g, p, 'size', 10, 60, 1, 'tamaño'); this.range(g, p, 'speed', .2, 3, .1, 'velocidad'); this.select(g, p, 'font', [['serif', 'serif'], ['sans', 'sans'], ['mono', 'mono']], 'tipografía'); this.hue(g, p, 'hue', 'color'); this.range(g, p, 'white', 0, 1, .01, 'blanco'); });
    modGroup('pintura', (g, p) => { this.select(g, p, 'parts', Object.keys(PART_SETS), 'qué pinta'); this.range(g, p, 'width', 2, 60, 1, 'grosor'); this.range(g, p, 'fade', 0, .08, .001, 'desvanecer'); this.toggle(g, p, 'useBodyHue', 'color por cuerpo'); this.hue(g, p, 'hue', 'color fijo'); this.range(g, p, 'glow', 0, 1, .01, 'resplandor'); this.buttons(g, [['Limpiar pintura', () => { if (paint.ctx) paint.ctx.clearRect(0, 0, paint.cv.width, paint.cv.height); }]]); });
    modGroup('grilla', (g, p) => { this.range(g, p, 'cell', 8, 80, 1, 'celda (px)'); this.range(g, p, 'gap', 0, .8, .01, 'separación'); this.range(g, p, 'inertia', .5, .99, .01, 'inercia'); this.toggle(g, p, 'square', 'cuadrados'); this.toggle(g, p, 'useBodyHue', 'color por cuerpo'); this.hue(g, p, 'hue', 'color'); this.range(g, p, 'white', 0, 1, .01, 'blanco'); });
    modGroup('cortinas', (g, p) => { this.range(g, p, 'spacing', 6, 80, 1, 'separación (px)'); this.range(g, p, 'force', 0, 3, .05, 'fuerza'); this.range(g, p, 'radius', .05, .6, .01, 'radio'); this.range(g, p, 'segments', 4, 48, 1, 'segmentos'); this.range(g, p, 'width', .5, 5, .1, 'grosor'); this.hue(g, p, 'hue', 'color'); this.range(g, p, 'white', 0, 1, .01, 'blanco'); this.range(g, p, 'glow', 0, 1, .01, 'resplandor'); });
    modGroup('aves', (g, p) => { this.range(g, p, 'rate', .1, 3, .1, 'cantidad'); this.range(g, p, 'lift', 0, 3, .1, 'ascenso'); this.range(g, p, 'size', 1, 10, .5, 'tamaño'); this.range(g, p, 'life', .3, 3, .1, 'vida'); this.hue(g, p, 'hue', 'color'); this.range(g, p, 'white', 0, 1, .01, 'blanco'); });
    if (EXT_VTF) {
      modGroup('fog', (g, p) => { this.range(g, p, 'zDepth', 0, 1, .01, 'profundidad'); this.range(g, p, 'drift', 0, 3, .01, 'deriva'); this.range(g, p, 'size', .5, 14, .1, 'tamaño'); this.hue(g, p, 'hue', 'color'); this.range(g, p, 'hueSpread', 0, 180, 1, 'rango de color'); });
      modGroup('vivas', (g, p) => { this.range(g, p, 'selMin', 0, 1, .01, 'canal selección'); this.range(g, p, 'soft', .01, .5, .01, 'suavidad'); this.range(g, p, 'scatter', 0, 2, .01, 'dispersión'); this.range(g, p, 'keepForm', 0, 1, .01, 'conservar forma'); this.range(g, p, 'size', .5, 14, .1, 'tamaño'); this.hue(g, p, 'hue', 'color'); });
      modGroup('push', (g, p) => { this.range(g, p, 'force', 0, 4, .01, 'fuerza'); this.range(g, p, 'size', .5, 14, .1, 'tamaño'); this.hue(g, p, 'hue', 'color'); });
    } else { const w = document.createElement('div'); w.className = 'warnbox'; w.textContent = 'Esta GPU no lee texturas en el vertex shader: Niebla, Líneas vivas y Empuje no están disponibles. El resto funciona.'; body.appendChild(w); }

    const gs = this.group(body, 'Esqueleto y enlaces', { closed:true });
    this.toggle(gs, P.track, 'showSkeleton', 'esqueleto'); this.range(gs, P.track, 'boneWidth', .5, 14, .1, 'grosor hueso'); this.range(gs, P.track, 'glow', 0, 1, .01, 'resplandor'); this.toggle(gs, P.track, 'showJoints', 'articulaciones'); this.range(gs, P.track, 'jointSize', 2, 20, .5, 'tamaño articulación'); this.toggle(gs, P.track, 'showId', 'mostrar ID');
    this.toggle(gs, P.link, 'enabled', 'enlaces entre cuerpos'); this.range(gs, P.link, 'range', .05, 1, .01, 'alcance'); this.range(gs, P.link, 'width', .5, 8, .1, 'grosor enlace'); this.range(gs, P.link, 'energy', 0, 2, .01, 'energía');
    const gm = this.group(body, 'Silueta: de dónde sale', { closed:true, desc:'Esqueleto: se arma con las articulaciones (no la afecta la luz del proyector). Brillo: píxeles claros del video. Fondo: diferencia contra un fondo aprendido (Shift+B).' });
    this.select(gm, P.mask, 'source', [['esqueleto', 'esqueleto (recomendado)'], ['brillo', 'brillo del video'], ['fondo', 'fondo aprendido'], ['ambos', 'esqueleto y brillo']], 'fuente');
    this.range(gm, P.mask, 'bodyWidth', .5, 2, .05, 'grosor del cuerpo'); this.range(gm, P.mask, 'threshold', 0, 1, .01, 'umbral (brillo/fondo)'); this.range(gm, P.mask, 'softness', .01, .5, .01, 'suavidad');
    this.buttons(gm, [['Aprender fondo (Shift+B)', learnBackground]]);
    const ge = this.group(body, 'Ecos y mezcla', { closed:true });
    this.select(ge, P.echo, 'mode', [['directo', 'directo (sin eco)'], ['additive', 'aditivo'], ['screen', 'pantalla'], ['multiply', 'multiplicar']], 'mezcla'); this.range(ge, P.echo, 'decay', 0, .995, .001, 'permanencia'); this.range(ge, P.echo, 'zoom', .985, 1.02, .0005, 'zoom del eco'); this.range(ge, P.echo, 'rotate', -3, 3, .01, 'giro'); this.range(ge, P.echo, 'drift', -4, 4, .01, 'deriva'); this.buttons(ge, [['Limpiar ecos (X)', clearFeedback]]);
    const gf = this.group(body, 'Posproceso', { closed:true });
    this.range(gf, P.fx, 'bloom', 0, 4, .01, 'bloom'); this.range(gf, P.fx, 'threshold', 0, 1, .01, 'umbral brillo'); this.range(gf, P.fx, 'radius', .2, 6, .05, 'radio halo'); this.range(gf, P.fx, 'chroma', 0, 5, .01, 'aberración'); this.range(gf, P.fx, 'glitch', 0, 1, .01, 'glitch'); this.range(gf, P.fx, 'glitchBlocks', 4, 120, 1, 'bloques glitch'); this.range(gf, P.fx, 'vignette', 0, 1.5, .01, 'viñeta'); this.range(gf, P.fx, 'gamma', .4, 2.5, .01, 'gamma');
  },

  /* =================== Cámaras =================== */
  tab_camaras(body){
    const g = this.group(body, simMode ? 'Simulación (sin cámara)' : 'Zonas de cámara', { desc: simMode ? 'Cuerpos sintéticos para probar estéticas y formato.' : 'Cada cámara ocupa una zona de la salida. Con 7 proyectores y una sola cámara, la zona es toda la pared; cuando sumes cámaras, repartilas en columnas o ubicalas a mano.' });
    if (simMode) { this.range(g, SIM, 'n', 1, 8, 1, 'cuerpos simulados'); }
    else {
      const opts = [['', '— ninguna —']]; availableCameras.forEach((c, i) => opts.push([c.deviceId, camLabel(c, i)]));
      const slot = {}; for (let i = 0; i < MAX_CAMS; i++) slot['p' + i] = sources[i]?.deviceId || '';
      const apply = () => setCameras(Array.from({ length:MAX_CAMS }, (_, i) => slot['p' + i]));
      const nShow = Math.min(MAX_CAMS, Math.max(availableCameras.length, 1));
      for (let i = 0; i < nShow; i++) this.select(g, slot, 'p' + i, opts, `zona ${i + 1}`, apply);
      this.buttons(g, [['Buscar cámaras', async () => { await refreshCameraList(); this.refresh('camaras'); }], ['Rotar orden (V)', rotateCameras]]);
    }
    this.select(g, LAYOUT, 'orient', [['columnas', 'lado a lado (columnas)'], ['filas', 'apiladas (filas)'], ['libre', 'a mano (rectángulos)']], 'disposición', () => { layoutCells(); clearFeedback(); this.refresh('camaras'); });
    sources.forEach((src, i) => { const gz = this.group(body, `Zona ${i + 1} · ${src.label}`, { closed:LAYOUT.orient !== 'libre' });
      const mir = { v:zoneMirror(src) }; this.toggle(gz, mir, 'v', 'espejo', v => { src.mirror = v; Sessions.touch(); });
      if (LAYOUT.orient === 'libre') { if (!src.rect) src.rect = defaultRect(i, sources.length); const r = src.rect; const upd = () => { layoutCells(); clearFeedback(); };
        this.range(gz, r, 'x', 0, 1, .005, 'izquierda', upd); this.range(gz, r, 'w', .05, 1, .005, 'ancho', upd); this.range(gz, r, 'y', 0, 1, .005, 'arriba', upd); this.range(gz, r, 'h', .05, 1, .005, 'alto', upd); }
      this.kv(gz, [['video', src.video.videoWidth ? `${src.video.videoWidth}×${src.video.videoHeight}` : '—'], ['cuerpos', [...bodies.values()].filter(b => b.src === src.id).length]]); });
    const gv = this.group(body, 'Video de cámara en la imagen', { closed:true });
    this.toggle(gv, P.cam, 'mirror', 'espejo (general)'); this.toggle(gv, P.cam, 'showVideo', 'mostrar video'); this.range(gv, P.cam, 'videoOpacity', 0, 1, .01, 'opacidad'); this.range(gv, P.cam, 'contrast', 0, 3, .01, 'contraste'); this.range(gv, P.cam, 'brightness', 0, 3, .01, 'brillo'); this.range(gv, P.cam, 'saturate', 0, 3, .01, 'saturación');
    const gt = this.group(body, 'Detección de cuerpos', { closed:true });
    this.range(gt, P.track, 'minScore', .05, .8, .01, 'confianza mínima'); this.range(gt, P.track, 'smoothing', 0, .95, .01, 'suavizado'); this.range(gt, P.track, 'maxPoses', 1, 6, 1, 'cuerpos máx. por cámara');
    this.kv(gt, [['inferencia', `${inferBudgetMs.toFixed(0)} ms / ${prof.inferHz} Hz`], ['modelo', modelBase ? 'local (vendor/movenet)' : 'descargado (tfhub)']]);
    this.note(gt, 'La cámara tiene que ver a los bailarines iluminados, no el proyector. Lo más fiable en sala oscura: una cámara con luz infrarroja (o cámara sin filtro IR + focos IR) apuntando al escenario. Ver <code>README.md</code>.');
  },

  /* =================== Audio =================== */
  tab_audio(body){
    const g = this.group(body, 'Fuente de audio', { desc:'Micrófono: reacciona a la música que suena en la sala. Canción: a lo que reproduce el programa (lista de la sesión).' });
    this.select(g, P.audio, 'source', [['off', 'apagado'], ['mic', 'micrófono'], ['cancion', 'canción del programa']], 'fuente', v => Audio_.setSource(v));
    if (P.audio.source === 'mic') { const mics = [['', 'predeterminado']]; Audio_.devices.forEach((d, i) => mics.push([d.deviceId, d.label || 'Micrófono ' + (i + 1)])); this.select(g, Audio_, 'micDeviceId', mics, 'micrófono', () => Audio_.openMic().catch(e => toast(e.message))); }
    this.range(g, P.audio, 'gain', 0, 6, .05, 'ganancia'); this.range(g, P.audio, 'smooth', 0, .95, .01, 'suavizado');
    const meters = document.createElement('div'); meters.className = 'kv'; g.appendChild(meters);
    const bars = ['nivel', 'graves', 'medios', 'agudos', 'golpe'].map(n => { const r = document.createElement('div'); r.style.cssText = 'display:grid;grid-template-columns:60px 1fr;gap:8px;align-items:center;margin:3px 0'; r.innerHTML = `<span>${n}</span><span class="meter"><i></i></span>`; meters.appendChild(r); return r.querySelector('i'); });
    const bpm = document.createElement('div'); bpm.className = 'kv'; g.appendChild(bpm);
    this.liveFns.push(() => { const B = Audio_.bands; [B.level, B.bass, B.mid, B.high, Audio_.beat].forEach((v, i) => bars[i].style.width = (clamp(v, 0, 1) * 100).toFixed(0) + '%'); bpm.innerHTML = `tempo estimado: <b>${Audio_.bpm || '—'} bpm</b> · estado: <b>${Audio_.source === 'off' ? 'apagado' : (Audio_.ctx?.state || '')}</b>`; });
    const gr = this.group(body, 'Qué mueve la música', { desc:'Cantidad de efecto de cada banda sobre la imagen. 0 = nada.' });
    const R = P.audio.react;
    this.range(gr, R, 'size', 0, 2, .05, 'tamaño ← graves'); this.range(gr, R, 'glow', 0, 2, .05, 'brillo ← nivel'); this.range(gr, R, 'bloom', 0, 2, .05, 'bloom ← golpe'); this.range(gr, R, 'flash', 0, 2, .05, 'destello ← golpe'); this.range(gr, R, 'scatter', 0, 2, .05, 'dispersión ← medios'); this.range(gr, R, 'hue', 0, 2, .05, 'color ← agudos'); this.range(gr, R, 'echo', 0, 2, .05, 'ecos ← nivel'); this.range(gr, R, 'speed', 0, 2, .05, 'velocidad ← nivel');
    this.buttons(gr, [['Reacción suave', () => { Object.assign(R, { size:.4, glow:.4, bloom:.4, flash:.1, scatter:.2, hue:.1, echo:.2, speed:.2 }); Sessions.touch(); this.refresh(); }], ['Reacción fuerte', () => { Object.assign(R, { size:1.2, glow:1, bloom:1.4, flash:.6, scatter:1, hue:.6, echo:.6, speed:1 }); Sessions.touch(); this.refresh(); }], ['Sin reacción', () => { Object.keys(R).forEach(k => R[k] = 0); Sessions.touch(); this.refresh(); }]]);
    this.note(body, 'Tecla <b>M</b> alterna el micrófono. Con el micrófono, el programa <b>no</b> reproduce el audio (evita acople); con la canción, sí. Para que el micrófono tome la música de la sala, acercalo al parlante o usá la salida de la consola como entrada de audio.');
  },

  /* =================== Proyección =================== */
  tab_proyeccion(body){
    const g = this.group(body, 'Formato de salida', { desc:'Tamaño de la imagen que se proyecta. Con formato fijo, en esta ventana se ve a escala (previsualización); a tamaño real cuando la ventana mide eso (lanzadores).' });
    const fmt_ = { mode:OUT.mode === 'ventana' ? 'ventana' : (/^\d+x\d+$/.test(OUT.mode) ? OUT.mode : 'custom') };
    const applyFmt = () => { if (fmt_.mode === 'custom') setOutputFormat('custom', +cw.value, +ch.value); else setOutputFormat(fmt_.mode); resize(); buildRefBuffer(); Sessions.touch(); this.refresh(); };
    this.select(g, fmt_, 'mode', [['ventana', 'esta ventana'], ['1920x1080', '1920 × 1080'], ['3840x1080', '3840 × 1080 (2 proyectores)'], ['5760x1080', '5760 × 1080 (3)'], ['13440x1080', '13440 × 1080 (7 proyectores)'], ['13480x1080', '13480 × 1080 (7 + 40 px)'], ['custom', 'otro…']], 'formato', applyFmt);
    const r = this.row(g, 'medidas'); const cw = document.createElement('input'); cw.type = 'number'; cw.value = OUT.w; const ch = document.createElement('input'); ch.type = 'number'; ch.value = OUT.h; cw.disabled = ch.disabled = fmt_.mode !== 'custom'; cw.onchange = ch.onchange = applyFmt; r.appendChild(cw); r.appendChild(ch);
    this.kv(g, [['salida', `${outputSize().w} × ${outputSize().h}`], ['render interno', `${W} × ${H} (×${DPR.toFixed(2)})`], ['tope GPU', `${MAX_TEX} px`]]);
    if (outputSize().w * 1 > MAX_TEX) { const w = document.createElement('div'); w.className = 'warnbox'; w.textContent = `La GPU no puede renderizar más de ${MAX_TEX} px de ancho: la imagen se escala internamente.`; g.appendChild(w); }
    const gp = this.group(body, 'Proyectores', { desc:'Franjas numeradas en el patrón de ajuste para alinear cada proyector. El fundido suaviza los bordes entre franjas si hay solape.' });
    this.range(gp, P.map, 'slices', 1, 12, 1, 'cantidad'); this.range(gp, P.map, 'blend', 0, .5, .005, 'fundido de bordes'); this.toggle(gp, P.map, 'testGrid', 'patrón de ajuste'); this.toggle(gp, P.map, 'blackout', 'negro (B)');
    const gm = this.group(body, 'Salida 8K a splitter (mosaico)', { closed:!P.map.mosaic, desc:'Para una sola salida de video (p. ej. 7680×4320) que un splitter reparte en proyectores Full HD: el panorama se corta en franjas (una por proyector) y cada una va a su baldosa del cuadro grande.' });
    const reM = () => { resize(); buildRefBuffer(); Sessions.touch(); this.refresh(); };
    this.toggle(gm, P.map, 'mosaic', 'activar mosaico', reM);
    const szM = { v:`${P.map.mosW}x${P.map.mosH}` }; this.select(gm, szM, 'v', [['7680x4320', '7680 × 4320 (8K)'], ['7680x2160', '7680 × 2160 (8K ancho, 2 filas)'], ['3840x2160', '3840 × 2160 (4K: 2×2 Full HD)'], ['custom', 'otro (editar abajo)']], 'cuadro de salida', v => { const m = v.match(/^(\d+)x(\d+)$/); if (m) { P.map.mosW = +m[1]; P.map.mosH = +m[2]; } reM(); });
    this.range(gm, P.map, 'mosW', 1920, 16384, 1, 'ancho del cuadro', reM); this.range(gm, P.map, 'mosH', 1080, 16384, 1, 'alto del cuadro', reM);
    this.range(gm, P.map, 'tileW', 320, 3840, 1, 'ancho de baldosa', reM); this.range(gm, P.map, 'tileH', 180, 2160, 1, 'alto de baldosa', reM);
    this.range(gm, P.map, 'mosCols', 1, 8, 1, 'baldosas por fila', reM);
    this.select(gm, P.map, 'mosOrder', [['filas', 'de izquierda a derecha, fila por fila'], ['columnas', 'de arriba a abajo, columna por columna']], 'orden', reM);
    const mp = this.text(gm, P.map, 'mosMap', 'mapa a mano', true); mp.placeholder = 'una baldosa por línea: x,y  (en px del cuadro)\n0,0\n1920,0\n…  (vacío = automático)'; mp.onchange = () => { P.map.mosMap = mp.value; reM(); };
    this.toggle(gm, P.map, 'mosPreview', 'ver panorama (no el mosaico)', reM);
    const tl = mosaicTiles(); this.kv(gm, [['franjas', `${tl.length} de ${Math.round(outputSize().w / tl.length)} × ${outputSize().h} px`], ['baldosas', tl.map(t => `${t.i + 1}:(${t.x},${t.y})`).join(' ')], ['cuadro', `${P.map.mosW} × ${P.map.mosH}` + (P.map.mosW > MAX_TEX || P.map.mosH > MAX_TEX ? ' · supera el tope de la GPU' : '')]]);
    this.note(gm, 'El splitter tiene que recortar cada ventana Full HD exactamente en esas coordenadas. En Windows: pantalla a 7680 × 4320 (60 Hz con DSC o 30 Hz), escala 100 %, y <code>start_8k.bat</code>. Con <b>patrón de ajuste</b> cada baldosa muestra su número.');
    const gk = this.group(body, 'Esquinas (keystone global)', { closed:true });
    this.toggle(gk, P.map, 'calibrate', 'mover esquinas (C)', v => uiCanvas.classList.toggle('calibrating', v)); this.range(gk, P.map, 'scale', .5, 1.2, .005, 'escala'); this.buttons(gk, [['Reiniciar esquinas', () => { resetCorners(); Sessions.touch(); }]]);
    const gw = this.group(body, 'Ventana', { closed:false });
    this.buttons(gw, [['Pantalla completa (F)', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()], ['Ocultar panel (H)', () => this.togglePanel(false)]]);
    this.note(gw, 'Para 7 proyectores: Windows tiene que mostrar UNA pantalla de 13440 × 1080 (NVIDIA Surround / Mosaic o procesador de video wall), o bien abrir una ventana de 13440 × 1080 que cruce el escritorio extendido (<code>start_13440.bat</code>). Ver README.');
    const gs = this.group(body, 'Opción B: una ventana por pantalla', { closed:true, desc:'Reparte la imagen en tiras, una ventana por monitor (Chrome/Edge, pide permiso de ventanas). Útil sin Surround; menos preciso que una sola ventana.' });
    this.buttons(gs, [['Detectar pantallas', detectScreens]]);
    if (SC.list.length > 1) { const en = { v:SC.enabled }; this.toggle(gs, en, 'v', `repartir en ${SC.list.length} pantallas`, v => { SC.enabled = v; applyScreens(); });
      const labs = {}; SC.list.forEach((x, i) => labs[i] = `${x.label || 'Pantalla ' + (i + 1)} (${x.width}×${x.height})${x === SC.details.currentScreen ? ' · esta' : ''}`);
      const pos = {}; SC.order.forEach((si, k) => pos['p' + k] = si);
      SC.order.forEach((_, k) => this.select(gs, pos, 'p' + k, labs, `tira ${k + 1}`, v => { const prev = SC.order[k], j = SC.order.indexOf(+v); if (j >= 0) SC.order[j] = prev; SC.order[k] = +v; if (SC.enabled) applyScreens(); this.refresh(); }));
      this.note(gs, 'En cada ventana de salida: doble clic o F = pantalla completa.'); }
    const gr = this.group(body, 'Grabación', { desc:'Graba el canvas a .webm desde el navegador (con el audio de la canción o del micrófono si están activos). Para OBS, ver README.' });
    const ro = { w:Rec.maxW || 3840 }; this.select(gr, ro, 'w', [[1920, 'hasta 1920 px de ancho'], [3840, 'hasta 3840 px'], [99999, 'tamaño completo (pesado)']], 'tamaño', v => Rec.maxW = +v);
    this.buttons(gr, [[Rec.active ? '■ Parar grabación (R)' : '● Grabar (R)', () => { Rec.toggle({ maxWidth:Rec.maxW || 3840 }); setTimeout(() => this.refresh(), 100); }, Rec.active ? 'danger' : '']]);
  },

  /* =================== Sistema =================== */
  tab_sistema(body){
    const g = this.group(body, 'Rendimiento');
    const pr = { v:Object.keys(PROFILES).find(k => PROFILES[k].name === prof.name) || 'medida' };
    this.select(g, pr, 'v', [['ligero', 'Ligero'], ['equilibrado', 'Equilibrado'], ['completo', 'Completo'], ['medida', 'A medida']], 'perfil', v => { if (PROFILES[v]) { applyProfile(PROFILES[v]); buildRefBuffer(); resize(); } this.refresh(); });
    this.select(g, P.perf, 'targetFps', [[24, '24 fps'], [30, '30 fps'], [45, '45 fps'], [60, '60 fps']], 'fps mínimo'); this.toggle(g, P.perf, 'autoScale', 'adaptar solo');
    this.range(g, prof, 'renderScale', .3, 1.5, .05, 'resolución interna', resize); this.range(g, P.perf, 'scene2d', .3, 1, .05, 'resolución capa 2D', resize); this.range(g, prof, 'gridN', 64, 320, 4, 'densidad de puntos', buildRefBuffer); this.range(g, prof, 'inferHz', 15, 60, 1, 'inferencia (Hz)'); this.range(g, prof, 'bloomIter', 1, 3, 1, 'pasadas de bloom');
    this.buttons(g, [['Volver a medir', async () => { const r = await benchmark(); toast(`medido · p95 ${r.p95.toFixed(1)} ms (~${Math.round(1000 / r.p95)} fps a tope)`); }]]);
    const info = this.kv(g, []); this.liveFns.push(() => { info.innerHTML = `GPU: <b>${esc(gpuName())}</b><br>render: <b>${W}×${H}</b> · capa 2D <b>${scene.width}×${scene.height}</b> · máscara <b>${MASK_W}×${MASK_H}</b><br>inferencia: <b>${inferBudgetMs.toFixed(0)} ms</b> · cuerpos: <b>${bodies.size}</b> · modelo: <b>${simMode ? 'simulación' : (modelBase ? 'local' : 'tfhub')}</b>`; });
    const gk = this.group(body, 'Teclas', { closed:true });
    this.kv(gk, [['H', 'panel'], ['F', 'pantalla completa'], ['C', 'mover esquinas'], ['B', 'negro'], ['Shift+B', 'aprender fondo'], ['X', 'limpiar ecos'], ['V', 'rotar cámaras'], ['R', 'grabar / parar'], ['M', 'micrófono sí/no'], ['Espacio', 'canción play/pausa'], ['↑ / ↓', 'canción anterior / siguiente'], ['1‑9, 0', 'plantillas'], ['G / L', 'exportar / importar sesión'], ['Esc / ⌫', 'diapositivas']]);
    const gd = this.group(body, 'Diagnóstico', { closed:true });
    this.kv(gd, [['WebGL VTF', EXT_VTF ? 'sí' : 'no (sin niebla/líneas/empuje)'], ['MAX_TEXTURE_SIZE', MAX_TEX], ['TF.js', typeof tf !== 'undefined' ? tf.version_core || 'ok' : 'no cargado'], ['backend', typeof tf !== 'undefined' && tf.getBackend ? (tf.getBackend() || '—') : '—'], ['memoria', (navigator.deviceMemory || '?') + ' GB'], ['hilos', navigator.hardwareConcurrency || '?']]);
    this.buttons(gd, [['Limpiar ecos y pintura', () => { clearFeedback(); if (paint.ctx) paint.ctx.clearRect(0, 0, paint.cv.width, paint.cv.height); }], ['Recargar programa', () => location.reload(), 'danger']]);
  },
};
function fmt(v){ return typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : (Number.isInteger(v) ? String(v) : v.toFixed(v < 1 ? 3 : 2))) : String(v); }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
