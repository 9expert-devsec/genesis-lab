/**
 * Is a training topic's BODY empty — nothing a reader could see if it opened?
 *
 * The body is whatever CourseOutline would render under the row: the row's rich
 * HTML string when it has one, otherwise its `bullets` array. Empty means no
 * visible text once tags, `&nbsp;` and whitespace are gone, so `[]`, `['', ' ']`,
 * `<ul></ul>` and `<p>&nbsp;</p>` are all empty. A row with an empty body is a
 * heading, not an accordion: it gets no chevron and no toggle.
 *
 * Text is the only thing checked because text is the only thing a topic body
 * can hold — sanitizeTopicHtml's allowlist has no img and no iframe.
 *
 * Pure and import-free ON PURPOSE: CourseOutline is a client component and
 * test/fs/courseOutlineRichSeam proves it ships no parser or sanitiser. A regex
 * strip is enough here because the question is only "is any text left", never
 * "what is the text".
 */

// U+200B–U+200D and U+FEFF are invisible but are not matched by `\s`.
const INVISIBLE = /[\s​-‍﻿]+/g;
const NBSP_ENTITY = /&(?:nbsp|#160|#x0*a0);/gi;
const TAG = /<[^>]*>/g;

const plainHasText = (s) => s != null && String(s).replace(INVISIBLE, '') !== '';

/**
 * `body` is a rich HTML string or a bullets array (or nullish).
 *
 * Only the STRING is treated as markup. Plain bullets go through React
 * escaping, so a bullet reading `List<mailmessage>` or a literal `&nbsp;` is
 * text on screen, and stripping it here would hide a row that has content.
 */
export function isTopicBodyEmpty(body) {
  if (Array.isArray(body)) return !body.some(plainHasText);
  if (body == null) return true;
  return !plainHasText(String(body).replace(TAG, '').replace(NBSP_ENTITY, ''));
}
