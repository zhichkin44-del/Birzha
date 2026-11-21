// Shared by the parsers "beyond FL.ru and Kwork" (Freelancehunt, Weblancer, Freelance.ru, Telegram).
// Personal data is not stored: @names, t.me/… links, emails and phone numbers are cut from the text before saving (CLAUDE.md, spec 14.11).
import { decode } from './fl.js';

/** HTML fragment → plain text: tags, comments, svg, entities, spaces. Line breaks <br> → space. */
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
  /(?:https?:\/\/)?(?:t\.me|telegram\.me|wa\.me|vk\.com|vk\.me|instagram\.com)\/[^\s)»"<]*/gi, // links to accounts and chats
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // email
  /(?<![\w@])@[A-Za-z][A-Za-z0-9_]{3,}/g, // @name
  /(?:\+7|(?<!\d)8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g, // Russian phone number
];

/** Strips the client's contacts; "Писать — @name" (write to) becomes "Писать —". */
export function scrubPersonal(text) {
  let t = String(text ?? '');
  for (const re of PERSONAL) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

// REFERENCE rates, not the central bank rate (the rate was not checked in this environment; the director/Sasha will correct it in one line).
// Needed only so that rule R3 ("from 3 000 ₽") compares rubles with rubles.
export const RUB_PER = { RUB: 1, USD: 80, EUR: 90, UAH: 2 };
const CUR = { '₽': 'RUB', руб: 'RUB', rub: 'RUB', '$': 'USD', usd: 'USD', '€': 'EUR', eur: 'EUR', '₴': 'UAH', грн: 'UAH', uah: 'UAH' };

/** "16 000 UAH", "1000 $", "95 000 ₽" → {rub, raw}; no amount / "Не указан" (not stated) → {rub: null, raw: null}. */
export function moneyOf(s) {
  const t = textOf(s);
  const m = t.match(/(\d[\d\s]*\d|\d)\s*(₽|руб\.?|rub|\$|usd|€|eur|₴|грн|uah)/i);
  const pre = m ? null : t.match(/(\$|€|₽|₴)\s*(\d[\d\s]*\d|\d)/); // "$33" — the sign before the amount (Pchel.net)
  if (!m && !pre) return { rub: null, raw: null };
  const n = Number((m ? m[1] : pre[2]).replace(/\s/g, ''));
  const cur = CUR[(m ? m[2] : pre[1]).toLowerCase().replace(/\.$/, '')] ?? 'RUB';
  if (!Number.isFinite(n) || n <= 0) return { rub: null, raw: null };
  return { rub: Math.round(n * RUB_PER[cur]), raw: `${n} ${cur}` };
}

const round2 = (x) => Math.round(x * 100) / 100;
/** Age in hours from the moment `fromMs` to `nowIso`; never goes into the future. */
export const ageFrom = (fromMs, nowIso) => (Number.isFinite(fromMs) ? Math.max(0, round2((Date.parse(nowIso) - fromMs) / 3600_000)) : null);

export const MONTH_NUM = { января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5, июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11 };

/** Check for "page arrived but 0 orders": markers of a genuinely empty list. The phrases of real empty pages were never seen (RISKS №2). */
export const EMPTY_RE = /ничего не найдено|проектов не найдено|заданий не найдено|заказов не найдено|нет проектов|нет заданий|no results|nothing found/i;
