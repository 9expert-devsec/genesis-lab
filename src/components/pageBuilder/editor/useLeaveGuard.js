'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { leaveBlockReason, shouldBlockLeave } from '@/lib/pageBuilder/leaveGuard';

/**
 * The MECHANISM half of the leave gate. The DECISION is in
 * lib/pageBuilder/leaveGuard.js — every listener here routes through
 * `shouldBlockLeave`, so the three exits cannot drift apart.
 *
 * Returns `{ blocked, reason, pending, confirmLeave, cancelLeave }`. `pending`
 * names the EXIT being attempted ('back' | 'link') when a confirm is open and
 * is null otherwise; `reason` names WHY leaving is blocked ('conflict' |
 * 'saving' | 'dirty'). EditorShell renders LeaveConfirmDialog from the pair —
 * the exit decides nothing about the copy, the reason decides all of it.
 *
 * ── WHAT IS AND IS NOT TESTED, STATED HERE BECAUSE IT MATTERS ───────────────
 * Nothing in this file is exercised by the suite. The runner is `isolation:
 * 'none'` (one shared process, no React roots) and history/popstate semantics
 * cannot be faked in jsdom without the fake becoming the thing under test — a
 * test that asserts our own stub moved an entry proves the stub, not the
 * browser. So test/fs/pageBuilderLeaveGuard.test.mjs pins the WIRING (all three
 * listeners registered, the shared predicate consulted, the click exclusions
 * present) and the behaviour itself rests on a human click-test. Said plainly
 * so nobody reads a green suite as proof that Back is handled.
 */

// The marker we stamp on our own history entry. Read back off `history.state`
// to tell "the user popped OUR sentinel" from any other history movement.
const SENTINEL = { __pbLeaveSentinel: true };

const isSentinel = (s) => Boolean(s && s.__pbLeaveSentinel);

/**
 * ── ONE DEPARTURE ATTEMPT, ONE REASON, DECIDED AT OPEN ────────────────────
 *
 * `reason` used to be recomputed every render for as long as the dialog was
 * up, and `open` tracked only `pending` — never `blocked`. So an autosave that
 * was already counting down when Back was pressed could finish WHILE the
 * author was reading, walking the copy 'dirty' -> 'saving' -> null on screen.
 * At null, LeaveConfirmDialog's `REASON_COPY[reason] ?? REASON_COPY.dirty`
 * fell back to the dirty wording — which by then was simply false: the edit it
 * warns about losing had already been saved.
 *
 * The fix freezes what is SHOWN, never the underlying state: the guard keeps
 * evaluating `blocked`/`reason` live for its own listeners, and only the copy
 * the author is mid-sentence through is held still. Captured on the null ->
 * non-null transition, released on close, so the NEXT attempt captures fresh.
 *
 * Split out as two pure functions rather than inlined, because the claim worth
 * testing — "the reason does not move while the attempt is open" — is a
 * sequence across renders, and this suite mounts no React roots.
 */

/**
 * ── AUTO-COMPLETING A DEPARTURE ONCE THERE IS NOTHING LEFT TO LOSE ────────
 * If the block clears while the dialog is open — the autosave the author was
 * warned about has landed, the tree is clean — the guard has nothing left to
 * protect and is pure friction. Completing the original Back/link gesture is
 * exactly what an unguarded press would already have done, so it finishes on
 * its own rather than demanding a second click on a warning that has stopped
 * being true.
 *
 * ── WHY THIS WAS UNSAFE UNTIL ROUND 7, AND IS NOT NOW ─────────────────────
 * It was specified a round earlier and deliberately not built. publish()
 * dispatched SAVE_START, flushed through save() — which ended its OWN save,
 * clearing `saving` and both dirty flags — and only THEN called
 * publishPageStatus. So `blocked` read false for the entire duration of the
 * promote-to-live write, and auto-completing would have sent the author away
 * mid-publish. Nothing cancels a Server Action in flight, so the write would
 * have landed anyway, with any conflict or error arriving in a tab that no
 * longer existed.
 *
 * Round 7 closed that: runPublish brackets the WHOLE flush-then-promote
 * sequence with a `publishing` flag, in a `finally` so every exit balances,
 * and EditorProvider folds it into the `saving` this guard already reads.
 * `blocked` can now only fall at a moment when nothing is still writing.
 *
 * ── A CONFLICTED SESSION NEVER REACHES THIS ──────────────────────────────
 * Not by a check here, but by construction: `conflict` is set by SAVE_CONFLICT
 * and cleared by NOTHING in the editor reducer (the only RESET dispatcher in
 * the tree belongs to the chat store), so once it is set `blocked` can never
 * fall at all. A conflicted session keeps its manual button, which is right —
 * leaving one genuinely does lose the work.
 */
export function shouldAutoComplete({ pending, blocked }) {
  return Boolean(pending) && !blocked;
}

/** Open an attempt, capturing the reason as it stands at this instant. */
export function beginAttempt(exit, liveReason) {
  return { exit, reason: liveReason };
}

/**
 * ── THE FREEZE LETS ONE THING THROUGH: A WORSENING ────────────────────────
 * Holding the reason still is right for DE-escalation — a save landing, the
 * tree going clean — because the author is mid-sentence and the danger is
 * only receding. It is wrong for the opposite direction: a session that hits
 * a CONFLICT while the dialog is open has had its autosave stopped for good,
 * and the frozen 'saving'/'dirty' copy would keep promising a save that is
 * never coming.
 *
 * The ranks mirror leaveBlockReason's own precedence, so the ordering has one
 * definition rather than two.
 */
export const REASON_RANK = { dirty: 1, saving: 2, conflict: 3 };

export function rankOf(reason) {
  return REASON_RANK[reason] ?? 0;
}

/**
 * The floor a live reason must REACH before it is allowed to overwrite a
 * frozen one — not merely outrank it.
 *
 * WHY IT IS AT 'conflict' AND NOT AT 1, which is the interesting part: rank
 * alone would make dirty -> saving a promotion, and that transition is
 * precisely the text-morph the freeze was built to stop. An autosave firing
 * while the author reads is the COMMON case, and watching the copy rewrite
 * itself mid-sentence is the defect, not a fix for one. 'saving' is also not
 * more urgent than 'dirty' in any sense the author cares about — leaving while
 * dirty loses the work outright, leaving mid-save merely might.
 *
 * 'conflict' is different in kind rather than degree: it is TERMINAL. Autosave
 * has stopped permanently, its copy says so, and nothing will walk it back —
 * so it can never flicker, and the milder text it replaces has become a
 * promise the editor cannot keep.
 *
 * Written as a floor rather than an `=== 'conflict'` check so a later round
 * that wants a fourth reason has one number to move, and has to think about
 * this paragraph while moving it.
 */
const ESCALATION_FLOOR = REASON_RANK.conflict;

/**
 * Promote an open attempt when the live reason has become strictly worse and
 * clears the floor. Returns the attempt UNCHANGED (same reference) otherwise,
 * so the hook's setAttempt bails out without a re-render.
 */
export function escalate(attempt, liveReason) {
  if (!attempt) return attempt;
  const live = rankOf(liveReason);
  if (live < ESCALATION_FLOOR) return attempt;
  if (live <= rankOf(attempt.reason)) return attempt;
  return { ...attempt, reason: liveReason };
}
/**
 * What the dialog should show. While an attempt is open the FROZEN reason
 * wins, whatever the live one has become since; with no attempt open the live
 * one passes through so the hook's other consumers are unaffected.
 */
export function attemptView(attempt, liveReason) {
  return {
    pending: attempt ? attempt.exit : null,
    reason: attempt ? attempt.reason : liveReason,
  };
}

export function useLeaveGuard(state) {
  const router = useRouter();
  const pathname = usePathname();
  // `reason` and `blocked` both come from the shared module, and `blocked` is
  // NOT recomputed here as `reason !== null` — that would be a fourth copy of
  // the rule in the one file whose job is to have none.
  const reason = leaveBlockReason(state);
  const blocked = shouldBlockLeave(state);

  // ONE state for the whole attempt: which exit, and the reason frozen at the
  // moment it opened. `pending` and the shown `reason` are both derived from
  // it, so they can never disagree about whether an attempt is in progress.
  const [attempt, setAttempt] = useState(null);
  const { pending, reason: shownReason } = attemptView(attempt, reason);

  // The listeners below are registered ONCE, so they cannot read `reason` from
  // the render that created them — it would be the reason as of mount, not as
  // of the Back press. This ref is what makes the capture current.
  const reasonRef = useRef(reason);
  useEffect(() => { reasonRef.current = reason; }, [reason]);

  // A worsening reaches an OPEN dialog. Applied to the stored attempt rather
  // than computed per render, so the promotion STICKS: recomputing
  // max(frozen, live) every render would silently drop back to the frozen
  // value the moment the live one receded. escalate() returns the same object
  // when nothing is promoted, so this is a no-op re-render, not a loop.
  useEffect(() => { setAttempt((cur) => escalate(cur, reason)); }, [reason]);

  // Latest values for listeners that are registered once and must not close
  // over a stale render.
  const blockedRef = useRef(blocked);
  useEffect(() => { blockedRef.current = blocked; }, [blocked]);

  // The URL of the editor entry, refreshed on every pathname change. Read at
  // popstate time to re-push the sentinel at the RIGHT address — by then
  // `location.href` is already the entry the user popped BACK to, so it is the
  // wrong thing to read. Deliberately not derived inside the popstate handler.
  const hrefRef = useRef(null);

  // Did WE install a sentinel during this mount? Needed to tell "no sentinel
  // yet" from "our sentinel's marker was wiped" — see the repair below.
  const installedRef = useRef(false);

  // Set just before a confirmed departure so our own listeners stand down. A
  // confirmed leave performs real history movement, which re-enters popstate.
  const leavingRef = useRef(false);

  // What the confirm dialog will do if the author says yes.
  const departRef = useRef(null);

  /**
   * ── THE SENTINEL: INSTALL, AND THE REPAIR THAT IS NOT OPTIONAL ────────────
   *
   * popstate CANNOT be blocked. It fires AFTER the browser has already moved,
   * so there is no preventDefault to reach for. The only workable shape is LET
   * IT MOVE, THEN PULL IT BACK: keep one spare entry of our own on top of the
   * editor's, and when the user pops it, push it straight back and ask.
   *
   * WHAT THAT COSTS, stated rather than discovered later:
   *   · The first Back press is CONSUMED. It opens the dialog instead of
   *     navigating. Confirming then goes back two entries (the sentinel and the
   *     editor) so the author still lands where Back would have taken them.
   *   · FORWARD BEHAVIOUR CHANGES. Re-pushing discards whatever forward entries
   *     existed, so a Back-then-Forward across this editor no longer returns to
   *     where it used to. This is the browser's own pushState semantics, not a
   *     choice available to us.
   *   · It is not prevention. Between the pop and the re-push the browser really
   *     is on the previous entry, for one turn of the event loop.
   *
   * ONLY WHEN `history.length > 1`. With a single entry the Back button is
   * disabled, so nothing needs guarding — and pushing a sentinel would ENABLE
   * Back, creating an affordance whose confirm leads nowhere. Guarding on the
   * length is what keeps the fix from inventing that case.
   *
   * ── THE REPAIR, AND WHY IT IS THE PART MOST LIKELY TO GO WRONG ────────────
   *
   * useEditorSave adopts a newly-created page IN PLACE with
   * `history.replaceState(null, '', '/admin/pages/builder/<id>/edit')` — see the
   * long note at the top of that file for why it must not be a router.replace.
   * That call rewrites THE CURRENT ENTRY, which by then is OUR SENTINEL, and it
   * passes `null` as the state: it wipes our marker off the very entry we
   * pushed. Without the repair below, the guard silently dies the instant a new
   * page is first saved — on the page where loss is TOTAL, because autosave
   * never runs for an unsaved page.
   *
   * So on a pathname change we re-stamp the entry with `replaceState` rather
   * than pushing another sentinel. `installedRef` is what separates the two
   * cases; `history.state` alone cannot, because a wiped sentinel and a
   * never-installed one look identical.
   */
  useEffect(() => {
    if (!blocked) return undefined;

    // `window.history` is written out at each step rather than aliased: these
    // four lines are the whole sentinel lifecycle, and the guard on them reads
    // the source.
    if (!installedRef.current) {
      if (window.history.length > 1) {
        window.history.pushState(SENTINEL, '', window.location.href);
        installedRef.current = true;
      }
    } else if (!isSentinel(window.history.state)) {
      window.history.replaceState(SENTINEL, '', window.location.href);
    }

    hrefRef.current = window.location.href;
    return undefined;
  }, [blocked, pathname]);

  // ── Exit 1: tab close / reload / typed URL ────────────────────────────────
  // Unchanged in behaviour; its condition now comes from the shared module
  // instead of a second copy of the rule. The browser shows its own generic
  // string here — the wording below is only reachable on the other two exits.
  useEffect(() => {
    if (!blocked) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [blocked]);

  // ── Exit 2: the BACK button ───────────────────────────────────────────────
  useEffect(() => {
    const onPopState = () => {
      // A confirmed departure moves history on purpose — do not fight it.
      if (leavingRef.current) return;
      // Nothing to protect. The sentinel entry is spent: this Back press lands
      // the author back on the editor's own entry and the next one leaves. That
      // is the "a Back press is consumed" cost, and it is why the sentinel is
      // only ever installed while there is unsaved work.
      if (!blockedRef.current) return;

      window.history.pushState(SENTINEL, '', hrefRef.current ?? window.location.href);
      departRef.current = () => {
        // Past the sentinel AND past the editor entry, so the author arrives
        // where the single Back press was aiming.
        leavingRef.current = true;
        window.history.go(-2);
      };
      setAttempt(beginAttempt('back', reasonRef.current));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // ── Exit 3: an in-app link (the admin sidebar is the one that matters) ────
  /**
   * CAPTURE phase on `document`, which is the only position that sees a sidebar
   * link before Next's own handler turns it into a soft navigation.
   *
   * That position is also why the exclusions below are not paranoia. Capture on
   * document runs BEFORE every other handler on the page, including
   * CanvasPanel's own capture-phase handler — so without the `data-pb-canvas`
   * check this would swallow ordinary section-selection clicks in the editor
   * canvas, which is the author's main interaction. The canvas already
   * preventDefaults its own links; it owns everything inside it.
   *
   * The rest are the standard set: leaving via a modified click, a middle
   * click, a download, a new tab, or an external host is not this editor losing
   * the author's work — the tab stays open and the tree stays in it.
   */
  useEffect(() => {
    const onClickCapture = (e) => {
      if (!blockedRef.current || leavingRef.current) return;
      if (e.defaultPrevented) return;
      // Modified / non-primary clicks open elsewhere; this tab is not going away.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const a = e.target?.closest?.('a[href]');
      if (!a) return;
      // The canvas owns its own clicks — see the note above.
      if (a.closest('[data-pb-canvas]')) return;
      // New tab / new window (the Preview dialog's link is target="_blank").
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;

      let url;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      // External hosts, and mailto:/tel: (whose origin is "null").
      if (url.origin !== window.location.origin) return;
      // A pure #fragment on the page we are already on is not a departure.
      const strip = (s) => s.split('#')[0];
      if (strip(url.href) === strip(window.location.href)) return;

      e.preventDefault();
      e.stopPropagation();
      const to = `${url.pathname}${url.search}${url.hash}`;
      departRef.current = () => { leavingRef.current = true; router.push(to); };
      setAttempt(beginAttempt('link', reasonRef.current));
    };

    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, [router]);

  const confirmLeave = useCallback(() => {
    const depart = departRef.current;
    departRef.current = null;
    setAttempt(null);
    depart?.();
  }, []);

  const cancelLeave = useCallback(() => {
    departRef.current = null;
    setAttempt(null);
    // Nothing to undo for either exit: the Back case has already been pulled
    // back onto the sentinel, and the link case never navigated.
  }, []);

  // Fires at most once per attempt WITHOUT a one-shot ref, and that is a
  // property of confirmLeave rather than luck: it clears departRef and sets
  // the attempt to null, so the very next render has `pending` null and the
  // predicate is false. Even a re-entry could not double-navigate — depart is
  // read and nulled before it is called.
  //
  // Calls confirmLeave, never departRef directly. There is exactly ONE place
  // that completes a departure and this is not a second one — the manual
  // button and this effect are two ENTRY POINTS into the same function.
  //
  // `blocked` here is the LIVE value, deliberately, not the frozen reason:
  // the freeze governs what the dialog SAYS, and this governs whether there
  // is still anything to say it about.
  useEffect(() => {
    if (shouldAutoComplete({ pending, blocked })) confirmLeave();
  }, [pending, blocked, confirmLeave]);
  // `reason` is the SHOWN one — frozen while an attempt is open. It arrives
  // under the existing name because EditorShell binds it straight to the
  // dialog and this round does not touch that file. `blocked` stays LIVE: the
  // listeners must keep seeing the real state, and only the copy is held.
  return { blocked, reason: shownReason, pending, confirmLeave, cancelLeave };
}
