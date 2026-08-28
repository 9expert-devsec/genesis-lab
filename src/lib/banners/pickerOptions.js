/**
 * What the two banner pickers are allowed to choose from.
 *
 * ── WHY THE WHOLE LIST IS SHIPPED TO THE CLIENT AND NOT SEARCHED PER KEYSTROKE
 * The corpus is small and bounded: 79 in-class courses, 22 online, 488
 * articles. Projected to the four or five fields a picker row shows, the
 * article list is ~60 KB and the two course lists together ~12 KB — one payload,
 * on an ADMIN page, versus a server round-trip on every keystroke that would
 * still have to be debounced and would still race. Filtering happens in the
 * browser against an array that is already there, so typing is instant and
 * cannot half-render.
 *
 * The alternative already in the repo is `searchArticles(q)`, and it is the
 * wrong tool here for three separate reasons: it matches TITLE only (so a slug
 * cannot be searched, and the slug is what is stored), it caps at 20 rows with
 * no signal that it truncated, and it returns neither `active` nor
 * `publishedAt` — the two fields the "this will be dropped at render time"
 * warning is made of.
 *
 * ── THE ARTICLE PICKER IS NOT LIMITED TO featuredOnLanding ──────────────────
 * Six of the 488 carry that flag. It marks the BlogSection's own selection and
 * has nothing to do with banners: `resolveFeatureContentRefs` looks a slug up
 * with a plain `$in` on `Article.slug` and neither knows nor cares about the
 * flag. A picker limited to those six would be a restriction the admin can
 * neither see in the UI nor explain from the data, and the first time someone
 * wanted to feature the 7th article they would conclude the picker was broken.
 *
 * ── EVERY ROW CARRIES WHETHER IT WOULD ACTUALLY RENDER ─────────────────────
 * This is the point of the module, not a nicety. A hidden course or an inactive
 * or future-dated article is dropped SILENTLY from the pool at render time —
 * `resolveFeatureContentRefs` pushes a miss, `warnFeatureContentMisses` writes
 * one line to a server log, and the admin sees a saved banner that never
 * appears. So each row states its own resolvability and the picker warns BEFORE
 * the save, using exactly the predicates the resolver uses:
 *
 *   course   `isHiddenCourse(hidden, code)` — the same CourseExtension-derived
 *            Set, keyed with the same `normaliseCourseKey`. Measured today: the
 *            set is EMPTY (zero rows with isPublished:false), so no live course
 *            exercises this path and the unit tests are the only proof it works.
 *            That is stated rather than hidden — an untested-by-data path that
 *            nobody names is how COPILOT-STU stayed 404 from four surfaces.
 *
 *   article  `active === true && publishedAt <= now`. Measured today: 488/488
 *            active and 488/488 published, so BOTH filters currently exclude
 *            zero records and neither can be observed working against real
 *            data. Same reasoning, same consequence: the tests carry it.
 *
 * ── READ-ONLY, AND IT NEVER THROWS AT THE CALLER ───────────────────────────
 * The banner admin pages had no upstream dependency before this. Now they have
 * one, and MSDB being down must not turn "edit a banner" into a 500 — the other
 * fifteen fields on the form have nothing to do with courses. So a failure
 * returns `{ items: [], error }` and the picker renders the message inline,
 * next to a still-working form. The already-selected value survives regardless,
 * because it is stored on the banner and rendered from the hidden inputs, not
 * looked up in this list.
 */

import { COURSE_KINDS } from './bannerTypes';
import { isHiddenCourse } from '@/lib/courses/hiddenCourses';

/** Trim for DISPLAY. Never for the stored key — see `courseId` below. */
function displayText(value) {
  return String(value ?? '').trim();
}

/**
 * One upstream row → one picker option.
 *
 * ── `courseId` IS THE RAW VALUE, `label` IS THE TRIMMED ONE ────────────────
 * Two online ids ship with a LEADING SPACE — " ONL-CYS" and " ONL-MSE-PQ-PM",
 * measured on the live feed. Rendering that verbatim gives a row that looks
 * mis-indented and a search box in which the obvious query fails, so the LABEL
 * is trimmed. The stored key is NOT: `courseId` is written to the document
 * exactly as upstream spells it, because that is the value that will still
 * match if the resolver's normalisation is ever tightened, and because a store
 * that silently edits its input is a store you cannot audit against the source.
 * Resolution normalises both sides anyway (`normaliseCourseKey` = trim +
 * upper-case), so the trimmed and untrimmed forms resolve identically today —
 * which is exactly why the raw one is the safe one to keep.
 */
function courseOption(row, kind, hidden) {
  const online = kind === COURSE_KINDS.ONLINE;
  const rawId = String((online ? row?.o_course_id : row?.course_id) ?? '');
  return {
    upstreamId: String(row?._id ?? ''),
    courseId: rawId,
    kind,
    // What the row SHOWS. Trimmed, because a leading space is a data defect
    // and not a name.
    code: displayText(rawId),
    name: displayText(online ? row?.o_course_name : row?.course_name),
    // Would this course actually resolve on the home page right now?
    resolvable: !isHiddenCourse(hidden, rawId),
  };
}

/**
 * Both course namespaces, flat, each row tagged with the `kind` that selects it.
 *
 * ONE list rather than two, because the picker filters it by the admin's
 * explicit namespace choice and the alternative — two arrays threaded through
 * two props — makes "which array is this row from?" a question the component
 * has to answer instead of a field the row carries.
 *
 * `includeHidden: true` DELIBERATELY. The default drops hidden courses, which
 * would make a hidden course simply absent from the picker — and absence is the
 * one outcome that teaches the admin nothing. It is listed, marked, and warned
 * about instead.
 *
 * @param {object} [deps] injectable for the test tier, exactly as
 *   `resolveFeatureContentRefs` carries its own and for the same reason: what
 *   this function does is decide which rows an admin can pick, and that is not
 *   observable from source text. Production callers pass nothing.
 */
export async function getBannerCourseOptions(deps = {}) {
  try {
    const listCourses =
      deps.listCourses ?? (await import('@/lib/api/public-courses')).listPublicCourses;
    const listOnline =
      deps.listOnline ?? (await import('@/lib/api/online-courses')).getOnlineCourses;
    const loadHidden =
      deps.loadHidden ?? (await import('@/lib/courses/hiddenCourses')).loadHiddenCourseIds;

    const [inclassRes, onlineRes, hiddenRes] = await Promise.all([
      listCourses({ includeHidden: true }),
      listOnline(),
      loadHidden(),
    ]);

    const hidden = hiddenRes instanceof Set ? hiddenRes : new Set();
    const inclassRows = inclassRes?.items ?? (Array.isArray(inclassRes) ? inclassRes : []);
    const onlineRows = Array.isArray(onlineRes) ? onlineRes : (onlineRes?.items ?? []);

    const items = [
      ...inclassRows.map((r) => courseOption(r, COURSE_KINDS.INCLASS, hidden)),
      ...onlineRows.map((r) => courseOption(r, COURSE_KINDS.ONLINE, hidden)),
    ].filter((o) => o.code || o.upstreamId);

    // Sorted by the code the admin reads, per namespace, so the list is
    // predictable between requests. `localeCompare` on the TRIMMED code, so the
    // two leading-space online ids sort where their names say they should
    // rather than ahead of everything.
    items.sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.code.localeCompare(b.code)
    );

    return { items, error: null };
  } catch (err) {
    return {
      items: [],
      error:
        'โหลดรายชื่อคอร์สจาก MSDB ไม่สำเร็จ — '
        + String(err?.message ?? err).slice(0, 200),
    };
  }
}

/**
 * Every article, with the two facts that decide whether it would render.
 *
 * `publishedAt` is compared HERE rather than shipped as a date for the client to
 * compare, so the answer is the server's clock — the same clock the resolver
 * uses — and cannot disagree with it because a browser's is wrong.
 *
 * @param {object} [deps] `findArticles` and `now`, injectable for the same
 *   reason as above.
 */
export async function getBannerArticleOptions(deps = {}) {
  try {
    const now = deps.now ?? new Date();
    const find =
      deps.findArticles ??
      (async () => {
        const { dbConnect } = await import('@/lib/db/connect');
        await dbConnect();
        const Article = (await import('@/models/Article')).default;
        return Article.find(
          {},
          { slug: 1, title: 1, active: 1, publishedAt: 1, _id: 0 }
        )
          .sort({ publishedAt: -1 })
          .lean();
      });

    const rows = await find();
    const items = (Array.isArray(rows) ? rows : []).map((row) => {
      const published = row?.publishedAt != null && new Date(row.publishedAt) <= now;
      return {
        // VERBATIM. 265 of the 488 live slugs contain Thai characters; nothing
        // here trims, folds, transliterates or percent-encodes them. The value
        // that goes into `article_slug` is the value `Article.slug` holds, or
        // the `$in` finds nothing.
        slug: String(row?.slug ?? ''),
        title: String(row?.title ?? ''),
        active: row?.active === true,
        published,
        // Both conditions in one field, because that is the question the picker
        // asks; the two components are kept so the warning can say WHICH.
        resolvable: row?.active === true && published,
      };
    }).filter((o) => o.slug);

    return { items, error: null };
  } catch (err) {
    return {
      items: [],
      error:
        'โหลดรายชื่อบทความไม่สำเร็จ — ' + String(err?.message ?? err).slice(0, 200),
    };
  }
}

/**
 * The two matchers are RE-EXPORTED from src/lib/banners/pickerMatch.js.
 *
 * They moved because both pickers are CLIENT components and both need them,
 * while THIS module carries `await import('@/models/Article')` and
 * `await import('@/lib/db/connect')` inside its bodies. A dynamic import is
 * still an edge in the bundle graph, so importing this file from a client
 * component would pull mongoose toward the browser chunk — lazily, but really.
 *
 * One definition, two import paths, and the client one cannot reach a driver.
 */
export { findArticleOption, findCourseOption } from './pickerMatch';
