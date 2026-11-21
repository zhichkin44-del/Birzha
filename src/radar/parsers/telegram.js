// Public web feed of the channel https://t.me/s/<channel> (no login) → orders in the common shape (DATA §2), same format as parsers/fl.js.
// Layout checked against real pages on 14.11.2026 (FreelanceBay, FrWork3, zakaz_design and ~30 more channels): the last ~20 posts,
// post = block "tgme_widget_message_wrap", id — data-post="<channel>/<number>", text — .tgme_widget_message_text (inside <b>, <br/>,
// <tg-emoji>), time — <time datetime="2026-11-14T09:35:01+00:00">. Posts have no budget, replies or term (R4 is not applied).
// A tail "➖ ➖ ➖ Разместить вакансию / рекламу" (post a vacancy / ad — the channel's ad) is cut; @names, t.me links, emails and phones are stripped.
// No post block and no "tgme_channel_history" → LayoutChangedError; a channel closed for preview (0 posts) → honestly empty.
import { LayoutChangedError } from '../fetch.js';
import { textOf, scrubPersonal, moneyOf, ageFrom } from './common.js';

const FOOTER = /[➖\s]{6,}.*$/su; // «➖ ➖ ➖ … 📣 Разместить вакансию / рекламу …»

/** @param {string} html @param {string} nowIso @param {string} channel "FreelanceBay" (as in the address) */
export function parseTelegram(html, nowIso, channel) {
  const out = [];
  const seen = new Set();
  for (const part of html.split('tgme_widget_message_wrap').slice(1)) {
    const post = part.match(/data-post="([^"\/]+)\/(\d+)"/);
    if (!post || seen.has(post[2])) continue;
    seen.add(post[2]);
    const rawText = (part.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/) ?? [])[1];
    if (!rawText) continue; // post without text (image, service post)
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
      budget: moneyOf(text).rub, // "30 000 ₽" from the post text, if present
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
