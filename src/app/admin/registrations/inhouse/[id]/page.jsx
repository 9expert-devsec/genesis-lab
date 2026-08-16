import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getInhouseRegistrationById } from '@/lib/actions/inhouse-registrations';
import { InhouseDetailClient } from '../_components/InhouseDetailClient';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { refNo } from '@/lib/refNo';
import { buildCourseNameMap, resolveCourseNames } from '@/lib/api/courseNameMap';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `In-house Request ${refNo(id)}` };
}

export default async function Page({ params }) {
  await requirePage('registrations');

  const { id } = await params;
  const doc = await getInhouseRegistrationById(id);
  if (!doc) notFound();

  /**
   * COURSE NAMES ARE RESOLVED HERE, ON THE SERVER, and arrive as a prop.
   *
   * `coursesInterested` holds course_id CODES ('VIBE-CODE-L2'), which is what
   * this page used to print at a salesperson. The same map the in-house LIST
   * column uses does the resolving — one `listPublicCourses()` for all of them,
   * never `getCourseByCode` per code. See src/lib/api/courseNameMap.js for why
   * that is both cheaper and safe against the mixed-case ids.
   *
   * It must NOT move into InhouseDetailClient: that component is `'use client'`,
   * and a fetch there would run in the browser, per viewer, with none of the
   * Data Cache this page shares.
   *
   * The map already `.catch`es to `{}`, so an upstream failure degrades every
   * entry to `name: null` and the client renders the code. Nothing here throws;
   * this route is force-dynamic and has to render regardless.
   */
  const courses = resolveCourseNames(doc.coursesInterested, await buildCourseNameMap());

  /**
   * THE HISTORY PANEL IS RENDERED HERE AND HANDED IN AS A SLOT — same reason as
   * the public page: `RecordHistory` is a SERVER component that awaits `auth()`,
   * so a client tab panel cannot mount one. Rendering it here and passing the
   * NODE down means switching to ประวัติการดำเนินการ costs no round trip and
   * needs no server action taking a `menu` the client chose.
   *
   * `defaultOpen` because the panel now has a tab of its own.
   */
  return (
    <InhouseDetailClient
      doc={doc}
      courses={courses}
      history={(
        <RecordHistory
          menu="registrations"
          entity="inhouse"
          recordId={String(doc._id)}
          defaultOpen
          variant="feed"
          title="ประวัติการดำเนินการ"
          description="บันทึกการดำเนินการของทีมขายกับคำขอนี้"
          /**
           * THE DOCUMENT'S OWN CREATION FACTS — same slot as the public page and
           * the same reason: the audit log records ADMIN actions, and a customer
           * submitting the in-house form is not one, so the oldest entry cannot
           * come from the trail. It comes from `createdAt` and `source` on the
           * record, and the feed marks it as document-derived in both words and
           * markup.
           *
           * `?? 'web'` matches the SCHEMA default rather than guessing
           * `'inhouse'`: RegisterInhouse declares `source: { default: 'web' }` and
           * api/registration/inhouse/route.js overrides it explicitly. A legacy
           * document written before that route did so really does hold 'web', and
           * defaulting to 'inhouse' here would make the screen assert a
           * provenance the record does not carry.
           */
          origin={{
            createdAt: doc.createdAt,
            source: doc.source ?? 'web',
            label: 'ได้รับคำขออบรม',
          }}
        />
      )}
    />
  );
}