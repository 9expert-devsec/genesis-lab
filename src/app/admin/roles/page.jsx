import { requirePage } from '@/lib/rbac/guard';
import { listRolesFull } from '@/lib/actions/roles';
import { RolesClient } from './_components/RolesClient';
import { ADMIN_PAGES } from '@/lib/rbac/pages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'จัดการบทบาท (Roles)',
  robots: { index: false, follow: false },
};

export default async function RolesPage() {
  await requirePage('roles');

  const roles = await listRolesFull();

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">จัดการบทบาท</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          สร้างและกำหนดสิทธิ์การเข้าถึงหน้าต่าง ๆ ให้แต่ละบทบาท — เฉพาะ superadmin เท่านั้น
        </p>
      </div>

      {/* Pass the grouped page registry so the checkbox grid mirrors the sidebar. */}
      <RolesClient initialRoles={roles} pageGroups={ADMIN_PAGES} />
    </div>
  );
}
