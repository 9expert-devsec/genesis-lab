/**
 * The Masterclass CARD feed: one card per published Masterclass course, for
 * the chat widget's masterclass card type. Read-only. The survey it follows
 * is docs/masterclass-chat-card-phase-a.md (§A2 the image, §B4 the fields,
 * §B5 the price, §C8 why this is a sibling of /api/corpus/masterclass and
 * not a block on it).
 *
 * ── WHY A SIBLING, NOT NEW KEYS ON /api/corpus/masterclass ─────────────────
 * That route promises "course content only, nothing with a clock". A card
 * carries a price, which has a clock. Mixing a sync-time snapshot and a
 * per-request price in one payload is the "two clocks in one answer" defect
 * the corpus docs name, so the card feed is its own route, judged against
 * ONE `now` per request.
 *
 * ── THE SAME ROWS, THE SAME SELECTORS AS THE /masterclass LISTING ──────────
 * Nothing is re-implemented:
 *   rows        getPublishedMasterclasses() — `is_published`, `display_order`,
 *               and the open|full batches sorted by batch_no, exactly what
 *               the listing renders. Items keep that order.
 *   batch       `batches[0]` — the lowest-numbered open|full batch, which is
 *               the one MasterclassCard shows. Joined on the `course_id`
 *               ObjectId inside the selector; `course_slug` on a batch is
 *               stale and is never read.
 *   price       resolveBatchPrice(batch, now) — the listing's rule, re-judged
 *               against the request's `now` (the selector stamps the wall
 *               clock; the injected instant wins here).
 *   image       `cover_image_url` raw, as the listing card's <Image src>.
 *   level       MASTERCLASS_LEVEL_LABEL — the listing card's own mapping.
 *   instructors getInstructorsByIds, ordered by the course's `instructor_ids`.
 *   duration    the listing has no label helper (it prints days only), so the
 *               label is composed here: "<days> วัน · <hours> ชั่วโมง".
 *
 * ── NEVER EMITTED ──────────────────────────────────────────────────────────
 * seats / capacity / registered_count / a "full" state, batch status, the
 * countdown, licence terms, batch `course_slug`, batch dates. The standing
 * rulings (promotions-corpus-endpoint.md §1.3, masterclass-corpus-endpoint.md
 * §1) stand; the test file greps the whole payload for the forbidden words.
 *
 * Every read is injectable (`deps`) for the test tier, as the sibling corpus
 * modules do; production callers pass nothing.
 */
import { CORPUS_PUBLIC_ORIGIN } from '@/lib/corpus/promotions';
import { resolveBatchPrice } from '@/lib/masterclass/getMasterclass';
import { masterclassLevelLabel } from '@/lib/masterclass/levelLabel';

const str = (v) => String(v ?? '').trim();
const text = (v) => (str(v) === '' ? null : str(v));

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function iso(value) {
  if (value == null || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** "1 วัน · 7 ชั่วโมง"; either half alone when the other is unset; null when both are. */
export function durationLabel(days, hours) {
  const parts = [];
  if (num(days) !== null) parts.push(`${num(days)} วัน`);
  if (num(hours) !== null) parts.push(`${num(hours)} ชั่วโมง`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * The card's price block from ONE batch, judged against ONE `now`.
 * `normal_amount` and `early_bird_ends_at` are set ONLY while the early bird
 * is live — after it ends the buyer pays `price_normal` and there is nothing
 * to strike through. No batch → null (the card's ยังไม่เปิดรับสมัคร state).
 */
export function cardPrice(batch, now) {
  if (!batch) return null;
  const p = resolveBatchPrice(batch, now);
  const live = p.is_early_bird === true;
  return {
    amount:             num(p.effective_price),
    normal_amount:      live ? num(p.original_price) : null,
    early_bird:         live,
    early_bird_ends_at: live ? iso(p.early_bird_deadline) : null,
  };
}

/** Pure: one published course row (batches attached by the selector) + its instructors → one card. */
export function masterclassCardItem(course, { instructors = [], now = new Date() } = {}) {
  const c = course ?? {};
  const byId = new Map(instructors.map((i) => [str(i._id), i]));
  const ordered = (c.instructor_ids ?? []).map((id) => byId.get(str(id))).filter(Boolean);
  const batch = Array.isArray(c.batches) ? c.batches[0] : undefined;

  return {
    slug:            str(c.slug),
    title:           text(c.title_th),
    subtitle:        text(c.subtitle_th),
    cover_image_url: text(c.cover_image_url),
    instructors:     ordered.map((i) => text(i.name)).filter(Boolean),
    level_label:     text(masterclassLevelLabel(text(c.level))),
    duration_label:  durationLabel(c.duration_days, c.duration_hours),
    url:             `${CORPUS_PUBLIC_ORIGIN}/masterclass/${str(c.slug)}`,
    price:           cardPrice(batch, now),
  };
}

// ── Default readers (the only code here that touches Mongo) ────────────────
// Both are the listing page's own readers, imported.

async function readPublishedCourses() {
  const { getPublishedMasterclasses } = await import('@/lib/masterclass/getMasterclass');
  return getPublishedMasterclasses();
}

async function readInstructorRows(ids) {
  const { getInstructorsByIds } = await import('@/lib/masterclass/getMasterclass');
  return getInstructorsByIds(ids);
}

// ── The feed ───────────────────────────────────────────────────────────────

/**
 * @param {object} [deps]
 * @param {Date}     [deps.now]              the ONE instant every price is judged against
 * @param {Function} [deps.readCourses]      () → published course rows with `batches` attached
 * @param {Function} [deps.readInstructors]  (ids) → instructor rows
 * @returns {Promise<{ items: object[] }>}   items in the listing's order
 */
export async function buildMasterclassCards({
  now = new Date(),
  readCourses = readPublishedCourses,
  readInstructors = readInstructorRows,
} = {}) {
  const at = new Date(Number.isNaN(new Date(now).getTime()) ? Date.now() : new Date(now).getTime());
  const rows = (await readCourses()) ?? [];

  const items = [];
  for (const row of rows) {
    const instructors = (await readInstructors(row.instructor_ids ?? [])) ?? [];
    items.push(masterclassCardItem(row, { instructors, now: at }));
  }
  return { items };
}
