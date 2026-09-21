/**
 * The header's props, cut down to what the header renders.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * PublicHeader (server) hands six catalogue props to PublicHeaderClient, and
 * every prop that crosses into a client component is serialised into the
 * page's RSC flight data — inline in the HTML, again in the `.rsc` payload,
 * and therefore in every ISR write and every response of every public route,
 * the 404 included. Measured 2026-09-21 on production: 313 KB of props, of
 * which the menu reads about 40 KB. The other 270 KB was career-path
 * curricula, masterclass descriptions and program teasers that no header code
 * path touches. Per page, that was the difference between a ~1.1 MB and a
 * ~0.4 MB regeneration.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * Each picker below lists EXACTLY the fields PublicHeaderClient and the
 * helpers it calls read (programHref, courseLinkHref → courseCanonicalPath,
 * composeCoursePreview, careerPathRows, SkillMenuRows). Adding a field to the
 * menu means adding it here — test/render/headerPropsProjection proves the
 * rendered header is byte-identical before and after the projection, so a
 * field the menu reads that is missing here shows up as a markup diff.
 *
 * Values are copied through untouched — no defaults, no coercion — so the
 * client's own `??` / `||` fallbacks keep deciding what an absent value means.
 * A key that is absent on the input stays absent on the output.
 */

const PROGRAM_FIELDS = ['_id', 'program_id', 'program_name', 'programiconurl'];
const CAREER_PATH_FIELDS = ['api_slug', 'title', 'hero_image_url'];
const TNHS_FIELDS = ['_id', 'course_name', 'cover_url', 'external_url'];
const ONLINE_FIELDS = ['_id', 'course_id', 'course_name', 'course_cover_url', 'course_url'];
const MASTERCLASS_FIELDS = ['_id', 'slug', 'title_th', 'cover_image_url'];
const NAV_ITEM_FIELDS = ['course_id', 'course_name', 'urlAlias'];
const NAV_COVER_FIELDS = ['course_id', 'course_name', 'course_cover_url', 'urlAlias'];

export const HEADER_PROP_FIELDS = Object.freeze({
  programs: PROGRAM_FIELDS,
  dynamicCareerPaths: CAREER_PATH_FIELDS,
  tnhsCourses: TNHS_FIELDS,
  navOnlineCourses: ONLINE_FIELDS,
  navMasterclasses: MASTERCLASS_FIELDS,
  navMenuItem: NAV_ITEM_FIELDS,
  navMenuCover: NAV_COVER_FIELDS,
});

function pick(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const f of fields) {
    if (f in obj) out[f] = obj[f];
  }
  return out;
}

function pickList(list, fields) {
  return Array.isArray(list) ? list.map((row) => pick(row, fields)) : [];
}

/** `{ items, firstCover }` groups keyed by program / skill id. */
function pickNavGroups(groups) {
  if (!groups || typeof groups !== 'object') return {};
  const out = {};
  for (const [key, group] of Object.entries(groups)) {
    if (!group || typeof group !== 'object') {
      out[key] = group;
      continue;
    }
    out[key] = {
      items: pickList(group.items, NAV_ITEM_FIELDS),
      firstCover: group.firstCover ? pick(group.firstCover, NAV_COVER_FIELDS) : null,
    };
  }
  return out;
}

export function projectNavMenuData(navMenuData) {
  const src = navMenuData ?? {};
  return {
    programs: pickNavGroups(src.programs),
    skills: pickNavGroups(src.skills),
    programSlugs: src.programSlugs ?? {},
    skillSlugs: src.skillSlugs ?? {},
    skillOrder: src.skillOrder ?? {},
  };
}

/**
 * The six catalogue props PublicHeader passes, projected. `overlay` is not a
 * catalogue prop and is not handled here — the shell passes it beside these.
 */
export function projectHeaderProps({
  programs,
  dynamicCareerPaths,
  tnhsCourses,
  navOnlineCourses,
  navMenuData,
  navMasterclasses,
} = {}) {
  return {
    programs: pickList(programs, PROGRAM_FIELDS),
    dynamicCareerPaths: pickList(dynamicCareerPaths, CAREER_PATH_FIELDS),
    tnhsCourses: pickList(tnhsCourses, TNHS_FIELDS),
    navOnlineCourses: pickList(navOnlineCourses, ONLINE_FIELDS),
    navMenuData: projectNavMenuData(navMenuData),
    navMasterclasses: pickList(navMasterclasses, MASTERCLASS_FIELDS),
  };
}
