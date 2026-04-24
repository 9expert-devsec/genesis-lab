"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Keyboard, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Program / Skill selector.
 *
 * Program tab: flat 4-col grid, 16 programs per page, arrow + dot nav.
 * Skill tab: horizontal tab bar of skill categories, then a split pane
 *   (left: skill icon + teaser + count, right: 3-col grid of the
 *    programs that belong to that skill, paginated).
 *
 * Skill→Programs uses `skill.programs[]` which upstream already nests
 * inside each `/skills` item, so no client-side filter on ObjectIds.
 */

const PROGRAMS_PER_PAGE = 16; // Program tab: 4 cols × 4 rows
const SKILL_PROGRAMS_PER_PAGE = 8; // Skill tab: 3 cols × 3 rows

export function ProgramSelector({ programs = [], skills = [] }) {
  const [tab, setTab] = useState("program");
  const [page, setPage] = useState(0);
  const [selectedSkill, setSelectedSkill] = useState(skills[0] ?? null);

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
    Math.ceil(programs.length / PROGRAMS_PER_PAGE),
  );
  const programSafePage = Math.min(page, programTotalPages - 1);
  const programPageItems = programs.slice(
    programSafePage * PROGRAMS_PER_PAGE,
    (programSafePage + 1) * PROGRAMS_PER_PAGE,
  );

  // Skill tab — each skill already carries a nested `programs` array
  const skillPrograms = useMemo(
    () => selectedSkill?.programs ?? [],
    [selectedSkill],
  );
  const skillTotalPages = Math.max(
    1,
    Math.ceil(skillPrograms.length / SKILL_PROGRAMS_PER_PAGE),
  );
  const skillSafePage = Math.min(page, skillTotalPages - 1);
  const skillPageItems = skillPrograms.slice(
    skillSafePage * SKILL_PROGRAMS_PER_PAGE,
    (skillSafePage + 1) * SKILL_PROGRAMS_PER_PAGE,
  );

  return (
    <section className="bg-[#f8fafd] px-4 py-14 lg:px-6">
      <div className="mx-auto max-w-[1280px]">
        <h2 className="mb-8 text-center text-2xl font-bold text-9e-navy">
          เลือกโปรแกรมที่คุณสนใจเรียน
        </h2>

        <div className="mb-8 flex justify-center gap-4">
          <TabButton
            active={tab === "program"}
            onClick={() => handleTabChange("program")}
          >
            <Keyboard className="h-4 w-4" strokeWidth={2} />
            Program
          </TabButton>
          <TabButton
            active={tab === "skill"}
            onClick={() => handleTabChange("skill")}
          >
            <Lightbulb className="h-4 w-4" strokeWidth={2} />
            Skill
          </TabButton>
        </div>

        {/* ── PROGRAM TAB ──────────────────────────────────────────── */}
        {tab === "program" && (
          <div className="flex h-[410px] flex-col rounded-2xl bg-[#f8fafd] lg:p-8">
            {programs.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <div className="relative">
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
          <div className="overflow-hidden rounded-2xl bg-white shadow-9e-sm">
            {skills.length === 0 ? (
              <div className="p-8">
                <EmptyState />
              </div>
            ) : (
              <>
                {/* Skill category tabs */}
                <div className="scrollbar-hide flex overflow-x-auto h-[50px] border-b border-gray-200 bg-white">
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
                            ? "border-9e-primary bg-[#dcdcdc] text-9e-primary"
                            : "border-transparent text-9e-slate hover:border-gray-300 hover:text-9e-navy",
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
                <div className="grid h-[360px] grid-cols-1 lg:grid-cols-[360px_1fr]">
                  {/* Left: skill summary */}
                  <div className="flex flex-col min-h-0 h-full gap-4 border-b border-gray-200 p-6 lg:border-b-0 lg:border-r">
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
                          <h3 className="text-lg font-bold text-9e-navy">
                            {selectedSkill.skill_name}
                          </h3>
                        </div>

                        {selectedSkill.skill_teaser && (
                          <p className="line-clamp-[7] text-sm leading-relaxed text-9e-slate">
                            {selectedSkill.skill_teaser}
                          </p>
                        )}

                        <div className="mt-auto flex flex-row justify-between">
                          <p className="text-xs font-semibold text-9e-primary">
                            {skillPrograms.length} โปรแกรม
                          </p>
                          <button className="text-xs font-semibold text-9e-primary hover:text-9e-navy">
                            ดูหลักสูตรใน Skill นี้
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right: programs in the selected skill */}
                  <div className="flex flex-col min-h-0 h-full p-6">
                    {skillPrograms.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-9e-slate">
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

                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        "flex items-center gap-2 rounded-full px-8 py-3 text-sm font-bold transition-all duration-9e-micro ease-9e",
        active
          ? "bg-9e-primary text-white shadow-9e-md"
          : "border border-gray-200 bg-white text-9e-slate hover:border-9e-primary hover:text-9e-primary",
      )}
    >
      {children}
    </button>
  );
}

function PrevButton({ show, onClick, compact = false }) {
  if (!show) return null;
  const size = compact ? "h-8 w-8" : "h-10 w-10";
  const offset = compact ? "-left-3" : "-left-5";
  const iconSize = compact ? 14 : 18;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="ก่อนหน้า"
      className={cn(
        "absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full bg-9e-sky shadow-9e-md transition-all duration-9e-micro ease-9e hover:bg-9e-brand",
        size,
        offset,
      )}
    >
      <ChevronLeft size={iconSize} className="text-9e-ice" />
    </button>
  );
}

function NextButton({ show, onClick, compact = false }) {
  if (!show) return null;
  const size = compact ? "h-8 w-8" : "h-10 w-10";
  const offset = compact ? "-right-3" : "-right-5";
  const iconSize = compact ? 14 : 18;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="ถัดไป"
      className={cn(
        "absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full bg-9e-sky shadow-9e-md transition-all duration-9e-micro ease-9e hover:bg-9e-brand",
        size,
        offset,
      )}
    >
      <ChevronRight size={iconSize} className="text-9e-ice" />
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
              ? "h-2.5 w-6 bg-9e-brand"
              : "h-2.5 w-2.5 bg-gray-300 hover:bg-9e-sky",
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
      className="group flex items-center gap-3 rounded-xl border-2 border-transparent bg-white px-4 py-3 transition-all duration-9e-micro ease-9e hover:-translate-y-0.5 hover:border-9e-primary hover:shadow-9e-md active:scale-95"
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
      <span className="line-clamp-1 text-sm font-semibold text-9e-navy transition-colors duration-9e-micro ease-9e group-hover:text-9e-primary">
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
      className="group flex flex-col items-center gap-2 rounded-xl border-2 border-transparent bg-white p-4 text-center transition-all duration-9e-micro ease-9e hover:-translate-y-0.5 hover:border-9e-primary hover:shadow-9e-md active:scale-95"
    >
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-9e-ice">
        {icon && (
          <Image
            src={icon}
            alt=""
            width={36}
            height={36}
            className="object-contain"
            unoptimized
          />
        )}
      </div>
      <span className="line-clamp-2 text-xs font-semibold leading-snug text-9e-navy transition-colors duration-9e-micro ease-9e group-hover:text-9e-primary">
        {name}
      </span>
    </Link>
  );
}

function programHref(item) {
  const name = item.program_name;
  return `/training-course?program=${encodeURIComponent(name)}`;
}
