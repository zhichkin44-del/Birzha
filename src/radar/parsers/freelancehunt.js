// Страница списка Freelancehunt → заказы в общем виде (DATA §2), формат как у parsers/fl.js.
// Вёрстка сверена с настоящими страницами 14.11.2026: /projects и /projects/skill/{razrabotka-botov/180,
// veb-programmirovanie/99, sozdanie-sayta-pod-klyuch/96}.html — на странице 5–15 карточек.
// Карточка = <article class="widget project-card …">: заголовок — a.project-link (внутри h2), бюджет — .project-stat.budget
// («16 000 UAH» или «Не указан»), ставки — .project-stat «N ставок», текст — p.project-description, дата — span.project-date
// («13 ноября» без времени ИЛИ «10:13» — сегодня). Часовой пояс сайта не проверен: считаем Киев, UTC+2 (зима).
// Нашёл 0 карточек и нет признака пустого списка → LayoutChangedError.
import { LayoutChangedError } from '../fetch.js';
import { textOf, scrubPersonal, moneyOf, ageFrom, MONTH_NUM, EMPTY_RE } from './common.js';

const TZ_H = 2;
const CARD = '<article class="widget project-card';

/** «13 ноября» / «10:13» → мс момента публикации (верхняя граница возраста: для «13 ноября» берём начало суток). */
export function postedMs(label, nowIso) {
  const now = Date.parse(nowIso);
  const t = String(label ?? '').trim();
  const local = new Date(now + TZ_H * 3600_000); // «настенное» время сайта в полях UTC
  let m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    let ms = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), +m[1], +m[2]) - TZ_H * 3600_000;
    if (ms > now) ms -= 86_400_000;
    return ms;
  }
  m = t.match(/^(\d{1,2})\s+([а-яё]+)/i);
  if (m && m[2].toLowerCase() in MONTH_NUM) {
    const at = (y) => Date.UTC(y, MONTH_NUM[m[2].toLowerCase()], +m[1]) - TZ_H * 3600_000;
    let y = local.getUTCFullYear();
    if (at(y) > now) y -= 1;
    return at(y);
  }
  return NaN;
}

export function parseFreelancehunt(html, nowIso) {
  const out = [];
  const seen = new Set();
  for (const card of html.split(CARD).slice(1)) {
    const link = card.match(/<a href="(https:\/\/freelancehunt\.com\/project\/[^"]*?\/(\d+)\.html)"[^>]*class="project-link[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    if (!link || seen.has(link[2])) continue;
    const title = textOf(link[3]);
    if (!title) continue;
    seen.add(link[2]);
    const stats = [...card.matchAll(/<span class="project-stat([^"]*)">([\s\S]*?)<\/span>/g)].map((m) => ({ cls: m[1], text: textOf(m[2]) }));
    const budgetText = stats.find((s) => /budget/.test(s.cls))?.text ?? '';
    const money = moneyOf(budgetText);
    const bids = stats.map((s) => s.text.match(/^(\d+)\s+став/i)).find(Boolean);
    const body = scrubPersonal(textOf((card.match(/<p class="project-description[^"]*"[^>]*>([\s\S]*?)<\/p>/) ?? [])[1]));
    const label = textOf((card.match(/<span class="project-date">([\s\S]*?)<\/span>/) ?? [])[1]);
    const ms = postedMs(label, nowIso);
    out.push({
      id: `fh-${link[2]}`,
      channel: 'fh',
      url: link[1],
      title: scrubPersonal(title),
      text: body || title,
      budget: money.rub,
      budget_raw: money.raw, // исходная валюта (грн) — для Саши; в правила идёт пересчёт по ориентиру
      answers: bids ? Number(bids[1]) : null,
      age_hours: ageFrom(ms, nowIso),
      posted_at: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
      deadline_days: null,
      collected_at: nowIso,
    });
  }
  return out;
}

export function parseFreelancehuntChecked(html, nowIso) {
  const orders = parseFreelancehunt(html, nowIso);
  if (!orders.length && !EMPTY_RE.test(html)) throw new LayoutChangedError();
  return orders;
}
