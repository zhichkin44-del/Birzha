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

test('фикстура не врёт: вердикт каждого заказа совпадает с тем, что даёт радар', () => {
  for (const o of orders) assert.equal(evaluate(o).verdict, o.verdict, o.id);
});

test('на каждый заказ «берём» собирается пакет: текст, цена, срок, 1–2 работы, вопросы', () => {
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

test('заказ с вердиктом «нет» пакета не получает; buildAll его пропускает и называет', () => {
  assert.throws(() => buildPackage(orders.find((o) => o.verdict === 'нет')), /берём/);
  const r = buildAll(orders);
  assert.equal(r.packages.length, taken.length);
  assert.deepEqual(r.skipped.map((s) => s.id), ['fl-2222222']);
});

test('в тексте отклика нет стоп-слов, даже если заказчик сам написал «с ИИ»', () => {
  const bot = taken.find((o) => o.id === 'syn-bot-1');
  assert.ok(findStopwords(bot.title).length > 0, 'фикстура должна содержать стоп-слово');
  for (const o of taken) {
    const p = buildPackage(o);
    assert.deepEqual(findStopwords(p.text), [], o.id);
    for (const q of p.questions) assert.deepEqual(findStopwords(q), [], o.id);
    for (const w of p.works) assert.deepEqual(findStopwords(`${w.title} ${w.pitch}`), [], `${o.id} ${w.id}`);
  }
});

test('в тексте нет названия школы, фигурных пропусков, «лучший» и обещаний результата', () => {
  for (const o of taken) {
    const t = buildPackage(o).text;
    assert.doesNotMatch(t, /study\s*on/i, o.id);
    assert.doesNotMatch(t, /[{}]/, o.id);
    assert.doesNotMatch(t, /лучш|гарантир|№\s*1/i, o.id);
  }
});

test('цена не ниже 3 000 ₽ и не выше бюджета заказа (число, вилка — верхняя граница)', () => {
  for (const o of taken) {
    const p = buildPackage(o);
    assert.ok(p.price >= 3000, `${o.id}: ${p.price}`);
    if (typeof o.budget === 'number') assert.ok(p.price <= o.budget, o.id);
    if (o.budget && typeof o.budget === 'object') assert.ok(p.price <= o.budget.max, o.id);
  }
  assert.equal(buildPackage(taken[0]).price, 8000, 'без флага цена = бюджет');
  assert.equal(buildPackage(mk({ budget: 3000 })).price, 3000, 'бюджет ровно на пороге');
});

test('цена по бюджету: бюджет 3 500 ₽ → не больше 3 500 ₽ и не меньше 3 000 ₽, даже со скидкой', () => {
  const p = buildPackage(mk({ budget: 3500 }), { firstClient: true });
  assert.ok(p.price >= 3000 && p.price <= 3500, String(p.price));
});

test('заказ с бюджетом ниже 3 000 ₽ пакет не получает (радар такой не пропускает)', () => {
  assert.throws(() => buildPackage(mk({ budget: 2999 })), /3 ?000/);
});

test('без бюджета цена — ориентир шаблона, помечена, ≥ 3 000 ₽', () => {
  const fix = taken.find((o) => o.id === 'syn-fix-1');
  const p = buildPackage(fix);
  assert.ok(p.price >= 3000);
  assert.match(p.price_note, /бюджет не указан/);
});

test('скидка 30 % только при флаге «первый клиент»: без флага цены по бюджету и слова «скидка» нет', () => {
  const o = taken[0];
  const plain = buildPackage(o);
  assert.equal(plain.price, 8000);
  assert.equal(plain.discount, null);
  assert.doesNotMatch(plain.text, /скидк|30\s*%/i);
  const first = buildPackage(o, { firstClient: true });
  assert.equal(first.price, 5600);
  assert.equal(first.discount, 30);
  assert.match(first.text, /скидка 30 %/);
  assert.match(first.text, /5 600 ₽/);
});

test('скидка, которая увела бы цену ниже 3 000 ₽, не применяется и в тексте её нет', () => {
  const p = buildPackage(mk({ budget: 4000 }), { firstClient: true });
  assert.equal(p.price, 4000, '4 000 × 0,7 = 2 800 < 3 000: цена остаётся по бюджету');
  assert.equal(p.discount, null);
  assert.doesNotMatch(p.text, /скидк/i);
});

test('длина отклика — до 900 знаков, у любого заказа и с любой комбинацией скидки', () => {
  for (const o of taken) {
    for (const firstClient of [false, true]) {
      const p = buildPackage(o, { firstClient });
      assert.ok(p.text.length <= 900, `${o.id} firstClient=${firstClient}: ${p.text.length}`);
    }
  }
});

test('очень длинное название заказа не раздувает отклик сверх 900 знаков', () => {
  const p = buildPackage(mk({ title: `Telegram-бот ${'для записи клиентов '.repeat(30)}` }), { firstClient: true });
  assert.ok(p.text.length <= 900, String(p.text.length));
  assert.deepEqual(p.problems, []);
});

test('первая фраза называет то, что просит заказчик (слово из его названия)', () => {
  const p = buildPackage(taken[0]);
  assert.match(p.text.split('\n')[0], /кофейн/i);
});

test('отклик назван в первом лице, без жаргона вроде «MVP», «API», «воркфлоу»', () => {
  for (const o of taken) {
    const t = buildPackage(o).text;
    assert.match(t, /(Сделаю|Посмотрю|Сначала покажу)/, o.id);
    assert.doesNotMatch(t, /\bMVP\b|\bAPI\b|воркфлоу|пайплайн|\bUTM\b|\bстек\b/i, o.id);
  }
});

test('четыре шаблона: лендинг, бот, автоматизация, правка сайта; тип определяется по тексту заказа', () => {
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

test('работы берутся по тегу заказа и есть в витрине: лендинг → Лендинг, бот → Веб-приложение + Автоматизация', () => {
  const ids = new Set(works.map((w) => w.id));
  const byOrder = Object.fromEntries(taken.map((o) => [o.id, buildPackage(o).works.map((w) => w.id)]));
  for (const list of Object.values(byOrder)) for (const id of list) assert.ok(ids.has(id), id);
  assert.deepEqual(byOrder['fl-1111111'], ['w1']);
  assert.deepEqual(byOrder['syn-bot-1'], ['w6', 'w3']);
  assert.deepEqual(byOrder['syn-auto-1'], ['w3', 'w4']);
  assert.deepEqual(byOrder['syn-fix-1'], ['w1']);
});

test('срок: из заказа, если он назван; иначе по шаблону; он есть в тексте числом «дн.»', () => {
  assert.equal(buildPackage(taken.find((o) => o.id === 'syn-auto-1')).term_days, 3);
  const p = buildPackage(taken[0]);
  assert.match(p.text, new RegExp(`${p.term_days} дн\\.`));
});

test('в тексте часы ответа 10:00–20:00 UTC+7; флаг «отвечать с 10:00» попадает в пакет', () => {
  const p = buildPackage(taken.find((o) => o.id === 'syn-fix-1'));
  assert.match(p.text, /с 10:00 до 20:00 UTC+7/);
  assert.ok(p.flags.includes('отвечать_с_10:00'));
});

test('«Демо-бот в работе» есть в отклике на бота и нет в остальных', () => {
  for (const o of taken) {
    const has = /Демо-бот в работе/.test(buildPackage(o).text);
    assert.equal(has, o.id === 'syn-bot-1', o.id);
  }
});

test('validatePackage ловит стоп-слово, цену ниже порога и длину свыше 900', () => {
  const base = buildPackage(taken[0]);
  assert.ok(validatePackage({ ...base, text: `${base.text} Делаю с ИИ.` }, taken[0]).some((s) => /стоп/.test(s)));
  assert.ok(validatePackage({ ...base, price: 2900 }, taken[0]).some((s) => /3 ?000/.test(s)));
  assert.ok(validatePackage({ ...base, price: 9000 }, taken[0]).some((s) => /бюджет/.test(s)));
  assert.ok(validatePackage({ ...base, text: 'а'.repeat(901) }, taken[0]).some((s) => /900/.test(s)));
  assert.ok(validatePackage({ ...base, text: `${base.text} {имя}` }, taken[0]).some((s) => /пропуск/.test(s)));
});

test('связка с радаром: заказ из страницы FL → правила → пакет (лендинг, 8 000 ₽)', () => {
  const html = readFileSync(new URL('./fixtures/fl.synthetic.html', import.meta.url), 'utf8');
  const parsed = parseFl(html, '2026-11-14T10:00:00+07:00').map((o) => ({ ...o, ...evaluate(o) }));
  const ready = parsed.filter((o) => o.verdict === 'берём');
  assert.equal(ready.length, 1);
  const p = buildPackage(ready[0]);
  assert.equal(p.price, 8000);
  assert.equal(p.kind, 'landing');
});

test('markdown: у каждого пакета заказ, ссылка, цена, текст, работы, вопросы; сказано, что отправляет Саша', () => {
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

test('writeReplies кладёт файл docs/replies/<дата>.md в указанную папку', () => {
  const dir = mkdtempSync(join(tmpdir(), 'birzha-replies-'));
  const file = writeReplies(orders, { dir, date: DATE });
  assert.equal(file, join(dir, `${DATE}.md`));
  assert.ok(existsSync(file));
  assert.match(readFileSync(file, 'utf8'), /Пакеты откликов/);
});

test('docs/replies/example.md совпадает с тем, что собирается из фикстуры сейчас (не устарел)', () => {
  const expected = renderMarkdown(buildAll(orders, { firstClient: true }), { date: DATE, firstClient: true });
  const actual = readFileSync(new URL('../docs/replies/example.md', import.meta.url), 'utf8');
  assert.equal(actual, expected);
});
