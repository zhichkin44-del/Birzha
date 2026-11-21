import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluate } from '../src/radar/rules.js';
import { parseFl } from '../src/radar/parsers/fl.js';
import { findStopwords } from '../src/vitrina/stopwords.js';
import { TEMPLATES, detectKind } from '../src/replies/templates.ru.js';
import { buildPackage, buildAll, renderMarkdown, writeReplies, validatePackage } from '../src/replies/build.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const orders = load('./fixtures/orders.verdict.json');
const works = load('../src/vitrina/works.json').works;
const taken = orders.filter((o) => o.verdict === 'берём');
const DATE = '2026-11-14';

const mk = (over = {}) => ({ ...taken[1], ...over });

test('the fixture does not lie: each order\'s verdict matches what the radar gives', () => {
  for (const o of orders) assert.equal(evaluate(o).verdict, o.verdict, o.id);
});

test('every "take it" order gets a package: text, price, term, 1–2 works, questions', () => {
  assert.ok(taken.length >= 4);
  for (const o of taken) {
    const p = buildPackage(o);
    assert.equal(p.order_id, o.id);
    assert.ok(p.text.length > 100, o.id);
    assert.ok(Number.isInteger(p.price), o.id);
    assert.ok(Number.isInteger(p.term_days) && p.term_days > 0, o.id);
    assert.ok(p.works.length >= 1 && p.works.length <= 2, `${o.id}: работ ${p.works.length}`);
    assert.ok(p.questions.length >= 1, o.id);
    assert.deepEqual(p.problems, [], o.id);
  }
});

test('an order with verdict «нет» gets no package; buildAll skips it and names it', () => {
  assert.throws(() => buildPackage(orders.find((o) => o.verdict === 'нет')), /take it/);
  const r = buildAll(orders);
  assert.equal(r.packages.length, taken.length);
  assert.deepEqual(r.skipped.map((s) => s.id), ['fl-2222222']);
});

test('the reply text has no stop-words, even if the client wrote "с ИИ" (with AI) themselves', () => {
  const bot = taken.find((o) => o.id === 'syn-bot-1');
  assert.ok(findStopwords(bot.title).length > 0, 'фикстура должна содержать стоп-слово');
  for (const o of taken) {
    const p = buildPackage(o);
    assert.deepEqual(findStopwords(p.text), [], o.id);
    for (const q of p.questions) assert.deepEqual(findStopwords(q), [], o.id);
    for (const w of p.works) assert.deepEqual(findStopwords(`${w.title} ${w.pitch}`), [], `${o.id} ${w.id}`);
  }
});

test('the text has no school name, template gaps, "лучший" (best) or promises of results', () => {
  for (const o of taken) {
    const t = buildPackage(o).text;
    assert.doesNotMatch(t, /study\s*on/i, o.id);
    assert.doesNotMatch(t, /[{}]/, o.id);
    assert.doesNotMatch(t, /лучш|гарантир|№\s*1/i, o.id);
  }
});

test('price is not below 3 000 ₽ and not above the order budget (a number; a range — upper bound)', () => {
  for (const o of taken) {
    const p = buildPackage(o);
    assert.ok(p.price >= 3000, `${o.id}: ${p.price}`);
    if (typeof o.budget === 'number') assert.ok(p.price <= o.budget, o.id);
    if (o.budget && typeof o.budget === 'object') assert.ok(p.price <= o.budget.max, o.id);
  }
  assert.equal(buildPackage(taken[0]).price, 8000, 'без флага цена = бюджет');
  assert.equal(buildPackage(mk({ budget: 3000 })).price, 3000, 'бюджет ровно на пороге');
});

test('price by budget: budget 3 500 ₽ → not more than 3 500 ₽ and not less than 3 000 ₽, even with a discount', () => {
  const p = buildPackage(mk({ budget: 3500 }), { firstClient: true });
  assert.ok(p.price >= 3000 && p.price <= 3500, String(p.price));
});

test('an order with a budget below 3 000 ₽ gets no package (the radar does not pass such orders)', () => {
  assert.throws(() => buildPackage(mk({ budget: 2999 })), /3 ?000/);
});

test('without a budget the price is the template reference, marked, ≥ 3 000 ₽', () => {
  const fix = taken.find((o) => o.id === 'syn-fix-1');
  const p = buildPackage(fix);
  assert.ok(p.price >= 3000);
  assert.match(p.price_note, /бюджет не указан/);
});

test('the 30 % discount only with the "first client" flag: without the flag there is no budget price and no word "скидка"', () => {
  const o = taken[0];
  const plain = buildPackage(o);
  assert.equal(plain.price, 8000);
  assert.equal(plain.discount, null);
  assert.doesNotMatch(plain.text, /скидк|30\s*%/i);
  const first = buildPackage(o, { firstClient: true });
  assert.equal(first.price, 5600);
  assert.equal(first.discount, 30);
  assert.doesNotMatch(first.text, /скидк/i, 'the discount is already in the price; not mentioned in the text');
  assert.match(first.text, /5 600 ₽/);
});

test('a discount that would take the price below 3 000 ₽ is not applied and not mentioned in the text', () => {
  const p = buildPackage(mk({ budget: 4000 }), { firstClient: true });
  assert.equal(p.price, 4000, '4 000 × 0,7 = 2 800 < 3 000: цена остаётся по бюджету');
  assert.equal(p.discount, null);
  assert.doesNotMatch(p.text, /скидк/i);
});

test('reply length up to 900 characters, for any order and any discount combination', () => {
  for (const o of taken) {
    for (const firstClient of [false, true]) {
      const p = buildPackage(o, { firstClient });
      assert.ok(p.text.length <= 900, `${o.id} firstClient=${firstClient}: ${p.text.length}`);
    }
  }
});

test('a very long order title does not inflate the reply beyond 900 characters', () => {
  const p = buildPackage(mk({ title: `Telegram-бот ${'для записи клиентов '.repeat(30)}` }), { firstClient: true });
  assert.ok(p.text.length <= 900, String(p.text.length));
  assert.deepEqual(p.problems, []);
});

test('the first sentence names what the client asks for (a word from their title)', () => {
  const p = buildPackage(taken[0]);
  assert.match(p.text.split('\n')[0], /кофейн/i);
});

test('the reply is in the first person, without jargon such as "MVP", "API", "воркфлоу" (workflow)', () => {
  for (const o of taken) {
    const t = buildPackage(o).text;
    assert.match(t, /(Сделаю|Посмотрю|Сначала покажу)/, o.id);
    assert.doesNotMatch(t, /\bMVP\b|\bAPI\b|воркфлоу|пайплайн|\bUTM\b|\bстек\b/i, o.id);
  }
});

test('four templates: landing, bot, automation, site fix; the type is determined by the order text', () => {
  assert.deepEqual(TEMPLATES.map((t) => t.kind).sort(), ['automation', 'bot', 'fix', 'landing']);
  const kind = (title, text = '') => detectKind({ title, text });
  assert.equal(kind('Лендинг для кофейни'), 'landing');
  assert.equal(kind('Нужен Telegram-бот'), 'bot');
  assert.equal(kind('Парсер цен конкурентов'), 'automation');
  assert.equal(kind('Автоматизация отчётов'), 'automation');
  assert.equal(kind('Поправить вёрстку на сайте'), 'fix');
  assert.equal(kind('Доработка сайта на Tilda'), 'fix');
  assert.equal(kind('Верстка сайта'), 'landing');
  assert.equal(kind('Работа над ботом'), 'bot', 'слово «работа» не принимается за «бот»');
  assert.equal(kind('Выгрузка цен', 'собирать цены с сайта конкурента, автоматизация'), 'automation', 'слово «сайт» в тексте не делает автоматизацию лендингом');
  assert.equal(kind('Лендинг с формой в CRM'), 'landing');
});

test('works are taken by the order tag and exist in the showcase: landing → Лендинг, bot → Веб-приложение + Автоматизация', () => {
  const ids = new Set(works.map((w) => w.id));
  const byOrder = Object.fromEntries(taken.map((o) => [o.id, buildPackage(o).works.map((w) => w.id)]));
  for (const list of Object.values(byOrder)) for (const id of list) assert.ok(ids.has(id), id);
  assert.deepEqual(byOrder['fl-1111111'], ['w1']);
  assert.deepEqual(byOrder['syn-bot-1'], ['w6', 'w3']);
  assert.deepEqual(byOrder['syn-auto-1'], ['w3', 'w4']);
  assert.deepEqual(byOrder['syn-fix-1'], ['w1']);
});

test('term: from the order if named, otherwise from the template; it appears in the text as a number with "дн."', () => {
  assert.equal(buildPackage(taken.find((o) => o.id === 'syn-auto-1')).term_days, 3);
  const p = buildPackage(taken[0]);
  assert.match(p.text, new RegExp(`${p.term_days} дн\\.`));
});

test('the text has reply hours in Moscow time (6:00–16:00 = 10–20 UTC+7); the flag "отвечать с 10:00" gets into the package', () => {
  const p = buildPackage(taken.find((o) => o.id === 'syn-fix-1'));
  assert.match(p.text, /с 6:00 до 16:00 по Москве/);
  assert.doesNotMatch(p.text, /UTC+7/);
  assert.ok(p.flags.includes('отвечать_с_10:00'));
});

test('"Бот записи для барбершопа готов" is in the bot reply and not in the others', () => {
  for (const o of taken) {
    const has = /Бот записи для барбершопа готов/.test(buildPackage(o).text);
    assert.equal(has, o.id === 'syn-bot-1', o.id);
  }
});

test('validatePackage catches a stop-word, a price below the threshold and a length over 900', () => {
  const base = buildPackage(taken[0]);
  assert.ok(validatePackage({ ...base, text: `${base.text} Делаю с ИИ.` }, taken[0]).some((s) => /стоп/.test(s)));
  assert.ok(validatePackage({ ...base, price: 2900 }, taken[0]).some((s) => /3 ?000/.test(s)));
  assert.ok(validatePackage({ ...base, price: 9000 }, taken[0]).some((s) => /бюджет/.test(s)));
  assert.ok(validatePackage({ ...base, text: 'а'.repeat(901) }, taken[0]).some((s) => /900/.test(s)));
  assert.ok(validatePackage({ ...base, text: `${base.text} {имя}` }, taken[0]).some((s) => /пропуск/.test(s)));
});

test('radar link: order from an FL page → rules → package (landing, 8 000 ₽)', () => {
  const html = readFileSync(new URL('./fixtures/fl.synthetic.html', import.meta.url), 'utf8');
  const parsed = parseFl(html, '2026-11-14T10:00:00+07:00').map((o) => ({ ...o, ...evaluate(o) }));
  const ready = parsed.filter((o) => o.verdict === 'берём');
  assert.equal(ready.length, 1);
  const p = buildPackage(ready[0]);
  assert.equal(p.price, 8000);
  assert.equal(p.kind, 'landing');
});

test('markdown: each package has the order, link, price, text, works and questions; it says Sasha sends it', () => {
  const md = renderMarkdown(buildAll(orders), { date: DATE });
  assert.match(md, /^# Пакеты откликов · 2026-11-14/);
  assert.match(md, /Отправляет Саша/);
  for (const o of taken) {
    assert.ok(md.includes(o.url), o.id);
    assert.ok(md.includes(o.title), o.id);
  }
  assert.match(md, /Пропущено[\s\S]*Сайт для отеля[\s\S]*R4/);
  assert.match(md, /Вопросы заказчику/);
  assert.match(md, /Работы из витрины/);
});

test('writeReplies puts the file docs/replies/<date>.md into the given folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'birzha-replies-'));
  const file = writeReplies(orders, { dir, date: DATE });
  assert.equal(file, join(dir, `${DATE}.md`));
  assert.ok(existsSync(file));
  assert.match(readFileSync(file, 'utf8'), /Пакеты откликов/);
});

test('docs/replies/example.md matches what is built from the fixture now (not stale)', () => {
  const expected = renderMarkdown(buildAll(orders, { firstClient: true }), { date: DATE, firstClient: true });
  const actual = readFileSync(new URL('../docs/replies/example.md', import.meta.url), 'utf8');
  assert.equal(actual, expected);
});
