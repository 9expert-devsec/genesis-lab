import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names, resolving conflicts (later wins).
 * This is the standard Shadcn/UI utility — used throughout components.
 *
 * @example
 *   cn('px-2 py-1', props.className)
 *   // → 'px-2 py-1' (or merged with incoming className)
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date range like "15–18 Jan 2026" for schedule display.
 * Handles same-day, same-month, and cross-month ranges.
 *
 * @param {Date|string} from
 * @param {Date|string} to
 * @param {string} locale — default 'th-TH'
 */
export function formatDateRange(from, to, locale = 'th-TH') {
  const d1 = new Date(from);
  const d2 = new Date(to);
  const fmt = (d, opts) =>
    d.toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', ...opts });

  if (d1.toDateString() === d2.toDateString()) {
    return fmt(d1, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) {
    return `${fmt(d1, { day: 'numeric' })}–${fmt(d2, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `${fmt(d1, { day: 'numeric', month: 'short' })} – ${fmt(d2, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/**
 * Format currency in THB. Upstream sends numeric prices.
 */
export function formatPrice(n) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(Number(n));
}

/**
 * Build a course URL. Legacy pattern: /<slug>-training-course.
 *
 * Idempotent: `slug` may or may not already include the '-training-course'
 * suffix; we handle both cases so upstream changes don't break links.
 */
export function courseHref(slug) {
  if (!slug) return '/training-course';
  const s = String(slug);
  return s.endsWith('-training-course') ? `/${s}` : `/${s}-training-course`;
}

/**
 * Build a career path URL. Legacy pattern: /<slug>-career-path.
 *
 * Upstream's `slug` field already contains the '-career-path' suffix
 * (e.g. "prompt-engineer-career-path"), so this helper is idempotent
 * to avoid producing /foo-career-path-career-path.
 */
export function careerPathHref(slug) {
  if (!slug) return '/career-path-project';
  const s = String(slug);
  return s.endsWith('-career-path') ? `/${s}` : `/${s}-career-path`;
}

/**
 * Build a catalog URL. Legacy pattern: /<slug>-all-courses.
 *
 * Idempotent for the same reason as courseHref / careerPathHref.
 */
export function catalogHref(slug) {
  if (!slug) return '/training-course';
  const s = String(slug);
  return s.endsWith('-all-courses') ? `/${s}` : `/${s}-all-courses`;
}

/**
 * Format training duration for display.
 *
 * The detail response (/public-course?course_id=X) includes both
 * `course_trainingdays` and `course_traininghours` — prefer the
 * explicit hours field when present. The list response omits
 * `course_traininghours`, so we fall back to `days * 6` (9Expert's
 * standard is 6 hours per training day).
 *
 * Accepts either a course object or a raw day count (legacy callers).
 */
export function formatDuration(input) {
  if (typeof input === 'object' && input !== null) {
    const days = input.course_trainingdays ?? input.trainingDays;
    const hours = input.course_traininghours ?? input.trainingHours;
    if (!days || days < 1) return '';
    if (hours) return `${days} วัน (${hours} ชม.)`;
    return `${days} วัน (${days * 6} ชม.)`;
  }
  const days = Number(input);
  if (!days || days < 1) return '';
  return `${days} วัน (${days * 6} ชม.)`;
}
