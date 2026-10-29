import { sanitizeRichHtml } from '@/lib/sanitizeRichHtml';
import { isEmptyRichHtml } from '@/lib/richTextEmpty';

/**
 * Which body sections render from their CourseExtension RICH copy — the input
 * `courseSectionLinks` needs to list a section that has no plain content.
 *
 * ── WHY THE NAV NEEDS THIS ──────────────────────────────────────────────────
 * CourseDescription, CourseObjectives, CourseTarget, CoursePrerequisites and
 * CourseRequirements each render when their rich field OR their plain field
 * has content. The nav used to check only the plain field, so a course whose
 * section existed only as rich text had the section in the body and no entry
 * in the sidebar or the mobile tab strip (round 3b, COPILOT-CUS-2607-2).
 *
 * The predicate is the components' own — sanitise, then `isEmptyRichHtml` — so
 * the nav and the section cannot disagree about whether a rich body is empty.
 * Computed SERVER-SIDE and passed down as booleans: the nav modules reach the
 * browser, and the sanitiser must not.
 *
 * `outline` is deliberately absent: rich outline rows are index-aligned with
 * `training_topics` and render only on top of them, so the plain check already
 * says everything.
 */
const RICH_FIELD = Object.freeze({
  description: 'descriptionRich',
  objective: 'objectivesRich',
  target: 'targetAudienceRich',
  prerequisite: 'prerequisitesRich',
  requirement: 'systemRequirementsRich',
});

export function richSectionPresence(extension) {
  const present = {};
  for (const [id, field] of Object.entries(RICH_FIELD)) {
    present[id] = !isEmptyRichHtml(sanitizeRichHtml(extension?.[field] ?? ''));
  }
  return present;
}
