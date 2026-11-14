// Страница ленты FL.ru → заказы в общем виде (DATA §2). Вёрстка настоящей страницы НЕ проверена:
// парсер написан по синтетической странице (test/fixtures/fl.synthetic.html). Нашёл 0 заказов — раннер скажет «молчит: вёрстка».
const BASE = 'https://www.fl.ru';
const LINK = /<a[^>]+href="(\/projects\/(\d+)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** «2 часа назад» / «30 минут назад» / «1 день назад» → часы или null. */
export function ageHours(chunk) {
  const m = chunk.match(/(\d+)\s*(мин|час|д(?:ень|ня|ней))/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('мин')) return n / 60;
  if (unit.startsWith('час')) return n;
  return n * 24;
}

export function parseFl(html, nowIso) {
  const nowMs = Date.parse(nowIso);
  const hits = [...html.matchAll(LINK)];
  return hits.map((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : html.length;
    const chunk = strip(html.slice(m.index + m[0].length, end));
    const title = strip(m[3]);
    const budgetM = chunk.match(/(\d[\d\s]*\d|\d)\s*(?:₽|руб)/);
    const answersM = chunk.match(/(\d+)\s*(?:ответ|отклик)/i);
    const age = ageHours(chunk);
    const text = chunk.split(/\d[\d\s]*\s*(?:₽|руб)|договорн/i)[0].trim() || title;
    return {
      id: `fl-${m[2]}`,
      channel: 'fl',
      url: BASE + m[1],
      title,
      text,
      budget: budgetM ? Number(budgetM[1].replace(/\s/g, '')) : null,
      answers: answersM ? Number(answersM[1]) : null,
      age_hours: age,
      posted_at: age === null ? null : new Date(nowMs - age * 3600_000).toISOString(),
      deadline_days: null,
      collected_at: nowIso,
    };
  });
}
