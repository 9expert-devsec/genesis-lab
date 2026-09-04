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

export const EB_CLAIMED = 'EB_CLAIMED';
export const EB_NEEDS_ADOPTION = 'EB_NEEDS_ADOPTION';

/** The field set a save may write. Everything else on the row is untouchable. */
function earlyBirdUpdate(data) {
  return {
    promotion_id:  String(data?.promotion_id ?? '').trim(),
    schedule_id:   String(data?.schedule_id ?? '').trim(),
    label_th:      String(data?.label_th ?? 'Early Bird').trim() || 'Early Bird',
    special_price: data?.special_price ? Number(data.special_price) : null,
    deadline:      data?.deadline ? new Date(data.deadline) : null,
    is_active:     Boolean(data?.is_active),
  };
}

/** Resolve a promotion's title for a message. Falls back to the bare id. */
async function promotionTitle(promotionId) {
  if (!promotionId) return '';
  const promo = await Promotion
    .findOne({ promotion_id: promotionId })
    .select('title')
    .lean();
  return promo?.title || promotionId;
}

async function claimedRefusal(courseId, holderId) {
  const title = await promotionTitle(holderId);
  return {
    ok: false,
    code: EB_CLAIMED,
    error: `หลักสูตร ${courseId} อยู่ใน Early Bird ของ «${title}» แล้ว — ` +
      'หนึ่งหลักสูตรมีได้เพียง Early Bird เดียว',
    claim: { course_id: courseId, promotion_id: holderId, promotion_title: title },
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
  if (!courseId) return { status: 'free', course_id: courseId, config: null };
  await dbConnect();
  const doc = await EarlyBirdConfig.findOne({ course_id: courseId }).lean();
  if (!doc) return { status: 'free', course_id: courseId, config: null };

  const holder = String(doc.promotion_id ?? '').trim();
  if (!holder) {
    return {
      status: 'unowned',
      course_id: courseId,
      promotion_id: '',
      promotion_title: '',
      config: serialize(doc),
    };
  }
  return {
    status: 'held',
    course_id: courseId,
    promotion_id: holder,
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
 */
async function writeEarlyBird(courseId, data) {
  await dbConnect();
  const incoming = String(data?.promotion_id ?? '').trim();
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
   *     only via autoIndex; that it exists on the deployed collection has NOT
   *     been verified here (production is read-only this round, and an index
   *     build is a write). Without the index there is no E11000, ever.
   *   · the E11000 below is the only refusal when two admins race, because this
   *     read is already stale by the time the write lands.
   *
   * PREMISE, to re-read if it changes: "the production unique index is
   * unverified". If it is ever confirmed present, this read becomes a fast path
   * rather than a safety property — and only then is collapsing to one
   * mechanism a real option.
   */
  if (claim.status === 'held' && claim.promotion_id !== incoming) {
    return claimedRefusal(courseId, claim.promotion_id);
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
   */
  try {
    await EarlyBirdConfig.findOneAndUpdate(
      {
        course_id: courseId,
        $or: [{ promotion_id: '' }, { promotion_id: incoming }],
      },
      { $set: earlyBirdUpdate(data), $setOnInsert: { course_id: courseId } },
      { upsert: true, new: true, runValidators: true }
    );
  } catch (err) {
    if (err?.code === 11000) {
      const raced = await readEarlyBirdClaim(courseId);
      return claimedRefusal(courseId, raced.promotion_id || incoming);
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
