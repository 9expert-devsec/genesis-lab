"use client";

import Image from "next/image";
import Link from "next/link";
import { Award, BarChart2, BookOpen, Clock, ExternalLink } from "lucide-react";
import { onlineCourseHref } from "@/lib/onlineCourseHref";
import { onlineCourseInstructors } from "@/lib/onlineCourseInstructors";
import { cn } from "@/lib/utils";
import { skillCapsuleHref } from "@/lib/skillCapsuleHref";
import { logUnresolvedCapsule } from "@/lib/logUnresolvedCapsule";

const LEVEL_LABEL = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };

/**
 * Card for online (self-paced) courses surfaced on the home page.
 *
 * Online courses come from the `/online-course` upstream feed with an
 * `o_course_*` field prefix and have no schedule rows. The CTA points
 * at 9Expert Academy via `website_urls[0]`, falling back to the
 * academy root if the course doesn't carry a direct link.
 */
export function OnlineCourseCard({ course, className, skillSlugs = {} }) {
  if (!course) return null;

  const id = typeof course.o_course_id === "string"
    ? course.o_course_id.trim()
    : "";
  const name = course.o_course_name;
  const teaser = course.o_course_teaser;
  const cover = course.o_course_cover_url;
  const lessons = Number(course.o_number_lessons) || 0;
  const hours = Number(course.o_course_traininghours) || 0;
  const price = Number(course.o_course_price) || 0;
  const netPrice = Number(course.o_course_netprice) || 0;
  const hasCertificate = Boolean(course.o_course_certificate_status);
  const levelKey = course.o_course_levels != null
    ? Number(course.o_course_levels)
    : null;
  const levelLabel = levelKey ? LEVEL_LABEL[levelKey] : null;

  const program = course.program;
  const programIcon = program?.programiconurl;
  const programLabel = program?.program_name;

  const skillTags = Array.isArray(course.skills)
    ? course.skills.filter((s) => s && typeof s === "object" && s.skill_name)
    : [];

  // Same resolution as the in-class CourseCard, by ID and never by the printed
  // name. See lib/skillCapsuleHref. A null leaves the capsule a plain <span>.
  const skillLinks = skillTags.slice(0, 3).map((s) => {
    const href = skillCapsuleHref(s, skillSlugs);
    if (!href) logUnresolvedCapsule({ skill: s, where: "OnlineCourseCard", courseId: id });
    return { skill: s, href };
  });

  // ONE definition, shared with the /search result card — see the module.
  const ctaHref = onlineCourseHref(course);

  /**
   * ALWAYS AN ARRAY, AND TODAY ALWAYS EMPTY. The two fields it reads
   * (`o_course_instructor_name`, `o_course_instructor_image_url`) do not exist
   * upstream yet — see lib/onlineCourseInstructors. Rendered as a list rather
   * than as one object so a co-taught course costs nothing here later.
   */
  const instructors = onlineCourseInstructors(course);

  const duration = formatDuration(hours);
  const isFree = price === 0;
  const hasDiscount = !isFree && netPrice > price;

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl  bg-white shadow-sm",
        "transition-all duration-9e-micro ease-9e hover:-translate-y-1 hover:shadow-9e-md dark:bg-9e-navy dark:border-none",
        className,
      )}
    >
      <a
        href={ctaHref}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block aspect-video overflow-hidden bg-9e-ice"
      >
        {cover ? (
          <Image
            src={cover}
            alt={name ?? ""}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover"
            draggable={false}
          />
        ) : programIcon ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Image
              src={programIcon}
              alt={programLabel ?? ""}
              width={72}
              height={72}
              className="object-contain"
            />
          </div>
        ) : null}
      </a>

      <div className="flex flex-1 flex-col p-4">
        {/*
          Same substitution and same class-literal rule as the in-class
          CourseCard — both strings written out in full, never composed, because
          Tailwind scans text and never evaluates it. Focus is left to the
          app-wide `*:focus-visible` rule in globals.css.

          THE CAPSULE IS AN INTERNAL LINK ON A CARD WHOSE EVERY OTHER LINK IS
          EXTERNAL. The thumbnail, title and CTA all open 9Expert Academy in a
          new tab; this one navigates in place, to our own catalogue. That is
          deliberate — the capsule means "this skill", not "this course" — so it
          carries neither `target` nor the outbound icon the other three use.
        */}
        {/*
          THE ROW IS NO LONGER GATED ON `skillLinks.length`, and that is the
          change. The `e-Learning` pill is CONSTANT — every row on the
          `/online-course` feed is e-learning by construction, so there is no
          field to read and no course that should be without it — which means
          the row now always has at least one child. Gating it on the skills
          would hide the constant pill on a course that happens to carry no
          resolvable skill.

          It is FIRST, before the skills, deliberately: it says what kind of
          thing this card is, and the skills say what it is about. A test pins
          the order rather than mere presence, because "both pills render" is
          also true of the wrong arrangement.

          The class literal is written out in full and NOT passed through `cn`.
          twMerge does not know the custom `9e-*` scales, so a token handed to
          it can lose to alphabetical emission — the standing hazard in this
          repo. Nothing here is overridable by a caller, so nothing needs to go
          through the merge.
        */}
        <div className="mb-2 flex flex-wrap gap-1">
          {/* <span className="rounded-full border border-9e-action/30 bg-9e-action/5 px-2 py-0.5 text-xs font-medium text-9e-action dark:border-9e-air/30 dark:bg-9e-air/10 dark:text-9e-air">
            e-Learning
          </span> */}
          {skillLinks.map(({ skill: s, href }) =>
            href ? (
              <Link
                key={s._id ?? s.skill_id ?? s.skill_name}
                href={href}
                className="rounded-full border border-gray-100 px-2 py-0.5 text-xs text-9e-slate-dp-50 transition-colors duration-9e-micro ease-9e hover:border-9e-action hover:text-9e-action dark:border-[#1e3a5f] dark:text-[#94a3b8] dark:hover:border-9e-air dark:hover:text-9e-air"
              >
                {s.skill_name}
              </Link>
            ) : (
              <span
                key={s._id ?? s.skill_id ?? s.skill_name}
                className="rounded-full border border-gray-100 px-2 py-0.5 text-xs text-9e-slate-dp-50 dark:border-[#1e3a5f] dark:text-[#94a3b8]"
              >
                {s.skill_name}
              </span>
            )
          )}
        </div>

        <div className="h-[52px]">
          <a href={ctaHref} target="_blank" rel="noopener noreferrer">
            <h3 className="mb-2 line-clamp-2 border-l-4 border-9e-action pl-2 text-base font-bold leading-snug text-9e-navy transition-colors duration-9e-micro ease-9e hover:text-9e-action dark:text-white">
              {name}
            </h3>
          </a>
        </div>

        {teaser && (
          <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-9e-slate-dp-50 dark:text-[#b7c3d4]">
            {teaser}
          </p>
        )}

        {/*
          THE INSTRUCTOR ROW, AND ITS ABSENCE IS THE COMMON CASE.

          `instructors` is `[]` for every course on the feed today, so on the
          day this ships NOTHING below renders. That is the reason the guard is
          `length > 0` around the whole row rather than a per-field check
          inside it: an empty row would still occupy its `mb-3`, and a reserved
          blank strip on every card is a worse outcome than the missing data it
          would be standing in for.

          NO GAP IS LEFT BEHIND when it collapses. The parent is a plain
          `flex flex-col` — it carries no `space-y-*` and no `gap-*`, so
          spacing on this card comes from each child's own `mb-*`. A child that
          renders nothing therefore contributes nothing, which is exactly what
          a `space-y` parent would NOT do; a test pins that.

          THE AVATAR IS ITS OWN CONDITION, not part of the row's. The audit
          measured 6 of 16 instructor rows holding a photo, so "named, not
          photographed" is ordinary. Those render the name alone — no `<img>`,
          no grey circle standing in for one. `shrink-0` keeps the avatar
          circular when a long Thai name wants the space.
        */}
        {instructors.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {instructors.map((instructor) => (
              <span
                key={instructor.name}
                className="inline-flex items-center gap-1.5 text-xs text-9e-slate-dp-50 dark:text-[#b7c3d4]"
              >
                {instructor.imageUrl && (
                  /*
                    RAW <img>, NOT next/image, and for the reason
                    CareerPathResultCard gives for the same choice: next/image
                    THROWS at runtime on a host absent from next.config.mjs
                    `remotePatterns`, and this field's host is not yet known.

                    Measured 2026-08-31: the allow-list carries
                    res.cloudinary.com and six others, but NOT
                    storage.googleapis.com — which is where MSDB already serves
                    `o_course_doc_paths` from. So an instructor photo uploaded
                    beside those documents would take the WHOLE HOME PAGE down,
                    not just blank one avatar. A 28px thumbnail is not worth
                    that trade before a single real URL has been seen.

                    Revisit once the field is populated and its host is known:
                    if it is Cloudinary like the covers, next/image is a
                    straight upgrade.

                    `alt=""` is deliberate — the name is printed immediately
                    beside it, so a caption here would be read twice.
                  */
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={instructor.imageUrl}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                    className="h-7 w-7 shrink-0 rounded-full object-cover"
                    draggable={false}
                  />
                )}
                {instructor.name}
              </span>
            ))}
          </div>
        )}

        <div className="mb-3 mt-auto flex flex-wrap items-end justify-between gap-2 text-xs text-9e-slate-dp-50 dark:text-[#b7c3d4]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {duration && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" strokeWidth={1.75} />
                {duration}
              </span>
            )}
            {lessons > 0 && (
              <span className="inline-flex items-center gap-1">
                <BookOpen className="h-3 w-3" strokeWidth={1.75} />
                {lessons} บทเรียน
              </span>
            )}
          </div>
          <PriceDisplay
            isFree={isFree}
            hasDiscount={hasDiscount}
            price={price}
            netPrice={netPrice}
          />
        </div>

        {(hasCertificate || levelLabel) && (
          <div className="flex flex-wrap gap-3 text-xs text-9e-slate-dp-50 dark:text-[#b7c3d4]">
            {hasCertificate && (
              <span className="inline-flex items-center gap-1">
                <Award className="h-3 w-3 text-9e-action dark:text-white" strokeWidth={2} />
                e-Certificate
              </span>
            )}
            {levelLabel && (
              <span className="inline-flex items-center gap-1">
                <BarChart2
                  className="h-3 w-3 text-9e-action dark:text-white"
                  strokeWidth={2}
                />
                {levelLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <a
        href={ctaHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 bg-9e-action px-4 py-3 text-sm font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-brand"
      >
        ดูรายละเอียด
        <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
      </a>
    </article>
  );
}

function PriceDisplay({ isFree, hasDiscount, price, netPrice }) {
  if (isFree) {
    return <span className="text-base font-bold text-9e-navy dark:text-white">ฟรี</span>;
  }
  if (hasDiscount) {
    return (
      <span className="flex items-baseline gap-1 ">
        <span className="text-sm text-[#999] line-through dark:text-[#6b7280]">
          {netPrice.toLocaleString("th-TH")}.-
        </span>
        <span className="text-base font-bold text-9e-action dark:text-white">
          {price.toLocaleString("th-TH")}.-
        </span>
      </span>
    );
  }
  return (
    <span className="text-base font-bold text-9e-navy dark:text-white">
      {price.toLocaleString("th-TH")}.-
    </span>
  );
}

// `o_course_traininghours` may be decimal (e.g. 2.33). Render as
// "X ชม.", "Y นาที", or "X ชม. Y นาที" depending on the parts.
function formatDuration(hours) {
  if (!hours) return null;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h} ชม. ${m} นาที`;
  if (h > 0) return `${h} ชม.`;
  return `${m} นาที`;
}
