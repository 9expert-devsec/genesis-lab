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
 * deliberately does NOT convert the two existing call sites: they are
 * high-traffic surfaces (the chat panel and the mobile nav drawer) with no
 * tests holding them, and rewriting them to fix a duplication they already
 * live with is not worth risking in a commit that ships a different feature.
 * Converting them is a clean, mechanical follow-up.
 *
 * Restoring the SAVED value rather than hard-coding `''` is the part that is
 * easy to get wrong: if something else already locked the body, clearing it
 * outright would unlock the page underneath that other surface.
 *
 * @param {boolean} active lock while true; restore when it goes false or the
 *                         component unmounts.
 */
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
