/**
 * Programs per instructor — the rules, kept pure so the admin form, the save
 * action and the /about-us loader share one definition and tests can pin it.
 *
 * Instructor.programs holds MSDB program _ids (strings), in the admin's
 * selection order. MSDB is the master: /admin/instructors dual-writes the list
 * upstream. Upstream /instructors returns `programs` POPULATED (objects with
 * _id, program_id, program_name, programiconurl); the local mirror keeps ids.
 *
 * ── NEVER WIPE ──────────────────────────────────────────────────────────────
 * The form used to have no programs field, yet the save read
 * getAll('programs') — an empty list — and sent `programs: []` upstream on
 * every save, erasing whatever MSDB held. Now:
 *   · the form ALWAYS sends the picker's value plus a `programs_present`
 *     marker, and the picker starts from the value MSDB holds (initialProgramIds),
 *     so an untouched picker re-sends exactly what was loaded;
 *   · a submission WITHOUT the marker keeps the stored value (resolveSubmittedPrograms).
 */

import { chipHref, programHref } from '@/lib/utils';

export const MAX_PROGRAMS = 12;
export const PROGRAMS_PRESENT_KEY = 'programs_present';

/** An _id string from either a plain id or a populated upstream program object. */
export function programIdOf(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string') return entry.trim();
  return String(entry._id ?? entry.id ?? '').trim();
}

const ids = (list) => (Array.isArray(list) ? list.map(programIdOf).filter(Boolean) : []);

/**
 * The picker's starting value: what MSDB holds for a linked instructor
 * (matched by instructor_id), else the local mirror's list.
 */
export function initialProgramIds({ local, upstream }) {
  if (upstream && Array.isArray(upstream.programs)) return ids(upstream.programs);
  return ids(local?.programs);
}

/**
 * Write the picker's value into the FormData the save action reads: the
 * marker, then one `programs` entry per id in order. Used for every save, so
 * an untouched picker sends back the value it was opened with.
 */
export function appendProgramsToForm(fd, selectedIds) {
  fd.set(PROGRAMS_PRESENT_KEY, '1');
  for (const id of ids(selectedIds)) fd.append('programs', id);
  return fd;
}

/**
 * Server-side decision for a save.
 *
 * @param {{ present: boolean, submitted: unknown[], current: unknown[],
 *   validIds: Set<string>|null }} input
 *   validIds — the MSDB program _ids that exist; null when the upstream list
 *   could not be read.
 * @returns {{ ok: true, programs: string[] } | { ok: false, error: string }}
 */
export function resolveSubmittedPrograms({ present, submitted, current, validIds }) {
  const kept = ids(current);
  if (!present) return { ok: true, programs: kept };

  const list = [...new Set(ids(submitted))];
  if (list.length > MAX_PROGRAMS) {
    return { ok: false, error: `เลือกโปรแกรมได้ไม่เกิน ${MAX_PROGRAMS} รายการ` };
  }
  if (!validIds) {
    // Cannot check the ids: accept only an unchanged list.
    const same = list.length === kept.length && list.every((id, i) => id === kept[i]);
    return same
      ? { ok: true, programs: kept }
      : { ok: false, error: 'ตรวจสอบรายการโปรแกรมไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง' };
  }
  const unknown = list.filter((id) => !validIds.has(id));
  if (unknown.length) {
    return { ok: false, error: `ไม่พบโปรแกรม: ${unknown.join(', ')}` };
  }
  return { ok: true, programs: list };
}

/**
 * Upstream /programs items → { id, code, name, iconUrl } options, list order.
 * `code` is the upstream program_id ("POWER-BI") — page configs may be keyed
 * by it, so the card link needs it alongside the _id.
 */
export function toProgramOptions(items) {
  return (Array.isArray(items) ? items : [])
    .map((p) => ({
      id: programIdOf(p),
      code: String(p?.program_id ?? '').trim(),
      name: String(p?.program_name ?? p?.name ?? '').trim(),
      iconUrl: String(p?.programiconurl ?? p?.program_icon ?? p?.icon_url ?? '').trim(),
    }))
    .filter((p) => p.id && p.name);
}

/**
 * An instructor's programs for display: ids → { name, iconUrl } in the
 * stored order, dropping ids that no longer resolve or have no icon.
 */
export function resolveInstructorPrograms(programIds, options) {
  return resolvedOptions(programIds, options).map(({ name, iconUrl }) => ({ name, iconUrl }));
}

function resolvedOptions(programIds, options) {
  const byId = new Map((options ?? []).map((o) => [o.id, o]));
  return ids(programIds)
    .map((id) => byId.get(id))
    .filter((o) => o && o.iconUrl);
}

/**
 * The program's course-listing page, by the site's one rule for program links
 * (chipHref + programHref, as the course page's program chip uses): its
 * admin-set slug (`/power-bi-all-courses`), else the legacy
 * `/program/<kebab-name>` path, and NULL when its page is explicitly
 * unpublished — that icon renders as a plain image.
 *
 * @param {{ id: string, code?: string, name: string }} option
 * @param {{ programSlugs: object, programBlocked: Set<string> }} linkability
 *   getPageLinkability()'s result
 */
export function programCardHref(option, linkability) {
  if (!option || !linkability) return null;
  return chipHref(
    { _id: option.id, program_id: option.code || undefined, program_name: option.name },
    'program',
    { ...linkability, skillSlugs: {}, skillBlocked: new Set() },
    programHref
  );
}

/** resolveInstructorPrograms, plus each program's listing link (or null). */
export function instructorProgramLinks(programIds, options, linkability) {
  return resolvedOptions(programIds, options).map((o) => ({
    name: o.name,
    iconUrl: o.iconUrl,
    href: programCardHref(o, linkability),
  }));
}
