'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { previewCourseCodeRename } from '@/lib/actions/course-rename-preview';
import { CourseSearchSelect } from '@/app/admin/courses/_components/CourseSearchSelect';
import { RenamePreviewReport } from './RenamePreviewReport';

/**
 * Run a course-code rename PREVIEW. Nothing on this screen writes anything.
 *
 * ── THERE IS NO RENAME BUTTON, AND ITS ABSENCE IS THE POINT ────────────────
 * Not a disabled one and not a hidden one — the control does not exist and the
 * action that would perform the rename is not imported anywhere in this
 * subtree. A disabled button is a promise about a click handler; an absent
 * import is a property of the module graph, and it is asserted as one in
 * test/fs/renameUiNoWrite.
 *
 * ── WHY THE REPORT IS A SEPARATE COMPONENT ─────────────────────────────────
 * This file owns the fetch and the form state; RenamePreviewReport owns the
 * rendering and takes a result. That split is what lets the render tier drive
 * a collision and a case-only rename from fixtures — neither of which exists
 * in production to look at.
 */
export function RenamePreviewClient({ courses = [] }) {
  const [oldCode, setOldCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const canRun = Boolean(oldCode.trim() && newCode.trim()) && !loading;

  async function run(e) {
    e.preventDefault();
    if (!canRun) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const result = await previewCourseCodeRename({ oldCode, newCode });
      setPreview(result);
    } catch (err) {
      setError(err?.message ?? 'ตรวจสอบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    'w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm '
    + 'text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';

  return (
    <div className="space-y-5">
      <Link
        href="/admin/courses"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-9e-action"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        กลับไปยังรายการหลักสูตร
      </Link>

      <form onSubmit={run} className="space-y-4 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              หลักสูตรที่ต้องการเปลี่ยนรหัส
            </span>
            <CourseSearchSelect
              value={oldCode}
              onChange={setOldCode}
              options={courses}
              emptyLabel="— เลือกหลักสูตร —"
              inputClassName={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]" htmlFor="new-code">
              รหัสใหม่ที่เสนอ
            </label>
            <input
              id="new-code"
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="เช่น EXCEL-INT"
              className={`${inputCls} font-mono`}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canRun}
            className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
          >
            {loading ? 'กำลังตรวจสอบ…' : 'ตรวจสอบผลกระทบ'}
          </button>
          <p className="text-xs text-[var(--text-muted)]">
            หน้านี้อ่านอย่างเดียว — ไม่มีการเขียนข้อมูลใด ๆ และยังเปลี่ยนรหัสจากหน้านี้ไม่ได้
          </p>
        </div>
      </form>

      {error && (
        <div className="rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <RenamePreviewReport preview={preview} />
    </div>
  );
}
