# Promotions corpus — phase A: measurement of every "promotion" source

Measured 2026-09-12T18:06Z (2026-09-13 01:06 Asia/Bangkok) on branch `staging` at `a880feed`,
against the live database `9exp_genesis` with read-only queries. Every count below is
measured unless it is marked **hypothesis** (derived from reading code without running it).

Purpose: decide what a read-only corpus endpoint for the chatbot could serve *today* as data,
what is typed by hand in page-builder sections, and what must be built first.

---

## 0. Headline

There are not three sources of "promotion" on genesis. There are **six**, and they disagree
about what "live" means:

| # | Source | Storage | Liveness rule used by the site today | Rows | Live now |
|---|---|---|---|---|---|
| 1a | Builder promotion pages | `page_builder_pages` (`pageType: promotion`) | `isPubliclyVisible(page, now)`: status + `publishStartDate/EndDate` | 6 | **1** |
| 1b | Advanced-HTML promotion pages | `custom_pages` (`pageType: promotion`) | `status === 'published'` only — the model has no date window | 1 | **1** |
| 1c | MSDB mirror | `promotions` (cron-synced from MSDB) | `is_active === true` — an admin flag, not a date | 21 | **0** (12 are inside their date window) |
| 1d | Promotion banners | `promotion_banners` | `is_active` | 6 | 1 |
| 2 | Early Bird bindings | `early_bird_configs` | course page: `is_active && deadline >= now` | 5 | **0** by deadline; 3 by `is_active` |
| 3 | Masterclass batches | `masterclass_batches` | `resolveBatchPrice`: `early_bird_active && price set && deadline > now`, plus batch `status ∈ {open, full}` | 4 | **2** early birds live (1 visible: the other's batch is `draft`) |

What `/promotions` renders right now: **2 cards** (1a + 1b) and **1 banner** (1d, pointing at
the masterclass). The brief's "at least three live offers" is those three surfaces; the MSDB
block contributes nothing because every mirrored row has `is_active: false`.

What the chatbot's index holds: **1 promotion** (MSDB `/api/promotions` → `yearly-promotion`).
Everything the site actually sells as a live deal today — the masterclass early bird at 9,030
and the two bundle prices on the (now closed) Claude bundle page — is genesis-only data that
MSDB never sees.

---

## 1. Source 1 — promotion pages

### 1a. Builder pages (`page_builder_pages`, `pageType: 'promotion'`)

**Loader** ([src/lib/promotions/getPromotions.js](../src/lib/promotions/getPromotions.js)
`getActiveBuilderPromotions`): Mongo prefilter `status ∈ {published, scheduled}`, projection of
`slug title pageType status promotionOrder promotionCover publishStartDate publishEndDate
createdAt`, then the JS gate `selectVisiblePromotionPages` →
`isPubliclyVisible(page, now)` from [src/lib/pageBuilder/visibility.js](../src/lib/pageBuilder/visibility.js).
Rule: `published` + inside `[publishStartDate, publishEndDate]`; `scheduled` + `now >= start`;
past `publishEndDate` → not visible; `draft/closed/archived` → never.
**ISR:** `/promotions` has `revalidate = 3600` — a page becomes visible/invisible up to an hour late.

**Measured: 6 pages, 1 visible now.**

| slug | status | window (UTC) | `promotionKind` | visible now | note |
|---|---|---|---|---|---|
| `the-next-humans-skills` | published | none | none | **yes** | article-style page; no price, no dates as data |
| `promotion-multi-agent-with-microsoft-copilot-studio` | published | end `2026-09-10T16:59:59.999Z` | **early_bird** | no — expired 2 days ago | binding: `COPILOT-STU-ADV`, schedule `6a4b5bc0…`, special 12,665, deadline = `publishEndDate` |
| `promotion-claude-ai-bundle` | **closed** | `2026-09-03T17:00Z` → `2026-09-08T16:59:59.999Z` | **bundle** | no | two `promotion_bundle` sections (below) |
| `expo002` | published | `2026-08-24` → `2026-08-28` | none | no — expired | test page, `promotionId: "pro1"` (MSDB-anchored, points nowhere) |
| `early-bird-claude-code` | closed | none | none | no | course_selector/course_schedule sections only |
| `testearlybird` | draft | none | none | no | empty |

**Field origin per page — DATA vs TYPED.** Real data on the document: `title`, `slug`, `status`,
`publishStartDate`, `publishEndDate`, `promotionKind`, `promotionOrder`, `promotionCover`, and
for `early_bird` the `earlyBird` sub-document (`courseRef` ObjectId, `courseCode`, `scheduleId`,
`specialPrice` Number, `deadline` Date, `labelTh`). Everything else is section content. On the
early-bird page the prose repeats the numbers by hand: the `two_column` section text contains
"12,665 บาท" and "14,900 บาท" and a `card_grid` contains "ก.ย." dates — so the NORMAL price
(14,900) exists on this page **only as typed text**; the binding carries the special price but
not the list price.

**Bundles (`promotion_bundle` sections on `promotion-claude-ai-bundle`).** The section's
`content` is a validated zod object ([src/lib/schemas/sections/dynamic.js](../src/lib/schemas/sections/dynamic.js)):
`name`, `blurb`, `label`, `listPrice` (int baht), `netPrice` (int baht), `discountCode`,
`registrationOpen` (bool), `items[]` of `{ id, courseId, roundId, roundSnapshot }`.

| bundle | listPrice | netPrice | registrationOpen | items (courseId → roundId, snapshot dates) |
|---|---|---|---|---|
| ดีลสุดคุ้ม! จับคู่ 2 คอร์ส Claude Code … | 40,800 | 32,640 | true | `VIBE-CODE-L1` → `6a0579682cf9…` (19–20 Oct 2026); `VIBE-CODE-L2` → `6a0578e52cf9…` (24–25 Sep 2026) |
| ปั้นตัวเองให้เป็น AI Developer เต็มสูบ! … ลดสูงสุด 30% | 55,700 | 38,990 | true | `CLAUDE-AI` → `69ce32aff265…` (16–17 Sep 2026); `VIBE-CODE-L1`; `VIBE-CODE-L2` |

**Verdict:** bundle prices, the open/closed toggle and the member items are **DATA** — items are
stored as course **codes** plus upstream schedule **ObjectIds** with a dates snapshot, not typed
text. The page is `closed`, so nothing bundle-shaped is live right now; when it was live, none of
it reached MSDB or the bot.

### 1b. Advanced-HTML pages (`custom_pages`, `pageType: 'promotion'`)

Loader `getActiveCustomPagePromotions`: prefilter `status: 'published'`, same gate (dates read as
null because the model has no `publishStartDate/EndDate`). **1 page, `yearly-promotion`,
published → visible.** Its body is 11,172 chars of authored HTML with **no numeric price in it**
(regex for `d,ddd` found nothing) — it is a description of the annual promotion, not a price
sheet. Nothing on it is data beyond `title`, `slug`, `status`, `promotionOrder`.

### 1c. MSDB mirror (`promotions`)

21 rows, synced by the cron at `2026-09-12T18:00:37Z`. **All 21 have `is_active: false`**, so
`getActivePromotions()` (`find({ is_active: true })`) returns nothing and the MSDB block on
`/promotions` is empty. 12 of the 21 are inside their `start_date..end_date` window right now
(the ten career paths, the yearly promotion, and one more) and carry MSDB's own
`time_status: "Active"`. **Hypothesis:** `is_active` was set false by an admin (the sync only
writes it on insert, mirroring `time_status`), and nobody has flipped it since the builder/custom
pages took over the grid. Note also that this mirror holds 21 rows including the ten career
paths, whereas MSDB's `/api/promotions` (what the chatbot's corpus sync reads) returns 9 — the two
MSDB endpoints do not return the same set.

### 1d. Banners (`promotion_banners`)

6 rows, 1 active: the AI Digital Marketing Creator masterclass banner, linking to
`masterclass.9experttraining.com/masterclass/mas-ai-dmc`. Image + link only; no price, no date.

---

## 2. Source 2 — `EarlyBirdConfig` (`early_bird_configs`)

**Model** ([src/models/EarlyBirdConfig.js](../src/models/EarlyBirdConfig.js)): `course_id`
(String, **unique**), `promotion_id` (legacy MSDB id, indexed), `owner_page_id` (owning builder
page `_id`, indexed), `schedule_id`, `label_th`, `special_price` (Number), `deadline` (Date),
`is_active` (Boolean), timestamps.
**Indexes measured on the live collection:** `_id_`, `course_id_1` (**unique: true** — confirmed),
`promotion_id_1`, `owner_page_id_1`. One course, one Early Bird, enforced by the index.

**All 5 rows:**

| course_id | schedule_id | special_price | deadline (UTC) | is_active | owner_page_id | promotion_id | label |
|---|---|---|---|---|---|---|---|
| MSE-AI | 69cf396d… | 10,965 | 2026-05-25T05:59Z | true | (absent) | 69f84930… (Excel AI promo) | Early Bird |
| POWER-BI | — | 59,999 | 2026-06-25T04:05Z | false | (absent) | 692eb3f3… (yearly) | Master Class |
| COPILOT-STU | — | 1,000 | 2026-08-08T14:42Z | false | (absent) | 6a0c0a24… | Early Bird |
| MSE-L1 | 693139a1… | 1,000 | 2026-08-08T13:57Z | true | (absent) | 6a0c0a24… | Early Bird |
| COPILOT-STU-ADV | 6a4b5bc0… | 12,665 | 2026-09-10T16:59:59.999Z | true | 6a9a7dcd… (the Copilot page) | "" | Early Bird |

**The two filters, side by side (evaluated at measurement time):**

| filter | passes |
|---|---|
| DEADLINE-based (`deadline > now`) | **none** — every deadline is in the past |
| `is_active === true` | **MSE-AI, MSE-L1, COPILOT-STU-ADV** |

Three rows would be served as "live" by an `is_active` filter although their deadlines passed
110, 35 and 2 days ago. That is the measurement behind ruling 1. (The site itself is safe: the
course page's `getEarlyBirdByCourse` requires `is_active` **and** then returns null when
`deadline < now`; the builder-page path uses `earlyBirdIsActive` = page visible ∧ deadline in
future. `is_active` is never sufficient anywhere on the site either.)

Two rows (MSE-L1, COPILOT-STU at 1,000 baht) look like test data; two (`POWER-BI` "Master Class"
at 59,999, `MSE-AI`) are legacy `promotion_id`-owned rows with no owning page.

**The course's normal price is NOT on this row.** The course page reads it from the upstream
MSDB course record (`course.course_price`, fetched through `/api/ai/public-course`) and
compares it against `special_price` for the strike-through. An endpoint that wants to show
"12,665 from 14,900" must join to MSDB (or to the genesis `CourseExtension`/search corpus if that
caches the price — **hypothesis**, not checked).

---

## 3. Source 3 — Masterclass Early Bird (`masterclass_batches`)

**Wholly separate from `EarlyBirdConfig`.** The pricing helper is documented as
"self-contained, no dependency on EarlyBirdConfig"
([src/lib/masterclass/getMasterclass.js](../src/lib/masterclass/getMasterclass.js) `resolveBatchPrice`),
and the batch model carries its own four fields. Nothing joins the two.

**Model** ([src/models/MasterclassBatch.js](../src/models/MasterclassBatch.js)): `course_id`
(ObjectId → `masterclass_courses`), `course_slug` (denormalised — and **stale**: the batches say
`ai-content` / `mas-ai-content` / `claude-ai-for-data-analyst-test` while the courses are
`mas-ai-dmc` / `mas-claude-ai-for-data-analyst`; the ObjectId is what resolves), `batch_no`,
`batch_label`, `dates[{date, day_label}]`, `venue_name/address/map_url/note`, `price_normal`,
`price_early_bird`, `early_bird_deadline` (Date), `early_bird_active` (Boolean), `capacity`,
`registered_count`, `status ∈ {draft, open, full, closed, cancelled}`.
**Discount representation:** an absolute early-bird **price**, not a percentage; the discount is
derived in the UI. **Deadline:** an absolute `Date`, stored at `16:59:00Z` = 23:59 Asia/Bangkok.
Liveness: `early_bird_active && price_early_bird != null && (deadline == null || deadline > now)`,
evaluated at request time — `/masterclass` and `/masterclass/[slug]` are `force-dynamic`, no ISR.

### 3a. The `mas-ai-dmc` card, field by field

| Rendered value | Origin | Exact field | Kind |
|---|---|---|---|
| รุ่นที่ 1 | batch | `batch_label` (fallback `รุ่นที่ ${batch_no}`) | model |
| Sat 26 Sep 2026 | batch | `dates[0].date` = `2026-09-26T00:00:00Z`, formatted en-GB in Asia/Bangkok | model |
| 09:00–17:00 | **course** | `time_start` / `time_end` on `masterclass_courses` | model |
| Asia Hotel Bangkok | batch | `venue_name` = "Asia Hotel \| Bangkok" | model |
| 9,030 บาท | batch | `price_early_bird` = 9030 | model |
| ~~12,900~~ | batch | `price_normal` = 12900 → `original_price` | model |
| ตั้งแต่วันนี้ – 16 Sep 2026 | batch | `early_bird_deadline` = `2026-09-16T16:59:00Z`, formatted by `formatEarlyBirdDeadline` (pinned to Asia/Bangkok) | model |
| live countdown | batch | `CountdownTimer(deadline=early_bird_deadline)` | model |
| early-bird styling on | batch | `early_bird_active` = true, batch `status` = open | model |

**Every value on that card is model-backed. Nothing is typed in a section.** A corpus API can
serve the whole card from `masterclass_batches` joined to `masterclass_courses` today.

### 3b. All batches carrying an early-bird price

| course (resolved) | batch | status | price_normal | price_early_bird | deadline (UTC) | active | early bird live now |
|---|---|---|---|---|---|---|---|
| mas-ai-dmc | 1 (รุ่นที่ 1) | **open** | 12,900 | 9,030 | 2026-09-16T16:59Z | true | **yes** |
| mas-claude-ai-for-data-analyst | 2 (รุ่นที่ 2) | **open** | 12,900 | 9,675 | 2026-10-02T16:59Z | true | **yes** |
| mas-claude-ai-for-data-analyst | 1 | draft | 12,900 | 9,675 | 2026-08-21T16:59Z | true | no (deadline passed; batch is draft anyway) |
| mas-ai-dmc | 2 ("สำหรับทดสอบ") | draft | 100 | — | — | false | no |

So there are **two live masterclass early birds** right now, and the chatbot knows neither.

---

## 4. Cross-cutting

### 4a. Existing read-only/public APIs that expose any of this

| route | auth | exposes |
|---|---|---|
| `GET /api/search?q=` | none (public, `force-dynamic`, result cached briefly) | a search corpus that includes `getActivePromotions()` — i.e. the MSDB mirror filtered on `is_active`, currently **empty**; no early-bird or masterclass pricing |
| `GET /api/notifications/active` | none | site popups, not promotions |
| `GET /api/cron/promotions-sync` | `Authorization: Bearer $CRON_SECRET` (skipped when unset) | triggers the MSDB→genesis sync; returns nothing useful |
| `POST /api/masterclass/register`, `POST /api/registration/bundle` | write paths | — |
| `POST /api/chat` | rate-limited proxy to the chatbot backend | — |

**There is no existing endpoint that serves live promotion prices.** `/api/search` is the only
public JSON reader and it inherits the `is_active` defect.

### 4b. How MSDB's `/api/ai/*` authenticates (the pattern to copy)

Genesis's own MSDB client ([src/lib/api/client.js](../src/lib/api/client.js), `msdb-write.js`)
sends a static `x-api-key: <AI_API_KEY>` header to `https://9exp-sec.com/api/ai`. The chatbot
already holds such a key (`EXPERT_API_KEY`) for the same host. Proposal: the new genesis endpoint
accepts `x-api-key` checked against one env var (e.g. `CORPUS_API_KEY`), returns 401 otherwise —
same header name, same shape, no session, no cookie.

### 4c. Where "is it live right now?" is ambiguous

| store | representation | ambiguity |
|---|---|---|
| `page_builder_pages.publishEndDate` | `…T16:59:59.999Z` (23:59:59.999 Bangkok) — the editor writes end-of-day Thailand | unambiguous **when written by the editor**; `expo002` has `…T17:00:00Z` starts, i.e. midnight Bangkok — fine |
| `EarlyBirdConfig.deadline` | mixed: `05:59Z`, `04:05Z`, `14:42Z`, `13:57Z`, `16:59:59.999Z` | **arbitrary wall-clock instants** typed in the admin form; only the page-owned row is end-of-day. A "live" check at request time is still exact — the ambiguity is for humans reading "deadline 25 May", not for the predicate |
| `EarlyBirdConfig` vs owning page | `earlyBirdDeadline = min(binding.deadline, page.publishEndDate)` | two deadlines can disagree; the page-side helper takes the earlier one, the course-page path reads only `binding.deadline`. Today they are equal on the one page-owned row |
| `masterclass_batches.early_bird_deadline` | `…T16:59:00Z` (23:59 Bangkok) | consistent; note the site formats in Asia/Bangkok explicitly because SSR runs in UTC |
| `promotions.end_date` (MSDB mirror) | `…T09:59Z`, `…T16:59Z`, `…T02:59Z` — MSDB's own values | mixed; several end at 16:59 Bangkok rather than end-of-day |
| `custom_pages` | no dates at all | a published Advanced-HTML promotion is live forever until unpublished |
| ISR | `/promotions` and course pages `revalidate = 3600` | the SITE can show a promotion up to an hour past its deadline; the endpoint must not (ruling 4) |

---

## 5. DATA vs TYPED verdict per source

| source | what an API can serve today (data) | what is typed / missing |
|---|---|---|
| 1a builder, `promotionKind: early_bird` | title, slug, href, window, course code + upstream schedule id, special price, deadline, label | **normal price** (only in prose), any description text |
| 1a builder, `promotionKind: bundle` | title, slug, window, per-bundle name/blurb, listPrice, netPrice, discountCode, registrationOpen, items as course code + schedule id + dates snapshot | nothing essential is typed — but the page is `closed` today |
| 1a builder, `promotionKind: none` (`the-next-humans-skills`) | title, slug, href, window | everything else — it is an article |
| 1b custom page | title, slug, href | the entire offer (HTML, no numbers) |
| 1c MSDB mirror | title, dates, related course ids, tags, external URL | liveness is broken by `is_active`; genesis is not the owner anyway — the chatbot should keep reading MSDB directly for these |
| 2 EarlyBirdConfig | course code, schedule id, special price, deadline, label, owning page (→ href) | **normal price** (join to MSDB course), and 4 of 5 rows are stale/test |
| 3 masterclass batch | everything on the card: course title/slug/code, batch label, dates, time, venue, normal price, early-bird price, deadline, seats | nothing — fully data |

---

## 6. Proposed response contract — `GET /api/corpus/promotions` (read-only)

Auth: `x-api-key` (§4b). `Cache-Control: no-store`; `export const dynamic = 'force-dynamic'`
(ruling 4). Liveness evaluated per item with the request-time `now`.

```jsonc
{
  "generated_at": "2026-09-12T18:06:04Z",     // the `now` every item was judged against
  "timezone_note": "all instants are UTC ISO-8601; deadlines are end-of-day Asia/Bangkok unless noted",
  "items": [
    {
      "id": "masterclass:<batch _id>",           // stable, namespaced by source
      "kind": "early_bird" | "bundle" | "page",  // one vocabulary across sources
      "source": "masterclass" | "early_bird_config" | "builder_page" | "custom_page",
      "title": "AI Digital Marketing Creator Masterclass — รุ่นที่ 1",
      "url": "https://www.9experttraining.com/masterclass/mas-ai-dmc",   // null when no public page resolves (ruling 2)
      "live_from": "2026-05-04T06:31:24Z" | null,
      "live_until": "2026-09-16T16:59:00Z",     // THE deadline; null only for a windowless published page
      "is_live": true,                          // computed: (live_from ?? -inf) <= now < live_until, plus source status gates below
      "price": { "normal": 12900, "special": 9030, "currency": "THB", "discount_pct": 30 },   // fields null when unknown
      "courses": [                              // the course(s) this promotion applies to
        { "course_code": "M-AI-DMC", "title": "AI Digital Marketing Creator Masterclass",
          "schedule_id": null, "dates": ["2026-09-26"], "time": "09:00–17:00", "venue": "Asia Hotel | Bangkok",
          "seats": { "capacity": 50, "registered": 0 } }
      ],
      "bundle": null | { "list_price": 40800, "net_price": 32640, "discount_code": "", "registration_open": true },
      "description": "…"                        // short plain text; null for page kinds with no data description
    }
  ]
}
```

**Liveness rule, written out:**

- `builder_page`: `isPubliclyVisible(page, now)` (the existing predicate, imported — not
  re-implemented) **and**, for `early_bird`, `earlyBirdDeadline(binding, page) > now` (the
  min-of-two rule already in `pageWriteThrough.js`); for `bundle`, additionally
  `content.registrationOpen === true` per bundle section.
- `early_bird_config`: `deadline != null && deadline > now`. **`is_active` is reported as a
  field but never used as the filter** (ruling 1). Rows with no owning page and no MSDB slug get
  `url: null` (ruling 2).
- `masterclass`: `resolveBatchPrice(batch).is_early_bird` (existing helper) **and** batch
  `status ∈ {open, full}` **and** course `is_published`. Counts exactly like a course early bird
  (ruling 3).
- `custom_page`: `status === 'published'`; `live_until: null`.
- `msdb`: **not served by this endpoint** — the chatbot already reads MSDB directly; duplicating
  the mirror would re-export the `is_active` defect.

**Fields that cannot be filled from current data:**

| field | source | why |
|---|---|---|
| `price.normal` | `early_bird_config`, builder `early_bird` | not stored on the row or binding; needs a join to MSDB `course_price` (an upstream call per row, or a genesis-side cache) |
| `courses[].dates/time/venue` | `early_bird_config` | only `schedule_id` is stored; resolving it means calling MSDB `/schedules` |
| `description` | builder `early_bird`, `custom_page` | prose only |
| `live_from` | `early_bird_config` | no start on the row; `createdAt` is a proxy at best |

What the endpoint would return **right now**, by the rules above: 2 masterclass early birds
(mas-ai-dmc รุ่น 1 at 9,030; mas-claude-ai-for-data-analyst รุ่น 2 at 9,675), 1 builder page of
kind `page` (`the-next-humans-skills`), 1 custom page (`yearly-promotion`). Zero
`early_bird_config` rows, zero bundles. Versus the bot's current one item.

---

## 7. What must be built before the endpoint is possible — smallest first

1. **Nothing, for masterclass.** Two collections, existing helper, fully data. This alone fixes
   the most-asked-about live offer.
2. **The key.** One env var + one `x-api-key` check (§4b). Needs a value shared with the chatbot's
   env — an operator step, not code.
3. **A `price.normal` join for course early birds** — either an MSDB `/api/ai/public-course`
   call per live row (at most a handful; there are 5 rows total) or a `normalPrice` field on the
   binding written through by the page save. Without it the endpoint can only say "12,665",
   not "12,665 from 14,900". The page-save write-through already exists
   (`pageWriteThrough.js`), so adding one number there is the smallest genesis-side change.
4. **Data hygiene on `early_bird_configs`**: 4 of 5 rows are expired legacy/test rows
   (`POWER-BI` at 59,999, two rows at 1,000). A deadline filter hides them, but they will confuse
   the next person who reads the collection. Delete or let the admin close them — not this round.
5. **Decide the MSDB mirror's `is_active`.** All 21 false. Either the cron should write it from
   `time_status` on every sync (not only on insert — **hypothesis** that this is the cause), or
   the `/promotions` MSDB block should be gated on the date window like everything else. Out of
   scope for the endpoint, which does not serve that block, but it is why `/api/search` returns
   no promotions.
6. **Bundle pages**: nothing to build — the shape is data — but the only bundle page is `closed`.
   Reopen or author one and the contract above serves it.

---

## 8. Open questions for the human

1. Should the endpoint serve `custom_page` promotions at all? `yearly-promotion` is the one
   thing the bot already knows (from MSDB), and it carries no data beyond a title — serving it
   again from genesis adds a duplicate with no price.
2. `price.normal` for course early birds: join to MSDB at request time (one upstream call per
   live row) or add a field to the binding? The former needs no schema change; the latter is a
   one-line write-through plus a backfill of the one live-able row.
3. Does the bot need `seats` (capacity/registered) on masterclass items? It is real data and
   changes with every registration; "4 ที่นั่งสุดท้าย" is exactly the kind of claim that must
   not be cached.
4. The masterclass domain: the banner links to `masterclass.9experttraining.com/masterclass/…`
   while the page lives under the main site route. Which host should `url` carry?
5. `EarlyBirdConfig` rows with `owner_page_id` absent and a legacy `promotion_id` resolve to an
   MSDB promotion slug via `promotion_configs` — should the endpoint link there (a page the site
   no longer lists, since `is_active` is false) or return `url: null`?
6. Confirm the key-sharing arrangement: a new `CORPUS_API_KEY` on Vercel, or reuse the value of
   the chatbot's existing MSDB key? Reuse is simpler; a separate key is revocable independently.

---

*Method: read-only Mongo queries via a throwaway script kept outside the repo and deleted after
the run; source files read: `getPromotions.js`, `visibility.js`, `promotionMode.js`,
`EarlyBirdConfig.js`, `PageBuilder.js`, `MasterclassBatch.js`, `MasterclassCourse.js`,
`getMasterclass.js`, `MasterclassDetailClient.jsx`, `EarlyBirdBanner.jsx`,
`pageWriteThrough.js`, `course-promos.js`, `syncPromotions.js`, `sections/dynamic.js`,
`api/search/route.js`, `api/cron/promotions-sync/route.js`, `api/client.js`. No source file
was modified and no test was run.*
