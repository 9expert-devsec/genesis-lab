import { z } from 'zod';

/**
 * Shared section foundation — the ENVELOPE every section carries, plus the
 * §6/§7 preset vocabularies. The per-type `content` shapes live in the
 * sibling category files (layout/content/cards/dynamic/advanced.js) and are
 * assembled into a discriminated union in ../pageBuilder.js.
 *
 * Why the split: 27 section types in one file is exactly the failure mode
 * (CustomPageForm.jsx, 1,203 lines) this rebuild replaces. Each category
 * file stays small and owns its `content` schemas; this file owns what they
 * all share.
 *
 * Preset values are snake_case (except ratios, which keep the hyphenated
 * numeric form `60-40` from the requirement's example JSON). Every value
 * maps to a CI token in tailwind.config.js / CSS vars at render time
 * (Phase 2) — never a raw hex (MANIFESTO §7).
 */

// ── §6/§7 preset vocabularies (named constants — single source) ──────

export const CONTAINER_WIDTHS = ['small', 'medium', 'large', 'full'];
export const SPACING          = ['none', 'small', 'medium', 'large', 'xl'];
export const BACKGROUNDS       = ['default', 'white', 'light', 'soft_gray', 'dark', 'brand_gradient', 'image'];
export const COLUMNS           = [1, 2, 3, 4, 'auto_fit']; // mixed number|string per requirement
export const RATIOS            = ['50-50', '40-60', '60-40', '30-70', '70-30'];
export const MOBILE_BEHAVIORS  = ['stack', 'reverse_stack', 'hide', 'carousel'];
export const VISIBILITY        = ['all', 'desktop_only', 'mobile_only', 'hidden'];
export const ACCENTS           = ['brand_blue', 'navy', 'cyan', 'purple', 'orange', 'green'];
export const CARD_STYLES       = ['plain', 'border', 'shadow', 'filled', 'gradient'];
export const BUTTON_STYLES     = ['primary', 'secondary', 'outline', 'ghost'];

// COLUMNS is the only mixed-type preset (numbers 1-4 plus 'auto_fit'), so it
// can't use z.enum (strings only) — build a literal union instead.
const columnsSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal('auto_fit'),
]);

// ── Envelope preset blocks ───────────────────────────────────────────

// settings.* applies to EVERY section (container/spacing/background/
// visibility), so these carry defaults. The example JSON uses
// containerWidth: 'large'.
export const settingsSchema = z
  .object({
    containerWidth: z.enum(CONTAINER_WIDTHS).default('large'),
    spacingTop:     z.enum(SPACING).default('medium'),
    spacingBottom:  z.enum(SPACING).default('medium'),
    background:     z.enum(BACKGROUNDS).default('default'),
    visibility:     z.enum(VISIBILITY).default('all'),
  })
  .default({});

// layout.* only matters for multi-column / carousel sections, so its fields
// are optional (validated when present) rather than forced onto every block.
export const layoutSchema = z
  .object({
    ratio:          z.enum(RATIOS).optional(),
    mobileBehavior: z.enum(MOBILE_BEHAVIORS).optional(),
    columns:        columnsSchema.optional(),
  })
  .default({});

export const styleSchema = z
  .object({
    accentColor: z.enum(ACCENTS).optional(),
    cardStyle:   z.enum(CARD_STYLES).optional(),
    buttonStyle: z.enum(BUTTON_STYLES).optional(),
  })
  .default({});

/**
 * advanced.* — escape hatches. All four fields are DEVELOPER-TIER ONLY.
 * The schema can't see the session, so it accepts them; the action layer
 * (lib/actions/pageBuilder.js) strips customHtml/customCss/customClass/
 * sectionId for non-developer tiers and preserves the previously-stored
 * values (an editor save must never wipe a developer's customisation).
 */
export const advancedSchema = z
  .object({
    sectionId:   z.string().default(''), // developer-tier: custom DOM id
    customClass: z.string().default(''), // developer-tier: extra classes
    customCss:   z.string().default(''), // developer-tier: scoped CSS
    customHtml:  z.string().default(''), // developer-tier: raw HTML
  })
  .default({});

/**
 * The shared envelope, minus `type` and `content` (each section type adds
 * those). Kept as a ZodObject so `.extend()` produces a discriminated-union
 * member.
 */
export const baseSectionSchema = z.object({
  id:        z.string().min(1),
  name:      z.string().default(''),
  enabled:   z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  settings:  settingsSchema,
  layout:    layoutSchema,
  style:     styleSchema,
  advanced:  advancedSchema,
});

/**
 * Build one discriminated-union member: the shared envelope + a `type`
 * literal + that type's `content` schema. `content` defaults to an empty
 * passthrough object so a Phase-1 section with no content still validates
 * (the components — and their exact content shapes — arrive in Phase 2).
 */
export function defineSection(type, contentSchema) {
  return baseSectionSchema.extend({
    type:    z.literal(type),
    content: (contentSchema ?? z.object({}).passthrough()).default({}),
  });
}

/**
 * Recursion support (Phase 2A). Container layout sections nest child sections
 * inside their `content`. To validate those without a circular import
 * (layout.js ↔ pageBuilder.js), the assembled section union is published here
 * by pageBuilder.js after it's built; `childSections` references it lazily —
 * the thunk resolves at PARSE time, by which point `SECTION_REF.schema` is set
 * (verified against zod 3.25.76). Any layout container reuses this one schema
 * instance for its `children` / `left` / `right` fields.
 */
export const SECTION_REF = { schema: null };
export const childSections = z
  .array(
    z.lazy(() => {
      if (!SECTION_REF.schema) {
        throw new Error('[pageBuilder] SECTION_REF.schema not set — import lib/schemas/pageBuilder first');
      }
      return SECTION_REF.schema;
    })
  )
  .default([]);
