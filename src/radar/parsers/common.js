// Общее для парсеров «вне FL.ru и Kwork» (Freelancehunt, Weblancer, Freelance.ru, Telegram).
// Личные данные не храним: @имена, ссылки t.me/…, почты, телефоны вырезаются из текста до записи (CLAUDE.md, ТЗ 14.11).
import { decode } from './fl.js';

/** HTML-кусок → чистый текст: теги, комментарии, svg, сущности, пробелы. Переносы строк <br> → пробел. */
export const textOf = (s) =>
  decode(
    String(s ?? '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const PERSONAL = [
  /(?:https?:\/\/)?(?:t\.me|telegram\.me|wa\.me|vk\.com|vk\.me|instagram\.com)\/[^\s)»"<]*/gi, // ссылки на аккаунты и чаты
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // почта
  /(?<![\w@])@[A-Za-z][A-Za-z0-9_]{3,}/g, // @имя
  /(?:\+7|(?<!\d)8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g, // телефон РФ
];

/** Вырезает контакты заказчика; «Писать — @name» остаётся «Писать —». */
export function scrubPersonal(text) {
  let t = String(text ?? '');
  for (const re of PERSONAL) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

// ОРИЕНТИРЫ, не курс ЦБ (курс в этой среде не проверялся; директор/Саша поправят одной строкой).
// Нужны только чтобы правило R3 («от 3 000 ₽») сравнивало рубли с рублями.
export const RUB_PER = { RUB: 1, USD: 80, EUR: 90, UAH: 2 };
const CUR = { '₽': 'RUB', руб: 'RUB', rub: 'RUB', '$': 'USD', usd: 'USD', '€': 'EUR', eur: 'EUR', '₴': 'UAH', грн: 'UAH', uah: 'UAH' };

/** «16 000 UAH», «1000 $», «95 000 ₽» → {rub, raw}; нет суммы / «Не указан» → {rub: null, raw: null}. */
export function moneyOf(s) {
  const t = textOf(s);
  const m = t.match(/(\d[\d\s]*\d|\d)\s*(₽|руб\.?|rub|\$|usd|€|eur|₴|грн|uah)/i);
  const pre = m ? null : t.match(/(\$|€|₽|₴)\s*(\d[\d\s]*\d|\d)/); // «$33» — знак перед суммой (Pchel.net)
  if (!m && !pre) return { rub: null, raw: null };
  const n = Number((m ? m[1] : pre[2]).replace(/\s/g, ''));
  const cur = CUR[(m ? m[2] : pre[1]).toLowerCase().replace(/\.$/, '')] ?? 'RUB';
  if (!Number.isFinite(n) || n <= 0) return { rub: null, raw: null };
  return { rub: Math.round(n * RUB_PER[cur]), raw: `${n} ${cur}` };
}

const round2 = (x) => Math.round(x * 100) / 100;
/** Возраст в часах от момента `fromMs` до `nowIso`; в будущее не уходит. */
export const ageFrom = (fromMs, nowIso) => (Number.isFinite(fromMs) ? Math.max(0, round2((Date.parse(nowIso) - fromMs) / 3600_000)) : null);

export const MONTH_NUM = { января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5, июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11 };

/** Проверка «страница пришла, а заказов 0»: признаки честно пустого списка. Фразы настоящих пустых страниц не видели (RISKS №2). */
export const EMPTY_RE = /ничего не найдено|проектов не найдено|заданий не найдено|заказов не найдено|нет проектов|нет заданий|no results|nothing found/i;
