// Один запрос к публичной странице: без cookie и входа, заметный User-Agent, пауза между запросами.
// Капча / защита / 403 / 429 → BlockedError (PLAN §3, одно правило). Обход не пишем.
export class BlockedError extends Error {
  constructor(status, why = 'защита') {
    super(`blocked: ${why} (HTTP ${status})`);
    this.name = 'BlockedError';
    this.status = status;
  }
}

export const USER_AGENT = 'BirzhaRadar/0.1 (личный радар заказов; без входа; контакт: владелец проекта)';
const CAPTCHA = /captcha|капч|проверка безопасности|доступ ограничен|checking your browser/i;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @param {string} url @param {{fetchImpl?: Function, pauseMs?: number, sleepImpl?: Function}} opts */
export async function fetchPage(url, { fetchImpl = fetch, pauseMs = 10_000, sleepImpl = sleep } = {}) {
  await sleepImpl(pauseMs);
  const res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT }, credentials: 'omit', redirect: 'follow' });
  if (res.status === 403 || res.status === 429) throw new BlockedError(res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (CAPTCHA.test(html.slice(0, 5000))) throw new BlockedError(res.status, 'капча');
  return html;
}
