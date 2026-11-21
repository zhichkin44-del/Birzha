// Reply packages (stage 6): radar orders with the "take it" verdict → text, price, term, works, questions.
// Sends nothing and logs in nowhere: the result is the file docs/replies/<date>.md, which Sasha reads and
// sends himself. No network. Run: node src/replies/build.js <orders.json|.jsonl> [--date YYYY-MM-DD] [--out file] [--first-client]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { budgetValue, BUDGET_MIN } from '../radar/rules.js';
import { findStopwords } from '../vitrina/stopwords.js';
import { TEMPLATES, detectKind, templateFor, compose, money, PITCH } from './templates.ru.js';

export const TEXT_MAX = 900;
export const DISCOUNT = 30; // Sasha's decision 13.11: 30 % for first clients
const TITLE_MAX = 60;
const WORKS = JSON.parse(readFileSync(new URL('../vitrina/works.json', import.meta.url), 'utf8')).works;

const roundTo100 = (n) => Math.round(n / 100) * 100;

function pickWorks(tpl, works) {
  const out = [];
  for (const tag of tpl.tags) {
    for (const w of works) {
      if (w.tag === tag && !out.some((x) => x.id === w.id)) out.push(w);
    }
  }
  return out.slice(0, 2).map((w) => ({
    id: w.id, tag: w.tag, title: w.title, link: w.link ?? null, pitch: PITCH[w.id] ?? '',
  }));
}

export function validatePackage(pkg, order) {
  const p = [];
  const stops = findStopwords(pkg.text);
  if (stops.length) p.push(`стоп-слова в тексте: ${stops.join(', ')}`);
  if (/[{}]/.test(pkg.text)) p.push('в тексте остался пропуск {…}');
  if (pkg.text.length > TEXT_MAX) p.push(`текст ${pkg.text.length} знаков, предел ${TEXT_MAX}`);
  if (pkg.price < BUDGET_MIN) p.push(`цена ${money(pkg.price)} ниже порога ${money(BUDGET_MIN)}`);
  const budget = budgetValue(order?.budget);
  if (budget !== null && pkg.price > budget) p.push(`цена ${money(pkg.price)} выше бюджета заказа ${money(budget)}`);
  if (pkg.works.length < 1 || pkg.works.length > 2) p.push(`работ из витрины ${pkg.works.length}, нужно 1–2`);
  if (!pkg.questions.length) p.push('нет вопросов заказчику');
  if (/скидк/i.test(pkg.text)) p.push('в тексте отклика про скидку не пишем — она уже в цене');
  return p;
}

/** One package. opts: {firstClient: false, works: showcase data}. Throws if the order is not "take it" or the budget is below the threshold. */
export function buildPackage(order, opts = {}) {
  const { firstClient = false, works = WORKS } = opts;
  if (order.verdict !== 'берём') {
    throw new Error(`a package is built only for "take it" orders; ${order.id} has verdict "${order.verdict}"`);
  }
  const budget = budgetValue(order.budget);
  if (budget !== null && budget < BUDGET_MIN) {
    throw new Error(`${order.id} budget ${money(budget)} is below ${money(BUDGET_MIN)} — the verdict must be "no"`);
  }

  const kind = detectKind(order);
  const tpl = templateFor(kind);
  const base = budget ?? tpl.defaultPrice;
  let price = base;
  let discount = null;
  if (firstClient) {
    const cut = roundTo100(base * (100 - DISCOUNT) / 100);
    if (cut >= BUDGET_MIN) { price = cut; discount = DISCOUNT; }
  }
  const termDays = typeof order.deadline_days === 'number' && order.deadline_days > 0 ? order.deadline_days : tpl.defaultDays;

  const notes = [];
  const title = String(order.title ?? '').replace(/[«»]/g, '').trim();
  const titleStops = findStopwords(title);
  const quotable = title && title.length <= TITLE_MAX && !titleStops.length && !/[{}]/.test(title);
  if (titleStops.length) notes.push('в названии заказа есть слова из стоп-списка — в отклике название не цитируется');
  else if (title.length > TITLE_MAX) notes.push('название заказа длинное — в отклике не цитируется');

  const picked = pickWorks(tpl, works);
  const pitches = picked.map((w) => w.pitch).filter(Boolean);
  const ctx = { tpl, titleQuote: quotable ? title : null, price, discount, termDays, pitches };
  let text = compose(ctx);
  while (text.length > TEXT_MAX && ctx.pitches.length) {
    ctx.pitches = ctx.pitches.slice(0, -1);
    notes.push('текст не влез в 900 знаков — убрана последняя работа из текста (в списке работ она осталась)');
    text = compose(ctx);
  }

  const pkg = {
    order_id: order.id,
    order_title: order.title ?? '',
    url: order.url ?? '',
    channel: order.channel ?? (order.channels ? order.channels.join(', ') : ''),
    budget: order.budget ?? null,
    kind,
    kind_label: tpl.label,
    text,
    price,
    price_note: budget === null ? 'бюджет не указан — цена по ориентиру шаблона, Саша подтверждает' : null,
    discount,
    term_days: termDays,
    works: picked,
    questions: [...tpl.questions],
    flags: [...(order.flags ?? [])],
    notes,
  };
  pkg.problems = validatePackage(pkg, order);
  return pkg;
}

/** All orders: "take it" → packages; the rest and failed ones → skipped with a reason. */
export function buildAll(orders, opts = {}) {
  const packages = [];
  const skipped = [];
  for (const o of orders) {
    if (o.verdict !== 'берём') {
      skipped.push({ id: o.id, title: o.title ?? '', reason: o.reason ?? `вердикт «${o.verdict}»` });
      continue;
    }
    try {
      packages.push(buildPackage(o, opts));
    } catch (e) {
      skipped.push({ id: o.id, title: o.title ?? '', reason: e.message });
    }
  }
  return { packages, skipped };
}

function budgetText(b) {
  if (typeof b === 'number') return money(b);
  if (b && typeof b === 'object') return `от ${money(b.min ?? 0)} до ${money(b.max ?? b.min ?? 0)}`;
  return 'не указан';
}

const FLAG_TEXT = {
  'нет_бюджета': 'нет бюджета',
  'уточнить': 'уточнить у заказчика',
  'отвечать_с_10:00': 'отправлять после 10:00 UTC+7',
  'возможный_дубль': 'возможный дубль',
};

export function renderMarkdown({ packages, skipped }, { date, firstClient = false } = {}) {
  const L = [];
  L.push(`# Пакеты откликов · ${date}`);
  L.push('');
  L.push('Готовит Kira. **Отправляет Саша** — руками, на площадке. Из этого файла ничего не уходит само.');
  L.push('');
  L.push(`Пакетов: ${packages.length} · пропущено: ${skipped.length} · скидка 30 % первым клиентам: ${firstClient ? 'включена (все пакеты ниже — для первого клиента)' : 'выключена'}.`);
  L.push('Перед отправкой: прочитать текст, убедиться, что цена и срок вас устраивают, ссылки на работы открыть самому (по сети они не проверялись).');
  packages.forEach((p, i) => {
    L.push('', '---', '', `## ${i + 1}. ${p.order_title}`, '');
    L.push(`- Заказ: ${p.url} · площадка: ${p.channel} · бюджет: ${budgetText(p.budget)}`);
    L.push(`- Шаблон: ${p.kind_label}`);
    L.push(`- Цена: **${money(p.price)}**${p.discount ? ` (со скидкой ${p.discount} %)` : ''} · срок: **${p.term_days} дн.**`);
    if (p.price_note) L.push(`- Внимание: ${p.price_note}`);
    const flags = p.flags.map((f) => FLAG_TEXT[f] ?? f);
    if (flags.length) L.push(`- Флаги радара: ${flags.join('; ')}`);
    for (const n of p.notes) L.push(`- Заметка: ${n}`);
    L.push(p.problems.length
      ? `- ⚠ **НЕ ОТПРАВЛЯТЬ, проверка не прошла:** ${p.problems.join('; ')}`
      : `- Проверка: стоп-слов нет, цена в пределах от ${money(BUDGET_MIN)} до бюджета, текст ${p.text.length} из ${TEXT_MAX} знаков`);
    L.push('', '**Текст отклика**', '');
    for (const line of p.text.split('\n')) L.push(`> ${line}`.trimEnd());
    L.push('', '**Работы из витрины**', '');
    for (const w of p.works) {
      const link = w.link?.url ? `${w.link.url}${w.link.checked === false ? ' (по сети не проверена)' : ''}` : 'ссылка ждёт Сашу';
      L.push(`- ${w.title} — ${link}`);
    }
    L.push('', '**Вопросы заказчику**', '');
    p.questions.forEach((q, j) => L.push(`${j + 1}. ${q}`));
  });
  if (skipped.length) {
    L.push('', '---', '', '## Пропущено (пакета нет)', '');
    for (const s of skipped) L.push(`- ${s.title || s.id} (${s.id}) — ${s.reason}`);
  }
  return `${L.join('\n')}\n`;
}

/** Build and write docs/replies/<date>.md (or file). Returns the path. */
export function writeReplies(orders, { dir = join('docs', 'replies'), date, firstClient = false, file } = {}) {
  const md = renderMarkdown(buildAll(orders, { firstClient }), { date, firstClient });
  const path = file ?? join(dir, `${date}.md`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, md);
  return path;
}

export function readOrders(path) {
  const raw = readFileSync(path, 'utf8');
  if (path.endsWith('.jsonl')) return raw.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  return JSON.parse(raw);
}

function main(argv) {
  const args = argv.slice(2);
  const input = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--date' && args[args.indexOf(a) - 1] !== '--out');
  const val = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  if (!input) {
    console.error('An orders file is required: node src/replies/build.js <orders.json|.jsonl> [--date YYYY-MM-DD] [--out file] [--first-client]');
    process.exit(2);
  }
  const date = val('--date') ?? new Date().toISOString().slice(0, 10);
  const path = writeReplies(readOrders(input), { date, firstClient: args.includes('--first-client'), file: val('--out') });
  console.log(`Готово: ${path}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv);

export { TEMPLATES };
