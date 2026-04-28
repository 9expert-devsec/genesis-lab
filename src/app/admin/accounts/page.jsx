/**
 * /admin/accounts — list & manage admin accounts.
 *
 * Server gate: only superadmin (or legacy `owner`) sees this page.
 * Anyone else gets a 404. The same guards live inside every server
 * action that mutates accounts, so this is defense-in-depth, not the
 * only check.
 */

import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth/options';
import { listAdmins } from '@/lib/actions/admin-accounts';
import { AccountsClient } from './_components/AccountsClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'บัญชีผู้ดูแล',
  robots: { index: false, follow: false },
};

const SUPERADMIN_ROLES = new Set(['superadmin', 'owner']);

export default async function AdminAccountsPage() {
  const session = await auth();
  if (!SUPERADMIN_ROLES.has(session?.user?.role)) {
    notFound();
  }

  const admins = await listAdmins();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            บัญชีผู้ดูแล
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            จัดการบัญชีผู้ดูแลระบบ — เฉพาะ superadmin เท่านั้น
          </p>
        </div>
      </div>

      <AccountsClient
        initialAdmins={admins}
        currentUserId={session.user.id}
      />
    </div>
  );
}
