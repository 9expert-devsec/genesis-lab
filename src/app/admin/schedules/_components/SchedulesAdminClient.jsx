'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';
import {
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '@/lib/actions/schedules';

// ── constants ──────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Open' },
  { value: 'nearly_full', label: 'Nearly Full' },
  { value: 'full',        label: 'Full' },
];
const STATUS_DOT = {
  open:        'bg-green-500',
  nearly_full: 'bg-amber-500',
  full:        'bg-red-500',
};

const TYPE_OPTIONS = [
  { value: 'classroom', label: 'Classroom' },
  { value: 'hybrid',    label: 'Hybrid' },
];

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
/** `YYYY-MM` key derived from a date-ish input (local). */
function monthKey(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── main component ─────────────────────────────────────────────────

export function SchedulesAdminClient({
  schedules,
  courses,
  programs = [],
  scheduleLocals = [],
  instructors = [],
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [, startTransition] = useTransition();

  // filters
  const [search, setSearch]               = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [collapsed, setCollapsed]         = useState({});
  const [modal, setModal]                 = useState(null);

  // ── 4-month column headers ─────────────────────────────────────
  const monthCols = useMemo(() => {
    const cols = [];
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      cols.push({
        key: monthKey(d),
        label: TH_MONTH_FMT.format(d),
        year: d.getFullYear(),
        month: d.getMonth(),
      });
    }
    return cols;
  }, []);

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

  /** course `_id` → { 'YYYY-MM': [schedule, …] } */
  const scheduleMap = useMemo(() => {
    const map = new Map();
    for (const s of schedules) {
      const cid = String(
        (typeof s.course === 'object' ? s.course?._id : s.course) ?? ''
      );
      if (!cid) continue;
      const first = s.dates?.[0];
      const key = monthKey(first);
      if (!key) continue;
      if (!map.has(cid)) map.set(cid, {});
      const bucket = map.get(cid);
      if (!bucket[key]) bucket[key] = [];
      bucket[key].push(s);
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

    return [...groups.values()].sort((a, b) => {
      if (a.id === '__none__') return 1;
      if (b.id === '__none__') return -1;
      return a.name.localeCompare(b.name, 'th');
    });
  }, [courses, search, filterProgram]);

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
            แสดง 4 เดือนข้างหน้า — max_seats และวิทยากรเก็บใน Genesis
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

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-9e-slate-dp-50"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาหลักสูตร..."
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white pl-8 pr-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          />
        </div>

        <select
          value={filterProgram}
          onChange={(e) => setFilterProgram(e.target.value)}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
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
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        >
          <option value="">ทุกสถานะ</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

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
          initialCourseCode={modal.courseCode ?? null}
          initialMonthKey={modal.monthKeyHint ?? null}
          courses={courses}
          instructors={instructors}
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
            <tbody className="divide-y divide-[var(--surface-border)]">
              {group.courses.map((course) => {
                const cid = String(course._id ?? '');
                const buckets = scheduleMap.get(cid) ?? {};
                return (
                  <tr
                    key={course.course_id || cid}
                    className="hover:bg-9e-ice/30 dark:hover:bg-[#0D1B2A]/40"
                  >
                    <td className="px-3 py-3 font-mono text-[11px] text-9e-slate-dp-50">
                      {course.course_id}
                    </td>
                    <td className="px-3 py-3 text-9e-navy dark:text-white">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 max-w-[260px] truncate">
                          {course.course_name_th || course.course_name}
                        </span>
                        {/* Inline shortcut: open the modal with this course
                            pre-filled. No month hint — admin picks dates
                            in the calendar grid themselves. */}
                        <button
                          type="button"
                          onClick={() => onAdd(course.course_id, null)}
                          className="shrink-0 whitespace-nowrap rounded-full border border-green-400 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 hover:bg-green-100"
                        >
                          + รอบ
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center text-xs text-9e-slate-dp-50">
                      {course.course_trainingdays || '—'}
                    </td>
                    <td className="px-2 py-3 text-right text-xs text-9e-slate-dp-50">
                      {Number.isFinite(Number(course.course_price))
                        ? Number(course.course_price).toLocaleString()
                        : '—'}
                    </td>

                    {monthCols.map((m) => {
                      const cellSchedules = (buckets[m.key] ?? []).filter(
                        (s) => !filterStatus || s.status === filterStatus
                      );
                      return (
                        <td
                          key={m.key}
                          className="border-l border-[var(--surface-border)] px-2 py-2 align-top text-center"
                        >
                          <div className="flex flex-col items-stretch gap-1.5">
                            {cellSchedules.map((s) => (
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
                            <button
                              type="button"
                              onClick={() => onAdd(course.course_id, m.key)}
                              className="whitespace-nowrap rounded border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 hover:bg-green-100"
                            >
                              + รอบ
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
  // Day-of-month range — same convention as MSDB admin (e.g. "11-12").
  const days = [...(schedule.dates ?? [])]
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b)
    .map((d) => d.getDate());

  const dateLabel =
    days.length === 0
      ? '—'
      : days.length === 1
        ? String(days[0])
        : `${days[0]}-${days[days.length - 1]}`;

  const teacherNames =
    (local?.instructor_ids ?? [])
      .map((id) => instructorById.get(String(id))?.name)
      .filter(Boolean);

  return (
    <div className="rounded-9e-md border border-[var(--surface-border)] bg-white px-2 py-1 text-xs shadow-sm dark:bg-[#0D1B2A]">
      <div className="flex items-center justify-center gap-1.5">
        <span
          className={
            'inline-block h-1.5 w-1.5 rounded-full ' +
            (STATUS_DOT[schedule.status] ?? 'bg-gray-400')
          }
          aria-label={schedule.status}
        />
        <span className="font-medium text-9e-navy dark:text-white">
          {dateLabel}
        </span>
      </div>
      {local?.max_seats != null && (
        <div className="mt-0.5 text-[10px] text-9e-slate-dp-50">
          {local.max_seats} ที่
        </div>
      )}
      {teacherNames.length > 0 && (
        <div
          className="mt-0.5 truncate text-[10px] text-9e-slate-dp-50"
          title={teacherNames.join(', ')}
        >
          {teacherNames[0]}
          {teacherNames.length > 1 ? ` +${teacherNames.length - 1}` : ''}
        </div>
      )}
      <div className="mt-1 flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={onEdit}
          className="text-[10px] text-9e-action hover:underline"
        >
          แก้ไข
        </button>
        <span className="text-9e-slate-dp-50">·</span>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="text-[10px] text-red-500 hover:underline disabled:opacity-50"
        >
          {busy ? '…' : 'ลบ'}
        </button>
      </div>
    </div>
  );
}

// ── ScheduleModal ─────────────────────────────────────────────────

const DOW_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function daysInMonth(year, month) {
  const days = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function ScheduleModal({
  mode,
  schedule,
  initialCourseCode,
  initialMonthKey,
  courses,
  instructors,
  localBySchedId,
  onClose,
  onSaved,
}) {
  const isEdit = mode === 'edit';
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  // Course
  const initialCode = (() => {
    if (isEdit) {
      const c = schedule?.course;
      if (typeof c === 'object' && c?.course_id) return String(c.course_id);
    }
    return initialCourseCode || '';
  })();
  const [courseCode, setCourseCode] = useState(initialCode);
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

  // Calendar window — start at the hinted month (or current month).
  const calendarMonths = useMemo(() => {
    const start = initialMonthKey
      ? new Date(`${initialMonthKey}-01T00:00:00`)
      : new Date();
    if (Number.isNaN(start.getTime())) return [];
    const months = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return months;
  }, [initialMonthKey]);

  const todayIso = toLocalIso(new Date());

  function toggleDate(iso) {
    setSelectedDates((cur) =>
      cur.includes(iso) ? cur.filter((d) => d !== iso) : [...cur, iso].sort()
    );
  }

  // Status / type / signup
  const [status, setStatus]       = useState(schedule?.status ?? 'open');
  const [type, setType]           = useState(schedule?.type ?? 'classroom');
  const [signupUrl, setSignupUrl] = useState(schedule?.signup_url ?? '');

  // Local sidecar
  const initialLocal = isEdit
    ? localBySchedId.get(String(schedule?._id)) ?? null
    : null;
  const [maxSeats, setMaxSeats] = useState(
    initialLocal?.max_seats != null ? String(initialLocal.max_seats) : ''
  );
  const [instructorIds, setInstructorIds] = useState(
    Array.isArray(initialLocal?.instructor_ids)
      ? initialLocal.instructor_ids.map(String)
      : []
  );

  function toggleInstructor(id) {
    setInstructorIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  const datesPretty = selectedDates
    .map((d) =>
      new Date(d + 'T00:00:00').toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
      })
    )
    .join(', ');

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

    const fd = new FormData();
    fd.set('course_id',   courseCode);
    fd.set('dates_json',  JSON.stringify(selectedDates));
    fd.set('status',      status);
    fd.set('type',        type);
    fd.set('signup_url',  signupUrl);
    if (maxSeats) fd.set('max_seats', maxSeats);
    for (const id of instructorIds) fd.append('instructor_ids', id);
    if (isEdit) fd.set('schedule_id', schedule._id);

    startTransition(async () => {
      const res = isEdit
        ? await updateSchedule(fd)
        : await createSchedule(fd);
      if (res?.ok) onSaved();
      else setError(res?.error ?? 'บันทึกไม่สำเร็จ');
    });
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
            <div className="max-h-80 space-y-4 overflow-y-auto rounded-9e-md border border-[var(--surface-border)] bg-9e-ice/50 p-3 dark:bg-[#0D1B2A]/60">
              {calendarMonths.map(({ year, month }) => {
                const days = daysInMonth(year, month);
                const firstDow = new Date(year, month, 1).getDay();
                const monthLabel = new Date(year, month, 1).toLocaleDateString(
                  'th-TH',
                  { month: 'long', year: 'numeric' }
                );
                return (
                  <div key={`${year}-${month}`}>
                    <p className="mb-2 text-center text-xs font-medium text-9e-slate-dp-50 dark:text-[#94a3b8]">
                      {monthLabel}
                    </p>
                    <div className="grid grid-cols-7 gap-0.5 text-center">
                      {DOW_TH.map((d) => (
                        <div
                          key={d}
                          className="py-1 text-[10px] text-9e-slate-dp-50"
                        >
                          {d}
                        </div>
                      ))}
                      {Array.from({ length: firstDow }).map((_, i) => (
                        <div key={`pad-${i}`} />
                      ))}
                      {days.map((d) => {
                        const iso = toLocalIso(d);
                        const selected = selectedDates.includes(iso);
                        const isToday = iso === todayIso;
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

          {/* Signup URL */}
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">
              Signup URL (optional)
            </span>
            <input
              type="url"
              value={signupUrl}
              onChange={(e) => setSignupUrl(e.target.value)}
              placeholder="https://…"
              className={inputCls + ' font-mono text-xs'}
            />
          </label>

          {/* Local sidecar */}
          <div className="rounded-9e-md border border-dashed border-[var(--surface-border)] p-3">
            <p className="mb-2 text-xs font-semibold text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ข้อมูลเฉพาะ Genesis (ไม่ส่งไป MSDB)
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-9e-navy dark:text-white">
                  จำนวนที่นั่ง (max_seats)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={maxSeats}
                  onChange={(e) => setMaxSeats(e.target.value)}
                  placeholder="ไม่จำกัด"
                  className={inputCls}
                />
              </label>

              <div>
                <span className="text-sm font-medium text-9e-navy dark:text-white">
                  วิทยากร
                </span>
                <div className="mt-1 max-h-28 divide-y divide-[var(--surface-border)] overflow-y-auto rounded-9e-md border border-[var(--surface-border)]">
                  {instructors.length === 0 && (
                    <p className="px-3 py-2 text-center text-xs text-9e-slate-dp-50">
                      ยังไม่มีวิทยากร
                    </p>
                  )}
                  {instructors.map((inst) => {
                    const id = String(inst._id);
                    return (
                      <label
                        key={id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]/60"
                      >
                        <input
                          type="checkbox"
                          checked={instructorIds.includes(id)}
                          onChange={() => toggleInstructor(id)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-xs text-9e-navy dark:text-white">
                          {inst.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer (sticky) */}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--surface-border)] bg-white px-5 py-3 dark:bg-[#111d2c]">
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
