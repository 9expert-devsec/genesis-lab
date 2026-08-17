/**
 * /search — which tabs exist, which are visible, and which one is active.
 *
 * Dependency-free like matchSearch.js, and separate from it because these are
 * PRESENTATION rules over the counts, not matching rules. The matcher always
 * reports every type with an explicit 0; this module is where a 0 turns into
 * "not rendered".
 */

import { SEARCH_TYPES } from './matchSearch';

export const ALL_TAB = 'all';

/**
 * The tab row, in order. `คอร์สออนไลน์` sits directly after `หลักสูตร`:
 * both answer "which course teaches this?", and separating them with Career
 * Path would put the delivery-mode distinction behind an unrelated one.
 */
export const SEARCH_TABS = [
  { key: ALL_TAB, label: 'ทั้งหมด' },
  { key: 'courses', label: 'หลักสูตร' },
  { key: 'onlineCourses', label: 'คอร์สออนไลน์' },
  { key: 'careerPaths', label: 'Career Path' },
  { key: 'schedules', label: 'ตารางอบรม' },
  { key: 'promotions', label: 'โปรโมชัน' },
  { key: 'articles', label: 'บทความ' },
];

/** Fixture guard for the tabs↔types correspondence — one tab per bucket, plus all. */
export const SEARCH_TAB_KEYS = SEARCH_TABS.map((t) => t.key);

/** The number a tab's label shows. `all` shows the grand total. */
export function tabCount(key, counts, total) {
  if (key === ALL_TAB) return Number(total) || 0;
  return Number(counts?.[key]) || 0;
}

/**
 * The tabs that render. `ทั้งหมด` ALWAYS renders — it is the way back from a
 * narrowed view, and a tab row that can empty itself completely leaves the user
 * with no control at all.
 */
export function visibleSearchTabs(counts, total) {
  return SEARCH_TABS.filter((t) => t.key === ALL_TAB || tabCount(t.key, counts, total) > 0);
}

/**
 * The tab that is ACTUALLY active, given what the user last clicked.
 *
 * ── WHY THIS IS DERIVED AND NOT AN EFFECT ───────────────────────────────────
 * Typing narrows results. A user sitting on `โปรโมชัน` whose count drops to 0
 * would otherwise be left on a tab that is no longer rendered: no tab looks
 * active, and the panel below is empty for a reason the page never states.
 *
 * Correcting that in a `useEffect` would render the broken frame first and fix
 * it on the next tick — a visible flash of exactly the state being avoided.
 * Deriving it means the broken frame is never produced: the click is remembered,
 * the ACTIVE tab is computed. If the count comes back (the user deletes a
 * character), the remembered choice is honoured again, which an effect that
 * overwrote the state could not do.
 */
export function resolveActiveTab(requested, counts, total) {
  const key = requested ?? ALL_TAB;
  if (key === ALL_TAB) return ALL_TAB;
  if (!SEARCH_TYPES.includes(key)) return ALL_TAB;
  return tabCount(key, counts, total) > 0 ? key : ALL_TAB;
}
