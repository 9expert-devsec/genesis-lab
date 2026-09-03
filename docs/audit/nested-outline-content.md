# Nested outline content — what the shapes are, and what nesting would cost

**Run date:** 2026-08-31 · **Branch:** `dev` · **HEAD:** `12bd6b1`
**Method:** read-only. GET against MSDB, GET against the public old site, and
`find` against Mongo. **No writes. No source edits.**

---

## 0. The finding that reframes the request

The team asked for nested bullets in **section 6** (objectives, target audience,
prerequisites, system requirements), citing screenshots of five-level nesting on
the live old site.

Both halves are true, and they are about **different sections**.

- The five-level content on
  `9experttraining.com/power-bi-data-model-training-course` is in
  **หัวข้อการฝึกอบรม — section 7**, not section 6.
- Crawled across **all 74** courses that carry an old-site URL, the section-6
  blocks on that same site are **flat in 294 of 296 cases**. Two blocks nest,
  both `ความต้องการของระบบ`, both at depth 2.

So the evidence that motivated the request does not describe the fields the
request names. That does not make the request wrong — but it changes what the
work is, and it is measured below rather than argued.

---

## 1. The shapes today

### 1.1 Section 6 — four fields, one level by type

| | |
|---|---|
| **MSDB field names** | `course_objectives`, `course_target_audience`, `course_prerequisites`, `course_system_requirements` |
| **Genesis field names** | identical — genesis has no store of its own for these |
| **Type** | `string[]` |
| **Nesting supported** | **one level.** A flat array cannot express a parent/child relationship at all |
| **Authored by** | `BulletTextarea` — a plain `<textarea>`, one item per line. `linesOf()` splits on `\n`, trims, drops blanks ([courses.js:190-197](../../src/lib/actions/courses.js#L190-L197)) |
| **Rendered by** | `CourseObjectives.jsx` (numbered), `CourseTarget.jsx`, `CoursePrerequisites.jsx`, `CourseRequirements.jsx` (check marks). Every marker is drawn by the renderer; none is stored |

Because `linesOf` **trims every line**, leading indentation is destroyed on save.
Any indentation-carries-depth scheme would have to change that function — it is
not merely unused today, it is actively stripped.

### 1.2 Section 7 — `training_topics`, two levels

| | |
|---|---|
| **MSDB field name** | `training_topics` |
| **Genesis field name** | identical in the payload; the editor's internal shape is `{ topic, subtopics }` and is converted before send |
| **Type** | `[{ title: string, bullets: string[] }]` |
| **Nesting supported** | **two levels**, fixed. `bullets` is `string[]`, so a bullet cannot have children |
| **Authored by** | a per-row editor (`lib/courses/topicEditorSeed`, `topicEditorSave`), serialised to JSON in a hidden field and decoded by `parseTrainingTopicsValue` |
| **Rendered by** | `CourseOutline.jsx` |

### 1.3 A third field nobody asked about — `course_training_topics`

The read payload carries **both** `training_topics` and `course_training_topics`.
They are not the same thing:

- `course_training_topics` is a flat `string[]` — **one level**.
- It is populated on **6 of 80** courses.
- It is **never** equal to `training_topics` on any of those 6 (0/6 identical).
- Nothing in genesis writes it, and nothing renders it.

It looks like a superseded predecessor of `training_topics`. Recorded because any
migration touching outline content will meet it.

### 1.4 Round trip — which of these survive the read path

The previous round found `title` and `bullets` are written but never read. Every
field in scope was checked, not just those two:

| field | returned by read? | populated | items | max on one course |
|---|---|---|---|---|
| `course_objectives` | yes | 80/80 | 375 | 10 |
| `course_target_audience` | yes | 79/80 | 283 | 12 |
| `course_prerequisites` | yes | 74/80 | 182 | 6 |
| `course_system_requirements` | yes | 80/80 | 310 | 8 |
| `training_topics` | yes | 80/80 | 832 | 28 |
| `course_training_topics` | yes | 6/80 | 57 | 15 |
| `bullets` | **NO** | 0/80 | 0 | 0 |
| `title` | **NO** | 0/80 | 0 | 0 |

**Every field in scope round-trips.** The two broken ones are not among them, so
no option below is blocked by the read path — see §3.5, which states that
explicitly because it was the question asked.

### 1.5 There is already a genesis-owned rich layer for section 7

`CourseExtension.trainingTopicsRich` — `[String]`, one HTML string per
`training_topics` row ([CourseExtension.js:204](../../src/models/CourseExtension.js#L204)).
It is authored through the repo's Tiptap editor and read through
`lib/courses/topicRichState`, which decides per row whether to render the rich
copy or fall back to the plain MSDB bullets.

**`lib/courses/topicHtml` already handles arbitrary nesting** — it has
`LIST_TAGS`, depth tracking, and explicit handling for *"an `<li>`'s OWN text —
its descendants MINUS any nested list subtree"* and *"the usual shape:
`<ul>…<li>text<ul>DEEP</ul></li>…</ul>`*.

Measured in Mongo: **80 `course_extensions` rows, exactly 1** carries any rich
content — `ZZTEST-AUTO-03`, a test course, 3 rows of HTML of which 1 contains a
nested list.

> So option C for section 7 is **not a proposal. It is shipped, it supports
> nesting, and it is unused.** That is the single most important input to the
> decision, and it was not visible from the request.

---

## 2. What the real data looks like

### 2.1 Nesting present in MSDB today

Section 6 is `string[]`, so it is flat by type. The real question is whether
authors have hand-encoded a second level inside the strings. Measured across all
1150 items:

| field | items | leading indent | leading bullet marker | contains newline | >200 chars |
|---|---|---|---|---|---|
| `course_objectives` | 375 | **0** | **0** | **0** | 0 |
| `course_target_audience` | 283 | **0** | **0** | **0** | 1 |
| `course_prerequisites` | 182 | **0** | **0** | **0** | 0 |
| `course_system_requirements` | 310 | **0** | **0** | **0** | 0 |

**Not one of the 1150 items carries indentation, a bullet marker, or a newline.**
Section 6 is genuinely, uniformly flat. Whatever is chosen, **every existing
section-6 value stays valid unchanged** — there is no encoded structure to
migrate and none to accidentally reinterpret.

Section 7, across 832 topics and 3623 bullets:

| measure | value |
|---|---|
| topics with bullets (2 levels) | 707 |
| topics with a title only (1 level) | 125 |
| bullets with leading indent | 0 |
| bullets with a leading bullet marker | **3** |
| bullets containing a newline | 0 |
| bullets over 200 characters | 16 |

The three marked bullets are the interesting ones, and two of them are the
request in miniature:

```
– จัดการไฟล์และโฟลเดอร์อัตโนมัติ
– – กรอกข้อมูลลงโปรแกรมที่ไม่มี API
– – เชื่อม Desktop Flow เข้ากับ Cloud Flow
```

A **doubled en-dash**: an author hand-encoding a third level because the shape
cannot express one. It is on `ZZTEST-AUTO-03`, a test course, so it is a
demonstration rather than production content — but it is direct evidence that
two levels has already been felt as a limit by someone editing.

The 16 bullets over 200 characters are the other half of the screenshot
complaint — long paragraphs sitting at the same level as short headings, because
there is no level for them to sit under.

### 2.2 Where the five-level content lives — answered with evidence

**It is in the old site's own Drupal database, as HTML. It is not in MSDB.**

The deepest list on
`https://www.9experttraining.com/power-bi-data-model-training-course` (HTTP 200,
512,515 bytes) sits at this ancestry:

```
div.field__item
  > div.paragraph.paragraph--type--topics
    > div.accordion-item
      > div#collapse-2381.accordion-collapse.collapse
        > div.accordion-body
          > div.clearfix.text-formatted
```

`field__item`, `paragraph--type--topics` and `text-formatted` are Drupal classes
— the Paragraphs module plus a formatted-text (WYSIWYG) field. The page mentions
Drupal, carries `.node__content`, and has **no inline `style=` on any list
element**, so the nesting is real markup rather than visual indentation.

Rendered depth, from that one field:

```
L1: เข้าใจ Dimensional Model
  L2: Fact Table
    L3: Measures
  L2: Dimensional Table
    L3: Attributes
    L3: Attribute Hierarchies
L1: การออกแบบ Dimension Table
  L2: ประเภท Attribute
    L3: สร้างเพื่อเป็นลำดับใน Hierarchy
    L3: กรณีศึกษา การรวมหลายปฏิทิน …
  L2: Dimension Key กับความถูกต้องของการหาผลรวม
    L3: Slow Changing Dimension (SCD)
      L4: SCD Type 1
      L4: SCD Type 2
    L3: กรณีศึกษา หากไม่มีการติดตามการเปลี่ยนแปลงเขตการขาย …
```

The same course in MSDB is `POWER-BI-XDM` with **8 `training_topics`** — the
topic *titles* survive (the old site's 8 `<h3>` headings match), and everything
below the first bullet level is gone.

### 2.3 How many courses are deeper than the current shape — enumerated, not estimated

The old site **can** be enumerated: MSDB stores `website_urls[0]` for **74 of
80** courses, all on `www.9experttraining.com`. All 74 were fetched (**74/74
HTTP 200**, sequential, 250 ms apart, read-only).

**Section 7 (หัวข้อการฝึกอบรม) — max list depth per course:**

| depth | courses |
|---|---|
| 1 | 35 |
| 2 | 35 |
| 3 | 3 — `MS-FB-101`, `SQL-BI-ETL`, `SQL-ADM-BK` |
| 5 | 1 — `POWER-BI-XDM` |

> **4 of 74 exceed what `training_topics` can represent. 70 of 74 fit today's
> two-level shape exactly.**

**Section 6 — max list depth per block, same 74 courses:**

| block | courses with content | items | depth 1 | depth 2 |
|---|---|---|---|---|
| วัตถุประสงค์ | 74 | 342 | **74** | 0 |
| หลักสูตรนี้เหมาะสำหรับ | 74 | 261 | **74** | 0 |
| พื้นฐานของผู้เข้าอบรม | 74 | 185 | **74** | 0 |
| ความต้องการของระบบ | 74 | 263 | 72 | **2** |

The only two nested section-6 blocks anywhere are `PAM-CLD` and `POWER-PF`, both
`ความต้องการของระบบ`, both depth 2. `POWER-PF` is the clearest picture of what
the flat shape costs:

```
OLD SITE                          MSDB course_system_requirements
L1: Mobile/Tablet                 • Mobile/Tablet
  L2: iOS 16 หรือ Version ล่าสุด    • iOS 12 หรือ Version ล่าสุด
  L2: Android 10 หรือ Version…     • Android 7 หรือ Version ล่าสุด
L1: Google Chrome / Edge …        • Google Chrome / Microsoft Edge …
L1: Microsoft Power BI Desktop…   • Microsoft Power BI Desktop …
L1: Internet                      • Internet
```

"Mobile/Tablet" became a **sibling of its own children**. `PAM-CLD` shows a
second, different hand-encoding of the same loss — the children folded into one
string as `"Mobile | Tablet: Android 10 or later / OS 13 or later"`.

Note in passing: the two systems have also **drifted on content** (iOS 16 vs 12,
Android 10 vs 7 on `POWER-PF`; the objectives on `POWER-BI-XDM` are 7 items on
both sides with the first identical but the sets not equal). That is a separate
question from nesting and is not measured further here.

---

## 3. Options

### 3.0 What the measurements constrain

Before the trade-offs, four facts that any option has to live with:

1. **Section 6 has no nesting demand in the existing corpus** — 0 of 1150 stored
   items, and 294 of 296 old-site blocks flat.
2. **Section 7 has a demand, and it is small** — 4 of 74 courses.
3. **Every field in scope round-trips**, so nothing here is blocked by the read
   path.
4. **A rich-HTML layer for section 7 already exists, supports nesting, and is
   used by one test course.**

### 3.1 Option A — nested arrays (a real tree)

`string[]` → `[{ text, children[] }]`, or `bullets: string[]` → a recursive node.

| | |
|---|---|
| **MSDB** | schema change on 4 (or 5) fields, plus whatever validates them |
| **Genesis** | new indent/outdent editor for each field; renderers become recursive; `linesOf` replaced |
| **Existing data** | survives only through a **migration** — a `string[]` is not a valid node array. That is a write against 1150 section-6 items and 3623 section-7 bullets |
| **Without an MSDB change?** | **No.** The stored type changes, so MSDB must accept and return the new shape |

Most faithful to the content. Also the only option that cannot be delivered
incrementally: the shape changes for every course at once, including the 70 of
74 that need nothing.

### 3.2 Option B — flat text, indentation carries depth

Keep `string[]`. Two leading spaces per level, parsed at render.

| | |
|---|---|
| **MSDB** | **nothing** — the stored type is unchanged |
| **Genesis** | `linesOf` must **stop trimming leading whitespace** (it strips it today, so this is a required change, not an omission); a small pure parser; recursive renderers |
| **Existing data** | **survives untouched.** Measured: 0 of 1150 items carry leading whitespace, so every existing value parses as depth 1 and renders exactly as it does now |
| **Without an MSDB change?** | **Yes** — the only option that is |

Cheapest by a wide margin, and the measurement in §2.1 is what makes it safe:
there is no existing indentation to be reinterpreted. The costs are real though:
whitespace is invisible and fragile in a plain `<textarea>`, a paste from Word
carries non-breaking spaces and tabs that would need normalising, and the depth
convention becomes a thing authors must be told about. It also puts a parser
between the stored value and the page, where today there is none.

### 3.3 Option C — rich text via the existing Tiptap

| | |
|---|---|
| **MSDB** | **nothing** — the HTML lives in `CourseExtension`, a genesis collection |
| **Genesis** | for section 7: **already built.** For section 6: four more `CourseExtension` fields plus four editor mounts, reusing `topicHtml` / `topicRichState` |
| **Existing data** | **survives untouched.** The rich field is per-row and empty means "render the plain MSDB value exactly as today" — the fallback is already implemented and already the state of 79 of 80 courses |
| **Without an MSDB change?** | **Yes** |

Arbitrary depth for free, and the mechanism is shipped rather than proposed. Two
costs, both recorded in the repo already:

- **Ownership splits.** MSDB holds the plain value, genesis holds the rich one,
  and `topicRichState` is the single place allowed to choose. Extending that to
  four more fields multiplies a rule that currently has one instance.
- **Tiptap brings colours.** The brief names this and the repo has the receipt:
  the editor emits inline colours, and `authoredColors` exists precisely because
  authored inline colour breaks dark mode. Whatever sanitiser section 6 got would
  have to strip the same things `topicHtml` strips.

### 3.4 A fourth option the measurements suggest

**Do section 7 only, and do nothing to section 6.** Turn on the rich editor that
already exists for the 4 courses that need it, and leave the 1150 flat section-6
items alone. It is not in the brief's list, but §2.1 and §2.3 point at it hard
enough that omitting it would be hiding the result: the request's own evidence is
section-7 content, section 6 has no nesting anywhere in the corpus, and the
capability for section 7 is already deployed.

### 3.5 Blocked by the read path?

**None of them.** This was asked because `title` and `bullets` turned out to be
written-but-never-read, which would have made any option depending on them
undeliverable. Checked field by field (§1.4): all four section-6 fields and
`training_topics` round-trip.

One consequence worth stating: **option C is the only one that does not depend on
MSDB at all**, because it stores nothing there. Options A and B both need MSDB to
keep returning the field — which it does — and A additionally needs it to accept
a new type.

---

## 4. What this audit could NOT determine

1. **Whether the old site is the source of truth or a stale copy.** The two
   systems have drifted (§2.3), and nothing measured here says which direction
   content flows or whether MSDB was seeded from Drupal.
2. **Whether the 5-level `POWER-BI-XDM` content is meant to survive the
   migration.** It exists on the old site; whether the team intends to carry it
   over, or rewrite it flatter, is an editorial decision.
3. **How many courses exist only on the old site.** The enumeration ran through
   MSDB's `website_urls`, so it covers 74 of MSDB's 80 courses and cannot see any
   old-site course absent from MSDB. **6 MSDB courses carry no `website_urls`**
   and were not crawled.
4. **What `course_training_topics` is for**, who wrote it, or whether anything
   outside genesis still reads it. It is populated on 6 courses and disagrees
   with `training_topics` on all 6.
5. **Whether Tiptap's colour output would actually break section 6 in dark
   mode.** The repo records the defect class, and `topicHtml` strips for section
   7; whether that sanitiser is sufficient for four more fields was not tested —
   it would need the fields to exist first.
6. **What a nested `string[]` would do to the four consumers that read section 6
   downstream** (SEO description, JSON-LD, search corpus, career-path copies).
   Only the public renderers were traced.

---

## Reproducing

Every figure comes from read-only calls:

- `GET /public-course` — the 80-course list, for field shapes, population counts,
  and the indentation/marker/newline scan.
- `GET` on each `website_urls[0]` — 74 pages, sequential, 250 ms apart, parsed
  with jsdom for list depth by document order.
- `course_extensions.find({})` — for `trainingTopicsRich` usage.

No script is committed: the crawl hits a third-party site 74 times and does not
belong in a repo where it could be run casually. The queries above are the whole
method.
