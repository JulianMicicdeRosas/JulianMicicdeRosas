#!/usr/bin/env node
/* Render determinista del showreel: Playwright (Chromium headless) → JPEG por cuadro → ffmpeg.
 *
 *   node render.js                      → build/showreel_ggj2027.mp4 (60 fps, con audio)
 *   node render.js --fps 30             → otra cadencia
 *   node render.js --stills 1.2,15.1    → PNGs de control en build/stills/
 *   node render.js --workers 4          → cuadros en paralelo (un Chromium por worker)
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const BUILD = path.join(ROOT, 'build');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const FPS = +opt('fps', 60);
const WORKERS = +opt('workers', 4);
const STILLS = opt('stills', null);
const FROM = +opt('from', 0), TO = +opt('to', 90);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.m4a': 'audio/mp4', '.wav': 'audio/wav' };
function serve() {
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?render`);
  await page.waitForFunction(() => window.REEL && window.REEL.ready, null, { timeout: 120000 });
  return page;
}

async function grab(page, t, q = 0.93) {
  const data = await page.evaluate(([t, q]) => { window.REEL.renderFrame(t); return window.REEL.grab(q); }, [t, q]);
  return Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
}

async function main() {
  fs.mkdirSync(BUILD, { recursive: true });
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  if (STILLS) {
    const dir = path.join(BUILD, 'stills'); fs.mkdirSync(dir, { recursive: true });
    const page = await openPage(browser, port);
    for (const s of STILLS.split(',').map(Number)) {
      const buf = await grab(page, s, 0.9);
      fs.writeFileSync(path.join(dir, `t${s.toFixed(2).padStart(6, '0')}.jpg`), buf);
    }
    console.log('stills ok →', dir);
    await browser.close(); srv.close(); return;
  }

  const total = Math.round((TO - FROM) * FPS);
  const per = Math.ceil(total / WORKERS);
  const t0 = Date.now();
  let done = 0;
  const segs = [];
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    const a = w * per, z = Math.min(total, a + per);
    if (a >= z) return;
    const seg = path.join(BUILD, `seg${w}.mp4`); segs[w] = seg;
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-g', String(FPS), seg], { stdio: ['pipe', 'inherit', 'inherit'] });
    const page = await openPage(browser, port);
    for (let f = a; f < z; f++) {
      const buf = await grab(page, FROM + f / FPS);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      done++;
      if (done % 120 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`  ${done}/${total} cuadros · ${(done / el).toFixed(1)} fps · ETA ${((total - done) / (done / el)).toFixed(0)} s`);
      }
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    await page.close();
  }));
  await browser.close(); srv.close();

  const list = path.join(BUILD, 'segs.txt');
  fs.writeFileSync(list, segs.filter(Boolean).map(s => `file '${s}'`).join('\n'));
  const video = path.join(BUILD, 'video_only.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
  const wav = path.join(BUILD, 'soundtrack.wav');
  if (!fs.existsSync(wav)) execFileSync('python3', [path.join(ROOT, 'music.py'), wav], { stdio: 'inherit' });
  const final = path.join(BUILD, 'showreel_ggj2027.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-ss', String(FROM), '-t', String(TO - FROM), '-i', wav,
    '-af', 'loudnorm=I=-12:TP=-1.0:LRA=9', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', final]);
  console.log(`listo → ${final}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
main().catch(e => { console.error(e); process.exit(1); });
