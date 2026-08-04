/**
 * Join the admin's SkillOrder rows onto the static skill config.
 *
 * ── WHAT MOVES TO THE DATABASE, AND WHAT DELIBERATELY DOES NOT ─────────────
 *
 * ORDER and VISIBILITY come from Mongo. Reordering the mega menu or hiding a
 * skill is a merchandising decision; it happens at the pace someone notices a
 * course launch, and making it wait for a deploy means it does not happen.
 *
 * LABEL, ICON and SLUG stay in src/config/site.js. They are the id↔URL
 * mapping: `slug` is the public `?skill=` value on /training-course and the
 * last-resort `/skill/<slug>` href, and `upstreamCode` decides which
 * SkillPageConfig row — which pretty URL — a menu item points at. Those are
 * the things a wrong value breaks silently and permanently (a dead link keeps
 * its SEO history), so they belong where a change shows up in a diff and gets
 * read by someone. Order is recoverable by dragging a row back; a URL is not.
 *
 * `displayName` on SkillOrder is NOT read, and that is measured rather than
 * assumed: all 8 live rows carry `displayName: ''` (2026-08-04). The rows are
 * written by `saveSkillOrder`'s bulkWrite upsert, which sets only `order`, so
 * the field `syncSkillsFromAPI` populates is empty on every row that matters.
 * Reading it would render a menu of blanks.
 *
 * ── THE KEY SPACE, WHICH IS THE WHOLE DIFFICULTY ──────────────────────────
 *
 * SkillOrder.skillId is written by `skillIdOf(s) = String(s.skill_id ?? s._id)`
 * — the SHORT CODE for any upstream skill that has one. The config keys on
 * `upstreamId`, the ObjectId. Measured 2026-08-04 across all 8 rows:
 *
 *     skillId matches an upstream _id          0 / 8
 *     skillId matches an upstream skill_id     7 / 8   (all but the ghost RPA)
 *     skillId matches a config upstreamId      0 / 8
 *
 * So joining config.upstreamId against SkillOrder.skillId matches NOTHING, and
 * would do so silently — every skill would fall to the default order and the
 * menu would look like the feature was never built. The join therefore runs
 * through `skillOrderKey` below, once, and both the reader and the tests use
 * that same function. `orderRowFor` tries the code first and the ObjectId
 * second, because `skillIdOf`'s own `?? _id` fallback means a future upstream
 * skill with no `skill_id` would be keyed the other way.
 */

/** Default `order` for a skill with no SkillOrder row — matches the model's. */
export const DEFAULT_SKILL_ORDER = 999;

/**
 * THE ONE NORMALISER. Every key on both sides of the join goes through this
 * and nothing else compares raw strings.
 *
 * Upper-cased because the short codes are upper-case upstream but the slug
 * maps elsewhere in this codebase lower-case theirs, and a join that works
 * only because two writers happened to agree on case is one that breaks on the
 * first skill someone types by hand.
 */
export function skillOrderKey(value) {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * SkillOrder rows → a plain lookup keyed by the normalised id.
 *
 * Kept to the two fields that are read, so this can cross the
 * Server→Client boundary as a small serialisable prop.
 */
export function buildSkillOrderMap(rows) {
  const map = {};
  for (const row of rows ?? []) {
    const key = skillOrderKey(row?.skillId);
    if (!key) continue;
    map[key] = {
      order: Number.isFinite(row?.order) ? row.order : DEFAULT_SKILL_ORDER,
      isHidden: row?.isHidden === true,
    };
  }
  return map;
}

/** The order row for a config entry, or null. Code first, ObjectId second. */
export function orderRowFor(entry, orderMap = {}) {
  for (const candidate of [entry?.upstreamCode, entry?.upstreamId]) {
    const key = skillOrderKey(candidate);
    if (key && orderMap[key]) return orderMap[key];
  }
  return null;
}

/**
 * Apply the admin's order + visibility to the config list.
 *
 * Rules, each of which has a test:
 *
 *   - a config entry with no order row sorts last (`DEFAULT_SKILL_ORDER`) and
 *     keeps its config index as the tie-break;
 *   - an order row with no config entry is IGNORED, silently and by design.
 *     That is the ghost `RPA` row left behind by the upstream rename: it still
 *     carries an order and a programOrder, and rendering it would put a menu
 *     item on screen for a skill that no longer exists;
 *   - `isHidden` drops the entry;
 *   - EQUAL `order` FALLS BACK TO THE CONFIG ARRAY INDEX. Never to input
 *     order, which is only incidentally the config order, and never to a label
 *     comparison, which would reshuffle the menu when someone fixes a typo.
 *     This is not hypothetical: the ghost RPA row and DEV both sit at order 5.
 *
 * An empty or missing map returns the config list unchanged — the degraded
 * state is "the order you can read in the file", never an empty menu.
 */
export function sortSkillsByAdminOrder(configSkills, orderMap = {}) {
  return (configSkills ?? [])
    .map((entry, index) => ({ entry, index, row: orderRowFor(entry, orderMap) }))
    .filter(({ row }) => !row?.isHidden)
    .sort((a, b) => {
      const oa = a.row?.order ?? DEFAULT_SKILL_ORDER;
      const ob = b.row?.order ?? DEFAULT_SKILL_ORDER;
      if (oa !== ob) return oa - ob;
      return a.index - b.index; // the mandatory deterministic tie-break
    })
    .map(({ entry }) => entry);
}
