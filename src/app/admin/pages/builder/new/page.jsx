import { requirePage } from '@/lib/rbac/guard';
import { canUseAdvanced, canPublish, canManagePreview } from '@/lib/rbac/access';
import { pageBuilderSchema } from '@/lib/schemas/pageBuilder';
import { PLACEHOLDER_SLUG, PLACEHOLDER_TITLE } from '@/lib/pageBuilder/publishReadiness';
import { PageBuilderEditor } from '@/components/pageBuilder/editor/PageBuilderEditor';

export const metadata = { title: 'สร้างหน้า Page Builder' };
export const dynamic = 'force-dynamic';

/**
 * New builder page. Server component: guards, and seeds a blank working tree
 * from the schema's own defaults (never a hand-written literal — the schema is
 * the single source, §4.6).
 *
 * There is no doc and no id yet, so the editor does NOT autosave here: an
 * abandoned "new" page must leave nothing behind. The first explicit save
 * creates the page and the editor adopts its id in place, without navigating.
 */
export default async function NewBuilderPage() {
  const session = await requirePage('pages');
  const user = session.user;

  // Defaults straight from the schema, so a blank page can never drift from it.
  // The placeholder slug/title are shared with the publish-readiness check, so
  // an untouched page can't be published (see publishReadiness.js).
  const blank = pageBuilderSchema.parse({ slug: PLACEHOLDER_SLUG, title: PLACEHOLDER_TITLE });

  return (
    <PageBuilderEditor
      page={blank}
      pageId={null}
      updatedAt={null}
      tier={{
        canUseAdvanced: canUseAdvanced(user),
        canPublish: canPublish(user),
        canManagePreview: canManagePreview(user),
      }}
    />
  );
}
