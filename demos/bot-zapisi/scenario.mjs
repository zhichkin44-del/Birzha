// Прогон сценария симулятора через CDP: клики настоящими событиями мыши + снимки.
// node demos/bot-zapisi/scenario.mjs <файл.html> <папка_для_снимков> [ширина=1280]
// Снимает: sim-mid-<w>.png (выбор времени), sim-done-<w>.png (запись + напоминание), admin-<w>.png (таблица после записи).
// Печатает проверки: строка в таблице появилась, слот занят, после отмены строка исчезла и слот свободен.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [src, outDir, w = '1280'] = process.argv.slice(2);
const width = +w, height = width < 600 ? 812 : 900, mobile = width < 600;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9800 + Math.floor(Math.random() * 400);
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'scn-'))}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let i = 0; i < 50; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.find((t) => t.type === 'page')) break; } catch {} await sleep(200); }
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };

async function click(selectorJs, label) {
  // selectorJs — выражение, возвращающее элемент
  let rect = null;
  for (let k = 0; k < 20 && !rect; k++) { rect = await ev(`(() => { const e = ${selectorJs}; if (!e) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2, t:e.textContent.trim()}; })()`); if (!rect) await sleep(300); }
  if (!rect) throw new Error('не найдено: ' + label);
  await sleep(350);
  const r2 = await ev(`(() => { const e = ${selectorJs}; const r = e.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: 'left', clickCount: 1 });
  console.log('клик:', rect.t);
  await sleep(1400);
}
const btn = (re) => `[...document.querySelectorAll('#chatLog .kb:not(.spent) .kb-btn:not(:disabled)')].find(b => ${re}.test(b.textContent))`;
async function shotEl(sel, file, pad = 24) {
  await ev(`document.querySelectorAll('#toastHost .toast').forEach(t => t.remove())`);
  const r = await ev(`(() => { const e = document.querySelector('${sel}'); e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return {x:r.x+scrollX, y:r.y+scrollY, w:r.width, h:r.height}; })()`);
  await sleep(500);
  const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad);
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x, y, width: Math.min(width - x, r.w + pad * 2), height: r.h + pad * 2, scale: 1 } });
  writeFileSync(join(outDir, file), Buffer.from(res.result.data, 'base64'));
  console.log('снимок:', file);
}

try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await send('Page.navigate', { url: pathToFileURL(resolve(src)).href });
  await sleep(2500);
  await ev(`document.documentElement.style.scrollBehavior='auto'`);
  // вариант C: в телефоне сам проигрывается диалог; ждём его конца (кнопка «Записаться ещё»), затем ведём сценарий сами
  const hasAuto = await ev(`!document.querySelector('#startBtn')`);
  let freshBase = 0;
  if (hasAuto) {
    for (let k = 0; k < 40; k++) { if (await ev(`[...document.querySelectorAll('#chatLog .kb:not(.spent) .kb-btn')].some(b=>/Записаться ещё/.test(b.textContent))`)) break; await sleep(500); }
    await shotEl('.stage', `sim-auto-${width}.png`);
    freshBase = await ev(`[...window.__sim.bookings.values()].filter(b=>b.fresh).length`);
    console.log('автоигра: записей после проигрыша =', freshBase);
    await click(btn('/Записаться ещё/'), 'записаться ещё');
  } else await click(`document.querySelector('#startBtn')`, 'старт');
  await click(btn('/Стрижка \\+ борода/'), 'услуга');
  await shotEl('.stage', `sim-mid-${width}.png`); // шаг выбора мастера: Артём / Денис / Игорь / Кто свободен
  await click(btn('/Кто свободен/'), 'мастер');
  // послезавтра и дальше — чтобы оба напоминания были применимы
  await click(btn('/^(?!Сегодня|Завтра|←)/'), 'день');
  
  await shotEl('.stage', `sim-time-${width}.png`);
  const freeBefore = await ev(`[...document.querySelectorAll('#chatLog .kb:not(.spent) .kb-btn')].map(b=>b.disabled?0:1).join('')`);
  // берём свободный слот после первого занятого — видно, что занятые пропущены
  await click(`(() => { const bs=[...document.querySelectorAll('#chatLog .kb:not(.spent) .kb-row--4 .kb-btn')]; const i=bs.findIndex(b=>b.disabled); return bs.slice(Math.max(i,0)).find(b=>!b.disabled) || bs.find(b=>!b.disabled); })()`, 'время');
  await click(btn('/^Записаться$/'), 'подтвердить');
  const rowsAfter = await ev(`document.querySelectorAll('#adminBody tr.fresh').length`);
  await click(btn('/Напоминание за сутки/'), 'напоминание');
  await shotEl('.stage', `sim-done-${width}.png`);
  await shotEl(width < 600 ? '#admin' : '.admin-grid', `admin-${width}.png`, 16);
  // проверка отмены
  await click(btn('/Отменить запись/'), 'отменить');
  await click(btn('/Да, отменить/'), 'да');
  await sleep(800);
  const rowsCancel = await ev(`document.querySelectorAll('#adminBody tr.fresh').length`);
  const fresh = await ev(`[...window.__sim.bookings.values()].filter(b=>b.fresh).length`);
  const ov = await ev(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
  console.log(JSON.stringify({ width, slotsMask: freeBefore, rowAddedAfterBooking: rowsAfter === freshBase + 1, rowGoneAfterCancel: rowsCancel === freshBase, freshBookingsLeft: fresh, freshBase, overflowX: ov }));
} finally { ws.close(); proc.kill(); }
process.exit(0);
