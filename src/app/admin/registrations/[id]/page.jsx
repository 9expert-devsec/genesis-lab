import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getRegistrationById } from '@/lib/actions/registrations';
import { RegistrationDetailClient } from '../_components/RegistrationDetailClient';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { refNo } from '@/lib/refNo';
import { PUBLIC_SCHEDULE_STATUSES, listSchedulesByCourse } from '@/lib/api/schedules';
import { getCourseByCodeInsensitive } from '@/lib/api/public-courses';

/**
 * THE ROUNDS THIS REGISTRATION MAY BE MOVED TO, resolved HERE on the server.
 *
 * ── WHY NOT IN THE CLIENT ─────────────────────────────────────────────────
 * `RegistrationDetailClient` is `'use client'`. A fetch there would run in the
 * browser, once per viewer, with none of the Data Cache this page shares —
 * exactly the reasoning the in-house page already records for `courses`.
 *
 * ── THE SAME SOURCE OF TRUTH THE PUBLIC WIZARD USES ───────────────────────
 * `listSchedulesByCourse`, the same call `RegisterPageContent` makes, so the
 * admin never sees a set of rounds the booking flow does not have. The
 * registration stores a course_id CODE, so the course ObjectId is resolved
 * first — `getCourseByCodeInsensitive` for the mixed-case ids.
 *
 * ── PAST ROUNDS ARE NOT HERE AND CANNOT BE ────────────────────────────────
 * The endpoint applies a `>= today` bound UNCONDITIONALLY and `status` does not
 * lift it (measured and curl-verified in lib/api/schedules.js). FULL rounds ARE
 * included — the admin case is correction rather than booking, so a sold-out
 * round is a legitimate destination.
 *
 * NOTHING HERE WIDENS THE ENDPOINT FOR ADMIN, deliberately. It is a public data
 * path serving the registration wizard, and adding a parameter to loosen its
 * date filter for one admin screen is how a guard that protects the booking flow
 * gets relaxed by someone who only needed to read. The consequence — a stored
 * round that has already run is not in this list — is handled by rendering it as
 * a MARKED, UNSELECTABLE option; see `storedRoundOption`.
 *
 * ── IT NEVER THROWS ───────────────────────────────────────────────────────
 * This route is force-dynamic and has to render regardless. An upstream failure
 * degrades to an EMPTY list, which the card reads as "cannot offer a change"
 * and says so — rather than taking the page down over a dropdown.
 */
async function roundsForRegistration(doc) {
  try {
    const course = await getCourseByCodeInsensitive(doc.courseId);
    if (!course?._id) return [];
    const { items } = await listSchedulesByCourse(course._id, {
      limit: 50,
      status: PUBLIC_SCHEDULE_STATUSES,
    });
    return items ?? [];
  } catch {
    return [];
  }
}

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
  // Alongside the history slot, not before it: neither depends on the other and
  // a serial await would add an upstream round trip to every page load.
  const rounds = await roundsForRegistration(doc);

  return (
    <RegistrationDetailClient
      doc={doc}
      rounds={rounds}
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