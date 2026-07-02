/**
 * Read-side helpers for Masterclass — public and admin reads.
 * All writes go through API routes, never through these helpers.
 */
import { dbConnect } from '@/lib/db/connect';
import MasterclassCourse   from '@/models/MasterclassCourse';
import MasterclassBatch    from '@/models/MasterclassBatch';

function serialize(v) {
  return JSON.parse(JSON.stringify(v));
}

// ── Pricing helper (self-contained, no dependency on EarlyBirdConfig) ─────────
/**
 * Returns the effective price and type for a batch right now.
 * "early_bird" wins if:
 *   - early_bird_active is true AND
 *   - price_early_bird is set AND
 *   - early_bird_deadline is null OR still in the future
 */
export function resolveBatchPrice(batch) {
  const now = new Date();
  const ebActive =
    batch.early_bird_active &&
    batch.price_early_bird != null &&
    (batch.early_bird_deadline == null || new Date(batch.early_bird_deadline) > now);

  return {
    price_type:    ebActive ? 'early_bird' : 'normal',
    effective_price: ebActive ? batch.price_early_bird : batch.price_normal,
    original_price:  batch.price_normal,
    is_early_bird:   ebActive,
    early_bird_deadline: batch.early_bird_deadline ?? null,
  };
}

// ── Public reads ───────────────────────────────────────────────────────────────

/** All published courses + their open/full batches (for /masterclass listing). */
export async function getPublishedMasterclasses() {
  await dbConnect();
  const courses = await MasterclassCourse.find({ is_published: true })
    .sort({ display_order: 1 })
    .lean();

  const courseIds = courses.map((c) => c._id);
  const batches = await MasterclassBatch.find({
    course_id: { $in: courseIds },
    status:    { $in: ['open', 'full'] },
  })
    .sort({ batch_no: 1 })
    .lean();

  // Group batches by course_id string
  const batchMap = {};
  for (const b of batches) {
    const key = String(b.course_id);
    if (!batchMap[key]) batchMap[key] = [];
    batchMap[key].push({ ...b, ...resolveBatchPrice(b) });
  }

  return serialize(
    courses.map((c) => ({
      ...c,
      batches: batchMap[String(c._id)] ?? [],
    }))
  );
}

/** Single published course + all non-cancelled batches (for detail page). */
export async function getMasterclassBySlug(slug) {
  if (!slug) return null;
  await dbConnect();
  const course = await MasterclassCourse.findOne({
    slug,
    is_published: true,
  }).lean();
  if (!course) return null;

  const batches = await MasterclassBatch.find({
    course_id: course._id,
    status:    { $nin: ['draft', 'cancelled'] },
  })
    .sort({ batch_no: 1 })
    .lean();

  return serialize({
    ...course,
    batches: batches.map((b) => ({ ...b, ...resolveBatchPrice(b) })),
  });
}

// Per-course FAQ reads live in src/lib/local-faqs/getLocalFaqs.js.

// ── Admin reads ────────────────────────────────────────────────────────────────

export async function getAllMasterclassCourses() {
  await dbConnect();
  const docs = await MasterclassCourse.find({}).sort({ display_order: 1 }).lean();
  return serialize(docs);
}

export async function getMasterclassCourseById(id) {
  await dbConnect();
  const doc = await MasterclassCourse.findById(id).lean();
  return doc ? serialize(doc) : null;
}

export async function getBatchesByCourse(courseId) {
  await dbConnect();
  const docs = await MasterclassBatch.find({ course_id: courseId })
    .sort({ batch_no: 1 })
    .lean();
  return serialize(docs);
}

export async function getBatchById(id) {
  await dbConnect();
  const doc = await MasterclassBatch.findById(id).lean();
  return doc ? serialize(doc) : null;
}

/** Fetch multiple Instructor docs by their string _id array. */
export async function getInstructorsByIds(ids) {
  if (!ids?.length) return [];
  await dbConnect();
  const Instructor = (await import('@/models/Instructor')).default;
  const docs = await Instructor.find({ _id: { $in: ids } }).lean();
  return serialize(docs);
}
