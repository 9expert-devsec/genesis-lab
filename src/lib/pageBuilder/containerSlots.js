/**
 * Which `content` slots hold child sections, per container type.
 *
 * ONE definition, shared by the renderer (which recurses to draw the tree) and
 * the editor (which walks and mutates the same tree). Two copies would drift,
 * and a drifted editor lies about what will publish — the exact failure class
 * the "canvas must reuse SectionRenderer" rule exists to prevent.
 *
 * Mirrors the container schemas in lib/schemas/sections/layout.js: single-slot
 * containers hold `content.children`; two_column holds `content.left` +
 * `content.right`. Item-based blocks (timeline/tabs/accordion) own their data
 * and are NOT containers — they never appear here.
 */
export const CONTAINER_SLOTS = {
  full_width:     ['children'],
  container:      ['children'],
  card_grid:      ['children'],
  highlight_grid: ['children'],
  two_column:     ['left', 'right'],
};

/** Section-nesting depth cap, shared with the renderer's recursion guard. */
export const MAX_SECTION_DEPTH = 4;

/** The child slots for a type, or null when the type isn't a container. */
export function slotsOf(type) {
  return CONTAINER_SLOTS[type] ?? null;
}

export function isContainer(type) {
  return Boolean(CONTAINER_SLOTS[type]);
}
