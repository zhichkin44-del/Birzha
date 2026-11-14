// Ужесточение R2 (14.11, по живому прогону): дизайн логотипа, копирайт, каталог А4 для печати, игровой бот с обходом капчи.
// Для каждого правила: заказ из прогона → «нет»; близкий заказ, который брать надо → «берём».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/radar/rules.js';

const order = (title, text = '') => ({ title, text, budget: 8000, answers: 3, age_hours: 1, deadline_days: 5, collected_at: '2026-11-14T12:00:00+07:00' });
const verdict = (title, text) => evaluate(order(title, text));

test('R2 чистый дизайн: логотип и айдентика — «нет»', () => {
  for (const t of ['Дизайн логотипа и айдентики', 'Нужен логотип для кофейни', 'Разработка логотипа и фирменного стиля', 'Брендбук для студии']) {
    const v = verdict(t);
    assert.equal(v.verdict, 'нет', t);
    assert.equal(v.rule, 'R2', t);
  }
});

test('R2 полиграфия: каталог А4 для печати — «нет»', () => {
  for (const t of ['Каталог на продукции в формате А4 для производителя сантехники и мебели', 'Каталог А4 для печати', 'Верстка каталога A4 в печать', 'Дизайн буклета и листовки', 'Макет визитки']) {
    const v = verdict(t);
    assert.equal(v.verdict, 'нет', t);
    assert.equal(v.rule, 'R2', t);
    assert.match(v.reason, /дизайн и полиграфия/);
  }
});

test('R2 копирайтинг — «нет»', () => {
  for (const t of ['Нужен копирайтер для текстов сайта', 'Рерайт статей', 'Написание текстов для сайта юриста']) {
    const v = verdict(t);
    assert.equal(v.verdict, 'нет', t);
    assert.equal(v.rule, 'R2', t);
    assert.match(v.reason, /копирайтинг/);
  }
});

test('R2 игровые боты и обход капчи — «нет»', () => {
  for (const t of ['Python-бот для игры Black Russia', 'Бот для игры с обходом капчи', 'Игровой бот на Python', 'Парсер с обходом капчи', 'Нужен бот для Minecraft']) {
    const v = verdict(t);
    assert.equal(v.verdict, 'нет', t);
    assert.equal(v.rule, 'R2', t);
    assert.match(v.reason, /игровые боты и обход капчи/);
  }
});

test('R2: настоящие заказы с этими словами рядом остаются «берём»', () => {
  assert.equal(verdict('Лендинг и логотип для кофейни', 'Нужен лендинг, логотип уже есть').verdict, 'берём', 'лендинг + логотип');
  assert.equal(verdict('Сайт для стоматологии', 'Нужен сайт, тексты для сайта пришлём. Логотип есть').verdict, 'берём', 'сайт; тексты пришлют');
  assert.equal(verdict('Создание сайта и написание текстов', 'Нужен сайт на Tilda').verdict, 'берём', 'сайт на Tilda + тексты');
  assert.equal(verdict('Telegram-бот для записи в салон', '').verdict, 'берём', 'бот записи');
  assert.equal(verdict('Дизайн интерфейса приложения', 'UI/UX макет экранов').verdict, 'берём', 'UI-дизайн остаётся в линейке');
  assert.equal(verdict('Форма с капчей на лендинге', 'Нужен лендинг с формой и reCAPTCHA').verdict, 'берём', 'капча в форме — не обход');
});
