/**
 * The H1 and description in the hero of a program page and a skill page.
 * Pure; no I/O.
 *
 * `heroTitle` and `heroDescription` exist so the page can carry long marketing
 * copy while everything else keeps the short upstream name: the meta tags, OG,
 * breadcrumb, JSON-LD, the "มีทั้งหมด N หลักสูตร" sub-line and the mega menu all
 * read that name directly and never pass through here.
 *
 * ── THE TWO DESCRIPTION CHAINS DIFFER, AND THAT IS NOT A TYPO ───────────────
 * The program hero has always fallen back to metaDescription. The skill hero
 * never has: it goes straight to the upstream description, and metaDescription
 * reaches only the <meta> tag. Both are kept as they were, so a page with empty
 * hero fields renders exactly what it rendered before these fields existed.
 */

/** The H1. `name` is the short upstream program_name / skill_name. */
export function resolveHeroTitle(config, name) {
  return config?.heroTitle?.trim() || name;
}

export function programHeroDescription(config, program) {
  return (
    config?.heroDescription?.trim() ||
    config?.metaDescription?.trim() ||
    program?.program_description ||
    program?.program_teaser ||
    ''
  );
}

export function skillHeroDescription(config, skill) {
  return (
    config?.heroDescription?.trim() ||
    skill?.skill_description ||
    skill?.skill_teaser ||
    ''
  );
}
