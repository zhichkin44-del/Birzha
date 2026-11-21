// Weblancer listing page → orders in the common shape (DATA §2), same format as parsers/fl.js.
// Layout checked against the real pages on 14.11.2026: /freelance/ , /freelance/sozdanie-botov/, /freelance/veb-programmirovanie-31/
// (20 cards each; /jobs/ redirects to /freelance/). Address — www.weblancer.net only.
// Card = <article class="bg-white p-6 …">: title — h2 > a[href="/freelance/…/<slug>-<id>/"], budget — span.text-green-600
// ("1000 $", many have none), description — p.text-gray-600, three badges at the bottom: date "13.11.2026", "8 заявок" (8 bids), "813 просмотров" (813 views);
// a closed order is marked with the badge "закрыт" (closed) — such orders are skipped (you cannot reply). The page has no time of day: age is counted from the start
// of the day in Moscow (upper bound). Found 0 cards and no empty-list marker → LayoutChangedError.
import { LayoutChangedError } from '../fetch.js';
import { textOf, scrubPersonal, moneyOf, ageFrom, EMPTY_RE } from './common.js';

const BASE = 'https://www.weblancer.net';
const MSK_H = 3;

export function parseWeblancer(html, nowIso) {
  const out = [];
  const seen = new Set();
  for (const card of html.split('<article ').slice(1)) {
    const link = card.match(/<h2[^>]*>\s*<a[^>]*href="(\/freelance\/[^"]*?-(\d+)\/)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link || seen.has(link[2])) continue;
    const title = textOf(link[3]);
    if (!title) continue;
    seen.add(link[2]);
    if (/<span>\s*закрыт\s*<\/span>/i.test(card)) continue; // closed for replies
    const price = (card.match(/<span class="text-green-600[^"]*"[^>]*>([\s\S]*?)<\/span>/) ?? [])[1] ?? '';
    const money = moneyOf(price);
    const body = scrubPersonal(textOf((card.match(/<p class="text-gray-600[^"]*"[^>]*>([\s\S]*?)<\/p>/) ?? [])[1]));
    const date = card.match(/<span>(\d{2})\.(\d{2})\.(\d{4})<\/span>/);
    const ms = date ? Date.UTC(+date[3], +date[2] - 1, +date[1]) - MSK_H * 3600_000 : NaN;
    const answers = card.match(/<span>(\d+)\s+заяв/i);
    out.push({
      id: `wl-${link[2]}`,
      channel: 'weblancer',
      url: BASE + link[1],
      title: scrubPersonal(title),
      text: body || title,
      budget: money.rub,
      budget_raw: money.raw,
      answers: answers ? Number(answers[1]) : null,
      age_hours: ageFrom(ms, nowIso),
      posted_at: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
      deadline_days: null,
      collected_at: nowIso,
    });
  }
  return out;
}

export function parseWeblancerChecked(html, nowIso) {
  const orders = parseWeblancer(html, nowIso);
  // a page of only closed orders is not a "broken layout": there were cards, there was just nothing to take
  if (!orders.length && !EMPTY_RE.test(html) && !/<span>\s*закрыт\s*<\/span>/i.test(html)) throw new LayoutChangedError();
  return orders;
}
