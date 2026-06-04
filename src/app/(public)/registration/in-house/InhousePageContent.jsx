import { listPublicCourses } from '@/lib/api/public-courses';
import { InhouseWizard } from '@/components/registration/InhouseForm';

/**
 * Base path for the In-house wizard. The wizard pushes step-prefixed URLs
 * under this path (step-1 / step-2 / step-3).
 */
export const INHOUSE_BASE_PATH = '/registration/in-house';

/**
 * Shared page logic for every step of the In-house quotation wizard.
 *
 * The three step routes (`step-1`, `step-2`, `step-3`) each render this with
 * the matching `step` number, so the course fetching + layout stay in one
 * place and the wizard knows which sub-step to show.
 *
 * URL: /registration/in-house/step-N?course=<course-id>
 * - `course` (optional) pre-selects the course dropdown.
 */
export async function InhousePageContent({ searchParams, step }) {
  const sp = (await searchParams) ?? {};
  const preselectedCourse = typeof sp.course === 'string' ? sp.course.toUpperCase() : null;

  const coursesRes = await listPublicCourses().catch(() => ({ items: [] }));
  const courses = (coursesRes.items ?? []).map((c) => ({
    id:      c.course_id,
    name:    c.course_name,
    program: c.program?.program_name ?? '',
  }));

  return (
    <article className="mx-auto max-w-[920px] px-4 py-10 lg:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] lg:text-3xl">
          ขอใบเสนอราคาอบรมแบบ In-house
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          ส่งข้อมูล Requirement เบื้องต้น ทีมขายจะติดต่อกลับพร้อมใบเสนอราคาภายใน 1-2 วันทำการ
        </p>
      </header>

      <InhouseWizard
        courses={courses}
        preselectedCourse={preselectedCourse}
        step={step}
        basePath={INHOUSE_BASE_PATH}
      />
    </article>
  );
}
