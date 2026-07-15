import { slotsOf } from './containerSlots';

/**
 * Client-safe signature of a tree's data-backed references (2C.2a).
 *
 * The canvas re-fetches resolved data only when the REFERENCES change — not on
 * every keystroke. This produces a stable string of just the data refs, so the
 * editor can diff it and skip refetching when an author is only editing, say, a
 * heading's text.
 *
 * Deliberately pure and dependency-light (only `slotsOf`): it runs in the client
 * bundle, so it must NOT reach into resolveSectionData.js — that module imports
 * the MSDB adapters and local-Mongo reads and is server-only. This is the
 * client's half of the same knowledge; the two must list the same types.
 */
const DATA_BACKED = new Set([
  'course_card', 'instructor_card', 'course_selector', 'bundle_courses', 'course_list',
  'course_schedule',
]);

export function dataRefSignature(sections) {
  const parts = [];
  const walk = (arr) => {
    for (const s of Array.isArray(arr) ? arr : []) {
      if (!s || typeof s !== 'object') continue;
      if (DATA_BACKED.has(s.type)) {
        const c = s.content ?? {};
        // Every field the resolver reads to CHOOSE what to fetch must be here, or
        // the canvas sample goes stale when the author changes it. 2C.2b: the
        // derived course_list keys off `source` + `filter`, and course_schedule
        // off `courseId` (already covered) — both added so switching a list to a
        // skill filter, or retargeting a schedule, refetches the sample.
        parts.push([
          s.id, s.type,
          c.courseId ?? '', c.instructorId ?? '',
          (Array.isArray(c.courseIds) ? c.courseIds : []).join(','),
          c.limit ?? 0,
          c.source ?? '', c.filter ?? '',
        ].join('|'));
      }
      const slots = slotsOf(s.type);
      if (slots) for (const slot of slots) walk(s.content?.[slot]);
    }
  };
  walk(sections);
  return parts.join('~');
}
