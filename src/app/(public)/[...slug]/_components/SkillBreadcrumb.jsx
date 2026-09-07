import Image from 'next/image';
import Link from 'next/link';
import { courseLinkHref } from '@/lib/courses/courseLinkHref';

/**
 * Skill / program chips under the course hero.
 *
 * Each chip becomes a <Link> only when the server resolved an href for it —
 * i.e. the destination exists AND its page config is published. Everything
 * else stays the plain <span> it has always been, visually unchanged. The
 * resolution happens once per page render in the route (see
 * getPageLinkability), never per chip and never on the client, so an
 * unpublished program/skill can't produce a link into a 404.
 *
 * `skillHrefs` is keyed by the same value used for the React key, so a chip
 * with no entry simply has no href.
 */
export function SkillBreadcrumb({ course, skillHrefs = {}, programHref: programUrl = null }) {
  const skills = Array.isArray(course?.skills) ? course.skills : [];
  const program = course?.program;
  const previous = course?.previous_course;
  if (!skills.length && !program && !previous) return null;

  // Canonical path, from the shared rule. The route attaches urlAlias to
  // previous_course before rendering — it is embedded in upstream's detail
  // response and never passes through listPublicCourses, so nothing else would.
  const previousHref = previous?.course_id ? courseLinkHref(previous) : null;

  // Shared between the <span> and <Link> branches so a linked chip is
  // pixel-identical to an unlinked one apart from its hover/focus affordance.
  const SKILL_CHIP =
    'inline-flex items-center gap-1.5 rounded-full border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]';
  const PROGRAM_CHIP =
    'inline-flex items-center gap-1.5 rounded-full border border-9e-air/40 bg-9e-air/20 px-3 py-1 text-xs font-semibold text-9e-action dark:text-9e-air';
  // Hover + a visible keyboard focus ring, applied only to chips that link.
  const LINKABLE =
    ' transition-colors hover:border-9e-action/50 hover:bg-9e-air/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-action focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-bg)] dark:hover:bg-9e-air/30';

  return (
    <div className="mx-auto max-w-[1200px] px-4">
      <div className="flex flex-wrap gap-2 py-4">
        {skills.map((s) => {
          const key = s._id ?? s.skill_id;
          const href = skillHrefs[String(key)] ?? null;
          const body = (
            <>
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
            </>
          );
          return href ? (
            <Link key={key} href={href} className={SKILL_CHIP + LINKABLE}>
              {body}
            </Link>
          ) : (
            <span key={key} className={SKILL_CHIP}>
              {body}
            </span>
          );
        })}

        {program?.program_name && (() => {
          const body = (
            <>
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
            </>
          );
          return programUrl ? (
            <Link href={programUrl} className={PROGRAM_CHIP + LINKABLE}>
              {body}
            </Link>
          ) : (
            <span className={PROGRAM_CHIP}>{body}</span>
          );
        })()}
      </div>

      {/* {previous && previousHref && (
        <div className="flex flex-wrap items-center gap-2 pb-3 text-xs text-9e-slate-dp-50">
          <span>หลักสูตรก่อนหน้า:</span>
          <Link
            href={previousHref}
            className="font-medium text-9e-action hover:underline"
          >
            {previous.course_name}
          </Link>
        </div>
      )} */}
    </div>
  );
}
