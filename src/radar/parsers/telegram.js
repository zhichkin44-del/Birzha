// Публичная веб-лента канала https://t.me/s/<канал> (без входа) → заказы в общем виде (DATA §2), формат как у parsers/fl.js.
// Вёрстка сверена с настоящими страницами 14.11.2026 (FreelanceBay, FrWork3, zakaz_design и ещё ~30 каналов): последние ~20 постов,
// пост = блок «tgme_widget_message_wrap», id — data-post="<канал>/<номер>", текст — .tgme_widget_message_text (внутри <b>, <br/>,
// <tg-emoji>), время — <time datetime="2026-11-14T09:35:01+00:00">. Бюджета, откликов и срока в постах нет (R4 не применяется).
// Хвост «➖ ➖ ➖ Разместить вакансию / рекламу» (реклама канала) отрезается; @имена, t.me-ссылки, почты, телефоны вырезаются.
// Нет ни одного блока поста и нет «tgme_channel_history» → LayoutChangedError; закрытый для превью канал (0 постов) → честно пусто.
import { LayoutChangedError } from '../fetch.js';
import { textOf, scrubPersonal, moneyOf, ageFrom } from './common.js';

const FOOTER = /[➖\s]{6,}.*$/su; // «➖ ➖ ➖ … 📣 Разместить вакансию / рекламу …»

/** @param {string} html @param {string} nowIso @param {string} channel «FreelanceBay» (как в адресе) */
export function parseTelegram(html, nowIso, channel) {
  const out = [];
  const seen = new Set();
  for (const part of html.split('tgme_widget_message_wrap').slice(1)) {
    const post = part.match(/data-post="([^"\/]+)\/(\d+)"/);
    if (!post || seen.has(post[2])) continue;
    seen.add(post[2]);
    const rawText = (part.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/) ?? [])[1];
    if (!rawText) continue; // пост без текста (картинка, служебный)
    const boldFirst = (rawText.match(/<b>([\s\S]*?)<\/b>/g) ?? []).map(textOf).find((t) => /[а-яёa-z]{3}/i.test(t)); // 💬 — тоже в <b>
    const text = scrubPersonal(textOf(rawText).replace(FOOTER, ''));
    if (!text) continue;
    const title = scrubPersonal(boldFirst ?? '') || text.replace(/^[^а-яёa-z0-9]+/i, '').slice(0, 80);
    const t = (part.match(/<time[^>]*datetime="([^"]+)"/) ?? [])[1];
    const ms = Date.parse(t);
    out.push({
      id: `tg-${post[1]}-${post[2]}`.toLowerCase(),
      channel: `tg-${(channel ?? post[1]).toLowerCase()}`,
      url: `https://t.me/${post[1]}/${post[2]}`,
      title: title.slice(0, 120),
      text,
      budget: moneyOf(text).rub, // «30 000 ₽» из текста поста, если есть
      answers: null,
      age_hours: ageFrom(ms, nowIso),
      posted_at: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
      deadline_days: null,
      collected_at: nowIso,
    });
  }
  return out;
}

export function parseTelegramChecked(html, nowIso, channel) {
  const orders = parseTelegram(html, nowIso, channel);
  if (!orders.length && !/tgme_channel_history|tgme_widget_message_wrap/.test(html)) throw new LayoutChangedError();
  return orders;
}
