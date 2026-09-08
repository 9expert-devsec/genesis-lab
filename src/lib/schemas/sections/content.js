import { z } from 'zod';
import { defineSection } from './base';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. Round C: a cta button may name its own treatment, and the
// names come from the same enum style.buttonStyle uses, not a second list.
import { BUTTON_STYLES } from './base';

/**
 * §5.2 CONTENT sections (MVP — 6). These have well-established, unambiguous
 * shapes, so they're typed here in Phase 1. `.passthrough()` still guards
 * forward-compat for fields a Phase-2 component may add.
 */

export const CONTENT_TYPES = ['heading', 'rich_text', 'image', 'cta', 'checklist', 'notice'];

/**
 * Round 57 — `eyebrow` is the small line above the heading (page B's
 * "PROMOTION DETAILS", §B #25). Defaults to '' and absent renders nothing (§H):
 * it ADDS something no page has shown, unlike round 50's `showPrice`.
 */
const headingContent = z.object({
  eyebrow: z.string().default(''),
  text:  z.string().default(''),
  level: z.enum(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']).default('h2'),
  align: z.enum(['left', 'center', 'right']).default('left'),
}).passthrough();

// rich_text stores Tiptap JSON (NOT an HTML string). It is rendered directly
// to React by the walker — no HTML, no server-side sanitizer, no jsdom. The
// doc is untrusted at render, so the schema stays permissive (the walker is
// the guard); the supported node/mark set is the contract documented in
// components/pageBuilder/richText/tiptapToReact.jsx.
const richTextContent = z.object({
  doc: z.object({
    type:    z.string().default('doc'),
    content: z.array(z.any()).default([]),
  }).passthrough().default({ type: 'doc', content: [] }),
}).passthrough();

const imageContent = z.object({
  src:      z.string().default(''), // Cloudinary secure_url
  publicId: z.string().default(''), // for deletion
  alt:      z.string().default(''),
  caption:  z.string().default(''),
}).passthrough();

/**
 * ── ROUND 57: A SECOND BUTTON (docs/promotion-page-coverage.md §G step 2) ──
 * Both live promotion pages close with two actions and page B's hero opens with
 * two; this type offered one pair, so §B counted the gap twice.
 *
 * Both new fields default to '' and ABSENT RENDERS NOTHING (§H) — they ADD
 * something no page has shown. That is the opposite of round 50's `showPrice`,
 * which defaults ON and reads `!== false` because it REMOVES something every
 * stored card shows. The renderer applies the SAME pair-guard the first button
 * has always used: a label without a safe href draws nothing, and vice versa.
 */
/**
 * ── ROUND C: THE PAIR BECOMES A LIST ──────────────────────────────────────
 * The report: "the CTA allows at most 2 buttons; it should really be managed
 * per button". Per-button management, inside the existing type — NOT one
 * section per button, which would need a card_grid with a column count to put
 * two side by side, i.e. a LAYOUT control answering a CONTENT question, and
 * would turn one section into three on every promotion page.
 *
 * ── ABSENT MEANS THE LEGACY PAIR, AND THAT IS THE WHOLE COMPATIBILITY RULE ─
 * `.lean()` applies no Mongoose defaults and a JSON round trip drops
 * `undefined`, so every cta stored before this round reads back with `buttons`
 * ABSENT rather than `[]`. lib/pageBuilder/ctaButtons.js resolves absent to the
 * legacy pair AT READ TIME, so a stored section renders exactly what it
 * rendered yesterday. Nothing migrates stored documents and nothing could —
 * the dev database is production.
 *
 * The four legacy fields therefore STAY, and stay readable. They are a
 * read-compatibility path, not a second way to author: the panel no longer
 * offers them and nothing writes them again.
 *
 * ── THE CAP OF FOUR IS A UI BOUND, NOT A DATA TRUTH ──────────────────────
 * `.max(4)` is deliberately NOT written here. A schema refusal would reject a
 * hand-seeded five-button document AT SAVE — punishing an author for a design
 * bound the design chose — and would fail on the way IN rather than telling
 * anyone on the way out. The bound is enforced where it is a bound: the
 * editor's add button disables at MAX_CTA_BUTTONS.
 *
 * `style` absent ⇒ the section's own `buttonStyle` for the first button and the
 * outline treatment for every later one, which is round 57's cascade unchanged.
 * `.optional()` rather than defaulted for that reason: a default would erase
 * the absent state, and absent is what carries the cascade.
 *
 * THERE IS NO `newTab`. A first draft carried one; nothing could write it, so
 * it was reachable only by hand-editing production, and it was removed whole
 * rather than left honoured-but-invisible. Whether a link opens a tab is
 * derived from the href. The decision, the measurement that closed it and the
 * condition that would reopen it are recorded in lib/pageBuilder/ctaButtons.js
 * — read that before adding the key back.
 */
const ctaButton = z.object({
  label:  z.string().default(''),
  href:   z.string().default(''),
  style:  z.enum(BUTTON_STYLES).optional(),
}).passthrough();

const ctaContent = z.object({
  heading:              z.string().default(''),
  description:          z.string().default(''),
  buttons:              z.array(ctaButton).default([]),
  buttonLabel:          z.string().default(''),
  buttonHref:           z.string().default(''),
  secondaryButtonLabel: z.string().default(''),
  secondaryButtonHref:  z.string().default(''),
}).passthrough();

/**
 * Round 57 — `heading` titles the list (เงื่อนไขโปรโมชัน / หมายเหตุ, §B #17).
 * The box TINT is the section background preset's job, not this field's.
 * Defaults to '' and absent renders nothing (§H).
 */
const checklistContent = z.object({
  heading: z.string().default(''),
  items: z.array(z.object({
    text:    z.string().default(''),
    checked: z.boolean().default(true),
  }).passthrough()).default([]),
}).passthrough();

const noticeContent = z.object({
  variant: z.enum(['info', 'success', 'warning', 'error']).default('info'),
  text:    z.string().default(''),
}).passthrough();

export const contentSectionSchemas = [
  defineSection('heading',   headingContent),
  defineSection('rich_text', richTextContent),
  defineSection('image',     imageContent),
  defineSection('cta',       ctaContent),
  defineSection('checklist', checklistContent),
  defineSection('notice',    noticeContent),
];
