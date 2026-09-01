import { z } from 'zod';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. Round 39: the custom-colour vocabulary and its one regex.
import { COLOR_MODES, GRADIENT_DIRECTIONS, HEX_COLOR_RE } from '@/lib/pageBuilder/customColor';

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
/**
 * ── ROUND 59: `promo`, THE SIXTH VALUE ────────────────────────────────────
 * docs/promo-card-style.md §A1 and §I step 2. The other five are MUTUALLY
 * EXCLUSIVE — one enum, one class — and a promotion card needs a border AND a
 * surface AND a shadow at once, which no single value can express. `promo`
 * composes treatments the map already offers rather than introducing a new one;
 * see CARD_STYLE_CLASS for what it resolves to and why.
 *
 * ADDITIVE BY CONSTRUCTION. `resolve()` is a hasOwnProperty lookup with a fixed
 * fallback, so a new key cannot change what another key returns and cannot
 * change the fallback. Every stored section carries `cardStyle` ABSENT, which
 * took the fallback before and takes it after.
 */
export const CARD_STYLES       = ['plain', 'border', 'shadow', 'filled', 'gradient', 'promo'];
export const BUTTON_STYLES     = ['primary', 'secondary', 'outline', 'ghost'];

/**
 * ── ROUND 39: THE CUSTOM-COLOUR VOCABULARY ─────────────────────────────────
 * IMPORTED, not restated. `COLOR_MODES` and `GRADIENT_DIRECTIONS` belong with
 * the CSS they turn into, and a second copy here is the drift this file's own
 * "named constants — single source" header exists to prevent. The regex is
 * imported for the same reason: what counts as an author colour is decided in
 * exactly one place, and the schema is one of its two enforcement points.
 */
export { COLOR_MODES, GRADIENT_DIRECTIONS } from '@/lib/pageBuilder/customColor';

// COLUMNS is the only mixed-type preset (numbers 1-4 plus 'auto_fit'), so it
// can't use z.enum (strings only) — build a literal union instead.
const columnsSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal('auto_fit'),
]);

// ── Envelope preset blocks ───────────────────────────────────────────

// settings.* applies to EVERY section (container/spacing/background/
// visibility), so these carry defaults. The example JSON uses
// containerWidth: 'large'.
/**
 * An author-entered colour, as the schema sees it — round 39.
 *
 * `HEX_COLOR_RE` is imported rather than written here: this value reaches a
 * style attribute, and "what counts as a colour" having two definitions is how
 * one of them ends up laxer than the other. See lib/pageBuilder/customColor.js
 * for what is accepted and what each rejection is for.
 */
const hexColor = z.string().regex(HEX_COLOR_RE, 'ต้องเป็นรหัสสีแบบ #RRGGBB');

/**
 * `settings.backgroundCustom` — the two stops and the direction.
 *
 * ── EVERY FIELD IS OPTIONAL, AND SO IS THE BLOCK ──────────────────────────
 * Deliberately, and it is the load-bearing choice of this commit. A `.default()`
 * anywhere in here would mean the next save of ANY page writes new keys into
 * every one of its sections — 18 live sections across the corpus today, none of
 * which asked for a colour. Optional-and-absent means a page nobody edits
 * stores exactly what it stored before, and a page someone edits stores nothing
 * new unless they actually chose a colour.
 *
 * `to` accepts the empty string as well as a hex, because EMPTY IS A VALUE
 * here: it is how "one stop" is spelled. See customBackgroundStyle — an absent
 * second stop is a flat colour, and a second stop equal to the first is a
 * gradient. The schema has to be able to express the difference or the renderer
 * cannot honour it.
 */
export const backgroundCustomSchema = z
  .object({
    from:      hexColor.optional(),
    to:        z.union([hexColor, z.literal('')]).optional(),
    direction: z.enum(GRADIENT_DIRECTIONS).optional(),
  })
  .optional();

export const settingsSchema = z
  .object({
    containerWidth: z.enum(CONTAINER_WIDTHS).default('large'),
    spacingTop:     z.enum(SPACING).default('medium'),
    spacingBottom:  z.enum(SPACING).default('medium'),
    background:     z.enum(BACKGROUNDS).default('default'),
    visibility:     z.enum(VISIBILITY).default('all'),
    /**
     * ROUND 39. Absent means `preset` — the mode is not defaulted, it is
     * INFERRED FROM ABSENCE, which is what keeps every stored section byte-
     * identical until somebody chooses otherwise. `background` above keeps its
     * default and its meaning unchanged and is what `preset` mode resolves.
     */
    /**
     * ── ROUND 71: THE GAP BETWEEN A CONTAINER'S CHILDREN ─────────────────
     * `spacingTop`/`spacingBottom` above are the space OUTSIDE a section.
     * Nothing controlled the space BETWEEN a container's children, which was
     * `gap-8` written into the component — so stacking three containers
     * stacked three fixed 32px gaps and no author could reach any of them.
     *
     * ── OPTIONAL, WITH NO DEFAULT, AND THAT IS THE WHOLE SAFETY ──────────
     * Round 56 §H: a field that changes something every stored section
     * ALREADY SHOWS must read ABSENT as the incumbent. `.lean()` applies no
     * Mongoose defaults and JSON serialisation drops undefined keys, so every
     * container stored before this commit reads the key back ABSENT — and
     * `spacingBetweenClass` answers absent with `gap-8`, the 32px that is
     * already there. Not the scale's midpoint BECAUSE it is the midpoint: it
     * is the incumbent, and `medium` happening to be the same 32px is a
     * convenience, not the reason.
     *
     * `.optional()` with NO default is the round-39 shape (`backgroundMode`
     * directly above), and it is load-bearing rather than stylistic: a
     * `.default()` here would WRITE the key into every section that merely
     * passes through a parse, which test/pure/customColor's "a stored section
     * gains NOTHING when it is re-validated" exists to catch.
     *
     * The VOCABULARY is `SPACING`, reused whole — same five values, same
     * labels, same numbers (0/16/32/64/96px). Round 17: this repo mints no
     * spacing scale of its own, and a second one here would mean an author
     * learning that "ปานกลาง" means two different distances.
     */
    spacingBetween: z.enum(SPACING).optional(),
    backgroundMode:   z.enum(COLOR_MODES).optional(),
    backgroundCustom: backgroundCustomSchema,
    /**
     * ROUND 79 — the third mode, as a flag rather than a third COLOR_MODES value.
     *
     * `true` means "use my colour verbatim in BOTH themes", which is round 39's
     * original promise kept as an opt-in for a brand colour that must not shift.
     * ABSENT means the colour is DERIVED in dark mode, which is the new default.
     *
     * A FLAG AND NOT A THIRD ENUM VALUE, deliberately. `COLOR_MODES` answers
     * "who chose this colour — the theme or the author", and that is still a
     * two-way question; whether an author's colour is allowed to shift is a
     * separate one. Folding them into one enum would make `preset` + pinned
     * expressible and meaningless, and would put three values in a control that
     * round 39 argued hard for keeping at two.
     *
     * `.optional()` with NO default is the round-39 shape above and is
     * load-bearing for the same reason: a `.default(false)` would WRITE the key
     * into every section that merely passes through a parse, which
     * test/pure/customColor's "a stored section gains NOTHING when it is
     * re-validated" exists to catch.
     */
    backgroundPin:    z.boolean().optional(),
  })
  .default({});

/**
 * The same envelope with a DIFFERENT starting width for one section type.
 *
 * ── WHY THIS EXISTS: A DEFAULT INSTEAD OF A CLAMP ──────────────────────────
 * `container` used to keep its narrow readable column by hardcoding a max-width
 * in its component. That is a second authority over a concept
 * `settings.containerWidth` already owns, and it silently outranked the author:
 * three of the four settings painted the same number of pixels.
 *
 * Moving the narrowness here changes it from a rule an author cannot reach into
 * a STARTING POINT they can. The type keeps its character by DEFAULTING to a
 * readable column; picking anything else now does what it says.
 *
 * ── IT REPLACES THE DEFAULT, IT DOES NOT LAYER OVER IT ─────────────────────
 * That distinction is the whole point, because "two defaults for one field" is
 * the shape being removed, not a smaller version of it to be tolerated.
 * `.extend()` OVERWRITES a key rather than merging it, so the member this
 * produces has exactly ONE default for `containerWidth` and the base's value is
 * not present in it at all. There is no precedence rule to remember and nothing
 * that could start winning differently after a zod upgrade.
 *
 * The unwrap/rewrap is required, not stylistic: `settingsSchema` is a
 * ZodDefault, which has no `.extend()`. `.removeDefault()` returns the inner
 * object, and the `.default({})` is put back so an absent `settings` still
 * fills itself in — dropping it would make the whole block required and reject
 * every section that omits it.
 */
export function settingsWithContainerWidth(width) {
  return settingsSchema
    .removeDefault()
    .extend({ containerWidth: z.enum(CONTAINER_WIDTHS).default(width) })
    .default({});
}

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
    /**
     * ROUND 39, same shape and same reason as `backgroundMode` above: absent
     * means `preset`, so nothing is written for a section nobody recolours.
     *
     * `accentColor` keeps its enum and its meaning — it is what `preset` mode
     * resolves — and its SCOPE is unchanged. The accent still reaches icons,
     * accent rules, buttons, links and key figures, in this section and in the
     * sections nested inside it. Narrowing it to buttons would restyle every
     * section already using it, which is a change nobody asked for.
     */
    accentMode:   z.enum(COLOR_MODES).optional(),
    accentCustom: hexColor.optional(),
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
 *
 * `settings` accepts a per-type override — see settingsWithContainerWidth, and
 * `container` in layout.js, its only user today. It is a parameter HERE rather
 * than an `.extend()` at the call site so that every union member is still
 * produced by exactly one expression: a second way to build a member is how the
 * envelope comes to differ between types for reasons nobody wrote down.
 */
export function defineSection(type, contentSchema, { settings } = {}) {
  return baseSectionSchema.extend({
    type:     z.literal(type),
    content:  (contentSchema ?? z.object({}).passthrough()).default({}),
    ...(settings ? { settings } : {}),
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
