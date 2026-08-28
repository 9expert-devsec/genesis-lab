'use client';

import { Fragment, useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';
import {
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '@/lib/actions/schedules';
import {
  adminScheduleMonthCols,
  adminScheduleSelectableMonthKeys,
  adminScheduleSelectableWindowDays,
  resolveAdminScheduleRange,
  ADMIN_SCHEDULE_MONTHS,
  ADMIN_SCHEDULE_SELECTABLE_MONTHS_TOTAL,
} from '@/lib/adminScheduleHorizon';
import {
  arrowState,
  daysOfMonth,
  openingMonth,
  rangeFor,
  stepMonth,
  visibleMonthsFrom,
} from '@/lib/schedule/editorCalendarRange';
import {
  classifyAgainstWindow,
  warningTextTh,
} from '@/lib/schedule/gridWindowWarning';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { laneLayout } from '@/lib/schedule/monthLanes';
import { monthLabel } from '@/lib/schedule/monthWindow';
import { trainingTypeColor } from '@/lib/schedule/trainingTypeColor';
import { resolveScheduleBadge } from '@/lib/scheduleStatus';

// ── constants ──────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Open' },
  { value: 'nearly_full', label: 'Nearly Full' },
  { value: 'full',        label: 'Full' },
];
/**
 * ── THE ROUND'S DOT USED TO BE THE STATUS. IT IS THE DELIVERY TYPE NOW ──────
 *
 * A local `STATUS_DOT` map (green / amber / red) lived here and coloured the
 * dot at the head of every round box. That is not what the dot means on
 * /schedule: there the dot and the box's border carry the TRAINING TYPE from
 * lib/schedule/trainingTypeColor, and the status is a word underneath. Two
 * surfaces showing the same round with the same dot meaning two different
 * things is the drift this repo already paid for once with four copies of the
 * type palette (see that module's docstring), so the map is gone rather than
 * kept beside the shared one.
 *
 * Nothing is lost by dropping it: the status is now READ AS TEXT rather than
 * inferred from a colour, and its colours come from `resolveScheduleBadge`, the
 * same single fallback policy every other surface renders a status from.
 */

const TYPE_OPTIONS = [
  { value: 'classroom', label: 'Classroom' },
  { value: 'hybrid',    label: 'Hybrid' },
];

/**
 * Display names for the dot's tooltip.
 *
 * Deliberately NOT `TYPE_OPTIONS`, and deliberately covering `online`, which
 * that list does not: TYPE_OPTIONS is the editor's `<select>` and is limited to
 * the two types an admin may CREATE, while a round arriving from MSDB can carry
 * any type the palette knows. Reusing the select's list would leave an online
 * round's green dot with no name at all — the one case where the tooltip is
 * doing real work, because green is the type this screen cannot produce.
 */
const TYPE_LABEL = {
  classroom: 'Classroom',
  hybrid:    'Hybrid',
  online:    'Online',
};

const TH_MONTH_FMT = new Intl.DateTimeFormat('th-TH', {
  year: '2-digit',
  month: 'short',
});

// ── shared helpers ─────────────────────────────────────────────────

/** Local-time ISO date (YYYY-MM-DD). `toISOString()` shifts to UTC. */
function toLocalIso(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
/*
 * A local `monthKey(v)` stood here. It had ONE caller — the schedule map's
 * first-date bucketing — and that bucketing is exactly what
 * lib/schedule/monthLanes replaced (see `scheduleMap` below). It is deleted
 * rather than left exported-by-proximity: a private "which month is this
 * round in" helper sitting beside code that must ask `roundSpanIndices` that
 * question instead is how the first-date answer grows back.
 */

/** `YYYY-MM` → the 1st of that month, local time. For the from/to dropdowns. */
function monthKeyToDate(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key ?? ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date(NaN);
}

// ── main component ─────────────────────────────────────────────────

/**
 * ── THE FILTERS ARE PROPS, AND THE URL IS WRITTEN IN ONE PLACE ──────────────
 *
 * `search`, `filterProgram`, `filterStatus`, `monthFrom` and `monthTo` are
 * read from `searchParams` by page.jsx and passed down — the same shape as
 * AuditLogClient / CoursesAdminClient, the reference implementations
 * test/fs/urlFilterNoState.test.mjs holds this screen to. The three plain
 * filters used to be `useState`, seeded from nothing and reset on every
 * navigation; the month range is new in this round and was written straight
 * into this shape rather than added as a fourth filter onto a broken one.
 */
export function SchedulesAdminClient({
  schedules,
  courses,
  programs = [],
  scheduleLocals = [],
  instructors = [],
  search = '',
  filterProgram = '',
  filterStatus = '',
  monthFrom,
  monthTo,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [, startTransition] = useTransition();

  const [collapsed, setCollapsed] = useState({});
  const [modal, setModal]         = useState(null);

  /**
   * The next URL, serialised FROM THE PROPS — the one and only writer.
   * Same shape as AuditLogClient / CoursesAdminClient's `navigate`.
   */
  const navigate = useCallback(
    (overrides = {}) => {
      const next = { search, filterProgram, filterStatus, monthFrom, monthTo, ...overrides };
      const params = new URLSearchParams();
      Object.entries(next).forEach(([k, v]) => {
        const value = String(v ?? '').trim();
        if (value) params.set(k, value);
      });
      const qs = params.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [router, pathname, search, filterProgram, filterStatus, monthFrom, monthTo]
  );

  // The from/to dropdowns' own option list — every month the admin may
  // select, independent of what is currently rendered. See
  // adminScheduleSelectableRange's docstring for why this reach is fixed at
  // 12 months back / 24 forward and must not import the editor picker's
  // identical-looking constants.
  const selectableMonthKeys = useMemo(() => adminScheduleSelectableMonthKeys(), []);

  // The untouched default view, for the ล้างตัวกรอง gate below. Recomputed
  // once per mount rather than per render for the same reason ScheduleClient
  // freezes its own `defaults` in state: a page left open across the 1st of
  // the month must not have its "N filters active" badge light up on its own.
  const [defaultRange] = useState(() => resolveAdminScheduleRange(new Date()));

  // ── month column headers ───────────────────────────────────────
  // Columns are built for the SELECTED monthFrom/monthTo span, not a fixed
  // horizon — page.jsx resolves and clamps that span before it ever reaches
  // here, and derives the MSDB `to` bound from the same span, so the window
  // rendered here is still the window fetched.
  const monthCols = useMemo(
    () =>
      adminScheduleMonthCols(new Date(), { fromKey: monthFrom, toKey: monthTo }).map((c) => ({
        ...c,
        label: TH_MONTH_FMT.format(new Date(c.year, c.month, 1)),
      })),
    [monthFrom, monthTo]
  );

  // ── lookups ────────────────────────────────────────────────────
  const localBySchedId = useMemo(() => {
    const m = new Map();
    for (const l of scheduleLocals) {
      if (l?.msdb_schedule_id) m.set(String(l.msdb_schedule_id), l);
    }
    return m;
  }, [scheduleLocals]);

  const instructorById = useMemo(() => {
    const m = new Map();
    for (const i of instructors) if (i?._id) m.set(String(i._id), i);
    return m;
  }, [instructors]);

  /**
   * Bucket schedules BY COURSE ONLY. MSDB returns `schedule.course` as either
   * a populated object (`{ _id, course_id, course_name, … }`) or a bare
   * ObjectId string — and the bare form is more likely right after a write
   * before the next round-trip populates it. We index under BOTH the ObjectId
   * AND the human `course_id` code so the row lookup in `ProgramGroup` can fall
   * back to whichever key matches the course in hand.
   *
   *   key shape:  `<ObjectId>` OR `<course_id>`
   *   value:      [schedule, …]
   *
   * Duplicate schedules across both keys are deduped by `_id` so a lookup never
   * returns the same row twice.
   *
   * ── THE SECOND KEY — THE MONTH — IS GONE, AND THAT IS THE FIX ─────────────
   * This map used to be `{ 'YYYY-MM': [schedule, …] }`, keyed by
   * `monthKey(s.dates?.[0])` — THE MONTH OF THE ROUND'S FIRST DATE ONLY. That
   * is the identical defect `lib/schedule/monthLanes` was written to remove
   * from the public table, and it produced two visible faults here:
   *
   *   · a 30 ต.ค. – 2 พ.ย. round sat entirely inside the ต.ค. column and its
   *     label read `30-2`, a range that does not exist in October;
   *   · a round whose FIRST date fell before the selected window but whose
   *     later dates fell inside it was bucketed under a month with no column
   *     and vanished from the grid completely.
   *
   * Which columns a round occupies is now `roundSpanIndices`' single answer,
   * reached through `laneLayout` below — the same one the public table, its
   * course filter and its mobile card all read.
   */
  const scheduleMap = useMemo(() => {
    const map = new Map();

    function push(key, s) {
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      const list = map.get(key);
      // Dedupe: the same schedule lands under both the ObjectId and the
      // course_id key. Keep it once per key.
      if (!list.some((x) => String(x._id) === String(s._id))) list.push(s);
    }

    for (const s of schedules) {
      let oid = '';
      let codeKey = '';
      if (typeof s.course === 'object' && s.course !== null) {
        oid = String(s.course._id ?? '');
        codeKey = String(s.course.course_id ?? '');
      } else if (s.course != null) {
        oid = String(s.course);
      }

      push(oid, s);
      push(codeKey, s);
    }
    return map;
  }, [schedules]);

  // ── courses → program groups (with search + program filter) ────
  const programGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredCourses = courses.filter((c) => {
      const matchSearch =
        !q ||
        (c.course_name || '').toLowerCase().includes(q) ||
        (c.course_name_th || '').toLowerCase().includes(q) ||
        (c.course_id || '').toLowerCase().includes(q);
      const progId = String(c.program?._id ?? c.program ?? '');
      const matchProgram = !filterProgram || progId === filterProgram;
      return matchSearch && matchProgram;
    });

    const groups = new Map();
    for (const c of filteredCourses) {
      const id = String(c.program?._id ?? c.program ?? '__none__');
      const name =
        c.program?.program_name ?? c.program?.name ?? 'อื่นๆ';
      const icon =
        c.program?.program_icon_url ?? c.program?.programiconurl ?? null;
      if (!groups.has(id)) {
        groups.set(id, { id, name, icon, courses: [] });
      }
      groups.get(id).courses.push(c);
    }

    /**
     * ── RANKED BY THE `programs` PROP, WHICH IS THE PUBLIC TABLE'S ORDER ─────
     *
     * This block is ScheduleClient's `grouped` reducer, same shape and same
     * tie-breaks: rank by position in the parent's `programs` array, fall to
     * `Infinity` for anything the array does not name, and break ties on the
     * Thai collation of the name.
     *
     * It used to be `localeCompare` ALONE, which is why /admin/schedules listed
     * AI Builder, Canva, Claude AI while /schedule — reading the admin-curated
     * ProgramOrder through `getOrderedPrograms` — put Claude AI above Power BI.
     * page.jsx now runs that same call and hands the result down, so the two
     * tables group in one order. See its docstring for why the programmes
     * `getOrderedPrograms` hides are appended rather than dropped: they land
     * at `Infinity` here, after every ranked group, and stay reachable.
     *
     * `__none__` — courses with no programme at all — still sorts dead last,
     * after even the unranked ones, which is what it did before.
     */
    const orderRank = new Map(
      programs.map((p, i) => [String(p.program_name ?? p.name ?? ''), i])
    );
    const rankOf = (g) =>
      orderRank.has(g.name) ? orderRank.get(g.name) : Infinity;

    return [...groups.values()].sort((a, b) => {
      if (a.id === '__none__') return 1;
      if (b.id === '__none__') return -1;
      const ra = rankOf(a);
      const rb = rankOf(b);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, 'th');
    });
  }, [courses, search, filterProgram, programs]);

  // count of schedules currently shown (status-aware; the program /
  // search filters only hide courses, not schedules themselves, so we
  // only filter by status here for the "X / Y รอบ" indicator).
  const visibleCount = useMemo(() => {
    if (!filterStatus) return schedules.length;
    return schedules.filter((s) => s.status === filterStatus).length;
  }, [schedules, filterStatus]);

  function toggleCollapse(id) {
    setCollapsed((cur) => ({ ...cur, [id]: !cur[id] }));
  }
  function openCreate(courseCode = null, monthKeyHint = null) {
    setModal({ mode: 'create', courseCode, monthKeyHint, schedule: null });
  }
  function openEdit(schedule) {
    setModal({ mode: 'edit', schedule });
  }

  async function handleDelete(scheduleId) {
    if (!window.confirm('ยืนยันลบรอบอบรมนี้?')) return;
    setBusyId(scheduleId);
    setMsg(null);
    try {
      const res = await deleteSchedule(scheduleId);
      if (res?.ok) {
        setMsg({ type: 'ok', text: 'ลบสำเร็จ' });
        startTransition(() => router.refresh());
      } else {
        setMsg({ type: 'err', text: res?.error ?? 'ลบไม่สำเร็จ' });
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4 p-1">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-9e-navy dark:text-white">
            จัดการตารางอบรม
          </h1>
          <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
            {/* No longer advertises max_seats and วิทยากร as things this
                screen edits — their inputs are gone from the modal. The values
                are still STORED and still shown on the round boxes below. */}
            แสดง {ADMIN_SCHEDULE_MONTHS} เดือนข้างหน้า — ราคาต่อรอบเก็บใน Genesis
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          + เพิ่มตารางอบรม
        </button>
      </div>

      {msg && (
        <div
          className={
            'rounded-9e-md px-3 py-2 text-sm ' +
            (msg.type === 'ok'
              ? 'border border-green-200 bg-green-50 text-green-700'
              : 'border border-red-200 bg-red-50 text-red-700')
          }
        >
          {msg.text}
        </div>
      )}

      {/* ── Filter bar ─────────────────────────────────────────────────
          Restyled to the public /schedule bar's visual language (rounded-xl,
          gray-200 borders, 9e-brand hover) — see ScheduleClient.jsx's
          FilterSelect. The table itself is unchanged this round. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-9e-slate-dp-50"
            aria-hidden="true"
          />
          {/* Uncontrolled and re-keyed on `search`, committing on Enter or
              blur — same pattern as CoursesAdminClient's box, so the URL
              (not this component) is the only place the term lives. */}
          <input
            key={search}
            type="text"
            defaultValue={search}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                navigate({ search: e.currentTarget.value });
              }
            }}
            onBlur={(e) => e.target.value !== search && navigate({ search: e.target.value })}
            placeholder="ค้นหาหลักสูตร... (Enter เพื่อค้นหา)"
            className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm text-9e-navy transition-colors hover:border-9e-brand focus:outline-none focus:ring-2 focus:ring-9e-action/20 dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-white"
          />
        </div>

        <select
          value={filterProgram}
          onChange={(e) => navigate({ filterProgram: e.target.value })}
          className="cursor-pointer rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy transition-colors hover:border-9e-brand focus:outline-none focus:ring-2 focus:ring-9e-action/20 dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-white"
        >
          <option value="">ทุกโปรแกรม</option>
          {programs.map((p) => {
            const id = String(p._id ?? p.program_id ?? '');
            const label = p.program_name ?? p.name ?? p.label ?? id;
            return (
              <option key={id} value={id}>{label}</option>
            );
          })}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => navigate({ filterStatus: e.target.value })}
          className="cursor-pointer rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy transition-colors hover:border-9e-brand focus:outline-none focus:ring-2 focus:ring-9e-action/20 dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-white"
        >
          <option value="">ทุกสถานะ</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">เดือน:</span>
          <select
            value={monthFrom}
            onChange={(e) => navigate({ monthFrom: e.target.value })}
            aria-label="เดือนเริ่มต้น"
            className="cursor-pointer rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy transition-colors hover:border-9e-brand focus:outline-none focus:ring-2 focus:ring-9e-action/20 dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-white"
          >
            {selectableMonthKeys.map((key) => (
              <option key={key} value={key}>
                {TH_MONTH_FMT.format(monthKeyToDate(key))}
              </option>
            ))}
          </select>
          <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">ถึง</span>
          <select
            value={monthTo}
            onChange={(e) => navigate({ monthTo: e.target.value })}
            aria-label="เดือนสุดท้าย"
            className="cursor-pointer rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy transition-colors hover:border-9e-brand focus:outline-none focus:ring-2 focus:ring-9e-action/20 dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-white"
          >
            {selectableMonthKeys.map((key) => (
              <option key={key} value={key} disabled={key < monthFrom}>
                {TH_MONTH_FMT.format(monthKeyToDate(key))}
              </option>
            ))}
          </select>
        </div>

        {(search || filterProgram || filterStatus || monthFrom !== defaultRange.from || monthTo !== defaultRange.to) && (
          <button
            type="button"
            onClick={() => navigate({ search: '', filterProgram: '', filterStatus: '', monthFrom: '', monthTo: '' })}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-9e-navy transition-colors hover:border-9e-brand dark:border-[#1e3a5f] dark:text-white"
          >
            ล้างตัวกรอง
          </button>
        )}

        <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {visibleCount} / {schedules.length} รอบ
        </span>
      </div>

      {/* ── Program groups ─────────────────────────────────────── */}
      {programGroups.length === 0 && (
        <div className="rounded-9e-lg border border-dashed border-[var(--surface-border)] py-10 text-center text-sm text-9e-slate-dp-50">
          ไม่พบหลักสูตรที่ตรงกับตัวกรอง
        </div>
      )}

      <div className="space-y-3">
        {programGroups.map((group) => (
          <ProgramGroup
            key={group.id}
            group={group}
            monthCols={monthCols}
            scheduleMap={scheduleMap}
            filterStatus={filterStatus}
            localBySchedId={localBySchedId}
            instructorById={instructorById}
            collapsed={Boolean(collapsed[group.id])}
            busyId={busyId}
            onToggle={() => toggleCollapse(group.id)}
            onAdd={(courseCode, mKey) => openCreate(courseCode, mKey)}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {modal && (
        <ScheduleModal
          mode={modal.mode}
          schedule={modal.schedule}
          courseCodeHint={modal.courseCode ?? null}
          monthKeyHint={modal.monthKeyHint ?? null}
          courses={courses}
          localBySchedId={localBySchedId}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

// ── ProgramGroup ──────────────────────────────────────────────────

function ProgramGroup({
  group,
  monthCols,
  scheduleMap,
  filterStatus,
  localBySchedId,
  instructorById,
  collapsed,
  busyId,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
}) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  // What `laneLayout` and `roundSpanIndices` speak: contiguous ascending
  // `YYYY-MM`. `adminScheduleMonthCols` already produces exactly that, so the
  // packing sees the same window the header row does — the two cannot drift.
  const monthKeys = monthCols.map((m) => m.key);
  return (
    <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 bg-9e-ice px-4 py-3 text-left hover:bg-9e-ice/80 dark:bg-[#0D1B2A] dark:hover:bg-[#0D1B2A]/80"
      >
        <Icon className="h-4 w-4 text-9e-slate-dp-50" aria-hidden="true" />
        {group.icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.icon} alt="" className="h-5 w-5 object-contain" />
        )}
        <span className="text-sm font-medium text-9e-navy dark:text-white">
          {group.name}
        </span>
        <span className="text-xs text-9e-slate-dp-50">
          ({group.courses.length} หลักสูตร)
        </span>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--surface-border)] bg-9e-ice/50 text-xs text-9e-slate-dp-50 dark:bg-[#0D1B2A]/60">
                <th className="w-28 px-3 py-2 text-left font-medium">รหัส</th>
                <th className="px-3 py-2 text-left font-medium">ชื่อหลักสูตร</th>
                <th className="w-12 px-2 py-2 text-center font-medium">วัน</th>
                <th className="w-24 px-2 py-2 text-right font-medium">ราคา</th>
                {monthCols.map((m) => (
                  <th
                    key={m.key}
                    className="w-36 px-2 py-2 text-center font-medium text-9e-action"
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            {/*
              NO `divide-y` any more. A course is now one or more LANE rows plus
              its own `+ รอบ` row, so a divider between every `<tr>` would draw a
              line THROUGH a course rather than between two of them. The bottom
              border moves onto the LAST row of each course instead — the same
              thing ScheduleClient does with `li === lanes.length - 1`.
            */}
            <tbody>
              {group.courses.map((course) => {
                const cid = String(course._id ?? '');
                // Lookup fallback chain: prefer the ObjectId because it's
                // globally unique, fall back to the human `course_id` code (the
                // second key we indexed in scheduleMap) so a bare-ObjectId-only
                // schedule still resolves when MSDB hasn't populated yet.
                const rounds = (
                  scheduleMap.get(cid) ??
                  scheduleMap.get(String(course.course_id ?? '')) ??
                  []
                ).filter((s) => !filterStatus || s.status === filterStatus);

                /*
                  ONE OR MORE LANES per course, packed like a Gantt chart by
                  lib/schedule/monthLanes — THE SAME packing the public table
                  uses, so the two surfaces cannot disagree about which months a
                  round occupies.

                  A round crossing months must SPAN them while a round inside one
                  month stays ALIGNED under it, and when those two overlap a
                  single <tr> cannot do both: there is nowhere to put a <td> at
                  พ.ย. in a row that already carries a colSpan=2 covering
                  ต.ค.+พ.ย. So the course row becomes lanes and the four course
                  columns rowSpan across them.
                */
                const lanes = laneLayout(rounds, monthKeys).lanes;

                /*
                  ── THE `+ รอบ` BUTTONS GET A LANE OF THEIR OWN, ALWAYS ───────
                  They used to sit inside each month cell, beneath that month's
                  rounds. A colSpan cell CONSUMES the columns it covers, so a
                  round crossing ต.ค.+พ.ย. would have swallowed BOTH months'
                  buttons — the change that fixes the label would have removed
                  the only way to add a round to either month.

                  A row of its own makes the guarantee absolute instead of
                  conditional: it is emitted for EVERY course, carries exactly
                  one <td> per month column, and no colSpan above it can ever
                  reach into it. Every month keeps its own reachable button
                  whatever the rounds are doing.
                */
                const rowCount = lanes.length + 1;

                return (
                  <Fragment key={course.course_id || cid}>
                    {lanes.map((lane, li) => (
                      <tr
                        key={`lane-${li}`}
                        className="hover:bg-9e-ice/30 dark:hover:bg-[#0D1B2A]/40"
                      >
                        {li === 0 && courseCells(course, rowCount, onAdd)}
                        {laneCells({
                          lane,
                          columnCount: monthCols.length,
                          localBySchedId,
                          instructorById,
                          busyId,
                          onEdit,
                          onDelete,
                        })}
                      </tr>
                    ))}

                    <tr className="border-b border-[var(--surface-border)] last:border-0 hover:bg-9e-ice/30 dark:hover:bg-[#0D1B2A]/40">
                      {/* A course with no visible round has no lane at all, so
                          the course columns ride on this row instead. */}
                      {lanes.length === 0 && courseCells(course, rowCount, onAdd)}
                      {monthCols.map((m) => (
                        <td
                          key={m.key}
                          className="border-l border-[var(--surface-border)] px-2 py-2 align-top text-center"
                        >
                          <button
                            type="button"
                            onClick={() => onAdd(course.course_id, m.key)}
                            className="w-full whitespace-nowrap rounded border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 hover:bg-green-100"
                          >
                            + รอบ
                          </button>
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── the four course columns ───────────────────────────────────────

/**
 * The course's own cells — code, name, days, price — rendered ONCE and spanning
 * every row the course occupies.
 *
 * They belong to the COURSE, not to a lane, so they are emitted on the first
 * row and `rowSpan` across the rest. `rowSpan` is omitted rather than set to 1
 * when the course has only its `+ รอบ` row: React emits `rowspan="1"`, a no-op
 * that would change the markup of every single-row course on the page.
 *
 * `align-top` so the course name lines up with the FIRST lane rather than
 * floating in the middle of a tall multi-lane course.
 */
function courseCells(course, rowCount, onAdd) {
  const rowSpan = rowCount > 1 ? rowCount : undefined;
  return [
    <td
      key="code"
      rowSpan={rowSpan}
      className="px-3 py-3 align-top font-mono text-[11px] text-9e-slate-dp-50"
    >
      {course.course_id}
    </td>,
    <td
      key="name"
      rowSpan={rowSpan}
      className="px-3 py-3 align-top text-9e-navy dark:text-white"
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 max-w-[260px] truncate">
          {course.course_name_th || course.course_name}
        </span>
        {/* Inline shortcut: open the modal with this course pre-filled. No
            month hint — admin picks dates in the calendar grid themselves. */}
        <button
          type="button"
          onClick={() => onAdd(course.course_id, null)}
          className="shrink-0 whitespace-nowrap rounded-full border border-green-400 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 hover:bg-green-100"
        >
          + รอบ
        </button>
      </div>
    </td>,
    <td
      key="days"
      rowSpan={rowSpan}
      className="px-2 py-3 align-top text-center text-xs text-9e-slate-dp-50"
    >
      {course.course_trainingdays || '—'}
    </td>,
    <td
      key="price"
      rowSpan={rowSpan}
      className="px-2 py-3 align-top text-right text-xs text-9e-slate-dp-50"
    >
      {Number.isFinite(Number(course.course_price))
        ? Number(course.course_price).toLocaleString()
        : '—'}
    </td>,
  ];
}

// ── one lane's month cells ────────────────────────────────────────

/**
 * One lane's `<td>`s, walked left to right across every month column.
 *
 * ── WHY IT WALKS COLUMNS RATHER THAN MAPPING CELLS ──────────────────────────
 * A `colSpan` cell CONSUMES the columns it covers, so the columns a lane emits
 * and the cells it holds are not the same list. `lane.map(...)` would emit one
 * `<td>` per cell and leave every gap unfilled, shearing the row left. The
 * cursor is the whole mechanism: it advances past a spanned cell and emits an
 * empty `<td>` for anything the lane does not cover.
 *
 * THE TOTAL COLSPAN OF THE RETURNED CELLS IS EXACTLY `columnCount`. An
 * off-by-one here shears the grid — every month column after the mistake shows
 * the wrong month's rounds — and no visual check catches it reliably, so a
 * render test asserts the arithmetic directly.
 *
 * ── AND WHY THE GAP IS BLANK RATHER THAN AN EM-DASH ─────────────────────────
 * The public table's empty first-lane cell renders `—` for "no round this
 * month". Here it must not: every month on this grid already carries a `+ รอบ`
 * button one row below, which says "nothing here, add one" more usefully than a
 * dash and without competing with it for the reader's attention.
 */
function laneCells({
  lane,
  columnCount,
  localBySchedId,
  instructorById,
  busyId,
  onEdit,
  onDelete,
}) {
  const out = [];
  let col = 0;

  const gap = (key) => (
    <td
      key={key}
      className="border-l border-[var(--surface-border)] px-2 py-2 align-top text-center"
    />
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
        className="border-l border-[var(--surface-border)] px-2 py-2 align-top text-center"
      >
        <div className="flex flex-col items-stretch gap-1.5">
          {cell.rounds.map((s) => (
            <ScheduleCell
              key={s._id}
              schedule={s}
              local={localBySchedId.get(String(s._id))}
              instructorById={instructorById}
              busy={busyId === s._id}
              onEdit={() => onEdit(s)}
              onDelete={() => onDelete(s._id)}
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
 * `← ต่อจาก ส.ค.` / `ต่อ ม.ค. →` — a round that continues outside the selected
 * month range.
 *
 * A round whose real span reaches past the visible columns is still SHOWN, in
 * whatever space is visible, and its label is not shortened: `formatRoundDays`
 * prints every day of the round including the days in the invisible month. What
 * would otherwise be missing is any sign that the cell is a fragment — and on
 * THIS screen that matters more than on the public one, because an admin
 * reading a fragment as the whole round would widen the from/to range looking
 * for a round that is already on screen. Same wording and same treatment as
 * ScheduleClient's note, deliberately.
 */
function ContinuationNote({ cell }) {
  if (!cell.clippedBefore && !cell.clippedAfter) return null;
  return (
    <span className="text-[10px] leading-none text-9e-slate-dp-50">
      {cell.clippedBefore ? `← ต่อจาก ${monthLabel(cell.beforeKey)}` : null}
      {cell.clippedBefore && cell.clippedAfter ? ' ' : null}
      {cell.clippedAfter ? `ต่อ ${monthLabel(cell.afterKey)} →` : null}
    </span>
  );
}

// ── ScheduleCell ──────────────────────────────────────────────────

function ScheduleCell({
  schedule,
  local,
  instructorById,
  busy,
  onEdit,
  onDelete,
}) {
  /**
   * ── THE LABEL COMES FROM THE SHARED FORMATTER. IT USED TO BE A SIXTH ONE ───
   *
   * What stood here was `${days[0]}-${days[days.length - 1]}` — first date to
   * last date, with no check that the days between exist. It is the SAME defect
   * lib/schedule/roundDateLabel was written to remove from five public
   * formatters, and on this screen it was actively misreporting stored data:
   *
   *   dates 16 and 18 ก.ย. → rendered `16-18`, advertising a 17th that is not
   *                          in the round;
   *   dates 30 ต.ค. and 2 พ.ย. → rendered `30-2`, a range that does not exist
   *                          in any month.
   *
   * `formatRoundDays` collapses maximal CONSECUTIVE runs to their endpoints and
   * LISTS everything else, so those become `16, 18` and `30 ต.ค. - 2 พ.ย.`.
   * No day is ever dropped and no day is ever invented.
   *
   * Called with neither `showMonth` nor `showYear`, exactly as the public
   * table calls it: every column header here carries its own month AND its
   * Buddhist year (`TH_MONTH_FMT`), so a single-month round needs neither. A
   * round that CROSSES a month prints its months regardless of `showMonth` —
   * that rule lives in the formatter, and it is what makes the spanning cell
   * next to it readable.
   */
  const dateLabel = formatRoundDays(schedule.dates);

  /**
   * The dot AND the border are the DELIVERY TYPE, from the one shared palette;
   * the status is the word underneath. Same anatomy as /schedule's round box.
   *
   * Inline `style`, never `border-[${color}]`: Tailwind scans source text and
   * never evaluates it, so a template literal in a class name compiles to no
   * class at all and fails SILENTLY as an unbordered box.
   */
  const color = trainingTypeColor(schedule.type);

  /**
   * `.state`, NOT `.action` — and this is the one place this surface departs
   * from ScheduleClient's cell on purpose.
   *
   * lib/scheduleStatus splits the two fields precisely so each surface names
   * the one it means: `state` is what the round IS, `action` is what a VISITOR
   * can do about it. The public cell is a registration link, so it carries the
   * action ('ลงทะเบียน' for an open round). This cell is a management control
   * — nobody registers from /admin/schedules — so an imperative to register
   * would be wrong here in exactly the way that module's docstring describes.
   * `state` gives 'เปิดรับ' / 'ใกล้เต็ม' / 'เต็ม', which is the fact an admin
   * is reading. The colours are the shared ones either way.
   */
  const statusStyle = resolveScheduleBadge(schedule.status);

  /**
   * A full round is not registerable, and the public ruling is that its
   * non-editable affordances show `cursor-not-allowed`. Read off
   * `resolveScheduleBadge().status` rather than `schedule.status === 'full'` so
   * the alias spellings that module normalises are covered too.
   *
   * แก้ไข AND ลบ ARE EXEMPT, and that exemption is the point: an admin must be
   * able to edit and delete a sold-out round — it is the round most likely to
   * need its seat count or status corrected. So the cursor rule sits on the BOX
   * and both buttons re-assert `cursor-pointer` over it.
   */
  const isFull = statusStyle?.status === 'full';

  const teacherNames =
    (local?.instructor_ids ?? [])
      .map((id) => instructorById.get(String(id))?.name)
      .filter(Boolean);

  return (
    <div
      className={
        'flex flex-col items-center gap-0.5 rounded-9e-md border bg-white px-2 py-1 text-xs shadow-sm dark:bg-[#0D1B2A]' +
        (isFull ? ' cursor-not-allowed' : '')
      }
      style={{ borderColor: color }}
    >
      <div className="flex items-center justify-center gap-1.5">
        <span
          className="inline-block h-2 w-2 flex-none rounded-full"
          style={{ backgroundColor: color }}
          title={TYPE_LABEL[schedule.type] ?? TYPE_LABEL.classroom}
        />
        <span className="font-bold leading-none text-9e-navy dark:text-white">
          {dateLabel}
        </span>
      </div>
      {/* Omitted entirely when the status is missing/blank, as on /schedule. */}
      {statusStyle && (
        <div className={`text-[10px] font-bold leading-none ${statusStyle.text}`}>
          {statusStyle.state}
        </div>
      )}
      {local?.max_seats != null && (
        <div className="text-[10px] text-9e-slate-dp-50">
          {local.max_seats} ที่
        </div>
      )}
      {local?.price_override != null && (
        <div className="text-[10px] font-medium text-9e-action">
          ฿{Number(local.price_override).toLocaleString('th-TH')}
        </div>
      )}
      {teacherNames.length > 0 && (
        <div
          className="max-w-full truncate text-[10px] text-9e-slate-dp-50"
          title={teacherNames.join(', ')}
        >
          {teacherNames[0]}
          {teacherNames.length > 1 ? ` +${teacherNames.length - 1}` : ''}
        </div>
      )}
      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={onEdit}
          className="cursor-pointer text-[10px] text-9e-action hover:underline"
        >
          แก้ไข
        </button>
        <span className="text-9e-slate-dp-50">·</span>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="cursor-pointer text-[10px] text-red-500 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '…' : 'ลบ'}
        </button>
      </div>
    </div>
  );
}

// ── ScheduleModal ─────────────────────────────────────────────────

const DOW_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

/**
 * `'2026-12'` → `'ธันวาคม 2569'`. Buddhist era comes from `th-TH` natively —
 * nothing here adds 543 by hand, the same rule the rest of the schedule code
 * follows.
 *
 * `daysInMonth` used to live here; it moved to editorCalendarRange.js as
 * `daysOfMonth`, keyed by `YYYY-MM` like everything else the picker passes
 * around, so the month vocabulary has one spelling instead of two.
 */
function monthTitleTh(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key ?? ''));
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('th-TH', {
    month: 'long',
    year: 'numeric',
  });
}

function ScheduleModal({
  mode,
  schedule,
  courseCodeHint,
  monthKeyHint,
  courses,
  // `instructors` was a prop here, for the วิทยากร checkbox list. That list is
  // gone, so the modal no longer needs the roster — but the GRID still does
  // (ScheduleCell renders the teacher names of rounds that have one), so the
  // page still fetches it and SchedulesAdminClient still builds `instructorById`
  // from it. Only the modal's copy of the prop was dropped.
  localBySchedId,
  onClose,
  onSaved,
}) {
  const isEdit = mode === 'edit';
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  // Course
  const startingCourseCode = (() => {
    if (isEdit) {
      const c = schedule?.course;
      if (typeof c === 'object' && c?.course_id) return String(c.course_id);
    }
    return courseCodeHint || '';
  })();
  const [courseCode, setCourseCode] = useState(startingCourseCode);
  const [courseSearch, setCourseSearch] = useState('');

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    if (!q) return courses.slice(0, 25);
    return courses
      .filter(
        (c) =>
          (c.course_id || '').toLowerCase().includes(q) ||
          (c.course_name || '').toLowerCase().includes(q) ||
          (c.course_name_th || '').toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [courses, courseSearch]);

  const pickedCourse = courses.find((c) => c.course_id === courseCode);

  // Dates
  const [selectedDates, setSelectedDates] = useState(() => {
    if (isEdit && Array.isArray(schedule?.dates)) {
      return schedule.dates.map(toLocalIso).filter(Boolean).sort();
    }
    return [];
  });

  // The dates AS STORED, captured once at mount. The navigable range is
  // derived from these rather than from live `selectedDates`, so that
  // deselecting a far-out day cannot shrink the range under the user's
  // cursor while they are still editing.
  const [storedDates] = useState(selectedDates);

  // Calendar range — src/lib/schedule/editorCalendarRange.js.
  //
  // THE RANGE NEVER TOUCHES THE GRID. `ADMIN_SCHEDULE_MONTHS` and
  // `adminScheduleMonthCols` are imported at the top of this FILE for the
  // admin table's month columns, and they must not reach this picker:
  // what a user is allowed to PICK is not bounded by what the table can
  // DISPLAY. Coupling the two is how a round became uneditable in the
  // first place, and doing it from the other end would be the same bug.
  //
  // The opposite question — "will this round actually appear in the
  // table?" — is genuinely about the grid, and is asked exactly once, at
  // save time, by `gridWindowDays` below. That one calls the grid helper
  // directly and deliberately, and it checks BOTH ends of the window.
  //
  // The range is derived from the DATA BEING EDITED, not from the clock
  // alone. That invariant is the fix; the ±1/±2 year defaults inside the
  // module are only ergonomics.
  const calendarRange = useMemo(
    () => rangeFor({ selectedDates: storedDates }),
    [storedDates]
  );

  const [monthCursor, setMonthCursor] = useState(() =>
    openingMonth({
      isEdit,
      selectedDates: storedDates,
      monthKeyHint,
      range: calendarRange,
    })
  );

  const visibleMonths = visibleMonthsFrom(monthCursor, calendarRange);
  const { canPrev, canNext } = arrowState(monthCursor, calendarRange);

  const todayIso = toLocalIso(new Date());

  // The out-of-window confirm step. Null = not asking. Set by handleSubmit,
  // cleared whenever the dates change, so an admin who goes back and fixes the
  // stray day is not still looking at a warning about it.
  const [pendingWarning, setPendingWarning] = useState(null);

  function toggleDate(iso) {
    setPendingWarning(null);
    setSelectedDates((cur) =>
      cur.includes(iso) ? cur.filter((d) => d !== iso) : [...cur, iso].sort()
    );
  }

  // Status / type / signup
  const [status, setStatus]       = useState(schedule?.status ?? 'open');
  const [type, setType]           = useState(schedule?.type ?? 'classroom');
  const [signupUrl, setSignupUrl] = useState(schedule?.signup_url ?? '');

  // Local sidecar
  const existingLocal = isEdit
    ? localBySchedId.get(String(schedule?._id)) ?? null
    : null;
  /*
   * ── จำนวนที่นั่ง (max_seats) AND วิทยากร (instructor_ids) NO LONGER HAVE
   *    INPUTS HERE. THE DATA IS DELIBERATELY KEPT. ──────────────────────────
   *
   * Both inputs were removed from the "ข้อมูลเฉพาะ Genesis" block below because
   * nothing in Genesis consumes either value today beyond the admin grid cell
   * that displays it. NOTHING ELSE WAS REMOVED WITH THEM:
   *
   *   · the schema still declares both (models/ScheduleLocal.js) — do NOT drop
   *     the columns;
   *   · the stored values are untouched — 5 rows carry a `max_seats` and 4
   *     carry an `instructor_ids` roster as of this change;
   *   · the grid still RENDERS both, so the data stays visible even though it
   *     is no longer editable from this modal.
   *
   * `max_seats` in particular is expected BACK: it is wanted for in-house
   * quotation requests. This is a UI removal precisely so that restoring it is
   * re-adding an input, not recovering data from a backup.
   *
   * The save path is what makes that safe. `sidecarSetFields`
   * (lib/schedule/scheduleLocalFields) writes ONLY the keys the form sends, so
   * an absent input leaves the stored value alone rather than nulling it — read
   * that module before adding, removing or renaming anything in this block.
   *
   * `price_override` KEEPS its input: unlike the other two it has live public
   * readers (the registration wizard's per-round price) and it decides the
   * amount charged through Omise (lib/registration/resolve-price.js).
   */
  const [priceOverride, setPriceOverride] = useState(
    existingLocal?.price_override != null ? String(existingLocal.price_override) : ''
  );

  const datesPretty = selectedDates
    .map((d) =>
      new Date(d + 'T00:00:00').toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
      })
    )
    .join(', ');

  /**
   * The admin table's MAXIMUM SELECTABLE window, as two ISO days — not the
   * currently rendered columns.
   *
   * THIS CHANGED IN THE ROUND THAT MADE THE TABLE'S RANGE ADJUSTABLE. Before
   * that, "the table's window" and "the table's reach" were the same fixed
   * 12 months, so classifying against the rendered columns and against the
   * outer boundary gave the same answer. Once an admin can move the from/to
   * dropdowns, they stop agreeing: a date outside TODAY'S chosen months but
   * inside `adminScheduleSelectableRange()` is not a problem, because the
   * admin can widen the dropdowns and see it. Only a date outside the outer
   * boundary is genuinely unreachable — no dropdown selection could ever
   * show it — which is the only case worth warning about here.
   *
   * This is still the one place in the modal allowed to ask the grid
   * anything, because it IS a question about the grid: "could this round
   * ever appear in the table after I save it?" The picker's range
   * deliberately knows nothing about the admin table — see `calendarRange`
   * above — but reachability in the table is exactly what the horizon
   * module decides.
   *
   * BOTH ENDS, not just the last column. The first version of this checked
   * only `> lastDay`, and the unguarded backward direction is what let a
   * stray click on 2025-09-23 remove a 30 Oct / 2 Nov round from the table
   * with no way to reopen it. See src/lib/schedule/gridWindowWarning.js.
   */
  function gridWindowDays() {
    return adminScheduleSelectableWindowDays();
  }

  function submitNow() {
    const fd = new FormData();
    fd.set('course_id',   courseCode);
    fd.set('dates_json',  JSON.stringify(selectedDates));
    fd.set('status',      status);
    fd.set('type',        type);
    fd.set('signup_url',  signupUrl);
    /*
     * `max_seats` and `instructor_ids` are NOT SET AT ALL — not '', not 0, not
     * an empty append. Their inputs are gone (see the note by `priceOverride`'s
     * state), and the sidecar writer treats an absent key as "leave the stored
     * value alone". Setting them to anything here, including a blank, would
     * erase the five seat counts and four rosters currently stored.
     *
     * `price_override` IS set unconditionally, blank included, and that is the
     * other half of the same rule: its input is still on screen, so the form is
     * authoritative for it and an admin clearing the box must be able to reset
     * the round to the course's normal price. Sending the key with '' is how
     * that reaches `toNullableNum` as null. The old `!== ''` guard meant a
     * cleared price silently kept the old override once the writer stopped
     * clobbering.
     */
    fd.set('price_override', priceOverride);
    if (isEdit) fd.set('schedule_id', schedule._id);

    startTransition(async () => {
      const res = isEdit
        ? await updateSchedule(fd)
        : await createSchedule(fd);
      if (res?.ok) onSaved();
      else setError(res?.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!courseCode) {
      setError('กรุณาเลือกหลักสูตร');
      return;
    }
    if (selectedDates.length === 0) {
      setError('กรุณาเลือกอย่างน้อย 1 วัน');
      return;
    }

    // WARN ONLY. The dates are never altered and the save is never blocked —
    // the confirm step below only decides whether the admin has SEEN this.
    // `warning` is null when there is nothing to say, so it is its own
    // condition rather than a second derivation of one.
    const warning = warningTextTh(
      classifyAgainstWindow(selectedDates, gridWindowDays()),
      ADMIN_SCHEDULE_SELECTABLE_MONTHS_TOTAL
    );
    if (warning) {
      setPendingWarning(warning);
      return;
    }

    submitNow();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-9e-lg bg-white shadow-xl dark:bg-[#111d2c]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--surface-border)] bg-white px-5 py-4 dark:bg-[#111d2c]">
          <h2 className="text-lg font-bold text-9e-navy dark:text-white">
            {isEdit ? 'แก้ไขตารางอบรม' : 'เพิ่มตารางอบรม'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="text-9e-slate-dp-50 hover:text-9e-navy"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-5 overflow-y-auto px-5 py-4"
        >
          {error && (
            <div className="rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Course picker */}
          <div>
            <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">
              หลักสูตร *
            </label>
            {pickedCourse ? (
              <div className="flex items-center gap-2 rounded-9e-md border border-9e-action bg-9e-ice px-3 py-2 dark:bg-[#0D1B2A]">
                <span className="font-mono text-xs text-9e-action">
                  {pickedCourse.course_id}
                </span>
                <span className="flex-1 truncate text-sm text-9e-navy dark:text-white">
                  {pickedCourse.course_name_th || pickedCourse.course_name}
                </span>
                {!isEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setCourseCode('');
                      setCourseSearch('');
                    }}
                    className="text-xs text-9e-slate-dp-50 hover:text-9e-navy"
                  >
                    เปลี่ยน
                  </button>
                )}
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  placeholder="พิมพ์ชื่อหรือรหัสหลักสูตร..."
                  className={inputCls}
                />
                <ul className="mt-1 max-h-44 overflow-auto rounded-9e-md border border-[var(--surface-border)] bg-white dark:bg-[#0D1B2A]">
                  {filteredCourses.map((c) => (
                    <li key={c.course_id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCourseCode(c.course_id);
                          setCourseSearch('');
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-9e-ice dark:hover:bg-[#111d2c]"
                      >
                        <span className="w-28 shrink-0 truncate font-mono text-9e-action">
                          {c.course_id}
                        </span>
                        <span className="truncate text-9e-navy dark:text-white">
                          {c.course_name_th || c.course_name}
                        </span>
                      </button>
                    </li>
                  ))}
                  {filteredCourses.length === 0 && (
                    <li className="px-3 py-3 text-center text-xs text-9e-slate-dp-50">
                      ไม่พบหลักสูตร
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>

          {/* Multi-month calendar */}
          <div>
            <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">
              วันที่อบรม *
              {selectedDates.length > 0 && (
                <span className="ml-2 text-xs font-normal text-9e-action">
                  เลือกแล้ว {selectedDates.length} วัน
                  {datesPretty ? ` · ${datesPretty}` : ''}
                </span>
              )}
            </label>
            <div className="rounded-9e-md border border-[var(--surface-border)] bg-9e-ice/50 p-3 dark:bg-[#0D1B2A]/60">
              {/* One row: ‹ | month | month | ›. The arrows step ONE month,
                  so a round spanning a month boundary (30 ต.ค. + 2 พ.ย.) has
                  both of its months on screen at once and needs no
                  navigation at all to select. */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setMonthCursor((c) => stepMonth(c, -1, calendarRange))
                  }
                  disabled={!canPrev}
                  aria-label="เดือนก่อนหน้า"
                  className="rounded-9e-sm p-1 text-9e-navy transition-colors hover:bg-9e-action/10 disabled:cursor-not-allowed disabled:opacity-30 dark:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="grid flex-1 grid-cols-2 gap-3">
                  {visibleMonths.map((key) => (
                    <p
                      key={`label-${key}`}
                      className="text-center text-xs font-medium text-9e-slate-dp-50 dark:text-[#94a3b8]"
                    >
                      {monthTitleTh(key)}
                    </p>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setMonthCursor((c) => stepMonth(c, 1, calendarRange))
                  }
                  disabled={!canNext}
                  aria-label="เดือนถัดไป"
                  className="rounded-9e-sm p-1 text-9e-navy transition-colors hover:bg-9e-action/10 disabled:cursor-not-allowed disabled:opacity-30 dark:text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {visibleMonths.map((key) => {
                  const days = daysOfMonth(key);
                  const firstDow = days.length ? days[0].getDay() : 0;
                  return (
                    <div key={key}>
                      <div className="grid grid-cols-7 gap-0.5 text-center">
                        {DOW_TH.map((d) => (
                          <div
                            key={`${key}-${d}`}
                            className="py-1 text-[10px] text-9e-slate-dp-50"
                          >
                            {d}
                          </div>
                        ))}
                        {Array.from({ length: firstDow }).map((_, i) => (
                          <div key={`${key}-pad-${i}`} />
                        ))}
                        {days.map((d) => {
                          const iso = toLocalIso(d);
                          const selected = selectedDates.includes(iso);
                          const isToday = iso === todayIso;
                          // Past days stay CLICKABLE — backdating a round is
                          // intended — but render dimmed so it is visible that
                          // they are in the past. Deliberately NOT `disabled`.
                          const isPast = iso < todayIso;
                          return (
                            <button
                              key={iso}
                              type="button"
                              onClick={() => toggleDate(iso)}
                              className={
                                'mx-auto h-8 w-8 rounded-full text-xs font-medium transition-colors ' +
                                (selected
                                  ? 'bg-9e-action text-white'
                                  : 'text-9e-navy hover:bg-9e-action/10 dark:text-white') +
                                (isPast && !selected ? ' opacity-40' : '') +
                                (isToday && !selected
                                  ? ' ring-1 ring-9e-action'
                                  : '')
                              }
                            >
                              {d.getDate()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Status / Type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">
              สถานะ
            </label>
            <ButtonGroup
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">
              รูปแบบ
            </label>
            <ButtonGroup
              options={TYPE_OPTIONS}
              value={type}
              onChange={setType}
            />
          </div>

          {/* Signup URL — admin doesn't pick this on create; the server
              action auto-fills based on NEXT_PUBLIC_SITE_URL + course
              slug + the assigned schedule _id. On edit we show the
              current value so it can be tweaked if needed. */}
          <div>
            <label className="text-sm font-medium text-9e-navy dark:text-white">
              Signup URL
            </label>
            {isEdit ? (
              <input
                type="url"
                value={signupUrl}
                onChange={(e) => setSignupUrl(e.target.value)}
                placeholder="https://…"
                className={inputCls + ' font-mono text-xs'}
              />
            ) : (
              <div className="mt-1 rounded-9e-md border border-green-200 bg-green-50 px-3 py-2">
                <p className="text-xs text-green-700">
                  ระบบจะสร้าง URL สมัครอัตโนมัติหลังบันทึก
                </p>
                <p className="mt-1 font-mono text-[11px] text-9e-slate-dp-50">
                  /registration/public?course=&lt;course-id&gt;&amp;class=&lt;schedule-id&gt;
                </p>
              </div>
            )}
          </div>

          {/* Local sidecar */}
          <div className="rounded-9e-md border border-dashed border-[var(--surface-border)] p-3">
            <p className="mb-2 text-xs font-semibold text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ข้อมูลเฉพาะ Genesis (ไม่ส่งไป MSDB)
            </p>
            {/*
              จำนวนที่นั่ง (max_seats) and วิทยากร (instructor_ids) were the
              other two inputs in this block. They are REMOVED FROM THE UI ONLY
              — the schema keeps both fields, the stored rows keep their values,
              and no migration was written. `max_seats` is expected to return
              for in-house quotation requests. The full note, including why an
              omitted key can no longer overwrite stored data, is at the
              `priceOverride` state declaration above.

              Now a single column: two of the three cells are gone, and
              `md:grid-cols-2` would strand the price at half width with nothing
              beside it.
            */}
            <div className="grid gap-3">
              <label className="block">
                <span className="text-sm font-medium text-9e-navy dark:text-white">
                  ราคาต่อท่าน (บาท, ต่อรอบ)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={priceOverride}
                  onChange={(e) => setPriceOverride(e.target.value)}
                  placeholder="เว้นว่าง = ใช้ราคาปกติของหลักสูตร"
                  className={inputCls}
                />
                <span className="mt-1 block text-xs text-9e-slate-dp-50">
                  เว้นว่าง = ใช้ราคาปกติของหลักสูตร
                </span>
              </label>
            </div>
          </div>
        </form>

        {/* Out-of-window confirm step. In-modal rather than window.confirm so
            the offending dates can actually be LISTED and so the severe case
            (the round disappears from the table) can be styled as such. It
            never blocks: บันทึกต่อ saves exactly what was picked. */}
        {pendingWarning && (
          <div
            role="alertdialog"
            aria-label={pendingWarning.title}
            className={
              'border-t px-5 py-4 ' +
              (pendingWarning.severe
                ? 'border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40'
                : 'border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40')
            }
          >
            <p
              className={
                'text-sm font-bold ' +
                (pendingWarning.severe
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-amber-800 dark:text-amber-300')
              }
            >
              {pendingWarning.title}
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-9e-navy dark:text-[#cbd5e1]">
              {pendingWarning.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-medium text-9e-navy dark:text-white">
              วันที่อยู่นอกช่วง: {pendingWarning.dates.join(', ')}
            </p>
          </div>
        )}

        {/* Footer (sticky) */}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--surface-border)] bg-white px-5 py-3 dark:bg-[#111d2c]">
          {pendingWarning ? (
            <>
              <button
                type="button"
                onClick={() => setPendingWarning(null)}
                className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
              >
                กลับไปแก้ไขวันที่
              </button>
              <button
                type="button"
                onClick={submitNow}
                disabled={pending}
                className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
              >
                {pending ? 'กำลังบันทึก…' : 'บันทึกต่อ'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending || !courseCode}
                className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
              >
                {pending ? 'กำลังบันทึก…' : isEdit ? 'บันทึก' : 'สร้างตารางอบรม'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ButtonGroup({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            'rounded-9e-md border px-3 py-1.5 text-xs transition-colors ' +
            (value === o.value
              ? 'border-9e-action bg-9e-action text-white'
              : 'border-[var(--surface-border)] bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';
