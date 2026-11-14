// Утренний список для Саши (PLAN §1): только «берём», сверху свежие; сверху строка состояния.
const FLAG_TEXT = {
  'нет_бюджета': 'нет бюджета',
  'уточнить': 'уточнить',
  'отвечать_с_10:00': 'отвечать с 10:00',
  'возможный_дубль': 'возможный дубль',
};

const age = (r) => (typeof r.age_hours === 'number' ? (r.age_hours < 1 ? `${Math.round(r.age_hours * 60)} мин` : `${Math.round(r.age_hours)} ч`) : 'возраст ?');

export function statusLine(report, manual = []) {
  const parts = [`собрано ${report.collected} заказов из ${Object.values(report.channels).filter((c) => c.status === 'ok').length} каналов`];
  const layout = Object.entries(report.channels).filter(([, c]) => c.flag === 'вёрстка_изменилась').map(([id]) => id);
  const quiet = report.silent.filter((id) => !layout.includes(id));
  const why = (id) => (report.channels[id]?.reason ?? '').replace(/^канал молчит: /, '');
  if (quiet.length) parts.push(`молчат: ${quiet.map((id) => (why(id) ? `${id} (${why(id)})` : id)).join(', ')}`);
  if (report.skipped?.length) parts.push(`не читали (интервал): ${report.skipped.join(', ')}`);
  if (report.partial?.length) parts.push(`частично: ${report.partial.map((id) => `${id} (${report.channels[id].reason.split('; ')[1]})`).join(', ')}`);
  if (layout.length) parts.push(`вёрстка изменилась, проверь руками: ${layout.join(', ')}`);
  if (manual.length) parts.push(`руками: ${manual.join(', ')}`);
  return parts.join('; ');
}

export function renderMorning(records, report, { manual = [] } = {}) {
  const take = records
    .filter((r) => r.verdict === 'берём')
    .sort((a, b) => (a.age_hours ?? Infinity) - (b.age_hours ?? Infinity));
  const lines = [statusLine(report, manual), ''];
  if (!take.length) lines.push('Сегодня подходящих заказов нет.');
  for (const r of take) {
    const flags = (r.flags ?? []).map((f) => FLAG_TEXT[f] ?? f);
    const budget = typeof r.budget === 'number' ? (r.budget_raw && !/RUB$/.test(r.budget_raw) ? `${r.budget_raw} (≈${r.budget} ₽)` : `${r.budget} ₽`) : 'бюджет не указан';
    lines.push(
      `- [${r.channels.join('+')}] ${r.title} · ${budget} · откликов: ${r.answers ?? '—'} · ${age(r)}` +
        (flags.length ? ` · ${flags.join(', ')}` : '') +
        `\n  ${r.reason}${r.url ? ` · ${r.url}` : ''}`,
    );
  }
  return lines.join('\n') + '\n';
}
