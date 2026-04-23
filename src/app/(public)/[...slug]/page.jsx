import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, Clock, Users } from 'lucide-react';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';
import { getCourseByCode } from '@/lib/api/public-courses';
import { listSchedulesByCourse } from '@/lib/api/schedules';
import { courseHref, formatDuration, formatPrice } from '@/lib/utils';

/**
 * Catch-all route for legacy-style pattern URLs:
 *   /<slug>-training-course      → course detail (real data, Phase 2.4)
 *   /<slug>-career-path          → career path detail (Phase 3 placeholder)
 *   /<slug>-all-courses          → catalog by skill or program (Phase 3 placeholder)
 *
 * Next.js App Router does not support suffixes on a single dynamic segment
 * (e.g. `[slug]-training-course`), so we route all three patterns through
 * this catch-all and dispatch by suffix.
 */

export const revalidate = 3600;

function segmentFromSlug(slug) {
  const segment = Array.isArray(slug) ? slug.join('/') : String(slug ?? '');
  if (segment.includes('/')) return null;
  return segment;
}

function courseIdFromSegment(segment) {
  if (!segment.endsWith('-training-course')) return null;
  return segment.slice(0, -'-training-course'.length).toUpperCase();
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const segment = segmentFromSlug(slug);
  if (!segment) return {};

  const courseId = courseIdFromSegment(segment);
  if (courseId) {
    const course = await getCourseByCode(courseId);
    if (!course) return { title: 'ไม่พบหลักสูตร' };
    return {
      title: `${course.course_name} | 9Expert Training`,
      description: course.course_teaser?.slice(0, 160),
    };
  }

  return {};
}

export default async function CatchAllPage({ params }) {
  const { slug } = await params;
  const segment = segmentFromSlug(slug);

  if (!segment) notFound();

  if (segment.endsWith('-training-course')) {
    const courseId = courseIdFromSegment(segment);
    const course = await getCourseByCode(courseId);
    if (!course) notFound();

    const { items: schedules } = await listSchedulesByCourse(course._id, {
      limit: 10,
    });

    return <CourseDetail course={course} schedules={schedules} />;
  }

  if (segment.endsWith('-career-path')) {
    const pathSlug = segment.slice(0, -'-career-path'.length);
    return (
      <PagePlaceholder
        title={`เส้นทางอาชีพ: ${pathSlug}`}
        description="รายละเอียดเส้นทางอาชีพ ทักษะที่จำเป็น และหลักสูตรแนะนำ — เชื่อมต่อ /api/ai/career-path ใน Phase 3"
        phase="Phase 3"
      />
    );
  }

  if (segment.endsWith('-all-courses')) {
    const catalogSlug = segment.slice(0, -'-all-courses'.length);
    return (
      <PagePlaceholder
        title={`หลักสูตรทั้งหมด: ${catalogSlug}`}
        description="รวมหลักสูตรตาม Skill หรือ Program — filter จาก /api/ai/public-courses ใน Phase 3"
        phase="Phase 3"
      />
    );
  }

  notFound();
}

const LEVEL_LABELS = ['Beginner', 'Intermediate', 'Advanced'];

function CourseDetail({ course, schedules }) {
  const levelLabel =
    course.course_levels
      ? LEVEL_LABELS[Number(course.course_levels) - 1] ?? course.course_levels
      : null;

  return (
    <article className="mx-auto max-w-[1200px] px-4 py-10 lg:px-6">
      <header className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
        <div>
          {course.course_cover_url && (
            <div className="relative aspect-video w-full overflow-hidden rounded-9e-lg">
              <Image
                src={course.course_cover_url}
                alt={course.course_name}
                fill
                sizes="(max-width: 1200px) 100vw, 800px"
                className="object-cover"
                priority
              />
            </div>
          )}
          <div className="mt-6 flex items-center gap-3">
            {course.program?.programiconurl && (
              <Image
                src={course.program.programiconurl}
                alt=""
                aria-hidden="true"
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
            )}
            {course.program?.program_name && (
              <span className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                {course.program.program_name}
              </span>
            )}
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-[var(--text-primary)] lg:text-4xl">
            {course.course_name}
          </h1>
          {course.course_teaser && (
            <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
              {course.course_teaser}
            </p>
          )}
          {course.skills?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {course.skills.map((s) => (
                <span
                  key={s._id ?? s.skill_id}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--surface-border)] px-3 py-1 text-sm text-[var(--text-secondary)]"
                >
                  {s.skilliconurl && (
                    <Image
                      src={s.skilliconurl}
                      alt=""
                      aria-hidden="true"
                      width={16}
                      height={16}
                      className="h-4 w-4 object-contain"
                    />
                  )}
                  {s.skill_name}
                </span>
              ))}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-9e-md">
            <div className="text-3xl font-bold text-[var(--text-primary)]">
              {formatPrice(course.course_price)}
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Clock className="h-4 w-4" strokeWidth={1.75} />
                <span>{formatDuration(course)}</span>
              </div>
              {levelLabel && (
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <Users className="h-4 w-4" strokeWidth={1.75} />
                  <span>ระดับ: {levelLabel}</span>
                </div>
              )}
            </dl>
            {schedules.length > 0 ? (
              <a
                href={schedules[0].signup_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 block w-full rounded-9e-md bg-9e-brand px-4 py-3 text-center font-semibold text-9e-ice transition-colors duration-9e-micro ease-9e hover:bg-9e-primary"
              >
                ลงทะเบียนรอบถัดไป
              </a>
            ) : (
              <p className="mt-6 text-sm text-[var(--text-secondary)]">
                ยังไม่มีรอบเปิด — ติดต่อสอบถามทางฝ่ายขาย
              </p>
            )}
          </div>
        </aside>
      </header>

      {schedules.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">รอบการอบรม</h2>
          <ul className="mt-6 space-y-3">
            {schedules.map((s) => (
              <li
                key={s._id}
                className="flex flex-col gap-3 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-4">
                  <Calendar className="h-5 w-5 text-9e-brand" strokeWidth={1.75} />
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">
                      {formatScheduleDates(s.dates)}
                    </div>
                    <div className="text-sm text-[var(--text-secondary)]">
                      {s.type === 'hybrid'
                        ? 'Hybrid (Classroom + MS Teams)'
                        : 'Classroom'}
                      {' · '}
                      {s.status === 'nearly_full' ? 'ใกล้เต็ม' : 'เปิดรับสมัคร'}
                    </div>
                  </div>
                </div>
                <a
                  href={s.signup_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-9e-md border border-9e-brand px-4 py-2 text-sm font-semibold text-9e-brand transition-colors duration-9e-micro ease-9e hover:bg-9e-brand hover:text-9e-ice"
                >
                  ลงทะเบียน
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {course.related_courses?.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">คอร์สที่เกี่ยวข้อง</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {course.related_courses.slice(0, 3).map((rc) => (
              <Link
                key={rc._id ?? rc.course_id}
                href={courseHref(
                  rc.course_id ? String(rc.course_id).toLowerCase() : ''
                )}
                className="block rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-4 transition-all duration-9e-micro ease-9e hover:-translate-y-[2px] hover:shadow-9e-md"
              >
                <div className="font-semibold text-[var(--text-primary)]">
                  {rc.course_name}
                </div>
                <div className="mt-2 text-sm text-[var(--text-secondary)]">
                  {formatDuration(rc)} · {formatPrice(rc.course_price)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/**
 * Format an array of ISO date strings into a Thai-style compact range.
 * Single date → "11 พ.ค." · Same month → "11-13 พ.ค." · Cross-month →
 * "30 เม.ย. - 2 พ.ค.".
 */
function formatScheduleDates(dates) {
  if (!dates?.length) return '';
  const sorted = [...dates].sort();
  const start = new Date(sorted[0]);
  const end = new Date(sorted[sorted.length - 1]);
  if (sorted.length === 1) {
    return `${start.getDate()} ${THAI_MONTHS[start.getMonth()]}`;
  }
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}-${end.getDate()} ${THAI_MONTHS[start.getMonth()]}`;
  }
  return `${start.getDate()} ${THAI_MONTHS[start.getMonth()]} - ${end.getDate()} ${THAI_MONTHS[end.getMonth()]}`;
}
