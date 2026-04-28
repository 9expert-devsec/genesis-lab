'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Plus, Search, Star, X } from 'lucide-react';
import { addFeaturedReview } from '@/lib/actions/featured-reviews';

function idOf(r) {
  return String(r?._id ?? r?.id ?? '');
}

export function ReviewSelector({ reviews = [] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState(null);
  const [isPending, startTransition] = useTransition();

  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered =
    query.trim().length < 1
      ? reviews.slice(0, 8)
      : reviews
          .filter((r) => {
            const q = query.toLowerCase();
            return (
              r.reviewerName?.toLowerCase().includes(q) ||
              r.courseName?.toLowerCase().includes(q) ||
              r.headline?.toLowerCase().includes(q) ||
              r.comment?.toLowerCase().includes(q)
            );
          })
          .slice(0, 8);

  function handleSelect(review) {
    setSelected(review);
    setQuery(review.reviewerName ?? '');
    setOpen(false);
    setMessage(null);
  }

  function handleClear() {
    setSelected(null);
    setQuery('');
    setMessage(null);
    inputRef.current?.focus();
  }

  function handleAdd() {
    if (!selected) return;
    const fd = new FormData();
    fd.set('review_id', idOf(selected));

    startTransition(async () => {
      const result = await addFeaturedReview(fd);
      if (result.ok) {
        setMessage({
          type: 'ok',
          text: `เพิ่มรีวิวจาก "${selected.reviewerName}" สำเร็จแล้ว`,
        });
        setSelected(null);
        setQuery('');
        setTimeout(() => router.refresh(), 300);
      } else {
        setMessage({
          type: 'error',
          text: result.error ?? 'เกิดข้อผิดพลาด',
        });
      }
    });
  }

  return (
    <div className="space-y-3" ref={wrapRef}>
      <label className="block text-sm font-bold text-9e-navy">ค้นหารีวิว</label>

      <div className="relative">
        <div
          className={`flex items-center gap-2 rounded-9e-md border-2 px-3 transition-colors ${
            open
              ? 'border-9e-primary ring-2 ring-9e-primary/20'
              : 'border-gray-200 hover:border-9e-sky'
          }`}
        >
          <Search size={16} className="shrink-0 text-9e-slate" />

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="พิมพ์ชื่อผู้รีวิว, คอร์ส, หรือข้อความรีวิว"
            className="flex-1 bg-transparent py-2.5 text-sm text-9e-navy placeholder:text-9e-slate/60 focus:outline-none"
          />

          {query && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="ล้างการค้นหา"
              className="text-9e-slate transition-colors hover:text-9e-navy"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {open && filtered.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[420px] overflow-y-auto rounded-9e-md border border-gray-200 bg-white shadow-9e-md">
            {filtered.map((review) => (
              <button
                type="button"
                key={idOf(review)}
                onClick={() => handleSelect(review)}
                className="flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-9e-ice"
              >
                <Avatar
                  src={review.avatarUrl}
                  name={review.reviewerName}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-9e-navy">
                      {review.reviewerName}
                    </p>
                    <RatingBadge rating={review.rating} />
                  </div>
                  <p className="truncate text-xs text-9e-slate">
                    {review.courseName}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-9e-slate/80">
                    {review.headline ? `${review.headline} — ` : ''}
                    {review.comment}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {open && reviews.length === 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-9e-md border border-gray-200 bg-white px-4 py-3 text-sm text-9e-slate shadow-9e-md">
            ทุกรีวิวถูกเพิ่มไว้ในรายการแล้ว
          </div>
        )}

        {open && query.trim().length > 0 && filtered.length === 0 && reviews.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-9e-md border border-gray-200 bg-white px-4 py-3 text-sm text-9e-slate shadow-9e-md">
            ไม่พบรีวิวที่ค้นหา
          </div>
        )}
      </div>

      {selected && (
        <div className="flex items-start gap-3 rounded-9e-md border border-9e-sky/30 bg-9e-ice p-3">
          <Avatar
            src={selected.avatarUrl}
            name={selected.reviewerName}
            size={44}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-bold text-9e-navy">
                {selected.reviewerName}
              </p>
              <RatingBadge rating={selected.rating} />
            </div>
            <p className="truncate text-xs text-9e-slate">
              {selected.courseName}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-9e-slate/80">
              {selected.comment}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending}
            className="flex shrink-0 items-center gap-1.5 self-center rounded-9e-md bg-9e-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-9e-brand disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            {isPending ? 'กำลังเพิ่ม...' : 'เพิ่ม'}
          </button>
        </div>
      )}

      {message && (
        <p
          className={`text-xs font-medium ${
            message.type === 'ok' ? 'text-green-600' : 'text-red-500'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

function Avatar({ src, name, size = 36 }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  if (!src) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full bg-9e-primary text-white"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      >
        {initial}
      </div>
    );
  }
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-9e-ice"
      style={{ width: size, height: size }}
    >
      <Image src={src} alt={name ?? ''} fill sizes={`${size}px`} className="object-cover" unoptimized />
    </div>
  );
}

function RatingBadge({ rating }) {
  if (!rating) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-600">
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" strokeWidth={0} />
      {Number(rating).toFixed(1)}
    </span>
  );
}
