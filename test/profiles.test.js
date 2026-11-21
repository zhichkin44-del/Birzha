import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { findStopwords } from '../src/vitrina/stopwords.js';

const DIR = new URL('../docs/profiles/', import.meta.url);
const PLATFORMS = ['fl', 'kwork', 'freelance-ru', 'profi', 'weblancer'];
const works = JSON.parse(readFileSync(new URL('../src/vitrina/works.json', import.meta.url), 'utf8'));

const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.md')) : [];
const read = (f) => readFileSync(new URL(f, DIR), 'utf8');

test('a profile exists for each platform in the radar plan, plus a checklist', () => {
  for (const p of PLATFORMS) assert.ok(files.includes(`${p}.md`), `нет docs/profiles/${p}.md`);
  assert.ok(files.includes('CHECKLIST.md'), 'нет docs/profiles/CHECKLIST.md');
});

test('profile texts contain no stop-words (Sasha\'s decision: no AI and no models)', () => {
  for (const f of files) assert.deepEqual(findStopwords(read(f)), [], f);
});

test('profile texts do not contain the name Study On (only with Sasha\'s word)', () => {
  for (const f of files) assert.ok(!/Study[\s ]?On/i.test(read(f)), `${f}: Study On`);
});

test('any price in rubles in the profiles is not below 3 000 ₽ (Sasha\'s decision)', () => {
  let seen = 0;
  for (const f of files) {
    for (const m of read(f).matchAll(/(\d[\d  ]*)\s*(?:₽|руб)/gu)) {
      const n = Number(m[1].replace(/[\s ]/g, ''));
      seen++;
      assert.ok(n >= 3000, `${f}: цена ${n} ₽ ниже 3 000`);
    }
  }
  assert.ok(seen > 0, 'в профилях нет ни одной цены — тест ничего не проверил');
});

test('every platform profile has a "от" (from) price, a limit and showcase works', () => {
  for (const p of PLATFORMS) {
    const t = read(`${p}.md`);
    assert.match(t, /от \d[\d  ]* ₽/u, `${p}: no "от" (from) price`);
    assert.match(t, /[Лл]имит/, `${p}: the limit is not mentioned`);
    assert.match(t, /\bw[1-7]\b|Лендинг для школы/u, `${p}: showcase works are not listed`);
  }
});

test('the "≈ N characters" label matches the section length ±10 % (check 14.11)', () => {
  let seen = 0;
  for (const p of PLATFORMS) {
    const t = read(`${p}.md`);
    for (const m of t.matchAll(/^## О себе — .*\(≈ ([\d  ]+) знаков\)$/gmu)) {
      const label = Number(m[1].replace(/[\s ]/g, ''));
      const rest = t.slice(m.index + m[0].length + 1);
      const end = rest.search(/^## /m);
      const len = [...(end < 0 ? rest : rest.slice(0, end)).trim()].length;
      seen++;
      assert.ok(Math.abs(len - label) <= label * 0.1, `${p}: метка ${label}, а в тексте ${len} знаков`);
    }
  }
  assert.ok(seen >= 10, 'меток длины меньше 10 — тест ничего не проверил');
});

test('the 30 % discount everywhere with the condition "total not below 3 000 ₽"', () => {
  for (const p of PLATFORMS) {
    for (const m of read(`${p}.md`).matchAll(/скидка 30 %.{0,40}/gu)) assert.match(m[0], /не ниже 3[\s ]000 ₽/u, `${p}: ${m[0]}`);
  }
});

test('no "можно посмотреть" and no "в Chrome": there are no live links, the check was on a test page', () => {
  for (const p of PLATFORMS) {
    const t = read(`${p}.md`);
    assert.ok(!/можно посмотреть/.test(t), `${p}: "можно посмотреть" without a link`);
    assert.ok(!/в Chrome/.test(t), `${p}: "в Chrome" instead of "on the test page"`);
  }
});

test('the title of work w1 does not contain "Pixel" (unclear to the client)', () => {
  assert.ok(!/Pixel/i.test(works.works.find((w) => w.id === 'w1').title));
});
