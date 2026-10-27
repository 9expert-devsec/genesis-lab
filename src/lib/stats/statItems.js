/**
 * getSiteStats() output → the ordered `items` a StatsStrip renders. Pure.
 *
 * Labels live here once, so Home and About cannot spell the same stat two ways.
 * A value that is null (a computed count that failed) is dropped, never shown
 * as 0 — the strip simply has one item fewer.
 */

const DEFS = {
  organizations: { label: 'องค์กร' },
  setListed:     { label: 'บริษัทจดทะเบียน' },
  learners:      { label: 'ผู้เรียน' },
  followers:     { label: 'ผู้ติดตาม' },
  rating:        { label: 'รีวิว', kind: 'rating', star: true },
  courses:       { label: 'หลักสูตร' },
  masterclasses: { label: 'Masterclass' },
};

/** Home: องค์กร · ผู้เรียน · ★รีวิว · ผู้ติดตาม · หลักสูตร · Masterclass */
export const HOME_STAT_KEYS = Object.freeze([
  'organizations', 'learners', 'rating', 'followers', 'courses', 'masterclasses',
]);

/** About: องค์กร · บริษัทจดทะเบียน · ผู้เรียน · ผู้ติดตาม · หลักสูตร · Masterclass (no rating) */
export const ABOUT_STAT_KEYS = Object.freeze([
  'organizations', 'setListed', 'learners', 'followers', 'courses', 'masterclasses',
]);

/**
 * @returns {{ key: string, value: number, label: string, kind: 'count'|'rating', star: boolean }[]}
 */
export function buildStatItems(stats, keys) {
  return keys
    .filter((key) => DEFS[key] && typeof stats?.[key] === 'number')
    .map((key) => ({
      key,
      value: stats[key],
      label: DEFS[key].label,
      kind: DEFS[key].kind ?? 'count',
      star: Boolean(DEFS[key].star),
    }));
}
