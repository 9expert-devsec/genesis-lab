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
    path: `/preview/${slug}`, // scoped to this page's route only
    maxAge: signed.maxAge,
  });

  // redirect() throws internally — keep it last, outside any try/catch.
  redirect(`/preview/${slug}`);
}
