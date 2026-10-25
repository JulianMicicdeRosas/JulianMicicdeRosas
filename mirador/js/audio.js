"use strict";
/* =====================================================================
   MIRADOR — audio
   Fuente: micrófono (la música de la sala) o la canción que reproduce
   el programa. Analiza graves / medios / agudos, nivel y golpe (beat),
   y deja en AM los multiplicadores que leen los módulos al dibujar.
   ===================================================================== */
const Audio_ = {
  ctx:null, analyser:null, data:null, micStream:null, micNode:null, elNode:null, gainNode:null, recDest:null,
  source:'off', ready:false, devices:[], micDeviceId:'',
  bands:{ bass:0, mid:0, high:0, level:0 }, beat:0, beatEnv:0, beatAvg:.01, lastBeat:0, bpm:0, beatTimes:[],
  async ensure(){
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {}); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint:'interactive' });
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = .5;
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.gainNode = this.ctx.createGain(); this.gainNode.connect(this.analyser);
    this.recDest = this.ctx.createMediaStreamDestination();
    // la canción se oye; el micrófono no (evita realimentación)
    this.elNode = this.ctx.createMediaElementSource($('track')); this.elNode.connect(this.gainNode); this.elNode.connect(this.ctx.destination); this.elNode.connect(this.recDest);
    this.ready = true;
  },
  async listMics(){ try { this.devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch (e) { this.devices = []; } return this.devices; },
  async setSource(src){
    await this.ensure(); this.source = src; P.audio.source = src;
    if (src === 'mic') { try { await this.openMic(); } catch (e) { toast('No se pudo abrir el micrófono: ' + e.message, 4000); this.source = 'off'; P.audio.source = 'off'; } }
    else this.closeMic();
    if (typeof UI !== 'undefined') UI.refresh('audio');
  },
  async openMic(){
    this.closeMic();
    const c = { echoCancellation:false, noiseSuppression:false, autoGainControl:false };
    if (this.micDeviceId) c.deviceId = { exact:this.micDeviceId };
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio:c, video:false });
    this.micNode = this.ctx.createMediaStreamSource(this.micStream); this.micNode.connect(this.gainNode); this.micNode.connect(this.recDest);
    await this.listMics();
  },
  closeMic(){ if (this.micNode) { try { this.micNode.disconnect(); } catch (e) {} this.micNode = null; } if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; } },
  recordStream(){ return this.ready && this.source !== 'off' ? this.recDest.stream : null; },
  /* análisis por cuadro */
  tick(dt){
    const R = P.audio.react;
    if (!this.ready || this.source === 'off') { this.bands.level *= .9; this.beat *= .85; this.write(); return; }
    this.gainNode.gain.value = P.audio.gain;
    const a = this.analyser, d = this.data; a.getByteFrequencyData(d);
    const sr = this.ctx.sampleRate, binHz = sr / a.fftSize;
    const band = (f0, f1) => { const i0 = Math.max(1, Math.floor(f0 / binHz)), i1 = Math.min(d.length - 1, Math.ceil(f1 / binHz)); let s = 0; for (let i = i0; i <= i1; i++) s += d[i]; return s / ((i1 - i0 + 1) * 255); };
    const bass = band(30, 160), mid = band(160, 2000), high = band(2000, 9000);
    const sm = clamp(P.audio.smooth, 0, .95), k = 1 - Math.pow(sm, dt * 60 || 1);
    const B = this.bands; B.bass += (bass - B.bass) * (bass > B.bass ? .6 : k); B.mid += (mid - B.mid) * (mid > B.mid ? .6 : k); B.high += (high - B.high) * (high > B.high ? .6 : k);
    const lvl = Math.sqrt(bass * bass * .5 + mid * mid * .35 + high * high * .15); B.level += (lvl - B.level) * (lvl > B.level ? .5 : k);
    // golpe: energía grave contra su promedio móvil
    const e = bass * bass; this.beatAvg += (e - this.beatAvg) * .04;
    const now = performance.now();
    if (e > this.beatAvg * 1.6 && e > .01 && now - this.lastBeat > 180) { this.beat = 1; this.beatTimes.push(now); if (this.beatTimes.length > 8) this.beatTimes.shift();
      if (this.beatTimes.length >= 4) { const iv = []; for (let i = 1; i < this.beatTimes.length; i++) iv.push(this.beatTimes[i] - this.beatTimes[i - 1]); iv.sort((x, y) => x - y); this.bpm = Math.round(60000 / iv[iv.length >> 1]); }
      this.lastBeat = now; }
    else this.beat *= Math.pow(.02, dt);   // cae en ~1 s
    this.write();
  },
  write(){
    const R = P.audio.react, B = this.bands, on = this.ready && this.source !== 'off';
    AM.level = B.level; AM.beat = this.beat; AM.bass = B.bass; AM.mid = B.mid; AM.high = B.high;
    AM.size = on ? 1 + R.size * (B.bass * 1.2 + this.beat * .6) : 1;
    AM.glow = on ? 1 + R.glow * B.level * 1.5 : 1;
    AM.bloom = on ? R.bloom * this.beat * 1.2 : 0;
    AM.scatter = on ? 1 + R.scatter * B.mid * 2.5 : 1;
    AM.hue = on ? R.hue * B.high * 160 : 0;
    AM.echo = on ? R.echo * B.level : 0;
    AM.flash = on ? R.flash * this.beat * .22 : 0;
    AM.speed = on ? 1 + R.speed * B.level * 1.5 : 1;
  },
};

/* ---------- playlist (canciones de la sesión) ---------- */
const track = $('track');
const Playlist = {
  items:[],      // {name, url, file?, handle?}
  selected:-1, started:false,
  has(){ return this.items.length > 0; },
  render(){ if (typeof UI !== 'undefined') UI.refresh('sesion'); this.updateCue(); },
  updateCue(){
    if (typeof started !== 'undefined' && !started) return;
    if (this.items.length) { const it = this.items[this.selected]; showCue('♪ ' + (it ? it.name : '(elegí una con ↑/↓)') + (it && !it.url ? ' · falta el archivo (Sesión → canciones)' : '') + '   ·   ↑/↓ elegir · Espacio reproducir/pausar'); }
    else hideCue();
  },
  select(i){ if (!this.items.length) return; this.selected = ((i % this.items.length) + this.items.length) % this.items.length; const it = this.items[this.selected]; if (it?.url && track.src !== it.url) { track.src = it.url; } this.render(); },
  async play(i){
    if (i !== undefined) this.select(i); if (this.selected < 0 && this.items.length) this.select(0);
    const it = this.items[this.selected]; if (!it) return;
    if (!it.url && it.handle) { try { if ((await it.handle.queryPermission({ mode:'read' })) !== 'granted') await it.handle.requestPermission({ mode:'read' }); const f = await it.handle.getFile(); it.url = URL.createObjectURL(f); } catch (e) { toast('No pude abrir el archivo de la canción: elegilo de nuevo', 3500); return; } }
    if (!it.url) { toast('Falta el archivo de "' + it.name + '": agregalo en Sesión → canciones', 3500); return; }
    await Audio_.ensure(); if (track.src !== it.url) track.src = it.url;
    if (P.audio.source === 'off') await Audio_.setSource('cancion');
    this.started = true; track.play().catch(e => toast('No se pudo reproducir: ' + e.message)); hideCue(); this.render();
  },
  toggle(){ if (this.started && !track.paused) { track.pause(); this.updateCue(); } else this.play(); },
  stop(){ track.pause(); track.currentTime = 0; this.started = false; this.updateCue(); },
  addFiles(files){ for (const f of Array.from(files)) { if (!/^audio\//.test(f.type) && !/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f.name)) continue;
      const ex = this.items.find(x => x.name === f.name); if (ex) { ex.url = URL.createObjectURL(f); ex.file = f; } else this.items.push({ name:f.name, url:URL.createObjectURL(f), file:f }); }
    if (this.selected < 0 && this.items.length) this.selected = 0; if (typeof Sessions !== 'undefined') Sessions.touch(); this.render(); },
  async pick(){
    if (window.showOpenFilePicker) {
      try { const hs = await showOpenFilePicker({ multiple:true, types:[{ description:'Audio', accept:{ 'audio/*':['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'] } }] });
        for (const h of hs) { const f = await h.getFile(); const ex = this.items.find(x => x.name === f.name); if (ex) { ex.url = URL.createObjectURL(f); ex.handle = h; } else this.items.push({ name:f.name, url:URL.createObjectURL(f), handle:h }); }
        if (this.selected < 0 && this.items.length) this.selected = 0; if (typeof Sessions !== 'undefined') Sessions.touch(); this.render(); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    $('songInput').click();
  },
  remove(i){ this.items.splice(i, 1); if (this.selected >= this.items.length) this.selected = this.items.length - 1; if (typeof Sessions !== 'undefined') Sessions.touch(); this.render(); },
  move(i, d){ const j = i + d; if (j < 0 || j >= this.items.length) return; [this.items[i], this.items[j]] = [this.items[j], this.items[i]]; if (this.selected === i) this.selected = j; else if (this.selected === j) this.selected = i; if (typeof Sessions !== 'undefined') Sessions.touch(); this.render(); },
  /* carpeta "canciones/" junto al HTML: el servidor (python -m http.server) genera un índice que se puede leer */
  async autoFolder(name = 'canciones'){
    try { const res = await fetch(name + '/'); if (!res.ok) return false; const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const hrefs = Array.from(doc.querySelectorAll('a')).map(a => a.getAttribute('href')).filter(h => h && /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(h));
      let added = 0; for (const h of hrefs) { const nm = decodeURIComponent(h.split('/').pop()); const ex = this.items.find(x => x.name === nm); if (ex) { if (!ex.url) ex.url = name + '/' + h; } else { this.items.push({ name:nm, url:name + '/' + h, folder:true }); added++; } }
      if (this.selected < 0 && this.items.length) this.selected = 0; this.render(); return added > 0; }
    catch (e) { return false; }
  },
  /* por URL ?audio=carpeta/archivo.mp3 (lo manda la presentación) */
  fromUrlParam(url){ const nm = decodeURIComponent(url.split('/').pop()); let i = this.items.findIndex(p => p.name === nm || p.url === url); if (i < 0) { this.items.unshift({ name:nm, url }); i = 0; } this.select(i); return i; },
  serialize(){ return this.items.map(x => ({ name:x.name, folder:!!x.folder, url:x.folder ? x.url : undefined })); },
  restore(list){ this.items = (list || []).map(x => ({ name:x.name, url:x.folder ? x.url : null, folder:!!x.folder })); this.selected = this.items.length ? 0 : -1; },
};
track.addEventListener('ended', () => { Playlist.started = false; Playlist.updateCue(); });
$('songInput').addEventListener('change', e => { Playlist.addFiles(e.target.files); e.target.value = ''; });
$('folderInput').addEventListener('change', e => { Playlist.addFiles(e.target.files); e.target.value = ''; });
