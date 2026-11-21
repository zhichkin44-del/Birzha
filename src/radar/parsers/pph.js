// PeoplePerHour: listing page /freelance-jobs/<section> (checked 14.11.2026: HTTP 200, 20 cards, no login).
// Card = <li class="list__item⤍List⤚…"> (class hashes change — we match by the class prefix). Link — a.item__url, title — h6.item__title,
// description — p.item__desc, price — card__price ($364, $2.6K, £…), footer — "12 hours ago", "49 proposals".
// The author name (card__user) is not stored. 0 cards and no empty-list marker → LayoutChangedError.
import { LayoutChangedError } from '../fetch.js';
import { textOf, scrubPersonal, RUB_PER, ageFrom, EMPTY_RE } from './common.js';

const PPH_RUB = { ...RUB_PER, GBP: 100 }; // reference ₽/£ rate, not verified

function priceOf(card) {
  const t = textOf((card.match(/class="[^"]*card__price[^"]*">([\s\S]*?)<\/div><div class="u-mgl--1 bookmark/) ?? card.match(/class="[^"]*card__price[^"]*">([\s\S]*?)<\/span><\/div>/) ?? [])[1]);
  const m = t.match(/([$£€])\s*(\d[\d,]*(?:\.\d+)?)\s*([kK])?/);
  if (!m) return { rub: null, raw: null };
  let n = Number(m[2].replace(/,/g, ''));
  if (m[3]) n *= 1000;
  const cur = { $: 'USD', '£': 'GBP', '€': 'EUR' }[m[1]];
  if (!(n > 0)) return { rub: null, raw: null };
  return { rub: Math.round(n * PPH_RUB[cur]), raw: `${Math.round(n)} ${cur}` };
}

/** "12 hours ago", "3 days ago", "a day ago", "5 minutes ago" → hours. */
function hoursOf(s) {
  const m = String(s).match(/(\d+|an?)\s+(minute|hour|day|week|month)s?\s+ago/i);
  if (!m) return null;
  const n = /^an?$/i.test(m[1]) ? 1 : Number(m[1]);
  return n * { minute: 1 / 60, hour: 1, day: 24, week: 168, month: 720 }[m[2].toLowerCase()];
}

export function parsePph(html, nowIso) {
  const out = [];
  const seen = new Set();
  for (const card of html.split(/<li class="list__item⤍List⤚[^"]*">/).slice(1)) {
    const link = card.match(/class="item__url[^"]*"\s+href="(https:\/\/www\.peopleperhour\.com\/freelance-jobs\/[^"]*?-(\d+))"[^>]*>([\s\S]*?)<\/a>/);
    if (!link || seen.has(link[2])) continue;
    const title = scrubPersonal(textOf(link[3]));
    if (!title) continue;
    seen.add(link[2]);
    const body = scrubPersonal(textOf((card.match(/class="item__desc[^"]*">([\s\S]*?)<\/p>/) ?? [])[1]));
    const money = priceOf(card);
    const footer = textOf((card.match(/class="[^"]*card__footer-left[^"]*">([\s\S]*?)<\/div>/) ?? [])[1]);
    const props = footer.match(/(\d+)\s+proposals?/i);
    const hours = hoursOf(footer);
    const at = hours == null ? null : Date.parse(nowIso) - hours * 3600_000;
    out.push({
      id: `pph-${link[2]}`,
      channel: 'pph',
      url: link[1],
      title,
      text: body || title,
      budget: money.rub,
      budget_raw: money.raw,
      answers: props ? Number(props[1]) : null,
      age_hours: at == null ? null : ageFrom(at, nowIso),
      posted_at: at == null ? null : new Date(at).toISOString(),
      deadline_days: null,
      collected_at: nowIso,
    });
  }
  return out;
}

export function parsePphChecked(html, nowIso) {
  const orders = parsePph(html, nowIso);
  if (!orders.length && !EMPTY_RE.test(html)) throw new LayoutChangedError();
  return orders;
}
