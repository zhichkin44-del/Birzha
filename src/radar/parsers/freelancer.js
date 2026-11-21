// Freelancer.com: open JSON API, no login (checked 14.11.2026: HTTP 200, 50 projects, fresh, no captcha).
// Address: https://www.freelancer.com/api/projects/0.1/projects/active/?limit=50&full_description=true&job_details=true&sort_field=submitdate&query=<words>
// We take only language=en (the feed has ro/id too); nonpublic/deleted are skipped.
// Budget: fixed — the top of the range × exchange_rate (to the dollar, supplied by the API itself) × RUB_PER.USD; hourly projects (hourly) — budget unknown (it is an hourly rate, not the order price).
// The client (owner_id) is not stored. No result.projects → LayoutChangedError.
import { LayoutChangedError } from '../fetch.js';
import { scrubPersonal, RUB_PER, ageFrom } from './common.js';

const BASE = 'https://www.freelancer.com/projects/';

export function parseFreelancer(json, nowIso) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new LayoutChangedError();
  }
  const list = data?.result?.projects;
  if (!Array.isArray(list)) throw new LayoutChangedError();
  const out = [];
  const seen = new Set();
  for (const p of list) {
    if (!p?.id || seen.has(p.id) || p.deleted || p.nonpublic) continue;
    if (p.language && p.language !== 'en') continue;
    const title = scrubPersonal(p.title);
    if (!title) continue;
    seen.add(p.id);
    const skills = (p.jobs ?? []).map((j) => j.name).filter(Boolean).join(', ');
    const body = scrubPersonal(p.description || p.preview_description || '');
    let budget = null;
    let budgetRaw = null;
    const max = Number(p.budget?.maximum);
    if (p.type !== 'hourly' && Number.isFinite(max) && max > 0 && p.currency?.code) {
      const rate = Number(p.currency.exchange_rate);
      budget = Math.round(max * (Number.isFinite(rate) && rate > 0 ? rate : 1) * RUB_PER.USD);
      budgetRaw = `${max} ${p.currency.code}`;
    }
    const at = p.time_submitted ? p.time_submitted * 1000 : null;
    const bids = p.bid_stats?.bid_count;
    out.push({
      id: `flcom-${p.id}`,
      channel: 'flcom',
      url: BASE + p.seo_url,
      title,
      text: (skills ? `${skills}. ` : '') + (body || title),
      budget,
      budget_raw: budgetRaw,
      answers: Number.isFinite(bids) ? bids : null,
      age_hours: at ? ageFrom(at, nowIso) : null,
      posted_at: at ? new Date(at).toISOString() : null,
      deadline_days: null,
      collected_at: nowIso,
    });
  }
  return out;
}

export function parseFreelancerChecked(json, nowIso) {
  return parseFreelancer(json, nowIso);
}
