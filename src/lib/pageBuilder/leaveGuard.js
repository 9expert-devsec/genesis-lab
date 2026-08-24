/**
 * ONE answer to "may the author leave the Page Builder editor right now?"
 *
 * ── WHY THIS IS A MODULE AND NOT THREE `if`s ────────────────────────────────
 * The editor has THREE ways out and they used to have one guard between them:
 *
 *   · beforeunload      — tab close, reload, typed URL        (was guarded)
 *   · popstate          — the browser BACK button             (was NOT)
 *   · an in-app <a>     — the admin sidebar, soft navigation  (was NOT)
 *
 * Back was confirmed to leave the editor with no warning and no autosave flush.
 * The cost is not "a few keystrokes": autosave is a 5s idle debounce, and it
 * NEVER runs for an unsaved /builder/new page by design (useEditorSave.js), so
 * on a new page Back destroyed everything with no backstop at all.
 *
 * Three exits guarded by three separately-written conditions is a drift
 * machine — the next state that should block leaving gets added to one of them.
 * So the CONDITION lives here, once, as a pure function of the editor's state,
 * and the three listeners in useLeaveGuard.js all call it. No DOM, no React, no
 * history: this file is the decision, not the mechanism, and it is the half of
 * this feature that can be tested honestly (test/pure/leaveGuard.test.mjs).
 *
 * ── THE PRECEDENCE IS THE POINT, WHICH IS WHY THE BOOLEAN IS DERIVED ────────
 * `shouldBlockLeave` is `leaveBlockReason(...) !== null` rather than its own
 * expression. A second expression would be a second definition of the same rule
 * — the exact shape the module exists to remove — and it would go wrong in the
 * quiet direction: the predicate saying "leave is fine" while the reason says
 * "conflict". One is computed from the other so they cannot disagree.
 */

/**
 * WHY EACH STATE BLOCKS, in the order the author would want to hear it.
 *
 * 'conflict' — the worst case and therefore first. A conflicted session is
 *   TERMINAL: autosave has stopped permanently (it must not hammer a write that
 *   would clobber someone else's edit), so the tree in this tab is the only
 *   copy that will ever exist. Note `conflict` is an OBJECT (`{ message }`) or
 *   null in the reducer, never a boolean — coerced here rather than at each
 *   call site.
 *
 * 'saving' — a write is on the wire. Leaving can abort the request, and the
 *   author would have seen a "saving" indicator and reasonably believed the
 *   work had landed.
 *
 *   MEASURED, AND SAY SO RATHER THAN IMPLY MORE: today `saving` never occurs
 *   without `dirty`, so this branch changes no outcome. SAVE_START sets
 *   `saving: true` and leaves `dirty` alone; only SAVE_OK clears `dirty`, and it
 *   clears `saving` in the same action (editorReducer.js). It is kept because
 *   the redundancy costs nothing and stops being redundant the moment any save
 *   path clears `dirty` optimistically at the START of a write — which is a
 *   normal thing to want and would otherwise open a silent window here.
 *
 * 'dirty' — the ordinary case: edits not yet written.
 */
export function leaveBlockReason(state) {
  const { dirty = false, conflict = null, saving = false } = state ?? {};
  if (conflict) return 'conflict';
  if (saving) return 'saving';
  if (dirty) return 'dirty';
  return null;
}

/**
 * The predicate the three exit listeners consult. DERIVED — see the note above.
 */
export function shouldBlockLeave(state) {
  return leaveBlockReason(state) !== null;
}
