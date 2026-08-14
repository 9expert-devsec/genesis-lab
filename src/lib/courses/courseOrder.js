/**
 * Course display order — the one comparator, and the only place ordering is
 * decided.
 *
 * ── WHAT THIS REPLACES ─────────────────────────────────────────────────────
 * Nothing in genesis sorted courses. Every surface rendered the array MSDB
 * returned, which happens to arrive ascending by upstream's `sort_order` — so
 * the site WAS ordered by a rule no genesis code expressed, no genesis test
 * covered, and no genesis admin could change. `sort_order` also collides:
 * eleven courses share the value 0 inside the BUSINESS skill, and which of them
 * renders first is decided by an upstream secondary key that is neither `_id`
 * nor `createdAt` and is documented nowhere.
 *
 * The order now lives in genesis as an ORDERED LIST OF COURSE CODES on each
 * category document (ProgramOrder.courseOrder, SkillOrder.courseOrder). A list
 * cannot hold a tie, which removes the collision problem rather than managing
 * it.
 *
 * ── TWO COMPARATORS, BECAUSE THERE ARE TWO QUESTIONS ───────────────────────
 *
 * `makeCategoryComparator` answers "what order inside THIS program / THIS
 * skill" — the program page, the skill page, a mega-menu column, a page-builder
 * course_list bound to one category.
 *
 * `makeGlobalComparator` answers "what order across the whole catalogue" —
 * /search, /schedule's same-date rows, the admin list. These surfaces are not
 * category-scoped, so there is no single list to read. They order by the
 * course's PROGRAM first (every course has exactly one — measured 79/79) and
 * then by its rank inside that program's list. That makes the global order a
 * projection of the same per-category lists rather than a second, disagreeing
 * scheme: two courses in one program appear in the same relative order on the
 * program page and in search.
 *
 * ── THE UNLISTED TIER, AND WHY IT IS NOT A FALL-THROUGH ────────────────────
 * A course absent from its category's list sorts FIRST, because "no number
 * entered" means "new", and a new course is meant to land at the top.
 *
 * Among those, the order is decided HERE and never by the array's incoming
 * sequence. Returning 0 for two unlisted courses would hand the decision back
 * to upstream's undocumented order — the exact thing this module exists to
 * take ownership of — so the comparator is TOTAL:
 *
 *   1. listed before unlisted is INVERTED: unlisted first (rank -1)
 *   2. among listed:   position in the list
 *   3. among unlisted: `createdAt` DESC — newest first, which is the same
 *      "new lands first" rule applied within the block
 *   4. absolute backstop: normalised `course_id` ASC
 *
 * Tier 4 exists because tier 3's field is upstream's. Measured today it is
 * present on 79/79 courses with 79 distinct values and zero ties — but a bulk
 * import could produce identical timestamps and a future course could arrive
 * without one, and a comparator that can return 0 is a comparator that can
 * silently defer to array order. `course_id` is unique case-insensitively
 * across the catalogue, so tier 4 always breaks.
 *
 * ── IF /search EVER GAINS RELEVANCE SCORING ────────────────────────────────
 * SCORING WINS AND THIS BECOMES THE TIE-BREAK. A relevance ranking that a
 * display order can override is not a relevance ranking. Apply the score first
 * and pass this comparator as the secondary — do not fold the score into these
 * tiers, and do not let a category list reorder a scored result set.
 */

/** Upper-cased and trimmed. The one normalisation, matching what is stored. */
export function normalizeCourseCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

/** Sorts before every listed rank, so unlisted courses lead. */
export const UNLISTED_RANK = -1;

/**
 * `['MSE-L1', 'mse-l2']` → Map { 'MSE-L1' => 0, 'MSE-L2' => 1 }.
 *
 * First occurrence wins, as in lib/articles/pinnedCourses: a code repeated in a
 * stored list is a data error, and taking the later position would move the
 * course on a write nobody made.
 */
export function buildRankMap(codes) {
  const map = new Map();
  if (!Array.isArray(codes)) return map;
  let next = 0;
  for (const code of codes) {
    const key = normalizeCourseCode(code);
    if (!key || map.has(key)) continue;
    map.set(key, next);
    next += 1;
  }
  return map;
}

/** A course's position in a rank map, or UNLISTED_RANK. */
export function rankOf(course, rankMap) {
  const key = normalizeCourseCode(course?.course_id);
  if (!key || !rankMap?.has?.(key)) return UNLISTED_RANK;
  return rankMap.get(key);
}

/**
 * Tiers 3 and 4 — the total, genesis-owned ordering for anything unranked.
 * Exported so a surface with no category at all (a course with no program is
 * creatable today, though none exists) can still order deterministically.
 */
export function compareUnlisted(a, b) {
  // createdAt DESC. Missing timestamps sort LAST within the block rather than
  // first: an absent date is not evidence of newness.
  const ta = Date.parse(a?.createdAt ?? '');
  const tb = Date.parse(b?.createdAt ?? '');
  const va = Number.isFinite(ta) ? ta : -Infinity;
  const vb = Number.isFinite(tb) ? tb : -Infinity;
  if (va !== vb) return vb - va;

  const ca = normalizeCourseCode(a?.course_id);
  const cb = normalizeCourseCode(b?.course_id);
  if (ca !== cb) return ca < cb ? -1 : 1;
  return 0; // the same course compared with itself
}

/**
 * Order WITHIN one category.
 *
 * @param {string[]} codes the category's stored `courseOrder`
 * @returns {(a: object, b: object) => number}
 */
export function makeCategoryComparator(codes) {
  const rankMap = buildRankMap(codes);
  return (a, b) => {
    const ra = rankOf(a, rankMap);
    const rb = rankOf(b, rankMap);
    if (ra !== rb) return ra - rb;              // -1 (unlisted) leads
    if (ra === UNLISTED_RANK) return compareUnlisted(a, b);
    return 0;                                    // one rank per code — unreachable
  };
}

/**
 * Order ACROSS categories — R6's projection.
 *
 * @param {object} opts
 * @param {Map<string, number>} opts.programRank  programId → ProgramOrder.order
 * @param {Map<string, string[]>} opts.courseOrderByProgram programId → courseOrder
 * @returns {(a: object, b: object) => number}
 */
export function makeGlobalComparator({ programRank, courseOrderByProgram } = {}) {
  const pRank = programRank instanceof Map ? programRank : new Map();
  const rankMaps = new Map();
  const rankMapFor = (programId) => {
    if (!rankMaps.has(programId)) {
      rankMaps.set(programId, buildRankMap(courseOrderByProgram?.get?.(programId) ?? []));
    }
    return rankMaps.get(programId);
  };
  // Matches ProgramOrder.order's own default: a program nobody has ordered
  // sorts after every program somebody has.
  const UNRANKED_PROGRAM = 999;
  const programIdOf = (c) => String(c?.program?.program_id ?? '');

  return (a, b) => {
    const pa = pRank.has(programIdOf(a)) ? pRank.get(programIdOf(a)) : UNRANKED_PROGRAM;
    const pb = pRank.has(programIdOf(b)) ? pRank.get(programIdOf(b)) : UNRANKED_PROGRAM;
    if (pa !== pb) return pa - pb;

    // Same program (or both unranked) → rank inside that program's own list, so
    // the global order is a projection of the per-category one rather than a
    // second scheme that can disagree with it.
    const ra = rankOf(a, rankMapFor(programIdOf(a)));
    const rb = rankOf(b, rankMapFor(programIdOf(b)));
    if (ra !== rb) return ra - rb;
    if (ra === UNLISTED_RANK) return compareUnlisted(a, b);
    return 0;
  };
}

/** Convenience: a new array, ordered within one category. Never mutates. */
export function orderCoursesInCategory(courses, codes) {
  return [...(courses ?? [])].sort(makeCategoryComparator(codes));
}

/** Convenience: a new array, ordered across categories. Never mutates. */
export function orderCoursesGlobally(courses, opts) {
  return [...(courses ?? [])].sort(makeGlobalComparator(opts));
}
