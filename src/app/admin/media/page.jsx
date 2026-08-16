import { requirePage } from '@/lib/rbac/guard';
import { listMediaCategories } from '@/lib/actions/media';
import { WEBROOT_DOCUMENTS, webrootPublicPath } from '@/lib/webrootDocuments.mjs';
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
      </div>

      {/*
        ── THE ONLY WAY IN TO THE SITE-ROOT REPLACE SCREEN ────────────────────

        It is NOT a sidebar entry on purpose: rbacNavParity asserts every
        NAV_GROUPS link is a REGISTERED page, and that screen deliberately has
        no page key of its own — it inherits `media` by href prefix. A nav entry
        would report as `nav-not-registered`; an entry here costs nothing and
        keeps the registry at 38 == 38.

        It USED TO BE A BARE <Link> under the page description — one line of
        blue text, below the fold of the eye, on a screen whose whole visual
        weight is the file browser underneath. The route it leads to is the only
        way to replace three PDFs whose URLs are printed on external documents,
        and it read as a footnote. It is a card now, above the browser, so the
        entry point looks like the thing it opens.

        THE THREE FILENAMES ARE NOT WRITTEN HERE. They come from
        WEBROOT_DOCUMENTS, the same frozen list the rewrites, the upload target
        and the models all read, so this panel cannot drift from what is
        actually published.
      */}
      <section className="mt-5 rounded-9e-lg border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]">
        <h2 className="text-base font-bold text-9e-navy dark:text-white">
          เอกสารหน้าเว็บหลัก
        </h2>
        <p className="mt-1 text-sm text-9e-slate-dp-50">
          จัดการไฟล์ PDF ที่เผยแพร่อยู่ที่รากของเว็บไซต์ — แทนที่ตัวไฟล์ได้ โดยชื่อไฟล์และ URL ไม่เปลี่ยน
        </p>

        <ul className="mt-3 space-y-1">
          {WEBROOT_DOCUMENTS.map((filename) => (
            <li key={filename}>
              <code className="rounded bg-9e-action/10 px-1 py-0.5 text-xs text-9e-action">
                {webrootPublicPath(filename)}
              </code>
            </li>
          ))}
        </ul>

        <Link
          href="/admin/media/webroot-documents"
          className="mt-4 inline-flex items-center gap-1.5 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          จัดการเอกสารหน้าเว็บหลัก
        </Link>
      </section>

      <MediaClient
        initialCategories={categories ?? []}
        initialCounts={counts ?? {}}
        initialError={error ?? ''}
      />
    </div>
  );
}
