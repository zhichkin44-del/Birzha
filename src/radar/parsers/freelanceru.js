// Страница списка Freelance.ru (/task, куда ведёт /projects/) → заказы в общем виде (DATA §2), формат как у parsers/fl.js.
// Вёрстка сверена с настоящей страницей https://freelance.ru/task 14.11.2026 (25 карточек за ~2,5 суток).
// Карточка = <article class="task-card">: заголовок — a.task-card__title-link[href="/task/view/<id>"], описание — p.task-card__desc
// (обрезано «...»), раздел — .task-chip--cat («Веб-разработка и IT», «Тексты и Переводы», …), внизу значки: время «14.11.2026 10:42»
// (title, по Москве) + «час назад», регион, число под значком «комментарии», просмотры; справа «Гонорар: 95 000 ₽ / заказ» и «Срок: 31 день».
// Значок «комментарии» трактуем как отклики — НЕ проверено. Много мусора («заполнение карточек», отзывы, «доход на 2–3 день»):
// фильтрует R1/R2. Нашёл 0 карточек и нет признака пустого списка → LayoutChangedError.
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
