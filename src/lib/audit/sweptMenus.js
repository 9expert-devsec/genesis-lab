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

  // ── Cache console round 3 — NOT a sweep round, but it adds the first
  //    destructive action outside the sweep and it is instrumented from the
  //    start rather than joining a later round already un-audited.
  //
  // The OWED note that stood here is DISCHARGED: RecordHistory is mounted on
  // /admin/cache — twice, because this menu holds two record kinds. The
  // snapshot panel carries `entity: 'snapshot'` for `homepage_v1`, and the
  // mirror panel carries `entity: 'mirror'` with all four collection keys as an
  // array (the shape `courses` uses for its two key spaces), so one panel
  // answers "has anyone purged anything lately" across every collection.
  //
  // Both mounts live in page.jsx rather than inside the panels: RecordHistory
  // is an async server component and the panels are deliberately synchronous so
  // the render tier can drive them with renderToStaticMarkup, which cannot
  // await a child.
  { file: 'src/lib/actions/cache-console.js', menus: ['landing_cache'] },
]);

/**
 * ── ONE INSTRUMENTED FILE IS DELIBERATELY ABSENT FROM THE LIST ABOVE ────────
 *
 * `src/lib/actions/media.js` records an audit row for `deleteMediaFile`
 * (`media|file`, action `delete`) and is NOT listed. Stated here rather than
 * left as an omission, because "every instrumented file appears in SWEPT" is
 * exactly the invariant somebody will check against this file.
 *
 * Two reasons, and both are about what listing it would MEAN rather than about
 * effort:
 *
 *   · The definition of done above requires MOUNTING the history widget on that
 *     menu's screens. /admin/media has no per-record screen to mount it on — a
 *     row is a Cloudinary asset, not a document with a detail page — so listing
 *     it would flip `isMenuSwept('media')` to true for a widget that is
 *     nowhere, which is the "wired up" claim this module exists to make honest.
 *
 *   · The sweep is a retrofit of 38 pre-existing action files, all of which
 *     guard with `requireAdmin('<literal>')`. media.js is new code, written
 *     instrumented, and guards with `requirePageAction(PAGE_KEY)`. The coverage
 *     guard reads that literal out of the source text to check it against the
 *     recorded menu, and would report a false red on a file that is not doing
 *     anything wrong.
 *
 * If /admin/media ever grows a per-file detail view, both reasons expire
 * together and media.js should join the list.
 */

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
