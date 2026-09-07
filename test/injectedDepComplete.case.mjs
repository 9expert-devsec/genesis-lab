/**
 * THE GREEN HALF of the control pair for test/fs/injectedDepCoverage.test.mjs.
 *
 * test/injectedDepMissing.case.mjs with ONE line added — the `loadOrder`
 * override. Everything else is identical on purpose: if the audit reported on
 * both files, or on neither, the difference between them is the only thing that
 * could tell those two failures apart, and one file cannot show it.
 *
 * Never run, for the reason its sibling states.
 */
import { listPublicCourses } from '@/lib/api/public-courses';

export function harness({ hidden = [], upstream = { items: [] } } = {}) {
  return {
    fetchUpstream: async () => upstream,
    loadHidden: async () => new Set(hidden),
    loadAliases: async () => new Map(),
    loadOrder: async () => null,
  };
}

export const run = () => listPublicCourses({}, harness());
