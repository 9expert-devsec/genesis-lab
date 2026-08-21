import { slotsOf } from './containerSlots';

/**
 * How many sections live INSIDE a section, all slots, all depths.
 *
 * WHY IT EXISTS: deleting a container takes every descendant with it, and the
 * editor has no undo (editorReducer.js keeps no history). The delete
 * confirmation has to be able to say "…and the 7 sections inside it", so the
 * count must be answerable before the dispatch — which means a pure function,
 * not something read off the DOM.
 *
 * SLOT KNOWLEDGE IS NOT DUPLICATED HERE. Which `content` keys hold children is
 * containerSlots.js's single answer, shared with the renderer and the tree
 * walkers; a second copy here would drift and the count would quietly stop
 * matching what REMOVE_SECTION actually removes. A non-container type has no
 * slots, so it returns 0 by the same rule rather than by a special case.
 *
 * The section ITSELF is not counted — the caller already names it. So a leaf is
 * 0, and a container holding one leaf is 1.
 */
export function countDescendants(section) {
  const slots = slotsOf(section?.type);
  if (!slots) return 0;

  const content = section?.content ?? {};
  let total = 0;
  for (const slot of slots) {
    const children = content[slot];
    if (!Array.isArray(children)) continue;
    // Each child counts once for itself, plus whatever it contains. Recursion
    // terminates on the tree's own shape (a page is JSON — no cycles); the
    // depth cap bounds it in practice but is NOT what makes it safe.
    for (const child of children) total += 1 + countDescendants(child);
  }
  return total;
}
