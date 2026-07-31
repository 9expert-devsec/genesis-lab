'use client';

/**
 * CourseFaqManager — per-course LocalFaq CRUD (add / edit / delete / toggle /
 * drag-reorder). Shared by every course type's admin editor:
 *   • public course      → FaqTab (inside the extension editor)
 *   • career path        → CareerPathFaqClient
 *   • masterclass course → MasterclassFaqClient
 *
 * `courseType` + `refId` scope every write. There is no category switcher —
 * this component always manages exactly one course's FAQs.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import {
  createLocalFaq,
  updateLocalFaq,
  deleteLocalFaq,
  reorderLocalFaqs,
} from '@/lib/actions/local-faqs';
import { SimpleRichTextEditor } from '@/components/admin/SimpleRichTextEditor';

const inputCls =
  'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';
const labelCls = 'block text-sm font-medium text-9e-navy dark:text-white';

function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

function emptyFaq() {
  return { question_th: '', answer_html: '', is_active: true };
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={checked ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
      className={`relative h-4 w-8 rounded-full transition-colors ${checked ? 'bg-[#22C55E]' : 'bg-gray-300 dark:bg-[#1e3a5f]'}`}
    >
      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
    </button>
  );
}

export function CourseFaqManager({ courseType, refId, initialFaqs = [] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [form, setForm] = useState(emptyFaq());
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [, startTransition] = useTransition();

  const sorted = [...initialFaqs].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  );

  const {
    items: rows,
    setItems: setRows,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(sorted, async (next) => {
    setRows(next.map((f, idx) => ({ ...f, display_order: idx })));
    setBusyId('__reorder__');
    try {
      await reorderLocalFaqs(courseType, refId, next.map((f) => f._id));
    } finally {
      setBusyId(null);
    }
  });

  const set = (patch) => setForm((cur) => ({ ...cur, ...patch }));

  function openCreate() {
    setEditingFaq(null);
    setForm(emptyFaq());
    setError(null);
    setShowForm(true);
  }

  function openEdit(faq) {
    setEditingFaq(faq);
    setForm({
      question_th: faq.question_th ?? '',
      answer_html: faq.answer_html ?? '',
      is_active: faq.is_active ?? true,
    });
    setError(null);
    setShowForm(true);
  }

  function handleToggleActive(faq) {
    const next = !faq.is_active;
    setBusyId(faq._id);
    setRows((cur) => cur.map((r) => (r._id === faq._id ? { ...r, is_active: next } : r)));
    startTransition(async () => {
      await updateLocalFaq(faq._id, { is_active: next });
      setBusyId(null);
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.question_th.trim()) {
      setError('กรุณากรอกคำถาม (question_th)');
      return;
    }
    startTransition(async () => {
      try {
        let res;
        if (editingFaq) {
          res = await updateLocalFaq(editingFaq._id, {
            question_th: form.question_th.trim(),
            answer_html: form.answer_html,
            is_active: form.is_active,
          });
        } else {
          res = await createLocalFaq({
            course_type: courseType,
            ref_id: refId,
            question_th: form.question_th.trim(),
            answer_html: form.answer_html,
            display_order: rows.length,
          });
        }
        if (res?.ok === false) {
          setError(res.error || 'บันทึกไม่สำเร็จ');
          return;
        }
        setShowForm(false);
        setEditingFaq(null);
        router.refresh();
      } catch (err) {
        setError(err?.message ?? 'บันทึกไม่สำเร็จ');
      }
    });
  }

  function handleDelete(faq) {
    setBusyId(faq._id);
    startTransition(async () => {
      try {
        await deleteLocalFaq(faq._id);
        setRows((cur) => cur.filter((r) => r._id !== faq._id));
        setConfirmDelete(null);
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {rows.length} คำถาม — ลากเพื่อจัดลำดับ
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" /> เพิ่มคำถาม
        </button>
      </div>

      <div className="mt-3 overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-10 px-2 py-3" aria-label="ลาก" />
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">คำถาม</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-40 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มีคำถามสำหรับหลักสูตรนี้
                </td>
              </tr>
            )}
            {rows.map((f, i) => {
              const isDragging = draggingIndex === i;
              const isDropTarget =
                dragOverIndex === i && draggingIndex !== null && draggingIndex !== i;
              return (
                <tr
                  key={f._id}
                  {...getDragProps(i)}
                  className={
                    'border-b border-[var(--surface-border)] transition-all duration-150 last:border-0 ' +
                    (isDragging ? 'opacity-50 ring-2 ring-9e-action ' : '') +
                    (isDropTarget ? 'border-t-2 border-t-9e-action ' : '') +
                    'hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40'
                  }
                >
                  <td className="px-2 py-3 align-middle">
                    <DragHandle />
                  </td>
                  <td className="px-3 py-3 text-9e-navy dark:text-white" title={f.question_th}>
                    {truncate(f.question_th, 60)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Toggle checked={f.is_active} onChange={() => handleToggleActive(f)} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(f)}
                        className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                      >
                        <Pencil className="h-3 w-3" /> แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(f)}
                        disabled={busyId === f._id}
                        className="inline-flex items-center gap-1 rounded-9e-sm border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" /> ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Slide-out form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-gray-200 p-6 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-9e-navy dark:text-white">
              {editingFaq ? 'แก้ไขคำถาม' : 'เพิ่มคำถาม'}
            </h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-9e-slate-dp-50 hover:text-red-500">
              <X size={18} />
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-4">
            <label className={labelCls}>คำถาม (question_th) *</label>
            <input type="text" value={form.question_th} onChange={(e) => set({ question_th: e.target.value })} className={inputCls} required />
          </div>

          <div className="mt-4">
            <label className={labelCls}>คำตอบ (answer_html)</label>
            <div className="mt-1">
              <SimpleRichTextEditor
                value={form.answer_html}
                onChange={(html) => set({ answer_html: html })}
                placeholder="พิมพ์คำตอบ…"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="flex cursor-pointer items-center gap-2">
              <Toggle checked={form.is_active} onChange={() => set({ is_active: !form.is_active })} />
              <span className="text-sm text-9e-navy dark:text-white">ใช้งาน (is_active)</span>
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]">
              ยกเลิก
            </button>
            <button type="submit" className="rounded-9e-md bg-9e-action px-6 py-2 text-sm font-bold text-white hover:bg-9e-brand">
              บันทึก
            </button>
          </div>
        </form>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-9e-lg bg-white p-6 shadow-9e-lg dark:bg-[#111d2c]">
            <h2 className="text-base font-bold text-9e-navy dark:text-white">ยืนยันการลบคำถาม</h2>
            <p className="mt-2 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ลบ <strong className="text-9e-navy dark:text-white">{truncate(confirmDelete.question_th, 50)}</strong>?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={busyId === confirmDelete._id} className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]">
                ยกเลิก
              </button>
              <button type="button" onClick={() => handleDelete(confirmDelete)} disabled={busyId === confirmDelete._id} className="rounded-9e-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                {busyId === confirmDelete._id ? 'กำลังลบ…' : 'ลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
