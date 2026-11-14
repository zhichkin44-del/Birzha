// Правила «берём / нет» R1–R7 (PLAN §2). Чистая функция: заказ → {verdict, rule, reason, flags}.
// Без сети и файлов. Первое нарушенное правило определяет «нет».
import {
  VACANCY, REVIEW, TESTING, MANUAL_FILL, OUT_OF_LINE, IN_LINE, PRINT_DESIGN, COPYWRITING, BUILD_WORDS, GAME_OR_CAPTCHA, SECRETS, CREDENTIALS, CLARIFY, FIRST_ALLOWED_OUT, FIRST_EXTRA_IN, SURVEILLANCE, findWord,
} from './words.js';

export const BUDGET_MIN = 3000; // решение Саши 13.11: от 3 000 ₽ включительно
export const ANSWERS_MAX = 30;
export const FRESH_HOURS = 3;
export const DEADLINE_MAX_DAYS = 7;
export const REPLY_FROM = 10; // ответ клиентам 10:00–20:00 UTC+7 (UTC+7)
export const REPLY_TO = 20;
const UTC7_OFFSET_H = 7;

/** Бюджет → число ₽ или null («договорная», «не указан», пусто). Диапазон — верхняя граница (допущение, PLAN §8 вопрос 2). */
export function budgetValue(b) {
  if (typeof b === 'number' && Number.isFinite(b)) return b;
  if (b && typeof b === 'object') {
    const top = Math.max(...[b.min, b.max].filter((x) => typeof x === 'number'));
    return Number.isFinite(top) ? top : null;
  }
  return null;
}

/** Час в UTC+7 для момента сбора (ISO со смещением). */
export function utc7Hour(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + UTC7_OFFSET_H * 3600_000).getUTCHours();
}

const no = (rule, reason) => ({ verdict: 'нет', rule, reason: `${rule}: ${reason}`, flags: [] });

/** @param {object} order @param {{profile?: 'default'|'first'}} [opts] «first» — профиль «первый заказ»: видео, тексты, нейросети тоже наши. */
export function evaluate(order, opts = {}) {
  const first = opts.profile === 'first';
  const text = `${order.title ?? ''} ${order.text ?? ''}`;

  // R1: заказ на работу, не вакансия / отзыв / тестирование
  if (findWord(text, VACANCY)) return no('R1', 'вакансия (оклад, штат), а не заказ');
  if (findWord(text, REVIEW)) return no('R1', 'отзыв — не работа');
  if (findWord(text, TESTING)) return no('R1', 'тестирование, а не разработка');

  // R2: вид работы в линейке
  if (findWord(text, MANUAL_FILL)) return no('R2', 'ручное наполнение карточек, не наша линейка');
  const out = findWord(text, first ? OUT_OF_LINE.filter((w) => !FIRST_ALLOWED_OUT.includes(w)) : OUT_OF_LINE);
  if (out) return no('R2', `«${out}» — не наша линейка`);
  // ужесточение 14.11: игровые боты и обход капчи — всегда «нет»; чистый дизайн/полиграфия и копирайтинг — «нет», если нет слов разработки
  const spy = findWord(text, SURVEILLANCE);
  if (spy) return no('R2', `«${spy}» — слежка за людьми и распознавание лиц не берём`);
  const game = findWord(text, GAME_OR_CAPTCHA);
  if (game) return no('R2', `«${game}» — игровые боты и обход капчи не берём`);
  if (!findWord(text, BUILD_WORDS)) {
    const print = findWord(text, PRINT_DESIGN);
    if (print) return no('R2', `«${print}» — чистый дизайн и полиграфия, не наша линейка`);
    const copy = first ? null : findWord(text, COPYWRITING);
    if (copy) return no('R2', `«${copy}» — копирайтинг, не наша линейка`);
  }
  if (!findWord(text, first ? [...IN_LINE, ...FIRST_EXTRA_IN] : IN_LINE)) return no('R2', 'вид работы не из линейки (сайт, лендинг, бот, автоматизация, парсер, UI-дизайн)');

  // R3: бюджет ≥ порога или не указан
  const budget = budgetValue(order.budget);
  if (budget !== null && budget < BUDGET_MIN) {
    return no('R3', `бюджет ${budget} ₽ при пороге ${BUDGET_MIN} ₽`);
  }

  // R4: откликов ≤ 30 или заказ свежее 3 ч; без счётчика (Telegram) — не применяется
  if (typeof order.answers === 'number' && order.answers > ANSWERS_MAX) {
    const fresh = typeof order.age_hours === 'number' && order.age_hours < FRESH_HOURS;
    if (!fresh) {
      const age = typeof order.age_hours === 'number' ? `возраст ${order.age_hours} ч` : 'возраст не известен';
      return no('R4', `${order.answers} откликов при пороге ${ANSWERS_MAX}, ${age}`);
    }
  }

  // R5: нужен чужой кабинет или секреты
  if (findWord(text, SECRETS)) return no('R5', 'чужой кабинет или секреты (просят доступ, логин, пароль, токен)');

  // R6: срок ≤ 7 дней или не указан
  if (typeof order.deadline_days === 'number' && order.deadline_days > DEADLINE_MAX_DAYS) {
    return no('R6', `срок ${order.deadline_days} дн. при пределе ${DEADLINE_MAX_DAYS}`);
  }

  // R7: не требует подтверждённого диплома / стажа
  if (findWord(text, CREDENTIALS)) return no('R7', 'диплом или стаж — нужны подтверждённые');

  const flags = [];
  if (budget === null) flags.push('нет_бюджета');
  if (findWord(text, CLARIFY)) flags.push('уточнить');
  const hour = utc7Hour(order.collected_at);
  if (hour !== null && (hour < REPLY_FROM || hour >= REPLY_TO)) flags.push('отвечать_с_10:00');
  if (order.possible_duplicate) flags.push('возможный_дубль');

  return { verdict: 'берём', rule: null, reason: 'R1–R7 пройдены', flags };
}
