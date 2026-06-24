"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Award,
  BarChart2,
  CheckCircle2,
  ChevronDown,
  Download,
  Plus,
  Wrench,
  X,
} from "lucide-react";
import { CountdownTimer } from "../../_components/CountdownTimer";

const LEVEL_MAP = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/**
 * Format a batch date to English: "Sat, 20 Jun 2026"
 * Falls back to day_label if date field is unavailable.
 */
function formatBatchDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    weekday: "short", // "Sat"
    day: "numeric", // "20"
    month: "short", // "Jun"
    year: "numeric", // "2026"
  });
}

// ── Shared FAQ accordion (same as listing page) ───────────────────────────────
function FaqAccordionItem({ faq }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`border rounded-2xl dark:border-gray-700 ${open ? "border-9e-action-scale-600 shadow-lg shadow-9e-action-scale-600/20" : "border-gray-200"}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left text-base md:text-[17px] font-bold text-9e-navy dark:text-white"
      >
        <span>{faq.question_th}</span>
        <div
          className="p-2
         rounded-full bg-9e-signature-900"
        >
          <Plus
            size={16}
            className={`shrink-0 transition-transform duration-200 text-9e-action ${open ? "rotate-45" : ""}`}
          />
        </div>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-96" : "max-h-0"}`}
      >
        <div
          className="prose prose-base dark:prose-invert px-4 pb-4 text-gray-600 dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: faq.answer_html }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MasterclassDetailClient({ course, faqs = [] }) {
  // [K] Instructors fetch
  const [instructors, setInstructors] = useState([]);
  useEffect(() => {
    if (!course.instructor_ids?.length) return;
    fetch(`/api/admin/instructors?ids=${course.instructor_ids.join(",")}`)
      .then((r) => r.json())
      .then((data) => setInstructors(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [course.instructor_ids]);

  // [J] Curriculum open/close state
  const buildDefaultOpen = () => {
    const map = {};
    course.curriculum?.forEach((session, si) => {
      session.modules?.forEach((_, mi) => {
        map[`${si}-${mi}`] = true;
      });
    });
    return map;
  };
  const [openModules, setOpenModules] = useState({});
  useEffect(() => {
    setOpenModules(buildDefaultOpen());
  }, []);

  const allOpen =
    Object.values(openModules).every(Boolean) &&
    Object.keys(openModules).length > 0;
  const toggleAll = () => {
    const next = {};
    Object.keys(openModules).forEach((k) => {
      next[k] = !allOpen;
    });
    setOpenModules(next);
  };
  const toggleModule = (key) =>
    setOpenModules((prev) => ({ ...prev, [key]: !prev[key] }));

  const visibleBatches =
    course.batches?.filter((b) => b.status !== "cancelled") ?? [];

  // [sticky bar] show after scrolling past the batch section
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [barDismissed, setBarDismissed] = useState(false);

  useEffect(() => {
    if (visibleBatches.length === 0) return; // no point showing if no batches
    const handleScroll = () => {
      const batchEl = document.getElementById("batch-section");
      if (!batchEl) return;
      const rect = batchEl.getBoundingClientRect();
      // show when the bottom of the batch section is above the top of the viewport
      setShowStickyBar(rect.bottom < 0);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [visibleBatches.length]);

  return (
    <main>
      {/* [A] Hero */}
      <section id="mc-hero" className="bg-[#0e2c4a] lg:px-4 lg:py-10">
        <div className="max-w-[1200px] mx-auto relative grid grid-cols-1 lg:grid-cols-2 lg:items-stretch lg:gap-6">
          {/* Cover image — mobile only: full-width, above text, no padding */}
          <div className="lg:hidden order-first">
            {course.cover_image_url ? (
              <div className="relative aspect-video w-full overflow-hidden">
                <Image
                  src={course.cover_image_url}
                  alt={course.title_th}
                  fill
                  className="object-cover"
                  sizes="100vw"
                  priority
                />
              </div>
            ) : (
              <div className="aspect-video w-full bg-gradient-to-br from-9e-brand to-9e-action" />
            )}
          </div>
          <div className="relative flex overflow-hidden bg-9e-navy lg:rounded-2xl lg:aspect-video px-6 py-4 md:py-8 lg:p-8">
            {/* Subtle corner gradient blobs */}
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-75 blur-3xl"
              style={{ background: course.hero_gradient_from ?? "#2486FF" }}
            />
            <div
              className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full opacity-70 blur-3xl"
              style={{ background: course.hero_gradient_to ?? "#005CFF" }}
            />

            <div className="relative flex w-full flex-col">
              <div>
                <span className="text-sm md:text-base font-semibold tracking-widest text-9e-lime">
                  Masterclass
                </span>

                <h1 className="mt-3 text-xl md:text-3xl font-bold leading-tight text-white lg:text-4xl">
                  {course.title_th}
                </h1>

                {course.subtitle_th && (
                  <p className="mt-3 line-clamp-3 text-sm md:text-base text-white leading-relaxed">
                    {course.subtitle_th}
                  </p>
                )}
              </div>

              <div className="mt-auto">
                <div className="flex flex-wrap gap-2">
                  {[
                    { icon: <Wrench size={12} />, label: "Workshop" },
                    { icon: <Award size={12} />, label: "e-Certificate" },
                    {
                      icon: <BarChart2 size={12} />,
                      label: LEVEL_MAP[course.level] ?? course.level,
                    },
                  ]
                    .filter((t) => t.label)
                    .map(({ icon, label }) => (
                      <span
                        key={label}
                        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-white/80"
                      >
                        {icon}
                        {label}
                      </span>
                    ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("batch-section")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="mt-2 rounded-full bg-9e-action px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-9e-brand"
                >
                  ลงทะเบียน
                </button>
              </div>
            </div>
          </div>
          {/* Cover image — desktop right column only (hidden on mobile, shown above instead) */}
          <div className="hidden lg:block">
            {course.cover_image_url ? (
              <div className="relative aspect-video overflow-hidden rounded-2xl shadow-9e-xl">
                <Image
                  src={course.cover_image_url}
                  alt={course.title_th}
                  fill
                  className="object-cover"
                  sizes="50vw"
                />
              </div>
            ) : (
              <div className="aspect-video rounded-2xl bg-gradient-to-br from-9e-brand to-9e-action shadow-9e-xl" />
            )}
          </div>
        </div>
      </section>

      {/* [B] Stats bar */}
      <section className="mt-4 md:mt-10 mb-2">
        <div className="max-w-[1000px] mx-auto grid grid-cols-1 items-center justify-center gap-2 md:gap-4 px-4 sm:grid-cols-3">
          {/* 1 Day / EXCLUSIVE */}
          <div className="flex flex-col px-8 py-5 bg-9e-ice dark:bg-9e-ice/10 rounded-[20px] items-center h-full">
            <span className="text-lg md:text-2xl font-bold text-9e-navy dark:text-white">
              {course.duration_days} Day{course.duration_days > 1 ? "s" : ""}
            </span>
            <span className="text-[12px] font-semibold uppercase tracking-widest text-9e-brand mt-0.5">
              EXCLUSIVE
            </span>
          </div>
          {/* N Participants / MAX CAPACITY */}
          <div className="flex flex-col px-8 py-5 bg-9e-ice dark:bg-9e-ice/10 rounded-[20px] items-center h-full">
            <span className="text-lg md:text-2xl font-bold text-9e-navy dark:text-white">
              {visibleBatches[0]?.capacity ?? 50} Participants
            </span>
            <span className="text-[12px] font-semibold uppercase tracking-widest text-9e-brand mt-0.5">
              MAX CAPACITY
            </span>
          </div>
          {course.course_outline_url ? (
            <a
              href={course.course_outline_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col px-8 py-5  items-center rounded-[20px] bg-9e-brand text-sm font-semibold text-white transition-colors hover:bg-9e-air"
            >
              <div className="flex flex-row items-center gap-2 text-lg md:text-2xl">
                <Download size={24} /> Download
              </div>

              <span className="text-[12px] font-semibold uppercase tracking-widest text-white mt-0.5">
                COURSE OUTLINE
              </span>
            </a>
          ) : (
            <span className="flex flex-col px-8 py-5  items-center rounded-[20px] border border-gray-200 text-sm font-medium text-gray-400 cursor-default">
              <div className="flex flex-row items-center gap-2 text-2xl">
                <Download size={24} /> Download
              </div>
              <span className="text-[12px] font-semibold uppercase tracking-widest text-gray-400 mt-0.5">
                COURSE OUTLINE
              </span>
            </span>
          )}
        </div>
      </section>

      {/* [C] Description */}
      {course.description_html && (
        <section className="max-w-[1200px] mx-auto px-4 py-6">
          <div
            className="prose prose-base dark:prose-invert max-w-none [&_p]:indent-8"
            dangerouslySetInnerHTML={{ __html: course.description_html }}
          />
        </section>
      )}

      {/* [D] Batch section */}
      {visibleBatches.length > 0 && (
        <section
          id="batch-section"
          className="max-w-[760px] mx-auto px-4 py-6 md:py-10 flex flex-col items-center"
        >
          <h2 className="mb-6 text-xl font-bold text-9e-navy dark:text-white">
            รุ่นที่เปิดรับสมัครและราคา
          </h2>
          {visibleBatches.map((batch) => (
            <div
              key={batch._id}
              className={`relative w-full isolate mb-4 overflow-hidden rounded-2xl transition-shadow hover:shadow-md ${
                batch.is_early_bird
                  ? " ring-2 ring-inset ring-9e-lime bg-9e-navy dark:bg-9e-card"
                  : "border border-gray-200 bg-white dark:border-gray-700 dark:bg-9e-card"
              }`}
            >
              {batch.status === "closed" && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-9e-slate-lt-800/50" />
              )}
              {/* Gradient background blobs */}
              {batch.is_early_bird && (
                <>
                  <div className="pointer-events-none absolute -left-20 -top-20 z-0 h-64 w-64 rounded-full bg-[#2929c9] opacity-40 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-20 -right-20 z-0 h-64 w-64 rounded-full bg-9e-lime opacity-20 blur-3xl" />
                </>
              )}
              {/* Early Bird badge */}
              {batch.is_early_bird && (
                <span className="relative z-10 flex h-8 md:h-10 w-[120px] md:w-[160px] items-center justify-center rounded-br-2xl bg-9e-lime text-sm md:text-base font-bold text-9e-navy">
                  Early Bird
                </span>
              )}

              <div className="relative z-10 p-4 md:p-6">
                <div className="flex flex-row items-center justify-between">
                  <div className="flex flex-col gap-1">
                    {/* Top row: batch label + date */}
                    <p
                      className={`text-xs md:text-base font-semibold ${
                        batch.is_early_bird
                          ? "text-white"
                          : "text-9e-navy dark:text-white"
                      }`}
                    >
                      {batch.batch_label || `รุ่นที่ ${batch.batch_no}`}
                    </p>
                    {batch.dates?.[0]?.date && (
                      <p
                        className={` text-lg md:text-[28px] font-bold ${
                          batch.is_early_bird
                            ? "text-white"
                            : "text-9e-navy dark:text-white"
                        }`}
                      >
                        {formatBatchDate(batch.dates[0].date)}
                      </p>
                    )}
                    <p
                      className={`text-sm md:text-[18px] ${
                        batch.is_early_bird
                          ? "text-9e-slate-lt-50"
                          : "text-9e-slate-dp-50 dark:text-white"
                      }`}
                    >
                      {course.time_start} – {course.time_end}
                    </p>
                    <p
                      className={`text-sm md:text-[18px] ${
                        batch.is_early_bird
                          ? "text-9e-slate-lt-50"
                          : "text-9e-slate-dp-50 dark:text-white"
                      }`}
                    >
                      {batch.venue_name ? `${batch.venue_name}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-col items-end">
                    <span
                      className={`text-3xl md:text-[40px] font-bold  ${
                        batch.is_early_bird
                          ? "bg-gradient-to-r from-9e-air to-9e-brand bg-clip-text text-transparent"
                          : "text-9e-navy dark:text-white"
                      }`}
                    >
                      {batch.effective_price?.toLocaleString("th-TH")} บาท
                    </span>
                    {batch.is_early_bird && batch.original_price && (
                      <span className="text-base md:text-[20px] text-9e-slate-lt-50">
                        จากปกติ{" "}
                        <span className="line-through">
                          {batch.original_price?.toLocaleString("th-TH")} บาท
                        </span>
                      </span>
                    )}
                    {batch.is_early_bird ? (
                      ""
                    ) : (
                      <span className="text-xs md:text-[14px] text-9e-slate-dp-50 dark:text-9e-slate-lt-50">
                        *ราคาดังกล่าวยังไม่รวมภาษีมูลค่าเพิ่ม
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={`mt-5 flex items-center flex-col md:flex-row gap-4 ${
                    batch.is_early_bird ? "justify-between" : "justify-end "
                  }`}
                >
                  {/* Countdown */}
                  {batch.is_early_bird && batch.early_bird_deadline && (
                    <CountdownTimer
                      deadline={batch.early_bird_deadline}
                      tileClassName="bg-9e-navy dark:bg-white/10"
                    />
                  )}
                  {batch.status === "open" ? (
                    <Link
                      href={`/masterclass/${course.slug}/register?batch=${batch._id}`}
                      className="rounded-full min-w-48 text-center bg-9e-action px-8 py-3 text-base font-bold text-white transition-colors hover:bg-9e-brand dark:bg-9e-action dark:hover:bg-9e-brand"
                    >
                      ลงทะเบียน
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="cursor-not-allowed rounded-full bg-gray-200 px-8 py-3 min-w-48 text-center text-base font-bold text-gray-400 dark:bg-gray-700"
                    >
                      {batch.status === "full" ? "เต็มแล้ว" : "ปิดรับสมัครแล้ว"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* [E] Objectives */}
      {course.objectives?.length > 0 && (
        <section
          id="mc-objectives"
          className="bg-[#F8FAFD] dark:bg-transparent px-4 py-6 md:py-12"
        >
          <div className="max-w-[1200px] mx-auto">
            <h2 className="mb-8 text-center text-xl font-bold text-9e-navy dark:text-white">
              วัตถุประสงค์
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {course.objectives.map((obj, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-sm dark:bg-9e-card"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-9e-navy dark:bg-9e-action">
                    <CheckCircle2 size={18} className="text-9e-lime" />
                  </div>
                  <p className="text-base leading-relaxed text-gray-700 dark:text-gray-200">
                    {obj}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* [F] Suitable for */}
      {course.suitable_for?.length > 0 && (
        <section className="max-w-[1200px] mx-auto px-4 py-6 md:py-10">
          <h2 className="mb-6 text-center text-xl font-bold text-9e-navy dark:text-white">
            หลักสูตรนี้เหมาะสำหรับ
          </h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {course.suitable_for.map((item, i) => {
              const label = typeof item === "string" ? item : item.label;
              const image_url = typeof item === "string" ? "" : item.image_url;

              return (
                <div
                  key={i}
                  className="group relative flex aspect-[4/3] overflow-hidden rounded-xl bg-9e-navy"
                >
                  {image_url && (
                    <Image
                      src={image_url}
                      alt={label}
                      fill
                      className="object-cover opacity-50 transition-all duration-300 group-hover:scale-105 group-hover:opacity-100"
                      sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 20vw"
                    />
                  )}

                  <div className="absolute inset-0 bg-9e-brand/40 transition-opacity duration-500 ease-in-out group-hover:opacity-0" />

                  <div className="absolute inset-0 bg-gradient-to-t from-9e-action/90 via-9e-navy/30 to-transparent opacity-0 transition-opacity duration-500 ease-in-out group-hover:opacity-100" />

                  <p className="absolute inset-x-0 bottom-1/2 z-10 translate-y-1/2 px-3 text-center text-base font-semibold leading-tight text-white transition-all duration-500 ease-in-out group-hover:bottom-4 group-hover:translate-y-0">
                    {label}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* [G] Prerequisites */}
      {course.prerequisites?.length > 0 && (
        <section className="max-w-[1200px] mx-auto px-4 py-6 md:py-10">
          <h2 className="border-l-4 border-9e-lime pl-4 text-lg md:text-xl font-bold text-9e-navy dark:text-white">
            พื้นฐานของผู้เข้าอบรม
          </h2>
          <ol className="mt-4 list-inside list-decimal space-y-3">
            {course.prerequisites.map((item, i) => (
              <li
                key={i}
                className="text-base leading-relaxed text-gray-700 dark:text-gray-200"
              >
                {item}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* [H] System Requirements */}
      {course.system_requirements_html && (
        <section className="max-w-[1200px] mx-auto px-4 py-6 md:py-10">
          <h2 className="border-l-4 border-9e-lime pl-4 text-lg md:text-xl font-bold text-9e-navy dark:text-white">
            ความต้องการของระบบ
          </h2>
          <div
            className="mt-4 prose prose-base dark:prose-invert max-w-none
                       prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-p:my-1"
            dangerouslySetInnerHTML={{
              __html: course.system_requirements_html,
            }}
          />
        </section>
      )}

      {/* [I] Benefits */}
      {course.benefits?.length > 0 && (
        <section className="max-w-[1200px] mx-auto px-4 py-6 md:py-10">
          <h2 className="border-l-4 border-9e-lime pl-4 text-lg md:text-xl font-bold text-9e-navy dark:text-white">
            ประโยชน์ที่จะได้รับ
          </h2>
          <ol className="mt-4 list-inside list-decimal space-y-3">
            {course.benefits.map((item, i) => (
              <li
                key={i}
                className="text-base leading-relaxed text-gray-700 dark:text-gray-200"
              >
                {item}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* [J] Curriculum */}
      {course.curriculum?.length > 0 && (
        <section
          id="mc-curriculum"
          className="max-w-[1200px] mx-auto px-4 py-6 md:py-10 flex flex-col"
        >
          <div className=" md:mb-6 flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-bold text-9e-navy dark:text-white">
              หัวข้อการฝึกอบรม
            </h2>
            <button
              type="button"
              onClick={toggleAll}
              className="text-sm text-9e-action hover:underline"
            >
              {allOpen ? "ย่อทั้งหมด" : "ขยายทั้งหมด"}
            </button>
          </div>
          {course.curriculum.map((session, si) => (
            <div key={si}>
              <p className="mb-3 mt-4 text-base font-semibold uppercase tracking-widest text-9e-action">
                {session.session_label}
              </p>
              {session.modules?.map((mod, mi) => {
                const key = `${si}-${mi}`;
                const isOpen = openModules[key] ?? true;
                return (
                  <div
                    key={mi}
                    className="mb-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
                  >
                    <button
                      type="button"
                      onClick={() => toggleModule(key)}
                      className="flex w-full items-center justify-between px-5 py-4 text-left"
                    >
                      <span className="font-semibold text-9e-navy dark:text-white">
                        {mod.module_no}. {mod.title}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-[800px]" : "max-h-0"}`}
                    >
                      <div className="px-5 pb-5">
                        {(mod.topics_html || mod.topics?.length > 0) && (
                          <div className="mt-1">
                            {mod.topics_html ? (
                              <div
                                className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-p:my-1"
                                dangerouslySetInnerHTML={{
                                  __html: mod.topics_html,
                                }}
                              />
                            ) : (
                              <ul className="space-y-1">
                                {mod.topics.map((topic, ti) => {
                                  const isSub = topic.startsWith("- ");
                                  const text = isSub ? topic.slice(2) : topic;
                                  return (
                                    <li
                                      key={ti}
                                      className={`flex items-start gap-2 text-base text-gray-600 dark:text-gray-300 ${isSub ? "ml-5" : ""}`}
                                    >
                                      <span
                                        className={`mt-2 shrink-0 rounded-full ${
                                          isSub
                                            ? "h-1 w-1 bg-gray-400"
                                            : "h-1.5 w-1.5 bg-9e-brand"
                                        }`}
                                      />
                                      {text}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                        {mod.output && (
                          <p className="mt-2 text-xs text-gray-400">
                            <strong>ผลลัพธ์: </strong>
                            {mod.output}
                          </p>
                        )}
                        {mod.content_html && (
                          <div
                            className="mt-3 prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-300"
                            dangerouslySetInnerHTML={{
                              __html: mod.content_html,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      )}

      {/* [K] Instructor */}
      {instructors.length > 0 && (
        <section id="mc-instructor" className="bg-9e-navy px-4 py-10 md:py-16">
          <div className="max-w-[1200px] mx-auto text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-9e-lime">
              INSTRUCTOR
            </p>
            <h2 className="mt-2 text-xl md:text-3xl font-bold text-white">
              วิทยากรผู้สอน
            </h2>
            <p className="mt-2 text-xs md:text-sm text-9e-air">
              ผู้เชี่ยวชาญประสบการณ์สอนมากกว่า 20 ปี ทั้งภาครัฐและภาคเอกชน
            </p>
            <div
              className={`mt-10 grid items-stretch gap-6 ${
                instructors.length === 1
                  ? "mx-auto max-w-[420px]"
                  : "mx-auto max-w-3xl grid-cols-1 sm:grid-cols-2"
              }`}
            >
              {instructors.map((inst) => (
                <div key={inst._id} className="relative flex h-full flex-col">
                  {inst.image_url && (
                    <div className="relative z-20 mx-auto -mb-20 h-[320px] w-[260px] overflow-visible">
                      <Image
                        src={inst.image_url}
                        alt={inst.name}
                        fill
                        className="object-contain object-top [mask-image:linear-gradient(to_bottom,#121f2e_72%,rgba(0,0,0,0)_100%)]"
                        sizes="(max-width:768px) 100vw, 400px"
                      />
                    </div>
                  )}

                  <div className="relative z-10 flex flex-1 rounded-[30px] bg-gradient-to-t from-9e-lime to-9e-lime/5 p-0.5">
                    <div className="flex h-full w-full flex-col rounded-[28px] bg-gradient-to-t from-[#24303e] to-[#0e1c2b] px-5 pb-8 pt-[85px] text-center">
                      <h3 className="text-xl md:text-2xl font-bold text-white">
                        {inst.name}
                      </h3>

                      <p className="mt-0.5 text-base md:text-[18px] font-medium text-9e-brand">
                        {inst.title}
                      </p>

                      <div className="flex justify-center">
                        {(() => {
                          const bioLines = inst.bio
                            ? inst.bio
                                .split("\n")
                                .map((s) => s.trim())
                                .filter(Boolean)
                            : (inst.specialties ?? []);

                          return bioLines.length > 0 ? (
                            <ul className="mt-3 space-y-1">
                              {bioLines.map((s, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-2 text-sm md:text-base text-9e-slate-lt-50"
                                >
                                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-9e-lime" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* [L] FAQ */}
      {faqs.length > 0 && (
        <section id="mc-faq" className="max-w-3xl mx-auto px-4 py-10 md:py-16">
          <h2 className="mb-8 text-center text-xl md:text-2xl font-bold text-9e-navy dark:text-white">
            คำถามที่พบบ่อย
          </h2>
          <div className="flex flex-col gap-4">
            {faqs.map((f) => (
              <FaqAccordionItem key={f._id} faq={f} />
            ))}
          </div>
        </section>
      )}

      {/* Sticky bottom CTA bar */}
      {visibleBatches.length > 0 && !barDismissed && (
        <div
          className={`fixed inset-x-0 bottom-2 md:bottom-6 z-[60]

                transition-transform duration-300 ease-in-out
                ${showStickyBar ? "translate-y-0" : "translate-y-[calc(100%+2rem)]"}`}
        >
          <div className="relative mx-2 md:mx-auto flex max-w-[900px] h-28 items-center overflow-hidden bg-white dark:bg-9e-navy rounded-2xl shadow-[0_0_36px_rgba(36,134,255,0.3)]">
            {/* Cover image — flush left, full bar height, 16:9, no padding */}
            {course.cover_image_url ? (
              <div className="hidden sm:block shrink-0 self-stretch p-3 ">
                {/* aspect-video = 16:9; height constrained by parent (items-stretch) */}
                <img
                  src={course.cover_image_url}
                  alt={course.title_th}
                  className="h-full w-auto aspect-video object-cover rounded-xl"
                />
              </div>
            ) : null}

            {/* Inner row: badge (mobile fallback) + text + actions */}
            <div className="flex flex-1 items-center gap-3 pl-6 pr-6 md:pr-10 py-3 min-w-0">
              {/* MC badge — always visible on mobile; hidden on sm+ when cover image exists */}

              {/* Text */}
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-xs md:text-xs leading-tight font-medium text-gray-500 dark:text-gray-400">
                  สนใจ Masterclass
                </p>

                <p className="truncate text-sm md:text-lg leading-tight font-bold text-9e-navy dark:text-white">
                  &ldquo;{course.title_th}&rdquo;
                </p>

                <p className="text-xs md:text-sm leading-tight text-gray-500 dark:text-gray-400">
                  กดลงทะเบียนเพื่อกลับไปเลือกรอบอบรมที่เปิดรับสมัคร
                </p>
              </div>

              <button
                type="button"
                onClick={() => setBarDismissed(true)}
                className="absolute right-1.5 top-1.5 p-1 text-9e-navy rounded-full hover:bg-9e-ice dark:text-white dark:hover:bg-white/5"
              >
                <X size={16} />
              </button>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    document
                      .getElementById("batch-section")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="min-w-24 md:min-w-32 rounded-full bg-9e-action px-5 py-2 md:py-3 text-sm md:text-base font-bold text-white hover:bg-9e-brand"
                >
                  ลงทะเบียน
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
