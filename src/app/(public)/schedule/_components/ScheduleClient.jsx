"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Download, FileText, HelpCircle } from "lucide-react";
import { courseHref } from "@/lib/utils";
import {
  SCHEDULE_STATUS_OPTIONS,
  resolveScheduleBadge,
} from "@/lib/scheduleStatus";
import {
  PUBLIC_SCHEDULE_DEFAULT_MONTHS,
  PUBLIC_SCHEDULE_FILTER_HORIZON,
  monthColumns,
  monthKey,
  monthLabelWithYear,
  rollingWindow,
  scheduleMonthKey,
  windowBetween,
} from "@/lib/schedule/monthWindow";
import {
  frozenLayout,
  scrollTrackInset,
  tableMinWidth,
} from "@/lib/schedule/scheduleTableLayout";

const MONTH_TH = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const TYPE_COLOR = {
  classroom: "#00CCFF",
  hybrid: "#8B5CF6",
  online: "#22C55E",
};

function formatDateLabel(scheduleItem) {
  const dates = (scheduleItem?.dates ?? [])
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (dates.length === 0) return "-";
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (dates.length === 1) return String(first.getDate());
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()}-${last.getDate()}`;
  }
  return `${first.getDate()} ${MONTH_TH[first.getMonth()]} - ${last.getDate()}`;
}

export function ScheduleClient({
  courses,
  programs,
  schedulePDF,
  earlyBirdMap = {},
}) {
  /**
   * The month state is a `YYYY-MM` KEY, not a 0-11 index.
   *
   * The index could not express a window that crosses December — 0 is not
   * greater than 11 — so the default silently meant "the rest of this calendar
   * year" and a December visitor got one column with every new-year session
   * dropped from the table. See src/lib/schedule/monthWindow.js.
   *
   * Lazy initialisers so `new Date()` is read once per mount rather than on
   * every render, and so the default window and the filter options are derived
   * from the same instant.
   */
  const [monthFrom, setMonthFrom] = useState(() => monthKey(new Date()));
  const [monthTo, setMonthTo] = useState(() => {
    const w = rollingWindow(new Date(), PUBLIC_SCHEDULE_DEFAULT_MONTHS);
    return w[w.length - 1];
  });

  const [selectedProgram, setSelectedProgram] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [showTooltip, setShowTooltip] = useState(false);

  // What the two dropdowns offer. A rolling horizon from today, so it never
  // shrinks as the year goes on — the defect this replaced.
  const monthOptions = useMemo(
    () => rollingWindow(new Date(), PUBLIC_SCHEDULE_FILTER_HORIZON),
    [],
  );

  // Keep `to` from falling below `from` after a change. A plain string
  // comparison: `YYYY-MM` is fixed-width and zero-padded, so lexicographic
  // order is chronological order — '2026-12' < '2027-01'.
  const safeMonthTo = monthTo < monthFrom ? monthFrom : monthTo;

  const visibleMonths = useMemo(
    () => windowBetween(monthFrom, safeMonthTo),
    [monthFrom, safeMonthTo],
  );

  // Header cells: the bare month, with a Buddhist-era year added only where a
  // bare label would be ambiguous. See monthColumns' docstring for the rule.
  const monthHeaders = useMemo(() => monthColumns(visibleMonths), [visibleMonths]);

  // course._id → { 'YYYY-MM' → schedules[] }
  const scheduleMap = useMemo(() => {
    const map = {};
    for (const c of courses) {
      const buckets = {};
      for (const s of c.schedules ?? []) {
        const key = scheduleMonthKey(s);
        if (key === null) continue;
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(s);
      }
      map[c._id] = buckets;
    }
    return map;
  }, [courses]);

  // Filter helpers — applied to a schedule cell so the table reacts
  // to type / status filters at the cell level (not just whole row).
  const sessionMatches = (s) =>
    (selectedType === "all" || s.type === selectedType) &&
    (selectedStatus === "all" || s.status === selectedStatus);

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (
        selectedProgram !== "all" &&
        c.program?.program_name !== selectedProgram
      ) {
        return false;
      }
      // Course is visible if it has at least one matching schedule in
      // the visible-month range.
      const buckets = scheduleMap[c._id] ?? {};
      return visibleMonths.some((m) => (buckets[m] ?? []).some(sessionMatches));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    courses,
    scheduleMap,
    visibleMonths,
    selectedProgram,
    selectedType,
    selectedStatus,
  ]);

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

  return (
    <div className="min-h-screen bg-9e-ice pb-16 dark:bg-9e-navy">
      {/* Hero */}
      <section className="relative overflow-hidden bg-9e-gradient-hero py-12 dark:bg-gradient-to-b dark:from-[#0a1628] dark:to-[#0d1e36] md:py-16">
        <div className="relative mx-auto max-w-[1200px] px-4 text-center lg:px-6">
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            ตารางฝึกอบรม (Public Training)
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-white/85 md:text-base">
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
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 max-md:px-4 py-3">
          <FilterSelect
            value={selectedProgram}
            onChange={setSelectedProgram}
            ariaLabel="โปรแกรม"
          >
            <option value="all">โปรแกรมทั้งหมด</option>
            {programs.map((p) => (
              <option key={p._id ?? p.program_id} value={p.program_name}>
                {p.program_name}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            value={selectedType}
            onChange={setSelectedType}
            ariaLabel="รูปแบบ"
          >
            <option value="all">รูปแบบทั้งหมด</option>
            <option value="classroom">Classroom</option>
            <option value="hybrid">Hybrid</option>
          </FilterSelect>

          <FilterSelect
            value={selectedStatus}
            onChange={setSelectedStatus}
            ariaLabel="สถานะ"
          >
            <option value="all">สถานะทั้งหมด</option>
            {/* Driven off the same source as the badges, so the filter wording
                cannot drift from what the rows actually say. */}
            {SCHEDULE_STATUS_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </FilterSelect>

          <div className="flex items-center gap-2">
            <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
              เดือน:
            </span>
            {/* Both dropdowns carry the year on EVERY option, unconditionally
                — unlike the table header, a dropdown row has no neighbouring
                column to disambiguate against. */}
            <FilterSelect
              value={monthFrom}
              onChange={setMonthFrom}
              ariaLabel="เดือนเริ่มต้น"
              compact
            >
              {monthOptions.map((key) => (
                <option key={key} value={key}>
                  {monthLabelWithYear(key)}
                </option>
              ))}
            </FilterSelect>
            <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ถึง
            </span>
            <FilterSelect
              value={safeMonthTo}
              onChange={setMonthTo}
              ariaLabel="เดือนสุดท้าย"
              compact
            >
              {/* A KEY comparison, not a numeric one. `i < monthFrom` on bare
                  indices disabled every option below the current month, which
                  in December left exactly one enabled and made the new year
                  unreachable. */}
              {monthOptions.map((key) => (
                <option key={key} value={key} disabled={key < monthFrom}>
                  {monthLabelWithYear(key)}
                </option>
              ))}
            </FilterSelect>
          </div>

          {/* Legend + tooltip */}
          <div className="ml-auto flex items-center gap-3 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            <span className="hidden md:inline">รูปแบบ:</span>
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: TYPE_COLOR.classroom }}
              />
              Classroom
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: TYPE_COLOR.hybrid }}
              />
              Hybrid
            </span>
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
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: TYPE_COLOR.classroom }}
                      />
                      <span>
                        <strong className="text-9e-navy dark:text-white">
                          Classroom
                        </strong>{" "}
                        : อบรมที่ห้องอบรม 9Expert
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: TYPE_COLOR.hybrid }}
                      />
                      <span>
                        <strong className="text-9e-navy dark:text-white">
                          Hybrid
                        </strong>{" "}
                        : เลือกเรียนที่ห้องอบรม หรือ Microsoft Teams
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Result count */}
      <div className="mx-auto max-w-[1200px] max-md:px-4 pt-6">
        <p className="text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ผลลัพธ์การค้นหา{" "}
          <span className="font-bold text-9e-action dark:text-9e-air">
            {filteredCourses.length}
          </span>{" "}
          หลักสูตร
        </p>
      </div>

      {/* Schedule tables */}
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 py-6 max-md:px-4">
        {grouped.length === 0 ? (
          <div className="rounded-9e-md border border-dashed border-[var(--surface-border)] py-20 text-center text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ไม่พบหลักสูตรที่ตรงกับเงื่อนไข
          </div>
        ) : null}

        {grouped.map(({ program, courses: groupCourses }) => (
          <ProgramTable
            key={program?._id ?? program?.program_name ?? "other"}
            program={program}
            courses={groupCourses}
            monthHeaders={monthHeaders}
            scheduleMap={scheduleMap}
            sessionMatches={sessionMatches}
            earlyBirdMap={earlyBirdMap}
          />
        ))}
      </div>
    </div>
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
    cell: (c) => c.course_trainingdays ?? "-",
  },
  price: {
    thClass: "px-3 text-center",
    tdClass:
      "px-3 py-2 text-center align-middle text-xs font-medium text-9e-navy dark:text-white",
    cell: (c) =>
      c.course_price ? Number(c.course_price).toLocaleString("th-TH") : "Call",
  },
};

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

function ProgramTable({
  program,
  courses,
  monthHeaders,
  scheduleMap,
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

  // Measure the scroll container and size/position the custom thumb.
  // Because the frozen columns are sticky inside the same scroll
  // container, the entire horizontal overflow IS the month area.
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

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:shadow-none">
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
              <tr className="border-b border-gray-100 bg-9e-ice dark:border-[#1e3a5f] dark:bg-[#0f1e30]">
                {FROZEN.map((col) => (
                  <th
                    key={col.key}
                    // Inline, NOT `left-[${col.left}px]` — Tailwind scans source
                    // text and never evaluates it, so a template-literal
                    // arbitrary value compiles to no class at all and fails
                    // silently as an unstyled (unstuck) column.
                    style={{ left: col.left }}
                    className={
                      "sticky z-10 bg-9e-ice py-3 font-bold text-9e-navy dark:bg-[#0f1e30] dark:text-white " +
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
                const ebScheduleId =
                  earlyBirdMap?.[String(c.course_id).toUpperCase()] ?? null;
                return (
                  <tr
                    key={c._id ?? c.course_id}
                    className={
                      "border-b border-gray-100 last:border-0 dark:border-[#1e3a5f] " +
                      stickyBg
                    }
                  >
                    {FROZEN.map((col) => (
                      <td
                        key={col.key}
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
                    {monthHeaders.map((m) => {
                      const cellSchedules = (
                        scheduleMap[c._id]?.[m.key] ?? []
                      ).filter(sessionMatches);
                      return (
                        <td
                          key={m.key}
                          className="px-2 py-2 text-center align-middle"
                        >
                          {cellSchedules.length === 0 ? (
                            <span className="text-xs text-9e-slate-lt-400/60 dark:text-9e-slate-dp-400/60">
                              —
                            </span>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              {cellSchedules.map((s, si) => (
                                <ScheduleCell
                                  key={s._id ?? si}
                                  schedule={s}
                                  courseId={c.course_id}
                                  isEarlyBird={
                                    !!ebScheduleId && s._id === ebScheduleId
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
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
    </div>
  );
}

function ScheduleCell({ schedule, courseId, isEarlyBird = false }) {
  const statusStyle = resolveScheduleBadge(schedule.status);
  const color = TYPE_COLOR[schedule.type] ?? TYPE_COLOR.classroom;
  const dateLabel = formatDateLabel(schedule);
  // Prefer the internal registration page with the schedule's _id pre-selected.
  // Fall back to upstream signup_url only when _id or courseId is missing.
  const href =
    schedule._id && courseId
      ? `/registration/public?course=${String(courseId).toLowerCase()}&class=${schedule._id}`
      : schedule.signup_url || null;

  const inner = (
    <span
      className={`flex flex-col items-center gap-0.5${isEarlyBird ? " pt-3" : ""}`}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-[11px] font-bold leading-none text-9e-navy transition-colors group-hover:text-9e-action dark:text-white dark:group-hover:text-9e-air">
        {dateLabel}
      </span>
      {/* Omitted entirely when the status is missing/blank. */}
      {statusStyle && (
      <span className={`text-[9px] font-bold leading-none ${statusStyle.text}`}>
        {statusStyle.label}
      </span>
      )}
    </span>
  );

  if (!href) {
    return (
      <span className="relative block overflow-hidden rounded-sm">
        {isEarlyBird && <EarlyBirdPill />}
        {inner}
      </span>
    );
  }
  return (
    <a
      href={href}
      className="group relative block cursor-pointer overflow-hidden rounded-sm"
    >
      {isEarlyBird && <EarlyBirdPill />}
      {inner}
    </a>
  );
}

function EarlyBirdPill() {
  return (
    <span className="pointer-events-none absolute top-0 left-0 right-0 z-10 flex justify-center">
      <span className="whitespace-nowrap rounded-b-sm bg-[#D4F73F] px-1.5 py-[2px] text-[0.5rem] font-black leading-none text-9e-navy shadow-sm">
        Early Bird
      </span>
    </span>
  );
}
