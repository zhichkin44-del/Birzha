// FL.ru feed page → orders in the common shape (DATA §2).
// Layout checked against the real page https://www.fl.ru/projects/ on 14.11.2026 (29 cards):
// card = block with id="project-item<N>", title — link id="prj_name_<N>", price — .b-post__price,
// text — .b-post__txt.text-5, kind and time — "Заказ|Вакансия|Конкурс" (Order|Vacancy|Contest) + "5 часов 9 минут назад" (5 hours 9 minutes ago) or "1 октября, 15:12" (1 October, 15:12).
// Found 0 cards — the runner will report "silent: layout".
import { LayoutChangedError } from '../fetch.js';

const BASE = 'https://www.fl.ru';
const CARD = /id="project-item(\d+)"/g;
const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];

const ENTITIES = { nbsp: ' ', quot: '"', amp: '&', lt: '<', gt: '>', laquo: '«', raquo: '»', mdash: '—', ndash: '–' };
export const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const strip = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** "2 часа назад" / "5 часов 9 минут назад" / "30 минут назад" / "1 день назад" (ago) → hours or null. */
export function ageHours(chunk) {
  let h = 0;
  let seen = false;
  for (const m of chunk.matchAll(/(\d+)\s*(мин|час|д(?:ень|ня|ней))/gi)) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    h += unit.startsWith('мин') ? n / 60 : unit.startsWith('час') ? n : n * 24;
    seen = true;
  }
  return seen ? Math.round(h * 100) / 100 : null;
}

/** "1 октября, 15:12" (Moscow time) → ISO or null; the year is the current one if the date is not in the future, otherwise the previous one. */
export function dateMsk(chunk, nowIso) {
  const m = chunk.match(/(\d{1,2})\s+([а-яё]+),?\s+(\d{1,2}):(\d{2})/i);
  if (!m) return null;
  const word = m[2].toLowerCase();
  const month = word.startsWith('мар') ? 2 : word.startsWith('мая') || word === 'май' ? 4 : MONTHS.findIndex((p) => p !== 'ма' && word.startsWith(p));
  if (month < 0) return null;
  const now = Date.parse(nowIso);
  let year = new Date(now).getUTCFullYear();
  const at = (y) => Date.UTC(y, month, Number(m[1]), Number(m[3]) - 3, Number(m[4]));
  if (at(year) > now) year -= 1;
  return new Date(at(year)).toISOString();
}

/** "1 500 ₽", "5 000 ₽ – 10 000 ₽" → upper bound; "по договоренности" (negotiable) → null. */
export function budgetOf(text) {
  const sums = [...text.matchAll(/(\d[\d\s]*\d|\d)\s*(?:₽|руб)/g)].map((m) => Number(m[1].replace(/\s/g, '')));
  return sums.length ? Math.max(...sums) : null;
}

// Markers of a genuinely empty list (the phrases of a real empty FL.ru feed were never seen).
const EMPTY = /ничего не найдено|проектов не найдено|нет проектов|заказов не найдено/i;
export const looksEmptyFl = (html) => EMPTY.test(html);

/** parseFl + check: 200, 0 orders and no empty-list marker → LayoutChangedError. */
export function parseFlChecked(html, nowIso) {
  const orders = parseFl(html, nowIso);
  if (!orders.length && !looksEmptyFl(html)) throw new LayoutChangedError();
  return orders;
}

export function parseFl(html, nowIso) {
  const nowMs = Date.parse(nowIso);
  const hits = [...html.matchAll(CARD)];
  const seen = new Set();
  const out = [];
  hits.forEach((m, i) => {
    const id = m[1];
    if (seen.has(id)) return;
    seen.add(id);
    const block = html.slice(m.index, i + 1 < hits.length ? hits[i + 1].index : html.length);
    const link = block.match(new RegExp(`<a[^>]*id="prj_name_${id}"[^>]*>([\\s\\S]*?)</a>`)) ?? block.match(/<a[^>]*href="\/projects\/\d+\/[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    const href = (link?.[0].match(/href="(\/projects\/\d+\/[^"]*)"/) ?? [])[1] ?? `/projects/${id}/`;
    const title = link ? strip(link[1]) : '';
    if (!title) return;
    const price = strip((block.match(/class="[^"]*b-post__price[^"]*"[^>]*>([\s\S]*?)<\/div>/) ?? [])[1] ?? '');
    const body = strip((block.match(/class="b-post__txt text-5[^"]*"[^>]*>([\s\S]*?)<\/div>/) ?? [])[1] ?? '');
    const kindM = block.match(/b-post__bold[^>]*>([\s\S]*?)<\/span>\s*(?:<span[^>]*>([^<]*)<)?/);
    const kind = kindM ? strip(kindM[1]) : 'Заказ';
    const when = kindM?.[2] ? strip(kindM[2]) : '';
    // replies — only from the card counter (not from the description); "Нет ответов" (no replies) → 0
    const foot = block.indexOf('b-post__foot');
    const counter = foot < 0 ? '' : strip(block.slice(foot));
    const answersM = /нет ответов/i.test(counter) ? ['0', '0'] : counter.match(/(\d+)\s*(?:ответ|отклик)/i);
    let age = /назад/.test(when) ? ageHours(when) : null;
    let posted = age === null ? null : new Date(nowMs - age * 3600_000).toISOString();
    if (age === null && (posted = dateMsk(when, nowIso))) age = Math.round(((nowMs - Date.parse(posted)) / 3600_000) * 100) / 100;
    const text = (kind && kind !== 'Заказ' ? `${kind}. ` : '') + (body || title);
    out.push({
      id: `fl-${id}`,
      channel: 'fl',
      url: BASE + href,
      title,
      text,
      budget: budgetOf(price),
      answers: answersM ? Number(answersM[1]) : null,
      age_hours: age,
      posted_at: posted,
      deadline_days: null,
      collected_at: nowIso,
    });
  });
  return out;
}
