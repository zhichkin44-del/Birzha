import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, esc } from '../src/vitrina/build.js';
import { STOPWORDS, findStopwords } from '../src/vitrina/stopwords.js';

const data = JSON.parse(readFileSync(new URL('../src/vitrina/works.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../site/style.css', import.meta.url), 'utf8');

test('the page is built from data and matches site/index.html', () => {
  const out = render(data);
  assert.ok(out.startsWith('<!doctype html>'));
  assert.equal(out, html, 'site/index.html is stale: run node src/vitrina/build.js');
  for (const w of data.works) {
    assert.ok(out.includes(`id="${w.id}"`), `нет карточки ${w.id}`);
    assert.ok(out.includes(esc(w.title)), `нет заголовка ${w.id}`);
  }
});

test('esc escapes foreign strings', () => {
  const out = render({ ...data, works: [{ ...data.works[0], title: '<script>x</script>' }] });
  assert.ok(!out.includes('<script>x'));
  assert.ok(out.includes('&lt;script&gt;'));
});

test('the stop-list contains the required words', () => {
  for (const w of ['ии', 'нейросет', 'gpt', 'claude', 'gemini', 'модел', 'искусственн']) {
    assert.ok(STOPWORDS.includes(w), w);
  }
});

test('findStopwords catches the words and not others', () => {
  assert.deepEqual(findStopwords('Сделано с ИИ'), ['ии']);
  assert.deepEqual(findStopwords('нейросеть и GPT-4'), ['нейросет', 'gpt']);
  assert.deepEqual(findStopwords('Искусственный интеллект, модель'), ['искусственн', 'модел']);
  assert.deepEqual(findStopwords('Сайты, ботики, Витрина, тиии'), []);
});

test('the page and the data contain no stop-list words (including comments)', () => {
  assert.deepEqual(findStopwords(html), []);
  assert.deepEqual(findStopwords(JSON.stringify(data)), []);
});

test('every work has a link and fact sources (without a link — only with the linkPending mark)', () => {
  assert.ok(data.works.length >= 1);
  const pending = [];
  for (const w of data.works) {
    assert.ok(Array.isArray(w.sources) && w.sources.length > 0, `${w.id}: нет источников`);
    if (w.linkPending) { pending.push(w.id); assert.equal(w.link, null); continue; }
    assert.match(w.link?.url ?? '', /^https:\/\//, `${w.id}: нет ссылки`);
    assert.ok(w.link.label, `${w.id}: нет подписи ссылки`);
    assert.ok(html.includes(`href="${w.link.url}"`), `${w.id}: ссылки нет на странице`);
  }
  assert.deepEqual(pending, ['w1'], 'без ссылки может быть только Study On, пока Саша не даст адрес');
});

test('the school landing (Sasha\'s mark, 06-demo-backlog.json:26) is the first card, but without the school name and city until Sasha\'s word', () => {
  assert.equal(data.works[0].id, 'w1');
  assert.match(html, /id="w1"/);
  assert.match(html, /Tilda/);
  assert.match(html, /Pixel/);
  assert.ok(!/Study\s?On|Шымкент/i.test(html), 'school name and city — only after Sasha\'s "yes"');
});

test('every work states where Sasha asked to include it', () => {
  for (const w of data.works) {
    assert.ok(typeof w.approval === 'string' && w.approval.length > 10, `${w.id}: нет approval`);
    assert.match(w.approval, /\.(md|json):\d+/, `${w.id}: approval без файла:строки`);
  }
});

test('links not checked over the network are marked link.checked=false and are not presented as verified', () => {
  for (const w of data.works) {
    if (!w.link) continue;
    assert.equal(typeof w.link.checked, 'boolean', `${w.id}: нет link.checked`);
    if (!w.link.checked) {
      assert.ok(w.sources.some((s) => /по сети не открывал/.test(s)), `${w.id}: sources lack "по сети не открывал" (not checked over the network)`);
    }
  }
});

test('nothing unverified: no "не указан", no Secretary version 0.1.0, no "Штаб v0.5", no show business', () => {
  assert.ok(!/не указан/.test(html));
  assert.ok(!/0\.1\.0|v0\.5|шоу-бизнес/.test(html));
});

test('Video Studio and Zokul links point to project pages, not to the portfolio root', () => {
  const byId = Object.fromEntries(data.works.map((w) => [w.id, w]));
  assert.match(byId.w5.link.url, /\/projects\/video-studio\/$/);
  assert.match(byId.w6.link.url, /\/projects\/zokul\/$/);
});

test('"144 поста" (144 posts) is given with dates from stats.json', () => {
  assert.match(html, /144 поста с 29\.10 по 02\.11/);
});

test('price "от 3 000 ₽", 30 % discount, replies 6–16 Moscow time, booking bot ready', () => {
  assert.match(html, /от 3 000\s?₽|от 3 000 ₽/);
  assert.match(html, /30\s?%/);
  assert.match(html, /с 6:00 до 16:00 по Москве/);
  assert.match(html, /Бот записи для барбершопа готов/);
});

test('no service text and no external scripts', () => {
  assert.ok(!/<script/i.test(html));
  assert.ok(!/https?:\/\/[^"']*\.(js)\b/.test(html));
  assert.ok(!/undefined|null|\[object/.test(html));
});

test('no horizontal scrolling at 375: no fixed widths above 375px', () => {
  const bad = [];
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*/g, '');
  for (const m of rules.matchAll(/(?<![-\w])(min-width|width)\s*:\s*(\d+(?:\.\d+)?)px/g)) {
    if (Number(m[2]) > 375) bad.push(m[0]);
  }
  assert.deepEqual(bad, []);
  assert.match(css, /overflow-wrap\s*:\s*anywhere/);
  assert.match(css, /box-sizing\s*:\s*border-box/);
  assert.match(html, /name="viewport"/);
});
