import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, esc } from '../src/vitrina/build.js';
import { STOPWORDS, findStopwords } from '../src/vitrina/stopwords.js';

const data = JSON.parse(readFileSync(new URL('../src/vitrina/works.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../site/style.css', import.meta.url), 'utf8');

test('страница собирается из данных и совпадает с site/index.html', () => {
  const out = render(data);
  assert.ok(out.startsWith('<!doctype html>'));
  assert.equal(out, html, 'site/index.html устарел: запусти node src/vitrina/build.js');
  for (const w of data.works) {
    assert.ok(out.includes(`id="${w.id}"`), `нет карточки ${w.id}`);
    assert.ok(out.includes(esc(w.title)), `нет заголовка ${w.id}`);
  }
});

test('esc экранирует чужие строки', () => {
  const out = render({ ...data, works: [{ ...data.works[0], title: '<script>x</script>' }] });
  assert.ok(!out.includes('<script>x'));
  assert.ok(out.includes('&lt;script&gt;'));
});

test('в стоп-листе есть обязательные слова', () => {
  for (const w of ['ии', 'нейросет', 'gpt', 'claude', 'gemini', 'модел', 'искусственн']) {
    assert.ok(STOPWORDS.includes(w), w);
  }
});

test('findStopwords ловит слова и не ловит чужие', () => {
  assert.deepEqual(findStopwords('Сделано с ИИ'), ['ии']);
  assert.deepEqual(findStopwords('нейросеть и GPT-4'), ['нейросет', 'gpt']);
  assert.deepEqual(findStopwords('Искусственный интеллект, модель'), ['искусственн', 'модел']);
  assert.deepEqual(findStopwords('Сайты, ботики, Витрина, тиии'), []);
});

test('на странице и в данных нет слов из стоп-листа (включая комментарии)', () => {
  assert.deepEqual(findStopwords(html), []);
  assert.deepEqual(findStopwords(JSON.stringify(data)), []);
});

test('у каждой работы есть ссылка и источники фактов (без ссылки — только с пометкой linkPending)', () => {
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

test('лендинг школы (отметка Саши, 06-demo-backlog.json:26) первой карточкой, но без названия школы и города до слова Саши', () => {
  assert.equal(data.works[0].id, 'w1');
  assert.match(html, /id="w1"/);
  assert.match(html, /Tilda/);
  assert.match(html, /Pixel/);
  assert.ok(!/Study\s?On|Шымкент/i.test(html), 'название и город — только после «да» Саши');
});

test('у каждой работы указано, где Саша велел её включить', () => {
  for (const w of data.works) {
    assert.ok(typeof w.approval === 'string' && w.approval.length > 10, `${w.id}: нет approval`);
    assert.match(w.approval, /\.(md|json):\d+/, `${w.id}: approval без файла:строки`);
  }
});

test('непроверенные по сети ссылки помечены link.checked=false и не выдаются за проверенные', () => {
  for (const w of data.works) {
    if (!w.link) continue;
    assert.equal(typeof w.link.checked, 'boolean', `${w.id}: нет link.checked`);
    if (!w.link.checked) {
      assert.ok(w.sources.some((s) => /по сети не открывал/.test(s)), `${w.id}: в sources нет «по сети не открывал»`);
    }
  }
});

test('ничего не сверенного: нет «не указан», версии Секретаря 0.1.0, «Штаб v0.5», шоу-бизнеса', () => {
  assert.ok(!/не указан/.test(html));
  assert.ok(!/0\.1\.0|v0\.5|шоу-бизнес/.test(html));
});

test('у Видеостудии и Zokul ссылки на страницы проектов, не на корень портфолио', () => {
  const byId = Object.fromEntries(data.works.map((w) => [w.id, w]));
  assert.match(byId.w5.link.url, /\/projects\/video-studio\/$/);
  assert.match(byId.w6.link.url, /\/projects\/zokul\/$/);
});

test('«144 поста» дано с датами из stats.json', () => {
  assert.match(html, /144 поста с 29\.10 по 02\.11/);
});

test('цена «от 3 000 ₽», скидка 30 %, ответы 10–20 UTC+7, демо-бот в работе', () => {
  assert.match(html, /от 3 000\s?₽|от 3 000 ₽/);
  assert.match(html, /30\s?%/);
  assert.match(html, /с 10:00 до 20:00/);
  assert.match(html, /UTC+7/);
  assert.match(html, /Демо-бот в работе/);
});

test('нет служебного текста и внешних скриптов', () => {
  assert.ok(!/<script/i.test(html));
  assert.ok(!/https?:\/\/[^"']*\.(js)\b/.test(html));
  assert.ok(!/undefined|null|\[object/.test(html));
});

test('нет горизонтальной прокрутки на 375: фиксированных ширин > 375px нет', () => {
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
