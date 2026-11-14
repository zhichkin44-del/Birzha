// Снимки шагов квиза через CDP: настоящие клики по кнопкам (без отладочных хешей).
// node shot-steps.mjs <файл.html> <папка-вывода> <ширина> [высота=800] [--logic]
// Пишет step-1..5, result, sent -> <папка>/step-N-<ширина>.png, result-<ширина>.png, sent-<ширина>.png.
// На телефоне (ширина < 600) снимок = то, что видит человек в окне (с липкой плашкой), прокрутка 0;
// если кнопки «Далее» ниже края — добавляется step-N-<ширина>-b.png (прокрутка к концу квиза).
// На десктопе — вся верхняя часть страницы до низа квиза.
// Печатает аудит: overflowX, тексты < 12 px по всей странице (с учётом масштаба SVG), цели < 44 px.
// --logic: три набора ответов, проверка сметы (в т.ч. взаимоисключение «капитальный» и других работ).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const [src, outDir, w = '1280', h = '800'] = args;
const url = pathToFileURL(resolve(src)).href;
const width = +w, height = +h, mobile = width < 600;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9100 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), 'steps-'));
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
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.result.value;

const AUDIT = `(()=>{
  const out={};
  out.overflowX=document.documentElement.scrollWidth>document.documentElement.clientWidth;
  const small=[];
  document.querySelectorAll('body *').forEach(e=>{
    const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    if(!own) return;
    const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden') return;
    const r=e.getBoundingClientRect(); if(!r.width||!r.height) return;
    let fs=parseFloat(cs.fontSize);
    if(e instanceof SVGElement){ const m=e.getScreenCTM&&e.getScreenCTM(); if(m) fs*=Math.hypot(m.a,m.b); }
    if(fs<11.95) small.push((e.tagName+'.'+(e.className.baseVal??e.className)+':'+fs.toFixed(1)+':'+e.textContent.trim().slice(0,18)));
  });
  out.small=small.slice(0,8);
  const bt=[];
  document.querySelectorAll('#quiz button,#quiz input,.pill,#bar').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width&&r.height&&r.height<43.5) bt.push((e.className||e.tagName)+':'+Math.round(r.height));});
  out.smallTargets=bt.slice(0,5);
  const q=document.querySelector('#quiz'); const r=q.getBoundingClientRect();
  out.quizTop=Math.round(r.top+scrollY); out.quizBottom=Math.round(r.bottom+scrollY);
  const nb=document.querySelector('#qNext'); const nav=document.querySelector('#qNav');
  if(!nav.hidden){const b=nb.getBoundingClientRect(); out.next={disabled:nb.disabled,text:nb.textContent.trim(),bottom:Math.round(b.bottom+scrollY)};}
  const bar=document.querySelector('#bar'); if(bar&&!bar.hidden&&getComputedStyle(bar).display!=='none'){const b=bar.getBoundingClientRect(); out.bar={away:bar.classList.contains('away'),text:bar.textContent.replace(/\\s+/g,' ').trim(),top:Math.round(b.top)};}
  return out;})()`;

async function snap(name, { viewportOnly = false } = {}) {
  await ev('window.scrollTo(0,0)');
  await sleep(500);
  const a = await ev(AUDIT);
  let clipH;
  if (mobile || viewportOnly) clipH = height; else clipH = Math.min(a.quizBottom + 40, 4000);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !(mobile || viewportOnly), clip: { x: 0, y: 0, width, height: clipH, scale: 1 } });
  writeFileSync(join(outDir, `${name}-${width}.png`), Buffer.from(r.result.data, 'base64'));
  console.log(name, width, JSON.stringify(a));
  if (mobile && !viewportOnly && a.quizBottom + 20 > height) {
    // длинный шаг: второй снимок — прокрутка к концу квиза (как при нажатии «Далее»)
    await ev(`window.scrollTo(0,${a.quizBottom + 24 - height})`); await sleep(500);
    const a2 = await ev(AUDIT);
    const r2 = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: a.quizBottom + 24 - height, width, height, scale: 1 } });
    writeFileSync(join(outDir, `${name}-${width}-b.png`), Buffer.from(r2.result.data, 'base64'));
    console.log(name + '-b', width, JSON.stringify({ bar: a2.bar }));
  }
}
const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'нет '+${JSON.stringify(sel)}; e.click(); return 'ok'})()`);
const pick = (n) => click(`.opt:nth-child(${n})`);
const next = async () => { await click('#qNext'); await sleep(450); };
const sumText = () => ev(`(document.querySelector('.res-sum')||{}).textContent?.replace(/\\s+/g,' ').trim()`);
const sel = () => ev(`[...document.querySelectorAll('.opt[aria-pressed=true]')].map(e=>e.dataset.v).join('+')`);

async function logic() {
  const sets = [
    { n: 'квартира 50 м², косметический', type: 1, area: 50, work: [1], expect: [270000, 330000] },
    { n: 'дом 100 м², сантехника + электрика', type: 2, area: 100, work: [3, 4], expect: [538000, 658000] },
    { n: 'офис 30 м², электрика, потом капитальный (снимает электрику)', type: 3, area: 30, work: [4, 2], expect: [340000, 416000], excl: true },
  ];
  for (const t of sets) {
    await send('Page.navigate', { url }); await sleep(1500);
    await pick(t.type); await next();
    await ev(`(()=>{const i=document.querySelector('#areaIn'); i.value=${t.area}; i.dispatchEvent(new Event('input',{bubbles:true}))})()`); await next();
    for (const k of t.work) await pick(k);
    const chosen = await sel();
    await next(); await pick(1); await next(); await pick(1); await next(); await sleep(300);
    const txt = await sumText();
    const nums = (txt.match(/\d[\d\s\u00a0]*\d/g) || []).map((x) => +x.replace(/\D/g, ''));
    const ok = nums[0] === t.expect[0] && nums[1] === t.expect[1];
    console.log(ok ? 'OK ' : 'ОШИБКА', t.n, '| выбрано:', chosen, '| итог:', txt, '| ждали', t.expect.join('–'));
  }
}

try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' });
  await send('Page.navigate', { url });
  await sleep(2500);
  await ev('document.fonts.ready.then(()=>1)');
  await snap('step-1-empty');
  await pick(1); await sleep(200); await snap('step-1');
  await next(); await snap('step-2');
  await ev(`(()=>{const i=document.querySelector('#areaIn'); i.value=64; i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await next(); await snap('step-3-empty');
  await pick(3); await pick(4); await sleep(200); await snap('step-3');
  await next(); await pick(2); await sleep(200); await snap('step-4');
  await next(); await pick(2); await sleep(200); await snap('step-5');
  await next(); await sleep(300);
  await snap('result', { viewportOnly: false });
  if (mobile) {
    // результат целиком: окно высотой с квиз
    const a = await ev(AUDIT);
    await send('Emulation.setDeviceMetricsOverride', { width, height: a.quizBottom + 40, deviceScaleFactor: 1, mobile });
    await ev('window.scrollTo(0,0)'); await sleep(500);
    const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height: a.quizBottom + 40, scale: 1 } });
    writeFileSync(join(outDir, `result-${width}-full.png`), Buffer.from(r.result.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await sleep(300);
  }
  await ev(`(()=>{const n=document.querySelector('#fName'); n.value='Анна'; const p=document.querySelector('#fPhone'); p.focus(); p.value='9000000000'; p.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('#lead .btn'); await sleep(600);
  await snap('sent', { viewportOnly: true });
  if (flags.includes('--logic')) await logic();
} finally { ws.close(); proc.kill(); }
process.exit(0);
