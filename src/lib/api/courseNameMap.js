import { listPublicCourses } from '@/lib/api/public-courses';

/**
 * course_id → course_name, for admin surfaces that hold CODES and must show
 * a human a NAME.
 *
 * EXTRACTED from src/app/admin/registrations/page.jsx, where it shipped inline
 * as 37a8691 for the in-house list column. The in-house DETAIL page needs the
 * same map, and a second copy of a cache-sensitive fetch is how two screens
 * start disagreeing about what a course is called. The reasoning below is that
 * commit's, moved with the code rather than re-derived.
 *
 * ── ONE LIST CALL PER RENDER, NEVER ONE LOOKUP PER ROW ─────────────────────
 * `getCourseByCode` per code would be up to 20 live upstream requests on a page
 * that re-renders every request — and on a miss the case-insensitive helper
 * pays a second. This is one `listPublicCourses()` covering all 77 courses.
 *
 * ── force-dynamic DOES NOT COST US THE CACHE, AND THAT WAS MEASURED ────────
 * `dynamic = 'force-dynamic'` governs ROUTE rendering: no full-route cache, the
 * page re-renders per request. It does NOT bypass the Data Cache for a fetch
 * that opts in explicitly, and `listPublicCourses` does — aiFetch sends
 * `next: { revalidate: 3600, tags: ['public-courses'] }`. docs/admin-staleness-audit.md
 * §3.2 measured exactly this shape (route "A" = force-dynamic + tagged fetch,
 * mirroring /admin/courses): three requests, ONE upstream hit. §6 measured that
 * the Data Cache key is url+options, so every caller here shares the single
 * entry that the public course pages and /admin/courses already populate —
 * usually no upstream request at all.
 *
 * Freshness is the same trade every other course-reading screen here makes:
 * ≤1h, and the course webhook's `revalidateTag('public-courses')` busts it
 * sooner. A course renamed upstream shows its old name until then. For a sales
 * screen keyed by a code that does not change, that is the right side of it.
 *
 * ── A MISS MUST NEVER PRODUCE A BLANK ──────────────────────────────────────
 * `.catch` → an empty map, so an upstream outage degrades every code to itself
 * rather than emptying the field. Names are stored only when non-empty, so a
 * course with a blank name upstream is a MISS and falls back to the code,
 * instead of resolving to ''. Blank is the one output these surfaces must never
 * produce — it is the defect the list column was fixed for.
 *
 * @returns {Promise<Record<string, string>>} lowercased code → name, `{}` on failure
 */
export async function buildCourseNameMap() {
  // includeHidden — this map exists to turn a stored CODE into a NAME on admin
  // screens. Its whole contract is "a miss must never produce a blank", and a
  // registration taken before the course was hidden is precisely the row that
  // would go blank: the code is in the database forever, the course is not in
  // the filtered list. Hiding a course must not degrade a sales screen.
  const { items } = await listPublicCourses({ includeHidden: true }).catch(() => ({ items: [] }));
  const map = {};
  for (const c of items ?? []) {
    const code = String(c?.course_id ?? '').trim();
    const name = String(c?.course_name ?? '').trim();
    // Lowercased KEY — see resolveCourseNames below for why a case-insensitive
    // match is safe here and is not the upstream lookup the casing audit is about.
    if (code && name) map[code.toLowerCase()] = name;
  }
  return map;
}

/**
 * A list of codes → `[{ code, name }]`, `name` being `null` on a miss.
 *
 * ── WHY LOWERCASING BOTH SIDES IS SAFE, AND IS NOT THE BUG THE CASING AUDIT
 *    IS ABOUT ───────────────────────────────────────────────────────────────
 * That audit is about the UPSTREAM query `?course_id=`, which is exact-match
 * case-sensitive and returns nothing when the case differs — a remote filter we
 * do not control. This is a LOCAL lookup in a map built from the full list of
 * every course, so lowercasing both sides cannot cause a wrong match:
 * `course_id` values are unique, and two ids differing only in case would be
 * the same course. Do NOT "fix" this to an exact match — exact matching is what
 * makes the four known mixed-case ids (SQL-PG-Query, SQL-ADM-Tuning,
 * MS-SQL-19-Prov, SQL-ADM-Secure) unresolvable, and this is the one place we
 * are free of that constraint.
 *
 * `name: null` and not the code, so the CALLER decides how a miss renders. The
 * detail page shows the code as the primary line; the list cell does the same.
 * Returning the code here would make a resolved name and a fallback
 * indistinguishable downstream.
 *
 * NOTE the admin list keeps its own single-code `resolveCourseName` inside
 * InhouseTable.jsx. Folding that into this module was out of scope for the
 * round that created this file (the in-house list was explicitly off-limits);
 * it is the obvious next step the first time that component is open for other
 * reasons.
 *
 * @param {string[]} codes
 * @param {Record<string, string>|null} map
 * @returns {{code: string, name: string|null}[]}
 */
export function resolveCourseNames(codes, map) {
  const list = Array.isArray(codes) ? codes.filter(Boolean) : [];
  return list.map((raw) => {
    const code = String(raw).trim();
    return { code, name: map?.[code.toLowerCase()] || null };
  });
}
