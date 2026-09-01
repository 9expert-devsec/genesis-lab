/**
 * Preset → Tailwind-class / CSS-var maps for the Page Builder renderer.
 *
 * The preset VOCABULARIES are the single source of truth in
 * `src/lib/schemas/sections/base.js` (+ PAGE_THEMES in pageBuilder.js); this
 * file only maps each declared value to a concrete class or CSS-var bundle.
 * Two guarantees:
 *
 *   1. COMPLETENESS — at module load we assert every enum value has a map
 *      entry and throw if one is missing. A new preset value can never render
 *      an unstyled element silently; the build breaks instead.
 *   2. NO RAW HEX (MANIFESTO §7) — every colour resolves through an existing
 *      CI token (a `9e-*` Tailwind colour or a `--9e-*` CSS var). Nothing here
 *      is a literal hex.
 *
 * IMPORTANT (Tailwind JIT): the class strings below are the literals Tailwind
 * scans. `tailwind.config.js` must include `./src/lib/**` in `content` or none
 * of these classes are emitted. Never build a class name by interpolating a
 * preset value into a template literal — the JIT can't see it.
 *
 * ── Accent mechanism ─────────────────────────────────────────────────
 * Accent colour cascades through CSS custom properties, not fixed classes, so
 * a theme sets a page-wide default and a section can override for its subtree:
 *   --pb-accent-fill : the accent colour itself (backgrounds, borders)
 *   --pb-accent-text : accent colour SAFE as text on the page surface
 *   --pb-accent-on   : readable text colour placed ON the fill
 * The theme wrapper sets these from its default accent; a section with
 * `style.accentColor` re-sets them inline (see accentVars()), overriding the
 * cascade. Components read them via `bg-[var(--pb-accent-fill)]` etc.
 *
 * Purple is NEVER a text colour (fails WCAG AA): `accentVars('purple').text`
 * degrades to navy. Enforced here in the map, not by a comment at the callsite.
 */

import {
  CONTAINER_WIDTHS, SPACING, BACKGROUNDS, COLUMNS, RATIOS,
  MOBILE_BEHAVIORS, VISIBILITY, ACCENTS, CARD_STYLES, BUTTON_STYLES,
} from '@/lib/schemas/sections/base';
import { PAGE_THEMES } from '@/lib/schemas/pageBuilder';
// ADDED beside the statements above rather than folded into either — the
// standing rule in this repo. Round 39: the author-colour half.
import { customBackgroundStyle, hasCustomBackground, hexOrNull } from '@/lib/pageBuilder/customColor';
// ADDED beside the statement above rather than folded into it. `accentContrastOk`
// picks --pb-accent-on: a custom accent dark enough to read light text on gets
// the light token, and a pale one gets the dark token. Same question the
// contrast warning asks, so the control and the render cannot disagree.
import { accentContrastOk } from '@/lib/pageBuilder/customColor';

// ── settings.containerWidth → inner max-width ────────────────────────
const CONTAINER_WIDTH_CLASS = {
  small:  'max-w-2xl',        // ~672px
  medium: 'max-w-4xl',        // ~896px
  large:  'max-w-[1200px]',   // site convention
  full:   'max-w-none',
};

// ── settings.spacingTop / spacingBottom → padding ────────────────────
const SPACING_TOP_CLASS = {
  none: 'pt-0', small: 'pt-4', medium: 'pt-8', large: 'pt-16', xl: 'pt-24',
};
const SPACING_BOTTOM_CLASS = {
  none: 'pb-0', small: 'pb-4', medium: 'pb-8', large: 'pb-16', xl: 'pb-24',
};

// ── settings.spacingBetween → gap BETWEEN a container's children ─────
/**
 * ROUND 71. The SAME five values as the two maps above, at the SAME five
 * distances (0/16/32/64/96px) — `gap-*` rather than `pt-*`/`pb-*` because it
 * is the space between children, not around the section. Reusing the
 * vocabulary is the point: an author who has learned what "ปานกลาง" means
 * from ระยะห่างด้านบน gets the same number here.
 *
 * `medium` is `gap-8` = 32px = EXACTLY what container and full_width
 * hardcoded, which is what lets the accessor below answer an absent value
 * with it and leave every stored container byte-identical.
 */
const SPACING_BETWEEN_CLASS = {
  none: 'gap-0', small: 'gap-4', medium: 'gap-8', large: 'gap-16', xl: 'gap-24',
};

/**
 * The types that HONOUR `settings.spacingBetween` — the single source the
 * settings panel derives its control from, so offering the control and
 * reading the value cannot drift (the 2C.3 rule, applied to a settings.* key
 * rather than a style.* one, which is why it is not folded into
 * SECTION_STYLE_CAPS).
 *
 * Exactly the two vertical stacks. NOT the grids: their gap is a grid
 * GUTTER, horizontal and vertical at once. NOT `two_column`: it has TWO
 * distinct gaps (between the columns, and between the items inside each),
 * and one control for two gaps is a control whose effect an author cannot
 * predict. Both exclusions are arguments a later round can overturn; neither
 * is an oversight.
 */
export const SPACING_BETWEEN_TYPES = ['container', 'full_width'];

// ── settings.background → surface ────────────────────────────────────
/**
 * ── ROUND 78: THESE FOLLOW THE THEME NOW ─────────────────────────────────
 * Four of these were literal Tailwind colours — `bg-white`, `bg-9e-ice`,
 * `bg-9e-slate-lt-800`, `bg-9e-navy` — and every one resolves to a raw brand
 * hex that globals.css declares ONCE, with no `.dark` form. A section carrying
 * any of them painted the same colour in both themes, which is why a published
 * page rendered as an opaque light slab on a dark canvas.
 *
 * They now read `--pb-bg-*`, declared in globals.css in BOTH blocks. THE LIGHT
 * VALUES ARE THE OLD LITERALS BYTE FOR BYTE (#FFFFFF, #F8FAFD, #F1F3F6,
 * #0D1B2A), so light mode renders exactly as it did; a test compiles the
 * stylesheet and asserts each one, and a second test asserts each resolves
 * DIFFERENTLY under `.dark` — the assertion whose absence let this ship.
 *
 * `brand_gradient` is UNCHANGED and that is a decision, not an omission: it
 * paints two of the thirteen raw brand hexes, which are theme-invariant on
 * purpose. A brand gradient is not a theme surface. `default` and `image`
 * paint nothing, so there is nothing to convert.
 */
const BACKGROUND_CLASS = {
  default:        '',                            // inherit theme surface
  white:          'bg-[var(--pb-bg-white)]',
  light:          'bg-[var(--pb-bg-light)]',
  soft_gray:      'bg-[var(--pb-bg-soft-gray)]',
  dark:           'bg-[var(--pb-bg-dark)]',
  brand_gradient: 'bg-9e-gradient-hero',         // brand colour, theme-invariant
  image:          '',                            // TODO: needs a bg-image source field
};
// Backgrounds that require light text on top.
const DARK_BACKGROUNDS = new Set(['dark', 'brand_gradient']);

// ── layout.columns → responsive grid ────────────────────────────────
const COLUMNS_CLASS = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  auto_fit: 'grid-cols-[repeat(auto-fit,minmax(240px,1fr))]',
};

// ── layout.ratio → two-column template (stacks below lg) ─────────────
const RATIO_CLASS = {
  '50-50': 'lg:grid-cols-2',
  '40-60': 'lg:grid-cols-[2fr_3fr]',
  '60-40': 'lg:grid-cols-[3fr_2fr]',
  '30-70': 'lg:grid-cols-[3fr_7fr]',
  '70-30': 'lg:grid-cols-[7fr_3fr]',
};

// ── layout.mobileBehavior → mobile treatment (max-md = below 768) ────
const MOBILE_BEHAVIOR_CLASS = {
  stack:         '',
  reverse_stack: 'max-md:flex-col-reverse',
  hide:          'max-md:hidden',
  carousel:      'max-md:!flex max-md:overflow-x-auto max-md:flex-nowrap max-md:snap-x max-md:[&>*]:min-w-[80%] max-md:[&>*]:snap-start',
};

// ── settings.visibility → responsive display (md = 768 divide) ───────
// `hidden` is handled by the renderer (skips render entirely); the entry
// exists for completeness and as a CSS fallback.
const VISIBILITY_CLASS = {
  all:          '',
  desktop_only: 'hidden md:block',
  mobile_only:  'block md:hidden',
  hidden:       'hidden',
};

// ── style.accentColor → CSS-var bundle ───────────────────────────────
// fill: the colour · text: colour SAFE as text on the page surface ·
// on: readable text placed ON the fill.
const ACCENT_VARS = {
  brand_blue: { fill: 'var(--9e-action)',    text: 'var(--9e-action)',    on: 'var(--9e-ice)'  },
  navy:       { fill: 'var(--9e-navy)',      text: 'var(--9e-navy)',      on: 'var(--9e-ice)'  },
  cyan:       { fill: 'var(--9e-cyan-50)',   text: 'var(--9e-cyan-50)',   on: 'var(--9e-navy)' }, // text = large-display only
  orange:     { fill: 'var(--9e-orange-50)', text: 'var(--9e-orange-50)', on: 'var(--9e-navy)' },
  green:      { fill: 'var(--9e-green-50)',  text: 'var(--9e-green-50)',  on: 'var(--9e-navy)' },
  // Purple: fill OK, but NEVER a text colour → degrade text to navy.
  purple:     { fill: 'var(--9e-purple-50)', text: 'var(--9e-navy)',      on: 'var(--9e-ice)'  },
};

// ── style.cardStyle → card treatment ─────────────────────────────────
const CARD_STYLE_CLASS = {
  plain:    '',
  border:   'border border-[var(--surface-border)]',
  shadow:   'shadow-9e-md',
  filled:   'bg-9e-ice',
  gradient: 'bg-9e-gradient-subtle',
  /**
   * ── ROUND 59: THE PROMOTION SURFACE ─────────────────────────────────────
   * docs/promo-card-style.md §A1: the five values above are MUTUALLY EXCLUSIVE,
   * one enum to one class, and a promotion card needs an edge AND a surface AND
   * a lift at once. `promo` is that combination and NOTHING ELSE — three
   * treatments this map already offers, composed. No new token is introduced.
   *
   * ── WHY --surface AND NOT bg-9e-gradient-subtle ─────────────────────────
   * Round 58 §I step 2 proposed the gradient. Building the target page showed
   * why that is wrong, and it is the defect §A2 predicted: `bg-9e-ice` and
   * `bg-9e-gradient-subtle` are literal LIGHT-mode hexes with no `.dark`
   * counterpart, and `border`/`shadow` paint no surface at all — so no existing
   * value gives a theme-aware OPAQUE card. On a section with a custom gradient
   * background the parent's colour showed straight through the card.
   *
   * `--surface` is the house's opaque card surface, defined in BOTH themes
   * (light #FFFFFF, dark #132638) and already read by 300-odd class strings
   * across src/. Pairing it with `--surface-border` is the same pairing
   * PreviewGate and the policy pages already use. So this needs no palette
   * decision — round 39's rule is respected by REUSING a semantic token, not by
   * naming a new colour.
   *
   * WHAT THIS IS NOT: the original page's PEACH gradient. That colour has no
   * 9Expert token (docs/promo-card-style.md §B) and inventing one is a palette
   * decision, not this commit's. `promo` is the opaque promotion card; it is
   * blue-neutral, and deliberately so.
   *
   * `shadow-9e-lg` rather than `-md`: the lift has to read against a section
   * background the author has coloured, and both resolve through
   * `--shadow-color`, which globals.css redefines under `.dark`.
   *
   * ── IT SETS ITS OWN TEXT COLOUR, AND THAT IS THE LOAD-BEARING PART ──────
   * There are TWO independent theme switches and they can disagree:
   *
   *   SITE  `.dark` on the root (next-themes). `--surface` answers to this.
   *   PAGE  `page.theme` → THEME[t].pageClass, which is what sets the text
   *         colour every card INHERITS. `corporate_navy` paints
   *         `bg-9e-navy text-9e-ice` whatever `.dark` says.
   *
   * A card that paints its own surface off the SITE axis while inheriting text
   * chosen for the PAGE axis is unreadable wherever the two disagree. Measured
   * (scripts/_probe-round59-theme-axes.mjs), contrast of the title on the card:
   *
   *   page.theme        site .dark   surface-only   with --text-primary
   *   default           false            17.39            17.39
   *   default           TRUE              1.13            14.75
   *   corporate_navy    FALSE             1.05            17.39
   *   corporate_navy    true             14.75            14.75
   *
   * The two capitalised rows are the ones that were unreadable, and both are
   * reachable: a viewer toggling the site to dark on a `default` page, and a
   * `corporate_navy` page viewed in site-light.
   *
   * So `--text-primary` is not decoration: it is the half that makes the pair
   * answer ONE axis. This is the same rule `--pb-accent-on` already follows —
   * text placed on a surface the theme does not own is chosen by whoever owns
   * the surface. Children that set their own colour (the accent price, the
   * muted footnote) still win; this only replaces the inherited default.
   *
   * ── A PRE-EXISTING DEFECT THIS MAKES VISIBLE, AND DOES NOT FIX ──────────
   * `filled` scores 1.00 on `corporate_navy` in BOTH site modes — ice text on
   * an ice card, invisible — and `gradient` has the same shape. They are
   * literal light hexes answering NEITHER axis. No stored section uses either
   * (all seven carry `cardStyle` absent), so nothing is broken today, but
   * changing what those two values mean is a separate decision from adding a
   * sixth. Reported, not folded in. See docs/promo-card-style.md §A2.
   */
  promo:    'border border-[var(--surface-border)] bg-[var(--surface)] '
            + 'text-[var(--text-primary)] shadow-9e-lg',
};

// ── style.buttonStyle → button treatment (accent via --pb-accent-*) ──
const BUTTON_STYLE_CLASS = {
  primary:   'bg-[var(--pb-accent-fill)] text-[var(--pb-accent-on)] hover:opacity-90',
  secondary: 'bg-9e-navy text-9e-ice hover:bg-9e-card',
  outline:   'border border-[color:var(--pb-accent-fill)] text-[var(--pb-accent-text)] hover:bg-[var(--pb-accent-fill)] hover:text-[var(--pb-accent-on)]',
  ghost:     'text-[var(--pb-accent-text)] hover:bg-9e-ice',
};

// ── theme → page surface + default accent CSS vars ───────────────────
// Each theme sets --pb-accent-* from a default accent (see themeStyle()).
// `dark_premium` has no defined treatment yet — it aliases `default`.
// TODO(design): define dark_premium's own surface/accent when specced.
/**
 * ── ROUND 78: THE PAGE SHELL FOLLOWS THE THEME TOO, AND IT HAD TO ────────
 * This table was NOT in the round's brief, which named only BACKGROUND_CLASS
 * above. Converting that table alone would have fixed NOTHING on the page the
 * author reported, and the measurement says so exactly. On
 * /promotions/early-bird-claude-code, in dark mode, before this change:
 *
 *   section [0]  own background-color rgba(0,0,0,0)   effective #f8e7d5 (custom)
 *   section [1]  own background-color rgba(0,0,0,0)   effective #ffffff
 *   section [2]  own background-color rgba(0,0,0,0)   effective #ffffff
 *   section [3]  own background-color rgba(0,0,0,0)   effective #f8e7d5 (custom)
 *   page shell   class "bg-white text-9e-navy"        computed  #ffffff
 *
 * Every section paints NOTHING — all 63 live sections in the corpus carry
 * `background: default`, whose class is `''`. The white slab is this table,
 * inherited. So the shell is converted here on the same terms as the surfaces
 * above: the light rendering is byte-identical and only the dark one is new.
 *
 *   bg-white     #FFFFFF -> --pb-bg-white     #FFFFFF light / #0D1B2A dark
 *   bg-9e-ice    #F8FAFD -> --pb-bg-light     #F8FAFD light / #132638 dark
 *   bg-9e-navy   #0D1B2A -> --pb-bg-dark      #0D1B2A light / #080E16 dark
 *   text-9e-navy #0D1B2A -> --text-primary    #0D1B2A light / #F8FAFD dark
 *
 * `corporate_navy` KEEPS `text-9e-ice` as a literal, deliberately. It is a
 * dark band in BOTH themes, so its text must be light in both; pointing it at
 * `--text-primary` would paint navy on navy in light mode. The one place the
 * old literal is still correct is the one place it is kept.
 */
const THEME = {
  default:           { pageClass: 'bg-[var(--pb-bg-white)] text-[var(--text-primary)]', accent: 'brand_blue', dark: false },
  promotion_blue:    { pageClass: 'bg-[var(--pb-bg-light)] text-[var(--text-primary)]', accent: 'brand_blue', dark: false },
  early_bird_orange: { pageClass: 'bg-[var(--pb-bg-white)] text-[var(--text-primary)]', accent: 'orange',     dark: false },
  ai_purple:         { pageClass: 'bg-[var(--pb-bg-white)] text-[var(--text-primary)]', accent: 'purple',     dark: false },
  corporate_navy:    { pageClass: 'bg-[var(--pb-bg-dark)] text-9e-ice',                 accent: 'brand_blue', dark: true  },
  light_minimal:     { pageClass: 'bg-[var(--pb-bg-white)] text-[var(--text-primary)]', accent: 'brand_blue', dark: false },
  dark_premium:      { pageClass: 'bg-[var(--pb-bg-white)] text-[var(--text-primary)]', accent: 'brand_blue', dark: false }, // = default (TODO)
};

// ── completeness assertion (fail loudly at module load) ──────────────
function assertComplete(name, map, values) {
  for (const v of values) {
    if (!Object.prototype.hasOwnProperty.call(map, String(v))) {
      throw new Error(`[pageBuilder presets] "${name}" is missing an entry for "${v}"`);
    }
  }
}
assertComplete('containerWidth', CONTAINER_WIDTH_CLASS, CONTAINER_WIDTHS);
assertComplete('spacingTop', SPACING_TOP_CLASS, SPACING);
assertComplete('spacingBottom', SPACING_BOTTOM_CLASS, SPACING);
assertComplete('spacingBetween', SPACING_BETWEEN_CLASS, SPACING);
assertComplete('background', BACKGROUND_CLASS, BACKGROUNDS);
assertComplete('columns', COLUMNS_CLASS, COLUMNS);
assertComplete('ratio', RATIO_CLASS, RATIOS);
assertComplete('mobileBehavior', MOBILE_BEHAVIOR_CLASS, MOBILE_BEHAVIORS);
assertComplete('visibility', VISIBILITY_CLASS, VISIBILITY);
assertComplete('accent', ACCENT_VARS, ACCENTS);
assertComplete('cardStyle', CARD_STYLE_CLASS, CARD_STYLES);
assertComplete('buttonStyle', BUTTON_STYLE_CLASS, BUTTON_STYLES);
assertComplete('theme', THEME, PAGE_THEMES);

// ── runtime resolver ─────────────────────────────────────────────────
// A directly-seeded Mongo doc can carry a value the enum (and thus the map)
// doesn't know. Never crash a render for one bad section: warn in dev and
// return the caller's safe fallback.
function resolve(map, value, fallback, name) {
  if (value != null && Object.prototype.hasOwnProperty.call(map, String(value))) {
    return map[String(value)];
  }
  if (value != null && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(`[pageBuilder presets] unknown ${name} preset: ${JSON.stringify(value)} — using fallback`);
  }
  return fallback;
}

// ── public accessors ─────────────────────────────────────────────────
export const containerWidthClass = (v) => resolve(CONTAINER_WIDTH_CLASS, v, CONTAINER_WIDTH_CLASS.large, 'containerWidth');
export const spacingTopClass     = (v) => resolve(SPACING_TOP_CLASS, v, SPACING_TOP_CLASS.medium, 'spacingTop');
export const spacingBottomClass  = (v) => resolve(SPACING_BOTTOM_CLASS, v, SPACING_BOTTOM_CLASS.medium, 'spacingBottom');
// ROUND 71 — the fallback is the INCUMBENT 32px, and `resolve` returns it
// silently for an absent value (it only warns for a value it does not know).
export const spacingBetweenClass = (v) => resolve(SPACING_BETWEEN_CLASS, v, SPACING_BETWEEN_CLASS.medium, 'spacingBetween');
export const backgroundClass     = (v) => resolve(BACKGROUND_CLASS, v, BACKGROUND_CLASS.default, 'background');
export const isDarkBackground    = (v) => DARK_BACKGROUNDS.has(String(v));
export const columnsClass        = (v) => resolve(COLUMNS_CLASS, v, COLUMNS_CLASS[1], 'columns');
export const ratioClass          = (v) => resolve(RATIO_CLASS, v, RATIO_CLASS['50-50'], 'ratio');
export const mobileBehaviorClass = (v) => resolve(MOBILE_BEHAVIOR_CLASS, v, MOBILE_BEHAVIOR_CLASS.stack, 'mobileBehavior');
export const visibilityClass     = (v) => resolve(VISIBILITY_CLASS, v, VISIBILITY_CLASS.all, 'visibility');

// ── style capability single-source (2C.3) ───────────────────────────────
//
// `cardStyleClass` / `buttonStyleClass` are PRIVATE BY DESIGN — not exported.
// This is the load-bearing move of 2C.3, and it is invisible as intent (it just
// looks like two unused functions someone could "helpfully" re-export), so:
// EXPORTING EITHER RE-OPENS THE panel↔component DRIFT THIS REFACTOR CLOSED.
// A component that can call cardStyleClass directly can read `style.cardStyle`
// without the capability declaration knowing, and the settings panel — which
// derives its controls from that same declaration — would then not offer a
// control (or offer a dead one). The ONLY sanctioned path from a style prop to a
// class is the capability helpers below, which gate on SECTION_STYLE_CAPS. Keep
// these private; there is a test (test/fs/styleCaps.test.mjs) asserting no
// component imports them.
const cardStyleClass   = (v) => resolve(CARD_STYLE_CLASS, v, CARD_STYLE_CLASS.plain, 'cardStyle');
const buttonStyleClass = (v) => resolve(BUTTON_STYLE_CLASS, v, BUTTON_STYLE_CLASS.primary, 'buttonStyle');

/**
 * SECTION_STYLE_CAPS — the ONE source for "which style props does this section
 * type support". BOTH the components (via the helpers below) and the settings
 * panel (SectionTypeFields derives its controls) read from this, so reading a
 * prop and offering a control for it are the SAME act and cannot drift (2C.3).
 *
 * Precondition that made this a one-declaration change (not a component-
 * unification): all readers already consumed the prop identically, through the
 * one helper. Applying this pattern to the LAYOUT correspondence
 * (ratio/columns/mobileBehavior) later requires checking that precondition holds
 * there first — see docs/page-builder-status.md 2C.3.
 */
export const SECTION_STYLE_CAPS = {
  cta:        ['buttonStyle'],
  price_card: ['cardStyle', 'buttonStyle'],
  stat_card:  ['cardStyle'],
  icon_card:  ['cardStyle'],
};

/** Does `type` declare support for `prop`? The gate both helpers share. */
export const sectionSupportsStyle = (type, prop) => (SECTION_STYLE_CAPS[type] ?? []).includes(prop);

/**
 * The card SURFACE class for `type` — the cardStyle treatment, but ONLY if the
 * type declares cardStyle in SECTION_STYLE_CAPS. A type that doesn't gets '',
 * so it cannot silently read a prop the panel won't offer.
 */
export const cardSurfaceClass = (type, style) =>
  (sectionSupportsStyle(type, 'cardStyle') ? cardStyleClass(style?.cardStyle) : '');

/** The accent BUTTON class for `type` — same gate, on buttonStyle. */
export const accentButtonClass = (type, style) =>
  (sectionSupportsStyle(type, 'buttonStyle') ? buttonStyleClass(style?.buttonStyle) : '');

/** `visibility === 'hidden'` → the renderer skips the section entirely. */
export const isHiddenVisibility = (v) => String(v) === 'hidden';

/**
 * The backgrounds an author may CHOOSE today — declared here, next to the map
 * that explains the gap, rather than in the settings panel where nothing can
 * check it.
 *
 * `image` is excluded: BACKGROUND_CLASS.image is '' pending a bg-image source
 * field, so offering it would be a control that silently does nothing — the
 * author picks it, the page is unchanged, no error. `default` is also '' but
 * legitimately so (it inherits the theme surface), which is why this is an
 * explicit list and not "every value with a non-empty class".
 *
 * When the source field lands: implement BACKGROUND_CLASS.image and delete the
 * filter. The loader check asserts the class is still '' precisely so this
 * exclusion retires itself the moment that stops being true.
 */
export const OFFERED_BACKGROUNDS = BACKGROUNDS.filter((b) => b !== 'image');

/**
 * The three accent CSS vars for a given accent value, as an inline-style
 * object. Applied by the theme wrapper (page default) and re-applied by a
 * section with `style.accentColor` (subtree override).
 */
export function accentVars(accent) {
  const a = resolve(ACCENT_VARS, accent, ACCENT_VARS.brand_blue, 'accent');
  return {
    '--pb-accent-fill': a.fill,
    '--pb-accent-text': a.text,
    '--pb-accent-on':   a.on,
  };
}

/**
 * ── ROUND 39: THE TWO MODES, RESOLVED HERE ────────────────────────────────
 *
 * Everything above resolves a PRESET to a token. These three resolve the pair
 * (mode, value) to what the renderer applies, and they exist here rather than
 * in the renderer for round 20's reason: this module serves BOTH the published
 * page and the editor canvas, and a resolution rule that lived in one of them
 * would be a rule the other did not have.
 *
 * ── THE PRESET PATH IS NOT TOUCHED, AND THAT IS THE CLAIM ─────────────────
 * `backgroundClass`, `isDarkBackground` and `accentVars` above are byte-for-
 * byte what they were. Each function below asks ONE question first — did the
 * author choose `custom`? — and when the answer is no it hands back exactly
 * what the old call site would have produced. A section stored before this
 * round has no `backgroundMode` and no `accentMode`, so it takes the `no`
 * branch on every render, for ever, without anything having to migrate it.
 */

/**
 * The background class for a section — '' when a custom colour is taking over.
 *
 * The class has to be SUPPRESSED rather than merely overridden: `bg-white` sets
 * `background-color`, and a custom GRADIENT sets `background-image`, so the two
 * would both apply and the preset would show through wherever the gradient did
 * not paint. Two things owning one surface is the shape this codebase keeps
 * removing; the mode decides which one owns it.
 */
export function backgroundClassFor(settings) {
  return hasCustomBackground(settings) ? '' : backgroundClass(settings?.background);
}

/**
 * The inline background style, or undefined.
 *
 * `undefined` rather than `{}` so the renderer can spread it without emitting a
 * `style` attribute on every section that has no custom colour.
 */
export function backgroundStyleFor(settings) {
  return hasCustomBackground(settings) ? customBackgroundStyle(settings.backgroundCustom) : undefined;
}

/**
 * Does this section need light text on its background?
 *
 * A CUSTOM background answers NO — always, whatever its luminance.
 *
 * That is D4 stated as code. Deriving the answer from the author's colour would
 * make the section's text colour a function of its background, which is a
 * SECOND AUTHORITY beside the theme — the exact thing rounds 21-25 spent four
 * rounds removing from container.jsx, arriving somewhere new. The preset list
 * is a hand-made judgement about six known colours and stays one; a custom
 * colour gets the theme's text and a warning at the control.
 */
export function isDarkBackgroundFor(settings) {
  return hasCustomBackground(settings) ? false : isDarkBackground(settings?.background);
}

/**
 * The three accent variables for a section — preset bundle, custom hex, or
 * undefined when the section sets no accent at all.
 *
 * ── WHY A CUSTOM ACCENT STILL FILLS ALL THREE ─────────────────────────────
 * The variables are a contract with twelve components, and a partial bundle
 * would leave some of them reading the page-level value while their siblings
 * read the section's — one accent painting two colours inside one section.
 *
 *   fill — the author's colour, verbatim. This is what they chose.
 *   text — the author's colour, verbatim, AND NOT DEGRADED. The preset table
 *          degrades purple because purple is a known value someone judged;
 *          a custom colour is not knowable in advance, so the author is warned
 *          at the control and their choice is honoured. Silently painting a
 *          different colour than the one they picked is worse than an
 *          unreadable one they were told about.
 *   on   — one of the two theme text tokens, chosen by luminance.
 *
 * `on` is the one computed value in this round and it is NOT what D4 forbids.
 * D4 is about the page's TEXT colour being derived from its BACKGROUND, which
 * would take a decision away from the theme. `--pb-accent-on` is text placed on
 * the ACCENT FILL — a surface the theme has never owned and that the preset
 * table above already decides by hand, per accent. Extending that same decision
 * to a value the table cannot enumerate is continuing one authority, not
 * creating a second: without it every `primary` button in the section renders
 * its label in a colour nobody chose.
 */
export function accentVarsFor(style) {
  if (style?.accentMode === 'custom') {
    const hex = hexOrNull(style?.accentCustom);
    // An invalid stored value falls all the way back to the preset path — which
    // for a section that only ever set a custom colour means no override at all,
    // i.e. the page default. Never a broken style, never a partial bundle.
    if (hex) {
      return {
        '--pb-accent-fill': hex,
        '--pb-accent-text': hex,
        '--pb-accent-on': accentContrastOk(hex) ? 'var(--9e-ice)' : 'var(--9e-navy)',
      };
    }
  }
  return style?.accentColor ? accentVars(style.accentColor) : undefined;
}

/** Theme surface class + whether the theme is dark. */
export function themeSurface(theme) {
  const t = resolve(THEME, theme, THEME.default, 'theme');
  return { pageClass: t.pageClass, dark: t.dark };
}

/** Theme wrapper inline style = the default accent's CSS vars. */
export function themeStyle(theme) {
  const t = resolve(THEME, theme, THEME.default, 'theme');
  return accentVars(t.accent);
}
