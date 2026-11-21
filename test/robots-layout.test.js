// Стадия 4в: robots.txt в коде, «вёрстка изменилась» вместо «молчит», --file без пути, FL в режиме «руками».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fetchPage, RobotsClosedError, BlockedError, isPathAllowed } from '../src/radar/fetch.js';
import { parseFlChecked, looksEmptyFl } from '../src/radar/parsers/fl.js';
import { runChannels } from '../src/radar/run.js';
import { statusLine } from '../src/radar/report.js';
import { CHANNELS, autoChannels } from '../src/radar/channels.js';

const fix = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = '2026-11-14T10:00:00+07:00';
const noSleep = async () => {};

function fakeFetch(map, log = []) {
  return async (url) => {
    log.push(url);
    const r = map[url];
    if (!r) return { status: 404, ok: false, text: async () => '' };
    return { status: r.status ?? 200, ok: (r.status ?? 200) < 400, text: async () => r.body };
  };
}

test('robots: путь закрыт Disallow → RobotsClosedError, страница не запрошена', async () => {
  const log = [];
  const fetchImpl = fakeFetch({ 'https://site.test/robots.txt': { body: fix('robots.closed.txt') } }, log);
  await assert.rejects(
    fetchPage('https://site.test/projects/', { fetchImpl, sleepImpl: noSleep, robotsCache: new Map() }),
    RobotsClosedError,
  );
  assert.deepEqual(log, ['https://site.test/robots.txt']);
});

test('robots: путь не закрыт → страница запрошена', async () => {
  const log = [];
  const fetchImpl = fakeFetch(
    { 'https://site.test/robots.txt': { body: fix('robots.open.txt') }, 'https://site.test/projects/': { body: '<html>ok</html>' } },
    log,
  );
  const html = await fetchPage('https://site.test/projects/', { fetchImpl, sleepImpl: noSleep, robotsCache: new Map() });
  assert.equal(html, '<html>ok</html>');
  assert.deepEqual(log, ['https://site.test/robots.txt', 'https://site.test/projects/']);
});

test('robots: читается один раз за запуск (кэш), второй путь без повторного запроса', async () => {
  const log = [];
  const fetchImpl = fakeFetch(
    {
      'https://site.test/robots.txt': { body: fix('robots.open.txt') },
      'https://site.test/projects/': { body: 'a' },
      'https://site.test/projects/2/': { body: 'b' },
    },
    log,
  );
  const robotsCache = new Map();
  await fetchPage('https://site.test/projects/', { fetchImpl, sleepImpl: noSleep, robotsCache });
  await fetchPage('https://site.test/projects/2/', { fetchImpl, sleepImpl: noSleep, robotsCache });
  assert.equal(log.filter((u) => u.endsWith('/robots.txt')).length, 1);
});

test('robots: закрытый путь не открывает другой — /api/ закрыт, /projects/ нет', async () => {
  const rules = fix('robots.open.txt');
  assert.equal(isPathAllowed(rules, '/api/x'), false);
  assert.equal(isPathAllowed(rules, '/projects/'), true);
});

test('robots: правило со * и $, более длинное Allow побеждает', () => {
  const t = 'User-agent: *\nDisallow: /*/rss/\nDisallow: /a/\nAllow: /a/open/\nDisallow: /*.pdf$\n';
  assert.equal(isPathAllowed(t, '/x/rss/1'), false);
  assert.equal(isPathAllowed(t, '/a/open/1'), true);
  assert.equal(isPathAllowed(t, '/a/1'), false);
  assert.equal(isPathAllowed(t, '/f.pdf'), false);
  assert.equal(isPathAllowed(t, '/f.pdf.html'), true);
});

test('robots: группа с нашим именем BirzhaRadar важнее группы *', () => {
  const t = 'User-agent: *\nDisallow: /\n\nUser-agent: BirzhaRadar\nDisallow: /private/\n';
  assert.equal(isPathAllowed(t, '/projects/'), true);
  assert.equal(isPathAllowed(t, '/private/1'), false);
});

test('robots: нет файла (404) → можно; ответ 403 → BlockedError без запроса страницы; 500 → закрыто', async () => {
  const log = [];
  const ok = fakeFetch({ 'https://a.test/p': { body: 'x' } }, log);
  assert.equal(await fetchPage('https://a.test/p', { fetchImpl: ok, sleepImpl: noSleep, robotsCache: new Map() }), 'x');

  const log2 = [];
  const f403 = fakeFetch({ 'https://b.test/robots.txt': { status: 403, body: '' } }, log2);
  await assert.rejects(fetchPage('https://b.test/p', { fetchImpl: f403, sleepImpl: noSleep, robotsCache: new Map() }), BlockedError);
  assert.deepEqual(log2, ['https://b.test/robots.txt']);

  const f500 = fakeFetch({ 'https://c.test/robots.txt': { status: 500, body: '' } });
  await assert.rejects(fetchPage('https://c.test/p', { fetchImpl: f500, sleepImpl: noSleep, robotsCache: new Map() }), RobotsClosedError);
});

test('раннер: robots закрыл путь → канал «руками», без счётчика блокировок', async () => {
  const out = await runChannels(
    [{ id: 'fl', load: async () => { throw new RobotsClosedError('https://www.fl.ru/projects/'); } }],
    { now: NOW },
  );
  const rep = out.report.channels.fl;
  assert.equal(rep.flag, 'канал_молчит');
  assert.match(rep.reason, /robots\.txt/);
  assert.match(rep.reason, /руками/);
  assert.equal(out.state.fl.blocked_streak, 0);
});

test('FL: страница 200 с заказами 0 и без признаков пустого списка → «вёрстка изменилась», не «молчит»', () => {
  assert.throws(() => parseFlChecked('<html><body>Совсем другая вёрстка</body></html>', NOW), { name: 'LayoutChangedError' });
});

test('FL: страница с признаком пустого списка → [] без тревоги', () => {
  const empty = fix('fl.empty.html');
  assert.equal(looksEmptyFl(empty), true);
  assert.deepEqual(parseFlChecked(empty, NOW), []);
});

test('FL: обычная страница с заказами проходит проверку', () => {
  assert.equal(parseFlChecked(fix('fl.synthetic.html'), NOW).length, 3);
});

test('раннер: вёрстка изменилась → отдельный флаг и слова «проверь руками»', async () => {
  const out = await runChannels(
    [{ id: 'fl', load: async () => parseFlChecked('<html>иначе</html>', NOW) }],
    { now: NOW },
  );
  const rep = out.report.channels.fl;
  assert.equal(rep.flag, 'вёрстка_изменилась');
  assert.match(rep.reason, /вёрстка изменилась, проверь руками/);
  assert.equal(out.state.fl.blocked_streak, 0);
});

test('отчёт: «вёрстка изменилась» видна в строке состояния и не прячется среди «молчат»', async () => {
  const out = await runChannels([{ id: 'fl', load: async () => parseFlChecked('<html>иначе</html>', NOW) }], { now: NOW });
  const line = statusLine(out.report);
  assert.match(line, /вёрстка изменилась, проверь руками: fl/);
  assert.doesNotMatch(line, /молчат/);
});

test('cli: --file без пути → понятная ошибка, код 2', () => {
  const r = spawnSync(process.execPath, ['src/radar/cli.js', '--file'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr + r.stdout, /--file.*путь/);
});

test('авто — канал с прочитанными правилами (пункты) либо с явным решением владельца (дата + слово), остальные «руками»', () => {
  for (const [id, c] of Object.entries(CHANNELS)) {
    if (c.mode === 'auto') {
      const rulesRead = /п\. \d/.test(c.rules ?? '');
      const ownerSaid = /\d{2}\.\d{2}\.\d{4}.*«.+»/.test(c.owner_decision ?? '');
      // Telegram public feeds (t.me/s) stay auto without a rules citation: they are the only auto channels left without one
      assert.ok(rulesRead || ownerSaid || c.tg, `${id}: авто без прочитанных правил и без решения владельца`);
      assert.ok(c.rules, `${id}: нет поля rules`);
      assert.ok(c.pause_sec >= 10, `${id}: пауза меньше 10 с`);
    }
  }
  for (const id of ['tg-freelancebay', 'tg-frwork3', 'tg-zakaz_design']) assert.ok(autoChannels().includes(id), id);
  for (const id of ['fl', 'frru', 'kwork', 'pchel', 'flcom', 'pph']) assert.ok(!autoChannels().includes(id), `${id} — руками по правилам площадки`);
  for (const id of ['fh', 'weblancer', 'youdo', 'upwork', 'profi']) assert.ok(!autoChannels().includes(id), `${id} — «руками»`);
});
