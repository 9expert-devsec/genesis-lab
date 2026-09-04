'use client';

import { useEffect } from 'react';

/**
 * Lock body scroll while a modal surface is open.
 *
 * THE SHAPE IS SitePopup's, COPIED NOT REINVENTED — save the previous value,
 * set `hidden`, restore the saved value on cleanup. ChatPanel and
 * PublicHeaderClient both carry that same six lines inline today, and
 * ChatPanel's docstring says why the shape matters: "Two modal patterns in one
 * codebase is how one of them ends up subtly wrong."
 *
 * This exists so the article lightbox does not become a THIRD inline copy. It
 * deliberately does NOT convert the existing inline call sites: they are
 * high-traffic surfaces (the chat panel, the mobile nav drawer, the schedule
 * filter sheet) with no tests holding them, and rewriting them to fix a
 * duplication they already live with is not worth risking in a commit that
 * ships a different feature. Converting them is a clean, mechanical follow-up.
 *
 * Restoring the SAVED value rather than hard-coding `''` is the part that is
 * easy to get wrong: if something else already locked the body, clearing it
 * outright would unlock the page underneath that other surface. The /join-us
 * job dialog had exactly that bug — `document.body.style.overflow = ""` in its
 * cleanup — which is what brought it here.
 *
 * ══ IT IS REF-COUNTED, AND THAT IS NOT THE SAME AS SAVE/RESTORE ═════════════
 * Save/restore handles ONE overlay opening over a surface that locked by some
 * other means. It does not handle two overlays that both use THIS hook:
 *
 *     A opens  → saved = '',       body = hidden
 *     B opens  → saved = 'hidden', body = hidden
 *     B closes → body = 'hidden'                    (still locked, correct)
 *     A closes → body = ''                          (correct, by luck)
 *
 * …but close them in the other order and A's cleanup restores '' while B is
 * still open, and the page scrolls behind an open dialog. Nesting order is not
 * something a component can know about, so the state is counted rather than
 * inferred: the FIRST acquire snapshots and locks, the LAST release restores.
 * Everything in between is a no-op.
 *
 * The counter is module scope — one page, one body, one count. It clamps at
 * zero so an unbalanced release (a component torn down in a way that runs
 * cleanup twice, or a test tearing down a whole document mid-lock) cannot drive
 * it negative and leave the next lock permanently disarmed.
 *
 * ── THE GUTTER ──────────────────────────────────────────────────────────────
 * On a classic-scrollbar platform, `overflow: hidden` removes the document
 * scrollbar and the page gets ~15px wider — every centred thing on it jumps
 * sideways at the moment the dialog opens. The width is MEASURED at lock time
 * rather than assumed, so it is exactly 0 on overlay-scrollbar platforms and
 * this becomes a no-op there instead of a 15px error.
 *
 * `scrollbar-gutter: stable` on the root would be the tidier fix and is NOT
 * used, because this repo does not reserve a gutter anywhere today: turning it
 * on globally would shift every page on the site by the scrollbar width to fix
 * a dialog. KNOWN LIMITATION of the padding approach: `position: fixed`
 * children — the header, the floating dock — are laid out against the viewport,
 * not against the body box, so they are not compensated and can still shift.
 * Everything in normal flow is.
 *
 * ── THE SCROLL POSITION ─────────────────────────────────────────────────────
 * `overflow: hidden` PRESERVES it — unlike the `position: fixed` body trick,
 * which does not, and needs the position restored by hand. It is snapshotted
 * and put back anyway, because "the page is where you left it" is the promise
 * being made and it should not rest on which lock technique is in use. The
 * restore is skipped when nothing moved, and forced to `instant` when it did:
 * globals.css sets `scroll-behavior: smooth` on <html>, so a plain scrollTo
 * would animate the restore.
 */

/** How many surfaces currently hold the lock. */
let depth = 0;

/** What the body looked like before the FIRST of them took it. */
let saved = null;

function acquire() {
  depth += 1;
  if (depth > 1) return; // already locked by someone else; nothing to do

  const body = document.body;
  saved = {
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
    scrollY: window.scrollY,
  };

  // Measured, not assumed. 0 on overlay-scrollbar platforms.
  const gutter = window.innerWidth - document.documentElement.clientWidth;
  if (gutter > 0) body.style.paddingRight = `${gutter}px`;
  body.style.overflow = 'hidden';
}

function release() {
  depth -= 1;
  if (depth > 0) return; // someone else is still holding it
  depth = 0;
  if (!saved) return;

  const body = document.body;
  body.style.overflow = saved.overflow;
  body.style.paddingRight = saved.paddingRight;
  if (window.scrollY !== saved.scrollY) {
    window.scrollTo({ top: saved.scrollY, left: window.scrollX, behavior: 'instant' });
  }
  saved = null;
}

/**
 * @param {boolean} active lock while true; release when it goes false or the
 *                         component unmounts.
 */
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    acquire();
    return release;
  }, [active]);
}

/**
 * The current lock depth. TEST-FACING, and named so nobody mistakes it for API.
 *
 * The ref count is the whole point of this module and it is invisible from the
 * outside: with one overlay open, a correct implementation and a boolean one
 * produce byte-identical DOM. A test that can only read `body.style.overflow`
 * cannot tell them apart at all, and would go green against the bug this hook
 * was rewritten to fix.
 */
export function __scrollLockDepth() {
  return depth;
}
