// Pchel.net listing page (/jobs/) → orders in the common shape (DATA §2), same format as parsers/fl.js.
// Layout checked against the real page https://pchel.net/jobs/ on 14.11.2026 (50 cards, by descending project number).
// Card = <div class="project-block project-block2">: number — input[name=project_id], title — .project-title > a[href="/jobs/<section>/<slug>-<id>/"],
// price — .price ("$33" or "По договоренности" (negotiable)), description — .project-text p, section — .project-tags, bids — span.p-user[title="99 заявок"].
// The page has no date (only "Срочный проект" (urgent project) on all) — age is unknown. Found 0 cards and no empty-list marker → LayoutChangedError.
import { LayoutChangedError } from '../fetch.js';
import { textOf, scrubPersonal, moneyOf, EMPTY_RE } from './common.js';

const BASE = 'https://pchel.net';

export function parsePchel(html, nowIso) {
  const out = [];
  const seen = new Set();
  for (const card of html.split('<div class="project-block project-block2">').slice(1)) {
    const link = card.match(/<div class="project-title">[\s\S]*?<a href="(\/jobs\/[^"]*?-(\d+)\/)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link || seen.has(link[2])) continue;
    const title = scrubPersonal(textOf(link[3]));
    if (!title) continue;
    seen.add(link[2]);
    const money = moneyOf((card.match(/<div class="price">([\s\S]*?)<\/div>/) ?? [])[1]);
    const body = scrubPersonal(textOf((card.match(/<div class="project-text">([\s\S]*?)<\/div>/) ?? [])[1]));
    const cat = textOf((card.match(/<div class="project-tags[^"]*">([\s\S]*?)<\/div>/) ?? [])[1]).replace(/^Категория:\s*/, '').replace(/\s+,/g, ',');
    const answers = card.match(/title="(\d+)\s+заяв/i);
    out.push({
      id: `pchel-${link[2]}`,
      channel: 'pchel',
      url: BASE + link[1],
      title,
      text: (cat ? `${cat}. ` : '') + (body || title),
      budget: money.rub,
      budget_raw: money.raw,
      answers: answers ? Number(answers[1]) : null,
      age_hours: null,
      posted_at: null,
      deadline_days: null,
      collected_at: nowIso,
    });
  }
  return out;
}

export function parsePchelChecked(html, nowIso) {
  const orders = parsePchel(html, nowIso);
  if (!orders.length && !EMPTY_RE.test(html)) throw new LayoutChangedError();
  return orders;
}
