'use server';

/**
 * Server actions for the CareerPath collection.
 *
 * Reads are public; writes require an authenticated admin session.
 *
 * Mutations are dual-write: we hit MSDB first (it owns career-path
 * data — Genesis is a cache for fast public-page reads + admin UX)
 * and on success we upsert the same shape into our local Mongo so the
 * admin list reflects the change immediately, without waiting for the
 * webhook round-trip.
 */

import mongoose from 'mongoose';
import { revalidatePath, revalidateTag } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import CareerPath from '@/models/CareerPath';
import { requireAdmin } from '@/lib/actions/auth';
import { syncCareerPaths } from '@/lib/career-paths/syncCareerPaths';
import { msdbCreate, msdbUpdate, msdbDelete } from '@/lib/api/msdb-write';
import { getCourseByCode } from '@/lib/api/public-courses';
import { listSchedulesByCourse } from '@/lib/api/schedules';

function serialize(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

const ADMIN_PATH  = '/admin/career-paths';
const PUBLIC_PATH = '/career-path-project';

// ── cache busting ─────────────────────────────────────────────────
//
// Career paths surface in three places:
//   1. The admin list at /admin/career-paths
//   2. The public landing /career-path-project and individual
//      /[slug]-career-path detail pages (matched by /[...slug])
//   3. The site-wide header dropdown — rendered in the public layout
//      (PublicHeader fetches from Mongo on the server). When a path
//      is created/renamed/deleted, the nav must reflect it immediately;
//      revalidating just the page that triggered the action would not
//      bust the layout, so we revalidate the layout explicitly.
//
// Tags: `career-paths` is set by the read-side aiFetch adapter; busting
// it ensures any ISR-cached upstream list goes stale.
function bustCaches() {
  revalidateTag('career-paths');
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  revalidatePath('/(public)', 'layout');
  revalidatePath('/[...slug]', 'page');
  revalidatePath('/search');
}

// ── existing toggle / reorder / sync (preserved) ──────────────────

export async function toggleCareerPathActive(careerPathId, isActive) {
  await requireAdmin('career_paths');
  await dbConnect();

  if (!careerPathId) return { ok: false, error: 'Missing career_path_id' };

  await CareerPath.findOneAndUpdate(
    { career_path_id: careerPathId },
    { $set: { is_active: Boolean(isActive) } }
  );
  bustCaches();
  return { ok: true };
}

/**
 * Persist a new ordering. `orderedIds` is an array of career_path_id
 * values in the desired display order. Each row's display_order is set
 * to its index in the array.
 */
export async function updateCareerPathOrder(orderedIds) {
  await requireAdmin('career_paths');
  await dbConnect();

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'orderedIds must be a non-empty array' };
  }

  const ops = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { career_path_id: String(id) },
      update: { $set: { display_order: index } },
    },
  }));
  await CareerPath.bulkWrite(ops);
  bustCaches();
  return { ok: true };
}

export async function syncCareerPathsAction() {
  await requireAdmin('career_paths');
  const result = await syncCareerPaths();
  bustCaches();
  return result;
}

// ── CRUD (write-back to MSDB) ─────────────────────────────────────

function parseLines(formData, key) {
  return String(formData.get(key) ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build the MSDB payload from a FormData submitted by CareerPathForm.
 *
 * `courses` is the same list the form was rendered against — used to
 * resolve `course_id` strings into the `publicCourse` ObjectId refs
 * MSDB expects on curriculum items.
 */
function shapePayload(formData, courses) {
  // Map { course_id → ObjectId } for resolving curriculum items.
  const courseMap = Object.fromEntries(
    (courses || []).map((c) => [c.course_id, c._id])
  );

  let blocks = [];
  try {
    blocks = JSON.parse(String(formData.get('curriculum_json') ?? '[]'));
    if (!Array.isArray(blocks)) blocks = [];
  } catch {
    blocks = [];
  }

  const curriculum = blocks.map((block, idx) => {
    const items = Array.isArray(block?.items) ? block.items : [];
    return {
      kind:        block?.kind === 'choice' ? 'choice' : 'fixed',
      title:       String(block?.title ?? ''),
      description: String(block?.description ?? ''),
      chooseMin:   toNum(block?.chooseMin),
      chooseMax:   toNum(block?.chooseMax),
      sortOrder:   Number.isFinite(block?.sortOrder) ? block.sortOrder : idx,
      items: items.map((it) => {
        // Per-item prerequisites — admin-configured list of other
        // courses (by course_id code) that must be selected before this
        // item is pickable in the public registration form. MSDB ignores
        // unknown fields on write so we can ride this through alongside
        // the supported shape.
        const prereqs = Array.isArray(it?.prerequisites)
          ? it.prerequisites.map((c) => String(c)).filter(Boolean)
          : [];

        if (it?.kind === 'external') {
          return {
            kind:         'external',
            externalName: String(it?.externalName ?? ''),
            externalUrl:  String(it?.externalUrl ?? ''),
            publicCourse: null,
            note:         String(it?.note ?? ''),
            prerequisites: prereqs,
          };
        }
        // 'public' branch — drop items the admin half-filled (no course
        // picked) rather than send `publicCourse: null` and have MSDB
        // reject the doc. This is intentional: leaving stale empty
        // rows in the curriculum is worse than silently skipping.
        const ref = it?.course_id ? courseMap[it.course_id] : null;
        return ref
          ? {
              kind:         'public',
              publicCourse: ref,
              // Preserve the human-readable code alongside the ObjectId so
              // mongoSetFromMsdbItem can restore it from the MSDB response
              // without a reverse-lookup. MSDB ignores unknown fields on write.
              course_id:    String(it.course_id),
              note:         String(it?.note ?? ''),
              prerequisites: prereqs,
            }
          : null;
      }).filter(Boolean),
    };
  });

  // ensure slug ends with -career-path (MSDB stores the suffixed form)
  let slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  if (slug && !slug.endsWith('-career-path')) {
    slug = `${slug}-career-path`;
  }

  return {
    title:      String(formData.get('title') ?? '').trim(),
    slug,
    status:     String(formData.get('status') ?? 'offline'),
    isPinned:   formData.get('isPinned') === 'on',
    sortOrder:  toNum(formData.get('sortOrder')),
    cardDetail: String(formData.get('cardDetail') ?? ''),
    coverImage: {
      url: String(formData.get('coverImage_url') ?? ''),
      alt: String(formData.get('coverImage_alt') ?? ''),
    },
    roadmapImage: {
      url: String(formData.get('roadmapImage_url') ?? ''),
      alt: String(formData.get('roadmapImage_alt') ?? ''),
    },
    price: {
      fullPrice:   toNum(formData.get('price_fullPrice')),
      salePrice:   toNum(formData.get('price_salePrice')),
      discountPct: toNum(formData.get('price_discountPct')),
      currency:    String(formData.get('price_currency') ?? 'THB'),
    },
    links: {
      detailUrl:  String(formData.get('links_detailUrl')  ?? ''),
      signupUrl:  String(formData.get('links_signupUrl')  ?? ''),
      outlineUrl: String(formData.get('links_outlineUrl') ?? ''),
    },
    detail: {
      tagline:       String(formData.get('detail_tagline')     ?? ''),
      intro:         String(formData.get('detail_intro')       ?? ''),
      contentHtml:   String(formData.get('detail_contentHtml') ?? ''),
      objectives:    parseLines(formData, 'detail_objectives'),
      suitableFor:   parseLines(formData, 'detail_suitableFor'),
      prerequisites: parseLines(formData, 'detail_prerequisites'),
      benefits:      parseLines(formData, 'detail_benefits'),
    },
    curriculum,
  };
}

/**
 * Mirror the freshly-written MSDB item into Mongo so the admin list
 * shows the change immediately. We don't wait on the webhook because
 * the user is staring at the page expecting to see their save.
 *
 * `courses` (optional) — the same list the form rendered against
 * [{ _id, course_id }]. When provided we enrich curriculum items with
 * a `course_id` field so the edit-form can repopulate the course picker
 * without relying on MSDB populating `snap.code` (which it doesn't do
 * on the /api/ai write-back response).
 */
function mongoSetFromMsdbItem(item, courses, payloadCurriculum) {
  // MSDB strips unknown fields (strict Mongoose schema) and does NOT
  // populate snap.code on write-back responses — so item.curriculum
  // items never carry course_id after a POST/PUT round-trip.
  //
  // Strategy: prefer payloadCurriculum (the shapePayload output which
  // still has course_id intact) over item.curriculum. Fall back to
  // enriching item.curriculum via reverse ObjectId lookup only when
  // payloadCurriculum is not available (e.g. cron/webhook sync path).
  const objIdToCourseId = Object.fromEntries(
    (courses || []).map((c) => [String(c._id), c.course_id])
  );

  const sourceCurriculum = Array.isArray(payloadCurriculum)
    ? payloadCurriculum
    : (Array.isArray(item?.curriculum) ? item.curriculum : []);

  const curriculum = sourceCurriculum.map((block) => ({
    ...block,
    items: Array.isArray(block?.items)
      ? block.items.map((it) => {
          if (it?.kind !== 'public') return it;
          const course_id =
            it?.course_id ||
            it?.snap?.code ||
            objIdToCourseId[String(it?.publicCourse ?? '')] ||
            '';
          // Also rebuild snap from courses list so the public page
          // can render CourseSnapCard without needing a webhook sync.
          const courseData = (courses || []).find(
            (c) => c.course_id === course_id
          );
          const snap = it?.snap?.name
            ? it.snap  // already populated (webhook path) — keep it
            : courseData
              ? {
                  code:      courseData.course_id,
                  name:      courseData.course_name,
                  teaser:    courseData.course_teaser        ?? '',
                  days:      courseData.course_trainingdays  ?? 0,
                  hours:     courseData.course_traininghours ?? 0,
                  price:     courseData.course_price         ?? 0,
                  imageUrl:  courseData.course_cover_url     ?? '',
                  publicUrl: Array.isArray(courseData.website_urls)
                    ? courseData.website_urls[0] ?? ''
                    : '',
                }
              : (it?.snap ?? {});
          return { ...it, course_id, snap };
        })
      : [],
  }));

  return {
    api_slug:          String(item?.slug ?? ''),
    title:             String(item?.title ?? ''),
    short_description: String(item?.cardDetail ?? ''),
    tagline:           String(item?.detail?.tagline ?? ''),
    intro:             String(item?.detail?.intro ?? ''),
    description_html:  String(item?.detail?.contentHtml ?? ''),
    objectives:        Array.isArray(item?.detail?.objectives)    ? item.detail.objectives    : [],
    suitable_for:      Array.isArray(item?.detail?.suitableFor)   ? item.detail.suitableFor   : [],
    prerequisites:     Array.isArray(item?.detail?.prerequisites) ? item.detail.prerequisites : [],
    benefits:          Array.isArray(item?.detail?.benefits)      ? item.detail.benefits      : [],
    hero_image_url:    String(item?.coverImage?.url ?? ''),
    hero_image_alt:    String(item?.coverImage?.alt ?? ''),
    roadmap_image_url: String(item?.roadmapImage?.url ?? ''),
    roadmap_image_alt: String(item?.roadmapImage?.alt ?? ''),
    links:             item?.links ?? {},
    price:             item?.price ?? {},
    curriculum,
    upstream_status:   String(item?.status ?? ''),
    upstream_order:    Number.isFinite(item?.sortOrder) ? item.sortOrder : 0,
    synced_at:         new Date(),
  };
}

export async function createCareerPath(formData, courses) {
  await requireAdmin('career_paths');

  let payload;
  try {
    payload = shapePayload(formData, courses);
  } catch (err) {
    return { ok: false, error: err?.message ?? 'รูปแบบข้อมูลไม่ถูกต้อง' };
  }

  if (!payload.title) return { ok: false, error: 'กรุณากรอกชื่อ Career Path' };
  if (!payload.slug)  return { ok: false, error: 'กรุณากรอก slug' };

  let item;
  try {
    const result = await msdbCreate('career-path', payload);
    item = result?.item;
  } catch (err) {
    return { ok: false, error: `บันทึกลง MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}` };
  }

  if (!item?._id) {
    return { ok: false, error: 'MSDB ไม่ได้ส่ง _id กลับมา' };
  }

  await dbConnect();
  await CareerPath.findOneAndUpdate(
    { career_path_id: String(item._id) },
    {
      $set: {
        career_path_id: String(item._id),
        ...mongoSetFromMsdbItem(item, courses, payload.curriculum),
      },
      $setOnInsert: {
        is_active:     payload.status === 'active',
        display_order: 999,
      },
    },
    { upsert: true }
  );

  bustCaches();
  return { ok: true, slug: item.slug, career_path_id: String(item._id) };
}

export async function updateCareerPath(careerPathId, formData, courses) {
  await requireAdmin('career_paths');
  await dbConnect();

  if (!careerPathId) return { ok: false, error: 'Missing career_path_id' };

  const existing = await CareerPath.findOne({
    career_path_id: String(careerPathId),
  }).lean();
  if (!existing) return { ok: false, error: 'ไม่พบ Career Path' };

  let payload;
  try {
    payload = shapePayload(formData, courses);
  } catch (err) {
    return { ok: false, error: err?.message ?? 'รูปแบบข้อมูลไม่ถูกต้อง' };
  }
  if (!payload.title) return { ok: false, error: 'กรุณากรอกชื่อ Career Path' };
  if (!payload.slug)  return { ok: false, error: 'กรุณากรอก slug' };

  // MSDB write API accepts the slug as the URL identifier for
  // career-path (see docs/api-domains.md). We send the previous slug
  // so a slug rename in the form still resolves to the right row.
  const upstreamRef = existing.api_slug || existing.career_path_id;

  let item;
  try {
    const result = await msdbUpdate('career-path', upstreamRef, payload);
    item = result?.item;
  } catch (err) {
    return { ok: false, error: `อัปเดต MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}` };
  }

  await CareerPath.findOneAndUpdate(
    { career_path_id: existing.career_path_id },
    {
      $set: mongoSetFromMsdbItem(item ?? {
        ...payload,
        // Fall back to the payload we just sent if MSDB didn't echo
        // the item back — keeps the local row in step regardless.
        _id: existing.career_path_id,
      }, courses, payload.curriculum),
    }
  );

  bustCaches();
  return { ok: true };
}

export async function deleteCareerPath(careerPathId) {
  await requireAdmin('career_paths');
  await dbConnect();

  if (!careerPathId) return { ok: false, error: 'Missing career_path_id' };

  const existing = await CareerPath.findOne({
    career_path_id: String(careerPathId),
  }).lean();
  if (!existing) return { ok: false, error: 'ไม่พบ Career Path' };

  const upstreamRef = existing.api_slug || existing.career_path_id;

  try {
    await msdbDelete('career-path', upstreamRef);
  } catch (err) {
    // Local delete is preferable to an orphaned row the admin can't
    // remove — return a warning rather than aborting.
    await CareerPath.findOneAndDelete({ career_path_id: existing.career_path_id });
    bustCaches();
    return {
      ok: true,
      warning: `ลบ local สำเร็จ แต่ลบที่ MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}`,
    };
  }

  await CareerPath.findOneAndDelete({ career_path_id: existing.career_path_id });
  bustCaches();
  return { ok: true };
}

// ── Career Path Registration support ──────────────────────────────
//
// These three actions back the new "Career Path Registration" feature
// (admin course management + public sign-up form). The `id` argument
// follows the same convention as the rest of the admin: it's whatever
// shows up in /admin/career-paths/[id]/… — historically a string that
// could be either the Mongo `_id` or the upstream `career_path_id`.
// We accept both for parity with the existing edit page.

function buildIdFilter(id) {
  const str = String(id ?? '');
  const or = [{ career_path_id: str }];
  if (mongoose.isValidObjectId(str)) or.push({ _id: str });
  return { $or: or };
}

/**
 * Lookup helper used by the admin course-management page. Returns null
 * if nothing matches — the page surfaces 404.
 */
export async function getCareerPathById(id) {
  if (!id) return null;
  await dbConnect();
  const doc = await CareerPath.findOne(buildIdFilter(id)).lean();
  return doc ? serialize(doc) : null;
}

/**
 * Persist the admin's edits to `localCourses`, `requiredSelections`,
 * and `registrationOpen`. These three live outside the MSDB sync
 * surface (admin-only data) so we don't dual-write — just Mongo.
 */
export async function updateCareerPathCourses(id, payload = {}) {
  await requireAdmin('career_paths');
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };

  // Sparse update: only set fields the caller actually supplied. The
  // simplified admin form (post-redesign) no longer touches
  // `localCourses` — leaving it out preserves whatever Phase-1 data
  // already lives on the doc rather than wiping it to [].
  const update = {};
  if ('localCourses' in payload) {
    update.localCourses = Array.isArray(payload.localCourses) ? payload.localCourses : [];
  }
  if ('requiredSelections' in payload) {
    update.requiredSelections = Number(payload.requiredSelections) || 0;
  }
  if ('registrationOpen' in payload) {
    update.registrationOpen = Boolean(payload.registrationOpen);
  }
  if ('registerBannerUrl' in payload) {
    update.registerBannerUrl = String(payload.registerBannerUrl ?? '');
  }
  if ('registerBannerPublicId' in payload) {
    update.registerBannerPublicId = String(payload.registerBannerPublicId ?? '');
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: 'No fields to update' };
  }

  const res = await CareerPath.findOneAndUpdate(
    buildIdFilter(id),
    { $set: update },
    { new: true }
  ).lean();

  if (!res) return { ok: false, error: 'ไม่พบ Career Path' };

  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}/courses`);
  // Public detail pages may need to flip the "สมัคร" CTA, so bust the
  // [...slug] page tree too.
  revalidatePath('/[...slug]', 'page');
  return { ok: true };
}

/**
 * Curriculum-driven schedule lookup for the public registration form.
 *
 * Pulls upcoming schedules for every course listed in the path's
 * `curriculum`, keyed back by `course_id` code so the client can look
 * them up without ObjectId round-trips. Pattern matches
 * `enrichCoursesWithDetails`: chunked fan-out, allSettled so one bad
 * course doesn't drop the whole batch.
 *
 *   Phase 1 — resolve each curriculum item's code → MSDB ObjectId via
 *             `getCourseByCode`. We need the ObjectId because
 *             `/schedules` accepts only `course=<oid>`, not codes.
 *   Phase 2 — fan out `listSchedulesByCourse(oid)` for each resolved
 *             course.
 *
 * Upstream already filters to status ∈ {open, nearly_full} + non-empty
 * signup_url + dates >= today, but we filter again defensively in case
 * the upstream ever loosens.
 */
export async function getCareerPathWithSchedules(slug) {
  const cp = await getCareerPathForRegistration(slug);
  if (!cp) return null;

  // Flatten unique course codes out of the curriculum tree.
  const codes = new Set();
  for (const group of Array.isArray(cp.curriculum) ? cp.curriculum : []) {
    for (const item of Array.isArray(group?.items) ? group.items : []) {
      const code = item?.snap?.code ?? item?.course_id ?? '';
      if (code) codes.add(String(code));
    }
  }

  if (codes.size === 0) return { ...cp, schedulesByCourse: {} };

  const CHUNK = 10;
  const codesArr = [...codes];

  // Phase 1: code → ObjectId. Skip codes that no longer resolve (e.g.
  // course was decommissioned upstream) — the client just renders
  // "ไม่มีรอบเปิดรับสมัคร" for those.
  const codeToOid = new Map();
  for (let i = 0; i < codesArr.length; i += CHUNK) {
    const chunk = codesArr.slice(i, i + CHUNK);
    const results = await Promise.allSettled(chunk.map((c) => getCourseByCode(c)));
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value?._id) {
        codeToOid.set(chunk[idx], String(r.value._id));
      }
    });
  }

  // Phase 2: ObjectId → schedules[]. `listSchedulesByCourse` already
  // applies the upstream open/nearly_full + future-dates filter; we
  // re-filter status defensively.
  const schedulesByCourse = {};
  const entries = [...codeToOid.entries()];
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      chunk.map(([, oid]) => listSchedulesByCourse(oid, { limit: 20 }))
    );
    results.forEach((r, idx) => {
      const [code] = chunk[idx];
      if (r.status === 'fulfilled') {
        const items = r.value?.items ?? [];
        schedulesByCourse[code] = items.filter(
          (s) => s?.status === 'open' || s?.status === 'nearly_full'
        );
      } else {
        schedulesByCourse[code] = [];
      }
    });
  }

  // Ensure every code present in the curriculum has an entry — even
  // empty — so the client can distinguish "course exists but no rounds"
  // from "course missing".
  for (const c of codesArr) {
    if (!(c in schedulesByCourse)) schedulesByCourse[c] = [];
  }

  return { ...cp, schedulesByCourse };
}

/**
 * Resolve a public-facing register slug → CareerPath doc.
 *
 * The public route is /career-path-register/data-analyst — but stored
 * `api_slug` is `data-analyst-career-path` (suffix included). Accept
 * either form so deep links from the detail page work without the
 * caller having to remember to append the suffix.
 *
 * Filters by `is_active` so admin-disabled paths can't be signed up to
 * even via a stale URL — but does NOT filter by `registrationOpen`;
 * the page itself renders the "ยังไม่เปิดรับสมัคร" message so a closed
 * path is still discoverable as "exists but closed" vs. a true 404.
 */
export async function getCareerPathForRegistration(slug) {
  if (!slug) return null;
  await dbConnect();
  const s = String(slug).trim();
  const doc = await CareerPath.findOne({
    $or: [{ api_slug: s }, { api_slug: `${s}-career-path` }],
    is_active: true,
  }).lean();
  return doc ? serialize(doc) : null;
}