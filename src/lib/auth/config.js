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

  session: {
    strategy: 'jwt',
    maxAge:   60 * 60 * 72,  // absolute timeout: 72 h — token invalid after this regardless of activity
    updateAge: 60 * 60 * 16, // idle timeout: reissue token every 16 h; if user is idle longer, token expires
  },

  callbacks: {
    // NO DB access here — this file runs on the Edge (middleware.js). The
    // RBAC fields (roleKey/isSuperadmin/pages) are resolved once in
    // options.js authorize() (Node runtime) and only copied through here.
    //
    // Staleness (documented, not fixed in Phase 2): `pages` is baked into
    // the JWT at login, so a role-permission edit (Phase 5 UI) won't reach
    // already-logged-in admins until their token refreshes (updateAge = 16h)
    // or they re-login. Acceptable for this app's cadence. If immediate
    // propagation is later needed: (a) re-fetch the role in `jwt` when
    // `trigger === 'update'` and call unstable_update() after edits, or
    // (b) shorten updateAge. Implement nothing now.
    async jwt({ token, user }) {
      if (user) {
        token.id           = user.id;
        token.name         = user.name;
        token.roleKey      = user.roleKey;
        token.roleName     = user.roleName;
        token.roleColor    = user.roleColor;
        token.isSuperadmin = user.isSuperadmin;
        token.pages        = user.pages;   // array | null
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id   = token.id;
        if (token.name) session.user.name = token.name;
        session.user.roleKey      = token.roleKey;
        session.user.roleName     = token.roleName;
        session.user.roleColor    = token.roleColor;
        session.user.isSuperadmin = token.isSuperadmin;
        session.user.pages        = token.pages; // array | null
      }
      return session;
    },
  },

  providers: [], // Populated in the Node-only options.js
};
