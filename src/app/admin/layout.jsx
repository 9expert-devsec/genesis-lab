import { headers } from 'next/headers';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminContentWrapper } from '@/components/layout/AdminContentWrapper';
import { auth } from '@/lib/auth/options';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';

export const metadata = {
  title: { default: 'Admin', template: '%s · Admin · 9Expert' },
  robots: { index: false, follow: false },
};

const LOGIN_PATH = '/admin/9x-portal';

/**
 * Admin layout.
 *
 * The login page renders bare — no sidebar, no auth check. Every other
 * /admin/* route gets the sidebar with the live session. We detect
 * which one we're on by reading the `x-pathname` header that the
 * middleware injects on each forwarded request.
 *
 * Auth gating still happens at three layers:
 *   1. Edge middleware (404 / knock check)
 *   2. NextAuth `authorized` callback (handled by middleware via the
 *      auth() wrapper)
 *   3. Per-page checks (e.g. `/admin/accounts` calls `notFound()` for
 *      non-superadmin)
 * The layout-level redirect below is a belt-and-suspenders fallback —
 * by the time a request reaches here, middleware has already run.
 */
export default async function AdminLayout({ children }) {
  const h = await headers();
  const pathname = h.get('x-pathname') ?? '';
  const isLoginPage = pathname === LOGIN_PATH;

  // Login page: render the form chrome-free.
  if (isLoginPage) {
    return <>{children}</>;
  }

  const session = await auth();
  const user = session?.user ?? null;

  // ── THE AVATAR COMES FROM MONGO, NOT FROM THE SESSION ────────────────────
  // Deliberate, and it costs one indexed lookup per admin page load.
  //
  // THE ALTERNATIVE, AND WHY IT IS WRONG HERE: putting `imagePublicId` in the
  // JWT. src/lib/auth/config.js copies fields token → session with NO database
  // access (that file runs on the Edge for middleware), so a session field is
  // only as fresh as the token — and the token refreshes on `updateAge`, 16
  // hours. This repo already documents that staleness for `pages`: a permission
  // change does not reach a logged-in admin until the token turns over. That is
  // tolerable for permissions, which change rarely and are enforced server-side
  // anyway. It is not tolerable for a photo the admin just uploaded and is
  // looking at on the next screen: "I changed it and nothing happened" for up
  // to 16 hours, with no way to force it but signing out.
  //
  // The cost is the smallest read available: one field, by the unique `email`
  // index, `.lean()`. This layout is ALREADY dynamic — it reads `headers()` for
  // x-pathname — so nothing cacheable is being given up to add it.
  let userImagePublicId = null;
  if (user?.email) {
    try {
      await dbConnect();
      const me = await Admin.findOne({ email: user.email }).select('imagePublicId').lean();
      userImagePublicId = me?.imagePublicId ?? null;
    } catch {
      // A failed lookup must not take out the whole admin chrome. `null` is a
      // complete, correct value here — avatarUrl renders the bundled default —
      // so the rail degrades to "no photo" rather than to a 500.
    }
  }

  // h-screen + overflow-hidden on the outer row pins the chrome to the
  // viewport; <main> owns its own overflow-y-auto so the content area
  // scrolls independently and the document/body never grow a scrollbar.
  // The sidebar is full-height with its own internal scroll (handled
  // inside <AdminSidebar />).
  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        pages={user?.pages ?? []}                          // array, or null = all (superadmin)
        isSuperadmin={user?.isSuperadmin ?? false}
        roleKey={user?.roleKey ?? null}
        roleName={user?.roleName ?? user?.roleKey ?? null}
        roleColor={user?.roleColor ?? null}
        userName={user?.name ?? null}
        userEmail={user?.email ?? null}
        userImagePublicId={userImagePublicId}
      />
      <main className="h-screen flex-1 overflow-y-auto bg-[var(--page-bg)]">
        <AdminContentWrapper>{children}</AdminContentWrapper>
      </main>
    </div>
  );
}
