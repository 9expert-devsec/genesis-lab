"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Keyboard, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Program / Skill selector.
 *
 * Program tab: flat grid, page size depends on viewport
 *   (mobile 10 = 5 rows × 2 cols; desktop 8 = 2 rows × 4 cols).
 * Skill tab: horizontal tab bar of skill categories, then a split pane
 *   (left: skill icon + teaser + count, right: 3-col grid of the
 *    programs that belong to that skill, 6 per page).
 *
 * Skill→Programs uses `skill.programs[]` which upstream already nests
 * inside each `/skills` item, so no client-side filter on ObjectIds.
 */

const PROGRAMS_PER_PAGE_DESKTOP = 16; // Program tab: 4 cols × 2 rows
const PROGRAMS_PER_PAGE_MOBILE = 10; // Program tab: 2 cols × 5 rows
const SKILL_PROGRAMS_PER_PAGE = 8; // Skill tab: 3 cols × 2 rows on all sizes
const SKILL_PROGRAMS_PER_PAGE_MOBILE = 6;

export function ProgramSelector({ programs = [], skills = [] }) {
  const [tab, setTab] = useState("program");
  const [page, setPage] = useState(0);
  const [selectedSkill, setSelectedSkill] = useState(skills[0] ?? null);

  // Page size flips at the md breakpoint (768px). SSR + initial client
  // render assume desktop so the static markup stays consistent;
  // useEffect re-evaluates after mount.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const programsPerPage = isMobile
    ? PROGRAMS_PER_PAGE_MOBILE
    : PROGRAMS_PER_PAGE_DESKTOP;

    const skillsPerPage = isMobile
    ? SKILL_PROGRAMS_PER_PAGE_MOBILE
    : SKILL_PROGRAMS_PER_PAGE;

  // Reset to first page whenever the page-size flips so the user
  // doesn't land on an empty trailing page after a resize.
  useEffect(() => {
    setPage(0);
  }, [programsPerPage]);

  function handleTabChange(newTab) {
    setTab(newTab);
    setPage(0);
  }

  function handleSkillChange(skill) {
    setSelectedSkill(skill);
    setPage(0);
  }

  // Program tab — paginate the flat programs list
  const programTotalPages = Math.max(
    1,
    Math.ceil(programs.length / programsPerPage),
  );
  const programSafePage = Math.min(page, programTotalPages - 1);
  const programPageItems = programs.slice(
    programSafePage * programsPerPage,
    (programSafePage + 1) * programsPerPage,
  );

  // Skill tab — each skill already carries a nested `programs` array
  const skillPrograms = useMemo(
    () => selectedSkill?.programs ?? [],
    [selectedSkill],
  );
  const skillTotalPages = Math.max(
    1,
    Math.ceil(skillPrograms.length / skillsPerPage),
  );
  const skillSafePage = Math.min(page, skillTotalPages - 1);
  const skillPageItems = skillPrograms.slice(
    skillSafePage * skillsPerPage,
    (skillSafePage + 1) * skillsPerPage,
  );

  return (
    <section className="bg-[#f8fafd] dark:bg-9e-border px-4 py-14 lg:px-6">
      <div className="mx-auto max-w-[1200px]">
        <h2 className="mb-8 text-center text-2xl font-bold text-9e-navy dark:text-white">
          ค้นหาสิ่งที่คุณสนใจ
        </h2>

        <div className="mb-8 flex w-full gap-3 sm:justify-center sm:gap-4">
          <TabButton
            active={tab === "program"}
            onClick={() => handleTabChange("program")}
          >
            <Keyboard className="h-4 w-4" strokeWidth={2} />
            Programs
          </TabButton>
          <TabButton
            active={tab === "skill"}
            onClick={() => handleTabChange("skill")}
          >
            <Lightbulb className="h-4 w-4" strokeWidth={2} />
            Skills
          </TabButton>
        </div>

        {/* ── PROGRAM TAB ──────────────────────────────────────────── */}
        {tab === "program" && (
          <div className="flex flex-col h-[450px]  md:h-[410px] rounded-2xl bg-[#f8fafd] dark:bg-9e-border">
            {programs.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <div className="relative h-[400px] md:h-[320px]">
                  <PrevButton
                    show={programSafePage > 0}
                    onClick={() => setPage((p) => p - 1)}
                  />
                  <NextButton
                    show={programSafePage < programTotalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  />

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {programPageItems.map((item) => (
                      <ProgramRowCard
                        key={item.program_id ?? item._id}
                        item={item}
                        hrefBuilder={programHref}
                      />
                    ))}
                  </div>
                </div>

                <PageDots
                  total={programTotalPages}
                  current={programSafePage}
                  onChange={setPage}
                  className="mt-auto"
                />
              </>
            )}
          </div>
        )}

        {/* ── SKILL TAB ────────────────────────────────────────────── */}
        {tab === "skill" && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-9e-sm dark:bg-9e-navy">
            {skills.length === 0 ? (
              <div className="p-8">
                <EmptyState />
              </div>
            ) : (
              <>
                {/* Skill category tabs */}
                <div className="scrollbar-hide flex overflow-x-auto h-[50px] border-b border-gray-200 bg-white dark:bg-9e-navy dark:border-gray-600">
                  {skills.map((skill) => {
                    const isActive = selectedSkill?._id === skill._id;
                    return (
                      <button
                        key={skill._id ?? skill.skill_id}
                        type="button"
                        onClick={() => handleSkillChange(skill)}
                        className={cn(
                          "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-semibold transition-all duration-9e-micro ease-9e",
                          isActive
                            ? "border-9e-primary bg-[#e9e9e9] text-9e-primary dark:bg-9e-navy dark:text-9e-lime dark:border-9e-lime"
                            : "border-transparent text-9e-slate hover:border-gray-300 hover:text-9e-navy dark:text-9e-slate dark:hover:border-gray-600 dark:hover:text-white",
                        )}
                      >
                        {skill.skilliconurl && (
                          <Image
                            src={skill.skilliconurl}
                            alt=""
                            width={18}
                            height={18}
                            className="object-contain"
                            unoptimized
                          />
                        )}
                        {skill.skill_name}
                      </button>
                    );
                  })}
                </div>

                {/* Content: left pane (skill info) + right pane (programs) */}
                <div className="grid grid-cols-1 lg:h-[360px] lg:grid-cols-[360px_1fr]">
                  {/* Left: skill summary */}
                  <div className="flex flex-col min-h-0 h-full gap-4 border-b border-gray-200 p-6 lg:border-b-0 lg:border-r dark:border-gray-600">
                    {selectedSkill && (
                      <>
                        <div className="flex items-center gap-3">
                          {selectedSkill.skilliconurl && (
                            <div
                              className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-100 bg-white p-2 shadow-9e-sm"
                              style={
                                selectedSkill.skillcolor
                                  ? {
                                      backgroundColor: selectedSkill.skillcolor,
                                    }
                                  : undefined
                              }
                            >
                              <Image
                                src={selectedSkill.skilliconurl}
                                alt={selectedSkill.skill_name}
                                width={32}
                                height={32}
                                className="object-contain"
                                unoptimized
                              />
                            </div>
                          )}
                          <h3 className="text-lg font-bold text-9e-navy dark:text-white">
                            {selectedSkill.skill_name}
                          </h3>
                        </div>

                        {selectedSkill.skill_teaser && (
                          <p className="line-clamp-[7] font-light text-sm leading-relaxed text-9e-slate dark:text-white">
                            {selectedSkill.skill_teaser}
                          </p>
                        )}

                        <div className="mt-auto flex flex-row justify-between items-center">
                          <p className="text-xs font-semibold text-9e-primary dark:text-[#b6c2d4]">
                            {skillPrograms.length} โปรแกรม
                          </p>
                          <button className="text-xs font-semibold text-white bg-9e-primary hover:bg-9e-brand dark:text-9e-border dark:bg-9e-lime dark:hover:bg-9e-lime-dk  p-3 rounded-full">
                            ดูหลักสูตรใน Skill นี้
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right: programs in the selected skill */}
                  <div className="flex flex-col min-h-0 h-full p-6">
                    {skillPrograms.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-9e-slate dark:text-9e-slate">
                        ไม่มีโปรแกรมใน Skill นี้
                      </div>
                    ) : (
                      <>
                        <div className="relative flex-1">
                          <PrevButton
                            show={skillSafePage > 0}
                            onClick={() => setPage((p) => p - 1)}
                            compact
                          />
                          <NextButton
                            show={skillSafePage < skillTotalPages - 1}
                            onClick={() => setPage((p) => p + 1)}
                            compact
                          />

                          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4">
                            {skillPageItems.map((item) => (
                              <ProgramTileCard
                                key={item.program_id ?? item._id}
                                item={item}
                                hrefBuilder={programHref}
                              />
                            ))}
                          </div>
                        </div>

                        <PageDots
                          total={skillTotalPages}
                          current={skillSafePage}
                          onChange={setPage}
                          className="mt-4"
                        />
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold transition-all duration-9e-micro ease-9e sm:flex-none sm:px-8",
        active
          ? "bg-9e-primary text-white shadow-9e-md dark:bg-9e-lime dark:text-9e-navy"
          : "border border-gray-200 bg-white text-9e-slate hover:border-9e-primary hover:text-9e-primary dark:border-gray-600 dark:bg-9e-navy dark:text-9e-slate dark:hover:border-9e-lime dark:hover:text-9e-lime",
      )}
    >
      {children}
    </button>
  );
}

function PrevButton({ show, onClick, compact = false }) {
  if (!show) return null;
  const size = compact ? "h-9 w-9 sm:h-8 sm:w-8" : "h-11 w-11 sm:h-10 sm:w-10";
  const offset = compact ? "-left-2 md:-left-3" : "-left-2 md:-left-5";
  const iconSize = compact ? 14 : 18;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="ก่อนหน้า"
      className={cn(
        "absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full bg-9e-sky shadow-9e-md transition-all duration-9e-micro ease-9e hover:bg-9e-brand dark:bg-9e-lime dark:hover:bg-9e-lime-dk",
        size,
        offset,
      )}
    >
      <ChevronLeft size={iconSize} className="text-9e-ice dark:text-9e-navy" />
    </button>
  );
}

function NextButton({ show, onClick, compact = false }) {
  if (!show) return null;
  const size = compact ? "h-9 w-9 sm:h-8 sm:w-8" : "h-11 w-11 sm:h-10 sm:w-10";
  const offset = compact ? "-right-2 md:-right-3" : "-right-2 md:-right-5";
  const iconSize = compact ? 14 : 18;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="ถัดไป"
      className={cn(
        "absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full bg-9e-sky shadow-9e-md transition-all duration-9e-micro ease-9e hover:bg-9e-brand dark:bg-9e-lime dark:hover:bg-9e-lime-dk",
        size,
        offset,
      )}
    >
      <ChevronRight size={iconSize} className="text-9e-ice dark:text-9e-navy" />
    </button>
  );
}

function PageDots({ total, current, onChange, className }) {
  if (total <= 1) return null;
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          aria-label={`ไปหน้า ${i + 1}`}
          className={cn(
            "rounded-full transition-all duration-9e-micro ease-9e",
            i === current
              ? "h-2.5 w-6 bg-9e-brand dark:bg-9e-lime "
              : "h-2.5 w-2.5 bg-gray-300 hover:bg-9e-sky dark:hover:bg-9e-lime-lt",
          )}
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <p className="py-8 text-center text-sm text-9e-slate">
      ไม่สามารถโหลดรายการได้ในขณะนี้
    </p>
  );
}

/** Row-style card — icon + name side by side (used in Program tab) */
function ProgramRowCard({ item, hrefBuilder }) {
  const name = item.program_name;
  const icon = item.programiconurl;
  return (
    <Link
      href={hrefBuilder(item)}
      className="group flex items-center gap-3 rounded-xl border-2 border-transparent bg-white px-4 py-3 transition-all duration-9e-micro ease-9e hover:-translate-y-0.5 hover:border-9e-primary hover:shadow-9e-md active:scale-95 dark:bg-9e-navy dark:border-gray-600 dark:hover:border-9e-lime"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-9e-ice">
        {icon && (
          <Image
            src={icon}
            alt=""
            width={32}
            height={32}
            className="object-contain"
            unoptimized
          />
        )}
      </div>
      <span className="line-clamp-2 text-sm font-semibold text-9e-navy transition-colors duration-9e-micro ease-9e group-hover:text-9e-primary dark:text-white dark:group-hover:text-9e-lime lg:line-clamp-1">
        {name}
      </span>
    </Link>
  );
}

/** Tile-style card — icon on top, name below centered (used in Skill tab) */
function ProgramTileCard({ item, hrefBuilder }) {
  const name = item.program_name;
  const icon = item.programiconurl;
  return (
    <Link
      href={hrefBuilder(item)}
      className="group flex flex-col items-center gap-2 rounded-xl border-2 border-transparent bg-white p-2 text-center transition-all duration-9e-micro ease-9e hover:-translate-y-0.5 hover:border-9e-primary hover:shadow-9e-md active:scale-95 sm:p-4 dark:bg-9e-border dark:hover:border-9e-lime"
    >
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-9e-ice sm:h-12 sm:w-12">
        {icon && (
          <Image
            src={icon}
            alt=""
            width={36}
            height={36}
            className="h-7 w-7 object-contain sm:h-9 sm:w-9"
            unoptimized
          />
        )}
      </div>
      <span className="line-clamp-2 w-full text-[0.65rem] font-semibold leading-snug text-9e-navy transition-colors duration-9e-micro ease-9e group-hover:text-9e-primary sm:text-xs dark:text-9e-ice dark:group-hover:text-9e-lime">
        {name}
      </span>
    </Link>
  );
}

function programHref(item) {
  const name = item.program_name;
  return `/training-course?program=${encodeURIComponent(name)}`;
}
