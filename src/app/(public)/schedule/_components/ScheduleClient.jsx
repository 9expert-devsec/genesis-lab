"use client";

import {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  HelpCircle,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { courseHref } from "@/lib/utils";
import { siteDateParts } from "@/lib/articlePublishTime";
import {
  INHOUSE_ONLY_LABEL,
  coursePriceLabel,
  isInhouseOnlyPrice,
} from "@/lib/coursePriceLabel";
import {
  SCHEDULE_STATUS_OPTIONS,
  resolveScheduleBadge,
} from "@/lib/scheduleStatus";
import {
  PUBLIC_SCHEDULE_DEFAULT_MONTHS,
  PUBLIC_SCHEDULE_FILTER_HORIZON,
  monthColumns,
  monthLabel,
  monthLabelWithYear,
  rollingWindow,
  windowBetween,
} from "@/lib/schedule/monthWindow";
import { formatRoundDays } from "@/lib/schedule/roundDateLabel";
import { laneLayout, roundInWindow } from "@/lib/schedule/monthLanes";
import {
  TRAINING_TYPE_COLOR,
  trainingTypeTint,
} from "@/lib/schedule/trainingTypeColor";
import {
  SCHEDULE_FILTER_ALL,
  activeScheduleFilterCount,
  defaultScheduleFilters,
  matchesSession,
} from "@/lib/schedule/scheduleFilters";
import {
  frozenLayout,
  scrollTrackInset,
  tableMinWidth,
} from "@/lib/schedule/scheduleTableLayout";
import { scheduleRegistrationHref } from "@/lib/schedule/scheduleRegistrationHref";

/**
 * The dot colour per delivery type.
 *
 * ── THE DEFINITION LEFT THIS FILE ───────────────────────────────────────────
 * It used to be declared here, and the docstring claimed it was "ONE definition"
 * — true of this page and false of the site. There were FOUR: a byte-identical
 * copy in /search, a disagreeing one in components/ScheduleCard (`#005eff` /
 * `#a854f7`), a Tailwind-class one in ScheduleCarousel, and a fifth spelling in
 * the course-detail legend. The same round was a different colour depending on
 * which page you found it on.
 *
 * These were the correct values, so /schedule's rendering does not change; only
 * the ownership does. See lib/schedule/trainingTypeColor for why that module has
 * to export a tint as well as a hex.
 *
 * The legend is what makes the dot mean anything, so a second copy here would be
 * a legend that can start describing colours the rows do not use.
 */
const TYPE_COLOR = TRAINING_TYPE_COLOR;

/**
 * The legend's rows, as DATA.
 *
 * Rendered three times over — the compact dots in the desktop filter bar, the
 * explanatory tooltip behind the desktop `?`, and the mobile filter sheet
 * (which has no hover, so it shows the explanations outright). Written once so
 * the touch surface and the pointer surface cannot end up describing the
 * delivery types differently.
 */
const TYPE_LEGEND = [
  { key: "classroom", label: "Classroom", description: "อบรมที่ห้องอบรม 9Expert" },
  {
    key: "hybrid",
    label: "Hybrid",
    description: "เลือกเรียนที่ห้องอบรม หรือ Microsoft Teams",
  },
];

/**
 * How many rounds a mobile card lists before collapsing behind ดูรอบทั้งหมด.
 *
 * Tied to the DEFAULT WINDOW LENGTH rather than picked as a round number,
 * because that is the thing which actually makes the list long: a course
 * running one round a month fills exactly `PUBLIC_SCHEDULE_DEFAULT_MONTHS` rows
 * in the default view, so the untouched page never shows a toggle at all. The
 * toggle appears once the visitor widens the window (the filter horizon is 18
 * months) or once a course runs more than one round in a month — i.e. exactly
 * when a card would otherwise become a scroll of its own.
 *
 * Deriving it also means the two numbers cannot drift: raise the default window
 * to 9 and the cards keep showing a full default window's worth of rounds
 * without anyone remembering to come here.
 */
const ROUND_COLLAPSE_THRESHOLD = PUBLIC_SCHEDULE_DEFAULT_MONTHS;

/** A schedule's valid dates, ascending. Used to ORDER rounds, not to label them. */
function sortedScheduleDates(scheduleItem) {
  return (scheduleItem?.dates ?? [])
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
}

/**
 * ── THE TWO DATE LABELS ARE NOW ONE FUNCTION AND TWO OPTION OBJECTS ─────────
 *
 * `formatDateLabel` and `formatCardDateLabel` used to live here. Both are gone,
 * replaced by `formatRoundDays` from @/lib/schedule/roundDateLabel (imported
 * above), called directly at the two sites that need it:
 *
 *   ScheduleCell  formatRoundDays(schedule.dates)
 *                 — no month, no year. Every column header carries both, on
 *                   every column, so the cell has neither to supply.
 *
 *   RoundRow      formatRoundDays(schedule.dates, { showMonth: true,
 *                                    showYear: 'auto', currentYear })
 *                 — a card has no header to lean on.
 *
 * WHY THEY HAD TO GO RATHER THAN BE REWRITTEN: the old table label was
 * first-date-to-last-date, so a round on 8, 10 and 12 ต.ค. rendered `8-12` and
 * advertised training on the 9th and the 11th — on a page where the visitor can
 * then book. That was one of five formatters making the same class of claim in
 * five different wordings. See the module for the full list.
 *
 * The card label is also no longer SPECIAL-CASED into showing a year. Under
 * `'auto'` it shows one exactly when the round is not in `currentYear`, so in
 * the default six-month window the year disappears, and a visitor who filters
 * to ม.ค.–มี.ค. of next year gets it back on every row without a second rule.
 */

/**
 * The registration link for a round now lives in
 * `@/lib/schedule/scheduleRegistrationHref` (imported above), because /search's
 * schedule section links the same rounds to the same wizard and had grown a
 * byte-identical copy of the template that no guard on this page could see.
 * Both layouts here still call exactly one builder; it is simply no longer a
 * private function of this file. See that module for why `&class=` matters.
 */

/**
 * `'8,500'`, or `'8,500 ฿'` with the unit the mobile card shows.
 *
 * The wording and the no-price branch now come from lib/coursePriceLabel; this
 * stays as the course→price adapter (the shared helper takes a price, not a
 * course) and as the one place that knows this page's unit is `฿`. Note the
 * unit is passed as `suffix` and therefore reaches numbers only — "Inhouse
 * Only ฿" is not a string this function can produce.
 */
function formatCoursePrice(course, { withUnit = false } = {}) {
  return coursePriceLabel(course?.course_price, {
    suffix: withUnit ? "฿" : "",
  });
}

/** `'2'`, or `'2 วัน'` with the unit the mobile card shows. */
function formatTrainingDays(course, { withUnit = false } = {}) {
  const days = course?.course_trainingdays;
  if (days === null || days === undefined || days === "") return "-";
  return withUnit ? `${days} วัน` : String(days);
}

/** The one early-bird lookup: course → the single schedule id that carries it. */
function earlyBirdIdFor(earlyBirdMap, course) {
  return earlyBirdMap?.[String(course?.course_id).toUpperCase()] ?? null;
}

/** The one early-bird predicate, unchanged from the table's original condition. */
function isEarlyBirdSchedule(ebScheduleId, schedule) {
  return !!ebScheduleId && schedule._id === ebScheduleId;
}

/**
 * Every round of one course that the CURRENT VIEW shows, in date order.
 *
 * THE AGREEMENT POINT BETWEEN THE TWO LAYOUTS. The table packs the same rounds
 * into lanes and filters each through `sessionMatches`; a card that walked
 * `course.schedules` directly would show rounds outside the month window and
 * rounds the type/status filters excluded — and nobody would see the
 * disagreement, because no viewport renders both layouts at once.
 *
 * So the card is built from the SAME list, the SAME `visibleMonths` and the
 * SAME matcher. Exported so a test can assert it equals the table's own cell
 * contents.
 *
 * ── IT TAKES A FLAT LIST NOW, AND THAT IS THE DEDUPE ────────────────────────
 * This used to walk per-month buckets and `flatMap` them. That was safe only
 * because a round lived in exactly ONE bucket — the month of its first date —
 * which is precisely the bucketing defect this commit removes. Under a
 * SPAN-based rule a cross-month round is visible from either of its months, so
 * a bucket walk would emit it once per visible month it touches and the card
 * would list the same round twice.
 *
 * Filtering a flat list makes double-counting unrepresentable rather than
 * merely avoided. A test pins it with a cross-month round.
 */
export function courseRounds(schedules, visibleMonths, matches) {
  const startTime = (s) => sortedScheduleDates(s)[0]?.getTime() ?? Infinity;
  return (schedules ?? [])
    .filter((s) => matches(s) && roundInWindow(s?.dates, visibleMonths))
    .sort((a, b) => startTime(a) - startTime(b));
}

/**
 * /schedule — the stateful shell.
 *
 * ALL filter state lives here and nowhere below. That is not tidiness: the
 * mobile sheet is required to be LIVE rather than draft-then-apply, and the
 * cheapest way to guarantee it is to leave no component below this one holding
 * a filter value it could hold back. `ScheduleBoard` renders both layouts and
 * the sheet from props alone, so "the sheet shows something the list does not
 * yet reflect" is not a state it can represent.
 *
 * The clock is read ONCE, into `now`, and the FOUR things derived from it — the
 * initial window, the reset target, the dropdown horizon, and now the year the
 * mobile card measures "is this round in the current year" against — all come
 * off that single instant. Previously three separate `new Date()` calls agreed
 * only because nothing crossed a month boundary between them.
 */
export function ScheduleClient({
  courses,
  programs,
  schedulePDF,
  earlyBirdMap = {},
}) {
  const [now] = useState(() => new Date());

  /**
   * The current year IN ASIA/BANGKOK, threaded down to the mobile card.
   *
   * ── WHY IT IS DERIVED HERE AND PASSED DOWN ──────────────────────────────
   * `formatRoundDays(..., { showYear: 'auto' })` refuses to read the clock
   * itself, deliberately (see that module). The read has to happen somewhere,
   * and it happens HERE because this is where the clock is already read — a
   * `new Date()` inside `RoundRow` would be a second answer to "what year is
   * it" on a page that has already been burned by three of them disagreeing.
   *
   * ── AND WHY IN BANGKOK RATHER THAN THE RUNTIME'S ZONE ───────────────────
   * `now.getFullYear()` is the SERVER's year during SSR and the VISITOR's year
   * after hydration. Vercel runs in UTC, so between 17:00 and 24:00 Bangkok on
   * 31 December those are different numbers, and every card holding a
   * next-year round would render without its year on the server and with it in
   * the browser — a hydration mismatch on the one night of the year when the
   * year is the thing being asked about. `siteDateParts` pins the zone; it is
   * the same module /articles uses for exactly this reason.
   */
  const currentYear = useMemo(() => siteDateParts(now).year, [now]);

  /**
   * The defaults are STATE, not a memo, for one reason: ล้างตัวกรอง has to
   * restore the window the page opened with, and the "N active" badge has to
   * measure against that same window. A memo recomputed from a live clock would
   * make a page left open across the 1st of the month reset to a window it never
   * showed, and light its own badge with no user action.
   */
  const [defaults] = useState(() => defaultScheduleFilters(now));
  const [filters, setFilters] = useState(defaults);
  const [sheetOpen, setSheetOpen] = useState(false);

  // What the two month dropdowns offer. A rolling horizon from the same
  // instant, so it never shrinks as the year goes on — the defect this replaced.
  const monthOptions = useMemo(
    () => rollingWindow(now, PUBLIC_SCHEDULE_FILTER_HORIZON),
    [now],
  );

  const changeFilters = useCallback(
    (patch) => setFilters((current) => ({ ...current, ...patch })),
    [],
  );
  const resetFilters = useCallback(() => setFilters(defaults), [defaults]);

  return (
    <ScheduleBoard
      courses={courses}
      programs={programs}
      schedulePDF={schedulePDF}
      earlyBirdMap={earlyBirdMap}
      filters={filters}
      defaults={defaults}
      currentYear={currentYear}
      monthOptions={monthOptions}
      onFilterChange={changeFilters}
      onReset={resetFilters}
      sheetOpen={sheetOpen}
      onSheetOpenChange={setSheetOpen}
    />
  );
}

/**
 * Everything the page renders, as a pure function of `filters`.
 *
 * Holds refs and ids (which are not values a user can be shown a stale copy
 * of) but NO filter state — see the shell's docstring.
 *
 * ── THE TWO LAYOUTS ─────────────────────────────────────────────────────────
 * Both are rendered, and CSS picks: `hidden lg:block` for the table,
 * `lg:hidden` for the cards. A JS media-query hook was the alternative and it
 * is worse here — the server has no viewport, so the first paint is either a
 * hydration mismatch or a flash of the wrong layout on every visit. The cost of
 * the CSS answer is a duplicated subtree, which for this page is a handful of
 * rows and no `document`-level identifiers (every id below is `useId`).
 *
 * The break is at `lg` (1024px), not `md`. The frozen block is 640px wide; at
 * 768px that leaves ~128px for the entire month area, which is technically a
 * working table and practically the same failure the cards exist to fix.
 * Tablets get cards, deliberately.
 */
export function ScheduleBoard({
  courses,
  programs,
  schedulePDF,
  earlyBirdMap = {},
  filters,
  defaults,
  currentYear,
  monthOptions,
  onFilterChange,
  onReset,
  sheetOpen,
  onSheetOpenChange,
}) {
  const filterButtonRef = useRef(null);

  // Keep `to` from falling below `from` after a change. A plain string
  // comparison: `YYYY-MM` is fixed-width and zero-padded, so lexicographic
  // order is chronological order — '2026-12' < '2027-01'.
  const safeMonthTo =
    filters.monthTo < filters.monthFrom ? filters.monthFrom : filters.monthTo;

  const visibleMonths = useMemo(
    () => windowBetween(filters.monthFrom, safeMonthTo),
    [filters.monthFrom, safeMonthTo],
  );

  // Header cells: the bare month, with a Buddhist-era year added only where a
  // bare label would be ambiguous. See monthColumns' docstring for the rule.
  const monthHeaders = useMemo(() => monthColumns(visibleMonths), [visibleMonths]);

  /**
   * course._id → the course's rounds, as a FLAT list.
   *
   * ── IT USED TO BE `{ 'YYYY-MM' → schedules[] }`, AND THAT WAS THE DEFECT ──
   * Every round was filed under `scheduleMonthKey`, the month of its FIRST DATE
   * ONLY, and both the per-cell filter and `filteredCourses` asked whether that
   * one bucket was visible. So a 30 ก.ย. – 1 ต.ค. round was an entry in the
   * September bucket and nothing else: filter the window down to "เฉพาะ ต.ค."
   * and the round VANISHED — along with the whole course row, because
   * `visibleMonths.some(...)` found nothing in any visible bucket. A course that
   * really is running on the 1st of October disappeared from the October view.
   *
   * A month key cannot express a round that occupies two months, so the buckets
   * are gone rather than patched. Which columns a round occupies is now asked of
   * `roundSpanIndices` (lib/schedule/monthLanes) at the point of use, and it is
   * the ONE answer shared by the table's lanes, `filteredCourses` and the card.
   */
  const roundsByCourse = useMemo(() => {
    const map = {};
    for (const c of courses) map[c._id] = c.schedules ?? [];
    return map;
  }, [courses]);

  // Applied to a schedule ROW so the table reacts to type / status at the cell
  // level (not just whole-row) and the card lists exactly the same rounds.
  const sessionMatches = useCallback(
    (s) => matchesSession(filters, s),
    [filters],
  );

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (
        filters.program !== SCHEDULE_FILTER_ALL &&
        c.program?.program_name !== filters.program
      ) {
        return false;
      }
      // Course is visible if at least one matching round has ANY month of its
      // span inside the window — not merely its first date's month, which is
      // what dropped whole course rows out of a single-month view.
      return (roundsByCourse[c._id] ?? []).some(
        (s) => sessionMatches(s) && roundInWindow(s?.dates, visibleMonths),
      );
    });
  }, [courses, roundsByCourse, visibleMonths, filters.program, sessionMatches]);

  const activeCount = activeScheduleFilterCount(filters, defaults);

  // Group by program name, preserving the parent prop order (which is
  // already admin-curated).
  const grouped = useMemo(() => {
    const order = programs.map((p) => p.program_name);
    const orderRank = new Map(order.map((n, i) => [n, i]));
    const groups = new Map();
    for (const c of filteredCourses) {
      const key = c.program?.program_name ?? "อื่นๆ";
      if (!groups.has(key)) {
        groups.set(key, { program: c.program, courses: [] });
      }
      groups.get(key).courses.push(c);
    }
    return Array.from(groups.values()).sort((a, b) => {
      const ra = orderRank.has(a.program?.program_name)
        ? orderRank.get(a.program?.program_name)
        : Infinity;
      const rb = orderRank.has(b.program?.program_name)
        ? orderRank.get(b.program?.program_name)
        : Infinity;
      if (ra !== rb) return ra - rb;
      const an = a.program?.program_name ?? "";
      const bn = b.program?.program_name ?? "";
      return an.localeCompare(bn, "th");
    });
  }, [filteredCourses, programs]);

  const closeSheet = useCallback(() => {
    onSheetOpenChange(false);
  }, [onSheetOpenChange]);

  return (
    <div className="min-h-screen bg-9e-ice pb-16 dark:bg-9e-navy">
      {/* Hero. The schedule PDF lives here, NOT in the filter bar, so it keeps
          its mobile home for free when the bar collapses into the sheet. */}
      <section className="relative overflow-hidden bg-9e-gradient-hero py-12 dark:bg-gradient-to-b dark:from-[#0a1628] dark:to-[#0d1e36] md:py-16">
        <div className="relative mx-auto max-w-[1200px] px-4 text-center lg:px-6">
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            ตารางฝึกอบรม <br /> (Public Training)
          </h1>
          <p className="mx-auto mt-2 max-w-3xl text-sm text-white/85 md:text-base">
            หลักสูตรรอบที่เปิดตามกำหนดของ 9Expert
            ผู้เรียนเข้าอบรมร่วมกับองค์กรอื่น ๆ ในรอบเดียวกัน
            คิดค่าใช้จ่ายแบบรายท่าน
          </p>

          {schedulePDF?.url ? (
            <a
              href={schedulePDF.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-9e-action shadow-md transition-colors hover:bg-9e-ice"
            >
              <FileText className="h-4 w-4" />
              ดาวน์โหลดตารางการฝึกอบรม
              <Download className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </section>

      {/* Sticky filter bar */}
      <section className="sticky top-20 z-20 border-b border-gray-100 bg-white/90 shadow-sm backdrop-blur dark:border-[#1e3a5f] dark:bg-9e-navy/90">
        {/* ── Desktop: the five controls inline ────────────────────────── */}
        <div className="mx-auto hidden max-w-[1200px] flex-wrap items-center gap-3 py-3 lg:flex">
          <FilterSelect
            value={filters.program}
            onChange={(program) => onFilterChange({ program })}
            ariaLabel="โปรแกรม"
          >
            <ProgramOptions programs={programs} />
          </FilterSelect>

          <FilterSelect
            value={filters.type}
            onChange={(type) => onFilterChange({ type })}
            ariaLabel="รูปแบบ"
          >
            <TypeOptions />
          </FilterSelect>

          <FilterSelect
            value={filters.status}
            onChange={(status) => onFilterChange({ status })}
            ariaLabel="สถานะ"
          >
            <StatusOptions />
          </FilterSelect>

          <div className="flex items-center gap-2">
            <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
              เดือน:
            </span>
            <FilterSelect
              value={filters.monthFrom}
              onChange={(monthFrom) => onFilterChange({ monthFrom })}
              ariaLabel="เดือนเริ่มต้น"
              compact
            >
              <MonthOptions monthOptions={monthOptions} />
            </FilterSelect>
            <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ถึง
            </span>
            <FilterSelect
              value={safeMonthTo}
              onChange={(monthTo) => onFilterChange({ monthTo })}
              ariaLabel="เดือนสุดท้าย"
              compact
            >
              <MonthOptions
                monthOptions={monthOptions}
                minKey={filters.monthFrom}
              />
            </FilterSelect>
          </div>

          {/*
            ล้างตัวกรอง on DESKTOP. The behaviour already existed — `onReset` is
            the same `resetFilters` the mobile sheet has called all along — and
            only this row never got a control for it. Reused, not reimplemented:
            a second reset path is a second thing to drift from `defaults`.

            DISABLED, NOT HIDDEN, when nothing is filtered. Hiding it would
            reflow this wrapped row every time the first filter changes, sliding
            the selects and the legend sideways, and would keep the affordance
            undiscoverable until a user had already worked out how to filter.
            Disabled says "there is nothing to clear" and holds the geometry.

            THE GATE READS `activeCount`, which is `activeScheduleFilterCount(
            filters, defaults)` computed once above — the SAME number the "N"
            badge shows on both surfaces, and it compares against the `defaults`
            STATE. Recomputing defaults here would reintroduce exactly the bug
            that comment guards against: a page left open across the 1st of the
            month would compare to a window it never showed. It also means the
            badge and this button can never disagree.

            Whole class string per state — twMerge does not merge the custom
            `9e-*` scales, so a layered override would be decided by emission
            order rather than by intent.
          */}
          <button
            type="button"
            onClick={onReset}
            disabled={activeCount === 0}
            className={
              "rounded-xl border px-4 py-2 text-sm font-medium transition-colors duration-9e-micro ease-9e " +
              (activeCount === 0
                ? "cursor-not-allowed border-gray-100 text-9e-slate-dp-50 dark:border-[#1e3a5f] dark:text-[#94a3b8]"
                : "border-gray-200 text-9e-navy hover:border-9e-brand dark:border-[#1e3a5f] dark:text-white")
            }
          >
            ล้างตัวกรอง
          </button>

          <TypeLegend />
        </div>

        {/* ── Below lg: one button, and the count it is about ──────────── */}
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-3 lg:hidden">
          <button
            ref={filterButtonRef}
            type="button"
            aria-expanded={sheetOpen}
            aria-haspopup="dialog"
            onClick={() => onSheetOpenChange(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-9e-navy transition-colors duration-9e-micro ease-9e hover:border-9e-brand dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-white"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
            ตัวกรอง
            {/* The badge is the whole reason the button carries a count: once
                the visitor has scrolled past this bar, nothing else on the page
                says a filter is on. */}
            {activeCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-9e-action px-1.5 text-xs font-bold text-white">
                {activeCount}
              </span>
            ) : null}
          </button>
          <div className="ml-auto">
            <ResultCount count={filteredCourses.length} />
          </div>
        </div>
      </section>

      {/* Result count (desktop; the mobile bar carries its own, above) */}
      <div className="mx-auto hidden max-w-[1200px] pt-6 lg:block">
        <ResultCount count={filteredCourses.length} />
      </div>

      {/* Schedule tables / cards */}
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 py-6 max-lg:px-4">
        {grouped.length === 0 ? (
          <div className="rounded-9e-md border border-dashed border-[var(--surface-border)] py-20 text-center text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ไม่พบหลักสูตรที่ตรงกับเงื่อนไข
          </div>
        ) : null}

        {grouped.map(({ program, courses: groupCourses }) => (
          <ProgramGroup
            key={program?._id ?? program?.program_name ?? "other"}
            program={program}
            courses={groupCourses}
            monthHeaders={monthHeaders}
            visibleMonths={visibleMonths}
            roundsByCourse={roundsByCourse}
            sessionMatches={sessionMatches}
            earlyBirdMap={earlyBirdMap}
            currentYear={currentYear}
          />
        ))}
      </div>

      <ScheduleFilterSheet
        open={sheetOpen}
        onClose={closeSheet}
        returnFocusRef={filterButtonRef}
        filters={filters}
        safeMonthTo={safeMonthTo}
        programs={programs}
        monthOptions={monthOptions}
        onFilterChange={onFilterChange}
        onReset={onReset}
        resultCount={filteredCourses.length}
        activeCount={activeCount}
      />
    </div>
  );
}

/**
 * The result line, written once and rendered in three places — the desktop
 * column, the mobile filter bar, and INSIDE the sheet.
 *
 * The sheet copy is not a convenience. The sheet covers the results, so a
 * visitor changing a control there cannot see what it did; the count is the
 * only feedback available, and it is fed the very same `filteredCourses.length`
 * the page renders rather than a second count derived from a parallel filter
 * path. Same component, same number, no way for them to disagree.
 */
function ResultCount({ count }) {
  return (
    <p className="text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
      ผลลัพธ์การค้นหา{" "}
      <span className="font-bold text-9e-action dark:text-9e-air">{count}</span>{" "}
      หลักสูตร
    </p>
  );
}

// ── The option lists, one definition each, both layouts ─────────────────────
//
// The desktop bar and the sheet offer the SAME choices; duplicating the
// `<option>` markup is how a programme added to one and not the other becomes
// unreachable on a phone with nothing to report it.

function ProgramOptions({ programs }) {
  return (
    <>
      <option value={SCHEDULE_FILTER_ALL}>โปรแกรมทั้งหมด</option>
      {programs.map((p) => (
        <option key={p._id ?? p.program_id} value={p.program_name}>
          {p.program_name}
        </option>
      ))}
    </>
  );
}

function TypeOptions() {
  return (
    <>
      <option value={SCHEDULE_FILTER_ALL}>รูปแบบทั้งหมด</option>
      <option value="classroom">Classroom</option>
      <option value="hybrid">Hybrid</option>
    </>
  );
}

function StatusOptions() {
  return (
    <>
      <option value={SCHEDULE_FILTER_ALL}>สถานะทั้งหมด</option>
      {/* Driven off the same source as the badges, so the filter wording
          cannot drift from what the rows actually say. */}
      {SCHEDULE_STATUS_OPTIONS.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </>
  );
}

/**
 * Both month dropdowns carry the year on EVERY option, unconditionally — unlike
 * the table header, a dropdown row has no neighbouring column to disambiguate
 * against.
 *
 * `minKey` disables the options BELOW it by KEY comparison, not by a numeric
 * one. `i < monthFrom` on bare indices disabled every option below the current
 * month, which in December left exactly one enabled and made the new year
 * unreachable.
 */
function MonthOptions({ monthOptions, minKey = null }) {
  return (
    <>
      {monthOptions.map((key) => (
        <option key={key} value={key} disabled={minKey ? key < minKey : false}>
          {monthLabelWithYear(key)}
        </option>
      ))}
    </>
  );
}

function FilterSelect({ value, onChange, ariaLabel, compact, children }) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        "cursor-pointer rounded-xl border border-gray-200 bg-white text-sm text-9e-navy transition-all duration-9e-micro ease-9e hover:border-9e-brand focus:outline-none focus:ring-2 focus:ring-9e-action/20 dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-white dark:hover:border-9e-air " +
        (compact ? "min-w-[80px] px-3 py-2" : "min-w-[160px] px-4 py-2")
      }
    >
      {children}
    </select>
  );
}

/**
 * The desktop legend and its hover tooltip. Owns its own `showTooltip` — a
 * presentation toggle, not a filter — so ScheduleBoard stays free of state.
 */
function TypeLegend() {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="ml-auto flex items-center gap-3 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
      <span className="hidden md:inline">รูปแบบ:</span>
      {TYPE_LEGEND.map(({ key, label }) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: TYPE_COLOR[key] }}
          />
          {label}
        </span>
      ))}
      <div className="relative">
        <button
          type="button"
          aria-label="ข้อมูลรูปแบบการอบรม"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => setShowTooltip((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-9e-slate-lt-400 dark:border-9e-slate-dp-400 text-9e-slate-dp-50 transition-colors hover:border-9e-action hover:text-9e-action"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
        {showTooltip ? (
          <div className="absolute right-0 top-8 z-50 w-72 rounded-9e-md border border-[var(--surface-border)] bg-white p-4 text-sm shadow-lg dark:bg-[#111d2c]">
            <p className="mb-2 font-medium text-9e-navy dark:text-white">
              รูปแบบการอบรม
            </p>
            <div className="flex flex-col gap-2 text-9e-slate-dp-50 dark:text-[#94a3b8]">
              {TYPE_LEGEND.map(({ key, label, description }) => (
                <div key={key} className="flex items-start gap-2">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: TYPE_COLOR[key] }}
                  />
                  <span>
                    <strong className="text-9e-navy dark:text-white">
                      {label}
                    </strong>{" "}
                    : {description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── The mobile filter sheet ─────────────────────────────────────────────────

/**
 * Portal + body-scroll-lock + Escape + focus return, following the pattern
 * PublicHeaderClient's mobile drawer already established.
 *
 * ── WHY A PORTAL ────────────────────────────────────────────────────────────
 * The filter bar is `sticky top-20 z-20`. A positioned element with a z-index
 * creates a stacking context, so a `fixed` sheet rendered INSIDE that bar is
 * capped at z:20 and paints under the site header (z:60) no matter what
 * z-index it asks for. Portalling to `document.body` puts the sheet's
 * `z-[9999]` in competition with body-level siblings only — the same reasoning,
 * and the same z, as the header drawer.
 *
 * ── THE TWO-DRAWERS QUESTION ────────────────────────────────────────────────
 * Both this and the header drawer save/restore `document.body.style.overflow`,
 * so interleaved close order could in principle unlock the page early. In
 * practice they cannot both be open: this sheet's backdrop covers the header
 * (9999 > 60), so the hamburger is unreachable while the sheet is up.
 *
 * ── THE `typeof document` BRANCH ────────────────────────────────────────────
 * This is a client component and Next still renders it on the server, where
 * `createPortal` throws. Today `open` starts false so the server never reaches
 * the portal, but that is a property of one initial value rather than of this
 * component — and it is exactly the sort of thing a later "open the sheet from
 * the URL" change breaks with a 500. Rendering in place when there is no
 * document is the honest fallback, and it is what lets the render tier test the
 * sheet at all.
 */
function ScheduleFilterSheet({ open, onClose, returnFocusRef, ...panelProps }) {
  const panelRef = useRef(null);

  // Lock the page underneath while the sheet is open so iOS rubber-band and
  // trackpad scroll don't leak through the backdrop.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes; focus moves into the sheet on open and back to the ตัวกรอง
  // button on close. Focus RETURN is explicit rather than "restore whatever was
  // focused": the sheet can also be dismissed by tapping the backdrop, which
  // blurs the trigger first, and `document.activeElement` is <body> by then.
  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus?.();
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef?.current?.focus?.();
    };
  }, [open, onClose, returnFocusRef]);

  if (!open) return null;

  const panel = (
    <ScheduleFilterPanel
      panelRef={panelRef}
      onClose={onClose}
      {...panelProps}
    />
  );
  return typeof document === "undefined"
    ? panel
    : createPortal(panel, document.body);
}

/**
 * The sheet's markup — the five controls, the legend, the live count.
 *
 * LIVE, NOT DRAFT. There is no state in here and no ใช้ตัวกรอง button: every
 * `onChange` goes straight to the page's own filter setter, exactly as the
 * desktop bar's do, so one behaviour serves both sides. A button labelled as
 * applying something already applied is worse than no button, so the only
 * dismiss affordance is labelled as closing.
 *
 * Exported so the render tier can exercise it directly — `createPortal` has no
 * server renderer, and a component only reachable through one is a component
 * only reachable by hand.
 */
export function ScheduleFilterPanel({
  panelRef,
  onClose,
  filters,
  safeMonthTo,
  programs,
  monthOptions,
  onFilterChange,
  onReset,
  resultCount,
  activeCount,
}) {
  // useId, not a written-out string: both layouts are in the DOM at once and a
  // hand-authored id is a duplicate waiting to happen.
  const titleId = useId();

  return (
    <div className="fixed inset-0 z-[9999] lg:hidden">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl focus:outline-none dark:bg-[#111d2c]"
      >
        <div className="flex flex-none items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-[#1e3a5f]">
          <h2
            id={titleId}
            className="text-base font-bold text-9e-navy dark:text-white"
          >
            ตัวกรอง
            {activeCount > 0 ? (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-9e-action px-1.5 text-xs font-bold text-white">
                {activeCount}
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดตัวกรอง"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-9e-slate-dp-50 transition-colors duration-9e-micro ease-9e hover:bg-9e-ice dark:hover:bg-[#0f1e30]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-4">
            <SheetField label="โปรแกรม">
              <FilterSelect
                value={filters.program}
                onChange={(program) => onFilterChange({ program })}
                ariaLabel="โปรแกรม"
              >
                <ProgramOptions programs={programs} />
              </FilterSelect>
            </SheetField>

            <SheetField label="รูปแบบ">
              <FilterSelect
                value={filters.type}
                onChange={(type) => onFilterChange({ type })}
                ariaLabel="รูปแบบ"
              >
                <TypeOptions />
              </FilterSelect>
            </SheetField>

            <SheetField label="สถานะ">
              <FilterSelect
                value={filters.status}
                onChange={(status) => onFilterChange({ status })}
                ariaLabel="สถานะ"
              >
                <StatusOptions />
              </FilterSelect>
            </SheetField>

            <SheetField label="เดือน">
              <div className="flex items-center gap-2">
                <FilterSelect
                  value={filters.monthFrom}
                  onChange={(monthFrom) => onFilterChange({ monthFrom })}
                  ariaLabel="เดือนเริ่มต้น"
                  compact
                >
                  <MonthOptions monthOptions={monthOptions} />
                </FilterSelect>
                <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ถึง
                </span>
                <FilterSelect
                  value={safeMonthTo}
                  onChange={(monthTo) => onFilterChange({ monthTo })}
                  ariaLabel="เดือนสุดท้าย"
                  compact
                >
                  <MonthOptions
                    monthOptions={monthOptions}
                    minKey={filters.monthFrom}
                  />
                </FilterSelect>
              </div>
            </SheetField>

            {/* The legend's mobile home. No hover on touch, so the tooltip's
                explanations are shown outright rather than behind a `?`. */}
            <div className="rounded-9e-md border border-[var(--surface-border)] p-3">
              <p className="mb-2 text-xs font-medium text-9e-navy dark:text-white">
                รูปแบบการอบรม
              </p>
              <div className="flex flex-col gap-2 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                {TYPE_LEGEND.map(({ key, label, description }) => (
                  <div key={key} className="flex items-start gap-2">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: TYPE_COLOR[key] }}
                    />
                    <span>
                      <strong className="text-9e-navy dark:text-white">
                        {label}
                      </strong>{" "}
                      : {description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-none items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 dark:border-[#1e3a5f]">
          <ResultCount count={resultCount} />
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-9e-navy transition-colors duration-9e-micro ease-9e hover:border-9e-brand dark:border-[#1e3a5f] dark:text-white"
          >
            ล้างตัวกรอง
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetField({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-9e-slate-dp-50 dark:text-[#94a3b8]">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Per-column presentation for the frozen block, keyed to FROZEN_COLUMNS.
 *
 * Deliberately NOT in the lib module: that file owns the geometry (widths and
 * the cumulative offsets derived from them) and is imported by the pure tier,
 * which has no business knowing Tailwind classes. Alignment, padding and the
 * cell body are render concerns and live here.
 */
const FROZEN_CELLS = {
  code: {
    thClass: "px-3 text-center",
    tdClass:
      "px-3 py-2 text-center align-middle text-xs font-medium text-9e-slate-dp-50 dark:text-[#94a3b8]",
    cell: (c) => c.course_id ?? "-",
  },
  name: {
    thClass: "px-4 text-left",
    tdClass: "px-4 py-2 align-middle",
    cell: (c) => (
      <Link
        href={courseHref(c.course_id ? String(c.course_id).toLowerCase() : "")}
        className="text-sm font-medium text-9e-navy transition-colors hover:text-9e-action dark:text-white dark:hover:text-9e-air"
      >
        {c.course_name}
      </Link>
    ),
  },
  days: {
    thClass: "px-3 text-center",
    tdClass:
      "px-3 py-2 text-center align-middle text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]",
    cell: (c) => formatTrainingDays(c),
  },
  price: {
    thClass: "px-3 text-center",
    tdClass:
      "px-3 py-2 text-center align-middle text-xs font-medium text-9e-navy dark:text-white",
    /**
     * THE ONE CELL WHERE THE LABEL IS BROKEN ON PURPOSE.
     *
     * This column is frozen at 100px (FROZEN_COLUMNS in
     * lib/schedule/scheduleTableLayout) and spends 24 of them on `px-3`, so the
     * text box is 76px — and "Inhouse Only" at text-xs measures ~75. Left to
     * `white-space: normal` the browser is free to fit it on one line or break
     * it, and which one you get depends on the resolved font metrics: the same
     * table renders one line on one machine and two on the next, and flips
     * mid-session when a webfont finishes loading.
     *
     * Two block children make the break a fact of the markup instead of an
     * accident of measurement. Same words, same order, centred by the cell's
     * own `text-center`, and `leading-tight` keeps the two lines inside the
     * row's existing rhythm rather than growing it.
     *
     * SPLIT FROM THE CONSTANT, NOT RETYPED — the words still live in exactly
     * one place (lib/coursePriceLabel), which is the property the whole label
     * refactor exists to hold. Retyping "Inhouse" and "Only" here would put an
     * eighth copy back three commits after seven were removed.
     *
     * NUMBERS ARE UNTOUCHED and stay on one line: the widest realistic price
     * ("199,000" at 7 glyphs, ~44px) is comfortably inside 76px, and the cell
     * has no fixed height — only `py-2` — so nothing is clipped either way.
     *
     * Geometry is deliberately NOT the fix here. Widening the column to 130
     * would also work and is a one-number edit by design, but it moves
     * FROZEN_TOTAL 640 → 670 and the sticky offsets with it, which is a
     * different change with its own guards.
     */
    cell: (c) =>
      isInhouseOnlyPrice(c?.course_price) ? (
        <span className="block leading-tight">
          {INHOUSE_ONLY_LABEL.split(" ").map((word) => (
            <span key={word} className="block">
              {word}
            </span>
          ))}
        </span>
      ) : (
        formatCoursePrice(c)
      ),
  },
};

/**
 * The four frozen columns, rendered from ONE ordered array.
 *
 * `width` and `left` come from src/lib/schedule/scheduleTableLayout.js, where
 * the widths are declared exactly once and the sticky offsets are the
 * cumulative sums of them. `cell` is the only per-column difference that could
 * not be a data field. Previously each width appeared roughly a dozen times
 * across the colgroup, the `<th>` row and the `<td>` row, with nothing making
 * them agree — a one-column edit sheared the frozen block silently.
 */
const FROZEN = frozenLayout().map((col) => ({
  ...col,
  ...FROZEN_CELLS[col.key],
}));

/**
 * One program: the heading, then BOTH layouts.
 *
 * The heading is rendered once and shared. Duplicating it into each layout
 * would put the program name and its course count in the document twice, which
 * is the one part of the duplicated subtree that a screen reader would actually
 * read out twice.
 */
function ProgramGroup({
  program,
  courses,
  monthHeaders,
  visibleMonths,
  roundsByCourse,
  sessionMatches,
  earlyBirdMap = {},
  currentYear,
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        {program?.programiconurl ? (
          <Image
            src={program.programiconurl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
            unoptimized
          />
        ) : null}
        <h2 className="text-lg font-bold text-9e-navy dark:text-white">
          {program?.program_name ?? "อื่นๆ"}
        </h2>
        <span className="rounded-full bg-9e-air/20 px-2 py-0.5 text-xs font-bold text-9e-action dark:bg-[#111d2c] dark:text-9e-air">
          {courses.length}
        </span>
      </div>

      <div className="hidden lg:block">
        <ProgramTable
          courses={courses}
          monthHeaders={monthHeaders}
          visibleMonths={visibleMonths}
          roundsByCourse={roundsByCourse}
          sessionMatches={sessionMatches}
          earlyBirdMap={earlyBirdMap}
        />
      </div>

      <div className="flex flex-col gap-4 lg:hidden">
        {courses.map((c) => (
          <CourseCard
            key={c._id ?? c.course_id}
            course={c}
            rounds={courseRounds(
              roundsByCourse[c._id] ?? [],
              visibleMonths,
              sessionMatches,
            )}
            ebScheduleId={earlyBirdIdFor(earlyBirdMap, c)}
            currentYear={currentYear}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One lane's `<td>`s, walked left to right across every month column.
 *
 * ── WHY IT WALKS COLUMNS RATHER THAN MAPPING CELLS ──────────────────────────
 * A `colSpan` cell CONSUMES the columns it covers, so the columns a lane emits
 * and the cells it holds are not the same list. Mapping `lane.map(...)` would
 * emit one `<td>` per cell and leave every gap unfilled, shearing the row left.
 * The cursor is the whole mechanism: it advances past a spanned cell and emits
 * an empty `<td>` for anything the lane does not cover.
 *
 * THE TOTAL COLSPAN OF THE RETURNED CELLS IS EXACTLY `columnCount`. An
 * off-by-one here shears the table and no visual check catches it reliably, so
 * a render test asserts the arithmetic directly.
 *
 * ── THE DASH IS LANE 1 ONLY ─────────────────────────────────────────────────
 * An empty column in the first lane means "no round this month" and renders the
 * `—` it always did. An empty column in lanes 2+ means "this course's other
 * rounds are elsewhere in this row", and a wall of dashes under a spanned round
 * reads as missing data rather than as empty space. So lanes 2+ render nothing.
 */
function laneCells({ lane, laneIndex, columnCount, course, ebScheduleId }) {
  const out = [];
  let col = 0;

  const gap = (key) => (
    <td key={key} className="px-2 py-2 text-center align-middle">
      {laneIndex === 0 ? (
        <span className="text-xs text-9e-slate-lt-400/60 dark:text-9e-slate-dp-400/60">
          —
        </span>
      ) : null}
    </td>
  );

  for (const cell of lane) {
    while (col < cell.startIdx) {
      out.push(gap(`gap-${col}`));
      col += 1;
    }
    out.push(
      <td
        key={`cell-${cell.startIdx}`}
        // Omitted rather than set to 1 for a single-month cell — `colspan="1"`
        // is a no-op that would change the markup of every cell on the page.
        colSpan={cell.span > 1 ? cell.span : undefined}
        className="px-2 py-2 text-center align-middle"
      >
        {/*
          NO `items-center`, and that absence is the whole fix for a real
          defect: the Early Bird pill rendered as `arly Bir`, clipped on BOTH
          sides.

          `items-center` on a column flex container is a CROSS-AXIS rule, so it
          shrink-wrapped each child to its content width — and `ScheduleCell`'s
          <a> had no content but the date, because the pill inside it was
          absolutely positioned and therefore contributed nothing to intrinsic
          width. The anchor came out ~35px wide; the ~49px chip was laid out in
          it and the anchor's own `overflow-hidden` cropped both ends.

          With the default `stretch` the anchor fills the cell and the chip fits.
          The date and status stay centred because the box centres them itself.
          Two rounds in one month still stack on `gap-2`.
        */}
        <div className="flex flex-col gap-2">
          {cell.rounds.map((s, si) => (
            <ScheduleCell
              key={s._id ?? si}
              schedule={s}
              courseId={course.course_id}
              isEarlyBird={isEarlyBirdSchedule(ebScheduleId, s)}
            />
          ))}
          <ContinuationNote cell={cell} />
        </div>
      </td>,
    );
    col = cell.endIdx + 1;
  }

  while (col < columnCount) {
    out.push(gap(`gap-${col}`));
    col += 1;
  }
  return out;
}

/**
 * `← ต่อจาก ส.ค.` / `ต่อ ม.ค. →` — a round that continues outside the window.
 *
 * A round whose real span reaches past the visible months is still SHOWN, in
 * whatever space is visible, and its LABEL is not shortened: `formatRoundDays`
 * prints every day of the round including the days in the invisible month. What
 * would otherwise be missing is any sign that the cell is a fragment, so this
 * says so — deliberately smaller and muted, because the date is the thing being
 * read and this is a footnote to it.
 */
function ContinuationNote({ cell }) {
  if (!cell.clippedBefore && !cell.clippedAfter) return null;
  return (
    <span className="text-[10px] leading-none text-9e-slate-dp-50 dark:text-[#94a3b8]">
      {cell.clippedBefore ? `← ต่อจาก ${monthLabel(cell.beforeKey)}` : null}
      {cell.clippedBefore && cell.clippedAfter ? " " : null}
      {cell.clippedAfter ? `ต่อ ${monthLabel(cell.afterKey)} →` : null}
    </span>
  );
}

function ProgramTable({
  courses,
  monthHeaders,
  visibleMonths,
  roundsByCourse,
  sessionMatches,
  earlyBirdMap = {},
}) {
  const scrollRef = useRef(null); // the table's overflow-x container
  const barRef = useRef(null); // custom scrollbar track
  const [thumb, setThumb] = useState({ width: 0, left: 0 });
  const [needsScroll, setNeedsScroll] = useState(false);
  // How far the track starts in from the container's left edge — see
  // scrollTrackInset. Held in state because it depends on the container's
  // measured width, which only measure() knows.
  const [trackInset, setTrackInset] = useState(0);

  /**
   * Measure the scroll container and size/position the custom thumb.
   * Because the frozen columns are sticky inside the same scroll
   * container, the entire horizontal overflow IS the month area.
   *
   * BELOW `lg` THIS RUNS AGAINST A `display: none` CONTAINER and reads
   * `clientWidth: 0` / `scrollWidth: 0`. That is fine and deliberate:
   * `overflow` is 0, `need` is false, and the function returns before the
   * proportional maths — nothing divides by the zero width, and the custom
   * scrollbar simply does not render on a viewport that shows cards instead.
   * `scrollTrackInset(0)` is likewise clamped to 0 rather than negative.
   */
  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    const overflow = scrollWidth - clientWidth;
    const need = overflow > 1;
    setNeedsScroll(need);
    setTrackInset(scrollTrackInset(clientWidth));
    const bar = barRef.current;
    if (!need || !bar) return;
    // LIVE, not captured: `bar.clientWidth` already reflects the inset applied
    // below, so the proportional thumb maths needs no adjustment at all — the
    // track element simply became the month area. Same for the pointer handler,
    // which re-reads getBoundingClientRect() on every press.
    const trackW = bar.clientWidth;
    const thumbW = Math.max(40, (clientWidth / scrollWidth) * trackW);
    const maxThumbLeft = trackW - thumbW;
    const left = overflow > 0 ? (scrollLeft / overflow) * maxThumbLeft : 0;
    setThumb({ width: thumbW, left });
  }, []);

  // Keep the custom thumb in sync with native scroll / resize / reflow.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // The month count is a dep because it changes the table's own width, which
    // changes whether there is overflow at all — and a ResizeObserver on the
    // container does not fire for a child that grew inside it.
  }, [measure, monthHeaders.length, courses.length]);

  // Re-measure once the bar actually mounts (it only renders when
  // needsScroll flips true), so the thumb gets sized on first overflow.
  useEffect(() => {
    if (needsScroll) measure();
  }, [needsScroll, measure]);

  // Drag / click the custom track → map pointer x back to scrollLeft.
  const onTrackPointer = (e) => {
    const el = scrollRef.current;
    const bar = barRef.current;
    if (!el || !bar) return;
    const rect = bar.getBoundingClientRect();
    const overflow = el.scrollWidth - el.clientWidth;
    const trackW = bar.clientWidth;
    const thumbW = Math.max(40, (el.clientWidth / el.scrollWidth) * trackW);
    const maxThumbLeft = trackW - thumbW;

    const move = (clientX) => {
      const x = Math.min(
        Math.max(clientX - rect.left - thumbW / 2, 0),
        maxThumbLeft,
      );
      el.scrollLeft = maxThumbLeft > 0 ? (x / maxThumbLeft) * overflow : 0;
    };
    move(e.clientX);

    const onMove = (ev) => move(ev.clientX);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  /*
   * LIGHT-MODE CONTRAST. `border-gray-200` rather than `border-gray-100`:
   * the card sits on `bg-9e-ice` (#F8FAFD) and its own fill is #FFFFFF, so the
   * only thing separating the two is this border plus `shadow-sm`. At gray-100
   * (#F3F4F6) that edge is nearly the same value as the page and the card had
   * no perceptible boundary. gray-200 (#E5E7EB) is one step up the SAME scale
   * — already used by this file's selects and buttons — not a new token.
   *
   * INTERNAL dividers stay at gray-100: they separate rows from each other
   * INSIDE the card, where the surrounding value is #FFFFFF and a heavier line
   * would read as a grid rather than as rows. Only the outer edge moved.
   *
   * Dark mode is untouched — `#111d2c` card on `#0D1B2A` page with a `#1e3a5f`
   * border is already three distinct values and works.
   */
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:shadow-none">
      <div ref={scrollRef} className="no-native-scrollbar overflow-x-auto">
        {/*
            `width: 100%` + a COMPUTED `minWidth`, replacing the old fixed
            `min-w-[900px]` — a constant that stopped describing anything once
            the month count became variable. One rule, both behaviours: below
            the floor the table overflows and every month sits at exactly
            MONTH_MIN_WIDTH with the scrollbar active; above it `width: 100%`
            wins and the month <col>s — which carry NO width — divide the slack
            equally under `table-fixed`, while the frozen <col>s keep their
            specified widths so the sticky offsets stay true.
          */}
        <table
          className="w-full table-fixed border-collapse text-sm"
          style={{ minWidth: tableMinWidth(monthHeaders.length) }}
        >
          <colgroup>
            {FROZEN.map((col) => (
              <col key={col.key} style={{ width: col.width }} />
            ))}
            {/* NO width: this is what lets them absorb the slack. */}
            {monthHeaders.map((m) => (
              <col key={m.key} />
            ))}
          </colgroup>
          <thead>
            {/*
              THE HEADER WAS THE SAME TOKEN AS THE PAGE. `bg-9e-ice` here is
              #F8FAFD and so is the page background at the top of this file —
              literally the same class — so the header row read as a hole in the
              card rather than as part of it, which is most of why this table
              looked flat.

              `bg-gray-100` (#F3F4F6) is one step darker than the card's
              #FFFFFF, giving page / card / header three distinct values in
              light mode the way dark mode already has them (#0D1B2A / #111d2c /
              #0f1e30). It also puts the header DARKER than its card, which is
              the direction dark mode already uses.

              The `<th>` below carries the same fill and must stay in step: the
              frozen columns are sticky, so it is the TH's own background — not
              this row's — that covers the month cells scrolling underneath.
              Two places, one value, deliberately.
            */}
            <tr className="border-b border-gray-100 bg-gray-100 dark:border-[#1e3a5f] dark:bg-[#0f1e30]">
              {FROZEN.map((col) => (
                <th
                  key={col.key}
                  // Inline, NOT `left-[${col.left}px]` — Tailwind scans source
                  // text and never evaluates it, so a template-literal
                  // arbitrary value compiles to no class at all and fails
                  // silently as an unstyled (unstuck) column.
                  style={{ left: col.left }}
                  className={
                    // Same fill as the <tr> above, and it has to be: this cell
                    // is sticky, so its OWN background is what the month
                    // columns scroll under.
                    "sticky z-10 bg-gray-100 py-3 font-bold text-9e-navy dark:bg-[#0f1e30] dark:text-white " +
                    col.thClass +
                    (col.isLast
                      ? " border-r border-gray-100 dark:border-[#1e3a5f]"
                      : "")
                  }
                >
                  {col.label}
                </th>
              ))}
              {/* The dead `min-w-[90px]` is gone: the colgroup wins under
                    `table-fixed`, so it never applied, and it would actively
                    mislead now that the width is dynamic. */}
              {/* TWO LINES, and the year is on EVERY column — not just the
                    first of a new year. The table scrolls horizontally, so a
                    label that explains its neighbours stops explaining anything
                    the moment it leaves the viewport. See monthColumns. */}
              {monthHeaders.map((m) => (
                <th
                  key={m.key}
                  className="px-2 py-3 text-center font-bold text-9e-navy dark:text-white"
                >
                  <span className="block leading-tight">{m.label}</span>
                  <span className="block text-[11px] font-medium leading-tight text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {m.yearLabel}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {courses.map((c, i) => {
              const stripe = i % 2 === 0;
              const stickyBg = stripe
                ? "bg-white dark:bg-[#111d2c]"
                : "bg-[#FAFBFC] dark:bg-[#0a1424]/40";
              const ebScheduleId = earlyBirdIdFor(earlyBirdMap, c);

              /*
                ONE OR MORE LANES per course, packed like a Gantt chart.

                A round crossing months has to SPAN them, and a round inside one
                month has to stay ALIGNED under it — and when those two overlap
                a single <tr> cannot do both: there is nowhere to put a <td> at
                ต.ค. in a row that already has a colSpan=2 covering ก.ย.+ต.ค.
                So the row becomes lanes and the frozen columns rowSpan across
                them. See lib/schedule/monthLanes for the packing.

                `|| [[]]` is defensive only: `filteredCourses` guarantees every
                course here has at least one visible round, so an empty result
                is not reachable — but a course rendering NO <tr> at all would
                silently drop its frozen columns too, which is worth one line to
                make impossible.
              */
              const rounds = (roundsByCourse[c._id] ?? []).filter(sessionMatches);
              const packed = laneLayout(rounds, visibleMonths).lanes;
              const lanes = packed.length ? packed : [[]];

              return lanes.map((lane, li) => (
                <tr
                  key={`${c._id ?? c.course_id}-${li}`}
                  /*
                    Only the LAST lane of a course carries the row's bottom
                    border — an internal lane boundary is not a row boundary.
                    The single-lane case (almost every row on the page) produces
                    exactly the class string it always did.
                  */
                  className={
                    (li === lanes.length - 1
                      ? "border-b border-gray-100 last:border-0 dark:border-[#1e3a5f] "
                      : "dark:border-[#1e3a5f] ") + stickyBg
                  }
                >
                  {/* The frozen block belongs to the COURSE, not to a lane, so
                      it is rendered once and spans them. `rowSpan` is omitted
                      rather than set to 1 when there is a single lane: React
                      would emit `rowspan="1"`, which is a no-op that would
                      change the markup of every row on the page. */}
                  {li === 0 &&
                    FROZEN.map((col) => (
                      <td
                        key={col.key}
                        rowSpan={lanes.length > 1 ? lanes.length : undefined}
                        style={{ left: col.left }}
                        className={
                          "sticky z-10 " +
                          col.tdClass +
                          (col.isLast
                            ? " border-r border-gray-100 dark:border-[#1e3a5f]"
                            : "") +
                          " " +
                          stickyBg
                        }
                      >
                        {col.cell(c)}
                      </td>
                    ))}
                  {laneCells({
                    lane,
                    laneIndex: li,
                    columnCount: monthHeaders.length,
                    course: c,
                    ebScheduleId,
                  })}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {/* Custom horizontal scrollbar, calibrated 1:1 to the scroll container
            so it reaches the last month — and INSET to the start of the month
            area, because the four frozen columns are sticky and never move.
            A track beginning under รหัสหลักสูตร points at something that
            cannot scroll. The inset yields to a minimum track width on narrow
            viewports; see scrollTrackInset. */}
      {needsScroll && (
        <div className="pb-2">
          <div
            ref={barRef}
            onMouseDown={onTrackPointer}
            style={{ marginLeft: trackInset }}
            className="relative h-2.5 cursor-pointer rounded-full bg-gray-200 dark:bg-[#1e3a5f]"
          >
            <div
              className="absolute top-0 h-2.5 rounded-full bg-gray-400 hover:bg-gray-500 dark:bg-[#3b5a7f]"
              style={{ width: thumb.width, left: thumb.left }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── The mobile card layout ──────────────────────────────────────────────────

/**
 * One course, below `lg`: identity, then the rounds as full-width tap targets.
 *
 * The rounds arrive already windowed, filtered and ordered (see `courseRounds`)
 * — the card does no selection of its own, because a second selection rule is
 * a second answer to "which rounds are there".
 */
function CourseCard({ course, rounds, ebScheduleId, currentYear }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const href = courseHref(
    course.course_id ? String(course.course_id).toLowerCase() : "",
  );

  const collapsible = rounds.length > ROUND_COLLAPSE_THRESHOLD;
  const shown =
    collapsible && !expanded ? rounds.slice(0, ROUND_COLLAPSE_THRESHOLD) : rounds;

  /*
   * gray-200 for the same reason as the desktop table card: identical
   * treatment (#FFFFFF fill, shadow-sm) on the identical #F8FAFD page, so
   * leaving it at gray-100 would make the same card separate from the same
   * background differently depending on the viewport. The two are never on
   * screen together — `lg:hidden` against `hidden lg:block` — but a resize
   * crosses between them.
   *
   * The ROW fill inside this card is a separate decision; see MOBILE_ROW.
   */
  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:shadow-none">
      <div className="px-4 pt-4">
        <p className="text-xs font-medium text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {course.course_id ?? "-"}
        </p>
        <Link
          href={href}
          className="mt-1 block text-base font-bold leading-snug text-9e-navy transition-colors hover:text-9e-action dark:text-white dark:hover:text-9e-air"
        >
          {course.course_name}
        </Link>
        <div className="mt-3 flex items-center justify-between pb-3 text-sm">
          <span className="text-9e-slate-dp-50 dark:text-[#94a3b8]">
            {formatTrainingDays(course, { withUnit: true })}
          </span>
          <span className="font-bold text-9e-navy dark:text-white">
            {formatCoursePrice(course, { withUnit: true })}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-100 pb-3 dark:border-[#1e3a5f]">
        <p className="px-4 pt-3 text-xs font-bold text-9e-slate-dp-50 dark:text-[#94a3b8]">
          รอบอบรม
        </p>
        {/* Gapped, not flush: each row is its own object now, so the separator
            is space rather than a hairline between two lines of text. */}
        <ul id={listId} className="mt-2 flex flex-col gap-2 px-4">
          {shown.map((s) => (
            <RoundRow
              key={s._id}
              schedule={s}
              courseId={course.course_id}
              isEarlyBird={isEarlyBirdSchedule(ebScheduleId, s)}
              currentYear={currentYear}
            />
          ))}
        </ul>
        {collapsible ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 flex w-full items-center justify-center gap-1 px-4 py-2 text-xs font-medium text-9e-action transition-colors duration-9e-micro ease-9e dark:text-9e-air"
          >
            {expanded ? "ย่อรอบอบรม" : `ดูรอบทั้งหมด (${rounds.length})`}
            <ChevronDown
              className={
                "h-3.5 w-3.5 transition-transform duration-9e-micro ease-9e" +
                (expanded ? " rotate-180" : "")
              }
              strokeWidth={2}
            />
          </button>
        ) : null}
      </div>

      {/* DEMOTED to secondary text. It used to be the only brand-blue thing on
          the card, which made the least important action look like the most
          tappable one — the round rows are the page's primary action. Still a
          link, same href. */}
      <Link
        href={href}
        className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs font-medium text-9e-slate-dp-50 transition-colors duration-9e-micro ease-9e hover:text-9e-action dark:border-[#1e3a5f] dark:text-[#94a3b8] dark:hover:text-9e-air"
      >
        ดูรายละเอียดคอร์ส
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
      </Link>
    </article>
  );
}

/**
 * The row's surface: a step off the card, not a line of text on it.
 *
 * ── WHY THIS EXISTS AS A CONSTANT ───────────────────────────────────────────
 * A round that cannot be linked renders the same object without the link, and
 * the two must not drift into two different-looking rows. Only the interactive
 * affordances (below) are added on top of it.
 *
 * `min-h-[44px]` IS THE POINT, not padding that happens to land near it. The
 * previous row was ~36px, under the iOS and Android tap-target minimum, with
 * the next round directly beneath it — so a mis-tap did not miss, it registered
 * on the wrong round and took the visitor to the wrong registration page.
 *
 * Tokens are all already in this file: `bg-9e-ice` is the page background,
 * `#0f1e30` is the table header's dark fill (the card is `#111d2c`, so the row
 * reads as a step off it in dark too), and `--surface-border` is the one
 * hairline that needs no dark variant.
 *
 * ── THIS ROW KEEPS `bg-9e-ice` WHILE THE TABLE HEADER LEFT IT ───────────────
 * That sentence used to also say `bg-9e-ice` was "the table header's light
 * fill". It no longer is: the header moved to `bg-gray-100` because sharing a
 * token with the PAGE made it read as a hole in the card.
 *
 * This row has no such collision and is deliberately left alone. It sits INSIDE
 * the white card, never adjacent to the page — the card is always between them
 * — so #F8FAFD against the card's #FFFFFF is exactly the one-step lift it wants,
 * and three assertions in test/render/scheduleRoundRowAffordance pin it as
 * "a fill a step off the white card". The header's problem was WHICH surface it
 * was next to, not the value itself.
 */
const ROUND_ROW_SURFACE =
  "flex min-h-[44px] w-full items-center gap-3 rounded-9e-md border border-[var(--surface-border)] bg-9e-ice px-3 py-2 dark:bg-[#0f1e30]";

/**
 * Touch has no hover, so the feedback is `active:` — a tint and a slight press,
 * held for the moment between the tap and the next page painting. A
 * `hover:`-only treatment is invisible on the device this layout exists for.
 */
const ROUND_ROW_PRESS =
  "transition-all duration-9e-micro ease-9e active:scale-[0.99] active:bg-9e-air/20";

/**
 * One round on a card — the same four facts the table cell carries (type dot,
 * date, status badge, early bird), laid out as a filled, bounded tap target
 * instead of stacked into a 90px column.
 *
 * ── WHY THE MIDDLE COLUMN IS A WRAPPING ROW ─────────────────────────────────
 * Everything forced onto one line does not fit 360px once a cross-month label
 * is in play: `30 ต.ค. - 2 พ.ย. 69` plus an Early Bird tag plus a status pill
 * plus the chevron overruns, and the date — the one thing the row is about — is
 * what flex gives up first.
 *
 * The fix is NOT to force the tag onto its own line either: on a short date
 * like `10-11 ก.ย. 69` that spends a whole extra line for nothing and makes the
 * early-bird row visibly taller than its neighbours, so the row reads as
 * inconsistent rather than as informative. So the date and the tag share ONE
 * wrapping container and the browser decides per row — inline when there is
 * room, wrapped when there is not. No breakpoint, no measurement.
 *
 * The three classes that make it safe rather than merely flexible:
 *   · `min-w-0` on this column, so overflow is absorbed HERE;
 *   · `flex-none` on the pill and on the chevron, so they are never what
 *     shrinks — the inversion above cannot come back;
 *   · `items-center`, without which the tag and the date sit on different
 *     baselines the moment they share a line.
 *
 * ── ONE `<a>`, NO NESTED CONTROL ────────────────────────────────────────────
 * The chevron is a circle, not a button: it is `aria-hidden` decoration inside
 * the link, because the row already IS the link and a second focusable element
 * inside it would be a second stop announcing the same destination.
 */
function RoundRow({ schedule, courseId, isEarlyBird = false, currentYear }) {
  const statusStyle = resolveScheduleBadge(schedule.status);
  const color = TYPE_COLOR[schedule.type] ?? TYPE_COLOR.classroom;
  const href = scheduleRegistrationHref(schedule, courseId);

  const inner = (
    <>
      <span
        className="h-2.5 w-2.5 flex-none rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-9e-navy dark:text-white">
          {formatRoundDays(schedule.dates, {
            showMonth: true,
            showYear: "auto",
            currentYear,
          })}
        </span>
        {isEarlyBird ? <EarlyBirdTag /> : null}
      </span>
      {/* Omitted entirely when the status is missing/blank — no empty pill and
          no default label. `soft` is the TINTED PILL treatment lib/scheduleStatus
          already declares for exactly this shape, dark variants included, so the
          pill needs no colour of its own. */}
      {statusStyle && (
        <span
          className={`flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${statusStyle.soft}`}
        >
          {statusStyle.label}
        </span>
      )}
      {href ? (
        <span
          aria-hidden
          className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-9e-air/20 text-9e-action dark:text-9e-air"
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      ) : null}
    </>
  );

  return (
    <li>
      {href ? (
        <a href={href} className={`${ROUND_ROW_SURFACE} ${ROUND_ROW_PRESS}`}>
          {inner}
        </a>
      ) : (
        /* No anchor at all, so there is nothing to tap and nothing to focus —
           the row is inert in fact, not merely in appearance. `aria-disabled`
           says so out loud for a screen reader, which would otherwise read a
           plain <span> as ordinary text and give no hint why this round reads
           differently from its neighbours. The `active:` press state and the
           chevron are both absent above for the same reason: nothing should
           promise a destination that does not exist.

           `cursor-not-allowed` is here even though this layout is the TOUCH one
           and touch has no cursor. It costs nothing, and the breakpoint is a
           VIEWPORT WIDTH, not an input device: a narrow desktop window renders
           these rows to a mouse user. Leaving it off would make the pointer the
           one thing that still behaved as if the round were live. */
        <span aria-disabled="true" className={`cursor-not-allowed ${ROUND_ROW_SURFACE}`}>
          {inner}
        </span>
      )}
    </li>
  );
}

/**
 * The desktop round, as a bordered box rather than a bare stack of text.
 *
 * ── THE BORDER IS THE DELIVERY TYPE ─────────────────────────────────────────
 * Its colour comes from `TYPE_COLOR` — the SAME map the dot, the mobile row and
 * both legends read. Applied inline rather than as a class, because those are
 * hex values and Tailwind never evaluates a template literal: `border-[${color}]`
 * compiles to no class at all and fails silently as an unbordered box. (The
 * frozen columns' sticky `left` is inline for exactly this reason; see the
 * comment there.)
 *
 * The dot stays. The border says the same thing more quietly, but the dot is
 * what the two legends point at, and the internal order — type colour, dates,
 * status — is unchanged.
 *
 * ── NO `whitespace-nowrap`, NO TRUNCATION, NO SMALLER TYPE ──────────────────
 * A four-day non-consecutive round is `8, 10, 12, 14` and that is the widest
 * label this cell has to hold. In a 90px column it WILL wrap to two lines, and
 * that is accepted: every day of the round is shown. The box has no fixed
 * height — only `py-1.5` — so a second line grows the cell rather than being
 * clipped, and `overflow-hidden` is deliberately absent for the same reason.
 *
 * ── 1px, AND THE SECOND PIXEL MOVED TO A HOVER RING ─────────────────────────
 * This was briefly `border-2`. The thickness is back to 1px and the emphasis it
 * was reaching for now arrives on HOVER, as a ring — see CELL_BOX_HOVER.
 *
 * The reason is layout, not taste. A border is part of the box: the second pixel
 * came out of the 90px column's CONTENT width on every cell at rest, including
 * the ones nobody is pointing at, and this is the box whose whole design note
 * above is about a label that already wraps to two lines at that width. A ring
 * is a box-shadow, drawn OUTSIDE the box and outside layout entirely, so it
 * costs no content width, triggers no reflow, and the question of what a
 * thicker edge does to a wrapping date never has to be asked.
 *
 * ── THE TRANSITION LIST IS WIDENED, NOT SWAPPED FOR `transition-all` ─────────
 * `transition-colors` does NOT cover `box-shadow`, so the hover tint would fade
 * over 200ms while the ring appeared and vanished instantly — one hover state
 * coming apart into two, most visibly on the way OUT, where the ring is gone
 * while the tint is still visibly draining.
 *
 * The list below is `transition-colors`'s own property list VERBATIM — `color,
 * background-color, border-color, text-decoration-color, fill, stroke` — plus
 * `box-shadow`. Purely additive, so nothing that animated before stops. Not
 * `transition-all`, which on a flex box with padding, a radius and a wrapping
 * label would animate layout properties too and make every re-layout a 200ms
 * slide. (If a Tailwind upgrade ever changes what `transition-colors` covers,
 * this list is the thing that silently falls out of step with it — the quoted
 * list above is what it was when this was written.)
 *
 * It is a COMPLETE LITERAL, for the same reason everything else here is: see
 * ROUND_HOVER_VAR. Tailwind emits the comma as the CSS escape `\2c ` in the
 * selector, which is worth knowing before writing a matcher against it.
 */
const CELL_BOX =
  "flex flex-col items-center gap-0.5 rounded-9e-md border px-1 py-1.5 " +
  "transition-[color,background-color,border-color,text-decoration-color,fill,stroke,box-shadow] " +
  "duration-9e-micro ease-9e";

/**
 * The CSS custom property the hover background reads.
 *
 * ── WHY A VARIABLE AND NOT `hover:bg-[${color}]/10` ─────────────────────────
 * Tailwind SCANS SOURCE TEXT and never evaluates it, so a template literal in a
 * class name compiles to no class at all. `hover:bg-[${color}]/10` is not a
 * broken colour — it is nothing, and it fails SILENTLY as a box that simply does
 * not react to the pointer. The same reason `borderColor` is already inline and
 * the frozen columns' sticky `left` is inline.
 *
 * A custom property splits the problem in two: the VALUE is computed per round
 * and set inline (which is fine, inline styles are not scanned), and the CLASS
 * is a COMPLETE LITERAL, which the JIT can see.
 *
 * ── THIS CONSTANT IS FOR THE STYLE KEY ONLY. NEVER BUILD THE CLASS FROM IT ──
 * The first version shipped DEAD, and it shipped dead by interpolating this very
 * constant into the hover class with a template literal instead of writing the
 * class out in full — the exact trap the paragraph above describes, two lines
 * below where it describes it.
 *
 * The rendered markup was perfect. The class attribute really did read
 * `hover:bg-[var(--round-hover-bg)]`, so all 3325 tests passed. What was missing
 * was the CSS RULE: Tailwind read the SOURCE text, took the uninterpolated
 * candidate, and emitted a selector containing a literal dollar-brace — one
 * nothing can ever match. The string `round-hover-bg` appeared ZERO times in the
 * 284KB stylesheet, so the element had no background-color declaration at all,
 * which is exactly how it looked in the browser: no hover, not even the old one.
 *
 * (The wrong form is deliberately NOT written out here. Tailwind scans comments
 * too — this docstring would put the junk candidate straight back into the
 * stylesheet, which is how the dead selector outlived the code that caused it.)
 *
 * The name therefore lives in TWO places on purpose — here, and spelled out in
 * the class literal below — and test/fs/tailwindArbitraryValueRules COMPILES
 * Tailwind to assert they agree and that the class really emits a
 * `background-color`.
 */
const ROUND_HOVER_VAR = "--round-hover-bg";

/**
 * Hover, on the linked round only.
 *
 * ── THE BACKGROUND, NOT THE BORDER ──────────────────────────────────────────
 * The border carries the DELIVERY TYPE. A hover that repainted it would trade
 * information for feedback, so the background is what lifts.
 *
 * It lifts in the round's OWN type colour at 10%, replacing a flat
 * `bg-9e-air/10` that was the same pale blue for every type — so hovering a
 * hybrid round tinted it classroom-blue, quietly contradicting the border two
 * pixels away.
 *
 * ── 10% IS NOT THE 12% ON THE CAROUSEL'S TYPE PILL ──────────────────────────
 * Different numbers for different reasons, and they must not be unified. This
 * one is a TRANSIENT hover and was specified at 10%; that one is a PERMANENT
 * pill on a white card, where 10% nearly vanishes. If anyone ever makes them
 * equal, the equality is a coincidence and needs a comment saying so — the same
 * trap as the four `4`s in adminScheduleHorizon, where a cleanup that unified
 * numbers equal by accident broke a working surface.
 *
 * ── ONE DECLARATION, BOTH THEMES ────────────────────────────────────────────
 * The `dark:hover:bg-9e-air/10` duplicate is dropped rather than translated. It
 * only existed because the old token needed restating; an rgba at 10% composites
 * over whatever is beneath it, so it reads as a light wash on the light card and
 * a subtle glow on the dark one without a second rule. Verified in both themes
 * by rendering — the value is identical, only the surface under it differs.
 */
/*
  A COMPLETE LITERAL. Not a template, not a concatenation, not built from
  ROUND_HOVER_VAR — see that constant's docstring for what happened when it was.

  NO `[color:var(…)]` DATA-TYPE HINT, and that is MEASURED rather than assumed:
  the shipped stylesheet already contains

      .hover\:bg-\[var\(--surface-hover\)\]:hover { background-color: var(--surface-hover); }

  so a bare `var()` inside `bg-[…]`, under a `hover:` variant, already resolves
  to a background-COLOR in this config. Adding a hint here would change nothing
  and would misattribute the cause — the class was never emitted at all, it was
  not emitted as the wrong property.

  ── AND THE RING, IN TWO CLASSES ────────────────────────────────────────────
  `hover:ring-2` paints; `hover:ring-[color:var(--round-ring)]` colours it. Both
  COMPLETE LITERALS, and the `color:` data-type hint is MANDATORY — see below.

  Measured, not assumed. The pair compiles under this config to

      .hover\:ring-2:hover {
        --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);
        --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color);
        box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000);
      }
      .hover\:ring-\[color\:var\(--round-ring\)\]:hover {
        --tw-ring-color: var(--round-ring);
      }

  so the WIDTH utility is what draws and the COLOUR utility only feeds it. That
  split is worth knowing: a ring-colour class shipped on its own emits a
  perfectly valid declaration and paints nothing at all, which is why
  test/fs/tailwindArbitraryValueRules asserts a `box-shadow`, not merely that a
  rule exists.

  Preflight sets `--tw-ring-offset-width: 0px` and `--tw-ring-offset-color: #fff`
  on `*, ::before, ::after`, which makes the offset shadow ` 0 0 0 0px #fff` —
  zero blur, zero spread, zero offset, so it paints NOTHING. No ring-offset
  utility is used here and none should be added: that is what would turn the
  white offset colour into a visible halo between the border and the ring.

  ── WHY NOT SET `--tw-ring-color` INLINE AND DROP THE SECOND CLASS ──────────
  Because it breaks this element's KEYBOARD FOCUS RING — the app-wide one, which
  this cell is supposed to inherit unchanged.

  It is the tempting route: `hover:ring-2` alone reads `--tw-ring-color`, so
  writing that variable in the inline style would colour the ring with no
  arbitrary value in any class. It compiles, it renders, and it looks right
  under a mouse.

  What it also does is outrank globals.css's

      *:focus-visible { @apply outline-none ring-2 ring-9e-brand ring-offset-2; … }

  An inline custom property beats any author rule regardless of selector
  specificity, so `--tw-ring-color` set inline wins on :focus-visible too, and
  the brand-blue focus indicator silently becomes the round's own type colour.
  Measured against `--tw-ring-offset-color: var(--page-bg)` on the LIGHT theme:

      #2486FF brand      3.54:1   passes WCAG 1.4.11 (floor 3:1)
      #00CCFF classroom  1.90:1   FAILS
      #22C55E online     2.28:1   FAILS
      #8B5CF6 hybrid     4.23:1   passes

  Classroom is also the fallback for a round with no `type`, so the common case
  is the failing one. (The dark theme passes on all four — it would have been
  invisible to anyone testing there.)

  A variable of OUR OWN has none of that reach: `--round-ring` is read by
  exactly one selector, under `:hover`, so :focus-visible keeps the brand ring.
  The extra class is the price, and it buys back the focus indicator.

  (Hover AND focus at once resolves to the type colour — the hover rule is
  (0,2,0) against the universal rule's (0,1,0). That is a mouse resting on a
  keyboard-focused cell, and the ring is visible either way.)
*/
const CELL_BOX_HOVER =
  "hover:bg-[var(--round-hover-bg)] hover:ring-2 hover:ring-[color:var(--round-ring)]";

/**
 * The CSS custom property the hover RING reads.
 *
 * Same contract as ROUND_HOVER_VAR, for the same reason, with one addition: the
 * `color:` DATA-TYPE HINT in the class above is mandatory here, and unlike the
 * background's missing hint that is not a judgement call.
 *
 * An arbitrary `ring-` utility is ambiguous in a way an arbitrary background
 * one is not: Tailwind has both a ring-WIDTH and a ring-COLOUR utility
 * competing for the same brackets, so a bare `var()` has to be guessed at. It
 * happens to guess colour in 3.4.19, but the guess is the config's to change
 * and nothing would announce it — a value re-read as a width would produce a
 * `calc()` over a hex, which is invalid, and the ring would simply stop
 * drawing. The hint removes the question rather than betting on it.
 *
 * (The bracketed forms are described rather than written out. Tailwind scans
 * comments, so a bracket shape spelled in prose becomes a real selector nothing
 * can ever match — this file already carries a handful of those from older
 * docstrings, and there is no reason to add more.)
 *
 * THIS CONSTANT IS FOR THE STYLE KEY ONLY. NEVER BUILD THE CLASS FROM IT — see
 * ROUND_HOVER_VAR's docstring for what shipped when that rule was broken two
 * lines below where it was written down.
 */
const ROUND_RING_VAR = "--round-ring";

function ScheduleCell({ schedule, courseId, isEarlyBird = false }) {
  const statusStyle = resolveScheduleBadge(schedule.status);
  const color = TYPE_COLOR[schedule.type] ?? TYPE_COLOR.classroom;
  // No month and no year: every column header carries both, on every column.
  const dateLabel = formatRoundDays(schedule.dates);
  const href = scheduleRegistrationHref(schedule, courseId);

  /**
   * dot → date → status → Early Bird, all four IN FLOW.
   *
   * ── WHY IN FLOW AND NOT `absolute bottom-0` ─────────────────────────────────
   * The pill used to hang off the top edge as an out-of-flow overlay, and that
   * is precisely what made it render as `arly Bir`: an absolutely-positioned
   * child contributes NOTHING to its parent's intrinsic width, so the anchor
   * could not widen to fit its own pill and had to be given width by a wrapper
   * two levels up. Flipping `top-0` to `bottom-0` would move the pill and keep
   * that property exactly.
   *
   * As an ordinary last child the chip is part of the intrinsic width, so the
   * anchor can never again be narrower than the pill it contains. The defect
   * does not become fixed, it becomes unrepresentable — which is why this is
   * worth more than a two-token edit.
   *
   * Three coupled pieces retire with the overlay:
   *   · the `pt-3` reservation, whose 12px had to be kept in agreement with the
   *     chip's own rendered height by hand, in a different file position;
   *   · the `justify-center` wrapper span, whose centring is what made the
   *     clipping symmetrical and therefore hard to read as a width problem;
   *   · the anchor's reliance on `overflow-hidden` to crop the overflow.
   *
   * `relative` and `overflow-hidden` used to remain on the anchor as inert
   * leftovers. They are gone now: the round is a bordered box, so `rounded-sm`
   * became `rounded-9e-md`, and `overflow-hidden` on a box that may WRAP TO TWO
   * LINES is a clipping question nobody should have to think about.
   */
  const inner = (
  <>
    <span className="flex items-center gap-1">
      <span
        className="h-2 w-2 flex-none rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-sm font-bold leading-none text-9e-navy transition-colors group-hover:text-9e-action dark:text-white dark:group-hover:text-9e-air">
        {dateLabel}
      </span>
    </span>
    {/* Omitted entirely when the status is missing/blank. */}
    {statusStyle && (
    <span className={`text-[10px] font-bold leading-none ${statusStyle.text}`}>
      {statusStyle.label}
    </span>
    )}
    {isEarlyBird && <EarlyBirdPill />}
  </>
);

  if (!href) {
    /*
      THE FULL ROUND. Same contract as RoundRow's inert branch and UNCHANGED by
      the box: no anchor, so no navigation and no focus stop, and `aria-disabled`
      to say why. It also has no `group`, which is what the date's
      `group-hover:text-9e-action` hangs off, and none of the hover classes — so
      a round nobody can book does not light up, does not lift, and shows no
      pointer cursor.

      That distinction is the point of drawing this as a button at all. A button
      APPEARANCE must not become a button AFFORDANCE for a round that cannot be
      registered for; the box still identifies the delivery type by its border,
      which is information, while promising nothing it cannot deliver.
    */
    return (
      <span
        aria-disabled="true"
        className={`cursor-not-allowed ${CELL_BOX}`}
        style={{ borderColor: color }}
      >
        {inner}
      </span>
    );
  }
  return (
    <a
      href={href}
      className={`group cursor-pointer ${CELL_BOX} ${CELL_BOX_HOVER}`}
      /* The hover tint travels as a custom property in the SAME inline style
         that already carries the border colour — see ROUND_HOVER_VAR for why it
         cannot be a class. The inert branch above sets none of the three: a
         round nobody can book does not light up.

         NOTE WHICH VARIABLE THE RING USES. It is `--round-ring`, a name of our
         own, and deliberately NOT Tailwind's `--tw-ring-color`. Setting the
         latter inline would colour the ring with one fewer class and would also
         outrank the app-wide `*:focus-visible` rule, turning the brand-blue
         keyboard focus indicator into the round's type colour — 1.90:1 on a
         classroom round against a white page, under the 3:1 floor. The full
         reasoning and the measurements are at CELL_BOX_HOVER.

         The FULL type colour, not a tint: the ring restates the border it sits
         against, so it takes the same value `borderColor` does. The 10% tint
         belongs to the background alone. */
      style={{
        borderColor: color,
        [ROUND_RING_VAR]: color,
        [ROUND_HOVER_VAR]: trainingTypeTint(schedule.type, 0.1),
      }}
    >
      {inner}
    </a>
  );
}

/**
 * The early-bird chip's wording and colour, shared by both treatments below.
 *
 * WHAT IS SHARED: the word, the lime, the padding, the type, the shadow — every
 * property that says "this is the same thing on both surfaces". CORNERS ARE
 * NOT, and never were: `rounded-*` is set locally by each treatment, which is
 * what makes a corner change on one layout incapable of moving the other.
 *
 * The two shapes used to differ genuinely — an overlay tab clipped to the top
 * of a 90px cell, versus an inline pill in a card row. Now that the table's
 * pill is in flow at the bottom of its column, they are one class apart
 * (`flex-none`, which the card's wrapping row needs and the table's column does
 * not). Collapsing them into one component is a reasonable follow-up; it is not
 * done here because it would edit the card's component in a change scoped to
 * the table, for no rendered difference.
 */
const EARLY_BIRD_LABEL = "Early Bird";
const EARLY_BIRD_CHIP =
  "whitespace-nowrap bg-[#D4F73F] px-1.5 py-[2px] text-[0.5rem] font-black leading-none text-9e-navy shadow-sm";

/**
 * The table's chip: the last row of the cell's column, fully rounded now that it
 * no longer hangs off an edge. `rounded-b-sm` was a consequence of the overlay's
 * position, not a decision, and it retires with it.
 */
function EarlyBirdPill() {
  return (
    <span className={`rounded-sm ${EARLY_BIRD_CHIP}`}>{EARLY_BIRD_LABEL}</span>
  );
}

function EarlyBirdTag() {
  return (
    <span className={`flex-none rounded-sm ${EARLY_BIRD_CHIP}`}>
      {EARLY_BIRD_LABEL}
    </span>
  );
}
