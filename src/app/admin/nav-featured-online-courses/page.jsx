import { getNavFeaturedOnlineCourses } from '@/lib/actions/nav-featured-online-courses';
import { getOnlineCourses } from '@/lib/api/online-courses';
import { AddNavFeaturedOnlineCourseForm } from './_components/AddNavFeaturedOnlineCourseForm';
import { NavFeaturedOnlineCourseList } from './_components/NavFeaturedOnlineCourseList';

export const metadata = { title: 'คอร์สออนไลน์แนะนำ (Navbar)' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [featured, online] = await Promise.all([
    getNavFeaturedOnlineCourses(),
    getOnlineCourses().catch(() => ({ items: [] })),
  ]);

  // Normalize online courses to the shape the shared autocomplete UI
  // expects (course_id / course_name), and drop entries already in the
  // list to prevent duplicates.
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
        <div>
          <h1 className="text-2xl font-bold text-9e-navy">
            คอร์สออนไลน์แนะนำ (Navbar)
          </h1>
          <p className="mt-1 text-sm text-9e-slate-dp-50">
            เลือกได้สูงสุด 3 คอร์ส สำหรับแสดงในเมนู Navbar
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
            activeCount >= 3
              ? 'bg-amber-100 text-amber-700'
              : 'bg-9e-ice text-9e-navy'
          }`}
        >
          {activeCount} / 3 active
        </span>
      </div>

      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-white p-6">
        <h2 className="mb-4 text-base font-bold text-9e-navy">เพิ่มคอร์ส</h2>
        <AddNavFeaturedOnlineCourseForm courses={searchable} />
      </div>

      <NavFeaturedOnlineCourseList courses={featured} />
    </div>
  );
}
