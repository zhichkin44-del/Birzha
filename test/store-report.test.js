import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveRecords, loadDay, loadState, saveState } from '../src/radar/store.js';
import { renderMorning } from '../src/radar/report.js';
import { runChannels } from '../src/radar/run.js';
import { BlockedError } from '../src/radar/fetch.js';

const rec = (over = {}) => ({
  id: 'fl-1', channels: ['fl'], title: 'Лендинг для кофейни', text: 'x', budget: 8000, answers: 5, age_hours: 2,
  url: 'https://www.fl.ru/projects/1/', verdict: 'берём', rule: null, reason: 'R1–R7 пройдены', flags: [], ...over,
});

test('store: a record goes into the day\'s JSONL file; collecting the same id again does not duplicate it; an edit replaces it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'birzha-'));
  saveRecords(dir, '2026-11-14', [rec(), rec({ id: 'fl-2' })]);
  saveRecords(dir, '2026-11-14', [rec({ budget: 9000 })]);
  const day = loadDay(dir, '2026-11-14');
  assert.equal(day.length, 2);
  assert.equal(day.find((r) => r.id === 'fl-1').budget, 9000);
  assert.ok(existsSync(join(dir, 'orders', '2026-11-14.jsonl')));
  assert.equal(readFileSync(join(dir, 'orders', '2026-11-14.jsonl'), 'utf8').trim().split('\n').length, 2);
});

test('store: state.json — reading an empty file and writing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'birzha-'));
  assert.deepEqual(loadState(dir), {});
  saveState(dir, { fl: { last_ok: 'x' } });
  assert.equal(loadState(dir).fl.last_ok, 'x');
});

test('report: the list shows only "take it", not "no"; the status line lists silent and manual channels', () => {
  const records = [rec(), rec({ id: 'fl-2', title: 'Сайт для отеля', verdict: 'нет', rule: 'R4', reason: 'R4: 79 откликов' })];
  const text = renderMorning(records, {
    channels: { fl: { status: 'ok', count: 2 }, frru: { status: 'silent', flag: 'канал_молчит', reason: 'канал молчит: защита' } },
    collected: 2, silent: ['frru'],
  }, { manual: ['Kwork', 'Профи.ру'] });
  assert.match(text, /собрано 2 заказ/);
  assert.match(text, /молчат: frru/);
  assert.match(text, /руками: Kwork, Профи\.ру/);
  assert.match(text, /Лендинг для кофейни/);
  assert.doesNotMatch(text, /Сайт для отеля/);
});

test('report: "заказов нет" (no orders) and "канал молчит" (channel silent) are different phrases', () => {
  const none = renderMorning([], { channels: { fl: { status: 'ok', count: 3 } }, collected: 0, silent: [] }, { manual: [] });
  assert.match(none, /подходящих заказов нет/);
  assert.doesNotMatch(none, /молчат/);
});

test('report: the flag "отвечать с 10:00" is visible in the line', () => {
  const text = renderMorning([rec({ flags: ['отвечать_с_10:00', 'нет_бюджета'] })], { channels: {}, collected: 1, silent: [] }, { manual: [] });
  assert.match(text, /отвечать с 10:00/);
  assert.match(text, /нет бюджета/);
});

test('run: a channel blocked two runs in a row stays out for a day and is not polled', async () => {
  let calls = 0;
  const ch = [{ id: 'fl', load: async () => { calls++; throw new BlockedError(403); } }];
  const t1 = '2026-11-14T09:00:00+07:00';
  const r1 = await runChannels(ch, { now: t1 });
  const r2 = await runChannels(ch, { now: '2026-11-14T21:00:00+07:00', state: r1.state });
  assert.equal(calls, 2);
  const r3 = await runChannels(ch, { now: '2026-11-15T07:00:00+07:00', state: r2.state });
  assert.equal(calls, 2, 'третий запуск в пределах суток канал не трогает');
  assert.match(r3.report.channels.fl.reason, /стоит сутки/);
});

test('run: page served, 0 orders → "silent: layout"', async () => {
  const r = await runChannels([{ id: 'fl', load: async () => [] }]);
  assert.match(r.report.channels.fl.reason, /вёрстка/);
});
