// Запуск радара: node src/radar/cli.js --file <сохранённая-страница.html> [--channel fh]   (без сети; по умолчанию FL.ru; --channel — любой канал
//                из channels.js: так читается страница, которую канал с защитой не отдал роботу, — Саша сохраняет её в браузере сам)
//                node src/radar/cli.js --live                                (живой сбор всех авто-каналов: FL.ru, Kwork, Freelancehunt, Weblancer, Freelance.ru, Telegram-ленты)
//                node src/radar/cli.js --live --only fh,weblancer            (только перечисленные каналы)
//                node src/radar/cli.js --live --digest [--force]             (режим «первый заказ»: все авто-каналы, фильтр по смыслу, паузы 3–5 с, не чаще раза в 2 ч на канал,
//                                                                              результат — docs/orders/<день>.md: топ-10 заказов и готовые отклики; --force — без интервала)
//                node src/radar/cli.js --rebuild                              (пересобрать дайджест из записей дня, без сети)
// Результат: data/orders/<день>.jsonl, data/state.json, data/morning-<день>.txt
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CHANNELS, manualNames, manualLinks } from './channels.js';
import { evaluate } from './rules.js';
import { renderDigest, writeDigest, isEnglishOrder } from '../digest/build.js';
import { existsSync } from 'node:fs';
import { fetchPage } from './fetch.js';
import { PARSERS } from './parsers/index.js';
import { runChannels } from './run.js';
import { saveRecords, loadState, saveState, loadDay } from './store.js';
import { renderMorning } from './report.js';

const args = process.argv.slice(2);
const digest = args.includes('--digest') || args.includes('--rebuild');
const live = args.includes('--live') || digest || args.includes('--rebuild');
const force = args.includes('--force');
const rebuild = args.includes('--rebuild'); // только пересобрать дайджест из записей дня, без сети
const FIRST_INTERVAL_MIN = 120; // приказ Саши 14.11: не чаще раза в 2 часа
const fileIdx = args.indexOf('--file');
if (!live && fileIdx < 0) {
  console.log('Нужен --file <страница.html> (без сети, FL.ru) или --live (живой сбор всех авто-каналов).');
  process.exit(2);
}

const filePath = args[fileIdx + 1];
if (!live && (!filePath || filePath.startsWith('--'))) {
  console.error('После --file нужен путь к сохранённой странице: --file <страница.html>.');
  process.exit(2);
}

const DATA = join(process.cwd(), 'data');
const now = new Date().toISOString();
const fileChannel = args.includes('--channel') ? args[args.indexOf('--channel') + 1] : 'fl';
if (!live && !PARSERS[fileChannel]) {
  console.error(`--channel ${fileChannel}: такого канала нет. Есть: ${Object.keys(PARSERS).join(', ')}.`);
  process.exit(2);
}
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
/** Каналы с несколькими страницами (feeds) читаются по одной с паузой; упала часть — берём остальное и пишем предупреждение, упали все — ошибка. */
const loader = (id) => async () => {
  if (!live) return PARSERS[id](readFileSync(filePath, 'utf8'), now);
  const ch = CHANNELS[id];
  const urls = ch.feeds ?? [ch.feed];
  const got = [];
  const warnings = [];
  let firstError = null;
  for (const url of urls) {
    try {
      // режим «первый заказ»: пауза 3–5 с, правила площадок и robots.txt не сверяем (приказ Саши 14.11); защиту (капча, challenge, 403) не обходим
      const opts = digest ? { pauseMs: 3000 + Math.floor(Math.random() * 2000), respectRobots: false } : { pauseMs: ch.pause_sec * 1000 };
      got.push(...PARSERS[id](await fetchPage(url, opts), now));
    } catch (e) {
      firstError ??= e;
      warnings.push(`${new URL(url).pathname}: ${e.message}`);
    }
  }
  if (firstError && warnings.length === urls.length) throw firstError;
  got.warnings = warnings;
  return got;
};
const ids = rebuild ? [] : live ? Object.keys(PARSERS).filter((id) => CHANNELS[id]?.mode === 'auto' && (!only || only.includes(id))) : [fileChannel];

const out = await runChannels(ids.map((id) => ({ id, load: loader(id) })), {
  now,
  state: loadState(DATA),
  profile: digest ? 'first' : undefined,
  minIntervalMin: digest ? FIRST_INTERVAL_MIN : 0,
  force,
});
const day = now.slice(0, 10);
saveRecords(DATA, day, out.records);
saveState(DATA, out.state);
const text = renderMorning(out.records, out.report, { manual: manualNames() });
mkdirSync(DATA, { recursive: true });
writeFileSync(join(DATA, `morning-${day}.txt`), text);
console.log(text);

if (digest) {
  // дайджест строится по всем записям дня (в том числе прошлых прогонов, если канал сейчас пропущен по интервалу), вердикты — профиль «первый заказ»
  // возраст пересчитываем на момент дайджеста: запись прошлого прогона хранит возраст на момент сбора
  const reage = (r) => (r.posted_at ? { ...r, age_hours: Math.max(0, Math.round(((Date.parse(now) - Date.parse(r.posted_at)) / 3600_000) * 100) / 100) } : r);
  // --lang en: отдельный дайджест только по английским заказам (docs/orders/<день>-en.md), русский не затирается
  const langEn = args.includes('--lang') && args[args.indexOf('--lang') + 1] === 'en';
  const dayRecords = loadDay(DATA, day).map(reage).map((r) => ({ ...r, ...evaluate(r, { profile: 'first' }) })).filter((r) => !langEn || isEnglishOrder(r));
  const blocked = Object.entries(out.report.channels)
    .filter(([id, c]) => c.status === 'silent' && /защит|403|капч/i.test(c.reason))
    .map(([id]) => ({ id, name: CHANNELS[id].name, link: CHANNELS[id].feeds?.[0] ?? CHANNELS[id].feed, note: `защита при чтении (${out.report.channels[id].reason}) — открой сам` }));
  const manual = [...manualLinks().filter((m) => m.link), ...blocked.filter((b) => !manualLinks().some((m) => m.id === b.id))];
  // отклики под конкретные заказы (написаны вручную по тексту заказа): docs/orders/<день>.replies.json → { replies: [{url, text, case_title, case_link, price_rub, budget_rub}] }
  const repliesFile = join(process.cwd(), 'docs', 'orders', `${day}${langEn ? '-en' : ''}.replies.json`);
  const custom = existsSync(repliesFile) ? Object.fromEntries(JSON.parse(readFileSync(repliesFile, 'utf8')).replies.map((r) => [r.url, r])) : {};
  const md = renderDigest(dayRecords, { date: day, report: out.report, manual, now, custom });
  const file = writeDigest(md, { dir: join(process.cwd(), 'docs', 'orders'), date: day, suffix: langEn ? 'en' : '' });
  console.log(`Дайджест: ${file}`);
}
