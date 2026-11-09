import Link from 'next/link';
import { ArrowRight, Award, BadgeCheck, Briefcase, GraduationCap } from 'lucide-react';
import { siteConfig } from '@/config/site';
import { coursePriceLabel } from '@/lib/coursePriceLabel';
import { onlineCourseHref } from '@/lib/onlineCourseHref';
import { youtubeThumbnailUrl } from '@/lib/writers/youtube';

const SECTION_ICONS = {
  experience: Briefcase,
  education: GraduationCap,
  certifications: BadgeCheck,
  recognition: Award,
};

const CARD = 'rounded-2xl border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]';

/**
 * The list as ONE grid per section on md+: [bullet][ปี][เนื้อหา]. Each row is a
 * subgrid, so the ปี column is as wide as the widest ปี in THIS section
 * (max-content) and every row's text starts on the same line; a wrapped line
 * stays in the text column. A row with no ปี spans the ปี AND text columns
 * (md:col-span-2), so its text starts right after the bullet, where a ปี would
 * start: the CVs have no year for those rows, and an empty cell left a hole.
 * The span does not widen the ปี column: it also crosses the 1fr track, and
 * grid sizing gives a spanning item's extra space to flexible tracks only, so
 * the max-content column is still sized by the ปี cells alone (measured). A
 * section where no row has a ปี has no such column at all.
 *
 * Below md each row is a flex row: the ปี on its own line above the text.
 *
 * Class strings are complete literals: Tailwind cannot see assembled ones.
 */
const SECTION_LIST_WITH_PERIODS = 'mt-4 space-y-2 text-sm leading-relaxed text-[var(--text-secondary)] md:grid md:grid-cols-[auto_max-content_1fr] md:gap-x-3 md:gap-y-2 md:space-y-0';
const SECTION_LIST_PLAIN = 'mt-4 space-y-2 text-sm leading-relaxed text-[var(--text-secondary)] md:grid md:grid-cols-[auto_1fr] md:gap-x-3 md:gap-y-2 md:space-y-0';
const SECTION_ROW = 'flex gap-3 md:col-span-full md:grid md:grid-cols-subgrid md:gap-x-3';
// pr-1 on top of the 12px column gap: 16px between the ปี and the text.
const PERIOD = 'block font-semibold text-[var(--text-primary)] md:pr-1';
const TEXT = 'block min-w-0';
// A no-ปี row in a section that has a ปี column.
const TEXT_SPANNING = 'block min-w-0 md:col-span-2';

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
      <ul className={section.hasPeriods ? SECTION_LIST_WITH_PERIODS : SECTION_LIST_PLAIN}>
        {section.items.map((item, index) => (
          // Two rows may say the same thing, and the list never reorders in place.
          // eslint-disable-next-line react/no-array-index-key
          <li key={index} className={SECTION_ROW}>
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-9e-action" aria-hidden="true" />
            <div className="min-w-0 md:contents">
              {item.period && (
                <span className={PERIOD} data-testid="writer-section-period">{item.period}</span>
              )}
              <span className={section.hasPeriods && !item.period ? TEXT_SPANNING : TEXT}>{item.text}</span>
            </div>
          </li>
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
 * A video, in the online-course row's layout: the same 16:9 thumbnail width on
 * the left, the title on the right. The thumbnail is a plain <img> straight from
 * i.ytimg.com — not next/image, so it never passes through image optimisation.
 */
function VideoRow({ video }) {
  return (
    <li>
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-9e-md p-1 transition-colors hover:bg-9e-ice dark:hover:bg-[#0D1B2A]"
      >
        <span className="block aspect-video w-24 shrink-0 overflow-hidden rounded-9e-sm bg-9e-ice dark:bg-[#0D1B2A]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={youtubeThumbnailUrl(video.videoId)} alt={video.title} loading="lazy" className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 text-sm font-medium text-9e-navy dark:text-white">{video.title}</span>
        </span>
      </a>
    </li>
  );
}

const FOOTER_LINK = 'mt-3 inline-flex items-center gap-1 text-sm font-semibold text-9e-action hover:underline dark:text-9e-air';

/**
 * The sections and the aside. `layout` comes from writerProfileLayout, which owns
 * every collapse rule, so this only draws what it is told to.
 *
 * Aside order: เชี่ยวชาญด้าน → หลักสูตรออนไลน์ → วิดีโอ, each only when it has
 * something in it.
 */
export function WriterProfileBody({ layout, programs, onlineCourses, videos = [], channelUrl = '', shortName }) {
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
                className={FOOTER_LINK}
              >
                ดูที่ 9Expert Academy <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </section>
          )}
          {layout.showVideos && (
            <section className={CARD} data-testid="writer-videos">
              <h2 className="text-lg font-bold text-9e-navy dark:text-white">วิดีโอของ {shortName}</h2>
              <ul className="mt-3 space-y-2">
                {videos.map((video) => <VideoRow key={video.videoId} video={video} />)}
              </ul>
              {channelUrl && (
                <a href={channelUrl} target="_blank" rel="noopener noreferrer" className={FOOTER_LINK}>
                  ดูทั้งหมดบน YouTube <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
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
