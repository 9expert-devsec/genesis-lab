import { requirePage } from '@/lib/rbac/guard';
import { canUseAdvanced, canPublish, canManagePreview } from '@/lib/rbac/access';
import { pageBuilderSchema } from '@/lib/schemas/pageBuilder';
import { PLACEHOLDER_SLUG, PLACEHOLDER_TITLE } from '@/lib/pageBuilder/publishReadiness';
import { PageBuilderEditor } from '@/components/pageBuilder/editor/PageBuilderEditor';
import { catalogueOrEmpty } from '@/lib/pageBuilder/courseCatalogue';

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

  /**
   * ROUND 47 — the course catalogue, handed down as a read-only prop.
   *
   * The same shape as `tier` directly below it, and for the same reason: the
   * server resolves it, the client only reads it. A PROJECTION —
   * {course_id, course_name} — and never the full rows; catalogueOrEmpty owns
   * that decision and carries the 194.6x that forced it.
   *
   * INERT THIS ROUND. Nothing consumes it yet — the picker that will is step 3.
   * Shipping it alone is deliberate: it makes “is the projection what actually
   * crosses?” measurable before any UI depends on the answer.
   *
   * It is NOT a second source of truth about courses. resolveBuilderSectionData
   * decides whether an authored code resolves and the editor's warnings read
   * that alone; this is a list to choose FROM. The two are read at different
   * moments through different caches and may disagree, and disagreement is
   * harmless by construction: a code in the catalogue that does not resolve
   * still warns, and a code absent from the catalogue still displays and still
   * saves. Neither can silence the other because only one of them speaks.
   *
   * catalogueOrEmpty FAILS OPEN, which is safe for exactly that reason: an
   * empty catalogue costs an author the convenience of a list and costs them no
   * correctness. An admin fixing a heading must not be blocked by the course API.
   */
  const courses = await catalogueOrEmpty();

  return (
    <PageBuilderEditor
      page={blank}
      pageId={null}
      updatedAt={null}
      currentUserName={user?.name ?? ''}
      courses={courses}
      tier={{
        canUseAdvanced: canUseAdvanced(user),
        canPublish: canPublish(user),
        canManagePreview: canManagePreview(user),
      }}
    />
  );
}
