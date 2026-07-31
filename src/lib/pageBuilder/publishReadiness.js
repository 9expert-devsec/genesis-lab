/**
 * Is a page READY to go public? ONE definition, run by the publish dialog
 * (to gate the button and say why) and the server actions (the real guard).
 *
 * Distinct from visibility.js: that answers "given the status/dates, would a
 * visitor see it" — a scheduled-for-tomorrow page is valid but not-yet-visible.
 * THIS answers "is the page finished enough to publish at all". A page can pass
 * one and fail the other.
 *
 * Only the public-facing statuses are gated. draft/closed/archived are always
 * allowed — draft is the safe place to park anything, and closing/archiving an
 * already-imperfect page must never be blocked.
 *
 * The placeholders are the literal new-page seed (see the import site in
 * app/admin/pages/builder/new/page.jsx). They live here so the block and the
 * seed cannot drift: change the seed, and the readiness check follows. Blocking
 * on the exact placeholder is the cheap version of "has this been meaningfully
 * edited" — an author who truly wants the title "หน้าใหม่" can add a trailing
 * space or publish then rename; the heavier edited-flag machinery buys nothing
 * this doesn't.
 */

export const PLACEHOLDER_SLUG = 'untitled';
export const PLACEHOLDER_TITLE = 'หน้าใหม่';

const PUBLIC_STATES = ['published', 'scheduled'];

/**
 * Blockers preventing `page` from taking `status`. Empty array = ready.
 * Each blocker names the field and what to do — the UI shows the message, the
 * server rejects with the first one.
 *
 * @param page   the page as it will be saved (working tree or post-Zod data)
 * @param status the status being moved TO
 * @returns {{ field: string, message: string }[]}
 */
export function publishBlockers(page, status) {
  if (!PUBLIC_STATES.includes(status)) return []; // draft/closed/archived always allowed

  const blockers = [];
  const title = String(page?.title ?? '').trim();
  const slug = String(page?.slug ?? '').trim();
  const sectionCount = Array.isArray(page?.sections) ? page.sections.length : 0;

  if (!title) {
    blockers.push({ field: 'title', message: 'ต้องตั้งชื่อหน้าก่อนเผยแพร่' });
  } else if (title === PLACEHOLDER_TITLE) {
    blockers.push({ field: 'title', message: `ยังใช้ชื่อเริ่มต้น “${PLACEHOLDER_TITLE}” อยู่ — ตั้งชื่อจริงก่อนเผยแพร่` });
  }

  if (!slug) {
    blockers.push({ field: 'slug', message: 'ต้องตั้ง URL (slug) ก่อนเผยแพร่' });
  } else if (slug === PLACEHOLDER_SLUG) {
    blockers.push({ field: 'slug', message: `ยังใช้ URL เริ่มต้น “${PLACEHOLDER_SLUG}” อยู่ — ตั้ง URL จริงก่อนเผยแพร่` });
  }

  // ANY section, not just enabled ones: a page whose only section is hidden has
  // nothing to show, which is the same failure as an empty page.
  if (sectionCount === 0) {
    blockers.push({ field: 'sections', message: 'หน้านี้ยังไม่มี section — เพิ่มอย่างน้อยหนึ่ง section ก่อนเผยแพร่' });
  }

  return blockers;
}
