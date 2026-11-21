import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKwork, parseKworkChecked, extractWants } from '../src/radar/parsers/kwork.js';
import { fetchPage, BlockedError } from '../src/radar/fetch.js';
import { runChannels } from '../src/radar/run.js';
import { CHANNELS } from '../src/radar/channels.js';

const fix = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const html = fix('kwork.synthetic.html');
const NOW = '2026-11-14T20:00:00+07:00'; // = 13:00 UTC = 16:00 Moscow

test('Kwork: page → three orders (duplicate id dropped)', () => {
  const orders = parseKwork(html, NOW);
  assert.equal(orders.length, 3);
  assert.deepEqual(orders.map((o) => o.id), ['kwork-9000001', 'kwork-9000002', 'kwork-9000003']);
  assert.ok(orders.every((o) => o.channel === 'kwork' && o.collected_at === NOW));
});

test('Kwork: budget is the client\'s desired price (not the upper bound); the acceptable one only if there is no desired one; 0 → null', () => {
  const [a, b, c] = parseKwork(html, NOW);
  assert.equal(a.budget, 15000); // priceLimit 15000, possiblePriceLimit 45000 → the desired one is taken
  assert.equal(b.budget, 3000);
  assert.equal(c.budget, null);
});

test('Kwork: replies from kwork_count (number and string), link to the order', () => {
  const [a, b, c] = parseKwork(html, NOW);
  assert.equal(a.answers, 7);
  assert.equal(b.answers, 0);
  assert.equal(c.answers, 31);
  assert.equal(a.url, 'https://kwork.ru/projects/9000001');
});

test('Kwork: entities are decoded, line breaks collapse', () => {
  const [a, b] = parseKwork(html, NOW);
  assert.match(a.text, /услуги & времени, напоминание/);
  assert.match(a.text, /"Лотос"/);
  assert.equal(b.title, 'Правки вёрстки «Каталог»');
});

test('Kwork: publication time in Moscow → ISO and age in hours', () => {
  const [a, , c] = parseKwork(html, NOW);
  assert.equal(a.posted_at, '2026-11-14T09:30:00.000Z');
  assert.equal(a.age_hours, 3.5);
  assert.equal(c.posted_at, '2026-11-13T09:00:00.000Z');
  assert.equal(c.age_hours, 28);
});

test('Kwork: JSON is extracted by bracket parsing, not a regex (strings with brackets)', () => {
  const h = 'x"wants":[{"id":1,"name":"a ] b [ \\" c","description":"","kwork_count":2,"priceLimit":"100.00"}],"z":1';
  const w = extractWants(h);
  assert.equal(w.length, 1);
  assert.equal(w[0].name, 'a ] b [ " c');
});

test('Kwork: empty list "wants":[] → [] without alarm', () => {
  assert.deepEqual(parseKworkChecked(fix('kwork.empty.html'), NOW), []);
});

test('Kwork: page without data (layout/protection) → "layout changed", the runner is silent with a reason', async () => {
  assert.throws(() => parseKworkChecked('<html><body>Другая страница</body></html>', NOW), { name: 'LayoutChangedError' });
  const out = await runChannels([{ id: 'kwork', load: async () => parseKworkChecked('<html>иначе</html>', NOW) }], { now: NOW });
  const rep = out.report.channels.kwork;
  assert.equal(rep.flag, 'вёрстка_изменилась');
  assert.match(rep.reason, /проверь руками/);
});

test('Kwork: empty list in the runner → "канал молчит" (channel silent) with a reason', async () => {
  const out = await runChannels([{ id: 'kwork', load: async () => parseKworkChecked(fix('kwork.empty.html'), NOW) }], { now: NOW });
  assert.equal(out.report.channels.kwork.flag, 'канал_молчит');
  assert.match(out.report.channels.kwork.reason, /заказов 0/);
});

test('Kwork: captcha at 200 → BlockedError; the runner is silent with the reason "защита" (protection)', async () => {
  const fetchImpl = async (url) =>
    url.endsWith('/robots.txt')
      ? { status: 200, ok: true, text: async () => 'User-agent: *\nDisallow: /search\n' }
      : { status: 200, ok: true, text: async () => '<html><head></head><body><h1>Подтвердите, что вы не робот</h1></body></html>' };
  await assert.rejects(fetchPage('https://kwork.ru/projects?c=11', { fetchImpl, sleepImpl: async () => {}, robotsCache: new Map() }), BlockedError);
  const out = await runChannels([{ id: 'kwork', load: async () => { throw new BlockedError(200, 'капча'); } }], { now: NOW });
  assert.equal(out.report.channels.kwork.flag, 'канал_молчит');
  assert.match(out.report.channels.kwork.reason, /защита/);
});

test('Kwork: the channel is manual per the platform rules; feed — one page without page, pause ≥ 10 s', () => {
  const c = CHANNELS.kwork;
  assert.equal(c.mode, 'manual');
  assert.match(c.blocked_note, /Manual only/);
  assert.doesNotMatch(c.feed, /page=/);
  assert.ok(c.pause_sec >= 10);
});

test('Kwork: no desired price (0), an acceptable one exists → budget = acceptable', () => {
  const h = 'x"wants":[{"id":7,"name":"Лендинг","description":"","kwork_count":1,"priceLimit":"0.00","possiblePriceLimit":9000}],"z":1';
  assert.equal(parseKwork(h, NOW)[0].budget, 9000);
});
