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

---

## 10. Round 22 — the panel's promises, and what did NOT reclassify

**Appended, not merged.** Everything above is round 18's measurement at `32f2aa7`
and stays as written; this section records what changed after it and why.
Measured at `51eb44d`.

Round 22 is step 1 of the sequence in
[docs/control-fix-proposal.md](./control-fix-proposal.md) §6: the copy fixes,
editor-side only. It changed what two fields in `SettingsPanel.jsx` **claim**.
It changed no renderer, no preset, and no schema.

### The matrix is unchanged. That is the finding, not an omission

| | cells | round 22 |
|---|---:|---|
| **READ** | 278 | unchanged |
| **ABSENT** | 125 | unchanged |
| **PARTIAL** | 35 | unchanged |
| **IGNORED** | 16 | **unchanged** |

`IGNORED` is defined in §1 as *offered, and no reader*. Both controls are still
offered on every type they were offered on, and no component started reading
either value. Copy does not move a cell — an honest label on an inert control is
still an inert control, and recording it as anything else would make this
document report a fix that has not happened.

### The reclassification that was considered and rejected

Finding 1's two cells — `settings.containerWidth` on `course_card` and
`instructor_card` — were the candidates. Withdrawing the control for those two
types would have turned two `IGNORED` cells into two defensible `ABSENT` ones,
which is a real change to this document's findings. **It was not taken.** Three
reasons, in the order they weighed:

1. **It breaks the envelope's organizing idea.** `containerWidth` sits in the
   universal half of the panel — the half whose comment says the effect applies
   to every section. A per-type withdrawal makes "universal" mean "universal
   except twice", and the exception lives in a hand-written list in a client
   component with nothing able to check it.
2. **It strands stored values.** A withdrawn control cannot show or reset a
   value already on a section. Re-measured this round rather than trusted from
   round 21: `scripts/audit-control-fix-blast-radius.mjs`, run read-only against
   the configured database, reports **0** sections carrying a non-default
   `containerWidth` on either type — 0 live, 0 on published/scheduled pages, 0
   in drafts, 0 in `page_versions`. Neither type appears in the corpus at all.
   That zero is a fact about one database at one moment (§5 of the proposal says
   so), and a withdrawal would have to be right for every future page too.
3. **It goes stale silently, in the worst direction.** Finding 1's own suggested
   fix is to drop the self-clamp. The day that lands, a withdrawal would keep
   hiding a control that had started working — no author-visible symptom, and
   nothing that reddens. A stale *hint* only reads wrong.

So the two cells stay `IGNORED`, and the field now says why to the author.

### What DID change: the promise half of findings 1 and 2

Both findings have a behaviour half and a promise half. Round 22 closes the
promise half of both, and neither behaviour half.

- **Finding 2.** The hint claimed a universal effect — true for the 13 types
  that paint with the accent or forward it, false for the other 14. It now
  names the three roles the accent actually has (ornament; one key figure or
  link; the button surface) and says a type without such a surface shows
  nothing. The proposal's §1 amendment stands: **eleven** of those fourteen are
  correct restraint, and the open behaviour gap is **three** types — `accordion`,
  `instructor_card`, `course_schedule` — not fourteen. Finding 2's row above
  still reads "14 of 27" because that is what round 18 measured; the amendment
  is here rather than in that row.
- **Finding 1.** `ความกว้าง` now carries a per-type hint on the two card types
  saying the card width is fixed. The control is untouched.

### Why the accent hint is not per-type, which is itself a finding

A per-type accent hint would be more accurate. **There is no single source it
could be derived from**, and that is worth recording rather than working around:

`SECTION_STYLE_CAPS` (presets.js) is this codebase's one capability registry —
the declaration that makes "a component reads this prop" and "the panel offers a
control for it" the same act. `accentColor` **is not in it**, and structurally
cannot be without a change to `presets.js`: the accent is not a prop a component
opts into, it is three CSS variables `SectionRenderer` sets on every section
wrapper. Which components then paint with them is decided inside their class
literals, and the only reader-set that exists is the **source-text scan** in
`test/pure/sectionControlAudit.test.mjs` — which runs in the test tier and
cannot run in a browser.

A per-type hint therefore means a hand-written 27-entry map inside
`SettingsPanel.jsx`, tracking class strings across 27 files, with nothing able
to notice it going stale. That is exactly the drift round 18 found in that
file's own comment, which is why the hint is one static string that is true in
general. Making a single source exist is a `presets.js` change and belongs to a
round that is allowed to make one.

The `ความกว้าง` hint **is** per-type, and the asymmetry is deliberate: what it
tracks — a `max-w-sm` self-clamp — is readable off the components, is already
pinned by finding 1's tripwire, and `test/render/settingsPanelTabs.test.mjs`
asserts the panel's two-type list and that scan name the same two types. A clamp
added or dropped reddens both.

### Tripwire status: none fired

All four assertions in §9 (plus round 21's finding-3 addition) were re-run and
are green, which is correct — each pins a renderer or preset fact, and round 22
changed neither. Specifically: finding 8's `BACKGROUND_CLASS.image`, finding 2's
nine-component consumer set, finding 1's two `max-w-sm` clamps and finding 3's
`max-w-3xl` are all untouched. None of them asserts anything about panel copy,
so none needed reconciling.

Confirmed by deliberate break rather than by inspection: removing `max-w-sm`
from `course_card.jsx` reddens finding 1's tripwire **and** the new cross-source
check, together, and reverting by file copy returns both to green.

### Tests added

Eight, in `test/render/settingsPanelTabs.test.mjs` — the file that already owns
round 15's union check, because these are assertions about the same rendered tab
bodies. Round 15's `EXPECTED` union was **not** extended and needed no change:
it is built from field LABELS (`label > span:first-child`), and a hint is a
second span. That is asserted, not assumed.

Unlike §9's tripwires these are **not** self-retiring. They pin copy this round
chose, so a later round that changes the copy updates them in the same commit —
which is the ordinary relationship between a test and the thing it tests, and
the reason they live here rather than beside the tripwires.

---

## 11. Round 23 — `course_schedule` takes the accent (finding 2, partial)

**Appended, not merged**, same as §10. §8's finding 2 stays as round 18 measured
it. Measured at `77221ea`.

Step 2 of [docs/control-fix-proposal.md](./control-fix-proposal.md) §6, and the
first change to a file the **published page renders** since round 5.

### The change, and why this one went first

`course_schedule`'s calendar icon named the default accent's own colour token
directly. That is the quietest form of the defect this whole audit is about: the
icon *looked* accented, so an author who picked a different accent had no
symptom to notice — it simply stayed the colour it had always been.

One class token, swapped for `--pb-accent-fill`. The role is **ornament**,
following `checklist`'s tick, `timeline`'s dot and `icon_card`'s / `stat_card`'s
icons; no fourth role was invented and `SECTION_STYLE_CAPS` was not touched.

### Finding 2, updated

| | round 18 | round 21 | round 23 |
|---|---:|---:|---:|
| direct consumers (name the variable) | 8 | 8 | **9** |
| indirect (`accentButtonClass`) | 2 | 2 | 2 |
| union that paints | 9 | 9 | **10** |
| types with a surface and no accent | — | 3 | **2** |

The remaining two are `accordion` and `instructor_card` — steps 3 and 4. The
eleven types with no accent surface are unchanged and remain correct restraint,
not defects (§10).

### What did NOT change, and the rule each one is

Both of round 21's negative rules held, and both are now asserted rather than
described:

- **Body copy is never accented.** The row's date range (primary text) and its
  type label (secondary text) keep their surface tokens.
- **Semantic colour is never overridden.** `resolveScheduleBadge` encodes
  open / nearly-full. Accenting it would make the badge lie about how full a
  round is.

One deliberate non-change that is a judgement rather than a rule: the row's
**hover tint** is a pale value off the signature scale, not the default accent's
token, so the defect above does not describe it — and no existing consumer
accents a hover *state* (`icon_card`'s tinted chip is a resting background). It
stays, for a round that argues for it on its own merits.

### The byte-zero prediction, stated precisely

Round 21 predicted this step would be inert at the default accent. It is — but
the claim needs its unit named, because two different things could be meant:

| what | before → after, at the default accent |
|---|---|
| **painted colour** | `rgb(0, 92, 255)` → `rgb(0, 92, 255)` — **identical** |
| rendered markup | differs in **exactly 2 whitespace-separated tokens** — the same class token, once per rendered row, and nothing else |

The markup difference is not a surprise, it is the change: the class attribute
is the thing being edited, so a markup diff can only ever report "not
identical". The proposal's §7 framed the prediction as colour ("`text-9e-action`
and the default accent resolve to the same colour"), and that is what held.

**So the browser measurement was necessary here, not optional** — contrary to
the expectation that a colour-only change would not need it. It is the only
instrument that can evaluate the prediction at all: the utility resolves to a
hex compiled into the stylesheet, the variable resolves through
`--pb-accent-fill` → `ACCENT_VARS` → a `:root` custom property in `globals.css`,
and JSDOM resolves none of that. What was *not* run is a **layout** measurement:
nothing changed size or position, and the painted box was never in question.

### Measured, in real Chrome

`scripts/_probe-schedule-accent.mjs` — real `SectionRenderer`, real compiled
Tailwind, the real `:root` block, the real theme wrapper, `getComputedStyle` on
the real element. Seven cases: no author choice, plus all six accents.

| | icon colours | primary text | badges |
|---|---:|---:|---:|
| before | **1 distinct** | 1 | 1 |
| after | **6 distinct** | 1 | 1 |

Before, the icon painted `rgb(0, 92, 255)` at every one of the seven — which is
finding 2 for this type, measured rather than inferred. After, only `(default)`
and `brand_blue` are unchanged, and those are the same accent named two ways.

### Blast radius, re-measured rather than trusted

`scripts/audit-control-fix-blast-radius.mjs` plus a targeted read-only walk:
**0** — and `course_schedule` does not appear in the corpus at all. 0 live, 0
draft, 0 in `page_versions`, out of 34 sections across 3 documents.

**The caveat still applies, unchanged.** That is one database at one moment
(`9exp_genesis`), small enough that it may be development or staging rather than
production. Re-run before this reaches a production deploy; the script takes its
URI from the environment.

### Tripwires: one fired, and it was reconciled per its own instructions

**Finding 2's tripwire went red, naming `course_schedule`** — a ninth direct
consumer where it expected eight. That is the tripwire working. Its message
directs, for an ADDED type: update finding 2 here, and delete the test *once the
offered set and the reader set agree*. They do not yet — two types remain — so
the expected set was extended by one and the test kept, with the reconciliation
written into it. Findings 1, 3 and 8 were untouched and stayed green.

**One pin did NOT fire, and that is the more useful result.** Round 22 asserted
that `SettingsPanel.jsx`'s comment names `accordion, instructor_card and
course_schedule` as an open accent gap. That sentence became false in this
commit and the assertion stayed **green**, because a `match` checks the prose is
PRESENT and cannot see its subject change underneath it. The renderer-side
tripwire is what caught it. The comment was corrected to name two types, and the
assertion now cross-checks the named list against the measured consumer set — so
the sentence can no longer drift on its own.

### An accidental safeguard, found by a control that failed to break anything

The first attempt to accent the status badge — to prove the second negative rule
was actually being tested — produced **no change in the markup at all**. `cn`
is tailwind-merge: `status.soft` also sets a text colour, later in the argument
list, so the injected accent was silently dropped. The break only bit once it
was placed after `status.soft` and allowed to win the merge.

Worth recording because it cuts both ways: the badge is incidentally hard to
override by accident, and a control that "passes" after a break must be diffed
before it is believed.

### Tests added

Four, in `test/render/derived.test.mjs`, beside the existing `course_schedule`
coverage. They pin the **wiring** — which mechanism the element reads — because
the accent travels by CSS variable and the class string is constant across all
six values, so no render test can see the colour. The colour claim lives in the
probe above.

Verified red by three deliberate breaks, all reverted by file copy: the
hardcoded token restored (caught in three files at once — the wiring test by
name, finding 2's tripwire, and round 22's new cross-source assertion), the
semantic badge accented, and the row's primary text accented.

---

## 12. Round 24 — the last two accents, and finding 2 closes

**Appended, not merged.** §8's finding 2 stays as round 18 measured it.
Measured at `0f7a6e7`.

Step 3 of [docs/control-fix-proposal.md](./control-fix-proposal.md) §6, and the
first renderer change with a **visible diff at the default accent**. Still
colour-only: nothing moves, resizes or reflows, measured rather than assumed.

### What changed, per type

| type | element | role | precedent |
|---|---|---|---|
| `accordion` | the OPEN item's chevron | `--pb-accent-fill` | `tabs`, the active tab's underline |
| `accordion` | the OPEN item's title | `--pb-accent-text` | `tabs`, the active tab's label |
| `instructor_card` | the specialty chips' label | `--pb-accent-fill` | `icon_card`'s chip mark |

`tabs` was read off the code rather than off round 21's note, and the note was
right: its active branch is one ternary setting **both** an underline in `fill`
and a label in `text`. Mapped onto the accordion, the rotating chevron is the
underline (the mark that says which item is active) and the item title is the
label. Same split, no fourth role, and `SECTION_STYLE_CAPS` untouched.

**The accented title is not a breach of the body-copy rule.** The accented run
is a button's own label in its active state — the category the text role already
admits alongside a price, a stat value and a link. The prose beside it does not
move: the item **body** keeps its muted colour, and a **closed** item's title
keeps the ordinary heading colour, exactly as an inactive tab does.

### What deliberately did NOT change

**Rules** (either would be a defect):

| type | element | rule |
|---|---|---|
| `accordion` | item body | body copy is never accented |
| `accordion` | closed items' titles and chevrons | not the active member — `tabs` does the same |
| `instructor_card` | the name | headings are never accented |
| `instructor_card` | the role and bio | body copy is never accented |

**Judgements**, flagged in-code as candidates rather than settled here: both
components' own borders and dividers stay neutral. `highlight_grid` shows the
pattern *permits* an accented border, but that is a decorative left-hand rule on
a cell, not a component's structural outline — which no consumer accents.

Also untouched: `instructor_card`'s fixed card width. Separate finding, its own
tripwire, and nothing about a colour belongs in that argument.

### The finding this round did not expect to make

**`icon_card`'s tinted chip background has never rendered.** The precedent this
round was told to copy verbatim asks for a tenth-strength accent background;
Tailwind **cannot apply an opacity modifier to an arbitrary colour that is a
bare custom property** — there are no channels to multiply — so it emits no rule
at all. That chip has been fully transparent since it shipped, while its own
docstring describes the icon as sitting "inside a tinted chip".

Confirmed three ways: the class is absent from the compiled stylesheet; it is
still absent when forced into the scan as a raw literal (so it is the modifier,
not the scan); and the painted background measures `rgba(0, 0, 0, 0)` in Chrome
at every accent. A control in the same compile shows `bg-9e-action/10` — the
same modifier on a theme-scale colour — emitting a real rule.

**So the verbatim copy was not made.** It would have replaced a background these
chips really have with nothing — a visible regression produced by faithfully
following a precedent that does nothing. `instructor_card` takes the accent on
the chip **label** and keeps its neutral surface, and both halves of that
decision are pinned by tests, from the precedent's side and its own.

This is exactly the defect class `test/fs/tailwindArbitraryValueRules` exists
for, sitting unregistered because that file's list is named rather than a sweep.
It now carries a self-retiring tripwire for it, and the three classes this round
added are registered as cases.

### Finding 2 is CLOSED — and its tripwire's deletion condition is not

| | round 18 | 21 | 23 | 24 |
|---|---:|---:|---:|---:|
| direct consumers | 8 | 8 | 9 | **11** |
| indirect (`accentButtonClass`) | 2 | 2 | 2 | 2 |
| union that paints | 9 | 9 | 10 | **12** |
| types with a surface and no accent | — | 3 | 2 | **0** |

The behaviour gap finding 2 described is closed. **Its tripwire is not deleted,
and the reason is a flaw in how the condition was worded.**

It says to delete "once the offered set and the reader set agree". The offered
set is all 27 types — สีเน้น is in the universal envelope and always has been.
The reader set is 16 (12 painting + 4 containers forwarding). The remaining
eleven are not a backlog: they are the types with no accent surface at all,
which §10 recorded as correct restraint. **The condition describes a state the
design will never reach**, because it was written when "14 of 27 ignore it" still
looked like one uniform gap.

So the tripwire changes character instead of retiring: from *watch this set grow
toward agreement* to *this set is closed — nothing joins or leaves without a
decision*. A twelfth direct consumer is now a claim that a type has an accent
surface after all, which is an argument that should not be settled silently. Its
complement — the eleven, plus the four forwarding containers — is asserted as an
exact set for the first time, so the "no accent surface" half stops being prose.

### Tripwires: two fired, both as designed

- **Finding 2's** went red naming `accordion` and `instructor_card`. Reconciled
  as above.
- **Round 22's comment clause fired — and that is round 23's repair working.**
  It was a bare presence check that sat green through the commit that made its
  sentence false; round 23 re-pointed it at the measured consumer set. This
  round is the proof: it reddened on the commit that closed the last two,
  instead of drifting silently a third time. The claim is now stated in the
  direction that survives — every type either paints or is one the audit records
  as having no accent surface, with no third category.
- Findings 1, 3 and 8 stayed green. `instructor_card`'s own `max-w-sm` tripwire
  in particular: the clamp was not touched.

### Measured — colours, and what an author sees

`scripts/_probe-accordion-instructor-accent.mjs`. The accordion is **mounted in
JSDOM and really clicked open** — its state is `useState(null)`, so a static
render only ever shows the branch this round does not change — and that live
markup is handed to Chrome for the cascade and layout.

At the default accent, before → after:

| element | before | after |
|---|---|---|
| open item's title | `rgb(13, 27, 42)` navy | `rgb(0, 92, 255)` action blue |
| open item's chevron | `rgb(94, 106, 126)` grey | `rgb(0, 92, 255)` action blue |
| chip label | `rgb(13, 27, 42)` navy | `rgb(0, 92, 255)` action blue |
| everything else | — | unchanged, chip background included |

Across three accents (default / green / orange) the three changed elements give
**3 distinct colours each**; every unchanged element gives **1**.

**In words, what is different on an existing published page tomorrow:** an
opened accordion item's heading text and its ▾ marker turn from dark navy and
grey to the page's accent blue, and an instructor card's specialty chip labels
turn from navy to the same blue on the same pale background. Nothing else, and
only while an item is open — a closed accordion is byte-identical.

### Nothing reflowed

**30 boxes compared** (10 elements × 3 accent cases), before against after:
**0 moved or resized.** Position and size are identical for the changed elements
and for their neighbours — the accordion body, the closed rows, the card, the
name and the role line.

### Public path, and blast radius

`66/68` identical to HEAD, two changed files named: `accordion.jsx` and
`instructor_card.jsx` — exactly the two intended.

Blast radius re-measured read-only: **0 `accordion` and 0 `instructor_card`
sections** exist anywhere — 0 live, 0 draft, 0 in `page_versions`, out of 38
sections. **The same caveat applies**: one database (`9exp_genesis`) at one
moment, small enough that it may be development or staging. Re-run before this
reaches a production deploy.

### Tests added

Ten in `test/render/itemAccents.test.mjs`, plus three compile cases and a
self-retiring tripwire in `test/fs/tailwindArbitraryValueRules.test.mjs`.

**What that render file cannot see is stated in it**, because a green there
means less than it looks: the accordion's open branch does not exist in a static
render, and mounting a React root is forbidden in that tier — the runner is
`isolation:'none'` and a root's globals leak into every other render test, which
cost 28 unrelated failures once. So the closed branch is rendered, the open
branch is a source claim, the colour is the probe's, and whether the class
compiles at all is the Tailwind guard's.

Verified red by five deliberate breaks, all reverted by file copy: the chevron
hardcode restored, the accordion reverted wholesale, the chip hardcode restored,
the instructor bio accented, and the accordion body accented. The first three
were each caught in two or three files at once, by name.

---

## 13. Round 25 — finding 3 closes, and the sequence ends

**Appended, not merged.** §8's finding 3 row stays as round 18 measured it —
the same convention rounds 22-24 used. Measured at `d365e92`.

Step 4 of [docs/control-fix-proposal.md](./control-fix-proposal.md) §6, the last
of the sequence, and the only one that changes **layout** rather than colour.

### The change

`container.jsx` hardcoded a max-width. That is a second authority over what
`settings.containerWidth` already owns, and it won. The component could not
defer to the setting either — `SectionRenderer` passes components `content`,
`style`, `layout`, `domId`, `inEditor` and `data`, never `settings`.

So the narrowness moved to the schema, where it is a **starting point an author
can overrule** rather than a ceiling they cannot raise:

- `src/lib/schemas/sections/base.js` — a `settingsWithContainerWidth(width)`
  helper, and an optional `settings` override on `defineSection`.
- `src/lib/schemas/sections/layout.js` — `container` declares `small`.
- `src/components/pageBuilder/sections/container.jsx` — the clamp removed.

**Three files, where the round expected two.** The schema half is split because
`base.js` owns `settingsSchema` and `defineSection` while `layout.js` owns the
container's definition; putting the helper in `layout.js` would have moved
envelope assembly out of the file that owns it.

**One default, not two.** `.extend()` overwrites a key rather than merging it,
so the `container` union member carries exactly one default for
`containerWidth` and the base's `large` is not present in it at all. There is no
precedence rule to remember and nothing that could start resolving differently
after a zod upgrade — which matters, because "two defaults for one field" is the
same shape this round exists to remove.

`presets.js` is untouched. Round 21 measured its width map correct and it is:
the four values map to four distinct max-widths, and always did. The clamp is
what collapsed them.

### E — the control now works

Measured in Chrome at a 1440px viewport, `scripts/_probe-container-reflow.mjs`:

| `containerWidth` | before | after |
|---|---:|---:|
| `small` | 640 | **640** |
| `medium` | 768 | **864** |
| `large` | 768 | **1168** |
| `full` | 768 | **1408** |

Two distinct widths before, **four after** — and the same four that `heading`
and `notice` give, which are types that never had a clamp. Confirmed
independently by `scripts/_probe-container-width.mjs`, the probe finding 3's
tripwire named.

### B — the type distinction survived the move

| at its DEFAULT | before | after |
|---|---:|---:|
| `container` | 768 | **640** |
| `full_width` | 1168 | **1168** |

Distinguishable in both, but by a different mechanism: before, by a ceiling the
author could not raise; now, by a starting point they can. A **newly created
container is 128px narrower** than one created before this round — the visible
consequence of the move, and deliberate.

Asserted as a measurement, not a class check, on purpose: with the clamp gone
the two components differ only by a centring utility that has no visual effect
of its own, so comparing class strings would report a difference that is not
there.

### F — the reflow measurement, which is why this step went last

A container holds nested sections, so widening it reflows everything inside. All
four widths, five tree shapes, 22 cases:

| shape | small | medium | large | full |
|---|---:|---:|---:|---:|
| bare container | 640 | 864 | 1168 | 1408 |
| container + heading + rich_text | 640 | 864 | 1168 | 1408 |
| **container inside container** | 640 | 864 | 1168 | 1408 |
| card_grid inside container | 640 | 864 | 1168 | 1408 |
| two_column inside container | 640 | 864 | 1168 | 1408 |

**Overflow: none.** Nothing paints wider than the box that contains it, at any
width, in any shape — measured as `scrollWidth` against `clientWidth` rather
than inferred.

**The column-count hypothesis did not hold, and the data is the answer.** The
brief expected a wider container might change how many columns fit, because
`card_grid` and `two_column` resolve columns from breakpoints. Measured, the
counts are **stable**: `card_grid` stays 3 and `two_column` stays 2 at every
width. The breakpoints key off the **viewport**, which is constant here — so
container width changes cell *size*, not cell *count*:

| | small | medium | large | full |
|---|---:|---:|---:|---:|
| card_grid cells (3 across) | 187 | 261 | 363 | 373 |
| two_column cells (2 across) | 288 | 400 | 552 | 568 |

A 187px card cell at `small` is narrow, but that is pre-existing — `small` was
the one width that already worked.

### C — what happens to documents that already exist

Answered from the stored shape, not from reasoning about zod defaults.

**Every one of the 38 stored sections carries an explicit
`settings.containerWidth`.** None is sparse: 34 `large`, 3 `medium`, 1 `small`.
That is because `newSection` mints by parsing a bare `{type, id}` through the
real union, so defaults are materialised at creation and persisted — and
`StructurePanel` is the only caller, with nothing anywhere hardcoding a width.

So:

| a stored `container` with | before | after | changed? |
|---|---:|---:|---|
| `large` (what a new one used to get) | 768 | **1168** | **yes — widens** |
| `medium` | 768 | **864** | **yes — widens** |
| `small` | 640 | 640 | no |
| no `containerWidth` key at all | 768 | 640 | would take the new default — but no such document exists |

**The per-type default governs NEW containers only.** An existing one keeps what
was persisted, and what changes for it is the clamp going away. That is the
migration risk in one sentence, and it is why the count below matters.

### H — blast radius

**Zero.** Not one `container` section exists anywhere: 0 live, 0 draft, 0 in
`page_versions`, out of 38 sections across 3 documents. `full_width` is also 0.

Stated plainly, as the brief asked: **this change moves nothing today.** The
entire risk is about what authors do next.

**The caveat is unchanged.** One database (`9exp_genesis`) at one moment, small
enough that it may be development or staging rather than production. Re-run
before this reaches a production deploy.

### Finding 3's tripwire fired, and its deletion condition WAS met

It went red on the commit that removed the clamp — exactly as designed. Its own
message set the condition: *"if the clamp is GONE, re-run
scripts/_probe-container-width.mjs and confirm the four settings now give four
distinct widths, then delete this test"*. Both halves were done, and the test is
**deleted rather than updated**.

**This is the contrast with finding 2.** Round 24 could not retire finding 2's
tripwire because its condition — "once the offered set and the reader set agree"
— described a state the design will never reach. Finding 3's condition was a
fact about one line in one file: reachable, and reached. A self-retiring test is
only self-retiring if its condition is something that can actually happen.

**One collateral red, and it was correct.** The finding-1 control asserted that
`container` *did* carry a width clamp, using it to show the `max-w-sm` scan was
specific enough to tell the two findings apart. That assertion was pinned to a
defect that no longer exists. It now takes its discrimination from a type that
is genuinely clamped for a reason nobody is fixing.

`presets.js`'s width map was not touched, and was not found wanting.

### Tests

Eight in `test/pure/containerWidthDefault.test.mjs`, each with a control:
the per-type default and the base default for the other 26 types; that the
override *replaces* rather than layers; that the two types stay distinguishable;
that four settings map to four classes; and that a stored width survives the
parse untouched.

**What that file cannot see is named in it.** It is pure — schema parsing and
one preset lookup — so it proves which *value* each type starts at, never a
painted pixel. A class-string check would have passed on the broken version too,
which is exactly why the painted widths live in the probe.

Verified red by three deliberate breaks, all reverted by file copy: the
container's default swapped to `large` (5 tests red), `defineSection` ignoring
the override (5 red), and the clamp reinstated — which reddened the reconciled
control *and*, measured, collapsed the widths straight back to
640 / 768 / 768 / 768.

### The sequence is finished

All four steps of the round-21 proposal have shipped: the copy fixes (22),
`course_schedule`'s icon (23), `accordion` and `instructor_card` (24), and the
container's width (25). Of the round-18 findings, 1 remains open by design
(the two card types clamp on purpose, and the panel now says so), 2 and 3 are
closed, and 8 still stands with its tripwire.
