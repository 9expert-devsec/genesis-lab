import { getFeaturedOnlineCourses } from '@/lib/actions/featured-online-courses';
import { getOnlineCourses } from '@/lib/api/online-courses';
import { AddFeaturedOnlineCourseForm } from './_components/AddFeaturedOnlineCourseForm';
import { FeaturedOnlineCourseList } from './_components/FeaturedOnlineCourseList';

export const metadata = { title: 'คอร์สออนไลน์แนะนำ' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [featured, online] = await Promise.all([
    getFeaturedOnlineCourses(),
    getOnlineCourses().catch(() => ({ items: [] })),
  ]);

  // Normalize online courses to the shape the shared autocomplete UI
  // expects (course_id / course_name), and drop entries that are
  // already in the featured list to prevent duplicates.
  const featuredIds = new Set(featured.map((f) => f.course_id));
  const searchable = (online.items ?? [])
    .map((c) => ({
      course_id:
        typeof c.o_course_id === 'string' ? c.o_course_id.trim() : '',
      course_name: c.o_course_name,
      course_cover_url: c.o_course_cover_url,
      program: c.program
        ? {
            program_name: c.program.program_name,
            programiconurl: c.program.programiconurl,
          }
        : null,
    }))
    .filter((c) => c.course_id && !featuredIds.has(c.course_id));

  const activeCount = featured.filter((c) => c.active).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-9e-navy">
          คอร์สออนไลน์แนะนำ (Featured Online)
        </h1>
        <p className="text-sm text-9e-slate">
          {activeCount} / {featured.length} active
        </p>
      </div>

      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-white p-6">
        <h2 className="mb-4 text-base font-bold text-9e-navy">เพิ่มคอร์ส</h2>
        <AddFeaturedOnlineCourseForm courses={searchable} />
      </div>

      <FeaturedOnlineCourseList courses={featured} />
    </div>
  );
}
