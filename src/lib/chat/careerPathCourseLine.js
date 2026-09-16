/**
 * The career-path chat card's courses line — pure, no React, so the `pure`
 * tier can pin it without a DOM. Rendered by CareerPathCard in
 * src/components/chat/ChatCards.jsx.
 *
 * The upstream item (`/api/chat` → `career_paths[]`, served from genesis's
 * own /api/corpus/career-path-cards) carries `courses: [{ code, name }]` in
 * path order and `course_count` (= courses.length at the source). The line
 * names the first three and counts the rest:
 *
 *   "5 หลักสูตร: Python Programming, Machine Learning using Python,
 *    Generative AI for Business Transformation และอีก 2 หลักสูตร"
 *
 * `course_count` is the count the widget trusts (it is what the card says
 * in numbers); the names come from `courses`. Zero → null, and the card
 * omits the line.
 */

const SHOWN = 3;

function cleanName(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {{ courses?: Array<{ code?: string, name?: string }>, course_count?: number }} item
 * @returns {string|null} the line, or null when there is nothing to say
 */
export function careerPathCourseLine(item) {
  const names = (Array.isArray(item?.courses) ? item.courses : [])
    .map((c) => cleanName(c?.name) || cleanName(c?.code))
    .filter(Boolean);
  const declared = Number(item?.course_count);
  const count = Number.isFinite(declared) && declared >= 0 ? Math.floor(declared) : names.length;
  if (count === 0) return null;

  const shown = names.slice(0, SHOWN);
  const rest = count - shown.length;
  const head = `${count} หลักสูตร`;
  const list = shown.length ? `: ${shown.join(', ')}` : '';
  const tail = rest > 0 && shown.length ? ` และอีก ${rest} หลักสูตร` : '';
  return `${head}${list}${tail}`;
}
