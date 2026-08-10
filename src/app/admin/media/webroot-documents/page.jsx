import Link from 'next/link';

import { requirePage } from '@/lib/rbac/guard';
import { listWebrootReplacements } from '@/lib/actions/webroot-documents';
import { WEBROOT_DOCUMENTS, webrootPublicPath } from '@/lib/webrootDocuments.mjs';
import WebrootDocumentsClient from './_components/WebrootDocumentsClient';

export const metadata = { title: 'เอกสารหน้าเว็บหลัก' };
export const dynamic = 'force-dynamic';

/**
 * /admin/media/webroot-documents — REPLACE the three site-root PDFs.
 *
 * ══ WHY IT IS NESTED UNDER /admin/media RATHER THAN BEING PART OF IT ════════
 *
 * It is its own page because its contract is the EXACT INVERSE of /admin/media:
 * that screen lets an admin choose a filename and refuses to overwrite; this one
 * fixes the filename to one of three and does nothing BUT overwrite. Putting the
 * two behind one UI would mean one screen with two opposite rules about the most
 * destructive thing either can do.
 *
 * It is nested so it inherits the `media` PERMISSION without introducing a new
 * one. MEASURED, not assumed: ADMIN_PAGES registers media as
 * `{ href: '/admin/media', match: 'prefix' }`, and resolvePageKey() takes the
 * longest matching href, so '/admin/media/webroot-documents' resolves to
 * 'media' with no new entry. A new entry would mean a new checkbox in the role
 * editor and a new NAV_GROUPS line to satisfy the rbacNavParity guard — three
 * moving parts for a permission that already exists and already means the right
 * thing: "may replace files this site serves".
 *
 * Deliberately NOT in the sidebar, for the same reason: rbacNavParity asserts
 * every sidebar link is a REGISTERED page, so a NAV_GROUPS entry here would
 * redden it. It is reached by the link on /admin/media.
 *
 * ══ WHAT THE ADMIN CANNOT DO ═══════════════════════════════════════════════
 *
 * Choose a name. Choose a path. Add a fourth document. The list comes from the
 * frozen WEBROOT_DOCUMENTS array, the server action derives every pathname from
 * it, and the upload route independently re-derives the destination from a
 * stored receipt. Three layers, none of which reads a path from this page.
 */
export default async function WebrootDocumentsPage() {
  await requirePage('media');

  const history = await listWebrootReplacements();

  const documents = WEBROOT_DOCUMENTS.map((filename) => ({
    filename,
    publicPath: webrootPublicPath(filename),
  }));

  return (
    <div>
      <div>
        <Link
          href="/admin/media"
          className="text-sm text-9e-slate-dp-50 hover:text-9e-action"
        >
          ← กลับไปจัดการไฟล์
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-9e-navy dark:text-white">
          เอกสารหน้าเว็บหลัก
        </h1>
        <p className="mt-1 text-sm text-9e-slate-dp-50">
          แทนที่ไฟล์ PDF สามรายการที่ให้บริการอยู่ที่รากของเว็บไซต์ —
          ชื่อไฟล์และ URL จะไม่เปลี่ยน เพราะ URL เหล่านี้ถูกพิมพ์อยู่บนเอกสารภายนอก
          การแทนที่จะสำรองไฟล์เดิมไว้ก่อนเสมอ
        </p>
      </div>

      <WebrootDocumentsClient
        documents={documents}
        initialRows={history.ok ? history.rows : []}
        initialPrepared={history.ok ? (history.prepared ?? []) : []}
        initialError={history.ok ? '' : (history.error ?? '')}
      />
    </div>
  );
}
