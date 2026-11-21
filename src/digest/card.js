// Image for Sasha: the digest's top 10 — title, budget, source, first line of the reply; readable on a phone (width 540 px, ×2).
// Run: node src/digest/card.js [docs/orders/<day>.md]   → writes <day>.card.html and <day>.png next to it (needs installed Chrome or Edge).
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// the image font has no icon glyphs — they would render as squares
const noEmoji = (s) => String(s).replace(/[\u{1F000}-\u{1FFFF}☀-➿️‍]/gu, '').replace(/\s+/g, ' ').trim();
const esc = (s) => noEmoji(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Parses the digest: [{n, title, url, source, budget, age, firstLine}] for the top orders. */
export function parseTop(md) {
  const top = md.split('\n## Ещё заказы')[0].split('\n## Топ заказов')[1] ?? '';
  const items = [];
  for (const block of top.split(/\n### /).slice(1)) {
    const head = block.split('\n')[0];
    const m = head.match(/^(\d+)\. (.*)$/);
    if (!m) continue;
    const info = block.match(/- Источник: (.*?) · Бюджет: (.*?) · Срок: (.*?) · Возраст: (.*)/);
    const url = (block.match(/- Ссылка: (\S+)/) ?? [])[1];
    const first = (block.match(/\n> (.*)/) ?? [])[1] ?? '';
    items.push({ n: Number(m[1]), title: m[2], url, source: info?.[1] ?? '', budget: info?.[2] ?? '', age: info?.[4] ?? '', firstLine: first });
  }
  return items;
}

export function renderCardHtml(items, { date }) {
  const cards = items.map((it) => `
  <section class="card">
    <div class="n">${it.n}</div>
    <div class="body">
      <h2>${esc(it.title.length > 90 ? `${it.title.slice(0, 88)}…` : it.title)}</h2>
      <div class="meta"><span class="b">${esc(it.budget)}</span><span>${esc(it.source)}</span><span>${esc(it.age)}</span></div>
      <p class="reply">«${esc(it.firstLine.length > 190 ? `${it.firstLine.slice(0, 188)}…` : it.firstLine)}»</p>
    </div>
  </section>`).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=540">
<title>Секретарь заказов — ${esc(date)}</title>
<style>
:root{--bg:#f4f1ea;--card:#fff;--ink:#1d2330;--sub:#5d6575;--acc:#c2410c;--line:#e4dfd3}
*{box-sizing:border-box}
body{margin:0;width:540px;background:var(--bg);color:var(--ink);font:17px/1.4 "Segoe UI",Roboto,Arial,sans-serif;padding:16px 14px 20px}
h1{font-size:25px;margin:4px 0 2px}
.sub{color:var(--sub);font-size:15px;margin:0 0 14px}
.card{display:flex;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 14px;margin:0 0 10px}
.n{flex:none;width:34px;height:34px;border-radius:50%;background:var(--acc);color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center}
h2{font-size:18px;line-height:1.25;margin:0 0 6px}
.meta{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:14.5px;color:var(--sub);margin:0 0 7px}
.meta .b{color:var(--acc);font-weight:700}
.reply{margin:0;font-size:15.5px;color:#2b3345;border-left:3px solid var(--line);padding-left:10px}
.foot{color:var(--sub);font-size:14px;margin-top:8px}
</style></head><body>
<h1>Топ-10 заказов</h1>
<p class="sub">${esc(date)} · «Секретарь заказов» · ничего не отправлено, отправляет Саша</p>${cards}
<p class="foot">Полные отклики, цены, сроки и ссылки — в docs/orders/${esc(date)}.md. Цены и сроки — ориентиры, Саша их не подтверждал.</p>
</body></html>`;
}

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const mdPath = process.argv[2] ?? 'docs/orders/2026-11-14.md';
  const date = (mdPath.match(/(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? '';
  const items = parseTop(readFileSync(mdPath, 'utf8'));
  const htmlPath = resolve(mdPath.replace(/\.md$/, '.card.html'));
  const pngPath = resolve(mdPath.replace(/\.md$/, '.png'));
  writeFileSync(htmlPath, renderCardHtml(items, { date }));
  if (!CHROME) { console.error('Chrome/Edge not found: open .card.html in a browser and save it as an image.'); process.exit(1); }
  const height = 150 + items.length * 190;
  const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--window-size=540,${height}`, `--screenshot=${pngPath}`, `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8' });
  console.log(r.status === 0 ? `Image: ${pngPath}` : `Failed: ${r.stderr}`);
}
