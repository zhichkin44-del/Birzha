import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFl } from '../src/radar/parsers/fl.js';
import { fetchPage, BlockedError } from '../src/radar/fetch.js';

const html = readFileSync(new URL('./fixtures/fl.synthetic.html', import.meta.url), 'utf8');
const NOW = '2026-11-14T10:00:00+07:00';

test('FL: page → three orders with id, budget, replies (synthetic page)', () => {
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

test('FL: "Договорная" (negotiable) → budget null, "1 день назад" (1 day ago) → 24 h, "30 минут" (30 minutes) → 0.5 h', () => {
  const orders = parseFl(html, NOW);
  assert.equal(orders[1].budget, null);
  assert.equal(orders[1].age_hours, 24);
  assert.equal(orders[2].age_hours, 0.5);
});

test('FL: page without orders → empty list (the runner will say "silent: layout")', () => {
  assert.deepEqual(parseFl('<html>ничего</html>', NOW), []);
});

test('fetch: 403 → BlockedError, no retry', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { status: 403, ok: false, text: async () => '' }; };
  await assert.rejects(fetchPage('https://x', { fetchImpl, sleepImpl: async () => {} }), BlockedError);
  assert.equal(calls, 1);
});

test('fetch: page with a captcha at 200 → BlockedError', async () => {
  const fetchImpl = async () => ({ status: 200, ok: true, text: async () => '<html>Введите captcha</html>' });
  await assert.rejects(fetchPage('https://x', { fetchImpl, sleepImpl: async () => {} }), BlockedError);
});

test('fetch: the pause happens before the request; no cookies; with a User-Agent', async () => {
  const log = [];
  const fetchImpl = async (url, init) => { log.push(['fetch', init]); return { status: 200, ok: true, text: async () => 'ok' }; };
  await fetchPage('https://x', { fetchImpl, pauseMs: 10_000, sleepImpl: async (ms) => log.push(['sleep', ms]) });
  assert.deepEqual(log[0], ['sleep', 10_000]);
  assert.equal(log[1][1].credentials, 'omit');
  assert.match(log[1][1].headers['user-agent'], /BirzhaRadar/);
  assert.equal(log[1][1].headers.cookie, undefined);
});

// --- Check against the real FL.ru page 14.11.2026 (live run: 0 orders because of two bugs) ---
import { USER_AGENT } from '../src/radar/fetch.js';
import { ageHours, dateMsk, budgetOf } from '../src/radar/parsers/fl.js';

const card = (id, { price, kind = 'Заказ', when, body = 'Текст', answers = '3 ответа' }) => `
<div class="b-post" qa-project-name="project-item${id}" id="project-item${id}" >
<h2><a id="prj_name_${id}" name="prj${id}" href="/projects/${id}/zakaz.html">Заказ ${id}</a></h2>
<div class="d-flex b-post__price p-0"><span class="text-4">${price}</span></div>
<div class="b-post__txt text-5 ">${body}</div>
<div class="b-post__foot"><a href="/projects/${id}/zakaz.html">Откликнуться</a>
<span class="b-post__bold b-layout__txt_inline-block text-7 text-dark mr-4">${kind}</span>
<span class="text-gray-opacity-4 text-7 mr-16">${when}</span>
<span data-id="fl-view-count-href" href="/projects/${id}/zakaz.html">${answers}</span>
</div>`;

test('User-Agent is Latin-only: Node fetch rejects Cyrillic in a header (the live run on 14.11 was silent)', () => {
  assert.ok([...USER_AGENT].every((ch) => ch.charCodeAt(0) <= 127), USER_AGENT);
  assert.doesNotThrow(() => new Headers({ 'user-agent': USER_AGENT }));
  assert.match(USER_AGENT, /BirzhaRadar/);
});

test('FL: the "Откликнуться" (reply) link does not produce a second order with the same id', () => {
  const orders = parseFl(html, NOW);
  assert.equal(new Set(orders.map((o) => o.id)).size, orders.length);
  assert.ok(!orders.some((o) => o.title === 'Откликнуться'));
});

test('FL: "&#8381;" and &nbsp; → budget as a number; range → upper bound; "по договоренности" → null', () => {
  assert.equal(budgetOf('1 500 ₽'), 1500);
  const o = parseFl(card(1, { price: '1&nbsp;500&nbsp; &#8381;', when: '22 минуты назад' }) + card(2, { price: '5&nbsp;000&nbsp;₽ – 10&nbsp;000&nbsp;₽', when: '1 час назад' }) + card(3, { price: 'по договоренности', when: '1 час назад' }), NOW);
  assert.deepEqual(o.map((x) => x.budget), [1500, 10000, null]);
});

test('FL: "5 часов 9 минут назад" → 5.15 h; "1 октября, 15:12" (Moscow) → date and age', () => {
  assert.equal(ageHours('5 часов 9 минут назад'), 5.15);
  assert.equal(dateMsk('1 октября, 15:12', NOW), '2026-10-01T12:12:00.000Z');
  assert.equal(dateMsk('20 декабря, 10:00', NOW), '2025-12-20T07:00:00.000Z', 'дата из будущего → прошлый год');
  assert.equal(dateMsk('3 мая, 09:30', NOW), '2026-05-03T06:30:00.000Z');
  const [o] = parseFl(card(4, { price: '3&nbsp;000&nbsp; &#8381;', when: '1 октября, 15:12' }), NOW);
  assert.equal(o.posted_at, '2026-10-01T12:12:00.000Z');
  assert.ok(o.age_hours > 24 * 40);
});

test('FL: a vacancy is marked in the text — rule R1 filters it out', () => {
  const [o] = parseFl(card(5, { price: 'по результатам собеседования', kind: 'Вакансия&nbsp;', when: '11 часов 32 минуты назад', body: 'Разработчик сайтов' }), NOW);
  assert.match(o.text, /^Вакансия\. Разработчик сайтов/);
  assert.equal(o.age_hours, 11.53);
  assert.equal(o.answers, 3);
});

test('fetch: meta recaptcha-site-key in <head> of a regular page is not a captcha (live run 14.11)', async () => {
  const page = '<html><head><meta name="recaptcha-site-key" content="x"><script>grecaptcha.ready()</script></head><body><div id="project-item1">Заказ</div></body></html>';
  const fetchImpl = async () => ({ status: 200, ok: true, text: async () => page });
  assert.equal(await fetchPage('https://x', { fetchImpl, sleepImpl: async () => {}, robotsCache: new Map() }).catch((e) => e.message), page);
});

// --- skeptic review 14.11 ---
import { evaluate } from '../src/radar/rules.js';

test('R2: SEO/promotion and a copy of someone else\'s site — "no", even with the word "сайт" (skeptic review 14.11)', () => {
  const base = { channel: 'fl', budget: 5000, answers: 3, age_hours: 1, deadline_days: null, collected_at: NOW };
  for (const text of ['SEO консультация по продвижению сайта', 'Скопировать сайт конкурента один в один', 'Настроить Яндекс Директ для сайта']) {
    assert.equal(evaluate({ ...base, title: text, text }).verdict, 'нет', text);
  }
  assert.equal(evaluate({ ...base, title: 'Лендинг на Tilda', text: 'Лендинг на Tilda для школы' }).verdict, 'берём');
});

test('replies come from the card counter, not from the description; "Нет ответов" → 0', () => {
  const [a] = parseFl(card(6, { price: '5&nbsp;000&nbsp; &#8381;', when: '1 час назад', body: 'Было 40 ответов на прошлый заказ', answers: '2 ответа' }), NOW);
  assert.equal(a.answers, 2);
  const [b] = parseFl(card(7, { price: '5&nbsp;000&nbsp; &#8381;', when: '1 час назад', answers: 'Нет ответов' }), NOW);
  assert.equal(b.answers, 0);
  // on the real page "Нет ответов" is an <a> link, not a <span> counter
  const real = card(8, { price: 'по договоренности', when: '1 час назад', answers: '' }).replace('<span data-id="fl-view-count-href" href="/projects/8/zakaz.html"></span>', '<a href="/projects/8/zakaz.html">Нет ответов</a>');
  assert.ok(real.includes('<a href="/projects/8/zakaz.html">Нет ответов</a>'));
  assert.equal(parseFl(real, NOW)[0].answers, 0);
  assert.equal(b.answers, 0);
});

test('fetch: captcha in <noscript> and "Подтвердите, что вы не робот" (confirm you are not a robot) → blocked', async () => {
  for (const page of ['<html><head></head><body><noscript>Введите captcha</noscript></body></html>', '<html><body>Подтвердите, что вы не робот</body></html>']) {
    const fetchImpl = async () => ({ status: 200, ok: true, text: async () => page });
    await assert.rejects(fetchPage('https://x', { fetchImpl, sleepImpl: async () => {}, robotsCache: new Map() }), BlockedError, page);
  }
});

test('R2: "Спапсить сайт" — no; "Сайт и продвижение в поиске" — not cut by the word "продвижение"', () => {
  const base = { channel: 'fl', budget: 5000, answers: 3, age_hours: 1, deadline_days: null, collected_at: NOW };
  assert.equal(evaluate({ ...base, title: 'Спапсить сайт', text: 'Спапсить сайт' }).verdict, 'нет');
  assert.equal(evaluate({ ...base, title: 'Сайт + продвижение', text: 'Сделать сайт на Tilda и продвижение в поиске' }).verdict, 'берём');
});
