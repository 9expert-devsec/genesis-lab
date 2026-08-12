/**
 * The publication badge for one course row in /admin/courses.
 *
 * ── WHAT THIS IS KEYED ON, AND WHAT IT DELIBERATELY IGNORES ─────────────────
 *
 * ONLY `CourseExtension.isPublished`. That is the field the edit form's rail
 * control writes — labelled "แสดงผลในเว็บสาธารณะ (alias resolution)" — and the
 * field the form header already renders as เผยแพร่ / ซ่อน
 * (CourseForm.jsx:1108). The labels here match that badge on purpose: one field,
 * one vocabulary, two places.
 *
 * `course_type_public` is NOT consulted, and the course object is NOT a
 * parameter of this function — that is the enforcement, not an oversight.
 * Measured over all 78 courses, 29 carry `course_type_public: false`; every one
 * of them is an in-house course being actively sold. It lives in the form
 * section titled "3. รูปแบบคอร์ส" beside In-house / Workshop / Certificate, and
 * CourseHero renders it as a delivery-format chip. It is a FORMAT, not a
 * lifecycle. Consulting it would mark 37% of the catalogue as hidden when it is
 * not, and an admin would act on that. Not accepting the course as an argument
 * means a future edit cannot quietly reach for it.
 *
 * There is no third state. Nothing in MSDB or in CourseExtension expresses
 * "closed" — see the U2 measurement report. Two badges is the honest total.
 *
 * ── THE `=== false` IS THE WHOLE POINT ──────────────────────────────────────
 *
 * `listCourseExtensions` reads with `.lean()`, and `serialize()` is a bare
 * JSON round-trip, so an extension document saved WITHOUT `isPublished` reads
 * back as `undefined` — NOT as the schema's `default: true`. Mongoose defaults
 * are applied on document hydration, which `.lean()` skips. This is a
 * repo-wide trap; `shouldShowPinBadge` (lib/articlePositioning.js:88) solves the
 * same problem the same way, with `!== false`.
 *
 * So the test is "is it explicitly false", never "is it truthy":
 *
 *   isPublished === false      → ซ่อน
 *   isPublished === true       → เผยแพร่
 *   isPublished === undefined  → เผยแพร่   (absent means the default, true)
 *   no extension document      → เผยแพร่   (same default, nothing has hidden it)
 *
 * Both of the last two are ZERO in today's data — all 78 courses have an
 * extension and all 78 carry `isPublished: true`. They are the rows that will
 * fire in production later: a course created before the field existed, or one
 * whose extension has not been saved yet. A truthy check renders those two as
 * ซ่อน, which is a false statement about a live course.
 *
 * ── SHAPE ───────────────────────────────────────────────────────────────────
 * Follows resolveScheduleBadge (lib/scheduleStatus.js:125): a pure function
 * returning a ready-to-render descriptor, so no call site re-derives the
 * classification. It shares NONE of that module's values — those are the
 * schedule vocabulary (เปิดรับ / ใกล้เต็ม / เต็ม) and a second surface reusing
 * them would tie course publication to schedule capacity.
 *
 * Colour is carried by the DOT, not the text. The text token is
 * --text-primary / --text-secondary, which is legible on both themes by
 * construction; tinting the label green instead would put #1FC17E on a pale
 * green ground in light mode, which measures about 2.1:1. The dot needs no
 * text contrast to do its job.
 *
 * Tokens only — `--9e-green-*` and the surface/text variables are redefined
 * under `.dark` in globals.css, so both themes follow automatically. The
 * Tailwind `9e-green-*` CLASSES are literal hex and identical in both themes;
 * they are deliberately not used here.
 */

export const COURSE_STATUS = {
  published: {
    label: 'เผยแพร่',
    dot: 'bg-[var(--9e-green-50)]',
    badge:
      'border-[var(--9e-green-800)] bg-[var(--9e-green-900)] text-[var(--text-primary)]',
  },
  hidden: {
    label: 'ซ่อน',
    dot: 'bg-[var(--text-muted)]',
    badge:
      'border-[var(--surface-border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]',
  },
};

/**
 * Resolve one row's badge.
 *
 * TOTAL by construction: there is no input for which this returns null or
 * undefined, so no course can render a blank cell. `extension` may be the
 * document, `undefined` (no row in the map) or `null`.
 *
 * @param {{isPublished?: boolean}|null|undefined} extension
 * @returns {{label: string, dot: string, badge: string, status: 'published'|'hidden', isPublished: boolean}}
 */
export function resolveCourseStatusBadge(extension) {
  const isHidden = extension?.isPublished === false;

  return isHidden
    ? { ...COURSE_STATUS.hidden, status: 'hidden', isPublished: false }
    : { ...COURSE_STATUS.published, status: 'published', isPublished: true };
}
