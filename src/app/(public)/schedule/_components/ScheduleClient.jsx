'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Download, FileText, HelpCircle } from 'lucide-react';
import { courseHref } from '@/lib/utils';

const MONTH_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const STATUS_STYLE = {
  open:        { dot: 'bg-[#39b980]', text: 'text-[#39b980]', label: 'รับสมัคร' },
  nearly_full: { dot: 'bg-[#ffc94a]', text: 'text-[#d4a017]', label: 'ใกล้เต็ม' },
  full:        { dot: 'bg-[#ff4b55]', text: 'text-[#ff4b55]', label: 'เต็ม' },
};

const TYPE_COLOR = {
  classroom: '#00CCFF',
  hybrid:    '#8B5CF6',
  online:    '#22C55E',
};

function getMonthIndex(scheduleItem) {
  const first = scheduleItem?.dates?.[0];
  if (!first) return null;
  const d = new Date(first);
  return Number.isNaN(d.getTime()) ? null : d.getMonth();
}

function formatDateLabel(scheduleItem) {
  const dates = (scheduleItem?.dates ?? [])
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (dates.length === 0) return '-';
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (dates.length === 1) return String(first.getDate());
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()}-${last.getDate()}`;
  }
  return `${first.getDate()} ${MONTH_TH[first.getMonth()]} - ${last.getDate()}`;
}

export function ScheduleClient({ courses, programs, schedulePDF, earlyBirdMap = {} }) {
  const currentMonth = new Date().getMonth();

  const [selectedProgram, setSelectedProgram] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [monthFrom, setMonthFrom] = useState(currentMonth);
  const [monthTo, setMonthTo] = useState(11);
  const [showTooltip, setShowTooltip] = useState(false);

  // Make sure monthTo never falls below monthFrom after a change.
  const safeMonthTo = monthTo < monthFrom ? monthFrom : monthTo;

  const visibleMonths = useMemo(() => {
    const arr = [];
    for (let m = monthFrom; m <= safeMonthTo; m++) arr.push(m);
    return arr;
  }, [monthFrom, safeMonthTo]);

  // course._id → { monthIndex → schedules[] }
  const scheduleMap = useMemo(() => {
    const map = {};
    for (const c of courses) {
      const buckets = {};
      for (const s of c.schedules ?? []) {
        const m = getMonthIndex(s);
        if (m === null) continue;
        if (!buckets[m]) buckets[m] = [];
        buckets[m].push(s);
      }
      map[c._id] = buckets;
    }
    return map;
  }, [courses]);

  // Filter helpers — applied to a schedule cell so the table reacts
  // to type / status filters at the cell level (not just whole row).
  const sessionMatches = (s) =>
    (selectedType === 'all' || s.type === selectedType) &&
    (selectedStatus === 'all' || s.status === selectedStatus);

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (
        selectedProgram !== 'all' &&
        c.program?.program_name !== selectedProgram
      ) {
        return false;
      }
      // Course is visible if it has at least one matching schedule in
      // the visible-month range.
      const buckets = scheduleMap[c._id] ?? {};
      return visibleMonths.some((m) =>
        (buckets[m] ?? []).some(sessionMatches)
      );
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
      const key = c.program?.program_name ?? 'อื่นๆ';
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
      const an = a.program?.program_name ?? '';
      const bn = b.program?.program_name ?? '';
      return an.localeCompare(bn, 'th');
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
            <option value="open">รับสมัคร</option>
            <option value="nearly_full">ใกล้เต็ม</option>
            <option value="full">เต็ม</option>
          </FilterSelect>

          <div className="flex items-center gap-2">
            <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">เดือน:</span>
            <FilterSelect
              value={String(monthFrom)}
              onChange={(v) => setMonthFrom(Number(v))}
              ariaLabel="เดือนเริ่มต้น"
              compact
            >
              {MONTH_TH.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </FilterSelect>
            <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">ถึง</span>
            <FilterSelect
              value={String(safeMonthTo)}
              onChange={(v) => setMonthTo(Number(v))}
              ariaLabel="เดือนสุดท้าย"
              compact
            >
              {MONTH_TH.map((m, i) => (
                <option key={m} value={i} disabled={i < monthFrom}>
                  {m}
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
                        </strong>{' '}
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
                        </strong>{' '}
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
          ผลลัพธ์การค้นหา{' '}
          <span className="font-bold text-9e-action dark:text-9e-air">
            {filteredCourses.length}
          </span>{' '}
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
            key={program?._id ?? program?.program_name ?? 'other'}
            program={program}
            courses={groupCourses}
            visibleMonths={visibleMonths}
            scheduleMap={scheduleMap}
            sessionMatches={sessionMatches}
            earlyBirdMap={earlyBirdMap}
          />
        ))}
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, ariaLabel, compact, children }) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        'cursor-pointer rounded-xl border border-gray-200 bg-white text-sm text-9e-navy transition-all duration-9e-micro ease-9e hover:border-9e-brand focus:outline-none focus:ring-2 focus:ring-9e-action/20 dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-white dark:hover:border-9e-air ' +
        (compact ? 'min-w-[80px] px-3 py-2' : 'min-w-[160px] px-4 py-2')
      }
    >
      {children}
    </select>
  );
}

function ProgramTable({
  program,
  courses,
  visibleMonths,
  scheduleMap,
  sessionMatches,
  earlyBirdMap = {},
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
          {program?.program_name ?? 'อื่นๆ'}
        </h2>
        <span className="rounded-full bg-9e-air/20 px-2 py-0.5 text-xs font-bold text-9e-action dark:bg-[#111d2c] dark:text-9e-air">
          {courses.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:shadow-none">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-9e-ice dark:border-[#1e3a5f] dark:bg-[#0f1e30]">
              <th className="sticky left-0 z-10 w-[400px] min-w-[400px] max-w-[400px] border-r border-gray-100 bg-9e-ice px-4 py-3 text-left font-bold text-9e-navy dark:border-[#1e3a5f] dark:bg-[#0f1e30] dark:text-white">
                ชื่อหลักสูตร
              </th>
              <th className="w-[60px] px-3 py-3 text-center font-bold text-9e-navy dark:text-white">
                วัน
              </th>
              <th className="w-[100px] px-3 py-3 text-center font-bold text-9e-navy dark:text-white">
                ราคา
              </th>
              {visibleMonths.map((m) => (
                <th
                  key={m}
                  className="min-w-[90px] px-2 py-3 text-center font-bold text-9e-navy dark:text-white"
                >
                  {MONTH_TH[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {courses.map((c, i) => {
              const stripe = i % 2 === 0;
              return (
                <tr
                  key={c._id ?? c.course_id}
                  className={
                    'border-b border-gray-100 transition-colors last:border-0 hover:bg-9e-ice/50 dark:border-[#1e3a5f] dark:hover:bg-[#0f1e30]/60 ' +
                    (stripe
                      ? ''
                      : 'bg-[#FAFBFC] dark:bg-[#0a1424]/40')
                  }
                >
                  <td
                    className={
                      'sticky left-0 z-10 border-r border-gray-100 px-4 py-3 dark:border-[#1e3a5f] ' +
                      (stripe
                        ? 'bg-white dark:bg-[#111d2c]'
                        : 'bg-[#FAFBFC] dark:bg-[#0a1424]/40')
                    }
                  >
                    <Link
                      href={courseHref(
                        c.course_id ? String(c.course_id).toLowerCase() : ''
                      )}
                      className="text-sm font-medium text-9e-navy transition-colors hover:text-9e-action dark:text-white dark:hover:text-9e-air"
                    >
                      {c.course_name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {c.course_trainingdays ?? '-'}
                  </td>
                  <td className="px-3 py-3 text-center text-xs font-medium text-9e-navy dark:text-white">
                    {c.course_price
                      ? Number(c.course_price).toLocaleString('th-TH')
                      : 'Call'}
                  </td>
                  {visibleMonths.map((m) => {
                    const cellSchedules = (
                      scheduleMap[c._id]?.[m] ?? []
                    ).filter(sessionMatches);
                    const ebScheduleId =
                      earlyBirdMap?.[String(c.course_id).toUpperCase()] ?? null;
                    return (
                      <td
                        key={m}
                        className="px-2 py-2 text-center align-top"
                      >
                        {cellSchedules.length === 0 ? (
                          <span className="text-xs text-9e-slate-lt-400/60 dark:text-9e-slate-dp-400/60">—</span>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            {cellSchedules.map((s, si) => (
                              <ScheduleCell
                                key={s._id ?? si}
                                schedule={s}
                                courseId={c.course_id}
                                isEarlyBird={!!ebScheduleId && s._id === ebScheduleId}
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
    </div>
  );
}

function ScheduleCell({ schedule, courseId, isEarlyBird = false }) {
  const statusStyle = STATUS_STYLE[schedule.status] ?? STATUS_STYLE.open;
  const color = TYPE_COLOR[schedule.type] ?? TYPE_COLOR.classroom;
  const dateLabel = formatDateLabel(schedule);
  // Prefer the internal registration page with the schedule's _id pre-selected.
  // Fall back to upstream signup_url only when _id or courseId is missing.
  const href = schedule._id && courseId
    ? `/registration/public?course=${String(courseId).toLowerCase()}&class=${schedule._id}`
    : (schedule.signup_url || null);

  const inner = (
    <span className={`flex flex-col items-center gap-0.5${isEarlyBird ? ' pt-3' : ''}`}>
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-[11px] font-bold leading-none text-9e-navy transition-colors group-hover:text-9e-action dark:text-white dark:group-hover:text-9e-air">
        {dateLabel}
      </span>
      <span className={`text-[9px] font-bold leading-none ${statusStyle.text}`}>
        {statusStyle.label}
      </span>
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
    <a href={href} className="group relative block cursor-pointer overflow-hidden rounded-sm">
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

