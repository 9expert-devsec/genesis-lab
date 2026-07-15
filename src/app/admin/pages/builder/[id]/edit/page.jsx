import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { canUseAdvanced, canPublish, canManagePreview } from '@/lib/rbac/access';
import { getPageBuilderPageById } from '@/lib/actions/pageBuilder';
import { PageBuilderEditor } from '@/components/pageBuilder/editor/PageBuilderEditor';

export const metadata = { title: 'แก้ไขหน้า Page Builder' };
export const dynamic = 'force-dynamic';

/**
 * Edit an existing builder page. Server component: guards, loads the doc, and
 * resolves the tier flags from the session. The flags shape the UI only — every
 * action re-checks tier server-side, so the UI is never the sole guard.
 *
 * `updatedAt` is handed down as the optimistic-concurrency token for the
 * client's first save (see updatePageBuilderPage).
 */
export default async function EditBuilderPage({ params }) {
  const session = await requirePage('pages');
  const { id } = await params;
  const page = await getPageBuilderPageById(id);
  if (!page) notFound();

  const user = session.user;
  return (
    <PageBuilderEditor
      page={page}
      pageId={id}
      updatedAt={page.updatedAt ?? null}
      tier={{
        canUseAdvanced: canUseAdvanced(user),
        canPublish: canPublish(user),
        canManagePreview: canManagePreview(user),
      }}
    />
  );
}
