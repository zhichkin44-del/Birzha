// Снимок состояния одностраничного демо: хеш-маршрут + localStorage + необязательный JS.
// node shot-state.mjs <файл.html> <out.png> <ширина> <высота> [--hash=#/cart] [--ls=файл.json] [--js=код] [--full=0]
// Основа — demos/tools/shot.mjs (CDP, без зависимостей).
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), '1'] : [a.slice(2, i), a.slice(i + 1)]; }));
const [src, out, w = '1280', h = '800'] = args;
const base = pathToFileURL(resolve(src)).href;
const width = +w, height = +h, mobile = width < 600;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9800 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), 'shot-'));
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let i = 0; i < 50; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.find((t) => t.type === 'page')) break; } catch {} await sleep(200); }
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = (expression) => send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' });
  await send('Page.navigate', { url: base });
  await sleep(1200);
  if (flags.ls) {
    const data = JSON.parse(readFileSync(flags.ls, 'utf8'));
    await ev(`localStorage.clear();${Object.entries(data).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(typeof v === 'string' ? v : JSON.stringify(v))})`).join(';')}`);
  }
  await send('Page.navigate', { url: base + (flags.hash || '') });
  await sleep(600);
  await send('Page.reload');
  await sleep(+(flags.wait || 2200));
  await ev('document.fonts.ready.then(()=>1)');
  if (flags.js) { await ev(flags.js); await sleep(900); }
  // кто вылезает за ширину окна (для отладки overflowX)
  const wide = await ev(`JSON.stringify([...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>document.documentElement.clientWidth+1&&!e.closest('.chips')}).slice(0,5).map(e=>e.tagName+'.'+e.className+':'+Math.round(e.getBoundingClientRect().right)))`);
  const wl = JSON.parse(wide.result.result.value || '[]'); if (wl.length) console.log('wide:', wl.join(' | '));
  const hh = await ev('document.documentElement.scrollHeight');
  const total = hh.result.result.value;
  for (let y = 0; y < total; y += height * 0.7) { await ev(`window.scrollTo(0,${y})`); await sleep(100); }
  await ev(flags.scroll ? `window.scrollTo(0,${flags.scroll})` : 'window.scrollTo(0,0)'); await sleep(400); await ev('document.fonts.ready.then(()=>1)');
  const m = await ev('JSON.stringify({h:document.documentElement.scrollHeight,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,hash:location.hash})');
  const info = JSON.parse(m.result.result.value);
  const full = flags.full !== '0';
  const clipH = full ? Math.min(info.h, 16000) : height;
  const sy = full ? 0 : +(flags.scroll || 0);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: sy, width, height: clipH, scale: 1 } });
  writeFileSync(out, Buffer.from(r.result.data, 'base64'));
  console.log(JSON.stringify({ out, width, hash: info.hash, pageHeight: info.h, overflowX: info.sw > info.cw }));
} finally { ws.close(); proc.kill(); }
process.exit(0);
