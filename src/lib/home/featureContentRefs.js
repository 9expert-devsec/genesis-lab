/**
 * Feature Content resolution: banner references → the real course / article.
 *
 * ── WHY THIS IS NOT IN THE MAPPER ───────────────────────────────────────────
 * featureContentFromBanners.js is PURE and stays pure: it takes plain objects
 * and returns a view model, which is what makes it testable without a database
 * and what stops the Banner shape leaking into components. Resolution needs an
 * upstream fetch and a Mongo read. So the split is:
 *
 *   this module   asks "which real records do these banners point at?"
 *   the mapper    is handed the answers and never looks anything up
 *
 * FeatureContentSection (a server component) is the one place that calls this
 * and then the mapper, in that order.
 *
 * ── WHY EXPLICIT BATCHED LOOKUPS AND NOT THE ARRAYS ALREADY ON page.jsx ─────
 * The home page already holds `articles` (6 featuredOnLanding) and
 * `newCoursesWithSchedules`. Resolving out of those would work today and be
 * wrong tomorrow: the admin picking a banner's course or article can pick ANY
 * of the 79 in-class courses, 22 online courses and 488 articles, not the
 * handful that happen to be on the landing snapshot. A reference that resolves
 * only when its target is coincidentally featured elsewhere is a bug that
 * appears months later, on one record, with no error.
 *
 * So: one `$in` on Article.slug, one list per course namespace. Both course
 * lists are the codebase's existing cached reads — there is no new upstream
 * call shape here, and no per-item N+1.
 *
 * ── EVERY LOOKUP IS INJECTABLE ──────────────────────────────────────────────
 * `deps` for the same reason listPublicCourses and resolveCourse carry theirs:
 * what this module DOES is decide which record a reference reaches, and that is
 * not observable from source text. A test that asserts "the lookup is called"
 * is what let the stale-casing bug sit green in resolveCourse. Production
 * callers pass nothing.
 */

import {
  isHiddenCourse,
  normaliseCourseKey,
} from '@/lib/courses/hiddenCourses';
import {
  BANNER_TYPES,
  COURSE_KINDS,
  normaliseBannerType,
} from '@/lib/banners/bannerTypes';

/**
 * RE-EXPORTED, not redefined.
 *
 * The two namespaces moved to src/lib/banners/bannerTypes.js because three of
 * the four things that need them cannot import THIS module: the mongoose enum,
 * the zod enum and the admin picker. This file reaches Mongo and the upstream
 * adapter, so a client component importing it would drag a database driver into
 * the browser bundle. bannerTypes.js has no imports at all, which is what makes
 * it the only module all four can share.
 *
 * The export stays here so every existing import — and every test that names it
 * from this path — keeps working against ONE definition rather than two.
 */
export { COURSE_KINDS };

/** Trim → null, so '' and '   ' are both "absent" rather than a key. */
function text(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s.length ? s : null;
}

/**
 * The normalised type, never `banner.type` directly.
 *
 * Delegates to the shared normaliser so the resolver, the mapper and the admin
 * form all fold the five legacy ids onto the four current ones the SAME way. It
 * stays exported because callers and tests name it from here.
 */
export function bannerType(banner) {
  return normaliseBannerType(banner?.type);
}

/** A stable key for "which banner is this", matching the mapper's `id`. */
export function bannerKey(banner) {
  return String(banner?._id ?? '');
}

/**
 * What the pool actually references — deduped, so N banners pointing at one
 * course are one lookup.
 *
 * Returns plain arrays rather than Sets so the result is trivially assertable
 * and JSON-printable in a probe.
 */
export function collectFeatureRefs(banners) {
  const slugs = new Set();
  const inclass = new Set();
  const online = new Set();
  const upstream = new Set();

  for (const banner of Array.isArray(banners) ? banners : []) {
    const type = bannerType(banner);
    if (type === BANNER_TYPES.ARTICLE) {
      const slug = text(banner?.article_slug);
      if (slug) slugs.add(slug);
      continue;
    }
    if (type !== BANNER_TYPES.COURSE) continue;
    const ref = banner?.course_ref;
    const up = text(ref?.upstreamId);
    if (up) upstream.add(up);
    const code = text(ref?.courseId);
    if (code) {
      (ref?.kind === COURSE_KINDS.ONLINE ? online : inclass).add(
        normaliseCourseKey(code)
      );
    }
  }

  return {
    articleSlugs: [...slugs],
    inclassKeys: [...inclass],
    onlineKeys: [...online],
    upstreamIds: [...upstream],
  };
}

/**
 * Index a course list by BOTH of its identities.
 *
 * ── BOTH, BECAUSE A COURSE CODE MOVES AND AN _id DOES NOT ───────────────────
 * `upstreamId` is MSDB's `_id` and is stable. `courseId` is the human code and
 * is what breaks: upstream renamed `Power-Apps` to `POWER-APPS` at some point
 * between this schema's comment being written and now — measured, the live set
 * carries four mixed-case ids (SQL-PG-Query, SQL-ADM-Tuning, MS-SQL-19-Prov,
 * SQL-ADM-Secure) and Power-Apps is no longer among them. A banner saved with
 * the old casing must still resolve, which is what the normalised key is for.
 *
 * ── AND TWO ONLINE IDS SHIP WITH A LEADING SPACE ────────────────────────────
 * Measured on the live feed: " ONL-CYS" and " ONL-MSE-PQ-PM". Not one, as the
 * older note said — so trimming is not a defensive nicety here, it is required
 * for two real courses, and it has to happen on BOTH sides because the admin
 * will have stored whichever form they were shown.
 *
 * `normaliseCourseKey` is the repo's existing normaliser (trim + upper-case)
 * and is reused rather than re-spelled: the hidden-course set is keyed with it,
 * so a second convention here would mean two ways to say the same course and
 * a hidden-course check that silently misses.
 */
export function indexCourses(rows, { idKey }) {
  const byCode = new Map();
  const byUpstream = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = normaliseCourseKey(row?.[idKey]);
    // FIRST WINS. Upstream can carry two rows whose codes differ only by case
    // or a leading space; taking the first keeps the choice stable between
    // requests instead of depending on iteration order downstream.
    if (key && !byCode.has(key)) byCode.set(key, row);
    const up = text(row?._id);
    if (up && !byUpstream.has(up)) byUpstream.set(up, row);
  }
  return { byCode, byUpstream };
}

/**
 * One course reference → one course row, or null.
 *
 * upstreamId FIRST. It is the identity that cannot go stale, so a banner that
 * carries one is resolved by it even if the code it was saved with has since
 * been renamed. The code is the fallback, normalised on both sides.
 */
export function pickCourse(index, ref) {
  if (!index || !ref) return null;
  const up = text(ref.upstreamId);
  if (up) {
    const hit = index.byUpstream.get(up);
    if (hit) return hit;
  }
  const code = text(ref.courseId);
  if (code) {
    const hit = index.byCode.get(normaliseCourseKey(code));
    if (hit) return hit;
  }
  return null;
}

/**
 * Resolve every course/article reference in the pool.
 *
 * Returns `Map<bannerKey, resolved>` plus the misses, so the caller can warn
 * once per bad record with both the record id and what it failed to find.
 *
 * ── THE ENVELOPE HAS NO `kind` DISCRIMINATOR, DELIBERATELY ─────────────────
 * It carried `kind: 'course' | 'article'` for about ten minutes and
 * test/pure/bannerTypeSingleSource caught it: those two strings ARE banner type
 * ids, and a second place spelling them is exactly the drift that guard exists
 * to stop -- the scan cannot tell a discriminator from a type id, and it should
 * not have to. The presence of `course` or `article` on the envelope says which
 * it is without a redundant string that has to agree with the id it copies.
 *
 * ── A HIDDEN COURSE IS CHECKED EXPLICITLY, NOT ASSUMED AWAY ─────────────────
 * `listPublicCourses` already drops hidden courses by default, so in principle
 * a hidden course is simply absent from the list and resolves to nothing. This
 * checks the hidden set anyway, for two reasons: that default is opt-OUT and a
 * future caller here could pass `includeHidden`, and the online feed has never
 * been through that filter at all. "It is already filtered upstream" is exactly
 * the assumption that left COPILOT-STU linking at a 404 from four surfaces.
 *
 * A hidden hit is reported as a MISS with its own reason, so the warning says
 * "hidden" rather than "not found" — those need different fixes.
 */
export async function resolveFeatureContentRefs(banners, deps = {}) {
  const refs = collectFeatureRefs(banners);
  const needsCourses = refs.inclassKeys.length + refs.onlineKeys.length + refs.upstreamIds.length > 0;
  const needsArticles = refs.articleSlugs.length > 0;

  const resolved = new Map();
  const misses = [];
  if (!needsCourses && !needsArticles) return { resolved, misses, refs };

  const {
    now = new Date(),
    listCourses,
    listOnline,
    findArticles,
    loadHidden,
  } = deps;

  // ── Course namespaces: one list each, only when something asks for one ────
  let inclassIndex = null;
  let onlineIndex = null;
  let hidden = new Set();
  if (needsCourses) {
    const list = listCourses ?? (await import('@/lib/api/public-courses')).listPublicCourses;
    const online = listOnline ?? (await import('@/lib/api/online-courses')).getOnlineCourses;
    const hiddenLoader = loadHidden ?? (await import('@/lib/courses/hiddenCourses')).loadHiddenCourseIds;

    const [inclassRes, onlineRes, hiddenRes] = await Promise.all([
      list({ includeHidden: false }),
      online(),
      hiddenLoader(),
    ]);
    inclassIndex = indexCourses(inclassRes?.items ?? inclassRes ?? [], { idKey: 'course_id' });
    onlineIndex = indexCourses(
      Array.isArray(onlineRes) ? onlineRes : (onlineRes?.items ?? []),
      { idKey: 'o_course_id' }
    );
    hidden = hiddenRes instanceof Set ? hiddenRes : new Set();
  }

  // ── Articles: ONE $in, and publishedAt is the filter that matters ─────────
  // Measured on the live collection: 488 articles, 488 of them active — so
  // `active` alone excludes nothing and cannot be the guard. `publishedAt` is
  // also <= now on all 488 today, which means BOTH filters currently exclude
  // zero records and neither can be observed working against real data. That
  // is precisely why the future-dated and inactive cases are unit-tested
  // rather than eyeballed.
  let articleBySlug = new Map();
  if (needsArticles) {
    const find = findArticles ?? (async (slugs, at) => {
      const { dbConnect } = await import('@/lib/db/connect');
      await dbConnect();
      const Article = (await import('@/models/Article')).default;
      return Article.find(
        { slug: { $in: slugs }, active: true, publishedAt: { $lte: at } },
        { slug: 1, title: 1, excerpt: 1, coverUrl: 1, publishedAt: 1, author: 1, articleType: 1 }
      ).lean();
    });
    const rows = await find(refs.articleSlugs, now);
    articleBySlug = new Map(
      (Array.isArray(rows) ? rows : []).map((r) => [String(r?.slug ?? ''), r])
    );
  }

  for (const banner of Array.isArray(banners) ? banners : []) {
    const type = bannerType(banner);
    const key = bannerKey(banner);

    if (type === BANNER_TYPES.ARTICLE) {
      const slug = text(banner?.article_slug);
      if (!slug) { misses.push({ id: key, type, ref: null, reason: 'no article_slug' }); continue; }
      const hit = articleBySlug.get(slug);
      if (!hit) { misses.push({ id: key, type, ref: slug, reason: 'no active, published article with that slug' }); continue; }
      resolved.set(key, { article: hit });
      continue;
    }

    if (type !== BANNER_TYPES.COURSE) continue;

    const ref = banner?.course_ref;
    const refLabel = ref ? `${ref.kind ?? COURSE_KINDS.INCLASS}:${text(ref.upstreamId) ?? text(ref.courseId) ?? '(empty)'}` : null;
    if (!ref || (!text(ref.upstreamId) && !text(ref.courseId))) {
      misses.push({ id: key, type, ref: refLabel, reason: 'no course_ref' });
      continue;
    }
    const isOnline = ref.kind === COURSE_KINDS.ONLINE;
    const hit = pickCourse(isOnline ? onlineIndex : inclassIndex, ref);
    if (!hit) { misses.push({ id: key, type, ref: refLabel, reason: 'no course with that id or code' }); continue; }

    const code = isOnline ? hit.o_course_id : hit.course_id;
    if (isHiddenCourse(hidden, code)) {
      misses.push({ id: key, type, ref: refLabel, reason: 'course is unpublished (hidden)' });
      continue;
    }

    resolved.set(key, { course: hit, online: isOnline });
  }

  return { resolved, misses, refs };
}

/**
 * One warning per unresolved record, naming the record AND the reference.
 *
 * Separate from the resolver so the resolver stays testable without capturing
 * console output, and so the mapper — which is pure — never has to warn.
 */
export function warnFeatureContentMisses(misses, warn = console.warn) {
  for (const m of misses ?? []) {
    warn(
      `[feature-content] dropped ${m.type} banner ${m.id}: ${m.reason}`
        + (m.ref ? ` (ref ${m.ref})` : '')
    );
  }
}
