import { requirePage } from '@/lib/rbac/guard';
import { listMediaCategories } from '@/lib/actions/media';
import MediaClient from './_components/MediaClient';

export const metadata = { title: 'จัดการไฟล์' };
export const dynamic = 'force-dynamic';

/**
 * /admin/media — v1: browse, upload, copy URL.
 *
 * Auth is the SAME as every other admin page: middleware, then the NextAuth
 * callback, then requirePage() here. No new mechanism.
 *
 * The category list is fetched server-side for the first paint so the tabs are
 * there immediately; the client refetches on upload, when a new category may
 * have appeared.
 */
export default async function MediaPage() {
  await requirePage('media');

  const { categories, error } = await listMediaCategories();

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          จัดการไฟล์
        </h1>
        <p className="mt-1 text-sm text-9e-slate-dp-50">
          อัปโหลดไฟล์และคัดลอกลิงก์เพื่อใช้ในบทความหรือหน้าเว็บ — ไฟล์จะพร้อมใช้งานที่{' '}
          <code className="rounded bg-9e-action/10 px-1 py-0.5 text-xs text-9e-action">
            /files/&lt;หมวดหมู่&gt;/&lt;ชื่อไฟล์&gt;
          </code>{' '}
          ทันทีหลังอัปโหลด
        </p>
      </div>

      <MediaClient initialCategories={categories ?? []} initialError={error ?? ''} />
    </div>
  );
}
