# The two editor panels — what the Figma actually specifies, and what to build

Round 29. Survey and proposal. **Nothing was built.**

Source of record: Figma `ps9X5bTNFCDnjthgCxtpq0`, frames `20:2` (CMS Page
Builder, 1920 × 945) and `20:1035` (Setting Dialog, 920 × 680). Both were read
in full through `get_metadata` and `get_design_context` — the structure panel is
`20:93`, the section-settings panel is `20:731`. Every number below is off those
nodes; every fit number is off a real browser
(`scripts/_probe-round29-panel-fit.mjs`).

---

## 0. The headline, before the detail

Four things matter more than the rest, and two of them are not in the brief.

1. **The structure panel in the design is a permanently DARK navy rail.** Not
   "dark in dark mode" — `bg-gradient-to-b from-[#0a2135] to-[#071c2d]` with
   white text, sitting beside a white settings panel in a light-mode frame.
   Today both panels are `var(--surface)`. This is the single largest visual
   difference left, and it is not a row pattern at all.
2. **The card pattern is a net WIN on space, not a loss — because it collapses.**
   Measured: the design's own six-section page costs **1297px** in today's panel,
   which cannot collapse anything, against **407px** as collapsed design cards.
   The taller card loses 3–6 rows on a page of leaves and wins ~890px on a page
   with containers. §I has both numbers.
3. **The design draws exactly ONE state.** A container, selected, expanded. There
   is no non-container state, no empty state, no multi-slot container, no
   top-level-only selection, and no collapsed-panel state anywhere in the file
   (confirmed: the file has ten top-level frames, only two of them Page Builder).
   Every "what does it do when…" question in the brief is unanswerable from the
   design and has to be decided here.
4. **The design's drag handle replaces the four action buttons round 25 added for
   keyboard access.** The card has three controls — drag, hide, expand. There is
   no up, down, duplicate or delete. §J.

---

## A. The structure panel's row pattern

The brief's description is **confirmed and refined**. Corrections in bold.

### The panel shell — `20:93`, 276 × 881 at x=56

| | |
|---|---|
| surface | `linear-gradient(to bottom, #0a2135, #071c2d)`, `border-r #102c43` |
| header `20:94` | pt 19 / pb 13 / px 18 |
| eyebrow `20:97` | `PAGE STRUCTURE` · 10px bold · tracking 1.3px · `#6f92aa` |
| heading `20:100` | `โครงสร้างหน้า` · 17px bold · lh 23.8 · **white** |
| sub `20:103` | **`6 Sections · ลากเพื่อจัดลำดับ`** · 11px · `#8da3b3` — today's hint is `ลากเพื่อจัดลำดับ` alone; the design prepends a **count** |
| collapse button `20:110` | 28 × 28, icon 18, rotated 180° — **a panel-collapse affordance that does not exist today** |
| hint banner `20:111` | full width, `bg-rgba(255,255,255,.04)`, `border rgba(255,255,255,.07)`, radius 8, px 11 py 10, gap 8, icon 18, copy `เลือก Section แล้วเปิดดู Component ภายในได้ทีละส่วน` at 11px `#b8cad6`. Block is **66px tall including its 12px bottom padding** |
| list `20:117` | px 10, height 632.83, `overflow-clip` |
| add button `20:427` | full width, min-h 42, radius 8, **dashed** `#29bcef` on `rgba(0,173,239,.07)`, icon 18, `เพิ่ม Section` 14px bold `#63d9ff` |
| footer `20:432` | `border-t rgba(255,255,255,.06)`, px 14 py 13, icon 16, `บันทึกอัตโนมัติเมื่อ 2 นาทีที่แล้ว` 10px `#6f8ba0` |

### The section card — `20:119` selected, `20:278` not

A five-column grid, `grid-cols-[19px 30px 119px 25px 20px]`, gap 6, px 8 py 6,
row 40, **min-h 54 — 61 when the second line wraps to two** (`20:307`, `20:394`).
Radius 8. **8px between cards.**

| column | content |
|---|---|
| 1 (19) | **drag handle**, icon 16 — a real button, `Button - ลาก <name>` |
| 2 (30) | icon **tile** 29 × 29, radius 7, `rgba(255,255,255,.12)` selected / `.05` not, glyph 18 |
| 3 (119) | name 12px bold white (`overflow-clip`), then subtitle 9px — `#bceaff` selected / `#7f9bae` not |
| 4 (25) | **hide** (eye), radius 5, icon 17 |
| 5 (20) | **expand/collapse chevron**, radius 5, icon 16, rotated 90° when open |

Selected card: `linear-gradient(168deg, rgb(8,125,187), rgb(5,104,165))`, border
`#17bff5`, `drop-shadow 0 7px 8px rgba(0,0,0,.15)`, **plus an inset 3px left bar
`#61d9ff`**. Unselected: `#112d43` on `border #27445a`.

**The subtitle uses two different vocabularies in one slot**, and one of them is
wrong. `Hero Promotion` reads `Full Width · 6 Components` — `Full Width` is a
`containerWidth` value. The other five read a **type**: `Two Column · 4
Components`, `Course Schedule · 3 Components`, `Card Grid · 2 Components`,
`Accordion · 2 Components`, `Bundle Courses · 1 Components`. See §L.4.

### The expanded children block — `20:149`

Appears **below** the card, inside the same container, as a visually attached
drawer: `bg rgba(3,18,30,.28)`, **`border-l #31546d`**, `rounded-b-8`, pl 27 /
pt 10 / pb 7. Height for six children: **313px**.

- header row `20:151`: h 24, `COMPONENTS` 8px bold tracking .88px `#6f92a9`, and
  a **count badge** `20:155` — `bg #18384f`, text `#9fc3d8` 8px bold, h 17,
  min-w 19, radius 999.
- each child `20:158`: 206 wide, min-h 43, radius 7, transparent border, pl 5 pr
  7 py 5, **2px between rows**, grid `[18px 27px 114px 15px]` gap 6:
  - index number, 8px `#587a91`, **and the leading rule the brief saw: a 1px
    `#31546d` line, 24px wide, absolutely positioned at `left:-28px`**
  - icon tile 27 × 27, radius 6, `rgba(255,255,255,.05)`, glyph 15
  - name 10px bold `#aac0cf`, type label 8px `#6f91a8`
  - chevron 14

So: **confirmed** — card, tiled icon, bold name, second line, chevron;
`COMPONENTS` header with a count badge; children with a leading rule, their own
tile and their own chevron. **Corrected**: the child's trailing glyph is a
chevron *into* the child (it selects), not an expand toggle; and the card carries
a **drag handle and a hide button** the brief did not mention.

---

## B. The section-settings panel — `20:731`, 330 × 881

| | |
|---|---|
| surface | white, `border-l #dce3eb`, `drop-shadow -4px 0 7.5px rgba(18,35,60,.02)` |
| header `20:732` | min-h 79, pt 16 pb 10 px 16 |
| eyebrow | `SECTION SETTINGS` 10px bold tracking 1.3 `#75869a` |
| heading `20:738` | **`Hero Promotion` — the section's NAME**, 16px bold `#12233c`, max-w 220 clipped |
| sub `20:741` | **`Full Width`** 11px `#8995a5` |
| kebab `20:745` | 25 × 25, radius 5, icon 19 — **no menu is drawn anywhere in the file** |
| breadcrumb `20:750` | 301 × 50.5, `bg #eef5ff`, `border #c9ddff`, radius 8, px 10 py 9, gap 9; white tile 26 × 26 radius 7 with a 15px glyph; `กำลังแก้ไข Section` 9px `#7587aa` over **`Hero Promotion`** 11px bold `#2d519a` |
| tabs `20:761` | h 46, `border-b`, px 14, three columns of 100.33, tab 45; **active `#7657d8` (purple)** with a 2px underline, radius 2, w 86.31; inactive `#738196`; all 12px bold |
| body `20:772` | pt 16 pb 25 px 15, inner 299 wide, **`items-center`, gap 17** |
| footer `20:888` | `border-t`, min-h 58, px 17, `เปิดใช้งาน Section` 11px bold + a 39 × 22 toggle |

### The centred block (the content tab, container case)

1. icon frame **52 × 52, radius 15**, glyph 26 — centred
2. `แก้ไข Hero Promotion` — 15px **regular**, lh 22.5, `#12233c`, centred
3. paragraph, 250 wide, 10px `#7a889a`, centred, lh 15.5:
   > `Section นี้ประกอบด้วย 6 Components เลือก Component จากแถบซ้ายหรือคลิกบน Canvas เพื่อแก้ไขเฉพาะส่วน`
4. `ชื่อ Section หลังบ้าน` label + input 299 × 36.5, radius 7
5. `Anchor ID` label + input 299 × 36.5, value `hero`
6. **the child list** — gap 5, each row 299 wide, min-h 43, **white on `border
   #dce4ec`, radius 8** (the structure panel's child rows are transparent; these
   are outlined cards), px 8 py 6, grid `[29px 220px 16px]` gap 8: tile 29 × 29
   radius 7 with a 15px glyph, name **9px** bold `#455970`, type **8px**
   `#8491a1`, chevron 14

**Confirmed** in full. **Corrected on one point**: the centred block is not
*instead of* the tab strip — the tabs sit above it and the block **is** the
content tab's body. The panel keeps its three tabs.

### The NON-container case

**The design does not draw it.** There is no second settings-panel state in the
file. So the design cannot make the two cases distinguishable, and what a leaf
section shows is a decision this proposal has to make, not read. §H.4 proposes
it.

---

## C. Everything else in the two panels

1. **The structure panel is dark and the settings panel is white**, in a
   light-mode frame. §0.1.
2. **A panel-collapse button** (`20:110`) in the structure header. No collapsed
   state is drawn.
3. **A kebab menu** (`20:745`) in the settings header. No menu is drawn.
4. **A section-count in the structure header** — `6 Sections · …`.
5. **A hint banner** costing 66px above the list.
6. **An `เปิดใช้งาน Section` toggle** in the settings footer — the same `enabled`
   flag the structure card's eye button already sets. §L.2.
7. **An autosave line with a relative timestamp** in the structure footer. §L.1.
8. **The add-section button is dashed and full width**, and the design shows only
   ONE of them (top level). Today there is an `AddRow` per container slot, plus a
   depth-cap refusal rendered in its place. The design has no equivalent, and no
   nested add affordance at all.
9. **The child row in the settings panel is an outlined white card; the child row
   in the structure panel is transparent.** Same data, two treatments — which is
   right, because they sit on different surfaces.
10. **Type sizes go below the shared scale everywhere**: 8px, 9px, 10px in both
    panels. Round 17's ruling (Tailwind's stock scale, smallest step 12px) and
    round 28's application of it mean the design's hierarchy has to be carried by
    weight and colour, as it already is in `fields.jsx`.
11. **No accordion/`ว่าง`/`ลึกสุด` badges.** Today's row carries an "empty" badge
    and a depth-cap badge. The design has neither, and both state something the
    author cannot otherwise learn (`sectionRendersEmpty`, `MAX_SECTION_DEPTH`).
    They must survive any card rewrite.

---

## D. `Anchor ID` — conflict, ruling stands

**The design promotes it into the content tab, second field, for everyone.**
`20:791` sits directly under `ชื่อ Section หลังบ้าน`, labelled `Anchor ID`, value
`hero`, with **no mention of CSS scope anywhere in the frame**.

The ruling stands: it stays in ขั้นสูง, developer-only. `AdvancedGroup` documents
why — the same string is the scope of `advanced.customCss`, and the renderer
drops both the ID and the CSS bound to it when the ID is invalid. A non-developer
overwriting `hero` silently kills a developer's CSS with no error anywhere.

**For your judgement on the separate feature:** the design uses it as a *plain
`#anchor`* and nothing else. Nothing in either frame links it to CSS, and the
value shown (`hero`) is exactly what a "jump to this section" link would need. So
the design is evidence that a plain anchor field is *wanted* — but it is a new
field with its own key, not this one under a new label. Two fields, one of which
is developer-only, is the honest shape; one field with two owners is the shape
round 25 removed from the width control.

---

## E. `ชื่อเรียกภายใน` — conflict, ruling stands

**The design files it inside the content tab** (`20:785`), above `Anchor ID`,
labelled `ชื่อ Section หลังบ้าน`. Ruling stands: it stays above the tab strip.

Worth recording that the design's own copy **agrees with the reasoning** — it
calls the field "the back-office section name", which is precisely the argument
for not filing it under the tab whose promise is "this is what visitors read".
The design puts the right label in the wrong place.

---

## F. Round 16's header rulings — one contradiction, one non-contradiction

**No separate type line — CONTRADICTED, and by a subtler route than it looks.**
The design's heading is the section's **name** (`Hero Promotion`) and the line
beneath it is a **setting value** (`Full Width`). Round 16's rule is that the
heading *is* the type and a second type line would print it twice. The design
does not print the type twice; it prints the *name* and then a *setting*. So the
design does not violate the letter of the ruling, but it does replace the thing
the ruling protects: today's heading answers "what kind of section is this",
and the design's answers "which section is this". Both are legitimate; they are
not the same question, and only one of them survives a section with no name.

**Breadcrumb absent for a top-level selection — CONTRADICTED.** `Hero Promotion`
is a top-level section and the design renders the card anyway. But the design's
card is **not a containment breadcrumb at all** — it reads `กำลังแก้ไข Section /
Hero Promotion`, restating the selection. Round 28 shipped it as the parent line
(`อยู่ใน <parent>`), which is why it is absent at top level. These are two
different components wearing one visual treatment. The ruling stands for the
containment line; whether a *restate-the-selection* card should also exist is a
separate question, and my answer is no — it would say the same thing as the
panel heading eight pixels above it.

---

## G. The child-component list — approved, and how it wires

**One action, three entry points.** `SELECT` is dispatched today from exactly two
places:

- `StructurePanel.jsx:292` — `dispatch({ type: 'SELECT', path })`
- `CanvasPanel.jsx:120` — `dispatch({ type: 'SELECT', path: … })` (round 24)

The child list becomes the third, with the identical call. The reducer case is
one line — `case 'SELECT': return { ...state, selection: action.path ?? null }` —
so there is nothing to keep in sync: selection is a single field on one reducer
state, and every entry point writes it the same way.

**Wiring, concretely.** `SettingsPanel` already reads `selection` and `selected`
from `useEditor()`, and `pagePath.js` already exports what is needed:

```
for each slot of slotsOf(selected.type):
  for each child at index i of selected.content[slot]:
    row → dispatch({ type: 'SELECT', path: [...selection, 'content', slot, i] })
```

That path shape is the same one `SectionList` already builds in the structure
panel (`basePath={[...path, 'content', slot]}`), so the two panels compute child
paths identically rather than by two rules.

**No new state.** Confirmed:

- no selection state — `SELECT` writes the reducer's one `selection` field
- no expand state — the settings panel shows only the *selected* section's
  children, which is already known
- no local copy of the child list — it is read from `selected.content[slot]`,
  the same object the structure panel reads
- the icon comes from `iconOf()` and the type label from `labelOf()`, the two
  registries rounds 9–16 established; **no icon or label map is added**

The only genuinely new thing is a component, and it has no `useState`.

**One consequence to accept deliberately:** selecting a child from here changes
`selection`, so the panel that rendered the list is immediately replaced by the
child's own settings. That is correct — it is what clicking the structure row
does — but it means the list is a *navigation* surface that disappears on use.
The breadcrumb card is what gets the author back up, which is an argument for
keeping the containment line rather than the design's restate-the-selection card.

---

## H. The centred `แก้ไข <name>` block — approved, with honest copy

### What it renders from, all derivable

| element | source | new data? |
|---|---|---|
| the 52px glyph | `iconOf(selected.type)` | no |
| `แก้ไข <name>` | `selected.name` → `sectionSummary` → `labelOf(type)` — the same three-step fallback the structure row's line 1 already uses | no |
| `N Components` | `sectionChildCounts(selected)` | no |
| "pick one from the left or on the canvas" | static copy | no |

`sectionChildCounts` (round 16, `sectionLabels.js:77`) returns `null` for a
non-container and otherwise `[{slot, count}]` **per slot, deliberately not
summed**.

### The design's copy needs nothing that is not derivable — but it is wrong for a multi-slot container

The design says `Section นี้ประกอบด้วย 6 Components`. For `two_column` that
single number would describe *one list of N* where **two labelled lists** exist,
which is exactly the misdescription `sectionChildCounts` refuses to produce and
`childCountLabel` (`StructurePanel.jsx:52`) already refuses to print.

### Proposed copy

Reusing `childCountLabel`'s existing rule rather than writing a second one:

- **single-slot container** (`container`, `accordion`, `card_grid`, …):
  `Section นี้มี 6 component — เลือกจากรายการด้านล่าง หรือคลิกบน Canvas เพื่อแก้ไขเฉพาะส่วน`
- **multi-slot container** (`two_column`):
  `Section นี้มี component อยู่ 2 ฝั่ง — ซ้าย 4 · ขวา 2 — เลือกจากรายการด้านล่าง หรือคลิกบน Canvas`
- **container with no children yet**:
  `Section นี้ยังไม่มี component — เพิ่มได้จากแผงโครงสร้างด้านซ้าย`
  (there is nothing to list, and pointing at a list that is empty is worse than
  saying so)
- **non-container**: **the block is not rendered at all.** A leaf's content tab
  already opens on its own fields, which is the answer to "what do I edit now".
  A centred `แก้ไข <name>` above them would be a heading repeating the panel
  heading, and the sentence beneath it would have no true form.

Note the design's own string reads `1 Components` on `Bundle Courses`. Thai has
no plural agreement, so the proposed copy sidesteps it; do not port the English
noun.

### The count belongs in one place

The structure card's subtitle (`· 6 Components`), the settings heading sentence,
and the `COMPONENTS` badge would be three renderings of one number. All three
must read `sectionChildCounts`; none may count `content[slot].length` inline.

---

## I. Card rows — approved in principle, and the measurement changes the argument

`scripts/_probe-round29-panel-fit.mjs`, headless Chrome, real `StructurePanel`
through `EditorProvider`, real compiled stylesheet, the 276px column and the
100dvh shell chain lifted from `EditorShell.jsx`. Today's pitch is **measured**
(49px, uniform); the design's is **specified** (54 + 8 = 62, or 61 + 8 = 69 when
the subtitle wraps), applied to the same measured budget.

### The two numbers the brief asked for

| viewport | list budget | **today (49px pitch)** | **design (62px)** | design (69px) |
|---|---|---|---|---|
| 1920 × 1080 | 823px | **17** | **13** | 11 |
| 1536 × 864 | 607px | **12** | **9** | 8 |
| 1440 × 900 | 643px | **13** | **10** | 9 |
| 1366 × 768 | 511px | **10** | **8** | 7 |

Card rows cost **~24–30% of the visible list**. And the design's own chrome is
taller too — header 93 against today's measured 50, plus a 66px hint banner —
which takes it further:

| viewport | design budget | design + its own chrome (62px) | (69px) |
|---|---|---|---|
| 1920 × 1080 | 714px | 11 | 10 |
| 1536 × 864 | 498px | 8 | 7 |
| 1440 × 900 | 534px | 8 | 7 |
| 1366 × 768 | 402px | **6** | **5** |

On the commonest laptop the panel goes from **10 sections to 6**. That is
material, and on the leaf-only page it is exactly the "panel that shows four
items" the brief warns about.

### But the leaf-only page is the half that favours today, and it is not the real page

**Today's panel cannot collapse anything.** `SectionList` renders every
container's children unconditionally, plus a slot header and an `AddRow` per
slot. So measured on the design's *own* page — six sections, five of them
containers holding 6 / 4 / 3 / 2 / 2 children:

| | rendered height |
|---|---|
| **today, always expanded** | **1297px** |
| **design cards, all collapsed** | **407px** |

Today's does not fit at *any* viewport tested — not even 1920 × 1080's 823px
budget. The design's fits everywhere except 1366 × 768, where 407 against 402 is
five pixels over.

So the honest verdict is **not** "the design is materially worse". It is:

> The card is worse per row and much better per *page*. It loses 3–4 rows on a
> page of leaves and wins ~890px on a page with containers. The variable that
> actually decides it is **collapse**, not card height.

### Mitigation — required, but not the one the brief guessed

Collapsing *unselected* sections to a shorter form is already what the design
does, and it is where the 890px comes from. What still needs mitigating is the
leaf-only page, where collapse buys nothing. Two changes, both cheap:

1. **Default every container to collapsed**, expanding only the selected one.
   The design draws exactly this. Without it, first paint of a container-heavy
   page is today's 1297px with taller cards on top — strictly worse than today.
2. **Drop the 66px hint banner, and fold its count into the header line the
   design already has** (`6 Sections · ลากเพื่อจัดลำดับ`). The banner explains
   the expand affordance, which a chevron on every card already explains, and it
   costs a whole card row on every viewport forever. This is a §L
   recommendation, not just a mitigation.

With both, at 1366 × 768: budget 468px, **7 cards** at 62px against today's 10 —
a 30% loss on the leaf page, bought with an 890px win on the container page.
That trade is worth making. Without collapse-by-default it is not.

---

## J. Drag — the riskiest piece, and the one that must not go first

### What `useTreeDrag` does today

One hook instance for the whole panel. It holds **no order** — `MOVE_SECTION` is
sibling-scoped (`moveWithin`), and the reducer is the only place order changes.
Legality is enforced by *not* calling `preventDefault` on an illegal target, so
an illegal drop is refused by the browser and never becomes a drop event at all.
`getRowProps(path)` is spread onto the **row div**, which is also the drop target
and carries `border-t-2` as the drop indicator.

### What the card pattern changes

| question | answer |
|---|---|
| **Does an expanded card drag with its children?** | It must, and today it already would — the children live in a *sibling* subtree inside the same `<li>`, and `MOVE_SECTION` moves the node, which carries `content` with it. But the **drag source moves**: the design puts a dedicated handle in column 1, so `draggable` and the handlers move from the row div to that handle, or the row keeps `draggable` and the handle becomes decoration. The first is the design's intent; the second is what the code does today. **They are not interchangeable** — `onDragStart` currently calls `stopPropagation` precisely so the innermost row claims the drag, and a handle inside an expanded card is inside a *deeper* DOM subtree than it is today. |
| **What is the drop target?** | Today: the row div. With a card, the row div is the card — but an **expanded** card's drawer is a sibling, so the card's visual extent (card + drawer) is no longer one element. A drop indicator drawn on the card alone would appear *above* a 313px drawer belonging to the section above it, reading as the wrong insertion point. **The drop target must become the whole `<li>`**, or the drawer must be inside the card element. |
| **Does `MOVE_SECTION` still express it?** | **Yes, unchanged.** It takes a path and a target index within one parent. Nothing about cards, drawers or collapse state touches that. The reducer needs no change. |

### The keyboard path — this is the real risk

Round 14 chose buttons over drag for `ItemList` because native HTML5 drag has no
keyboard path. Round 25 gave the structure panel the same protection: **`ขึ้น` /
`ลง` / `ทำซ้ำ` / `ลบ` icon buttons**, raised to a 24px hit area in round 28.

**The design deletes all four.** `20:119`'s five columns are drag, tile, text,
hide, expand. There is no up, no down, no duplicate, no delete anywhere in the
frame — reordering is drag-only, and there is no non-mouse way to do it.

That is not a visual change. It is the removal of the only keyboard reorder path
the panel has, and it would be invisible in review because the *mouse* path gets
better at the same time.

**Verdict: build the cards, keep the four buttons.** The card is 54px tall
against today's 47 and 276px wide — there is room for a handle *and* the cluster.
Round 28 measured the cluster at 96px in flow with 91px of label left over; a
54px card with a two-line text block can carry the same cluster on a second row
or on hover, as today. If the four buttons genuinely cannot fit, the card is the
thing that gives way, not the keyboard.

---

## K. Proposed build sequence

Ordered so the riskiest — the drag/keyboard rework of §J — is **not first**, and
split so that pure reorganization never travels with new behaviour. Each step is
one commit.

### Step 0 — pin what the panels render today *(prep, no user-visible change)*

`test/render/structureRowLines` and `test/render/panelPolish` already pin the
row's child *shape* (`['svg','button','span','button']`, and the badged variant)
and the five action `aria-label`s. Extend that to an **exact ordered set of
what a container row renders**, top-level and nested, including the `ว่าง` and
`ลึกสุด` badges and the per-slot `AddRow`.

Round 26's step 0 is the precedent and the reason: round 15's tab split was safe
*because* a union check pinned the field set first. A card rewrite invites the
same failure — a badge or an `AddRow` landing nowhere — and §C.11 already names
two things the design drops that must not be dropped.

### Step 1 — the child list in the settings panel *(low risk, additive)*

§G. A new component, no state, one `SELECT` dispatch, no schema or action change.
Nothing existing moves. It is the piece with the clearest user value and the
smallest blast radius, and it is independently useful whether or not the cards
ever land.

### Step 2 — the centred `แก้ไข <name>` block *(low risk, copy-heavy)*

§H. Replaces one line of text. The only real work is the copy decision for
multi-slot containers and the non-container case, both settled above. Reads
`sectionChildCounts`; adds no reader of `content[slot].length`.

### Step 3 — collapse, before cards *(medium risk, behaviour)*

Container children become collapsible, defaulting to collapsed, expanding for the
selected section. **Today's row keeps its shape** — this is the `chevron` and the
open/closed state only.

Deliberately before the cards, because §I shows collapse is the variable that
decides whether cards are affordable at all. Landing it alone means the fit
question is answered by a real panel rather than by a probe, and if the answer is
bad the cards are never built on top of it.

The one new piece of state in the whole sequence, and it is view state: it
belongs in `StructurePanel`, not `editorReducer` — the same call round 15 made
for the settings panel's open tab, for the same reason (opening a drawer must not
mark the document dirty).

### Step 4 — the card treatment *(medium risk, visual)*

§A, on the collapsed rows step 3 produced. Tiles, the two-line text block, the
selected gradient and left bar, the `COMPONENTS` header and badge, the child
drawer with its leading rules. **The four action buttons stay** (§J). Guarded by
step 0.

Colour resolves to tokens per round 28's standing rule; §L.5 flags the one that
has no token.

### Step 5 — the drag rework *(highest risk, last)*

§J. Move the drag source to the handle, move the drop target to the `<li>`, and
re-verify that an expanded card's drop indicator lands where the drop actually
goes. `MOVE_SECTION` is unchanged.

Last because it is the only step that can break a working interaction while
looking correct, and because steps 3–4 change the very DOM relationships it
depends on. Doing it first would mean doing it twice.

### Not scheduled

The dark rail (§0.1), the panel-collapse button (§C.2), the kebab (§C.3), and
everything in §L.

---

## L. Recommended NOT to build

### 1. `บันทึกอัตโนมัติเมื่อ 2 นาทีที่แล้ว` — the structure panel's autosave line

Two independent problems.

**It is a second save authority in vocabulary.** Round 27 settled what the editor
says about persistence and shipped `SaveStateLine`: `บันทึกแล้ว` / `ยังไม่ได้
บันทึก — ระบบจะบันทึกให้อัตโนมัติ` / `กำลังบันทึก…`. A differently-worded claim in
the other panel, visible at the same time, is the shape round 25 removed from the
width control — two layers each believing they own one concept.

**The relative time is a hydration hazard and a stale claim.** "2 minutes ago" is
computed from a clock, so a server-rendered value and the client's first render
disagree; and once rendered it is wrong one minute later unless it ticks. The
editor's `updatedAt` supports an absolute time honestly. If a line is wanted
there, it should be the **existing** save-state vocabulary, not a second one.

### 2. The `เปิดใช้งาน Section` toggle in the settings footer

`TOGGLE_SECTION` flips `section.enabled` (`editorReducer.js:119`), and the
structure card's **eye button already dispatches exactly that**
(`StructurePanel.jsx:359`). Building the toggle puts two controls for one boolean
on screen simultaneously, in two panels, with two different affordances and two
different labels.

That is not a styling question. Either the eye goes and the toggle replaces it —
a real decision about where visibility lives, and the design does keep *both*, so
the design does not make it — or the toggle is not built. **Not built** is the
smaller claim, and the eye is the one with the better argument: it is on the row
whose visibility it describes.

### 3. The kebab in the settings header (`20:745`)

A 25 × 25 button whose menu is drawn nowhere in the file. Round 26's standard: a
surface whose behaviour is unspecified is a claim nothing can verify. Build it
when its menu exists; a button that opens an empty menu is worse than no button.

### 4. `Full Width` as the card subtitle's first token

The design uses two vocabularies in one slot (§A). `Full Width` is a
`containerWidth` value; the other five sections show a **type**. Ship the type —
`labelOf(type)` is one source, already read by the structure row and the settings
header, and `containerWidth` already has a control in the รูปแบบ tab where its
value can be seen and changed. Putting a setting's value in a row subtitle makes
the row a second, read-only display of a control three inches away.

Ship `Card Grid · 2 component`, not `Full Width · 2 Components`.

### 5. The 66px hint banner

§I's mitigation 2. It explains the expand affordance that a chevron on every card
already explains, and it costs a full card row at every viewport, permanently.
Its useful half — the section count — is already in the header line the design
draws directly above it.

### 6. The permanently-dark structure rail (§0.1) — flagged, not refused

This one is **your decision, not mine to refuse**, so it is listed for a ruling
rather than as a recommendation. What the evidence says:

- It is not expressible in the token system as-is. `--surface` and the
  `9e-slate-lt`/`9e-slate-dp` split exist precisely so a surface follows the
  theme; a rail that is navy in *both* themes opts out of that on purpose, and
  round 28's hard rule (no raw hex, dark mode is not optional) was written
  against exactly that shape.
- It would need a token pair of its own — something like a `--surface-rail`
  defined in both blocks — which is minting a token for one surface, the thing
  round 28 declined to do for a shadow.
- The design gives no dark-mode counterpart, so what the rail becomes when the
  user switches themes is undrawn.

If the dark rail is wanted, it is a **design-system change** (a new semantic
surface, defined in both themes, in `globals.css`), not a panel change — and it
should be decided before step 4 paints the cards, because the card's every colour
depends on which surface it sits on.

---

## Tests

**None added this round.** No source changed, and nothing measured warrants a
self-retiring assertion yet.

The measurement that *would* warrant one is §I's, and it cannot be written until
step 3 exists: the claim worth pinning is "a container defaults to collapsed", and
today there is no collapse state to assert about. Pinning the current 49px pitch
would be pinning a number this proposal intends to change — a guard that votes
against the work it is meant to protect, which is `sourceScan.mjs`'s face two.

Step 0 of the sequence is where the coverage goes, and it is a *set* check (what
a container row renders), not a *measurement* check.

`[suite]` unchanged at **6249 passed, 0 failed, 6249 total across 416 files**.
