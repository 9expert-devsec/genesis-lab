# Section × control audit — what each control actually does, per type

`SettingsPanel.jsx` opens with the principle this document exists to check:

> A control that sets a value nothing reads is a lie the author can't detect:
> it looks like it worked, the page doesn't change, and there is no error.

That file applied the principle **by hand** when it was written, and recorded
the result as prose. The prose has never been verified against the components,
and 2C shipped 27 types. This is the measured version.

Survey only. Nothing here is fixed; every finding is a line in the list at the
bottom, ordered by how likely an author is to hit it. `SettingsPanel.jsx`'s
comment is **deliberately left as it is** — correcting the comment alone would
make the code look consistent while the gap it describes stayed open.

Measured at `32f2aa7` against all 27 types in `ALL_SECTION_TYPES`.

---

## 0. Correctness bugs: none

Nothing in this audit corrupts data, writes a value the schema rejects, or
throws. The differential below rendered every type against every value of every
envelope control, then again across every content field, then again in a real
browser — **1,937 renders, zero exceptions.**

Everything found is a **design gap**: a control offered where the value has no
reader. Those are in §8, not here. This section stays short on purpose — if a
later round adds something to it, it jumps the whole queue.

---

## 1. Headline numbers

454 cells: 27 types × 15 envelope controls (405), plus the 49 content controls
the panel actually renders across the 27 types.

| | cells | |
|---|---:|---|
| **READ** | 278 | the value demonstrably reaches the output |
| **ABSENT** | 125 | not offered for this type — correct, no defect |
| **PARTIAL** | 35 | read, but only under a condition named below |
| **IGNORED** | 16 | **offered, and no reader** — the defect this audit was for |
| **UNKNOWN** | 0 | every cell resolved by reading, rendering, or measuring |

The 16 IGNORED cells are two controls, and both are in the *universal envelope*
— the half of the panel whose comment says its effect **is** universal:

- `settings.containerWidth` on `course_card` and `instructor_card` — 2 cells
- `style.accentColor` on 14 of 27 types — 14 cells

**Definitions used.** `PARTIAL` is the brief's "read, but only some values have
an effect", widened by one case that turned up repeatedly and is the same defect
in kind: *read, but only when a second field is set*. Every PARTIAL cell below
names its condition.

---

## 2. Method (so it can be re-run)

Three instruments, all committed. None of the sets below is typed by hand.

### A. What is OFFERED — harvested from the panel

`scripts/_probe-section-controls.mjs` renders `ContentTab`, `StyleTab` and
`AdvancedGroup` — the same exported tab bodies round 15's union check renders —
once per type, and reads the controls out of the DOM.

```
node --import ./scripts/_probe-panel-register.mjs scripts/_probe-section-controls.mjs
```

**One correction was needed and it matters.** The first harvest selected
`label > span:first-child`, which is what `Field` produces. A checkbox is
`<label><input type="checkbox">text</label>` and has no span, so the first pass
silently under-reported `price_card` by one control and every `checklist` row by
one. The corrected selector takes both. Reported here because a harvest that
under-counts produces *false IGNORED findings* — the first pass looked like it
had found a `price_card.highlighted` field with no control, and it had not.

### B. What is READ — a differential over the real renderer

Same script, plus `scripts/_probe-section-content.mjs` for the content half.
Each control is varied across its full schema vocabulary; `SectionRenderer` is
rendered once per value; the markup is compared. **Two values that produce
byte-identical markup are not both read.** This is evidence rather than
inference — it does not care how many wrappers the value passes through, which
is what the brief asked for.

Two fixture decisions carry the whole method:

- **Content is populated for every type.** Every 2C component fails closed and
  renders nothing when blank. A differential over two empty renders shows no
  difference for *any* control, and the whole matrix would read IGNORED.
- **A valid `advanced.sectionId` is set throughout**, or `customCss` and the
  `custom_css` type are dropped before the differential can see them.

The comparison is taken at two depths, because the wrapper is two elements deep
(`<section>` for background/spacing/visibility/customClass/accent, then a
`mx-auto px-4` div for containerWidth). Stripping only the `<section>` leaves
the container div's class in the string and reports every `containerWidth` value
as "the component did something" — the opposite of true.

### C. Where markup could not decide — measured in a browser

`scripts/_probe-container-width.mjs` renders the real component through the real
compiled Tailwind in headless Chrome at 1440px and measures the painted box.

`settings.containerWidth` is the cell that needs this: it always changes the
markup, so a diff reports READ for all 27 types — but several components clamp
their own width underneath it, and where the inner clamp is narrower the
author's choice changes no pixels. JSDOM has no layout engine and would return
zero for every box, so this is the only honest way to answer it.

**Cells resolved by rendering rather than reading:** the entire `layout.*` row
(which value of `mobileBehavior` is the odd one out), the `style.*` reader-sets,
and every content cell. **Cells resolved by browser measurement:**
`settings.containerWidth` for all 27. **Cells resolved by reading only:** the
`style.accentColor` consumer set, because the accent travels by CSS variable —
the class string is a constant and the markup is identical for all six accents,
so a diff cannot see it. That set was taken by scanning
comment-stripped source across all of `sections/`, and it counts the two routes
to the accent separately — a class literal in the component, and the shared
`accentButtonClass` helper. Scanning raw files instead puts `cta` in the first
group on the strength of its docstring; see the counting note in §8.

### The method's one blind spot, stated

The six data-backed types resolve their references **above** the renderer
(`resolveSectionData` → the `data` prop). A differential that varies
`content.courseId` while holding `data` constant correctly reports *the renderer
does not read it* — and would be misread as IGNORED. Those cells are marked
**READ (resolver)** and were confirmed by reading `resolveSectionRefs.js`, which
reads `courseId`, `courseIds`, `source`, `filter` and `limit` directly. They are
not defects.

---

## 3. The matrix

`R` READ · `P` PARTIAL (condition in the key) · `I` **IGNORED** · `·` ABSENT

### Envelope

| type | cw | spT | spB | bg | vis | accent | card | button | ratio | cols | mob | id | class | css | html |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| full_width | R | R | R | R | R | P¹ | · | · | · | · | · | R | R | P² | R |
| container | **P³** | R | R | R | R | P¹ | · | · | · | · | · | R | R | P² | R |
| two_column | R | R | R | R | R | P¹ | · | · | R | · | R | R | R | P² | R |
| card_grid | R | R | R | R | R | P¹ | · | · | · | R | R | R | R | P² | R |
| highlight_grid | R | R | R | R | R | R | · | · | · | R | · | R | R | P² | R |
| timeline | R | R | R | R | R | R | · | · | · | · | · | R | R | P² | R |
| tabs | R | R | R | R | R | R | · | · | · | · | · | R | R | P² | R |
| accordion | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| heading | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| rich_text | R | R | R | R | R | P⁴ | · | · | · | · | · | R | R | P² | R |
| image | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| cta | R | R | R | R | R | R | · | R | · | · | · | R | R | P² | R |
| checklist | R | R | R | R | R | R | · | · | · | · | · | R | R | P² | R |
| notice | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| price_card | R | R | R | R | R | R | R | R | · | · | · | R | R | P² | R |
| stat_card | R | R | R | R | R | R | R | · | · | · | · | R | R | P² | R |
| icon_card | R | R | R | R | R | R | R | · | · | · | · | R | R | P² | R |
| custom_html | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| custom_css | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| embed | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| debug_json | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| course_card | **I⁵** | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| instructor_card | **I⁵** | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| course_selector | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| bundle_courses | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| course_list | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |
| course_schedule | R | R | R | R | R | **I** | · | · | · | · | · | R | R | P² | R |

Columns: `cw` containerWidth · `spT`/`spB` spacingTop/Bottom · `bg` background ·
`vis` visibility · `accent` style.accentColor · `card` style.cardStyle ·
`button` style.buttonStyle · `ratio`/`cols`/`mob` layout.* · `id`/`class`/`css`/
`html` advanced.*

**P¹ — accent, container types (`full_width`, `container`, `two_column`,
`card_grid`).** The component draws nothing accent-coloured itself. The wrapper
sets `--pb-accent-*` on the `<section>`, so the value reaches descendants that
*do* read it. Real effect, entirely dependent on what is nested inside.

**P² — `advanced.customCss`, every type.** Injects nothing unless
`advanced.sectionId` is set **and** valid; the renderer drops both together.
Measured: no `<style>` with no id, none with `9bad id`, one with `good-id`. The
panel already warns at the field, which is why this is a P and not an I.

**P³ — `containerWidth` on `container`.** `ContainerSection` clamps itself to
`max-w-3xl` (768px). Measured content widths across the four values: **640,
768, 768, 768**. Only `small` has an effect; `medium`, `large` and `full` are
pixel-identical.

**P⁴ — accent on `rich_text`.** The only accent-bearing class is
`prose-a:text-[var(--pb-accent-text)]`. A document with no links renders
identically at every accent.

**I⁵ — `containerWidth` on `course_card` / `instructor_card`.** Both clamp
themselves to `max-w-sm`. Measured content width at all four values: **384, 384,
384, 384.** See finding 1.

### Content

All 49 content controls are read. Split by *who* reads them:

| type | controls | verdict |
|---|---|---|
| heading | ข้อความ · ระดับหัวข้อ · จัดวาง | R ×3 |
| rich_text | เนื้อหา | R |
| image | รูปภาพ · Alt text · คำบรรยายใต้รูป | R ×3 |
| cta | หัวข้อ · คำอธิบาย · ข้อความบนปุ่ม · ลิงก์ปุ่ม | R ×4 |
| checklist | ข้อความ · ติ๊กถูก | R ×2 |
| notice | ชนิด · ข้อความ | R ×2 |
| timeline / accordion | หัวข้อ · เนื้อหา (per item) | R ×2 each |
| tabs | หัวข้อ · เนื้อหา (per tab) | R ×2 |
| price_card | หัวข้อ · ราคา · ต่อรอบ · รายการ · เน้นการ์ดนี้ · ข้อความบนปุ่ม · ลิงก์ปุ่ม | R ×7 |
| stat_card | ตัวเลข/ค่า · คำอธิบาย · ไอคอน | R ×3 |
| icon_card | ไอคอน · หัวข้อ · คำอธิบาย | R ×3 |
| custom_html | HTML | R |
| custom_css | CSS | **P** — needs a valid Section ID (same gate as P²) |
| embed | ผู้ให้บริการ · (ลิงก์วิดีโอ **or** โค้ด iframe) | R ×2 |
| debug_json | JSON | **P** — canvas only, never published. By design, and the field says so |
| course_card | รหัสคอร์ส | R (resolver) |
| instructor_card | รหัสผู้สอน | R (resolver) |
| course_selector | หัวข้อ (R) · รหัสคอร์ส (R resolver) | R ×2 |
| bundle_courses | รหัสคอร์ส | R (resolver) |
| course_list | แหล่งข้อมูล · รหัสคอร์ส/สกิล/โปรแกรม · จำกัดจำนวน | R ×3 (resolver) |
| course_schedule | รหัสคอร์ส (R both) · จำกัดจำนวนรอบ (R resolver) | R ×2 |
| full_width, container, two_column, card_grid, highlight_grid | *none* | the tree edits their children |

**`embed` deserves a note in the other direction.** `content.html` is read only
when `provider === 'iframe'`; `content.url` only for youtube/vimeo. The panel
offers **exactly the one that applies** and swaps them when the provider
changes — measured at both settings. This is the pattern the two IGNORED
controls in the envelope do not follow.

---

## 4. `SettingsPanel.jsx`'s claims, one at a time

The comment makes five specific claims about the deferred per-type controls.

| # | claim | verdict | evidence |
|---|---|---|---|
| D1 | `layout.ratio` → `two_column` only | **AGREE** | 5 ratios → 5 distinct renders for `two_column`, 1 for all 26 others. `ratioClass` imported by that file alone |
| D2 | `layout.columns` → `card_grid`, `highlight_grid` | **AGREE** | 5 distinct for both, 1 for all 25 others |
| D3 | `mobileBehavior` → `two_column` honours ONLY `reverse_stack`; `card_grid` ONLY `carousel` | **AGREE** | grouped by identical output: `two_column` → `{stack, hide, carousel}` vs `{reverse_stack}`; `card_grid` → `{stack, reverse_stack, hide}` vs `{carousel}` |
| D4 | `style.buttonStyle` → `cta`, `price_card` | **AGREE** | 4 button styles → 4 distinct renders for both, 1 for all 25 others |
| D5 | `style.cardStyle` → `price_card`, `stat_card`, `icon_card` | **AGREE** | 5 card styles → 5 distinct for those three, 1 for all 24 others |

**All five hold.** `SECTION_STYLE_CAPS` makes D4 and D5 structurally true rather
than coincidentally true, and it shows: those are the only reader-sets that
cannot drift.

### The disagreement is elsewhere, and it is the reason for §8

The comment is accurate about every control it **defers**. It is wrong about the
ones it **keeps**:

> …this panel ships only fields whose effect is universal — SectionRenderer
> applies them to EVERY section

`SectionRenderer` does apply them to every section. **Applying is not the same
as having an effect**, and the comment treats the two as one. `containerWidth`
is applied to `course_card` and changes nothing; `accentColor` is applied to
`notice` and changes nothing. Both are the exact failure the paragraph three
lines above them defines.

A second, smaller disagreement, in `presets.js` this time:

> The loader check asserts the class is still `''` precisely so this exclusion
> retires itself the moment that stops being true.

**No such check exists.** Nothing in `test/` reads `BACKGROUND_CLASS`,
`backgroundClass` or `OFFERED_BACKGROUNDS`. `assertComplete` at module load
asserts an entry *exists*, never that it is empty. The self-retiring mechanism
the comment promises is absent — see §9, where this round adds it.

---

## 5. `OFFERED_BACKGROUNDS` (item E)

| claim | verdict |
|---|---|
| `BACKGROUND_CLASS.image` is still `''` behind the TODO | **Confirmed** — and `render(background:'image')` is byte-identical to `render(background:'default')` |
| `image` is excluded from what the panel offers | **Confirmed** — `OFFERED_BACKGROUNDS` = `['default','white','light','soft_gray','dark','brand_gradient']` |
| any *other* offered value similarly inert? | **No.** All five non-default values render differently from `default`. `default` is `''` legitimately — it inherits the theme surface |

The exclusion is doing its job. What is missing is the tripwire that retires it
(§4). `image` remains reachable by a directly-seeded Mongo document, where it
renders as `default` — fail-soft, and out of an author's reach.

---

## 6. Responsive type (item F)

No `fontSize` extension exists in `tailwind.config.js`, so every size below is
Tailwind's stock scale: `sm` 14 · `base` 16 · `lg` 18 · `xl` 20 · `2xl` 24 ·
`3xl` 30 · `4xl` 36 px. The only breakpoint any of them uses is `md` = **768px**.

| type | element | < 768px | ≥ 768px | scales? |
|---|---|---:|---:|---|
| heading | h1 | 30 | 36 | yes |
| heading | h2 | 24 | 30 | yes |
| heading | h3 | 20 | 24 | yes |
| heading | h4 | 18 | 20 | yes |
| heading | h5 | 16 | 18 | yes |
| heading | h6 | 14 | 16 | yes |
| cta | heading | 24 | 30 | yes |
| course_selector | heading | 24 | 30 | yes |
| stat_card | value | 30 | 36 | yes |
| price_card | price | 30 | 30 | **no** |
| price_card | title | 18 | 18 | **no** |
| icon_card | title | 18 | 18 | **no** |
| timeline | title | 18 | 18 | **no** |
| instructor_card | name | 18 | 18 | **no** |
| accordion | title | 16 (inherited) | 16 | **no** |
| notice | text | 16 (inherited) | 16 | **no** |
| tabs | tab label | 14 | 14 | **no** |
| course_card | course name | 16 | 16 | **no** |
| rich_text | `prose prose-lg` | — | — | **no** — one class, em-based internally, no viewport variant |

**Answer to the direct question.** A desktop heading shrinks on mobile for the
four types that carry an `md:` variant, and for those it shrinks by **exactly
one step of the Tailwind scale — 17–20%** — at **one** breakpoint. There is no
fluid scaling and no second step: a 30px h1 is 30px on a 1024px tablet in
portrait and 30px on a 320px phone alike. Nine heading-scale elements do not
shrink at all.

The sharpest inconsistency: `stat_card`'s value is `text-3xl md:text-4xl`, and
`price_card`'s price — the same visual weight, the same 30px, on a sibling card
type — is `text-3xl` with no variant. One scales, the other does not, and
nothing distinguishes them.

---

## 7. The device-preview toggle (item G)

**Half one — a max-width clamp, not real breakpoints: CONFIRMED.**
`CanvasPanel.jsx`: `const VIEWPORT_MAXW = { desktop: null, tablet: 768, mobile: 390 }`.
It sets an outer container's `max-width` around the same single real render —
not an iframe, not a re-render.

**Half two — `@tailwindcss/container-queries` installed but unused: HALF
confirmed, and the correction matters.** It is installed
(`package.json` `^0.1.1`) and registered in `tailwind.config.js` `plugins`. It is
**not** unused repo-wide: `CoursePromoSection.jsx` uses `@container` and
`@[376px]:` today. It is unused by the **entire Page Builder** — renderer,
presets, canvas. So the plugin is already proven working in this codebase, which
is a materially better starting position than "installed but never exercised".

### Consequence, plainly

**No — the editor's "มือถือ" button does not show viewport-driven responsive
behaviour, and every responsive behaviour in the Page Builder is viewport-driven.**

Every responsive class in the system compiles to a viewport media query, which
asks the browser window and not the clamped box:

| where | classes |
|---|---|
| `presets.js` `COLUMNS_CLASS` | `sm:grid-cols-2`, `lg:grid-cols-3`, `lg:grid-cols-4` |
| `presets.js` `RATIO_CLASS` | `lg:grid-cols-*` — every ratio |
| `presets.js` `VISIBILITY_CLASS` | `hidden md:block`, `block md:hidden` |
| `presets.js` `MOBILE_BEHAVIOR_CLASS` | `max-md:*` |
| `heading` / `cta` / `stat_card` / `course_selector` | `md:text-*` (§6) |

So on a 1440px screen with the canvas clamped to 390px: a 3-column grid still
draws three columns, a `50-50` two_column still splits, headings stay at their
desktop size, and — the inversion — a `mobile_only` section **disappears** while
a `desktop_only` one **shows**. Exactly backwards.

`CanvasToolbar` already says this out loud in Thai whenever a clamp is on, and
`previewViewportCaveat.js` records the measurement. Nothing here is hidden; the
gap is real and honestly labelled.

**What a later round needs to know before it starts: responsive work cannot be
verified inside the editor today.** The only honest check is the ดูตัวอย่าง
(Preview) link, which is a real navigation at a real viewport. Any round that
takes on responsive typography or layout must either accept an out-of-editor
verification loop, or land the container-query/iframe canvas first. Given
`CoursePromoSection` already ships `@container`, the container-query route has a
working precedent — but note it would require rewriting `presets.js`'s five
class maps from `sm:`/`md:`/`lg:` to `@`-variants, which changes the **published**
page, not only the canvas.

**Round 19 costed the iframe route** — see [docs/canvas-iframe-cost.md](./canvas-iframe-cost.md).
Headline, because it inverts the obvious estimate: selection and hover cost ZERO
(React attaches its delegated listeners to a portal container, measured in
Chrome), and the hard part is keeping the frame sized to its content.

---

## 8. Findings, ordered by how likely an author is to hit them

**1. `ความกว้าง` (containerWidth) does nothing on `course_card` and
`instructor_card`.** *2 cells, IGNORED.* Both components clamp themselves to
`max-w-sm`; measured content width is **384px at every one of the four
settings**. The control is offered on every type, sits in the first envelope
group, and these are two of the most-used types. The author picks "เต็มความกว้าง",
sees no change, and has no way to learn why. This is the panel's own stated
failure mode, in the panel's own universal half.
*Options for a fix: drop the self-clamp and let the envelope decide; or make the
control type-aware the way `SECTION_STYLE_CAPS` already makes the style props.*

**2. `สีเน้น` (accentColor) does nothing on 14 of 27 types.** *14 cells,
IGNORED.* Nine components paint with it — eight name `--pb-accent-*` in their
own classes, and `cta` reaches it through `accentButtonClass` without naming it
— and four containers forward it to children. The remaining 14, including
`heading`, `image`, `notice` and all six data-backed types, set a CSS variable
nothing under them reads. The control is prominent, universally offered, and the
most inviting thing in the รูปแบบ tab. Its hint ("มีผลกับ section นี้และ section
ที่ซ้อนอยู่ข้างใน") is true only for the 13 that read or forward it.

*Counting note, because it bit this audit.* A first pass put the direct-consumer
set at nine by grepping raw files. `cta.jsx` was in it because its **docstring**
says "via `--pb-accent-*` set by the renderer"; its code does not. The
comment-stripped count is eight direct plus one indirect. Same total, different
mechanism — and a scan that reads prose would also have counted `heading.jsx`,
whose docstring says the accent is *not* applied, silently shrinking the finding
by one. The tripwire in §9 counts the two routes separately for this reason.

**3. `ความกว้าง` is partially inert on `container`.** *1 cell, PARTIAL.*
Measured: 640, 768, 768, 768. `small` works; `medium`, `large` and `full` are
indistinguishable, because `ContainerSection`'s own `max-w-3xl` wins. Same
mechanism as finding 1, one step less severe — three of four values are dead
rather than four of four.

**4. `Custom CSS` is silently inert without a valid `Section ID`.** *27 cells,
PARTIAL.* Both `advanced.customCss` and the whole `custom_css` type. Mitigated:
the panel warns at the field in both places, and the renderer logs in dev. Listed
here because it is the most *frequently encountered* conditional in the panel,
not because it is unlabelled.

**5. The editor canvas cannot show responsive behaviour, and inverts
`visibility`.** *Not a matrix cell — see §7.* A `mobile_only` section vanishes in
"มือถือ" and a `desktop_only` one appears. Already labelled by
`CanvasToolbar`, so an author is warned; still the single biggest limit on what
can be checked without leaving the editor.

**6. `accordion` does not take the section accent; `tabs` does.** *1 cell,
IGNORED (inside finding 2).* Two sibling item-based types built in the same
round, with the same shape, differing for no stated reason. Called out
separately from finding 2 because it is the cheapest of the 14 to close and the
hardest to defend.

**7. `price_card`'s price does not scale with viewport; `stat_card`'s value
does.** *§6.* `text-3xl` vs `text-3xl md:text-4xl` — same weight, same size, same
card family. Whichever is right, they should agree.

**8. `presets.js` claims a "loader check" that does not exist.** *§4.* The
`image`-background exclusion has no tripwire, so it will not retire itself when
the background-image source field lands — it will just quietly keep filtering a
value that has become real. Closed by this round (§9).

**9. `image.publicId` is in the schema, read by nothing, offered as nothing.**
*Not a matrix cell.* `ImageSection` reads only `src`; the media picker writes
both. Harmless today — no control exposes it — but it is a stored field with no
reader, which is finding 1's shape one layer down.

---

## 9. Tests added

Three assertions, in `test/pure/sectionControlAudit.test.mjs`. All three are
about **measured current state**, not about what the code should do, and each
names what to do when it goes red.

They are **self-retiring**: each one fails on the day its finding is fixed, and
the correct response is to **delete it along with the finding's row above**, not
to update it to match. That is stated in the file.

1. **`BACKGROUND_CLASS.image` is still `''`** — the check `presets.js` says
   exists and does not (finding 8). Goes red when someone implements the class,
   naming `OFFERED_BACKGROUNDS`'s filter as the thing to delete.
2. **The accent-consumer set is exactly these 9 components** (finding 2). Goes
   red the day a 10th reads `--pb-accent-*`, which is what a partial fix looks
   like.
3. **`course_card` and `instructor_card` still clamp themselves to `max-w-sm`**
   (finding 1). Goes red when the clamp is removed.

Each carries a control proving it discriminates. Nothing else was added: the
rest of this audit is a measurement of a moving surface, and a test asserting
that 14 types ignore the accent would have to be rewritten by every round that
fixes one — which is a test that obstructs the fix rather than recording the gap.
