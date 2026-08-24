import { notFound } from "next/navigation";
import { requirePage } from "@/lib/rbac/guard";
import {
  canUseAdvanced,
  canPublish,
  canManagePreview,
} from "@/lib/rbac/access";
import { getPageBuilderPageById } from "@/lib/actions/pageBuilder";
import { catalogueOrEmpty } from "@/lib/pageBuilder/courseCatalogue";
import { PageBuilderEditor } from "@/components/pageBuilder/editor/PageBuilderEditor";

export const metadata = { title: "แก้ไขหน้า Page Builder" };
export const dynamic = "force-dynamic";

/**
 * Edit an existing builder page. Server component: guards, loads the doc, and
 * resolves the tier flags from the session. The flags shape the UI only — every
 * action re-checks tier server-side, so the UI is never the sole guard.
 *
 * `updatedAt` is handed down as the optimistic-concurrency token for the
 * client's first save (see updatePageBuilderPage).
 */
export default async function EditBuilderPage({ params }) {
  const session = await requirePage("pages");
  const { id } = await params;
  const page = await getPageBuilderPageById(id);
  if (!page) notFound();

  const user = session.user;

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
      page={page}
      pageId={id}
      updatedAt={page.updatedAt ?? null}
      currentUserName={user?.name ?? ""}
      courses={courses}
      tier={{
        canUseAdvanced: canUseAdvanced(user),
        canPublish: canPublish(user),
        canManagePreview: canManagePreview(user),
      }}
    />
  );
}
