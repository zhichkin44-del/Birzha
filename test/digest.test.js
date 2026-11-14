// Режим «первый заказ» (приказ Саши 14.11 вечер): профиль фильтра по смыслу, интервал 2 ч, без robots, дайджест с откликами.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/radar/rules.js';
import { runChannels } from '../src/radar/run.js';
import { fetchPage } from '../src/radar/fetch.js';
import { statusLine } from '../src/radar/report.js';
import { detectDigestKind, buildReply, pickTop, renderDigest, score, TOP_N } from '../src/digest/build.js';
import { findStopwords } from '../src/vitrina/stopwords.js';

const NOW = '2026-11-14T10:00:00+07:00';
const ord = (title, text = title, extra = {}) => ({ id: `t-${title}`, channel: 'fl', channels: ['fl'], url: `https://x/${encodeURIComponent(title)}`, title, text, budget: null, answers: 3, age_hours: 2, deadline_days: null, collected_at: NOW, ...extra });
const first = (title, text, extra) => evaluate(ord(title, text, extra), { profile: 'first' });

// ---------- профиль «first» ----------
test('Профиль «первый заказ»: видео, монтаж, озвучка, тексты, нейросети — «берём»; в обычном профиле — «нет» (старое поведение не тронуто)', () => {
  for (const t of ['Смонтировать ролик для YouTube', 'Озвучка рекламного ролика', 'Написать тексты для сайта юриста', 'Интеграция с нейросетью для ответов клиентам', 'Нужен видеомонтажёр на Reels']) {
    assert.equal(first(t).verdict, 'берём', t);
  }
  for (const t of ['Смонтировать ролик для YouTube', 'Озвучка рекламного ролика']) assert.equal(evaluate(ord(t)).verdict, 'нет', `default: ${t}`);
});

test('Профиль «первый заказ»: вакансии, отзывы, логотипы, игровые боты и обход капчи по-прежнему «нет»', () => {
  assert.equal(first('Монтажёр', 'Монтажёр в штат, оклад 80 000 ₽').rule, 'R1');
  assert.equal(first('Написать отзыв на карты').rule, 'R1');
  assert.equal(first('Дизайн логотипа и айдентики').rule, 'R2');
  assert.equal(first('Бот для игры Black Russia').rule, 'R2');
  assert.equal(first('Парсер с обходом капчи').rule, 'R2');
});

test('Профиль «первый заказ»: бюджет ниже 3 000 ₽ и откликов > 30 у несвежего — по-прежнему «нет» (решения Саши 13.11)', () => {
  assert.equal(first('Смонтировать ролик', 'Смонтировать ролик', { budget: 1500 }).rule, 'R3');
  assert.equal(first('Сайт-визитка', 'Сайт-визитка', { answers: 40, age_hours: 30 }).rule, 'R4');
});

// ---------- вид заказа и отклик ----------
test('Вид заказа: самый узкий признак первым — парсер, а не сайт; видео, а не бот', () => {
  const cases = [
    ['Парсер цен конкурентов с сайта', 'parser'], ['Telegram-бот для записи клиентов', 'bot'], ['Лендинг на Tilda', 'landing'],
    ['Нужен сайт для кофейни', 'site'], ['Смонтировать ролик для бота-канала', 'video'], ['Интеграция с нейросетью', 'ai'],
    ['Автоматизация заявок в CRM', 'automation'], ['Поправить вёрстку сайта', 'fix'], ['Написать тексты для блога', 'text'], ['Макет приложения', 'design'],
  ];
  for (const [t, k] of cases) assert.equal(detectDigestKind(ord(t)), k, t);
});

test('Отклик: 4–6 строк, без слов про ИИ и модели, цена в пределах бюджета, скидка первым клиентам, кейс со ссылкой', () => {
  for (const [t, b] of [['Telegram-бот для записи клиентов', 10000], ['Лендинг на Tilda', 8000], ['Парсер цен', null], ['Смонтировать ролик', 6000], ['Написать тексты для блога', null], ['Интеграция с нейросетью', 12000]]) {
    const r = buildReply(ord(t, t, { budget: b }));
    assert.ok(r.lines >= 4 && r.lines <= 6, `${t}: строк ${r.lines}`);
    assert.deepEqual(findStopwords(r.text), [], t);
    assert.ok(r.price >= 3000, t);
    if (b !== null) assert.ok(r.price <= b, `${t}: цена ${r.price} > бюджета ${b}`);
    assert.deepEqual(r.problems, [], `${t}: ${r.problems}`);
    assert.ok(r.cases.length >= 1, t);
    assert.match(r.text, /Вопрос:/);
  }
  const bot = buildReply(ord('Telegram-бот для записи клиентов', 'x', { budget: 10000 }));
  assert.equal(bot.price, 7000);
  assert.equal(bot.discount, 30);
  assert.match(bot.text, /скидка 30 %/);
  assert.match(bot.text, /https:\/\/zhichkin44-del\.github\.io\/projects\//);
});

test('Отклик: скидка не опускает цену ниже 3 000 ₽; без бюджета — «ориентир»; ниже порога — ошибка', () => {
  const low = buildReply(ord('Лендинг', 'Лендинг', { budget: 3500 }));
  assert.equal(low.price, 3500);
  assert.equal(low.discount, null);
  assert.match(buildReply(ord('Парсер цен')).text, /Ориентир по цене/);
  assert.throws(() => buildReply(ord('Лендинг', 'Лендинг', { budget: 2000 })), /ниже порога/);
});

test('Отклик: название заказчика со стоп-словом («с ИИ») в текст не цитируется (урок 35)', () => {
  const r = buildReply(ord('Бот на ИИ', 'Нужен бот', { budget: 5000 }));
  assert.deepEqual(findStopwords(r.text), []);
  assert.doesNotMatch(r.text, /«Бот на ИИ»/);
  assert.match(buildReply(ord('Бот записи', 'Нужен бот', { budget: 5000 })).text, /«Бот записи»/);
});

// ---------- топ-10 и документ ----------
test('Топ: только «берём» со ссылкой, не больше 10, свежие с бюджетом и малым числом откликов выше', () => {
  const recs = [];
  for (let i = 0; i < 14; i++) recs.push({ ...ord(`Лендинг ${i}`), verdict: 'берём', reason: 'R1–R7 пройдены', flags: [], age_hours: 50 + i, answers: 25 });
  recs.push({ ...ord('Нет ссылки'), url: null, verdict: 'берём', flags: [] });
  recs.push({ ...ord('Отказ'), verdict: 'нет', rule: 'R2', flags: [] });
  recs.push({ ...ord('Лучший бот', 'Telegram-бот'), verdict: 'берём', reason: 'R1–R7 пройдены', flags: [], age_hours: 1, budget: 9000, answers: 2 });
  const top = pickTop(recs);
  assert.equal(top.length, TOP_N);
  assert.equal(top[0].title, 'Лучший бот');
  assert.ok(top.every((r) => r.verdict === 'берём' && r.url));
  assert.ok(score(top[0]) > score(recs[0]));
});

test('Дайджест: ссылка, бюджет, срок, «почему берём», отклик цитатой, «Ничего не отправлено», блок «Руками» со ссылками', () => {
  const recs = [{ ...ord('Telegram-бот для записи', 'Бот', { budget: 9000, deadline_days: 5, answers: 4 }), verdict: 'берём', reason: 'R1–R7 пройдены', flags: [] }];
  const md = renderDigest(recs, { date: '2026-11-14', manual: [{ id: 'youdo', name: 'YouDo', link: 'https://youdo.com/tasks-all-any-1', note: '403' }], report: { channels: { fh: { status: 'silent', reason: 'канал молчит: защита (HTTP 403)' } }, silent: ['fh'] } });
  assert.match(md, /^# Секретарь заказов — 2026-11-14/);
  assert.match(md, /Ссылка: https:\/\/x\//);
  assert.match(md, /Бюджет: 9 000 ₽ · Срок: 5 дн\./);
  assert.match(md, /Почему берём: бот/);
  assert.match(md, /> Здравствуйте! Вы ищете Telegram-бота/);
  assert.match(md, /Ничего не отправлено/);
  assert.match(md, /## Руками[\s\S]*\*\*YouDo\*\* — https:\/\/youdo\.com\/tasks-all-any-1/);
  assert.match(md, /Не читались \/ молчали[\s\S]*\*\*fh\*\*/);
  assert.equal(renderDigest([], { date: '2026-11-14' }).includes('Подходящих заказов в этом прогоне нет.'), true);
});

// ---------- интервал, robots ----------
const ok = async () => [ord('Лендинг для кофейни')];
test('Интервал: канал, прочитанный меньше 2 ч назад, пропускается («не читали»), force — читает; last_attempt обновляется', async () => {
  const state = { fl: { last_ok: null, last_attempt: '2026-11-14T02:30:00.000Z', blocked_streak: 0, blocked_until: null } };
  let calls = 0;
  const ch = [{ id: 'fl', load: async () => { calls++; return ok(); } }];
  const now = '2026-11-14T03:45:00.000Z'; // 75 мин
  const a = await runChannels(ch, { now, state, minIntervalMin: 120 });
  assert.equal(calls, 0);
  assert.equal(a.report.channels.fl.status, 'skipped');
  assert.match(statusLine(a.report, []), /не читали \(интервал\): fl/);
  assert.equal(a.state.fl.last_attempt, '2026-11-14T02:30:00.000Z');
  const b = await runChannels(ch, { now, state, minIntervalMin: 120, force: true });
  assert.equal(calls, 1);
  assert.equal(b.state.fl.last_attempt, now);
  const c = await runChannels(ch, { now: '2026-11-14T04:31:00.000Z', state, minIntervalMin: 120 }); // 2 ч 1 мин
  assert.equal(calls, 2);
  assert.equal(c.report.channels.fl.status, 'ok');
});

test('fetchPage: respectRobots:false — robots.txt не запрашивается, защита (403) по-прежнему BlockedError', async () => {
  const urls = [];
  const fetchImpl = async (u) => { urls.push(u); return { status: 200, ok: true, text: async () => '<html>ok</html>' }; };
  await fetchPage('https://example.test/list', { fetchImpl, pauseMs: 0, sleepImpl: async () => {}, respectRobots: false });
  assert.deepEqual(urls, ['https://example.test/list']);
  const blocked = async () => ({ status: 403, ok: false, text: async () => 'Just a moment...' });
  await assert.rejects(() => fetchPage('https://example.test/x', { fetchImpl: blocked, pauseMs: 0, sleepImpl: async () => {}, respectRobots: false }), /blocked/);
});

test('Слова (живой прогон 14.11 вечер): подработка под видом заказа — R1, а настоящие заказы в профиле «первый заказ» остаются', () => {
  for (const t of ['Копирайтер: писать тексты для карточек - удалённо без опыта', '💻 Помощник по рассылке СМС удаленно', '✨НОВОЕ НАПРАВЛЕНИЕ 2027✨', '⚡️Ищем помощника для заполнения анкет⚡️', 'Чат-менеджер (удаленно)']) {
    assert.equal(first(t).rule, 'R1', t);
  }
  for (const t of ['Монтаж 20 видео рилс с вставками', 'Создать бот или мини-приложение в MAX', 'Парсер товаров с маркетплейса']) {
    assert.equal(first(t).verdict, 'берём', t);
  }
});

test('Крупное (платформа, архитектура, высоконагруженный шлюз) в топ не попадает: не за 1–5 дней', () => {
  const heavy = { ...ord('Агрегатор', 'Разработка архитектуры и бэкенда масштабируемой платформы'), verdict: 'берём', flags: [], budget: 120000 };
  const light = { ...ord('Лендинг', 'Лендинг на Tilda'), verdict: 'берём', flags: [] };
  assert.deepEqual(pickTop([heavy, light]).map((r) => r.title), ['Лендинг']);
  assert.match(renderDigest([heavy, light], { date: '2026-11-14' }), /ещё 1 «берём» — крупные/);
});

test('Вид заказа (замечания «заказчика» 14.11): слово «видео» в описании сайта не делает правку сайта монтажом; бот с «видео» в тексте — бот', () => {
  assert.equal(detectDigestKind(ord('Доработка сайта avtovec.ru', 'Дизайн и верстка блока, в блоке будет видео')), 'fix');
  assert.equal(detectDigestKind(ord('Нужно создать телеграмм бота с ИИ', 'Бот присылает видео и отвечает на вопросы')), 'bot');
  assert.equal(detectDigestKind(ord('Бот на ИИ.', 'Требует программа поиска на ИИ по фото')), 'bot');
  assert.equal(detectDigestKind(ord('Необходимо переделать сайт.', 'Сайт устарел')), 'fix');
  assert.equal(detectDigestKind(ord('АІ Переклад та озвучування 14-минутного видео', 'перевести и озвучить видео')), 'dub');
  assert.equal(detectDigestKind(ord('ИИ фотосессию в стиле ангела', 'Хочу реалистичные фотографии')), 'image');
  assert.equal(detectDigestKind(ord('Копирайтер для написания текстов на сайт', 'тексты для сайта студии')), 'text');
});

test('Отклик: заказ в гривнах — цена в гривнах; заказ в MAX — вопрос «MAX или Telegram»; название без точки в конце; несколько роликов — «партиями»', () => {
  const uah = buildReply(ord('Перевод и озвучка видео', 'озвучить видео', { budget: 3200, budget_raw: '1600 UAH' }));
  assert.match(uah.text, /Цена — 1[ \d]*0 UAH/);
  assert.doesNotMatch(uah.text, /₽/);
  const max = buildReply(ord('Создать бот или мини-приложение в MAX', 'бот для распродажи в MAX'));
  assert.match(max.text, /Нужен именно MAX или подойдёт Telegram/);
  const dot = buildReply(ord('Бот записи.', 'Нужен бот', { budget: 5000 }));
  assert.match(dot.text, /«Бот записи»/);
  assert.match(buildReply(ord('Монтаж 20 рилс', 'Смонтировать 20 рилс', { budget: 20000 })).text, /остальные — партиями/);
});

test('Слежка и распознавание лиц («Бот на ИИ»: поиск людей по фото через соцсеть) — R2 в любом профиле', () => {
  const t = 'Требует программа поиска на ИИ по фото через соц сеть с критериями поиска.';
  assert.equal(first('Бот на ИИ.', t).rule, 'R2');
  assert.equal(evaluate(ord('Бот на ИИ.', t)).rule, 'R2');
  assert.equal(first('Парсер сайта', 'Нужен парсер цен').verdict, 'берём');
});

test('Не берём: 18+, слова чужой песни, размещение объявлений и запуск рекламы (директор 14.11, живой прогон)', () => {
  assert.equal(first('Копирайтер на сайт', 'тексты для сайта студии телесных практик и массажа 18+').rule, 'R2');
  assert.equal(first('Изменить текст песни через ИИ', 'слова песни заменить на мой текст').rule, 'R2');
  assert.equal(first('разместить готовое объявление о найме водителя и запустить рекламу', 'баннер и текст в группах Telegram').rule, 'R2');
});

test('Не берём: вакансия-модератор («выплата раз в неделю, опыт не обязателен») и проектирование вентиляции в Revit', () => {
  assert.equal(first('#Удаленка', 'Требуется #модератор на удалёнку. Выплата: 8630 руб раз в неделю, опыт не обязателен, бот от группы').rule, 'R1');
  assert.equal(first('Рабочка по вентиляции и автоматизации вентиляции цеха', 'Разработку вести строго в Revit').rule, 'R2');
});

test('Не берём: обход Cloudflare/защит (CLAUDE.md: защиту не обходим)', () => {
  assert.equal(first('Автоматизация или создание бота', 'бот с рабочим методом обхода Cloudflare').rule, 'R2');
});
