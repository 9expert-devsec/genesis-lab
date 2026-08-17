"use client";

import { memo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Award, BarChart2, Clock, MonitorPlay } from "lucide-react";
import { cn, courseHref } from "@/lib/utils";
import { coursePriceLabel } from "@/lib/coursePriceLabel";
import ScheduleCard from "@/components/ScheduleCard";
import { EarlyBirdRibbon } from "@/components/ui/EarlyBirdRibbon";
import { formatStatusFromAPI } from "@/lib/formatScheduleDate";
import { formatRoundDays } from "@/lib/schedule/roundDateLabel";
import { scheduleRegistrationHref } from "@/lib/schedule/scheduleRegistrationHref";
import { trainingTypeColor } from "@/lib/schedule/trainingTypeColor";
import { skillCapsuleHref } from "@/lib/skillCapsuleHref";
import { logUnresolvedCapsule } from "@/lib/logUnresolvedCapsule";

const LEVEL_LABEL = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };

/**
 * How many rounds the expand panel shows.
 *
 * TWO, side by side, and named rather than inlined because the number and the
 * grid have to agree: `grid-cols-2` below is the same decision written in
 * Tailwind, and a bump to three here without touching that class would silently
 * wrap the third box onto a second row.
 */
const MAX_CARD_ROUNDS = 2;

/**
 * Course card for both the home-page carousels and /training-course.
 *
 * Upstream list responses omit cover / teaser / levels / training-hours —
 * the server pages pre-fetch them via detail. When they're absent we
 * just skip that row.
 *
 * `course.schedules` is optional; when present (pre-fetched server-side)
 * the expand panel shows up to 3 upcoming sessions as signup pills.
 */
/**
 * `currentYear` HAS NO DEFAULT, DELIBERATELY.
 *
 * It is the Gregorian year in Asia/Bangkok, computed on the SERVER page that
 * fetches the schedules (via `siteCurrentYear`) and passed down. Defaulting it
 * to `new Date().getFullYear()` here would be the b-001 defect: this component
 * renders during SSR as well, and on Vercel (UTC) that expression gives a
 * different answer on the server than in the visitor's browser for the seven
 * hours before midnight Bangkok on 31 December.
 *
 * Left undefined, `formatRoundDays(..., { showYear: 'auto' })` THROWS rather
 * than guessing — so a call site that forgets to pass it fails loudly, and only
 * on a card that actually has rounds to draw. That is the intended failure mode.
 */
/**
 * `skillSlugs` DEFAULTS TO `{}`, unlike `currentYear` above, and the difference
 * is deliberate rather than an inconsistency.
 *
 * `currentYear` has no default because its omission is a hard 500 and must fail
 * loudly. An absent slug map is the opposite: every capsule resolves to null
 * and renders exactly the inert <span> it rendered before this prop existed.
 * A missing map must cost the LINK, never the page — an upstream outage or a
 * failed Mongo read has to degrade the card, not blank the catalogue.
 *
 * Silence is not the same as safety, though, so a capsule that cannot resolve
 * warns once per skill per process — see lib/logUnresolvedCapsule.
 *
 * That the prop is THREADED at all is enforced by
 * test/fs/skillSlugsThreading, which derives the set of routes from the import
 * graph rather than a list.
 */
function CourseCardComponent({
  course,
  className,
  earlyBirdScheduleId = null,
  currentYear,
  skillSlugs = {},
}) {
  const [expanded, setExpanded] = useState(false);

  if (!course) return null;

  const {
    course_id: id,
    course_name: name,
    course_trainingdays: days,
    course_traininghours: hours,
    course_price: price,
    course_cover_url: cover,
    course_teaser: teaser,
    course_levels: levels,
    course_workshop_status: hasWorkshop,
    course_certificate_status: hasCertificate,
    course_type_public: isPublic,
    course_type_inhouse: isInhouse,
    program,
    skills,
    schedules = [],
  } = course;

  const isInhouseOnly = isInhouse === true && !isPublic;

  const href = courseHref(id ? String(id).toLowerCase() : "");
  const inhouseHref = `/registration/in-house?course=${String(id ?? '').toLowerCase()}`;
  const programIcon = program?.programiconurl;
  const programLabel = program?.program_name;
  const levelKey = levels != null ? Number(levels) : null;
  const levelLabel = levelKey ? LEVEL_LABEL[levelKey] : null;

  // Only render skill pills when we actually have skill objects (post-detail
  // fetch). Bare ObjectId strings from the list response are filtered out.
  const skillTags = Array.isArray(skills)
    ? skills.filter((s) => s && typeof s === "object" && s.skill_name)
    : [];

  /**
   * The capsule's destination, resolved ONCE per card rather than inside the
   * map below — and by ID, never by the printed `skill_name`. See
   * lib/skillCapsuleHref for why the displayed string is not a key: the
   * `Development` capsule lives at /programming-all-courses.
   *
   * A null means "no link"; the capsule stays a <span>.
   */
  const skillLinks = skillTags.slice(0, 3).map((s) => {
    const href = skillCapsuleHref(s, skillSlugs);
    if (!href) logUnresolvedCapsule({ skill: s, where: "CourseCard", courseId: id });
    return { skill: s, href };
  });

  const hours_ = hours ?? (days ? days * 6 : null);

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:bg-9e-navy dark:border-none",
        "transition-all duration-9e-micro ease-9e hover:-translate-y-1 hover:shadow-9e-md",
        className,
      )}
    >
      {/* ── Thumbnail ── */}
      <Link
        href={href}
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
      </Link>

      {/* ── Content ── */}
      <div className="flex flex-1 flex-col p-4">
        {/* Skill tags */}
        {/*
          THE TWO CLASS STRINGS ARE WRITTEN OUT IN FULL, TWICE, ON PURPOSE.

          Factoring the shared half into a constant and composing it — with a
          template literal or through `cn()` — is how the /schedule round hover
          shipped dead: Tailwind scans source TEXT and never evaluates it, so a
          class it cannot see written out is a class it never emits, and the
          markup still looks perfect. `cn()` carries a second hazard here:
          twMerge does not know the custom `9e-*` scales, so it cannot be
          trusted to keep `text-xs` alongside `text-9e-slate-dp-50`.

          Duplication is the cheap half of that trade. test/fs/tailwindArbitrary
          ValueRules COMPILES this file and asserts the hover rules exist.

          FOCUS is deliberately absent from both strings. globals.css carries an
          app-wide `*:focus-visible { ring-2 ring-9e-brand ring-offset-2 }`, so
          the anchor is already focus-visible; adding a local ring — or setting
          `--tw-ring-color` inline, which is a global custom property on the
          element — would repaint that rule for this one capsule.
        */}
        {skillLinks.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
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
        )}

        {/* Course name with left accent */}
        <div className="h-[52px]">
          <Link href={href}>
            <h3 className="mb-2 line-clamp-2 border-l-4 border-9e-action pl-2 text-base font-bold leading-snug text-9e-navy transition-colors duration-9e-micro ease-9e hover:text-9e-action dark:text-white">
              {name}
            </h3>
          </Link>
        </div>

        {/* Teaser */}
        {teaser && (
          <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-9e-slate-dp-50 dark:text-[#b7c3d4]">
            {teaser}
          </p>
        )}

        {/* Duration + Price */}
        <div className="mb-3 mt-auto flex flex-wrap items-center justify-between gap-2 text-xs text-9e-slate-dp-50 dark:text-[#b7c3d4]">
          {days ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" strokeWidth={1.75} />
              {days} วัน{hours_ ? ` (${hours_} ชม.)` : ""}
            </span>
          ) : (
            <span />
          )}
          {/* whitespace-nowrap: "Inhouse Only" is two words where "Call" was
              one, and a break between them reads as a layout bug rather than as
              a label. The row above is `flex-wrap`, so when the card is too
              narrow to hold duration and price side by side the ROW wraps —
              which is legible — instead of the label splitting. */}
          <span className="whitespace-nowrap text-base font-bold text-9e-navy dark:text-white">
            {coursePriceLabel(price, { suffix: ".-" })}
          </span>
        </div>

        {/* Feature badges */}
        {(hasWorkshop || hasCertificate || levelLabel) && (
          <div className="flex flex-wrap gap-2 text-[11px] text-9e-slate-dp-50 dark:text-[#b7c3d4]">
            {hasWorkshop && (
              <span className="inline-flex items-center gap-1">
                <MonitorPlay
                  className="h-3 w-3 text-9e-action dark:text-white"
                  strokeWidth={2}
                />
                Workshop
              </span>
            )}
            {hasCertificate && (
              <span className="inline-flex items-center gap-1">
                <Award
                  className="h-3 w-3 text-9e-action dark:text-white"
                  strokeWidth={2}
                />
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

      {/* ── Expand panel (schedules) — hidden for inhouse-only and for
            courses with no schedules (e.g. online-only). ── */}
      {!isInhouseOnly && schedules?.length > 0 && (
        <div
          className={cn(
            "overflow-hidden transition-[max-height] duration-9e-reveal ease-in-out",
            {
              "max-h-96": expanded,
              "max-h-0": !expanded,
            },
          )}
        >
          <div className="border-t border-9e-air/30 bg-[#ffffff] px-4 pt-3 dark:bg-9e-navy">
            {/*
              A SIXTH COPY OF THE PALETTE LIVED HERE, and it was missed when the
              other five were consolidated: this legend sat in the same file as
              the round boxes it describes, so repointing the boxes left it
              naming `bg-9e-action` / `bg-purple-500` for rounds that had just
              been repainted #00CCFF / #8B5CF6 — a legend contradicting the thing
              it labels, two lines below it.

              Inline `backgroundColor` rather than a `bg-[…]` class, for the
              reason lib/schedule/trainingTypeColor and every other consumer
              does it: Tailwind scans source TEXT and never evaluates it, so a
              class built from a value compiles to nothing and fails silently.
              (The /schedule round hover shipped dead exactly that way.)
            */}
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-9e-slate-dp-50 dark:text-[#b7c3d4]">
              <span>รอบการอบรม</span>
              {[
                { type: "classroom", label: "Classroom" },
                { type: "hybrid", label: "Hybrid" },
              ].map(({ type, label }) => (
                <span key={type} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-full border-2 border-white shadow-9e-sm"
                    style={{ backgroundColor: trainingTypeColor(type) }}
                  />
                  {label}
                </span>
              ))}
            </div>
            {/*
              AT MOST TWO ROUNDS, SIDE BY SIDE.

              This replaced a `flex flex-nowrap overflow-x-auto` strip showing
              `schedules.slice(0, 3)`. Two reasons the strip had to go: a third
              card was only reachable by discovering a horizontal scroll inside a
              card that is itself inside a grid, and — the measurable one — the
              boxes had a fixed 83px width that a Thai round label overflows.

              `items-stretch` plus `h-full` on each box is what keeps the two
              cells the same height when one label wraps to two lines and the
              other does not. `grid-cols-2` regardless of round count, so a
              course with ONE round shows a half-width box rather than a
              stretched one — the shape stays constant across the grid.

              There is deliberately no "+N รอบ" indicator for courses with more
              than two rounds; it was not asked for. See the report — its absence
              is a real, if small, information loss.
            */}
            <div className="grid grid-cols-2 items-stretch gap-2 pt-2">
              {schedules.slice(0, MAX_CARD_ROUNDS).map((s, idx) => {
                const isEarlyBird = !!earlyBirdScheduleId && s._id === earlyBirdScheduleId;
                /*
                  The card always carries its month AND, under `'auto'`, its year
                  when the round is not in `currentYear`.

                  THIS SURFACE NEEDS `auto` MORE THAN ANY OTHER, and the reason is
                  a measurement. These rounds come from `enrichCoursesWithDetails`
                  → `listSchedulesByCourse`, which takes `limit: 3` with NO `to`
                  bound and no horizon at all — it is "the next N rounds", not
                  "the next N months". A course running twice a year, viewed in
                  November, shows rounds in February and May of the FOLLOWING
                  year, and a bare `16-17 ก.พ.` on a bookable card reads as a date
                  that has already passed.

                  `currentYear` is a PROP, computed on the server. This is a
                  client component that also renders during SSR, and on Vercel
                  (UTC) the server's year and the visitor's Bangkok year disagree
                  for the seven hours before midnight on 31 December — a
                  hydration mismatch on the one night the year matters most.
                */
                const card = (
                  <ScheduleCard
                    key={s._id ?? idx}
                    dateLabel={formatRoundDays(s?.dates, {
                      showMonth: true,
                      showYear: "auto",
                      currentYear,
                    })}
                    type={s.type || "classroom"}
                    status={formatStatusFromAPI(s.status)}
                  />
                );

                /*
                  THE SHARED BUILDER, not a fourth copy of the template.

                  This was built inline here — `/registration/public?course=…
                  &class=…` with a `signup_url` fallback — and it NEVER ASKED THE
                  STATUS. `scheduleRegistrationHref` returns null for a round
                  that is `full` (and for the local override collection's
                  `closed` spelling of the same state), and deliberately shadows
                  the `signup_url` fallback in that case too: a sold-out round
                  with a live upstream signup link is the worst version of this,
                  a working form that will take a booking for a round with no
                  seats.

                  ── THE HOLE IS LATENT, NOT LIVE, AND THAT IS WHY IT IS WORTH
                     CLOSING NOW ─────────────────────────────────────────────
                  Measured against the real feed: enrichCoursesWithDetails calls
                  listSchedulesByCourse with NO `status`, so upstream applies its
                  own registerable-only filter and a `full` round does not arrive
                  here today (verified against a course that HAS one — the
                  no-status call returns [open, open, open], the same call with
                  PUBLIC_SCHEDULE_STATUSES returns [full, open, open, open]).
                  Local `closed` overrides do not reach this path either;
                  resolveScheduleStatusBatch runs only in RegisterPageContent.

                  So this is hardening, not a live bug fix. It matters because
                  /schedule, /search and the course detail page have EACH already
                  widened their own fetch to PUBLIC_SCHEDULE_STATUSES so a
                  sold-out round can be shown — and the day anyone does the same
                  here, this card would be the one surface still linking it.
                */
                const registrationHref = scheduleRegistrationHref(s, id);

                return registrationHref ? (
                  <a
                    key={s._id ?? idx}
                    href={registrationHref}
                    className="relative block overflow-hidden transition-transform duration-9e-micro ease-9e hover:-translate-y-0.5"
                  >
                    {isEarlyBird && <EarlyBirdRibbon />}
                    {card}
                  </a>
                ) : (
                  // No anchor: nothing to click, nothing to focus. The cursor
                  // says so for a pointer user.
                  <div key={s._id ?? idx} className="cursor-not-allowed">
                    {card}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Collapse-only control — small triangle centered at the panel bottom */}
        </div>
      )}

      {/* ── CTA ── */}
      {isInhouseOnly ? (
        <Link
          href={inhouseHref}
          className="flex w-full items-center justify-center bg-9e-navy px-4 py-3 text-sm font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-navy/90 dark:bg-9e-ice dark:text-9e-navy"
        >
          ขอใบเสนอราคา
        </Link>
      ) : !schedules?.length ? null : expanded ? (
        /* สถานะเมื่อขยายแล้ว: แสดงปุ่มเพื่อหุบเก็บ */
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="ย่อรอบอบรม"
          className="text-base text-9e-action transition-colors  duration-9e-reveal ease-in-out hover:text-9e-action px-4 py-3 bg-[#fff] dark:bg-9e-navy"
        >
          ▲
        </button>
      ) : (
        /* สถานะเมื่อปิดอยู่: แสดงปุ่มเพื่อกดดู */
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-2 bg-9e-action px-4 py-3 text-sm font-bold text-white transition-colors duration-9e-micro ease-in-out hover:bg-9e-brand"
        >
          <span className="text-xs leading-none">▼</span>
          กดเพื่อดูรอบอบรม
        </button>
      )}
    </article>
  );
}

export const CourseCard = memo(CourseCardComponent);
