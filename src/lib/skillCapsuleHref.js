/**
 * The catalog URL behind a course card's skill capsule — or null.
 *
 * ── WHY THIS IS NOT `skillHref` ────────────────────────────────────────────
 *
 * `skillHref` (lib/utils.js) answers a different question: "where does this
 * skill live?", and it always answers, falling back to `/skill/<slug>` when no
 * SkillPageConfig row matches. That fallback is right for the mega menu and the
 * program/skill selectors, which are built from `config/site.js` entries that
 * carry a `slug` — and it is WRONG here, measured:
 *
 *   `/skill/programming` returns HTTP 404 on the running tree (2026-08-17).
 *
 * The `Development` skill is configured with the slug `programming` for SEO
 * reasons (config/site.js:82-85), and nothing serves `/skill/programming` —
 * the live page is `/programming-all-courses`, reached through the
 * SkillPageConfig row keyed `DEV`. A capsule that fell through to the
 * `/skill/<slug>` branch would render a dead link that LOOKS correct.
 *
 * So this resolver has exactly one rule: HIT THE MAP OR RETURN NULL. A null
 * means the capsule stays the inert `<span>` it is today — the failure mode is
 * "no link", never "a link to nothing".
 *
 * `skillHref` is deliberately left untouched; its other callers depend on the
 * fallback. This is an addition, not a change.
 *
 * ── THE PROBE ORDER, AND WHY IT IS NOT THE DISPLAYED TEXT ──────────────────
 *
 * Same id order as `skillHref`: upstreamId → _id → skill_id → upstreamCode,
 * against the same lower-cased key map (`skillSlugs`, built by
 * getNavMenuData / getPageLinkability from `SkillPageConfig.skillId`).
 * Measured 2026-08-17: all 8 live config keys are short CODES, none
 * ObjectId-shaped, so on a `course.skills` subdoc the `_id` probe misses and
 * `skill_id` is the hit.
 *
 * IT MUST NEVER READ `skill_name`, and that is the whole point of the
 * Development case. The capsule PRINTS `skill_name` ("Development"), but that
 * string is a key to nothing: kebab-cased it gives `development`, which matches
 * no slug and no config row. Resolving by what the user can see would break on
 * exactly one of the seven live skills — the quietest possible failure, and the
 * third of this shape in this repo's history (see config/site.js:166-186).
 *
 * @param {object} skill    a `course.skills[]` subdoc, or a config/site.js entry
 * @param {Record<string,string>} skillSlugs  lower-cased id → urlSlug
 * @returns {string|null}   a root-relative `/<urlSlug>`, or null on any miss
 */
export function skillCapsuleHref(skill, skillSlugs) {
  if (!skill || typeof skill !== 'object') return null;
  if (!skillSlugs || typeof skillSlugs !== 'object') return null;

  for (const id of [skill.upstreamId, skill._id, skill.skill_id, skill.upstreamCode]) {
    if (!id) continue;
    const key = String(id).toLowerCase();
    // `hasOwnProperty` before the read: a map is a plain object from
    // Object.fromEntries, so a skill whose id happened to be `constructor` or
    // `toString` would otherwise pick up an inherited member. The typeof check
    // below would reject those anyway; both are kept because either one alone
    // is a coincidence rather than a decision.
    if (!Object.prototype.hasOwnProperty.call(skillSlugs, key)) continue;
    const slug = skillSlugs[key];
    if (typeof slug !== 'string') continue;
    const trimmed = slug.trim();
    if (trimmed) return `/${trimmed}`;
  }

  return null;
}
