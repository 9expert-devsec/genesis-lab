/**
 * The instructors printed on an online-course card — ONE definition.
 *
 * ── THE FIELDS DO NOT EXIST UPSTREAM YET, AND THAT IS THE DESIGN POINT ─────
 *
 * Measured 2026-08-31 (docs/audit/online-course-card-fields.md): `/online-course`
 * carries NO instructor field of any kind — the key-name sweep for
 * /instr|teacher|lectur|speaker|trainer/ returned zero hits across all 22 rows,
 * and `/instructors` carries no photo field at all. The only course→instructor
 * path that exists today runs through `program`, which covers 10 of 22 courses
 * and is one-to-many, so it cannot answer "who teaches THIS course".
 *
 * So this module reads two fields nobody has filled in yet:
 *
 *     o_course_instructor_name
 *     o_course_instructor_image_url
 *
 * Until somebody enters them upstream, EVERY call returns `[]` and the card's
 * instructor row collapses. That is the expected steady state on the day this
 * ships, not a failure — which is why the empty case is the one with the most
 * tests behind it.
 *
 * ── WHY IT RETURNS AN ARRAY FOR A FIELD PAIR THAT HOLDS ONE PERSON ─────────
 *
 * The flat pair can describe exactly one instructor. Co-taught courses exist,
 * so the shape that replaces it will be a list, and the audit's §4.3-A names
 * that as the likely upstream change. Returning an array TODAY means the day
 * `o_course_instructors` appears the cost is this file and nothing else — the
 * card already iterates. Returning a bare object today would put a shape change
 * in the card, in its tests, and in every future caller instead.
 *
 * Both shapes are accepted, array first. There is no version flag to set and no
 * migration step: a row carrying the array wins, a row carrying the pair still
 * works, a row carrying both prefers the array because it is the richer one.
 *
 * ── A NAME WITHOUT A PHOTO IS A VALID INSTRUCTOR ───────────────────────────
 *
 * `imageUrl` is `null`, never `''` and never a placeholder path. The audit
 * measured 6 of 16 genesis instructor rows holding a photo, so "named but not
 * photographed" is the COMMON case, not an edge one. The card renders the name
 * alone for those — no avatar element, no grey circle. A placeholder here would
 * push that decision into a module that cannot see the layout.
 *
 * A photo without a name is NOT an instructor: there is nothing to caption it
 * with and an unattributed face on a course card is worse than no face. Those
 * entries are dropped.
 *
 * ── DELIBERATELY NOT READ: the `instructors` collection ────────────────────
 *
 * Genesis owns an `instructors` collection with photos, and joining it here
 * would look like a shortcut to the same result. It is not the same result:
 * three of its four usable rows are external partners rather than 9Expert
 * staff, so the collection answers a different question from "who teaches this
 * course". It stays out of this module and out of this card.
 */

/** Trim to a non-empty string, or null. Numbers and objects are not names. */
function text(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The key spellings accepted for one entry of the FUTURE array shape.
 *
 * Wider than the flat pair on purpose. The flat pair is a contract this repo
 * asked for by exact spelling, so it is read by exact spelling; the array shape
 * does not exist yet, so its field names are a guess and a guess that only
 * accepts one spelling turns a rename into a silent empty row. Every candidate
 * below is a spelling MSDB already uses somewhere in its catalogue payloads.
 */
const NAME_KEYS = ['name', 'instructor_name', 'o_course_instructor_name', 'name_th'];
const IMAGE_KEYS = [
  'image_url',
  'imageUrl',
  'instructor_image_url',
  'o_course_instructor_image_url',
];

function firstText(source, keys) {
  for (const key of keys) {
    const found = text(source?.[key]);
    if (found) return found;
  }
  return null;
}

/**
 * @param {object} course an `o_course_*` feed row, or anything at all
 * @returns {Array<{ name: string, imageUrl: string|null }>}
 *   never null, never a partial entry, never an entry without a name
 */
export function onlineCourseInstructors(course) {
  if (!course || typeof course !== 'object') return [];

  // The future array shape, preferred when it yields anything usable. A
  // present-but-unusable array falls through to the pair rather than winning
  // with nothing — otherwise `o_course_instructors: []` would suppress a
  // perfectly good flat pair sitting beside it.
  const list = course.o_course_instructors;
  if (Array.isArray(list)) {
    const fromList = list
      .map((entry) => {
        if (typeof entry === 'string') {
          const name = text(entry);
          return name ? { name, imageUrl: null } : null;
        }
        if (!entry || typeof entry !== 'object') return null;
        const name = firstText(entry, NAME_KEYS);
        if (!name) return null;
        return { name, imageUrl: firstText(entry, IMAGE_KEYS) };
      })
      .filter(Boolean);
    if (fromList.length > 0) return fromList;
  }

  // Today's shape. Exact spellings, as specified.
  const name = text(course.o_course_instructor_name);
  if (!name) return [];
  return [{ name, imageUrl: text(course.o_course_instructor_image_url) }];
}
