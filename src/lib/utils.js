import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toKebab } from '@/lib/slug';

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
 * Build the public URL for a program.
 *
 * An admin-set custom `urlSlug` (from ProgramPageConfig, passed in as
 * `slugMap` keyed by the lower-cased id) renders at the bare slug — no
 * /program prefix. Programs without one fall back to the legacy
 * /program/<kebab-of-name> path, which resolvePageSlug still resolves.
 *
 * Consolidated from three near-identical copies (public header mega-menu,
 * home ProgramSelector, and a third route since removed). Verified against
 * live data at consolidation time: all 27 programs produced byte-identical
 * URLs at all three copies; two call sites remain.
 *
 * @param {object} program  needs `program_id` / `_id` / `program_name`
 * @param {Record<string,string>} slugMap  lower-cased id → urlSlug
 */
export function programHref(program, slugMap = {}) {
  if (!program) return '/training-course';
  for (const id of [program.program_id, program._id]) {
    if (!id) continue;
    const custom = slugMap[String(id).toLowerCase()];
    if (custom) return `/${custom}`;
  }
  return `/program/${toKebab(program.program_name)}`;
}

/**
 * Build the public URL for a skill. Same contract as programHref.
 *
 * THE ID IS NOT ONE FIELD, AND THE MAP IS KEYED BY THE CODE.
 * `SkillPageConfig.skillId` holds the upstream skill CODE ("AI",
 * "POWERPLATFORM", "DEV") — the admin page-config editor writes
 * `String(skill.skill_id ?? skill._id)`, and every live skill has a
 * `skill_id`, so in practice the key is always the code. Verified against
 * the live collection: 0 of 6 skill keys and 0 of 27 program keys are
 * ObjectId-shaped.
 *
 * Callers hand us three different shapes, and none of them carries every
 * id, which is why all four are tried:
 *   - config/site.js entries: `upstreamId` (ObjectId), `upstreamCode`, `slug`
 *   - /skills API items:      `_id`, `skill_id`, `skill_name`
 *   - course.skills subdocs:  `_id`, `skill_id`, `skill_name`
 *
 * PRECEDENCE is first-match-wins in the order below, and it is unambiguous
 * because the two key spaces are disjoint: a 24-hex ObjectId can never
 * equal a short upstream code. For `upstreamId` and `upstreamCode` to
 * select DIFFERENT configs you would need two config rows for one skill —
 * one keyed by its ObjectId, one by its code — and the editor writes
 * exactly one id per skill, preferring the code. Measured today: 0 such
 * collisions.
 *
 * `upstreamCode` is in the list because without it every caller passing a
 * config/site.js entry — the header mega-menu among them — emitted
 * `/skill/<slug>`, which 308-redirects at best and 404s at worst
 * (`/skill/programming` resolved to nothing at all).
 *
 * The fallback prefers an explicit `slug` — config/site.js entries have
 * one and it does NOT always equal the kebab-cased name ("Development"
 * is configured as "programming") — before deriving one from the name.
 *
 * @param {object} skill  any of `upstreamId` / `_id` / `skill_id` /
 *                        `upstreamCode`, plus `slug` or `skill_name` /
 *                        `label` for the fallback
 * @param {Record<string,string>} slugMap  lower-cased id → urlSlug
 */
export function skillHref(skill, slugMap = {}) {
  if (!skill) return '/training-course';
  for (const id of [skill.upstreamId, skill._id, skill.skill_id, skill.upstreamCode]) {
    if (!id) continue;
    const custom = slugMap[String(id).toLowerCase()];
    if (custom) return `/${custom}`;
  }
  return `/skill/${skill.slug || toKebab(skill.skill_name ?? skill.label)}`;
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

/** Lower-cased ids a program/skill could be keyed by in a linkability map. */
function candidateIds(entity) {
  return [
    entity?.upstreamId, entity?.program_id, entity?.skill_id,
    entity?.upstreamCode, entity?._id,
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
}

/**
 * Href for a chip, or null when it must stay a plain <span>.
 *
 * `kind` selects which half of the linkability result to consult; `hrefFor`
 * is the shared programHref/skillHref so the URL shape stays in one place.
 */
export function chipHref(entity, kind, linkability, hrefFor) {
  if (!entity) return null;
  const blocked = kind === 'program' ? linkability.programBlocked : linkability.skillBlocked;
  if (candidateIds(entity).some((id) => blocked.has(id))) return null;
  const slugMap = kind === 'program' ? linkability.programSlugs : linkability.skillSlugs;
  return hrefFor(entity, slugMap) ?? null;
}
