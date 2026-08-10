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

  return (
    <div className="space-y-4">
      <InhouseDetailClient doc={doc} courses={courses} />
      <RecordHistory menu="registrations" entity="inhouse" recordId={String(doc._id)} />
    </div>
  );
}