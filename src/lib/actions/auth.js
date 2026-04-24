'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn } from '@/lib/auth/options';

/**
 * Admin login — server action wired to `useActionState`.
 *
 * `signIn` with `redirect: false` throws `AuthError` on bad credentials
 * and returns on success. `redirect()` runs outside the try/catch so its
 * NEXT_REDIRECT signal isn't swallowed.
 */
export async function adminLogin(_prevState, formData) {
  const email    = formData.get('email');
  const password = formData.get('password');

  try {
    await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
    }
    throw err;
  }

  redirect('/admin');
}
