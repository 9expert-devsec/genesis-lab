# Online-course card — read-only field audit

**Run date:** 2026-08-31 · **Branch:** `dev` · **HEAD:** `76ea189`
**Method:** `scripts/audit-online-course-fields.mjs` (GET-only against MSDB) plus a
read-only Mongo probe and an import-map walk of the render layer.
**No application code was changed. No write of any kind was issued to MSDB or Mongo.**

---

## 0. Validity of the scan

The repo's `unwrap()` ([client.js:95-110](../../src/lib/api/client.js#L95-L110)) returns
`{ items: [], total: 0 }` for *anything* it cannot parse, so "no data" and "no field" are
indistinguishable downstream. The scanner therefore checks the envelope before it reports
anything, and runs two controls.

| endpoint | HTTP | parse | top-level keys | `ok` | total | `items[]` | count | usable |
|---|---|---|---|---|---|---|---|---|
| `/online-course` | 200 OK | ok | `ok, total, page, limit, items` | true | 22 | true | **22** | YES |
| `/public-course` | 200 OK | ok | `ok, total, page, limit, items` | true | 79 | true | **79** | YES |
| `/instructors` | 200 OK | ok | `ok, total, items` | true | 9 | true | **9** | YES |

**Controls**

- Positive — `o_course_name`: present 22/22, populated 22/22 → **PASS**
- Negative — `zzz_not_a_field`: absent → **PASS**

Every key count below is a **union across all N items**, not a read of item 1.

---

## 2. The matrix

Columns: **MSDB** (upstream key + populated count) · **genesis Mongo** (schema? stored?) ·
**genesis render** (which files) · **Academy** (not measured — user-supplied).

Verdicts: **(a)** exists end-to-end · **(b)** exists upstream, dropped at sync ·
**(c)** exists in Mongo, not rendered · **(d)** exists nowhere — needs a new source.

### The four fields under discussion

| Field | MSDB | genesis Mongo | genesis render | Academy | Verdict |
|---|---|---|---|---|---|
| **instructor name** | **no key anywhere.** `/online-course` and `/public-course` both return **0 hits** for `/instr\|teacher\|lectur\|speaker\|trainer/` on key names. `/instructors` has `name_th` 9/9, `name_en` 9/9 — but **no course carries a reference to it** (see join test below) | `instructors.name` in schema; stored **6/16 populated** — and those 6 are the locally-seeded rows, not the MSDB-synced ones | nowhere on any online-course surface | not measured — user-supplied | **(d)** |
| **instructor photo** | **no key anywhere.** `/instructors` key union is exactly `_id, name_th, name_en, bio, programs, updatedAt` — there is no image/photo/avatar field upstream at all | `instructors.image_url` in schema; stored **6/16 populated**, all Cloudinary, all on rows with **no `instructor_id`** | rendered on `/about-us` only, never on a course card | not measured — user-supplied | **(d)** |
| **"e-Learning" type tag** | **no key.** `/online-course` returns 0 hits for `/elearn\|e_learn\|course_type\|format\|mode/`. (`/public-course` has `course_type_public` 79/79 and `course_type_inhouse` 79/79 — classroom only, and the *inverse* distinction) | not stored — nothing to store | not rendered | not measured — user-supplied | **(d)** — but constant by construction; see §6 |
| **"ผ่านเกณฑ์ได้ e-certificate" tag** | `o_course_certificate_status` — present 22/22, populated 22/22, **`false` × 22**, 1 distinct value | `Mixed` passthrough; stored 8/8 in `landing_cache.data.onlineCoursesForSection`, all `false` | **read and rendered** — [OnlineCourseCard.jsx:34](../../src/app/_components/home/OnlineCourseCard.jsx#L34), gated at [:172-174](../../src/app/_components/home/OnlineCourseCard.jsx#L172-L174) | not measured — user-supplied | **(a)** — but see the note |

> **The certificate row is the audit's sharpest result.** The field exists end-to-end and the
> card already renders an `e-Certificate` badge for it. It has never been seen, because
> `o_course_certificate_status` is `false` on **all 22** online courses upstream. This is not
> a plumbing problem — it is an **upstream data-entry** problem. `/public-course` has the same
> field at `true` for its samples, so the field is used for classroom courses and simply left
> at its default for online ones.
>
> One row, `ONL-MSE-L1`, carries a **differently-spelled** key: `o_certificate_status: true`
> (no `course` segment), alongside `o_traininghours`, `o_workshop_status` and
> `o_coursepromote_status`. Those four keys appear on **1/22 rows only** and nothing in genesis
> reads them. That is upstream schema drift on a single record — evidence that someone *did*
> intend to mark a course as certificate-bearing and wrote it into a key nothing reads.

### Every field the genesis card renders today (full inventory)

Row order follows the card top to bottom. All render references are
[OnlineCourseCard.jsx](../../src/app/_components/home/OnlineCourseCard.jsx).

| Field | MSDB (populated) | Mongo | render | Verdict |
|---|---|---|---|---|
| `o_course_cover_url` | 22/22 | stored 8/8 | cover image, [:71-97](../../src/app/_components/home/OnlineCourseCard.jsx#L71-L97); also search card, mega menu | **(a)** |
| `program.programiconurl` | 22/22 | stored 8/8 | cover **fallback** only, [:86-96](../../src/app/_components/home/OnlineCourseCard.jsx#L86-L96) — unreachable in practice, cover is 22/22 | **(a)** |
| `program.program_name` | 22/22 | stored 8/8 | `alt` text on the fallback icon only — never printed | **(a)** |
| `skills[].skill_name` | 22/22 (30 rows) | stored 8/8, IDs pre-resolved to objects at sync | capsules, first 3, [:112-134](../../src/app/_components/home/OnlineCourseCard.jsx#L112-L134) | **(a)** |
| `o_course_name` | 22/22 | stored 8/8 | title, [:137](../../src/app/_components/home/OnlineCourseCard.jsx#L137) | **(a)** |
| `o_course_teaser` | 22/22 | stored 8/8 | body, [:143](../../src/app/_components/home/OnlineCourseCard.jsx#L143) | **(a)** |
| `o_course_traininghours` | 22/22 (8 distinct) | stored 8/8 | duration chip, `formatDuration` | **(a)** |
| `o_number_lessons` | 22/22 (13 distinct) | stored 8/8 | "N บทเรียน" chip | **(a)** |
| `o_course_price` | 22/22 (12 distinct) | stored 8/8 | price / "ฟรี" | **(a)** |
| `o_course_netprice` | **5/22** (4 distinct) | stored 8/8 | strikethrough — and **only when `netprice > price`** | **(a)**, mostly empty |
| `o_course_certificate_status` | 22/22, all `false` | stored 8/8 | `e-Certificate` badge — **never fires** | **(a)**, never visible |
| `o_course_levels` | 22/22 — `2`×20, `1`×1, `3`×1 | stored 8/8 | Beginner/Intermediate/Advanced badge | **(a)** |
| `website_urls[0]` | 22/22 | stored 8/8 | every link on the card, via [onlineCourseHref.js](../../src/lib/onlineCourseHref.js) | **(a)** |
| `o_course_id` | 22/22 | stored 8/8 | **not printed** — used as React key and in the unresolved-capsule log | **(c)** |
| `o_course_workshop_status` | 22/22, all `false` | stored 8/8 | not read | **(c)** |
| `o_course_objectives` | 17/22 | stored 8/8 | not read | **(c)** |
| `o_course_target_audience` | 17/22 | stored 8/8 | not read | **(c)** |
| `o_course_training_topics` | 17/22 (175 topic rows) | stored 8/8 | not read | **(c)** |
| `o_course_prerequisites` | 16/22 | stored 8/8 | not read | **(c)** |
| `o_course_system_requirements` | 16/22 | stored 8/8 | not read | **(c)** |
| `o_course_doc_paths` | 17/22 | stored 8/8 | not read | **(c)** |
| `sort_order` | 22/22 | stored 8/8 | not read — genesis order comes from `featured_online_courses.sort_order` instead | **(c)** |
| `o_course_promote_status` | 22/22, all `false` | stored 8/8 | not read | **(c)** |
| `exam_links` | **1/22** | stored 8/8 | not read | **(c)** |
| `o_course_case_study_paths` | **0/22** | stored 8/8 (empty) | not read | **(c)**, never populated |
| `o_course_lab_paths` | **0/22** | stored 8/8 (empty) | not read | **(c)**, never populated |
| `previous_course` | **0/22** (`null` on every row) | stored 8/8 (`null`) | not read | **(c)**, never populated |
| `related_courses` | **0/22** (`[]` on every row) | stored 8/8 (empty) | not read | **(c)**, never populated |

**Fields the card reads that are always or nearly always empty in practice** (§3.3 of the brief):

- `o_course_certificate_status` — read at [:34](../../src/app/_components/home/OnlineCourseCard.jsx#L34), `false` on 22/22. The badge is dead code today.
- `o_course_netprice` — populated on 5/22, and the discount branch additionally requires
  `netprice > price`. On the 8 currently-featured courses the stored value is `null` on the
  sample read, so the strikethrough is near-dead too.
- `program.programiconurl` — the cover fallback. `o_course_cover_url` is 22/22, so this branch
  is unreachable through the home page.

---

## 1. Upstream (MSDB) — full findings

### 1.1 Key-set DIFF, `/public-course` minus `/online-course` (with the `o_` prefix normalised)

Fields classroom courses have that online courses do not:

| key | populated (public) |
|---|---|
| `course_outline_th` | 79/79 (58 with a real URL) |
| `course_outline_en` | 79/79 (6 with a real URL) |
| `course_roadmap_desktop_url` | 67/79 |
| `course_roadmap_mobile_url` | 66/79 |
| `course_trainingdays` | 79/79 |
| `course_type_public` | 79/79 |
| `course_type_inhouse` | 79/79 |
| `training_topics` | 79/79 (829 topic rows) |
| `course_doc_paths_en` | 0/79 |

And the reverse — online-only keys: `o_number_lessons` (22/22), plus the four drift keys on
`ONL-MSE-L1` alone (`o_certificate_status`, `o_traininghours`, `o_workshop_status`,
`o_coursepromote_status`).

**Neither payload carries an instructor or a certificate-eligibility field beyond the boolean
already described.** `course_certificate_status` on `/public-course` is the same shape, and it
is `true` there.

### 1.2 `/instructors` — 9 rows

Complete key union: `_id`, `name_th`, `name_en`, `bio`, `programs[]`, `updatedAt`. All 9/9
populated. **There is no photo field.**

### 1.3 Join test — does any online course reference an instructor?

Cross product of every scalar value on an online-course row (top level **plus one nested
level**) against every scalar value on an instructor row (same depth), exact match,
case-insensitive:

| online-course key | instructor key | matches | example |
|---|---|---|---|
| `program._id` | `programs[]._id` | 10 | `69244898dffca197fa0ba3c2` |
| `program.program_id` | `programs[].program_id` | 10 | `N8N` |
| `program.program_name` | `programs[].program_name` | 10 | `n8n` |
| `program.programiconurl` | `programs[].programiconurl` | 10 | (cloudinary URL) |
| `program.programcolor` | `programs[].programcolor` | 10 | `#ea4b71` |

**Verdict: NO course-level join exists.** Every match is on the **program**, not the course.
The only path from an online course to an instructor is
`course → program → instructors who teach that program`, which is:

- **incomplete** — 10 of 22 online courses sit in a program some instructor claims; the other
  12 resolve to nobody;
- **ambiguous** — it is 1-to-many by construction, so it cannot answer "who teaches *this*
  course";
- **lopsided** — 10 of the 22 online courses are in a single program (`MSE`), so one
  program's instructor list would caption nearly half the catalogue.

That is not a source for a per-course instructor byline. It is at best a fallback for a
program-level credit line.

---

## 2. Genesis Mongo layer

### 2.1 There is no online-course model

Online courses have **no dedicated Mongoose model**. They are stored as an untyped `Mixed`
array inside the home-page snapshot:

`LandingCache.data.onlineCoursesForSection` — [LandingCache.js:25](../../src/models/LandingCache.js#L25)

```js
onlineCoursesForSection: { type: mongoose.Schema.Types.Mixed, default: [] },
```

`Mixed` means the schema declares no field names at all, so "is it in the schema?" is
vacuously yes for every upstream key.

### 2.2 The sync mapping — nothing is dropped

[syncLandingData.js:204-215](../../src/lib/landing/syncLandingData.js#L204-L215), the whole
mapping literal:

```js
return featuredOnlineIds
  .map((id) => byId.get(id))
  .filter(Boolean)
  .slice(0, MAX_ONLINE_COURSES)
  .map((c) => ({
    ...c,
    skills: Array.isArray(c.skills)
      ? c.skills.map((s) => (typeof s === 'string' ? skillsById.get(s) : s)).filter(Boolean)
      : [],
  }));
```

- **Upstream keys READ:** all of them — `...c` is a full spread, plus `skills` is *widened*
  (string IDs resolved to objects) rather than narrowed.
- **Upstream keys DROPPED: none.**

This is the one place the brief's known defect class does **not** bite. It does bite next door
— see §2.6.

The only narrowing is by *row*, not by field: `MAX_ONLINE_COURSES = 8`, and only
admin-curated `featured_online_courses` IDs are kept. 22 upstream → 8 stored.

### 2.3 One real stored document

Read lean and read-only from `landing_cache/homepage_v1` (status `ok`, `syncedAt`
2026-08-31T03:03:00Z, `sections.onlineCourses: 8`). Stored key union across all 8 entries,
every key present 8/8:

```
__v, _id, createdAt, exam_links, o_course_case_study_paths,
o_course_certificate_status, o_course_cover_url, o_course_doc_paths, o_course_id,
o_course_lab_paths, o_course_levels, o_course_name, o_course_netprice,
o_course_objectives, o_course_prerequisites, o_course_price, o_course_promote_status,
o_course_system_requirements, o_course_target_audience, o_course_teaser,
o_course_training_topics, o_course_traininghours, o_course_workshop_status,
o_number_lessons, previous_course, program, related_courses, skills, sort_order,
updatedAt, website_urls
```

31 keys stored vs 35 in the MSDB union. The 4 missing are exactly the `ONL-MSE-L1` drift keys
— and `ONL-MSE-L1` is not one of the 8 featured courses, so this is a row-selection
difference, **not a field drop**. Had it been featured, `...c` would have carried them
through.

The stored doc carries **no key the schema does not declare** and vice versa, because the
schema declares nothing.

### 2.4 Is there a genesis-owned extension store for online courses?

**No.** `CourseExtension` — the classroom equivalent — is keyed on `courseId` and holds
`urlAlias`, `metaTitle`, `metaDescription`, `ogImage`, `gallery`, `tags`, `isPublished`,
`omisePaymentEnabled`, `upstreamId`, `formerCodes`, `trainingTopicsRich`. Measured:
**79 rows, 0 of which have a `courseId` matching an online course** (`ONL-*`). 79 is exactly
the `/public-course` count.

The code states the same thing:
[getLandingData.js:112-115](../../src/lib/landing/getLandingData.js#L112-L115) — *"`onlineCoursesForSection` comes from the separate `/online-course` domain, which CourseExtension does not extend and which has no `isPublished` of ours to read."*

The two genesis-owned online-course collections are **curation lists only**:

| collection | count | fields | what it owns |
|---|---|---|---|
| `featured_online_courses` | 8 | `course_id`, `course_name`, `course_cover_url`, `sort_order`, `active` | which 8 courses the home page shows, and in what order |
| `nav_featured_online_courses` | 3 | + `course_url` | which 3 tiles the mega menu shows |

Both cache `course_name`/`course_cover_url` **for the admin list only** — the home card reads
its name and cover from the snapshot, not from these rows.

### 2.5 Admin screens that can edit anything about an online course

| screen | writes | reaches the public card? |
|---|---|---|
| [/admin/featured-online-courses](../../src/app/admin/featured-online-courses/page.jsx) | `course_id`, `course_name`, `course_cover_url`, `sort_order`, `active` on `FeaturedOnlineCourse` | **selection and order only.** `course_name`/`course_cover_url` are written but never read by the card |
| [/admin/nav-featured-online-courses](../../src/app/admin/nav-featured-online-courses/page.jsx) | + `course_url` on `NavFeaturedOnlineCourse` (max 3 active) | mega menu only — this one **is** the render source for name, cover and href |
| [/admin/banners](../../src/app/admin/banners) (course picker) | a banner's reference to an online course | feeds the hero/feature-strip panel, not the card |
| /admin/career-paths (new/edit) | an online course reference on a career path | career-path pages |

**No admin screen anywhere can edit a substantive field of an online course** — not the name,
not the teaser, not the price, not a badge. Everything the card prints is upstream-owned.

### 2.6 Adjacent finding — the instructor sync *is* the defect class, and it is broken

Not in scope for the card, but it is the reason the "instructor photo" row above reads
6/16 rather than 9/9, so it is load-bearing for the options in §4.

[syncInstructors.js:23-43](../../src/lib/instructors/syncInstructors.js#L23-L43) maps:

```js
name:        toStr(item?.name),
title:       toStr(item?.title),
bio:         toStr(item?.bio),
image_url:   toStr(item?.image_url),
specialties: toStrArr(item?.specialties),
```

MSDB `/instructors` emits `name_th`, `name_en`, `bio`, `programs`. So:

- `name`, `title`, `image_url`, `specialties` — **read keys that do not exist upstream**, and
  `toStr(undefined)` returns `''`, so every synced row is `$set` to blank on every run.
- `name_en` and `programs` — **exist upstream, exist in the schema, and are absent from the
  mapping literal.** This is precisely the middle-of-the-literal drop the brief warned about.

Measured in `instructors` (16 rows):

| rows | `instructor_id` | `synced_at` | `name` | `image_url` | `programs` |
|---|---|---|---|---|---|
| 6 (idx 0-5) | absent | 2 yes / 4 no | **populated** | **SET** | absent or `[]` |
| 10 (idx 6-15) | set | yes | **`""`** | **empty** | `[]` |

Every MSDB-synced instructor row in genesis is blank. The 6 usable rows — the ones `/about-us`
actually renders — are locally seeded and have no upstream anchor. (Also note 10 synced rows
against 9 upstream rows: one is stale.)

---

## 3. Render layer

Resolved through import maps from the routes, rooted on **file paths**.

### 3.1 Every file that renders an online course

| # | file | surface | props come from | body inside the card's own anchor? |
|---|---|---|---|---|
| 1 | [src/app/_components/home/OnlineCourseCard.jsx](../../src/app/_components/home/OnlineCourseCard.jsx) | home "หลักสูตรออนไลน์" carousel | `page.jsx:112` → `LandingCache.data.onlineCoursesForSection` (Mongo snapshot) | **No.** `<article>` wrapper with **three separate `<a>`** — cover ([:71](../../src/app/_components/home/OnlineCourseCard.jsx#L71)), title ([:136](../../src/app/_components/home/OnlineCourseCard.jsx#L136)), CTA ([:193](../../src/app/_components/home/OnlineCourseCard.jsx#L193)) — plus internal `<Link>` skill capsules. Teaser, meta row and badges sit in **no** anchor |
| 2 | [src/app/_components/home/OnlineCoursesSection.jsx](../../src/app/_components/home/OnlineCoursesSection.jsx) | section wrapper | `page.jsx:232-233` | n/a |
| 3 | [src/app/_components/home/CourseCarousel.jsx](../../src/app/_components/home/CourseCarousel.jsx) | generic carousel | passes `course`, `currentYear`, `skillSlugs` to `CardComponent` ([:96-100](../../src/app/_components/home/CourseCarousel.jsx#L96-L100)) | n/a |
| 4 | [src/app/(public)/search/_components/SearchClient.jsx](../../src/app/(public)/search/_components/SearchClient.jsx) → `OnlineCourseResultCard` ([:490](../../src/app/(public)/search/_components/SearchClient.jsx#L490)) | `/search` results | `searchCorpus.js:86` → **`getOnlineCourses()` direct from MSDB**, not Mongo | **Yes** — the whole card is one `<a target="_blank">` |
| 5 | [src/components/layout/PublicHeaderClient.jsx](../../src/components/layout/PublicHeaderClient.jsx) desktop [:1154-1190](../../src/components/layout/PublicHeaderClient.jsx#L1154-L1190) / mobile [:1679-1692](../../src/components/layout/PublicHeaderClient.jsx#L1679-L1692) | mega menu tiles | `PublicHeader.jsx:49` → `getActiveNavFeaturedOnlineCourses()` → **`nav_featured_online_courses` Mongo**, never MSDB | **Yes** — each tile is one `<a>` |
| 6 | [src/app/_components/home/FeatureContentStrip.jsx](../../src/app/_components/home/FeatureContentStrip.jsx) and [FeaturedContentSlider.jsx](../../src/app/_components/home/FeaturedContentSlider.jsx) | home hero / feature strip | [featureContentFromBanners.js](../../src/lib/home/featureContentFromBanners.js) — reshapes an online course into a generic `item` | mixed; not a course card |

### 3.2 Fields each renderer reads

| renderer | fields |
|---|---|
| 1 — home card | `o_course_id`¹, `o_course_name`, `o_course_teaser`, `o_course_cover_url`, `o_number_lessons`, `o_course_traininghours`, `o_course_price`, `o_course_netprice`, `o_course_certificate_status`, `o_course_levels`, `program.programiconurl`, `program.program_name`², `skills[]`, `website_urls[0]` |
| 4 — search card | `o_course_cover_url`, `o_course_name`, `o_course_teaser`, `o_number_lessons`, `o_course_price`, `website_urls[0]` |
| 5 — mega menu | `course_name`, `course_cover_url`, `course_url` — **genesis-owned copies**, not `o_*` keys |
| 6 — feature strip | `o_course_cover_url`, `o_course_name`, `o_course_teaser`, `o_course_levels`, `o_course_traininghours`, `o_course_price`, `o_course_netprice` |

¹ React key + log only, never printed. ² `alt` text only.

### 3.3 Name-collision check

The brief flagged two `CourseCard` and two `CourseCarousel` files. Measured:

- `CourseCard`: **two** — [training-course/_components/CourseCard.jsx](../../src/app/(public)/training-course/_components/CourseCard.jsx) and [components/course/CourseCard.jsx](../../src/components/course/CourseCard.jsx). **Neither renders online courses**; neither file contains any `o_course_*` reference.
- `CourseCarousel`: **one** — [src/app/_components/home/CourseCarousel.jsx](../../src/app/_components/home/CourseCarousel.jsx). It is generic (`CardComponent` prop) and is the online path only when `OnlineCoursesSection` passes `OnlineCourseCard` into it.
- **Page builder renders no online-course section.** The only `online` string under
  `src/components/pageBuilder/` is a schedule delivery-mode label in
  [course_schedule.jsx:24](../../src/components/pageBuilder/sections/course_schedule.jsx#L24).
- `ArticleDetailClient.jsx`'s `RelatedCourseCard` shares `website_urls` but reads
  `course_price` / `course_trainingdays` / `course_id` — classroom shape. Not an online-course
  renderer.

---

## 4. Where the missing values could come from

Presented as options with trade-offs. **Not a recommendation.**

### 4.1 "e-Learning" type tag — verdict (d)

| option | cost | trade-off |
|---|---|---|
| **A. Literal in the card** | one line in `OnlineCourseCard.jsx`. No data change anywhere | The tag becomes a property of *the component*, not of the course. Correct exactly as long as `/online-course` remains an all-e-learning feed. If a hybrid or cohort-based online product ever lands there, the card lies and nothing catches it |
| **B. New MSDB field** (`o_course_delivery_mode`) | upstream editor change, outside this repo, + 22 rows of data entry; then free through sync (`...c`) | Honest and future-proof, but buys nothing measurable today: every one of the 22 rows would carry the same value |
| **C. Genesis extension record** | new model + new admin screen + a join at sync | Highest cost of the three, and it puts a *classification* under genesis ownership when MSDB owns the catalogue |

Measured basis: this value is **constant across all 22 rows by construction** — the feed is
the definition. See §6.

### 4.2 "ผ่านเกณฑ์ได้ e-certificate" tag — verdict (a), never true

The plumbing is complete. Nothing needs building.

| option | cost | trade-off |
|---|---|---|
| **A. Populate the existing MSDB field** | zero code. Set `o_course_certificate_status: true` on the qualifying rows in the MSDB editor | **Cheapest path in the entire audit.** Uses a field that already exists upstream, already syncs, and is already rendered. Also fixes the `ONL-MSE-L1` drift row, whose author clearly intended this. Risk: none in this repo — but it depends on someone outside it, and the audit cannot tell whether `false` is "not yet entered" or "genuinely no certificate" |
| **B. Literal in the card** | one line | Only defensible if certificate eligibility is genuinely universal. The audit **cannot** establish that — 22×`false` is equally consistent with "nobody filled it in" and with "none of them qualify". Choosing this without asking the catalogue owner encodes a guess as a fact |
| **C. Genesis extension record** | new model + admin screen | Duplicates a field MSDB already has. Creates two owners for one truth, and the sync would have to decide which wins |

### 4.3 Instructor name — verdict (d)

| option | cost | trade-off |
|---|---|---|
| **A. New MSDB field on `/online-course`** (`o_instructor_id` → `/instructors._id`) | upstream schema + editor change (outside this repo) + 22 rows of data entry; in genesis, a join at sync time against `/instructors` and one card change | The only option that produces a **per-course, single-owner** answer. Costs a round trip through the upstream team. Note the genesis side is nearly free — `...c` carries a new key automatically |
| **B. Genesis extension record** (an online-course counterpart to `CourseExtension`) | new model, new admin screen, join in `buildOnlineCoursesForSection`, 22 rows of admin data entry, all inside this repo | Ships without waiting on anyone. But it makes genesis the **owner of a fact about the catalogue**, which is the boundary `CourseExtension`'s own header text draws (upstream is read-only for us; genesis owns SEO, URLs, media). It also guarantees drift: a course reassigned upstream leaves genesis holding the previous instructor with nothing to detect it |
| **C. Program-level credit via the existing join** | no new field: `course.program._id` → `instructors.programs[]` | **The audit argues against this.** It covers 10/22 courses, is 1-to-many, and `MSE` alone holds 10 of the 22 — so it would print the same instructor list on nearly half the catalogue. It answers "who teaches this subject", not "who teaches this course" |

### 4.4 Instructor photo — verdict (d)

This one has an extra dependency: **even with a course→instructor link, MSDB has no photo.**
`/instructors` carries no image field at all.

| option | cost | trade-off |
|---|---|---|
| **A. New MSDB field on `/instructors`** (`image_url`) | upstream schema + editor change + 9 uploads. **Note `syncInstructors.js` already reads `item.image_url`** — the mapping is waiting for a field that was never built | Single owner for both name and photo. Requires 4.3-A alongside it, or there is still nothing to attach the photo to |
| **B. Reuse the genesis `instructors` collection** | `image_url` already exists in the schema and holds 6 real Cloudinary URLs today | Two blockers, both measured: (i) **the 6 rows with photos have no `instructor_id`**, so they cannot be matched to an upstream instructor at all; (ii) the 10 rows that *do* have `instructor_id` are blank because `syncInstructors.js` maps keys MSDB does not emit (§2.6). Fixing that sync is a prerequisite for this option, and it is a real bug worth fixing regardless of what the card does |
| **C. Cover-image composite** — bake the instructor into `o_course_cover_url` upstream | no schema change anywhere | Not a field. Unsearchable, unreusable, and re-uploaded whenever an instructor changes. Listed only because it is what a catalogue often does in practice |

---

## 5. What this audit could NOT determine

1. **Whether `o_course_certificate_status: false` means "no certificate" or "not filled in."**
   22/22 `false` is unanimous, and unanimity is exactly what those two readings share.
   `/public-course` has the same field at `true`, which shows the field is *used* — but not
   what its default means for the online catalogue. Only the catalogue owner can answer this,
   and §4.2 hangs on the answer.
2. **What 9Expert Academy actually shows.** Left as "not measured — user-supplied" per the
   brief. So the audit cannot say whether an instructor byline or an e-Learning tag on Academy
   has a data source at all, or is Academy-side presentation.
3. **Whether the `ONL-MSE-L1` drift keys are a one-off typo or the beginning of a rename.**
   One row out of 22 carries `o_certificate_status`, `o_traininghours`, `o_workshop_status`
   and `o_coursepromote_status`. Four keys drifting together on one record looks deliberate,
   but a single sample cannot distinguish a typo from a migration in progress.
4. **Whether the 10 blank `instructors` rows were ever populated.** The sync `$set`s them to
   `''` on every run, so any earlier content is long gone and no history exists to check.
5. **Why one synced instructor row exists that upstream does not have** (10 rows with
   `instructor_id` vs 9 upstream). The sync never deletes, so this is consistent with an
   upstream deletion, but the audit cannot confirm which row or when.

---

## 6. Constant vs genuinely per-course

Measured as distinct non-empty values across all 22 online courses.

**Plausibly CONSTANT for all online courses:**

| field | evidence |
|---|---|
| **"e-Learning" type tag** | Constant **by construction** — `/online-course` is the definition of the set. No measurement needed, and none is possible: there is no field to vary |
| `o_course_certificate_status` | 1 distinct value (`false` × 22). Constant **as measured** — but see §5.1: this may be an unfilled default rather than a fact, and the `ONL-MSE-L1` drift row is evidence that at least one person believed it should be `true` |
| `o_course_workshop_status` | 1 distinct value (`false` × 22) |
| `o_course_promote_status` | 1 distinct value (`false` × 22) |

**Genuinely PER-COURSE:**

| field | distinct values / 22 |
|---|---|
| **instructor name** | Cannot be measured — no field exists. But per-course *by nature*: the closest proxy, `program`, already has **13 distinct values across 22 courses**, and instructors are finer-grained than programs |
| **instructor photo** | Same — follows whatever the instructor field would be |
| `o_course_name`, `o_course_teaser`, `o_course_cover_url`, `website_urls` | 22 — fully distinct |
| `o_course_objectives`, `o_course_training_topics`, `o_course_doc_paths` | 17 |
| `o_course_target_audience`, `o_course_system_requirements` | 16-17 |
| `o_number_lessons` | 13 |
| `program` | 13 (skewed: `MSE` holds 10 of 22) |
| `o_course_price` | 12 |
| `o_course_prerequisites` | 12 |
| `skills` | 9 |
| `o_course_traininghours` | 8 |
| `o_course_netprice` | 4 (populated on only 5/22) |
| `o_course_levels` | 3 — `2`×20, `1`×1, `3`×1. Per-course but **heavily skewed**; the badge prints "Intermediate" on 20 of 22 |

**The short version:** the two tag fields are constant and cost approximately nothing to
render; the two instructor fields are per-course and have no source anywhere in the system
today.

---

## Reproducing

```bash
node scripts/audit-online-course-fields.mjs   # GET-only; writes audit-online-course-fields.out.md
```

The Mongo figures were taken with a read-only `find`/`countDocuments` probe run from the
scratchpad against `MONGODB_URI`; it is not committed because it opens a database connection
and the committed script is deliberately MSDB-only.
