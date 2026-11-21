// One run: channels → duplicates → rules → records + report. One failing channel does not stop the others.
import { BlockedError, RobotsClosedError, LayoutChangedError } from './fetch.js';
import { mergeOrders } from './dedupe.js';
import { evaluate } from './rules.js';

const DAY_MS = 24 * 3600_000;

/**
 * @param {{id: string, load: () => Promise<object[]>}[]} channels
 * @param {{now?: string, state?: object, profile?: string, minIntervalMin?: number, force?: boolean}} opts  state: { [id]: {last_ok, last_attempt, blocked_streak, blocked_until} }
 * minIntervalMin — do not read a channel more often than this (order 14.11: at most once every 2 h); force — ignore the interval.
 */
export async function runChannels(channels, { now = new Date().toISOString(), state = {}, profile, minIntervalMin = 0, force = false } = {}) {
  const nowMs = Date.parse(now);
  const newState = JSON.parse(JSON.stringify(state));
  const report = { channels: {}, collected: 0, silent: [], skipped: [] };
  const orders = [];

  for (const ch of channels) {
    const st = (newState[ch.id] ??= { last_ok: null, blocked_streak: 0, blocked_until: null });
    const silent = (reason) => {
      report.channels[ch.id] = { status: 'silent', flag: 'канал_молчит', reason: `канал молчит: ${reason}`, count: 0 };
      report.silent.push(ch.id);
    };
    if (st.blocked_until && Date.parse(st.blocked_until) > nowMs) {
      silent(`стоит сутки до ${st.blocked_until}, канал «руками»`);
      continue;
    }
    if (!force && minIntervalMin > 0 && st.last_attempt && nowMs - Date.parse(st.last_attempt) < minIntervalMin * 60_000) {
      const ago = Math.round((nowMs - Date.parse(st.last_attempt)) / 60_000);
      report.channels[ch.id] = { status: 'skipped', flag: null, reason: `читали ${ago} мин назад, интервал ${minIntervalMin} мин`, count: 0 };
      report.skipped.push(ch.id);
      continue;
    }
    st.last_attempt = now;
    try {
      const got = await ch.load();
      if (!got.length) {
        silent('вёрстка: страница отдана, заказов 0'); // RISKS №2
        continue;
      }
      st.last_ok = now;
      st.blocked_streak = 0;
      st.blocked_until = null;
      orders.push(...got);
      const warnings = got.warnings ?? []; // some pages of the channel did not open — the reason is in the report, not silently
      report.channels[ch.id] = { status: 'ok', flag: null, reason: `собрано ${got.length}${warnings.length ? `; не открылись страницы: ${warnings.join(', ')}` : ''}`, count: got.length };
      if (warnings.length) (report.partial ??= []).push(ch.id);
    } catch (e) {
      if (e instanceof RobotsClosedError) {
        silent('robots.txt закрывает путь, канал «руками»');
      } else if (e instanceof LayoutChangedError) {
        report.channels[ch.id] = { status: 'layout', flag: 'вёрстка_изменилась', reason: 'вёрстка изменилась, проверь руками: страница пришла, заказов 0, признаков пустого списка нет', count: 0 };
        report.silent.push(ch.id);
      } else if (e instanceof BlockedError) {
        st.blocked_streak += 1;
        if (st.blocked_streak >= 2) st.blocked_until = new Date(nowMs + DAY_MS).toISOString();
        silent(`защита (HTTP ${e.status}), канал «руками» на этот запуск`);
      } else {
        silent(`ошибка: ${e.message}`);
      }
    }
  }

  const merged = mergeOrders(orders);
  const records = merged.map((r) => ({ ...r, ...evaluate(r, { profile }) }));
  report.collected = records.length;
  report.merged_duplicates = orders.length - merged.length;
  return { records, report, state: newState };
}
