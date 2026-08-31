# Why a nested section is half the screen wide on mobile

Round 72. A survey and a proposal. **Nothing is built here.**

The author's report is `ขอบซ้ายขวาเยอะเกินไป` on a `card_grid` inside a
`highlight_grid` inside a `container` at 390px, plus a request that every
section setting be checked rather than just that case. Both are answered below
with measured numbers, not impressions.

Every figure comes from `scripts/_measure-round72-mobile-padding.mjs`, which
renders real sections through the real `SectionRenderer` at a real viewport in
headless Chrome and reads `getBoundingClientRect()`, and from
`scripts/_audit-round72-padding-reference.mjs`, which reads the database and the
reference pages read-only.

---

## The one-sentence answer

There is exactly **one** horizontal padding in the whole page-builder render
path — `px-4` on `SectionRenderer`'s container div — and because **every**
section goes through `SectionRenderer`, including nested ones, it is applied
once per nesting level. The author's three-level case therefore pays it three
times.

---

## A. The inventory

Read off the DOM at 390px rather than off the source, so nothing that is
present-but-inert is counted as a contributor.

| # | element | what it is | mobile 390 | desktop 1440 |
|---|---|---|---|---|
| 1 | `(public)/layout.jsx` → `<main class="flex-1">` | — | **0** | 0 |
| 2 | `PageBuilderView` → `<div class={pageClass}>` | background + text colour only | **0** | 0 |
| 3 | **`SectionRenderer` → `<div class="mx-auto px-4 …">`** | **padding, ONCE PER LEVEL** | **16px each side** | 16px each side |
| 4 | `containerWidthClass` on that same div | max-width | **inert** (see C) | 672 / 896 / 1200 / none |
| 5 | `container` → `mx-auto flex flex-col` | no horizontal property | 0 | 0 |
| 6 | `full_width` → `flex flex-col` | no horizontal property | 0 | 0 |
| 7 | `two_column` outer | `gap-8` between columns | **inert** — `lg:` only, one column below | 32px |
| 8 | `two_column` inner columns | `gap-6`, vertical | 0 | 0 |
| 9 | `card_grid` | `gap-6` gutter | **inert** — `sm:`/`lg:` only, one column below | 24px between |
| 10 | `highlight_grid` outer | `gap-6` gutter | **inert**, same reason | 24px between |
| 11 | **`highlight_grid` per-child box** | **padding `p-6`** | **24px each side** | 24px each side |
| 12 | card interiors (`icon_card`, `price_card`, `stat_card`, `instructor_card`) | padding `p-6` | 24px each side | 24px each side |

Two things this table settles:

* **The shell contributes nothing.** `<main>` and `PageBuilderView` have no
  padding, no margin and no max-width. Every pixel lost is inside the section
  tree.
* **Every gutter is inert at 390px.** `COLUMNS_CLASS` collapses to
  `grid-cols-1` below `sm` (640px) and `RATIO_CLASS` below `lg`, so the grids
  never split on a phone and their gaps cost no horizontal space. Only rows 3
  and 11 are real at mobile.

---

## B. The compounding table

Measured at **390px**, published render. "Consumed" is total left+right space
between the section's outer edge and the leaf's content box.

| nesting | consumed | content survives | % of viewport |
|---|---|---|---|
| leaf at top level | 32px | **358px** | 91.8% |
| leaf in `container` | 64px | **326px** | 83.6% |
| leaf in `full_width` | 64px | **326px** | 83.6% |
| leaf in `two_column` | 64px | **326px** | 83.6% |
| leaf in `card_grid` | 64px | **326px** | 83.6% |
| leaf in `highlight_grid` | 112px | **278px** | 71.3% |
| **`card_grid` in `highlight_grid` in `container`** | **176px** | **214px** | **54.9%** |
| depth 4 (the `MAX_SECTION_DEPTH` cap) | 208px | **182px** | 46.7% |

The author's "under half the viewport" is 54.9% at their real nesting and drops
below half — 46.7% — at the cap. At depth 4 the page spends **more pixels on
margin than on content**.

### The ladders, which separate the two mechanisms

| | ×1 | ×2 | ×3 | loss per level |
|---|---|---|---|---|
| `container` nested in itself | 326 | 294 | 262 | **32 / 32 / 32** |
| `highlight_grid` nested in itself | 278 | 198 | — | **80 / 80** |

---

## C. Every `containerWidth` value

Measured on the section that carries the setting, with fixtures parsed through
`sectionSchema` so the per-type defaults round 25 moved into the schema are
real.

| setting | content at 390px | content at 1440px | max-width applied |
|---|---|---|---|
| `small` (แคบ) | **358px** | 640px | 672px |
| `medium` (ปานกลาง) | **358px** | 864px | 896px |
| `large` (กว้าง) | **358px** | 1168px | 1200px |
| `full` (เต็มความกว้างจอ) | **358px** | 1408px | none |
| `container`, absent | 358px | 640px | 672px — `small`, per-type default holds |
| `full_width`, absent | 358px | 1168px | 1200px — `large`, base default holds |

**Distinct values at 390px: 1. Distinct at 1440px: 4.**

> ### The dead-control finding
>
> **All four `containerWidth` values are indistinguishable at mobile widths.**
> The narrowest cap is `max-w-2xl` = 672px, which is 1.7× a 390px viewport, so
> no value constrains anything a phone can see. The control works perfectly on
> desktop and is inert on mobile — and the author, who is looking at a phone,
> has been offered the only horizontal control the panel has and correctly
> found that it changes nothing.

Round 25's fix and round 71's observation both still hold: `container` opens at
`small` and `full_width` at `large`, and all four values do what they say — on
desktop.

---

## D. Which layer is the problem

**`px-4` on `SectionRenderer`'s container div, applied once per nesting level.**
It is row 3 of the inventory and it accounts for 32px of every level.

The compounding is **linear for the stacks and disproportionate for one type**:

* `container`, `full_width`, `two_column`, `card_grid` each cost **32px** per
  level — exactly `px-4` twice, and nothing else.
* `highlight_grid` costs **80px** per level: the same 32px, plus 48px from its
  own per-child box (`p-6`, added in round 29 to give each child an
  accent-bordered surface).

So a fix aimed at `px-4` alone takes the author's case from 176px to 32px
consumed if the padding is applied once instead of per level — but leaves
`highlight_grid`'s 48px, which is a *card surface* and not a page margin. The
two need separate decisions, and conflating them is how a fix moves the number
without fixing the shape.

---

## E. The canvas versus the published page

**They agree exactly.** All 13 nestings were rendered twice — once with a
`path` (the canvas concession in `SectionRenderer`) and once without (the
published path) — and every pair produced the identical content width.

That is round 20's iframe-at-real-widths decision continuing to pay: there is
no discrepancy to chase, and an author measuring in the canvas is measuring the
real page. Had these disagreed it would have mattered more than the padding
itself, because it would mean the editor cannot be trusted to show the problem.

---

## F. What the reference pages do

Both round-56 target pages, read out of `promotions`:

| | `promotion-claude-ai-bundle` | `promotion-build-business-apps-with-claude-code` |
|---|---|---|
| root element | `.ai-promo` — `max-width: 1200px`, `margin: 1rem auto`, **no horizontal padding** | `.promo-container` |
| the edge inset | `width: min(100% - 2rem, 1200px)` | `width: min(100% - 2rem, 1000px)` |
| **inset per side** | **16px** | **16px** |
| applied | **once**, on the content row | **once**, on the content row |
| card interiors | `1rem`–`1.25rem` (16–20px) | `1.25rem` |
| horizontal padding in a mobile media query | none | none |

The number to aim at is therefore **16px per side, once** — the same 16px the
builder already uses, applied once instead of per level. `width: min(100% -
2rem, N)` is the idiom: it is a width, not a padding, so it does not stack when
nested and it collapses to the cap on desktop.

Both pages do carry media queries (for grid columns and type sizes) but neither
changes its horizontal inset at any breakpoint. **One inset at all widths** is
the reference behaviour, which is worth saying because it removes "add a
mobile-only value" from the design space before anyone proposes it.

---

## G. Is any of this author-controllable today?

**No.** `containerWidth` is the only setting on the horizontal axis, and §C
shows all four of its values are identical below 672px. There is nothing else:
`spacingTop`/`spacingBottom` are vertical, round 71's `spacingBetween` is
vertical, and no section type exposes a padding.

Stated as the finding: **an author can pick a max-width and nothing else, and
on mobile even that does nothing.** The horizontal inset is a constant the
render path owns and the panel never mentions.

---

## H. What a fix would break

Read-only, from `page_builder_pages` and `page_versions.snapshot.sections` —
not `pagebuilders`, not `content.sections`, which were round 50's two false
zeros. Every read goes through a helper that dies on a missing collection name,
because "no documents" and "no collection" print the same number.

| | count |
|---|---|
| pages stored | 5 |
| version snapshots | 9 |
| sections: live / draft / versioned | 67 / 35 / 182 |
| live container-type sections | 14 |
| pages with any nesting | 4 of 5 |
| deepest live nesting | 4 (`early-bird-claude-code`, **published**) |

Live sections by depth: `{0: 33, 1: 23, 2: 5, 3: 2, 4: 4}`.

**34 of 67 live sections — 51% — sit at depth ≥ 1**, and every one of them
would gain width on mobile if the compounding were removed. That is not a
regression, it is the fix; but it means **every published page moves on
mobile**, and only the one flat page (`testearlybird`, which has no sections at
all) does not.

§H of round 56 applies, and it forks:

* **If the fix is a new control**, it defaults to today's behaviour and nothing
  moves until an author opts in. Zero pages change on deploy.
* **If the fix changes the default**, all four nesting pages change on mobile
  the moment it ships. That is the intended outcome — the current default is
  the defect — but it must be **stated before it ships, not discovered after**.
  The sequence below puts that step behind a measured before/after so the
  change is a table, not a surprise.

---

## I. What NOT to build

Three candidates were weighed. All three are rejected, with the evidence.

### 1. A per-section padding control — **no**

It would be a **fourth spacing vocabulary** beside the three that already
exist (`spacingTop`, `spacingBottom`, `spacingBetween`), and the first one on
the horizontal axis. Round 71 reused `SPACING` whole precisely so that
"ปานกลาง" means one distance everywhere; a horizontal scale would either
duplicate those five values (and then differ from them the first time someone
tunes one) or introduce different ones (and then the panel teaches two
meanings).

Worse, it does not fix the reported problem. The defect is **compounding**: the
author would have to set the padding to `ไม่มี` on every intermediate level and
remember to do it on every future one. A control whose correct use is "set it
to zero everywhere except the outermost" is a control that encodes the bug.

### 2. Removing padding automatically at depth — **no**

The obvious form — "apply `px-4` only when `depth === 0`" — produces a layout an
author cannot predict from the panel. Two identical `container` sections would
render with different insets depending on where they were dropped, and moving a
section in the structure tree would silently change its geometry with no
setting having changed.

This repo has a standing rule against exactly that shape: a control's effect
must be legible, and `SettingsPanel`'s header records the sibling rule that a
control for a value the render path ignores is a lie the author cannot detect.
Depth-conditional padding is the mirror image — a render the panel cannot
explain.

It is also *nearly* right, which is what makes it dangerous. The correct
version is not "skip the padding at depth" but "the inset is a property of the
page, applied once" — §F's idiom — which is legible because it does not vary.

### 3. A mobile-only override — **no**

The settings panel already carries three axes (`containerWidth`, the two
spacings) plus round 71's fourth on two types. A per-breakpoint variant of any
of them doubles the panel and asks the author to reason about two viewports for
every field.

The evidence against it is §F: **neither reference page changes its horizontal
inset at any breakpoint**, and they are the target. The problem is not that
mobile needs a different number; it is that mobile is where paying the number
three times becomes visible. Fix the compounding and mobile needs no special
case — which §B's top row already shows, since a top-level section at 358px of
390px is not what anyone is complaining about.

### Also not proposed

* Touching `highlight_grid`'s `p-6`. It is a card surface, not a page margin,
  and round 29 added it deliberately. It belongs in a separate decision about
  whether a bordered box should nest at all.
* Any change to the grids' gutters. They are inert at mobile (§A rows 7–10), so
  they are not part of this problem.

---

## J. Proposed build sequence

Ordered so the cheap and reversible work lands first, the public render path is
isolated to one step, and the step that moves every stored page is not first.

### Step 1 — pin the current numbers as a regression baseline *(test-only)*

Turn §B's table into a browser-tier assertion, so the fix has a before to be
measured against and a later round cannot reintroduce the compounding
unnoticed. **No source changes. Independently shippable, and it should ship
first** — it is the only step that is pure gain regardless of what follows.

### Step 2 — make the inset a page property, applied once *(PUBLIC RENDER PATH)*

Replace `px-4` on `SectionRenderer`'s container div with the reference idiom at
the top level only: the outermost section carries the inset, nested ones do
not. Mechanically this is one class on one div, and it is the whole of the fix
for the reported problem — it takes the author's case from 176px consumed to
32px, and depth 4 from 208px to 32px.

**This is the riskiest step and the only one that touches the public renderer.**
It changes all four nesting pages on mobile (§H). It must carry a measured
before/after table over every stored page, in the shape rounds 50/57/69/70/71
used, rather than an assertion that it is fine. **Independently shippable, and
nothing after it is required for the author's complaint to be resolved.**

### Step 3 — retire or re-scope `containerWidth`'s mobile inertness *(panel-only)*

§C's dead-control finding needs an answer, and it is a *separate* answer from
step 2 — after step 2 the control is still inert below 672px. Options, cheapest
first: a hint on the field saying it applies from tablet up (honest, one line,
no render change); or a narrower value that does something on a phone (a render
change, and a new enum member, which round 58 §F warns is how a shared
vocabulary drifts). **Independently shippable. Do not bundle it with step 2** —
one is a geometry change and the other is a labelling decision, and merging
them makes the before/after table unreadable.

### Step 4 — revisit `highlight_grid`'s nested box *(design question, not a bug)*

Only after step 2 has shipped and been looked at. Its 48px is the second-largest
contributor and the only one step 2 does not touch, but it is a card surface and
removing it is a visual decision rather than a correction. **Depends on step 2**,
and may well be closed as "correct as is".

### Not sequenced

The three rejected designs in §I. If a later round wants one of them, the
argument has to be made against the evidence above rather than around it.

---

## Tests

**One assertion is warranted, and it is small.**

The whole sequence rests on `px-4` being the *single* source of the
compounding — §A row 3 and §D. If a second horizontal padding is introduced
anywhere on the render path, or if that one moves, step 2 stops being
sufficient and §B's table silently becomes wrong with nothing connecting the
two.

So: **`SectionRenderer` declares exactly one horizontal padding, and it is
`px-4`.** Pinned in `test/fs/mobilePaddingBaseline.test.mjs`, naming this
document.

It is **self-retiring**: step 2 changes that class, the assertion fails, and
the correct response is to delete it together with this section — never to
update the expectation so it agrees with the new code.

No other assertion is proposed. §C's dead-control finding is real but pinning
it would mean asserting a defect that step 3 is meant to fix, and §B's full
table belongs in step 1's browser tier where it can be measured rather than
inferred.
