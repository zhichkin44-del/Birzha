// Reply templates in Sasha's first person. Plain words, no jargon, no mention of AI or models
// (Sasha's decision 13.11). Client names are not written (Study On only with Sasha's word).
// Reference prices ("ориентир") come from TEXTS.ru.md §2 (S10), not confirmed by Sasha; used only when the order has no budget.
import { findWord } from '../radar/words.js';
import { REPLY_FROM, REPLY_TO } from '../radar/rules.js';

// Hours are in the client's time (Moscow = UTC+7 − 4 h), per a client's review remark on 14.11.
export const HOURS_LINE = `На связи каждый день с ${REPLY_FROM - 4}:00 до ${REPLY_TO - 4}:00 по Москве.`;

export const TEMPLATES = [
  {
    kind: 'bot',
    label: 'Telegram-бот',
    words: ['бот'],
    what: 'Telegram-бота',
    how: 'Сделаю Telegram-бота: клиент отвечает на несколько простых вопросов, а заявка приходит вам сообщением и записывается в таблицу.',
    need: 'список услуг и текст приветствия',
    extra: 'Бот записи для барбершопа готов, покажу по запросу.',
    defaultPrice: 5000,
    defaultDays: 4,
    tags: ['Веб-приложение', 'Автоматизация'],
    questions: [
      'Куда удобнее получать заявки — в личные сообщения или в рабочий чат?',
      'Какие шаги должен пройти клиент: имя, телефон, услуга, время?',
    ],
  },
  {
    kind: 'fix',
    label: 'Правка сайта',
    words: ['поправ', 'правк', 'исправ', 'доработ', 'допил', 'починить', 'съехал'],
    what: 'правку сайта',
    how: 'Посмотрю, что не так, скажу, что и как поправлю, и сделаю. Перед правками сохраню копию сайта.',
    need: 'описание, что поправить (можно скриншотами)',
    extra: '',
    defaultPrice: 3000,
    defaultDays: 2,
    tags: ['Лендинг'],
    questions: [
      'Что именно сейчас не так — пришлите, пожалуйста, ссылку на страницу или скриншот?',
      'На чём сделан сайт: Tilda, WordPress или написан вручную?',
    ],
  },
  {
    kind: 'landing',
    label: 'Лендинг или сайт',
    words: ['лендинг', 'landing', 'tilda', 'тильд', 'сайт', 'верстк', 'вёрстк', 'интернет-магазин', 'wordpress', 'дизайн', 'макет', 'ui', 'ux', 'интерфейс'],
    what: 'страницу или сайт',
    how: 'Сделаю страницу, которая собирает заявки: понятный первый экран, форма, отправка заявок в вашу CRM или таблицу, аккуратный вид на телефоне.',
    need: 'тексты и логотип',
    extra: '',
    defaultPrice: 8000,
    defaultDays: 4,
    tags: ['Лендинг'],
    questions: [
      'Есть ли у вас готовые тексты и логотип или текст писать вместе?',
      'Куда отправлять заявки — в CRM или в таблицу?',
    ],
  },
  {
    kind: 'automation',
    label: 'Автоматизация',
    words: ['автоматизац', 'парсер', 'парсинг', 'выгрузк'],
    what: 'автоматизацию',
    how: 'Сначала покажу результат на небольшой части ваших данных, чтобы вы увидели качество до основной работы. Потом настрою, чтобы всё собиралось само.',
    need: 'пример данных',
    extra: '',
    defaultPrice: 4000,
    defaultDays: 3,
    tags: ['Автоматизация', 'Автоматизация контента'],
    questions: [
      'В каком виде сейчас лежат данные — файл, сайт или таблица?',
      'Как часто нужно обновлять результат?',
    ],
  },
];

// Check order: bot → fix → automation → landing/site. The word "сайт" (site) also appears in parser orders,
// so "site" is checked last; "Верстка сайта" (site layout) without other words is a landing. An order "интеграция с CRM"
// (CRM integration) without automation words falls into "landing or site": Sasha will see it in the "Template" line.
const ORDER = ['bot', 'fix', 'automation', 'landing'];
const byKind = (k) => TEMPLATES.find((t) => t.kind === k);

export function detectKind(order) {
  const text = `${order.title ?? ''} ${order.text ?? ''}`;
  for (const k of ORDER) {
    if (findWord(text, byKind(k).words)) return k;
  }
  return 'landing';
}

export const templateFor = (kind) => byKind(kind);

// One phrase per showcase work (facts come from works.json: done / facts). No numbers, no client names, no AI.
export const PITCH = {
  w1: 'Лендинг на Tilda: заявки сразу уходят в CRM, и видно, с какой рекламы пришёл клиент.',
  w3: 'Секретарь собирает предложения из десяти открытых источников, оценивает каждое и готовит черновик ответа; отправляет человек.',
  w4: 'Автоматическая редакция канала: читает около сотни источников, готовит пост, проверки пропускают его или возвращают.',
  w6: 'В моём мессенджере Zokul автоматический помощник задаёт вопрос, а человек отвечает нажатием кнопки.',
};

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const money = (n) => `${fmt(n)} ₽`;

/** Reply text. ctx: {tpl, titleQuote|null, price, discount|null, termDays, pitches[]}. */
export function compose(ctx) {
  const { tpl } = ctx;
  const ask = `Здравствуйте! Вы ищете ${tpl.what}${ctx.titleQuote ? ` («${ctx.titleQuote}»)` : ''}.`;
  // The first-client discount is already in the price; the text does not mention it: repeating it in every reply reads as underpricing (14.11).
  const priceLine = `Цена — ${money(ctx.price)}, срок — ${ctx.termDays} дн. после того, как получу ${tpl.need}.`;
  const parts = [ask, tpl.how, priceLine];
  if (ctx.pitches.length) parts.push(`Похожие работы.${ctx.pitches.join(' ')}`);
  if (tpl.extra) parts.push(tpl.extra);
  parts.push(`Вопрос: ${tpl.questions[0]}`);
  parts.push(HOURS_LINE);
  return parts.join('\n');
}
