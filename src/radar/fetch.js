// One request to a public page: no cookies or login, a visible User-Agent, a pause between requests.
// Captcha / protection / 403 / 429 → BlockedError (PLAN §3, single rule). No bypass is implemented.
export class BlockedError extends Error {
  constructor(status, why = 'protection') {
    super(`blocked: ${why} (HTTP ${status})`);
    this.name = 'BlockedError';
    this.status = status;
  }
}

export const USER_AGENT = 'BirzhaRadar/0.1 (personal order radar; no login; one page, 10 s pause)';
const CAPTCHA = /captcha|капч|не робот|проверка безопасности|доступ ограничен|checking your browser/i;
// Captcha is searched only in visible text: a regular FL.ru page has a meta "recaptcha-site-key" in <head> (14.11 — a false "protection").
export const visibleStart = (html) =>
  html
    .replace(/<head[\s>][\s\S]*?<\/head>/i, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ') // keep noscript: without JS the radar sees exactly that
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 5000);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** robots.txt disallows the path (or the file is unavailable with 5xx) → the channel is "manual", the page is not requested. */
export class RobotsClosedError extends Error {
  constructor(url, why = 'path closed in robots.txt') {
    super(`robots: ${why} (${url})`);
    this.name = 'RobotsClosedError';
    this.url = url;
  }
}

/** The page arrived (200), but there are 0 orders and no empty-list markers → the layout has most likely changed. */
export class LayoutChangedError extends Error {
  constructor(msg = 'layout changed, check by hand') {
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

/** Parses robots.txt (RFC 9309, simplified): the group with our name, otherwise `*`; the longest rule wins, on a tie — Allow. */
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

// robots.txt cache for one process run: site → text ('' = no file, everything open).
const runRobotsCache = new Map();

async function checkRobots(url, { fetchImpl, pauseMs, sleepImpl, robotsCache }) {
  const u = new URL(url);
  let txt = robotsCache.get(u.origin);
  if (txt === undefined) {
    await sleepImpl(pauseMs);
    const res = await fetchImpl(`${u.origin}/robots.txt`, { headers: { 'user-agent': USER_AGENT }, credentials: 'omit', redirect: 'follow' });
    if (res.status === 401 || res.status === 403 || res.status === 429) throw new BlockedError(res.status, 'robots.txt unavailable');
    if (res.status >= 500) throw new RobotsClosedError(url, `robots.txt returned HTTP ${res.status}, treating the path as closed`);
    txt = res.ok ? await res.text() : ''; // 404 and other 4xx — no file, no restrictions
    robotsCache.set(u.origin, txt);
  }
  if (!isPathAllowed(txt, u.pathname + u.search)) throw new RobotsClosedError(url);
}

/** @param {string} url @param {{fetchImpl?: Function, pauseMs?: number, sleepImpl?: Function, robotsCache?: Map}} opts */
export async function fetchPage(url, { fetchImpl = fetch, pauseMs = 10_000, sleepImpl = sleep, robotsCache = runRobotsCache, respectRobots = true } = {}) {
  // respectRobots:false — Sasha's order 14.11 ("we do not read platform rules"); protection (captcha, challenge, 403) is still not bypassed
  if (respectRobots) await checkRobots(url, { fetchImpl, pauseMs, sleepImpl, robotsCache });
  await sleepImpl(pauseMs);
  const res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT }, credentials: 'omit', redirect: 'follow' });
  if (res.status === 403 || res.status === 429) throw new BlockedError(res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  // JSON API response (Freelancer.com): the word "captcha" in a project text is not page protection
  if (!/^\s*[{[]/.test(html) && CAPTCHA.test(visibleStart(html))) throw new BlockedError(res.status, 'captcha');
  return html;
}
