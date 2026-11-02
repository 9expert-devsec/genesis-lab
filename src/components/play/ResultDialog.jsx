'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Lightbulb, RotateCcw, Star } from 'lucide-react';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal shell for the two result cards: focus moves in on open, Tab cycles
 * inside, Esc calls onClose, and focus goes back where it came from on close.
 * z-70 so it paints above the site header (z-60, see test/pure/zIndexStack).
 */
function DialogShell({ labelledBy, onClose, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    const first = panelRef.current?.querySelector(FOCUSABLE);
    first?.focus();
    return () => {
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, []);

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...(panelRef.current?.querySelectorAll(FOCUSABLE) || [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center overflow-y-auto bg-[#060E17]/80 px-4 py-24 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
        className="relative w-full max-w-[440px]"
      >
        {children}
      </div>
    </div>
  );
}

function StarRow({ stars, max = 3 }) {
  return (
    <div className="flex justify-center gap-2" role="img" aria-label={`ได้ ${stars} จาก ${max} ดาว`}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={i < stars ? 'h-10 w-10 fill-[#D4F73F] text-[#D4F73F]' : 'h-10 w-10 text-[#D4F73F]/40'}
          strokeWidth={1.75}
        />
      ))}
    </div>
  );
}

export function MissionCompleteDialog({ level, stars, xp, secrets, nextHref, nextLabel, coursesHref, onClose }) {
  return (
    <DialogShell labelledBy="play-complete-title" onClose={onClose}>
      <div className="relative mt-20 rounded-[24px] border border-[#D4F73F]/30 bg-[#132638] px-6 pb-6 pt-28 text-center text-white shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <Image
          src="/play/mascot-thumbs-up.webp"
          alt=""
          width={360}
          height={400}
          className="absolute -top-24 left-1/2 h-auto w-44 -translate-x-1/2"
          priority
        />
        <h2 id="play-complete-title" className="font-en font-bold uppercase leading-none tracking-wide">
          <span className="block text-2xl text-white/80">Mission</span>
          <span className="block text-5xl text-[#D4F73F]">Complete!</span>
        </h2>
        <div className="mt-5">
          <StarRow stars={stars} />
        </div>
        <p className="mt-4">
          <span className="inline-block rounded-full bg-[#D4F73F] px-4 py-1 font-en text-lg font-bold text-[#0D1B2A]">
            +{xp} XP
          </span>
        </p>

        <div className="mt-6 rounded-[16px] bg-white/5 p-4 text-left">
          <p className="font-en text-xs font-bold uppercase tracking-widest text-[#48B0FF]">What you learned</p>
          <p className="mt-1 text-[15px] leading-relaxed text-white/90">{level.learn}</p>
        </div>

        {secrets.length > 0 && (
          <div className="mt-3 rounded-[16px] bg-white/5 p-4 text-left">
            <p className="font-en text-xs font-bold uppercase tracking-widest text-[#48B0FF]">
              Secret formulas <span className="font-thai normal-case tracking-normal text-white/60">· สูตรอื่นที่ได้ผลเหมือนกัน</span>
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {secrets.map((s) => (
                <li key={`${s.anchor}:${s.formula}`} className="rounded-[8px] bg-[#0D1B2A] px-2.5 py-1 font-mono text-sm text-[#D4F73F]">
                  {s.anchor ? <span className="mr-1.5 text-white/40">{s.anchor}</span> : null}
                  {s.formula}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={nextHref}
            className="flex-1 rounded-full bg-[#D4F73F] px-5 py-3 font-bold text-[#0D1B2A] transition-colors hover:bg-[#D8F852] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {nextLabel}
          </Link>
          <Link
            href={coursesHref}
            className="flex-1 rounded-full border border-white/30 px-5 py-3 font-bold text-white transition-colors hover:border-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            ดูหลักสูตร Excel
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 text-sm text-white/50 underline-offset-4 hover:text-white hover:underline"
        >
          อยู่ที่ด่านนี้ต่อ
        </button>
      </div>
    </DialogShell>
  );
}

export function AlmostThereDialog({ message, canHint, onRetry, onHint }) {
  return (
    <DialogShell labelledBy="play-almost-title" onClose={onRetry}>
      <div className="relative mt-16 rounded-[24px] border border-[#48B0FF]/40 bg-[#132638] px-6 pb-6 pt-24 text-center text-white shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <Image
          src="/play/mascot-pleading.webp"
          alt=""
          width={360}
          height={400}
          className="absolute -top-20 left-1/2 h-auto w-36 -translate-x-1/2"
        />
        <h2 id="play-almost-title" className="font-en text-4xl font-bold uppercase leading-none text-[#48B0FF]">
          Almost there!
        </h2>
        <p className="mt-4 font-heading text-lg font-bold">{message.headline}</p>
        {message.formula && (
          <p className="mt-3 rounded-[12px] bg-white/5 px-4 py-3 text-[15px] leading-relaxed text-white/85">
            ผลของคุณ <code className="font-mono text-[#48B0FF]">{message.formula}</code>
            {' '}→ ได้ <strong className="text-red-300">{message.got}</strong>
            {' '}แต่ต้องได้ <strong className="text-[#22C55E]">{message.want}</strong>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#D4F73F] px-5 py-3 font-bold text-[#0D1B2A] transition-colors hover:bg-[#D8F852] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            ลองใหม่
          </button>
          <button
            type="button"
            onClick={onHint}
            disabled={!canHint}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-[#48B0FF] px-5 py-3 font-bold text-[#48B0FF] transition-colors hover:bg-[#48B0FF]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Lightbulb className="h-4 w-4" aria-hidden="true" />
            {canHint ? 'ขอคำใบ้' : 'ใช้คำใบ้ครบแล้ว'}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
