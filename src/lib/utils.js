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
 * Build a course slug URL. Legacy pattern: /<slug>-training-course
 */
export function courseHref(slug) {
  return `/${slug}-training-course`;
}

/**
 * Build a career path slug URL. Legacy pattern: /<slug>-career-path
 */
export function careerPathHref(slug) {
  return `/${slug}-career-path`;
}

/**
 * Build a catalog URL. Legacy pattern: /<slug>-all-courses
 */
export function catalogHref(slug) {
  return `/${slug}-all-courses`;
}
