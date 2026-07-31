/**
 * Sweep progress — which action files have been instrumented, and therefore
 * which menus can actually produce audit rows.
 *
 * ── WHY THIS IS A MODULE IN src/ AND NOT A LIST IN THE TEST ─────────────────
 * It used to live in `test/fs/auditCoverage.test.mjs`, which was fine while the
 * only consumer was the coverage guard. Phase 3b added a second consumer that
 * needs it at RUNTIME: the inline history widget must distinguish "this record
 * has no history" from "this menu is not wired up yet". During a sweep most
 * screens are in the second state, and a widget that says "no history" when it
 * means "not instrumented" teaches people the feature is broken.
 *
 * `src/` cannot import from `test/`, so the list moved here and the guard now
 * imports it. ONE list, two derived views — a second hand-kept copy is exactly
 * the failure this repo has hit repeatedly (the two classifiers in §8.9, the
 * fourteen copies of refNo).
 *
 * ── WHY IT IS NOT IN auditContract.js ───────────────────────────────────────
 * That module's docstring explicitly excludes it: "Which actions exist, and
 * whether each one has been instrumented yet, is the coverage guard's job."
 * The contract is the vocabulary — stable, describing what a row MAY contain.
 * This is project state — it changes every round and is finished when the sweep
 * is. Different lifetimes, different files.
 *
 * ── DEFINITION OF DONE FOR A SWEEP ROUND ────────────────────────────────────
 * Adding a file here is part of finishing a round, alongside the call sites and
 * MOUNTING the widget on that menu's screens. A round that instruments actions
 * without mounting produces rows nobody can see from the screen they describe.
 *
 * Pure. No imports at all — both a server component and a test read it.
 */

/**
 * One entry per instrumented action file, with the menu keys its rows carry.
 *
 * `menus` is a list because the mapping is not one-to-one: courses.js and
 * course-extensions.js both write under `courses`, and the registration files
 * split across three different menus.
 */
export const SWEPT = Object.freeze([
  // ── Round 1 — roles ──────────────────────────────────────────────
  { file: 'src/lib/actions/roles.js', menus: ['roles'] },

  // ── Round 2 — the four PII entities (§5.1) ───────────────────────
  { file: 'src/lib/actions/registrations.js', menus: ['registrations'] },
  { file: 'src/lib/actions/inhouse-registrations.js', menus: ['registrations'] },
  { file: 'src/lib/actions/career-path-registrations.js', menus: ['career_path_registrations'] },
  { file: 'src/lib/actions/masterclass-registrations.js', menus: ['mc_registrations'] },

  // ── Round 3 — the MSDB half, and the second key space on `courses` ──
  { file: 'src/lib/actions/courses.js', menus: ['courses'] },
  { file: 'src/lib/actions/schedules.js', menus: ['schedules'] },
  { file: 'src/lib/actions/course-extensions.js', menus: ['courses'] },

  // ── Round 4 — articles, the only menu where ONE action writes MANY rows ──
  // A step can rebalance a span; a pin renumbers the block behind it. All of
  // those are one audit row with the collateral counted in `meta.alsoTouched`.
  { file: 'src/lib/actions/articles.js', menus: ['articles'] },
]);

/** The file list the coverage guard iterates. Derived — never typed twice. */
export const SWEPT_FILES = Object.freeze(SWEPT.map((s) => s.file));

/** The menu keys that can currently produce rows. Derived from the same list. */
export const SWEPT_MENUS = Object.freeze([...new Set(SWEPT.flatMap((s) => s.menus))]);

/**
 * Can this menu produce audit rows yet?
 *
 * The widget's third empty state depends on this being honest: `false` means
 * "not wired up", not "nothing happened".
 */
export function isMenuSwept(menu) {
  return SWEPT_MENUS.includes(menu);
}
