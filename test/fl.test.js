import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFl } from '../src/radar/parsers/fl.js';
import { fetchPage, BlockedError } from '../src/radar/fetch.js';

const html = readFileSync(new URL('./fixtures/fl.synthetic.html', import.meta.url), 'utf8');
const NOW = '2026-11-14T10:00:00+07:00';

test('FL: страница → три заказа с id, бюджетом, откликами (синтетическая страница)', () => {
  const orders = parseFl(html, NOW);
  assert.equal(orders.length, 3);
  assert.equal(orders[0].id, 'fl-1111111');
  assert.equal(orders[0].url, 'https://www.fl.ru/projects/1111111/lending-dlya-kofeyni.html');
  assert.equal(orders[0].title, 'Лендинг для кофейни');
  assert.equal(orders[0].budget, 8000);
  assert.equal(orders[0].answers, 5);
  assert.equal(orders[0].age_hours, 2);
  assert.equal(orders[0].posted_at, '2026-11-14T01:00:00.000Z');
});

test('FL: «Договорная» → budget null, «1 день назад» → 24 ч, «30 минут» → 0.5 ч', () => {
  const orders = parseFl(html, NOW);
  assert.equal(orders[1].budget, null);
  assert.equal(orders[1].age_hours, 24);
  assert.equal(orders[2].age_hours, 0.5);
});

test('FL: страница без заказов → пустой список (раннер скажет «молчит: вёрстка»)', () => {
  assert.deepEqual(parseFl('<html>ничего</html>', NOW), []);
});

test('fetch: 403 → BlockedError, повтора нет', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { status: 403, ok: false, text: async () => '' }; };
  await assert.rejects(fetchPage('https://x', { fetchImpl, sleepImpl: async () => {} }), BlockedError);
  assert.equal(calls, 1);
});

test('fetch: страница с капчей при 200 → BlockedError', async () => {
  const fetchImpl = async () => ({ status: 200, ok: true, text: async () => '<html>Введите captcha</html>' });
  await assert.rejects(fetchPage('https://x', { fetchImpl, sleepImpl: async () => {} }), BlockedError);
});

test('fetch: пауза делается до запроса, без cookie, с User-Agent', async () => {
  const log = [];
  const fetchImpl = async (url, init) => { log.push(['fetch', init]); return { status: 200, ok: true, text: async () => 'ok' }; };
  await fetchPage('https://x', { fetchImpl, pauseMs: 10_000, sleepImpl: async (ms) => log.push(['sleep', ms]) });
  assert.deepEqual(log[0], ['sleep', 10_000]);
  assert.equal(log[1][1].credentials, 'omit');
  assert.match(log[1][1].headers['user-agent'], /BirzhaRadar/);
  assert.equal(log[1][1].headers.cookie, undefined);
});
