// Radar entry point: node src/radar/cli.js --file <saved-page.html> [--channel fh]   (no network; default FL.ru; --channel — any channel
//                from channels.js: this reads a page that a protected channel did not serve to robots — Sasha saves it in the browser himself)
//                node src/radar/cli.js --live                                (live collection of all auto channels: FL.ru, Kwork, Freelancehunt, Weblancer, Freelance.ru, Telegram feeds)
//                node src/radar/cli.js --live --only fh,weblancer            (only the listed channels)
//                node src/radar/cli.js --live --digest [--force]             ("first order" mode: all auto channels, filter by meaning, 3–5 s pauses, at most once every 2 h per channel,
//                                                                              result — docs/orders/<day>.md: top 10 orders and ready replies; --force — ignore the interval)
//                node src/radar/cli.js --rebuild                              (rebuild the digest from the day's records, no network)
// Output: data/orders/<day>.jsonl, data/state.json, data/morning-<day>.txt
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
const rebuild = args.includes('--rebuild'); // only rebuild the digest from the day's records, no network
const FIRST_INTERVAL_MIN = 120; // Sasha's order 14.11: at most once every 2 hours
const fileIdx = args.indexOf('--file');
if (!live && fileIdx < 0) {
  console.log('Need --file <page.html> (no network, FL.ru) or --live (live collection of all auto channels).');
  process.exit(2);
}

const filePath = args[fileIdx + 1];
if (!live && (!filePath || filePath.startsWith('--'))) {
  console.error('--file needs a path to a saved page: --file <page.html>.');
  process.exit(2);
}

const DATA = join(process.cwd(), 'data');
const now = new Date().toISOString();
const fileChannel = args.includes('--channel') ? args[args.indexOf('--channel') + 1] : 'fl';
if (!live && !PARSERS[fileChannel]) {
  console.error(`--channel ${fileChannel}: no such channel. Available: ${Object.keys(PARSERS).join(', ')}.`);
  process.exit(2);
}
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
/** Channels with several pages (feeds) are read one by one with a pause; if some fail, the rest is kept and a warning is written; if all fail, it is an error. */
const loader = (id) => async () => {
  if (!live) return PARSERS[id](readFileSync(filePath, 'utf8'), now);
  const ch = CHANNELS[id];
  const urls = ch.feeds ?? [ch.feed];
  const got = [];
  const warnings = [];
  let firstError = null;
  for (const url of urls) {
    try {
      // "first order" mode: 3–5 s pause, platform rules and robots.txt are not checked (Sasha's order 14.11); protection (captcha, challenge, 403) is not bypassed
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
  // the digest is built from all the day's records (including earlier runs, if a channel is skipped now due to the interval); verdicts use the "first order" profile
  // age is recalculated at digest time: a record from an earlier run stores the age at collection time
  const reage = (r) => (r.posted_at ? { ...r, age_hours: Math.max(0, Math.round(((Date.parse(now) - Date.parse(r.posted_at)) / 3600_000) * 100) / 100) } : r);
  // --lang en: a separate digest for English orders only (docs/orders/<day>-en.md); the Russian one is not overwritten
  const langEn = args.includes('--lang') && args[args.indexOf('--lang') + 1] === 'en';
  const dayRecords = loadDay(DATA, day).map(reage).map((r) => ({ ...r, ...evaluate(r, { profile: 'first' }) })).filter((r) => !langEn || isEnglishOrder(r));
  const blocked = Object.entries(out.report.channels)
    .filter(([id, c]) => c.status === 'silent' && /защит|403|капч/i.test(c.reason))
    .map(([id]) => ({ id, name: CHANNELS[id].name, link: CHANNELS[id].feeds?.[0] ?? CHANNELS[id].feed, note: `защита при чтении (${out.report.channels[id].reason}) — открой сам` }));
  const manual = [...manualLinks().filter((m) => m.link), ...blocked.filter((b) => !manualLinks().some((m) => m.id === b.id))];
  // replies for specific orders (written by hand from the order text): docs/orders/<day>.replies.json → { replies: [{url, text, case_title, case_link, price_rub, budget_rub}] }
  const repliesFile = join(process.cwd(), 'docs', 'orders', `${day}${langEn ? '-en' : ''}.replies.json`);
  const custom = existsSync(repliesFile) ? Object.fromEntries(JSON.parse(readFileSync(repliesFile, 'utf8')).replies.map((r) => [r.url, r])) : {};
  const md = renderDigest(dayRecords, { date: day, report: out.report, manual, now, custom });
  const file = writeDigest(md, { dir: join(process.cwd(), 'docs', 'orders'), date: day, suffix: langEn ? 'en' : '' });
  console.log(`Digest: ${file}`);
}
