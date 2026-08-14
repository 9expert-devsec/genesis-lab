/**
 * The /admin/courses table, folded into one folder per program, with each
 * course's stored position beside it.
 *
 * ── THE NUMBER IS AN ARRAY INDEX, NOT A FIELD ──────────────────────────────
 * `ProgramOrder.courseOrder` is an ORDERED LIST OF CODES. No course carries a
 * number, and there is nothing to read off a course document — the displayed
 * ลำดับ is `indexOf(code) + 1` in its own program's list, which is why it
 * restarts at 1 in every folder. That is not a presentation choice; it is what
 * the stored value means. See lib/courses/courseOrder.js for why a list rather
 * than a number per course (a list cannot hold a tie, and upstream's
 * `sort_order` collides eleven-deep inside one skill).
 *
 * ── THE UNLISTED TIER IS NOT NUMBERED, AND LEADS ───────────────────────────
 * A course absent from its program's list has no position. It is NOT numbered
 * by where it happens to sit on screen: the live comparator sorts unlisted
 * courses FIRST (rank -1, "no number entered means new, and new lands at the
 * top"), so numbering by render position would print `1` against a course that
 * is not first in the stored list and would push the course that IS first down
 * to `4`. The screen would then be showing an order nobody could act on and
 * that no write would reproduce.
 *
 * So `position` is null for those rows and the caller must render a marker
 * instead of a number. Measured against production on 2026-08-14: 0 of 79
 * courses are unlisted, because the seed captured every course that existed.
 * The tier fills the moment a course is created upstream — that is precisely
 * when a screen that quietly numbered it would mislead, and precisely when
 * nobody would be looking.
 *
 * ── ORDER IS PRESERVED, NEVER RECOMPUTED ───────────────────────────────────
 * The rows arrive already ordered — `listPublicCourses` applies
 * `orderCoursesGlobally` at the origin, above the `includeHidden` early return,
 * so the admin table receives exactly the sequence the site renders. This
 * function ANNOTATES that sequence and never re-sorts it. Sorting again here
 * would be a second implementation of the order, free to disagree with the one
 * the public site uses, and the disagreement would show up as an admin
 * rearranging something and seeing no change.
 *
 * Groups appear in first-appearance order for the same reason. Keyed rather
 * than adjacency-run so a filtered array whose programs are not contiguous
 * still folds correctly.
 */

import { buildRankMap, normalizeCourseCode, programKeyOf } from './courseOrder';

/** What a folder is called when a course has no program at all. */
export const NO_PROGRAM_LABEL = 'ไม่ได้กำหนดโปรแกรม';

/**
 * @param {object[]} courses ordered rows, as the admin list receives them
 * @param {object} [opts]
 * @param {object|null} [opts.programCourseOrder] programId → stored code list.
 *        `null` means the order could not be read or nothing is seeded — see
 *        lib/courses/courseOrderStore.js. Every row is then unlisted, which is
 *        the truth: with no list, nothing has a position.
 * @param {object} [opts.programNames] programId → display name
 * @returns {{programId: string, programName: string, count: number,
 *            rows: {course: object, position: number|null, unlisted: boolean}[]}[]}
 */
export function groupCoursesByProgram(courses, opts = {}) {
  const { programCourseOrder = null, programNames = {} } = opts;
  const rows = Array.isArray(courses) ? courses : [];

  // One rank map per program, built lazily and reused — buildRankMap walks the
  // whole list, and a 79-row table would otherwise rebuild the same map once
  // per row in the largest folder.
  const rankMaps = new Map();
  const rankMapFor = (programId) => {
    if (!rankMaps.has(programId)) {
      const codes = programCourseOrder?.[programId];
      rankMaps.set(programId, buildRankMap(Array.isArray(codes) ? codes : []));
    }
    return rankMaps.get(programId);
  };

  const byProgram = new Map();

  for (const course of rows) {
    const programId = programKeyOf(course);
    if (!byProgram.has(programId)) {
      byProgram.set(programId, {
        programId,
        programName: programNames?.[programId] || programId || NO_PROGRAM_LABEL,
        count: 0,
        rows: [],
      });
    }
    const group = byProgram.get(programId);

    // `null` order → no rank map has anything → every course is unlisted, which
    // is what "nothing is seeded" actually means rather than a display bug.
    const code = normalizeCourseCode(course?.course_id);
    const rankMap = programCourseOrder ? rankMapFor(programId) : null;
    const hasRank = Boolean(code) && Boolean(rankMap?.has(code));

    group.rows.push({
      course,
      // 1-based, because it is shown to a person. The stored value is 0-based.
      position: hasRank ? rankMap.get(code) + 1 : null,
      unlisted: !hasRank,
    });
    group.count += 1;
  }

  return [...byProgram.values()];
}
