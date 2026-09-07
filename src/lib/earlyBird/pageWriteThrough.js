/**
 * WHAT A PAGE'S EARLY BIRD BINDING BECOMES AS AN `EarlyBirdConfig` ROW.
 *
 * The course detail page cannot discover a promotion by scanning page sections
 * — it knows a course code and nothing about which page mentions it. So the
 * page save WRITES THROUGH to `EarlyBirdConfig`, which stays the read model,
 * untouched. Every existing reader (`getEarlyBirdByCourse`,
 * `getAllActiveEarlyBirdMap`, `isEarlyBird`, `EarlyBirdBanner`) keeps reading
 * exactly what it read before; this module only decides what gets written.
 *
 * ══ PURE, AND THAT IS THE POINT ════════════════════════════════════════════
 * No DB, no models, no actions, no `'use server'`. Its ONE import is the shared
 * visibility predicate. The orchestration — call this, then write or delete —
 * lives in the action layer where the session and the transaction already are.
 *
 * That split is not tidiness: `is_active` and `deadline` are DERIVED values
 * that decide whether a promotion appears on a public page, and a derivation
 * that can only be exercised through a server action with a database behind it
 * is a derivation nobody checks. Here every case is a function call.
 */

/**
 * ADDED as this module's only import. `isPubliclyVisible` is THE definition of
 * "is this page live right now" — status plus both ends of the publish window —
 * and it is already shared by the public route and the publish dialog.
 *
 * Deriving `is_active` from `status === 'published'` instead would be a SECOND
 * authority over page visibility, which is the exact shape lib/pageBuilder/
 * visibility.js exists to have removed: the admin list would say published, the
 * route would 404, and the two would disagree with nothing to report it. A
 * `scheduled` page inside its window is publicly visible and its Early Bird
 * must be too; a `published` page past `publishEndDate` is not.
 */
import { isPubliclyVisible } from '@/lib/pageBuilder/visibility';

/** A stored id/string as a comparable value. Absent, null and '' are one thing. */
const str = (v) => String(v ?? '').trim();

/** A stored date as epoch ms, or null for absent / null / '' / unparseable. */
function ms(value) {
  if (value == null || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Does this page hold a real Early Bird binding?
 *
 * THREE conditions, and each excludes a different way of holding nothing:
 *   · `pageType === 'promotion'` — `promotionKind` is meaningless anywhere else,
 *     exactly as `promotionId` / `promotionOrder` / `promotionCover` are. A page
 *     switched away from `promotion` must stop reserving its claim.
 *   · `promotionKind === 'early_bird'` — `bundle` and `none` bind nothing. This
 *     is what makes switching the kind away a RELEASE rather than a leak.
 *   · a non-empty `courseRef` — the binding is the ObjectId. A kind set with no
 *     course chosen yet is a half-filled form, not a claim on anything.
 *
 * `courseCode` is deliberately NOT one of these. It is a display cache, and a
 * binding whose cache is empty is still a binding.
 */
export function hasEarlyBirdBinding(page) {
  return (
    page?.pageType === 'promotion' &&
    page?.promotionKind === 'early_bird' &&
    str(page?.earlyBird?.courseRef) !== ''
  );
}

/**
 * The deadline to store: THE EARLIER of the author's own deadline and the end
 * of the page's publish window.
 *
 * ── WHY FOLD THEM AT ALL ──────────────────────────────────────────────────
 * A page that stops being public should stop advertising its Early Bird, and
 * there is no event at `publishEndDate` to make that happen — nothing runs at
 * that instant to flip a flag. But every read path already re-checks `deadline`
 * at READ time (`getEarlyBirdByCourse` returns null past it,
 * `getAllActiveEarlyBirdMap` filters on it, `isEarlyBirdSchedule` refuses on
 * it), so folding the window's end INTO the deadline makes the window close the
 * promotion with no read-path change at all. That is the whole trick, and it is
 * why this is a stored value rather than a new predicate somewhere.
 *
 * Either may be absent: with no author deadline the window's end becomes the
 * deadline, with no window the author's deadline stands alone, with neither the
 * answer is null — an Early Bird that runs until somebody stops it, which is
 * what `EarlyBirdConfig.deadline: null` has always meant.
 *
 * Returns a Date (or null) because that is what the column stores.
 */
export function earlyBirdDeadline(binding, page) {
  const candidates = [ms(binding?.deadline), ms(page?.publishEndDate)].filter(
    (t) => t !== null
  );
  if (!candidates.length) return null;
  return new Date(Math.min(...candidates));
}

/**
 * Is the written row ACTIVE — i.e. may the course page advertise it?
 *
 * TWO conditions, and they answer different questions:
 *   · the page is publicly visible RIGHT NOW (the shared predicate, see the
 *     import note). The claim is reserved the moment the page is saved; it is
 *     ADVERTISED only once the page is actually live.
 *   · the folded deadline has not passed.
 *
 * ── THE ACCEPTED GAP, STATED HERE SO IT IS NOT REDISCOVERED ───────────────
 * A page `scheduled` for the future is NOT publicly visible yet, so this is
 * false and the Early Bird does not appear on the course page. Nothing runs at
 * `publishStartDate` to flip it — the public route is ISR at 3600s and there is
 * no job — so the Early Bird begins when the page is actually published, not
 * when it was scheduled to be. This is a KNOWN limit, not an oversight, and the
 * settings panel says so in plain text next to the binding rather than implying
 * scheduling works. Do not build a workaround here; a writer that guessed at a
 * future start would advertise a promotion on a page nobody can open.
 */
export function earlyBirdIsActive(page, now = Date.now()) {
  if (!isPubliclyVisible(page, now)) return false;
  const deadline = earlyBirdDeadline(page?.earlyBird, page);
  return deadline === null || deadline.getTime() > now;
}

/**
 * The row a page's binding becomes, or `null` for "this page owns no Early
 * Bird" — which the caller turns into an owner-scoped delete rather than a
 * write. One function, so "should there be a row" and "what is in it" cannot be
 * answered inconsistently by two call sites.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────
 * `promotion_id`. It is LEGACY and read-only: promotions will be created on
 * Genesis itself and the MSDB id falls out of use. A page-side write that
 * carried the key at all — even as `''` — would stamp a new value over a legacy
 * holder's id and convert a legacy row into an unowned one as a side effect.
 * `earlyBirdUpdate` in ownership.js only writes an owner field when the caller
 * supplies the KEY, so omitting it here is what makes that guarantee real.
 *
 * `course_id` carries the CODE because that is what the column stores and what
 * every reader joins on. The caller passes it in rather than this function
 * choosing between the page's two identifiers — they are written together and
 * neither is derived from the other (see the schema's note), so there is no
 * "which is the truth" question for this function to answer.
 */
export function deriveEarlyBirdRow(page, courseCode, now = Date.now()) {
  if (!hasEarlyBirdBinding(page)) return null;
  const code = str(courseCode);
  if (!code) return null; // no code, nothing addressable — the caller reports it

  const binding = page.earlyBird ?? {};
  const price = binding.specialPrice;
  return {
    course_id:     code,
    owner_page_id: str(page?._id),
    schedule_id:   str(binding.scheduleId),
    label_th:      str(binding.labelTh) || 'Early Bird',
    // `!= null` rather than truthiness: 0 is a real price (a free course) and
    // must survive, which is the same call EarlyBirdConfig.special_price makes.
    special_price: price == null || price === '' ? null : Number(price),
    deadline:      earlyBirdDeadline(binding, page),
    is_active:     earlyBirdIsActive(page, now),
  };
}

/**
 * ── WHOSE PERMISSION IS IT? THE FIELD'S, NOT THE DOCUMENT'S ────────────────
 *
 * The Early Bird binding sets a COMMERCIAL PRICE and reserves a course against
 * every other page and promotion. Editing a page's heading does not. Gating the
 * whole page save on `promotions` would make a promotion page unsaveable by the
 * person who edits it; gating none of it would let page-edit rights set a price.
 * Neither is right, so the permission attaches to the FIELDS.
 *
 * This is the predicate that decides which kind of save is being attempted.
 * Pure, so the settings panel can ask the same question the action asks.
 *
 * ── THE COMPARISON IS OVER STORED FORM, NOT OBJECT IDENTITY ───────────────
 * `existing` comes from Mongo (`deadline` is a Date, absent keys are missing)
 * and `incoming` from a zod parse of a client patch (`deadline` is an ISO
 * string, every key present with a default). A deep-equal would call every save
 * a change and demand `promotions` for renaming a page. So each field is
 * compared in the form it is STORED in — dates as instants, everything else as
 * trimmed strings — and `null`, `''` and absent are one value throughout,
 * because that is what they mean on a row nobody has bound.
 *
 * `specialPrice` compares numerically with `0` preserved: 0 is a free course
 * and `null` is unset, and collapsing them would let a price be set to free
 * without the permission.
 */
const BINDING_FIELDS = ['courseRef', 'courseCode', 'scheduleId', 'labelTh'];

/** A field's stored form, as a comparable string. */
function fieldForm(binding, key) {
  if (key === 'deadline') {
    const t = ms(binding?.deadline);
    return t === null ? '' : String(t);
  }
  if (key === 'specialPrice') {
    const v = binding?.specialPrice;
    return v == null || v === '' ? '' : String(Number(v));
  }
  return str(binding?.[key]);
}

/**
 * Does this save CHANGE the binding — any of its six fields, or the kind?
 *
 * `promotionKind` counts, and it has to: switching away from `early_bird`
 * releases the claim and deletes the owned row, which is as much a commercial
 * act as setting the price was. A gate that watched only the six fields would
 * let page-edit rights delete an Early Bird by changing a dropdown.
 *
 * Absent `promotionKind` on either side reads as `'none'` — the schema default
 * — so a page stored before the field existed does not look like a change the
 * first time it is saved.
 */
export function bindingChanged(existing, incoming) {
  const kindOf = (p) => str(p?.promotionKind) || 'none';
  if (kindOf(existing) !== kindOf(incoming)) return true;
  const a = existing?.earlyBird ?? {};
  const b = incoming?.earlyBird ?? {};
  for (const key of [...BINDING_FIELDS, 'deadline', 'specialPrice']) {
    if (fieldForm(a, key) !== fieldForm(b, key)) return true;
  }
  return false;
}
