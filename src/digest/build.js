// «Секретарь заказов» (приказ Саши 14.11 вечер, режим «первый заказ»): записи радара за день → топ-10 заказов + готовый отклик на каждый.
// Ничего не отправляет и никуда не входит: результат — файл docs/orders/<день>.md, который Саша читает и отправляет сам.
// Фильтр — по смыслу «сделаем за 1–5 дней» (профиль «first» в rules.js). Цены без бюджета — ориентиры из templates.ru.js, Саша их не подтверждал.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { findStopwords } from '../vitrina/stopwords.js';
import { findWord } from '../radar/words.js';
import { budgetValue, BUDGET_MIN } from '../radar/rules.js';
import { TEMPLATES, PITCH, HOURS_LINE, money } from '../replies/templates.ru.js';

export const TOP_N = 10;
export const TAIL_N = 10; // «хвост» за топом: отклик по шаблону, перечитать и подправить
export const REPLY_LINES_MIN = 4;
export const REPLY_LINES_MAX = 6;
export const REPLY_CHARS_MAX = 900;
export const DISCOUNT = 30; // решение Саши 13.11: первым клиентам 30 %

const WORKS = JSON.parse(readFileSync(new URL('../vitrina/works.json', import.meta.url), 'utf8')).works;
const workById = (id) => WORKS.find((w) => w.id === id);
const byKind = (k) => TEMPLATES.find((t) => t.kind === k);

// Кейс-портфолио для разных видов заказа (works.json; ссылки «Описание проекта» не проверены по сети — checked:false). Нет ссылки — без неё.
const PITCH_MORE = {
  w5: 'Видеостудия: конвейер роликов от сценария и озвучки до монтажа и проверки качества — так делается научно-популярный канал.',
};
const CASE_FOR = { dub: ['w5'], image: ['w5'], bot: ['w6', 'w3'], parser: ['w3'], automation: ['w3', 'w4'], ai: ['w3', 'w4'], video: ['w5'], text: ['w4'], landing: ['w1'], site: ['w6'], fix: ['w1'], design: ['w6'] };

// Виды, которых нет в templates.ru.js (там bot, fix, landing, automation).
const EXTRA = {
  parser: { what: 'парсер', how: 'Соберу парсер: достанет нужные данные с сайта и сложит их в таблицу или файл; сначала покажу результат на небольшой части.', need: 'ссылку на сайт и пример нужных полей', price: 4000, days: 3, question: 'Какие именно поля нужны и как часто обновлять данные?' },
  site: { what: 'сайт', how: 'Сделаю сайт: структура, адаптивный вид для телефона и компьютера, форма заявок, запуск на вашем хостинге.', need: 'тексты и логотип', price: 8000, days: 5, question: 'Есть ли у вас готовый макет или тексты, или собираем с нуля?' },
  ai: { what: 'подключение автоматического помощника', how: 'Подключу помощника, который сам отвечает по вашим материалам; сначала проверим на 10–20 реальных вопросах.', need: 'материалы для ответов (файл или ссылки)', price: 6000, days: 5, question: 'По каким материалам должен отвечать помощник и где он будет работать — сайт, мессенджер?' },
  dub: { what: 'перевод и озвучку видео', how: 'Переведу текст, озвучу и наложу голос на ролик, добавлю субтитры; сначала пришлю короткий фрагмент на согласование.', need: 'исходное видео и текст или субтитры', price: 3000, days: 3, question: 'Нужны ли субтитры и какой голос — мужской или женский?' },
  image: { what: 'изображения по описанию', how: 'Сделаю набор изображений по вашему описанию и пришлю несколько вариантов на выбор; фото людей использую только с их согласия.', need: 'описание и примеры стиля', price: 3000, days: 2, question: 'Для чего нужны изображения и есть ли примеры нужного стиля?' },
  video: { what: 'монтаж видео', how: 'Смонтирую ролики: резка, титры и субтитры, звук и музыка, нужный формат; сначала пришлю один-два на согласование, остальные — партиями.', need: 'исходники и пожелания по формату', price: 3000, days: 3, question: 'Какой формат и длина ролика, и есть ли пример, на который ориентироваться?' },
  text: { what: 'тексты', how: 'Напишу тексты под вашу задачу, без воды; сначала пришлю абзац на согласование тона.', need: 'тему, целевую аудиторию и объём', price: 3000, days: 2, question: 'Для кого тексты и какой нужен объём?' },
  design: { what: 'дизайн интерфейса', how: 'Нарисую экраны для телефона и компьютера и соберу кликабельный макет; первый экран пришлю на согласование.', need: 'пожелания и примеры, которые нравятся', price: 5000, days: 3, question: 'Есть ли фирменные цвета и примеры, на которые ориентироваться?' },
};

// Слова по видам, от узкого к широкому (при равенстве очков побеждает узкий). Название весит втрое больше описания:
// 14.11 «заказчик»-скептик поймал, что слово «видео» в описании сайта делало из правки сайта монтаж ролика.
const KIND_WORDS = [
  ['dub', ['озвуч', 'переклад', 'перевод']],
  ['video', ['видео', 'монтаж', 'ролик', 'reels', 'shorts', 'рилс', 'субтитр']],
  ['image', ['фотосесси', 'фотосесс', 'изображен', 'картинк', 'аватар', 'генерац']],
  ['parser', ['парсер', 'парсинг', 'спарсить', 'выгрузк']],
  ['bot', ['бот', 'чат-бот', 'чатбот', 'mini app', 'мини-приложен']],
  ['ai', ['нейросет', 'chatgpt', 'gpt', 'ии-', 'ии ', 'ai-', 'ai ', 'ассистент']],
  ['automation', ['автоматизац', 'n8n', 'интеграци', 'crm', 'zapier', 'make.com', 'скрипт']],
  ['fix', ['правк', 'поправ', 'исправ', 'доработ', 'допил', 'починить', 'переделат', 'переделк', 'редизайн']],
  ['landing', ['лендинг', 'landing', 'tilda', 'тильд']],
  ['site', ['сайт', 'верстк', 'вёрстк', 'wordpress', 'интернет-магазин']],
  ['text', ['текст', 'стать', 'копирайт', 'рерайт', 'контент']],
  ['design', ['дизайн', 'ui', 'ux', 'интерфейс', 'макет']],
];

/** Вид заказа для отклика: очки = 3 × слова в названии + слова в описании (не больше 2). */
export function detectDigestKind(o) {
  const title = String(o.title ?? '');
  const body = String(o.text ?? '');
  let best = null;
  for (const [kind, words] of KIND_WORDS) {
    const inTitle = words.filter((w) => findWord(title, [w])).length;
    const inBody = Math.min(2, words.filter((w) => !findWord(title, [w]) && findWord(body, [w])).length);
    // «сайт», «лендинг», «дизайн» в названии — рамка заказа («тексты для сайта», «правка сайта»), конкретный вид их перебивает
    const base = ['site', 'landing', 'design'].includes(kind) ? 2.5 : 3;
    const sc = inTitle ? base : inBody; // слова описания работают, только если в названии вида нет совсем
    if (sc > 0 && (!best || sc > best.sc)) best = { kind, sc };
  }
  // «Бот на ИИ» — это бот: общий вид «ai» не перебивает бота, если в названии есть «бот»
  return best?.kind ?? 'site';
}

const KIND_LABEL = { dub: 'перевод и озвучка видео', image: 'изображения по описанию', bot: 'бот', parser: 'парсер', automation: 'автоматизация', ai: 'помощник на материалах', video: 'видео/монтаж', text: 'тексты', landing: 'лендинг', site: 'сайт', fix: 'правка сайта', design: 'интерфейс' };

// Бот не про заявки и запись (поиск по фото, игры, парсинг в бота и т. п.): шаблон «клиент отвечает на вопросы, заявка приходит вам» был бы мимо задачи
const BOT_GENERIC = { what: 'бота', how: 'Сделаю бота под вашу задачу (в Telegram, если нет другой платформы): вы описываете сценарий, я собираю рабочую версию, показываю её на ваших данных и дорабатываю по замечаниям.', need: 'описание сценария и примеры сообщений', price: 5000, days: 4, question: 'Что бот должен делать по шагам и откуда брать данные?' };

function spec(kind, order = {}) {
  if (kind === 'bot' && !/заявк|запис|клиент|заказ|оплат|меню|каталог/i.test(`${order.title ?? ''} ${order.text ?? ''}`)) return BOT_GENERIC;
  const t = byKind(kind);
  if (t) return { what: t.what, how: t.how, need: t.need, price: t.defaultPrice, days: t.defaultDays, question: t.questions[0] };
  return EXTRA[kind];
}

const roundTo100 = (n) => Math.round(n / 100) * 100;
const TITLE_MAX = 60;

/** Кейсы для вида заказа: [{id, title, pitch, link|null}], до двух. */
export function casesFor(kind) {
  return (CASE_FOR[kind] ?? []).slice(0, 2).map((id) => {
    const w = workById(id);
    return { id, title: w?.title ?? id, pitch: PITCH[id] ?? PITCH_MORE[id] ?? '', link: w?.link?.url ?? null };
  }).filter((c) => c.pitch);
}

/** Отклик от первого лица Саши, 4–6 строк. Бросает ошибку, если заказ ниже порога или нет оснований для цены. */
export function buildReply(order, { firstClient = true } = {}) {
  const kind = detectDigestKind(order);
  const sp = spec(kind, order);
  const budget = budgetValue(order.budget);
  if (budget !== null && budget < BUDGET_MIN) throw new Error(`${order.id}: бюджет ${money(budget)} ниже порога ${money(BUDGET_MIN)}`);
  let price = budget ?? sp.price;
  let discount = null;
  if (firstClient) {
    const d = roundTo100(price * (1 - DISCOUNT / 100));
    if (d >= BUDGET_MIN) { price = d; discount = DISCOUNT; }
  }
  const title = String(order.title ?? '').replace(/\s+/g, ' ').trim().replace(/[.!…]+$/, '');
  const quote = title && title.length <= TITLE_MAX && !findStopwords(title).length ? ` («${title}»)` : '';
  const cs = casesFor(kind);
  const caseLine = cs.length ? `Похожая работа. ${cs[0].pitch}${cs[0].link ? ` ${cs[0].link}` : ''}` : null;
  // заказ в $/грн: цену называем в валюте заказчика (пересчёт «на глаз» путал бы его)
  const raw = order.budget_raw ? String(order.budget_raw).match(/^(\d+)\s+([A-Z]{3})$/) : null;
  const priceShown = raw && raw[2] !== 'RUB' && budget ? `${Math.round((Number(raw[1]) * price) / budget / 10) * 10} ${raw[2]}` : money(price);
  const priceLine = budget !== null
    ? `Цена — ${priceShown}, срок — ${sp.days} дн. после того, как получу ${sp.need}.`
    : `Ориентир по цене — от ${money(price)}, срок — ${sp.days} дн.; точную назову после ответа на вопрос. Мне нужны ${sp.need}.`;
  const t0 = `${order.title ?? ''} ${order.text ?? ''}`;
  const maxOnly = kind === 'bot' && /(?<![а-яёa-z])max(?![а-яёa-z])|(?<![а-яё])макс(?![а-яё])/i.test(t0) && !/telegram|телеграм/i.test(t0);
  const question = maxOnly ? 'Нужен именно MAX или подойдёт Telegram — там то же самое можно сделать быстрее и проще в поддержке?' : sp.question;
  const lines = [`Здравствуйте! Вы ищете ${sp.what}${quote}.`, sp.how, caseLine, priceLine, `Вопрос: ${question}`, HOURS_LINE].filter(Boolean);
  const text = lines.join('\n');
  return { kind, price, discount, days: sp.days, text, lines: lines.length, cases: cs, problems: validateReply(text, price, budget) };
}

export function validateReply(text, price, budget) {
  const p = [];
  const n = text.split('\n').length;
  if (n < REPLY_LINES_MIN || n > REPLY_LINES_MAX) p.push(`строк ${n}, нужно ${REPLY_LINES_MIN}–${REPLY_LINES_MAX}`);
  const stops = findStopwords(text);
  if (stops.length) p.push(`стоп-слова: ${stops.join(', ')}`);
  if (/[{}]/.test(text)) p.push('остался пропуск {…}');
  if (text.length > REPLY_CHARS_MAX) p.push(`текст ${text.length} знаков, предел ${REPLY_CHARS_MAX}`);
  if (price < BUDGET_MIN) p.push(`цена ${money(price)} ниже порога`);
  if (budget !== null && budget !== undefined && price > budget) p.push(`цена ${money(price)} выше бюджета ${money(budget)}`);
  return p;
}

// Крупное не делается за 1–5 дней (приказ 14.11: «можем сделать за 1–5 дней»): в топ не берём, в дайджесте — счётчиком.
const HEAVY = ['архитектур', 'масштабируем', 'высоконагруж', 'highload', 'микросервис', 'платформ', 'backend-разработчик', 'бэкенд', 'аудит', 'аудит безопасност', 'команда разработчик', 'или команд', 'enterprise', 'erp'];
export const isHeavy = (r) => Boolean(findWord(`${r.title ?? ''} ${r.text ?? ''}`, HEAVY));

const hoursOf = (r) => (typeof r.age_hours === 'number' ? r.age_hours : null);

/** Оценка для топа: свежее, с бюджетом и малым числом откликов — выше; «нет бюджета» не вычёркивает. */
export function score(r) {
  let s = 0;
  const h = hoursOf(r);
  if (h !== null) s += h < 3 ? 4 : h < 24 ? 3 : h < 72 ? 2 : h < 24 * 14 ? 1 : 0;
  if (typeof r.budget === 'number') s += 2;
  if (typeof r.answers === 'number') s += r.answers <= 10 ? 2 : r.answers <= 30 ? 1 : 0;
  if (['bot', 'parser', 'automation', 'landing', 'site'].includes(detectDigestKind(r))) s += 1;
  if (r.channel === 'kwork' || r.channel === 'fl' || r.channel === 'frru' || r.channel === 'weblancer' || r.channel === 'fh' || r.channel === 'pchel') s += 1; // площадки с откликом по кнопке
  if ((r.flags ?? []).includes('возможный_дубль')) s -= 1;
  if (detectDigestKind(r) === 'image') s -= 3; // нет честного кейса по изображениям; фото живого человека — только с согласия
  return s;
}

/** Топ-N заказов «берём» с откликами. Для разных каналов один заказ уже склеен dedupe-ом радара. */
export function pickTop(records, n = TOP_N) {
  return records
    .filter((r) => r.verdict === 'берём' && r.url && !isHeavy(r))
    .map((r) => ({ r, s: score(r) }))
    .sort((a, b) => b.s - a.s || (hoursOf(a.r) ?? Infinity) - (hoursOf(b.r) ?? Infinity))
    .slice(0, n)
    .map(({ r }) => r);
}

const ageText = (r) => (typeof r.age_hours === 'number' ? (r.age_hours < 1 ? `${Math.round(r.age_hours * 60)} мин` : r.age_hours < 48 ? `${Math.round(r.age_hours)} ч` : `${Math.round(r.age_hours / 24)} дн.`) : 'возраст не указан');
const budgetText = (r) => (typeof r.budget === 'number' ? (r.budget_raw && !/RUB$/.test(r.budget_raw) ? `${r.budget_raw} (≈${money(r.budget)})` : money(r.budget)) : 'не указан');
const deadlineText = (r) => (typeof r.deadline_days === 'number' ? `${r.deadline_days} дн.` : 'не указан');

export function why(r, kind) {
  const bits = [KIND_LABEL[kind]];
  if (typeof r.age_hours === 'number' && r.age_hours < 24) bits.push(`свежий (${ageText(r)})`);
  if (typeof r.answers === 'number') bits.push(`откликов ${r.answers}`);
  if (typeof r.budget === 'number') bits.push('бюджет указан'); else bits.push('бюджет не указан — уточнить');
  const flags = (r.flags ?? []).filter((f) => f !== 'нет_бюджета');
  if (flags.length) bits.push(flags.join(', ').replace(/_/g, ' '));
  return `${bits.join('; ')}. ${r.reason ?? ''}`.trim();
}

/** @param {object[]} records записи за день (verdict уже стоит) @param {{date: string, report?: object, manual?: {id,name,link,note}[], channelCounts?: object, now?: string}} ctx */
export function renderDigest(records, { date, report = null, manual = [], now = null, custom = {} } = {}) {
  const top = pickTop(records);
  const tail = pickTop(records, TOP_N + TAIL_N).slice(TOP_N);
  const byChannel = {};
  for (const r of records) {
    const ch = (r.channels ?? [r.channel])[0];
    byChannel[ch] ??= { all: 0, take: 0 };
    byChannel[ch].all += 1;
    if (r.verdict === 'берём') byChannel[ch].take += 1;
  }
  const takeAll = records.filter((r) => r.verdict === 'берём').length;
  const heavy = records.filter((r) => r.verdict === 'берём' && isHeavy(r)).length;
  const out = [];
  out.push(`# Секретарь заказов — ${date}`, '');
  out.push(`Собрано ${records.length} заказов из ${Object.keys(byChannel).length} источников, «берём» (по смыслу «сделаем за 1–5 дней») — **${takeAll}**. Ниже топ-${Math.min(TOP_N, top.length)} и на каждый — готовый отклик${heavy ? ` (ещё ${heavy} «берём» — крупные, не за 1–5 дней, в топ не вошли)` : ''}. **Ничего не отправлено**: отправляет Саша.`);
  if (now) out.push('', `Прогон: ${now}.`);
  out.push('', '**Оговорки.** Цены в откликах без бюджета — ориентиры из шаблонов, Саша их не подтверждал. Ссылки на кейсы (zokul, video-studio, studio-news, secretary) проверены 14.11: HTTP 200. Отклики топ-10 написаны под каждый заказ по его тексту; у хвоста — шаблон. Бюджеты в $/грн пересчитаны ориентиром 80 ₽/$ и 2 ₽/грн.', '');
  out.push('## По источникам', '', '| Источник | Собрано | «Берём» |', '|---|---|---|');
  for (const [ch, v] of Object.entries(byChannel).sort((a, b) => b[1].take - a[1].take || b[1].all - a[1].all)) out.push(`| ${ch}${manual.some((m) => m.id === ch) ? ' *(страница сохранена руками, не живой прогон)*' : ''} | ${v.all} | ${v.take} |`);
  out.push('');
  if (report) {
    const notes = [];
    for (const [id, c] of Object.entries(report.channels ?? {})) if (c.status !== 'ok') notes.push(`- **${id}** — ${c.reason}`);
    if (notes.length) out.push('## Не читались / молчали', '', ...notes, '');
  }
  out.push('## Топ заказов', '');
  top.forEach((r, i) => {
    const kind = detectDigestKind(r);
    let reply;
    const c = custom[r.url];
    if (c) {
      const problems = validateReply(c.text, c.price_rub ?? BUDGET_MIN, c.budget_rub ?? null);
      reply = { text: c.text, problems, cases: [{ title: c.case_title, link: c.case_link }], custom: true };
    } else {
      try { reply = buildReply(r); } catch (e) { reply = { text: `(отклик не собран: ${e.message})`, problems: [e.message], price: null, cases: [] }; }
    }
    out.push(`### ${i + 1}. ${r.title}`);
    out.push(`- Ссылка: ${r.url}`);
    out.push(`- Источник: ${(r.channels ?? [r.channel]).join(' + ')} · Бюджет: ${budgetText(r)} · Срок: ${deadlineText(r)} · Возраст: ${ageText(r)}`);
    out.push(`- Почему берём: ${why(r, kind)}`);
    if (r.text) out.push(`- Суть заказа: ${String(r.text).replace(/\s+/g, ' ').slice(0, 240)}${String(r.text).length > 240 ? '…' : ''}`);
    if (reply.cases?.[0]) out.push(`- Кейс в отклике: ${reply.cases[0].title}${reply.cases[0].link ? ` — ${reply.cases[0].link}` : ' — публичной ссылки нет'}`);
    if (reply.problems?.length) out.push(`- ⚠ НЕ ОТПРАВЛЯТЬ без правки: ${reply.problems.join('; ')}`);
    out.push('', reply.custom ? 'Отклик (под этот заказ):' : 'Отклик (шаблон — перечитать):', '', ...reply.text.split('\n').map((l) => `> ${l}`), '');
  });
  if (tail.length) {
    out.push('## Ещё заказы (отклик по шаблону — перечитать и подправить перед отправкой)', '');
    tail.forEach((r, i) => {
      const kind = detectDigestKind(r);
      let t;
      try { t = buildReply(r).text; } catch (e) { t = `(отклик не собран: ${e.message})`; }
      out.push(`### ${TOP_N + i + 1}. ${r.title}`, `- ${r.url} · ${(r.channels ?? [r.channel]).join(' + ')} · бюджет ${budgetText(r)} · ${ageText(r)} · ${KIND_LABEL[kind]}`, '', ...t.split('\n').map((l) => `> ${l}`), '');
    });
  }
  if (!top.length) out.push('Подходящих заказов в этом прогоне нет.', '');
  if (manual.length) {
    out.push('## Руками (защита, вход или закрыто) — Саша открывает сам', '');
    for (const m of manual) out.push(`- **${m.name}**${m.link ? ` — ${m.link}` : ''}${m.note ? ` — ${m.note}` : ''}`);
    out.push('');
  }
  return out.join('\n');
}

export function writeDigest(text, { dir = join('docs', 'orders'), date } = {}) {
  const file = join(dir, `${date}.md`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}
