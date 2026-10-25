"use strict";
/* =====================================================================
   MIRADOR — sesiones
   Una sesión = nombre + canciones + todos los parámetros + zonas de
   cámara + esquinas + formato de salida + plantilla. Se guardan en
   localStorage (varias, por nombre) y se exportan/importan en JSON.
   La sesión actual se autoguarda unos segundos después de cada cambio.
   ===================================================================== */
const Sessions = {
  KEY:'mirador.sesiones', CUR:'mirador.actual', current:'', dirty:false, _t:0,
  all(){ try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { return {}; } },
  names(){ return Object.keys(this.all()).sort((a, b) => a.localeCompare(b)); },
  get(name){ return this.all()[name] || null; },
  snapshot(name){
    return { version:2, app:'mirador', name:name || this.current || 'sin nombre', updated:new Date().toISOString(),
      plantilla:plantillaActual, P:deepClone(P), corners:deepClone(corners),
      out:{ mode:OUT.mode, w:OUT.w, h:OUT.h },
      layout:{ orient:LAYOUT.orient },
      zonas:sources.map(s => ({ deviceId:s.deviceId, label:s.label, rect:s.rect, mirror:s.mirror })),
      canciones:Playlist.serialize(), cancionActual:Playlist.selected,
      notas:this.notes || '' };
  },
  save(name){
    name = (name || this.current || '').trim(); if (!name) { toast('Poné un nombre a la sesión'); return false; }
    const all = this.all(); const prev = all[name]; const snap = this.snapshot(name); if (prev?.created) snap.created = prev.created; else snap.created = snap.updated;
    all[name] = snap; localStorage.setItem(this.KEY, JSON.stringify(all)); localStorage.setItem(this.CUR, name);
    this.current = name; this.dirty = false; this.updateName(); if (typeof UI !== 'undefined') UI.refresh('sesion'); return true;
  },
  async apply(s, opts = {}){
    if (!s || !s.P) return false;
    for (const k in s.P) if (P[k] && typeof s.P[k] === 'object') { Object.assign(P[k], s.P[k]); if (k === 'audio' && s.P.audio.react) Object.assign(P.audio.react, s.P.audio.react); }
    if (Array.isArray(s.corners) && s.corners.length === 4) corners = deepClone(s.corners);
    if (s.layout?.orient) LAYOUT.orient = s.layout.orient;
    plantillaActual = s.plantilla || '';
    this.notes = s.notas || '';
    if (s.out && !opts.keepOut && typeof running !== 'undefined' && running && !(typeof multiMode !== 'undefined' && multiMode)) { setOutputFormat(s.out.mode, s.out.w, s.out.h); }
    Playlist.restore(s.canciones); if (typeof s.cancionActual === 'number' && s.cancionActual >= 0) Playlist.selected = Math.min(s.cancionActual, Playlist.items.length - 1);
    if (!opts.keepCams && Array.isArray(s.zonas) && s.zonas.length && typeof running !== 'undefined' && running && !simMode) {
      const ids = s.zonas.map(z => z.deviceId).filter(id => availableCameras.some(c => c.deviceId === id));
      if (ids.length) await setCameras(ids, s.zonas.filter(z => ids.includes(z.deviceId)));
    } else if (Array.isArray(s.zonas)) sources.forEach((src, i) => { if (s.zonas[i]) { src.rect = s.zonas[i].rect || src.rect; src.mirror = s.zonas[i].mirror; } });
    syncModulesFromP(); if (fbFeed[0]) { resize(); buildRefBuffer(); clearFeedback(); }
    if (typeof Audio_ !== 'undefined' && Audio_.ready && P.audio.source !== Audio_.source) Audio_.setSource(P.audio.source);
    this.updateName(); if (typeof UI !== 'undefined') UI.refresh(); Playlist.updateCue();
    return true;
  },
  async load(name){ const s = this.get(name); if (!s) return false; this.current = name; localStorage.setItem(this.CUR, name); await this.apply(s); this.dirty = false; this.updateName(); toast('sesión: ' + name); return true; },
  create(name){
    name = (name || '').trim(); if (!name) { toast('Poné un nombre a la sesión'); return false; }
    if (this.get(name)) { toast('Ya existe una sesión con ese nombre'); return false; }
    this.current = name; this.notes = ''; Playlist.restore([]); this.save(name); toast('sesión nueva: ' + name); return true;
  },
  duplicate(name){ const s = this.get(this.current); if (!s) return; const all = this.all(); all[name] = Object.assign(deepClone(s), { name, created:new Date().toISOString() }); localStorage.setItem(this.KEY, JSON.stringify(all)); this.current = name; localStorage.setItem(this.CUR, name); this.updateName(); UI.refresh('sesion'); },
  remove(name){ const all = this.all(); delete all[name]; localStorage.setItem(this.KEY, JSON.stringify(all)); if (this.current === name) { this.current = ''; localStorage.removeItem(this.CUR); } this.updateName(); if (typeof UI !== 'undefined') UI.refresh('sesion'); },
  rename(oldName, newName){ newName = (newName || '').trim(); if (!newName || newName === oldName) return; const all = this.all(); if (!all[oldName] || all[newName]) { toast('Nombre no disponible'); return; } all[newName] = Object.assign(all[oldName], { name:newName }); delete all[oldName]; localStorage.setItem(this.KEY, JSON.stringify(all)); if (this.current === oldName) { this.current = newName; localStorage.setItem(this.CUR, newName); } this.updateName(); UI.refresh('sesion'); },
  touch(){ this.dirty = true; this.updateName(); clearTimeout(this._t); this._t = setTimeout(() => { if (this.current) this.save(this.current); }, 2500); },
  updateName(){ const el = $('sessionName'); if (el) el.textContent = (this.current || 'sin sesión') + (this.dirty ? ' •' : ''); },
  export(all){
    const data = all ? { version:2, app:'mirador', sesiones:this.all() } : this.snapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' }), url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = (all ? 'mirador-sesiones' : 'mirador-' + (this.current || 'sesion').replace(/[^\w\-]+/g, '_')) + '.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast('exportado .json');
  },
  async importFile(file){
    try { const data = JSON.parse(await file.text());
      if (data.sesiones) { const all = this.all(); let n = 0; for (const k in data.sesiones) { all[k] = data.sesiones[k]; n++; } localStorage.setItem(this.KEY, JSON.stringify(all)); toast(`${n} sesiones importadas`); UI.refresh('sesion'); return; }
      if (data.P) { // sesión suelta o configuración del programa anterior
        const name = data.name || file.name.replace(/\.json$/i, ''); const all = this.all(); all[name] = Object.assign({ version:2, app:'mirador', name, created:new Date().toISOString(), updated:new Date().toISOString() }, data, { name });
        localStorage.setItem(this.KEY, JSON.stringify(all)); await this.load(name); return; }
      throw new Error('el archivo no tiene una sesión de Mirador');
    } catch (e) { toast('No se pudo importar: ' + e.message, 4000); }
  },
  lastName(){ return localStorage.getItem(this.CUR) || ''; },
};
$('jsonInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) Sessions.importFile(f); e.target.value = ''; });
