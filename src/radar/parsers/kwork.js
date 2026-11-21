// Kwork listing page → orders in the common shape (DATA §2), same format as parsers/fl.js.
// The data is not in the markup but in JSON inside the page (window.stateData → key "wants"); checked against the real
// https://kwork.ru/projects?c=11 on 14.11.2026 (12 orders per page, "Разработка и IT" (development and IT) = category 11).
// Order fields: id, name, description, priceLimit (desired budget, "50000.00"), possiblePriceLimit (acceptable),
// kwork_count (number of offers), date_active ("2026-11-14 10:43:54", Moscow time), timeLeft.
// No "wants" key → LayoutChangedError ("layout changed"); "wants":[] → a genuinely empty list.
import { LayoutChangedError } from '../fetch.js';
import { decode } from './fl.js';

const BASE = 'https://kwork.ru';

/** Extracts the array after `"wants":`, respecting strings and brackets; no key or broken JSON → null. */
export function extractWants(html) {
  const key = html.indexOf('"wants":[');
  if (key < 0) return null;
  const start = key + '"wants":'.length;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) {
      try {
        const arr = JSON.parse(html.slice(start, i + 1));
        return Array.isArray(arr) ? arr : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const clean = (s) => decode(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** "2026-11-14 10:43:54" (Moscow, UTC+3) → ISO or null. */
const mskIso = (s) => {
  const m = String(s ?? '').match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 3, +m[5], +(m[6] ?? 0))).toISOString();
};

export function parseKwork(html, nowIso) {
  const wants = extractWants(html);
  if (!wants) return [];
  const nowMs = Date.parse(nowIso);
  const seen = new Set();
  const out = [];
  for (const w of wants) {
    if (w?.id == null || seen.has(w.id)) continue;
    const title = clean(w.name);
    if (!title) continue;
    seen.add(w.id);
    const posted = mskIso(w.date_active ?? w.date_create);
    // 14.11: the budget is the client's desired price (priceLimit); the acceptable one (possiblePriceLimit) is used only if there is no desired one
    const wanted = num(w.priceLimit);
    const budget = wanted !== null ? wanted : num(w.possiblePriceLimit);
    const answers = Number.isFinite(Number(w.kwork_count)) && w.kwork_count !== null && w.kwork_count !== '' ? Number(w.kwork_count) : null;
    out.push({
      id: `kwork-${w.id}`,
      channel: 'kwork',
      url: `${BASE}/projects/${w.id}`,
      title,
      text: clean(w.description) || title,
      budget,
      answers,
      age_hours: posted ? Math.max(0, Math.round(((nowMs - Date.parse(posted)) / 3600_000) * 100) / 100) : null,
      posted_at: posted,
      deadline_days: null,
      collected_at: nowIso,
    });
  }
  return out;
}

/** parseKwork + check: no "wants" key at all → LayoutChangedError; "wants":[] → [] (empty list). */
export function parseKworkChecked(html, nowIso) {
  if (!extractWants(html)) throw new LayoutChangedError();
  return parseKwork(html, nowIso);
}
