"use client";

import Image from "next/image";
import Link from "next/link";
import { Award, BarChart2, BookOpen, Clock, ExternalLink } from "lucide-react";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

const LEVEL_LABEL = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };

/**
 * Card for online (self-paced) courses surfaced on the home page.
 *
 * Online courses come from the `/online-course` upstream feed with an
 * `o_course_*` field prefix and have no schedule rows. The CTA points
 * at 9Expert Academy via `website_urls[0]`, falling back to the
 * academy root if the course doesn't carry a direct link.
 */
export function OnlineCourseCard({ course, className }) {
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

  const ctaHref = Array.isArray(course.website_urls) && course.website_urls[0]
    ? course.website_urls[0]
    : siteConfig.academyUrl;

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
        {skillTags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {skillTags.slice(0, 3).map((s) => (
              <span
                key={s._id ?? s.skill_id ?? s.skill_name}
                className="rounded-full border border-gray-100 px-2 py-0.5 text-xs text-9e-slate-dp-50 dark:border-[#1e3a5f] dark:text-[#94a3b8]"
              >
                {s.skill_name}
              </span>
            ))}
          </div>
        )}

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
