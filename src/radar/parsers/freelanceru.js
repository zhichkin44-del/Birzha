// Freelance.ru listing page (/task, where /projects/ leads) → orders in the common shape (DATA §2), same format as parsers/fl.js.
// Layout checked against the real page https://freelance.ru/task on 14.11.2026 (25 cards over ~2.5 days).
// Card = <article class="task-card">: title — a.task-card__title-link[href="/task/view/<id>"], description — p.task-card__desc
// (cut with "..."), section — .task-chip--cat ("Веб-разработка и IT", "Тексты и Переводы", …), badges at the bottom: time "14.11.2026 10:42"
// (title, Moscow time) + "час назад" (hour ago), region, the number under the "comments" badge, views; on the right "Гонорар: 95 000 ₽ / заказ" (fee per order) and "Срок: 31 день" (term: 31 days).
// The "comments" badge is treated as replies — NOT verified. Lots of junk ("filling in cards", reviews, "income in 2–3 days"):
// filtered by R1/R2. Found 0 cards and no empty-list marker → LayoutChangedError.
import { LayoutChangedError } from '../fetch.js';
import { textOf, scrubPersonal, moneyOf, ageFrom, EMPTY_RE } from './common.js';

const BASE = 'https://freelance.ru';
const MSK_H = 3;

export function parseFreelanceRu(html, nowIso) {
  const out = [];
  const seen = new Set();
  for (const card of html.split('<article class="task-card').slice(1)) {
    const link = card.match(/<a class="task-card__title-link" href="(\/task\/view\/(\d+))"[^>]*>([\s\S]*?)<\/a>/);
    if (!link || seen.has(link[2])) continue;
    const title = textOf(link[3]);
    if (!title) continue;
    seen.add(link[2]);
    const cat = textOf((card.match(/task-chip--cat">([\s\S]*?)<\/span>/) ?? [])[1]);
    const body = scrubPersonal(textOf((card.match(/<p class="task-card__desc">([\s\S]*?)<\/p>/) ?? [])[1]).replace(/\.\.\.$/, ''));
    const when = card.match(/task-card__foot-item" title="(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})"/);
    const ms = when ? Date.UTC(+when[3], +when[2] - 1, +when[1], +when[4] - MSK_H, +when[5]) : NaN;
    const money = moneyOf((card.match(/task-card__budget">([\s\S]*?)<\/div>/) ?? [])[1]);
    const deadline = textOf(card).match(/Срок:\s*(\d+)\s*(?:дн|д\b)/i);
    const comments = card.match(/fa-comments[^>]*><\/i>\s*<strong>(\d+)<\/strong>/);
    out.push({
      id: `frru-${link[2]}`,
      channel: 'frru',
      url: BASE + link[1],
      title: scrubPersonal(title),
      text: (cat ? `${cat}. ` : '') + (body || title),
      budget: money.rub,
      budget_raw: money.raw,
      answers: comments ? Number(comments[1]) : null,
      age_hours: ageFrom(ms, nowIso),
      posted_at: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
      deadline_days: deadline ? Number(deadline[1]) : null,
      collected_at: nowIso,
    });
  }
  return out;
}

export function parseFreelanceRuChecked(html, nowIso) {
  const orders = parseFreelanceRu(html, nowIso);
  if (!orders.length && !EMPTY_RE.test(html)) throw new LayoutChangedError();
  return orders;
}
