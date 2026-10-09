'use server';

/**
 * Preview access — the form-submit action behind /preview/[slug].
 *
 * PUBLIC (no session): it delegates to verifyPreviewPassword, which owns the
 * bcrypt compare and the 5-try / 15-minute lockout, then mints the signed,
 * slug-scoped session cookie. The password never enters a URL and is never
 * echoed back.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyPreviewPassword, getPageBuilderPageBySlugAny } from '@/lib/actions/pageBuilder';
import { signPreviewCookie, previewCookieName } from '@/lib/pageBuilder/previewSession';

export async function submitPreviewPassword(_prevState, formData) {
  const slug = String(formData.get('slug') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!slug) return { error: 'ไม่พบหน้าเพจ' };

  // Distinct Thai states (wrong password / locked out / expired / revoked)
  // all originate here — see verifyPreviewPassword.
  const res = await verifyPreviewPassword(slug, password);
  if (!res?.ok) return { error: res?.error ?? 'รหัสผ่านไม่ถูกต้อง' };

  // Re-read the preview block so the cookie is signed against the CURRENT
  // password material (a rotate/revoke between verify and sign must not mint
  // a stale-but-valid cookie).
  const page = await getPageBuilderPageBySlugAny(slug);
  const signed = signPreviewCookie(slug, page?.preview ?? {});
  if (!signed) return { error: 'ไม่สามารถเริ่มเซสชันพรีวิวได้' };

  const jar = await cookies();
  jar.set(previewCookieName(slug), signed.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    /**
     * ── `Path=/`, UP FROM `/preview/${slug}` ──────────────────────────────
     * MEASURED, in headless Chrome, with a cookie minted exactly as this
     * action mints one and set with the old attributes:
     *
     *   SENT      /preview/claude-duo
     *   NOT SENT  /registration/bundle/step-1?…&preview=1
     *   NOT SENT  /api/registration/bundle?preview=1
     *
     * An unlocked author clicking a bundle's register button therefore met
     * the preview gate's refusal screen every time. The gate was correct and
     * the cookie simply never arrived: not a name mismatch, not a signature
     * or expiry failure, not a bad read — the browser does not transmit a
     * cookie outside its Path.
     *
     * ── WHY WIDENING IT COSTS NO SECURITY ────────────────────────────────
     * Path was never what made this cookie safe, and the three things that do
     * are all untouched:
     *
     *   · the NAME is `pbprev_<sha256(slug)>`, so a cookie minted for one page
     *     is invisible to every other page's reader — `/preview/other` looks
     *     up a different name and finds nothing;
     *   · the SIGNATURE covers slug + passwordHash + passwordUpdatedAt + exp
     *     and is verified against the CURRENT stored block on every request,
     *     so a rotate or a revoke invalidates it immediately;
     *   · `httpOnly` keeps it away from script, and `sameSite: 'lax'` keeps it
     *     off cross-site requests. The wizard and its POST are same-site.
     *
     * Path only decides which REQUESTS carry it. Widening it transmits the
     * cookie to more same-origin paths; it authorises nothing, because every
     * reader must still call `verifyPreviewCookie`, and there are exactly two
     * (this page's route and the bundle preview gate).
     *
     * ── WHY NOT A SECOND, NARROWER COOKIE ────────────────────────────────
     * The obvious alternative — mint an extra cookie scoped to the wizard —
     * needs TWO more paths (`/registration/bundle` and
     * `/api/registration/bundle`), so two more cookies, each with its own
     * lifetime and its own revocation story to keep in step with this one.
     * And this action cannot know whether the page it is unlocking even
     * contains a bundle. Three cookies to avoid widening one, with no
     * security gained, is the worse trade.
     *
     * A SESSION UNLOCKED BEFORE THIS CHANGE keeps its old narrow cookie and
     * will still be refused by the wizard; entering the password once more
     * mints the wide one. No migration, and nothing breaks in the meantime.
     */
    path: '/',
    maxAge: signed.maxAge,
  });

  // redirect() throws internally — keep it last, outside any try/catch.
  redirect(`/preview/${slug}`);
}
