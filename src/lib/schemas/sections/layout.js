import { z } from 'zod';
import { defineSection, childSections, settingsWithContainerWidth } from './base';

/**
 * §5.1 LAYOUT sections (MVP — 8), tightened in Phase 2A as the components land.
 *
 * Two kinds:
 *   - CONTAINERS that nest child sections recursively — full_width, container,
 *     two_column, card_grid, highlight_grid. Single-slot containers hold
 *     `content.children`; two_column holds `content.left` + `content.right`.
 *     The renderer owns the recursion + depth cap (control inversion); these
 *     components are pure presentational and receive already-rendered children.
 *   - ITEM-BASED blocks that carry their own data, NOT child sections —
 *     timeline / tabs / accordion (title + plain-text body per item).
 */

export const LAYOUT_TYPES = [
  'full_width', 'container', 'two_column', 'card_grid',
  'highlight_grid', 'timeline', 'tabs', 'accordion',
];

/**
 * ── ROUND 80: TYPES THAT ARE NO LONGER OFFERED ──────────────────────────
 *
 * A RETIREMENT, NOT A DELETION. Every name here stays in `LAYOUT_TYPES`
 * above, keeps its schema below, keeps its component in the renderer's
 * registry, and keeps its label, icon, slots and depth rules. A stored
 * section of this type still parses, still resolves, still renders and is
 * still fully editable. The ONLY thing that goes away is the ability to add
 * a NEW one from the picker.
 *
 * ── WHY IT IS NOT A REMOVAL FROM `LAYOUT_TYPES` ─────────────────────────
 * That list has two readers with opposite needs: the picker's `GROUPS`, which
 * should stop offering the type, and `ALL_SECTION_TYPES` in
 * schemas/pageBuilder.js, which builds the discriminated union every stored
 * section is VALIDATED against. Removing the name would take it out of both,
 * and every stored `highlight_grid` would stop parsing — the page would fail
 * validation on save and the section would vanish. So the retirement is a
 * SEPARATE list, and the picker subtracts it.
 *
 * ── highlight_grid ──────────────────────────────────────────────────────
 * Round 78 removed its per-child accent bar at the author's request. That bar
 * was what the type was FOR — round 24 added it as the whole treatment. What
 * remains, measured in Chrome by round 78 rather than assumed, is a wrapper
 * div with a 1px `--surface-border` on all four sides, a 16px radius, 16/24px
 * padding, a translucent `bg-9e-ice/50` surface and round 70's single-cell
 * grid. Ten computed properties still differ from `card_grid`, so the two are
 * not identical — but the DISTINGUISHING IDEA is gone, and a picker offering
 * both asks an author to choose between a grid and the same grid with padding.
 *
 * The author ruled: retire it rather than give it a new surface.
 *
 * NOT converted, NOT migrated. Converting a stored one to `card_grid` would
 * change what it renders — the box, its padding and its border would all go —
 * and that is a data change nobody asked for.
 */
export const RETIRED_SECTION_TYPES = ['highlight_grid'];

// Title + plain-text body item (timeline/tabs/accordion). Body is a string in
// 2A (rendered with line breaks preserved); richer bodies are a later change.
const item = z.object({
  title: z.string().default(''),
  body:  z.string().default(''),
}).passthrough();

export const layoutSectionSchemas = [
  // Containers — nest child sections (see childSections / the renderer).
  defineSection('full_width',     z.object({ children: childSections }).passthrough()),
  /**
   * `container` is the ONE type that starts narrower than the rest, and this
   * line is the whole of that difference.
   *
   * It used to be a max-width hardcoded in the component, which outranked
   * `settings.containerWidth` and made three of its four values paint the same
   * 768px. Now the narrowness is where the author can reach it: the type opens
   * at a readable column and every setting does what it says.
   *
   * This is also what keeps `container` and `full_width` from collapsing into
   * one type once the clamp is gone — they are distinguished by where they
   * START rather than by a ceiling one of them cannot raise.
   */
  defineSection('container',      z.object({ children: childSections }).passthrough(),
    { settings: settingsWithContainerWidth('small') }),
  defineSection('two_column',     z.object({ left: childSections, right: childSections }).passthrough()),
  defineSection('card_grid',      z.object({ children: childSections }).passthrough()),
  defineSection('highlight_grid', z.object({ children: childSections }).passthrough()),
  // Item-based — own their data.
  defineSection('timeline',  z.object({ items: z.array(item).default([]) }).passthrough()),
  defineSection('tabs',      z.object({ tabs:  z.array(item).default([]) }).passthrough()),
  defineSection('accordion', z.object({ items: z.array(item).default([]) }).passthrough()),
];
