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
  { value: 'open',         label: 'open' },
  { value: 'nearly_full',  label: 'nearly_full' },
  { value: 'full',         label: 'full' },
];
const TYPE_OPTIONS = [
  { value: 'classroom', label: 'classroom' },
  { value: 'hybrid',    label: 'hybrid' },
];

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function isoDateOnly(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  // yyyy-mm-dd in local time — what <input type=date> expects.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function SchedulesAdminClient({ schedules, courses }) {
  const router = useRouter();
  const [editing, setEditing] = useState(null); // null | 'new' | <schedule>
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);

  const courseById = useMemo(() => {
    const m = new Map();
    for (const c of courses) m.set(String(c._id), c);
    return m;
  }, [courses]);

  function nameForCourse(c) {
    if (!c) return '—';
    const obj = typeof c === 'object' ? c : courseById.get(String(c));
    return obj?.course_name_th || obj?.course_name || String(c).slice(-6);
  }

  async function handleDelete(s) {
    const courseName = nameForCourse(s.course);
    if (!window.confirm(`ลบตารางของ "${courseName}" ?`)) return;
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
            ตารางอบรมทุกหลักสูตรในต้นทาง (MSDB)
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
              <th className="px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {schedules.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มีตารางอบรม
                </td>
              </tr>
            )}
            {schedules.map((s) => {
              const courseName = nameForCourse(s.course);
              const sortedDates = [...(s.dates ?? [])].sort();
              const busy = busyId === s._id;
              return (
                <tr
                  key={s._id}
                  className="border-b border-[var(--surface-border)] last:border-0 hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40"
                >
                  <td className="px-3 py-3 text-9e-navy dark:text-white">{courseName}</td>
                  <td className="px-3 py-3 text-xs text-9e-navy dark:text-white">
                    {sortedDates.length === 0
                      ? '—'
                      : sortedDates.map(fmtDate).join(', ')}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <span className="rounded-full bg-9e-ice px-2 py-0.5 text-9e-navy dark:bg-[#0D1B2A] dark:text-white">
                      {s.status || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-9e-navy dark:text-white">
                    {s.type || '—'}
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

function ScheduleModal({ schedule, courses, onClose, onSaved }) {
  const isEdit = Boolean(schedule?._id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const [courseId, setCourseId] = useState(
    typeof schedule?.course === 'object'
      ? String(schedule?.course?._id ?? '')
      : String(schedule?.course ?? '')
  );
  const initialDates = (schedule?.dates ?? []).map(isoDateOnly).filter(Boolean);
  const [dates, setDates]         = useState(initialDates.length ? initialDates : ['']);
  const [status, setStatus]       = useState(schedule?.status ?? 'open');
  const [type, setType]           = useState(schedule?.type ?? 'classroom');
  const [signupUrl, setSignupUrl] = useState(schedule?.signup_url ?? '');

  function setDate(i, v) {
    setDates((cur) => {
      const next = [...cur];
      next[i] = v;
      return next;
    });
  }
  function addDate() {
    setDates((cur) => [...cur, '']);
  }
  function removeDate(i) {
    setDates((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const fd = new FormData();
    fd.set('course_id', courseId);
    for (const d of dates.filter(Boolean)) fd.append('dates', d);
    fd.set('status', status);
    fd.set('type', type);
    fd.set('signup_url', signupUrl);

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

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">หลักสูตร *</span>
            <select
              required
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
            >
              <option value="">— เลือกหลักสูตร —</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.course_name_th || c.course_name} ({c.course_id})
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
                    className="flex-1 rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
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
                className="mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
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
                className="mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
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
              className="mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 font-mono text-xs text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
            />
          </label>

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
