# Choosing rounds, instead of counting them — `course_schedule`

**Round 63. Survey and proposal. Nothing was built.**
Every number below was measured on this clone against live MSDB on
**2026-08-31**, by six read-only probes committed alongside this file
(`scripts/_measure-round63-*.mjs`) plus one audit that already existed
(`scripts/audit-registration-round-reachability.mjs`).

**The ask.** Today the author says *how many* rounds a `course_schedule` shows
(`จำกัดจำนวนรอบ (0 = ไม่จำกัด)`). They want to say *which*. If a chosen round
later disappears from MSDB, it should still be **shown**, but it may be
**un-clickable**.

**The one-line answer.** The identifier the design needs exists and is sound
(§B). The mode should be added beside the count, not instead of it (§E). But the
orphan rule the ask states is not mainly a rule about *deleted* rounds — **63.4%
of round ids this codebase already stores are unreachable, and 85% of those are
unreachable because the round simply happened** (§C.1). The brief's central
recommendation is therefore that the author decide what an *elapsed* chosen
round should say, because that — not upstream deletion — is what they will see.

---

## A. How rounds are fetched today — the whole chain

### A.1 The chain, end to end

| # | Where | What happens |
|---|---|---|
| 1 | `PageBuilderView.jsx:64` (server component) | `await resolveSectionData(page.sections)` — one pre-pass, above the renderer |
| 2 | `resolveSectionRefs.js:collectRefs` (pure) | walks the tree; for `course_schedule` collects `content.courseId` into `scheduleCourseIds`. The value is the **short course code** (`MSE-L1`), not an ObjectId |
| 3 | `resolveSectionData.js:96` | de-dupes schedule codes against card/list codes into one `allCourseIds` set |
| 4 | `resolveSectionData.js:40 fetchCourses` | `getCourseByCode(code)` in chunks of 10, `Promise.allSettled` → `courseMap: code → course` |
| 5 | `resolveSectionData.js:73 fetchSchedules` | **runs after** step 4 because it needs `courseMap.get(code)._id`. `listSchedulesByCourse(oid, { limit: 20 })` per code, chunked 10 |
| 6 | `api/schedules.js:listSchedulesByCourse` | `aiFetch('/schedules', { params: { course, limit }, revalidate: 1800, tags: ['schedules'] })` — **no `status` param**, so upstream applies its own public filter |
| 7 | `api/schedules.js` (post-`unwrap`, in our JS) | `excludeStartedRounds(items, siteTodayKey())` — a round vanishes the moment its **first training day** arrives, Bangkok-pinned |
| 8 | `resolveSectionRefs.js:127 assembleResolved` | `out[s.id] = Number(c.limit) > 0 ? rows.slice(0, limit) : rows` |
| 9 | `sections/course_schedule.jsx:CourseScheduleSection` | draws what it is handed. `if (!schedules.length) return null` |

The **editor canvas** takes the identical path through
`resolveBuilderSectionData` (`actions/pageBuilder.js:1586`), an admin-gated
server action, debounced 350 ms in `EditorProvider.jsx:58` and keyed on
`dataRefSignature`. Same resolver, same data shape, one renderer.

### A.2 When it is read

| Surface | Directive | Effective freshness of a round |
|---|---|---|
| `/[...slug]` | `revalidate = 3600` | ISR 1 h; the `/schedules` fetch itself is `revalidate: 1800` and tagged `schedules` |
| `/promotions/[slug]` | `revalidate = 3600` | same |
| `/preview/[slug]` | `dynamic = 'force-dynamic'`, `revalidate = 0` | every request |
| editor canvas | server action | every signature change, +350 ms |

`revalidateTag('schedules')` fires from `actions/schedules.js:78` and
`webhooks/handlers.js:170`, so an upstream write can cut the 30-minute fetch
window — **but not the page's own 1-hour ISR window.** Nothing revalidates
`/[...slug]` on a schedule change. **A published page's rounds can be up to one
hour stale today.** That matters for §D.

### A.3 What the count control actually filters

`limit` is applied at **step 8**, in `assembleResolved`, as a `.slice(0, n)` over
the *already ordered, already narrowed* row set. It does not reach upstream, does
not change what is fetched, and cannot re-order. `fetchSchedules` sends a fixed
`limit: 20` to MSDB regardless — comfortably above the observed maximum of 7
rounds on any course, so nothing is being truncated upstream today.

### A.4 The measurements — rounds, the equivalent of round 46's course payload

Live, `getAllSchedules({ status: PUBLIC_SCHEDULE_STATUSES })`, **88 upcoming
rounds across 44 courses**:

| | |
|---|---|
| public courses in the catalogue | **79** |
| courses with ≥1 upcoming round | **44** |
| courses with **none** | **35** (44.3%) |
| rounds per course | min **1**, median **2**, mean **2.00**, max **7** |
| histogram (rounds → courses) | `1→19, 2→16, 3→3, 4→4, 5→1, 7→1` |

**A round object has 9 keys**, all present on 88/88:

```
_id  course  dates  status  type  signup_url  createdAt  updatedAt  __v
```

```json
{
  "_id": "692e9b32d2a522899d55f83e",
  "course": { "_id": "68d4f8c3581cb35029059815", "course_id": "POWER-BI",
              "course_name": "Power BI Desktop for Business Analytics",
              "course_trainingdays": 2, "course_price": 8500,
              "program": {...}, "skills": [...], "sort_order": 1 },
  "dates": ["2026-09-03T00:00:00.000Z", "2026-09-04T00:00:00.000Z"],
  "status": "open",
  "type": "hybrid",
  "signup_url": "https://www.9experttraining.com/registration/public?class=2596&course=2205&t=hybrid",
  "createdAt": "2025-12-02T07:54:26.948Z",
  "updatedAt": "2026-03-24T06:59:53.266Z",
  "__v": 1
}
```

Distributions: `status` — open 82, nearly_full 4, full 2. `type` — hybrid 57,
classroom 31. `signup_url` non-empty on **77/88**; **11 rounds have none**.

**Serialised size**, per round: min 665 B, median **777 B**, max 840 B, mean 773 B.

The whole 88-round payload is 68,121 B, and **58.1% of that (39,601 B) is the
populated `course` sub-object repeated once per round** — the same shape round 46
found bloating the course list. Projections:

| shape | bytes (88 rounds) | mean/round |
|---|---|---|
| full rows | 68,121 | 774 |
| minus `course`/`__v`/timestamps | 20,072 | 228 |
| picker option `{_id, dates, status, type}` | 11,893 | **135** |
| orphan snapshot `{_id, dates, type, signup_url}` | 18,636 | 212 |
| **id only** | 2,377 | **27** |

### A.5 The calendar — how fast a chosen round stops existing

Days from 2026-08-31 to a round's **first** training day (the moment step 7 drops
it):

```
min 3   p25 24   median 51   p75 79   max 457
within  30 days: 27/88      within  90 days: 71/88
within  60 days: 53/88      within 180 days: 86/88
```

**Half of everything an author could choose today is gone within seven weeks.**
This is the number the whole orphan design has to answer to.

---

## B. Is there a stable identifier? — **Yes: `_id`. And it is not the dates.**

This is the question the design rests on, so it is answered with evidence rather
than with the shape of the JSON.

**`_id` is present on 88/88 rounds and distinct on 88/88.** It is a Mongo
ObjectId on the `Schedule` document.

**It survives upstream edits, and that is measured, not assumed:**

- **51 of 88 rounds have `updatedAt` strictly later than `createdAt`.** They were
  modified *in place*. A delete-and-recreate would have reset `createdAt`.
- **`__v` distribution: `0 → 49`, `1 → 39`.** Mongoose bumps the version key when
  a **document array** is modified through `save()`. The `Schedule` document has
  exactly one array: `dates`. So **39 of 88 rounds have had their dates mutated
  while keeping the same `_id`** — which is precisely the "someone corrects a
  typo upstream" scenario the ask worries about. The `_id` survived it. The dates
  did not.
- **80 of 88 rounds were touched at all since 2026-01-01.** These documents are
  actively edited; this is not a static table.

**The dates are not a viable handle, even though they look unique today.**
Measured: within a course, **0 collisions** on the full date array and **0
collisions** on the first date. Uniqueness is not the problem — *stability* is,
and the `__v` measurement above shows dates changing under 44% of rounds.

**The strongest evidence is that this codebase already bets on `_id`, in
production, where being wrong costs money.** `registrations` stores the round as
`classId` (the schedule `_id`), and `/registration/public?class=<_id>` is the
public deep link `course_schedule.jsx:scheduleHref` already emits. A page-builder
selection is a *strictly weaker* use of the same handle than a paid registration.

**Do not use `signup_url`.** It carries a *second, legacy* id space
(`?class=2596&course=2205` — the old site's numeric ids, present on 77/88, absent
on 11/88). Two identifier spaces for one round is a trap, and one of them has
holes.

**Verdict: identify a chosen round by its MSDB `_id`, stored as a plain string.**

---

## C. What an orphaned round looks like

### C.1 The finding that reframes the ask

`scripts/audit-registration-round-reachability.mjs` already measures exactly this
question against real stored ids. Run today, over 41 registrations holding 41
round ids across 7 courses:

```
reachable — offered in the select           15
UNREACHABLE                                 26   (63.4%)
    · label parses to a PAST date           22
    · course resolves, round not listed      4
    · course_id does not resolve             0
```

**63.4% of stored round ids are already unreachable — and 22 of the 26 (85%) are
unreachable because the round happened, not because anyone deleted it.**

That, plus §A.5's median 51-day horizon, changes what "orphaned" means here. The
author's mental model is *"MSDB dropped my round"*. The measured reality is
*"my round ran"*. A chosen-rounds section, left alone, converges on a page that
advertises dates in the past — and the author's rule ("still show it") is what
makes it converge there.

**This is the decision the author has to make, and it is not the one they were
asked.** Three options, and the brief recommends the third:

| | behaviour | consequence |
|---|---|---|
| a | show every chosen round forever, elapsed ones un-clickable | a promo page silently becomes a list of past dates. No one is alerted |
| b | drop a chosen round once it elapses | matches today's behaviour; the author's "still show it" is not honoured, but nothing lies |
| c | **distinguish the two orphan causes** — drop on *elapsed*, show-un-clickable on *vanished-while-still-future* | honours the ask for the case the ask is actually about, and does not build a past-dates machine |

**(c) is recommended.** It is also cheap: the snapshot already stores `dates`, so
"has this elapsed?" is answerable locally from the snapshot with the same
`siteTodayKey()` boundary `excludeStartedRounds` already uses — no fetch, one
existing helper.

### C.2 What a snapshot can honestly say, and what it cannot

To draw a row it can no longer fetch, the renderer needs what it draws today:
date range, delivery type, status badge, href.

| field | can a stored snapshot say it? | why |
|---|---|---|
| **dates** | ✅ **yes**, as *last known* | it is the only case where there is no live truth to contradict. §D's labelling rule applies |
| **delivery type** (`classroom`/`hybrid`) | ✅ yes | a property of how the course is run, not of the round's state |
| **the course** | ✅ yes | it is `content.courseId`, authored, already stored |
| **status badge** (`open`/`nearly_full`/`full`) | ❌ **NO** | this *is* the seats-left signal. A stored `open` on a round that filled is a lie the visitor acts on |
| **seats remaining** | ❌ no | never in the payload at all — not one of the 9 keys |
| **is registration open** | ❌ no | derivable only from live `status` |
| **registration href** | ❌ **no, and this is the point** | `/registration/public?class=<_id>` for an `_id` MSDB no longer has renders a blank step 1 — the exact defect `api/schedules.js` documents at length. `signup_url` is a legacy link with no better guarantee |

**So the honest orphan row is: date range + delivery type, no badge, not a link.**
That is exactly "shown but un-clickable", and it falls out of the honesty
analysis rather than being imposed on it.

**Therefore the stored snapshot must contain `{ id, dates, type }` and must NOT
contain `status` or `signup_url`.** Storing a field the renderer must never draw
is how it eventually gets drawn.

### C.3 The rule that stops the snapshot going stale invisibly

**Live data always wins. The snapshot is read only for an `_id` the live fetch
did not return.** Never before it, never merged with it, never preferred to it.

That single rule answers the strongest objection to storing anything at all
(§I.1): a snapshot that is only ever consulted when there is no live truth cannot
disagree with live truth. For the ~44% of rounds whose dates get corrected
upstream, the correction shows immediately, because those rounds are still live.

---

## D. The freshness contract — every place the promise is made

Round 18's rule: *a control or a hint that claims something nothing honours is a
lie the author cannot detect.* The promise currently made is that the published
page reads fresh at visit time. Under chosen rounds that stops being true for the
chosen set — and §A.2 shows **it is already an overstatement today**.

| # | Where | What it says now | What is wrong with it | What it must say |
|---|---|---|---|---|
| 1 | `SectionContentEditor.jsx:693 SampleLabel` | *"ตัวอย่าง ณ เวลาแก้ไข — หน้าที่เผยแพร่จริงจะดึงข้อมูลใหม่**ตามเวลาที่ผู้เข้าชมเปิดหน้า** จำนวนและรายการที่แสดงจริงอาจต่างจากนี้"* | (a) already overstated — ISR is 1 h, not per-visit (§A.2); (b) **shared with `course_list`'s derived sources** (call site `:739`), so editing it for `course_schedule` silently rewords a different type | split into two labels, or take a prop. The `course_schedule` variant must stop promising per-visit reads |
| 2 | same file, `:779` | the count field label `จำกัดจำนวนรอบ (0 = ไม่จำกัด)` | becomes a dead control the moment `source='manual'` — round 18's exact defect | hide it entirely under `manual`. Do not grey it; do not leave it reading a value nothing honours |
| 3 | same file, `:775` `CourseSelectPicker` hint | *"…จะดึงรอบที่เปิดรับสมัครของคอร์สนี้"* — "will fetch this course's open rounds" | true under `upcoming`, false under `manual` (it draws the chosen ones) | branch on mode |
| 4 | same file, `:783` red warn | *"ไม่พบรอบที่เปิดรับสมัครของคอร์สนี้ตอนนี้ — section นี้จะไม่แสดงผลบนหน้าเว็บ"* | under `manual` + a snapshot, the section **does** render — the warning would be false | branch on mode; see §H |
| 5 | `schemas/sections/dynamic.js:40-46` | *"Its rows are request-time-derived … so it is canvas-FAKE"* | becomes half-true: under `manual` the *set* is authored, only each row's live state varies | rewrite for two modes |
| 6 | `sections/course_schedule.jsx:12-16` | *"the row set is a function of REQUEST time … the canvas can only show an edit-time SAMPLE"* | under `manual` the row **set** is stable and knowable at edit time — the canvas is no longer FAKE for the set | rewrite; note the set is canvas-EXACT and the per-row state is canvas-FAKE |
| 7 | `docs/page-builder-status.md:126` and `:215` | lists `course_schedule` flatly under "set/rows are a function of request time" | same | qualify per mode |
| 8 | `test/render/courseSelectPicker.test.mjs:224` | asserts `'ตัวอย่าง ณ เวลาแก้ไข'` appears for `course_schedule` | **pins the copy** — any rewording turns this red, which is the test working | update deliberately, with the reason in the diff |

**Two of these are the real trap.** #1 is a *shared component*: one edit changes a
promise made about a different section type. #2 is a live control that would keep
displaying and keep accepting a number nobody reads.

**And #1 should be corrected for its existing overstatement regardless of whether
any of this gets built** — the published page does not read fresh per visit
today; it reads at most hourly (§A.2). That correction is independent of
everything else in this brief and is step 1 of §K.

---

## E. One mode or two? — **Two.**

**Recommendation: keep the count and add selection beside it.**

The count mode has a live purpose, and it is measured. Scanning
`page_builder_pages` (5 documents, 109 sections):

```
course_schedule sections stored: 3
  limit value distribution: {"0": 1, "1": 2}
  courses: MSE-L1, VIBE-CODE-L2
```

**Two of the three carry `limit: 1` — "show the next round".** That is a
*standing instruction*: it stays correct forever with no author intervention. A
selection of specific rounds is a *snapshot instruction*: given §A.5's median
51-day horizon, it needs re-editing roughly every seven weeks or it decays. These
are different things and both are wanted.

Two further reasons:

- **`course_card` wants the count mode, not the selection** — round 58 step 7
  (`docs/promotion-page-coverage.md:315`) is "show the next round", a
  `showRounds` boolean over the same fetch. Removing the count would orphan the
  one unbuilt feature that shares this machinery (§J).
- **Precedent exists.** `course_list` already carries a `source` discriminator
  with `'manual'` meaning *the author named them explicitly* (`dynamic.js:34`).

**The discriminator: reuse the key name `source`, values `'upcoming' | 'manual'`,
default `'upcoming'`.**

- `'manual'` keeps the meaning it already has on `course_list` — the author named
  them.
- **`dataRefSignature` already reads `c.source ?? ''` for every data-backed type,
  `course_schedule` included** (`dataRefs.js:38`). So the canvas already refetches
  when this key changes. **Zero change to `dataRefs.js`.** A new key name would
  need one.

**What happens to the three sections stored today:** nothing. None carries
`source`; all read it back **absent**; absent means `'upcoming'`; `'upcoming'` is
the current code path unchanged. **No migration, no backfill, no write.**

---

## F. What is stored

Round 56 §H's rule: *a field that adds something no page has shown defaults OFF,
and absent means OFF.* Every key here is that kind.

```js
const courseScheduleContent = z.object({
  courseId: z.string().default(''),
  limit:    z.number().int().min(0).default(0),

  // NEW
  source:   z.enum(['upcoming', 'manual']).default('upcoming'),
  roundIds: z.array(z.string()).default([]),
  roundSnapshots: z.array(z.object({
    id:    z.string(),
    dates: z.array(z.string()).default([]),
    type:  z.string().default(''),
  })).default([]),
}).passthrough();
```

| key | type | default | **absent must mean** | why every stored section renders byte-identically |
|---|---|---|---|---|
| `source` | `'upcoming' \| 'manual'` | `'upcoming'` | **`'upcoming'`** — today's path exactly. Read it `=== 'manual'`, never `!== 'upcoming'` | all 3 stored sections lack it; the `manual` branch is unreachable for them |
| `roundIds` | `string[]` | `[]` | **`[]`**, and under `'upcoming'` it is **ignored entirely** | not read on the `upcoming` path |
| `roundSnapshots` | `{id,dates,type}[]` | `[]` | **`[]` → no orphan can be drawn; a lost round simply drops** — which is today's behaviour, so absent is the safe reading | not read on the `upcoming` path |

**`source: 'manual'` with an empty `roundIds` renders nothing** — fail closed, the
same way an unset `courseId` does today (`sectionRendersEmpty` already encodes
that shape).

**`limit` is honoured only under `'upcoming'`.** It keeps its stored value under
`'manual'` rather than being cleared, so switching mode and back is lossless —
but §D#2 requires the *control* to be hidden, not merely ignored.

**`roundSnapshots` is keyed by `id`, not positional.** It is a *sidecar* to
`roundIds`, written when a round is picked and refreshed on every save while the
round is still live. A `roundIds` entry with no matching snapshot degrades to
"drop it" — never to a half-drawn row.

**The byte-identical claim must be proved the way round 50 proved its own:**
render all 3 stored `course_schedule` shapes against the pre-change component and
show zero differing bytes. Not asserted — measured.

---

## G. The control's shape — and the dependency finding

**The finding: the round list is not a catalogue, and it must not become one.**

Round 47's catalogue prop works because the course list is *page-global* (79
rows, one fetch at editor load, 6,318 B projected). Rounds are not: they are
*per-course*, and the course is chosen **in the same section**, by a control
sitting **directly above** the round picker. A catalogue of all 88 rounds would be
68 KB unprojected, and 87 of 88 rows would be wrong for any given section.

**But nothing new needs fetching, because the editor already has the rounds.**

`resolveBuilderSectionData` already returns, for each `course_schedule` node, that
course's rounds — and `CourseScheduleEditor` already receives them as its
`resolved` prop, which it uses today only to decide whether to show the "no open
rounds" warning. **`resolved` is the round picker's option list: already
resolved, already debounced, already re-fetched when `courseId` changes** (via
`dataRefSignature`, which includes `courseId`).

**Consequence — one design decision falls out of this, and it goes against local
precedent:**

> **The selection filter belongs in the RENDERER, not in `assembleResolved`.**

Today `limit` is applied in the resolver (`assembleResolved:127`). If the
selection were applied there too, `resolved` would arrive at the editor *already
filtered to the chosen rounds* — and the picker could no longer offer the
unchosen ones. The fixes would be to change the `data` shape (breaking the
one-shape-both-sides invariant), or to add a second admin action (a fetch that
already happened).

Filtering in the renderer instead:

- the picker's options are **free** — `resolved` is the full row set;
- **`roundIds` never needs to enter `dataRefSignature`** — changing the selection
  changes what is *drawn*, not what is *fetched*, and React re-renders anyway. No
  network round-trip per checkbox;
- the public cost is nil: the resolver already fetches up to 20 rounds
  server-side; drawing 2 of 7 discards ~4 KB **that never crosses to the browser**
  (`course_schedule.jsx` is a server component with no client bundle,
  deliberately — see its header).

**`limit`'s existing resolver-side slice does not move.** Byte-identical rule.

**The control:** a checkbox list of the rounds in `resolved`, each row labelled
with `formatRoundDays(dates, { showMonth: true })` — the existing pure module the
renderer already uses, so the picker and the page read the same label from the
same code. Order is upstream's, unchanged. Selection order is **not** preserved;
rows draw in fetch order, as they do today.

**No search box, no typing.** 44 courses have rounds; the busiest has 7; the
median is 2. A filter box over a median of two checkboxes is furniture. And
hand-typing an ObjectId is §I.2.

**Tri-state, exactly as today's `emptySample` already is:** `undefined` = still
resolving (show nothing, not "no rounds"); `[]` = fetched, none; array = the
options. This is the same tri-state `CourseScheduleEditor` handles now, extended
from one boolean to a list.

**The dependency, stated for the build:** the picker must render *disabled* with
an explanatory line when `courseId` is empty, because there is nothing to pick
from. It must not render as an empty list, which reads as "this course has no
rounds".

---

## H. The empty case, today — inherited unchanged

Resolved live through the real `resolveSectionData`:

```
MSE-L1         limit=1  →  1 row   (2026-09-10 – 09-11, open)
VIBE-CODE-L2   limit=0  →  2 rows
MAKE-L1        limit=0  →  0 rows   ← a real, public course with no open rounds
NOPE-XX        limit=0  →  0 rows   ← a code MSDB does not have
```

**On the public page:** `CourseScheduleSection` returns `null`. The section
disappears — no heading, no empty state, no gap. `fetchSchedules` is fail-closed
by design: an unresolvable code and a failed `/schedules` call both produce `[]`.

**In the editor:** the canvas draws nothing, and the panel shows a red `Warn` —
*"ไม่พบรอบที่เปิดรับสมัครของคอร์สนี้ตอนนี้ — section นี้จะไม่แสดงผลบนหน้าเว็บ"* — with
`invalid` set on the course picker.

**Two things are worth writing down:**

1. **The two causes are indistinguishable and the copy knows it.** The comment at
   `SectionContentEditor.jsx:764` says so explicitly: the warning states the
   observable ("no open rounds") rather than guessing between "bad code" and
   "real course, none open". That was the right call and it stays right.
2. **This is a common state, not an edge case: 35 of 79 public courses (44.3%)
   have no upcoming round at all.** An author picking a course from the catalogue
   has a better-than-two-in-five chance of landing on one.

**What chosen-rounds inherits:** the same `[]`. Under `source='manual'`, an empty
`resolved` means the picker has nothing to offer *and* every chosen id is orphaned
at once — which is the §C.1 elapsed case arriving in bulk. §D#4 notes the red
warning becomes false under `manual` if a snapshot renders; it must branch.

---

## I. What NOT to build

### I.1 Do not store a round snapshot the renderer reads *before* live data — but a fallback-only snapshot is fine

**The objection is real and it is specific.** A snapshot read preferentially goes
stale invisibly: **39 of 88 rounds have had their `dates` mutated in place** (§B).
A page-builder copy would be silently wrong on ~44% of rounds, and nothing would
go red.

**But that objection is about *precedence*, not about *storing*.** §C.3's rule —
live always wins, the snapshot is consulted only for an `_id` the live fetch did
not return — makes the two sets disjoint by construction. A snapshot can only
disagree with live data if it is ever read alongside it, and it never is.

**What is genuinely forbidden:** storing `status` or `signup_url` in the snapshot
(§C.2). Those are the fields that would be *wrong in a way a visitor acts on*, and
a stored field that must never be drawn is a field that eventually gets drawn.

### I.2 Do not let an author hand-type a round

`CourseSelectPicker` deliberately allows typing a course **code** — `MSE-L1` is
short, meaningful, memorable, and correctable by eye. A round's identifier is
`692e9b32d2a522899d55f83e`. A 24-character hex string is not something an author
can compose, verify, or debug, and there is **no second handle to fall back on**:
`signup_url`'s legacy numeric id is absent on 11 of 88 rounds (§B) and belongs to
a different id space.

Round 47's argument for typed entry was that *a code absent from the catalogue
still displays and still saves* — a real escape hatch, because catalogue absence
asserts nothing. **There is no equivalent escape hatch here.** A round absent from
`resolved` is absent because upstream does not have it, which is the one thing the
resolver *is* authoritative about. Typing would let an author enter an id that can
never resolve, and the failure would present as an orphan — the exact state §C is
trying to make meaningful.

### I.3 Do not try to keep an orphaned round clickable

Three routes, all dead:

- **`/registration/public?course=X&class=<_id>`** — this is the deep link
  `scheduleHref` emits today. `api/schedules.js` documents at length that a
  `?class=` link to a round the feed does not return **renders a blank step 1**.
  Sending a visitor there is worse than not linking.
- **`signup_url`** — absent on 11/88, and points at the legacy site with no
  guarantee the legacy class id still resolves.
- **the course page** — a *different destination* wearing the round's clothes. A
  visitor clicking a date expects that date.

The author already reached this conclusion ("it may be un-clickable"). It is
recorded here as *measured* rather than *conceded*, so a later round does not
reopen it.

### I.4 Do not preserve the author's selection order

Rows draw in fetch order today. Making selection order load-bearing means storing
an ordering, building a reorder control (`ItemList`'s focus-management machinery —
`SectionContentEditor.jsx:800+`), and deciding what happens when an orphan sits
mid-list. Over a median of 2 rounds. Not now.

### I.5 Do not add a per-course rounds endpoint or a rounds catalogue prop

§G: the editor already has the rounds. A new action would re-fetch what
`resolveBuilderSectionData` returned 350 ms ago; a catalogue prop would ship 68 KB
of which 87/88 rows are wrong for any one section.

---

## J. `course_card` wanted something adjacent, not the same thing

Round 58 step 7 (`docs/promotion-page-coverage.md:96, 207, 315, 354`) proposes
`course_card.showRounds` — *"show the next round's dates"* — and prices it as
*"widening the existing schedule fetch to cover cards that ask for it"*, sequenced
last because it is the only request-time piece.

**Where they overlap — and it is the expensive half:**

| shared | detail |
|---|---|
| the fetch | both need `getCourseByCode` → `listSchedulesByCourse`, the step-4→step-5 two-phase in `resolveSectionData` |
| `collectRefs` | `course_card` would need to add its `courseId` to `scheduleCourseIds` when `showRounds === true` — the same set `course_schedule` fills |
| the date label | both draw `formatRoundDays`, already a shared pure module |
| the freshness copy | both drag in §D's `SampleLabel` — and `course_card` inherits **the same overstatement** |

**Where they do not overlap — and this is why the mode recommendation matters:**

`showRounds` is a **boolean over a derived set** ("the next one"). It is the
**count mode**, at `limit: 1`. It is not a selection and should never become one:
a card showing one auto-advancing next date is a standing instruction that never
decays, which is the whole point of it.

**So the two share a mechanism, and §E is what protects it.** If round 63 had
replaced the count with a selection, round 58 step 7 would have had to either
reintroduce the count under another name, or ship a card whose "next round" the
author has to re-pick every seven weeks. **Keeping both modes is the decision that
keeps step 7 cheap.**

**One concrete instruction for whoever builds step 7:** the widening of
`collectRefs`/`fetchSchedules` should land in **step 3 below**, where
`course_schedule`'s resolver is already open, rather than being redone later.
Nothing else about `course_card` needs to move.

---

## K. Build sequence

Public-render-path work is **isolated to steps 3 and 5**. The riskiest step is
**5**, and it is last.

| # | Step | Touches | Risk | Independently shippable? |
|---|---|---|---|---|
| **1** | **Fix the freshness copy for what is true *today*.** `SampleLabel` promises a per-visit read; §A.2 measures ISR at 1 h. Split the shared label so `course_schedule` and `course_list` can diverge later. Update `courseSelectPicker.test.mjs:224` with the reason in the diff | editor copy + one test | none — no render path | **YES.** Worth shipping alone even if nothing else is built |
| **2** | **Schema + the pure filter.** Add `source`/`roundIds`/`roundSnapshots` (§F). Add a pure `chooseRounds(rows, content)` helper beside `resolveSectionRefs`, fully tested. **Nothing reads it yet** | `schemas/sections/dynamic.js`, one new pure module, tests | low — unreachable for every stored doc, since none carries `source` | **YES.** Byte-identical by construction; carry round 50's proof over all 3 stored shapes |
| **3** | **Renderer honours `source='manual'` (no orphans yet).** `CourseScheduleSection` calls `chooseRounds`. A chosen round the fetch lost simply drops — i.e. today's behaviour. **Optionally fold in `course_card`'s `collectRefs` widening (§J)** while the resolver is open | `sections/course_schedule.jsx` — **first public-path step** | low–medium — one branch, guarded by a discriminator no stored doc has | **YES.** Ships dark: the mode is honoured but not yet offerable |
| **4** | **The editor control.** Mode switch, checkbox list over `resolved` (§G), snapshot sidecar written on pick. Hide the count field under `manual` (§D#2); branch hints #3 and #4 | `SectionContentEditor.jsx`, `CoursePicker.jsx` | medium — client component; **restart the dev server and hard-reload before trusting any UI symptom** (round 62's stale Server Action ID) | **YES**, and this is the first step an author can see. See the coupling note below |
| **5** | **The orphan row.** Draw a chosen round the fetch no longer returns: dates + type, **no badge, not a link** (§C.2). Split elapsed from vanished per §C.1(c). Live always wins (§C.3) | `sections/course_schedule.jsx` — **second and riskiest public-path step** | **highest** — the only step that draws a shape no page has ever drawn, and the only one whose correctness is a claim about honesty rather than about bytes | **YES**, technically |

**Why 5 is last rather than first.** It is the only step that adds a new visual
shape to the public path; it is the only one that cannot be proved by a
byte-identical render; and it is the only one whose design (§C.1) is still an open
question for the author. Everything before it is either invisible or provably
inert.

**The one coupling, stated plainly:** step 4 without step 5 gives the author a
working selection whose chosen rounds silently vanish as they elapse — which is
*exactly today's behaviour* and therefore not a lie, but it is not the ask either.
**Ship 4 and 5 together, or ship 4 while telling the author in the panel that a
passed round disappears.** Do not ship 4 while claiming the ask is done.

**Before step 5, the author must answer §C.1:** should an *elapsed* chosen round
stay on the page? The brief recommends **no** — drop on elapsed, show-un-clickable
on vanished-while-still-future — because §A.5 says half of everything choosable is
gone within seven weeks, and (a) builds a machine for advertising past dates.

---

## Tests

**One self-retiring assertion is warranted, and it is not about the design — it is
about `_id`.**

Everything in §B rests on the schedule `_id` being stable and present. That is
measured today (88/88 present, 88/88 distinct, 51/88 edited in place with the id
intact) but it is an assumption about an upstream system this repo does not own.
Round 62's lesson was that a UI symptom with no code path behind it costs a round;
the equivalent here is a selection feature that silently stops matching anything
because upstream started re-issuing ids.

> **Assertion:** with `source='manual'` and a `roundIds` list, at least one chosen
> id resolves against `resolveSectionData`'s live rows for a course known to have
> rounds — else fail loudly naming `_id` instability as the cause.
>
> **Retire it when:** a `roundIds` selection has survived two upstream schedule
> edits in production without an unexplained orphan, *or* upstream publishes a
> stability guarantee for `Schedule._id`.

**It should be added in step 2, not now.** There is nothing to assert against until
`roundIds` exists — an assertion written today would test a shape no document has.
**No test is added by round 63.**

---

## What was measured, and how to re-measure it

| probe | answers |
|---|---|
| `scripts/_measure-round63-rounds.mjs` | §A.4 — key set, sizes, rounds per course |
| `scripts/_measure-round63-identity.mjs` | §B — `_id` presence/distinctness, in-place edits, `__v`, date collisions, §H's 35/79 |
| `scripts/_measure-round63-proj.mjs` | §A.4 projections, §G's payload argument |
| `scripts/_measure-round63-horizon.mjs` | §A.5 — the calendar |
| `scripts/_measure-round63-stored.mjs` | §E, §F — what is stored in `page_builder_pages` today |
| `scripts/_measure-round63-h.mjs` | §H — the empty case through the real resolver |
| `scripts/audit-registration-round-reachability.mjs` *(pre-existing)* | §C.1 — the 63.4% |

All read-only. None writes, none has an `--apply`.
