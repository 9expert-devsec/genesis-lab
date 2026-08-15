/**
 * /admin/courses/rename — the course-code rename DRY RUN, and only that.
 *
 * ── WHY ITS OWN SCREEN RATHER THAN A FIELD ON THE EDIT FORM ────────────────
 * A rename is a migration across twelve stores in two phases, not an edit. Put
 * beside `course_id` on the course form it would teach exactly the wrong mental
 * model — that this is another field, that saving is the whole of it, and that
 * the URL and the SEO look after themselves. The form already shows the code as
 * non-editable for that reason; this is where the answer to "then how do I
 * change it" lives, and it is reached from there by a link.
 *
 * `/admin/courses/rename` resolves to the `courses` RBAC key by the prefix rule
 * in lib/rbac/pages.js, so no permission entry is added. The static segment
 * wins over the sibling `[courseId]` route in Next's matcher, and `[courseId]`
 * takes an MSDB ObjectId rather than a code, so nothing can collide with it.
 *
 * NO RENAME CONTROL EXISTS HERE. The write action is not imported anywhere in
 * this subtree — asserted in test/fs/renameUiNoWrite rather than promised.
 */

import { requirePage } from '@/lib/rbac/guard';
import { listPublicCourses } from '@/lib/api/public-courses';
import { RenamePreviewClient } from './_components/RenamePreviewClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'ตรวจสอบการเปลี่ยนรหัสหลักสูตร',
  robots: { index: false, follow: false },
};

export default async function CourseRenamePreviewPage({ searchParams }) {
  await requirePage('courses');

  /**
   * THE DEEP-LINKED COURSE, READ HERE AND PASSED DOWN.
   *
   * The course edit form links here as `?course=<course_id>`, so an admin who
   * was already looking at a course arrives with it selected instead of having
   * to find it again.
   *
   * Read from `searchParams` on EVERY render and handed over as a prop — never
   * copied into `useState` in the client. That is the rule the register in
   * test/fs/urlFilterNoState exists for: a URL value seeded once into state
   * goes stale the moment a navigation keeps the component instance, and this
   * screen is not going to be the next entry on it.
   *
   * The CODE and not the ObjectId: the picker is keyed on `course_id`, the
   * preview action takes a code, and the code is the thing being renamed. An
   * `_id` would need a second lookup to become any of those.
   */
  const sp = await searchParams;
  const raw = sp?.course;
  const course = (Array.isArray(raw) ? raw[0] : raw ?? '').toString().trim();

  // includeHidden — the picker must offer every course the admin can manage,
  // for the same reason the management table does: a hidden course is exactly
  // the kind whose code nobody has looked at in a while.
  const res = await listPublicCourses({ includeHidden: true }).catch(() => ({ items: [] }));
  const courses = (res.items ?? []).map((c) => ({
    course_id: c.course_id,
    course_name: c.course_name,
    course_name_th: c.course_name_th ?? '',
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          ตรวจสอบการเปลี่ยนรหัสหลักสูตร
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
          ดูว่าการเปลี่ยนรหัสหลักสูตรจะกระทบข้อมูลส่วนใดบ้าง ก่อนตัดสินใจ —
          หน้านี้ไม่เขียนข้อมูลใด ๆ และยังสั่งเปลี่ยนรหัสจากที่นี่ไม่ได้
          การเปลี่ยนจริงต้องทำสองขั้น: ฝั่งระบบนี้ก่อน แล้วจึงแก้ course_id ที่ MSDB
        </p>
      </div>

      <RenamePreviewClient courses={courses} course={course} />
    </div>
  );
}
