'use server';

/**
 * Server actions for the CoursePromoLink + EarlyBirdConfig collections.
 *
 * Reads used by the public course detail page are not auth-gated.
 * All mutations and admin-only reads require an authenticated admin session.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import CoursePromoLink from '@/models/CoursePromoLink';
import EarlyBirdConfig from '@/models/EarlyBirdConfig';
import Promotion from '@/models/Promotion';
import { requireAdmin } from '@/lib/actions/auth';
// ADDED beside the statements above rather than folded into one — the standing
// rule in this repo. These were `export const` IN THIS FILE, which is a build
// error: every export of a `'use server'` module must be an async function, and
// a non-async one took the whole app down (every route 500ing) while the suite
// stayed green, because the suite has no bundler. They live in a plain module
// now. Do NOT re-export them from here — a re-exported const is still a
// non-async export and brings the error straight back.
import { EB_CLAIMED, EB_NEEDS_ADOPTION, EB_PAGE_CLAIMED } from '@/lib/earlyBird/codes';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The ownership rule left this file for the same reason the
// codes did (a non-async export of a `'use server'` module is a build error)
// and for one more: a SECOND writer is coming — a promotion PAGE that writes
// through to this collection on save — and it cannot import a private function
// out of an action module. Retyping the rule there is the silent-overwrite
// defect returning in a second costume, so the rule is a module now. See
// lib/earlyBird/ownership.js for the four states and why the page wins.
import {
  earlyBirdUpdate,
  ownerFilter,
  resolveOwner,
} from '@/lib/earlyBird/ownership';
import {
  listSchedulesByCourse,
  PUBLIC_SCHEDULE_STATUSES,
} from '@/lib/api/schedules';

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function revalidateCourse(courseId) {
  const slug = String(courseId).toLowerCase();
  revalidatePath(`/${slug}-training-course`);
  revalidatePath(`/admin/courses/${courseId}`);
}

// ── CoursePromoLink ────────────────────────────────────────────────

/**
 * Public read — get active promo links for a course,
 * with Promotion data joined in.
 * Returns array of { link, promotion } objects.
 */
export async function getActiveCoursePromos(courseId) {
  if (!courseId) return [];
  await dbConnect();
  const links = await CoursePromoLink
    .find({ course_id: courseId, is_active: true })
    .sort({ display_order: 1 })
    .lean();
  if (!links.length) return [];

  const promoIds = links.map((l) => l.promotion_id);
  const promos = await Promotion
    .find({ promotion_id: { $in: promoIds }, is_active: true })
    .lean();
  const promoMap = Object.fromEntries(promos.map((p) => [p.promotion_id, p]));

  const combined = links
    .map((l) => ({ link: l, promotion: promoMap[l.promotion_id] ?? null }))
    .filter((r) => r.promotion !== null);

  // Display priority: pinned promotions first, then newest by start_date
  // (fall back to createdAt). The CoursePromoLink's `display_order` is
  // intentionally ignored here — pinning at the Promotion level is the
  // editorial signal, while display_order on the link is only used as a
  // tie-breaker within the admin tab.
  combined.sort((a, b) => {
    const aPinned = a.promotion.is_pinned ? 1 : 0;
    const bPinned = b.promotion.is_pinned ? 1 : 0;
    if (bPinned !== aPinned) return bPinned - aPinned;
    const aDate = new Date(a.promotion.start_date ?? a.promotion.createdAt ?? 0);
    const bDate = new Date(b.promotion.start_date ?? b.promotion.createdAt ?? 0);
    return bDate - aDate;
  });

  return serialize(combined);
}

/** Admin read — get all promo links for a course (active + inactive). */
export async function getAllCoursePromoLinks(courseId) {
  await requireAdmin('courses');
  await dbConnect();
  const links = await CoursePromoLink
    .find({ course_id: courseId })
    .sort({ display_order: 1 })
    .lean();
  return serialize(links);
}

export async function createCoursePromoLink(courseId, data) {
  await requireAdmin('courses');
  await dbConnect();
  try {
    const count = await CoursePromoLink.countDocuments({ course_id: courseId });
    await CoursePromoLink.create({
      course_id: courseId,
      promotion_id: data.promotion_id,
      schedule_ids: Array.isArray(data.schedule_ids)
        ? data.schedule_ids.filter(Boolean)
        : [],
      is_active: data.is_active !== false,
      display_order: count,
    });
    revalidateCourse(courseId);
    return { ok: true };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'โปรโมชันนี้ผูกกับหลักสูตรนี้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function updateCoursePromoLink(linkId, data) {
  await requireAdmin('courses');
  await dbConnect();
  const link = await CoursePromoLink.findById(linkId).lean();
  if (!link) return { ok: false, error: 'ไม่พบข้อมูล' };
  await CoursePromoLink.findByIdAndUpdate(linkId, {
    $set: {
      schedule_ids: Array.isArray(data.schedule_ids)
        ? data.schedule_ids.filter(Boolean)
        : [],
      is_active: data.is_active !== false,
    },
  });
  revalidateCourse(link.course_id);
  return { ok: true };
}

export async function deleteCoursePromoLink(linkId) {
  await requireAdmin('courses');
  await dbConnect();
  const link = await CoursePromoLink.findById(linkId).lean();
  if (!link) return { ok: false, error: 'ไม่พบข้อมูล' };
  await CoursePromoLink.findByIdAndDelete(linkId);
  revalidateCourse(link.course_id);
  return { ok: true };
}

export async function reorderCoursePromoLinks(courseId, orderedIds) {
  await requireAdmin('courses');
  await dbConnect();
  await CoursePromoLink.bulkWrite(
    orderedIds.map((id, i) => ({
      updateOne: { filter: { _id: id }, update: { $set: { display_order: i } } },
    }))
  );
  revalidateCourse(courseId);
  return { ok: true };
}

// ── EarlyBirdConfig ────────────────────────────────────────────────

/**
 * Public read — returns null if not active or deadline already passed.
 * Joins the linked Promotion doc as `promotion` so the banner has the
 * thumbnail and any other promo metadata in one round trip.
 */
export async function getEarlyBirdByCourse(courseId) {
  if (!courseId) return null;
  await dbConnect();
  const doc = await EarlyBirdConfig.findOne({
    course_id: courseId,
    is_active: true,
  }).lean();
  if (!doc) return null;
  if (doc.deadline && new Date(doc.deadline) < new Date()) return null;

  let promotion = null;
  if (doc.promotion_id) {
    promotion = await Promotion.findOne({ promotion_id: doc.promotion_id }).lean();
  }
  return serialize({ ...doc, promotion });
}

/**
 * Fetch every active, non-expired EarlyBird config in one query.
 * Returns a plain object keyed by uppercase course_id → schedule_id string.
 * Used by list pages (training-course, schedule) that render many courses
 * at once and would otherwise issue N round-trips for the per-course read.
 */
export async function getAllActiveEarlyBirdMap() {
  await dbConnect();
  const now = new Date();
  const docs = await EarlyBirdConfig.find({
    is_active: true,
    $or: [{ deadline: null }, { deadline: { $gt: now } }],
  })
    .select('course_id schedule_id')
    .lean();

  const map = {};
  for (const doc of docs) {
    if (doc.course_id && doc.schedule_id) {
      map[String(doc.course_id).toUpperCase()] = String(doc.schedule_id);
    }
  }
  return map;
}

/** Admin read — always returns (even if inactive/expired). */
export async function getEarlyBirdAdminByCourse(courseId) {
  await requireAdmin('courses');
  await dbConnect();
  const doc = await EarlyBirdConfig.findOne({ course_id: courseId }).lean();
  return serialize(doc);
}

// ── ONE COURSE, ONE EARLY BIRD ─────────────────────────────────────────────
//
// The rule, and the defect it closes. `saveEarlyBird` used to be a blind
// upsert filtered on `{ course_id }` alone, with `promotion_id` inside the
// `$set`. Saving an Early Bird for a course another promotion already held
// REPLACED that promotion's row — owner, label, price, deadline and schedule —
// with no error, no confirmation and no trace. Nothing anywhere warned, and
// there is no audit write on this path, so the overwrites were unrecoverable.
//
// THREE OUTCOMES, not two. A UI check on top of an upserting writer is a sign,
// not a rule, so the refusal lives here and the screens only mirror it:
//
//   free      — no row for this course        → write
//   unowned   — a row with no promotion_id    → ADOPTABLE, but only on an
//                                               explicit `adopt`, because
//                                               taking ownership must never be
//                                               a side effect of saving
//   held      — a row owned by ANOTHER        → REFUSED, naming the holder
//
// An unowned row is adopted rather than refused on purpose: refusing would
// strand it, since a course claimed by nobody would appear in no promotion and
// could only be freed from the course's own tab — the tedium this round exists
// to remove.
//
// ── THE RULE ITSELF NOW LIVES IN lib/earlyBird/ownership.js ────────────────
// `earlyBirdUpdate`, the discriminator and the guarded filter were private
// functions of this file. They are imported above instead, unchanged, because a
// second writer (a promotion PAGE writing through on save) cannot reach a
// private function here and would have retyped them. This block stays as the
// argument for the rule; the rule is next door, and its header carries the
// four states the extraction adds room for.

/** Resolve a promotion's title for a message. Falls back to the bare id. */
async function promotionTitle(promotionId) {
  if (!promotionId) return '';
  const promo = await Promotion
    .findOne({ promotion_id: promotionId })
    .select('title')
    .lean();
  return promo?.title || promotionId;
}

/**
 * ── `forPage` ADDS THE WAY OUT, AND ONLY WHERE IT IS NEEDED ───────────────
 * All four live rows are `legacy_owned`, so a page author binding an Early Bird
 * meets THIS refusal first — and a bare "already claimed" reads as a bug when
 * the author can see no promotion anywhere on their page. The extra sentence
 * names the holder as an MSDB promotion and says the row must be released from
 * that promotion's Early Bird screen before a page can take it.
 *
 * The promotion→promotion wording is UNCHANGED, deliberately. That refusal is
 * rendered by two existing screens today, the plan says this state's handling
 * is unchanged from today, and the added sentence would be wrong there anyway:
 * an author refused by another promotion is already standing on the promotion
 * screen the sentence would send them to.
 */
async function claimedRefusal(courseId, holderId, { forPage = false } = {}) {
  const title = await promotionTitle(holderId);
  const base = `หลักสูตร ${courseId} อยู่ใน Early Bird ของ «${title}» แล้ว — ` +
    'หนึ่งหลักสูตรมีได้เพียง Early Bird เดียว';
  return {
    ok: false,
    code: EB_CLAIMED,
    error: forPage
      ? `${base} โปรโมชันนี้อยู่ในระบบ MSDB — ต้องปลดหลักสูตรออกจาก ` +
        'Early Bird ของโปรโมชันนั้นก่อน หน้าเพจจึงจะผูกหลักสูตรนี้ได้'
      : base,
    claim: { course_id: courseId, promotion_id: holderId, promotion_title: title },
  };
}

/**
 * The course is held by ANOTHER Genesis page. Its own refusal because the way
 * out is a different place — that page's settings, not a promotion screen — and
 * a code that cannot tell the two apart makes every screen guess which one it
 * is showing. See lib/earlyBird/codes.js.
 *
 * The holder is named as a page id rather than a title: resolving it to a page
 * name means a PageBuilder read from inside the Early Bird actions, and this
 * module has no business importing the page model to write a sentence. The
 * page-side surface that renders this already knows its own pages.
 */
function pageClaimedRefusal(courseId, holderPageId) {
  return {
    ok: false,
    code: EB_PAGE_CLAIMED,
    error: `หลักสูตร ${courseId} ถูกผูกไว้กับหน้าโปรโมชันอื่นแล้ว — ` +
      'ต้องยกเลิกการผูกในหน้านั้นก่อน จึงจะย้ายมาที่หน้านี้ได้',
    claim: { course_id: courseId, owner_page_id: holderPageId, promotion_id: '' },
  };
}

/**
 * Who holds this course's Early Bird, if anyone.
 *
 * Runs in TWO places, and they are not the same thing. The SCREENS call it
 * before the author commits, so a claimed course can be named up front — that
 * use is advisory and nothing rests on it. The WRITER below calls it as the
 * actual refusal, because two admins can race the screen's check.
 */
export async function getEarlyBirdClaim(courseId) {
  await requireAdmin('courses');
  return readEarlyBirdClaim(courseId);
}

/** The claim read itself, un-gated — every exported caller gates first. */
async function readEarlyBirdClaim(courseId) {
  if (!courseId) return { status: 'free', owner: 'free', course_id: courseId, config: null };
  await dbConnect();
  const doc = await EarlyBirdConfig.findOne({ course_id: courseId }).lean();
  if (!doc) return { status: 'free', owner: 'free', course_id: courseId, config: null };

  /**
   * ── THE CLAIM'S VOCABULARY STAYS THREE-VALUED, DELIBERATELY ──────────────
   * `resolveOwner` answers with FOUR states; this claim reports three, and the
   * mapping is a decision rather than a loss. `free` / `unowned` / `held` is
   * what `EarlyBirdTab`'s ClaimNotice and `PromotionEarlyBirdClient` branch on,
   * and widening it here would change what every existing screen renders for a
   * concern neither of them has yet. A page-owned row IS held — by a page
   * instead of a promotion — so it maps to `held`, which is the true answer to
   * the only question these screens ask: may I take this course?
   *
   * `owner_page_id` rides along beside it so the page-side surfaces of the next
   * round can tell the two holders apart WITHOUT a second read. It is `''` for
   * every row today (the field does not exist yet), so nothing changes.
   */
  const owner = resolveOwner(doc);
  if (owner === 'unowned') {
    return {
      status: 'unowned',
      owner,
      course_id: courseId,
      promotion_id: '',
      owner_page_id: '',
      promotion_title: '',
      config: serialize(doc),
    };
  }
  const holder = String(doc.promotion_id ?? '').trim();
  return {
    status: 'held',
    owner,
    course_id: courseId,
    promotion_id: holder,
    owner_page_id: String(doc.owner_page_id ?? '').trim(),
    promotion_title: await promotionTitle(holder),
    config: serialize(doc),
  };
}

/**
 * The single writer. Both screens funnel here, so neither carries a copy of
 * the rule and both get the same refusal.
 *
 * `data.adopt === true` is the author's explicit consent to take an unowned
 * row. It is NOT a licence to rewrite that row's other fields — the callers
 * carry the existing values into their form so an ownership change cannot ride
 * a silent edit in with it.
 *
 * ── A CALLER IDENTIFIES ITSELF AS EXACTLY ONE KIND OF OWNER ───────────────
 * `data.owner_page_id` marks a PAGE caller, `data.promotion_id` a PROMOTION
 * one. Both live callers today supply the second and never the first, so
 * `isPageCaller` is false throughout the existing suite and every branch below
 * reduces to the code that was here before.
 *
 * The four states and what each does, per caller kind:
 *
 *                    page caller                    promotion caller
 *   free             write                          write
 *   unowned          adopt (needs `adopt: true`)    adopt (needs `adopt: true`)
 *   legacy_owned     REFUSED + the way out (D4)     REFUSED (unchanged wording)
 *   page_owned       same page writes, else REFUSED REFUSED
 *
 * `page_owned` is checked FIRST in both columns, because a row can carry both
 * owner fields — that is what adopting a released legacy row produces — and the
 * page is the owner when it does. Reading `promotion_id` first would let a
 * promotion save walk into a row a page owns and name the wrong holder in the
 * refusal.
 */
async function writeEarlyBird(courseId, data) {
  await dbConnect();
  const incoming = String(data?.promotion_id ?? '').trim();
  const incomingPage = String(data?.owner_page_id ?? '').trim();
  const isPageCaller = Boolean(incomingPage);
  const claim = await readEarlyBirdClaim(courseId);

  /**
   * ── TWO REFUSALS, AND NEITHER IS REDUNDANT ─────────────────────────────────
   * MEASURED: breaking this read alone reddens nothing, and breaking the
   * guarded filter alone reddens only a source probe — each covers for the
   * other under test, because the fake has both. That looks like redundancy and
   * is not, because they fail in different worlds:
   *
   *   · this READ is the only refusal if `course_id`'s unique index is missing
   *     from the PRODUCTION collection. Mongoose `unique: true` builds an index
   *     only via autoIndex.
   *
   *     PREMISE RESOLVED — it used to say "that it exists on the deployed
   *     collection has NOT been verified here". It has been now: the live
   *     collection carries `course_id_1` with `unique: true`, read directly off
   *     it. So the E11000 path below is a real second refusal rather than a
   *     hoped-for one.
   *
   *     THAT DOES NOT MAKE THIS READ COLLAPSIBLE, and the reason is the next
   *     bullet rather than the index: the two fail in different worlds, and
   *     only one of those worlds was about the index.
   *   · the E11000 below is the only refusal when two admins race, because this
   *     read is already stale by the time the write lands. Conversely this read
   *     is the only thing that can tell the FOUR states apart and return the
   *     right code — a duplicate-key error says "taken" and cannot say by whom
   *     or how to get it back.
   */
  /**
   * `page_owned` FIRST, for both caller kinds. A row carrying both owner fields
   * belongs to its page, and the checks below read `promotion_id`, so an
   * unordered version would hand a promotion caller a refusal naming `''`.
   */
  if (claim.owner === 'page_owned' && claim.owner_page_id !== incomingPage) {
    return pageClaimedRefusal(courseId, claim.owner_page_id);
  }
  if (claim.owner === 'legacy_owned' && (isPageCaller || claim.promotion_id !== incoming)) {
    return claimedRefusal(courseId, claim.promotion_id, { forPage: isPageCaller });
  }
  if (claim.status === 'unowned' && incomingPage && data?.adopt !== true) {
    return {
      ok: false,
      code: EB_NEEDS_ADOPTION,
      error: `หลักสูตร ${courseId} มี Early Bird อยู่แล้วแต่ยังไม่ได้ผูกกับเจ้าของใด — ` +
        'ยืนยันเพื่อย้ายมาอยู่ใต้หน้าเพจนี้',
      claim,
    };
  }
  if (claim.status === 'unowned' && incoming && data?.adopt !== true) {
    return {
      ok: false,
      code: EB_NEEDS_ADOPTION,
      error: `หลักสูตร ${courseId} มี Early Bird อยู่แล้วแต่ยังไม่ผูกโปรโมชัน — ` +
        'ยืนยันเพื่อย้ายมาอยู่ใต้โปรโมชันนี้',
      claim,
    };
  }

  /**
   * THE GUARDED WRITE — the belt to the read's braces.
   *
   * The filter names the course AND the only owners this save may edit, so the
   * three cases fall out of one atomic call: a missing row upserts, a row we
   * own (or that nobody owns) updates, and a row another promotion holds MISSES
   * — which sends the upsert down the insert path, straight into `course_id`'s
   * unique index. That E11000 is the refusal surviving the race the read above
   * cannot see, because it is the database refusing rather than a check that
   * ran a moment ago.
   *
   * The `''` in the filter is the schema default and every write here sets it,
   * so an unowned row is `''` rather than missing.
   *
   * The `$or` is BUILT by `ownerFilter` rather than written here, so the second
   * writer asks the database the same question this one does. For a promotion
   * caller it returns exactly the array this line always held —
   * `[{ promotion_id: '' }, { promotion_id: <incoming> }]` — which is what makes
   * the extraction behaviour-identical. See ownership.js for the page branch and
   * for the one race it deliberately leaves open until a page writer exists.
   */
  try {
    await EarlyBirdConfig.findOneAndUpdate(
      {
        course_id: courseId,
        $or: ownerFilter({ pageId: incomingPage, promotionId: incoming }),
      },
      { $set: earlyBirdUpdate(data), $setOnInsert: { course_id: courseId } },
      { upsert: true, new: true, runValidators: true }
    );
  } catch (err) {
    if (err?.code === 11000) {
      /**
       * The race actually happened. Re-read so the refusal names whoever WON,
       * not whoever the stale pre-read saw — and answer with the code matching
       * the winner's KIND, because the two have different ways out. Falling
       * through to the promotion refusal for a page winner would send the
       * author to a promotion screen that has nothing to release.
       */
      const raced = await readEarlyBirdClaim(courseId);
      if (raced.owner === 'page_owned' && raced.owner_page_id !== incomingPage) {
        return pageClaimedRefusal(courseId, raced.owner_page_id);
      }
      return claimedRefusal(courseId, raced.promotion_id || incoming, {
        forPage: isPageCaller,
      });
    }
    throw err;
  }

  revalidateCourse(courseId);
  return { ok: true };
}

/**
 * The COURSE TAB's entry point — /admin/courses/<id> → EarlyBirdTab.
 *
 * Keeps `requireAdmin('courses')`. Its sibling on the promotion screen holds
 * the `promotions` key instead: two entry points onto one row with two
 * different gates, which is deliberate — each action asks for the permission
 * matching the door the author came through, and `pages` is a flat allowlist
 * with no implication between keys (lib/rbac/access.js). Neither gate is what
 * stops a cross-promotion write; `writeEarlyBird` is.
 */
export async function saveEarlyBird(courseId, data) {
  await requireAdmin('courses');
  return writeEarlyBird(courseId, data);
}

// ── The promotion side: /admin/promotions/<id>/early-bird ───────────────────
//
// A second VIEW of the same rows, not a second authority. Every write below
// funnels into `writeEarlyBird`, so the rule and its refusal are identical
// whichever screen the author came from.
//
// These hold `requireAdmin('promotions')` rather than `'courses'` — see the
// note on `saveEarlyBird`. Each one also verifies the row it touches actually
// belongs to THIS promotion before touching it, so holding the promotions key
// is not a licence to edit an arbitrary course's Early Bird.

/** Every Early Bird row this promotion owns, newest first. */
export async function getEarlyBirdsForPromotion(promotionId) {
  await requireAdmin('promotions');
  if (!promotionId) return [];
  await dbConnect();
  const docs = await EarlyBirdConfig
    .find({ promotion_id: String(promotionId) })
    .sort({ updatedAt: -1 })
    .lean();
  return serialize(docs);
}

/**
 * The ADVISORY check, for the screen's course picker.
 *
 * Nothing rests on it — it exists so an author is told a course is taken
 * before filling in a form, not to decide the write. `writeEarlyBird` refuses
 * independently, because two admins can race this.
 */
export async function getEarlyBirdClaimForPromotion(promotionId, courseId) {
  await requireAdmin('promotions');
  const claim = await readEarlyBirdClaim(courseId);
  // Relative to THIS promotion: a row we already own is not a claim to warn about.
  if (claim.status === 'held' && claim.promotion_id === String(promotionId)) {
    return { ...claim, status: 'mine' };
  }
  return claim;
}

/** The rounds an admin may attach — same list the course detail page shows. */
export async function getCourseRoundsForPromotion(courseObjectId) {
  await requireAdmin('promotions');
  if (!courseObjectId) return [];
  const res = await listSchedulesByCourse(courseObjectId, {
    status: PUBLIC_SCHEDULE_STATUSES,
  });
  return serialize(res?.items ?? []);
}

/**
 * Add or edit one course's Early Bird from the promotion screen.
 *
 * `promotionId` comes from the ROUTE, never from the form, so this cannot be
 * pointed at another promotion's set by a crafted payload.
 */
export async function savePromotionEarlyBird(promotionId, courseId, data) {
  await requireAdmin('promotions');
  if (!promotionId) return { ok: false, error: 'ไม่พบโปรโมชัน' };
  if (!courseId) return { ok: false, error: 'ยังไม่ได้เลือกหลักสูตร' };
  const result = await writeEarlyBird(courseId, {
    ...data,
    promotion_id: String(promotionId),
  });
  if (result.ok) revalidatePath(`/admin/promotions/${promotionId}/early-bird`);
  return result;
}

/**
 * Take a course OUT of this promotion without deleting its Early Bird.
 *
 * Distinct from deleting, and worded differently in the UI, because they are
 * different acts: this leaves the row configured and unowned — exactly the
 * state the course tab produces — while delete removes the Early Bird outright.
 */
export async function releaseEarlyBirdFromPromotion(promotionId, courseId) {
  await requireAdmin('promotions');
  await dbConnect();
  const updated = await EarlyBirdConfig.findOneAndUpdate(
    { course_id: courseId, promotion_id: String(promotionId) },
    { $set: { promotion_id: '' } },
    { new: true }
  );
  if (!updated) return { ok: false, error: 'ไม่พบ Early Bird ของหลักสูตรนี้ในโปรโมชันนี้' };
  revalidateCourse(courseId);
  revalidatePath(`/admin/promotions/${promotionId}/early-bird`);
  return { ok: true };
}

/** Delete this promotion's Early Bird for one course, row and all. */
export async function deletePromotionEarlyBird(promotionId, courseId) {
  await requireAdmin('promotions');
  await dbConnect();
  const { deletedCount } = await EarlyBirdConfig.deleteMany({
    course_id: courseId,
    promotion_id: String(promotionId),
  });
  if (!deletedCount) return { ok: false, error: 'ไม่พบ Early Bird ของหลักสูตรนี้ในโปรโมชันนี้' };
  revalidateCourse(courseId);
  revalidatePath(`/admin/promotions/${promotionId}/early-bird`);
  return { ok: true };
}
