// Снимок страницы через Chrome (CDP, без зависимостей).
// node shot.mjs <url|файл.html> <out.png> [ширина=1280] [высота_окна=800] [--full=0] [--wait=мс] [--slices=высота_куска]
// Для 375 и 1280: мобильная эмуляция при ширине < 600. Полная страница — --full (по умолчанию да).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [src, out, w = '1280', h = '800'] = args;
if (!src || !out) { console.log('node shot.mjs <url|файл> <out.png> [ширина] [высота]'); process.exit(2); }
const url = /^https?:|^file:/.test(src) ? src : pathToFileURL(resolve(src)).href;
const width = +w, height = +h, mobile = width < 600;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), 'shot-'));
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let i = 0; i < 50; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.find((t) => t.type === 'page')) break; } catch {} await sleep(200); }
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' });
  await send('Page.navigate', { url });
  await sleep(+(flags.wait || 2500));
  await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>document.fonts.size)', awaitPromise: true });
  // прокрутка до низа — подгрузить ленивое и запустить reveal-анимации
  const hh = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true });
  const total = hh.result.result.value;
  for (let y = 0; y < total; y += height * 0.7) { await send('Runtime.evaluate', { expression: `window.scrollTo(0,${y})` }); await sleep(120); }
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' }); await sleep(400);
  const m = await send('Runtime.evaluate', { expression: 'JSON.stringify({h:document.documentElement.scrollHeight,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})', returnByValue: true });
  const info = JSON.parse(m.result.result.value);
  const full = flags.full !== '0';
  const clipH = full ? Math.min(info.h, 16000) : height;
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: clipH, scale: 1 } });
  writeFileSync(out, Buffer.from(r.result.data, 'base64'));
  const files = [out];
  // --slices=N: дополнительно нарезать полную страницу на куски высотой N (для проверяющих: длинный png они видят мелко)
  if (flags.slices && full) {
    const H = +flags.slices;
    for (let y = 0, n = 1; y < clipH; y += H, n++) {
      const rr = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y, width, height: Math.min(H, clipH - y), scale: 1 } });
      const f = out.replace(/\.png$/, `-s${String(n).padStart(2, '0')}.png`);
      writeFileSync(f, Buffer.from(rr.result.data, 'base64')); files.push(f);
    }
  }
  console.log(JSON.stringify({ out, width, pageHeight: info.h, overflowX: info.sw > info.cw, slices: files.length - 1 }));
} finally { ws.close(); proc.kill(); }
process.exit(0);
