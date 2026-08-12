# Cache console — inventory (round 1, evidence only)

Scope: what a `/admin/cache` console could be built against. **No UI decisions
here.** Every claim cites `file:line` opened while writing this. Where a fact
could not be established it is recorded as **UNKNOWN** rather than inferred.

Measured at `da643a9` on branch `dev`, 2026-08-12. Route classifications come
from a real `next build` at that commit, not from reading route config — see
§B.3 for why the two disagree.

---

## A. Mongo-backed snapshot caches

Six collections hold data mirrored from the upstream MSDB API. They fall into
**two structurally different kinds**, and the difference decides what a console
can show.

### A.1 Single-document snapshots (2)

| | `landing_cache` | `nav_menu_cache` |
|---|---|---|
| Model | `src/models/LandingCache.js:46` | `src/models/NavMenuCache.js:24` |
| Key | `key: 'homepage_v1'` — `LandingCache.js:18`, read at `getLandingData.js:19` | `key: 'navmenu_v1'` — `NavMenuCache.js:14`, read at `getNavMenuData.js:29` |
| Payload | `data.{banners,programs,skills,newCoursesWithSchedules,onlineCoursesForSection,reviews}`, all `Mixed` — `LandingCache.js:20-27` | `data.{programs,skills}`, both `Mixed` maps — `NavMenuCache.js:14-19` |
| Freshness fields | `syncedAt`, `status` (`ok\|partial\|error`), `syncErrors[]`, `schemaVersion`, `sections{}` counts — `LandingCache.js:29-44` | `syncedAt`, `status` (`ok\|partial\|error`) — `NavMenuCache.js:21-22` |
| Writer | `syncLandingData()` → `findOneAndUpdate` at `syncLandingData.js:401-410` | `syncNavMenuData()` → `findOneAndUpdate` at `syncNavMenuData.js:156-163` |
| Reader | `getLandingData()` — `src/lib/landing/getLandingData.js`; consumed by `src/app/page.jsx:76` | `getNavMenuData()` — `src/lib/navmenu/getNavMenuData.js`; consumed by `PublicHeader.jsx:46` and `src/app/page.jsx:80` |
| Reader on missing doc | Returns `DEFAULT_DATA` (all sections empty) with `_meta.status='missing'`, `snapshotAvailable:false`, and `console.warn` — `getLandingData.js:54-57` | Returns `EMPTY` (all maps `{}`) — `getNavMenuData.js:88-89`. **Silent: no warn, no error.** |
| Reader on schema drift | `_meta.status='schema_mismatch'`, serves empty defaults — `getLandingData.js:61-74` | no schema version field at all |
| Reader on read failure | `_meta.status='error'` + `console.error` — `getLandingData.js:97-102` | bare `catch {}` → `EMPTY` — `getNavMenuData.js:88` |

**`nav_menu_cache` has strictly less observability than `landing_cache`**: no
`syncErrors`, no `schemaVersion`, no `sections` counts, and its reader cannot
distinguish "document missing" from "document present but empty" from "Mongo
threw" — all three produce the same `EMPTY` value at `getNavMenuData.js:89`.

### A.2 Row-level mirrors (4)

These do **not** store a snapshot document. They upsert one row per upstream
record into a domain collection, merging admin-owned fields via `$setOnInsert`.

| Collection | Model | Sync writer | Per-row freshness | Reader |
|---|---|---|---|---|
| `career_paths` | `CareerPath.js:110` | `syncCareerPaths.js:200` (`updateOne`, upsert) | `synced_at` in `$set` — `syncCareerPaths.js:84` | `getActiveCareerPaths()` `getCareerPaths.js:18`; `getCareerPathBySlug()` `:34`; `getAllCareerPaths()` `:54` |
| `faqs` | `Faq.js:45` | `syncFaqs.js:90` | `synced_at` — `syncFaqs.js:51` | `getActiveFaqsGrouped()` `getFaqs.js:27`; `getAllFaqs()` `:43`; `getFaqCategories()` `:50` |
| `instructors` | `Instructor.js:28` | `syncInstructors.js:72` | `synced_at` — `syncInstructors.js:37` | `getActiveInstructors()` `getInstructors.js:14`; `getAllInstructors()` `:22` |
| `promotions` | `Promotion.js:76` | `syncPromotions.js:137` | `synced_at` — `syncPromotions.js:94` | `getActivePromotions()` `getPromotions.js:25`; `getAllPromotions()` `:56` |

All four readers degrade the same way and it is worth stating once: an empty
collection is returned as an empty array (`getFaqs.js:29`, `getInstructors.js:16`,
`getCareerPaths.js:20`, `getPromotions.js:27` are all plain `find(...).lean()`
with no missing-data branch). **None of them can distinguish "the sync has never
run" from "upstream legitimately has no rows"** — unlike `getLandingData`, which
carries `_meta.status` for exactly that purpose.

Three further facts about all four, verified by grep across the four files:

1. **No deletes.** None of the four calls `deleteMany`/`deleteOne`/
   `findOneAndDelete`, and none sets `is_active:false` on a vanished row. A
   record removed upstream stays in Mongo forever with a frozen `synced_at`.
2. **No per-collection status document.** Freshness is `max(synced_at)` across
   rows and nothing else. There is no `status`, no `syncErrors`.
3. **A failed run leaves no trace in Mongo.** Each sync returns
   `{ok, synced, syncedAt, errors}` to its caller (e.g.
   `syncInstructors.js:61`), the cron route returns that as the HTTP response,
   and **no cron route writes any model** (verified: zero model imports or
   writes across `src/app/api/cron/*/route.js`). So a sync that failed at
   03:00 is indistinguishable, from Mongo, from a sync that never ran.

### A.3 Reader-side in-memory cache (1) — not in the original list

`src/lib/search/searchCorpus.js:183-185` — module-level `cached` / `cachedAt` /
`pending`, TTL `SEARCH_CORPUS_TTL_MS = 1800 * 1000` (`:71`). Built by
`getSearchCorpus()` (`:188`), cleared by `resetSearchCorpusCache()` (`:204`).

This is **per Node process**. Nothing in app code can clear another serverless
instance's copy, so `resetSearchCorpusCache()` only ever affects the instance
that runs it.

---

## B. Next revalidation

### B.1 `revalidatePath`

**241 call sites** across `src/` (excluding comments and log lines). They are
not individually interesting; the shapes that matter are:

- **`revalidatePath('/', 'layout')`** — the widest scope in the codebase, used
  where the site chrome changes. Call sites: `syncNavMenuData.js:213`,
  `syncCareerPaths.js:233`, `site-notifications.js:48`, `tnhs-courses.js:17`,
  `nav-featured-online-courses.js:17`, `page-configs.js:86,102,150,166`,
  `course-extensions.js:348,425` (via the visibility plan),
  `handlers.js:430` (`'/(public)'`, `'layout'`).
- **Narrow, measured scopes** — `syncInstructors.js:105` (`/about-us` only) and
  `syncPromotions.js:168` (`/promotions` only), both with an in-file note
  saying the narrowing is deliberate.
- **Guarded vs unguarded.** The five sync writers wrap the call in try/catch
  with a `console.warn` (`syncLandingData.js:445-448`,
  `syncNavMenuData.js:213-217`, `syncCareerPaths.js:233-237`,
  `syncInstructors.js:105-109`, `syncPromotions.js:168-172`) because
  `revalidatePath` throws outside a request scope. Server actions do not guard.

### B.2 `revalidateTag`

Fixed-string call sites — the complete list:

| Tag | Call site |
|---|---|
| `articles` | `src/lib/actions/articles.js:164` |
| `career-paths` | `src/lib/actions/career-paths.js:47`, `webhooks/handlers.js:428` |
| `custom-pages` | `src/lib/actions/customPages.js:28` |
| `page-builder` | `src/lib/actions/pageBuilder.js:93`, `src/lib/actions/promotions.js:196` |
| `schedules` | `src/lib/actions/schedules.js:69`, `webhooks/handlers.js:170` |
| `schedules:course:<oid>` | `src/lib/actions/schedules.js:73` |

Plus the indirect buster `bustUpstream(...tags)` at `src/lib/api/bustUpstream.js:76-88`,
which loops `revalidateTag` and **returns the list of tags actually busted**
(`:87`) — a console could surface that return value. Its vocabulary is frozen at
`bustUpstream.js:29-43`: `public-courses`, `programs`, `skills`, `faqs`,
`instructors`, `online-courses`, `promotions`, `career-paths`, `contact-us`,
`schedules`, `reviews`.

### B.2.1 The dynamic tag site

`src/lib/webhooks/handlers.js:69` calls `revalidateTag(tag)` with a variable.
A literal grep for tag names misses everything it emits. Traced:

- The variable comes from `safeRevalidateTag(t)` at `handlers.js:143`, looping
  `tags` destructured at `handlers.js:142` from
  `planCourseRevalidation(event, courseId, aliasPaths)`.
- That planner is `src/lib/webhooks/courseRevalidatePlan.js:39`. Its complete
  tag output:
  - `event === 'course.deleted'` → `['public-courses']` (`courseRevalidatePlan.js:48`)
  - otherwise → `['course:<courseId>', 'public-courses']` (`:57-58`)
- `courseId` is the upstream `course_id` from the webhook payload, so
  `course:<id>` is unbounded in value but fixed in shape.
- Two other `safeRevalidateTag` calls in the same file pass literals:
  `'schedules'` (`handlers.js:170`) and `'career-paths'` (`handlers.js:428`).

**So `handlers.js:69` can emit exactly four tag shapes:** `public-courses`,
`course:<course_id>`, `schedules`, `career-paths`.

`handlers.js` also records every outcome — `safeRevalidate` and
`safeRevalidateTag` return `{type, target, ok, error?}` (`:61-64`, `:70-74`),
accumulated into `revalidated[]` (`:125-126`) and returned to the route. Whether
that reaches `WebhookLog` is confirmed by the model existing (`WebhookLog.js:38`)
and the header comment at `handlers.js:52-55` saying that is its purpose.

### B.3 Fetch-level cache config

Every `next: { tags }` / `next: { revalidate }` in the upstream layer. `aiFetch`
defaults to `revalidate = 3600` when not specified (`client.js:38`).

| Adapter | Tag | Revalidate |
|---|---|---|
| `programs.js:12` | `programs` | 3600 (default) |
| `skills.js:12` | `skills` | 3600 (default) |
| `faqs.js:13` | `faqs` | 3600 (default) |
| `instructors.js:13` | `instructors` | 3600 (default) |
| `contact-us.js:18` | `contact-us` | 3600 (default) |
| `online-courses.js:21` | `online-courses` | 3600 (default) |
| `promotions.js:31` | `promotions` | 3600 (default) |
| `career-paths.js:23` | `career-paths` | 3600 (default) |
| `career-paths.js:34` | `career-path:<slug>` | 3600 (default) |
| `public-courses.js:65` | `public-courses` | 3600 (default) |
| `public-courses.js:87` | `public-course:<idOrCode>` | 3600 (default) |
| `public-courses.js:107` | `course:<courseId>` | 3600 (default) |
| `schedules.js:67` | `schedules` | 3600 (default) |
| `schedules.js:120-121` | `schedules:course:<oid>` | **1800** |
| `reviews.js:24` | `reviews` | 3600 — raw `fetch`, not `aiFetch` |
| **`resolveIds.js:26`** | **NONE** | **300** |

**`resolveIds.js` confirmed as described.** `aiFetch(PATH, { revalidate: REVALIDATE })`
at `:26` with `REVALIDATE = 300` at `:23` and no `tags` key. No
`revalidateTag` can reach it; it expires only on its own 5-minute timer. It
fetches the full `/public-course` list (`:22`) and is used to map `course_id` →
ObjectId, so for up to 5 minutes it can resolve against a course list that
every tagged reader has already been told is stale.

Two uncached reads for completeness: `actions/courses.js:347` and
`admin/courses/[courseId]/edit/page.jsx` both call
`aiFetch('/public-course', { revalidate: 0 })`, which `client.js:59-61` maps to
`cache: 'no-store'`.

### B.4 Route segment config, and the fully-static question

Source config: **15** routes export `revalidate` and **~100** export `dynamic`
(overwhelmingly `force-dynamic` on `/admin/*` and `/api/*`).

**Reading route config from source gives the wrong answer, and this is the most
consequential finding in §B.** `/terms/page.jsx`, `/policies`, `/cookie-policy`,
`/privacy-policy`, `/refund-policy` and `/social` export no `revalidate` and
fetch nothing — a source-only inventory calls them fully static. The build
disagrees: every one is `○ Static` with **Revalidate 1h**.

Traced to source: those routes sit under `src/app/(public)/layout.jsx:15`, which
renders `PublicHeader`. `PublicHeader.jsx:1` imports `listPrograms`, called at
`PublicHeader.jsx:28`, and `programs.js:12` is a tagged `aiFetch` at the default
3600s. Next lowers a segment's effective revalidate to the shortest fetch
revalidate inside it, so **every page that renders the site chrome inherits 1h**.
`/_not-found` shows 1h for the same reason (`not-found.jsx` mounts
`PublicHeader`), and `/` does too despite exporting no `revalidate`.

Consequence for the console, stated plainly: **there is exactly one fully-static
public route — `/robots.txt`** (blank Revalidate column in the build; it renders
no chrome). Everything else public carries an effective revalidate, and the
`programs` tag reaches all of their *data* caches.

Public route table from `next build` at `da643a9`:

| Revalidate | Routes |
|---|---|
| (none) | `/robots.txt` |
| 1m | `/api/notifications/active` |
| 30m | `/schedule`, `/training-course` |
| 1h | `/`, `/about-us`, `/career-path-project`, `/contact-us`, `/cookie-policy`, `/join-us`, `/masterclass/payment/complete`, `/_not-found`, `/policies`, `/portfolio`, `/privacy-policy`, `/promotions`, `/refund-policy`, `/registration/payment/complete`, `/restaurant-and-hotel-nearby-9expert-training`, `/sitemap.xml`, `/social`, `/terms` |
| ƒ Dynamic | `/[...slug]`, `/search`, `/promotions/[slug]`, `/preview/[slug]`, `/faq`, `/articles`, `/masterclass/*`, all `/admin/*`, all `/api/*` |

`/contact-us` exports `revalidate = 86400` (`contact-us/page.jsx:9`) but builds
at 1h, for the same minimum-fetch-revalidate reason — its own
`contact-us.js:18` fetch is 3600. **The exported value is not the effective one.**

---

## C. Upstream fetch layer

`src/lib/api/client.js` is the only module that touches upstream (`:4`).

- **Timeout: 10s**, `UPSTREAM_TIMEOUT_MS = 10_000` at `client.js:25`, applied
  via `fetchWithTimeout(url, {...}, UPSTREAM_TIMEOUT_MS)` at `:69-79`.
  `fetchWithTimeout.js:14-21` is an `AbortController` + `setTimeout`; on timeout
  the fetch rejects with an `AbortError`.
- **Retries: none.** Verified by grep for `retry|retries|attempt` across
  `src/lib/api/` and `fetchWithTimeout.js` — zero hits. A single timeout or a
  single non-2xx is final for that request.
- **Non-2xx throws** — `client.js:81-86` raises with status, path and the first
  200 bytes of the body.

### C.1 `unwrap()` — the silent-loss path

`client.js:95-105`. Returns `{items: [], total: 0}` when the response is not an
object (`:96-98`), and `items` is `[]` unless `response.items` is an array
(`:99`). **It never throws.** So a 200 response with an unexpected shape becomes
an empty envelope that is indistinguishable from "upstream has no rows".

17 call sites go through it: `career-paths.js:25,36`, `contact-us.js:19`,
`faqs.js:14`, `instructors.js:14`, `online-courses.js:23`, `programs.js:13`,
`promotions.js:39`, `public-courses.js:67,89,109`, `resolveIds.js:27`,
`schedules.js:69,123`, `skills.js:13`, `actions/courses.js:144,348`.

**A second, larger silent-loss path sits on top of it**: 45 sites in `src/`
match `.catch(() => ({ items: [] }))`, which converts a thrown upstream error
(timeout, 5xx, missing API key) into the same empty envelope. Between the two,
"upstream is down" and "upstream returned nothing" are the same value at almost
every call site.

Two places in the codebase already treat that as a known hazard and compensate:
`syncLandingData.js:272` ("THE SECOND OPINION ON A ZERO") cross-checks a
zero-count program probe against the full course list, and
`programProbeOutcome.js:24` documents the same rule. Nothing else does.

---

## D. Scheduled and manual triggers

### D.1 Cron (`vercel.json`)

| Route | Schedule | Syncs | Revalidates after |
|---|---|---|---|
| `/api/cron/landing-sync` | `0 */3 * * *` | `syncLandingData()` (`route.js:37`) | `revalidatePath('/')` inside the sync, `syncLandingData.js:445` |
| `/api/cron/navmenu-sync` | `0 */3 * * *` | `syncNavMenuData()` (`route.js:27`) | `revalidatePath('/', 'layout')`, `syncNavMenuData.js:213` |
| `/api/cron/promotions-sync` | `0 */6 * * *` | `syncPromotions()` (`route.js:26`) | `revalidatePath('/promotions')`, `syncPromotions.js:168` |
| `/api/cron/faqs-sync` | `0 */6 * * *` | `syncFaqs()` (`route.js:26`) | **none** — `syncFaqs.js` imports no `revalidatePath` |
| `/api/cron/career-paths-sync` | `0 */6 * * *` | `syncCareerPaths()` (`route.js:26`) | `revalidatePath('/', 'layout')`, `syncCareerPaths.js:233` |
| `/api/cron/instructors-sync` | `0 */6 * * *` | `syncInstructors()` (`route.js:23`) | `revalidatePath('/about-us')`, `syncInstructors.js:105` |

All six gate on `Bearer ${CRON_SECRET}` from the `authorization` header
(`landing-sync/route.js:26-27` and the same shape in the other five), and all six
are `force-dynamic`.

`syncFaqs` having no revalidation is **deliberate and documented elsewhere**:
`/faq` is `force-dynamic` (`faq/page.jsx:9`), so there is no baked output to
invalidate. The build confirms `/faq` as ƒ Dynamic.

### D.2 Admin sync endpoints

`POST /api/admin/{landing,navmenu,promotions,faqs,career-paths,instructors}/sync`
— each calls `auth()` and then the same sync function
(`admin/landing/sync/route.js:20,26` and the same shape in the other five). All
`force-dynamic`. They call the sync **directly**, so they get whatever
revalidation the sync itself performs and nothing more.

### D.3 `trigger*` helpers

Five, all using `after()` from `next/server` so the work runs after the response
flushes, all swallowing their own errors:

| Helper | Sync | Extra revalidation |
|---|---|---|
| `triggerLandingSync.js:25` | `syncLandingData` | `revalidatePath('/')` `:30` |
| `triggerCareerPathSync.js:11` | `syncCareerPaths` | `/career-path-project` `:16`, `/[...slug]` page `:18` |
| `triggerFaqSync.js:11` | `syncFaqs` | `/faq` `:16` |
| `triggerInstructorSync.js` | `syncInstructors` | `/admin/instructors` `:16` |
| `triggerPromotionSync.js` | `syncPromotions` | `/promotions` `:16`, `/promotions/[slug]` page `:17` |

**Each is one caller of three or four.** The cron route and the admin sync route
both call the sync function directly and bypass the wrapper entirely — which is
why the revalidation was moved into the sync bodies. The wrappers' extra paths
are additive only.

### D.4 Webhook-driven (`/api/webhooks/msdb`)

`force-dynamic` (`route.js:24`), explicitly no `revalidate` (`route.js:23`).
Handlers in `src/lib/webhooks/handlers.js` — see §B.2.1. Note
`handlers.js:146`: a non-delete course event also fires a **background landing
resync** via `defaultSyncLanding()` (`:107-110`), a dynamic `import()` +
fire-and-forget.

### D.5 Existing prior art — `/admin/landing-cache`

A partial console already exists: `src/app/admin/landing-cache/page.jsx`,
gated by `requirePage('landing_cache')` (`:26`), `force-dynamic` (`:18`). It
reads the `homepage_v1` doc with `.select('-data')` (`:33-36`) — heavy payload
stripped, status meta kept — and hands it to `LandingCacheClient` with a "Sync
now" button posting to `/api/admin/landing/sync` (`:5-6`). **Round 2 should
extend or absorb this rather than build beside it.**

---

## E. Observability truth table — THE DELIVERABLE

Exactly one classification per item.

### READABLE — real current state, queryable at request time

| Item | Read it from |
|---|---|
| `landing_cache` snapshot presence, `syncedAt`, `status`, `syncErrors[]`, `sections{}` counts, `schemaVersion` | `LandingCache.findOne({key:'homepage_v1'}).select('-data')` — exactly what `admin/landing-cache/page.jsx:33` already does |
| `nav_menu_cache` presence, `syncedAt`, `status` | `NavMenuCache.findOne({key:'navmenu_v1'})` — `getNavMenuData.js:38` |
| `nav_menu_cache` payload size: program/skill counts, courses per group | the `data.programs` / `data.skills` maps, `NavMenuCache.js:14-19` |
| `career_paths` / `faqs` / `instructors` / `promotions`: row count, and last-sync time as `max(synced_at)` | the collections; `synced_at` at `syncCareerPaths.js:84`, `syncFaqs.js:51`, `syncInstructors.js:37`, `syncPromotions.js:94` |
| Per-row staleness in those four: rows whose `synced_at` is older than the newest | same field — this is how an upstream-deleted row is detectable, since nothing deletes |
| Cron/manual sync **outcome for the run you just triggered** | the sync's return value `{ok, synced, syncedAt, errors}`, e.g. `syncInstructors.js:61`, surfaced through the admin sync route's response |
| Webhook revalidation outcomes — **the richest audit trail in the system** | `revalidated[]` accumulated at `handlers.js:125-126` from `safeRevalidate`/`safeRevalidateTag` `{type,target,ok,error}` (`:61-64`, `:70-74`), returned at `handlers.js:148`, read at `webhooks/msdb/route.js:135` and **persisted** by `WebhookLog.create({... revalidated ...})` at `route.js:50,59`. Confirmed, not assumed |
| Effective route revalidate windows | static facts from `next build`; can be shipped as a constant table, **not** queried |

### INFERRED — only a proxy exists, and the proxy answers a different question

| Item | What you can see | What it does NOT tell you |
|---|---|---|
| `landing_cache.syncedAt` / `nav_menu_cache.syncedAt` | when a **write** last happened | whether any **served page** reflects it. The page is a separately-cached HTML render; a snapshot written 10s ago can sit behind an hour-old rendered page |
| `landing_cache.status === 'ok'` | the last run reported no errors | that the data is **correct**. `unwrap()` (`client.js:95-105`) turns an unreadable 200 into an empty envelope, so a section can be legitimately empty and legitimately `ok`. `syncLandingData.js:272` exists because of exactly this |
| `max(synced_at)` on the four mirror collections | when a sync last **succeeded in touching a row** | whether the most recent run failed. Failures are returned to the caller and never persisted — **no cron route writes any model** |
| Row count on the four mirrors | how many rows exist locally | how many exist upstream. No sync deletes, so the count only ever grows |
| "Is the cron healthy?" | last `syncedAt`, plus Vercel's own cron log (outside the app) | nothing in-app records a run. A skipped run and a failed run look identical |
| `bustUpstream()` return value (`bustUpstream.js:87`) | which tags a given call **attempted and did not throw on** | whether any cache entry actually existed under that tag, or was evicted |
| `/search` corpus freshness | `SEARCH_CORPUS_TTL_MS` (`searchCorpus.js:71`) and the in-process `cachedAt` (`:184`) | anything about **other** serverless instances. Each holds its own copy |

### NOT OBSERVABLE — must never be rendered as a status

| Item | Why |
|---|---|
| **Next Data Cache entry state** (does a tag have a live entry, when does it expire, when was it last filled) | No app-facing read API. `revalidateTag` is write-only and returns `void` — `bustUpstream.js:81` discards nothing because there is nothing to discard |
| **ISR / Full Route Cache entry state on Vercel** (is `/training-course` currently serving a baked HTML entry, how old is it, when will it regenerate) | Same — `revalidatePath` is write-only. Nothing in this repo reads it, and no documented API was found. If a console shows "page is fresh", it is guessing |
| **Whether a `revalidatePath` / `revalidateTag` call had any effect** | Both return `void`. `safeRevalidate` (`handlers.js:56-66`) records `ok:true` when the call **did not throw** — that is "the call was made", not "a cache was cleared" |
| **The CDN edge cache** | Not touched by any file in this repo |
| **Whether another serverless instance's `/search` corpus is stale** | `searchCorpus.js:183-185` is module scope; `resetSearchCorpusCache()` (`:204`) affects one process |
| **When the next cron will fire** | Schedules are declared in `vercel.json` (readable as static text) but the scheduler is Vercel's; no run state exists in-app |
| **Whether upstream MSDB is currently healthy** | Only knowable by making a request. Any "upstream: OK" badge is a claim about one probe at one instant, not a state |

**The rule this table exists to set:** the console may show *when a write
happened* and *what a write reported*. It may not show *whether what a visitor
sees is current* — nothing in this application can read that.

---

## F. Action inventory — design input for round 2. NOT BUILT.

### F.1 Re-run a sync

| Action | Reversible? | Lost if run at a bad moment | Surface degraded |
|---|---|---|---|
| `POST /api/admin/landing/sync` | Effectively — the next successful run replaces it | Sections that fail are **not** wiped: `syncLandingData` carries non-empty sections forward (documented at `syncLandingData.js:20-22`). But `status` and `syncErrors` are overwritten, so the previous run's error detail is gone | `/` — a partial run leaves sections empty until the next good one |
| `POST /api/admin/navmenu/sync` | Same | `nav_menu_cache` has no per-section carry-forward analogous to landing's; a program that errors is **omitted** (`syncNavMenuData.js:115` only stores entries with `items.length > 0`) | The mega menu, i.e. **every public page**, via `PublicHeader` |
| `POST /api/admin/{promotions,faqs,career-paths,instructors}/sync` | Yes — upserts only, `$setOnInsert` protects admin-owned fields | Nothing is deleted. Admin toggles survive by design (`syncInstructors.js:6`, `syncPromotions.js:6`) | `/promotions`, `/faq`, `/career-path-project`, `/about-us` respectively |

Shared caveat: all six take 5-15s for landing (`triggerLandingSync.js:6-7`) and
fan out to upstream. Running several at once multiplies upstream load with no
rate limiting anywhere in `src/lib/api/`.

### F.2 Delete a snapshot document — **the dangerous one**

| Action | Reversible? | Lost if run at a bad moment | Surface degraded |
|---|---|---|---|
| Delete the `landing_cache` document | **Only by a successful sync.** There is no second copy | **If upstream is failing, the home page has no snapshot to fall back on at all.** `getLandingData.js:54-57` returns `DEFAULT_DATA` — every section empty — with `_meta.status='missing'`. The whole point of the collection (`LandingCache.js:11-13`: "if it fails, the previous successful copy stays put so the home page never breaks") is destroyed by this one action, and destroyed precisely when it is most needed | `/` renders empty. `ProgramSelector.jsx:33` reads `snapshotAvailable` to distinguish this from a genuinely empty result, so it can *say* it has no data — it cannot show any |
| Delete the `nav_menu_cache` document | Only by a successful sync | `getNavMenuData.js:88-89` returns `EMPTY` **silently** — no warn, no error, no `_meta`. The mega menu renders with no courses on every public page, and nothing anywhere reports why | Site-wide navigation |

**If round 2 offers deletion at all**, these two need a confirmation that states
the fallback consequence, and ideally a precondition that a fresh sync succeeded
first. A "clear cache" button that reads like a browser's is the wrong mental
model here: this is deleting the only copy of the served data.

### F.3 Fire a revalidation

| Action | Reversible? | Lost | Surface degraded |
|---|---|---|---|
| `revalidateTag(<tag>)` for any of the 11 fixed tags | N/A — nothing is destroyed | Nothing. Worst case is a cache miss and a re-fetch | Momentary latency on the next request for that data |
| `revalidatePath('/', 'layout')` | N/A | Nothing destroyed, but it drops the rendered output for **every route under the root layout**. Every subsequent first-visitor pays a full re-render | Site-wide latency spike; on a cold upstream, a re-render that hits a 10s timeout per call (`client.js:25`) with **no retry** |
| `revalidatePath('/<specific>')` | N/A | Nothing | One route re-renders |

The asymmetry worth designing around: **tag busts are cheap and targeted, path
busts at `('/', 'layout')` are a site-wide re-render.** Offering both behind one
undifferentiated "refresh" control would hide a 100× cost difference.

### F.4 Not possible, and worth saying so in the UI

- Clearing the Next Data Cache or ISR cache directly — only invalidation
  (§E, NOT OBSERVABLE).
- Clearing another instance's `/search` corpus (§A.3).
- Forcing an immediate cron run outside its schedule — the admin sync endpoints
  are the substitute, and they run in the request, not on the cron's identity.

---

## Unknowns — stated as unknown, not guessed

1. **Whether `syncLandingData` reading stale upstream is a live defect.** It is
   the only one of the six syncs that never calls `bustUpstream` (verified: no
   import, no `revalidateTag`, no `revalidate:` override anywhere in the file).
   `bustUpstream.js:15-19` states the rule it violates — a function that reads
   upstream in order to write locally must bust the source tag **before** it
   reads, or it writes an up-to-an-hour-old snapshot and reports success. I have
   not confirmed the practical impact, and it is out of scope for this round.
   **Flagged for a decision, not fixed here.**
2. **Whether `/contact-us`'s 24h intent is being silently overridden** or
   whether 1h is acceptable. The mismatch is measured (§B.4); nobody's intent is
   recorded anywhere I could find.
