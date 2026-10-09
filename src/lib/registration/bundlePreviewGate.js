import { cookies } from 'next/headers';
import { getPageBuilderPageById } from '@/lib/actions/pageBuilder';
import { previewCookieName, verifyPreviewCookie } from '@/lib/pageBuilder/previewSession';
import { composeWorkingView } from '@/lib/pageBuilder/draftState';

/**
 * THE ONE PLACE A BUNDLE REQUEST IS ALLOWED INTO PREVIEW MODE.
 *
 * ── WHY IT IS ITS OWN MODULE ───────────────────────────────────────────────
 * Two callers need this answer — the wizard's server half and the registration
 * route — and they must not answer it twice. A second copy is how one surface
 * ends up accepting a cookie the other rejects, and the cheaper of the two
 * mistakes (the route being laxer than the wizard) is a real write against
 * draft content.
 *
 * ── THE FLAG ASKS; THE COOKIE DECIDES ──────────────────────────────────────
 * `?preview=1` says WHICH document is meant. It grants nothing. This function
 * re-asks the preview question from scratch, against the page's own current
 * preview material, on every request — not "they got past /preview once, so
 * they are fine". The four checks are `/preview/[slug]`'s, in its order:
 *
 *   1. the page exists at all
 *   2. preview is ENABLED and has a password — an author who switched preview
 *      off has revoked every outstanding cookie
 *   3. the link has not EXPIRED
 *   4. the cookie verifies for THIS page's slug
 *
 * Check 4 is slug-scoped by construction: the cookie's NAME is a hash of the
 * slug and its signature covers the password hash and the moment that password
 * last changed. A cookie minted for another page, or before a rotation, cannot
 * satisfy it. The page id in the URL therefore buys nothing on its own — the
 * caller must hold a cookie for the slug that id resolves to.
 *
 * ── FAILURE IS A REFUSAL, NEVER A FALLBACK ────────────────────────────────
 * `{ ok: false }` means the caller must refuse, and both callers do. Quietly
 * continuing on the published path would turn an unauthorised preview into a
 * REAL registration against a REAL promotion — which is exactly the hole that
 * existed between 1c77b6ce (the card started emitting `?preview=1`) and this
 * commit, where the flag was emitted and then ignored by both readers.
 */
export async function resolveBundlePreviewPage(pageId) {
  if (!pageId) return { ok: false, reason: 'no-page' };

  // The FULL document, draft included. This is the only read in the bundle
  // flow not restricted to published pages, which is why every gate below
  // stands between it and its caller — and why it lives here rather than
  // being open-coded at two call sites.
  const page = await getPageBuilderPageById(String(pageId));
  if (!page) return { ok: false, reason: 'no-page' };

  const pv = page.preview ?? {};
  if (!pv.enabled || !pv.passwordHash) return { ok: false, reason: 'disabled' };

  const now = Date.now();
  const expireAt = pv.expireDate ? new Date(pv.expireDate).getTime() : null;
  if (expireAt !== null && !Number.isNaN(expireAt) && expireAt < now) {
    return { ok: false, reason: 'expired' };
  }

  const jar = await cookies();
  const cookie = jar.get(previewCookieName(page.slug))?.value;
  if (!cookie || !verifyPreviewCookie(cookie, page.slug, pv, now)) {
    return { ok: false, reason: 'locked' };
  }

  /**
   * THE SAME COMPOSITION `/preview/[slug]` RENDERS, so the wizard reads the
   * document the author was just looking at rather than a second
   * interpretation of "the draft".
   *
   * `_id` IS PUT BACK, for the reason 1c77b6ce recorded at the preview route:
   * `composeWorkingView` returns the editable surface and `_id` is in neither
   * key list, while everything downstream here is keyed on (pageId,
   * sectionId). A view without an id is a view nothing can be looked up by.
   */
  return { ok: true, page: { ...composeWorkingView(page), _id: page._id } };
}
