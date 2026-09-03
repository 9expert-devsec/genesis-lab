/**
 * THE training-type display label. One definition, so a future surface that
 * needs this text has somewhere to import it from instead of writing an
 * twelfth local copy.
 *
 * Dependency-free, like its sibling trainingTypeColor.js beside it — no
 * `next/*`, no React — so it can be exercised in the `pure` tier without a DOM.
 *
 * ── WHY THIS MODULE EXISTS EVEN THOUGH NOTHING ELSE IMPORTS IT YET ──────────
 * A survey across the repo before this module was added found ELEVEN separate
 * classroom/hybrid/online label literals (RegisterWizard.jsx, ScheduleCarousel,
 * the admin schedules screen, CareerPathRegisterClient, SearchClient, CourseCard,
 * course_schedule.jsx, ScheduleClient.jsx, ScheduleSection.jsx — none of them
 * exported, none of them agreeing on wording), and zero shared label module —
 * only trainingTypeColor.js, which answers colour, not text. This is the first
 * consumer (the public registration step-1 summary strip); the other ten sites
 * are UNCHANGED by this module's existence — refactoring all of them is a
 * separate, larger decision this file does not make on its own.
 *
 * ── THE FALLBACK IS THE RAW TYPE, NOT "CLASSROOM" — UNLIKE trainingTypeColor ──
 * trainingTypeColor() falls back to classroom's colour for an absent/unknown
 * type, reasoning that a missing `type` field is overwhelmingly a classroom
 * round with a hole in it. A LABEL is customer-facing text, not a colour swatch:
 * silently relabelling an unrecognised value as "Classroom" tells a customer
 * something false about how their training will run. Showing the raw value is
 * honest about what this module does not know, and it is also what makes an
 * unrecognised type visibly wrong (and therefore reportable) rather than
 * silently, plausibly wrong.
 */

/**
 * The one label map. Copy these verbatim — em dashes included — anywhere this
 * text is needed; do not retype it.
 */
export const TRAINING_TYPE_LABEL = {
  classroom: 'Classroom — อบรมที่ห้องอบรม 9Expert',
  hybrid: 'Hybrid — เลือกอบรมได้ 1 รูปแบบ ระหว่าง Classroom หรือ MS Teams',
  online: 'Online — อบรมออนไลน์ผ่าน Microsoft Teams',
};

/**
 * The label for a delivery type, falling back to the raw type itself.
 *
 * @param {string} [type]
 * @returns {string}
 */
export function trainingTypeLabel(type) {
  return TRAINING_TYPE_LABEL[type] ?? type;
}
