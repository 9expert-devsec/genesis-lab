/**
 * The admin-typed headline stats: their fields, their fallbacks, and the one
 * validator the /admin/about form and `saveAboutConfig` both run. Pure.
 *
 * Course and masterclass counts are NOT here — they are computed in
 * getSiteStats and nobody types them.
 */

/**
 * What the site shows until an admin saves real values. These are the literals
 * Home and About carried before the stats moved into AboutConfig (and setListed
 * is the Company Profile's "300+"), so the move itself changes nothing visible.
 */
export const FALLBACK_STATS = Object.freeze({
  organizations: 5000,
  setListed: 300,
  learners: 90000,
  followers: 700000,
  rating: 5.0,
});

/** Field order and Thai labels, shared by the admin form. */
export const STAT_FIELDS = Object.freeze([
  { key: 'organizations', label: 'องค์กร', kind: 'count' },
  { key: 'setListed', label: 'บริษัทจดทะเบียน (SET + mai)', kind: 'count' },
  { key: 'learners', label: 'ผู้เรียน', kind: 'count' },
  { key: 'followers', label: 'ผู้ติดตาม', kind: 'count' },
  { key: 'rating', label: 'คะแนนรีวิว (หน้าแรกเท่านั้น)', kind: 'rating' },
]);

const COUNT_RE = /^\d+$/;
const RATING_RE = /^\d(\.\d)?$/;

/**
 * Validate one field's raw form value. Empty means "not set" (null) — the
 * fallback stays in force — so saving the text fields alone never disturbs the
 * stats. Thousands separators are accepted for counts ("94,000").
 *
 * @returns {{ value: number|null, error?: string }}
 */
export function parseStatField(kind, raw) {
  const s = String(raw ?? '').trim().replace(/[,\s]/g, '');
  if (s === '') return { value: null };
  if (kind === 'rating') {
    if (!RATING_RE.test(s) || Number(s) > 5) {
      return { value: null, error: 'ต้องเป็นตัวเลข 0–5 ทศนิยมไม่เกิน 1 ตำแหน่ง' };
    }
    return { value: Number(s) };
  }
  if (!COUNT_RE.test(s)) return { value: null, error: 'ต้องเป็นจำนวนเต็มไม่ติดลบ' };
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return { value: null, error: 'ตัวเลขใหญ่เกินไป' };
  return { value: n };
}

/**
 * @param {Record<string, unknown>} raw  form values keyed by STAT_FIELDS keys
 * @returns {{ ok: boolean, stats: Record<string, number|null>, errors: Record<string, string> }}
 */
export function parseStatsInput(raw = {}) {
  const stats = {};
  const errors = {};
  for (const { key, kind } of STAT_FIELDS) {
    const { value, error } = parseStatField(kind, raw?.[key]);
    stats[key] = value;
    if (error) errors[key] = error;
  }
  return { ok: Object.keys(errors).length === 0, stats, errors };
}

/** Stored stats (possibly partial, possibly absent) → a complete set, per-field fallback. */
export function resolveStats(stored) {
  const out = {};
  for (const { key } of STAT_FIELDS) {
    const v = stored?.[key];
    out[key] = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : FALLBACK_STATS[key];
  }
  return out;
}
