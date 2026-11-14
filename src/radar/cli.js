// Запуск радара: node src/radar/cli.js --file <сохранённая-страница.html>   (без сети)
//                node src/radar/cli.js --live                                (живой сбор FL.ru, только по «да» Саши)
// Результат: data/orders/<день>.jsonl, data/state.json, data/morning-<день>.txt
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CHANNELS, manualNames } from './channels.js';
import { fetchPage } from './fetch.js';
import { parseFl } from './parsers/fl.js';
import { runChannels } from './run.js';
import { saveRecords, loadState, saveState } from './store.js';
import { renderMorning } from './report.js';

const args = process.argv.slice(2);
const live = args.includes('--live');
const fileIdx = args.indexOf('--file');
if (!live && fileIdx < 0) {
  console.log('Нужен --file <страница.html> (без сети) или --live (живой сбор FL.ru, правила площадки не прочитаны — только по «да» Саши).');
  process.exit(2);
}

const DATA = join(process.cwd(), 'data');
const now = new Date().toISOString();
const loadFl = async () => {
  const html = live ? await fetchPage(CHANNELS.fl.feed, { pauseMs: CHANNELS.fl.pause_sec * 1000 }) : readFileSync(args[fileIdx + 1], 'utf8');
  return parseFl(html, now);
};

const out = await runChannels([{ id: 'fl', load: loadFl }], { now, state: loadState(DATA) });
const day = now.slice(0, 10);
saveRecords(DATA, day, out.records);
saveState(DATA, out.state);
const text = renderMorning(out.records, out.report, { manual: manualNames() });
mkdirSync(DATA, { recursive: true });
writeFileSync(join(DATA, `morning-${day}.txt`), text);
console.log(text);
