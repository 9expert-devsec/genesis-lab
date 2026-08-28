'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { Star } from 'lucide-react';
import {
  deleteFeaturedReview,
  updateFeaturedReview,
} from '@/lib/actions/featured-reviews';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import { useAddedRowSink } from '@/app/admin/_components/AddedRowChannel';
import { insertFeaturedRow } from '@/lib/featuredListOrder';

/**
 * DEFERRED (STAGED) REORDER — same shape as
 * featured-courses/_components/FeaturedCourseList.jsx, which itself matches
 * courses/_components/CoursesAdminClient.jsx's ProgramGroupBody (dirty /
 * error / saving state, explicit save + cancel, resetItems on cancel). See
 * that file's header comment for the full reasoning; this is a near-
 * identical copy differing only in model and field names — the round that
 * introduced this deliberately did NOT extract a shared component while
 * also changing save semantics on three screens with no prior suite
 * baseline to catch a mistake (see the round's report for that reasoning).
 */
export function FeaturedReviewList({ items: initial }) {
  const {
    items,
    setItems,
    resetItems,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(initial, () => setDirty(true));

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const baselineRef = useRef(initial);

  const [pendingAdds, setPendingAdds] = useState([]);

  useAddedRowSink((doc) => {
    if (dirty) {
      setPendingAdds((cur) => [...cur, doc]);
      return;
    }
    setItems((cur) => {
      const next = insertFeaturedRow(cur, doc);
      baselineRef.current = next;
      return next;
    });
  });

  useEffect(() => {
    if (dirty || pendingAdds.length === 0) return;
    setItems((cur) => {
      let next = cur;
      for (const doc of pendingAdds) next = insertFeaturedRow(next, doc);
      baselineRef.current = next;
      return next;
    });
    setPendingAdds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  // beforeunload ONLY — a PARTIAL guard, stated plainly: it does not cover
  // Next.js client-side navigation. See FeaturedCourseList.jsx's header note
  // for why (ProgramGroupBody has no guard at all to copy; CourseForm.jsx's
  // is inline, not an exported/reusable hook).
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const [busyId, setBusyId] = useState(null);
  const [, startTransition] = useTransition();

  function cancel() {
    resetItems(baselineRef.current);
    setDirty(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const prevIndex = new Map(baselineRef.current.map((c, idx) => [c._id, idx]));
    const changed = items
      .map((c, newIdx) => ({ item: c, newIdx }))
      .filter(({ item, newIdx }) => prevIndex.get(item._id) !== newIdx);

    if (changed.length === 0) {
      baselineRef.current = items;
      setDirty(false);
      setSaving(false);
      return;
    }

    const results = await Promise.allSettled(
      changed.map(async ({ item, newIdx }, i) => {
        const fd = new FormData();
        fd.set('sort_order', String(newIdx));
        fd.set('active', String(item.active));
        fd.set('skipSync', i === 0 ? 'false' : 'true');
        const res = await updateFeaturedReview(item._id, fd);
        if (res?.ok === false) throw new Error(res.error || 'บันทึกไม่สำเร็จ');
        return item;
      })
    );

    const failed = results
      .map((r, i) => (r.status === 'rejected' ? changed[i].item : null))
      .filter(Boolean);

    if (failed.length > 0) {
      setError(
        `บันทึกลำดับไม่สำเร็จ ${failed.length} รายการ: `
        + failed.map((c) => c.review?.reviewerName || c.review_id).join(', ')
        + ' — ลองบันทึกอีกครั้ง'
      );
      setSaving(false);
      return;
    }

    const saved = items.map((c, idx) => ({ ...c, sort_order: idx }));
    setItems(saved);
    baselineRef.current = saved;
    setDirty(false);
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!confirm('ลบออกจาก featured?')) return;
    setBusyId(id);
    startTransition(async () => {
      await deleteFeaturedReview(id);
      setItems(items.filter((c) => c._id !== id));
      setBusyId(null);
    });
  }

  async function handleToggle(item) {
    const fd = new FormData();
    fd.set('sort_order', String(item.sort_order));
    fd.set('active', String(!item.active));
    setBusyId(item._id);
    startTransition(async () => {
      const res = await updateFeaturedReview(item._id, fd);
      if (res?.ok === false) {
        alert(res.error || 'สลับสถานะไม่สำเร็จ');
        setBusyId(null);
        return;
      }
      setItems(
        items.map((c) =>
          c._id === item._id ? { ...c, active: !c.active } : c
        )
      );
      setBusyId(null);
    });
  }

  function handleReorder(item, direction) {
    const idx = items.findIndex((c) => c._id === item._id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setItems(next);
    setDirty(true);
  }

  return (
    <div className="flex flex-col gap-3">
      {dirty && (
        <div className="flex flex-wrap items-center gap-3 rounded-9e-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="font-semibold">
            ยังไม่บันทึกลำดับ — การบันทึกจะเขียนตำแหน่งของรีวิวที่ถูกย้ายเท่านั้น
          </span>
          {pendingAdds.length > 0 && (
            <span>
              และมีรีวิวใหม่ {pendingAdds.length} รายการที่เพิ่มไว้ระหว่างนี้ —
              จะแสดงในตารางหลังบันทึกหรือยกเลิก
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-9e-action px-2.5 py-1 text-xs font-bold text-white hover:bg-9e-brand disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึกลำดับ'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="rounded border border-[var(--surface-border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--surface-border)] bg-9e-ice">
            <th className="w-10 px-2 py-3" aria-label="ลาก" />
            <th className="w-8 px-4 py-3 text-left font-bold text-9e-navy">#</th>
            <th className="px-4 py-3 text-left font-bold text-9e-navy">รีวิว</th>
            <th className="w-20 px-4 py-3 text-center font-bold text-9e-navy">
              Active
            </th>
            <th className="w-40 px-4 py-3 text-right font-bold text-9e-navy">
              จัดการ
            </th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-9e-slate-dp-50">
                ยังไม่มีรีวิว featured — เพิ่มจากรายการด้านบน
              </td>
            </tr>
          )}
          {items.map((c, i) => {
            const r = c.review;
            const isDragging = draggingIndex === i;
            const isDropTarget =
              dragOverIndex === i &&
              draggingIndex !== null &&
              draggingIndex !== i;
            return (
              <tr
                key={c._id}
                {...getDragProps(i)}
                className={
                  'border-b border-[var(--surface-border)] transition-all duration-150 last:border-0 ' +
                  (isDragging ? 'opacity-50 ring-2 ring-9e-action ' : '') +
                  (isDropTarget ? 'border-t-2 border-t-9e-action ' : '') +
                  (c.active
                    ? 'hover:bg-9e-ice/50'
                    : 'opacity-50 hover:bg-gray-50')
                }
              >
                <td className="px-2 py-3 align-middle">
                  <DragHandle />
                </td>
                <td className="px-4 py-3 text-center text-9e-slate-dp-50">{i + 1}</td>
                <td className="px-4 py-3">
                  {r ? (
                    <div className="flex items-start gap-3">
                      <Avatar src={r.avatarUrl} name={r.reviewerName} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-9e-navy">
                            {r.reviewerName}
                          </p>
                          {r.rating ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-bold text-amber-600">
                              <Star
                                className="h-3 w-3 fill-amber-400 text-amber-400"
                                strokeWidth={0}
                              />
                              {Number(r.rating).toFixed(1)}
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-9e-slate-dp-50">
                          {r.courseName}
                        </p>
                        <p className="line-clamp-1 text-xs text-9e-slate-lt-400/80 dark:text-9e-slate-dp-400/80">
                          {r.comment}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-red-500">
                      รีวิว {c.review_id} ไม่พบในระบบ (อาจถูกลบไปแล้ว)
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleToggle(c)}
                    disabled={busyId === c._id}
                    aria-label={c.active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                    className={`relative h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${
                      c.active ? 'bg-9e-action' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                        c.active ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleReorder(c, 'up')}
                      disabled={i === 0 || busyId === c._id}
                      className="rounded-9e-sm border border-gray-200 px-2 py-1 text-xs hover:bg-9e-ice disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorder(c, 'down')}
                      disabled={i === items.length - 1 || busyId === c._id}
                      className="rounded-9e-sm border border-gray-200 px-2 py-1 text-xs hover:bg-9e-ice disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c._id)}
                      disabled={busyId === c._id}
                      className="rounded-9e-sm border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                    >
                      {busyId === c._id ? '...' : 'ลบ'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function Avatar({ src, name }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  if (!src) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-9e-action text-sm font-bold text-white">
        {initial}
      </div>
    );
  }
  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-9e-ice">
      <Image
        src={src}
        alt={name ?? ''}
        fill
        sizes="36px"
        className="object-cover"
        unoptimized
        draggable={false}
      />
    </div>
  );
}
