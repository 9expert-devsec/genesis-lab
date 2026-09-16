/**
 * The Career Path CARD feed: one card per active career path, for the chat
 * widget's career-path card type. Read-only. The survey it follows is
 * docs/career-path-chat-card-phase-a.md (§A1 the source, §B4 the fields,
 * §B5 the price, §D10 why it is a sibling of /api/corpus/masterclass-cards).
 *
 * ── THE SAME ROWS, THE SAME ORDER AS /career-path-project ──────────────────
 *   rows    getActiveCareerPaths() — `is_active: true`, sorted by genesis
 *           `display_order`, the listing's own selector. NEVER MSDB's
 *           `sortOrder` (it puts Business Analytics first; the site does not).
 *   slug    the BARE slug — `api_slug` minus its `-career-path` suffix. The
 *           repo has no helper for this direction (the detail page strips it
 *           inline, CareerPathDetail.jsx PriceSummary), so it is derived here.
 *   url     CORPUS_PUBLIC_ORIGIN + careerPathHref(api_slug) — the site's own
 *           idempotent builder, so the suffix appears exactly once.
 *   image   `hero_image_url` raw, as both the listing card and the detail
 *           hero render it (raw <img>, no transform, no helper).
 *   courses `curriculum[].items[].snap` in path order — `{ code, name }`
 *           only; no course URL, no per-course price, no group structure.
 *
 * ── PRICE: WHAT PriceSummary RENDERS, FROM THE SAME FIELDS ─────────────────
 * The detail page (CareerPathDetail.jsx PriceSummary) reads MSDB's stored
 * `price` object raw — there is no resolver and no clock:
 *   shown at all     price && (price.fullPrice || price.salePrice)
 *   headline (sale)  price.salePrice ?? price.fullPrice
 *   struck (full)    price.fullPrice, only when salePrice < fullPrice
 *   "ลด X%"          price.discountPct ?? 0, under the same condition
 * `careerPathPrice` below is that logic and nothing more. Two live rows carry
 * internally inconsistent numbers (Accounting & Finance: full 39,000 vs a
 * sale price derived from 39,800; RPA Developer: 43,800 ≠ 0.85 × 51,600).
 * They are served AS THE PAGE SHOWS THEM — the card must not say a different
 * price from the page it links to.
 *
 * ── NEVER EMITTED ──────────────────────────────────────────────────────────
 * registrations, `registrationOpen`, seats/capacity, the promotion conditions,
 * `links.outlineUrl` / `signupUrl`, `career_path_id`, course URLs.
 *
 * Every read is injectable (`deps`) for the test tier, as the sibling corpus
 * modules do; production callers pass nothing.
 */
import { CORPUS_PUBLIC_ORIGIN } from '@/lib/corpus/promotions';
import { careerPathHref } from '@/lib/utils';

const str = (v) => String(v ?? '').trim();
const text = (v) => (str(v) === '' ? null : str(v));

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** `'data-analyst-career-path'` → `'data-analyst'`; an already-bare slug is unchanged. */
export function bareCareerPathSlug(apiSlug) {
  return str(apiSlug).replace(/-career-path$/, '');
}

/**
 * The card's price block — exactly PriceSummary's reading of the stored
 * object (see the header). null when the page renders no price.
 */
export function careerPathPrice(price) {
  if (!price || typeof price !== 'object') return null;
  const full = num(price.fullPrice);
  const sale = num(price.salePrice);
  // PriceSummary: `price && (price.fullPrice || price.salePrice)` — 0 counts as "no price".
  if (!full && !sale) return null;
  const struck = sale != null && full != null && sale < full;
  return {
    sale:             sale ?? full,
    full:             struck ? full : null,
    discount_percent: struck ? (num(price.discountPct) ?? 0) : null,
  };
}

/** The path's course snaps, in curriculum order, as `{ code, name }`; items with neither are skipped. */
export function careerPathCourses(curriculum) {
  const out = [];
  for (const group of Array.isArray(curriculum) ? curriculum : []) {
    for (const item of Array.isArray(group?.items) ? group.items : []) {
      const snap = item?.snap ?? {};
      const code = text(snap.code) ?? text(item?.course_id);
      const name = text(snap.name) ?? text(item?.externalName);
      if (code === null && name === null) continue;
      out.push({ code: code ?? '', name: name ?? '' });
    }
  }
  return out;
}

/** Pure: one active career_paths row → one card. */
export function careerPathCardItem(row) {
  const r = row ?? {};
  const courses = careerPathCourses(r.curriculum);
  return {
    slug:              bareCareerPathSlug(r.api_slug),
    title:             text(r.title) ?? '',
    short_description: text(r.short_description),
    hero_image_url:    text(r.hero_image_url),
    courses,
    course_count:      courses.length,
    url:               `${CORPUS_PUBLIC_ORIGIN}${careerPathHref(str(r.api_slug))}`,
    price:             careerPathPrice(r.price),
  };
}

// ── Default reader (the only code here that touches Mongo) ─────────────────

async function readActivePaths() {
  const { getActiveCareerPaths } = await import('@/lib/career-paths/getCareerPaths');
  return getActiveCareerPaths();
}

// ── The feed ───────────────────────────────────────────────────────────────

/**
 * @param {object} [deps]
 * @param {Function} [deps.readPaths]  () → active rows in display_order
 * @returns {Promise<{ items: object[] }>}  items in the listing's order
 */
export async function buildCareerPathCards({ readPaths = readActivePaths } = {}) {
  const rows = (await readPaths()) ?? [];
  return { items: rows.map(careerPathCardItem) };
}
