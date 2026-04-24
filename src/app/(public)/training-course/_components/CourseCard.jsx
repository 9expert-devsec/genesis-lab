"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Award, BarChart2, Clock, MonitorPlay } from "lucide-react";
import { cn, courseHref } from "@/lib/utils";

const LEVEL_LABEL = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };

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
export function CourseCard({ course, className }) {
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
  const programIcon = program?.programiconurl;
  const programLabel = program?.program_name;
  const levelKey = levels != null ? Number(levels) : null;
  const levelLabel = levelKey ? LEVEL_LABEL[levelKey] : null;

  // Only render skill pills when we actually have skill objects (post-detail
  // fetch). Bare ObjectId strings from the list response are filtered out.
  const skillTags = Array.isArray(skills)
    ? skills.filter((s) => s && typeof s === "object" && s.skill_name)
    : [];

  const hours_ = hours ?? (days ? days * 6 : null);

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm",
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
        {skillTags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {skillTags.slice(0, 3).map((s) => (
              <span
                key={s._id ?? s.skill_id ?? s.skill_name}
                className="rounded-full border border-gray-100 bg-9e-ice px-2 py-0.5 text-xs text-9e-slate"
              >
                {s.skill_name}
              </span>
            ))}
          </div>
        )}

        {/* Course name with left accent */}
        <div className="h-[46px]">
          <Link href={href}>
            <h3 className="mb-2 line-clamp-2 border-l-4 border-9e-primary pl-2 text-sm font-bold leading-snug text-9e-navy transition-colors duration-9e-micro ease-9e hover:text-9e-primary">
              {name}
            </h3>
          </Link>
        </div>

        {/* Teaser */}
        {teaser && (
          <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-9e-slate">
            {teaser}
          </p>
        )}

        {/* Duration + Price */}
        <div className="mb-3 mt-auto flex items-center justify-between text-xs text-9e-slate">
          {days ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" strokeWidth={1.75} />
              {days} วัน{hours_ ? ` (${hours_} ชม.)` : ""}
            </span>
          ) : (
            <span />
          )}
          <span className="text-sm font-bold text-9e-navy">
            {!price || Number(price) === 0
              ? "Call .-"
              : `${Number(price).toLocaleString("th-TH")} .-`}
          </span>
        </div>

        {/* Feature badges */}
        {(hasWorkshop || hasCertificate || levelLabel) && (
          <div className="flex flex-wrap gap-3 text-xs text-9e-slate">
            {hasWorkshop && (
              <span className="inline-flex items-center gap-1">
                <MonitorPlay
                  className="h-3 w-3 text-9e-primary"
                  strokeWidth={2}
                />
                Workshop
              </span>
            )}
            {hasCertificate && (
              <span className="inline-flex items-center gap-1">
                <Award className="h-3 w-3 text-9e-primary" strokeWidth={2} />
                e-Certificate
              </span>
            )}
            {levelLabel && (
              <span className="inline-flex items-center gap-1">
                <BarChart2
                  className="h-3 w-3 text-9e-primary"
                  strokeWidth={2}
                />
                {levelLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Expand panel (schedules) — hidden for inhouse-only courses ── */}
      {!isInhouseOnly && (
        <div
          className={cn(
            "overflow-hidden transition-[max-height] duration-9e-reveal ease-9e",
            expanded ? "max-h-96" : "max-h-0",
          )}
        >
          <div className="border-t border-9e-sky/30 bg-9e-ice/60 px-4 pb-4 pt-3">
            {schedules.length > 0 ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-9e-slate">
                  <span>รอบการอบรม</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-white bg-9e-primary shadow-9e-sm" />
                    Classroom
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-white bg-purple-500 shadow-9e-sm" />
                    Hybrid
                  </span>
                </div>

                <div className="scrollbar-hide flex justify-between overflow-x-auto pb-1 pt-2">
                  {schedules.slice(0, 3).map((s) => (
                    <SchedulePill key={s._id} schedule={s} />
                  ))}
                </div>
              </>
            ) : (
              <div className="py-1 text-center">
                <p className="mb-2 text-xs text-9e-slate">
                  ยังไม่มีรอบอบรมที่เปิดรับสมัคร
                </p>
                <Link
                  href={href}
                  className="text-xs font-semibold text-9e-primary hover:underline"
                >
                  ดูรายละเอียดหลักสูตร →
                </Link>
              </div>
            )}
          </div>
          {/* Collapse-only control — small triangle centered at the panel bottom */}
         
        </div>
      )}

      {/* ── CTA ── */}
      {isInhouseOnly ? (
        <Link
          href="/registration/in-house"
          className="flex w-full items-center justify-center bg-9e-navy px-4 py-3 text-sm font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-navy/90"
        >
          รับเฉพาะ Inhouse
        </Link>
      ) : expanded ? (
        /* สถานะเมื่อขยายแล้ว: แสดงปุ่มเพื่อหุบเก็บ */
        <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="ย่อรอบอบรม"
              className="text-base text-9e-primary transition-colors hover:text-9e-brand px-4 py-3"
            >
              ▲
            </button>
      ) : (
        /* สถานะเมื่อปิดอยู่: แสดงปุ่มเพื่อกดดู */
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-2 bg-9e-primary px-4 py-3 text-sm font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-brand"
        >
          <span className="text-xs leading-none">▼</span>
          กดเพื่อดูรอบอบรม
        </button>
      )}
    </article>
  );
}

function SchedulePill({ schedule }) {
  const { type, status, signup_url: url, dates } = schedule;
  const { days, month } = formatScheduleDates(dates);

  const isHybrid = type === "hybrid";
  const borderColor = isHybrid ? "border-purple-400" : "border-9e-sky";
  const dotColor = isHybrid ? "bg-purple-500" : "bg-9e-primary";

  const isFull = status === "full";
  const isNearlyFull = status === "nearly_full";
  const statusBg = isFull
    ? "bg-red-500"
    : isNearlyFull
      ? "bg-amber-400"
      : "bg-green-500";
  const statusText = isFull ? "เต็ม" : isNearlyFull ? "ใกล้เต็ม" : "รับสมัคร";

  const Wrapper = url ? "a" : "div";
  const wrapperProps = url
    ? { href: url, target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "relative flex min-w-[80px] shrink-0 flex-col items-center justify-center rounded-2xl border-2 bg-white px-3 pb-2 pt-3 text-center transition-all duration-9e-micro ease-9e",
        borderColor,
        url && "hover:-translate-y-0.5 hover:shadow-9e-md",
      )}
    >
      {/* Corner dot — inside the border */}
      <span
        className={cn(
          "absolute left-1.5 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white shadow-9e-sm",
          dotColor,
        )}
      />

      <span className="text-sm font-extrabold leading-none text-9e-navy">
        {days}
      </span>
      <span className="mt-0.5 text-xs font-bold uppercase leading-none text-9e-slate">
        {month}
      </span>

      <span
        className={cn(
          "mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-white",
          statusBg,
        )}
      >
        {statusText}
      </span>
    </Wrapper>
  );
}

/**
 * Split a schedule's `dates` array into separate day and month labels
 * so the pill can stack them vertically. Month is taken from the first
 * date (cross-month ranges render as e.g. "30-2 MAY").
 *
 * Examples:
 *   ["2026-05-05…"]                   → { days: "5",    month: "MAY" }
 *   ["2026-05-05…", "2026-05-06…"]    → { days: "5-6",  month: "MAY" }
 */
function formatScheduleDates(dates) {
  if (!Array.isArray(dates) || dates.length === 0) {
    return { days: "", month: "" };
  }
  const opts = { timeZone: "Asia/Bangkok" };
  const first = new Date(dates[0]);
  const last = new Date(dates[dates.length - 1]);
  const firstDay = first.toLocaleDateString("en-GB", {
    ...opts,
    day: "numeric",
  });
  const lastDay = last.toLocaleDateString("en-GB", { ...opts, day: "numeric" });
  const month = first
    .toLocaleDateString("en-GB", { ...opts, month: "short" })
    .toUpperCase();
  const days =
    dates.length === 1 || firstDay === lastDay
      ? firstDay
      : `${firstDay}-${lastDay}`;
  return { days, month };
}
