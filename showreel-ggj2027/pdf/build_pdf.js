#!/usr/bin/env node
/* Genera GGJ-Mendoza-2027.pdf a partir de dossier.html (Chromium headless).
 *   node pdf/build_pdf.js            → pdf/GGJ-Mendoza-2027.pdf
 *   node pdf/build_pdf.js --check    → además PNG de cada página en build/pdf/ y control de desbordes */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
});
srv.listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`http://127.0.0.1:${srv.address().port}/pdf/dossier.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // control: nada fuera de su página ni texto desbordado
  const problems = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.page').forEach((pg, i) => {
      const P = pg.getBoundingClientRect();
      pg.querySelectorAll('*').forEach(el => {
        if (el.matches('.photo, .dots, .glow, .shade-l, .fade, .corners, .corners *, .bar, .bar *') || el.closest('.photo')) return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (r.left < P.left + 40 || r.right > P.right - 40 || r.top < P.top + 40 || r.bottom > P.bottom - 40)
          out.push(`pág ${i + 1}: <${el.tagName.toLowerCase()} class="${el.className}"> fuera del margen (${Math.round(r.left - P.left)},${Math.round(r.top - P.top)} → ${Math.round(r.right - P.left)},${Math.round(r.bottom - P.top)})`);
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === 'visible' && el.children.length === 0)
          out.push(`pág ${i + 1}: texto desbordado en <${el.tagName.toLowerCase()} class="${el.className}">`);
      });
      // solapes entre bloques de contenido y con la barra inferior
      const blocks = [...pg.querySelectorAll('.h2, .stat, .goal, .card, .day, .item, .lead, .team, .tasks, .chips, .hud, .megalogo, .prod .photo, .cover .content, .watch')];
      for (let a = 0; a < blocks.length; a++) for (let c = a + 1; c < blocks.length; c++) {
        const A = blocks[a].getBoundingClientRect(), C = blocks[c].getBoundingClientRect();
        if (blocks[a].contains(blocks[c]) || blocks[c].contains(blocks[a])) continue;
        const ix = Math.min(A.right, C.right) - Math.max(A.left, C.left), iy = Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top);
        if (ix > 2 && iy > 2) out.push(`pág ${i + 1}: se pisan .${blocks[a].className.split(' ')[0]} y .${blocks[c].className.split(' ')[0]}`);
      }
    });
    return out;
  });
  console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : 'Sin desbordes.');
  if (process.argv.includes('--check')) {
    const dir = path.join(ROOT, 'build', 'pdf'); fs.mkdirSync(dir, { recursive: true });
    const n = await page.evaluate(() => document.querySelectorAll('.page').length);
    for (let i = 0; i < n; i++) await page.screenshot({ fullPage: true, path: path.join(dir, `p${i + 1}.png`), clip: { x: 0, y: i * 1080, width: 1920, height: 1080 } });
  }
  const out = path.join(__dirname, 'GGJ-Mendoza-2027.pdf');
  await page.pdf({ path: out, width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
  // compresión sin pérdida de los flujos (pypdf)
  try {
    require('child_process').execFileSync('python3', ['-c', `
import sys, warnings; warnings.simplefilter('ignore')
from pypdf import PdfReader, PdfWriter
w = PdfWriter(clone_from=PdfReader(sys.argv[1]))
for p in w.pages: p.compress_content_streams(level=9)
w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
w.add_metadata({'/Title': 'Global Game Jam Mendoza 2027 · Propuesta', '/Author': 'Asociación MEGA'})
w.write(sys.argv[1])`, out], { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (e) { console.warn('sin compresión extra (falta pypdf)'); }
  console.log('PDF →', out, (fs.statSync(out).size / 1e6).toFixed(2), 'MB');
  await b.close(); srv.close();
});
