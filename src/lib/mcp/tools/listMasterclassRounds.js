/**
 * Tool 6 — `list_masterclass_rounds`.
 *
 * Masterclass batches (the Saturday workshops on /masterclass and
 * /masterclass/[slug]) were invisible to this server: `list_training_rounds`
 * reads the MSDB schedule only, and `list_live_promotions` shows a batch only
 * while its early bird is on, without dates. This lists every upcoming batch.
 *
 * ── THE SITE'S OWN READER, AND THE ObjectId JOIN ───────────────────────────
 * `deps.getPublishedMasterclasses` is lib/masterclass/getMasterclass.js's
 * listing reader, imported: `is_published` courses in `display_order`, with
 * their `open | full` batches attached by `course_id` ObjectId. A batch's
 * `course_slug` is a stale denormalised copy (`ai-content` where the course is
 * `mas-ai-dmc`) and is never read here; the URL is built from the COURSE's
 * slug. Draft and cancelled batches never reach this tool.
 *
 * ── ONE CLOCK ──────────────────────────────────────────────────────────────
 * The price is `resolveBatchPrice(batch, now)` at ONE `now` captured per call
 * (the reader stamps its own wall clock; the captured instant wins), and the
 * Bangkok day of that same instant decides "finished": a batch whose last day
 * is before today is never returned. Batch days are Bangkok calendar days via
 * siteDateParts — what /masterclass/[slug] shows a reader in Bangkok.
 *
 * ── NO SEAT COUNTS ─────────────────────────────────────────────────────────
 * `registered_count` has two maintenance schemes and is not trustworthy enough
 * to answer "how many left" with; `capacity` without it means nothing. Neither
 * is emitted. `status` (เปิดรับ / เต็ม, the site's own words via
 * lib/scheduleStatus) is the only availability signal.
 */

import { siteDateParts, siteTodayKey } from '@/lib/articlePublishTime';
import { resolveBatchPrice } from '@/lib/masterclass/getMasterclass';
import { McpToolError, SITE_ORIGIN, dropEmpty } from '@/lib/mcp/shape';
import { scheduleStatusLabel } from '@/lib/scheduleStatus';

export const LIST_MASTERCLASS_ROUNDS_DESCRIPTION =
  'List the upcoming rounds (batches) of 9Expert Masterclass courses — intensive one-day ' +
  'weekend workshops — optionally filtered by course and by date range. Each round gives ' +
  'the course title and code, the course page url on the 9Expert website, the round label, ' +
  'its training days (YYYY-MM-DD, Asia/Bangkok), the time, the venue, its status in the ' +
  'words the website uses — เปิดรับ (open) or เต็ม (full) — and its price: price.normal is ' +
  'the regular price, price.current is what a customer pays today, and while an early-bird ' +
  'price is on, price.is_early_bird is true and price.early_bird_until is when it ends. ' +
  'Prices are in Thai baht. Always quote the early-bird end date alongside the early-bird ' +
  'price. Rounds that have finished are never returned. To register, send the user to the ' +
  'round\'s course url; for a full round, point them to that same course url to see other ' +
  'rounds, and never construct or guess a link. This tool has no seat-availability data. ' +
  'If the user asks how many seats remain, say that information is not available here and ' +
  'point them to the course url from the results. Do not describe this as a company policy.';

export const LIST_MASTERCLASS_ROUNDS_LIMIT_DEFAULT = 20;
export const LIST_MASTERCLASS_ROUNDS_LIMIT_MAX = 50;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function assertDay(label, value) {
  if (value === undefined || value === null || value === '') return undefined;
  const s = String(value).trim();
  if (!ISO_DAY.test(s)) {
    throw new McpToolError(`${label} must be a date in YYYY-MM-DD form; received "${value}".`);
  }
  return s;
}

/** The Bangkok calendar day of an instant, `YYYY-MM-DD`, or null. */
function bangkokDay(value) {
  const p = siteDateParts(value);
  if (!p) return null;
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoOrNull(value) {
  if (value == null || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * @param {object} input
 * @param {string} [input.course]  slug or course_code, case-insensitive
 * @param {string} [input.from]    YYYY-MM-DD
 * @param {string} [input.to]      YYYY-MM-DD
 * @param {number} [input.limit]
 * @param {object} deps
 * @param {Function} deps.getPublishedMasterclasses () → published courses with `batches` (open|full)
 * @param {Function} [deps.now]                     () → Date; the ONE instant of this call
 */
export async function listMasterclassRounds(input, deps) {
  const { course = null, from = undefined, to = undefined, limit = LIST_MASTERCLASS_ROUNDS_LIMIT_DEFAULT } = input ?? {};
  const capped = Math.max(1, Math.min(Number(limit) || LIST_MASTERCLASS_ROUNDS_LIMIT_DEFAULT, LIST_MASTERCLASS_ROUNDS_LIMIT_MAX));
  const fromDay = assertDay('from', from);
  const toDay = assertDay('to', to);
  const now = deps.now ? deps.now() : new Date();
  const today = siteTodayKey(now);

  let courses = (await deps.getPublishedMasterclasses()) ?? [];
  if (course) {
    const wanted = String(course).trim().toLowerCase();
    courses = courses.filter(
      (c) => String(c?.slug ?? '').toLowerCase() === wanted || String(c?.course_code ?? '').toLowerCase() === wanted
    );
    if (courses.length === 0) {
      throw new McpToolError(
        `masterclass course not found: "${course}". Give a masterclass course slug or course code, ` +
          `or call this tool without a course to list every upcoming masterclass round.`
      );
    }
  }

  const rounds = [];
  for (const c of courses) {
    if (c?.is_published !== true) continue;
    for (const b of c.batches ?? []) {
      if (!['open', 'full'].includes(b?.status)) continue;
      const days = (b.dates ?? []).map((d) => bangkokDay(d?.date)).filter(Boolean).sort();
      if (days.length === 0) continue; // no placeable day — a data fault, not a round
      if (days[days.length - 1] < today) continue; // finished: never returned
      if (fromDay && days[days.length - 1] < fromDay) continue;
      if (toDay && days[0] > toDay) continue;

      const p = resolveBatchPrice(b, now);
      rounds.push(
        dropEmpty({
          course_title: c.title_th ?? null,
          course_code: c.course_code ?? null,
          url: c.slug ? `${SITE_ORIGIN}/masterclass/${c.slug}` : null,
          round: (b.batch_label && String(b.batch_label).trim()) || (b.batch_no != null ? `รุ่นที่ ${b.batch_no}` : null),
          dates: days,
          first_day: days[0],
          time: c.time_start && c.time_end ? `${c.time_start}–${c.time_end}` : null,
          venue: b.venue_name ?? null,
          status: scheduleStatusLabel(b.status),
          price: dropEmpty({
            normal: num(p.original_price),
            current: num(p.effective_price),
            is_early_bird: p.is_early_bird === true,
            early_bird_until: p.is_early_bird ? isoOrNull(p.early_bird_deadline) : null,
          }),
        })
      );
    }
  }

  rounds.sort((a, b) => String(a.first_day).localeCompare(String(b.first_day)));
  return {
    today,
    total_matched: rounds.length,
    returned: Math.min(rounds.length, capped),
    rounds: rounds.slice(0, capped),
  };
}
