import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFreelancer } from '../src/radar/parsers/freelancer.js';
import { parsePph, parsePphChecked } from '../src/radar/parsers/pph.js';
import { LayoutChangedError } from '../src/radar/fetch.js';
import { evaluate } from '../src/radar/rules.js';
import { buildReply, isEnglishOrder, writeDigest } from '../src/digest/build.js';
import { usd } from '../src/replies/templates.en.js';

const fl = readFileSync(new URL('./fixtures/freelancer.synthetic.json', import.meta.url), 'utf8');
const pph = readFileSync(new URL('./fixtures/pph.synthetic.html', import.meta.url), 'utf8');
const NOW = '2026-11-14T10:00:00Z';

test('Freelancer.com: только английские публичные, бюджет в ₽, почасовые без бюджета', () => {
  const o = parseFreelancer(fl, NOW);
  assert.deepEqual(o.map((x) => x.id), ['flcom-2000001', 'flcom-2000002', 'flcom-2000005']);
  assert.equal(o[0].budget, 250 * 80);
  assert.equal(o[0].budget_raw, '250 USD');
  assert.equal(o[1].budget, null);
  assert.equal(o[2].budget, Math.round(100 * 1.1 * 80));
  assert.ok(!JSON.stringify(o).includes('owner'));
});

test('Freelancer.com: нет result.projects → LayoutChangedError', () => {
  assert.throws(() => parseFreelancer('{"result":{}}', NOW), LayoutChangedError);
  assert.throws(() => parseFreelancer('not json', NOW), LayoutChangedError);
});

test('PeoplePerHour: карточки, цена K/£, возраст, автор не хранится', () => {
  const o = parsePph(pph, NOW);
  assert.equal(o.length, 3);
  assert.equal(o[0].id, 'pph-1000001');
  assert.equal(o[0].title, 'Build a landing page for a coffee shop');
  assert.equal(o[0].budget, 300 * 80);
  assert.equal(o[0].budget_raw, '300 USD');
  assert.equal(o[0].answers, 12);
  assert.equal(o[0].age_hours, 5);
  assert.equal(o[1].budget, 2600 * 80);
  assert.equal(o[1].age_hours, 24);
  assert.equal(o[2].budget_raw, '400 GBP');
  assert.ok(!JSON.stringify(o).includes('Test U'));
});

test('PeoplePerHour: 0 карточек без признака пустого списка → LayoutChangedError', () => {
  assert.throws(() => parsePphChecked('<html><body>hello</body></html>', NOW), LayoutChangedError);
});

const v = (title, text = '') => evaluate({ title, text, budget: null, answers: 0, age_hours: 1 }, { profile: 'first' }).verdict;

test('R2 на английских словах: берём / нет', () => {
  assert.equal(v('Build a landing page for a coffee shop'), 'берём');
  assert.equal(v('Telegram bot for booking appointments'), 'берём');
  assert.equal(v('Landing page with reCAPTCHA form'), 'берём');
  assert.equal(v('Google Ads specialist needed'), 'нет');
  assert.equal(v('Logo design for my brand'), 'нет');
  assert.equal(v('Bot to bypass captcha on a casino site'), 'нет');
  assert.equal(v('We are hiring a full-time developer'), 'нет');
});

test('isEnglishOrder: по каналу и по алфавиту', () => {
  assert.equal(isEnglishOrder({ channel: 'pph', title: 'x' }), true);
  assert.equal(isEnglishOrder({ channel: 'fl', title: 'Landing page for a shop', text: 'Need a landing page' }), true);
  assert.equal(isEnglishOrder({ channel: 'fl', title: 'Лендинг для кофейни', text: 'нужен лендинг' }), false);
});

const STOP = /(^|[^a-z])ai([^a-z]|$)|chatgpt|openai|gpt|claude|gemini|нейросет|модел|flux|ace-step/i;

test('EN-отклик: 4–6 строк, ≤900 знаков, без стоп-слов, цена в валюте заказчика', () => {
  for (const o of parsePph(pph, NOW).slice(0, 2).concat(parseFreelancer(fl, NOW).slice(0, 1))) {
    const r = buildReply({ ...o, channels: [o.channel] });
    assert.equal(r.lang, 'en', o.id);
    assert.deepEqual(r.problems, [], o.id);
    assert.ok(r.lines >= 4 && r.lines <= 6, o.id);
    assert.ok(r.text.length <= 900, o.id);
    assert.ok(!STOP.test(r.text), o.id);
    assert.match(r.text, /USD|\$/, o.id);
  }
});

test('EN-отклик: без публичной ссылки — «screenshots on request»; с проверенной — ссылка', () => {
  const landing = buildReply({ id: 'x', channel: 'pph', title: 'Landing page for a cafe', text: '', budget: 24000, budget_raw: '300 USD' });
  assert.match(landing.text, /screenshots on request/);
  assert.doesNotMatch(landing.text, /https?:\/\//);
  const ai = buildReply({ id: 'y', channel: 'pph', title: 'Video editing for my channel', text: '', budget: 24000, budget_raw: '300 USD' });
  assert.match(ai.text, /https:\/\/zhichkin44-del\.github\.io\/projects\//);
});

test('usd: курс 80 ₽/$, округление до 5 $', () => {
  assert.equal(usd(8000), '$100');
  assert.equal(usd(3000), '$40');
});

test('writeDigest с suffix пишет <день>-en.md, русский файл не трогает', async () => {
  const { mkdtempSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'birzha-'));
  const f = writeDigest('x', { dir, date: '2026-11-14', suffix: 'en' });
  assert.ok(f.endsWith('2026-11-14-en.md'));
  assert.ok(existsSync(f));
  assert.ok(!existsSync(join(dir, '2026-11-14.md')));
});
