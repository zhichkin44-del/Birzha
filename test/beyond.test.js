// Sources beyond FL.ru and Kwork: Freelancehunt, Weblancer, Freelance.ru, Telegram feeds (t.me/s). Task "orders beyond the exchanges", 14.11.2026.
// Fixtures are synthetic copies of the real layouts (the real pages of 14.11 were analysed by hand, see the parser headers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFreelancehunt, parseFreelancehuntChecked, postedMs } from '../src/radar/parsers/freelancehunt.js';
import { parseWeblancer, parseWeblancerChecked } from '../src/radar/parsers/weblancer.js';
import { parseFreelanceRu, parseFreelanceRuChecked } from '../src/radar/parsers/freelanceru.js';
import { parseTelegram, parseTelegramChecked } from '../src/radar/parsers/telegram.js';
import { scrubPersonal, moneyOf, textOf } from '../src/radar/parsers/common.js';
import { LayoutChangedError } from '../src/radar/fetch.js';
import { evaluate } from '../src/radar/rules.js';
import { runChannels } from '../src/radar/run.js';
import { statusLine } from '../src/radar/report.js';
import { CHANNELS, autoChannels } from '../src/radar/channels.js';

const fix = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = '2026-11-14T12:00:00+07:00'; // = 05:00 UTC
const NOW2 = '2026-11-14T20:00:00+07:00'; // = 13:00 UTC
const PERSONAL = /@[A-Za-z]{4,}|\+7|salon@|owner@|hr@|t\.me\//;

// ---------- common ----------
test('scrubPersonal: @name, t.me link, email and phone are cut, the text stays', () => {
  const t = scrubPersonal('Писать @owner_test или t.me/owner_test, почта a.b@mail.ru, звонить +7 (900) 123-45-67 или 8 912 345 67 89. Сайт нужен.');
  assert.doesNotMatch(t, PERSONAL);
  assert.doesNotMatch(t, /mail\.ru|900|912/);
  assert.match(t, /Писать/);
  assert.match(t, /Сайт нужен/);
});

test('moneyOf: rubles, dollars, hryvnias → rubles by reference rate; "Не указан" → null', () => {
  assert.deepEqual(moneyOf('95 000 ₽ / заказ'), { rub: 95000, raw: '95000 RUB' });
  assert.deepEqual(moneyOf('100 $'), { rub: 8000, raw: '100 USD' });
  assert.deepEqual(moneyOf('16 221 UAH'), { rub: 32442, raw: '16221 UAH' });
  assert.deepEqual(moneyOf('Не указан'), { rub: null, raw: null });
  assert.deepEqual(moneyOf('по договорённости'), { rub: null, raw: null });
  assert.equal(moneyOf('').rub, null);
});

test('textOf: tags, comments <!-- -->, entities and invisible characters are removed', () => {
  assert.equal(textOf('1000<!-- --> $ &amp; <b>да</b>&nbsp;нет​'), '1000 $ & да нет');
});

// ---------- Freelancehunt ----------
test('Freelancehunt: four cards → three orders (duplicate number dropped), links and ids', () => {
  const o = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.deepEqual(o.map((x) => x.id), ['fh-9000001', 'fh-9000002', 'fh-9000003']);
  assert.ok(o.every((x) => x.channel === 'fh' && x.collected_at === NOW));
  assert.equal(o[0].url, 'https://freelancehunt.com/project/telegram-bot-zapisi-klientov/9000001.html');
  assert.equal(o[0].title, 'Telegram-бот записи клиентов & напоминаний');
});

test('Freelancehunt: budget in hryvnias → rubles, original currency kept; "Не указан" → null', () => {
  const o = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.equal(o[0].budget, 60000);
  assert.equal(o[0].budget_raw, '30000 UAH');
  assert.equal(o[1].budget, null);
  assert.equal(o[1].budget_raw, null);
});

test('Freelancehunt: bids → answers (12, 1, 109)', () => {
  const o = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.deepEqual(o.map((x) => x.answers), [12, 1, 109]);
});

test('Freelancehunt: date "13 ноября" — start of the day (Kyiv), "10:13" — today, and if not yet reached — yesterday', () => {
  const o = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.equal(o[0].posted_at, '2026-11-12T22:00:00.000Z');
  assert.equal(o[0].age_hours, 31);
  assert.equal(o[1].posted_at, '2026-11-13T08:13:00.000Z'); // 10:13 Kyiv = 08:13 UTC > 05:00 UTC now → yesterday
  assert.equal(o[1].age_hours, 20.78);
  assert.ok(Number.isNaN(postedMs('вчера', NOW)));
  assert.equal(new Date(postedMs('31 декабря', '2027-01-01T00:30:00Z')).toISOString(), '2026-12-30T22:00:00.000Z'); // December — last year
});

test('Freelancehunt: client contacts in the description are cut', () => {
  const [a] = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.doesNotMatch(a.text + a.title, PERSONAL);
  assert.match(a.text, /Нужен бот для салона/);
});

test('Freelancehunt: empty page with the phrase → [], without the phrase and without cards → "layout changed"', () => {
  assert.deepEqual(parseFreelancehuntChecked(fix('fh.empty.html'), NOW), []);
  assert.throws(() => parseFreelancehuntChecked('<html><body>что-то другое</body></html>', NOW), LayoutChangedError);
});

// ---------- Weblancer ----------
test('Weblancer: closed order and duplicate are skipped; id and link with www', () => {
  const o = parseWeblancer(fix('wl.synthetic.html'), NOW);
  assert.deepEqual(o.map((x) => x.id), ['wl-1270001', 'wl-1270002']);
  assert.equal(o[0].url, 'https://www.weblancer.net/freelance/sozdanie-botov-31/bot-dlya-zapisi-klientov-1270001/');
  assert.ok(o.every((x) => x.channel === 'weblancer'));
});

test('Weblancer: price in dollars (with <!-- -->) → rubles; no price → null; bids → answers', () => {
  const [a, b] = parseWeblancer(fix('wl.synthetic.html'), NOW);
  assert.equal(a.budget, 8000);
  assert.equal(a.budget_raw, '100 USD');
  assert.equal(b.budget, null);
  assert.deepEqual([a.answers, b.answers], [8, 1]);
});

test('Weblancer: date without time — start of the day in Moscow', () => {
  const [a] = parseWeblancer(fix('wl.synthetic.html'), NOW);
  assert.equal(a.posted_at, '2026-11-12T21:00:00.000Z');
  assert.equal(a.age_hours, 32);
});

test('Weblancer: contacts are cut', () => {
  const [a] = parseWeblancer(fix('wl.synthetic.html'), NOW);
  assert.doesNotMatch(a.text, PERSONAL);
  assert.match(a.text, /Telegram-бот для салона/);
});

test('Weblancer: a page of only closed orders is not "layout"; a completely foreign page → "layout changed"', () => {
  const onlyClosed = fix('wl.synthetic.html').replace(/<article[\s\S]*?<\/article>/g, (m) => (m.includes('закрыт') ? m : ''));
  assert.deepEqual(parseWeblancerChecked(onlyClosed, NOW), []);
  assert.throws(() => parseWeblancerChecked('<html><body>Доступ ограничен</body></html>', NOW), LayoutChangedError);
});

// ---------- Freelance.ru ----------
test('Freelance.ru: three orders, id, link, section at the start of the text', () => {
  const o = parseFreelanceRu(fix('frru.synthetic.html'), NOW2);
  assert.deepEqual(o.map((x) => x.id), ['frru-9000001', 'frru-9000002', 'frru-9000003']);
  assert.equal(o[0].url, 'https://freelance.ru/task/view/9000001');
  assert.ok(o[0].text.startsWith('Веб-разработка и IT. Нужен сайт-визитка'));
  assert.ok(o.every((x) => x.channel === 'frru'));
});

test('Freelance.ru: fee, term, comments; "по договорённости" (negotiable) → null', () => {
  const o = parseFreelanceRu(fix('frru.synthetic.html'), NOW2);
  assert.equal(o[0].budget, 15000);
  assert.equal(o[0].deadline_days, 10);
  assert.equal(o[0].answers, 2);
  assert.equal(o[1].budget, 50);
  assert.equal(o[2].budget, null);
  assert.equal(o[2].deadline_days, null);
});

test('Freelance.ru: time from the title in Moscow → ISO and age; contacts are cut', () => {
  const o = parseFreelanceRu(fix('frru.synthetic.html'), NOW2);
  assert.equal(o[0].posted_at, '2026-11-14T07:42:00.000Z');
  assert.equal(o[0].age_hours, 5.3);
  assert.doesNotMatch(o[0].text, PERSONAL);
  assert.doesNotMatch(o[0].text, /\.\.\.$/); // do not carry the "..." truncation from the card
});

test('Freelance.ru: no cards and no phrase → "layout changed"', () => {
  assert.throws(() => parseFreelanceRuChecked('<html><body>Авторизация</body></html>', NOW2), LayoutChangedError);
  assert.equal(parseFreelanceRuChecked(fix('frru.synthetic.html'), NOW2).length, 3);
});

// ---------- Telegram ----------
test('Telegram: a post without text (image) is skipped; the others are orders of channel tg-<name>', () => {
  const o = parseTelegram(fix('tg.synthetic.html'), NOW2, 'FreelanceBay');
  assert.deepEqual(o.map((x) => x.id), ['tg-freelancebay-9000001', 'tg-freelancebay-9000003', 'tg-freelancebay-9000004']);
  assert.ok(o.every((x) => x.channel === 'tg-freelancebay'));
  assert.equal(o[0].url, 'https://t.me/FreelanceBay/9000001');
});

test('Telegram: title — a bold line without an icon; channel ad and contacts are cut; budget from the text', () => {
  const [a] = parseTelegram(fix('tg.synthetic.html'), NOW2, 'FreelanceBay');
  assert.equal(a.title, 'Telegram-бот записи для салона');
  assert.doesNotMatch(a.text, /Разместить|рекламу|Получать больше/);
  assert.doesNotMatch(a.text, PERSONAL);
  assert.equal(a.budget, 25000); // «25&nbsp;000 ₽»
  assert.equal(a.answers, null);
});

test('Telegram: time from datetime, age in hours; without bold — title from the start of the text', () => {
  const o = parseTelegram(fix('tg.synthetic.html'), NOW2, 'FreelanceBay');
  assert.equal(o[0].posted_at, '2026-11-14T05:00:00.000Z');
  assert.equal(o[0].age_hours, 8);
  assert.equal(o[2].title, 'Лендинг для кофейни на Tilda, макет есть. Пишите в лс');
});

test('Telegram: channel without a web preview (no feed) → "layout changed", not a silent "0"', () => {
  assert.throws(() => parseTelegramChecked(fix('tg.nopreview.html'), NOW2, 'programming_jobs'), LayoutChangedError);
  assert.equal(parseTelegramChecked(fix('tg.synthetic.html'), NOW2, 'FreelanceBay').length, 3);
});

// ---------- rule verdicts on the new sources ----------
test('Rules: bot from Freelancehunt (60 000 ₽, 12 bids) — "take it"', () => {
  const v = evaluate(parseFreelancehunt(fix('fh.synthetic.html'), NOW)[0]);
  assert.equal(v.verdict, 'берём');
});

test('Rules: AI agent with 109 bids, not fresh — R4; review on Yandex.Maps — R1', () => {
  const fh = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.equal(evaluate(fh[2]).rule, 'R4');
  const fr = parseFreelanceRu(fix('frru.synthetic.html'), NOW2);
  assert.equal(evaluate(fr[1]).rule, 'R1');
});

test('Rules: vacancy from Telegram (salary) — R1; Tilda landing from Telegram — "take it"', () => {
  const tg = parseTelegram(fix('tg.synthetic.html'), NOW2, 'FreelanceBay');
  assert.equal(evaluate(tg[1]).rule, 'R1');
  assert.equal(evaluate(tg[2]).verdict, 'берём');
});

// Words from real pages on 14.11: false "take it" and a false R1 (RISKS №5)
const real = (title, text = title) => evaluate({ title, text, budget: null, answers: 3, age_hours: 2, deadline_days: null, collected_at: '2026-11-14T10:00:00+03:00' });
test('Words: "штат Иллинойс" (State of Illinois) is not a vacancy (Freelancehunt, AI agent for a US construction company)', () => {
  assert.notEqual(real('Разработка AI-агента', 'Ищу разработчика автоматизации для компании (США, штат Иллинойс), нужен бот для поиска клиентов').rule, 'R1');
});
test('Words: copywriter, targetologist, editor, post designer, Unity — not our product line, even if the text says "сайт"', () => {
  for (const t of ['Ищем копирайтера для сайта', 'Требуется таргетолог, нужен ленд и ботов для уведомлений', 'Нужен монтажёр для сайта студии', 'Дизайнер постов и историй для свадебного салона, сайт есть', 'Разработчик Unity UGUI — набор интерфейса']) {
    assert.equal(real(t).rule, 'R2', t);
  }
});
test('Words: vacancies from the Telegram feed ("Ищем в команду", "Менеджер по продажам", "Руководитель проектов", "доход на 2–3 день") — R1', () => {
  for (const t of ['Ищем в команду разработчика, сайт компании', 'Менеджер по продажам CRM-системы автоматизации бизнеса', 'Руководитель проектов, автоматизация процессов', 'Доход на 2-3 день работы, свой сайт не нужен']) {
    assert.equal(real(t).rule, 'R1', t);
  }
});
test('Words: real orders are not lost — landing page, booking bot, business-card site, WordPress fixes', () => {
  for (const t of ['Лендинг для услуги по вывозу мусора', 'Telegram-бот для записи клиентов', 'Сайт-визитка для стоматологии', 'Внесение правок для сайта WordPress']) {
    assert.equal(real(t).verdict, 'берём', t);
  }
});

// ---------- channels, report ----------
test('Channels: auto and manual channels have a 10 s pause, a recorded basis and rules; no page=/login URLs', () => {
  const ids = ['fh', 'frru', 'weblancer', 'tg-freelancebay', 'tg-frwork3', 'tg-zakaz_design'];
  // fh and weblancer on 14.11 served robots a Cloudflare challenge (403) → "manual": read as a saved page; no protection bypass is written
  for (const id of ['tg-freelancebay', 'tg-frwork3', 'tg-zakaz_design']) assert.ok(autoChannels().includes(id), id);
  for (const id of ['fl', 'frru', 'kwork', 'pchel', 'flcom', 'pph']) assert.ok(!autoChannels().includes(id) && CHANNELS[id].blocked_note, `${id}: manual per the platform rules`);
  assert.ok(autoChannels().filter((id) => id.startsWith('tg-')).length >= 15, 'at least 15 Telegram feeds');
  for (const id of ['fh', 'weblancer']) assert.ok(CHANNELS[id].mode === 'manual' && /Cloudflare/.test(CHANNELS[id].blocked_note), id);
  for (const id of ids) {
    const c = CHANNELS[id];
    assert.ok(c.mode === 'auto' || c.blocked_note, id);
    assert.equal(c.pause_sec, 10, id);
    assert.ok((c.owner_decision || c.blocked_note || c.tg) && c.why && c.rules,`${id}: owner decision or manual reason, basis and rules recorded`);
    for (const u of c.feeds ?? [c.feed]) {
      assert.match(u, /^https:\/\//, id);
      assert.doesNotMatch(u, /page=|login|\?.*=/i, `${u}: без параметров и входа`);
    }
  }
  assert.equal(CHANNELS.fh.feeds.length, 3);
  assert.equal(CHANNELS.weblancer.feeds.length, 3);
});

test('Channels: the tg-<name> key matches what the parser writes to order.channel', () => {
  for (const [id, c] of Object.entries(CHANNELS).filter(([, x]) => x.tg)) {
    const [o] = parseTelegram(fix('tg.synthetic.html'), NOW2, c.tg);
    assert.equal(o.channel, id);
  }
});

test('Runner: some channel pages did not open — orders taken, the status line says "частично" with the reason', async () => {
  const good = Object.assign(parseFreelancehunt(fix('fh.synthetic.html'), NOW), { warnings: ['/projects/skill/veb-programmirovanie/99.html: blocked: защита (HTTP 403)'] });
  const { records, report } = await runChannels([{ id: 'fh', load: async () => good }], { now: NOW });
  assert.equal(records.length, 3);
  assert.equal(report.channels.fh.status, 'ok');
  const line = statusLine(report, []);
  assert.match(line, /частично: fh/);
  assert.match(line, /403/);
});

test('All new parsers: no record contains @names, emails, phones or t.me links to people', () => {
  const all = [
    ...parseFreelancehunt(fix('fh.synthetic.html'), NOW),
    ...parseWeblancer(fix('wl.synthetic.html'), NOW),
    ...parseFreelanceRu(fix('frru.synthetic.html'), NOW2),
    ...parseTelegram(fix('tg.synthetic.html'), NOW2, 'FreelanceBay'),
  ];
  assert.ok(all.length >= 9);
  for (const o of all) assert.doesNotMatch(JSON.stringify(o).replace(/https:\/\/t\.me\/FreelanceBay\/\d+/g, ''), PERSONAL, o.id);
});

test('Report: budget in hryvnias/dollars is shown with the original currency and the conversion; in rubles — as before', async () => {
  const { renderMorning } = await import('../src/radar/report.js');
  const rec = (budget, budget_raw) => ({ id: 'x', channels: ['fh'], title: 'Бот', verdict: 'берём', reason: 'R1–R7 пройдены', flags: [], budget, budget_raw, answers: 3, age_hours: 2, url: 'https://x' });
  assert.match(renderMorning([rec(60000, '30000 UAH')], { channels: {}, silent: [], collected: 1 }), /30000 UAH \(≈60000 ₽\)/);
  assert.match(renderMorning([rec(15000, '15000 RUB')], { channels: {}, silent: [], collected: 1 }), /15000 ₽/);
  assert.match(renderMorning([rec(5000, undefined)], { channels: {}, silent: [], collected: 1 }), /5000 ₽/);
});

test('PARSERS: every auto channel has a parser, and it reads its own channel fixture', async () => {
  const { PARSERS } = await import('../src/radar/parsers/index.js');
  for (const id of [...autoChannels(), 'fh', 'weblancer']) assert.equal(typeof PARSERS[id], 'function', id);
  assert.equal(PARSERS.fh(fix('fh.synthetic.html'), NOW).length, 3);
  assert.equal(PARSERS.weblancer(fix('wl.synthetic.html'), NOW).length, 2);
  assert.equal(PARSERS.frru(fix('frru.synthetic.html'), NOW2).length, 3);
  assert.equal(PARSERS['tg-freelancebay'](fix('tg.synthetic.html'), NOW2).length, 3);
});

test('Words: logo, A4 catalog, "Макет готов… в печати" — not our product line; Tilda web designer and interface design — ours', () => {
  for (const t of ['Дизайн логотипа и айдентики', 'Каталог продукции в формате А4', 'Макет готов. А как он будет выглядеть в печати?']) assert.equal(real(t).rule, 'R2', t);
  for (const t of ['Требуется веб-дизайнер на Тильду', 'Дизайн интерфейса мобильного приложения', 'Дизайн лендинга в фигме']) assert.equal(real(t).verdict, 'берём', t);
});

// ---------- Pchel.net ----------
import { parsePchel, parsePchelChecked } from '../src/radar/parsers/pchel.js';

test('moneyOf: currency sign before the amount ("$33") is read', () => {
  assert.deepEqual(moneyOf('$33'), { rub: 2640, raw: '33 USD' });
  assert.deepEqual(moneyOf('По договоренности'), { rub: null, raw: null });
});

test('Pchel.net: two orders (duplicate number dropped), price in $ → ₽, bids, section in the text, contacts cut, no date', () => {
  const o = parsePchel(fix('pchel.synthetic.html'), NOW);
  assert.deepEqual(o.map((x) => x.id), ['pchel-9100001', 'pchel-9100002']);
  assert.equal(o[0].url, 'https://pchel.net/jobs/website-development/lending-dlya-kofeyni-9100001/');
  assert.equal(o[0].budget, 8000);
  assert.equal(o[0].budget_raw, '100 USD');
  assert.deepEqual([o[0].answers, o[1].answers], [9, 2]);
  assert.equal(o[1].budget, null);
  assert.ok(o[0].text.startsWith('Разработка сайтов, Лендинги. Нужен лендинг'));
  assert.doesNotMatch(o[0].text, PERSONAL);
  assert.equal(o[0].age_hours, null);
  assert.equal(o[0].channel, 'pchel');
});

test('Pchel.net: foreign page → "layout changed"', () => {
  assert.throws(() => parsePchelChecked('<html><body>Вход</body></html>', NOW), LayoutChangedError);
});
