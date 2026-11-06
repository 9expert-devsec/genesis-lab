import Link from 'next/link';
import { ArrowRight, Award, BadgeCheck, Briefcase, GraduationCap } from 'lucide-react';
import { siteConfig } from '@/config/site';
import { coursePriceLabel } from '@/lib/coursePriceLabel';
import { onlineCourseHref } from '@/lib/onlineCourseHref';

const SECTION_ICONS = {
  experience: Briefcase,
  education: GraduationCap,
  certifications: BadgeCheck,
  recognition: Award,
};

const CARD = 'rounded-2xl border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]';

function SectionCard({ section }) {
  const Icon = SECTION_ICONS[section.key];
  return (
    <section className={CARD} data-testid={`writer-section-${section.key}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-9e-md bg-9e-action/10 text-9e-action dark:text-9e-air">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-bold text-9e-navy dark:text-white">{section.label}</h2>
      </div>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--text-secondary)] marker:text-9e-action">
        {section.items.map((item, index) => (
          // Two rows may say the same thing, and the list never reorders in place.
          // eslint-disable-next-line react/no-array-index-key
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function ProgramChip({ program }) {
  const className = 'inline-flex items-center gap-1.5 rounded-full border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-9e-navy dark:text-white';
  const icon = program.iconUrl ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={program.iconUrl} alt="" width={16} height={16} className="h-4 w-4 object-contain" />
  ) : null;
  // href is null when the program's page is unpublished: a chip, not a dead link.
  return program.href ? (
    <Link href={program.href} className={`${className} transition-colors hover:border-9e-action hover:text-9e-action dark:hover:text-9e-air`}>
      {icon}{program.name}
    </Link>
  ) : (
    <span className={className}>{icon}{program.name}</span>
  );
}

function OnlineCourseRow({ course }) {
  const price = Number(course.o_course_price) || 0;
  return (
    <li>
      <a
        href={onlineCourseHref(course)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-9e-md p-1 transition-colors hover:bg-9e-ice dark:hover:bg-[#0D1B2A]"
      >
        <span className="block aspect-video w-24 shrink-0 overflow-hidden rounded-9e-sm bg-9e-ice dark:bg-[#0D1B2A]">
          {course.o_course_cover_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={course.o_course_cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />
          )}
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 text-sm font-medium text-9e-navy dark:text-white">{course.o_course_name}</span>
          <span className="mt-0.5 block text-xs font-bold text-9e-action dark:text-9e-air">
            {price === 0 ? 'ฟรี' : coursePriceLabel(price, { suffix: '.-' })}
          </span>
        </span>
      </a>
    </li>
  );
}

/**
 * The sections and the aside. `layout` comes from writerProfileLayout, which owns
 * every collapse rule, so this only draws what it is told to.
 */
export function WriterProfileBody({ layout, programs, onlineCourses, shortName }) {
  if (!layout.showBody) return null;

  const wide = !layout.showAside;

  return (
    <div
      className={`mx-auto mt-8 grid max-w-[1200px] items-start gap-6 px-4 lg:px-6 ${wide ? '' : 'lg:grid-cols-[minmax(0,1fr)_396px]'}`}
      data-testid="writer-body"
    >
      {layout.showAside && (
        <aside className="space-y-6 lg:order-2" data-testid="writer-aside">
          {layout.showPrograms && (
            <section className={CARD} data-testid="writer-programs">
              <h2 className="text-lg font-bold text-9e-navy dark:text-white">เชี่ยวชาญด้าน</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                หลักสูตรในกลุ่มที่สอน — คลิกเพื่อดูหลักสูตรทั้งหมดของโปรแกรม
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {programs.map((program) => <ProgramChip key={program.name} program={program} />)}
              </div>
            </section>
          )}
          {layout.showOnlineCourses && (
            <section className={CARD} data-testid="writer-online-courses">
              <h2 className="text-lg font-bold text-9e-navy dark:text-white">หลักสูตรออนไลน์ของ {shortName}</h2>
              <ul className="mt-3 space-y-2">
                {onlineCourses.map((course) => <OnlineCourseRow key={course.o_course_id} course={course} />)}
              </ul>
              <a
                href={siteConfig.academyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-9e-action hover:underline dark:text-9e-air"
              >
                ดูที่ 9Expert Academy <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </section>
          )}
        </aside>
      )}

      {layout.visibleSections.length > 0 && (
        <div className="min-w-0 space-y-6 lg:order-1">
          {layout.visibleSections.map((section) => <SectionCard key={section.key} section={section} />)}
        </div>
      )}
    </div>
  );
}
