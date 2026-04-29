import { Suspense } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getCourseByCode, listPublicCourses } from '@/lib/api/public-courses';
import { listSchedulesByCourse } from '@/lib/api/schedules';
import { listPrograms } from '@/lib/api/programs';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { CourseListClient } from './_components/CourseListClient';

export const metadata = { title: 'หลักสูตรทั้งหมด' };

/**
 * `/public-course` list omits `course_cover_url`, `course_teaser`,
 * `course_levels`, and `course_traininghours`. To render the approved
 * card design we fan out to `getCourseByCode()` per item in bounded
 * chunks (concurrency 10) — better than 73 parallel requests, simpler
 * than a per-card client fetch. Upstream caching in `aiFetch` means
 * repeated page views are cheap.
 */
const COVER_FETCH_CHUNK = 10;

export default async function Page() {
  let items = [];
  let programOrder = [];
  let fetchError = null;

  try {
    const [coursesResult, rawPrograms] = await Promise.all([
      listPublicCourses(),
      listPrograms().catch(() => ({ items: [] })),
    ]);
    items = await enrichWithDetails(coursesResult.items);
    // Apply admin-set program order. We pass the names down so the
    // client groups + filter dropdown render in the same sequence.
    const ordered = await getOrderedPrograms(rawPrograms.items ?? []).catch(
      () => rawPrograms.items ?? []
    );
    programOrder = ordered
      .map((p) => p.program_name)
      .filter(Boolean);
  } catch (err) {
    console.error('[training-course]', err);
    fetchError = err.message;
  }

  if (fetchError) {
    return <ErrorState message={fetchError} />;
  }

  // Suspense boundary — CourseListClient reads useSearchParams, which
  // under Next 15 forces dynamic rendering without a boundary above it.
  return (
    <Suspense fallback={null}>
      <CourseListClient items={items} programOrder={programOrder} />
    </Suspense>
  );
}

async function enrichWithDetails(items) {
  if (!items?.length) return [];

  const detailById = new Map();
  for (let i = 0; i < items.length; i += COVER_FETCH_CHUNK) {
    const chunk = items.slice(i, i + COVER_FETCH_CHUNK);
    const results = await Promise.allSettled(
      chunk.map((c) => getCourseByCode(c.course_id))
    );
    results.forEach((r, idx) => {
      const code = chunk[idx].course_id;
      if (r.status === 'fulfilled' && r.value) {
        detailById.set(code, r.value);
      } else if (r.status === 'rejected') {
        console.warn('[training-course] detail fetch failed:', code, r.reason);
      }
    });
  }

  // Pre-fetch up to 3 upcoming schedules per course so cards can render
  // signup pills without each one firing its own client-side request.
  const scheduleById = new Map();
  for (let i = 0; i < items.length; i += COVER_FETCH_CHUNK) {
    const chunk = items.slice(i, i + COVER_FETCH_CHUNK);
    const results = await Promise.allSettled(
      chunk.map((c) => listSchedulesByCourse(c._id, { limit: 3 }))
    );
    results.forEach((r, idx) => {
      const id = chunk[idx]._id;
      if (r.status === 'fulfilled') {
        scheduleById.set(id, r.value.items ?? []);
      } else {
        console.warn('[training-course] schedule fetch failed:', id, r.reason);
      }
    });
  }

  return items.map((c) => {
    const detail = detailById.get(c.course_id);
    const hoursFromDetail = detail?.course_traininghours ?? null;
    return {
      ...c,
      course_cover_url: detail?.course_cover_url ?? null,
      course_teaser: detail?.course_teaser ?? null,
      course_levels: detail?.course_levels ?? null,
      course_workshop_status: detail?.course_workshop_status ?? null,
      course_certificate_status: detail?.course_certificate_status ?? null,
      course_type_public: detail?.course_type_public ?? null,
      course_type_inhouse: detail?.course_type_inhouse ?? null,
      course_traininghours:
        hoursFromDetail ??
        (c.course_trainingdays ? c.course_trainingdays * 6 : null),
      // Detail response has full skill objects; fall back to list's ObjectId
      // strings if detail failed (card filters those out).
      skills: detail?.skills ?? c.skills,
      schedules: scheduleById.get(c._id) ?? [],
    };
  });
}

function ErrorState({ message }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 lg:px-6">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-9e-sky/20">
          <AlertTriangle className="h-5 w-5 text-9e-primary" strokeWidth={1.75} />
        </div>
        <p className="text-base font-semibold text-9e-navy">โหลดข้อมูลไม่สำเร็จ</p>
        <p className="mt-1 text-sm text-9e-slate">
          กรุณาลองใหม่อีกครั้ง หรือติดต่อเราหากปัญหายังคงอยู่
        </p>
        {process.env.NODE_ENV !== 'production' && message && (
          <pre className="mt-4 max-w-full overflow-x-auto rounded bg-9e-ice p-3 text-left text-xs text-9e-slate">
            {message}
          </pre>
        )}
      </div>
    </div>
  );
}
