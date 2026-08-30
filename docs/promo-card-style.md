# A promotion card style for `price_card`

Round 58. A survey and a proposal. **Nothing is built here** except one
assertion (see Tests).

Round 57 closed the *content* gap: `price_card` gained `originalPrice`,
`discountBadge`, `footnote` and `ribbon`, and the two pages' price panels can
now say everything the originals say. Put the two renders side by side and they
still look nothing alike. This round measures why, and asks whether one new
`cardStyle` value is the right instrument.

---

## A. The `cardStyle` enum, audited rather than assumed

Round 18's lesson is the reason this section exists: *a control that offers a
value nothing honours is a lie the author cannot detect* — they pick it, the
page is unchanged, and no error is raised.

### Declared values

`CARD_STYLES` (`lib/schemas/sections/base.js:33`) — five values:

```js
export const CARD_STYLES = ['plain', 'border', 'shadow', 'filled', 'gradient'];
```

### What each one actually changes

There is exactly **one** path from the prop to a class. `cardStyleClass` is
private (2C.3, locked by `test/fs/styleCaps.test.mjs`); the only sanctioned
route is `cardSurfaceClass(type, style)`, which gates on `SECTION_STYLE_CAPS`
before consulting `CARD_STYLE_CLASS` (`lib/pageBuilder/presets.js:130`).

Resolved live, not read off the map:

| value | class emitted | resolves to |
|---|---|---|
| `plain` | `''` | nothing — the no-treatment value |
| `border` | `border border-[var(--surface-border)]` | light `rgba(13,27,42,.12)`, dark `#1A2D42` |
| `shadow` | `shadow-9e-md` | `0 4px 12px rgb(var(--shadow-color)/.08)` |
| `filled` | `bg-9e-ice` | `#F8FAFD` |
| `gradient` | `bg-9e-gradient-subtle` | `linear-gradient(to bottom, #F8FAFD, #E8F0FE)` |

### Is any value inert on any of the three readers? **No.**

Measured across all three renderers plus two non-readers and the three fallback
inputs:

```
price_card   plain=""  border="border border-[var(--surface-border)]"  shadow="shadow-9e-md"  filled="bg-9e-ice"  gradient="bg-9e-gradient-subtle"
stat_card    plain=""  border="border border-[var(--surface-border)]"  shadow="shadow-9e-md"  filled="bg-9e-ice"  gradient="bg-9e-gradient-subtle"
icon_card    plain=""  border="border border-[var(--surface-border)]"  shadow="shadow-9e-md"  filled="bg-9e-ice"  gradient="bg-9e-gradient-subtle"
heading      plain=""  border=""  shadow=""  filled=""  gradient=""
cta          plain=""  border=""  shadow=""  filled=""  gradient=""
absent   ""      null  ""      unknown ""  (+ a dev-only console.error)
```

Four of five emit a non-empty class, `plain` legitimately emits none, all five
are pairwise distinct, and **all three readers resolve every value
identically** — the map is shared, and no renderer branches on the value. Each
applies the class to its own outer box (`rounded-9e-lg p-6`, plus
`flex h-full flex-col` on `price_card` and `text-center` on `stat_card`), so the
treatment lands on the same surface in each.

That is the audit's headline and it was **not pinned by anything**. See Tests.

### Three findings the enum's completeness hides

**A1 — the five values are MUTUALLY EXCLUSIVE.** One enum, one class. The
original panel is a border *and* a gradient *and* a shadow at once. Today that
combination is unreachable at any setting. This is the single strongest argument
for a new composite value rather than more controls.

**A2 — `filled` and `gradient` are theme-blind.** `border` resolves through
`--surface-border` and `shadow` through `--shadow-color`, both of which
globals.css redefines under `.dark`. `bg-9e-ice` (`#F8FAFD`) and
`bg-9e-gradient-subtle` (`#F8FAFD → #E8F0FE`) are literal light-mode hexes with
no dark counterpart, so a `filled` card on a dark page renders a near-white
block under text the renderers deliberately lighten (`dark:text-[#94a3b8]`).
Not inert — but a new value must not repeat this.

**A3 — round 57's ribbon assumes a surface `plain` does not provide.** The
ribbon is `absolute` inside a container that gets `relative overflow-hidden`
only when a ribbon exists. With the default `cardStyle` (`plain` — which is what
**all six** stored cards resolve to, see §E) the card has no background at all,
so the ribbon is a coloured band clipped to an invisible box. The feature
already needs a surface; nothing makes the author choose one.

---

## B. The original's real values

Read from the stored HTML, not from an impression. The side-by-side is page B,
`promotion-build-business-apps-with-claude-code` — identified by the peach
surface (`--page-bg: #fffaf4`) and the lime corner badge, both of which are
page B's and neither of which page A has.

**One correction to round 56's table.** Both blobs are smaller than it recorded:
page A is **47,198** bytes (was 50,610), page B **56,709** (was 60,285). They
are MSDB-synced, so the bodies moved between rounds. Nothing in either survey's
conclusions turns on the byte count, but the number should not be quoted from
round 56 again.

### The six differences, measured

| # | | original (measured CSS) | builder today (measured source) |
|---|---|---|---|
| 1 | **ribbon** | `.price-top{position:absolute;top:0;right:0;margin:0}` wrapping `.promo-badge{min-width:11.5rem;padding:.85rem 1.75rem;border:0;border-radius:0 1.25rem 0 1.25rem;background:var(--promo-soft);color:var(--promo);font-size:1.05rem;font-weight:900;text-align:center}` — a **flush corner rectangle, 184px wide, 16.8px text, not rotated**, with only its inner corners rounded (0/20px/0/20px). `--promo-soft` = `#d4f73f`, `--promo` = `#0d1b2a`, **both themes**. | `price_card.jsx:79` — `absolute -right-10 top-4 w-36 rotate-45 py-1 text-center text-[11px] font-bold`, `bg-[color:var(--pb-accent-fill)]` / `text-[var(--pb-accent-on)]`. **144px wide, 11px text, rotated 45°.** |
| 2 | **title** | `.promo-title{font-size:clamp(2.35rem,7vw,3.5rem);line-height:1.08;font-weight:900;letter-spacing:-.045em}` = **37.6–56px, weight 900**. It is the hero `<h1>`, not the panel's. | `heading` `h1` → `text-3xl font-bold md:text-4xl` = **30/36px, weight 700**, letter-spacing normal. 36 ÷ 56 = 64%. |
| 3 | **price** | `.price-number{color:var(--accent-strong);font-size:clamp(3rem,9vw,4.25rem);line-height:.95;font-weight:900;letter-spacing:-.05em}` = **48–68px**; `--accent-strong` = **`#ef4444`, identical in both themes**. Unit split out: `.price-unit{font-size:1.25rem;font-weight:900;padding-bottom:.55rem}`. | `price_card.jsx:100` — `mt-2 font-heading text-3xl font-bold text-[var(--pb-accent-text)]` = **30px, weight 700**, accent-coloured. `period` renders inline at `text-sm font-normal`. |
| 4 | **round chip** | `.price-date-strip{min-height:2.5rem;margin:2rem 0 1rem;padding:.25rem .5rem;border:1px solid #48b0ff;border-radius:999px;background:rgba(255,255,255,.02);color:#48b0ff;font-size:clamp(.5rem,3vw,1rem);font-weight:700;line-height:1;letter-spacing:.01em;width:fit-content}`, with a light-mode override to `background:rgba(255,255,255,.82); color:#1ba3f5`. | **no field exists.** The text has nowhere to go but `title` (`h3 text-lg font-bold`) or `footnote` (`text-xs`, muted) — which is why it reads as "plain bold text". |
| 5 | **bottom list** | `.price-divider{width:100%;height:1px;margin:2rem 0 1.5rem;background:var(--border)}` then `.price-info-grid{display:grid;gap:1.25rem}` → `grid-template-columns:repeat(2,minmax(0,1fr))` at `min-width:640px`. Each cell is a label over a value: `.price-info-label{font-size:.85rem;font-weight:800;line-height:1.35;color:var(--section-muted)}`, `.price-info-value{margin:.25rem 0 0;font-size:clamp(.75rem,2vw,.8rem);font-weight:900;line-height:1.45}`. Two cells on page B. `.price-info-icon{display:none}`. | `features[]` → `<ul class="mt-4 space-y-2 text-sm">`, one `<li class="flex items-start gap-2">` per row, each led by a `<Check>` glyph at `h-4 w-4` in the accent. **One column, one string per row, a tick on every row.** |
| 6 | **surface** | `.price-panel{position:relative;overflow:hidden;padding:2.25rem 2.5rem 2rem;border:1px solid var(--border);border-radius:1.25rem;background:var(--price-panel-bg);box-shadow:0 24px 70px var(--shadow);backdrop-filter:blur(20px)}`. Light: border `rgba(15,23,42,.12)`, shadow `rgba(15,23,42,.08)`, radius **20px**. `--price-panel-bg` is **three layers**: two `radial-gradient`s plus `linear-gradient(160deg, rgba(255,253,249,.96) 0%, rgba(255,246,235,.92) 52%, rgba(249,234,216,.94) 100%)`. Behind it the page wash is `--page-bg:#fffaf4` and the hero is `linear-gradient(180deg,#fffdf9 0%,#fff4e6 54%,#f9ead8 100%)` under three radial glows. | `rounded-9e-lg p-6` = **16px radius, 24px padding**, plus **one** of the five classes in §A. `plain` on every stored card, i.e. no surface at all. |

### Which of those hexes are 9Expert tokens

Round 39's rule: every colour resolves to a 9Expert token, and a colour with no
token is a decision to name, not a gap to paper over.

| hex | in the palette? |
|---|---|
| `#d4f73f` (ribbon fill) | **yes** — `--9e-lime` / `9e-lime` exactly |
| `#0d1b2a` (ribbon text) | **yes** — `--9e-navy` / `9e-navy` exactly |
| `#48b0ff` (chip border + text, dark) | **yes** — `--9e-air` / `9e-air` exactly |
| `#fffaf4` (page wash, flat) | **yes** — `9e-orange-950` exactly |
| `#1ba3f5` (chip text, light override) | **no** |
| `#ef4444` (price) | **no** — and there is **no red or danger token anywhere** in `globals.css` or `tailwind.config.js`. The palette is blues + lime + navy + slate + five accent scales. The nearest is `9e-orange-50` `#FF9124`, which is orange, not red-orange. |
| `#fffdf9` / `#fff4e6` / `#f9ead8` (peach gradient stops) | **no** (`9e-orange-900` is `#FFF4E9`, close to the middle stop, not equal) |
| `#c66f48` / `#d97757` (`--accent`) | **no** — Claude brand orange |

Three of the six differences are already speakable in 9Expert tokens. Two are
not, and both of those are **decisions to escalate**, listed in §H.

---

## C. The four-way classification

| # | difference | class | why |
|---|---|---|---|
| 1 | ribbon geometry | **STYLE-VALUE** | flush-vs-rotated, 184px-vs-144px, 16.8px-vs-11px: all presentation on an element that already exists and already carries author text. A value can carry it. |
| 1b | ribbon colour | **TOKEN — but already reachable** | `#d4f73f` on `#0d1b2a` **are** tokens, but the ribbon paints from `--pb-accent-fill`/`--pb-accent-on`, and `ACCENTS` is `brand_blue / navy / cyan / purple / orange / green` — **lime is not an accent**. globals.css says why: lime is "CTAs, on dark only". So the colour exists and the accent vocabulary cannot reach it. Adding lime to `ACCENTS` is a **separate decision** (it changes six other components' vocabulary), not part of this value. |
| 2 | title size | **SEPARATE** | it is the hero `<h1>` — a `heading` section, nothing to do with `price_card`. If the gap matters it is a question about `heading`'s type scale, and it should be asked about every heading on the site, not about one card. |
| 3 | price size | **STYLE-VALUE** | 30px → ~56px is presentation on an existing field. |
| 3b | price colour | **TOKEN** | `#ef4444` has no 9Expert token and the palette has no red at all. **Do not invent one.** See §H.1. The builder's price is accent-coloured and an author who needs a different one already has round 39's section-level `accentMode: 'custom'`. |
| 4 | round chip | **STRUCTURE** | round 56 §B counted it (#23, "a date/eligibility strip") and round 57 shipped four of the five `price_card` fields and left this one. There is no field to style. |
| 5 | two-column label/value list | **STRUCTURE** | exactly round 57 §B #10's reasoning, one step further. `features` is `string[]` rendered one-per-row with a tick — a list of *what the buyer gets*. "รูปแบบการเรียน → Classroom เรียนในห้องจริง" is a label/value pair, not a thing received, and a tick beside it is wrong the same way a tick beside the VAT line was. It needs a **pair-shaped field** and a two-column grid. No style value produces it. |
| 6a | page peach wash | **SEPARATE — and the builder can already do most of it** | it is the section BACKGROUND. Round 39 ships `backgroundMode:'custom'` + `backgroundCustom:{from,to,direction}` on **every** section (`SectionRenderer.jsx:328` applies `backgroundStyleFor` to the wrapper of nested sections too), emitting `linear-gradient(<dir>, <from>, <to>)` with six directions. `{from:'#fffdf9', to:'#f9ead8', direction:'to_bottom'}` reproduces the dominant wash today. **What it cannot do:** the 54% mid-stop and the three radial glows — round 39 shipped two stops on purpose. |
| 6b | card surface (gradient + border + shadow together) | **STYLE-VALUE** | §A1: the enum can express each of the three and never two at once. A composite value is precisely the missing shape. |
| 6c | the peach gradient *itself* | **TOKEN** | no 9Expert brand gradient is peach. §H.1. |

**Split: 3 STYLE-VALUE, 3 TOKEN, 2 SEPARATE, 2 STRUCTURE.** The headline is that
**only three of the eight are actually a style value's job**, and the two that
would make the reproduction *identical* rather than *close* (the peach and the
red) are colour decisions that belong to whoever owns the palette.

---

## D. Can a new `cardStyle` value be additive? **Yes, and the proof is cheaper than round 57's.**

### What absent and existing values do

`cardSurfaceClass` → `resolve(CARD_STYLE_CLASS, v, CARD_STYLE_CLASS.plain, …)`.
That is a `hasOwnProperty` lookup with a fixed fallback. Adding a **key** to an
object cannot change what any other key returns and cannot change the fallback.
Measured above: absent → `''`, `null` style → `''`, unknown → `''` plus a
dev-only `console.error`.

So for a new value `promo`:

| stored shape | today | after | changed? |
|---|---|---|---|
| `style` absent / `null` | `''` | `''` | no |
| `style: {}` | `''` | `''` | no |
| `cardStyle` absent, other style keys set | `''` | `''` | no |
| `cardStyle: 'plain' … 'gradient'` | its class | its class | no |
| `cardStyle: 'promo'` | `''` + a dev warning | the new class | **only reachable after an author picks it** |

The last row is the whole risk surface, and §E shows it is currently empty: no
stored section carries any `cardStyle` at all.

### A new ENUM VALUE is a different shape from a new field

Round 56 §H's rule — *a field that adds something no page has shown defaults OFF
and absent means OFF* — is about a **key that did not exist**. An enum value is
a key that already exists with a **closed set of legal contents**, and the
default is already `plain`. There is nothing to default and nothing to invert:
absent stays absent. The risk moves from "what does absent mean" to **"does the
new value leak into the branches the old values take"** — which is a question
about renderer branching, not about storage.

That distinction decides the build sequence. §I step 2 adds *only* a map entry
(no renderer branch, so the leak is structurally impossible); steps 3–4 add
`cardStyle === 'promo'` branches inside `price_card.jsx`, and those are where
the proof has to be run.

### The proof, in rounds 50/57's shape

Reuse `scripts/_measure-round57-field-additions.mjs`. Its harness already pulls
the pre-change component out of git into a temp file under `src/` (so aliased
imports resolve identically), renders both, and counts differences — with the
control that makes zero mean something.

Two changes for this round:

1. **The varying axis is `style`, not `content`.** The `stored` set becomes every
   shape an author can have: `undefined`, `null`, `{}`, `{accentColor:'brand_blue'}`,
   and `{cardStyle: v}` for each of the five existing values — crossed with the
   six `price_card` content shapes round 57 already enumerated, and repeated for
   `stat_card` and `icon_card` (§F). Every pair must be **byte-identical**.
2. **The control set is `{cardStyle:'promo'}`** on all three types. Those pairs
   must **DIFFER**. A run where both columns read zero is a broken harness, and
   round 57's harness already says so out loud.

9 style shapes × 6 content shapes = **54 identical pairs on `price_card`**, plus
the `stat_card` and `icon_card` sets, plus 3 differing control pairs. The verdict
to publish is *zero differing, three controls differing*.

---

## E. Stored `price_card` sections: **6**, and every one resolves to `plain`

Read-only, `scripts/_probe-round58-promo-card-style.mjs` and
`_probe-round58-repro.mjs`.

| where | count | `style` as stored | resolves to |
|---|---|---|---|
| `live:expo002` | 1 | `{}` | `plain` |
| `draft:expo002` | 1 | `{"accentColor":"brand_blue"}` | `plain` |
| `draft:testearlybird` | 1 | `{}` | `plain` |
| `v2/v3/v4` of `6a588d9d880fd0b4640e8523` | 3 | `null` | `plain` |
| **total** | **6** | — | **`cardStyle` absent on all six** |

Matching round 57's count of 6. The other two readers: `stat_card` 4 (1 live,
1 draft, 2 versioned), `icon_card` **0**. Every one of the ten sections that
*could* carry a `cardStyle` carries none.

### How the two false zeros were avoided

Round 50's probe reported a confident zero twice before it was believed. Both
are pre-empted, the same way round 57 pre-empted them:

1. **Collection name.** Every read goes through `requireCollection`, which
   `listCollections`-checks the name and **exits non-zero** if it is missing,
   rather than returning an empty cursor. `pagebuilders` (mongoose's default
   pluralisation) does not exist; the real name is `page_builder_pages`. "No
   documents" and "no collection" print the same number and only one of them
   means anything.
2. **Version path.** Snapshots are at `snapshot.sections`, not
   `content.sections`. The probe **fails the run** if a non-empty `page_versions`
   yields zero walked sections.
3. **A type histogram**, as the third control. A walk that never ran reports
   zero of everything; this one reports 40 live / 35 draft / 80 versioned
   sections across 19 types. That is what separates "no card carries a
   cardStyle" from "the walk never resolved a section".

**The standing caveat.** This reads whatever `MONGODB_URI` points at — on this
clone the dev database, not production. What generalises is the *shape*: no
document can carry a `cardStyle` value the enum has never contained, and none of
these carry one it has.

---

## F. The other two renderers

### What they do with an unrecognised value today

Exactly what `price_card` does, because it is the same call:
`resolve()` finds no key, returns `CARD_STYLE_CLASS.plain` (`''`), and logs
`[pageBuilder presets] unknown cardStyle preset: … — using fallback` when
`NODE_ENV !== 'production'`. Verified for all three types. No crash, no visual
change.

### Does the new value need a meaning there?

**Yes — and it should not be refused.** Three reasons, in order of weight:

1. **Refusing it needs a mechanism that does not exist.** `SECTION_STYLE_CAPS`
   maps *type → prop names*, not type → allowed values. Per-type value filtering
   means a second map, and then the editor `Select` (`SectionTypeFields.jsx:76`,
   which renders the global `CARD_STYLES` for all three types) needs the same
   filter — which is the panel↔component drift 2C.3 closed and locked with
   three witnesses. Re-opening it for one value is a bad trade.
2. **The surface meaning is type-neutral anyway.** §I step 2's `promo` is
   *border + gradient + shadow composed*, all three of which every reader already
   honours individually. A loud stat card is a legitimate stat card.
3. **The type-specific part attaches to fields, not to types.** Steps 3–4 enlarge
   the price and reshape the ribbon. `stat_card` has no `price` and no `ribbon`;
   `icon_card` has neither. There is nothing to branch on, so the branches
   simply never fire — the value is not *refused* there, it has nothing extra to
   say.

The consequence to write down: **`promo` will appear in `stat_card`'s and
`icon_card`'s dropdowns the moment it is declared**, labelled from
`CARD_STYLE_LABELS`, with no further work. That is the correct behaviour under
2C.3, and it is a thing to notice rather than a thing to fix.

---

## G. Is a style value the right mechanism? **Yes.**

### What each costs the author

**A style value: one choice, once.** The author picks "โปรโมชัน" from a
dropdown they already use and the card is right.

**Per-field controls: five to six choices, every time.** Price size, price
colour, ribbon shape, ribbon colour, surface treatment, radius. Each is a
control that must be added to the panel, defaulted, validated, and — for the two
colour ones — decided against round 30 ("an author's colour is DATA and a
source colour is a TOKEN") and round 39 (custom colours carry a contrast
warning at the control). Six controls is also six ways to build a card that is
*nearly* the promotion card, which is worse than one that is not.

And it does not compose: §A1 says the surface needs three treatments at once, so
"surface treatment" would itself have to become multi-select or three booleans.
The per-field route ends up building the preset anyway, with the author holding
the pieces.

### Does any of the six genuinely need author-level control? **No — and the one that has a case is already served.**

Walked one by one:

- **ribbon text** — already author-controlled (round 57's `ribbon` field).
- **ribbon geometry, title size, surface** — no campaign varies these; they are
  the house's promotion look.
- **the two-column list's content** — that is §C's STRUCTURE work, a field, not
  a style control.
- **price colour** — the only one with a real claim: a campaign might want its
  own signal colour. But the price already paints from `--pb-accent-text`, and
  round 39 shipped section-level `accentMode: 'custom'` with a hex and a
  contrast warning. An author who needs a different price colour sets a custom
  section accent today. **Adding a price-colour control would be a second
  authority over one colour** — the shape rounds 21–25 spent four rounds
  removing from `container.jsx`.

**Verdict: one new `cardStyle` value, no new per-field controls.**

---

## H. What NOT to build

The round 21/26/33/46/56 discipline. `textStyle`/`color` in rich text stay
refused by design and are not re-opened here.

1. **A peach brand gradient token, and a red price token.** `#ef4444`,
   `#fffdf9/#fff4e6/#f9ead8`, `#c66f48`, `#d97757` and `#1ba3f5` have no 9Expert
   token, and the palette contains **no red at all**. Round 39 settled that a
   colour with no token is a decision to name, not a gap to paper over. So:
   *name it and stop.* The build below composes the promotion surface from
   `bg-9e-gradient-subtle` + `border` + `shadow`, which is a real, token-clean
   promotion card that is **blue, not peach**. If the house wants a peach
   promotion gradient and a red price, those are two palette additions with
   contrast obligations, and they belong to whoever owns the palette — not to
   this round and not invented inside `CARD_STYLE_CLASS`.
2. **`backdrop-filter: blur(20px)`.** It needs something behind it worth
   blurring. The original panel floats over a hero of three radial glows; a
   builder card sits on a flat preset background, so the filter costs a
   compositor layer and paints nothing distinguishable.
3. **Three-stop gradients and radial-gradient layers.** Round 39 shipped **two
   stops with a direction** and recorded the reason: "a vocabulary with two ways
   to say one thing is a vocabulary an author has to think about." Widening the
   gradient grammar to reproduce one panel's `160deg, 0%/52%/100%` plus two
   radials trades that for a card.
4. **`clamp()` typography.** Every headline in both originals is
   `clamp(min, vw, max)`. The builder's type scale is Tailwind steps with `md:`
   breakpoints, used by every section. Introducing a second, viewport-continuous
   scale for one card gives the page two type systems.
5. **The emoji cells.** The original's `.price-info-item` markup carries
   `<div class="price-info-icon">👥</div>` — commented out in the HTML *and*
   `display:none` in the CSS. Do not build a control for something the source
   page turned off twice.
6. **A light-only surface.** §A2: `filled` and `gradient` are literal light
   hexes with no dark counterpart. Whatever `promo` resolves to must go through
   tokens that globals.css redefines under `.dark`, or it inherits a defect this
   round measured.
7. **The date chip's text as the end of the story.** Step 1 below adds a typed
   string, and round 56 §F.3 already refused typed dates: "a typed date is wrong
   the day the round moves and nothing catches it." The chip is worth shipping
   because the *shape* is missing, but it inherits that debt, and round 56 step 7
   (widening `resolveSectionData`'s existing schedule fetch) is where it gets
   repaid. Say so in the field's hint; do not pretend the chip closes it.
8. **Per-type value filtering on a shared enum.** §F. It buys one refusal and
   re-opens the panel↔component lock.

---

## I. Build sequence

Ordered so that the token-clean work lands first, the steps that make an enum
value mean something **type-specific on the public render path** are isolated
together in the middle, and the largest new surface is last.

### Step 1 — `price_card.dateStrip`, rendered as a bordered pill *(STRUCTURE; field-only)*
The one gap round 57 left on this type (round 56 §B #23). A string defaulting to
`''`, gated on `.trim()`, absent renders nothing — **identical mechanism to the
four fields round 57 shipped**, so §H's rule is already proved for this shape.
The pill is `border`-and-`rounded-full` in `--9e-air`, which is a token (§B).
Touches no enum. **Independently shippable, and it does not depend on any other
step.** First because it is the cheapest thing with the highest content value —
and because it keeps step 2 honest about being an enum-only change.

### Step 2 — `CARD_STYLES` gains `promo`; `CARD_STYLE_CLASS` gains one entry *(STYLE-VALUE; no renderer branch)*
```
promo: 'border border-[var(--surface-border)] bg-9e-gradient-subtle shadow-9e-lg'
```
Three treatments the enum already offers individually, composed — closing §A1
with **no new token** (§H.1). Plus `CARD_STYLE_LABELS.promo`. `assertComplete`
covers it at module load; the Tests assertion below covers it the moment it is
declared. **No component changes at all**, so the byte-identity proof reduces to
D's table and cannot leak into the existing values. It reaches all three readers
(§F). **Independently shippable.**

### Step 3 — `price_card` enlarges its price under `promo` *(public render path; type-specific branch)*
The first step that makes the value mean something only one type understands.
`cardStyle === 'promo'` → the price line moves from `text-3xl` to
`text-5xl md:text-6xl`, the period keeps its size. **Depends on step 2.** Carries
D's full proof: every stored shape × every existing value, zero differing, with
the `promo` control differing. **Independently shippable.**

### Step 4 — `price_card` reshapes its ribbon under `promo` *(public render path; type-specific branch)*
Flush corner rectangle (`top-0 right-0`, `rounded-bl-9e-lg rounded-tr-9e-lg`,
`text-base`, no rotation) instead of the 45° band. Same proof as step 3.
**Depends on step 2, and sequenced after step 3 deliberately** — it modifies an
element round 57 shipped four commits ago, so it should not be the first thing
that proves the branch pattern works. **Independently shippable.**

### Step 5 — a label/value detail list *(STRUCTURE; new schema shape + new editor control)*
`details: z.array(z.object({label, value})).default([])`, rendered under a rule
as a one-then-two-column grid (`grid gap-5 sm:grid-cols-2`), label muted above
value. `features` is untouched and keeps its ticks. **Riskiest and last**: it is
the only step with a new *shape* rather than a new *string*, so it needs a
repeater control in the editor, a `sectionRendersEmpty` update, and an
array-shaped `.lean()` read (absent → `[]` → renders nothing). **Independently
shippable, but it should not be sequenced earlier** — an array field is where
round 39's absent-key trap bites hardest.

**Not proposed:** a peach gradient token, a red price token, per-field size or
colour controls, lime as an accent, a wider gradient grammar, `backdrop-filter`,
a `clamp()` type scale. See §G and §H.

**Independently shippable:** steps 1, 2, 5 outright. Steps 3 and 4 each depend
only on step 2 and on nothing else, so once step 2 is in, either can ship alone
or both together.

---

## Tests

**One assertion is warranted.** `test/render/cardStyleValues.test.mjs`.

§A's headline — *no declared `cardStyle` value is inert, all five are distinct,
and all three readers resolve every value identically* — is the finding the rest
of the round is built on, and **nothing pinned it**:

- `assertComplete('cardStyle', …)` throws at module load if a value has no map
  **entry** — but an entry of `''` satisfies it, and `plain`'s legitimately is.
  So "every value has an entry" was pinned; "every value does something" was not.
- `readerSets.test.mjs` proves each reader genuinely reads the prop, but across
  exactly **one pair of values** (`shadow` vs `plain`). Emptying `filled` or
  `gradient` — say, while pruning an unused Tailwind gradient — leaves the whole
  suite green and turns a control into round 18's lie.
- Nothing at all asserted the cross-type identity §F's answer depends on. A
  per-type branch could appear and §F would be silently wrong.

The assertion goes through `cardSurfaceClass`, the sanctioned capability helper,
**not** the private `cardStyleClass` — `test/fs/styleCaps.test.mjs` locks that
shut and this must not be the thing that picks the lock.

**It is a standing guard, not self-retiring, and that is deliberate.** Round 56's
`MAX_SECTION_DEPTH` assertion retires when the pages it protects are built. This
one's subject *grows*: step 2's `promo` is covered the instant it is declared,
which is exactly the moment the round-18 failure could recur.

**No other assertion is proposed.** Guarding fields and values that do not exist
yet would be speculative, and each build step carries its own proof obligation
under §D.
