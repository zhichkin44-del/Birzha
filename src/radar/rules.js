// "Take it / no" rules R1–R7 (PLAN §2). Pure function: order → {verdict, rule, reason, flags}.
// No network and no files. The first violated rule decides "no".
import {
  VACANCY, REVIEW, TESTING, MANUAL_FILL, OUT_OF_LINE, IN_LINE, PRINT_DESIGN, COPYWRITING, BUILD_WORDS, GAME_OR_CAPTCHA, SECRETS, CREDENTIALS, CLARIFY, FIRST_ALLOWED_OUT, FIRST_EXTRA_IN, SURVEILLANCE, findWord,
} from './words.js';

export const BUDGET_MIN = 3000; // Sasha's decision 13.11: from 3 000 ₽ inclusive
export const ANSWERS_MAX = 30;
export const FRESH_HOURS = 3;
export const DEADLINE_MAX_DAYS = 7;
export const REPLY_FROM = 10; // replies to clients 10:00–20:00 UTC+7 (UTC+7)
export const REPLY_TO = 20;
const UTC7_OFFSET_H = 7;

/** Budget → number of ₽ or null ("договорная" (negotiable), "не указан" (not stated), empty). A range uses its upper bound (assumption, PLAN §8 question 2). */
export function budgetValue(b) {
  if (typeof b === 'number' && Number.isFinite(b)) return b;
  if (b && typeof b === 'object') {
    const top = Math.max(...[b.min, b.max].filter((x) => typeof x === 'number'));
    return Number.isFinite(top) ? top : null;
  }
  return null;
}

/** Hour in UTC+7 for the collection moment (ISO with offset). */
export function utc7Hour(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + UTC7_OFFSET_H * 3600_000).getUTCHours();
}

const no = (rule, reason) => ({ verdict: 'нет', rule, reason: `${rule}: ${reason}`, flags: [] });

/** @param {object} order @param {{profile?: 'default'|'first'}} [opts] "first" — the "first order" profile: video, texts and AI work also count as ours. */
export function evaluate(order, opts = {}) {
  const first = opts.profile === 'first';
  const text = `${order.title ?? ''} ${order.text ?? ''}`;
  // English descriptions are long and mention everything (website, video, ui): the work kind is judged by the title, tags and the start of the description
  const lat = (text.match(/[a-z]/gi) ?? []).length;
  const cyr = (text.match(/[а-яё]/gi) ?? []).length;
  const focus = lat > cyr * 3 ? `${order.title ?? ''} ${String(order.text ?? '').slice(0, 300)}` : text;

  // R1: an order for work, not a vacancy / review / testing
  if (findWord(text, VACANCY)) return no('R1', 'вакансия (оклад, штат), а не заказ');
  if (findWord(text, REVIEW)) return no('R1', 'отзыв — не работа');
  if (findWord(text, TESTING)) return no('R1', 'тестирование, а не разработка');

  // R2: the kind of work is in the product line
  if (findWord(text, MANUAL_FILL)) return no('R2', 'ручное наполнение карточек, не наша линейка');
  const out = findWord(text, first ? OUT_OF_LINE.filter((w) => !FIRST_ALLOWED_OUT.includes(w)) : OUT_OF_LINE);
  if (out) return no('R2', `«${out}» — не наша линейка`);
  // Tightened 14.11: game bots and captcha bypass are always "no"; pure design/print and copywriting are "no" unless there are development words
  const spy = findWord(text, SURVEILLANCE);
  if (spy) return no('R2', `«${spy}» — слежка за людьми и распознавание лиц не берём`);
  const game = findWord(text, GAME_OR_CAPTCHA);
  if (game) return no('R2', `«${game}» — игровые боты и обход капчи не берём`);
  if (!findWord(focus, BUILD_WORDS)) {
    const print = findWord(text, PRINT_DESIGN);
    if (print) return no('R2', `«${print}» — чистый дизайн и полиграфия, не наша линейка`);
    const copy = first ? null : findWord(text, COPYWRITING);
    if (copy) return no('R2', `«${copy}» — копирайтинг, не наша линейка`);
  }
  if (!findWord(focus, first ? [...IN_LINE, ...FIRST_EXTRA_IN] : IN_LINE)) return no('R2', 'вид работы не из линейки (сайт, лендинг, бот, автоматизация, парсер, UI-дизайн)');

  // R3: budget ≥ threshold or not stated
  const budget = budgetValue(order.budget);
  if (budget !== null && budget < BUDGET_MIN) {
    return no('R3', `бюджет ${budget} ₽ при пороге ${BUDGET_MIN} ₽`);
  }

  // R4: replies ≤ 30 or the order is fresher than 3 h; no counter (Telegram) — not applied
  if (typeof order.answers === 'number' && order.answers > ANSWERS_MAX) {
    const fresh = typeof order.age_hours === 'number' && order.age_hours < FRESH_HOURS;
    if (!fresh) {
      const age = typeof order.age_hours === 'number' ? `возраст ${order.age_hours} ч` : 'возраст не известен';
      return no('R4', `${order.answers} откликов при пороге ${ANSWERS_MAX}, ${age}`);
    }
  }

  // R5: needs someone else's account or secrets
  if (findWord(text, SECRETS)) return no('R5', 'чужой кабинет или секреты (просят доступ, логин, пароль, токен)');

  // R6: term ≤ 7 days or not stated
  if (typeof order.deadline_days === 'number' && order.deadline_days > DEADLINE_MAX_DAYS) {
    return no('R6', `срок ${order.deadline_days} дн. при пределе ${DEADLINE_MAX_DAYS}`);
  }

  // R7: does not require a confirmed diploma / experience
  if (findWord(text, CREDENTIALS)) return no('R7', 'диплом или стаж — нужны подтверждённые');

  const flags = [];
  if (budget === null) flags.push('нет_бюджета');
  if (findWord(text, CLARIFY)) flags.push('уточнить');
  const hour = utc7Hour(order.collected_at);
  if (hour !== null && (hour < REPLY_FROM || hour >= REPLY_TO)) flags.push('отвечать_с_10:00');
  if (order.possible_duplicate) flags.push('возможный_дубль');

  return { verdict: 'берём', rule: null, reason: 'R1–R7 пройдены', flags };
}
