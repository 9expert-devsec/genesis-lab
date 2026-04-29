import Image from 'next/image';
import { CourseCard } from './CourseCard';

export function CourseCardGroup({ program, courses }) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center gap-3">
        {program?.programiconurl && (
          <Image
            src={program.programiconurl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
            unoptimized
          />
        )}
        <h2 className="text-lg font-bold text-9e-navy dark:text-white">
          {program?.program_name ?? 'หลักสูตร'}
        </h2>
        <span className="rounded-full bg-9e-sky/20 px-2 py-0.5 text-xs font-bold text-9e-primary dark:bg-[#111d2c] dark:text-9e-sky">
          {courses.length}
        </span>
      </div>
      <hr className="mb-4 border-gray-100 dark:border-[#1e3a5f]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {courses.map((c) => (
          <CourseCard key={c._id ?? c.course_id} course={c} />
        ))}
      </div>
    </section>
  );
}
