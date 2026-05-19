'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, Trash2 } from 'lucide-react';
import {
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '@/lib/actions/schedules';

const STATUS_OPTIONS = [
  { value: 'open',        label: 'open' },
  { value: 'nearly_full', label: 'nearly_full' },
  { value: 'full',        label: 'full' },
];
const STATUS_BADGE = {
  open:        'bg-green-100 text-green-700',
  nearly_full: 'bg-amber-100 text-amber-700',
  full:        'bg-red-100 text-red-700',
};

const TYPE_OPTIONS = [
  { value: 'classroom', label: 'classroom' },
  { value: 'hybrid',    label: 'hybrid' },
];

const TH_DATE_FMT = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

function fmtDate(v) {
  if (!v) return '—';
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

  // course_id (e.g. "MSE-AI") → course doc, for name lookups.
  const courseByCourseId = useMemo(() => {
    const m = new Map();
    for (const c of courses) {
      if (c?.course_id) m.set(String(c.course_id), c);
    }
    return m;
  }, [courses]);
  // _id (Mongo ObjectId) → course doc, for matching upstream schedule.course.
  const courseByObjectId = useMemo(() => {
    const m = new Map();
    for (const c of courses) {
      if (c?._id) m.set(String(c._id), c);
    }
    return m;
  }, [courses]);

  // instructor_id → name, for chips on the list rows.
  const instructorById = useMemo(() => {
    const m = new Map();
    for (const i of instructors) {
      if (i?._id) m.set(String(i._id), i);
    }
    return m;
  }, [instructors]);

  function courseFor(schedule) {
    // upstream `schedule.course` is sometimes populated (object) and
    // sometimes the bare ObjectId string. Cover both.
    if (typeof schedule?.course === 'object' && schedule.course) {
      const cid = String(schedule.course.course_id ?? '');
      if (cid) return courseByCourseId.get(cid) ?? schedule.course;
      const oid = String(schedule.course._id ?? '');
      if (oid) return courseByObjectId.get(oid) ?? schedule.course;
    }
    return courseByObjectId.get(String(schedule?.course ?? ''));
  }

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-9e-navy dark:text-white">
            จัดการตารางอบรม
          </h1>
          <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ตารางอบรมในต้นทาง (MSDB) — Genesis เก็บ max_seats และ instructor
            เพิ่มเติมแบบ local
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

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">หลักสูตร</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">วันที่</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">Status</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">Type</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ที่นั่ง</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">วิทยากร</th>
              <th className="px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {schedules.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มีตารางอบรม
                </td>
              </tr>
            )}
            {schedules.map((s) => {
              const c = courseFor(s);
              const courseName = c?.course_name_th || c?.course_name || c?.course_id || '—';
              const courseCode = c?.course_id || '';
              const sortedDates = [...(s.dates ?? [])].sort();
              const local = localsByMsdbId[String(s._id)];
              const teacherNames =
                (local?.instructor_ids ?? [])
                  .map((id) => instructorById.get(String(id))?.name)
                  .filter(Boolean);
              const busy = busyId === s._id;
              return (
                <tr
                  key={s._id}
                  className="border-b border-[var(--surface-border)] last:border-0 hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40"
                >
                  <td className="px-3 py-3">
                    <div className="text-9e-navy dark:text-white">{courseName}</div>
                    {courseCode && (
                      <div className="font-mono text-[11px] text-9e-slate-dp-50">
                        {courseCode}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-9e-navy dark:text-white">
                    {sortedDates.length === 0
                      ? '—'
                      : sortedDates.map(fmtDate).join(', ')}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <span
                      className={
                        'inline-block rounded-full px-2 py-0.5 ' +
                        (STATUS_BADGE[s.status] ?? 'bg-gray-100 text-gray-700')
                      }
                    >
                      {s.status || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-9e-navy dark:text-white">
                    {s.type || '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-9e-navy dark:text-white">
                    {local?.max_seats ? `${local.max_seats} ที่` : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-9e-navy dark:text-white">
                    {teacherNames.length === 0
                      ? '—'
                      : teacherNames.join(', ')}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex gap-1">
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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

  // Course code (`course_id` string, e.g. "POWER-BI-PQ") — what we
  // send to the server action. Initial value derived from the
  // populated/raw upstream `course` field via `courseFor`.
  const initialCourseCode = (() => {
    if (!schedule) return '';
    const c = courseFor(schedule);
    return c?.course_id ?? '';
  })();
  const [courseCode, setCourseCode] = useState(initialCourseCode);

  const initialDates = (schedule?.dates ?? []).map(isoDateOnly).filter(Boolean);
  const [dates, setDates] = useState(initialDates.length ? initialDates : ['']);
  const [status, setStatus]       = useState(schedule?.status ?? 'open');
  const [type, setType]           = useState(schedule?.type ?? 'classroom');
  const [signupUrl, setSignupUrl] = useState(schedule?.signup_url ?? '');

  // Local-only metadata (Genesis sidecar)
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
    // Send dates as JSON so the server action can re-parse them in one
    // shot (avoids whitespace-only entries from sparse multi-input).
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
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">หลักสูตร *</span>
            <select
              required
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              className={inputCls}
            >
              <option value="">— เลือกหลักสูตร —</option>
              {courses
                .filter((c) => c?.course_id)
                .map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {(c.course_name_th || c.course_name) ?? '?'} ({c.course_id})
                  </option>
                ))}
            </select>
          </label>

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

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-9e-navy dark:text-white">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputCls}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-9e-navy dark:text-white">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={inputCls}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
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

          {/* Local sidecar fields — stored in Genesis MongoDB only */}
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
              disabled={pending}
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
