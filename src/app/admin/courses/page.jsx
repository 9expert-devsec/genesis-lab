/**
 * /admin/courses — list every upstream course with the join state of
 * its CourseExtension document. Lets admins create new courses (POST
 * to MSDB), edit basic info, or jump into the SEO/Gallery extension.
 */

import Link from 'next/link';
import { requirePage } from '@/lib/rbac/guard';
import { listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { listCourseExtensions } from '@/lib/actions/course-extensions';
import { loadCourseOrder } from '@/lib/courses/courseOrderStore';
import { buildProgramIndex } from '@/lib/courses/programAccent';
import { CoursesAdminClient } from './_components/CoursesAdminClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'จัดการหลักสูตร',
  robots: { index: false, follow: false },
};

export default async function AdminCoursesPage({ searchParams }) {
  await requirePage('courses');

  // THE FILTERS ARE READ HERE AND PASSED DOWN. They were `useState` seeded from
  // `useSearchParams` inside the client, written back with history.replaceState
  // — the shape test/fs/urlFilterNoState records as a defect. See the note in
  // CoursesAdminClient for what that cost and what replaced it.
  const sp = await searchParams;
  const one = (key) => {
    const raw = sp?.[key];
    return (Array.isArray(raw) ? raw[0] : raw ?? '').toString();
  };
  const q = one('q');
  const program = one('program');
  const type = one('type');

  const [coursesRes, extensionsRes, programsRes] = await Promise.allSettled([
    // includeHidden — this IS the management table. It carries the สถานะ
    // column that says เผยแพร่ / ซ่อน, so a hidden course missing from it would
    // remove the only control that can un-hide it.
    listPublicCourses({ includeHidden: true }),
    listCourseExtensions(),
    listPrograms(),
  ]);

  /**
   * The stored order, for the ลำดับ column.
   *
   * FREE ON THIS RENDER. `listPublicCourses` above already called this to order
   * the array, and `loadCourseOrder` is wrapped in React.cache — so this is the
   * same request's memo, not a second round-trip to Mongo.
   *
   * Read AFTER the settle block rather than inside it because it must not be
   * able to fail the page: `null` is a legitimate answer meaning "the order
   * could not be read, or nothing is seeded", and the table renders every
   * course as unlisted and says so. That is the same `null` contract
   * listPublicCourses honours by leaving the array in upstream order.
   */
  const order = await loadCourseOrder();

  const courses =
    coursesRes.status === 'fulfilled' ? (coursesRes.value.items ?? []) : [];
  const extensions =
    extensionsRes.status === 'fulfilled' ? extensionsRes.value : [];
  const programs =
    programsRes.status === 'fulfilled' ? (programsRes.value.items ?? []) : [];

  const extByCourseId = Object.fromEntries(
    extensions.map((ext) => [ext.courseId, ext])
  );

  // Maps → plain objects, because these cross the server/client boundary. Keyed
  // by `program_id` (the CODE) to match ProgramOrder.programId and
  // `programKeyOf` — NOT by `_id`, which is what the filter dropdown carries.
  // Both keys are reachable from `course.program`; see the note in the client.
  const programCourseOrder = order
    ? Object.fromEntries(order.programCourseOrder)
    : null;

  /**
   * Names AND colours, from ONE walk of the SAME array, under one key
   * discipline — see lib/courses/programAccent.js.
   *
   * `programcolor` rides on the `listPrograms()` response this page already
   * fetches, so the accent costs no extra read. It is the same upstream field
   * the public course hero and programme page paint with; nothing is copied
   * into the admin tree and no colour is stored anywhere.
   */
  const { names: programNames, colors: programColors } = buildProgramIndex(programs);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            จัดการหลักสูตร
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            สร้าง/แก้ไขหลักสูตรในต้นทาง (MSDB) — ระบบสร้าง URL alias, SEO และ
            gallery ในแท็บแยก (กดปุ่ม SEO/Gallery)
          </p>
        </div>
        <Link
          href="/admin/courses/new"
          className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          + สร้างหลักสูตร
        </Link>
      </div>

      <CoursesAdminClient
        courses={courses}
        extensions={extByCourseId}
        programs={programs}
        programCourseOrder={programCourseOrder}
        programNames={programNames}
        programColors={programColors}
        q={q}
        program={program}
        type={type}
      />
    </div>
  );
}
