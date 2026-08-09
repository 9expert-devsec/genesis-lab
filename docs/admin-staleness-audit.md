# Admin staleness audit (PHASE 0 — measurement only)

No production code was changed to produce this document.

Scope of the read: every `aiFetch` call site, every `revalidateTag` /
`revalidatePath` call in `src/`, every `src/app/admin/**/page.jsx`, and the five
`sync*` libraries. Measurement method and its limits are in §3.

---

## 1. Table 1 — one row per upstream read

Columns:

- **tag(s)** — literal passed as `tags`. `<id>`-style entries are built by
  template interpolation at runtime, so they are not a fixed vocabulary.
- **rev** — effective `revalidate` seconds for that call site.
- **admin readers** — admin surfaces that render through this call.
- **should be invalidated by** — the Genesis write path(s) that change the
  underlying data.
- **tag status** — `busted` iff some code path calls `revalidateTag` with this
  tag; `never-busted` otherwise. This is the column the brief asked for.
- **effective freshness** — what a user actually sees. This column exists
  because the measurement in §3 shows `revalidatePath('/X')` *also* forces the
  next render of `/X` to bypass the Data Cache, so a `never-busted` tag can
  still read fresh on the one page whose path gets revalidated. See §4.1.

### 1a. `aiFetch` call sites in `src/lib/api/*.js` (the 15 the brief asked for)

| # | call site | tag(s) | rev | admin readers | should be invalidated by | tag status | effective freshness |
|---|---|---|---|---|---|---|---|
| 1 | [public-courses.js:20](src/lib/api/public-courses.js#L20) `listPublicCourses` | `public-courses` | 3600 | `/admin/courses`, `/admin/courses/new`, `/admin/courses/[id]/edit`, `/admin/featured-courses`, `/admin/career-paths/new`, `/admin/career-paths/[id]/edit`, `/admin/articles/new`, `/admin/articles/[id]/edit`, `/admin/schedules` | `courses.js` create/update/delete | **never-busted** by any Genesis action; busted by the inbound MSDB webhook ([handlers.js:143](src/lib/webhooks/handlers.js#L143) → [courseRevalidatePlan.js:48,56](src/lib/webhooks/courseRevalidatePlan.js#L48)) | `/admin/courses` fresh (its path is revalidated — measured in §6a **including when a public route populated the shared entry**); the other **8** readers stale ≤1 h |
| 2 | [public-courses.js:32](src/lib/api/public-courses.js#L32) `getPublicCourse` | `public-course:<idOrCode>` | 3600 | — **no callers anywhere in `src/`** | — | never-busted | dead code — cannot cause staleness |
| 3 | [public-courses.js:52](src/lib/api/public-courses.js#L52) `getCourseByCode` | `course:<courseId>` | 3600 | `/admin/courses/[courseId]`, `/admin/local-faqs`; also `actions/featured-courses.js`, `actions/career-paths.js`, `actions/nav-course-preview.js`, `registration/resolve-price.js`, `pageBuilder/resolveSectionData.js`, `navmenu/syncNavMenuData.js` | `courses.js` update/delete | **never-busted** by Genesis actions; busted by the webhook ([courseRevalidatePlan.js:55](src/lib/webhooks/courseRevalidatePlan.js#L55)) | `/admin/courses/[courseId]` stale ≤1 h — `updateCourse` revalidates `/admin/courses` and `/admin/courses/<id>/edit` but **not** `/admin/courses/<id>`, and §6d measures that a parent-path bust does **not** reach a child route |
| 4 | [schedules.js:32](src/lib/api/schedules.js#L32) `listSchedules` | `schedules` | caller-set; `/admin/schedules` passes **0** | `/admin/schedules` | `schedules.js` create/update/delete | busted ([actions/schedules.js:35](src/lib/actions/schedules.js#L35), [handlers.js:170](src/lib/webhooks/handlers.js#L170)) | fresh — `revalidate: 0` → `cache: 'no-store'`, never enters the Data Cache (measured, §3 probe C) |
| 5 | [schedules.js:77](src/lib/api/schedules.js#L77) `listSchedulesByCourse` | `schedules:course:<objectId>` | 1800 | none directly; `actions/career-paths.js`, `landing/syncLandingData.js`, `pageBuilder/resolveSectionData.js` | `schedules.js` create/update/delete | busted ([actions/schedules.js:39](src/lib/actions/schedules.js#L39)) | fresh on write |
| 6 | [resolveIds.js:26](src/lib/api/resolveIds.js#L26) `loadCourseLookup` | **none** | 300 | none directly; used *inside* `createCourse`/`updateCourse` (`resolveCourseRefs`) and `actions/schedules.js` | `courses.js` create/delete | **never-busted — untaggable**, no tag is passed | a course created <5 min ago cannot be resolved as `previous_course` / `related_courses` |
| 7 | [instructors.js:13](src/lib/api/instructors.js#L13) `listInstructors` | `instructors` | 3600 | none — only `instructors/syncInstructors.js` | `instructors.js` create/update/delete | **never-busted** | **sync reads a ≤1 h-old upstream snapshot** |
| 8 | [promotions.js:30](src/lib/api/promotions.js#L30) `listPromotions` | `promotions` | 3600 | none — only `promotions/syncPromotions.js` | upstream-owned (read-only, MANIFESTO §6) | **never-busted** | **sync reads a ≤1 h-old upstream snapshot** |
| 9 | [career-paths.js:21](src/lib/api/career-paths.js#L21) `listCareerPaths` | `career-paths` | 3600 | none — only `career-paths/syncCareerPaths.js` | `career-paths.js` CRUD | busted ([actions/career-paths.js:47](src/lib/actions/career-paths.js#L47), [handlers.js:428](src/lib/webhooks/handlers.js#L428)) | **busted in the WRONG ORDER** — [`syncCareerPathsAction`](src/lib/actions/career-paths.js#L95) runs `syncCareerPaths()` *then* `bustCaches()`, so the sync itself still reads the stale snapshot |
| 10 | [career-paths.js:32](src/lib/api/career-paths.js#L32) `getCareerPath` | `career-path:<slug>` | 3600 | — **no callers anywhere in `src/`** | — | never-busted | dead code |
| 11 | [contact-us.js:18](src/lib/api/contact-us.js#L18) `getContactInfo` | `contact-us` | 3600 | — **no callers anywhere in `src/`** | — | never-busted | dead code |
| 12 | [programs.js:12](src/lib/api/programs.js#L12) `listPrograms` | `programs` | 3600 | `/admin/programs`, `/admin/courses`, `/admin/courses/new`, `/admin/courses/[id]/edit`, `/admin/schedules`, `/admin/page-configs`, `/admin/local-faqs`, `/admin/local-faqs/program/[id]`, `/admin/articles/new`, `/admin/articles/[id]/edit` | upstream-owned; Genesis stores only order/visibility | **never-busted** | **`/admin/programs` stale ≤1 h and F5 does not help** — no code anywhere revalidates `/admin/programs` (see §2 note) |
| 13 | [skills.js:12](src/lib/api/skills.js#L12) `listSkills` | `skills` | 3600 | `/admin/programs`, `/admin/page-configs`, `/admin/local-faqs`, `/admin/local-faqs/skill/[id]`, `/admin/courses/new`, `/admin/courses/[id]/edit`, `/admin/articles/new`, `/admin/articles/[id]/edit` | upstream-owned | **never-busted** | same as row 12 |
| 14 | [faqs.js:13](src/lib/api/faqs.js#L13) `listFaqs` | `faqs` | 3600 | none — only `faqs/syncFaqs.js` | upstream-owned | **never-busted** | **sync reads a ≤1 h-old upstream snapshot** (measured, §3 probe R) |
| 15 | [online-courses.js:20](src/lib/api/online-courses.js#L20) `getOnlineCourses` | `online-courses` | 3600 | `/admin/featured-online-courses`, `/admin/nav-featured-online-courses` | upstream-owned | **never-busted** | both readers' own paths are revalidated by their write actions, so the picker refreshes on save; a brand-new upstream online course still takes ≤1 h to appear |

### 1b. Two rows the brief's scope would have missed

The brief scoped Table 1 to "`aiFetch` call sites in `src/lib/api/*.js`". Two
cached upstream reads do not match that description and are listed separately.

| # | call site | tag(s) | rev | admin readers | tag status | effective freshness |
|---|---|---|---|---|---|---|
| 16 | [admin/courses/[courseId]/edit/page.jsx:37](src/app/admin/courses/[courseId]/edit/page.jsx#L37) — `aiFetch` imported directly into a **page**, outside `src/lib/api` | none | **0** | `/admin/courses/[id]/edit` | n/a | fresh — `no-store` |
| 17 | [reviews.js:24](src/lib/api/reviews.js#L24) — raw `fetchWithTimeout`, **not** `aiFetch` (different upstream host) | `reviews` | 3600 | `/admin/featured-reviews` | **never-busted** | reader's own path is revalidated on save; a brand-new upstream review takes ≤1 h |

A guard that walks `src/lib/api/*.js` looking for `aiFetch(` would miss both.
Phase 1's guard has to walk for `tags:` in `next: {}` options, not for `aiFetch`.

---

## 2. Table 2 — one row per admin menu

Class definitions: `mongo` = list rows come from a Genesis Mongo collection
written by Genesis. `msdb-via-aiFetch` = list rows come straight from the
upstream through the Data Cache. `mongo-filled-by-msdb-sync` = list rows come
from Mongo, but Mongo is filled by a `sync*` job that itself reads upstream
through the Data Cache. `mixed` = the list is one class and a picker/lookup on
the same screen is another.

`dyn` = `export const dynamic` present on the page.

| menu | class | reader | dyn | stale layers |
|---|---|---|---|---|
| `/admin` (dashboard) | **mixed** | `getDashboardMetrics` (mongo) + `getAllSchedules` (msdb, tag `schedules`) | ✓ | 1 — schedules list ≤30 min |
| `about` | mongo | `actions/about.js` | ✓ | 0 |
| `accounts` | mongo | `actions/admin-accounts.js` | ✓ | 0 |
| `articles` | mongo | `actions/articles.js` | ✓ | 0 |
| `banners` | mongo | `actions/banners.js` | **✗** | 0 (but see §4.4) |
| `career-path-registrations` | mongo | `actions/career-path-registrations.js` | ✓ | 0 |
| `career-paths` | **mongo-filled-by-msdb-sync** | `getAllCareerPaths` (Mongo `CareerPath`) ← `syncCareerPaths` ← `listCareerPaths` | ✓ | **2** — (a) Mongo is only as fresh as the last sync/webhook; (b) the sync's own upstream read is Data-Cache-stale because the tag is busted *after* the read, not before |
| `contact` | mongo | `actions/contact.js` | ✓ | 0 |
| `courses` | **msdb-via-aiFetch** | `listPublicCourses` (tag `public-courses`) | ✓ | 1 — but the list page's own path *is* revalidated by `createCourse`, so server-side it reads fresh (§4.1) |
| `faqs` | **mongo-filled-by-msdb-sync** | `getAllFaqs` (Mongo `Faq`) ← `syncFaqs` ← `listFaqs` | ✓ | **2** — (a) Mongo only as fresh as the last sync/webhook; (b) `syncFaqs` reads a ≤1 h-old upstream list, and nothing busts `faqs` ever |
| `featured-courses` | mixed | mongo `FeaturedCourse` + `listPublicCourses` picker + `getCourseByCode` hydration | ✓ | 1 — picker |
| `featured-online-courses` | mixed | mongo + `getOnlineCourses` picker | ✓ | 1 — picker |
| `featured-reviews` | mixed | mongo + `getAllReviews` picker (tag `reviews`) | ✓ | 1 — picker |
| `instructors` | **mongo-filled-by-msdb-sync** | `listInstructorsForAdmin` (Mongo `Instructor`) ← `syncInstructors` ← `listInstructors` | ✓ | **2** — same shape as `faqs` |
| `landing-cache` | mongo | `LandingCache` model | ✓ | 0 |
| `local-faqs` | mixed | mongo `LocalFaq`/`CareerPath`/`MasterclassCourse` + `listPrograms`/`listSkills`/`getCourseByCode` labels | ✓ | 1 — labels |
| `masterclass` | mongo | `getAllMasterclassCourses` | ✓ | 0 |
| `nav-featured-online-courses` | mixed | mongo + `getOnlineCourses` picker | ✓ | 1 — picker |
| `nearby-places` | mongo | `actions/nearby-places.js` | ✓ | 0 |
| `notifications` | mongo | `actions/site-notifications.js` | ✓ | 0 |
| `page-configs` | mixed | mongo `ProgramPageConfig`/`SkillPageConfig` + `listPrograms`/`listSkills` | ✓ | 1 |
| `pages` | mongo | `customPages` + `pageBuilder` | ✓ | 0 |
| `portfolio` | mongo | `actions/portfolio.js` | ✓ | 0 |
| `profile` | mongo | `Admin` model | ✓ | 0 |
| `programs` | **mixed** — row identity from `msdb-via-aiFetch`, order/visibility from mongo | `listPrograms` + `listSkills` + `ProgramOrder`/`SkillOrder` | ✓ | 1 — **and nothing revalidates `/admin/programs`, so F5 does not help for up to 1 h** |
| `promotions` | **mongo-filled-by-msdb-sync** | `getAllPromotions` (Mongo `Promotion`) ← `syncPromotions` ← `listPromotions` | ✓ | **2** — same shape as `faqs` |
| `recruits` | mongo | `actions/recruits.js` | ✓ | 0 |
| `registrations` | mongo | `actions/registrations.js` | ✓ | 0 |
| `roles` | mongo | `actions/roles.js` | ✓ | 0 |
| `schedule-pdf` | mongo | `actions/schedule-pdf.js` | ✓ | 0 |
| `schedules` | mixed | `listSchedules({revalidate: 0})` (uncached) + `listPublicCourses`/`listPrograms` pickers + mongo locals | ✓ | 1 — pickers only; the schedule rows themselves are uncached |
| `security` | mongo | `Admin` model | ✓ | 0 |
| `tnhs-courses` | mongo | `actions/tnhs-courses.js` | ✓ | 0 |
| `webhook-logs` | mongo | `actions/webhook-logs.js` | ✓ | 0 |

Four menus are in the third class — `faqs`, `career-paths`, `instructors`,
`promotions` — and **all four** have two stale layers, not just one.

---

## 3. Measurement

### 3.1 What I measured and how

I did **not** measure the live admin UI. `.env.local` points at production Mongo
and the live MSDB write key; creating a course/program/FAQ there to watch a row
appear is a real write to a production system, and I have no authorization for
that. That measurement is offered in §5.

What I *did* measure is the mechanism the whole diagnosis rests on: whether a
`next: { revalidate: 3600, tags }` fetch is served from the Next Data Cache
across requests, and what actually busts it. Setup:

- An **external instrument**, not part of this repo and never imported by it: a
  throwaway Next app at `D:\workspace\projects\_cache-probe-tmp`, with
  `node_modules` junctioned to this repo's, so it runs **next 15.5.15, react
  18.3.1** — the exact versions in `package-lock.json`. It reproduces framework
  mechanism only: no Mongo, no auth, no MSDB. It can see cache behaviour,
  network payloads and rendered DOM; it cannot see anything about this repo's
  own data, permissions, or upstream.
  (Gotcha worth recording: the junction must be created with the **same drive
  letter case** as the cwd used to build. A `d:` junction built from a `D:` cwd
  makes webpack emit two copies of every Next client module, and the app then
  fails to hydrate with `invariant expected layout router to be mounted`. The
  first GAP 2 attempt died on exactly that; server-side results were unaffected
  and were re-confirmed byte-identical after the rebuild.)
- A mock upstream on `:4011` that increments a counter on every request and
  returns it inside the canonical `{ ok, summary, items }` envelope, plus a
  `/hits` endpoint. A rendered counter that does not advance = a cache hit.
- `probe/app/lib.js` copies the `cacheConfig` branch of
  [client.js:59-67](src/lib/api/client.js#L59) verbatim.
- Routes: **A** = `export const dynamic = 'force-dynamic'` + tagged fetch
  (mirrors [admin/courses/page.jsx:14-15](src/app/admin/courses/page.jsx#L14));
  **B** = dynamic only because it awaits `cookies()` (what `requirePage` does),
  same fetch; **C** = `revalidate: 0`; **R** = a route handler doing the tagged
  fetch (stands in for `/api/admin/faqs/sync` → `syncFaqs` → `listFaqs`);
  `/bust?tag=&path=` calls `revalidateTag` / `revalidatePath`.
- Run: `next build` && `next start -p 4010`, then plain `curl` (a fresh document
  request each time — no client Router Cache involved).

### 3.2 Results

```
A req1 -> upstream_hit=1   hits=1
A req2 -> upstream_hit=1   hits=1
A req3 -> upstream_hit=1   hits=1          <- force-dynamic does NOT bypass the Data Cache
B req1 -> upstream_hit=1   hits=1          <- B shares A's cache entry
C req1 -> upstream_hit=2   hits=2
C req2 -> upstream_hit=3   hits=3          <- revalidate:0 always refetches
```

Busting:

```
A before                     -> upstream_hit=1
revalidatePath('/a')         -> A -> upstream_hit=5    REFETCHED
revalidateTag('public-courses') -> A -> upstream_hit=6  REFETCHED
```

Controls (all must NOT refetch, and none did):

```
revalidatePath('/totally-unrelated')  -> A unchanged (11)
revalidateTag('nonexistent-tag')      -> A unchanged (11)
revalidatePath('/c-nostore')          -> A unchanged (14)   <- a REAL route that never reads the entry
revalidatePath('/b-cookies-dynamic')  -> A unchanged (14)   <- a REAL route that DOES read the same entry
no bust at all                        -> A unchanged (11)
```

Model derived from those, then tested against a fresh prediction:

> `revalidatePath('/X')` makes the **next render of `/X`** bypass the Data Cache
> for the fetches that render makes — regardless of which route populated the
> entry — and the refetched value replaces the shared entry for everyone.

```
seed via A                 -> 15
B reads cache              -> 15
revalidatePath('/b')  -> B -> 16   (predicted refetch)  ✓
A right after              -> 16   (predicted: sees B's new value)  ✓
B again                    -> 16   (predicted: cached)  ✓
```

Route handler (the sync path):

```
route req1 -> upstream_hit=17
route req2 -> upstream_hit=17
route req3 -> upstream_hit=17     <- the sync reads a CACHED upstream snapshot
revalidatePath('/r-route') -> 18
revalidateTag('public-courses') -> 19
```

### 3.3 Answer to the (a)/(b)/(c) question, per menu

The brief asked for one MSDB-backed menu. The measurement says the answer is
**different for the three menus in the symptom report**, which is itself the
finding:

- **`programs`** — **(c), only after the hour elapses.** `/admin/programs`
  renders `listPrograms()` under the `programs` tag; no `revalidateTag('programs')`
  exists anywhere, and no `revalidatePath('/admin/programs')` exists anywhere
  either (`program-order.js` revalidates `/` and `/training-course`). Both bust
  mechanisms measured in §3.2 are absent. **F5 cannot help.** This is the
  "sometimes F5 does not help either" half of the report.
- **`faqs`** — **(c) for the Sync button.** A FAQ is created upstream, not in
  Genesis (there is no `createFaq`; `actions/faqs.js` only toggles, reorders and
  syncs). Pressing Sync runs `syncFaqs()` inside a server action, which reads
  `listFaqs()` — the probe-R result shows that read is served from cache. The
  sync therefore writes an up-to-1 h-old snapshot into Mongo and the new FAQ is
  genuinely absent from the database. F5 re-reads Mongo and shows the same
  missing row.
- **`courses`** — **the cause is NOT the Data Cache, and §7 shows it is not the
  Router Cache or the client either.** `createCourse` calls
  `revalidatePath('/admin/courses')`, which forces the next render of that page
  to refetch upstream. Driving the whole flow in a real browser (§7) shows the
  row appearing without F5. The cause of the reported courses symptom is
  **still unidentified** and the remaining suspects are all upstream — see §7.4.

### 3.4 What this measurement cannot see

- ~~**The client Router Cache and `router.refresh()`.**~~ **Closed by §7** —
  measured in a real browser. The `push` + `refresh` ordering hypothesis stated
  here in the first draft is **disproven**.
- ~~**Server actions specifically.**~~ **Closed by §7** — the browser runs a
  real `'use server'` action and its `revalidatePath` behaves as measured.
- **Vercel's production Data Cache.** The probe used `next start`'s filesystem
  cache handler. Vercel's is a different, shared, multi-instance implementation.
  Cross-instance behaviour is not covered here.
- **Whether MSDB actually delivers `course.created` webhooks.** If it does,
  [handlers.js:143](src/lib/webhooks/handlers.js#L143) busts `public-courses`
  and `course:<id>` and the course menus partly self-heal. That is upstream
  configuration I cannot inspect. `WebhookLog` in Mongo would answer it.
- **MSDB read-after-write consistency.** If the upstream list endpoint lags its
  own write, no amount of cache busting on our side helps.
- **`/admin/courses` in a cold process.** Measured behaviour is per-entry, and
  I only exercised a single warm server.

---

## 4. Where I disagree with the diagnosis as handed to me

**4.1 "These tags are busted by NOTHING" overstates the consequence.** The tag
claim is literally true for 9 of the 11 named tags, but the conclusion drawn
from it — that the reading admin page is therefore stale — does not follow.
`revalidatePath('/admin/courses')` forces `/admin/courses`'s next render to
bypass the Data Cache (§3.2, with four controls; §6 re-tests it against
cross-route entry sharing and it holds). The mechanism is **route-scoped at
render time, not entry-scoped**: the flag is consulted while `/X` renders, so it
does not matter which route populated the entry (§6a/§6c). Since nearly every
action file does `revalidatePath(ADMIN_PATH)`, **the one page named by
ADMIN_PATH reads fresh even though its tag is never busted.** The brief says "`revalidatePath` IS
wired correctly nearly everywhere … do not 'fix' that; it is not the bug" — I
agree it should not be changed, but it is doing more work than the brief credits
it with, and Phase 1's tag busting will *not*, on its own, change what
`/admin/courses` shows.

**4.2 Two of the eleven "never-busted" tags are busted.** `public-courses` and
`course:<id>` are both invalidated by the inbound MSDB webhook via
[handlers.js:143](src/lib/webhooks/handlers.js#L143) →
[courseRevalidatePlan.js:48,55,56](src/lib/webhooks/courseRevalidatePlan.js#L48).
The brief's census of `revalidateTag` call sites lists five files in
`src/lib/actions` and misses `src/lib/webhooks/handlers.js:69`, which is a
dynamic `revalidateTag(tag)` — invisible to a grep for string literals. Phase 1's
guard must not treat that file as a non-buster.

**4.3 Three of the eleven "never-busted" tags are on dead code.**
`public-course:<id>` ([public-courses.js:32](src/lib/api/public-courses.js#L32)),
`contact-us` ([contact-us.js:18](src/lib/api/contact-us.js#L18)) and
`career-path:<slug>` ([career-paths.js:32](src/lib/api/career-paths.js#L32)) —
`getPublicCourse`, `getContactInfo` and `getCareerPath` have **zero callers** in
`src/`. They need busters for correctness-by-construction, but they cannot be
causing any reported symptom.

**4.4 The `/admin/faqs` claim needs one correction and one addition.** The brief
says `/admin/faqs` "reads Mongo and is genuinely fresh". Correct. But the
symptom "creating a FAQ does not make the row appear" cannot be a Genesis create
at all — **there is no `createFaq`**; `actions/faqs.js` exposes only
`toggleFaqActive`, `updateFaqOrder`, `updateFaqCategoryOverride` and
`syncFaqsAction`. So the reported FAQ symptom *is* the sync-reads-stale bug, and
Phase 1 fixes it outright rather than partially.

**4.5 `syncCareerPaths` is the counter-example that proves Phase 1's rule.**
[`syncCareerPathsAction`](src/lib/actions/career-paths.js#L95) does bust
`career-paths` — but *after* calling `syncCareerPaths()`. The sync therefore
reads the stale snapshot and the bust only helps the *next* sync. This is
exactly the "invalidate the SOURCE tag before it reads, not after it writes"
instruction, and it is already a live defect, not a hypothetical.

**4.6 An untaggable read the brief does not mention.**
[resolveIds.js:26](src/lib/api/resolveIds.js#L26) passes **no tag at all** and
caches for 300 s. It is called from *inside* `createCourse`/`updateCourse`, so a
course created in the last five minutes cannot be selected as `previous_course`
or `related_courses` — the field is silently dropped
([courses.js:206](src/lib/actions/courses.js#L206)). Phase 1's guard should flag
a tagless cached read, not just a tag without a buster.

**4.7 Table 1's stated scope misses two cached upstream reads** — see §1b.
`reviews.js` bypasses `aiFetch` entirely, and
`admin/courses/[courseId]/edit/page.jsx` imports `aiFetch` into a page.

**4.8 One `updateCourse` path is genuinely stale and unlisted.** `updateCourse`
revalidates `/admin/courses` and `/admin/courses/<id>/edit`, but the course
**detail** page `/admin/courses/[courseId]` reads `getCourseByCode` and its path
is never revalidated. Editing a course then opening its detail tabs shows the
old values for up to an hour.

**4.9 Phase 5's "7 pages including banners".** Exactly 7 admin `page.jsx` files
lack `export const dynamic`, so the count is right — but only **one** of them is
a list page (`banners`). The others are `403`, `9x-portal`, `door`,
`banners/new`, `banners/[id]/edit`, `masterclass/new`. Phase 5 should expect one
list page to fix and six pages to justify, not seven of each.

---

## 5. Verification policy for this task

No writes to production from me. `.env.local` is wired to production Mongo and
the live MSDB write key; I do not create a course, program or FAQ against
either. Mechanism is measured on the external instrument (§3, §6, §7). Real
click-testing on real data is the maintainer's to run, from the checklist in §8.

Note that a program and a FAQ **cannot be created from Genesis at all** — both
are upstream-owned, so the Phase 1 acceptance test for those two is necessarily
"create upstream, then watch Genesis", not "create in Genesis".

---

## 6. GAP 1 — does the implicit path flag survive cross-route entry sharing?

**Question.** `listPublicCourses()` is read by public routes *and* by
`/admin/courses`. The Data Cache key is url + options, so all of them share ONE
entry. If the invalidation were carried by soft tags stored **on the entry**, an
entry populated by a public render would carry only that route's tags, and
`revalidatePath('/admin/courses')` would miss it — which would make §4.1 correct
in the probe and wrong in production.

**Setup.** All probe routes issue the identical fetch, so they provably share one
entry. `/training-course` stands in for the public reader, `/admin/courses` for
the admin reader, `/admin/courses/[courseId]` for the detail page. Numbers below
are the upstream hit counter rendered by that route: unchanged = cache hit,
incremented = went upstream. Every run below was reproduced byte-identically
across two independent builds of the instrument.

**(a) public populates → `revalidatePath('/admin/courses')` → admin renders**

```
/training-course (populates) : hit=1        <- entry created by the PUBLIC route
/admin/courses   (after bust): hit=2   FRESH
/admin/courses   (again)     : hit=2
CONTROL, no bust:
/training-course (populates) : hit=3
/admin/courses   (no bust)   : hit=3   STALE  <- the probe can see staleness
```

**(b) reverse population order**

```
/admin/courses   (populates) : hit=4
/training-course (after bust): hit=5   FRESH
CONTROL, no bust:
/admin/courses   (populates) : hit=6
/training-course (no bust)   : hit=6   STALE
```

**(c) is the entry's tag set updated on read by another route, or fixed at
population time?**

```
c1  /admin/courses   (populates)        : hit=7
    /training-course (reads, cache hit) : hit=7
    revalidatePath('/training-course')
    /admin/courses                      : hit=7   CACHED   <- entry NOT invalidated
    CONTROL — prove admin can refetch right now:
    revalidatePath('/admin/courses')
    /admin/courses                      : hit=8   FRESH

c2  /admin/courses   (populates)        : hit=9
    /training-course (reads, cache hit) : hit=9
    revalidatePath('/training-course')
    /training-course (flagged, renders) : hit=10  FRESH
    /admin/courses                      : hit=10  <- sees the refreshed shared entry, no new upstream hit
```

**Answer.** Cross-route sharing is **not** a hole. The invalidation is
**route-scoped and consulted at render time**, not stored on the cache entry:
`revalidatePath('/X')` makes the next render *of `/X`* bypass the Data Cache
whoever populated the entry (a, b), and does **not** invalidate the entry for
anyone else (c1). When the flagged route does render, its refetch replaces the
shared entry, so other routes see the new value for free (c2).

**§1 therefore stands and is now measured rather than inferred.** No wording had
to be softened; the "effective freshness" column in Table 1 is correct.

**(d) dynamic segments — bears on finding 4.8**

```
/admin/courses/abc (populates)                        : hit=11
revalidatePath('/admin/courses')      -> /admin/courses/abc : hit=11  CACHED   <- parent bust does NOT reach the child
revalidatePath('/admin/courses/abc')  -> /admin/courses/abc : hit=12  FRESH
```

The parent-path result reproduced 6/6 times. So finding 4.8 is confirmed by
measurement: revalidating `/admin/courses` cannot refresh `/admin/courses/<id>`.

**A caveat I could not resolve.** `revalidatePath('/admin/courses/[courseId]',
'page')` refetched in 12 isolated trials but reproducibly **failed** when run at
one particular point inside the full §6 sequence — same position, both builds,
deterministic. I tried and failed to isolate the trigger (a prior literal bust
for the same URL is not it: 3/3 fresh). **Recommendation: Phase 1 should use the
literal path form**, which was 100% reliable across every trial. It also means
the repo's existing `revalidatePath('/[...slug]', 'page')` calls
([career-paths.js:51](src/lib/actions/career-paths.js#L51),
[handlers.js:431](src/lib/webhooks/handlers.js#L431)) are worth a follow-up look,
outside this task's scope.

---

## 7. GAP 2 — which layer holds the missing row on `/admin/courses`?

### 7.1 How this was measured

A real Chrome, headless, driven over the DevTools Protocol from Node 22's global
`WebSocket` — no new dependency, nothing installed. The instrument replicates the
repo's shipped shape exactly:

- [CourseForm.jsx:119-138](src/app/admin/courses/_components/CourseForm.jsx#L119) —
  `onSubmit` → `startTransition(async () => { await createCourse(fd); router.push('/admin/courses'); router.refresh(); })`
- [courses.js:219-231](src/lib/actions/courses.js#L219) — a `'use server'` action
  that writes upstream and calls **only** `revalidatePath('/admin/courses')`
- [CoursesAdminClient.jsx:14-52](src/app/admin/courses/_components/CoursesAdminClient.jsx#L14) —
  a list that reads its `courses` prop **directly**, with no `useState` copy

For every run the driver records the browser's network traffic and asks two
separate questions: did the **server** return the new row (is it in the RSC /
server-action response body), and did the **screen** show it. Those two
distinguish "the server never returned it" from "the server returned it and the
client discarded it".

### 7.2 The shipped flow — create, then navigate to the list

```
VARIANT=push-refresh  LIST=props  (this is exactly what the repo ships)
  form page rendered   : NEW hit=1 items=1
  landed on            : /admin/courses?mode=props
  SCREEN after create  : ADMIN hit=2 items=2   ids=["SEED-1","CREATED-…"]
  NETWORK
    SERVER-ACTION POST  /admin/courses/new                    serverReturnedNewRow=false
    RSC           GET   /admin/courses?…_rsc=12etc       0B   serverReturnedNewRow=false
    RSC           GET   /admin/courses?…_rsc=6q3hr    3619B   serverReturnedNewRow=true
  >> VERDICT: ROW APPEARS — no bug in this variant
```

`hit=1 → hit=2` proves the upstream was re-read; the RSC payload carried the new
row; the screen showed it. **The `router.push` + `router.refresh` ordering
hypothesis from the first draft is disproven.** I did not need the
`refresh-push` / `push-only` variants to explain anything.

### 7.3 The in-place case — where "never resyncs from props" actually bites

Navigating *to* a list mounts the list component fresh, so a `useState(props)`
copy initialises from the new data and looks correct. The failure mode needs the
component to be **already mounted** when new props arrive — i.e. a sync button, a
toggle, a delete, anything followed by `router.refresh()` without navigation.
Same page, same action, only the list component's state discipline changed:

```
LIST=props                                   LIST=state
  before: count=1 ids=[SEED-1]                 before: count=1 ids=[SEED-1]
  after : count=2 ids=[SEED-1,INPLACE-PROPS]   after : count=1 ids=[SEED-1]
  out   : ADMIN hit=1 items=1 -> hit=2 items=2 out   : ADMIN hit=1 items=1 -> hit=2 items=2
  RSC body containsNewRow = true               RSC body containsNewRow = true
  >> ROW APPEARS                               >> SERVER RETURNED IT, CLIENT DISCARDED IT
```

The `out` line is the in-page control: it is a **server**-rendered sibling of the
list inside the same RSC payload, and in the `state` run it updates to
`items=2` while the list beside it still shows one row. Same render, one part
moved, one did not — so the loss is provably in the client component, not in
what the server sent.

**This is the measurement that justifies Phase 2**, and it also bounds it: the
never-resync bug is a *refresh-in-place* bug, not a *create-then-navigate* bug.

### 7.3b `/admin/programs` — the opposite answer, measured

Faithful replica: `dynamic = 'force-dynamic'` + a tagged `listPrograms()` read,
a client seeded through a **verbatim copy** of `src/hooks/useDragReorder.js`
(md5-identical), and the shipped sync handler —
`await syncProgramsFromAPI(initialPrograms); window.location.reload();`
against a sync action that calls no revalidation of any kind, because
[program-order.js:25-47](src/lib/actions/program-order.js#L25) calls none.

A new program is created **upstream** (there is no create action for programs in
Genesis), then Sync is clicked in a real browser:

```
before             : PROGRAMS hit=1 count=1   ids=[PROG-SEED]
upstream now holds : 2 programs — the new one IS there
after sync+reload  : PROGRAMS hit=1 count=1   ids=[PROG-SEED]
  NETWORK: document GET /admin/programs  5379B  serverReturnedNewRow=false
  >> server returned the row: false
  >> screen showed the row  : false
  >> VERDICT: SERVER NEVER RETURNED IT
```

`window.location.reload()` is a genuine full document request — the network log
shows it — and `hit=1` never advances. **F5 provably does not help.** The client
is not implicated at all: it faithfully rendered what the server sent.

**CONTROL — one line changed, nothing else:**

```
revalidateTag('programs'), then reload:
after tag bust     : PROGRAMS hit=2 count=2   ids=[PROG-SEED, PROG-NEW]
  >> row now present: true
```

That is the whole fix for this menu. `SkillOrderClient.jsx:94-95` is the same
shape (`syncSkillsFromAPI` + `window.location.reload()`), so `skills` needs the
same treatment. **No client work is required here** — the drag hook's
never-resync defect is real but invisible on this screen, because the hard
reload remounts everything.

### 7.3c The FAQ report is TWO different bugs — and this is the one that matches "I created a FAQ"

There is no `createFaq` anywhere in Genesis, so "I created a FAQ and it did not
appear" can only mean one of two screens:

**(a) the Sync button on `/admin/faqs`.** The FAQ was created in MSDB; the admin
pressed Sync; `syncFaqsAction` → `syncFaqs()` → `listFaqs()` reads the
`faqs`-tagged entry, which nothing ever busts. Measured in §3.2 (probe R: three
consecutive route-handler reads returned `upstream_hit=17` unchanged). The sync
then writes an up-to-1 h-old snapshot into Mongo, so the row is **genuinely
absent from the database** and `window.location.reload()`
([FaqsAdminClient.jsx:211](src/app/admin/faqs/_components/FaqsAdminClient.jsx#L211))
cannot help. **Server-side.**

**(b) the per-course / career-path / masterclass FAQ tab**
([CourseFaqManager.jsx](src/app/admin/_components/CourseFaqManager.jsx)). This is
the **only** place in the entire admin where a human can create a FAQ, so it is
the literal reading of the report. `LocalFaq` is Mongo-only — no `aiFetch`
anywhere in the path — and `createLocalFaq` revalidates the hosting admin path
([local-faqs.js:57-58](src/lib/actions/local-faqs.js#L57)). Measured with the
verbatim drag hook and an uncached (Mongo-like) read, so the server is provably
fresh:

```
before create : SERVER faqs=1  count=1  ids=[faq-seed]
after  create : SERVER faqs=2  count=1  ids=[faq-seed]
the DB now has: 2 faqs
  SERVER-ACTION POST /admin/faq-tab  3623B  serverReturnedNewRow=true
  >> server returned the row: true
  >> screen showed the row  : false
  >> VERDICT: SERVER RETURNED IT, CLIENT DISCARDED IT
```

`SERVER faqs=1 → 2` is the in-page control: it is a **server**-rendered sibling
of the list inside the same RSC payload, and it moved while the `<ul>` beside it
did not. Same render, one part updated, one did not.

**And the sharper control, inside the same component:**

```
after delete  : SERVER faqs=1  count=0  ids=[]
  >> delete WAS reflected on screen: true
```

Delete works. Create does not. Same component, same action round-trip, same
`router.refresh()` availability — the only difference is the handler:

```js
function handleDelete(faq) { … setRows((cur) => cur.filter(…)); }   // splices → works
// handleSubmit success path, shared by create AND edit:
setShowForm(false); setEditingFaq(null); router.refresh();          // no splice → lost
```

`useDragReorder` is `useState(initialItems)` and never resyncs; `resetItems`
exists but no caller uses it. **Pure client-side. None of the tag work touches
this.**

Two consequences worth stating. First, **edit is broken the same way** — the
success path above is shared by both branches of `handleSubmit`, so an edited
question keeps showing its old text until a hard reload. (Not separately
measured; it is the same three lines.) Second, `CourseFaqManager` is rendered by
**five** surfaces, not the three its own docstring claims: `FaqTab`,
`CareerPathFaqClient`, `MasterclassFaqClient`, `ProgramFaqClient` and
`SkillFaqClient`. One fix covers all five.

**Answer to the question as posed: both (a) and (b) exhibit "added, did not
appear" today, for opposite reasons and needing opposite fixes.** (b) is the one
a user reaches by *creating* a FAQ; (a) is the one they reach by creating it
upstream and pressing Sync.

### 7.4 So what is wrong with `/admin/courses` in production?

Honest answer: **not established.** Three layers are now excluded by
measurement — the Data Cache (§3, §6), the client Router Cache and the
`push`/`refresh` ordering (§7.2), and client list state (§7.3, which cannot
apply to a fresh mount). What remains is everything the instrument replaces with
a mock:

1. **MSDB may not list a just-created course.** `createCourse` sends no
   published/active/status field at all —
   [courses.js:151-190](src/lib/actions/courses.js#L151) has
   `course_workshop_status`, `course_certificate_status`,
   `course_promote_status` and nothing else status-shaped. If upstream defaults a
   new PublicCourse to inactive and `/public-course` filters inactive rows out,
   the row never appears and **F5 cannot help** — which matches the report
   better than any cache explanation. `docs/api-domains.md:258` documents
   `?status=all` for `/career-path` and nothing equivalent for
   `/public-course`; `listPublicCourses()` sends no status param.
2. **MSDB read-after-write lag.** If the list endpoint trails its own write, our
   cache correctness is irrelevant.
3. **`resolveCourseRefs` may reject the save silently.**
   [resolveIds.js:26](src/lib/api/resolveIds.js#L26) caches the code→ObjectId map
   for 300 s with no tag, and unresolved codes are **dropped**
   ([courses.js:206](src/lib/actions/courses.js#L206)) — the save then succeeds
   with fields missing. This is finding 4.6 and it is a real defect regardless.
4. **Whether MSDB delivers `course.created` webhooks at all** — `WebhookLog` in
   Mongo answers this.

§8 is the checklist that separates these.

---

## 8. Checklist for the maintainer (real data, real browser)

Run these against the live admin. Each step says what to watch and what the
answer rules out. **Do not skip the "before" observations** — several of these
only mean something as a difference.

**A. Does upstream list a brand-new course at all?** (tests §7.4 items 1 & 2)

1. Open a terminal and run, with the real key:
   `curl -s -H "x-api-key: $AI_API_KEY" "$AI_API_BASE/public-course" | jq '.items | length'`
   Write the number down. Call it **N**.
2. In the admin, go to **หลักสูตร (`/admin/courses`) → + สร้างหลักสูตร**, fill in
   only ชื่อหลักสูตร and รหัสหลักสูตร (use an obvious throwaway code like
   `ZZTEST-01`), and press save.
3. Immediately re-run the curl from step 1. Does it return **N+1**, and does
   `jq '.items[] | select(.course_id=="ZZTEST-01")'` print a row?
   - **No row** → the upstream itself is not listing it. Nothing in Genesis can
     fix that; stop here and tell me, because Phase 1 changes nothing for this.
   - **Row present** → upstream is fine; continue to B.
4. Wait 30 seconds and re-run step 3 once more, to separate "never appears" from
   "appears late" (read-after-write lag).

**B. Does the admin list show it?** (only meaningful if A gave a row)

5. After saving in step 2 you were returned to `/admin/courses`. **Without
   pressing F5**, is `ZZTEST-01` in the table? Note yes/no.
6. Now press F5. Is it there? Note yes/no.
7. Check the filter bar first if it is missing — ค้นหา, โปรแกรม and ประเภท are
   client-side filters and a new course with no `program` set will be hidden by
   an active โปรแกรม filter. Clear all three and re-check.

**C. Did the webhook fire?** (tests §7.4 item 4)

8. Go to **Webhook Logs (`/admin/webhook-logs`)**. Is there a `course.created`
   entry from the last few minutes naming `ZZTEST-01`? Note yes/no and, if yes,
   what its `revalidated` column lists.

**D. The programs menu — server-side, measured in §7.3b**

9. Create a new program **in MSDB**, not in Genesis (there is no create action
   for programs).
10. Open **โปรแกรม & Skills (`/admin/programs`)**. Is the new program listed?
11. Press the **Sync จาก API** button. The page hard-reloads by itself. Is it
    listed now?
12. Press **F5** twice more. Expected from §7.3b: **absent at 10, 11 and 12**,
    for up to an hour. Note roughly how long until it appears on its own — that
    number is the Data Cache TTL and confirms the diagnosis outright.
13. Repeat 9–12 on the **Skills** tab with a new skill. Same expectation.

**E. The FAQ tab — client-side, measured in §7.3c. This is the one that matches
"I created a FAQ".**

14. Open any course's admin editor → the **FAQ** tab (or a career path's
    `/faqs`, or a masterclass's `/faqs` — all five surfaces share one component).
15. Press **เพิ่มคำถาม**, type a question, save.
16. **Without pressing F5**, is the new question in the table? Expected:
    **no** — and note that the row count text above the table ("N คำถาม") also
    does not move, because it reads the same stale array.
17. Press F5. It should now appear. If it does, the server was always fine and
    the bug is entirely in the client.
18. Now **edit** an existing question's text and save. Does the table show the
    new text without F5? Expected: **no**, same defect, same three lines.
19. Now **delete** a question. Does it disappear immediately? Expected: **yes**.
    This is the control — it proves the action, the round-trip and your session
    are all fine, and isolates the failure to the create/edit handler.

**F. The FAQ sync — server-side, a different bug with the same symptom**

20. Create a new FAQ **in MSDB**.
21. Open **จัดการ FAQ (`/admin/faqs`)** and press the sync button.
22. Is the new FAQ listed after the page reloads? Expected: **absent**, because
    `syncFaqs()` reads an up-to-1 h-old upstream snapshot and writes that.
23. Press sync a second time immediately. Still absent? It should be — nothing
    busts the `faqs` tag, so the second read is the same cached snapshot.

**G. Cleanup**

24. Delete `ZZTEST-01` (admin list → ลบ), the probe FAQ from step 15, and the
    throwaway program/skill/FAQ upstream.

Report the numbered answers back and I will fold them into Phase 1. Steps D and
E are the two Phase 1 is designed to fix; A/B/C decide whether the courses
symptom is even a Genesis bug.
