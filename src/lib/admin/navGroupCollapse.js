/**
 * Per-group collapse state for the admin sidebar — reading it, and deciding
 * from it what is on screen.
 *
 * Pure, so the two rules that actually matter can be tested as a table rather
 * than clicked at:
 *
 *   · WHAT COMES OUT OF localStorage IS UNTRUSTED INPUT. It is a string the
 *     user's browser hands back, written by an older version of this code, by a
 *     different tab, or by a person with devtools open. Every shape it can
 *     arrive in — absent, empty, not JSON, JSON that is an array or a number,
 *     an object with ids this build has never heard of, values that are not
 *     booleans — has to land on "all groups expanded" rather than on a thrown
 *     TypeError inside a render.
 *   · THE ACTIVE GROUP IS EXPANDED WHATEVER IS STORED. Without that rule a user
 *     who collapsed จัดวางหน้าเว็บ last week and then follows a link into
 *     /admin/banners arrives on a page whose own menu row is invisible, with
 *     nothing on screen explaining why. Display-only: it never writes back, so
 *     the stored preference survives the visit and applies again the moment
 *     they navigate elsewhere.
 *
 * ── WHY THE MAP IS KEYED ON `id` AND NOT ON THE LABEL ───────────────────────
 * The group labels are Thai display copy and have already been reworded once —
 * the round-A regroup renamed จัดการหลักสูตร → หลักสูตร & ตาราง and split
 * จัดการคอนเทนต์ in two. Keyed on the label, every stored preference in every
 * admin's browser would have silently reset at that commit, and the symptom
 * ("my sidebar reopened itself") gives no hint of the cause. `NAV_GROUPS[].id`
 * is an ascii slug that exists only for this; test/fs/adminNavShape keeps it
 * unique and ascii.
 */

/**
 * Parse the stored `admin-sidebar-groups` value into a clean { id: collapsed }
 * map. Anything unrecognised is DROPPED rather than defaulted, so a partly
 * corrupt value still yields the preferences that survived it.
 *
 * @param {unknown} raw       the raw localStorage string (or null/undefined)
 * @param {Iterable<string>} knownIds  the ids this build actually renders
 * @returns {Record<string, boolean>} `{}` means every group is expanded
 */
export function parseGroupCollapse(raw, knownIds) {
  if (typeof raw !== 'string' || raw === '') return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON at all. A thrown SyntaxError here would take out the whole
    // sidebar for one bad string in one browser.
    return {};
  }
  // `null`, an array, a number, a bare string: all valid JSON, none of them a
  // map. `typeof null === 'object'` is why the null check is explicit.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const known = new Set(knownIds ?? []);
  const out = {};
  for (const [id, value] of Object.entries(parsed)) {
    // An id this build does not render is IGNORED, not an error: it is what a
    // removed or renamed group leaves behind, and the honest response is to
    // forget it rather than to discard the whole map with it.
    if (!known.has(id)) continue;
    if (typeof value !== 'boolean') continue;
    out[id] = value;
  }
  return out;
}

/**
 * Is `groupId` shown expanded right now?
 *
 * Absent from the map means expanded — the default when nothing is stored is
 * ALL groups open, which is the behaviour that shipped. A first load that
 * surprises you with a folded menu is worse than a long rail.
 *
 * @param {string} groupId
 * @param {Record<string, boolean>} collapsed   the parsed map
 * @param {string|null} activeGroupId  the group holding the current route
 */
export function isGroupExpanded(groupId, collapsed, activeGroupId = null) {
  if (groupId === activeGroupId) return true;
  return collapsed?.[groupId] !== true;
}

/**
 * The map to store after the user clicks `groupId`'s header.
 *
 * `wasExpanded` is what was ON SCREEN, not what was stored — for the active
 * group those differ, and a toggle that inverted the STORED value would make
 * the click a no-op for exactly the group the user is looking at.
 *
 * Returns a new object; never mutates the one passed in.
 */
export function toggleGroup(collapsed, groupId, wasExpanded) {
  return { ...collapsed, [groupId]: wasExpanded };
}
