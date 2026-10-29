import Link from 'next/link';
import { requirePage } from '@/lib/rbac/guard';
import { listTaxonomy } from '@/lib/courses/privateTaxonomyStore';
import { PrivateTaxonomyClient } from './PrivateTaxonomyClient';

export const metadata = {
  title: 'โปรแกรม/Skill แบบ Private',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /admin/courses/private-taxonomy — custom private programs and skills.
 *
 * Under /admin/courses ON PURPOSE: admin access is resolved by path prefix and
 * unknown admin paths deny by default (lib/rbac/access#canAccessPath), so this
 * route inherits the `courses` permission with no new RBAC key. It is reached
 * from the Private Courses section and the private course editor.
 */
export default async function PrivateTaxonomyPage() {
  await requirePage('courses');

  let items = [];
  try {
    items = (await listTaxonomy()).map((i) => ({
      _id: String(i._id),
      kind: i.kind,
      name: i.name ?? '',
      logoUrl: i.logoUrl ?? '',
      color: i.color ?? '',
    }));
  } catch (err) {
    console.error('[admin/private-taxonomy] read failed', err?.message);
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/courses" className="text-sm text-9e-action hover:underline">
          ← หลักสูตร
        </Link>
        <h1 className="mt-2 text-xl font-bold text-[var(--text-primary)]">โปรแกรม / Skill แบบ Private</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          ใช้กับ Private Course เท่านั้น — เก็บใน Genesis ไม่ส่งไป MSDB และไม่แสดงในรายการสาธารณะใดๆ
          สีของโปรแกรมใช้เป็นพื้นหลังส่วน hero ของหน้าหลักสูตร
        </p>
      </div>
      <PrivateTaxonomyClient items={items} />
    </div>
  );
}
