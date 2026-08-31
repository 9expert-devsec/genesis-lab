# Program page — audit for two new sections

**Run date:** 2026-08-31 · **Branch:** `dev` · **HEAD:** `9dbd95b` (level with `origin/dev`)
**Scope:** the PROGRAM branch of `/[...slug]` (e.g. `/power-bi-all-courses`), rendered by
`ProgramPageClient`. The skill branch is out of scope but its cost is reported in §5.
**Method:** source reading plus read-only probes — GET-only against MSDB, `find`/`count`
only against Mongo. **No writes. No source edits.**

---

## 0. Current document order

[ProgramPageClient.jsx](../../src/app/(public)/program/[slug]/_components/ProgramPageClient.jsx),
148 lines total:

| lines | section | container |
|---|---|---|
| 47–100 | Hero — icon, name, course count, description, optional roadmap | `max-w-[1200px]` |
| 103–142 | **Course grid** — `หลักสูตรในโปรแกรม` + count pill + `CourseCard` grid | `max-w-[1200px]` |
| **145** | **FAQ** — `<FaqAccordionSection faqs={faqs} />` | `max-w-3xl` (default) |
| 146 | `</main>` | — |

**Between the course grid and the footer there is exactly one thing: the FAQ section at
line 145.** The footer is not in this component — it comes from the `(public)` route-group
layout. So the target order `courses → online → FAQ → articles` means inserting one section
before line 145 and one after it.

### The component has TWO mounts, not one

This matters for any new prop: it must be threaded twice or one route silently renders
without it.

| mount | loader | faqs fetched at |
|---|---|---|
| [`[...slug]/page.jsx:464`](../../src/app/(public)/[...slug]/page.jsx#L464) | `loadProgram()` at [:160–187](../../src/app/(public)/[...slug]/page.jsx#L160-L187) | [:185](../../src/app/(public)/[...slug]/page.jsx#L185) |
| [`program/[slug]/page.jsx:62`](../../src/app/(public)/program/[slug]/page.jsx#L62) | inline at [:47–59](../../src/app/(public)/program/[slug]/page.jsx#L47-L59) | [:50](../../src/app/(public)/program/[slug]/page.jsx#L50) |

The second is reachable only when a program has **no** custom slug — every one of the 27
configs has one (§2.4), so `program/[slug]` redirects at
[:43](../../src/app/(public)/program/[slug]/page.jsx#L43) in practice. It is still live code
and still passes props.

---

## 1. The FAQ section as the template

### 1.1 Component, mount, data path

- **Component:** `FaqAccordionSection`, [src/components/faq/FaqAccordionSection.jsx:131](../../src/components/faq/FaqAccordionSection.jsx#L131).
  Shared by five page types (masterclass, program, skill, public course, career path) — its
  own header says so, and that a defect in it reaches all five at once.
- **Mounted:** [ProgramPageClient.jsx:145](../../src/app/(public)/program/[slug]/_components/ProgramPageClient.jsx#L145).
- **Data reaches it as a PROP, fetched server-side in the route.** Not a client fetch. Both
  loaders call:

  ```js
  getLocalFaqsForCourse('program', programRefId(program)).catch(() => [])
  ```

  → [src/lib/local-faqs/getLocalFaqs.js:47](../../src/lib/local-faqs/getLocalFaqs.js#L47),
  which does `LocalFaq.find({ course_type, ref_id, is_active: true }).sort(DISPLAY_SORT).lean()`
  then `serialize`.

  `programRefId` ([`[...slug]/page.jsx:95`](../../src/app/(public)/[...slug]/page.jsx#L95)) is
  `String(program?.program_id ?? program?._id ?? '')` — **short code preferred**. Note this
  differs from the course filter three lines away, which uses `String(program._id)`; see §2.4.

### 1.2 What it does with zero rows

[FaqAccordionSection.jsx:138](../../src/components/faq/FaqAccordionSection.jsx#L138), quoted:

```js
if (!faqs?.length) return null;
```

**The whole section disappears** — no heading, no empty box. The doc block above it says so
explicitly: *"Renders nothing when there are no FAQs (no heading, no empty box) — same guard
as the masterclass page."*

This is the guard shape to copy.

### 1.3 Heading, spacing, container

The program page passes **no** overrides, so both defaults apply
([:135–136](../../src/components/faq/FaqAccordionSection.jsx#L135-L136)):

| slot | value |
|---|---|
| `<section>` | `id="faq"` · `max-w-3xl mx-auto px-4 py-10 md:py-16` |
| `<h2>` | `mb-8 text-center text-xl md:text-2xl font-bold text-9e-navy dark:text-white` |
| title | `คำถามที่พบบ่อย` |
| item list | `flex flex-col gap-4` |

**One inconsistency to decide about, not to inherit blindly.** The FAQ is `max-w-3xl` and
**centre-aligned**; the hero and course grid above it are `max-w-[1200px]` with a
**left-aligned** `h2` at `text-lg font-bold` beside an icon and a count pill
([:103–121](../../src/app/(public)/program/[slug]/_components/ProgramPageClient.jsx#L103-L121)).
So the page already contains *two* heading styles. A new section can match either, but
"match the existing style" is not a single answer here.

### 1.4 Measured: the FAQ section almost never renders

`local_faqs`: 36 documents total, `course_type` distribution
`masterclass=10, program=6, public=5, career_path=5, null=5, skill=5`.

Active `course_type: 'program'` rows, grouped by `ref_id`: **`POWER-BI` = 6, and nothing else.**

> **1 of 27 program pages renders a FAQ section today.** The other 26 return `null` at the
> guard. The template is sound; the content simply is not there. Worth knowing before
> treating "the FAQ already works" as evidence that a copied section will look populated.

---

## 2. Online courses per program — the decisive question

### 2.1 Every read path that returns online courses

| # | file:line | what it returns | can filter by program? | rows |
|---|---|---|---|---|
| 1 | [api/online-courses.js:19](../../src/lib/api/online-courses.js#L19) `getOnlineCourses()` | `unwrap(GET /online-course)` | **No — it passes no params at all** | all (24) |
| 2 | [landing/syncLandingData.js:300](../../src/lib/landing/syncLandingData.js#L300) | feeds the snapshot via #1 | no | reads 24, **stores 8** |
| 3 | [landing/getLandingData.js](../../src/lib/landing/getLandingData.js) | `data.onlineCoursesForSection` from Mongo | no | **8**, featured-only |
| 4 | [search/searchCorpus.js:86](../../src/lib/search/searchCorpus.js#L86) | corpus rows via #1 | no | all (24) |
| 5 | [admin/featured-online-courses/page.jsx:16](../../src/app/admin/featured-online-courses/page.jsx#L16) | picker options via #1 | no | all (24) |
| 6 | [admin/nav-featured-online-courses/page.jsx:17](../../src/app/admin/nav-featured-online-courses/page.jsx#L17) | picker options via #1 | no | all (24) |
| 7 | [banners/pickerOptions.js:120](../../src/lib/banners/pickerOptions.js#L120) | banner picker, dynamic import of #1 | no | all (24) |
| 8 | [home/featureContentRefs.js:231](../../src/lib/home/featureContentRefs.js#L231) | banner refs, dynamic import of #1 | no | all (24) |

Paths 2–8 all bottom out in #1. **There is exactly one adapter**, and it takes no arguments.

### 2.2 Verdict

**No read path today returns online courses for one program.** The only per-program-shaped
store, the landing snapshot, holds **8 rows** and those 8 are the admin's *home-page*
curation, not a program subset — `MAX_ONLINE_COURSES = 8` in
[syncLandingData.js](../../src/lib/landing/syncLandingData.js).

**But the reason is the adapter, not the data.** Measured, with controls:

```
(baseline, no param)         →  24 items, total=24  programs=[N8N,CLAUDE,GEN-AI,CPS,OTH,
                                                              MS-P,MSWO365,MSP,POWER-BI,
                                                              PAM,AIB,MSE,MS365]
MSE by _id                   →  10 items, total=10  programs=[MSE]
MSE by short code            →  10 items, total=10  programs=[MSE]
CLAUDE by short code         →   2 items, total=2   programs=[CLAUDE]
CONTROL bogus code           →   0 items, total=0
CONTROL bogus ObjectId       →   0 items, total=0
CONTROL junk param name      →  24 items, total=24   ← unknown params are IGNORED
?program_id=MSE              →  10 items, total=10
?limit=100                   →  24 items
?page=1&limit=5              →   5 items, total=24
```

The junk-param control is the load-bearing one: it proves the API does not simply return
`0` for anything unfamiliar, so the `0`s above are the filter working rather than the
request failing. And `MSE → 10` matches the client-side grouping of the unfiltered 24
exactly.

> **`GET /online-course?program=<id>` already works, accepts BOTH the ObjectId and the short
> code, and returns rows with a byte-identical key set to the unfiltered call** (verified).
> Pagination (`?limit=`, `?page=`) works too.
>
> **So this is not a data-path build. It is a missing argument on one adapter function.**

**Also measured, and it changes a separate open question:** the catalogue is now **24 rows,
up from 22** at the 2026-08-31 audit, and both fields that audit reported as nonexistent now
exist and are **populated 24/24**:

| field | present | populated | host |
|---|---|---|---|
| `o_course_instructor_name` | 24/24 | **24/24** | — (e.g. `Apipoj Piasak`, `Chalaivate Pipatpannawong`) |
| `o_course_instructor_image_url` | 24/24 | **24/24** | `res.cloudinary.com` only |

`res.cloudinary.com` **is** in `next.config.mjs` `remotePatterns`, which retires the reason
the card's avatar was shipped as a raw `<img>` last round. Out of scope here; recorded
because it is now measurable and was not before.

### 2.3 Cheapest shape, if a per-program read is wanted

The repo already contains the exact pattern, one file over. `listPublicCourses`
([api/public-courses.js:55–66](../../src/lib/api/public-courses.js#L55-L66)) takes
`{ skill, program, includeHidden }` and forwards them as `params: { skill, program }`.
`getOnlineCourses()` is the same function minus the arguments.

| option | shape | trade-offs |
|---|---|---|
| **A. Give the adapter an optional filter** — `getOnlineCourses({ program } = {})`, forwarded as `params` | one adapter change; per-request fetch in the two program loaders | **Mirrors `listPublicCourses` exactly**, so there is no new pattern to learn. All 8 existing callers pass nothing and are unaffected. Caching is already solved: the call carries `tags: ['online-courses']`, and a different `?program=` is a different Data Cache entry under the **same tag**, which `revalidateTag` busts wholesale — `syncLandingData` already busts `UPSTREAM_TAGS.ONLINE_COURSES` on every run. Cost: one upstream call per program page render (ISR-cached 1h by `aiFetch`'s default). Risk: a second owner of "which online courses" beside the snapshot |
| **B. Fetch all, filter in the loader** — call `getOnlineCourses()` and `.filter()` on `program._id` | no adapter change at all | Smallest possible diff, and 24 rows is a trivial payload. Reuses the *same* cache entry the search corpus and both admin pickers already warm, so it may cost **zero** extra upstream calls. Cost: transfers ~24 rows to render ~1–10, and the filter predicate becomes a third place that spells the program join (§2.4). Scales badly only if the catalogue grows an order of magnitude |
| **C. Mirror into Mongo** — a collection or a snapshot section keyed by program | a sync job + a model + revalidation | **Not warranted by anything measured.** There is no genesis-owned data to attach, no admin screen that would write it, and the upstream call is already cheap and tagged. It would add a staleness window the current path does not have. Listed for completeness |
| **D. Widen the landing snapshot** to hold all 24 grouped by program | change `MAX_ONLINE_COURSES`, add a section | Reuses an existing sync and its downgrade guard. But it overloads a document whose declared purpose is *the home page*, and the 8 are a deliberate curation — conflating "featured on home" with "all in program" is exactly the kind of shared-meaning defect this repo has paid for before |

**No decision taken.** A and B are both small; C and D are disproportionate to what was
measured.

### 2.4 The join key — measured, not assumed

This repo has been burned by short-code-vs-ObjectId before, so every spelling in play:

| where | field | shape | example |
|---|---|---|---|
| online course row | `program._id` | ObjectId hex | `68d3c5b02c6a2f1315c0bce4` |
| online course row | `program.program_id` | short code | `MSE` |
| public course row | `program._id` | ObjectId hex | same |
| `/programs` row | `_id` **and** `program_id` | both | both |
| program page — **course filter** | `String(program._id)` | ObjectId hex | [`[...slug]/page.jsx:180-183`](../../src/app/(public)/[...slug]/page.jsx#L180-L183) |
| program page — **FAQ ref** | `program_id ?? _id` | **short code** | [`[...slug]/page.jsx:95`](../../src/app/(public)/[...slug]/page.jsx#L95) |
| `ProgramPageConfig.programId` | short code | measured: `power-bi-all-courses → POWER-BI` | |
| `Article.programs[]` | short code | `["AIB","POWER-BI","POWER-APPS","PAM","MS-P"]` | |

**Two spellings are already in use inside the same loader function**, three lines apart. Both
are available on the `program` object the loaders hold, and **the MSDB filter accepts either**
(verified above), so a per-program online read cannot fail on this — but a client-side filter
(option B) must pick one deliberately, and the short code is what
`ProgramPageConfig` and `Article` already speak.

The 27 published configs and their codes:

```
power-bi-all-courses→POWER-BI   dot-net-all-courses→DEV        365-copilot-all-courses→COPILOT
ai-builder-all-courses→AIB      canva-all-courses→CANVA        claude-ai-all-courses→CLAUDE
copilot-studio-all-courses→CPS  gen-ai-all-courses→GEN-AI      github-copilot-all-courses→GHC
google-adk-all-courses→GOO      make-all-courses→MAKE          manus-ai-all-courses→MANUS
ms-365-all-courses→MS365        access-all-courses→MSA         excel-all-courses→MSE
fabric-all-courses→MS-FB        ms-planner-all-courses→MS-P    powerpoint-all-courses→MSP
ms-project-all-courses→MSJ      sql-server-all-courses→SQL     ms-word-all-courses→MSWO365
other-all-courses→OTH           power-apps-all-courses→POWER-APPS
power-automate-all-courses→PAM  python-all-courses→PYTHON      uipath-all-courses→UIPATH
n8n-all-courses→N8N
```

All 27 are `isPublished !== false`.

### 2.5 Can `OnlineCourseCard` be reused as-is?

[src/app/_components/home/OnlineCourseCard.jsx:22](../../src/app/_components/home/OnlineCourseCard.jsx#L22) —
`({ course, className, skillSlugs = {} })`.

| prop | required? | available on the program page? |
|---|---|---|
| `course` | yes | yes — a raw `/online-course` row is enough (see below) |
| `skillSlugs` | defaults `{}` | **yes, already fetched.** Both loaders call `getPageLinkability()` and return `linkability.skillSlugs` ([`[...slug]/page.jsx:172,186`](../../src/app/(public)/[...slug]/page.jsx#L172), [`program/[slug]/page.jsx:53,69`](../../src/app/(public)/program/[slug]/page.jsx#L53)) |
| `className` | optional | n/a |

**Nothing it reads is snapshot-only.** The only transform the sync applies is resolving
`skills` from string ids to objects — and the raw list feed **already returns skill objects**
(measured: `skills[0]` keys are `_id, skill_id, skill_name, skilliconurl, skillcolor`). So the
sync's resolution is a no-op for this feed and the card works against a raw row.

Two caveats, both recorded rather than resolved:

1. It lives under `src/app/_components/home/`. Every other shared card in this repo sits
   outside a page-specific folder; reusing it from a `(public)` route would either import
   across that boundary or motivate a move.
2. As of **`9dbd95b` "hiding tag e-learning"**, the `e-Learning` pill is commented out at
   [:142–144](../../src/app/_components/home/OnlineCourseCard.jsx#L142-L144). Whatever the
   card shows on the home page is what it will show here — the two surfaces cannot diverge
   without a prop.

### 2.6 Online courses per program — the real distribution

Of 27 programs, **13 have at least one online course** and 14 have none:

| program | online courses |
|---|---|
| MSE | **10** |
| CLAUDE | 2 |
| OTH | 2 |
| N8N, GEN-AI, CPS, MS-P, MSWO365, MSP, POWER-BI, PAM, AIB, MS365 | 1 each |
| the other 14 (DEV, SQL, POWER-APPS, MSA, COPILOT, PYTHON, MS-FB, UIPATH, CANVA, GHC, MAKE, MANUS, GOO, MSJ) | **0** |

> **14 of 27 program pages would render an empty online-courses section**, and 10 more would
> render a section containing exactly one card. Only `MSE` has enough for a row.

---

## 3. Related articles per program

### 3.1 The Article program field

[src/models/Article.js:26](../../src/models/Article.js#L26):

```js
programs: [{ type: String, trim: true }],  // program_id values; empty = "None"
```

- **Name:** `programs` (plural).
- **Type:** array of `String` — upstream `program_id` **short codes**, not ObjectIds.
- **Cardinality: MANY per article.** Measured sample: `["AIB","POWER-BI","POWER-APPS","PAM","MS-P"]`.
- Indexed multikey at [:131](../../src/models/Article.js#L131) — `ArticleSchema.index({ programs: 1 })`,
  so an equality filter on it is served by an index.

### 3.2 The read function

[`getArticles`](../../src/lib/actions/articles.js#L188) — `src/lib/actions/articles.js:188`.

- **Accepts `program`** ([:193](../../src/lib/actions/articles.js#L193)), applied as
  `filter.programs = String(program)` ([:204](../../src/lib/actions/articles.js#L204)) — an
  equality match against the array, which Mongo resolves as "contains".
- Also accepts `active`, `limit`, `page`, `search`, `tag`, `skill`, `articleType`, `select`.
- **Callable server-side with a program filter** — `/articles` already does exactly that
  ([articles/page.jsx:43–52](../../src/app/(public)/articles/page.jsx#L43-L52)).
- **Projection:** `select` is `''` by default, so **no projection is applied** and the whole
  document is returned — including `content`, the largest field. The doc block says this is
  deliberate: the reader is shared by `/admin/articles` and `/articles`, which need different
  field sets, and hardcoding one would starve the other.
- **The `.lean()` + serialize round-trip** is real: [:241](../../src/lib/actions/articles.js#L241)
  `query.lean()`, then `items: serialize(docs)` ([:246](../../src/lib/actions/articles.js#L246)) where `serialize` is
  `JSON.parse(JSON.stringify(value))` ([:158–161](../../src/lib/actions/articles.js#L158-L161)).
  **`undefined` keys are dropped**, so an absent field arrives as a missing key rather than
  `undefined` — a consumer using `'key' in obj` and one using `obj.key === undefined` will
  disagree.
- **`PUBLIC_LIST_FIELDS` exists and is unwired**, confirmed:
  [articleListFields.js:93](../../src/lib/articleListFields.js#L93) is its only definition,
  and no file under `src/` imports it. It is referenced **only** by tests — and two of them
  assert it stays unwired:
  - `test/pure/articleListFields.test.mjs:257` — *"PUBLIC_LIST_FIELDS is NOT sufficient for
    /articles — do not wire it without the badge fields"*
  - `test/render/publicArticleCard.test.mjs:452` — asserts `/PUBLIC_LIST_FIELDS/.test(page) === false`

  So a new section that wanted a projection must supply its own `select`, not reach for this
  constant. Wiring it would redden two tests on purpose.

### 3.3 Measured distribution — 488 articles, all active

`articles`: **488 total, 488 active** (nothing is inactive today).

| program_id | program name | active articles |
|---|---|---|
| POWER-BI | Power BI | **41** |
| MSE | Microsoft Excel | **37** |
| SQL | Microsoft SQL Server | 23 |
| DEV | .NET | 14 |
| PAM | Power Automate | 12 |
| POWER-APPS | Power Apps | 9 |
| GEN-AI | Generative AI | 6 |
| MSP | Microsoft PowerPoint | 6 |
| MSA | Microsoft Access | 5 |
| CLAUDE | Claude AI | 4 |
| COPILOT | M365 Copilot | 4 |
| MS365 | Microsoft 365 | 4 |
| PYTHON | Python | 4 |
| MS-FB | Microsoft Fabric | 3 |
| UIPATH | UiPath | 2 |
| AIB | AI Builder | 1 |
| CANVA | Canva | 1 |
| CPS | Copilot Studio | 1 |
| GHC | GitHub Copilot | 1 |
| MAKE | Make.com | 1 |
| MANUS | Manus AI | 1 |
| MS-P | Microsoft Planner | 1 |
| MSWO365 | Microsoft Word | 1 |
| OTH | Other | 1 |
| **GOO** | Google | **0** |
| **MSJ** | Microsoft Project | **0** |
| **N8N** | n8n | **0** |

**Answer to the question as asked:**

| threshold | programs |
|---|---|
| would render an **EMPTY** articles section | **3 of 27** (GOO, MSJ, N8N) |
| ≥ 1 article | 24 |
| ≥ 3 articles | 14 |
| ≥ 4 articles (a full row at `xl:grid-cols-4`) | 13 |

Two further measurements:

- **All 24 distinct program codes carried by active articles match a real upstream
  `program_id`.** No orphans, no casing drift. The join is clean.
- **341 of 488 active articles carry no program at all** — 70%. They are unreachable from any
  per-program section by construction. This does not affect the table above; it bounds how
  much a "related articles" surface can ever grow without editorial tagging work.

> Articles are the healthier of the two new sections by a wide margin: 24 of 27 programs have
> content versus 13 of 27 for online courses, and two programs have 40-ish articles.

### 3.4 Reusable card, and does `?program=` work as a URL?

**`/articles?program=<program_id>` is a real, working, server-rendered URL.** `searchParams.program`
is read at [articles/page.jsx:25](../../src/app/(public)/articles/page.jsx#L25) and passed
straight into `getArticles` at [:50](../../src/app/(public)/articles/page.jsx#L50). A
"ดูทั้งหมด" link needs no new route — `/articles?program=POWER-BI` resolves today.

**Card components:**

| component | exported? | takes | notes |
|---|---|---|---|
| `ArticleCard` — [ArticlesPageClient.jsx:352](../../src/app/(public)/articles/_components/ArticlesPageClient.jsx#L352) | **No** — module-local | raw Article doc + `programNames` + `skillNames` | Would need exporting or extracting to reuse |
| `BlogCard` — [BlogSection.jsx:259](../../src/app/_components/home/BlogSection.jsx#L259) | **Yes** | a **mapped** shape: `{id, slug (a full href), thumbnail, title, excerpt, programs, skills}` | Not the raw doc — the mapping lives in `BlogSection` at [:34–48](../../src/app/_components/home/BlogSection.jsx#L34-L48), including a cover-image fallback |
| `BlogSection` — [BlogSection.jsx:28](../../src/app/_components/home/BlogSection.jsx#L28) | Yes | raw Article docs; maps internally; `if (articles.length === 0) return null` | A whole slider with its own heading and background — same empty-guard shape as the FAQ |

Both `ArticleCard` and `BlogCard` render taxonomy through the shared
`ProgramOverlay` / `SkillChips` from `@/components/articles/ArticleTaxonomyChips`, which need
`programNames` / `skillNames` maps built by `buildProgramNames` / `buildSkillNames`
(`@/lib/articleTaxonomy`). **The program page does not fetch these today** — it fetches
`listPrograms()` (so `programNames` is one map call away) but not `listSkills()`.

---

## 4. Options for the two new sections

### 4.1 Online courses in the program

| option | what it is | trade-offs |
|---|---|---|
| **O1. Reuse `OnlineCourseCard` in a new section, data from a filtered adapter (§2.3-A)** | mirrors the course grid above it | Cheapest that is also correct. One adapter argument, one section, no new card. Cost: the card lives under `_components/home/` and would be imported across that boundary — or moved, which touches the home page's tests |
| **O2. Same, but filter client-side from the existing unfiltered call (§2.3-B)** | no adapter change | Possibly zero extra upstream calls (same cache entry the search corpus warms). Adds a third site spelling the program join, which §2.4 argues is the live hazard here |
| **O3. Do not build it for programs with 0–1 courses** | render only above a threshold | 14 of 27 programs have zero and 10 have exactly one, so a threshold of 2 would show the section on **3 pages**. Honest, but a section that appears on 3 of 27 pages may not earn its code |
| **O4. Fold online courses into the EXISTING course grid** with a badge | no new section at all | Sidesteps the empty-section problem entirely and matches "หลักสูตรในโปรแกรม" literally. But `CourseCard` and `OnlineCourseCard` read different field prefixes (`course_*` vs `o_course_*`) and link differently (internal vs outbound `target="_blank"`), so the grid would need to switch card by row |

**The measurement that should drive this choice:** 14 of 27 pages have nothing to show, and
only `MSE` (10) has enough for a full row.

### 4.2 Related articles

| option | what it is | trade-offs |
|---|---|---|
| **A1. New section, `getArticles({program, active:true, limit:N})`, export `ArticleCard`** | closest to `/articles` | Reuses the card visitors already know. Cost: exporting a module-local component, plus `programNames`/`skillNames` maps the page does not build yet. **No projection by default** means each row carries its full `content` — with `limit: 4` that is 4 documents, acceptable, but it is worth passing an explicit `select` rather than inheriting the whole-document default |
| **A2. Reuse `BlogSection` wholesale** | it already maps, guards empty, and renders a slider | Least new code — feed it `getArticles({program}).items` and it handles the rest. Cost: it arrives with a slider, a heading, and a full-width background band that may not suit a mid-page section; and its `programNames`/`skillNames` props are still required |
| **A3. Reuse the exported `BlogCard` in a plain grid** | card without the slider | Middle path. Requires duplicating `BlogSection`'s internal doc→`blog` mapping (including the cover fallback), which is the kind of second copy this repo has repeatedly regretted — unless that mapper is extracted first |
| **A4. Link only — no cards** | a "บทความเกี่ยวกับ X" button to `/articles?program=<code>` | Near-zero cost, works today, degrades gracefully for the 3 empty programs (hide the link). Gives up the visual weight of a card row |

**The measurement that should drive this choice:** only 3 of 27 pages would be empty, and 13
have ≥4 — so unlike the online-courses section, this one has content on almost every page.

---

## 5. Program vs skill — what extending later would cost

`ProgramPageClient` and `SkillPageClient` are **separate files** (148 and 139 lines) that
**share two components**, both imported by identical specifiers:

- `CourseCard` from `@/app/(public)/training-course/_components/CourseCard`
- `FaqAccordionSection` from `@/components/faq/FaqAccordionSection` (skill mounts it at
  [SkillPageClient.jsx:136](../../src/app/(public)/skill/[slug]/_components/SkillPageClient.jsx#L136))

They do **not** share a section wrapper, a heading style, or a loader. `loadSkill`
([`[...slug]/page.jsx:200`](../../src/app/(public)/[...slug]/page.jsx#L200)) additionally
groups courses **by program**, so the skill page's body is a different shape.

**Cost to extend both new sections to skills:** low on the data side, moderate on the layout side.

- Online courses: **`GET /online-course?skill=` already works** — measured, `?skill=AI` → 7,
  `?skill=BUSINESS` → 14, bogus → 0. Symmetric with `?program=`, same adapter argument.
- Articles: `Article.skills` is the exact twin of `programs` — same flat string array, same
  multikey index (`{ skills: 1 }`, added with the measurement beside it), and `getArticles`
  already accepts `skill`.
- The real cost is that any new section would be a **third component** unless it is written
  as a shared one from the start, and the skill page's per-program grouping means it cannot
  simply drop a grid in the same place.

Writing the two sections as shared components taking `(items, title, seeAllHref)` would make
the skill extension nearly free. Writing them inline in `ProgramPageClient` would not. That
is a decision to take now rather than later — but it is not taken here.

---

## 6. What this audit could NOT determine

1. **Whether `?program=` on `/online-course` is a supported contract or an accident of the
   upstream ORM.** It works, it honours both id spellings, and it ignores unknown params —
   but no upstream documentation was consulted and nothing in this repo uses it. It could be
   a passthrough that a future MSDB refactor removes without notice. `listPublicCourses`
   relying on the same convention is reassuring, not proof.
2. **Whether the 8-row landing snapshot cap was ever intended to be the only online-course
   store.** The constant is named `MAX_ONLINE_COURSES` with no comment about the general case.
3. **How many of the 341 program-less articles *should* carry a program.** That is an
   editorial question. It bounds the article sections' ceiling, and no code can answer it.
4. **Why only POWER-BI has program FAQs.** Whether the other 26 are pending content or the
   feature was piloted and left is not visible from data or git history.
5. **Whether the online-courses section is wanted on pages that would show one card.** 10 of
   27 programs have exactly one online course; whether a one-card section reads as useful or
   as broken is a design judgement, not a measurement.
6. **The intent behind `9dbd95b` "hiding tag e-learning."** The `e-Learning` pill is
   commented out rather than removed, with no message beyond the subject. Whether it is
   temporary matters to any new surface reusing `OnlineCourseCard`, and I did not ask.
7. **What `/articles?program=` looks like with no results**, and whether that page is a
   reasonable destination for a "see all" link from a program with 1 article. Not rendered
   during this audit — read-only source and data only, no browser.

---

## Reproducing

MSDB (GET only) and Mongo (`find`/`countDocuments`/`distinct`/`aggregate` only) probes were
run from the scratchpad and are not committed — they open a database connection, and the one
committed script in this repo (`scripts/audit-online-course-fields.mjs`) is deliberately
MSDB-only. Every figure above is reproducible from:

- `GET /online-course`, `?program=`, `?skill=`, `?limit=`, `?page=` — with the bogus-value and
  junk-param-name controls that make the zeroes meaningful
- `articles.countDocuments({ active: true, programs: <code> })` per program
- `local_faqs.aggregate` grouped by `course_type` then `ref_id`
- `program_page_configs.find({})`
