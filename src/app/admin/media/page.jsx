import Link from 'next/link';

import { requirePage } from '@/lib/rbac/guard';
import { listMediaCategories } from '@/lib/actions/media';
import MediaClient from './_components/MediaClient';

export const metadata = { title: 'จัดการไฟล์' };
export const dynamic = 'force-dynamic';

/**
 * /admin/media — v2: browse (paginated), upload, copy URL, delete.
 *
 * Auth is the SAME as every other admin page: middleware, then the NextAuth
 * callback, then requirePage() here. No new mechanism — and `deleteMediaFile`
 * guards on the same page key through requirePageAction(), so nothing about the
 * destructive action is reachable by anyone who could not already see this page.
 *
 * The category list is fetched server-side for the first paint so the tabs are
 * there immediately; the client refetches on upload, when a new category may
 * have appeared. `counts` rides along from the same walk — it is what turns the
 * paginated list's "แสดง 50" into "แสดง 50 จาก 81".
 */
export default async function MediaPage() {
  await requirePage('media');

  const { categories, counts, error } = await listMediaCategories();

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

        {/*
          The only way in to the site-root replace screen. It is NOT a sidebar
          entry on purpose: rbacNavParity asserts every NAV_GROUPS link is a
          REGISTERED page, and that screen deliberately has no page key of its
          own — it inherits `media` by href prefix. A link here costs nothing
          and keeps the registry at 38 == 38.
        */}
        <Link
          href="/admin/media/webroot-documents"
          className="mt-3 inline-block text-sm text-9e-action hover:underline"
        >
          เอกสารหน้าเว็บหลัก (แทนที่ไฟล์ PDF สามรายการที่รากเว็บไซต์) →
        </Link>
      </div>

      <MediaClient
        initialCategories={categories ?? []}
        initialCounts={counts ?? {}}
        initialError={error ?? ''}
      />
    </div>
  );
}
