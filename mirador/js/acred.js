"use strict";
/* =====================================================================
   MIRADOR — aplicación "Acreditaciones FLAT"   (index.html?app=acreditaciones)
   Usa todo lo de Mirador tal cual: cámara, detección, calibración de la
   cámara a las paredes, sincronización, sesiones y la ventana de SALIDA.
   Lo que cambia es la SALIDA: en vez de la imagen de Mirador se abre
   acreditaciones-salida.html (página de acreditaciones de FLAT en la pared
   del medio + partículas en las tres paredes).

   Esta ventana (control) calcula dónde está cada persona en el PISO de la
   sala y lo manda por BroadcastChannel en cada cuadro. Con la calibración
   de tres tramos (Oeste · Norte · Este), la base de las paredes en la
   imagen de la cámara da una homografía imagen → piso:
       x = a lo ancho (0 pared Oeste … 1 pared Este)
       z = distancia a la pared Norte (px del lienzo)
   Con eso la salida modifica, en cada pared, la parte que la persona
   tiene al lado: la profundidad en la sala decide qué parte de Oeste y de
   Este reacciona.
   ===================================================================== */
const Acred = {
  on:urlParams.get('app') === 'acreditaciones', ch:null, estado:null, gente:[], URL:'acreditaciones-salida.html',
  init(){
    if (!this.on) return;
    document.title = 'Mirador · Acreditaciones FLAT (control)';
    try { this.ch = new BroadcastChannel('mirador-acred'); } catch (e) {}
    if (this.ch) this.ch.onmessage = e => { const d = e.data || {};
      if (d.k === 's') this.estado = Object.assign(d, { t:performance.now() });
      else if (d.k === 'key') window.dispatchEvent(new KeyboardEvent('keydown', { key:d.key, shiftKey:!!d.shift })); };
    UI.TABS.unshift(['acred', 'Acreditaciones']); UI.tab = 'acred';
    /* la ventana de salida es la página de acreditaciones (mismo nombre de ventana y mismo título que la de Mirador) */
    Salida.open = function(){
      let w = null;
      try { w = window.open(Acred.URL + '?ajuste=' + (STRETCH ? 'estirar' : 'contener'), this.NAME, 'popup=yes,width=1920,height=1080,left=40,top=40'); } catch (e) {}
      if (!w) { toast('El navegador bloqueó la ventana de salida: permití las ventanas emergentes para 127.0.0.1 y apretá O.', 7000); return false; }
      this.win = w; this.mode = 'acred'; this.video = this.cv = this.ctx = null; document.body.classList.add('dos-ventanas'); this.refresh(); return true;
    };
  },
  /* hay que mostrar la imagen de Mirador en la salida (tapa la página y las partículas) */
  overlay(){ return !!(P.acred.verMirador || (typeof Sync !== 'undefined' && Sync.running) || P.map.testGrid || P.map.calibrate || P.map.blackout || P.color.test); },
  /* con el panel cerrado no hace falta dibujar la imagen de Mirador: la placa queda para las partículas */
  lite(){ return this.on && P.acred.ahorrar && document.body.classList.contains('panel-hidden') && !this.overlay() && !(typeof Calib !== 'undefined' && Calib.on); },
  /* homografía imagen de la cámara (px) → piso de la sala. Hace falta la calibración de tres tramos. */
  piso(src){
    const B = src._calB, ws = wallRanges(); if (!src._calH || !B || B.length !== 4 || ws.length !== 3) return null;
    const H = computeHomography(B, [{ x:0, y:ws[0].w }, { x:0, y:0 }, { x:ws[1].w, y:0 }, { x:ws[1].w, y:ws[2].w }]);
    return H ? { H, ancho:ws[1].w, largo:Math.max(ws[0].w, ws[2].w) } : null;
  },
  personas(){
    const out = [], now = performance.now(), pisos = new Map();
    for (const [id, b] of bodies) {
      const src = sources.find(s => s.id === b.src), e = +bodySpeed(b).toFixed(3), p = { id, e };
      const dbg = src && src._calDbg ? src._calDbg.get(id) : null;
      if (dbg && now - dbg.t < 500) {
        p.u = +dbg.u.toFixed(4); p.h = +clamp(dbg.h || .6, .2, 1.1).toFixed(3); p.pared = dbg.wall || '';
        // qué tan cerca de la pared está, sobre la recta cámara → pies → pared (0 = en la cámara, 1 = contra la pared)
        const C = src._calC; if (C) p.t = +clamp(Math.hypot(dbg.F.x - C.x, dbg.F.y - C.y) / Math.max(1, Math.hypot(dbg.hit.x - C.x, dbg.hit.y - C.y)), 0, 1).toFixed(3);
        if (!pisos.has(src.id)) pisos.set(src.id, this.piso(src)); const g = pisos.get(src.id);
        if (g) { const f = applyH(g.H, dbg.F.x, dbg.F.y);
          if (isFinite(f.x) && isFinite(f.y)) { p.x = +clamp(f.x / g.ancho, 0, 1).toFixed(4); p.z = Math.round(clamp(f.y, 0, g.largo)); } }
      } else { const c = centerOfMass(b); if (!c) continue; p.u = +clamp(c.x / W, 0, 1).toFixed(4); }
      out.push(p);
    }
    return out;
  },
  /* una vez por cuadro, después del dibujo */
  frame(){
    if (!this.on) return;
    this.gente = this.personas();
    const o = outputSize(), ws = wallRanges();
    if (this.ch) this.ch.postMessage({ k:'f', people:this.gente, cfg:P.acred, fit:STRETCH ? 'estirar' : 'contener',
      room:{ W:o.w, H:o.h, walls:ws.map(w => ({ nombre:w.nombre, w:w.w })) } });
    // imagen de Mirador encima de la salida mientras se sincroniza o se muestra el patrón
    const w = Salida.win; if (!w || w.closed) return;
    try { const cv = w.document.getElementById('mir'); if (!cv) return;
      if (!this.overlay()) { if (!cv.hidden) cv.hidden = true; return; }
      const d = Math.min(w.devicePixelRatio || 1, 2), tw = Math.max(2, Math.round(w.innerWidth * d)), th = Math.max(2, Math.round(w.innerHeight * d));
      if (cv.width !== tw || cv.height !== th) { cv.width = tw; cv.height = th; }
      const c = cv.getContext('2d');
      if (STRETCH) c.drawImage(glCanvas, 0, 0, tw, th);
      else { const s = Math.min(tw / glCanvas.width, th / glCanvas.height), cw = glCanvas.width * s, chh = glCanvas.height * s; c.fillStyle = '#000'; c.fillRect(0, 0, tw, th); c.drawImage(glCanvas, (tw - cw) / 2, (th - chh) / 2, cw, chh); }
      if (cv.hidden) cv.hidden = false;
    } catch (e) {}   // la salida se está cargando
  },
};

/* ---------- pestaña del panel ---------- */
UI.tab_acred = function(body){
  const A = P.acred;
  const gs = this.group(body, 'Salida', { desc:'La ventana de SALIDA muestra la página de acreditaciones de FLAT en la pared del medio y las partículas en las tres paredes. OBS la captura con la misma fuente de siempre ("Mirador · SALIDA").' });
  const st = this.kv(gs, [['salida', '—']]);
  const pinta = () => { const e = this.estadoAcred(); st.innerHTML = e.map(([k, v]) => `${k}: <b>${v}</b>`).join('<br>'); }; pinta(); this.liveFns.push(pinta);
  this.buttons(gs, [[Salida.isOpen() ? 'Cerrar ventana de salida' : 'Abrir ventana de salida (O)', () => { Salida.toggle(); this.refresh('acred'); }, Salida.isOpen() ? '' : 'primary'],
    ['Recargar la página de FLAT', () => { Acred.ch?.postMessage({ k:'recargar' }); toast('página de acreditaciones: recargando'); }]]);

  const gp = this.group(body, 'Dónde reacciona cada pared', { desc:'El lugar de la sala se configura igual que en Mirador: pestaña Sincronizar, o Cámaras → calibración (tecla K) para las líneas de las paredes y las zonas ignoradas.' });
  this.select(gp, A, 'modo', [['sala', 'por lugar en la sala: cada pared reacciona al lado de la persona'], ['detras', 'solo la pared que la persona tiene detrás (como Mirador)']], 'profundidad');
  this.range(gp, A, 'alcance', .15, 2, .01, 'alcance (anchos de sala)');
  this.note(gp, 'Alcance: hasta qué distancia de una pared la persona la modifica. Con 0,7 alguien parado en el medio de la sala mueve las dos paredes de los costados a media fuerza; pegado a una pared, solo esa.');
  this.range(gp, A, 'radio', 60, 900, 5, 'tamaño de la huella (px)');
  this.range(gp, A, 'altura', .1, .9, .01, 'altura en la pared');
  const lista = this.kv(gp, [['personas', '—']]);
  const pl = () => { const g = Acred.gente; lista.innerHTML = g.length ? g.map(p => `${p.id}: <b>${p.x != null ? `ancho ${Math.round(p.x * 100)} % · a ${p.z} px de Norte` : `lienzo ${Math.round((p.u || 0) * 100)} % (sin piso: hace falta la calibración de 3 paredes)`}</b> · mov. ${p.e.toFixed(2)}`).join('<br>') : 'personas: <b>ninguna</b>'; };
  pl(); this.liveFns.push(pl);

  const gr = this.group(body, 'Reacción de las partículas');
  this.range(gr, A, 'fuerza', 0, 2, .01, 'apartar'); this.range(gr, A, 'remolino', 0, 2, .01, 'remolino'); this.range(gr, A, 'agitar', 0, 3, .01, 'agitar con el movimiento');
  this.range(gr, A, 'quieto', 0, 1, .01, 'efecto con la persona quieta'); this.range(gr, A, 'tinte', 0, 1, .01, 'color cerca de la persona'); this.range(gr, A, 'crecer', 0, 2, .01, 'agrandar cerca de la persona');
  this.color(gr, A, 'color1', 'color (personas impares)'); this.color(gr, A, 'color2', 'color (personas pares)');

  const ga = this.group(body, 'Partículas');
  this.range(ga, A, 'cantidad', 0, 2.25, .05, 'cantidad en las paredes'); this.range(ga, A, 'tamano', .4, 3, .05, 'tamaño'); this.range(ga, A, 'deriva', 0, 3, .05, 'deriva'); this.range(ga, A, 'brillo', .2, 2, .01, 'brillo');
  this.toggle(ga, A, 'figura', 'figura de FLAT (la de la web)'); this.range(ga, A, 'figuraEscala', .3, 2.5, .01, 'tamaño de la figura'); this.range(ga, A, 'paralaje', 0, 1, .01, 'la figura gira con la gente');

  const gg = this.group(body, 'Página de acreditaciones');
  this.toggle(gg, A, 'pagina', 'mostrar la página'); this.range(gg, A, 'pagEscala', .5, 2, .01, 'tamaño del contenido'); this.range(gg, A, 'velo', 0, 1, .01, 'oscurecer detrás del texto');
  this.note(gg, 'El lienzo viaja hasta OBS con el ancho de la ventana de salida: el QR llega con poca definición a lo ancho. Probalo con un celular desde el fondo de la sala; si cuesta leerlo, subí el tamaño del contenido.');

  const gm = this.group(body, 'Mirador', { closed:true });
  this.toggle(gm, A, 'verMirador', 'mostrar la imagen de Mirador en la salida'); this.toggle(gm, A, 'ahorrar', 'no dibujar Mirador con el panel cerrado');
  this.note(gm, 'Mientras se sincroniza, o con el patrón de ajuste, el negro (B) o las esquinas (C), la imagen de Mirador tapa sola a la página. Los esqueletos se ven en esta ventana con la tecla E.');
};
UI.estadoAcred = function(){
  const e = Acred.estado, vivo = e && performance.now() - e.t < 3000;
  if (!Salida.isOpen() && !vivo) return [['salida', 'cerrada (apretá O)']];
  if (!vivo) return [['salida', 'abierta, sin respuesta todavía']];
  const qrOk = /flatfestival\.org/.test(e.qr || '');
  return [['salida', `${e.w} × ${e.h} px · ${e.fps} fps · ${e.huellas} huellas`],
    ['página', e.pagina === 'integrada' ? 'integrada (sobre las partículas)' : e.pagina === 'directa' ? 'directa, con su propio fondo (abrí Mirador con el lanzador para integrarla)' : 'cargando…'],
    ['QR', e.pagina === 'directa' ? 'el de la página' : qrOk ? e.qr : (e.qr ? '⚠ apunta a ' + e.qr + ' (debería ser flatfestival.org)' : 'todavía no cargó')]]
    .concat(e.err ? [['error', e.err]] : []);
};
Acred.init();
