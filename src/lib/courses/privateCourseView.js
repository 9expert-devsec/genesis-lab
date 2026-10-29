/**
 * The REDUCED course object a private course page hands to its components.
 *
 * ── AN ALLOWLIST, NOT A DROP LIST ───────────────────────────────────────────
 * Hiding a section in JSX does not keep its data out of the page: CourseHero,
 * CourseOutline and friends are client components, and every prop they receive
 * is serialised into the RSC payload in the HTML. So the private page never
 * passes the stored document — it passes this, built from the fields the KEPT
 * sections actually read and nothing else. A field added to PrivateCourse later
 * is withheld until someone adds it here on purpose.
 *
 * Withheld, among everything else: course_price, course_netprice,
 * related_courses, previous_course, course_roadmap_desktop_url /
 * course_roadmap_mobile_url, skills, sort_order, course_promote_status,
 * course_levels, _id and the timestamps. Schedules, promotions, early bird,
 * FAQs and bundles are never fetched for a private course at all.
 */

export const PRIVATE_VIEW_FIELDS = Object.freeze([
  'course_id',
  'course_name',
  'course_teaser',
  'course_trainingdays',
  'course_traininghours',
  'course_type_public',
  'course_type_inhouse',
  'course_workshop_status',
  'course_certificate_status',
  'course_cover_url',
  'course_objectives',
  'course_target_audience',
  'course_prerequisites',
  'course_system_requirements',
  'training_topics',
  'course_outline_th',
  'course_outline_en',
]);

/**
 * THE PROGRAM SEAM — the one place a private course's program is turned into
 * what the page shows (hero colour, logo).
 *
 * A CUSTOM private program (private_taxonomy, round 2b) wins: its `color` is
 * the hero background and its `logoUrl` the program logo, in exactly the slots
 * an MSDB program's `programcolor` / `programiconurl` fill. With no custom
 * program, the course's MSDB program id is matched against `/programs`, so the
 * hero is coloured exactly as a public course of that program is.
 *
 * Returns `{ _id, program_name, programiconurl, programcolor }` — the shape
 * CourseHero reads off a public course's populated `program`, plus the colour
 * CourseDetail reads off `/programs` — or null.
 */
export function privateProgramView(program, programs = [], customProgram = null) {
  if (customProgram?._id) {
    return {
      _id: String(customProgram._id),
      program_name: customProgram.name ?? '',
      programiconurl: customProgram.logoUrl ?? '',
      programcolor: customProgram.color || null,
    };
  }
  const id = String(program?._id ?? program ?? '').trim();
  if (!id) return null;
  const hit = (Array.isArray(programs) ? programs : []).find((p) => String(p?._id ?? '') === id);
  if (!hit) return null;
  return {
    _id: String(hit._id),
    program_name: hit.program_name ?? '',
    programiconurl: hit.programiconurl ?? '',
    programcolor: hit.programcolor ?? null,
  };
}

export function toPrivateCourseView(course, { programs = [], customProgram = null } = {}) {
  const view = {};
  for (const key of PRIVATE_VIEW_FIELDS) {
    if (course?.[key] !== undefined) view[key] = course[key];
  }
  view.program = privateProgramView(course?.program, programs, customProgram);
  return view;
}
