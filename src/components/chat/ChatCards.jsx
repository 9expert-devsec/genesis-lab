'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CHAT_MARK_ALT, CHAT_MARK_SRC } from '@/lib/chat/branding';
import {
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Clock3,
  User as UserIcon,
} from 'lucide-react';

/**
 * The card / carousel / chip pieces of the chat panel.
 *
 * Split out of review-app's single 968-line ChatWidget: these are presentation
 * for whatever the model sent back, and they change for entirely different
 * reasons than the panel's open/close/scroll-lock behaviour does.
 *
 * ── COLOURS ─────────────────────────────────────────────────────────────────
 * review-app has no dark mode and hardcodes bg-white / text-slate-900 /
 * border-slate-200 throughout. Every surface below is rewritten against this
 * repo's semantic tokens (--surface, --surface-muted, --surface-border,
 * --text-primary/-secondary/-muted), which already carry their own dark values,
 * so there are no `dark:` overrides to keep in sync. The two exceptions are the
 * thumbs-up/down states in ChatPanel, where the repo has no positive/negative
 * token and Tailwind's emerald/rose are used with explicit dark: variants.
 *
 * ── IMAGES ──────────────────────────────────────────────────────────────────
 * Raw <img> with the eslint-disable, per this repo's existing convention for
 * upstream card art. next/image is NOT an option here: it throws on any host
 * absent from next.config.mjs `remotePatterns`, and the model returns URLs from
 * hosts nobody has enumerated.
 */

export function cx(...a) {
  return a.filter(Boolean).join(' ');
}

export function cleanText(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPrice(s) {
  return cleanText(s) || 'สอบถามราคา';
}

function durationText(days, hours) {
  const d = Number(days || 0);
  const h = Number(hours || 0);
  if (!d && !h) return '';
  return `${d ? `${d} วัน` : ''}${d && h ? ' ' : ''}${h ? `${h} ชม.` : ''}`.trim();
}

export function formatTimeHM(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Smooth scrolling that a reduced-motion setting can actually turn off.
 *
 * The `prefers-reduced-motion` block in globals.css cannot reach this: it sets
 * `scroll-behavior: auto !important`, but `scrollBy({behavior:'smooth'})` is a
 * JS argument that OVERRIDES the CSS property. CSS has no say here at all, so
 * the check has to happen in JS.
 */
function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function scrollByPage(el, dir, fraction = 0.85) {
  if (!el) return;
  el.scrollBy({
    left: Math.round(el.clientWidth * fraction) * dir,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}

/* ── Small parts ─────────────────────────────────────────────────────────── */

/**
 * The assistant's avatar. ONE component, rendered by every row that shows it.
 *
 * It exists because the two rows had DRIFTED: the assistant message row drew the
 * mascot, and the typing row drew an empty circle — a placeholder carried over
 * verbatim from review-app, where it was also empty. The result was a blank
 * white disc for the whole time the model was composing, directly beneath rows
 * that showed the mascot correctly.
 *
 * The fix is NOT to paste the message row's markup into the typing row. Two
 * copies of one visual element is how they came apart in the first place, and
 * it is the same defect as a rule written in two places (see the chat rate
 * limiter's duplicated expiry). One component, two call sites, no copy.
 *
 * `alt=""` on purpose: the row it sits in already carries the speaker's name or
 * its status text, so announcing the logo again is noise.
 */
export function ChatAvatar() {
  return (
    <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--surface-muted)] ring-1 ring-[var(--surface-border)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={CHAT_MARK_SRC} alt="" className="h-5 w-5 object-contain" />
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="flex items-start gap-2">
      <ChatAvatar />
      <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-2 text-sm text-[var(--text-secondary)] shadow-9e-sm">
        <div className="flex items-center gap-1">
          {/* data-chat-typing is targeted by the reduced-motion block in
              globals.css — see the note there. */}
          <span data-chat-typing className="inline-block h-2 w-2 animate-bounce rounded-full bg-[var(--text-muted)] [animation-delay:-0.2s]" />
          <span data-chat-typing className="inline-block h-2 w-2 animate-bounce rounded-full bg-[var(--text-muted)] [animation-delay:-0.1s]" />
          <span data-chat-typing className="inline-block h-2 w-2 animate-bounce rounded-full bg-[var(--text-muted)]" />
          <span className="ml-2 text-xs text-[var(--text-muted)]">กำลังพิมพ์…</span>
        </div>
      </div>
    </div>
  );
}

const WELCOME_POINTS = [
  { icon: '🧩', label: 'เส้นทางอาชีพด้าน IT' },
  { icon: '🎓', label: 'คอร์สเรียนที่เหมาะสม' },
  { icon: '💡', label: 'ทักษะที่ต้องพัฒนา' },
];

const WELCOME_SUGGESTIONS = [
  'แนะนำคอร์ส Excel',
  'มีโปรโมชันอะไรบ้าง',
  'อยากเริ่มสาย Data ต้องเรียนอะไร',
];

export function WelcomeScreen({ onPick }) {
  return (
    <div className="grid h-full place-items-center px-5">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-[var(--surface-muted)] ring-1 ring-[var(--surface-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={CHAT_MARK_SRC} alt={CHAT_MARK_ALT} className="h-14 w-14 object-contain" />
        </div>

        <div className="mt-4 text-2xl font-extrabold text-[var(--text-primary)]">สวัสดีครับ!</div>
        <div className="mt-2 text-sm text-[var(--text-secondary)]">
          ผมคือ AI Agent พร้อมช่วยตอบคำถามเกี่ยวกับ
        </div>

        <div className="mx-auto mt-8 max-w-sm space-y-4 text-center">
          {WELCOME_POINTS.map((item) => (
            <div key={item.label} className="flex items-center justify-center gap-3">
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="text-sm font-medium text-[var(--text-muted)]">{item.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {WELCOME_SUGGESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onPick(q)}
              className="rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors duration-9e-micro hover:bg-[var(--surface-hover)]"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="mt-6 text-xs text-[var(--text-muted)]">พิมพ์คำถามของคุณด้านล่างได้เลย!</div>
      </div>
    </div>
  );
}

/* ── Quick replies ───────────────────────────────────────────────────────── */

function normalizeQuickItem(x) {
  if (!x) return null;
  if (typeof x === 'string') {
    const label = cleanText(x);
    return label ? { label, value: label } : null;
  }
  const label = cleanText(x.label || x.text || x.value || '');
  if (!label) return null;
  const count = x.count != null ? Number(x.count) : null;
  return {
    label: count != null && !Number.isNaN(count) ? `${label} (${count})` : label,
    value: x.value || x.text || x.label || label,
  };
}

export function QuickChatBar({ items, onPick }) {
  const scRef = useRef(null);
  const [progress, setProgress] = useState(0);

  const list = useMemo(
    () => (Array.isArray(items) ? items : []).map(normalizeQuickItem).filter(Boolean),
    [items],
  );

  useEffect(() => {
    const el = scRef.current;
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setProgress(max <= 0 ? 0 : el.scrollLeft / max);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    return () => el.removeEventListener('scroll', update);
  }, [list.length]);

  if (list.length === 0) return null;

  return (
    <div className="relative">
      <ArrowButton side="left" onClick={() => scrollByPage(scRef.current, -1)} label="เลื่อนซ้าย" inset="-6px" />
      <ArrowButton side="right" onClick={() => scrollByPage(scRef.current, 1)} label="เลื่อนขวา" inset="-6px" />

      <div
        ref={scRef}
        className="flex gap-2 overflow-x-auto pb-2 pr-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {list.map((it, idx) => (
          <button
            key={`${it.label}_${idx}`}
            type="button"
            onClick={() => onPick(it.value)}
            title={it.label}
            className="shrink-0 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors duration-9e-micro hover:bg-[var(--surface-hover)]"
          >
            {it.label}
          </button>
        ))}
      </div>

      <div className="h-1 w-full rounded-full bg-[var(--surface-muted)]">
        <div
          className="h-1 rounded-full bg-9e-gradient-hero"
          style={{ width: `${Math.max(8, progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

function ArrowButton({ side, onClick, label, inset = '-10px' }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={side === 'left' ? { left: inset } : { right: inset }}
      className="absolute top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-[var(--surface-raised)] p-1.5 text-[var(--text-secondary)] shadow-9e-md ring-1 ring-[var(--surface-border)] transition-colors duration-9e-micro hover:bg-[var(--surface-hover)] md:inline-flex"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

/* ── Cards ───────────────────────────────────────────────────────────────── */

const CARD_SHELL =
  'h-full overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] shadow-9e-sm transition duration-9e-micro hover:-translate-y-0.5 hover:shadow-9e-md';

const PILL = 'inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2 py-1';

const OVERLAY_BADGE =
  'rounded-full bg-[var(--surface)]/90 px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] ring-1 ring-[var(--surface-border)]';

export function CourseCard({ item }) {
  if (!item) return null;

  const title = cleanText(item.title || item.name || '');
  const desc = cleanText(item.description || '');
  const instructor = cleanText(item.instructor || '');
  const img = cleanText(item.image_url || item.imageUrl || '');
  const url = cleanText(item.course_url || item.url || item.link || '');
  const price = cleanPrice(item.price);
  const dur = durationText(item.training_days, item.training_hours);

  return (
    <div className={CARD_SHELL}>
      {/* NO OVERLAY CHIPS ON THE COVER — this is deliberate, do not add them back.
          review-app stamped the course code and the level over the top-left of
          the artwork. Measured against the real catalogue (77 public + 19
          e-learning courses, samples inspected by eye): every cover already
          bakes the level in, so the chips added nothing and cost legibility.
            · classroom covers (courses/covers) — "N Days" and the level, in
              type, bottom-left; the 9Expert logo top-RIGHT.
            · e-learning covers (online/covers)  — the level as a tag chip in the
              middle band; the 9Expert logo top-CENTRE, which is exactly what a
              two-chip row at left-3 top-3 grows into. That collision is the
              reported bug, and it is why removing beat repositioning. */}
      <div className="bg-[var(--surface-muted)]">
        <div className="aspect-[16/9] w-full">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={title} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="h-full w-full" />
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</div>
        {desc ? (
          <div className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{desc}</div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
          {dur ? (
            <span className={PILL}>
              <Clock3 className="h-3.5 w-3.5" />
              {dur}
            </span>
          ) : null}
          {instructor ? (
            <span className={PILL}>
              <UserIcon className="h-3.5 w-3.5" />
              {instructor}
            </span>
          ) : null}
          <span className={PILL}>
            <Banknote className="h-3.5 w-3.5" />
            {price}
          </span>
        </div>

        <div className="mt-4">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-9e-action hover:underline dark:text-9e-air"
            >
              คลิกเพื่อดูรายละเอียด
              <ArrowUpRight className="h-4 w-4" />
            </a>
          ) : (
            <span className="text-sm font-semibold text-[var(--text-muted)]">กรุณาติดต่อสอบถาม</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Featured/pinned first, then an explicit order field, then newest, then the
 * order it arrived in. Ported as-is: the upstream sends any of four different
 * names for "order" and three for "featured", which is the same instability the
 * chatClient's chains exist for.
 */
export function sortPromotions(items) {
  const arr = Array.isArray(items) ? items : [];
  const decorated = arr.map((p, idx) => ({ p, idx }));
  const asNum = (v, fallback = 999999) => {
    const n = Number(v);
    return Number.isNaN(n) ? fallback : n;
  };
  const asTime = (v) => {
    const t = new Date(v || 0).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const isFeatured = (p) => !!(p?.isFeatured || p?.featured || p?.pinned || p?.isPinned);

  decorated.sort((a, b) => {
    const fa = isFeatured(a.p) ? 0 : 1;
    const fb = isFeatured(b.p) ? 0 : 1;
    if (fa !== fb) return fa - fb;

    const oa = asNum(a.p.displayOrder ?? a.p.order ?? a.p.priority ?? a.p.rank);
    const ob = asNum(b.p.displayOrder ?? b.p.order ?? b.p.priority ?? b.p.rank);
    if (oa !== ob) return oa - ob;

    const ta = Math.max(asTime(a.p.publishedAt), asTime(a.p.updatedAt), asTime(a.p.createdAt));
    const tb = Math.max(asTime(b.p.publishedAt), asTime(b.p.updatedAt), asTime(b.p.createdAt));
    if (ta !== tb) return tb - ta;

    return a.idx - b.idx;
  });

  return decorated.map((x) => x.p);
}

export function PromotionCard({ item }) {
  if (!item) return null;

  const title = cleanText(item.title || item.name || 'Promotion');
  const desc = cleanText(item.description || item.desc || '');
  const badge = cleanText(item.badge || item.tag || '');
  const img = cleanText(item.image_url || item.imageUrl || item.cover || '');
  const url = cleanText(item.url || item.link || '');

  return (
    <div className={CARD_SHELL}>
      {img ? (
        <div className="relative bg-[var(--surface-muted)]">
          <div className="aspect-[16/9] w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt={title} className="h-full w-full object-cover" loading="lazy" />
          </div>
          {badge ? <div className={`absolute left-3 top-3 ${OVERLAY_BADGE}`}>{badge}</div> : null}
        </div>
      ) : null}

      <div className="p-4">
        <div className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</div>
        {desc ? (
          <div className="mt-1 line-clamp-3 text-sm text-[var(--text-secondary)]">{desc}</div>
        ) : null}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-9e-action hover:underline dark:text-9e-air"
          >
            ดูรายละเอียด
            <ArrowUpRight className="h-4 w-4" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

/* ── Carousels ───────────────────────────────────────────────────────────── */

function Carousel({ items, keyOf, widthClass, render }) {
  const ref = useRef(null);
  if (!Array.isArray(items) || items.length === 0) return null;

  // One card has nothing to page to, so the chevrons would be two controls that
  // visibly do nothing. Shared by BOTH carousels — the course and promotion
  // lists differ only in card width and key, which is why one guard fixes both.
  const pageable = items.length > 1;

  return (
    <div className="relative pt-2">
      {pageable ? (
        <>
          <ArrowButton side="left" onClick={() => scrollByPage(ref.current, -1, 0.9)} label="ก่อนหน้า" />
          <ArrowButton side="right" onClick={() => scrollByPage(ref.current, 1, 0.9)} label="ถัดไป" />
        </>
      ) : null}
      <div
        ref={ref}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pr-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <div key={keyOf(item, i)} className={`shrink-0 snap-start ${widthClass}`}>
            {render(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CourseCarousel({ items }) {
  return (
    <Carousel
      items={items}
      keyOf={(c, i) => c.course_id || c.id || c._id || i}
      widthClass="w-[85vw] max-w-[360px] sm:w-[320px] md:w-[340px]"
      render={(c) => <CourseCard item={c} />}
    />
  );
}

export function PromotionCarousel({ items }) {
  return (
    <Carousel
      items={items}
      keyOf={(p, i) => p.id || p._id || i}
      widthClass="w-[88vw] max-w-[420px] sm:w-[360px] md:w-[420px]"
      render={(p) => <PromotionCard item={p} />}
    />
  );
}
