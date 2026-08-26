# Fixing the three control findings — a proposal

Round 18 found three envelope controls that do not do what the settings panel
promises. Fixing them means touching `presets.js` and renderer components —
code the **published** page uses. Every round from 6 to 20 stayed on the editor
side. This one would not, so it proposes rather than builds.

The ruling is already made: **make the controls work, do not hide them.** Where
a per-type answer below is "this type has no accent surface", that is offered as
a documented, defensible fact — not as a proposal to remove the control.

Measured at `6882964`. Companion to
[docs/section-control-audit.md](./section-control-audit.md), which established
the findings.

---

## 0. The number that changes the shape of this decision

**Blast radius: zero.** Across every live section, every unpublished draft, and
every stored version, the number of sections carrying a non-default value of an
affected control on an affected type is **0**.

The whole corpus contains **three** authored non-default values, and not one of
them is affected:

| where | section | value | affected? |
|---|---|---|---|
| `expo002` (published) | `rich_text` | `containerWidth: medium` | no — rich_text has no self-clamp; the control already works |
| `expo002` (published) | `rich_text` | `accentColor: green` | no — rich_text is one of the nine that already consume the accent |
| `ex-pro-1` (published) | `timeline` | `containerWidth: small` | no — timeline has no self-clamp |

`course_card`, `instructor_card` and `container` **do not appear anywhere in the
corpus at all** — not live, not draft, not in version history.

So the risk these fixes carry is not "existing pages change". It is entirely
"future pages behave differently", which is the cheap kind. Details and method
in §5.

---

## 1. F2 — the accent, and the pattern the nine already follow

### What the nine consumers actually do

Read off the components before proposing anything for the fourteen:

| type | element | variable |
|---|---|---|
| `checklist` | the check icon, and only when ticked | `fill` |
| `highlight_grid` | each cell's left border rule | `fill` |
| `timeline` | the milestone dot on the connector | `fill` |
| `icon_card` | the icon, inside a chip tinted at 10% of the same colour | `fill` |
| `stat_card` | the icon; **and** the headline value | `fill`; `text` |
| `price_card` | the feature check icons; the highlight ring; **and** the price | `fill`; `text` |
| `tabs` | the active tab's underline; **and** the active tab's label | `fill`; `text` |
| `rich_text` | hyperlinks inside the prose | `text` |
| `cta` | the button, via `accentButtonClass` | `fill` + `on` + `text` |

### The pattern, in three roles

**`--pb-accent-fill` — ornament.** Icons, markers, dots, border rules, rings,
tinted chip backgrounds. Small, non-text, decorative-but-meaningful. Seven of
the nine.

**`--pb-accent-text` — the one key figure, or a link.** A short text run that is
semantically *the point* of the block: a price, a stat value, the active tab's
label, a hyperlink. Four of the nine.

**`accentButtonClass` — the action surface.** Buttons only, and only through the
shared helper gated by `SECTION_STYLE_CAPS`. Two of the nine.

### And two negative rules, which hold across all nine without exception

**Headings and body copy are never accented.** `price_card` accents its price
and *not* its title. `icon_card` accents its icon and *not* its title.
`stat_card` accents its value and *not* its label. `timeline` accents its dot
and *not* its title. `heading.jsx` states it as a decision in its own docstring:
*"Inherits the page/section text colour (accent is not applied to headings by
default)."*

**Semantic colour is never overridden.** Nothing in the nine replaces a colour
that encodes meaning.

### Applying it to the fourteen

**Three types have a surface the pattern reaches. Eleven do not.**

| type | verdict | where the accent lands | var | justification |
|---|---|---|---|---|
| `accordion` | **FIX** | the open item's chevron, and the open item's title | `fill`; `text` | The `tabs` precedent, exactly. Same round, same item-list shape, same one-active-at-a-time state. `tabs` accents the active tab's underline and label; `accordion` has an open item and a rotating chevron and accents neither. Round 18 called this "the cheapest of the 14 to close and the hardest to defend". |
| `instructor_card` | **FIX** | the specialty chips | `fill` (background at 10%, text at full) | The `icon_card` chip precedent, verbatim: `bg-[color:var(--pb-accent-fill)]/10` + `text-[var(--pb-accent-fill)]`. The chips are `bg-9e-ice` today — a neutral surface where the pattern already has an accent treatment for the identical shape. |
| `course_schedule` | **FIX** | the calendar icon | `fill` | It is *already* accent-coloured and merely not variably so: `text-9e-action` is the default accent's own token, hardcoded. Swapping the token for the variable is the smallest change in this document. **The status badge must not change** — `resolveScheduleBadge` encodes open / nearly-full, which is the second negative rule. |
| `heading` | no surface | — | — | A heading is prose. The negative rule holds in all nine, and this component's docstring already names it as a decision rather than an oversight. |
| `image` | no surface | — | — | A figure and a muted caption. No icon, marker, rule or key figure; the caption is prose. A border or rule would be decoration this component has never had. |
| `notice` | no surface | — | — | Its border and icon *are* coloured — by variant. Overriding an error's red with a green accent would make the component lie about severity. **Worth naming the trap:** the `info` variant is `border-9e-action`, the default accent's own colour, so it already *looks* accented — which is exactly why an author reaches for สีเน้น here and gets nothing. |
| `custom_html` | no surface | — | (already reachable) | The component renders author HTML and nothing of its own. But the wrapper *does* set `--pb-accent-*`, so author CSS can read it. Not a gap a component can close — a fact to document. |
| `custom_css` | no surface | — | — | Renders a `<style>` element and no visible output whatsoever. |
| `embed` | no surface | — | — | The visible content is a third-party iframe; we own only an aspect-ratio wrapper. A ring around someone else's video is invented decoration. |
| `debug_json` | no surface | — | — | Canvas-only, never published, a developer scratch pad. |
| `course_card` | no surface | — | — | Renders the site's shared `CourseCard`. Its docstring names the reuse as the point — *"one presentation for a course, no drift"* — and gives it as the reason `cardStyle` is not offered either. Accenting it means forking a component used on non-builder pages. |
| `course_selector` | no surface | — | — | Same shared `CourseCard` grid. Its own heading is prose. |
| `bundle_courses` | no surface | — | — | Same shared `CourseCard` grid. |
| `course_list` | no surface | — | — | Same shared `CourseCard` grid. |

**The four `CourseCard` types are one decision, not four.** "Does the accent
reach the shared site card?" — and the answer is no without forking a component
that renders on non-builder routes.

### This amends round 18's framing, and the amendment matters

Round 18 ranked F2 second by severity on the strength of "14 of 27". On
inspection **eleven of those fourteen are correct restraint, not a bug** — the
component genuinely has no surface the accent belongs on. The real gap is three
types.

### What to do about the eleven, given the ruling

The control stays. What is wrong for those eleven is not the control, it is the
**promise**: the field's hint currently reads

> มีผลกับ section นี้และ section ที่ซ้อนอยู่ข้างใน

which claims a universal effect. Proposal: replace it with copy that names what
the accent actually touches (icons, markers, links, buttons, key figures) and
says it cascades to nested sections. That removes the lie without hiding the
control and without inventing decoration.

That change is **editor-side only** — `SettingsPanel.jsx` — so it carries none
of the published-page risk the other three fixes do, and it can ship first.

---

## 2. F1 — the two cards, and why they clamp

### The intent, measured

Both wrap themselves in `max-w-sm`. Rendered in Chrome at a 1200px container:

| | card width |
|---|---:|
| standalone `course_card` | **384px** |
| `course_selector` grid cell (3 columns) | **373px** |
| `bundle_courses` grid cell (3 columns) | **373px** |
| standalone `instructor_card` | **384px** |

An 11px difference — 2.9%. **A lone card renders at the width it would have as a
cell in one of the multi-course grids.** That is not a coincidence; `max-w-sm`
is 384px and the grid cell falls out of `max-w-[1200px]` with `gap-6` at three
columns.

`course_card.jsx`'s docstring reinforces it: the whole type exists to reuse the
site's `CourseCard` so there is *"one presentation for a course, no drift"*, and
that same sentence is given as the reason it does not read `style.cardStyle`
either. A card that stretched to 1200px when the author picked "เต็มความกว้าง"
would be a second presentation of a course — precisely what the type refuses.

### Verdict: don't make the control work here

**This is the case the brief said it would accept.** Making `containerWidth`
stretch a single card is the wrong fix; the clamp is the design. Honouring the
control would produce a 1200px-wide course card, which nothing in the system
wants and no author would keep.

What *is* wrong is the same thing as F2's eleven: the control promises an effect
it cannot have here. Three options, in order of preference:

1. **Correct the promise** (recommended). Same mechanism as F2's eleven — the
   hint says what ความกว้าง controls: the section's own box, not the size of a
   card sitting inside it. Editor-side only.
2. **Give the cards a control that does mean something** — a card-size preset
   (`compact` / `standard` / `wide`) on the two card types, via the existing
   `SECTION_STYLE_CAPS` mechanism. This is **new scope**, not a fix, and is
   noted only so it is not confused with option 1.
3. Honour `containerWidth`. Not recommended, for the reason above.

---

## 3. F3 — the container, and which layer is responsible

### What collapses, and why

| `containerWidth` | outer box | `container`'s own clamp | painted |
|---|---:|---:|---:|
| `small` (`max-w-2xl`) | 672 − 32 padding = 640 | 768 | **640** |
| `medium` (`max-w-4xl`) | 896 − 32 = 864 | 768 | **768** |
| `large` (`max-w-[1200px]`) | 1200 − 32 = 1168 | 768 | **768** |
| `full` (`max-w-none`) | viewport | 768 | **768** |

`ContainerSection` renders `mx-auto flex max-w-3xl flex-col gap-8`, and
`max-w-3xl` is 768px. It wins whenever the outer box is wider, which is three of
the four settings.

### The responsible layer is `container.jsx`, not `presets.js`

`presets.js`'s `CONTAINER_WIDTH_CLASS` is correct — it emits exactly the
max-widths it names. The defect is that `container.jsx` declares a **second
authority over the same concept**: "how wide is the readable column" is what
`settings.containerWidth` already owns, and the component hardcodes an answer
that silently outranks it.

**A constraint that shapes every option:** `SectionRenderer` passes
`content`, `style`, `layout`, `domId`, `inEditor` and `data` to components — it
does **not** pass `settings`. So `container.jsx` cannot read `containerWidth`
and adapt. Any fix must work without it.

### Options

**(a) Delete `max-w-3xl`.** Then `container` renders `flex flex-col gap-8` and
`full_width` renders `flex flex-col gap-8` — the two types become identical.
Rejected: it fixes the control by deleting a section type.

**(b) Change `container`'s default width instead of its clamp** *(recommended)*.
Remove `max-w-3xl` from the component, and give the `container` schema member a
`settings.containerWidth` default of `small` instead of the shared `large`.
Then:

- `container` at its default → 640px, a readable column. The type keeps its
  identity.
- `container` at `medium` / `large` / `full` → 864 / 1168 / viewport. All four
  values work, because the author explicitly asked.
- `full_width` keeps the shared `large` default. The two types stay distinct by
  **default**, which an author can override, rather than by a clamp they cannot.

The change lands in `src/lib/schemas/sections/layout.js` (or `base.js`'s
`defineSection`), **not** in `presets.js`. One implementation risk worth naming
up front: `settingsSchema` is `z.object({…}).default({})`, so overriding one
inner default per type means unwrapping and re-wrapping the default
(`.removeDefault().extend({…}).default({})`). Feasible in zod 3, and the kind of
thing that wants a test before it wants a component.

**(c) Leave the clamp and correct the promise**, as with F1 and F2's eleven.
Cheapest, and honest, but it is the only one of the three findings where the
control *can* be made to work without harming the design — so it is offered as
the fallback rather than the recommendation.

Existing `container` sections stored with `containerWidth: large` would jump
from 768 to 1168 under (b). **There are zero such sections** (§0), which is what
makes (b) safe today and would not have been true of a larger corpus.

---

## 4. What changes appearance, by proposal

| proposal | live pages affected | kind of change | could it break layout? |
|---|---:|---|---|
| F2 — accordion accent | **0** | visible-but-benign: a chevron and an open title take a colour | No. Colour only; no box changes size or position. |
| F2 — instructor_card chips | **0** | visible-but-benign: chip background and text colour | No. The chips keep their box. |
| F2 — course_schedule icon | **0** | visible-but-benign, and only when the author picked a non-default accent — otherwise byte-identical, because `text-9e-action` *is* the default accent | No. |
| F2 — hint copy for the eleven | 0 | editor-only; the published page never renders it | No. |
| F1 — correct the promise | 0 | editor-only | No. |
| F1 — honour containerWidth (not recommended) | 0 | **layout-shifting**: a card would go 384 → up to 1168px | Yes, plausibly. `CourseCard` was designed for a ~380px cell; its `line-clamp-2` title and its image aspect were chosen for that. |
| F3 — option (b) | **0** | **layout-shifting** for any `container` at the default: 768 → 1168px | Reflow, not breakage — children are already responsive. But every nested section re-lays out, so it is the one to verify most carefully. |

The two layout-shifting entries are the ones to sequence last, and both have a
measured blast radius of zero **today**.

---

## 5. How D was measured

`scripts/audit-control-fix-blast-radius.mjs`, run read-only against the
configured database.

- **Read-only, and structurally so.** One `find()` with a lean projection and a
  recursive walk. No `updateOne`, `bulkWrite`, `$set`, `save()`, `insertOne` or
  `deleteOne` anywhere in the file — checked by grep as well as by writing it
  that way.
- **Three trees counted apart**: `sections` (what the public renders now),
  `draft.sections` (what an author has typed and not published — it changes
  their page later, with them watching), and `page_versions` (a rollback can
  reintroduce a value that is absent everywhere else).
- **Nested sections walked**, through `children` / `left` / `right`, so a value
  inside a container is not missed.
- **The fourteen types are written out, not re-derived.** A list that rescanned
  the components would shrink as fixes land and would then report a smaller
  blast radius than the decision was taken against.

**Corpus:** 3 documents (2 published, 1 draft), 25 live sections, 19 of them on
published pages, 9 draft sections, 2 version documents holding 0 sections. Ten
distinct section types in use: `heading` 8, `image` 4, `rich_text` 3, `cta` 2,
`checklist` 2, `two_column` 2, `notice` 1, `card_grid` 1, `timeline` 1,
`highlight_grid` 1.

**The caveat this number needs.** That is the database this working copy is
configured against (`9exp_genesis`, a hosted cluster — not localhost). It is
small enough that it may be a development or staging dataset rather than the
production one. **Before any of these fixes ships, re-run the script against
whatever database production actually uses.** The script takes its URI from the
environment and needs no edit to do so. Every "zero" in this document is a
measurement of one database at one moment, not a property of the design.

---

## 6. Recommended sequence

Three independent fixes with different risk profiles. Recommended order, and
what makes each step safe to take before the next:

**Step 1 — the copy fixes (F1 option 1, F2's eleven).** Editor-side only:
`SettingsPanel.jsx`'s hint for `สีเน้น` and `ความกว้าง`. Zero published-page
risk, because the published page never renders panel copy. Ships alone,
verifiable by a render-tier exact-string test. *Safe first because it removes
the lie immediately without touching a renderer, and because it establishes what
the controls claim before any of them changes what they do.*

**Step 2 — `course_schedule`'s icon (F2).** One token swapped for one variable
in one component. At the default accent the output is **byte-identical**, which
makes it the only renderer change here that can be proven inert for existing
pages. *Safe second because it is the smallest possible test of the whole
published-page verification method (§7) — if that method has a hole, this is the
change you want to find it with.*

**Step 3 — `accordion` and `instructor_card` accents (F2).** Colour-only changes
to two components, following an existing precedent exactly. Visible but never
layout-shifting. *Safe third because step 2 will have proven the verification
method on a change whose expected diff was zero; these have a non-zero expected
diff and need the method working.*

**Step 4 — `container`'s default width (F3 option b).** Last, and alone. It is
the only schema change, the only layout-shifting change, and the only one whose
correct behaviour depends on a zod default-unwrapping detail. *Safe last because
everything cheaper has already shipped, so if this one has to be reverted it
reverts by itself.*

**Not recommended at any position:** honouring `containerWidth` on the two card
types (F1 option 3), and the card-size preset (F1 option 2), which is new
feature scope and should be proposed on its own merits rather than as a fix.

---

## 7. Verification plan for anything touching the published page

Round 20 left `presets.js` untouched *deliberately*, because it serves both the
canvas and the published page. That constraint does not forbid changing it — as
it happens **none of the recommended steps changes `presets.js` at all**; the
changes land in three components and one schema file. But every step from 2
onward changes code the published page runs, so the same standard applies.

**Confirmed: I would apply round 20's method**, which is:

Derive the public render path **mechanically** from `PageBuilderView`'s
transitive imports — it came to 65 files last round — and compare every one of
them byte-for-byte against `HEAD`, normalising line endings. (That normalisation
is not optional: the first run of it in round 20 reported 0/65 identical, purely
because the working tree is CRLF and `git show` yields LF.) Anything on that
path that changed must be a file the step intended to change, and nothing else.

**Two additions, because that method is necessary and not sufficient here.**
Round 20's changes were confined to the editor, so "no public file changed" was
the whole proof. These steps change public files on purpose, so the method must
also answer *what the change did*:

1. **A rendered-output diff, not just a file diff.** For each step, render a
   fixture page containing every affected type through the real
   `SectionRenderer` at the default accent and default width, and compare the
   markup byte-for-byte against the same fixture rendered at `HEAD`. Step 2
   should produce **zero** difference (`text-9e-action` and the default accent
   resolve to the same colour); steps 3 and 4 should produce differences
   confined to the elements this document names, and nowhere else. This is the
   differential instrument round 18 already built.

2. **A browser measurement for step 4.** A byte diff cannot tell reflow from
   breakage. Step 4 changes a painted width from 768 to 1168, so it needs the
   Chrome harness rounds 17–20 used: render a `container` with nested sections
   at all four `containerWidth` values and report the painted content width of
   each, confirming four distinct numbers instead of today's `640, 768, 768,
   768`.

---

## 8. Test added

One, appended to `test/pure/sectionControlAudit.test.mjs` — the file that
already owns round 18's tripwires for findings 1, 2 and 8. **Finding 3 had
none**, which this closes: an assertion that `container.jsx` still carries the
`max-w-3xl` clamp that swallows three of the four width settings.

It is self-retiring in the same way as its neighbours: it goes red on the commit
that implements §3's option (b), and its message says to delete it along with
finding 3's row in the audit — not to update it to match whatever the new clamp
turns out to be.

Nothing else was added. Everything else measured here is either a fact about a
database at one moment (which no test in this repo should assert) or a design
proposal that does not exist yet.
