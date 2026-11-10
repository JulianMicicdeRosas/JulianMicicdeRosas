"use strict";
/* =====================================================================
   MIRADOR — interfaz
   Panel lateral con pestañas. Los controles se generan desde P con
   helpers (range/hue/toggle/select/text); UI.refresh() reconstruye la
   pestaña visible después de cargar una plantilla o una sesión.
   ===================================================================== */
const UI = {
  tab:'plantillas', built:false, liveFns:[],
  TABS:[['sesion', 'Sesión'], ['plantillas', 'Plantillas'], ['modulos', 'Módulos'], ['sync', 'Sincronizar'], ['camaras', 'Cámaras'], ['audio', 'Audio'], ['proyeccion', 'Proyección'], ['sistema', 'Sistema']],
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
  /* detección: sensibilidad, vista previa de lo que ve el modelo y diagnóstico en vivo */
  detGroup(body){
    const gt = this.group(body, 'Detección de cuerpos', { desc:'Si no aparecen esqueletos: subí la sensibilidad. "Sala" corta la imagen en dos mitades para que el modelo vea más grandes a los bailarines del fondo.' });
    const pre = Object.fromEntries(Object.entries(DET_PRESETS).map(([k, d]) => [k, d.label])); pre.mano = 'a mano';
    this.select(gt, P.det, 'preset', pre, 'sensibilidad', v => { if (v !== 'mano') applyDetPreset(v); this.refresh('camaras'); });
    const manual = () => { P.det.preset = 'mano'; };
    this.select(gt, P.det, 'tiles', [[1, 'imagen entera'], [2, '2 mitades (más alcance)'], [3, '3 partes (máximo alcance)']], 'partes de la imagen', manual);
    this.range(gt, P.det, 'res', 192, 512, 32, 'resolución del modelo', manual);
    this.range(gt, P.det, 'minPose', .03, .5, .01, 'confianza del cuerpo', manual);
    this.range(gt, P.track, 'minScore', .05, .6, .01, 'confianza de los puntos', manual);
    this.range(gt, P.track, 'smoothing', 0, .95, .01, 'suavizado'); this.range(gt, P.track, 'maxPoses', 1, 10, 1, 'cuerpos máx. por cámara');
    this.buttons(gt, [[verEsqueletos ? 'Ocultar esqueletos (E)' : 'Ver esqueletos en la imagen (E)', () => { verEsqueletos = !verEsqueletos; this.refresh('camaras'); }, verEsqueletos ? 'on' : 'primary']]);
    const cv = document.createElement('canvas'); cv.className = 'detprev'; cv.width = 480; cv.height = 270; cv.style.cssText = 'width:100%;aspect-ratio:16/9;background:#0b0d12;border-radius:6px;margin:6px 0;display:block;cursor:pointer'; cv.title = 'La imagen tal como la recibe el detector (con exposición, negros y blancos). Clic: vista grande (K)'; cv.onclick = () => Calib.toggle(true); gt.appendChild(cv);
    const st = document.createElement('div'); st.className = 'note'; gt.appendChild(st);
    const draw = () => {
      const s = sources[Calib.zone] || sources[0], c = cv.getContext('2d'); c.fillStyle = '#0b0d12'; c.fillRect(0, 0, cv.width, cv.height);
      if (!s) { st.textContent = 'sin cámara'; return; }
      const vw = s.video.videoWidth || 1280, vh = s.video.videoHeight || 720, sc = Math.min(cv.width / vw, cv.height / vh), ox = (cv.width - vw * sc) / 2, oy = (cv.height - vh * sc) / 2;
      DETPREV.src = s;
      if (s._prevImg) { const o = this._prevCv ||= document.createElement('canvas'); if (o.width !== s._prevImg.width || o.height !== s._prevImg.height) { o.width = s._prevImg.width; o.height = s._prevImg.height; } o.getContext('2d').putImageData(s._prevImg, 0, 0); c.drawImage(o, ox, oy, vw * sc, vh * sc); }
      else if (s.video.readyState >= 2) c.drawImage(s.video, ox, oy, vw * sc, vh * sc);
      const tiles = DET.single ? [{ x0:0, x1:1 }] : detTiles(detTileN()); c.strokeStyle = 'rgba(120,180,255,.55)'; c.setLineDash([4, 4]); c.lineWidth = 1;
      tiles.forEach(t => c.strokeRect(ox + t.x0 * vw * sc + .5, oy + .5, (t.x1 - t.x0) * vw * sc - 1, vh * sc - 1)); c.setLineDash([]);
      (s.cal?.ignore || []).forEach(r => { c.fillStyle = 'rgba(255,80,80,.15)'; c.fillRect(ox + Math.min(r.x0, r.x1) * vw * sc, oy + Math.min(r.y0, r.y1) * vh * sc, Math.abs(r.x1 - r.x0) * vw * sc, Math.abs(r.y1 - r.y0) * vh * sc); });
      const kept = new Set(s.poses || []); let nOk = 0, nIgn = 0, nExtra = 0;
      for (const p of (s._raw || [])) { if (p._dup) continue; const low = (p.score ?? 1) < P.det.minPose, used = kept.has(p), ign = !low && !used && s._calH && calIgnored(s, p), extra = !low && !used && !ign;
        if (used) nOk++; if (ign) nIgn++; if (extra) nExtra++;
        c.strokeStyle = low ? 'rgba(160,160,160,.6)' : ign ? 'rgba(255,107,107,.9)' : extra ? 'rgba(255,209,102,.85)' : 'rgba(105,240,176,.95)'; c.lineWidth = 2; c.setLineDash(low || extra ? [3, 3] : []); c.beginPath();
        for (const [a, b] of SKEL) { const ka = p.keypoints[a], kb = p.keypoints[b]; if ((ka.score ?? 0) < P.track.minScore * (low ? .7 : 1) || (kb.score ?? 0) < P.track.minScore * (low ? .7 : 1)) continue; c.moveTo(ox + ka.x * sc, oy + ka.y * sc); c.lineTo(ox + kb.x * sc, oy + kb.y * sc); }
        c.stroke(); c.setLineDash([]);
        const b = p._box; if (b) { c.fillStyle = c.strokeStyle; c.font = '10px ui-monospace,monospace'; c.fillText((p.score ?? 0).toFixed(2), ox + b.x0 * sc, oy + b.y0 * sc - 3); } }
      const d = s._diag || {}, low = d.low || 0;
      st.innerHTML = s.video.readyState < 2 ? 'la cámara todavía no da imagen…' : !DET.detector ? (DET.error ? 'modelo con error: ' + esc(DET.error) : 'cargando el modelo…')
        : `<b style="color:#69f0b0">${nOk}</b> cuerpo${nOk === 1 ? '' : 's'} en uso` + (nIgn ? ` · <b style="color:#ff6b6b">${nIgn}</b> en zona ignorada` : '') + (nExtra ? ` · <b style="color:#ffd166">${nExtra}</b> fuera del máximo (${P.track.maxPoses})` : '') + (low ? ` · <span style="color:#aaa">${low} con poca confianza (gris)</span>` : '')
          + ` · ${d.tiles || 1} parte${(d.tiles || 1) > 1 ? 's' : ''} · ${Math.round(d.ms || 0)} ms` + (nOk === 0 && low ? '<br>Hay cuerpos en gris: bajá la "confianza del cuerpo" o subí la sensibilidad.' : nOk === 0 && !low ? '<br>El modelo no encuentra a nadie: probá sensibilidad "máxima", más luz sobre los bailarines o la exposición dinámica (abajo).' : '');
    };
    this.liveFns.push(draw); draw();
    this.kv(gt, [['modelo', (modelBase ? 'local (vendor/movenet)' : 'descargado') + (DET.single ? ' · SinglePose (1 cuerpo)' : ' · MultiPose')]]);
    this.note(gt, 'Verde: cuerpo en uso. Amarillo punteado: detectado pero fuera del máximo de cuerpos (con 1, el programa se queda con el bailarín que viene siguiendo). Rojo: zona ignorada. Gris: el modelo lo vio con poca confianza y se descarta. La imagen es la que recibe el modelo, ya con la exposición y los niveles de abajo. Las líneas punteadas azules son las partes en que se corta la imagen. Lo más fiable en sala oscura: luz sobre los bailarines que no pegue en las paredes, o cámara con infrarrojo.');
  },
  /* imagen que recibe el detector: exposición dinámica, negros, blancos, medios tonos */
  imgGroup(body){
    const s = sources[Calib.zone] || sources[0], d = P.det;
    const g = this.group(body, 'Imagen para la detección: exposición, blancos y negros', { desc:'Corrige solo la imagen que analiza el modelo (no lo que se proyecta). Dinámica: mide dónde están los cuerpos y ajusta negros, blancos y medios tonos solos, para que el cuerpo quede en un gris medio aunque cambie la luz de la proyección.' });
    this.select(g, d, 'expo', [['auto', 'dinámica (automática)'], ['manual', 'manual (fija)']], 'exposición', () => this.refresh('camaras'));
    if (d.expo === 'auto') {
      this.range(g, d, 'target', .2, .7, .01, 'brillo buscado del cuerpo');
      this.range(g, d, 'speed', .1, 4, .05, 'reacción (s, más = más lenta)');
      this.select(g, d, 'meter', [['auto', 'cuerpos (o el piso si no hay nadie)'], ['cuerpos', 'solo cuerpos'], ['piso', 'piso de la sala (calibración)'], ['todo', 'toda la imagen']], 'medir en');
      const st = document.createElement('div'); st.className = 'kv'; g.appendChild(st);
      this.liveFns.push(() => { const lv = s?._lv, m = s?._meter; st.innerHTML = lv ? `negros <b>${lv.black.toFixed(2)}</b> · blancos <b>${lv.white.toFixed(2)}</b> · medios <b>${lv.gamma.toFixed(2)}</b>` + (m ? `<br>medido en: <b>${m.mode}</b> · mediana ${m.med.toFixed(2)}` : '') : 'midiendo…'; });
      this.buttons(g, [['Fijar estos valores (pasar a manual)', () => { const lv = s?._lv; if (lv) Object.assign(d, { black:+lv.black.toFixed(3), white:+lv.white.toFixed(3), gamma:+lv.gamma.toFixed(3), light:1 }); d.expo = 'manual'; Sessions.touch(); this.refresh('camaras'); }]]);
    } else {
      this.range(g, d, 'light', .5, 4, .05, 'exposición (ganancia)');
      this.range(g, d, 'black', 0, .6, .005, 'negros (punto negro)', v => { if (d.white < v + .05) d.white = Math.min(1, v + .05); });
      this.range(g, d, 'white', .1, 1, .005, 'blancos (punto blanco)', v => { if (d.black > v - .05) d.black = Math.max(0, v - .05); });
      this.range(g, d, 'gamma', .4, 3, .01, 'medios tonos (más = más claro)');
      this.buttons(g, [['Neutro', () => { Object.assign(d, { light:1, black:0, white:1, gamma:1 }); Sessions.touch(); this.refresh('camaras'); }], ['Sala oscura', () => { Object.assign(d, { light:1, black:.02, white:.45, gamma:1.5 }); Sessions.touch(); this.refresh('camaras'); }]]);
    }
    this.toggle(g, d, 'gray', 'quitar color (luz de proyección teñida)');
    this.note(g, 'Negros: lo que esté por debajo pasa a negro puro (saca el gris de la sala). Blancos: lo que esté por encima pasa a blanco (con poca luz, bajalo para estirar la imagen). Medios tonos aclara u oscurece el cuerpo sin tocar los extremos. Mirá el resultado en la vista previa de arriba.');
  },
  /* la cámara física: lo que el navegador deje tocar */
  hwGroup(body){
    const s = sources[Calib.zone] || sources[0]; if (!s || !s.stream) return;
    const g = this.group(body, `Cámara física · ${s.label}`, { closed:!s.hw, desc:'Ajustes del propio dispositivo. Para detectar en sala con proyección conviene exposición manual fija (la automática de la cámara "respira" con cada cambio de imagen) y corregir el resto con la exposición dinámica de arriba.' });
    const caps = camCaps(s), set = camSettings(s); let n = 0;
    for (const [key, label] of CAM_HW) { const cp = caps[key]; if (cp === undefined) continue; n++;
      if (Array.isArray(cp)) { if (!cp.length) { n--; continue; } const o = { v:set[key] ?? cp[0] }; const names = { manual:'manual (fija)', continuous:'automática continua', 'single-shot':'automática una vez', none:'ninguno' };
        this.select(g, o, 'v', cp.map(x => [x, names[x] || x]), label, v => setCamHW(s, key, v).then(() => this.refresh('camaras'))); }
      else if (typeof cp === 'object' && cp.max !== undefined) { const st = cp.step || (cp.max - cp.min) / 100 || 1, o = { v:set[key] ?? cp.min };
        this.range(g, o, 'v', cp.min, cp.max, st, label, v => { clearTimeout(this._hwT); this._hwT = setTimeout(() => setCamHW(s, key, v), 120); }); } }
    if (!n) { this.note(g, 'Esta cámara no le da ajustes al navegador (pasa seguido en Mac). Fijá la exposición y el balance de blancos con el programa del fabricante (Logi Tune / G HUB, etc.) o desde OBS: Propiedades del dispositivo → Configurar video. Lo que fijes ahí queda en el driver y Mirador lo respeta.'); return; }
    this.buttons(g, [['Todo automático', async () => { await camHWAuto(s); this.refresh('camaras'); }]]);
    this.note(g, 'Tiempo de exposición largo = más luz pero más estela en el movimiento. Si los bailarines se ven borrosos, bajalo y subí ganancia/ISO o la exposición dinámica. Se guarda en la sesión.');
  },
  tab_camaras(body){
    if (!simMode) { this.detGroup(body); this.imgGroup(body); this.hwGroup(body); }
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
    const gc = this.group(body, 'Calibrar cámara a las paredes (K)', { closed:!(sources[Calib.zone]?.cal?.enabled || Calib.on), desc:'La cámara fija ve la sala en perspectiva. Se marcan dos líneas como las celestes de la foto: arriba el borde superior de las paredes y abajo la base, con un vértice en cada esquina. Cada tramo es una pared del lienzo.' });
    if (sources.length > 1) { const zs = {}; sources.forEach((s, i) => zs[i] = `zona ${i + 1} · ${s.label}`); this.select(gc, Calib, 'zone', zs, 'zona', () => this.refresh('camaras')); }
    const cs = sources[Calib.zone] || sources[0];
    if (cs) { if (!cs.cal) cs.cal = salaCal(); cs.cal = normCal(cs.cal); const cal = cs.cal, upd = () => { calPrepare(cs); clearFeedback(); };
      this.toggle(gc, cal, 'enabled', 'usar calibración', upd);
      this.select(gc, cal, 'mode', [['piso', 'piso: la figura se para en la pared que tiene detrás'], ['vista', 'vista: reproyecta lo que ve la cámara']], 'modo', () => { upd(); this.refresh('camaras'); });
      if (cal.mode !== 'vista') { this.range(gc, cal, 'figH', .2, 1.2, .01, 'altura de la figura', upd); this.range(gc, cal, 'base', .5, 1.1, .005, 'altura del piso', upd); this.range(gc, cal, 'depth', 0, 1, .01, 'más chica lejos de la pared', upd); }
      const nt = { n:cal.top.length - 1 }; this.range(gc, nt, 'n', 1, 8, 1, 'tramos (paredes)', v => { Calib.setTramos(v); this.refresh('camaras'); });
      const nw = wallRanges().length; this.toggle(gc, cal, 'useWalls', nw ? `ancho según las paredes (${nw})` : 'ancho según las paredes', () => { upd(); this.refresh('camaras'); });
      if (!(cal.useWalls && nw === cal.top.length - 1)) cal.shares.forEach((_, i) => this.range(gc, cal.shares, i, 0, 10, .1, `tramo ${i + 1}: peso`, upd));
      this.buttons(gc, [[Calib.on ? 'Cerrar vista (K)' : 'Abrir vista de calibración (K)', () => Calib.toggle(), Calib.on ? 'on' : 'primary'], ['Valores de la foto', () => { Calib.reset(); this.refresh('camaras'); }]]);
      this.buttons(gc, [['+ zona ignorada', () => { Calib.addIgnore(); this.refresh('camaras'); }], ['Quitar zonas ignoradas', () => { Calib.clearIgnore(); this.refresh('camaras'); }]]);
      this.note(gc, '<b style="color:var(--sync)">Más fácil: pestaña Sincronizar</b> mide estas líneas solas con la cámara, proyectando puntos.');
      this.note(gc, `En la vista: arrastrá los puntos verdes (líneas), el amarillo (cámara en el piso, fuera de cuadro) y los rojos (zona ignorada: el operador sentado abajo a la izquierda). Cada bailarín muestra la recta que lo lleva a su pared. Zonas ignoradas: <b>${cal.ignore.length}</b>.`);
      if (cal.enabled) this.note(gc, 'Con calibración, el video de cámara no se dibuja sobre las paredes y la silueta sale del esqueleto.'); }
    sources.forEach((src, i) => { const gz = this.group(body, `Zona ${i + 1} · ${src.label}`, { closed:LAYOUT.orient !== 'libre' });
      const mir = { v:zoneMirror(src) }; this.toggle(gz, mir, 'v', 'espejo', v => { src.mirror = v; Sessions.touch(); });
      if (LAYOUT.orient === 'libre') { if (!src.rect) src.rect = defaultRect(i, sources.length); const r = src.rect; const upd = () => { layoutCells(); clearFeedback(); };
        this.range(gz, r, 'x', 0, 1, .005, 'izquierda', upd); this.range(gz, r, 'w', .05, 1, .005, 'ancho', upd); this.range(gz, r, 'y', 0, 1, .005, 'arriba', upd); this.range(gz, r, 'h', .05, 1, .005, 'alto', upd); }
      this.kv(gz, [['video', src.video.videoWidth ? `${src.video.videoWidth}×${src.video.videoHeight}` : '—'], ['cuerpos', [...bodies.values()].filter(b => b.src === src.id).length]]); });
    const gv = this.group(body, 'Video de cámara en la imagen', { closed:true });
    this.toggle(gv, P.cam, 'mirror', 'espejo (general)'); this.toggle(gv, P.cam, 'showVideo', 'mostrar video'); this.range(gv, P.cam, 'videoOpacity', 0, 1, .01, 'opacidad'); this.range(gv, P.cam, 'contrast', 0, 3, .01, 'contraste'); this.range(gv, P.cam, 'brightness', 0, 3, .01, 'brillo'); this.range(gv, P.cam, 'saturate', 0, 3, .01, 'saturación');
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
  color(parent, obj, key, label){ const r = this.row(parent, label); r.classList.add('wide'); const i = document.createElement('input'); i.type = 'color'; i.value = obj[key]; i.style.cssText = 'width:64px;height:28px;padding:0;border:0;background:none';
    const t = document.createElement('input'); t.type = 'text'; t.value = obj[key]; t.style.width = '84px'; t.className = 'num';
    const set = v => { if (!/^#[0-9a-f]{6}$/i.test(v)) return; obj[key] = v.toLowerCase(); i.value = obj[key]; t.value = obj[key]; Sessions.touch(); };
    i.oninput = () => set(i.value); t.onchange = () => set(t.value.trim()); r.appendChild(i); r.appendChild(t); return r; },
  /* zoom de la imagen proyectada */
  viewGroup(body){
    const V = P.view, g = this.group(body, 'Zoom de la imagen proyectada', { closed:V.zoom === 1 && !V.x && !V.y, desc:'Agranda o achica todo lo que se proyecta (módulos, figuras, ecos) alrededor del centro, y lo corre. Se aplica antes de las esquinas (keystone) y del mosaico, y se guarda en la sesión. Teclas: + / − zoom, Z vuelve a 1.' });
    this.range(g, V, 'zoom', .25, 4, .01, 'zoom'); this.range(g, V, 'x', -1, 1, .001, 'correr ← →'); this.range(g, V, 'y', -1, 1, .001, 'correr ↓ ↑');
    this.buttons(g, [['1×', () => { Object.assign(V, { zoom:1, x:0, y:0 }); Sessions.touch(); this.refresh('proyeccion'); }], ['1,25×', () => { V.zoom = 1.25; Sessions.touch(); }], ['1,5×', () => { V.zoom = 1.5; Sessions.touch(); }], ['2×', () => { V.zoom = 2; Sessions.touch(); }]]);
  },
  /* colorimetría de todo lo proyectado */
  colorGroup(body){
    const C = P.color, g = this.group(body, 'Colorimetría de todo lo proyectado', { closed:C.mode === 'libre' && !C.test, desc:'Etapa final, después de todos los módulos: lo que se fije acá vale para todas las plantillas y sesiones de la misma manera. "Absoluto" pasa toda la imagen a un solo color (solo cambia el brillo); "gradiente" va de un color de sombra a uno de luz.' });
    this.select(g, C, 'mode', [['libre', 'libre (los colores de cada plantilla)'], ['absoluto', 'absoluto: un solo color'], ['gradiente', 'gradiente: sombra → luz']], 'modo', () => this.refresh('proyeccion'));
    if (C.mode !== 'libre') { this.color(g, C, 'c1', C.mode === 'absoluto' ? 'color' : 'color de luz'); if (C.mode === 'gradiente') this.color(g, C, 'c0', 'color de sombra'); this.range(g, C, 'mix', 0, 1, .01, 'cuánto se aplica'); }
    this.range(g, C, 'exposure', 0, 3, .01, 'exposición'); this.range(g, C, 'contrast', 0, 3, .01, 'contraste'); this.range(g, C, 'sat', 0, 2, .01, 'saturación');
    this.range(g, C, 'gamma', .3, 3, .01, 'gamma de salida'); this.range(g, C, 'black', 0, .3, .001, 'nivel de negro'); this.range(g, C, 'white', .2, 1, .001, 'blanco máximo');
    this.range(g, C, 'r', 0, 1.5, .005, 'balance: rojo'); this.range(g, C, 'g', 0, 1.5, .005, 'balance: verde'); this.range(g, C, 'b', 0, 1.5, .005, 'balance: azul');
    this.toggle(g, C, 'oneHue', 'mismo color para todos los cuerpos', () => this.refresh('proyeccion')); if (C.oneHue) this.hue(g, C, 'bodyHue', 'tono de los cuerpos');
    this.toggle(g, C, 'lockAudioHue', 'el audio no cambia el color');
    this.toggle(g, C, 'test', 'patrón de color (grises, primarios, negros)');
    this.buttons(g, [['Neutro', () => { Object.assign(C, deepClone(P_DEFAULT.color), { segs:C.segs }); Sessions.touch(); this.refresh('proyeccion'); }], ['Igualar tramos', () => { C.segs = []; colorSegments(); Sessions.touch(); this.refresh('proyeccion'); }]]);
    const segs = colorSegments(), gs = this.group(body, 'Colorimetría por pared / proyector', { closed:!C.test, desc:'Para que las paredes (o los proyectores) den el mismo color: con el patrón de color encendido, mirá las paredes y bajá brillo o canales en la que se vea más fuerte. Nivel de negro sube el negro de un proyector para igualarlo con otro más lavado.' });
    segs.forEach(sg => { const h = document.createElement('div'); h.className = 'note'; h.innerHTML = `<b>${esc(sg.nombre)}</b>`; gs.appendChild(h);
      this.range(gs, sg.c, 'gain', 0, 1.5, .005, 'brillo'); this.range(gs, sg.c, 'black', 0, .2, .001, 'nivel de negro');
      this.range(gs, sg.c, 'r', 0, 1.5, .005, 'rojo'); this.range(gs, sg.c, 'g', 0, 1.5, .005, 'verde'); this.range(gs, sg.c, 'b', 0, 1.5, .005, 'azul'); });
    this.note(gs, 'Para colorimetría estable de verdad, además: los 7 proyectores en el mismo modo de imagen (sRGB/Rec.709, 6500 K), sin contraste dinámico ni iris automático, y Windows sin "color automático"/HDR en esa salida. Ver README.');
  },
  tab_proyeccion(body){
    const g = this.group(body, 'Formato de salida', { desc:'Tamaño de la imagen que se proyecta. Con formato fijo, en esta ventana se ve a escala (previsualización); a tamaño real cuando la ventana mide eso (lanzadores).' });
    const fmt_ = { mode:OUT.mode === 'ventana' ? 'ventana' : (/^\d+x\d+$/.test(OUT.mode) ? OUT.mode : 'custom') };
    const applyFmt = () => { if (fmt_.mode === 'custom') setOutputFormat('custom', +cw.value, +ch.value); else setOutputFormat(fmt_.mode); resize(); buildRefBuffer(); Sessions.touch(); this.refresh(); };
    this.select(g, fmt_, 'mode', [['ventana', 'esta ventana'], ['8400x690', 'Sala: 8400 × 690 (Oeste · Norte · Este)'], ['1920x1080', '1920 × 1080'], ['3840x1080', '3840 × 1080 (2 proyectores)'], ['5760x1080', '5760 × 1080 (3)'], ['13440x1080', '13440 × 1080 (7 proyectores)'], ['13480x1080', '13480 × 1080 (7 + 40 px)'], ['custom', 'otro…']], 'formato', applyFmt);
    const r = this.row(g, 'medidas'); const cw = document.createElement('input'); cw.type = 'number'; cw.value = OUT.w; const ch = document.createElement('input'); ch.type = 'number'; ch.value = OUT.h; cw.disabled = ch.disabled = fmt_.mode !== 'custom'; cw.onchange = ch.onchange = applyFmt; r.appendChild(cw); r.appendChild(ch);
    this.kv(g, [['salida', `${outputSize().w} × ${outputSize().h}`], ['render interno', `${W} × ${H} (×${DPR.toFixed(2)})`], ['tope GPU', `${MAX_TEX} px`]]);
    if (outputSize().w * 1 > MAX_TEX) { const w = document.createElement('div'); w.className = 'warnbox'; w.textContent = `La GPU no puede renderizar más de ${MAX_TEX} px de ancho: la imagen se escala internamente.`; g.appendChild(w); }
    this.viewGroup(body); this.colorGroup(body);
    const gp = this.group(body, 'Proyectores', { desc:'Franjas numeradas en el patrón de ajuste para alinear cada proyector. El fundido suaviza los bordes entre franjas si hay solape.' });
    this.range(gp, P.map, 'slices', 1, 12, 1, 'cantidad'); this.range(gp, P.map, 'blend', 0, .5, .005, 'fundido de bordes'); this.toggle(gp, P.map, 'testGrid', 'patrón de ajuste'); this.toggle(gp, P.map, 'blackout', 'negro (B)');
    const gw_ = this.group(body, 'Paredes de la sala (lienzo)', { desc:'El lienzo es la suma de las paredes, de izquierda a derecha (Oeste = izquierda, Este = derecha). El patrón de ajuste muestra cada pared con su nombre.' });
    const reW = () => { calPrepare && sources.forEach(calPrepare); Sessions.touch(); this.refresh(); };
    this.toggle(gw_, P.map, 'useWalls', 'usar paredes', reW);
    (P.map.walls || []).forEach((w, i) => { const r = this.row(gw_, `pared ${i + 1}`); const nm = document.createElement('input'); nm.type = 'text'; nm.value = w.nombre; const wd = document.createElement('input'); wd.type = 'number'; wd.value = w.w;
      nm.onchange = () => { w.nombre = nm.value; reW(); }; wd.onchange = () => { w.w = Math.max(1, +wd.value | 0); reW(); }; r.appendChild(nm); r.appendChild(wd); });
    this.range(gw_, P.map, 'wallH', 100, 2160, 1, 'alto de las paredes', reW);
    this.buttons(gw_, [['+ pared', () => { P.map.walls.push({ nombre:'Pared ' + (P.map.walls.length + 1), w:1920 }); reW(); }], ['− pared', () => { P.map.walls.pop(); reW(); }],
      [`Lienzo = ${wallsTotal()} × ${P.map.wallH}`, () => { setOutputFormat(`${wallsTotal()}x${P.map.wallH}`); resize(); buildRefBuffer(); Sessions.touch(); this.refresh(); }, 'primary']]);
    this.buttons(gw_, [['Sala Mirador (3175 · 1775 · 3450 × 690)', () => { aplicarSala(); this.refresh(); }]]);
    const gm = this.group(body, 'Salida 8K a splitter (mosaico)', { closed:!P.map.mosaic, desc:'Para una sola salida de video (p. ej. 7680×4320) que un splitter reparte en proyectores Full HD: el panorama se corta en franjas (una por proyector) y cada una va a su baldosa del cuadro grande.' });
    const reM = () => { resize(); buildRefBuffer(); Sessions.touch(); this.refresh(); };
    this.toggle(gm, P.map, 'mosaic', 'activar mosaico', reM);
    this.select(gm, P.map, 'mosMode', [['paredes', 'una baldosa por pared'], ['franjas', 'franjas iguales (proyectores)']], 'baldosas', reM);
    const szM = { v:`${P.map.mosW}x${P.map.mosH}` }; this.select(gm, szM, 'v', [['7680x4320', '7680 × 4320 (8K)'], ['7680x2160', '7680 × 2160 (8K ancho, 2 filas)'], ['3840x2160', '3840 × 2160 (4K: 2×2 Full HD)'], ['custom', 'otro (editar abajo)']], 'cuadro de salida', v => { const m = v.match(/^(\d+)x(\d+)$/); if (m) { P.map.mosW = +m[1]; P.map.mosH = +m[2]; } reM(); });
    this.range(gm, P.map, 'mosW', 1920, 16384, 1, 'ancho del cuadro', reM); this.range(gm, P.map, 'mosH', 1080, 16384, 1, 'alto del cuadro', reM);
    this.range(gm, P.map, 'tileW', 320, 3840, 1, 'ancho de baldosa', reM); this.range(gm, P.map, 'tileH', 180, 2160, 1, 'alto de baldosa', reM);
    this.range(gm, P.map, 'mosCols', 1, 8, 1, 'baldosas por fila', reM);
    this.select(gm, P.map, 'mosOrder', [['filas', 'de izquierda a derecha, fila por fila'], ['columnas', 'de arriba a abajo, columna por columna']], 'orden', reM);
    const mp = this.text(gm, P.map, 'mosMap', 'mapa a mano', true); mp.placeholder = 'una baldosa por línea (vacío = automático):\nx,y   ó   sx,sy,sw,sh > x,y[,w,h]\n(sx,sy,sw,sh en px del lienzo; x,y,w,h en px del cuadro)'; mp.onchange = () => { P.map.mosMap = mp.value; reM(); };
    this.toggle(gm, P.map, 'mosPreview', 'ver panorama (no el mosaico)', reM);
    const tl = mosaicTiles(); this.kv(gm, [['baldosas', tl.map(t => `${t.nombre || t.i + 1} ${t.w}×${t.h} en (${t.x},${t.y})`).join(' · ')], ['cuadro', `${P.map.mosW} × ${P.map.mosH}` + (P.map.mosW > MAX_TEX || P.map.mosH > MAX_TEX ? ' · supera el tope de la GPU' : '')]]);
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
  /* =================== Sincronizar (naranja): proyección ↔ cuerpos reales =================== */
  tab_sync(body){
    const s = sources[Calib.zone] || sources[0];
    if (!s) { this.note(body, 'Sin cámara.'); return; }
    if (sources.length > 1) { const g0 = this.group(body, 'Cámara'); g0.parentElement.classList.add('sync'); const zs = {}; sources.forEach((x, i) => zs[i] = `zona ${i + 1} · ${x.label}`); this.select(g0, Calib, 'zone', zs, 'sincronizar', () => this.refresh('sync')); }
    if (!s.cal) { s.cal = salaCal(); calPrepare(s); } s.cal = normCal(s.cal); const cal = s.cal, upd = () => { calPrepare(s); clearFeedback(); Sessions.touch(); };
    // 1) automática con la cámara
    const ga = this.group(body, '1 · Sincronizar con la cámara (automático)', { desc:'Mirador toma la cámara conectada, proyecta puntos blancos sobre cada pared y los busca en la imagen. Así aprende dónde cae cada parte de la proyección vista por la cámara, y los esqueletos aparecen donde están los cuerpos.' });
    ga.parentElement.classList.add('sync');
    this.note(ga, 'Antes: sala lo más oscura posible, nadie delante de las paredes, la cámara en su lugar definitivo y la proyección ya alineada (formato, esquinas, zoom). Tarda unos segundos; la proyección se pone negra con puntos. <b>Esc</b> cancela.');
    const O = Sync.opts;
    this.select(ga, O, 'cols', [[2, '2'], [3, '3'], [4, '4'], [5, '5']], 'puntos a lo ancho (por pared)');
    this.select(ga, O, 'rows', [[2, '2'], [3, '3']], 'puntos a lo alto');
    this.range(ga, O, 'radius', .015, .12, .005, 'tamaño de los puntos');
    this.range(ga, O, 'wait', 200, 1500, 10, 'espera por punto (ms)');
    this.buttons(ga, [['▶ Sincronizar ahora', () => Sync.run(s), 'sync']]);
    const box = document.createElement('div'); box.className = 'syncbox'; ga.appendChild(box);
    const L = Sync.last, sy = cal.synced, vw = s.video.videoWidth || 1280;
    if (L) box.innerHTML = `<b>Última sincronización</b>: ${L.okN} de ${L.n} ${L.n === 1 ? 'tramo' : 'paredes'}, ${L.total}/${L.de} puntos vistos.<br>` + L.report.map(r => `${esc(r.nombre)}: ${r.vistos}/${r.de} ` + (r.ok ? `<span class="ok">✓</span> error ${(r.err * vw).toFixed(1)} px` : '<span class="bad">sin datos (quedó la calibración anterior)</span>')).join('<br>')
      + (L.mismatch > .02 ? `<br><span class="bad">Las esquinas entre paredes no coinciden (${(L.mismatch * 100).toFixed(1)} % de la imagen): ¿la proyección cruza una esquina? Revisá el formato o las esquinas.</span>` : '');
    else if (sy) box.innerHTML = `<b>Sincronizado</b> el ${new Date(sy.t).toLocaleString()} · ${sy.okN} de ${sy.n} ${sy.n === 1 ? 'tramo' : 'paredes'}.`;
    else box.innerHTML = '<b>Sin sincronizar.</b> La calibración actual viene de la foto de referencia de la sala; si la cámara o la proyección no están exactamente así, los esqueletos no caen sobre los cuerpos.';
    if (Sync.stale(s)) box.innerHTML += '<br><span class="bad">Cambiaste el zoom, el corrimiento o las esquinas después de sincronizar: volvé a sincronizar.</span>';
    // 2) verificación
    const gv = this.group(body, '2 · Verificar', { desc:'La cámara, llevada a la proyección con la sincronización: si las paredes y los bordes proyectados coinciden con los reales, está bien. Con gente en la sala, la imagen de cada persona tiene que caer sobre su sombra.' });
    gv.parentElement.classList.add('sync');
    const ov = { v:Sync.overlay }; this.toggle(gv, ov, 'v', 'ver la cámara sobre la proyección (S)', v => { Sync.overlay = v; });
    this.range(gv, Sync, 'overlayAlpha', .1, 1, .01, 'opacidad');
    const ve = { v:verEsqueletos }; this.toggle(gv, ve, 'v', 'ver esqueletos encima de todo (E)', v => { verEsqueletos = v; });
    const live = document.createElement('div'); live.className = 'syncbox'; gv.appendChild(live);
    this.liveFns.push(() => { const now = performance.now(), rows = [];
      for (const [id, d] of s._calDbg || []) { if (now - d.t > 600) continue; rows.push(`cuerpo ${esc(String(id).split(':').pop())}: <b>${esc(d.wall || '—')}</b> · posición ${(d.u * 100).toFixed(0)} % del ancho · alto ${(d.h * 100).toFixed(0)} % de la pared · ${d.mode === 'real' ? 'altura real' : d.mode === 'camara' ? 'como la cámara' : 'fija'}`); }
      live.innerHTML = rows.length ? rows.join('<br>') : 'Sin cuerpos en la cámara (o la calibración está apagada).'; });
    // 3) ajuste fino
    const gf = this.group(body, '3 · Ajuste fino: posición, altura y tamaño', { desc:'Para terminar de calzar las figuras con los cuerpos reales. Se guarda en la sesión, por cámara.' });
    gf.parentElement.classList.add('sync');
    this.toggle(gf, cal, 'enabled', 'usar la sincronización', upd);
    this.select(gf, cal, 'mode', [['piso', 'piso: la figura parada en la pared, detrás del cuerpo'], ['vista', 'vista: exactamente como lo ve la cámara (sombra)']], 'modo', () => { upd(); this.refresh('sync'); });
    if (cal.mode !== 'vista') {
      const K = s._calK, okK = K && K.ok;
      this.select(gf, cal, 'size', [['real', 'altura real de cada persona' + (okK ? '' : ' (falta profundidad: usa "cámara")')], ['camara', 'como la ve la cámara'], ['fija', 'todas iguales']], 'tamaño de la figura', () => { upd(); this.refresh('sync'); });
      this.range(gf, cal, 'scale', .3, 2.5, .01, 'tamaño', upd);
      if (cal.size === 'fija') { this.range(gf, cal, 'figH', .2, 1.2, .01, 'alto de la figura', upd); this.range(gf, cal, 'depth', 0, 1, .01, 'más chica lejos', upd); }
      this.range(gf, cal, 'base', .5, 1.15, .005, 'altura (línea del piso)', upd);
    }
    if (cal.mode !== 'vista') this.toggle(gf, cal, 'centerAuto', 'punto de la cámara en el piso: automático', () => { upd(); this.refresh('sync'); });
    this.range(gf, cal, 'dx', -.5, .5, .001, 'correr ← →', upd);
    this.range(gf, cal, 'spread', .3, 3, .005, 'separación entre cuerpos', upd);
    this.buttons(gf, [['Restablecer ajuste fino', () => { Object.assign(cal, { scale:1, dx:0, spread:1, base:.97, size:'real' }); upd(); this.refresh('sync'); }], ['Líneas a mano (K)', () => Calib.toggle()]]);
    this.note(gf, '<b>Separación</b>: si los esqueletos salen amontonados respecto de las personas, subila; si salen más abiertos, bajala. <b>Altura</b>: dónde apoyan los pies. <b>Tamaño</b>: multiplica el alto de todas las figuras. Con "altura real" una persona de 1,70 m en una pared de 2,50 m ocupa ~68 % del alto, esté donde esté.');
  },
  tab_sistema(body){
    const g = this.group(body, 'Rendimiento');
    const pr = { v:Object.keys(PROFILES).find(k => PROFILES[k].name === prof.name) || 'medida' };
    this.select(g, pr, 'v', [['ligero', 'Ligero'], ['equilibrado', 'Equilibrado'], ['completo', 'Completo'], ['medida', 'A medida']], 'perfil', v => { if (PROFILES[v]) { applyProfile(PROFILES[v]); buildRefBuffer(); resize(); } this.refresh(); });
    this.select(g, P.perf, 'targetFps', [[24, '24 fps'], [30, '30 fps'], [45, '45 fps'], [60, '60 fps']], 'fps mínimo'); this.toggle(g, P.perf, 'autoScale', 'adaptar solo');
    this.range(g, prof, 'renderScale', .3, 1.5, .05, 'resolución interna', resize); this.range(g, P.perf, 'scene2d', .3, 1, .05, 'resolución capa 2D', resize); this.range(g, prof, 'gridN', 64, 320, 4, 'densidad de puntos', buildRefBuffer); this.range(g, prof, 'inferHz', 15, 60, 1, 'inferencia (Hz)'); this.range(g, prof, 'bloomIter', 1, 3, 1, 'pasadas de bloom');
    this.buttons(g, [['Volver a medir', async () => { const r = await benchmark(); toast(`medido · p95 ${r.p95.toFixed(1)} ms (~${Math.round(1000 / r.p95)} fps a tope)`); }]]);
    const info = this.kv(g, []); this.liveFns.push(() => { info.innerHTML = `GPU: <b>${esc(gpuName())}</b><br>render: <b>${W}×${H}</b> · capa 2D <b>${scene.width}×${scene.height}</b> · máscara <b>${MASK_W}×${MASK_H}</b><br>inferencia: <b>${inferBudgetMs.toFixed(0)} ms</b> · cuerpos: <b>${bodies.size}</b> · modelo: <b>${simMode ? 'simulación' : (modelBase ? 'local' : 'tfhub')}</b>`; });
    const gk = this.group(body, 'Teclas', { closed:true });
    this.kv(gk, [['H', 'panel'], ['F', 'pantalla completa'], ['C', 'mover esquinas'], ['K', 'calibrar cámara por tramos'], ['B', 'negro'], ['Shift+B', 'aprender fondo'], ['X', 'limpiar ecos'], ['V', 'rotar cámaras'], ['R', 'grabar / parar'], ['M', 'micrófono sí/no'], ['Espacio', 'canción play/pausa'], ['↑ / ↓', 'canción anterior / siguiente'], ['1‑9, 0', 'plantillas'], ['G / L', 'exportar / importar sesión'], ['Esc / ⌫', 'diapositivas']]);
    const gd = this.group(body, 'Diagnóstico', { closed:true });
    this.kv(gd, [['WebGL VTF', EXT_VTF ? 'sí' : 'no (sin niebla/líneas/empuje)'], ['MAX_TEXTURE_SIZE', MAX_TEX], ['TF.js', typeof tf !== 'undefined' ? tf.version_core || 'ok' : 'no cargado'], ['backend', typeof tf !== 'undefined' && tf.getBackend ? (tf.getBackend() || '—') : '—'], ['memoria', (navigator.deviceMemory || '?') + ' GB'], ['hilos', navigator.hardwareConcurrency || '?']]);
    this.buttons(gd, [['Limpiar ecos y pintura', () => { clearFeedback(); if (paint.ctx) paint.ctx.clearRect(0, 0, paint.cv.width, paint.cv.height); }], ['Recargar programa', () => location.reload(), 'danger']]);
  },
};
function fmt(v){ return typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : (Number.isInteger(v) ? String(v) : v.toFixed(v < 1 ? 3 : 2))) : String(v); }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
