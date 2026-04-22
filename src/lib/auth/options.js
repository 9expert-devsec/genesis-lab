import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';
import { adminLoginSchema } from '@/lib/schemas/admin';

/**
 * NextAuth v5 (Auth.js) configuration.
 *
 * Exposes `auth`, `handlers`, `signIn`, `signOut`.
 *   - `handlers`    → wire into /api/auth/[...nextauth]/route.js
 *   - `auth()`      → call in Server Components / Route Handlers to read session
 *   - `signIn/Out`  → Server Actions for login/logout flows
 *
 * Strategy: JWT sessions (no DB session store) — fast on Vercel Edge.
 * Credentials provider validates against the internal Admin collection.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 /* 8 hours */ },

  pages: {
    signIn: '/admin/login',
    error:  '/admin/login',
  },

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

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id   = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id   = token.id;
        session.user.role = token.role;
      }
      return session;
    },
    async authorized({ request, auth: session }) {
      const path = request.nextUrl.pathname;
      // Gate /admin/* except /admin/login
      if (path.startsWith('/admin') && path !== '/admin/login') {
        return Boolean(session?.user);
      }
      return true;
    },
  },
});
