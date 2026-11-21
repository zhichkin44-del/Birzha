// Duplicates (PLAN §4): an exact match becomes one record with several channels; a loose match is not merged, it is flagged.
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^а-яёa-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

/** Exact-duplicate key: title + first 200 characters of the text + budget. */
export function dedupeKey(o) {
  return [norm(o.title), norm(o.text).slice(0, 200), JSON.stringify(o.budget ?? null)].join('|');
}

const words = (o) => new Set(norm(`${o.title} ${o.text}`).split(' ').filter((w) => w.length > 3));
function similar(a, b) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size) >= 0.8;
}

/** Merges orders → records {…order, channels:[…], possible_duplicate?}. The first non-empty value wins. */
export function mergeOrders(orders) {
  const byKey = new Map();
  const records = [];
  for (const o of orders) {
    const key = dedupeKey(o);
    const hit = byKey.get(key);
    if (hit) {
      if (!hit.channels.includes(o.channel)) hit.channels.push(o.channel);
      for (const [k, v] of Object.entries(o)) {
        if ((hit[k] === null || hit[k] === undefined) && v !== null && v !== undefined) hit[k] = v;
      }
      continue;
    }
    const rec = { ...o, channels: [o.channel] };
    for (const other of records) {
      if (similar(other, rec)) {
        rec.possible_duplicate = true;
        other.possible_duplicate = true;
      }
    }
    byKey.set(key, rec);
    records.push(rec);
  }
  return records;
}
