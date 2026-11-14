// Запуск радара: node src/radar/cli.js --file <сохранённая-страница.html>   (без сети, только FL.ru)
//                node src/radar/cli.js --live                                (живой сбор всех авто-каналов: FL.ru, Kwork)
// Результат: data/orders/<день>.jsonl, data/state.json, data/morning-<день>.txt
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CHANNELS, manualNames } from './channels.js';
import { fetchPage } from './fetch.js';
import { parseFlChecked } from './parsers/fl.js';
import { parseKworkChecked } from './parsers/kwork.js';
import { runChannels } from './run.js';
import { saveRecords, loadState, saveState } from './store.js';
import { renderMorning } from './report.js';

const args = process.argv.slice(2);
const live = args.includes('--live');
const fileIdx = args.indexOf('--file');
if (!live && fileIdx < 0) {
  console.log('Нужен --file <страница.html> (без сети, FL.ru) или --live (живой сбор авто-каналов: FL.ru, Kwork).');
  process.exit(2);
}

const filePath = args[fileIdx + 1];
if (!live && (!filePath || filePath.startsWith('--'))) {
  console.error('После --file нужен путь к сохранённой странице: --file <страница.html>.');
  process.exit(2);
}
if (live && CHANNELS.fl.mode !== 'auto') {
  console.error(`FL.ru сейчас «руками»: ${CHANNELS.fl.why}. Живой сбор не запущен.`);
  process.exit(2);
}

const DATA = join(process.cwd(), 'data');
const now = new Date().toISOString();
const PARSERS = { fl: parseFlChecked, kwork: parseKworkChecked };
const loader = (id) => async () => {
  const html = live ? await fetchPage(CHANNELS[id].feed, { pauseMs: CHANNELS[id].pause_sec * 1000 }) : readFileSync(filePath, 'utf8');
  return PARSERS[id](html, now);
};
const ids = live ? Object.keys(PARSERS).filter((id) => CHANNELS[id].mode === 'auto') : ['fl'];

const out = await runChannels(ids.map((id) => ({ id, load: loader(id) })), { now, state: loadState(DATA) });
const day = now.slice(0, 10);
saveRecords(DATA, day, out.records);
saveState(DATA, out.state);
const text = renderMorning(out.records, out.report, { manual: manualNames() });
mkdirSync(DATA, { recursive: true });
writeFileSync(join(DATA, `morning-${day}.txt`), text);
console.log(text);
