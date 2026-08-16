import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getRegistrationById } from '@/lib/actions/registrations';
import { RegistrationDetailClient } from '../_components/RegistrationDetailClient';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { refNo } from '@/lib/refNo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `ใบสมัคร ${refNo(id)}` };
}

export default async function Page({ params }) {
  await requirePage('registrations');

  const { id } = await params;
  const doc = await getRegistrationById(id);
  if (!doc) notFound();

  /**
   * THE HISTORY PANEL IS RENDERED HERE AND HANDED IN AS A SLOT.
   *
   * `RecordHistory` is a SERVER component: it awaits `auth()` and reads the
   * audit collection. A client component cannot mount one, so it cannot simply
   * move inside the detail screen's ประวัติการดำเนินการ tab panel.
   *
   * Rendering it here and passing the resulting NODE down is what makes the tab
   * cost nothing. The alternative — the client fetching its own history when the
   * tab is selected — would be a round trip per switch, would need a server
   * action taking a `menu` the client chose, and would hand the browser a way to
   * ask for a menu the viewer may not see. None of that is worth a tab.
   *
   * `menu` and `entity` stay written HERE, in the mount point — never derived
   * from the URL or from client state. The reader re-checks canAccess regardless.
   *
   * `defaultOpen` because the panel now HAS a tab of its own: a reader who has
   * clicked ประวัติการดำเนินการ has already asked the question the accordion
   * would ask again.
   */
  return (
    <RegistrationDetailClient
      doc={doc}
      history={(
        <RecordHistory
          menu="registrations"
          entity="public"
          recordId={String(doc._id)}
          defaultOpen
          variant="feed"
          title="ประวัติการดำเนินการ"
          description="บันทึกการดำเนินการของผู้ดูแลระบบกับใบสมัครนี้"
          /**
           * THE DOCUMENT'S OWN CREATION FACTS, for the feed's synthesised oldest
           * entry — written HERE, at the mount point, exactly like `menu` and
           * `entity`, and for the same reason: they come off the document this
           * page already loaded and nothing inside RecordHistory can read it.
           *
           * NOTHING IN THE AUDIT LOG RECORDS A CREATION. That log records ADMIN
           * actions and a customer submitting a form is not one, so the entry
           * cannot come from the trail — it comes from `createdAt` and `source`
           * on the record itself, which makes it the record stating its own
           * origin rather than an invented event. The feed marks it as
           * document-derived in both words and markup, and suppresses it when
           * the list is truncated.
           */
          origin={{
            createdAt: doc.createdAt,
            source: doc.source ?? 'web',
            label: 'ได้รับใบสมัคร',
          }}
        />
      )}
    />
  );
}