// Один запрос к публичной странице: без cookie и входа, заметный User-Agent, пауза между запросами.
// Капча / защита / 403 / 429 → BlockedError (PLAN §3, одно правило). Обход не пишем.
export class BlockedError extends Error {
  constructor(status, why = 'защита') {
    super(`blocked: ${why} (HTTP ${status})`);
    this.name = 'BlockedError';
    this.status = status;
  }
}

export const USER_AGENT = 'BirzhaRadar/0.1 (personal order radar; no login; one page, 10 s pause)';
const CAPTCHA = /captcha|капч|не робот|проверка безопасности|доступ ограничен|checking your browser/i;
// Капчу ищем только в видимом тексте: у обычной страницы FL.ru в <head> есть meta «recaptcha-site-key» (14.11 — ложная «защита»).
export const visibleStart = (html) =>
  html
    .replace(/<head[\s>][\s\S]*?<\/head>/i, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ') // noscript оставляем: без JS radar видит именно его
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 5000);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** robots.txt закрывает путь (или сам файл недоступен по 5xx) → канал «руками», страницу не запрашиваем. */
export class RobotsClosedError extends Error {
  constructor(url, why = 'путь закрыт в robots.txt') {
    super(`robots: ${why} (${url})`);
    this.name = 'RobotsClosedError';
    this.url = url;
  }
}

/** Страница пришла (200), а заказов 0 и признаков пустого списка нет → вёрстка, скорее всего, изменилась. */
export class LayoutChangedError extends Error {
  constructor(msg = 'вёрстка изменилась, проверь руками') {
    super(msg);
    this.name = 'LayoutChangedError';
  }
}

const UA_TOKEN = 'birzharadar';

function rulePattern(path) {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path).replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Разбор robots.txt (RFC 9309, упрощённо): группа с нашим именем, иначе `*`; самое длинное правило, при равенстве — Allow. */
export function isPathAllowed(robotsTxt, path) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(robotsTxt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === 'allow' || key === 'disallow') && val) cur.rules.push({ allow: key === 'allow', re: rulePattern(val), len: val.length });
    }
  }
  const own = groups.filter((g) => g.agents.some((a) => a === UA_TOKEN));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  let best = null;
  for (const g of chosen) {
    for (const r of g.rules) {
      if (!r.re.test(path)) continue;
      if (!best || r.len > best.len || (r.len === best.len && r.allow)) best = r;
    }
  }
  return best ? best.allow : true;
}

// Кэш robots.txt на запуск процесса: площадка → текст ('' = файла нет, всё открыто).
const runRobotsCache = new Map();

async function checkRobots(url, { fetchImpl, pauseMs, sleepImpl, robotsCache }) {
  const u = new URL(url);
  let txt = robotsCache.get(u.origin);
  if (txt === undefined) {
    await sleepImpl(pauseMs);
    const res = await fetchImpl(`${u.origin}/robots.txt`, { headers: { 'user-agent': USER_AGENT }, credentials: 'omit', redirect: 'follow' });
    if (res.status === 401 || res.status === 403 || res.status === 429) throw new BlockedError(res.status, 'robots.txt недоступен');
    if (res.status >= 500) throw new RobotsClosedError(url, `robots.txt отвечает HTTP ${res.status}, считаем путь закрытым`);
    txt = res.ok ? await res.text() : ''; // 404 и прочие 4xx — файла нет, ограничений нет
    robotsCache.set(u.origin, txt);
  }
  if (!isPathAllowed(txt, u.pathname + u.search)) throw new RobotsClosedError(url);
}

/** @param {string} url @param {{fetchImpl?: Function, pauseMs?: number, sleepImpl?: Function, robotsCache?: Map}} opts */
export async function fetchPage(url, { fetchImpl = fetch, pauseMs = 10_000, sleepImpl = sleep, robotsCache = runRobotsCache, respectRobots = true } = {}) {
  // respectRobots:false — приказ Саши 14.11 («правила площадок не считываем»); защиту (капча, challenge, 403) по-прежнему не обходим
  if (respectRobots) await checkRobots(url, { fetchImpl, pauseMs, sleepImpl, robotsCache });
  await sleepImpl(pauseMs);
  const res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT }, credentials: 'omit', redirect: 'follow' });
  if (res.status === 403 || res.status === 429) throw new BlockedError(res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  // JSON-ответ API (Freelancer.com): слово «captcha» в тексте проекта — не защита страницы
  if (!/^\s*[{[]/.test(html) && CAPTCHA.test(visibleStart(html))) throw new BlockedError(res.status, 'капча');
  return html;
}
