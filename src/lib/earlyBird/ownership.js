/**
 * WHO OWNS AN EARLY BIRD ROW — the discriminator, the guarded-write filter, and
 * the field set a save may touch. One vocabulary, read by every writer.
 *
 * ══ WHY IT IS A PLAIN MODULE, LIKE codes.js NEXT DOOR ══════════════════════
 *
 * These are not async functions, and `src/lib/actions/course-promos.js` — where
 * they used to live — opens with `'use server'`, where **every export must be an
 * async function**. A non-async export there is a BUILD ERROR that takes the
 * whole app down (every route 500s) while the suite stays green, because the
 * suite has no bundler. codes.js carries that story at length; this module is
 * its sibling for the same reason and under the same rule:
 *
 *   NO `'use server'`. NO `'use client'`. NO import of a module that has one.
 *
 * `test/fs/useServerExportsAsync.test.mjs` sweeps for the directive. This file
 * imports NOTHING at all, which is what keeps that guarantee cheap to hold.
 *
 * ══ WHY IT LEFT course-promos.js AT ALL ════════════════════════════════════
 *
 * A SECOND writer is coming: a promotion PAGE (a Page Builder page with
 * `pageType: 'promotion'`) will own an Early Bird row and write through to this
 * collection on save. That writer lives in `lib/actions/pageBuilder.js`, which
 * cannot import a private function out of another action module — so the rule
 * had to become importable or it would have been retyped, and a retyped
 * ownership rule is the silent-overwrite defect coming back wearing a second
 * costume. It is extracted BEFORE the second writer exists, deliberately, so
 * the move can be proven behaviour-identical against the one caller that exists
 * today rather than reviewed alongside a new feature.
 *
 * ══ THE FOUR STATES ════════════════════════════════════════════════════════
 *
 *   free          no row for this course              → plain insert
 *   unowned       a row owned by NOBODY               → adoptable, but only on
 *                                                       an explicit `adopt`
 *   legacy_owned  a row held by an MSDB promotion     → REFUSED, naming the
 *                                                       holder and the way out
 *   page_owned    a row held by a Genesis page        → the SAME page may
 *                                                       write; any other is
 *                                                       REFUSED
 *
 * `unowned` is adopted rather than refused for the reason the original rule
 * gives: refusing would STRAND the row, since a course claimed by nobody would
 * appear in no promotion and could only be freed from the course's own tab.
 *
 * ══ owner_page_id IS CHECKED FIRST AND WINS OUTRIGHT ═══════════════════════
 *
 * A row can carry BOTH — that is exactly what adopting a released legacy row
 * produces, because adoption sets `owner_page_id` and leaves `promotion_id`
 * untouched. When both are present the PAGE is the owner, and this order is the
 * whole of that decision. Reading them the other way round would make an
 * adopted row answer "legacy", and the page that owns it would then be refused
 * its own row.
 *
 * `promotion_id` is LEGACY and read-only going forward: promotions will be
 * created on Genesis itself and the MSDB id will fall out of use. Nothing here
 * writes a new value into it — see `earlyBirdUpdate` below, which only carries
 * it when a caller explicitly supplies one.
 *
 * Pure: no DB, no models, no React, no imports. Client-safe, so a settings
 * panel can predict a refusal before the author commits.
 */

/** The four states, in order of precedence. Exported so a caller can pin them. */
export const OWNER_STATES = ['free', 'unowned', 'legacy_owned', 'page_owned'];

/**
 * A stored id as a comparable string. ABSENT, `null` and `''` are one thing —
 * "nobody" — and the whole module rests on their being indistinguishable.
 *
 * This matters more than it looks: `owner_page_id` is a NEW field, so every row
 * stored before it existed reads it back ABSENT rather than `''`. Mongoose
 * defaults are not applied by `.lean()` and JSON serialisation drops `undefined`
 * keys, so absent is what a reader actually sees. A discriminator that only
 * handled `''` would call every legacy row's missing field a value.
 */
const idOf = (value) => String(value ?? '').trim();

/**
 * Which of the four states this stored row is in.
 *
 * `null`/`undefined` — no row — is `free`. That is not a defensive default: the
 * caller's `findOne` returns null for a course nobody has configured, and
 * "free" is the correct answer to it rather than a missing case.
 */
export function resolveOwner(doc) {
  if (!doc || typeof doc !== 'object') return 'free';
  if (idOf(doc.owner_page_id)) return 'page_owned';
  if (idOf(doc.promotion_id)) return 'legacy_owned';
  return 'unowned';
}

/** The page that owns this row, or `''`. */
export function ownerPageIdOf(doc) {
  return idOf(doc?.owner_page_id);
}

/** The MSDB promotion that holds this row, or `''`. */
export function ownerPromotionIdOf(doc) {
  return idOf(doc?.promotion_id);
}

/**
 * May this caller write this row? Pure, and the SAME question the guarded
 * filter below asks the database — stated once so the pre-read and the belt
 * cannot answer differently.
 *
 * A caller identifies itself by exactly one of `pageId` / `promotionId`.
 */
export function canWrite(doc, { pageId = '', promotionId = '' } = {}) {
  const state = resolveOwner(doc);
  if (state === 'free' || state === 'unowned') return true;
  if (state === 'page_owned') return ownerPageIdOf(doc) === idOf(pageId);
  return ownerPromotionIdOf(doc) === idOf(promotionId);
}

/**
 * The `$or` a guarded upsert filters on — the BELT to the pre-read's braces.
 *
 * ── WHY BOTH, AND WHY NEITHER IS REDUNDANT ─────────────────────────────────
 * The pre-read is already stale by the time the write lands, so two admins can
 * race it; this filter is what refuses the loser, by MISSING the row and
 * sending the upsert down the insert path into `course_id`'s unique index. That
 * E11000 is the database refusing rather than a check that ran a moment ago.
 * Conversely the pre-read is the only refusal if that index is ever absent from
 * a deployed collection. Do not collapse the two.
 *
 * ── THE PROMOTION BRANCH IS UNCHANGED, BYTE FOR BYTE ───────────────────────
 * `[{ promotion_id: '' }, { promotion_id: <incoming> }]` is exactly the array
 * this file inherited, and it stays exactly that. It does NOT also exclude
 * page-owned rows, and that gap is NAMED rather than closed here:
 *
 *   · A page-owned row carrying `promotion_id: ''` matches the first branch, so
 *     a RACING promotion-side save could take it. The pre-read refuses it
 *     (`page_owned` → EB_PAGE_CLAIMED), so only the race is open.
 *   · Closing it needs `owner_page_id` in the filter, and a row stored before
 *     that field existed does not carry the key — so the added clause would
 *     have to match a MISSING field. Real MongoDB does that with
 *     `{ $in: ['', null] }`; test/fakeDb.mjs's `$in` compares `String(actual)`,
 *     which makes an absent field the string `'undefined'` and matches nothing.
 *     The clause would therefore be green in production and RED across the
 *     existing fixtures, for a race no live caller can currently run.
 *
 * There is no page-side writer yet, so the race needs two writers and has one.
 * The clause lands with that writer, together with the fakeDb missing-field
 * case — one change, proven, instead of an unexercised branch shipped early.
 *
 * ── THE PAGE BRANCH IS CORRECT FOR MONGO AND NOT YET EXERCISED ─────────────
 * `{ $in: ['', null] }` is deliberate and is the form that matches an ABSENT
 * key as well as an empty one (a query for `null` matches missing fields). It
 * has no caller in this commit; `canWrite` above is what the page writer will
 * be proven against until it does.
 */
export function ownerFilter({ pageId = '', promotionId = '' } = {}) {
  const page = idOf(pageId);
  if (page) {
    return [
      { owner_page_id: page },
      { owner_page_id: { $in: ['', null] }, promotion_id: { $in: ['', null] } },
    ];
  }
  return [{ promotion_id: '' }, { promotion_id: idOf(promotionId) }];
}

/**
 * The field set a save may write. Everything else on the row is untouchable.
 *
 * ── NEITHER OWNER FIELD IS WRITTEN UNCONDITIONALLY ANY MORE ───────────────
 * `promotion_id` used to be in this object ALWAYS, including as `''`. That is
 * now wrong in two directions at once:
 *
 *   · A page-side save supplies no promotion, so the unconditional form would
 *     stamp `''` over a legacy holder's id — a NEW value written into a field
 *     that is legacy and read-only going forward. It would also silently
 *     convert a legacy row into an unowned one as a side effect of an unrelated
 *     save, which is the strand this rule exists to prevent.
 *   · Adoption must change the OWNER and nothing else. A row a page adopts
 *     keeps whatever `promotion_id` it had; rewriting it would make adoption a
 *     silent edit of a second field, and the "adoption changes ONLY the owner"
 *     guarantee would be false in a way no screen shows.
 *
 * So each owner field is carried ONLY when the caller supplies the key.
 *
 * `in` rather than a truthiness test, and that distinction is load-bearing:
 * `''` is a MEANINGFUL value a promotion caller sends — it is how the course
 * tab's no-promotion path spells "leave this unowned" — so dropping it on
 * falsiness would stop that path clearing a field it has always cleared, and
 * the existing "adoption is not required when NO promotion is being attached"
 * behaviour would change. Both live callers always send the key, so their
 * behaviour is byte-identical.
 *
 * `releaseEarlyBirdFromPromotion` and `deletePromotionEarlyBird` do NOT route
 * through here — they issue their own `$set` / `deleteMany` — so release still
 * clears `promotion_id` to `''` by its own hand, which is what makes a released
 * row `unowned` and therefore adoptable.
 */
export function earlyBirdUpdate(data) {
  const update = {
    schedule_id:   String(data?.schedule_id ?? '').trim(),
    label_th:      String(data?.label_th ?? 'Early Bird').trim() || 'Early Bird',
    special_price: data?.special_price ? Number(data.special_price) : null,
    deadline:      data?.deadline ? new Date(data.deadline) : null,
    is_active:     Boolean(data?.is_active),
  };
  if (data && 'promotion_id' in data) {
    update.promotion_id = String(data.promotion_id ?? '').trim();
  }
  if (data && 'owner_page_id' in data) {
    update.owner_page_id = String(data.owner_page_id ?? '').trim();
  }
  return update;
}
