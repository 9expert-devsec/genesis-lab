# Choosing a course, instead of typing its code — survey and proposal

Round 46. Survey and proposal. **Nothing was built.**

> **This supersedes a document of the same name written on another clone.**
> Round 44 produced `docs/course-picker-proposal.md` and a commit `4148e8e` on a
> machine this repository has never seen: neither the file nor the commit exists
> in any ref reachable here (`git cat-file -t 4148e8e` → *Not a valid object
> name*; `git log --all -- '*course-picker*'` → empty). A digest of its findings
> was available second-hand. Every number in it has been **re-measured here**
> rather than carried over, and the re-measurement is what this file records.
> Where the digest and this clone agree, that is said; where they differ, the
> number measured here wins.

Every number below comes from a named probe run against the live upstream and
the live database on this clone, today. The probes are in `scripts/` and each
one prints its own evidence — see §H for how to re-run them.

---

## 0. The headline, before the detail

1. **The projection is 194.6× smaller than the payload, and that decides the
   whole design.** The full catalogue serialises to **1,229,727 bytes**;
   `{course_id, course_name}` for the same 79 courses is **6,318 bytes**. Two
   keys carry 68.6% of the weight and a picker needs neither. §B.
2. **Load the whole projection; do not build a server-search.** 6.2 KB, from a
   read that is already ISR-cached under a tag the course webhook already busts,
   filtered in the browser by a matcher this repo already ships and already
   tests. §C.
3. **A stale code is dropped from the render and kept in the document.** Driven,
   not read: a list authored with five codes resolved to four, the fifth appeared
   **0×** in the public HTML, and `content.courseIds` still held all five
   afterwards. That is the single requirement a picker can silently break. §D.
4. **Array position is the only ordering authority.** The same four codes
   reversed produced a reversed render, matching neither upstream order nor a
   sort. §D.3.
5. **The editor surface is entirely off the public path — measured.** Of the 555
   files in the public closure, `SectionContentEditor`, `SectionPicker`,
   `IconPicker`, `EditorProvider` and both builder routes are all **out**;
   `SectionRenderer`, `sectionLabels.js` and `resolveSectionData.js` are **in**.
   That is what makes a three-step sequence safe to ship one step at a time, and
   it is also a trap: the obvious home for a duplicate-detection helper is
   `sectionLabels.js`, which is *on* the public path. §G.
6. **Most of the picker already exists, in the wrong building.**
   `lib/courses/courseOptionFilter.js` is a pure, already-tested course search —
   substring over code and name, with a Unicode fold for สระอำ — and
   `CourseSearchSelect` already implements the stale-code rule for a single
   value, in as many words. Neither is reachable from the page builder today.
   The picker is mostly an assembly job, not a new component. §F.1, §G step 3.

---

## A. The surface, as it stands

Five section types reference courses. They come in **two shapes**, and one shape
is three of the five.

| type | shape | control | file:line |
|---|---|---|---|
| `course_selector` | list | `CourseIdsField` | `SectionContentEditor.jsx:446` |
| `bundle_courses` | list | `CourseIdsField` | `SectionContentEditor.jsx:455` |
| `course_list` (`source: 'manual'`) | list | `CourseIdsField` | `SectionContentEditor.jsx:521` |
| `course_card` | single | bare `TextInput` | `SectionContentEditor.jsx:418` |
| `course_schedule` | single | bare `TextInput` | `SectionContentEditor.jsx:546` |

`CourseIdsField` is defined once, at `SectionContentEditor.jsx:392`, and is the
whole of the list shape:

```js
function CourseIdsField({ value, onChange, hint }) {
  const ids = Array.isArray(value) ? value : [];
  return (
    <Field label="รหัสคอร์ส (บรรทัดละ 1 รหัส)" hint={hint ?? 'เช่น MSE-AI — ใช้รหัสจากระบบคอร์ส'}>
      <TextArea value={ids.join('\n')} onChange={(v) => onChange(v.split('\n').map((s) => s.trim()))} rows={4} />
    </Field>
  );
}
```

**One change reaches three of five types.** That is the reason the list shape
goes first and the single shape waits: `course_card` and `course_schedule` need
a different control (one value, not an ordered list), and converting them in the
same pass would double the surface of the riskiest step for no shared code.

### The stored value is the CODE, not an id

`courseIds: z.array(z.string()).default([])` — `lib/schemas/sections/dynamic.js`
lines 14, 35, 54. No uniqueness constraint, no minimum, no format. Whatever the
editor writes is what is stored, and whatever is stored is what the resolver is
handed.

### The empty string a trailing newline stores

The split has **no `.filter(Boolean)`**. Type a trailing newline in the textarea
and the stored array gains `''`. Measured downstream (§D.4): it is inert — it
resolves to nothing, renders nothing, and survives every round trip. It is not a
defect that has ever hurt anybody; it is a defect that makes a stored array say
something it does not mean.

---

## B. The payload, measured

`scripts/_probe-round46-course-payload.mjs`, run live.

### The measurement is real, and here is why that needed saying

Both course stores **fail open**:

```js
loadHiddenCourseIds → catch { return new Set() }   // "nothing is hidden"
loadCourseOrder     → catch { return null }        // "order nothing"
```

The verification suite's loader stubs `@/lib/db/connect` with a no-op. Under it,
`CourseExtension.find()` buffers against a connection that was never opened,
times out after mongoose's 10 seconds, and the catch turns that into *0 courses
are hidden*. A probe reporting **79 of 79 are public** off that path would be
printing a failure as a finding.

So this probe runs under `scripts/_probe-live-hooks.mjs`, which stubs nothing but
`next/link`, `next/image` and `next/navigation` — three modules that decide
markup and read no data — and it **checks** both stores rather than trusting
them, capturing each one's error sink:

```
loadHiddenCourseIds errors : 0
loadCourseOrder warnings   : 0
hidden-course set size     : 0
stored order seeded        : yes
COUNTS ARE USABLE          : yes
```

The hidden set is genuinely empty, not empty-because-the-read-failed.

### The numbers

```
courses upstream (includeHidden: true) : 79
courses the public site lists          : 79
hidden                                 : 0

full list                     : 1229727 bytes   (1200.9 KB)
{course_id, course_name} only :    6318 bytes   (6.2 KB)
ratio                         : 194.6x
per course, full              : 15566 bytes
per course, projection        :    80 bytes
```

Sizes are `Buffer.byteLength(JSON.stringify(…), 'utf8')` — uncompressed. The wire
applies its own compression on top; the ratio between the two is the number that
matters and compression does not change its sign.

These agree with the second-hand digest to the decimal (1,200.9 KB / 6.2 KB /
194.6×), which is worth recording: the round-44 measurement was faithful, and it
is now independently reproducible here.

### Where the weight is

37 keys per course. The top two are 68.6% of the payload on their own:

| key | bytes | share |
|---|---|---|
| `related_courses` | 453,494 | 36.9% |
| `training_topics` | 390,090 | 31.7% |
| `course_teaser` | 69,528 | 5.7% |
| `course_objectives` | 57,325 | 4.7% |
| `course_target_audience` | 33,360 | 2.7% |
| `skills` | 28,154 | 2.3% |
| `course_prerequisites` | 24,394 | 2.0% |
| `program` | 16,278 | 1.3% |

`related_courses` is the expensive one and the reason the projection is not
merely a nicety: it embeds whole course objects, so the payload contains courses
several times over. A picker needs a code and a label. Nothing else on this list
appears in a picker row.

---

## C. Load all of it — do not build a server-search

**Decision: hand the whole projection down once, from the server page, and filter
in the browser.**

### The read is already cached, and the cache is already busted correctly

The path is `listPublicCourses()` → `aiFetch('/public-course', …)` with

```js
next: { revalidate: 3600, tags: ['public-courses'] }     // client.js
tags: ['public-courses']                                 // public-courses.js:67
```

and the course webhook already invalidates that exact tag —
`lib/webhooks/courseRevalidatePlan.js:48,56` call `addTag('public-courses')`.
**Twelve** admin page routes already call `listPublicCourses` (plus one admin
component and seven public routes), so the builder routes would be joining an
existing cached read, not opening a new one. **No new fetch, no new cache key,
no new invalidation rule.**

### 6.2 KB is not a budget question

The projection costs **80 bytes per course**, so it stays under 100 KB until
roughly **1,250 courses**. The catalogue has 79, and it has grown by one since
the last count recorded in this repo (78 on 2026-08-12, per the note in
`public-courses.js`). At that rate the number is not on a curve a server-search
would rescue; it is on a curve where the projection is still four figures of
bytes a decade from now.

The comparison that matters is not against some other asset, it is against the
alternative for the same job: **6,318 bytes once, versus 1,229,727 bytes once**,
for a control whose entire requirement is a code and a label.

### And a search box over 79 rows does not need a server

`scripts/_probe-round46-search-shape.mjs`, measured through
**`filterCourseOptions` itself** rather than a re-implementation of it — that is
the rule the admin course form's pickers already run, and numbers from a
hand-written match would have described a rule nothing executes:

```
"sql"      15 match          "copilot"   5 match
"excel"    11 match          "vibe"      2 match
"ai"       14 match          "zz"        1 match
"power"    20 match          "a"        72 match

worst single character: "-" matches 78 of 79
empty query shows      79
```

The worst case is the whole list, and the whole list is 79 rows. **No result cap
is needed** — which is the one place this picker gets to be simpler than
`IconPicker`, whose 5,000-odd names forced a cap of 120 and a "showing N of M"
line to go with it.

### What the names are actually like

```
course_id     min 5  max 15  mean 9    0 of 79 contain Thai   4 of 79 mixed-case
course_name   min 16 max 68  mean 36   1 of 79 contains Thai
duplicate course_id values upstream: 0
```

And through the existing label helper:

```
Claude Cowork for Business (CLAUDE-AI)
Build Business Apps with Claude Code (VIBE-CODE-L1)
Power BI Desktop for Business Analytics (POWER-BI)

longest label: 86 chars      empty labels: 0
```

Three consequences:

- **`course_name_th` does not exist upstream.** 0 of 79 rows carry it — nor
  `course_name_en`. This is not a bug in `courseOptionFilter`, whose haystack
  simply gains an empty string, nor in `courseOptionLabel`, which falls through
  to `course_name` for all 79 (above). It *is* a live finding about
  `CourseForm.jsx:232`, which filters on `c.course_name_th`, and `:258`, which
  labels chips with it — both have been reading `undefined` since they were
  written. Out of scope to fix here; recorded because it is the difference
  between "reuse the pure filter" and "copy the form's inline picker" (§F.1).
- **The Thai machinery is defensive, not dead.** `normaliseForSearch` folds
  U+0E4D U+0E32 to U+0E33 because the decomposed spelling is present in real
  legacy data. One course name in 79 contains any Thai at all today, so the fold
  is currently unexercised against upstream — which is an argument for keeping it
  (the day a Thai name lands, it works) and against writing a second, simpler
  fold for the picker.
- **Search and label are already solved and already tested.**
  `test/pure/courseOptionFilter.test.mjs` and
  `test/render/coursePreviousCoursePicker.test.mjs` cover both. A picker that
  writes its own matching rule would be the second reader of a question that has
  one answer.

The mixed-case count has moved: `public-courses.js` records five as of
2026-08-06 (`Power-Apps`, `SQL-PG-Query`, `SQL-ADM-Tuning`, `MS-SQL-19-Prov`,
`SQL-ADM-Secure`); today it is four of 79. `scripts/audit-course-id-casing.mjs`
exists to keep that number visible and is the place to chase it. A picker makes
it moot for newly-chosen codes — it inserts upstream's own spelling verbatim, so
a code chosen from the list can never have the casing typed wrong.

---

## D. Stale codes, duplicates and order — driven, not read

`scripts/_probe-round46-stale-code.mjs`. One list authored as

```
[CLAUDE-AI, VIBE-CODE-L1, CLAUDE-AI, VIBE-CODE-L2, ZZ-ROUND46-NO-SUCH-COURSE]
   live         live       DUPLICATE     live              stale
```

driven through the real `resolveSectionData` and then the real `SectionRenderer`.

> **The first fixture proved nothing, and that is worth recording.** It was
> `[A, B, A, STALE]`. Drop the stale code and `[A, B, A]` is a **palindrome**, so
> the reversed list resolved to the identical sequence and the order check
> reported *"reversing reverses the render: true"* while being incapable of
> reporting anything else. A third distinct code fixed it. A control that cannot
> fail is not a control.

### D.1 A stale code is dropped from the render and kept in the document

```
sel   course_selector  [CLAUDE-AI, VIBE-CODE-L1, CLAUDE-AI, VIBE-CODE-L2]  (len 4)
lst   course_list      [CLAUDE-AI, VIBE-CODE-L1, CLAUDE-AI, VIBE-CODE-L2]  (len 4)
bun   bundle_courses   [CLAUDE-AI, VIBE-CODE-L1, CLAUDE-AI, VIBE-CODE-L2]  (len 4)

sections mutated by resolveSectionData : NO
sel.content.courseIds : [..., "ZZ-ROUND46-NO-SUCH-COURSE"]     ← still there
stale code in the rendered HTML        : 0 occurrences
```

Five authored, four resolved, zero trace in the output. The mechanism is one
line — `assembleResolved` in `resolveSectionRefs.js`:

```js
const ids = (Array.isArray(c.courseIds) ? c.courseIds : []).map(String);
out[s.id] = ids.map((id) => courseMap.get(id)).filter(Boolean);
```

`.filter(Boolean)` drops the miss. Nothing writes back to `content.courseIds`, so
the code itself is untouched — which is what makes the damage recoverable when
upstream restores a course or an admin fixes a typo.

### D.2 `course_card` renders the bare wrapper

```
card    (stale code)  →  resolved: null    →   84 bytes
cardok  (live code)   →  resolved: course  → 1993 bytes

a section that draws NOTHING: 84 bytes
<section class="pt-8 pb-8"><div class="mx-auto px-4 max-w-[1200px]"></div></section>
```

84 bytes is **exactly** what an empty section costs. So a `course_card` whose
code has gone stale is byte-for-byte indistinguishable from a section that draws
nothing — the failure mode round 45's editor-only empty marker was built for,
arriving by a different route.

### The requirement this puts on a picker

**A picker must display a stored code it cannot find in its catalogue, and a
save must round-trip that code unchanged.**

This is the requirement that breaks a page if it is missed, and the way to miss
it is natural: build the control as "render the selected items from the
catalogue", and a code absent from the catalogue silently has no row. The author
sees a four-item list, saves, and the fifth code is gone — permanently, because
the document no longer holds it. Today's textarea cannot do that: it shows the
stored strings and nothing else.

`IconPicker` already solved the same problem for icon names and its note says
so:

> *The trigger renders the STORED value even when it is not a known name, in the
> invalid styling — the author has to be able to see what is actually saved, and
> a control that showed "เลือกไอคอน" over a bad stored value would hide the very
> thing the warning underneath is talking about.*

The course picker inherits that rule verbatim, extended from one value to a list:
every stored entry gets a row; a row whose code is not in the catalogue shows the
code with no name and is marked, not omitted.

### D.3 Order — array position is the only authority

```
forward   ["CLAUDE-AI","VIBE-CODE-L1","CLAUDE-AI","VIBE-CODE-L2"]
reversed  ["VIBE-CODE-L2","CLAUDE-AI","VIBE-CODE-L1","CLAUDE-AI"]

reversing the array reverses the render : true
the two are NOT equal                   : true
matches upstream order                  : false
matches an alphabetical sort            : false
```

Two sections identical in every respect except the order of one array rendered in
different orders, and neither result matched any other ordering the system could
have imposed. Position is it.

Note the contrast with the *catalogue*, which `listPublicCourses` orders through
`loadCourseOrder` — the stored programme/skill arrangement, seeded (`stored order
seeded: yes`). An authored list is not subject to that ordering and must not
become subject to it: **the picker must never sort, and must never re-order on
load.** A control that displayed the selection in catalogue order would silently
rewrite the author's sequence the first time they saved.

### D.4 Duplicates render, and the two warnings do not interfere

`CLAUDE-AI` appears twice in the authored list and **twice** in the resolved
array. The fetch de-dupes (`collectRefs` builds a `Set`,
`resolveSectionRefs.js:42`) but `assembleResolved` maps **positionally**, so one
network fetch feeds two rendered cards.

This resolves a question the existing warning raises. `CourseIdsWarnings` computes

```js
const missing = wanted.length - (Array.isArray(resolved) ? resolved.length : 0);
```

If de-duplication reached the *resolved array*, three authored codes with one
duplicate would resolve to two entries and the field would report *"1 code not
found"* on a list where every code is fine. It does not: the measurement above
shows four authored-and-resolvable codes producing four resolved entries.

**So the duplicate count and the missing count are independent quantities.** A
duplicate warning can be added beside the missing warning without either one
changing the other's number — which is what makes them safe to show together.

### D.5 The empty string is inert

```
authored            ["CLAUDE-AI", ""]
resolved            [CLAUDE-AI]          ← one entry, the '' contributes nothing
stored array intact ["CLAUDE-AI",""]     ← survives the round trip
render bytes        2040                 ← one card, as if the '' were not there
```

`collectRefs` skips it (`if (id) courseIds.add(...)`), `assembleResolved` maps it
to `undefined` and filters it, and `CourseIdsWarnings` excludes it from `wanted`
as well — so it does not even inflate the missing count. It is a wart in the
stored document, not a fault in the rendered page.

---

## E. What already warns, and the mechanism to reuse

```js
// Only `null`/`[]` may warn. Collapsing to "falsy → warn" would flash "not
// found" on every keystroke's refetch, before the fetch returns. […] an author
// who sees a warning fire on correct input learns to ignore it — and a warning
// authors ignore erodes EVERY editor warning, not just this one.
```

That comment sits above the data-backed editors in `SectionContentEditor.jsx`,
and the tri-state it describes is implemented in one line:

```js
if (resolved === undefined) return null;   // fetch in flight — never warn
```

`undefined` = not fetched yet · `null`/`[]` = fetched, found nothing · array =
found. The refetch is debounced 350ms and gated on `dataRefSignature`
(`EditorProvider.jsx:57-72`), so a keystroke inside a heading does not refetch
courses at all.

**Where the gap is.** The existing warning is about *resolution*. A duplicate is
knowable from the authored array alone, with no fetch — so a duplicate warning
must **not** be gated on `resolved` at all, or it would go silent for 350ms after
every keystroke for no reason. It is a synchronous fact about a local array.

That is the reuse and the distinction in one sentence: **the same field shows
both warnings; only the resolution one consults the tri-state, because only it
depends on a fetch.**

Nothing rejects, de-duplicates or reorders anywhere in the save path.
`publishBlockers` (`lib/pageBuilder/publishReadiness.js`) checks exactly three
things — title, slug, and section count — and courses are not among them. A
duplicate warning must stay a warning: duplicates render today (§D.4), and
silently changing what a stored list means is a larger defect than the one being
reported.

---

## F. What NOT to build

### F.1 Do not copy `CourseForm`'s inline chip picker — reuse the module underneath it

There are **two** pieces of course-picking prior art in `admin/courses`, and they
are not the same quality. Getting this the wrong way round is the single largest
avoidable cost in this work.

**Reuse — `lib/courses/courseOptionFilter.js`.** Pure, no DOM, already covered by
`test/pure/courseOptionFilter.test.mjs`:

```js
filterCourseOptions(courses, query, { excludeCode, limit })  // substring over
                                                             // id + name + name_th
courseOptionLabel(course)                                    // "ชื่อ (CODE)"
normaliseForSearch(value)                                    // lower-case + สระอำ fold
```

`limit` is optional, so "no cap" (§C) needs no change to it. `excludeCode` is the
can't-reference-itself rule and is simply not passed here.

**Reuse the discipline of `CourseSearchSelect`**, whose header already states the
rule §D.1 arrives at independently, for a single value:

> *If the saved course is missing from `options` (unpublished, renamed, deleted)
> the hidden input still carries the stored code and the box shows that code
> verbatim. It is NOT blanked. Silently clearing a field because its target moved
> is the wipe-on-unrelated-edit class this repo keeps hitting.*

**Do not copy the related-courses chip picker** — the inline block at
`CourseForm.jsx:226-250`. It is the nearest-*looking* prior art and it is the
wrong shape in four ways, three of them measured:

- it **caps at five** (`if (relatedCodes.length >= 5) return;`) — authored course
  lists have no cap and no reason for one;
- it **hides already-picked courses** from the options
  (`if (relatedCodes.includes(c.course_id)) return false;`) — which makes
  duplicates unexpressible, and duplicates render (§D.4);
- it **re-implements matching inline** instead of calling `filterCourseOptions`,
  and its copy filters on `course_name_th`, a field 0 of 79 rows carry (§C) — so
  it has already drifted from the module beside it;
- its **stale-code handling is a coincidence, not a decision.** A chip whose code
  is missing from `allCourses` does display the code, via
  `codeToName.get(code) || code` (`:1022`) — but nothing *marks* it, so an
  unresolvable code is visually identical to a resolvable one whose name is its
  code. The list shape needs the code visible **and distinguishable**.

### F.2 Do not add a server-search endpoint

§C. 6.2 KB, already cached, already invalidated. A search endpoint would be a new
route, a new cache story, a new failure mode on every keystroke, and a
latency floor — to filter 79 rows that are already in the browser.

### F.3 Do not validate, reject or normalise course codes on save

The temptation is obvious once a catalogue is in the browser: the editor could
now *know* a code is bad and refuse to save it. It must not.

- **The catalogue is a snapshot and the resolver is the authority.** They are
  read at different moments through different caches; a code the picker has not
  heard of may resolve perfectly a second later.
- **A stale code is recoverable exactly as long as it stays in the document**
  (§D.1). Rejecting it at the save boundary is the one action that makes the
  damage permanent.
- The existing design already fails closed and says so: the code stays, the
  render drops it, the editor warns.

### F.4 Do not de-duplicate, and do not sort

Both would rewrite an author's array to mean something they did not write.
§D.3, §D.4. Warn; never edit.

### F.5 Do not convert `course_card` / `course_schedule` in the same step

They are a different shape — one value, not an ordered list — so they share no
code with the list control beyond the catalogue prop. Converting them alongside
doubles the surface of the step that carries the stale-code risk while sharing
none of its work. They are a later step, and they are *not* urgent: `course_card`
with a bad code already warns clearly (`ไม่พบคอร์สรหัสนี้`), which is more than
the list shape does.

### F.6 Do not fix the trailing-newline empty string by filtering the textarea

`.filter(Boolean)` inside `CourseIdsField`'s `onChange` would collapse a blank
line **as the author types it**, so pressing Enter to start a new code would
delete the line it just created. The right time to remove that wart is when the
textarea stops being the control at all — the picker builds its array from
explicit rows and cannot produce an empty one. Until then it is inert (§D.5) and
should be left alone.

### F.7 Do not put the duplicate check in `sectionLabels.js`

It is the obvious home — it already holds `sectionRendersEmpty`, the other
"predicate about a section's content" — and it is **inside the public closure**
(§0.5). A pure helper that only the editor calls does no harm there, but it moves
a decision about editor UI onto the public render path, where every future change
to it needs the public-path verification. The editor already has a private home
for this. Keep the public closure at 555.

---

## G. Build sequence

Ordered so the step that can break a page is neither first nor bundled, and so
each step is verifiable on its own.

| step | what | public closure | shippable alone |
|---|---|---|---|
| **1** | duplicate warning on `CourseIdsField` | **untouched** — editor only | **yes** |
| **2** | catalogue projection as a server prop | **untouched** — builder routes are out | **yes**, inert until step 3 |
| **3** | the picker replaces the textarea | **untouched** — editor only | yes, needs step 2 |
| 4-6 | later steps (single-value shape, and beyond) | — | — |

### Step 1 — the duplicate warning

Worth shipping whether or not the picker is ever built: it is new information
about a list an author already has, and it is the cheapest step by a wide margin.
Synchronous, no fetch, no tri-state (§E). Beside the existing resolution warning,
not instead of it.

**Why it is first:** it touches one component, adds no data flow, and cannot
change what is stored. If it is wrong, it is wrong in a warning line.

### Step 2 — the catalogue projection as a server prop

Both builder routes (`/admin/pages/builder/new`, `/admin/pages/builder/[id]/edit`)
fetch `listPublicCourses`, project to `{course_id, course_name}`, and hand it
down through `PageBuilderEditor` → `EditorProvider` → context, alongside `tier`
— the read-only-prop pattern that directory already uses.

**Why it is second and not third:** it is inert. Nothing consumes it until step 3,
so it can be measured — is the projection what actually crosses to the client? —
without any UI depending on the answer. Shipping it alone is a no-op the size of
6.2 KB.

**The authority question it raises, answered before it is built.** After step 2
there are two sources of course data in the editor:

| | catalogue prop | `resolveBuilderSectionData` |
|---|---|---|
| what it is | every course, two keys | the authored codes, fully resolved |
| what it is for | choosing | judging |
| when it is read | once, at page load | debounced, on every ref change |

They can disagree, and the design must be one where disagreement is harmless:

- **The resolver is authoritative for "does this code resolve".** The warning
  keeps reading it and nothing else. The catalogue never decides whether to warn.
- **The catalogue is authoritative for nothing.** It supplies rows to choose from
  and labels to display. A code missing from it is displayed anyway (§D.1
  requirement), so its absence is never an assertion.

A code present in the catalogue but unresolvable still warns. A code absent from
the catalogue but resolvable still renders, and still gets a name from the
resolver. Neither can silence the other because only one of them speaks.

### Step 3 — the picker

Replaces `CourseIdsField`'s textarea, reaching all three list types at once
(§A). What it must do, all of it established above:

- **display every stored code**, including ones the catalogue does not have,
  marked rather than omitted (§D.1);
- **preserve order** and make it editable — move up / move down, never sort
  (§D.3);
- **allow duplicates** — picking a course already in the list appends it again;
  step 1's warning says so (§D.4);
- **keep direct entry.** A code must remain typeable, or the picker becomes the
  only way to express a value and a code upstream has not published yet — or one
  the catalogue snapshot missed — becomes unauthorable. A code entered by hand is
  stored verbatim, exactly as the textarea stores it today.

**What it reuses.** Two parents, and they contribute different halves:

| from | what |
|---|---|
| `IconPicker` (round 14) | the *shell*: portal-free exported body so the render tier can assert on it, fixed-size dialog, non-scrolling header holding the search box with only the results scrolling and a reserved scrollbar gutter — and, through it, `SectionPicker`'s (rounds 9-13) dialog frame second-hand |
| `courseOptionFilter` | the *rule*: `filterCourseOptions` for matching, `courseOptionLabel` for the row text. Not re-implemented (§F.1) |

`IconPicker` is the right shell parent for one specific reason beyond
convenience: it is the component that already decided to **show a stored value
its own validator rejects**, and said why. That is §D.1's requirement with the
nouns changed.

**What differs, and why:**

- **No result cap.** `IconPicker` caps at 120 of ~5,000 and prints how many it is
  holding back. The worst query here matches 78 of 79 (§C), so a cap would never
  fire and the "showing N of M" line would be permanently false.
- **No group pills**, same as `IconPicker` and for the same reason — 79 courses
  have no grouping worth inventing. (`skills` and `program` exist on every row
  and would be one; that is a §F.2-shaped decision for a later round, not free.)
- **A list, not a value.** `IconPicker` is a trigger plus a dialog. This is a
  *list of rows* plus an add-dialog plus a direct-entry input, so the trigger
  shape does not carry over — only what is inside the dialog does.

**Why it is last:** it is the only step that changes what an author's actions
write into the document, and the only one that can lose a stored code.

---

## H. Tests

**None proposed for this round, because nothing was built.** The measurements
here belong to probes, and a probe that needs a live API key and a live database
cannot be a suite test — `npm test` has to pass without either.

One assertion **is** warranted, and it belongs to step 2 rather than to this
document, so it is recorded here rather than added:

> **The projection, not the payload, is what reaches the client.** The failure is
> silent and expensive: passing `items` instead of the mapped projection changes
> no behaviour, breaks no test, and ships 1.2 MB per editor load. The size ratio
> is 194.6×, so an assertion on the serialised size of the prop discriminates
> overwhelmingly — and it is self-retiring in the useful direction, because it
> goes red if someone adds a third key without thinking about the cost, not
> merely if they revert the projection.

**And one hazard to carry into step 3 rather than discover in it.**
`CourseSearchSelect`'s header records it, from a round that hit it:

> *this suite runs every file in ONE process, and a React root over jsdom leaks
> its globals into the `renderToStaticMarkup` tests that share it — 28 of them,
> measured, when this was first written that way.*

Round 45 hit the identical wall from the other direction: a jsdom drive left
inline in a test file took the suite from **5 failures to 34**, and the drive
file itself contributed zero tests. Any step-3 test that needs live effects
belongs in a child process — `test/canvasFrameAttach.case.mjs` is the worked
example — and any test that only needs markup should stay on
`renderToStaticMarkup`. If step 3 exports its dialog body portal-free as the
reuse table proposes, that will be most of them.

Two candidates were considered and rejected:

- *An assertion that the catalogue has 79 courses.* It measures upstream, not
  this repo, and would go red on a business event rather than on a code change.
  `scripts/audit-course-id-casing.mjs` is the existing precedent for keeping an
  upstream fact visible without pinning it.
- *An assertion that `course_name_th` is absent.* Same objection, and the finding
  belongs to `CourseForm`, which is out of scope here.

---

## I. Re-running the measurements

All four probes are read-only. Three need `.env.local` (upstream key and
`MONGODB_URI`); the fourth needs neither.

```
node --env-file=.env.local --import ./scripts/_probe-live-register.mjs \
     scripts/_probe-round46-course-payload.mjs      # §B  sizes, counts, key census
node --env-file=.env.local --import ./scripts/_probe-live-register.mjs \
     scripts/_probe-round46-stale-code.mjs          # §D  stale, duplicates, order
node --env-file=.env.local --import ./scripts/_probe-live-register.mjs \
     scripts/_probe-round46-search-shape.mjs        # §C  what there is to search on
node scripts/_verify-round31-public-path.mjs        # §0.5 the public closure
```

`scripts/_probe-live-register.mjs` exists because the verification suite's loader
stubs the database (§B). Use it for anything that measures data; use
`scripts/_probe-panel-register.mjs` for anything that only needs the `@/` alias.

The closure membership in §0.5 was taken with a temporary query appended to
`_verify-round31-public-path.mjs`; that script prints `closureSize` on every run,
and the membership of any file can be re-checked the same way.

### Measurement log

| what | value | date | probe |
|---|---|---|---|
| courses upstream | 79 | 2026-08-29 | `_probe-round46-course-payload` |
| courses public | 79 (0 hidden) | 2026-08-29 | same |
| full list serialised | 1,229,727 B (1200.9 KB) | 2026-08-29 | same |
| projection serialised | 6,318 B (6.2 KB) | 2026-08-29 | same |
| ratio | 194.6× | 2026-08-29 | same |
| keys per course | 37 | 2026-08-29 | same |
| mixed-case ids | 4 of 79 | 2026-08-29 | `_probe-round46-search-shape` |
| `course_name_th` present | 0 of 79 | 2026-08-29 | same |
| worst single-char query | 78 of 79 | 2026-08-29 | same |
| longest `courseOptionLabel` | 86 chars | 2026-08-29 | same |
| upstream duplicate ids | 0 | 2026-08-29 | same |
| public closure | 555 files | 2026-08-29 | `_verify-round31-public-path` |
| empty section render | 84 bytes | 2026-08-29 | `_probe-round46-stale-code` |
