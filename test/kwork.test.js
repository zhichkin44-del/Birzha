import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKwork, parseKworkChecked, extractWants } from '../src/radar/parsers/kwork.js';
import { fetchPage, BlockedError } from '../src/radar/fetch.js';
import { runChannels } from '../src/radar/run.js';
import { CHANNELS } from '../src/radar/channels.js';

const fix = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const html = fix('kwork.synthetic.html');
const NOW = '2026-11-14T20:00:00+07:00'; // = 13:00 UTC = 16:00 МСК

test('Kwork: страница → три заказа (дубль id отброшен)', () => {
  const orders = parseKwork(html, NOW);
  assert.equal(orders.length, 3);
  assert.deepEqual(orders.map((o) => o.id), ['kwork-9000001', 'kwork-9000002', 'kwork-9000003']);
  assert.ok(orders.every((o) => o.channel === 'kwork' && o.collected_at === NOW));
});

test('Kwork: бюджет — желаемая цена заказчика (не верхняя граница); допустимая — только если желаемой нет; 0 → null', () => {
  const [a, b, c] = parseKwork(html, NOW);
  assert.equal(a.budget, 15000); // priceLimit 15000, possiblePriceLimit 45000 → берём желаемую
  assert.equal(b.budget, 3000);
  assert.equal(c.budget, null);
});

test('Kwork: отклики из kwork_count (число и строка), ссылка на заказ', () => {
  const [a, b, c] = parseKwork(html, NOW);
  assert.equal(a.answers, 7);
  assert.equal(b.answers, 0);
  assert.equal(c.answers, 31);
  assert.equal(a.url, 'https://kwork.ru/projects/9000001');
});

test('Kwork: сущности декодируются, переводы строк схлопываются', () => {
  const [a, b] = parseKwork(html, NOW);
  assert.match(a.text, /услуги & времени, напоминание/);
  assert.match(a.text, /"Лотос"/);
  assert.equal(b.title, 'Правки вёрстки «Каталог»');
});

test('Kwork: время публикации по Москве → ISO и возраст в часах', () => {
  const [a, , c] = parseKwork(html, NOW);
  assert.equal(a.posted_at, '2026-11-14T09:30:00.000Z');
  assert.equal(a.age_hours, 3.5);
  assert.equal(c.posted_at, '2026-11-13T09:00:00.000Z');
  assert.equal(c.age_hours, 28);
});

test('Kwork: JSON достаётся скобочным разбором, а не регуляркой (строки со скобками)', () => {
  const h = 'x"wants":[{"id":1,"name":"a ] b [ \\" c","description":"","kwork_count":2,"priceLimit":"100.00"}],"z":1';
  const w = extractWants(h);
  assert.equal(w.length, 1);
  assert.equal(w[0].name, 'a ] b [ " c');
});

test('Kwork: пустой список "wants":[] → [] без тревоги', () => {
  assert.deepEqual(parseKworkChecked(fix('kwork.empty.html'), NOW), []);
});

test('Kwork: страница без данных (вёрстка/защита) → «вёрстка изменилась», раннер молчит с причиной', async () => {
  assert.throws(() => parseKworkChecked('<html><body>Другая страница</body></html>', NOW), { name: 'LayoutChangedError' });
  const out = await runChannels([{ id: 'kwork', load: async () => parseKworkChecked('<html>иначе</html>', NOW) }], { now: NOW });
  const rep = out.report.channels.kwork;
  assert.equal(rep.flag, 'вёрстка_изменилась');
  assert.match(rep.reason, /проверь руками/);
});

test('Kwork: пустой список в раннере → «канал молчит» с причиной', async () => {
  const out = await runChannels([{ id: 'kwork', load: async () => parseKworkChecked(fix('kwork.empty.html'), NOW) }], { now: NOW });
  assert.equal(out.report.channels.kwork.flag, 'канал_молчит');
  assert.match(out.report.channels.kwork.reason, /заказов 0/);
});

test('Kwork: капча при 200 → BlockedError, раннер «молчит» с причиной «защита»', async () => {
  const fetchImpl = async (url) =>
    url.endsWith('/robots.txt')
      ? { status: 200, ok: true, text: async () => 'User-agent: *\nDisallow: /search\n' }
      : { status: 200, ok: true, text: async () => '<html><head></head><body><h1>Подтвердите, что вы не робот</h1></body></html>' };
  await assert.rejects(fetchPage('https://kwork.ru/projects?c=11', { fetchImpl, sleepImpl: async () => {}, robotsCache: new Map() }), BlockedError);
  const out = await runChannels([{ id: 'kwork', load: async () => { throw new BlockedError(200, 'капча'); } }], { now: NOW });
  assert.equal(out.report.channels.kwork.flag, 'канал_молчит');
  assert.match(out.report.channels.kwork.reason, /защита/);
});

test('Kwork: канал auto по решению владельца, лента — одна страница без page, пауза ≥ 10 с', () => {
  const c = CHANNELS.kwork;
  assert.equal(c.mode, 'auto');
  assert.match(c.owner_decision, /14\.11/);
  assert.doesNotMatch(c.feed, /page=/);
  assert.ok(c.pause_sec >= 10);
});

test('Kwork: желаемой цены нет (0), есть допустимая → бюджет = допустимая', () => {
  const h = 'x"wants":[{"id":7,"name":"Лендинг","description":"","kwork_count":1,"priceLimit":"0.00","possiblePriceLimit":9000}],"z":1';
  assert.equal(parseKwork(h, NOW)[0].budget, 9000);
});
