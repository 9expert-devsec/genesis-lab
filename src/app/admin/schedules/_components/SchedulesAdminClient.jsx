'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, Trash2, Search, Calendar } from 'lucide-react';
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
const STATUS_BADGE = {
  open:        'bg-green-100 text-green-700',
  nearly_full: 'bg-amber-100 text-amber-700',
  full:        'bg-red-100 text-red-700',
};

const TYPE_OPTIONS = [
  { value: 'classroom', label: 'Classroom' },
  { value: 'hybrid',    label: 'Hybrid' },
];

const TH_DATE_FMT = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
const TH_MONTH_FMT = new Intl.DateTimeFormat('th-TH', {
  year: '2-digit',
  month: 'short',
});

// ── helpers ────────────────────────────────────────────────────────

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return TH_DATE_FMT.format(d);
}

function isoDateOnly(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKeyFromIso(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}

function rangeLabel(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return 'ไม่ระบุวัน';
  const sorted = [...dates].sort();
  if (sorted.length === 1) return fmtDate(sorted[0]);
  return `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])}`;
}

// ── main component ─────────────────────────────────────────────────

export function SchedulesAdminClient({
  schedules,
  courses,
  instructors = [],
  localsByMsdbId = {},
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(null); // null | 'new' | <schedule>
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);

  // Lookups
  const courseByCourseId = useMemo(() => {
    const m = new Map();
    for (const c of courses) if (c?.course_id) m.set(String(c.course_id), c);
    return m;
  }, [courses]);
  const courseByObjectId = useMemo(() => {
    const m = new Map();
    for (const c of courses) if (c?._id) m.set(String(c._id), c);
    return m;
  }, [courses]);
  const instructorById = useMemo(() => {
    const m = new Map();
    for (const i of instructors) if (i?._id) m.set(String(i._id), i);
    return m;
  }, [instructors]);

  function courseFor(schedule) {
    if (typeof schedule?.course === 'object' && schedule.course) {
      const cid = String(schedule.course.course_id ?? '');
      if (cid) return courseByCourseId.get(cid) ?? schedule.course;
      const oid = String(schedule.course._id ?? '');
      if (oid) return courseByObjectId.get(oid) ?? schedule.course;
    }
    return courseByObjectId.get(String(schedule?.course ?? ''));
  }

  // ── filter state ─────────────────────────────────────────────────
  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [activeMonth, setActiveMonth]     = useState(null); // null | "YYYY-MM"

  // Derive distinct months from the schedule set so the tabs only show
  // months we actually have data for.
  const months = useMemo(() => {
    const seen = new Map();
    for (const s of schedules) {
      const firstDate = s.dates?.[0];
      const key = monthKeyFromIso(firstDate);
      if (!key || seen.has(key)) continue;
      const d = new Date(firstDate);
      seen.set(key, {
        key,
        label: TH_MONTH_FMT.format(new Date(d.getFullYear(), d.getMonth(), 1)),
        sort: `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`,
      });
    }
    return [...seen.values()].sort((a, b) => a.sort.localeCompare(b.sort));
  }, [schedules]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schedules.filter((s) => {
      const c = courseFor(s);
      const code = (c?.course_id || '').toLowerCase();
      const name = (c?.course_name_th || c?.course_name || '').toLowerCase();
      const matchSearch = !q || code.includes(q) || name.includes(q);
      const matchStatus = !filterStatus || s.status === filterStatus;
      const matchMonth =
        !activeMonth || monthKeyFromIso(s.dates?.[0]) === activeMonth;
      return matchSearch && matchStatus && matchMonth;
    });
  }, [schedules, search, filterStatus, activeMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group by date-range label, sorted by the earliest date in the group.
  const grouped = useMemo(() => {
    const groups = new Map();
    for (const s of filtered) {
      const label = rangeLabel(s.dates);
      const firstDate = [...(s.dates ?? [])].sort()[0] ?? '';
      if (!groups.has(label)) {
        groups.set(label, { label, firstDate, items: [] });
      }
      groups.get(label).items.push(s);
    }
    return [...groups.values()].sort((a, b) =>
      String(a.firstDate).localeCompare(String(b.firstDate))
    );
  }, [filtered]);

  async function handleDelete(s) {
    const c = courseFor(s);
    const name = c?.course_name_th || c?.course_name || c?.course_id || '?';
    if (!window.confirm(`ลบตารางของ "${name}" ?`)) return;
    setBusyId(s._id);
    setMsg(null);
    try {
      const res = await deleteSchedule(s._id);
      if (res?.ok) {
        setMsg({ type: 'ok', text: 'ลบสำเร็จ' });
        router.refresh();
      } else {
        setMsg({ type: 'err', text: res?.error ?? 'ลบไม่สำเร็จ' });
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-9e-navy dark:text-white">
            จัดการตารางอบรม
          </h1>
          <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
            แสดง 3 เดือนข้างหน้า — เพิ่มข้อมูล max_seats และวิทยากรเก็บใน Genesis
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing('new')}
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
        <div className="relative min-w-[200px] flex-1">
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
          {filtered.length} / {schedules.length} รอบ
        </span>
      </div>

      {/* ── Month tabs ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        <MonthChip
          active={!activeMonth}
          onClick={() => setActiveMonth(null)}
          label="ทั้งหมด"
        />
        {months.map((m) => (
          <MonthChip
            key={m.key}
            active={activeMonth === m.key}
            onClick={() => setActiveMonth(m.key)}
            label={m.label}
          />
        ))}
      </div>

      {/* ── Grouped cards ──────────────────────────────────────── */}
      {grouped.length === 0 && (
        <div className="rounded-9e-lg border border-dashed border-[var(--surface-border)] py-10 text-center text-sm text-9e-slate-dp-50">
          ไม่พบตารางอบรม
        </div>
      )}

      {grouped.map((group) => (
        <section key={group.label}>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-9e-slate-dp-50 dark:text-[#94a3b8]">
            <Calendar className="h-3.5 w-3.5 text-9e-action" />
            <span>{group.label}</span>
            <span className="text-xs">({group.items.length})</span>
          </div>
          <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
            <ul className="divide-y divide-[var(--surface-border)]">
              {group.items.map((s) => {
                const c = courseFor(s);
                const local = localsByMsdbId[String(s._id)];
                const teacherNames =
                  (local?.instructor_ids ?? [])
                    .map((id) => instructorById.get(String(id))?.name)
                    .filter(Boolean);
                const busy = busyId === s._id;
                return (
                  <li
                    key={s._id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-9e-ice/40 dark:hover:bg-[#0D1B2A]/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-9e-navy dark:text-white">
                        {c?.course_name_th || c?.course_name || c?.course_id || '—'}
                      </p>
                      {c?.course_id && (
                        <p className="font-mono text-[11px] text-9e-slate-dp-50">
                          {c.course_id}
                        </p>
                      )}
                    </div>
                    <span
                      className={
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] ' +
                        (STATUS_BADGE[s.status] ?? 'bg-gray-100 text-gray-700')
                      }
                    >
                      {s.status || '—'}
                    </span>
                    <span className="w-16 shrink-0 text-[11px] text-9e-slate-dp-50">
                      {s.type || '—'}
                    </span>
                    <span className="w-14 shrink-0 text-right text-[11px] text-9e-slate-dp-50">
                      {local?.max_seats ? `${local.max_seats} ที่` : '—'}
                    </span>
                    <span className="w-32 shrink-0 truncate text-[11px] text-9e-slate-dp-50" title={teacherNames.join(', ')}>
                      {teacherNames.length === 0 ? '—' : teacherNames.join(', ')}
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(s)}
                        className="rounded border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s)}
                        disabled={busy}
                        className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        {busy ? '…' : 'ลบ'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ))}

      {editing && (
        <ScheduleModal
          schedule={editing === 'new' ? null : editing}
          courses={courses}
          instructors={instructors}
          local={
            editing === 'new'
              ? null
              : localsByMsdbId[String(editing._id)] ?? null
          }
          courseFor={courseFor}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MonthChip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1 text-xs transition-colors ' +
        (active
          ? 'border-9e-action bg-9e-action text-white'
          : 'border-[var(--surface-border)] bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white dark:hover:bg-[#111d2c]')
      }
    >
      {label}
    </button>
  );
}

// ── modal ──────────────────────────────────────────────────────────

function ScheduleModal({
  schedule,
  courses,
  instructors,
  local,
  courseFor,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(schedule?._id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const initialCourseCode = (() => {
    if (!schedule) return '';
    const c = courseFor(schedule);
    return c?.course_id ?? '';
  })();
  const [courseCode, setCourseCode] = useState(initialCourseCode);
  const [courseSearch, setCourseSearch] = useState('');

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        (c.course_id || '').toLowerCase().includes(q) ||
        (c.course_name || '').toLowerCase().includes(q) ||
        (c.course_name_th || '').toLowerCase().includes(q)
    );
  }, [courses, courseSearch]);

  const initialDates = (schedule?.dates ?? []).map(isoDateOnly).filter(Boolean);
  const [dates, setDates] = useState(initialDates.length ? initialDates : ['']);
  const [status, setStatus]       = useState(schedule?.status ?? 'open');
  const [type, setType]           = useState(schedule?.type ?? 'classroom');
  const [signupUrl, setSignupUrl] = useState(schedule?.signup_url ?? '');

  const [maxSeats, setMaxSeats] = useState(
    local?.max_seats != null ? String(local.max_seats) : ''
  );
  const [instructorIds, setInstructorIds] = useState(
    Array.isArray(local?.instructor_ids) ? local.instructor_ids.map(String) : []
  );

  function setDate(i, v) {
    setDates((cur) => {
      const next = [...cur];
      next[i] = v;
      return next;
    });
  }
  function addDate() { setDates((cur) => [...cur, '']); }
  function removeDate(i) { setDates((cur) => cur.filter((_, idx) => idx !== i)); }

  function toggleInstructor(id) {
    setInstructorIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const fd = new FormData();
    fd.set('course_id', courseCode);
    fd.set('dates_json', JSON.stringify(dates.filter(Boolean)));
    fd.set('status',     status);
    fd.set('type',       type);
    fd.set('signup_url', signupUrl);
    if (maxSeats) fd.set('max_seats', maxSeats);
    for (const id of instructorIds) fd.append('instructor_ids', id);

    startTransition(async () => {
      const res = isEdit
        ? await updateSchedule(schedule._id, fd)
        : await createSchedule(fd);
      if (res?.ok) onSaved();
      else setError(res?.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  const pickedCourse = courses.find((c) => c.course_id === courseCode);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-9e-lg bg-white p-6 shadow-xl dark:bg-[#111d2c]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-9e-navy dark:text-white">
            {isEdit ? 'แก้ไขตารางอบรม' : 'เพิ่มตารางอบรม'}
          </h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="text-9e-slate-dp-50 hover:text-9e-navy">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {/* Course selector — search-first, then chip showing the
              picked course. Cleaner than a 70-item native <select>. */}
          <div>
            <span className="text-sm font-medium text-9e-navy dark:text-white">หลักสูตร *</span>
            {pickedCourse ? (
              <div className="mt-1 flex items-center justify-between rounded-9e-md border border-9e-action bg-9e-ice px-3 py-2 text-sm dark:bg-[#0D1B2A]">
                <div className="min-w-0">
                  <div className="truncate text-9e-navy dark:text-white">
                    {pickedCourse.course_name_th || pickedCourse.course_name}
                  </div>
                  <div className="font-mono text-[11px] text-9e-slate-dp-50">
                    {pickedCourse.course_id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setCourseCode(''); setCourseSearch(''); }}
                  className="rounded text-9e-slate-dp-50 hover:text-9e-navy"
                  aria-label="เลือกใหม่"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  placeholder="ค้นหาหลักสูตร..."
                  className={inputCls}
                />
                <ul className="mt-1 max-h-40 overflow-auto rounded-9e-md border border-[var(--surface-border)] bg-white dark:bg-[#0D1B2A]">
                  {filteredCourses.slice(0, 25).map((c) => (
                    <li key={c.course_id}>
                      <button
                        type="button"
                        onClick={() => setCourseCode(c.course_id)}
                        className="block w-full px-3 py-1.5 text-left text-xs hover:bg-9e-ice dark:hover:bg-[#111d2c]"
                      >
                        <span className="font-mono text-9e-action">{c.course_id}</span>{' '}
                        <span className="text-9e-navy dark:text-white">
                          {c.course_name_th || c.course_name}
                        </span>
                      </button>
                    </li>
                  ))}
                  {filteredCourses.length === 0 && (
                    <li className="px-3 py-2 text-xs text-9e-slate-dp-50">
                      ไม่พบหลักสูตร
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>

          <div>
            <span className="text-sm font-medium text-9e-navy dark:text-white">วันที่ *</span>
            <div className="mt-1 space-y-2">
              {dates.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="date"
                    required
                    value={d}
                    onChange={(e) => setDate(i, e.target.value)}
                    className={inputCls + ' flex-1'}
                  />
                  {dates.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDate(i)}
                      className="rounded border border-red-200 bg-red-50 px-2 text-red-700 hover:bg-red-100"
                      aria-label="ลบวันนี้"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addDate}
                className="inline-flex items-center gap-1 rounded border border-[var(--surface-border)] px-3 py-1.5 text-xs text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่มวัน
              </button>
            </div>
          </div>

          <div>
            <span className="text-sm font-medium text-9e-navy dark:text-white">สถานะ</span>
            <div className="mt-1 flex gap-1">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatus(o.value)}
                  className={
                    'flex-1 rounded-9e-md border px-3 py-1.5 text-xs transition-colors ' +
                    (status === o.value
                      ? 'border-9e-action bg-9e-action text-white'
                      : 'border-[var(--surface-border)] bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-sm font-medium text-9e-navy dark:text-white">รูปแบบ</span>
            <div className="mt-1 flex gap-1">
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setType(o.value)}
                  className={
                    'flex-1 rounded-9e-md border px-3 py-1.5 text-xs transition-colors ' +
                    (type === o.value
                      ? 'border-9e-action bg-9e-action text-white'
                      : 'border-[var(--surface-border)] bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">Signup URL</span>
            <input
              type="url"
              value={signupUrl}
              onChange={(e) => setSignupUrl(e.target.value)}
              placeholder="https://…"
              className={inputCls + ' font-mono text-xs'}
            />
          </label>

          <div className="rounded-9e-md border border-dashed border-[var(--surface-border)] p-3">
            <p className="mb-2 text-xs font-semibold text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ข้อมูลเฉพาะ Genesis (ไม่ส่งไป MSDB)
            </p>

            <label className="block">
              <span className="text-sm font-medium text-9e-navy dark:text-white">ที่นั่ง (max_seats)</span>
              <input
                type="number"
                min="1"
                step="1"
                value={maxSeats}
                onChange={(e) => setMaxSeats(e.target.value)}
                placeholder="ปล่อยว่างถ้าไม่จำกัด"
                className={inputCls}
              />
            </label>

            <div className="mt-2">
              <span className="text-sm font-medium text-9e-navy dark:text-white">วิทยากร</span>
              <p className="mt-0.5 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                กดเลือกได้หลายคน
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {instructors.length === 0 && (
                  <span className="text-xs text-9e-slate-dp-50">
                    ยังไม่มีวิทยากรใน Genesis — เพิ่มได้ที่ /admin/instructors
                  </span>
                )}
                {instructors.map((i) => {
                  const id = String(i._id);
                  const active = instructorIds.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleInstructor(id)}
                      className={
                        'rounded-full px-3 py-1 text-xs transition-colors ' +
                        (active
                          ? 'bg-9e-action text-white'
                          : 'border border-[var(--surface-border)] bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
                      }
                    >
                      {i.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending || !courseCode}
              className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
            >
              {pending ? 'กำลังบันทึก…' : isEdit ? 'บันทึก' : 'สร้าง'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';
