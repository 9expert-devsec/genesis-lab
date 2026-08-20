import { buildCourseNameMap } from '@/lib/api/courseNameMap';

/**
 * SEARCHING IN-HOUSE BY COURSE NAME, WHEN NO IN-HOUSE DOCUMENT HOLDS ONE.
 *
 * ══ THE TRAP THIS MODULE EXISTS TO AVOID ════════════════════════════════════
 *
 * In-house search is a regex over STORED fields. `coursesInterested` holds
 * `course_id` CODES and nothing else — unlike a public registration, which
 * carries `courseName` denormalised. So the obvious change, adding
 * `coursesInterested` to the `$or`, makes the search match CODES: typing
 * "ZZTEST-EXCEL-01" works and typing "Excel" finds nothing.
 *
 * That is WORSE than not offering the feature, because the placeholder promises
 * หลักสูตร and the box then fails at it silently — the user reads "no results"
 * as "no such registration", which is a lie about the data.
 *
 * ══ SO: RESOLVE FIRST, THEN MATCH ═══════════════════════════════════════════
 *
 * The typed text is matched against course NAMES to produce a set of CODES, and
 * those codes are matched against the stored field. The raw text is ALSO matched
 * against the code itself, so someone who types a code gets what they expect.
 * Two clauses, both on `coursesInterested` — see `searchClauses` in listFilter.
 *
 * ══ WHAT IT CANNOT DO, STATED PLAINLY ═══════════════════════════════════════
 *
 * A COURSE WHOSE NAME WILL NOT RESOLVE CANNOT BE SEARCHED BY NAME — only by
 * code. `ZZTEST-EXCEL-01` is the live case: it is in the registrations and not
 * in the catalogue, so no name exists to match against anywhere in this system.
 * Typing "Excel" will not find it; typing its code will.
 *
 * THAT CASE MUST DEGRADE TO "NO MATCH ON THAT TERM", NOT TO AN ERROR AND NOT TO
 * AN EMPTY WHOLE QUERY. It does, by construction: an unresolved term simply
 * contributes an empty code set, the `$in` clause is omitted, and the remaining
 * clauses — company, contact name, contact email, and the raw code match — still
 * run. A search for "acme" is unaffected by the fact that no course is called
 * "acme".
 *
 * ── AND NO, THE NAME IS NOT DENORMALISED ONTO THE DOCUMENT ────────────────
 * That would make this trivial and it is a schema change with a migration and a
 * staleness problem — a course renamed upstream would leave every stored copy
 * wrong, on the one screen whose job is to be right about what was sold. Out of
 * scope by ruling, and this module is the alternative rather than a stopgap.
 */

/**
 * Codes whose course NAME contains `term`, case-insensitively.
 *
 * PURE, and separated from the fetch on purpose: this is the half with the
 * interesting behaviour, and it is testable without a network or a cache.
 *
 * ── SUBSTRING, TO MATCH WHAT THE REGEX CLAUSE DOES ────────────────────────
 * The other four in-house search clauses are `{$regex: term, $options: 'i'}` —
 * unanchored substring, case-insensitive. Resolving by exact name would make
 * หลักสูตร behave differently from every other field in the same box: "Excel"
 * would match a company called "Excel Co" and not a course called "Excel
 * Advanced". Same rule for every field the box claims.
 *
 * The term is matched as TEXT, not compiled to a regex, so a user typing `(` or
 * `.*` gets a literal search here rather than a pattern — and never a throw.
 * (The stored-field clauses do compile it; that is pre-existing and unchanged.)
 *
 * @param {string} term the typed text
 * @param {Record<string, string>|null} map lowercased code → name
 * @returns {string[]} the ORIGINAL-CASE codes, deduplicated, sorted
 */
export function codesMatchingCourseName(term, map) {
  const needle = String(term ?? '').trim().toLowerCase();
  if (!needle || !map) return [];

  const hits = new Set();
  for (const [code, name] of Object.entries(map)) {
    if (String(name ?? '').toLowerCase().includes(needle)) hits.add(code);
  }
  return [...hits].sort();
}

/**
 * The codes an in-house search term resolves to, or `[]`.
 *
 * ── THE ONE DERIVATION SITE, AND THAT IS THE POINT ────────────────────────
 * Four numbers on this screen must agree — the stat cards, the toggle badges,
 * the header count and the pager — and they come from THREE separate actions.
 * This screen's recurring defect is a dimension reaching one of them and not the
 * others (`range` in round 2, `q` in round 8), every time because the derivation
 * was written more than once.
 *
 * So the resolution lives here and all three actions call it. They cannot
 * disagree about which codes a term names, because there is one function that
 * decides.
 *
 * ── NON-INHOUSE AND EMPTY TERMS SHORT-CIRCUIT BEFORE THE FETCH ────────────
 * A public render must not pay for a course map it will not use, and neither
 * must an unfiltered in-house list. The map is cached (`listPublicCourses` is a
 * tagged fetch with a 1h revalidate, shared with every other course-reading
 * screen), so the cost of the searched case is usually zero upstream requests
 * and never more than one — never one per code, and never one per row.
 *
 * ── AN OUTAGE DEGRADES TO CODE-ONLY SEARCH, AND NEVER THROWS ──────────────
 * `buildCourseNameMap` already catches its own failure and returns `{}`; the
 * extra catch here is for anything it does not own. Either way the result is an
 * empty code set, which is the same safe shape as "no course matched that term".
 * The list still returns, filtered by the four clauses that do not need names.
 *
 * @param {{q?: string, source?: string}} input
 * @param {{loadMap?: () => Promise<Record<string,string>>}} [deps] production passes nothing
 */
export async function inhouseCourseCodes({ q = '', source = 'public' } = {}, { loadMap = buildCourseNameMap } = {}) {
  if (source !== 'inhouse') return [];
  const term = String(q ?? '').trim();
  if (!term) return [];

  const map = await loadMap().catch(() => ({}));
  return codesMatchingCourseName(term, map);
}
