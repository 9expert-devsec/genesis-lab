# Dark mode on Page Builder pages — survey and proposal

Round 75. **A survey and a decision brief. Nothing here is built.** One
question in §G needs a ruling before the largest piece of it can start.

The author's report, on the published promotion page `early-bird-claude-code`
viewed in site dark mode:

1. section surfaces render as an opaque grey slab covering everything;
2. body text is so faint it is barely legible;
3. cards inside those sections are grey on grey and do not separate;
4. the hero keeps its light peach gradient and does not follow the mode.

All four are real. All four are now measured, and they have **three different
causes**, only one of which is a bug in the ordinary sense. The instruments are
`scripts/_measure-round75-dark.mjs` (headless Chrome; the real stored page, the
real `globals.css`, a real Tailwind build), `scripts/_measure-round75-classify.mjs`
(the §C split, derived from that measurement rather than hand-counted) and
`scripts/_audit-round75-dark-corpus.mjs` (§I, read-only over Mongo).

Round 74's lesson is load-bearing here: jsdom compiles no Tailwind, so
`getComputedStyle` returns `""` for every colour and a jsdom measurement of
contrast is a false negative every time. Every number below came out of Chrome.

---

## A. How dark mode is supposed to work here

**What toggles it.** `next-themes`, via `src/components/layout/ThemeProvider.jsx`,
configured `attribute="class"`, `defaultTheme="light"`, `enableSystem={false}`.
The user opts in through `ThemeToggle` in the site header. The class `dark`
lands on `<html>`. There is no system-preference following and no per-page
override: the whole site is in one mode at a time.

**What that class reaches.** `tailwind.config.js` sets `darkMode: 'class'`, so
every `dark:` variant in the codebase keys off it, and `globals.css` declares one
`.dark { … }` block that redefines CSS custom properties.

**The token census.** `:root` declares 135 custom properties; `.dark` redeclares
122 of them. Counted from source:

| | count | families |
|---|---|---|
| **differ** under `.dark` | **91** | 11 surface/text/elevation · 10 steps each of signature, action, air, lime, purple, orange, cyan, green |
| identical under `.dark` | 31 | `--text-muted` · **step 50 of all 8 scales** · all 11 steps of `slate-dp` · all 11 steps of `slate-lt` |
| no `.dark` declaration at all | 13 | `--9e-brand --9e-action --9e-air --9e-ice --9e-lime --9e-lime-lt --9e-lime-dk --9e-navy --9e-card --9e-border` + 3 motion vars |

Round 39's count of 91 is **confirmed exactly**, and the split is the whole
story:

- The 11 that matter for surfaces are `--page-bg --page-bg-muted --surface
  --surface-muted --surface-border --text-primary --text-secondary
  --surface-raised --surface-hover --surface-divider --shadow-color`.
- **Step 50 of every accent scale is identical in both modes.** `ACCENT_VARS`
  in `presets.js` reads exactly step 50 (`var(--9e-orange-50)`, etc). So no
  accent follows dark mode, by construction, and the 80 accent-scale vars that
  do differ are steps 100–950, which the Page Builder never reads.
- The 13 raw brand hexes have **no dark counterpart anywhere**. `--9e-navy`,
  `--9e-ice` and `--9e-card` are the ones `pageClass` and `BACKGROUND_CLASS`
  resolve to.

**Where `pageClass` / `page.theme` enters.** `PageBuilderView` calls
`themeSurface(page.theme)` and puts the resulting `pageClass` on the page
wrapper, plus `themeStyle(page.theme)` as the `--pb-accent-*` inline bundle.
The seven entries in `presets.js`'s `THEME` table are:

```
default            bg-white     text-9e-navy
promotion_blue     bg-9e-ice    text-9e-navy
early_bird_orange  bg-white     text-9e-navy
ai_purple          bg-white     text-9e-navy
corporate_navy     bg-9e-navy   text-9e-ice
light_minimal      bg-white     text-9e-navy
dark_premium       bg-white     text-9e-navy   (= default, TODO)
```

Every one of those is a **literal Tailwind colour**, and `white`, `9e-navy`
and `9e-ice` are all in the 13-var no-dark-counterpart set. So:

> **The Page Builder page shell does not answer `.dark` at all, on any theme.**

`page.theme` is a second, independent theme axis (round 59's finding), and it
is the only one the page body listens to.

**The one thing on this path that does answer `.dark`** is not in the Page
Builder at all — it is the route wrapper in
`src/app/(public)/promotions/[slug]/page.jsx`:

```jsx
<div className="bg-[#F8FAFD] dark:bg-[#0D1B2A]">
  … back link …
  <PageBuilderView page={builderPage} />
</div>
```

That wrapper goes dark navy while the page shell it contains stays white.
**That pairing is symptom 1.**

---

## B. The real page, measured, in both modes

`early-bird-claude-code`, `theme: default`, at 1200px. Backgrounds are the
**composited** colour a reader's eye receives — translucent layers are mixed
source-over, not skipped. `bg` is the surface, `fg` the text colour, `ratio` the
WCAG contrast between them.

| element | light bg | light fg | ratio | dark bg | dark fg | ratio | bucket |
|---|---|---|---|---|---|---|---|
| route wrapper | `#f8fafd` | `#0d1b2a` | 16.64 | **`#0d1b2a`** | `#f8fafd` | 16.64 | OK |
| **page shell** | `#ffffff` | `#0d1b2a` | 17.39 | **`#ffffff`** | `#0d1b2a` | 17.39 | NO-DARK |
| section wrapper[0] (hero, custom gradient) | `#f8e7d5` | `#0d1b2a` | 14.40 | `#f8e7d5` | `#0d1b2a` | 14.40 | CONTRACT |
| section wrapper[1] (`background: default`) | `#ffffff` | `#0d1b2a` | 17.39 | `#ffffff` | `#0d1b2a` | 17.39 | NO-DARK |
| section wrapper[2] (`background: default`) | `#ffffff` | `#0d1b2a` | 17.39 | `#ffffff` | `#0d1b2a` | 17.39 | NO-DARK |
| section wrapper[3] (custom gradient) | `#f8e7d5` | `#0d1b2a` | 14.40 | `#f8e7d5` | `#0d1b2a` | 14.40 | CONTRACT |
| nested section[0..3] (inside the hero) | `#f8e7d5` | `#0d1b2a` | 14.40 | `#f8e7d5` | `#0d1b2a` | 14.40 | CONTRACT ×4 |
| heading | `#f8e7d5` | `#0d1b2a` | 14.40 | `#f8e7d5` | `#0d1b2a` | 14.40 | CONTRACT |
| **body text (prose `p`)** | `#f8e7d5` | `#374151` | 8.53 | `#f8e7d5` | **`#d1d5db`** | **1.22** | TEXT-AXIS |
| link / CTA anchor | `#005cff` | `#f8fafd` | 5.05 | `#005cff` | `#f8fafd` | 5.05 | OK |
| **`highlight_grid` child box** | `#fcfdfe` | `#0d1b2a` | 17.08 | **`#9ea4aa`** | `#0d1b2a` | 6.91 | TEXT-AXIS |
| card surface — `cardStyle: shadow` | `#fcfdfe` | `#0d1b2a` | 17.08 | **`#9ea4aa`** | `#0d1b2a` | 6.91 | NO-DARK |
| card surface — `cardStyle: filled` | `#f8fafd` | `#0d1b2a` | 16.64 | `#f8fafd` | `#0d1b2a` | 16.64 | NO-DARK |
| **muted body text** (`dark:text-[#94a3b8]`) | `#f8fafd` | `#5e6a7e` | 5.23 | `#f8fafd` | **`#94a3b8`** | **2.45** | TEXT-AXIS |
| **muted text ON the grey box** | `#fcfdfe` | `#5e6a7e` | 5.37 | **`#9ea4aa`** | **`#94a3b8`** | **1.02** | TEXT-AXIS |
| shadow card ON the grey box | `#fcfdfe` | `#0d1b2a` | 17.08 | `#9ea4aa` | `#0d1b2a` | 6.91 | NO-DARK |

Token readings at the root, confirming the mode actually switched:
`--page-bg` `#FFFFFF` → `#0D1B2A`; `--surface` `#FFFFFF` → `#132638`;
`--text-primary` `#0D1B2A` → `#F8FAFD`; `--text-secondary` `#465469` → `#C5CEDA`.
`<body>` itself goes `rgb(255,255,255)` → `rgb(13,27,42)`. 244 cells measured
across 22 rendered scopes; 91 moved between modes.

### Each of the author's four observations, located

1. **"opaque grey slab"** — `#9ea4aa`. It is
   `src/components/pageBuilder/sections/highlight_grid.jsx:50`:
   `bg-9e-ice/50 dark:bg-[#0D1B2A]/40`. The SURFACE answers the site axis, at
   40% alpha, over a page shell that stayed `#ffffff`. Navy at 40% over white
   composites to a mid grey that exists in no token, no preset and no author's
   picker. The author's page has two `highlight_grid`s, one of them wrapping
   most of the page body.
2. **"body text barely legible"** — two separate mechanisms, both TEXT-AXIS.
   `rich_text` carries `dark:prose-invert`, which flips prose body from
   `#374151` to `#d1d5db` on a surface that did not move: **8.53 → 1.22**. And
   eight other components carry `text-9e-slate-dp-50 dark:text-[#94a3b8]`
   (`icon_card`, `price_card` ×3, `cta`, `image`, `instructor_card` ×2,
   `stat_card`, `timeline`, `accordion`): **5.23 → 2.45**, and **1.02** where
   that text lands on the grey box.
3. **"cards grey on grey, do not separate"** — the author's `icon_card`s use
   `cardStyle: shadow`, which paints **no surface at all** (measured own-fill
   `null`); the card simply *is* the grey box behind it. Its only separation is
   `shadow-9e-md`, which does flip correctly (`rgba(13,27,42,.08)` →
   `rgba(0,0,0,.08)`) and is invisible at that alpha on a mid grey. The
   `price_card` uses `cardStyle: filled` → `bg-9e-ice` `#f8fafd`, which against
   its peach parent separates at **1.16:1 in both modes** — a pre-existing
   light-mode defect the author is now seeing.
4. **"the hero keeps its peach gradient"** — `#f8e7d5 → #fefaf5`,
   `backgroundMode: custom`. Behaving exactly as the panel promises in writing.
   Not a bug. See §G.

---

## C. The three-way split

Nineteen measured rows on the author's page, each assigned exactly one bucket
by `_measure-round75-classify.mjs`. A row fails if **any** of three tests fires:
(a) dark contrast below 4.5:1; (b) an opaque light surface (luminance ≥ 0.5)
painted while the site is dark; (c) the element's surface moves between modes
while the page shell under it does not.

Test (c) was added after test (b) alone scored the grey box "OK" — it is
mid-luminance and its heading clears AA at 6.91. Legible and still wrong: a
colour nobody chose is a defect even when you can read it. Without (c) this
survey would have missed the author's loudest symptom.

| bucket | rows | distinct causes |
|---|---|---|
| **CONTRACT** | 7 | **2** |
| **NO-DARK** | 6 | **4** |
| **TEXT-AXIS** | 4 | **4** |
| OK | 2 | 2 |

"Distinct causes" excludes rows that merely inherit a parent's surface, so it
counts decisions rather than repetitions.

**CONTRACT (2 causes, 7 rows)** — the two custom peach gradients, plus the five
elements inside them. Round 39's rule, working. Not fixable without a ruling.

**NO-DARK (4 causes, 6 rows)** —
`THEME.pageClass` (`bg-white text-9e-navy`, literal, no dark counterpart);
`background: default` sections inheriting it;
`cardStyle: filled` → `bg-9e-ice`;
`cardStyle: shadow` painting no surface.

**TEXT-AXIS (4 causes, 4 rows)** —
`highlight_grid`'s `dark:bg-[#0D1B2A]/40` (surface moves, container doesn't);
`rich_text`'s `dark:prose-invert` (text moves, surface doesn't);
`dark:text-[#94a3b8]` in eight components (same);
the two of them stacked, at 1.02:1.

**What the split decides.** Only the TEXT-AXIS bucket is a plain bug: something
answers `.dark` while the thing beside it does not. Four causes, all in files
this repo owns, all fixable with no ruling and no schema change. The NO-DARK
bucket needs a design decision (what should a builder page's shell be in dark
mode?) but no promise is broken by making it. The CONTRACT bucket cannot be
touched without §G.

---

## D. The preset path — does round 39's finding still hold?

**Yes, unchanged after rounds 57–74.** No preset background and no preset
accent follows dark mode:

- `BACKGROUND_CLASS` resolves to `bg-white`, `bg-9e-ice`, `bg-9e-slate-lt-800`,
  `bg-9e-navy`, `bg-9e-gradient-hero` — every one a literal Tailwind colour or
  a `backgroundImage` entry with hardcoded hexes. None has a `.dark` form.
- `ACCENT_VARS` reads step 50 of each scale, and §A shows step 50 is byte-identical
  in both modes for all eight scales.
- The one thing that does follow the page theme is an **absent** accent — the
  theme wrapper's default — and that follows `page.theme`, not `.dark`.

### `cardStyle` — which values are usable in dark mode

Measured on a bare `stat_card`, on a light page theme and a dark one:

| value | what it paints | `default` L → D | `corporate_navy` L → D | usable in dark? |
|---|---|---|---|---|
| `plain` | nothing | 17.39 → 17.39 | 16.64 → 16.64 | **yes** — paints no surface, so it cannot be wrong on its own |
| `border` | `border-[var(--surface-border)]` | 17.39 → 17.39 | 16.64 → 16.64 | **yes** — the border token is one of the 91 that flip |
| `shadow` | `shadow-9e-md` | 17.39 → 17.39 | 16.64 → 16.64 | **yes**, with a caveat — `--shadow-color` flips navy→black correctly, but the card paints no surface, so it cannot separate from a background that is already mid-toned |
| `filled` | `bg-9e-ice` | 16.64 → 16.64 | **1.00 → 1.00** | **no** |
| `gradient` | `bg-9e-gradient-subtle` | 16.64 → 16.64 | **1.00 → 1.00** | **no** |
| `promo` | `bg-[var(--surface)] text-[var(--text-primary)] border shadow-9e-lg` | 17.39 → **14.75** | 17.39 → **14.75** | **yes — the only value that answers the mode on both axes** |

Round 59's `filled` at **1.00 on `corporate_navy`** is confirmed, and confirmed
in **both** site modes — ice text on an ice card, invisible, in light too.
`gradient` has the identical shape and the identical number. Three of six values
are safe because they paint nothing; one is safe because it paints tokens; two
are literal light hexes and are broken.

Corpus check (§I): `filled` is stored on **5** sections and `shadow` on **20**.
Round 59 recorded that no stored section used `filled`; that is no longer true
— the author's own `price_card` is one of the five.

---

## E. Every theme, in dark mode

The author's page rendered under all seven `PAGE_THEMES`, both modes:

| theme | pageClass | shell in dark | body text | verdict in dark mode |
|---|---|---|---|---|
| `default` | `bg-white` | `#ffffff` (unchanged) | 8.53 → **1.22** | **fails** |
| `promotion_blue` | `bg-9e-ice` | `#f8fafd` (unchanged) | 8.53 → **1.22** | **fails** |
| `early_bird_orange` | `bg-white` | `#ffffff` (unchanged) | 8.53 → **1.22** | **fails** |
| `ai_purple` | `bg-white` | `#ffffff` (unchanged) | 8.53 → **1.22** | **fails** |
| `light_minimal` | `bg-white` | `#ffffff` (unchanged) | 8.53 → **1.22** | **fails** |
| `dark_premium` | `bg-white` (= `default`, TODO) | `#ffffff` (unchanged) | 8.53 → **1.22** | **fails** |
| `corporate_navy` | `bg-9e-navy` | `#0d1b2a` (unchanged) | 8.53 → **1.22** | **fails differently** |

**Not one theme's shell moves between light and dark.** Six are light in both;
`corporate_navy` is dark in both — including in site-light, which is round 59's
finding restated.

`corporate_navy` is worth calling out separately because it is the case a
"just make the shell dark" fix would produce, and it is already measurably bad
on this page: the author's peach hero under `corporate_navy` renders `#f8fafd`
ice text on `#f8e7d5` peach at **1.16:1**, and `cardStyle: filled` at **1.00**.
A dark shell is not by itself a dark mode; it is a second way for author colours
to collide.

A fix that only moves `default` is not a fix. All seven need an answer, and
`dark_premium` needs a definition first — it currently aliases `default` with a
`TODO(design)` in `presets.js`.

---

## F. What already works

Measured or read this round:

- **The promotions route wrapper.** `bg-[#F8FAFD] dark:bg-[#0D1B2A]`, measured
  `#f8fafd → #0d1b2a`. The only correct page-level surface on this path — and
  it is *outside* `PageBuilderView`.
- **`cardStyle: promo`.** `#ffffff/#0d1b2a` (17.39) → `#132638/#f8fafd` (14.75)
  on both page themes. Round 59 built it to answer one axis deliberately, and
  it is the only card surface that does.
- **`--surface-border` and `--shadow-color`.** Both flip. `border` and `shadow`
  card styles are correct in dark mode as far as they go.
- **`--pb-accent-on`.** Round 39's one computed value — the label colour on an
  accent fill, chosen by luminance. Correct in both modes; the CTA row measures
  5.05 either way.
- **The article body.** `src/lib/articles/normalizeAuthoredColors.js` plus the
  `.dark .article-content [data-authored-fg]` rules in `globals.css:821-825`.
  This is the closest existing precedent to §G and it is discussed there.
- **The admin editor.** Not re-measured this round; round 28's dark check
  stands. The code fact that supports it: the editor surface carries **109**
  `dark:` variants across its components, against **29** in the whole public
  section set — and the public ones are almost entirely `dark:text-*` with no
  matching `dark:bg-*`, which is precisely the TEXT-AXIS bucket.

**The shortest path to the answer is the difference between the route wrapper
and the page shell.** They are adjacent elements on the same render. One reads
a `dark:` variant and is right; the other reads `THEME.pageClass` and is wrong.
Nothing else about them differs.

---

## G. The contract question — options and costs

**The promise, verbatim.** `SettingsPanel.jsx:309` shows this hint under every
custom-colour control:

> สีที่กำหนดเองจะถูกใช้ตามที่ระบุในทุกธีมของหน้า — ระบบจะไม่ปรับสีนี้ตามธีมหรือโหมดมืด
>
> *("A custom colour is used as specified in every page theme — the system will
> not adjust this colour for the theme or for dark mode.")*

It names dark mode explicitly. Round 39's ruling was deliberate and is
documented in three places (`customColor.js` header, `presets.js`
`isDarkBackgroundFor`, the panel hint). **Any option that changes what a stored
custom colour renders as, without the author touching it, breaks this in
writing.**

The corpus (§I) makes the stakes concrete: **13** sections across **2** published
pages carry a custom background, all 13 gradients. One page —
`early-bird-claude-code` — is built entirely from custom backgrounds and has no
preset background at all. For that page, under the current contract, dark mode
cannot work. That is not a defect; it is the promise operating as designed.

Four options. **I am not picking one.**

### G1 — Leave it. Custom colours stay verbatim; fix only §C's TEXT-AXIS and NO-DARK buckets.

- **Cost:** the author's hero stays peach in dark mode for ever, and so do the
  4 nested sections inside it. 7 of 19 measured rows stay as they are. A page
  built entirely from custom colours is a permanently light page.
- **Breaks:** nothing. This is the only option with zero promise cost.
- **Note:** it still fixes the two symptoms the author called worst — the grey
  slab and the illegible body text are both TEXT-AXIS, not CONTRACT. After G1
  alone, the peach hero is a *deliberate light hero on a dark page*, which is a
  design one can defend; grey-on-grey at 1.02:1 is not.

### G2 — Let a page opt out of dark mode entirely.

A `page.darkMode: 'follow' | 'never'` field; `'never'` stamps something on the
page wrapper that pins every token to its light value for that subtree.

- **Cost:** a new page-level field, a new control, a new schema value, and a
  migration decision for the 5 stored pages (what is the default?). It needs a
  CSS mechanism that can *undo* `.dark` for a subtree — the honest one is
  re-declaring the 91 light values on the wrapper, which is a second copy of
  `:root` that must not drift from the first. Site chrome (header, footer, the
  route wrapper) stays dark around a light page, so the seam in §B's first two
  rows still exists, just deliberately.
- **Breaks:** no written promise. It does add a second authority over the site
  theme — a page that says "no" to a preference the user set in the header. That
  is a product decision, not a technical one.
- **Honest appraisal:** this is the option that most directly matches the truth
  of the situation ("this page was designed light"), and it is also the one
  most likely to be used to avoid fixing anything else.

### G3 — Let a custom colour carry an optional dark counterpart.

`backgroundCustom: { from, to, direction, fromDark?, toDark? }`, and the same for
`accentCustom`. Absent dark values ⇒ today's behaviour exactly.

- **Cost:** the largest build. Schema, two more colour inputs per control
  (the panel already has three for the background), the render fork, and a
  contrast warning that now has four surfaces to reason about instead of one.
  The renderer cannot emit an inline `style` for this — an inline style has no
  `.dark` selector — so it needs a per-section CSS custom property set on the
  wrapper and consumed by a rule that `.dark` can override, i.e. the
  `scopedCss` machinery `SectionRenderer` already has, applied to colour.
- **Breaks:** the panel hint, and it must be rewritten. But note it breaks it
  *additively*: a stored section with no dark counterpart still renders verbatim
  in both modes, so **no existing page changes**. The promise becomes "your
  colour is used verbatim unless you give a second one", which is a strictly
  larger promise, not a contradicted one.
- **Precedent:** `globals.css:821-825` already does exactly this shape for
  article bodies — `--authored-fg-light` / `--authored-fg-dark` selected by
  `html:not(.dark)` / `.dark`. The mechanism is proven in this repo.

### G4 — Make text contrast-aware without touching the author's background.

Leave every authored surface verbatim; change only what the theme's *text*
does when it sits on one.

- **Cost:** small to build, large to reason about. This is the option that
  needs §H read first — it is one step from the thing round 39 §D4 refused.
- **Breaks:** potentially the same promise, from the other side. The hint says
  the system will not adjust *this colour*; it says nothing about the text on
  it. But an author who chose peach and navy text and gets peach and something
  else has still had a decision taken from them.
- **The narrow, defensible version** is the article precedent again: do not
  *choose* a text colour from luminance — **neutralise the two hopeless
  combinations** (light theme text on a light authored surface, dark theme text
  on a dark one) by resetting them to `inherit`, and leave everything else
  alone. `normalizeAuthoredColors.js` documents why that is a different act from
  computing a colour, and its own header states the limit honestly: it makes
  unreadable text readable, it does not make the result AA-conformant, and no
  single colour can clear 4.5:1 against both `#FFFFFF` and `#0D1B2A`.

**What these options do NOT overlap on.** G1 is a prerequisite for all of the
others — the TEXT-AXIS bugs are wrong under every ruling. G2 and G3 are
alternatives to each other. G4 is orthogonal to G2/G3 and could follow either.

---

## H. What not to build

In the round 21/26/33/46/56/58/63/72 style: things that look like the answer,
with the evidence for why they are not.

### H1 — Do not auto-compute a text colour from background luminance.

Round 39 §D4 refused this, because it puts a second authority over text colour
beside the theme — the shape rounds 21–25 spent four rounds removing from
`container.jsx`. **That reasoning still holds, and dark mode strengthens it
rather than weakening it.**

The evidence is in §B. Every one of the four worst rows on the author's page is
already a case of *two authorities disagreeing about one pixel*:

| row | authority A | authority B | result |
|---|---|---|---|
| prose paragraph | `dark:prose-invert` (site axis) | the shell (page axis) | 1.22 |
| muted text | `dark:text-[#94a3b8]` (site axis) | the shell (page axis) | 2.45 |
| grey box | `dark:bg-[#0D1B2A]/40` (site axis) | the shell (page axis) | `#9ea4aa` |
| both stacked | site axis | site axis over page axis | 1.02 |

The defect being reported *is* a second authority. Adding a third — a
luminance rule that overrides both — cannot be the fix for it. Concretely: on
the peach hero, a luminance rule would keep navy text (correct); on the grey
box it would keep navy text (correct); and it would do nothing about the fact
that the grey box is a colour nobody chose, which is the actual complaint.

There is one shape that is *not* this, and §G4 names it: **neutralising a
hopeless pair is not choosing a colour.** `normalizeAuthoredColors.js` argues
that distinction at length and the argument survives here. If G4 is ruled in,
build the neutralising form, not the computing form.

### H2 — Do not make `filled` and `gradient` theme-aware by pointing them at `--surface`.

It looks like a two-line fix for two of §D's broken values, and it is the wrong
two lines. `filled` and `gradient` are *five mutually exclusive treatments*
(round 59 §A1); pointing two of them at `--surface` makes them both duplicates
of `promo` minus the border and shadow. The vocabulary would then offer three
ways to say "opaque theme surface" and an author could not predict which one
they wanted. Round 59 already declined to redefine these two while adding a
sixth, for this reason, and nothing measured this round changes it. The
5 stored `filled` sections are a migration question, not a redefinition one.

### H3 — Do not add `dark:` variants component-by-component.

This is what produced the bug. There are 29 `dark:` variants in the public
section set today; 20-odd of them are `dark:text-*` with no matching surface
variant, and every single measured TEXT-AXIS failure is one of them. Adding
`dark:bg-*` beside each `dark:text-*` would take the count to ~60 pairs that
must each stay in agreement with a page shell that is decided somewhere else
entirely (`THEME.pageClass`). The correct move is the opposite: **make the shell
answer one axis, then delete the per-component variants that were compensating
for it.** §C's 4 TEXT-AXIS causes are 4 deletions, not 20 additions.

### H4 — Do not give `page.theme` a light and a dark variant of each of the seven themes.

Fourteen `pageClass` strings, each a literal, each needing to agree with the
other thirteen. §E shows the seven are already only three distinct values
(`bg-white` ×4, `bg-9e-ice`, `bg-9e-navy`); doubling them multiplies a table
that should be *shrinking* toward `--page-bg` / `--surface` / `--text-primary`,
which already have the correct value in both modes and which §D shows `promo`
using successfully today.

### H5 — Do not fix this by making the site's dark mode follow `prefers-color-scheme`.

Tempting because it would make the bug rarer. `ThemeProvider` sets
`enableSystem={false}` deliberately, with a stated reason (SEO crawlers and
first-time visitors see one look). Changing it would *increase* the number of
readers hitting §B's table without changing a single row of it.

### H6 — Do not build a preview toggle in the editor before §C is fixed.

An obvious-looking companion feature ("let the author see dark mode in the
canvas"). It would faithfully reproduce all 19 rows of §B, which tells the
author nothing they do not already know, and it would make the canvas a second
place where the fix has to land.

---

## I. Blast radius

Read-only, `scripts/_audit-round75-dark-corpus.mjs`. Collection
`page_builder_pages` (not `pagebuilders`) and `snapshot.sections` (not
`content.sections`) — round 50's two false zeros, pre-empted with hard failures
rather than trusted. The walker's own coverage is asserted: 291 sections
visited, 178 of them nested.

| | count |
|---|---|
| pages total | **5** |
| **published** | **3** (`expo002`, `ex-pro-1`, `early-bird-claude-code`) |
| drafts | 2 |
| versions in `page_versions` | 9 (80 top-level sections) |
| sections visited | 291 (178 nested) |
| **sections with a custom background** | **13** — all 13 gradients, 0 flat |
| sections with a custom accent | 6 |
| sections with a non-`default` preset background | 13 |
| sections with a preset accent | 9 (all `green`) |
| custom colours also present in version snapshots | 14 |
| **pages with any custom colour** | **2** |
| pages with any preset background | 2 |
| **pages built entirely from custom backgrounds** | **1** (`early-bird-claude-code`) |

Histograms: `theme` — `default` ×4, `promotion_blue` ×1 (five of seven themes
are unused). `background` — `default` ×233, `dark` ×10, `soft_gray` ×5,
`brand_gradient` ×1. `cardStyle` — `shadow` ×20, `filled` ×5.

### What each option in §G touches

| option | pages affected | sections affected | render changes for an untouched page? |
|---|---|---|---|
| **G1** (TEXT-AXIS + NO-DARK only) | **all 5** | all 291, in dark mode only | **yes, in dark mode** — that is the point; light mode must be byte-identical |
| **G2** (per-page opt-out) | 0 until an author sets it | 0 | no |
| **G3** (optional dark counterpart) | 0 until an author sets it | 0 of the 13 today | no — absent dark values keep today's render exactly |
| **G4** (neutralise hopeless text pairs) | **2** (the pages with custom colours) | **13** custom backgrounds + 6 custom accents | **yes** — this is the only option that changes what a stored page renders without the author touching it |

G3's zero is the single most useful number here: it is additive by construction,
so its cost is entirely build cost and none of it is risk to published pages.
G4's 13-and-6 is the number to weigh against §G's promise.

`cardStyle` exposure, for §H2: **5** stored sections would change if `filled`
were redefined, **0** for `gradient`.

---

## Proposed build sequence

The public render path is isolated to steps 2–4. The riskiest step is not
first. Steps 1–4 need no ruling; step 5 onward does.

**Step 0 — decide `dark_premium`.** *Not shippable; it is a design input.*
`presets.js` carries `TODO(design)` and `dark_premium` currently aliases
`default`. Every later step has to handle seven themes, and one of them has no
definition. Zero stored pages use it (§I), so this costs nothing today and
blocks the table below if left open.

**Step 1 — the instrument, as a guard.** *Independently shippable.* Turn
`_measure-round75-dark.mjs` into a render test that asserts, for each of the
seven themes, that no measured element sits below 4.5:1 in either mode. It fails
today — so it lands red, or lands as a recorded baseline with the current
numbers pinned. This is what makes steps 2–4 verifiable rather than asserted.
Risk: none to production.

**Step 2 — the four TEXT-AXIS deletions.** *Independently shippable. Lowest
risk, largest measured win.* Remove `dark:bg-[#0D1B2A]/40` from
`highlight_grid`, `dark:prose-invert` from `rich_text`, and the eight
`dark:text-[#94a3b8]` variants; keep the light values. Effect: the grey slab
(`#9ea4aa`) becomes `#fcfdfe` again, 1.02 → 5.37, 1.22 → 8.53, 2.45 → 5.23.
The page becomes a *correct light page* on a dark site — visibly a seam, and
legible. **Light mode is byte-identical**, which step 1 proves. This is the
step that answers three of the author's four observations.

**Step 3 — the page shell.** *Independently shippable, and the riskiest step —
which is why it is third.* Move `THEME.pageClass` off literal colours and onto
`--page-bg` / `--text-primary` (or a per-theme pair that has both values), so
the shell answers `.dark` like the route wrapper already does. This is the fix
for §C's NO-DARK bucket and the one place where "make it answer one axis"
actually lands. It changes what every published page renders in dark mode,
including `corporate_navy`'s meaning (§E's warning: a dark shell is a second
way for author colours to collide, at 1.16:1 measured). Do not attempt this
before step 2 — with the TEXT-AXIS variants still in place, a moving shell makes
them right by accident and hides which fix did what.

**Step 4 — `cardStyle` truth-telling.** *Independently shippable.* Not a
redefinition (see §H2). Either (a) stop offering `filled` and `gradient` in the
panel the way `image` is already excluded from `OFFERED_BACKGROUNDS`, with the
same self-retiring comment, or (b) leave them and document the 1.00 in the
control's hint. 5 stored sections are affected either way and neither option
changes their render.

**Step 5 — G2 or G3, whichever you rule.** *Needs the §G ruling.* G3 is the
larger build and the smaller risk (§I: 0 pages change). G2 is the smaller build
and introduces a page that overrides a user preference.

**Step 6 — G4, if ruled in, in the neutralising form only.** *Needs the §G
ruling, and must not start before step 3.* It is the only option that changes
an untouched published page (13 sections, 2 pages), and its correctness depends
entirely on what the shell is doing, which step 3 decides.

### Summary

| step | independently shippable | needs a §G ruling | touches the public render path |
|---|---|---|---|
| 0 `dark_premium` | no (design input) | no | no |
| 1 guard | **yes** | no | no |
| 2 TEXT-AXIS deletions | **yes** | no | **yes** |
| 3 page shell | **yes** | no | **yes** |
| 4 `cardStyle` | **yes** | no | **yes** (panel only, if option a) |
| 5 G2 / G3 | no | **yes** | **yes** |
| 6 G4 | no | **yes** | **yes** |

Steps 1–4 recover a legible page under every ruling. They do not make the
author's page dark — only §G can decide whether it is allowed to be.
