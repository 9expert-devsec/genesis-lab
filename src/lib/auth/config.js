/**
 * Edge-safe auth config.
 *
 * Imported by both middleware.js (Edge Runtime) and auth/options.js
 * (Node runtime). Must NOT import mongoose, bcrypt, or any Node-only
 * module — Edge runtime rejects dynamic code evaluation that Mongoose
 * relies on.
 *
 * The Credentials provider lives in options.js and is appended to
 * `providers` there. Callbacks here never touch the DB.
 */
export const authConfig = {
  pages: {
    signIn: '/admin/9x-portal',
    error:  '/admin/9x-portal',
  },

  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 /* 8 hours */ },

  callbacks: {
    async authorized({ request, auth: session }) {
      const path = request.nextUrl.pathname;
      // Gate /admin/* except the login page itself
      if (path.startsWith('/admin') && path !== '/admin/9x-portal') {
        return Boolean(session?.user);
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id   = user.id;
        token.role = user.role;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id   = token.id;
        session.user.role = token.role;
        if (token.name) session.user.name = token.name;
      }
      return session;
    },
  },

  providers: [], // Populated in the Node-only options.js
};
