'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Star } from 'lucide-react';
import {
  deleteFeaturedReview,
  updateFeaturedReview,
} from '@/lib/actions/featured-reviews';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';

export function FeaturedReviewList({ items: initial }) {
  async function persistReorder(newOrder, prevOrder) {
    const prevIndex = new Map(prevOrder.map((c, idx) => [c._id, idx]));
    const updates = newOrder
      .map((c, newIdx) => {
        const wasIdx = prevIndex.get(c._id);
        if (wasIdx === newIdx) return null;
        const fd = new FormData();
        fd.set('sort_order', String(newIdx));
        fd.set('active', String(c.active));
        return updateFeaturedReview(c._id, fd);
      })
      .filter(Boolean);
    if (updates.length > 0) await Promise.all(updates);
  }

  const {
    items,
    setItems,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(initial, async (next, prev) => {
    setItems(next.map((c, idx) => ({ ...c, sort_order: idx })));
    setBusyId('__reorder__');
    try {
      await persistReorder(next, prev);
    } finally {
      setBusyId(null);
    }
  });

  const [busyId, setBusyId] = useState(null);
  const [, startTransition] = useTransition();

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
      await updateFeaturedReview(item._id, fd);
      setItems(
        items.map((c) =>
          c._id === item._id ? { ...c, active: !c.active } : c
        )
      );
      setBusyId(null);
    });
  }

  async function handleReorder(item, direction) {
    const idx = items.findIndex((c) => c._id === item._id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    const a = items[idx];
    const b = items[swapIdx];

    const fdA = new FormData();
    fdA.set('sort_order', String(b.sort_order));
    fdA.set('active', String(a.active));
    const fdB = new FormData();
    fdB.set('sort_order', String(a.sort_order));
    fdB.set('active', String(b.active));

    setBusyId(item._id);
    startTransition(async () => {
      await Promise.all([
        updateFeaturedReview(a._id, fdA),
        updateFeaturedReview(b._id, fdB),
      ]);
      const next = [...items];
      next[idx] = { ...a, sort_order: b.sort_order };
      next[swapIdx] = { ...b, sort_order: a.sort_order };
      setItems(next.sort((x, y) => x.sort_order - y.sort_order));
      setBusyId(null);
    });
  }

  return (
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
