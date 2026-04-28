'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Star } from 'lucide-react';
import {
  deleteFeaturedReview,
  updateFeaturedReview,
} from '@/lib/actions/featured-reviews';

export function FeaturedReviewList({ items: initial }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState(null);
  const [, startTransition] = useTransition();

  async function handleDelete(id) {
    if (!confirm('ลบออกจาก featured?')) return;
    setBusyId(id);
    startTransition(async () => {
      await deleteFeaturedReview(id);
      setItems((prev) => prev.filter((c) => c._id !== id));
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
      setItems((prev) =>
        prev.map((c) =>
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
      setItems((prev) => {
        const next = [...prev];
        next[idx] = { ...a, sort_order: b.sort_order };
        next[swapIdx] = { ...b, sort_order: a.sort_order };
        return next.sort((x, y) => x.sort_order - y.sort_order);
      });
      setBusyId(null);
    });
  }

  return (
    <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--surface-border)] bg-9e-ice">
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
              <td colSpan={4} className="py-8 text-center text-9e-slate">
                ยังไม่มีรีวิว featured — เพิ่มจากรายการด้านบน
              </td>
            </tr>
          )}
          {items.map((c, i) => {
            const r = c.review;
            return (
              <tr
                key={c._id}
                className={
                  c.active
                    ? 'border-b border-[var(--surface-border)] transition-colors last:border-0 hover:bg-9e-ice/50'
                    : 'border-b border-[var(--surface-border)] opacity-50 transition-colors last:border-0 hover:bg-gray-50'
                }
              >
                <td className="px-4 py-3 text-center text-9e-slate">{i + 1}</td>
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
                        <p className="truncate text-xs text-9e-slate">
                          {r.courseName}
                        </p>
                        <p className="line-clamp-1 text-xs text-9e-slate/80">
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
                      c.active ? 'bg-9e-primary' : 'bg-gray-300'
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
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-9e-primary text-sm font-bold text-white">
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
      />
    </div>
  );
}
