import Image from 'next/image';
import Link from 'next/link';
import { courseHref } from '@/lib/utils';

export function SkillBreadcrumb({ course }) {
  const skills = Array.isArray(course?.skills) ? course.skills : [];
  const program = course?.program;
  const previous = course?.previous_course;
  if (!skills.length && !program && !previous) return null;

  const previousHref = previous?.course_id
    ? courseHref(String(previous.course_id).toLowerCase())
    : null;

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-wrap gap-2 py-4">
        {skills.map((s) => (
          <span
            key={s._id ?? s.skill_id}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-9e-ice px-3 py-1 text-xs font-semibold text-9e-navy"
          >
            {s.skilliconurl && (
              <Image
                src={s.skilliconurl}
                alt=""
                width={14}
                height={14}
                className="h-3.5 w-3.5 object-contain"
                unoptimized
              />
            )}
            {s.skill_name}
          </span>
        ))}
        {program?.program_name && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-9e-air/40 bg-9e-air/20 px-3 py-1 text-xs font-semibold text-9e-action">
            {program.programiconurl && (
              <Image
                src={program.programiconurl}
                alt=""
                width={14}
                height={14}
                className="h-3.5 w-3.5 object-contain"
                unoptimized
              />
            )}
            {program.program_name}
          </span>
        )}
      </div>

      {previous && previousHref && (
        <div className="flex flex-wrap items-center gap-2 pb-3 text-xs text-9e-slate-dp-50">
          <span>หลักสูตรก่อนหน้า:</span>
          <Link
            href={previousHref}
            className="font-medium text-9e-action hover:underline"
          >
            {previous.course_name}
          </Link>
        </div>
      )}
    </div>
  );
}
