import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';
import { adminLoginSchema } from '@/lib/schemas/admin';
import { authConfig } from './config';

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
      },
      async authorize(raw) {
        const parsed = adminLoginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        await dbConnect();
        const admin = await Admin.findOne({ email, active: true }).lean();
        if (!admin) return null;

        const ok = await bcrypt.compare(password, admin.password);
        if (!ok) return null;

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
