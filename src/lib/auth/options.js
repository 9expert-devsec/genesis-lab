import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';
import { adminLoginSchema } from '@/lib/schemas/admin';
import { verifyTotp } from '@/lib/totp';
import { authConfig } from './config';

/**
 * Distinguishable error so the login form can flip to the OTP step
 * instead of showing a generic "invalid credentials" message when the
 * admin's email + password matched but they need to provide a TOTP.
 *
 * NextAuth v5 surfaces the `code` field via `error.cause.err.code` on
 * the AuthError thrown by signIn(); the server action checks for it.
 */
class TotpRequiredError extends CredentialsSignin {
  code = 'TOTP_REQUIRED';
}
class TotpInvalidError extends CredentialsSignin {
  code = 'TOTP_INVALID';
}

/**
 * NextAuth v5 (Auth.js) — Node-runtime instance.
 *
 * Extends the edge-safe `authConfig` with the Credentials provider,
 * which uses Mongoose + bcrypt and therefore cannot run on the Edge.
 *
 * Exposes `auth`, `handlers`, `signIn`, `signOut`.
 *   - `handlers`    → wire into /api/auth/[...nextauth]/route.js
 *   - `auth()`      → call in Server Components / Route Handlers to read session
 *   - `signIn/Out`  → Server Actions for login/logout flows
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Admin credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
        totp:     { label: 'OTP',      type: 'text' },
      },
      async authorize(raw) {
        const parsed = adminLoginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password, totp } = parsed.data;

        await dbConnect();
        // Need totpSecret here even though it's `select: false` on the
        // schema — it's the actual secret we verify against.
        const admin = await Admin.findOne({ email, active: true })
          .select('+totpSecret')
          .lean();
        if (!admin) return null;

        const ok = await bcrypt.compare(password, admin.password);
        if (!ok) return null;

        // 2FA gate — if enabled, require + verify a fresh TOTP before
        // we hand back the user object. Throwing a typed error lets
        // the login form distinguish "wrong password" (return null →
        // generic CredentialsSignin) from "needs OTP" / "OTP wrong".
        if (admin.totpEnabled) {
          if (!totp) throw new TotpRequiredError();
          if (!verifyTotp(totp, admin.totpSecret)) throw new TotpInvalidError();

          Admin.updateOne(
            { _id: admin._id },
            { $set: { totpVerifiedAt: new Date() } }
          ).catch(() => {});
        }

        // Best-effort lastLogin update — do not block auth on failure
        Admin.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } })
          .catch(() => {});

        return {
          id:    String(admin._id),
          email: admin.email,
          name:  admin.name,
          role:  admin.role,
        };
      },
    }),
  ],
});
