/**
 * Tier sanitisation for PageBuilder writes.
 *
 * The Zod schema can't see the session, so the developer-tier gate is
 * enforced here (called from the action layer). The rule is STRIP-AND-
 * PRESERVE, never error: an editor/marketing save must not wipe raw code a
 * developer previously stored. Specifically, for a non-developer actor:
 *
 *   - jsonLd.rawOverride / rawOverrideEnabled  → forced back to the stored
 *     value (an editor can neither set nor clear a developer's override).
 *   - section.advanced.{customHtml,customCss,customClass,sectionId} → restored
 *     from the stored section (matched by id), or emptied on new sections.
 *   - sections whose `type` is a developer-only ADVANCED_TYPE → the stored
 *     version is kept if it already existed; a newly-introduced one is dropped.
 *     Stored advanced sections the incoming payload omits are re-appended so
 *     a save that never rendered them can't delete them.
 *     This is the SERVER-SIDE enforcement behind the picker's developer-tier
 *     gate (components/pageBuilder/editor/SectionPicker.jsx `typeState`): the
 *     picker stops a non-developer from ADDING one; this stops a crafted or
 *     replayed save from SLIPPING one past. Both halves went unexercised until
 *     2C shipped the Advanced components — 2C is the first time either ran on a
 *     real advanced section.
 *
 * Pure (no db, no session) so it stays unit-testable; the caller passes the
 * already-loaded `existing` doc and the resolved `isDeveloper` flag.
 */

import { ADVANCED_TYPES } from '@/lib/schemas/pageBuilder';

const ADVANCED = new Set(ADVANCED_TYPES);
const EMPTY_ADVANCED = { sectionId: '', customClass: '', customCss: '', customHtml: '' };

export function isAdvancedType(type) {
  return ADVANCED.has(type);
}

/** A non-developer's copy of a normal section: keep everything, but its
 *  advanced.* block comes from the stored section (never the incoming one). */
function preserveAdvanced(section, existingById) {
  const prior = existingById.get(section.id);
  return {
    ...section,
    advanced: prior?.advanced ? { ...EMPTY_ADVANCED, ...prior.advanced } : { ...EMPTY_ADVANCED },
  };
}

/**
 * @param data       post-Zod page data (mutated copy returned)
 * @param existing   stored doc (lean) or null on create
 * @param isDeveloper resolved from canUseAdvanced(session.user)
 */
export function sanitizePageForTier(data, existing, isDeveloper) {
  if (isDeveloper) return data;

  const out = { ...data };

  // jsonLd.rawOverride is developer-only — pin to the stored value.
  out.jsonLd = { ...(data.jsonLd ?? {}) };
  out.jsonLd.rawOverride = existing?.jsonLd?.rawOverride ?? '';
  out.jsonLd.rawOverrideEnabled = existing?.jsonLd?.rawOverrideEnabled ?? false;

  const existingSections = Array.isArray(existing?.sections) ? existing.sections : [];
  const existingById = new Map(existingSections.map((s) => [s.id, s]));
  const incoming = Array.isArray(data.sections) ? data.sections : [];
  const incomingIds = new Set(incoming.map((s) => s.id));

  const result = [];
  for (const s of incoming) {
    if (isAdvancedType(s.type)) {
      // Can't create/edit an advanced section — keep the stored original if
      // there is one, otherwise drop the newly-introduced block.
      const prior = existingById.get(s.id);
      if (prior) result.push(prior);
    } else {
      result.push(preserveAdvanced(s, existingById));
    }
  }
  // Re-append stored advanced sections the payload omitted (don't wipe them).
  for (const s of existingSections) {
    if (isAdvancedType(s.type) && !incomingIds.has(s.id)) result.push(s);
  }

  out.sections = result;
  return out;
}

/**
 * Sequentially renumber sortOrder from ARRAY position.
 *
 * This is not tidiness — it is the hinge that makes the editor's order and the
 * published order the same order, and deleting it would silently break every
 * reorder. Three parties depend on it:
 *
 *   - the editor reorders the ARRAY (MOVE_SECTION → moveWithin) and never
 *     touches sortOrder, so its working tree carries a STALE sortOrder between
 *     a move and the next save;
 *   - this call, on every create/update, realigns sortOrder to array position;
 *   - PageBuilderView then sorts top-level sections BY sortOrder to render.
 *
 * Drop this and the array still saves in the author's order while the public
 * page keeps sorting by the old sortOrder — the page publishes in an order the
 * author never chose, and nothing errors. (Verified against the real reducer:
 * move section 0 → index 2 and sortOrder reads 1,2,0; sorting by it reproduces
 * the pre-move order exactly.)
 *
 * Top-level only, deliberately: nested children render in array order (the
 * renderer's recursion), so their sortOrder is not read and not maintained.
 */
export function renumberSections(sections) {
  return (Array.isArray(sections) ? sections : []).map((s, i) => ({ ...s, sortOrder: i }));
}
