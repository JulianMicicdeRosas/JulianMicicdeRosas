#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  Prueba de punta a punta: levanta un OpenAI simulado, el backend con un micrófono simulado y el frontend
//  compilado, abre el show en un navegador sin ventana y recorre la noche.
//
//    npm run e2e                 (desde poesia-tipografica/)
//
//  Necesita: Python con las dependencias del backend, Node, y Playwright con Chromium
//  (npm i -g playwright && npx playwright install chromium). Usa los puertos 5173, 8765, 9970 y 9971:
//  cerrar el show antes de correrla. No toca Documentos/Ciclo FLAT: trabaja en una carpeta temporal.
//  Capturas y registros: tests/e2e/salida/
// ─────────────────────────────────────────────────────────────────────────────
const { spawn, execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'salida');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'flat-e2e-'));
const FLAT_DIR = path.join(TMP, 'Ciclo FLAT');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(FLAT_DIR, { recursive: true });

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}
function python() {
  for (const p of [path.join(ROOT, '.venv', 'bin', 'python'), path.join(ROOT, '.venv', 'Scripts', 'python.exe')]) if (fs.existsSync(p)) return p;
  return spawnSync('python3', ['--version']).status === 0 ? 'python3' : 'python';
}
const PY = python();
const children = [];
function start(name, cmd, args, opts = {}) {
  const log = fs.openSync(path.join(OUT, `${name}.log`), 'w');
  const ch = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', log, log], ...opts, env: { ...process.env, ...(opts.env || {}) } });
  ch.on('exit', (code) => code && !closing && console.log(`  [${name}] terminó con código ${code}: ver tests/e2e/salida/${name}.log`));
  children.push(ch);
  return ch;
}
let closing = false;
function stopAll() {
  closing = true;
  for (const ch of children) {
    try {
      ch.kill();
    } catch {
      /* ya terminó */
    }
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function portOpen(port) {
  return new Promise((res) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => (s.destroy(), res(true)));
    s.once('error', () => res(false));
  });
}
async function waitPort(port, name, secs = 40) {
  for (let i = 0; i < secs * 4; i++) {
    if (await portOpen(port)) return;
    await sleep(250);
  }
  throw new Error(`${name} no abrió el puerto ${port} en ${secs} s (ver tests/e2e/salida/)`);
}

// Imagen ASCII ya pasada a tonos (dígitos), para probar los modos de dibujo sin esperar al director
const TONOS = [
  '000000000000000001123344443221100000000000000000', '000000000000133556678888888776655311000000000000',
  '000000001144677889999999999998877644110000000000', '000000335577899999999999999999988766553300000000',
  '000044778899999886654455668999988877665540000000', '000055778899999775531133557999988877665541100000',
  '000044778899999886654455668998888777665530000000', '000022667788999999988888998888877666554410000000',
  '000000335577888999998888888777766655442200000000', '000000001144677778888888777666655533110000000000',
  '000000000000133445566666665554433200000000000000',
].flatMap((r) => [r, r]);

const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.log(`  ✗ ${name} — ${e.message.split('\n')[0]}`);
  }
}
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

(async () => {
  for (const p of [5173, 8765, 9970, 9971]) must(!(await portOpen(p)), `el puerto ${p} está ocupado: cerrar el show antes de correr la prueba`);
  console.log('Preparando (carpeta temporal:', TMP + ')');
  const wav = path.join(TMP, 'voz.wav');
  must(spawnSync(PY, [path.join(__dirname, 'voz_sintetica.py'), wav, '240'], { stdio: 'inherit' }).status === 0, 'no pude generar la voz sintética');
  const envFile = path.join(TMP, 'prueba.env');
  fs.writeFileSync(envFile, ['OPENAI_API_KEY=sk-prueba-1234567890abcdef', 'OPENAI_REALTIME_GA_URL=ws://127.0.0.1:9970/v1/realtime?intent=transcription', 'OPENAI_REALTIME_API=ga', 'OPENAI_BASE_URL=http://127.0.0.1:9971/v1', ''].join('\n'));
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html')) || process.argv.includes('--build')) {
    console.log('Compilando el frontend…');
    must(spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: ROOT, stdio: 'ignore' }).status === 0, 'falló vite build');
  }
  start('openai-simulado', PY, [path.join(__dirname, 'fake_openai.py'), path.join(OUT, 'openai-simulado.registro.log'), path.join(__dirname, 'composiciones.json')]);
  await waitPort(9970, 'el OpenAI simulado');
  start('backend', PY, ['server.py', '--env', envFile, '--audio-archivo', wav], { env: { FLAT_DIR, CRONOGRAMA_URL: 'http://127.0.0.1:9/no-hay' } });
  // vite directo con node (sin npx): un solo proceso, que se puede cerrar al terminar
  start('frontend', process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', '5173', '--strictPort', '--host', '127.0.0.1']);
  await waitPort(8765, 'el backend');
  await waitPort(5173, 'el frontend');

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 504 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // anotar qué le manda la página al backend
  await page.addInitScript(() => {
    window.__enviado = [];
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      try {
        window.__enviado.push(JSON.parse(d).type);
      } catch {
        /* binario */
      }
      return send.call(this, d);
    };
  });
  const P = (fn, arg) => page.evaluate(fn, arg);
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const avanzar = async (secs) => {
    // el navegador sin placa de video da pocos cuadros: se adelanta la animación a mano
    for (let i = 0; i < secs; i += 2) {
      await P(() => window.poesia.advance(2, 1 / 30));
      await sleep(150);
    }
  };
  const until = async (fn, secs, what) => {
    for (let i = 0; i < secs * 2; i++) {
      if (await P(fn)) return;
      await sleep(500);
    }
    throw new Error(`no pasó en ${secs} s: ${what}`);
  };

  console.log('Recorriendo la noche:');
  await check('arranque y conexión con el backend', async () => {
    await page.goto('http://127.0.0.1:5173/?formato=1920x690&points=0&atlas=2048', { waitUntil: 'load' });
    await until(() => !!window.poesia && window.__enviado.includes('ui'), 30, 'la página conectó con el backend');
    return P(() => `estado ${window.poesia.show.state}`);
  });

  await check('una página de otro origen no puede conectarse al backend', async () => {
    const other = await browser.newPage();
    await other.goto('data:text/html,<p>otra pagina</p>');
    const r = await other.evaluate(
      () =>
        new Promise((res) => {
          const ws = new WebSocket('ws://127.0.0.1:8765');
          let got = false;
          ws.onmessage = () => (got = true);
          ws.onclose = (e) => res({ got, code: e.code });
          setTimeout(() => res({ got, code: 'sigue abierta' }), 4000);
        }),
    );
    await other.close();
    must(!r.got && r.code !== 'sigue abierta', `recibió datos o quedó abierta (${JSON.stringify(r)})`);
    return `cerrada (código ${r.code}) sin recibir nada`;
  });

  await check('título del loop en sólido', async () => {
    await page.keyboard.press('ArrowRight');
    await until(() => window.poesia.show.titleStage.visible, 20, 'el título sólido apareció');
    await sleep(1500);
    await shot('01-titulo');
    return P(() => `«${window.poesia.show.solidText}»`);
  });

  await check('los avisos al operador se ven (tecla sin artista)', async () => {
    await page.keyboard.press('9');
    await sleep(400);
    const r = await P(() => ({ panel: document.querySelector('#config [data-notice]').textContent, titulo: document.title }));
    must(/tecla 9/.test(r.panel), `el panel C no muestra el aviso («${r.panel}»)`);
    must(/tecla 9/.test(r.titulo), `el título de la ventana no muestra el aviso («${r.titulo}»)`);
    return `panel C y título de la ventana: «${r.panel}»`;
  });

  await check('cambiar un paso del loop a «logos» no borra el loop', async () => {
    await page.keyboard.press('c');
    await sleep(500);
    const antes = await P(() => window.poesia.show.settings.loop.map((s) => s.tipo + ':' + (s.contenido || s.carpeta)));
    await page.click('#config [data-act="add-step"]');
    await sleep(300);
    await page.locator('#config [data-loop] .item').last().locator('select[data-field="tipo"]').selectOption('logos');
    await sleep(600);
    const despues = await P(() => window.poesia.show.settings.loop.map((s) => s.tipo + ':' + (s.contenido || s.carpeta)));
    must(despues.length === antes.length + 1, `el loop tenía ${antes.length} pasos y quedó con ${despues.length}`);
    must(antes.every((x, i) => x === despues[i]), 'los pasos anteriores cambiaron');
    // dejarlo como estaba
    await page.locator('#config [data-loop] .item').last().locator('[data-act="del"]').click();
    await page.keyboard.press('Escape');
    return `${antes.length} pasos → ${despues.length} (el nuevo: ${despues[despues.length - 1]})`;
  });

  await check('placa del artista: los 3 s de gracia llegan al backend', async () => {
    await P(() => (window.__enviado.length = 0));
    await page.keyboard.press('1');
    await sleep(3800);
    const r = await P(() => ({ estado: window.poesia.show.label(), enviado: [...new Set(window.__enviado)] }));
    must(r.enviado.includes('preroll_reset'), `no se envió preroll_reset (enviado: ${r.enviado.join(', ')})`);
    await shot('02-placa');
    return r.estado;
  });

  await check('el modelo devuelve la imagen en ASCII y el telón la dibuja eligiendo la letra', async () => {
    // empieza a transcribir (si la voz no lo hizo sola): el director pide una imagen por estrofa
    if (!(await P(() => window.poesia.show.recording))) await page.keyboard.press('s');
    await until(() => !!window.poesia.field.shape?.tone, 75, 'llegó una imagen del director');
    await avanzar(4);
    const r = await P(() => {
      const f = window.poesia.field, B = f.backdrop, S = f.shape;
      if (!S) return { glifos: 'la imagen ya venció' };
      const on = B.cells.filter((c) => c.i >= 0 && c.sid === S.id);
      return {
        glifos: S.glifos,
        celdas: on.length,
        negrita: on.filter((c) => c.sk === 'bold').length,
        minuscula: on.filter((c) => c.shown && c.shown !== c.shown.toUpperCase()).length,
        punto: on.filter((c) => c.shown === '·').length,
        origen: document.querySelector('#config')?.textContent.match(/imagen ASCII del modelo[^·]*/)?.[0] || '',
      };
    });
    await shot('03-imagen-ascii-hibrido');
    if (process.env.E2E_DIAG) {
      // diagnóstico: una captura y datos por segundo durante 40 s (varias imágenes seguidas, con voz)
      const rows = [];
      for (let k = 0; k < 40; k++) {
        const d = await P(() => {
          const f = window.poesia.field, B = f.backdrop, S = f.shape, t = f.time;
          const x0 = f.focus.cx - f.H * 0.55, x1 = f.focus.cx + f.H * 0.55, y0 = -f.H * 0.42, y1 = f.H * 0.46;
          const by = {};
          let fresh = 0, big = 0, n = 0, sumA = 0, cover = 0;
          for (let i = 1; i < f.N; i++) {
            if (f.alpha[i] < 0.02 || f.px[i] < x0 || f.px[i] > x1 || f.py[i] < y0 || f.py[i] > y1) continue;
            n++;
            sumA += f.alpha[i];
            cover += f.alpha[i] * f.size[i] * f.size[i];
            by[f.state[i]] = (by[f.state[i]] || 0) + 1;
            if (t - f.birth[i] < 2.5) fresh++;
            if (f.size[i] > B.size * 1.3) big++;
          }
          return { t: +t.toFixed(1), rms: +f.rms.toFixed(3), img: S ? S.id : 0, glifos: S?.glifos || '', n, porEstado: JSON.stringify(by), frescas: fresh, grandes: big, tinta: Math.round(cover / 1000), celdas: S ? B.cells.filter((c) => c.i >= 0 && c.sid === S.id).length : 0 };
        });
        rows.push(d);
        await page.screenshot({ path: path.join(OUT, `diag-${String(k).padStart(2, '0')}.png`), clip: { x: 420, y: 10, width: 560, height: 480 } });
        await sleep(700);
      }
      fs.writeFileSync(path.join(OUT, 'diag.json'), rows.map((r) => JSON.stringify(r)).join('\n'));
    }
    must(r.glifos === 'hibrido', `el dibujo no está en modo híbrido (${r.glifos})`);
    must(/imagen ASCII del modelo/.test(r.origen), 'la imagen no salió del ASCII del modelo (panel C → última imagen)');
    must(r.negrita > 20 && r.minuscula + r.punto > 20, `sin variedad de letras: ${JSON.stringify(r)}`);
    return `${r.celdas} letras · ${r.negrita} en negrita · ${r.minuscula} minúsculas · ${r.punto} puntos`;
  });

  if (process.env.E2E_DIAG) {
    await browser.close();
    stopAll();
    process.exit(0);
  }
  // los modos se prueban con una imagen fija y sin transcribir: si no, las imágenes del director la reemplazan
  await page.keyboard.press('p');
  await sleep(1500);
  for (const modo of ['rampa', 'estructura', 'brillo']) {
    await check(`modo de dibujo «${modo}»`, async () => {
      // se elige en el panel C, como lo haría el operador
      await page.keyboard.press('c');
      await sleep(400);
      await page.selectOption('#config select[data-sopt="dibujo_letras"]', modo);
      await page.keyboard.press('Escape');
      await sleep(300);
      await P(
        ([modo, TONOS]) => {
          const p = window.poesia;
          p.applyDirection({ modo_visual: 'concreto', figura: 'luna', grilla_tonos: TONOS, grilla: TONOS.map((r) => r.replace(/[1-9]/g, '#').replace(/0/g, '.')), verso: 'la luna se moja en el patio', duracion_s: 300, forzar_grilla: true });
        },
        [modo, TONOS],
      );
      await avanzar(10);
      const r = await P(() => {
        const f = window.poesia.field, S = f.shape;
        if (!S) return { glifos: 'sin imagen', celdas: 0, fijos: 0, bordes: 0, signos: 0 };
        const on = f.backdrop.cells.filter((c) => c.i >= 0 && c.sid === S.id);
        return { glifos: S.glifos, pol: S.pol, celdas: on.length, signos: [...new Set(on.map((c) => c.shown))].length, bordes: on.filter((c) => '/\\|_'.includes(c.gch || ' ')).length, fijos: on.filter((c) => c.gch).length };
      });
      await shot(`04-dibujo-${modo}`);
      if (modo === 'brillo') must(!r.glifos && r.fijos === 0, `el modo brillo eligió letras: ${JSON.stringify(r)}`);
      else must(r.glifos === modo && r.fijos > 50, `la imagen no eligió letras: ${JSON.stringify(r)}`);
      if (modo === 'estructura') must(r.bordes > 15, `sin signos de borde: ${JSON.stringify(r)}`);
      return `${r.celdas} letras · ${r.signos} signos distintos${modo === 'estructura' ? ` · ${r.bordes} de borde` : ''}`;
    });
  }

  await check('tecla 0: aparecen las palabras dichas', async () => {
    await page.keyboard.press('0');
    await until(() => window.poesia.field.sparse.length >= 3, 40, 'aparecieron palabras');
    await avanzar(4);
    await shot('05-tecla-0');
    return P(() => `${window.poesia.field.sparse.length} palabras · ${window.poesia.show.label()}`);
  });

  await check('tecla 5: es una placa más (quinto artista)', async () => {
    await P(() => {
      const p = window.poesia, s = structuredClone(p.show.settings);
      s.artists = [...s.artists.slice(0, 4), { name: 'Quinta Persona' }];
      p.show.setSettings(s);
    });
    await page.keyboard.press('5');
    await sleep(600);
    const r = await P(() => ({ st: window.poesia.show.state, label: window.poesia.show.label() }));
    must(r.st === 'artist' && /Quinta Persona/.test(r.label), `estado ${r.st} · ${r.label}`);
    return r.label;
  });

  await check('tecla Z: cierre', async () => {
    await page.keyboard.press('z');
    await sleep(2500);
    const st = await P(() => window.poesia.show.state);
    must(st === 'flat', `estado ${st}`);
    await shot('06-cierre');
    return 'logo de FLAT';
  });

  await check('L vuelve al loop y no hubo errores en la página', async () => {
    await page.keyboard.press('l');
    await sleep(1000);
    const st = await P(() => window.poesia.show.state);
    must(st === 'loop', `estado ${st}`);
    must(!pageErrors.length, `errores de JavaScript: ${pageErrors.slice(0, 3).join(' | ')}`);
    return 'sin errores de JavaScript';
  });

  await browser.close();

  await check('la sesión quedó grabada (audio y eventos)', async () => {
    const dir = path.join(FLAT_DIR, 'grabaciones');
    const ses = fs.readdirSync(dir).sort().pop();
    const wavSize = fs.statSync(path.join(dir, ses, 'audio.wav')).size;
    const ev = fs.readFileSync(path.join(dir, ses, 'eventos.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const teclas = ev.filter((e) => e.k === 'ui' && e.key).map((e) => e.key);
    const imagenes = ev.filter((e) => e.k === 'msg' && e.m?.type === 'art_direction' && e.m.data?.grilla_tonos).length;
    must(imagenes > 0, 'ninguna imagen ASCII con tonos quedó en eventos.jsonl');
    must(wavSize > 200000, `audio.wav de ${wavSize} bytes`);
    must(['1', 'p', '0', '5', 'z'].every((k) => teclas.includes(k)), `faltan teclas en eventos.jsonl (${teclas.join(' ')})`);
    return `${(wavSize / 48000).toFixed(0)} s de audio · teclas ${teclas.join(' ')} · ${imagenes} imágenes ASCII con tonos`;
  });

  await check('el backend no registró errores', async () => {
    const log = fs.readFileSync(path.join(OUT, 'backend.log'), 'utf8');
    const bad = log.split('\n').filter((l) => / ERROR |Traceback/.test(l));
    must(!bad.length, bad.slice(0, 2).join(' | '));
    must(/Conexión rechazada: viene de otra página/.test(log), 'no quedó registrado el rechazo de la otra página');
    return 'sin errores; el rechazo de la otra página quedó registrado';
  });

  stopAll();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} de ${results.length} pasos bien.` + (failed.length ? ` Fallaron: ${failed.map((f) => f.name).join(' · ')}` : '') + `\nCapturas y registros: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('\nLa prueba no pudo correr:', e.message);
  stopAll();
  process.exit(2);
});
process.on('SIGINT', () => (stopAll(), process.exit(130)));
