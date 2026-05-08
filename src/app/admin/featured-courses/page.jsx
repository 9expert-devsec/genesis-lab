import { getFeaturedCourses } from '@/lib/actions/featured-courses';
import { listPublicCourses } from '@/lib/api/public-courses';
import { AddFeaturedCourseForm } from './_components/AddFeaturedCourseForm';
import { FeaturedCourseList } from './_components/FeaturedCourseList';

export const metadata = { title: 'คอร์สแนะนำ' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [featured, publicCourses] = await Promise.all([
    getFeaturedCourses(),
    listPublicCourses().catch(() => ({ items: [] })),
  ]);

  // Minimal shape for the autocomplete: anything the dropdown renders.
  // Hide courses already in the featured list to prevent dup attempts.
  const featuredIds = new Set(featured.map((f) => f.course_id));
  const searchable = (publicCourses.items ?? [])
    .filter((c) => !featuredIds.has(c.course_id))
    .map((c) => ({
      course_id: c.course_id,
      course_name: c.course_name,
      program: c.program
        ? {
            program_name: c.program.program_name,
            programiconurl: c.program.programiconurl,
          }
        : null,
    }));

  const activeCount = featured.filter((c) => c.active).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-9e-navy">
          คอร์สใหม่แนะนำ (Featured)
        </h1>
        <p className="text-sm text-9e-slate-dp-50">
          {activeCount} / {featured.length} active
        </p>
      </div>

      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-white p-6">
        <h2 className="mb-4 text-base font-bold text-9e-navy">เพิ่มคอร์ส</h2>
        <AddFeaturedCourseForm courses={searchable} />
      </div>

      <FeaturedCourseList courses={featured} />
    </div>
  );
}
