'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getEarlyBirdsForPromotion,
  getEarlyBirdClaimForPromotion,
  getCourseRoundsForPromotion,
  savePromotionEarlyBird,
  releaseEarlyBirdFromPromotion,
  deletePromotionEarlyBird,
} from '@/lib/actions/course-promos';
import { cn } from '@/lib/utils';

/**
 * The promotion's Early Bird set: one row per course, add / edit / remove.
 *
 * ── THE THREE OUTCOMES ARE VISIBLE HERE, NOT JUST ENFORCED ELSEWHERE ────────
 * Picking a course runs the ADVISORY claim check and the form says which of the
 * three states it is in before anything is typed:
 *   free    — nothing to warn about
 *   mine    — this promotion already owns it; the form is an edit
 *   unowned — a row exists under no promotion, and saving would ADOPT it
 *   held    — another promotion owns it; the save will be refused, naming it
 * The check is advisory ONLY. The action refuses independently, because two
 * admins can race this — see writeEarlyBird.
 *
 * ── ADOPTION CARRIES THE ROW'S OWN VALUES ───────────────────────────────────
 * When the author confirms taking an unowned row, the form is first REPLACED by
 * that row's existing label, price, deadline and round. Otherwise a confirmation
 * about ownership would quietly carry this form's defaults in with it and
 * overwrite settings nobody asked to change.
 */

const MONTHS_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatRound(schedule) {
  const dates = [...(schedule?.dates ?? [])].sort();
  if (!dates.length) return schedule?._id ?? '';
  const start = new Date(dates[0]);
  const end = new Date(dates.at(-1));
  if (Number.isNaN(start.getTime())) return schedule?._id ?? '';
  const s = `${start.getDate()} ${MONTHS_TH[start.getMonth()]} ${start.getFullYear() + 543}`;
  if (start.getTime() === end.getTime()) return s;
  return `${s} – ${end.getDate()} ${MONTHS_TH[end.getMonth()]} ${end.getFullYear() + 543}`;
}

function toDatetimeLocal(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function formatDeadline(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

const EMPTY = {
  course_id: '',
  schedule_id: '',
  label_th: 'Early Bird',
  special_price: '',
  deadline: '',
  is_active: true,
};

export function PromotionEarlyBirdClient({
  promotionId,
  promotionTitle,
  initialRows = [],
  courses = [],
  relatedCourseIds = [],
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [claim, setClaim] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [pendingAdoption, setPendingAdoption] = useState(null);

  const courseById = useMemo(
    () => Object.fromEntries(courses.map((c) => [c.course_id, c])),
    [courses]
  );

  /**
   * Courses this promotion already declares upstream float to the top. They do
   * NOT restrict the list: `related_course_ids` empty means "applies to all
   * courses" (see models/Promotion.js), so filtering by it would make the
   * picker useless in the common case.
   */
  const orderedCourses = useMemo(() => {
    const related = new Set(relatedCourseIds.map(String));
    return [...courses].sort((a, b) => {
      const ar = related.has(a.course_id) ? 0 : 1;
      const br = related.has(b.course_id) ? 0 : 1;
      if (ar !== br) return ar - br;
      return String(a.course_id).localeCompare(String(b.course_id));
    });
  }, [courses, relatedCourseIds]);

  const selectedCourse = courseById[form.course_id] ?? null;

  // Rounds follow the selected course. The endpoint takes the MSDB ObjectId,
  // not the course code — the two are different key spaces.
  useEffect(() => {
    let live = true;
    if (!selectedCourse?._id) {
      setRounds([]);
      return () => { live = false; };
    }
    getCourseRoundsForPromotion(selectedCourse._id)
      .then((items) => { if (live) setRounds(Array.isArray(items) ? items : []); })
      .catch(() => { if (live) setRounds([]); });
    return () => { live = false; };
  }, [selectedCourse?._id]);

  // The advisory check, refreshed whenever the course changes.
  useEffect(() => {
    let live = true;
    if (!form.course_id) {
      setClaim(null);
      return () => { live = false; };
    }
    getEarlyBirdClaimForPromotion(promotionId, form.course_id)
      .then((c) => { if (live) setClaim(c); })
      .catch(() => { if (live) setClaim(null); });
    return () => { live = false; };
  }, [promotionId, form.course_id]);

  async function refresh() {
    const next = await getEarlyBirdsForPromotion(promotionId).catch(() => null);
    if (Array.isArray(next)) setRows(next);
    router.refresh();
  }

  function resetForm() {
    setForm(EMPTY);
    setEditing(null);
    setClaim(null);
    setPendingAdoption(null);
  }

  function payloadFrom(state) {
    return {
      schedule_id: state.schedule_id,
      label_th: state.label_th,
      special_price: state.special_price === '' ? null : Number(state.special_price),
      deadline: state.deadline ? new Date(state.deadline).toISOString() : null,
      is_active: state.is_active,
    };
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.course_id) {
      setMessage({ type: 'error', text: 'ยังไม่ได้เลือกหลักสูตร' });
      return;
    }
    setBusy(true);
    setMessage(null);
    setPendingAdoption(null);

    const res = await savePromotionEarlyBird(promotionId, form.course_id, payloadFrom(form));
    setBusy(false);

    if (res?.code === 'EB_NEEDS_ADOPTION') {
      /**
       * Load the EXISTING row into the form before asking. The author confirms
       * what they can see, and the values that come under this promotion are
       * the row's own — not this form's defaults.
       */
      const existing = res.claim?.config ?? {};
      setForm((f) => ({
        ...f,
        schedule_id: existing.schedule_id ?? '',
        label_th: existing.label_th ?? 'Early Bird',
        special_price: existing.special_price ?? '',
        deadline: toDatetimeLocal(existing.deadline),
      }));
      setPendingAdoption({ course_id: form.course_id });
      return;
    }

    if (res?.ok) {
      setMessage({ type: 'ok', text: 'บันทึกเรียบร้อย ✓' });
      resetForm();
      await refresh();
    } else {
      setMessage({ type: 'error', text: res?.error ?? 'บันทึกไม่สำเร็จ' });
    }
  }

  async function confirmAdoption() {
    setBusy(true);
    const res = await savePromotionEarlyBird(promotionId, pendingAdoption.course_id, {
      ...payloadFrom(form),
      adopt: true,
    });
    setBusy(false);
    if (res?.ok) {
      setMessage({ type: 'ok', text: 'นำเข้ามาอยู่ในโปรโมชันนี้แล้ว ✓' });
      resetForm();
      await refresh();
    } else {
      setMessage({ type: 'error', text: res?.error ?? 'บันทึกไม่สำเร็จ' });
      setPendingAdoption(null);
    }
  }

  function editRow(row) {
    setEditing(row.course_id);
    setPendingAdoption(null);
    setMessage(null);
    setForm({
      course_id: row.course_id,
      schedule_id: row.schedule_id ?? '',
      label_th: row.label_th ?? 'Early Bird',
      special_price: row.special_price ?? '',
      deadline: toDatetimeLocal(row.deadline),
      is_active: Boolean(row.is_active),
    });
  }

  async function release(row) {
    if (!window.confirm(
      `นำ ${row.course_id} ออกจากโปรโมชันนี้?\n\n` +
      'Early Bird ยังอยู่ (ตั้งค่าเดิมไม่หาย) แต่จะไม่ผูกกับโปรโมชันใด ' +
      'และแก้ไขได้จากแท็บของหลักสูตร'
    )) return;
    setBusy(true);
    const res = await releaseEarlyBirdFromPromotion(promotionId, row.course_id);
    setBusy(false);
    setMessage(
      res?.ok
        ? { type: 'ok', text: 'นำออกจากโปรโมชันแล้ว' }
        : { type: 'error', text: res?.error ?? 'ทำรายการไม่สำเร็จ' }
    );
    if (res?.ok) await refresh();
  }

  async function remove(row) {
    if (!window.confirm(
      `ลบ Early Bird ของ ${row.course_id} ทิ้ง?\n\n` +
      'ต่างจาก "นำออก" — การตั้งค่าทั้งหมดจะหายไป'
    )) return;
    setBusy(true);
    const res = await deletePromotionEarlyBird(promotionId, row.course_id);
    setBusy(false);
    setMessage(
      res?.ok
        ? { type: 'ok', text: 'ลบแล้ว' }
        : { type: 'error', text: res?.error ?? 'ทำรายการไม่สำเร็จ' }
    );
    if (res?.ok) await refresh();
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">หลักสูตร</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">รอบ</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ป้าย</th>
              <th className="px-3 py-3 text-right font-bold text-9e-navy dark:text-white">ราคาพิเศษ</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">สิ้นสุด</th>
              <th className="px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  โปรโมชันนี้ยังไม่มี Early Bird — เพิ่มหลักสูตรด้านล่าง
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const expired = row.deadline && new Date(row.deadline) < new Date();
              return (
                <tr key={row.course_id} className="border-b border-[var(--surface-border)] last:border-0">
                  <td className="px-3 py-3">
                    <div className="font-medium text-9e-navy dark:text-white">{row.course_id}</div>
                    <div className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                      {courseById[row.course_id]?.name ?? '—'}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {row.schedule_id || '—'}
                  </td>
                  <td className="px-3 py-3">{row.label_th}</td>
                  <td className="px-3 py-3 text-right">
                    {row.special_price ? Number(row.special_price).toLocaleString('th-TH') : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn(expired && 'text-red-600')}>
                      {formatDeadline(row.deadline)}
                    </span>
                    {expired && <span className="ml-1 text-xs text-red-600">หมดอายุแล้ว</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {row.is_active ? '✓' : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => editRow(row)}
                      className="rounded border border-[var(--surface-border)] px-2 py-1 text-xs font-medium text-9e-action hover:bg-9e-ice"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => release(row)}
                      className="ml-2 rounded border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-slate-dp-50 hover:bg-9e-ice disabled:opacity-50"
                    >
                      นำออก
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(row)}
                      className="ml-2 rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-9e-lg border border-[var(--surface-border)] bg-white p-4 dark:bg-[#111d2c]"
      >
        <h2 className="text-base font-bold text-9e-navy dark:text-white">
          {editing ? `แก้ไข Early Bird — ${editing}` : 'เพิ่มหลักสูตรเข้าโปรโมชันนี้'}
        </h2>

        <Field label="หลักสูตร">
          <select
            value={form.course_id}
            disabled={Boolean(editing)}
            onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value, schedule_id: '' }))}
            className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-60"
          >
            <option value="">— เลือกหลักสูตร —</option>
            {orderedCourses.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.course_id} — {c.name}
              </option>
            ))}
          </select>
        </Field>

        {claim && <ClaimNotice claim={claim} promotionTitle={promotionTitle} />}

        <Field label="รอบที่ผูกกับปุ่ม Register">
          <select
            value={form.schedule_id}
            onChange={(e) => setForm((f) => ({ ...f, schedule_id: e.target.value }))}
            className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <option value="">— ไม่ผูกรอบ —</option>
            {/* An already-saved round that is no longer in the upcoming list
                must still be selectable, or opening the form to change a PRICE
                would silently drop the round. */}
            {form.schedule_id && !rounds.some((r) => r._id === form.schedule_id) && (
              <option value={form.schedule_id}>{form.schedule_id} (รอบเดิม)</option>
            )}
            {rounds.map((r) => (
              <option key={r._id} value={r._id}>{formatRound(r)}</option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="ชื่อป้าย">
            <input
              type="text"
              value={form.label_th}
              onChange={(e) => setForm((f) => ({ ...f, label_th: e.target.value }))}
              className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </Field>
          <Field label="ราคาพิเศษ (บาท)">
            <input
              type="number"
              min="0"
              step="1"
              value={form.special_price}
              onChange={(e) => setForm((f) => ({ ...f, special_price: e.target.value }))}
              className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </Field>
          <Field label="วัน-เวลาสิ้นสุด">
            <input
              type="datetime-local"
              value={form.deadline}
              onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          เปิดใช้งาน Early Bird
        </label>

        {pendingAdoption && (
          <div className="rounded-9e-md border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              ยืนยันการนำเข้า — {pendingAdoption.course_id}
            </p>
            <p className="mt-1 text-amber-800 dark:text-amber-300">
              หลักสูตรนี้มี Early Bird อยู่แล้วแต่ยังไม่ผูกกับโปรโมชันใด
              การยืนยันจะย้ายมาอยู่ใต้ «{promotionTitle}»
              โดยใช้ค่าเดิมที่แสดงในฟอร์มด้านบน (แก้ไขก่อนยืนยันได้)
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={confirmAdoption}
                className="rounded-9e-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                ยืนยันนำเข้า
              </button>
              <button
                type="button"
                onClick={() => setPendingAdoption(null)}
                className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-[var(--surface-border)] pt-4">
          <button
            type="submit"
            disabled={busy || claim?.status === 'held'}
            className="rounded-9e-md bg-9e-action px-6 py-3 text-sm font-medium text-white hover:bg-9e-brand disabled:opacity-50"
          >
            {busy ? 'กำลังบันทึก...' : editing ? 'บันทึกการแก้ไข' : 'เพิ่ม'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-9e-md border border-[var(--surface-border)] px-4 py-3 text-sm"
            >
              ยกเลิก
            </button>
          )}
          {message && (
            <span
              className={cn(
                'text-sm font-medium',
                message.type === 'ok' ? 'text-green-600' : 'text-red-600'
              )}
            >
              {message.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * The advisory notice. Says which of the three states the picked course is in.
 * It never decides the write — the button is disabled on `held` as a courtesy,
 * and the action refuses regardless.
 */
function ClaimNotice({ claim, promotionTitle }) {
  if (claim.status === 'free') {
    return (
      <p className="rounded-9e-md border border-dashed border-[var(--surface-border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
        หลักสูตรนี้ยังไม่มี Early Bird — เพิ่มได้เลย
      </p>
    );
  }
  if (claim.status === 'mine') {
    return (
      <p className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
        โปรโมชันนี้ («{promotionTitle}») มี Early Bird ของหลักสูตรนี้อยู่แล้ว — การบันทึกคือการแก้ไข
      </p>
    );
  }
  if (claim.status === 'unowned') {
    return (
      <p className="rounded-9e-md border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        หลักสูตรนี้มี Early Bird อยู่แล้วแต่ยังไม่ผูกโปรโมชัน —
        บันทึกแล้วจะขอให้ยืนยันก่อนย้ายมาอยู่ใต้โปรโมชันนี้
      </p>
    );
  }
  return (
    <p className="rounded-9e-md border border-red-400 bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
      หลักสูตรนี้อยู่ใน Early Bird ของ «{claim.promotion_title || claim.promotion_id}» แล้ว —
      หนึ่งหลักสูตรมีได้เพียง Early Bird เดียว จึงเพิ่มเข้าโปรโมชันนี้ไม่ได้
    </p>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
