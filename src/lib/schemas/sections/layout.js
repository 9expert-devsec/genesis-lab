import { z } from 'zod';
import { defineSection, childSections } from './base';

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

// Title + plain-text body item (timeline/tabs/accordion). Body is a string in
// 2A (rendered with line breaks preserved); richer bodies are a later change.
const item = z.object({
  title: z.string().default(''),
  body:  z.string().default(''),
}).passthrough();

export const layoutSectionSchemas = [
  // Containers — nest child sections (see childSections / the renderer).
  defineSection('full_width',     z.object({ children: childSections }).passthrough()),
  defineSection('container',      z.object({ children: childSections }).passthrough()),
  defineSection('two_column',     z.object({ left: childSections, right: childSections }).passthrough()),
  defineSection('card_grid',      z.object({ children: childSections }).passthrough()),
  defineSection('highlight_grid', z.object({ children: childSections }).passthrough()),
  // Item-based — own their data.
  defineSection('timeline',  z.object({ items: z.array(item).default([]) }).passthrough()),
  defineSection('tabs',      z.object({ tabs:  z.array(item).default([]) }).passthrough()),
  defineSection('accordion', z.object({ items: z.array(item).default([]) }).passthrough()),
];
