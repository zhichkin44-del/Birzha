// Один запуск: по каналам → дубли → правила → записи + отчёт. Один сбой канала не останавливает остальные.
import { BlockedError } from './fetch.js';
import { mergeOrders } from './dedupe.js';
import { evaluate } from './rules.js';

const DAY_MS = 24 * 3600_000;

/**
 * @param {{id: string, load: () => Promise<object[]>}[]} channels
 * @param {{now?: string, state?: object}} opts  state: { [id]: {last_ok, blocked_streak, blocked_until} }
 */
export async function runChannels(channels, { now = new Date().toISOString(), state = {} } = {}) {
  const nowMs = Date.parse(now);
  const newState = JSON.parse(JSON.stringify(state));
  const report = { channels: {}, collected: 0, silent: [] };
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
      report.channels[ch.id] = { status: 'ok', flag: null, reason: `собрано ${got.length}`, count: got.length };
    } catch (e) {
      if (e instanceof BlockedError) {
        st.blocked_streak += 1;
        if (st.blocked_streak >= 2) st.blocked_until = new Date(nowMs + DAY_MS).toISOString();
        silent(`защита (HTTP ${e.status}), канал «руками» на этот запуск`);
      } else {
        silent(`ошибка: ${e.message}`);
      }
    }
  }

  const merged = mergeOrders(orders);
  const records = merged.map((r) => ({ ...r, ...evaluate(r) }));
  report.collected = records.length;
  report.merged_duplicates = orders.length - merged.length;
  return { records, report, state: newState };
}
