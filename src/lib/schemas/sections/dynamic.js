import { z } from 'zod';
import { defineSection } from './base';

/**
 * §5.4 DYNAMIC sections (MVP — 4). These render live upstream data (courses,
 * schedules, bundles) at request time — the schema only bounds the QUERY
 * config, never the fetched data. The actual fetch + render is Phase 2.
 */

export const DYNAMIC_TYPES = ['course_selector', 'course_list', 'course_schedule', 'bundle_courses'];

// Admin picks a fixed set of courses to offer as a selector.
const courseSelectorContent = z.object({
  courseIds: z.array(z.string()).default([]),
  heading:   z.string().default(''),
}).passthrough();

// A list of courses. THREE sources (2C.2b widened the enum):
//   'manual'  — an AUTHORED reference: explicit `courseIds`, known at edit time,
//               so the canvas renders the REAL courses (2C.2a).
//   'skill'   — DERIVED: every public course under the skill id in `filter`.
//   'program' — DERIVED: every public course under the program id in `filter`.
// The derived sources are evaluated on the SERVER, at render time
// (listPublicCourses({skill|program})), so the published set is a function of
// when the page was last RENDERED — not of when it is viewed. Both public
// surfaces are ISR at `revalidate = 3600`, so that is up to an hour behind and
// is the same render for every visitor inside the window (round 63 §A.2; the
// editor's own label used to overstate this and was corrected with it). The
// canvas can only show an edit-time SAMPLE the published page won't match. That
// is the labelled exception argued in docs/page-builder-status.md §2C.2b (the
// Browser-pass-#2 precedent): the sample is honest ONLY because the editor labels
// it. `filter` is honoured only for the derived sources; `courseIds` only for
// 'manual'. The enum was narrowed to ['manual'] at 2C.2a so an unhonoured source
// couldn't be SET; 2C.2b honours 'skill'/'program', so widening is now correct.
// DB scan before this pass: 0 stored course_list sections, so nothing to migrate
// (widening is additive regardless — it can reject no stored doc).
const courseListContent = z.object({
  source:    z.enum(['manual', 'skill', 'program']).default('manual'),
  courseIds: z.array(z.string()).default([]), // honoured for source='manual'
  filter:    z.string().default(''),          // skill-id or program-id, for the derived sources
  limit:     z.number().int().min(0).default(0), // 0 = no cap
}).passthrough();

// Schedule table for a single course (2C.2b). `courseId` is the SHORT course code
// (e.g. MSE-AI), same author-facing convention as course_card — the resolver
// turns it into the MSDB ObjectId /schedules needs (§4.7 quirk at the edge).
// Its rows are derived at RENDER time (upcoming, open/nearly_full), bounded by
// the page's own 1-hour ISR window rather than by the visitor's clock, so it is
// canvas-FAKE like the derived course_list: the editor labels the sample. `limit`
// caps the number of upcoming sessions shown (0 = adapter default), honoured in
// resolveSectionData.
/**
 * ── ROUND 64: TWO MODES, AND WHY THE COUNT STAYS ───────────────────────────
 *
 * `source` says how the rows are CHOSEN, and it deliberately reuses the key name
 * and the word `course_list` already uses above, because 'manual' means the same
 * thing on both: the author named them.
 *
 *   'upcoming'  DERIVED — every upcoming round for the course, capped by
 *               `limit`. A STANDING instruction: it stays correct forever with
 *               no author intervention.
 *   'manual'    AUTHORED — exactly the rounds named in `roundIds`, in that
 *               order. A SNAPSHOT instruction: round 63 §A.5 measured a 51-day
 *               median to a round's first day, so a selection decays and has to
 *               be revisited.
 *
 * Both are wanted and the count is NOT being replaced (round 63 §E): of the
 * three `course_schedule` sections stored when this was measured, TWO carry
 * `limit: 1` — "show the next round" — and that is also precisely what round
 * 58's unbuilt `course_card.showRounds` needs. Deleting the count would orphan
 * it.
 *
 * Reusing the key `source` costs nothing elsewhere: `dataRefSignature` already
 * reads `c.source ?? ''` for EVERY data-backed type, this one included, so the
 * canvas already refetches when it changes and lib/pageBuilder/dataRefs.js does
 * not move. A new key name would have needed a line there.
 *
 * ── ABSENT MEANS 'upcoming', AND THAT IS THE WHOLE MIGRATION ───────────────
 * A `.lean()` read applies no Mongoose defaults and JSON drops `undefined`, so
 * every section stored before this field existed reads it back ABSENT — not as
 * its default (round 39, re-proved round 50). None of the stored three carries
 * `source`, so all three take the unchanged path. There is no backfill and no
 * write. Readers must test `=== 'manual'`, never `!== 'upcoming'`.
 *
 * `limit` is honoured ONLY under 'upcoming'. Under 'manual' the author has named
 * the rows, so a leftover cap must not silently shorten their list —
 * `assembleResolved` skips the slice there. The stored value is KEPT rather than
 * cleared so switching mode and back is lossless.
 *
 * ── WHAT A SNAPSHOT MAY REMEMBER, ENFORCED BY THE SCHEMA ───────────────────
 * `roundSnapshots` is the sidecar that lets the page still DRAW a chosen round
 * MSDB no longer returns — the author's rule: a chosen round is never silently
 * dropped. It is read ONLY for an id the live fetch did not return, never
 * beside it, so it cannot disagree with live data (round 63 §C.3). That is what
 * answers the "a stored copy goes stale invisibly" objection: 39 of 88 rounds
 * had their dates mutated in place, and every one of those rounds is still LIVE,
 * so the correction shows immediately.
 *
 * It carries `{id, dates, type}` and NOTHING ELSE. Round 63 §C.2: a stored
 * `status` is the seats-left signal, and 'เปิดรับ' on a round that filled is a
 * lie a visitor acts on; a stored `signup_url` is a link to a round that is not
 * there. Both are forbidden — so this one object is NOT `.passthrough()`, which
 * is the only deviation from the file's convention and is the point of it. Zod
 * STRIPS unknown keys by default, so a `status` written into a snapshot is
 * deleted at this boundary and can never reach a renderer. The prohibition is
 * executable rather than written down.
 */
const roundSnapshotShape = z.object({
  id:    z.string().default(''),
  dates: z.array(z.string()).default([]),
  type:  z.string().default(''),
}); // NOT .passthrough() — see above; the strip IS the guard.

const courseScheduleContent = z.object({
  courseId: z.string().default(''),
  limit:    z.number().int().min(0).default(0),
  source:   z.enum(['upcoming', 'manual']).default('upcoming'),
  roundIds: z.array(z.string()).default([]),          // honoured for source='manual'
  roundSnapshots: z.array(roundSnapshotShape).default([]),
}).passthrough();

// The courses that make up a bundle promo.
const bundleCoursesContent = z.object({
  courseIds: z.array(z.string()).default([]),
}).passthrough();

export const dynamicSectionSchemas = [
  defineSection('course_selector', courseSelectorContent),
  defineSection('course_list',     courseListContent),
  defineSection('course_schedule', courseScheduleContent),
  defineSection('bundle_courses',  bundleCoursesContent),
];
