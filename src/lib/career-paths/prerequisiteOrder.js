/**
 * Career-path course codes and prerequisite pairs — pure, shared by the public
 * pick step (CareerPathRegisterClient) and the server re-check
 * (createCareerPathRegistration). No imports, no I/O.
 *
 * ── CODES HAVE NO CANONICAL CASING ─────────────────────────────────────────
 * A curriculum item carries the code it was synced with (`Power-Apps`) while
 * upstream may now spell it `POWER-APPS`; see getCourseByCodeInsensitive in
 * lib/api/public-courses for why neither spelling is wrong. Course resolution
 * goes through that function, and everything that MATCHES one code against
 * another — a prerequisite against a pick, a stored code against a resolved one
 * — goes through `courseCodeKey` here. Exact-except-case, nothing fuzzier.
 */

/** The comparison key for a course code: exact except for case. */
export function courseCodeKey(code) {
  return String(code ?? '').toLowerCase();
}

function itemCodeOf(item) {
  return String(item?.snap?.code ?? item?.course_id ?? '');
}

/**
 * Rewrite a curriculum so every item code and every prerequisite code is the
 * CANONICAL resolved code. Returns a new array; the input is not mutated, and
 * nothing here is ever written back to the stored document.
 *
 * @param {Array} curriculum  career_paths.curriculum
 * @param {Map<string,string>} canonicalByCode  stored item code → resolved `course_id`
 *   (codes that did not resolve are simply absent and keep their own spelling)
 */
export function canonicaliseCurriculumCodes(curriculum, canonicalByCode) {
  const byKey = new Map();
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const code = itemCodeOf(it);
      if (code && !byKey.has(courseCodeKey(code))) byKey.set(courseCodeKey(code), code);
    }
  }
  for (const [code, canonical] of canonicalByCode ?? []) {
    if (code && canonical) byKey.set(courseCodeKey(code), String(canonical));
  }
  const canon = (code) => byKey.get(courseCodeKey(code)) ?? String(code);

  return (Array.isArray(curriculum) ? curriculum : []).map((g) => ({
    ...g,
    items: (Array.isArray(g?.items) ? g.items : []).map((it) => {
      const code = itemCodeOf(it);
      const next = { ...it };
      if (code) {
        if (it?.snap?.code != null) next.snap = { ...it.snap, code: canon(code) };
        if (it?.course_id != null) next.course_id = canon(code);
      }
      if (Array.isArray(it?.prerequisites)) {
        next.prerequisites = it.prerequisites.map((p) => canon(p));
      }
      return next;
    }),
  }));
}
