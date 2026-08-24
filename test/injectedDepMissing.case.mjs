/**
 * THE RED CONTROL for test/fs/injectedDepCoverage.test.mjs. Deliberately wrong.
 *
 * A harness for `listPublicCourses` that supplies `fetchUpstream` and
 * `loadHidden` and omits `loadOrder` — byte-for-byte the shape
 * test/pure/listPublicCoursesHidden.test.mjs carried until round 45, and the
 * shape that made a 30ms file take 10.5 seconds while staying green.
 *
 * ── WHY THIS IS A FILE AND NOT A STRING IN THE TEST ────────────────────────
 * The guard reads repo-relative files through sourceScan, and the property
 * under control is "the audit NAMES THE FILE". A control built from an inline
 * string would exercise a different entry point from the one the guard uses,
 * and would go green against a reader that could not open a file at all.
 *
 * ── WHY IT IS NEVER RUN ────────────────────────────────────────────────────
 * `.case.mjs`, not `.test.mjs`: the runner's manifest enumerates *.test.mjs in
 * pure/fs/render and its discovery guard walks test/ for the same suffix, so
 * neither picks this up. It is SOURCE for a scanner, never an executed test —
 * which matters, because executing it is exactly the database read the guard
 * exists to prevent. Its sibling test/injectedDepComplete.case.mjs is the same
 * file with the omission repaired, and the pair is what proves the audit
 * separates the two rather than reporting on everything it is handed.
 */
import { listPublicCourses } from '@/lib/api/public-courses';

export function harness({ hidden = [], upstream = { items: [] } } = {}) {
  return {
    fetchUpstream: async () => upstream,
    loadHidden: async () => new Set(hidden),
  };
}

export const run = () => listPublicCourses({}, harness());
