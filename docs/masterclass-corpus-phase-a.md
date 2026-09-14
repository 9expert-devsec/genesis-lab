# Masterclass corpus — phase A: what authoritative Masterclass text exists, and in what shape

Round M1. Measured 2026-09-14T06:18Z (13:18 Asia/Bangkok) on branch `staging` at `3a1d6e40`,
against the live database `9exp_genesis` with read-only queries (`find`, `countDocuments`,
`aggregate $group`; nothing written). Every count is measured; anything derived from reading
code without running it is marked **hypothesis**.

Purpose: before a `masterclass/` folder can be written into the chatbot corpus, know which
Mongo fields carry the prose a reader wants, how long each one actually is for **every**
course, what the public pages treat as authoritative, and what `/api/corpus/promotions`
already says about Masterclass so the new documents neither duplicate nor contradict it.
Nothing is designed or built here; §9 is a proposal only.

---

## 0. Headline

- **Two** Masterclass courses exist, both published; **four** batches, two `open` (one per
  course) and two `draft`. There is no third course and no `closed`/`full`/`cancelled` batch.
- **All the prose is in model fields.** Nothing Masterclass-related lives in page-builder
  sections or `custom_pages`; the detail page renders straight from `masterclass_courses` +
  `masterclass_batches` + `local_faqs` + `instructors`. There is no hidden "rendered page
  content" to scrape.
- Per course the readable text comes to **~4,900–5,600 characters** in course fields, plus
  **~1,450–1,700** in five FAQs each, plus **140–250** of instructor bio. A composed corpus
  document per course lands at **7,600–9,100 characters** (§9, measured by composing it).
- The richest field is `curriculum[].modules[].topics_html` (1,944 / 2,069 readable chars)
  — it is HTML, nested `<ul>` inside `<li>`, and is the *only* form the outline exists in for
  12 of the 13 modules. `topics[]` (plain strings) is populated on one module only and is a
  flattened copy that loses the nesting. The page prefers `topics_html`.
- Two fields on the course model are **present-but-vestigial** and one of them **contradicts
  the rendered field**: `system_requirements{}` (structured) is never read by any public
  component, and on `mas-claude-ai-for-data-analyst` it lists macOS / Firefox / Excel while
  the rendered `system_requirements_html` says Windows 11/10 and Claude Desktop only.
- `registered_count` is **still not trustworthy**: the live `mas-ai-dmc` batch 1 shows
  `registered_count: 0` while holding one **paid** registration for two attendees. The
  standing "seats are not served" ruling stands; see §7.
- One inconsistency worth knowing about (not this round's to fix):
  [src/lib/masterclass/generateJsonLd.js](../src/lib/masterclass/generateJsonLd.js) hard-codes
  `BASE_URL = 'https://masterclass.9experttraining.com'` for the JSON-LD `@id` and
  registration URLs, while the same page's `<link rel=canonical>` and the corpus use
  `https://www.9experttraining.com`. The corpus must follow the canonical, not the JSON-LD.

---

## 1. The data model

Two collections, two Mongoose models, no others. (`masterclass_registrations`, 48 rows, is
the order book — read only for §7.) Instructors and FAQs are joined from their own
collections at render time.

### 1a. `masterclass_courses` — [src/models/MasterclassCourse.js](../src/models/MasterclassCourse.js)

"Populated" = non-empty on N of the 2 rows.

| field | type | populated | note |
|---|---|---|---|
| `slug` | String, unique, indexed | 2/2 | the URL key; matched case-sensitively |
| `course_code` | String | 2/2 | `M-CLAUDE-DA`, `M-AI-DMC` |
| `title_th` | String | 2/2 | actually English on both rows |
| `subtitle_th` | String | 2/2 | one-paragraph tagline, 166 / 178 chars; used as `<meta description>` and JSON-LD `description` |
| `description_html` | String (HTML) | 2/2 | one `<p>`, 594 / 561 readable chars |
| `cover_image_url` | String | 2/2 | Cloudinary |
| `cover_image_public_id` | String | **0/2** | empty on both |
| `hero_gradient_from` / `_to` | String (hex) | 2/2 | both still at the schema defaults |
| `gallery[]` | `{type: image\|youtube, url, videoId, alt, order}` | 2/2 | 6 items each: 1 YouTube + 5 images. `alt` carries the course title only |
| `course_outline_url` | String | 2/2 | a Cloudinary-hosted **PDF** per course (the "ดาวน์โหลด Outline" button) |
| `duration_days` / `duration_hours` | Number | 2/2 | 1 / 7 on both |
| `schedule_days[]` | [String] | 2/2 | `["เสาร์"]` on both |
| `time_start` / `time_end` | String | 2/2 | `09:00` / `17:00` on both |
| `level` | enum beginner/intermediate/advanced | 2/2 | `intermediate` on both |
| `tags[]` | [String] | 2/2 | `AI,Excel,M365` / `Social,AI,Content` — not rendered on the public page (**hypothesis**: no reader found in `(public)/masterclass`) |
| `suitable_for[]` | `{label, image_url}` | 2/2 | 4 / 7 audience labels |
| `prerequisites[]` | [String] | 2/2 | 5 / 4 sentences |
| `objectives[]` | [String] | 2/2 | 5 / 5 sentences |
| `benefits[]` | [String] | 2/2 | 5 / 5 sentences |
| `equipment_required[]` | [String] | 2/2 | 3 / 5 items — **not rendered** on the detail page (no reader in `MasterclassDetailClient.jsx`) |
| `system_requirements{os,browsers,accounts,software}` | object of [String] | **1/2** | populated on Claude only; **never rendered**; disagrees with the `_html` twin (§3) |
| `system_requirements_html` | String (HTML) | 2/2 | the rendered one: `<ol>` with nested `<ul>` |
| `license_options.enabled` | Boolean | 2/2 | true on both |
| `license_options.choices[]` | `{value, label_th, require_detail, detail_type, detail_options[], detail_label_th, info_popup{enabled, html_content, checkbox_label, popup_title}}` | 2/2 | 2 choices (Own / 9expert) on Claude, 1 (Own) on AI-DMC. `detail_options` on Claude holds `['pro_asdasd']` and `['pro']` — test residue |
| `license_options.global_ack{enabled, label_th, popup_title, html_content, checkbox_label}` | object | 2/2 | the account/subscription terms popup shown on the **register** form, 606 / 521 readable chars |
| `instructor_ids[]` | [String] (Instructor `_id`) | 2/2 | 1 / 2 ids; both resolve |
| `curriculum[]` | `{session_label, modules[{module_no, title, topics[], workshop, output, topics_html, content_html}]}` | 2/2 | 2 sessions × (3+3) / (3+4) modules; see §3 |
| `is_published` | Boolean | 2/2 | true on both — the **only** public visibility predicate |
| `is_active` | Boolean | 2/2 | true on both — read by nothing on the public path |
| `display_order` | Number | 2/2 | 0 / 1 |
| `faq_category` | String | 2/2 | `'masterclass'` default on both; **no consumer anywhere** — FAQs join on `(course_type, ref_id)`, not this |
| `createdAt` / `updatedAt` | Date | 2/2 | 2026-06-17 / 06-18 created; last updated 2026-07-15 / 2026-08-27 |

Module sub-fields across all 13 modules: `topics_html` 13/13, `title` 13/13, `module_no`
13/13, `topics[]` **1/13**, `workshop` **0/13**, `output` **0/13**, `content_html` **0/13**.

### 1b. `masterclass_batches` — [src/models/MasterclassBatch.js](../src/models/MasterclassBatch.js)

| field | type | populated (of 4) | note |
|---|---|---|---|
| `course_id` | ObjectId → course | 4/4 | the join that works |
| `course_slug` | String | 4/4 | denormalised and **stale on all four** (`claude-ai-for-data-analyst-test` ×2, `ai-content`, `mas-ai-content`); never read by the corpus, must never be read by the new one |
| `batch_no` | Number | 4/4 | |
| `batch_label` | String | 4/4 | `รุ่นที่ 1` / `รุ่นที่ 2` / `สำหรับทดสอบ (ห้ามกดลงทะเบียน)` |
| `dates[]` | `{date: Date, day_label}` | 4/4 | one date each; `day_label` is Thai with BE year (`เสาร์ที่ 26 กันยายน 2569`) |
| `venue_name` | String | 4/4 | `Asia Hotel \| Bangkok` (×3), `test` |
| `venue_address` | String | 4/4 | 78-char English street address (×3) |
| `venue_map_url` | String | 3/4 | Google Maps short link |
| `venue_note` | String | 1/4 | the test batch only |
| `preparation_html` | String (HTML) | 4/4 | "what to bring" list, 331 / 406 readable chars on the open batches; **rendered only on the register page**, not on the detail page |
| `price_normal` | Number | 4/4 | 12,900 / 12,900 / 12,900 / 100 |
| `price_early_bird` | Number\|null | 3/4 | 9,675 / 9,675 / 9,030 / null |
| `early_bird_deadline` | Date\|null | 3/4 | stored at `16:59:00Z` = 23:59 Asia/Bangkok |
| `early_bird_active` | Boolean | 4/4 | |
| `capacity` | Number | 4/4 | 50 on all |
| `registered_count` | Number | 4/4 | 14 / 0 / 0 / 0 — see §7 |
| `status` | enum draft/open/full/closed/cancelled | 4/4 | draft / open / open / draft |
| `status_override` | Boolean | 4/4 | false on all |
| `payment_enabled` | Boolean | 4/4 | true on all |
| `quote_enabled` | Boolean | 4/4 | false on Claude batch 1, true elsewhere |
| `internal_notes` | String | **0/4** | |

---

## 2. Inventory

### 2a. Courses

| `_id` | `slug` | `course_code` | `title_th` | published | active | order | instructors | FAQs (active) |
|---|---|---|---|---|---|---|---|---|
| `6a3212236f20c8488c24fa65` | `mas-claude-ai-for-data-analyst` | `M-CLAUDE-DA` | Claude AI for Data Analyst | **true** | true | 0 | 1 | 5 |
| `6a33db33b87c174eb4b5a737` | `mas-ai-dmc` | `M-AI-DMC` | AI Digital Marketing Creator Masterclass | **true** | true | 1 | 2 | 5 |

### 2b. Batches

| `_id` | course (by `course_id`) | `batch_no` | `batch_label` | status | date | venue | normal | early bird | EB deadline (UTC) | EB active | on `/masterclass` now |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `6a3217a16f20c8488c24faf6` | mas-claude-ai-for-data-analyst | 1 | รุ่นที่ 1 | **draft** | 2026-08-29 | Asia Hotel | 12,900 | 9,675 | 2026-08-21T16:59Z | true | no (draft) |
| `6a33631a749934f3c6c59acf` | mas-claude-ai-for-data-analyst | 2 | รุ่นที่ 2 | **open** | 2026-10-17 | Asia Hotel | 12,900 | 9,675 | 2026-10-02T16:59Z | true | **yes**, early bird live |
| `6a33db96b87c174eb4b5a74c` | mas-ai-dmc | 1 | รุ่นที่ 1 | **open** | 2026-09-26 | Asia Hotel | 12,900 | 9,030 | 2026-09-16T16:59Z | true | **yes**, early bird live (2 days left) |
| `6a3e336f73f65e97483a1fc5` | mas-ai-dmc | 2 | สำหรับทดสอบ (ห้ามกดลงทะเบียน) | **draft** | 2026-11-30 | test | 100 | — | — | false | no (draft) |

Batch 1 of the Claude course is dated 2026-08-29 and is now `draft` (**hypothesis**: set to
draft after the run — its `updatedAt` is 2026-09-02); the `closed` state is not in use.

---

## 3. The text — exact lengths for every course

"stored" = characters as stored (HTML where the field is HTML); "readable" = tags stripped,
list items on their own line, whitespace collapsed — i.e. roughly what a corpus document
would carry.

### 3a. `mas-claude-ai-for-data-analyst` (M-CLAUDE-DA)

| field | stored | readable | rendered on detail page? |
|---|---:|---:|---|
| `title_th` | 26 | 26 | yes (hero, `<title>`) |
| `subtitle_th` | 166 | 166 | yes (hero), also `<meta description>` |
| `description_html` | 601 | 594 | yes (section "รายละเอียดหลักสูตร") |
| `suitable_for[].label` (4 items) | — | 109 | yes (image tiles) |
| `prerequisites[]` (5) | — | 494 | yes |
| `objectives[]` (5) | — | 400 | yes |
| `benefits[]` (5) | — | 524 | yes |
| `equipment_required[]` (3) | — | 127 | **no** |
| `system_requirements{}` (9 strings) | — | 314 | **no** — and contradicts the `_html` (lists macOS, Firefox, Excel 2019+; the `_html` lists Windows only, Claude Desktop, Claude Subscription) |
| `system_requirements_html` | 354 | 266 | yes |
| `curriculum` (2 sessions, 6 modules, all `topics_html`) | 2,228 | 1,944 | yes (accordion) |
| `license_options.global_ack.html_content` | 765 | 606 | register page only |
| license choice "Own" `info_popup.html_content` | 426 | 316 | register page only |
| license choice "9expert" `info_popup.html_content` | 445 | 365 | register page only |
| `local_faqs` (5 active, Q+A) | 1,715 | 1,464 | yes (FAQ accordion + JSON-LD FAQPage) |
| instructor (1) name + title + bio | — | 140 | yes (name, title, bio, photo) |
| open batch `preparation_html` (1) | 429 | 331 | register page only |
| `gallery[].alt` (6) | — | 175 | as image alt only |
| `tags` | — | 15 | no |
| **course-field prose subtotal** (subtitle + description + suitable_for + prerequisites + objectives + benefits + sysreq_html + curriculum) | | **4,497** | |
| **+ FAQs + instructor + equipment + license terms** | | **≈ 6,850** | |

### 3b. `mas-ai-dmc` (M-AI-DMC)

| field | stored | readable | rendered on detail page? |
|---|---:|---:|---|
| `title_th` | 40 | 40 | yes |
| `subtitle_th` | 178 | 178 | yes; `<meta description>` |
| `description_html` | 572 | 561 | yes — its first sentence is the `subtitle_th` verbatim |
| `suitable_for[].label` (7) | — | 454 | yes |
| `prerequisites[]` (4) | — | 423 | yes |
| `objectives[]` (5) | — | 714 | yes |
| `benefits[]` (5) | — | 663 | yes |
| `equipment_required[]` (5) | — | 332 | **no** |
| `system_requirements{}` | — | 0 | (empty) |
| `system_requirements_html` | 515 | 348 | yes |
| `curriculum` (2 sessions, 7 modules, all `topics_html`) | 2,410 | 2,069 | yes |
| `license_options.global_ack.html_content` | 820 | 521 | register page only |
| license choice "Own" `info_popup.html_content` | 820 | 521 | register page only — byte-identical to `global_ack` |
| `local_faqs` (5 active, Q+A) | 1,743 | 1,717 | yes |
| instructors (2) name + title + bio | — | 251 | yes |
| open batch `preparation_html` (1) | 504 | 406 | register page only |
| `gallery[].alt` (6) | — | 265 | alt only |
| `tags` | — | 19 | no |
| **course-field prose subtotal** | | **5,410** | |
| **+ FAQs + instructors + equipment + license terms** | | **≈ 8,230** | |

### 3c. What is *not* there

- **No instructor bio worth the name.** `Instructor.bio` is 49 and 82 characters
  ("Canvassador 2026 / มีประสบการณ์การสอนมากกว่า 20 ปี", "Microsoft MVP Power BI/Copilot …
  Data & AI Consult"). `specialties[]` is empty on both. The bios are synced from MSDB
  ([src/lib/instructors/syncInstructors.js](../src/lib/instructors/syncInstructors.js)), so
  genesis is not where longer ones would be authored.
- **No per-module workshop / output / notes.** `workshop`, `output`, `content_html` are empty on
  all 13 modules; the outline is the `topics_html` bullet list and the module title.
- **No certificate, cancellation, refund, VAT or invoice prose** on the course. The JSON-LD
  asserts `educationalCredentialAwarded: 'e-Certificate'` and `valueAddedTaxIncluded: false`
  as **string literals in code**, not from data.
- **No long-form description.** `description_html` is a single paragraph; the "what is a
  Masterclass" framing exists only as the `/masterclass` listing `<meta description>` — a
  literal in [page.jsx](../src/app/(public)/masterclass/page.jsx): *"เรียนเข้มข้นแบบ Workshop
  เต็มวัน เฉพาะเสาร์-อาทิตย์ กลุ่มเล็ก ลงมือปฏิบัติจริงกับผู้เชี่ยวชาญ 9Expert"*. That is
  the only sentence anywhere in the repo that answers "Masterclass คืออะไร" generically.
- **The course-outline PDF** (`course_outline_url`) is a Cloudinary asset not read this round;
  whether it duplicates or extends `curriculum` is unknown (**hypothesis**: duplicates).

---

## 4. How the public pages obtain their data

Both routes are `force-dynamic`; no ISR, no module cache.

**`/masterclass`** — [page.jsx](../src/app/(public)/masterclass/page.jsx) →
`getPublishedMasterclasses()` in
[getMasterclass.js](../src/lib/masterclass/getMasterclass.js):
`MasterclassCourse.find({ is_published: true }).sort({ display_order: 1 })` then
`MasterclassBatch.find({ course_id: {$in}, status: {$in: ['open','full']} })`, each batch
spread with `resolveBatchPrice(b)`. **No projection** — the whole course document goes to the
client component. The card ([MasterclassCard.jsx](../src/app/(public)/masterclass/_components/MasterclassCard.jsx))
renders `title_th`, `subtitle_th` (3-line clamp), `level`, `duration_days`, `schedule_days`,
`time_start/end`, `cover_image_url`, and from `batches[0]`: `effective_price`,
`original_price`, `is_early_bird`, `early_bird_deadline` (countdown), `capacity`,
**`registered_count`** ("ว่าง N ที่นั่ง" + progress bar), `status`.

**`/masterclass/[slug]`** — [page.jsx](../src/app/(public)/masterclass/[slug]/page.jsx) →
`getMasterclassBySlug(slug)`: `findOne({ slug, is_published: true })` (case-sensitive) then
`MasterclassBatch.find({ course_id, status: {$nin: ['draft','cancelled']} })`; in parallel
`getLocalFaqsForCourse('masterclass', String(course._id))` (`is_active: true`, sorted
`display_order, createdAt`) and `getInstructorsByIds(course.instructor_ids)`. The client
component ([MasterclassDetailClient.jsx](../src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx))
renders, in page order: hero (`title_th`, `subtitle_th`, `level`, `duration_days`,
`time_start/end`, `gallery`, `course_outline_url` button), `description_html`,
`objectives[]`, `suitable_for[]`, `prerequisites[]`, `system_requirements_html`,
`benefits[]`, `curriculum[]` (session label → module accordion; body = `topics_html` if set,
else `topics[]`; then `output`, `content_html`), instructors (`name`, `title`, `bio`,
`image_url`, `specialties`), FAQ accordion, and the batch selector (`batch_label`/`batch_no`,
`dates`, `venue_name`, prices, `status`; `capacity` appears as "N Participants").

**Authoritative vs vestigial, by that evidence:**

| authoritative (rendered) | vestigial / unrendered |
|---|---|
| `title_th`, `subtitle_th`, `description_html`, `objectives`, `suitable_for[].label`, `prerequisites`, `system_requirements_html`, `benefits`, `curriculum[].session_label`, `modules[].title/module_no/topics_html`, `level`, `duration_days`, `time_start/end`, `schedule_days`, `course_outline_url`, `gallery`, instructors `name/title/bio`, active `local_faqs`, batch `batch_label/dates/venue_name/price_*/early_bird_*/status/capacity` | `system_requirements{}` (contradicts its `_html` twin), `equipment_required[]`, `tags[]`, `faq_category`, `is_active`, `cover_image_public_id`, `hero_gradient_*` (defaults), modules' `topics[]`/`workshop`/`output`/`content_html`, batch `course_slug` (stale), `internal_notes`, `venue_note` |
| register-page only: `license_options.*`, batch `preparation_html`, `venue_address`, `venue_map_url` | |

All HTML fields pass through `sanitizeRichHtml()` at render; the stored HTML is TipTap-style
(`<p>` inside `<li>`, nested `<ul>`), consistent across both courses.

---

## 5. Canonical public URLs

The detail page's `generateMetadata` sets `alternates.canonical` to
`${siteConfig.url}/masterclass/${slug}` and `siteConfig.url` falls back to
`https://www.9experttraining.com`; the sitemap emits slugs exactly as stored. Every URL the
corpus emits must therefore be:

| course | canonical URL |
|---|---|
| Claude AI for Data Analyst | `https://www.9experttraining.com/masterclass/mas-claude-ai-for-data-analyst` |
| AI Digital Marketing Creator Masterclass | `https://www.9experttraining.com/masterclass/mas-ai-dmc` |
| listing | `https://www.9experttraining.com/masterclass` |

Registration deep link (from the JSON-LD generator's pattern):
`…/masterclass/<slug>/register?batch=<batch _id>`.

The `masterclass.9experttraining.com` host 308s every path to the same path on `www`
([next.config.mjs](../next.config.mjs), env-gated on `MASTERCLASS_REDIRECT_HOST`).
[generateJsonLd.js](../src/lib/masterclass/generateJsonLd.js) still hard-codes the subdomain
as `BASE_URL` for `@id` and offer URLs — the one place in the repo that disagrees with the
canonical. `CORPUS_PUBLIC_ORIGIN` in
[src/lib/corpus/promotions.js](../src/lib/corpus/promotions.js) is already `https://www.9experttraining.com`
and the new documents should import that constant rather than spell a second one.

---

## 6. What `/api/corpus/promotions` already emits for Masterclass

Source `masterclass` in [src/lib/corpus/promotions.js](../src/lib/corpus/promotions.js)
`masterclassItems()`. One item **per batch** that is `status ∈ {open, full}` ∧ course
`is_published` ∧ `resolveBatchPrice(batch, now).is_early_bird`. So it is an *early-bird
offers* feed, not a course feed: a batch with no live early bird contributes **nothing**, and
today it emits exactly two items (Claude batch 2, AI-DMC batch 1). The exact field set:

```
id           "masterclass:<batch _id>"
kind         "early_bird"
source       "masterclass"
title        "<course.title_th> — <batch_label | 'รุ่นที่ ' + batch_no>"
url          "https://www.9experttraining.com/masterclass/<course.slug>"
live_from    batch.createdAt (ISO)
live_until   batch.early_bird_deadline (ISO)
is_live      true
price        { normal: price_normal, special: price_early_bird, currency: "THB", discount_pct }
courses[0]   { course_code, title: title_th, schedule_id: null,
               dates: [ "YYYY-MM-DD", … ], time: "HH:MM–HH:MM", venue: venue_name }
bundle       null
description  course.subtitle_th
```

Reads: batches projected to `course_id batch_no batch_label dates venue_name price_normal
price_early_bird early_bird_deadline early_bird_active status createdAt`; courses projected to
`slug course_code title_th subtitle_th time_start time_end is_published`. `seats` is
deliberately **absent** (not null) and the test asserts that
([test/pure/promotionsCorpus.test.mjs](../test/pure/promotionsCorpus.test.mjs)).

What that means for a Masterclass corpus document: **prices, early-bird deadline, batch
dates, venue name and `subtitle_th` are already served, live, per instant.** A course
document that re-states a price or a deadline would be a second copy that can go stale
between corpus rebuilds while the promotions feed is `no-store`. The document should carry
the *timeless* text and point at the promotions feed (or the page) for anything with a clock
on it — or, if it does carry the batch line, it must derive it from the same `resolveBatchPrice`
and the same `open/full` predicate, and be labelled with its own `generated_at`.

---

## 7. `registered_count` / seat drift — current state

Ruling on record ([promotions-corpus-endpoint.md](./promotions-corpus-endpoint.md) §1.3):
`seats` is not served because `registered_count` has two maintenance schemes. Both schemes
are still in place, unchanged since the ruling (no commit since 2026-09-01 touches any of the
writers):

1. **Automatic** — `$inc: 1` when a registration is paid
   ([api/masterclass/register/charge/route.js:78](../src/app/api/masterclass/register/charge/route.js#L78),
   [api/webhooks/omise/route.js:135](../src/app/api/webhooks/omise/route.js#L135)) and
   `$inc: -1` on admin cancel
   ([lib/actions/masterclass-registrations.js:166](../src/lib/actions/masterclass-registrations.js#L166)).
   It counts **registrations, not attendees** (`attendeesCount` is 1–3 per registration).
2. **Manual** — `updateMasterclassBatch` accepts `data.registered_count` from the admin form
   and `$set`s it ([lib/actions/masterclass.js:144](../src/lib/actions/masterclass.js#L144)).

Measured against `masterclass_registrations` (read-only `$group`):

| batch | `registered_count` | paid regs / attendees | pending regs / attendees | cancelled | the card says |
|---|---:|---|---|---|---|
| Claude รุ่นที่ 1 (draft) | 14 | 13 / **18** | 27 / 50 (22 are quotes) | 1 / 1 | not listed |
| Claude รุ่นที่ 2 (open) | 0 | 0 / 0 | 1 / 1 | 0 | ว่าง 50 ที่นั่ง |
| AI-DMC รุ่นที่ 1 (open) | **0** | **1 / 2** (credit card, paid 2026-08-30) | 5 / 9 (quotes) | 0 | **ว่าง 50 ที่นั่ง** |
| AI-DMC test (draft) | 0 | 0 | 0 | 0 | not listed |

So the drift is not historical: a **live, publicly listed** batch has a paid registration for
two people and a counter of zero, and `/masterclass` is telling visitors all 50 seats are
free. On the Claude batch the counter (14) is neither the paid-registration count (13) nor
the attendee count (18). **Nothing has changed that would revisit the ruling; the evidence
for it got stronger.** A corpus document must not carry seats, "ว่าง N ที่นั่ง", or anything
derived from `registered_count`. (`capacity` = 50 is stable and rendered as "รับจำกัด 50
ที่นั่ง"; it is a fact about the room, not the order book, and is safe to state.)

---

## 8. Findings that a reader of the brief should know

1. **The brief's "Masterclass คืออะไร" has no authoritative answer in data.** The only
   generic sentence is the listing page's `<meta description>` literal (§3c). Everything else
   is per-course. A `masterclass/README` or overview document would have to be **authored**,
   not extracted — or the bot answers with the two course documents and the listing URL.
2. **The outline is HTML, and only HTML.** Any extraction must convert `topics_html` (nested
   `<ul>`) to text; `topics[]` cannot be used as the plain-text fallback because it is empty
   on 12/13 modules and flattened on the one where it exists.
3. **`system_requirements{}` must not be read.** It is unrendered and, on Claude, wrong.
   `system_requirements_html` is the truth the page shows.
4. **`equipment_required[]` is real, current-looking prose that the page never shows**
   (3 / 5 items, e.g. "Notebook … RAM 8 GB ขึ้นไป (แนะนำ 16 GB)"). It overlaps the open batch's
   `preparation_html` (register page). Whether the corpus should carry text the public page
   does not is a decision for the human; the safe default is to carry only what is rendered.
5. **`title_th` is English** on both rows and the listing `<title>` is
   "Masterclass — 9Expert Training"; a document title of the form
   `<title_th> | Masterclass` matches both the page `<title>` and the JSON-LD `name`.
6. **Instructor bios are too short to be useful** and are MSDB-owned; do not pad them.
7. **No course-level JSON-LD field beyond what the page already derives**; `e-Certificate` and
   "VAT not included" are code literals — if the document states them it is repeating code,
   not data, and should say so in the source annotation.

---

## 9. PROPOSED shape — one corpus document per Masterclass course (proposal only)

Composed from the fields the detail page renders, in page order, as plain text with Markdown
headings; HTML fields converted to text with list structure kept. Measured by composing it
from the live rows: **7,645 chars** for `mas-claude-ai-for-data-analyst`, **9,076 chars** for
`mas-ai-dmc` (both include the batch line and FAQs; strip those and it is ≈ 5,300 / 6,200).

```
# <title_th> | Masterclass                                   ← page <title>, JSON-LD name
Masterclass · รหัส <course_code> · <duration_days> วัน (<duration_hours> ชม.)
  · <schedule_days> <time_start>–<time_end> · ระดับ <level>
URL: https://www.9experttraining.com/masterclass/<slug>     ← CORPUS_PUBLIC_ORIGIN + slug
เอกสารหลักสูตร (PDF): <course_outline_url>

<subtitle_th>                                                ← already in promotions feed as `description`
<description_html → text>

## เหมาะสำหรับ            ← suitable_for[].label, one bullet each
## พื้นฐานที่ควรมี          ← prerequisites[]
## วัตถุประสงค์            ← objectives[]
## สิ่งที่จะได้รับ          ← benefits[]
## หลักสูตร (Outline)      ← curriculum[]: session_label, then "N. title" + topics_html→text
## ความต้องการของระบบ      ← system_requirements_html → text   (NOT system_requirements{})
## เงื่อนไข License / บัญชี ← license_options.global_ack.html_content → text  (see open q. 2)
## วิทยากร                 ← instructors: name (name_en) — title. bio
## รอบที่เปิดรับสมัคร        ← batches status ∈ {open, full}: label · day_label · venue_name
                             · price_normal (· early bird price + deadline, ONLY via
                             resolveBatchPrice(b, now)) · status      (see open q. 1)
## คำถามที่พบบ่อย           ← local_faqs (is_active, display_order, createdAt): Q / A→text
```

Field order follows the rendered page except that the PDF link is hoisted to the header and
the batch line sits after the instructors, before the FAQs (the page's sticky bar shows it
throughout).

**Deliberately not in the document:** `registered_count` / seats (§7); `system_requirements{}`,
`tags`, `faq_category`, `is_active`, `gallery` (image URLs are not prose), `hero_gradient_*`,
`equipment_required` (unrendered — open question 3), batch `course_slug`, `venue_address` /
`venue_map_url` / `preparation_html` (register-page only — open question 3), license choice
`info_popup.html_content` (near-duplicates of `global_ack`), `internal_notes`, draft/cancelled
batches, inactive FAQs.

**What is missing that a reader would expect** (cannot be extracted; must be authored or
sourced elsewhere):

- a generic "what a 9Expert Masterclass is" paragraph (only the 100-char meta description exists);
- an instructor bio longer than one line;
- cancellation / refund / transfer policy, certificate wording, VAT and invoice terms;
- lunch / breaks / language of instruction / class size (`capacity` 50 is the only hint);
- what the PDF outline adds over `curriculum` (not read this round).

**Open questions for the human before round M2:**

1. Should the document carry the batch/price line at all, given the promotions feed already
   serves it live? Options: (a) omit and cite the feed + page URL; (b) include, derived from
   the same predicates, stamped with `generated_at`. (a) cannot go stale; (b) answers
   "ราคาเท่าไหร่" without a second lookup.
2. Include the license/subscription terms (`global_ack`)? They are shown only on the register
   form, but "ต้องมี ChatGPT Go ขึ้นไป" is exactly what a prospective attendee asks.
3. Include `equipment_required[]` and batch `preparation_html` (not on the detail page but
   real, current prose about what to bring)?
4. Is a hand-authored `masterclass/overview` document wanted for the "Masterclass คืออะไร"
   question, and who writes it?
5. Should the JSON-LD `BASE_URL` subdomain literal be fixed in a separate round so the page
   and the corpus agree on one origin?

---

*Method: read-only Mongo queries (`find`, `aggregate $group`, `listCollections`) from a
throwaway script in the session scratchpad, outside the repo, using the repo's own `mongodb`
driver and `.env.local`; no document was written, no model or route touched. Source files
read: `MasterclassCourse.js`, `MasterclassBatch.js`, `Instructor.js`, `LocalFaq.js`,
`getMasterclass.js`, `getLocalFaqs.js`, `generateJsonLd.js`, `(public)/masterclass/page.jsx`,
`[slug]/page.jsx`, `MasterclassDetailClient.jsx`, `MasterclassCard.jsx`, `sitemap.js`,
`next.config.mjs`, `redirectRules.js`, `config/site.js`, `corpus/promotions.js`,
`api/corpus/promotions/route.js`, `promotionsCorpus.test.mjs`, the `registered_count` writers
listed in §7, and the two prior corpus docs. No test was run.*
