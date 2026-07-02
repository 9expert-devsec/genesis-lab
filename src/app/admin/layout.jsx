import { headers } from 'next/headers';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminContentWrapper } from '@/components/layout/AdminContentWrapper';
import { auth } from '@/lib/auth/options';

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
      />
      <main className="h-screen flex-1 overflow-y-auto bg-[var(--page-bg)]">
        <AdminContentWrapper>{children}</AdminContentWrapper>
      </main>
    </div>
  );
}
