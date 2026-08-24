# Can the 27 section types reproduce two real promotion pages?

Round 56. A survey and a proposal. **Nothing is built here.**

## The pages are real, and they are the spec

Both were found in the `promotions` collection and read directly, rather than
worked from a description:

| | Page A | Page B |
|---|---|---|
| title | โอกาสเดียวที่จะได้เรียนคอร์ส Claude AI ครบชุดในราคาสุดคุ้ม | เปลี่ยนทักษะ AI ให้เป็นงานจริง! Build Business Apps with Claude Code |
| `api_slug` | `promotion-claude-ai-bundle` | `promotion-build-business-apps-with-claude-code` |
| `source` | `msdb` | `msdb` |
| `related_course_ids` | `CLAUDE-AI`, `VIBE-CODE-L1`, `VIBE-CODE-L2` | `VIBE-CODE-L1` |
| body | `html_content`, 50,610 bytes | `html_content`, 60,285 bytes |
| `<style>` blocks | 1 | 1 |
| `<script>` blocks | 1 | 0 |
| images / links / buttons | 12 / 12 / 2 | 4 / 4 / 0 |

**Neither is a builder page.** Each is one hand-authored HTML+CSS blob synced
from MSDB, with its own CSS custom properties and its own class names. That
matters for the whole survey: the target is not "port a page-builder document",
it is "could an author have produced this page from the section palette".

One correction to the brief's description, and it changes an element count: the
date-range badge and the "Public Course" badge are **not in the page body**.
They live on the promotion document (`tags: [{label: "Public Course", …}]`,
`start_date`/`end_date`) and are drawn by the promotions grid. Nothing needs to
reproduce them inside the page.

---

## A. The mapping

Counted as DISTINCT visual elements. Where both pages use the same element (the
benefits strip, the terms boxes, the closing CTA), it is counted once and marked
*both*.

| # | Element | Page | Section type | Verdict |
|---|---|---|---|---|
| 1 | hero banner image | A | `image` | **maps** |
| 2 | hero title | both | `heading` | **maps** |
| 3 | hero description paragraph | both | `rich_text` | **maps** |
| 4 | 4-cell info strip (รูปแบบการเรียน / สมัครได้ถึง / ชำระภายใน / จำนวนจำกัด) | A | `card_grid`(4) + `stat_card`×4 | **maps** |
| 5 | bundle row, two-column composition | A | `two_column` | **maps** |
| 6 | "Bundle 1" tag above the description | A | `heading`, or a new eyebrow field | **partial** |
| 7 | "ลด 20%" discount chip | A | `price_card` | **partial** |
| 8 | struck-through ราคาปกติ 40,800 บาท | both | `price_card` | **partial** |
| 9 | large price 32,640 บาท | both | `price_card.price` | **maps** |
| 10 | VAT footnote + small-print line | both | `price_card` | **partial** |
| 11 | copy-code button ("คัดลอกรหัสส่วนลด EXP1") | A | — | **no** |
| 12 | "หลักสูตรที่ร่วมรายการ Bundle 1 (2 คอร์ส)" | A | `heading` | **maps** |
| 13 | course card — cover image | A | `course_card` | **partial** |
| 14 | course card — round-date chip (รอบอบรม 20 – 21 ส.ค. 69) | A | `course_card` | **partial** |
| 15 | course card — second button (ลงทะเบียน + รายละเอียดหลักสูตร) | A | `course_card` | **partial** |
| 16 | "สิ่งที่ได้รับ" strip, 4 illustration cards | both | `card_grid`(4) + `icon_card` | **partial** |
| 17 | two tinted bullet boxes (เงื่อนไขโปรโมชัน / หมายเหตุ) | both | `checklist` or `notice` | **partial** |
| 18 | closing CTA with TWO buttons | both | `cta` | **partial** |
| 19 | two-column hero | B | `two_column` | **maps** |
| 20 | inline coloured phrase inside the description | B | `rich_text` | **no** |
| 21 | hero button pair | B | `cta` | **partial** (same gap as 18) |
| 22 | corner ribbon "Early Bird ลด 20%" | B | `price_card` | **partial** |
| 23 | price panel date strip | B | `price_card` | **partial** |
| 24 | two stat cells inside the price panel | B | `card_grid`(2) + `stat_card`×2 | **maps** |
| 25 | eyebrow "PROMOTION DETAILS" above a heading | B | `heading` | **partial** |

### The three counts

| | count |
|---|---|
| **maps** — reproducible today | **9** |
| **partial** — right type, something missing | **14** |
| **no** — nothing produces it | **2** |
| total distinct elements | **25** |

Per page: A is 20 elements (8 map, 11 partial, 1 no); B is 14 (6 map, 7 partial,
1 no).

---

## B. Every partial and no, classified

**FIELD dominates, which is the expected finding.** 14 of the 16 non-mapping
elements are a field on a section type that is otherwise correct.

### FIELD — 14

| # | Type | Missing field(s) |
|---|---|---|
| 6 | `price_card` or `heading` | an eyebrow/tag string above the body |
| 7 | `price_card` | `discountBadge` — the "ลด 20%" chip |
| 8 | `price_card` | `originalPrice` — the struck-through figure |
| 10 | `price_card` | `footnote` — the VAT line and small print (today the only list surface is `features`, which draws a check glyph per row) |
| 13 | `course_card` | show the course cover image |
| 14 | `course_card` | show the next round's dates |
| 15 | `course_card` | a second button |
| 16 | `icon_card` | an image source that replaces the Lucide glyph |
| 17 | `checklist` | a heading above the list (the tint is already available as a section background preset) |
| 18/21 | `cta` | a second button label + href |
| 22 | `price_card` | `ribbon` — corner text |
| 23 | `price_card` | a date/eligibility strip |
| 25 | `heading` | `eyebrow` |

Seven of these are on `price_card` alone. Its current content schema is
`title / price / period / features / buttonLabel / buttonHref / highlighted` —
it was built as a pricing-tier card, and both pages use it as a promotion price
panel, which needs a *before* price, a *saving*, and *fine print*.

### BEHAVIOUR — 1

**#11, the copy-code button.** The page ships a `<script>` that binds
`[data-copy]`, writes to `navigator.clipboard`, and swaps the button's innerHTML
to "คัดลอกแล้ว". A string field cannot express any of that: it is an
interaction, a permission-gated browser API, and a transient label change.

It is also the one element whose *absence* is not a loss of layout — the code
`EXP1` can be shown as text and selected by hand. Cheapest honest option is a
field that renders the code as static text; a real copy button is a new
interactive section type and should be priced as one.

### TYPE — 0

Nothing on either page needs a genuinely new section type. That is worth stating
plainly, because it is the result that decides the shape of the work: this is a
field-and-renderer programme, not a new-primitives programme.

### Refused by design — 1

**#20, the inline coloured phrase.** `<span class="highlight-text">` with a
CSS-variable colour. `richTextContract.js` lists `textStyle` and `color` as
UNSUPPORTED, and records why: they "would also be a raw-hex route into" the
document. This is not a gap. See F.

---

## C. `icon_card` and the illustration strip

Both pages draw the same 4-card strip. The real markup is:

```html
<div class="card-detail">
  <img class="icon-detail" src="…/images/icon-promotion/folders.png"
       alt="document" width="512" height="512">
  เอกสารประกอบการอบรม
</div>
```

A 512×512 raster illustration served from `www.9experttraining.com`, plus a
label. `icon_card` takes `icon: z.string()` — a **Lucide name** — and round 14
built a picker over exactly that set. The renderer resolves it with
`lucideIcon(iconName)` and draws it at `h-6 w-6` inside an `h-11 w-11` tinted
square.

### Does `image` inside `card_grid` produce this today? No.

It gets the *grid* and not the *presentation*. `ImageSection` renders

```
<figure class="mx-auto">
  <Image … width={1600} height={900} className="h-auto w-full rounded-9e-lg" />
```

so a 512×512 PNG in a 4-column grid becomes a **full-cell square with rounded
corners**, not a compact illustration above a caption. The label would land in a
`<figcaption>` under it. The result is four large tiles, which is a different
component, not this one. `image` also has no card surface, so the strip loses
the `cardSurfaceClass` treatment the rest of the page's cards have.

### Verdict

Add an optional image source to `icon_card` rather than composing `image`. It is
one field on a type whose shape (art above a title above an optional
description) is already exactly right, and it keeps the strip on the card
surface and the accent tint that `icon_card` already applies.

Cost: one schema field, one branch in one renderer, one control. Compare with
the alternative, which is a new presentation mode on `image` plus a way to size
it — more surface, on a **public renderer**, for a worse fit.

---

## D. `course_card`: already available vs needs a fetch

### What it renders today

`CourseCardSection` → `CourseCard`, which draws: program icon + program name,
course name, duration (`formatDuration`), price (`formatPrice`, suppressible
since round 50), and **one** button, "ดูรายละเอียด". No image, no dates.

### What the resolver already returns

`getCourseByCode` returns **37 keys** (round 46's count, re-measured live on
`VIBE-CODE-L1`). The three pieces page A's cards need, checked against it:

| Needed | In the 37 keys? | Cost |
|---|---|---|
| course cover image | **YES** — `course_cover_url`, populated: a Cloudinary `.webp` | **field only** |
| second button target | **YES** — `website_urls[0]` is the course page; the registration URL is derivable | **field only** |
| round dates (รอบอบรม 20 – 21 ส.ค. 69) | **NO** — `schedules` is absent from the course shape | **needs a fetch** |

So two of the three are already in hand and cost a field plus a renderer branch.

The third is different in kind but **not new work**: `resolveSectionData`
already performs exactly this fetch for `course_schedule`
(`getCourseByCode` → `listSchedulesByCourse`). Showing rounds on a
`course_card` means widening the existing schedule fetch to cover cards that ask
for it — a resolver change, request-time and time-varying, which drags in
2C.2b's canvas-sample labelling. That is the one piece of D that should be
sequenced separately and last.

---

## E. Layout and nesting depth

`two_column` renders `grid grid-cols-1 gap-8` + `ratioClass(layout.ratio)`,
stacking below `lg`. `RATIOS` offers `50-50 / 40-60 / 60-40 / 30-70 / 70-30`.
Page A's bundle row is roughly 40-60 and page B's hero roughly 60-40 — **both
expressible today**. The left panel's own tinted background is a section
`background` preset on a `container` inside the column, also available.

### Depth required

`MAX_SECTION_DEPTH` is **4**. Counting from a top-level section at depth 0:

| Page | Deepest path | Depth |
|---|---|---|
| A | `two_column` → right slot → `card_grid` → `course_card` | **2** |
| A | `container` → `two_column` → right → `card_grid` → `course_card` | **3** if the bundle row is wrapped |
| B | `two_column` → right → `container` → `card_grid` → `stat_card` | **3** |

Both fit, with one level of headroom. **No structural work is needed for
layout** — E's gaps are all fields, not containers.

One caveat worth carrying: the cap is 4 and page B already needs 3. A future
page that wraps the whole composition in a `full_width` band would sit at 4 and
have none left.

---

## F. What NOT to copy

The round 21/26/33/46 discipline: a faithful reproduction of a hand-built page
is not automatically the right target.

1. **The inline coloured phrase (B).** `textStyle`/`color` are excluded from the
   rich-text contract on purpose, and the recorded reason is that they are a
   raw-hex route into stored content. Round 30 settled that an author's colour is
   DATA and a source colour is a TOKEN; a per-phrase hex in a document is
   neither. The page-level accent already exists and reaches every component
   through `--pb-accent-*`. **Do not add a colour mark to get this.**

2. **The `<script>` block.** Page A ships executable JavaScript inside its
   content. `custom_html` sanitises on every render and strips script and event
   handlers — that is the guarantee, and the copy button is the reason it exists,
   not an exception to it.

3. **Hard-coded dates in prose.** "สมัครได้ถึง 25 ก.ค. 69" and "รอบอบรม
   20 – 21 ส.ค. 69" are typed into the HTML. The system already derives dates
   from data (`course_schedule`, the promotion window) and round 43 fixed the
   promotions grid to name a **Bangkok** day rather than a UTC one. A rebuilt
   page should read dates, not restate them — a typed date is wrong the day the
   round moves and nothing catches it.

4. **The badges.** Already drawn from `tags` and the promotion window by the
   grid. Reproducing them inside the body would be a second source of truth for
   one fact — the thing rounds 15 and 29 refused, and round 52 confirmed.

5. **Absolute image URLs to `www.9experttraining.com`.** The illustration strip
   and the course covers point at the legacy site. Page-builder images go to
   Cloudinary and `ImageSection` already distinguishes the two (`unoptimized`
   for non-Cloudinary). Porting the URLs would pin new pages to the old host.

6. **Duplicated terms text.** Both pages carry near-identical เงื่อนไขโปรโมชัน
   and หมายเหตุ blocks. If a third page repeats them, that is a content-reuse
   question, not a section-type one — and it should be asked before it is
   answered by copy-paste a third time.

---

## G. Proposed build sequence

Grouped so cheap field work lands first, the public render path is isolated, and
the riskiest step is not first. Each step is independently shippable unless
noted.

### Step 1 — `price_card` gains its promotion fields *(field-only; editor + public renderer)*
`originalPrice`, `discountBadge`, `footnote`, `ribbon`. Seven of the 14 FIELD
gaps, on one type, in one schema file and one renderer. Highest coverage per unit
of risk. **Independently shippable.**

### Step 2 — `cta` gains a second button *(field-only)*
`secondaryButtonLabel` + `secondaryButtonHref`, reusing `safeUrl`. Closes #18 and
#21 on both pages. **Independently shippable.**

### Step 3 — `heading` gains an eyebrow, `checklist` gains a heading *(field-only)*
Closes #6, #17, #25. **Independently shippable.**

### Step 4 — `icon_card` gains an image source *(field-only)*
Closes #16 on both pages. Kept separate from steps 1–3 because it introduces a
*fallback* rather than a new element: image when set, Lucide otherwise, and the
picker keeps working. **Independently shippable.**

### Step 5 — `course_card` shows a cover and a second button *(field + renderer; no new fetch)*
Both values are already in the resolver's 37 keys. This is the first step that
changes a shared public component (`components/course/CourseCard.jsx`), which
rounds 50 and 51 both had to treat as deployed — so it is sequenced after the
cheap work and before the fetch work. **Independently shippable.**

### Step 6 — the discount code as static text *(field-only)*
A `code` field rendered as selectable text. Delivers the information without the
interaction. **Independently shippable, and it may be enough** — decide after
seeing it before pricing step 8.

### Step 7 — `course_card` shows the next round *(RESOLVER change)*
Widening `resolveSectionData`'s existing schedule fetch to cards that ask. Last
of the field work because it is the only piece that is request-time and
time-varying, which pulls in 2C.2b's canvas-sample labelling and a second
network round-trip on the public path. **Depends on step 5.**

### Step 8 — a copy-to-clipboard control *(BEHAVIOUR; new interactive surface)*
Only if step 6 proves insufficient. Priced as a new interactive section type, not
as a field.

**Not proposed:** a colour mark for #20, and any new section type. See F.

---

## H. Defaults, and why each keeps existing pages byte-identical

The trap, recorded by round 39 and re-proved by round 50: `.lean()` applies no
Mongoose defaults and JSON serialisation drops `undefined` keys, so a document
stored before a field existed reads that key back **ABSENT**, not as its default.
The renderer — not the schema — decides what absent means.

**The rule these fields follow, stated once:** a field that ADDS something the
page has never shown must default OFF and read absent as OFF. A field that could
REMOVE something every page already shows must default ON and read absent as ON
(`!== false`). Round 50's `showPrice` is the second kind; everything proposed
here is the first.

| Field | Type | Default | Absent must mean | Why byte-identical |
|---|---|---|---|---|
| `price_card.originalPrice` | string | `''` | no strikethrough drawn | renderer already guards `title/price/features` with `.trim()`; an empty string renders nothing |
| `price_card.discountBadge` | string | `''` | no chip | same |
| `price_card.footnote` | string | `''` | no footnote | same |
| `price_card.ribbon` | string | `''` | no ribbon | same |
| `cta.secondaryButtonLabel` / `Href` | string | `''` | no second button | `cta` already renders its button only with BOTH a label and a `safeUrl` href; the same pair-guard covers the second |
| `heading.eyebrow` | string | `''` | no eyebrow line | empty renders nothing |
| `checklist.heading` | string | `''` | no heading | empty renders nothing |
| `icon_card.imageSrc` | string | `''` | fall through to the Lucide `icon` | the existing icon branch is unchanged and still runs when `imageSrc.trim()` is empty |
| `course_card.showCover` | boolean | `false` | **OFF** — no image | a cover has never been drawn, so off is what every stored card renders today; read it `=== true` |
| `course_card.showSecondButton` | boolean | `false` | **OFF** | same |
| `course_card.showRounds` | boolean | `false` | **OFF** | same, and it also gates the extra fetch — absent must not trigger a request |
| `price_card.code` (step 6) | string | `''` | no code shown | empty renders nothing |

Every string field is safe by the same mechanism: the renderers already treat
empty as "draw nothing", so absent and empty are the same render. Only the three
`course_card` booleans need an explicit `=== true`, and they need it in the
opposite direction from round 50's `showPrice` — which is exactly the kind of
inversion that is worth writing down before anyone builds it.

**Each step must carry round 50's proof**, not just this assertion: render every
stored shape against the pre-change component and show zero differing.

---

## Tests

**One assertion is warranted, and it is small.**

E's conclusion — "no structural work is needed, both pages fit inside the
nesting cap" — rests on `MAX_SECTION_DEPTH` being at least 3, with page B
already at 3. That value is **not currently pinned by any test**: the only
reference in `test/` is `structurePanelBands`, which asserts the *shape of the
refusal condition* in source, not the number.

So a lowering of the cap to 2 would pass the whole suite and silently invalidate
this plan, and nothing would connect the two. A one-line assertion that the cap
is at least 3, naming this document, closes that.

It is **self-retiring**: once the pages are built, the pages themselves
constrain the depth and the assertion can go.

No other assertion is proposed. Guarding fields that do not exist yet would be
speculative, and each build step carries its own proof obligation under H.
