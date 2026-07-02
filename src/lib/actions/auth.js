'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn, signOut, auth } from '@/lib/auth/options';
import { canAccess } from '@/lib/rbac/access';

/**
 * Permission-aware action guard. Pass the page key the action belongs to.
 *
 * Use at the top of any server action that mutates admin data (and any
 * admin-only read). Behavior:
 *   - No session            → throws Error('UNAUTHENTICATED'), `.status = 401`.
 *   - Lacking the page perm  → throws Error('FORBIDDEN'),      `.status = 403`.
 *   - Superadmin (`pages == null`) passes any key.
 *   - `pageKey` omitted → login-only check (legacy behavior). AVOID in new
 *     code; only for actions with no page association (see 3d-2 exceptions).
 *
 * Returns the session so callers that need `session.user` can reuse it.
 * Throws a plain Error (not redirect) — actions aren't render paths; the
 * `.status` lets a route handler map it to an HTTP status if it surfaces.
 */
export async function requireAdmin(pageKey) {
  const session = await auth();
  if (!session?.user) {
    const err = new Error('UNAUTHENTICATED');
    err.status = 401;
    throw err;
  }
  if (pageKey && !canAccess(session.user, pageKey)) {
    const err = new Error('FORBIDDEN');
    err.status = 403;
    throw err;
  }
  return session;
}

/**
 * Admin login — server action wired to `useActionState`.
 *
 * Three outcomes:
 *   1. `{ error: 'อีเมลหรือรหัสผ่าน...' }` — bad creds
 *   2. `{ require2fa: true, email }` — creds OK but admin has 2FA
 *      enabled and didn't supply a TOTP yet (or supplied a wrong one)
 *   3. `redirect('/admin')` — full success
 *
 * The 2FA discrimination relies on typed errors thrown by the
 * credentials provider (TotpRequiredError / TotpInvalidError, code on
 * `err.code`). NextAuth v5 wraps thrown CredentialsSignin in
 * AuthError; we crack it open here.
 */
export async function adminLogin(_prevState, formData) {
  const email    = formData.get('email');
  const password = formData.get('password');
  const totp     = (formData.get('totp') ?? '').toString().trim();

  try {
    await signIn('credentials', {
      email,
      password,
      totp,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      // CredentialsSignin subclasses surface their `code` field on
      // the error chain — check both the wrapper and the cause.
      const code =
        err?.code ??
        err?.cause?.err?.code ??
        err?.cause?.code ??
        '';

      if (code === 'TOTP_REQUIRED') {
        return { require2fa: true, email, error: null };
      }
      if (code === 'TOTP_INVALID') {
        return { require2fa: true, email, error: 'OTP ไม่ถูกต้อง กรุณาลองใหม่' };
      }
      return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
    }
    throw err;
  }

  // Renew the gate cookie so the browser has a fresh 30-min window
  // to re-authenticate if this session later expires.
  const { cookies } = await import('next/headers');
  const jar = await cookies();
  jar.set('admin_gate', '1', {
    httpOnly: true,
    sameSite: 'strict',
    path:     '/admin',
    maxAge:   60 * 30, // 30 min
  });

  redirect('/admin');
}

/**
 * Admin logout — signs out directly and redirects, skipping NextAuth's
 * default "Are you sure?" confirmation page at /api/auth/signout.
 */
export async function logoutAction() {
  await signOut({ redirectTo: '/admin/9x-portal' });
}
