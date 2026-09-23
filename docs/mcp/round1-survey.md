# MCP round 1 — survey

**Read-only round.** Nothing in this round changed any source file, installed any package, ran any
build or test, or sent any non-GET request. Every number below is a measurement taken on
**2026-09-23** (MSDB `serverNow` = `2026-09-23T15:14:57Z`), not a reading of documentation.

Raw responses were saved to a scratch directory outside the worktree and re-read from there, so no
endpoint was called more than the budget allowed. No key value appears in this document; env var
**names** only.

| | |
|---|---|
| Machine | `S_GUSS` |
| Clone | `C:/workspace/projects/genesis-lab` |
| Branch | `staging`, 0 ahead / 0 behind `origin/staging` |
| Long-running jobs touching the repo | none |

---

## 0. Where the credentials are read

| Thing | Location | Notes |
|---|---|---|
| MSDB base URL | [src/lib/api/client.js:20](../../src/lib/api/client.js#L20) | `process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai'` |
| MSDB API key | [src/lib/api/client.js:21](../../src/lib/api/client.js#L21) | `process.env.AI_API_KEY`, sent as `x-api-key` at [client.js:70](../../src/lib/api/client.js#L70) |
| Upstream timeout | [src/lib/api/client.js:25](../../src/lib/api/client.js#L25) | 10 s, via `fetchWithTimeout` |
| Envelope normaliser | [src/lib/api/client.js:92](../../src/lib/api/client.js#L92) | `unwrap()` → `{ items, total }` across both envelope variants |
| Corpus key check | [src/lib/corpus/promotionsAuth.js](../../src/lib/corpus/promotionsAuth.js) via `corpusAuthStatus(req.headers.get(CORPUS_KEY_HEADER), process.env.CORPUS_API_KEY)` | called at [promotions/route.js:32](../../src/app/api/corpus/promotions/route.js#L32), [masterclass/route.js:39](../../src/app/api/corpus/masterclass/route.js#L39), [masterclass-cards/route.js:40](../../src/app/api/corpus/masterclass-cards/route.js#L40), [career-path-cards/route.js:40](../../src/app/api/corpus/career-path-cards/route.js#L40) |

`CORPUS_API_KEY` is already a separate key from `AI_API_KEY` — the comment at
[promotions/route.js:10-13](../../src/app/api/corpus/promotions/route.js#L10-L13) states the reason
explicitly ("a key of its OWN, never the MSDB `AI_API_KEY`, so it can be rotated or revoked without
touching the upstream integration"). `MCP_API_KEY` should follow the same pattern, including the
**fail-closed 503 when unset**.

---

## 1. Endpoint measurements

### 1.1 MSDB `https://9exp-sec.com/api/ai/` (header `x-api-key`)

All content-types were `application/json`. All statuses 200.

| Endpoint | Status | Bytes | Items | Top-level shape | Avg bytes/item |
|---|---:|---:|---:|---|---:|
| `/public-course` | 200 | 915,078 | 77 | `{ ok, total, page, limit, items }` | 11,883 |
| `/online-course` | 200 | 180,569 | 24 | `{ ok, total, page, limit, items }` | 7,522 |
| `/programs` | 200 | 90,206 | 27 | `{ ok, summary: { total }, items }` | 3,339 |
| `/skills` | 200 | 20,815 | 7 | `{ ok, items }` | 2,971 |
| `/schedules` (no params) | 200 | 54,806 | 77 | `{ ok, summary: { total, filterUsed, todayUTC }, items }` | 709 |
| `/schedules?status=all` | 200 | 60,493 | 85 | same | 710 |
| `/instructors` | 200 | 24,621 | 9 | `{ ok, total, items }` | 2,732 |
| `/promotions` (defaults) | 200 | 33,794 | 1 | `{ ok, summary: { total, serverNow, filters }, items }` | 33,602 |
| `/promotions` (all three include flags) | 200 | 688,188 | 21 | same | ~32,770 |
| `/faqs` | 200 | 57,911 | 30 | `{ ok, summary: { total }, items }` | 1,929 |
| `/about-us` | 200 | 17,109 | — | `{ ok, item }` (single object) | — |
| `/contact-us` | 200 | 3,657 | — | `{ ok, summary, items }` | — |

**Three envelope variants are live, not two.** `client.js` documents "canonical" (`summary.total`)
and "paginated" (`total, page, limit`). A third exists: `/skills` returns `{ ok, items }` with **no
total of any kind**, and `/instructors` returns `{ ok, total, items }` with no `page`/`limit`.
`unwrap()` handles all of them (it falls back to `items.length`), but code that reads
`response.total` directly would get `undefined` on `/skills`.

#### Field lists

**`/public-course` — one item** (sample: `COPILOT-STU`)

| Field | Type | Example (≤80 chars) |
|---|---|---|
| `_id` | string | `"692d39b52ee07293c9131fd8"` |
| `course_id` | string | `"COPILOT-STU"` |
| `course_name` | string | `"AI Agents with Microsoft Copilot Studio"` |
| `course_teaser` | string | `"สร้าง AI Agent ด้วย Microsoft Copilot Studio"` |
| `course_trainingdays` | number | `1` |
| `course_traininghours` | number | `6` |
| `course_price` | number | `7500` |
| `course_netprice` | null | `null` — **ALWAYS NULL (77/77)** |
| `course_cover_url` | string | `"https://res.cloudinary.com/ddva7xvdt/image/upload/v1780549099/courses/covers/…"` |
| `course_levels` | string | `"2"` (a string, not a number) |
| `course_type_public` | boolean | `true` |
| `course_type_inhouse` | boolean | `true` |
| `course_workshop_status` | boolean | `true` |
| `course_certificate_status` | boolean | `true` |
| `course_promote_status` | boolean | `false` |
| `sort_order` | number | `0` |
| `program` | object | `{ _id, program_id, program_name, programiconurl, sort_order }` |
| `skills` | array[2] | `[{ _id, skill_id, skill_name, … }]` |
| `course_objectives` | array[6] | `"เข้าใจหลักการทำงานของ Microsoft Copilot Studio …"` |
| `course_target_audience` | array[5] | `"ผู้ประกอบการที่ต้องการใช้ AI เพิ่มความสามารถในการแข่งขัน"` |
| `course_prerequisites` | array[2] | `"ไม่จำเป็นต้องมีพื้นฐานการโปรแกรม"` |
| `course_system_requirements` | array[4] | `"License: Microsoft 365"` |
| `training_topics` | array[9] | `{ "title": "Microsoft Copilot Studio คืออะไร …", … }` |
| `course_doc_paths` | array[1] | `"https://www.9experttraining.com/sites/default/files/files/t…"` |
| `course_lab_paths` | array[0] | `[]` — **ALWAYS EMPTY (77/77)** |
| `course_case_study_paths` | array[0] | `[]` — **ALWAYS EMPTY (77/77)** |
| `website_urls` | array[1] | `"https://www.9experttraining.com/copilot-studio-training-cou…"` |
| `exam_links` | array[0] | `[]` (empty here, non-empty on other rows) |
| `previous_course` | null | `null` (populated on some rows) |
| `related_courses` | array[5] | `[{ _id, course_id, course_name, … }]` — **nested full course objects** |
| `course_outline_en` / `course_outline_th` | object | `{ "kind": "link", "url": "/files/course-outline/…" }` |
| `course_roadmap_desktop_url` / `_mobile_url` | string | Cloudinary URLs |
| `createdAt` / `updatedAt` | string | ISO-8601 |
| `__v` | number | `0` |
| `course_doc_paths_en` | (key seen on other rows) | **ALWAYS NULL/EMPTY where present** |

> The list row is byte-equivalent to the detail row — measured 2026-08-06 and recorded at
> [public-courses.js:231-237](../../src/lib/api/public-courses.js#L231-L237); re-confirmed here that
> `course_teaser`, `course_objectives` and `training_topics` are all present and populated on the
> LIST response. **An MCP detail tool therefore needs no per-course fan-out.**

**`/online-course` — one item** (sample: `ONL-AIA-N8N-A`). Every field is prefixed `o_`, so nothing
shares a key name with `/public-course`.

| Field | Type | Example |
|---|---|---|
| `_id` | string | `"6a75b2052a6744ce213799ee"` |
| `o_course_id` | string | `"ONL-AIA-N8N-A"` |
| `o_course_name` | string | `"Build AI Automation and AI Agents with n8n"` |
| `o_course_teaser` | string | `"คอร์สออนไลน์จาก Data-Espresso ที่ออกแบบให้เรียนจบแล้ว…"` |
| `o_number_lessons` | number | `6` |
| `o_course_traininghours` | number | `8` |
| `o_course_price` | number | `3600` |
| `o_course_netprice` | number | `4500` — **note: `price` < `netprice` here; the two are not "list vs discount" in the obvious direction** |
| `o_course_cover_url` | string | Cloudinary URL |
| `o_course_levels` | string | `"2"` |
| `o_course_workshop_status` / `_certificate_status` / `_promote_status` | boolean | `false` / `true` / `false` |
| `o_course_objectives`, `_target_audience`, `_prerequisites`, `_system_requirements`, `_training_topics`, `_doc_paths` | array | `[]` on this row (populated on others) |
| `o_course_lab_paths` | array[0] | **ALWAYS EMPTY (24/24)** |
| `o_course_case_study_paths` | array[0] | **ALWAYS EMPTY (24/24)** |
| `website_urls` | array[1] | `"https://academy.9experttraining.com/courses/build-ai-agents…"` |
| `exam_links` | array[0] | `[]` |
| `sort_order` | number | `0` |
| `previous_course` | null | **ALWAYS NULL (24/24)** |
| `related_courses` | array[0] | **ALWAYS EMPTY (24/24)** |
| `program` | object | `{ _id, program_id, program_name, … }` |
| `skills` | array[1] | `[{ _id, skill_id, skill_name, … }]` |
| `o_course_instructor_name` | string | `"Apipoj Piasak"` |
| `o_course_instructor_image_url` | string | Cloudinary URL |
| `createdAt` / `updatedAt` / `__v` | string / string / number | — |

**`/programs` — one item**

| Field | Type | Example |
|---|---|---|
| `_id` | string | `"68da60bb87a228e4c5f4c2c7"` |
| `program_id` | string | `"DEV"` |
| `program_name` | string | `".NET"` |
| `programiconurl` | string | Cloudinary URL |
| `programcolor` | string | `"#482adf"` |
| `program_teaser` | string | `"การเขียนโปรแกรมเป็นกระบวนการสร้างชุดคำสั่ง…"` |
| `program_roadmap_url` | string | Cloudinary URL |
| `skills` | array[1] | nested skill objects |
| `skillCount` | number | `1` |
| `createdAt` / `updatedAt` | string | ISO-8601 |

No always-null field. 27 programs.

**`/skills` — one item**

| Field | Type | Example |
|---|---|---|
| `_id` | string | `"68d4f556581cb350290597d1"` |
| `skill_id` | string | `"AI"` |
| `skill_name` | string | `"AI"` |
| `skilliconurl` | string | Cloudinary URL |
| `skillcolor` | string | `"#dee6f1"` |
| `skill_teaser` | string | `"ปัญญาประดิษฐ์ (อังกฤษ: artificial intelligence) …"` |
| `skill_roadmap_url` | string | `""` (empty on this row, not on all) |
| `programs` | array[12] | nested program objects |
| `programCount` | number | `12` |
| `createdAt` / `updatedAt` | string | ISO-8601 |

Only **7 skills** total. The whole list is 20 KB and its trimmed form is tiny — a good candidate for
an MCP *resource* or an inlined enum rather than a tool.

**`/schedules` — one item**

| Field | Type | Example |
|---|---|---|
| `_id` | string | `"692ea219d2a522899d55f8e7"` |
| `course` | object \| **null** | `{ _id, course_id, course_name, course_trainingdays, course_price, program, skills, sort_order }` — **null on 12 of 77 default rows and 13 of 85 `status=all` rows** |
| `dates` | array[2] | `["2026-09-23T00:00:00.000Z", …]` — one entry per training day |
| `status` | string | `"open"` \| `"nearly_full"` \| `"full"` |
| `type` | string | `"classroom"` \| `"hybrid"` |
| `signup_url` | string | `"https://www.9experttraining.com/registration/public?class=…"` — **two URL generations coexist** (see below) |
| `createdAt` / `updatedAt` / `__v` | string / string / number | — |

**There is no seat field of any kind.** Not `seats`, not `capacity`, not `remaining`. `status` is the
only liveness signal, and section 2 shows it is unreliable once a round is in the past.

`signup_url` comes in two shapes: a modern `…/registration/public?course=<slug>&class=<ObjectId>` and
a legacy `…/registration/public?class=2612&course=2223&t=hybrid` with **numeric Drupal ids**. An MCP
tool must pass this URL through verbatim and never parse it.

**`/instructors` — one item**

| Field | Type | Example |
|---|---|---|
| `_id` | string | `"6924282a09d846d892721a6a"` |
| `name_th` | string | `"อ.ชไลเวท พิพัฒพรรณวงศ์"` |
| `name_en` | string | `"Chalaivate Pipatpannawong"` |
| `bio` | string | `"อาจารย์ผู้เชี่ยวชาญด้าน Power BI, AI, Data Analytics, SQL Server …"` |
| `programs` | array[10] | nested full program objects |
| `updatedAt` | string | ISO-8601 |

No `createdAt`, no `__v` — a different projection from every other endpoint. 9 instructors.

**`/promotions` — one item**

| Field | Type | Example |
|---|---|---|
| `_id` | string | `"692eb3f38f95317bfcc97b22"` |
| `name` | string | `"9EXPERT Promotion Exclusive สำหรับ Public Class"` |
| `slug` | string | `"yearly-promotion"` |
| `image_url` / `image_alt` | string | Cloudinary URL / alt text |
| `detail_html` | string | `"<style>\n  .9expert-promo-page { … "` — **a full HTML page with inline CSS; this is most of the 33 KB** |
| `detail_plain` | string | `"9EXPERT ต้อนรับปี 2026 ด้วยโปรโมชันสุดพิเศษ …"` |
| `external_url` | string | `"https://www.9experttraining.com/promotions/yearly-promotion"` |
| `tags` | array[1] | `[{ "label": "Public Course", "color": "#22c55e" }]` |
| `related_public_courses` | array[**73**] | **nested full course objects** — the other large share of the payload |
| `related_online_courses` | array[0] | **ALWAYS EMPTY (21/21)** |
| `start_at` / `end_at` | string | ISO-8601 |
| `is_published` | boolean | `true` |
| `is_pinned` | boolean | `true` |
| `status` / `time_status` / `publish_status` | string | `"Active"` / `"Active"` / `"Published"` — **derived, computed against `summary.serverNow`** |
| `source` | (present on some rows only) | — |
| `createdAt` / `updatedAt` / `__v` | — | — |

**There is no `is_active` field.** The nearest equivalents are `is_published` (boolean) and the
derived `publish_status` / `time_status` / `status` strings. See trap **(e)**.

**`/about-us`** — 200, `application/json`, **17,109 bytes**, top-level `{ ok, item }` (a single object,
not a list).
**`/contact-us`** — 200, `application/json`, **3,657 bytes**, top-level `{ ok, summary, items }`.

### 1.2 Query parameters each endpoint actually accepts

The **"genesis sends"** column is from the genesis-lab call sites. The **"MSDB route reads"** column
is from the MSDB source on this machine (`C:/workspace/projects/9exp-msdb`) — included because it is
read from source rather than guessed, but see the ⚠️ warning below it.

| Endpoint | Genesis sends | Call site | MSDB route reads |
|---|---|---|---|
| `/public-course` | `course`, `course_id`, `skill`, `program` | [public-courses.js:83](../../src/lib/api/public-courses.js#L83), [:174](../../src/lib/api/public-courses.js#L174), [:194](../../src/lib/api/public-courses.js#L194) | `course`, `course_id`, `program`, `program_id`, `skill`, `skill_id`, `q`, `limit`, `page` |
| `/online-course` | `program` | [online-courses.js:81](../../src/lib/api/online-courses.js#L81) | `program`, `program_id`, `skill`, `skill_id`, `q`, `limit`, `page` |
| `/schedules` | `date`, `from`, `to`, `courses`, `status`, plus `course` + `limit` on the by-course helper | [schedules.js:107](../../src/lib/api/schedules.js#L107), [:182](../../src/lib/api/schedules.js#L182) | `course`, `courses`, `date`, `from`, `to`, `months` |
| `/promotions` | `includeExpired`, `includeUnpublished`, `includeScheduled`, `withFullCourses` (all as the string `'true'`) | [promotions.js:32-37](../../src/lib/api/promotions.js#L32-L37) | same four + `q`, `tag` |
| `/programs` | none | [programs.js:12](../../src/lib/api/programs.js#L12) | `withCounts`, `withSkills` |
| `/skills` | none | [skills.js](../../src/lib/api/skills.js) | `withPrograms` |
| `/instructors` | none | [instructors.js:13](../../src/lib/api/instructors.js#L13) | `limit`, `program`, `q` |
| `/faqs` | none | [faqs.js:13](../../src/lib/api/faqs.js#L13) | `category`, `q` |
| `/about-us`, `/contact-us` | none | [contact-us.js:18](../../src/lib/api/contact-us.js#L18) | none |

> ⚠️ **The local MSDB clone is STALE and must not be treated as the deployed contract.**
> `9exp-msdb` is on `main`, last commit `9189011`, dated **2026-07-08** — over two months old. Two
> measured divergences prove the deployment has moved on:
>
> 1. The local `/ai/schedules` route hard-codes `filter.status = { $in: ["open","nearly_full"] }` at
>    [`src/app/api/ai/schedules/route.js:99-100`] and **never reads a `status` param at all** — yet
>    the deployed endpoint honours `?status=all` (85 items vs 77, and `summary.filterUsed` drops the
>    `status` clause entirely).
> 2. The local route clamps `from` to today (`cond.$gte = maxDate(utcMidnight(fromStr), today)`) —
>    yet the deployed endpoint returned `filterUsed.dates.$elemMatch.$gte = "2024-01-01T00:00:00.000Z"`
>    unclamped, with 193 already-finished rounds in the body.
>
> Everything measured live is authoritative. Everything read from the local clone is a hint. Trap
> **(i)** below is affected by this.

`aiFetch` drops any param whose value is `undefined`, `null` or `''`
([client.js:45-50](../../src/lib/api/client.js#L45-L50)), so an unset filter is never sent as an
empty string. The comment at [online-courses.js:34](../../src/lib/api/online-courses.js#L34) records
the measured behaviour that **unknown params are ignored** rather than rejected — a filter typo
silently returns the unfiltered list instead of erroring.

### 1.3 genesis-lab corpus (production, `https://www.9experttraining.com`, `x-api-key` = `CORPUS_API_KEY`)

| Endpoint | Status | Content-type | Bytes | Items | Top-level shape |
|---|---:|---|---:|---:|---|
| `/api/corpus/promotions` | 200 | `application/json` | 1,781 | 2 | `{ generated_at, timezone_note, sources, items }` |
| `/api/corpus/masterclass` | 200 | `application/json` | 32,152 | 2 | `{ generated_at, source_note, count, courses }` |

Both answered `x-vercel-cache: MISS` — both routes are `force-dynamic` with
`Cache-Control: no-store` ([promotions/route.js:26-29](../../src/app/api/corpus/promotions/route.js#L26-L29)).

**`/api/corpus/promotions` — one item**

| Field | Type | Example |
|---|---|---|
| `id` | string | `"masterclass:6a33631a749934f3c6c59acf"` — namespaced by source |
| `kind` | string | `"early_bird"` \| `"page"` |
| `source` | string | `"masterclass"` \| `"builder_page"` |
| `title` | string | `"Claude AI for Data Analyst — รุ่นที่ 2"` |
| `url` | string | `"https://www.9experttraining.com/masterclass/mas-claude-ai-for-data-analyst"` |
| `live_from` / `live_until` | string | ISO-8601 UTC |
| `is_live` | boolean | `true` — **already computed server-side against `generated_at`** |
| `price` | object | `{ normal: 12900, special: 9675, currency: "THB", discount_pct: 25 }` |
| `courses` | array[1] | `[{ course_code: "M-CLAUDE-DA", title: … }]` |
| `bundle` | null | **ALWAYS NULL (2/2)** |
| `description` | string | `"เรียนรู้การวิเคราะห์ข้อมูลด้วย Claude AI …"` |
| `image_url` | string | Cloudinary URL |

The envelope also carries `sources: { masterclass: { ok, count }, builder_page: { ok, count }, early_bird_config: { ok, count } }`
— a per-source health block worth surfacing when a source reports `ok: false`.

**`/api/corpus/masterclass` — one course** (top-level key is `courses`, not `items`)

| Field | Type | Example |
|---|---|---|
| `id` | string | `"masterclass:6a3212236f20c8488c24fa65"` |
| `slug` | string | `"mas-claude-ai-for-data-analyst"` |
| `course_code` | string | `"M-CLAUDE-DA"` |
| `title` | string | `"Claude AI for Data Analyst"` |
| `subtitle` | string | `"เรียนรู้การวิเคราะห์ข้อมูลด้วย Claude AI เพื่อสร้าง Insight Report …"` |
| `url` | string | `"https://www.9experttraining.com/masterclass/mas-claude-ai-for-data-analyst"` |
| `outline_pdf_url` | string | `"https://www.9experttraining.com/files/masterclass-outline/…"` |
| `level` | string | `"intermediate"` |
| `duration` | object | `{ days: 1, hours: 7 }` |
| `schedule` | object | `{ days: ["เสาร์"], time: "09:00–17:00" }` — **weekday pattern, not dates** |
| `description` | string | `"ยกระดับทักษะการวิเคราะห์ข้อมูลด้วย Claude AI …"` |
| `objectives` | array[5] | strings |
| `benefits` | array[5] | strings |
| `audience` | array[4] | `["Data / Business Analyst", "Manager & หัวหน้างาน", …]` |
| `prerequisites` | array[5] | strings |
| `system_requirements` | string | `"- ระบบปฏิบัติการ Windows 11 / 10\n- Claude Account (Free) …"` — newline-delimited, not an array |
| `curriculum` | array[2] | `[{ session: "Morning (09.00 – 12.30)", modules: [{ no, title, … }] }]` |
| `instructors` | array[1] | `[{ name, name_en, … }]` |
| `faqs` | array[5] | `[{ question, answer }]` |

No always-null field. ~15,958 bytes per course — **this is the single largest per-item payload in the
whole survey** and the reason the masterclass tool must be paginated or slug-scoped.

---

## 2. The known data traps — verdicts

| | Trap | Verdict |
|---|---|---|
| a | `/schedules` drops `full` rounds without `status=all` | **CONFIRMED** |
| b | Past rounds carry a stale status | **CONFIRMED** |
| c | `GET /schedules/:id` returns 405 | **CONFIRMED** |
| d | `course_id` mixes case; MSDB matches case-sensitively | **CONFIRMED** (count is now 4, not 5) |
| e | MSDB promotions rows / inactive / still in window | **CONFIRMED, with the field renamed** |
| f | `/api/corpus/promotions` has `price.normal` null on every row | **REFUTED** |
| g | `/api/corpus/masterclass` carries no price / round / seat fields | **CONFIRMED** |
| h | MSDB non-`/ai/` paths answer a keyless GET | **CONFIRMED** |
| i | MSDB `PATCH /api/online-courses/[id]` has no auth | **CONFIRMED IN SOURCE — see the caveat** |

### (a) `/schedules` drops `full` rounds unless `status=all` — **CONFIRMED**

```
GET /api/ai/schedules              → 200, 54,806 B, 77 items
   summary.filterUsed = { "status": { "$in": ["open","nearly_full"] },
                          "dates": { "$elemMatch": { "$gte": "2026-09-23T00:00:00.000Z" } } }
   status breakdown: open 75, nearly_full 2, full 0

GET /api/ai/schedules?status=all   → 200, 60,493 B, 85 items
   summary.filterUsed = { "dates": { "$elemMatch": { "$gte": "2026-09-23T00:00:00.000Z" } } }
   status breakdown: open 75, nearly_full 2, full 8
```

**8 rounds — 9.4% of all future rounds — are invisible without the param.** The upstream tells you it
did this: `summary.filterUsed` echoes the exact Mongo filter, so an MCP tool can assert on it rather
than trust the default.

genesis-lab already has the two constants to send:
`PUBLIC_SCHEDULE_STATUSES = 'open,nearly_full,full'` and `ADMIN_SCHEDULE_STATUSES = 'all'` at
[schedules.js:79-80](../../src/lib/api/schedules.js#L79-L80). The comment above them
([schedules.js:53-78](../../src/lib/api/schedules.js#L53-L78)) argues for spelling out the three
statuses rather than sending `all`, so a status MSDB adds tomorrow does not leak onto a public
surface. **The MCP server should use `PUBLIC_SCHEDULE_STATUSES` for the same reason.**

### (b) Past rounds carry a stale status — **CONFIRMED**

Past rounds are not reachable through the default filter (`dates.$elemMatch.$gte = today` excludes
any round whose last day has passed), so this trap only bites a tool that accepts a **user-supplied
date range**. One request proves it:

```
GET /api/ai/schedules?status=all&from=2024-01-01   → 200, 204,353 B, 278 items
   summary.filterUsed = { "dates": { "$elemMatch": { "$gte": "2024-01-01T00:00:00.000Z" } } }
```

Of those 278 rows, with "past" = `max(dates) < 2026-09-23`:

| Bucket | Count | `open` | `nearly_full` | `full` |
|---|---:|---:|---:|---:|
| **Past** (last day already gone) | **193** | **41** | **3** | **149** |
| In progress (started, not finished) | 0 | 0 | 0 | 0 |
| Future | 85 | 75 | 2 | 8 |

Newest past rounds, all still carrying a live-looking status:

```
full | last day 2026-09-22 | COPILOT-DEV
full | last day 2026-09-22 | COPILOT-STU-ADV
full | last day 2026-09-22 | MSE-L4
full | last day 2026-09-22 | PP-AI
full | last day 2026-09-18 | (course: null)
full | last day 2026-09-18 | DEV-VS-04
```

**44 finished rounds are still marked `open` or `nearly_full`.** Nothing upstream ever transitions a
round to a terminal state. `status` is an editorial field, not a lifecycle field.

Two consequences for the MCP tools:
1. **Liveness is judged from `dates`, never from `status`.** This is the same rule genesis-lab
   already enforces in its own JS at [schedules.js:15-52](../../src/lib/api/schedules.js#L15-L52) and
   `excludeStartedRounds` in [src/lib/schedule/roundHasStarted.js](../../src/lib/schedule/roundHasStarted.js).
2. **`status` must not be rendered as availability.** `full` on a finished round means nothing.

Also surfaced here: **12 of 77 default rows and 13 of 85 `status=all` rows have `course: null`** — the
populate found no course document. Those rounds cannot be attributed to a course and must be dropped,
not rendered with a blank course name.

### (c) `GET /schedules/:id` returns 405 — **CONFIRMED**

```
GET https://9exp-sec.com/api/ai/schedules/692ea219d2a522899d55f8e7
  → 405, no content-type, 0 bytes
```

The local MSDB source agrees for once: `src/app/api/ai/schedules/[id]/route.js` exports only `PUT`
(line 38) and `DELETE` (line 88) — no `GET`. Same shape at `src/app/api/ai/public-course/[id]/route.js`
(`PUT` line 27, `DELETE` line 73, plus `OPTIONS`). **There is no by-id read anywhere under `/ai/`.**
Every single-item read is a list call with a filter param.

### (d) `course_id` mixes case and MSDB matches case-sensitively — **CONFIRMED**

Of 77 `course_id` values, **4 are not all-uppercase**:

```
SQL-PG-Query, SQL-ADM-Tuning, MS-SQL-19-Prov, SQL-ADM-Secure
```

(The comment at [public-courses.js:213-218](../../src/lib/api/public-courses.js#L213-L218) records 5
as of 2026-08-06, naming `Power-Apps` as the fifth. `Power-Apps` is now uppercase — **the set drifts,
which is exactly the argument that comment makes for keeping the resolver permanent.**)

The case-sensitivity, measured with two requests against the same course:

```
GET /api/ai/public-course?course_id=SQL-PG-Query   → 200, 10,966 B, total 1, items[0].course_id "SQL-PG-Query"
GET /api/ai/public-course?course_id=SQL-PG-QUERY   → 200,     53 B, total 0, items []
```

A miss is **200 with an empty list**, not a 404 — so a naive tool reports "no such course" rather than
failing loudly.

**genesis-lab already has the resolver and the MCP server must reuse it:**
`getCourseByCodeInsensitive` at
[src/lib/api/public-courses.js:251](../../src/lib/api/public-courses.js#L251). It tries the direct
`?course_id=` fetch first (so the 73 uppercase courses pay nothing extra), and only on a miss falls
back to one `listPublicCourses()` + one re-fetch by the exact stored casing. It takes an
`includeHidden` option so an admin preview path and the public path agree about what exists. Do not
write a second one.

### (e) MSDB promotions — rows, inactive, still in window — **CONFIRMED, with the field renamed**

**There is no `is_active` field on an MSDB promotion.** The union of keys across all 21 rows is:
`_id, name, image_url, detail_html, detail_plain, related_public_courses, related_online_courses,
start_at, end_at, is_published, is_pinned, source, tags, createdAt, updatedAt, __v, external_url,
image_alt, slug, status, time_status, publish_status`.

The boolean is `is_published`; `status` / `time_status` / `publish_status` are derived strings MSDB
computes against `summary.serverNow`.

```
GET /api/ai/promotions?includeExpired=true&includeUnpublished=true&includeScheduled=true
  → 200, 688,188 B, 21 items, serverNow 2026-09-23T15:14:57.505Z
```

| Measure | Count |
|---|---:|
| Total promotion rows | **21** |
| `is_published: false` | **12** |
| …of those, **still inside `start_at`–`end_at`** | **10** |
| Rows the default (unflagged) call returns | **1** |
| Rows inside their date window, any publish state | 11 |

Breakdown by the derived triple:

| `status` / `time_status` / `publish_status` | Count |
|---|---:|
| `Expired` / `Expired` / `Published` | 8 |
| `Active` / `Active` / `Published` | **1** |
| `Unpublished` / `Active` / `Unpublished` | **10** |
| `Unpublished` / `Expired` / `Unpublished` | 2 |

All 10 "unpublished but date-live" rows are career-path promotions
(`data-analyst-career-path`, `prompt-engineer-career-path`, `web-developer-career-path`, …). **A tool
that judged liveness from the date window alone would announce ten promotions that 9Expert has
deliberately taken down.** Publish state and date window are both required, and MSDB's own default
call (1 row) already applies both correctly.

This is why the proposed promotions tool reads `/api/corpus/promotions` instead — genesis has already
made these judgements and returns a computed `is_live`.

### (f) `/api/corpus/promotions` — `price.normal` null on every row? — **REFUTED**

```
items: 2
  masterclass:6a33631a749934f3c6c59acf   kind=early_bird  is_live=true
    price = { normal: 12900, special: 9675, currency: "THB", discount_pct: 25 }
  builder_page:6a9a9363040c4dc7a5eb0879  kind=page        is_live=true
    price = { normal: null, special: null, currency: "THB", discount_pct: null }

price.normal null on EVERY row? → false     values: [12900, null]
```

The accurate statement is narrower and more useful: **`price` is fully null exactly on rows whose
`kind` is `page`** (a promotions landing page, which has no single price to quote), and fully
populated on `kind: "early_bird"` rows. The `currency` key is `"THB"` on both.

An MCP tool must branch on `kind` rather than assume prices exist — and must not present a `page` row
as a priced offer.

### (g) `/api/corpus/masterclass` carries no price / round / seat fields — **CONFIRMED**

A case-insensitive scan of the entire serialised `courses` array for `price`, `seat`, `batch`,
`round`, `venue`, `deadline`, `capacity` returns **false for all seven**. The endpoint says so itself
in its own envelope:

> `source_note`: *"course content only; prices, batch dates, early-bird deadlines, venues and seats
> are served live by /api/corpus/promotions and are deliberately absent here"*

The only schedule-shaped field is `schedule: { days: ["เสาร์"], time: "09:00–17:00" }` — a **weekday
pattern, not a dated round**. It must never be presented as "the next class is on…".

### (h) MSDB non-`/ai/` paths answer a keyless GET — **CONFIRMED**

Both requests sent **no `x-api-key` header at all**:

```
GET https://9exp-sec.com/api/public-courses   → 200, application/json, 516,006 B, total 77
GET https://9exp-sec.com/api/online-courses   → 200, application/json, 175,096 B, total 24
```

Status only, as asked. Note the byte counts differ from the `/ai/` equivalents (516,006 vs 915,078;
175,096 vs 180,569) and the default `limit` differs (50 and 30, vs 200 and 50) — so these are a
different projection, not an unauthenticated alias.

The local MSDB source corroborates: `src/app/api/public-courses/route.js` and
`src/app/api/online-courses/route.js` import only `withCors` and `withRateLimit` — **no
`checkAiApiKey`, no key comparison of any kind**. By contrast `src/app/api/ai/schedules/route.js:68`
opens with `const authError = checkAiApiKey(req); if (authError) return authError;`.

**Consequence for this round's design:** the whole public course catalogue is already world-readable
without a key. The `MCP_API_KEY` on our server is therefore a **rate-limiting and revocation** control
over *our* Vercel function invocations, not a confidentiality control over MSDB course data. It should
still exist, and it should still fail closed — but nobody should argue for a weaker design on the
grounds that "the data is secret anyway", because it is not.

### (i) MSDB `PATCH /api/online-courses/[id]` has no auth — **CONFIRMED IN SOURCE, NOT VERIFIED AGAINST THE DEPLOYMENT**

**No request was sent.** Confirmed by reading the route file only:

`C:/workspace/projects/9exp-msdb/src/app/api/online-courses/[id]/route.js`

```
line  5   import { withCors } from "@/lib/cors";
line 18   export const GET = withCors(async (req, { params }) => {
line 41   export const PATCH = withCors(async (req, { params }) => {
line 45     const body = await req.json();
line 65     const updated = await OnlineCourse.findByIdAndUpdate(id, payload, { new: true });
```

`PATCH` at **line 41** is wrapped in `withCors` and nothing else. There is no `checkAiApiKey`, no
session check, no rate limiter (the collection route at least imports `withRateLimit`; this one does
not), and the body goes to `findByIdAndUpdate` largely as sent. The file contains no occurrence of
`checkAiApiKey`, `x-api-key` or `apiKey`.

⚠️ **The caveat matters.** As established in §1.2, this clone is from 2026-07-08 and is demonstrably
behind the deployment on at least two counts. So the honest verdict is: *the last version of this
route anyone on this machine has a copy of had no auth on PATCH.* Whether the deployed one still does
cannot be settled without a write, and a write is out of the question — dev and production share one
MongoDB, so any PATCH here is a production PATCH.

**This is an open item for him, not for us** (see open questions). It is also the strongest argument
in the survey for the MCP server being **strictly read-only with no write tool of any kind**: the
upstream it fronts may have an unauthenticated write surface, and an MCP tool that could reach it
would hand that surface to a language model.

---

## 3. MCP SDK fit for this app

### 3.1 The two candidate packages, as they stand today

| | `@modelcontextprotocol/sdk` | `mcp-handler` (Vercel) |
|---|---|---|
| Latest | **1.30.0** | **2.2.0** |
| Repo | `github.com/modelcontextprotocol/typescript-sdk` | `github.com/vercel/mcp-handler` (Apache-2.0, published by `vercel-release-bot`) |
| Peer deps | `zod: ^3.25 \|\| ^4.0`, `@cfworker/json-schema: ^4.1.1` | `next: >=13.0.0`, **`@modelcontextprotocol/server: ^2.0.0`** |
| Runtime deps | ajv, zod, cors, hono, jose, express, raw-body, eventsource, pkce-challenge, zod-to-json-schema, … (17 packages) | chalk, commander (2 packages) |
| Node engine | `>=18` | — (but its SDK peer requires `>=20`) |
| Redis | not applicable | **`redis` was a hard dependency in 1.x; removed in 2.x** |

There is a third package in this graph that the brief did not name and that changes the decision:
**`@modelcontextprotocol/server@2.0.0`** — the MCP SDK's *v2* server package, a different npm name
from `@modelcontextprotocol/sdk`. It depends on `zod: ^4.2.0` and `@modelcontextprotocol/core@2.0.0`,
and declares `engines.node: ">=20"`.

`mcp-handler`'s own README is explicit:

> `npm install mcp-handler@^2 @modelcontextprotocol/server@^2 zod@^4`
>
> **Note**: `mcp-handler` 2.x requires the MCP SDK v2 packages (`@modelcontextprotocol/server` ^2.0.0),
> zod ^4.2.0, and Node.js 20+. If you're on `@modelcontextprotocol/sdk` 1.x, use `mcp-handler` 1.x.

### 3.2 Recommendation

**Use `mcp-handler@^2` + `@modelcontextprotocol/server@^2`, and upgrade zod to v4 in the same PR** —
*if* he accepts a zod major bump on this repo. Otherwise `mcp-handler@1.1.0` + `@modelcontextprotocol/sdk@1.26.0`.

Why `mcp-handler` over the raw SDK either way:

- The raw SDK ships `express`, `hono` and `@hono/node-server` as **runtime dependencies**, not
  optional peers. Installing it pulls two HTTP servers into a Next app that already has one. It is
  built to *be* a server; we need to *mount* a handler.
- `mcp-handler` returns a Web-standard `(Request) => Promise<Response>`, which is precisely the App
  Router route-handler signature. The Next.js quick start in its README is four lines of wiring:
  ```ts
  // app/api/mcp/route.ts
  const handler = createMcpHandler((server) => { server.registerTool(…) });
  export { handler as GET, handler as POST };
  ```
- Its adapter surface is 2 dependencies (chalk, commander) against the SDK's 17.
- It handles both protocol generations from one mount: the 2026-07-28 spec natively, and 2025-era
  Streamable HTTP via the SDK's stateless legacy fallback. That matters because `mcp-remote` and
  Claude Desktop will not both move on the same day.

Why v2 rather than v1, if the zod bump is acceptable: **v1 carries `redis@^4.6.0` as a hard runtime
dependency on every one of its 9 published versions**, and 2.x removed it outright. Shipping v1 means
shipping a Redis client into the bundle for a stateless server that will never call it.

### 3.3 App Router route handler on the Node runtime at Next 15.5.15

**Yes.** Measured from this clone:

```
next installed: 15.5.15        react: 18.3.1        zod installed: 3.25.76
package.json engines: { "node": ">=20.0.0" }
```

`mcp-handler`'s peer range is `next: >=13.0.0`, satisfied by 15.5.15. Its README lists "Next.js Route
Handlers" first among supported mounts, and the Node 20+ floor is already this repo's declared engine.
genesis-lab pins `runtime = 'nodejs'` explicitly on the corpus routes
([promotions/route.js:26](../../src/app/api/corpus/promotions/route.js#L26)) and the MCP route should
do the same. React 18.3.1 is irrelevant here — a route handler renders nothing.

`/api/mcp` is free: the existing `src/app/api/` children are `admin, auth, chat, corpus, cron, health,
masterclass, notifications, registration, search, webhooks`.

### 3.4 zod — v3/v4 conflict

| | Version |
|---|---|
| Installed in genesis-lab | **3.25.76** (`package.json` declares `^3.23.8`) |
| `@modelcontextprotocol/sdk@1.30.0` accepts | `^3.25 \|\| ^4.0` — **3.25.76 satisfies this** |
| `@modelcontextprotocol/server@2.0.0` requires | `^4.2.0` — **3.25.76 does NOT satisfy this** |
| `mcp-handler@^2` requires | `zod@^4` |

So:

- **v1 path — no conflict at all.** `@modelcontextprotocol/sdk@1.30.0` (or `1.26.0`, which
  `mcp-handler@1.1.0` pins exactly) works against the installed 3.25.76 untouched. `1.25.x`/`1.26.0`
  pins are *exact* (`"@modelcontextprotocol/sdk": "1.26.0"`, not a caret), so npm will want that one
  version.
- **v2 path — a real major bump.** zod 4 is a separate install across the whole repo. zod is used
  well beyond this feature in genesis-lab (`@hookform/resolvers` + `react-hook-form` form schemas,
  server-action validation), so this is not a contained change. **zod 4 does ship a `zod/v3` compat
  entry point**, which makes an incremental migration possible, but that is a build round decision
  with its own test sweep — not something to smuggle in under an MCP PR.

**This is the one genuine fork in the road and it needs his ruling** (open question 1).

### 3.5 Stateless over Streamable HTTP with no Redis / KV

**Plainly: no mode we would use needs Redis.**

`mcp-handler` 2.x, from its own README:

> - **2026-07-28** (current): served natively — **stateless, no sessions**, per-request `_meta`
>   envelope, `server/discover`.
> - **2025-era Streamable HTTP**: served via the SDK's **stateless legacy fallback** from the same
>   handler. GET/DELETE session operations answer `405` (serving is stateless).
> - **HTTP+SSE transport (2024-11-05)**: removed in 2.x. **Redis is no longer needed or used.**
> - Migration: *"Install `@modelcontextprotocol/server` (v2) and `zod@^4`; remove
>   `@modelcontextprotocol/sdk` and `redis`."*
> - Removed 1.x options: `basePath`, `streamableHttpEndpoint`, `sseEndpoint`, `sseMessageEndpoint`,
>   `disableSse`, **`redisUrl`**, `maxDuration`, `sessionIdGenerator`.

On the **v1** path Redis is installed as a dependency but is only *reached* by the SSE transport. A
v1 deployment that mounts only the Streamable HTTP handler and never sets `redisUrl` does not connect
to Redis — but the dependency ships either way, and `redisUrl` remains an option someone could later
set by accident. That asymmetry is a second point in v2's favour.

Every tool we are proposing is a pure read with no cross-request state. There is nothing to persist
between calls even if a session existed.

### 3.6 What in this app would intercept or alter a request to `/api/mcp`

| Layer | Would it touch `/api/mcp`? | Evidence |
|---|---|---|
| **Edge middleware** | **No.** | [src/middleware.js:137-139](../../src/middleware.js#L137-L139) — `export const config = { matcher: ['/admin/:path*'] }`. The middleware does not even run for `/api/*`. Its internal `isMasterclassRoute` helper allows `/api/` unconditionally ([middleware.js:76](../../src/middleware.js#L76)), but that branch is unreachable for our path given the matcher. |
| **Auth guards** | **No.** | The only guard is that middleware plus per-route checks. Our route owns its own `MCP_API_KEY` check; nothing upstream of it authenticates. |
| **`redirects()`** | **No.** | [next.config.mjs:83](../../next.config.mjs#L83). The rules are the masterclass-host move (env-gated, matches on `Host: masterclass.9experttraining.com` only) and legacy Drupal path rules. None has an `/api` source. |
| **`rewrites()`** | **No.** | [next.config.mjs:247](../../next.config.mjs#L247). Every rule is scoped to the legacy asset roots (`sites/`, `styles/`, `_img/…`) and forwards to Cloudinary. None has an `/api` source. |
| **Redirect Panel (DB rules)** | **No.** | Panel rules are resolved by `notFoundOrRedirect` in [src/lib/redirects/notFoundBoundary.js](../../src/lib/redirects/notFoundBoundary.js), called from exactly one place: [src/app/(public)/[...slug]/page.jsx:4](../../src/app/\(public\)/[...slug]/page.jsx#L4). It is a **page** catch-all inside the `(public)` route group; a route handler at `/api/mcp` matches first and the catch-all never runs. |
| **404 logger** | **No.** | `recordStaticNotFound` is imported at exactly two call sites — [articles/[slug]/page.jsx:99](../../src/app/\(public\)/articles/[slug]/page.jsx#L99) and [masterclass/[slug]/page.jsx:88](../../src/app/\(public\)/masterclass/[slug]/page.jsx#L88) — both page routes. An `/api/mcp` 404 or 401 is never logged there. |
| **CSP / security headers** | **Yes — headers are added, but nothing is blocked.** | [next.config.mjs:579-582](../../next.config.mjs#L579-L582) — `{ source: '/:path*', headers: securityHeaders }` matches every path including `/api/mcp`. It adds `Content-Security-Policy-**Report-Only**`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`. **None of these affects a non-browser MCP client**: CSP governs a document's own subresource loads, and an MCP client is not a browsing context. It is Report-Only in any case. `nosniff` is fine — we send a correct `application/json` (or `text/event-stream`). |
| **Cache-Control header rules** | **No.** | The `no-store` document rule ([next.config.mjs:601](../../next.config.mjs#L601)) is keyed on a file-extension list; the ranged-request rule is scoped to `LEGACY_ROOTS`. `/api/mcp` matches neither, so it must set its own `Cache-Control: no-store` the way the corpus routes do. |
| **`vercel.json`** | **No.** | It contains only `crons` — six sync jobs, none touching `/api/mcp`. Adding an MCP route does not need a `vercel.json` change unless we want a `maxDuration` override. |

**Nothing intercepts the route.** The only work to do is inside the handler.

---

## 4. Claude Desktop connection path

**Confirmed: `mcp-remote` is the path, because Claude Desktop's built-in remote-connector UI
authenticates with OAuth and offers no field for a custom header.** A server that authenticates on
`x-api-key` must therefore be reached through the stdio bridge.

`npm view mcp-remote` → **version `0.14.3`** ("Remote proxy for Model Context Protocol, allowing
local-only clients to connect to remote servers using oAuth"). Its README documents `--header`:

> To bypass authentication, or to emit custom headers on all requests to your remote server, pass
> `--header` CLI arguments.

### 4.1 Config snippet — `claude_desktop_config.json`

Windows path: `%APPDATA%\Claude\claude_desktop_config.json`
macOS path: `~/Library/Application Support/Claude/claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "9expert": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://www.9experttraining.com/api/mcp",
        "--header",
        "x-api-key:${MCP_API_KEY}"
      ],
      "env": {
        "MCP_API_KEY": "<paste the key here — this file is plaintext on disk>"
      }
    }
  }
}
```

### 4.2 The Windows quoting issue — real, and documented upstream

From the `mcp-remote` README, verbatim:

> **Note:** Cursor, Codex-Cli and **Claude Desktop (Windows) have a bug where spaces inside `args`
> aren't escaped when it invokes `npx`**, which ends up mangling these values. You can work around it
> using:
> ```jsonc
> "args": [ …, "--header", "Authorization:${AUTH_HEADER}" ]  // note no spaces around ':'
> "env":  { "AUTH_HEADER": "Bearer <auth-token>" }           // spaces OK in env vars
> ```

So on Windows:

- **Write `"x-api-key:${MCP_API_KEY}"` with no space after the colon.** `"x-api-key: ${MCP_API_KEY}"`
  will be mangled.
- Put the value in `env`, not inline in `args`. Values inside `env` may contain spaces safely.
- This is the reason to prefer a key with **no spaces and no shell-special characters**. A
  base64 key from `openssl rand -base64 32` can contain `+` and `/` — both are fine here, but
  `openssl rand -hex 32` avoids the question entirely. Recommend hex.

### 4.3 The better option for a shared key — `--header-file`

The README documents an alternative worth raising with him, because it fixes a real problem with the
snippet above:

> To keep a credential out of the process arguments — where **any other user on the machine can read
> it from the process list** — put the headers in a file instead and pass `--header-file`. One
> `Name: value` per line; `#` starts a comment. […] A file that cannot be read is an error rather
> than a warning, so a mistyped path fails immediately instead of sending the request
> unauthenticated.

```jsonc
"args": ["-y", "mcp-remote", "https://www.9experttraining.com/api/mcp",
         "--header-file", "C:\\Users\\<user>\\.9expert\\mcp-headers.txt"]
```

```
# C:\Users\<user>\.9expert\mcp-headers.txt
x-api-key: <the key>
```

Spaces after the colon are fine in the file — the args-quoting bug does not apply. If the key is ever
given to more than one person, this is the shape to hand out.

---

## 5. Proposed tool set — not implemented

Four tools, matching the starting draft, with **two changes**: `list_training_rounds` and
`search_courses` absorb the date/status traps rather than exposing them, and `list_live_promotions`
reads **only** `/api/corpus/promotions`, never MSDB `/promotions`.

Shared normalisation, applied in code by every tool:

- **`course_id` resolution** — always through the existing
  [`getCourseByCodeInsensitive`](../../src/lib/api/public-courses.js#L251). Never a new resolver,
  never an uppercase/lowercase normalisation step.
- **Round liveness** — always computed from `dates`, never read from `status`.
- **Always send `PUBLIC_SCHEDULE_STATUSES`** ([schedules.js:79](../../src/lib/api/schedules.js#L79))
  to `/schedules`, never the bare default and never `all`.
- **Drop `course: null` rounds** before serialising.
- **Never emit a seat number.** No field carries one; any number would be invented.

### Tool 1 — `search_courses`

**`description`** (exactly as the model sees it):

> Search the 9Expert training catalogue by keyword and optionally filter by program or skill. Covers
> both classroom/public courses and self-paced online courses. Returns a short card per course:
> course id, name, one-line teaser, list price in THB, training days, program, skills, and the public
> URL — not the full syllabus. To read a course's objectives, prerequisites or topic outline, call
> get_course_detail with the course_id from these results. Prices are the standard list price in Thai
> baht and exclude VAT and any active promotion; to find out whether a course is discounted right
> now, call list_live_promotions. This tool does not know about training dates or availability — call
> list_training_rounds for those. Results are capped; if the cap is reached, narrow the query rather
> than paging blindly.

**Input schema**

```js
{
  query:   z.string().trim().min(2).max(100).optional()
             .describe('keyword; matched against course name, id and teaser'),
  program: z.string().trim().max(40).optional()
             .describe('program_id, e.g. "POWER-BI". Call list_taxonomy for valid values.'),
  skill:   z.string().trim().max(40).optional()
             .describe('skill_id, e.g. "AI". Only 7 exist.'),
  type:    z.enum(['public', 'online', 'both']).default('both'),
  limit:   z.number().int().min(1).max(30).default(10),
}
```

At least one of `query` / `program` / `skill` must be present — an empty search would return the whole
77-course catalogue.

**Upstream calls** — `listPublicCourses({ skill, program })`
([public-courses.js:82](../../src/lib/api/public-courses.js#L82)) and/or
`listOnlineCourses({ program })` ([online-courses.js:80](../../src/lib/api/online-courses.js#L80)).
Keyword matching happens **in our process**, not upstream: reuse
[`src/lib/search/matchSearch.js`](../../src/lib/search/matchSearch.js) — `normalizeSearchTerm`,
`courseHaystack`, `onlineCourseHaystack` are already written, already tested, and already handle
Thai/English mixed terms. `/api/search`'s corpus builder
([src/lib/search/searchCorpus.js](../../src/lib/search/searchCorpus.js)) is a second reuse candidate,
but it also pulls every article body into memory; for MCP, the two haystack helpers over the two
course lists are the right slice.

**Normalisation** — the two feeds have disjoint key prefixes (`course_*` vs `o_course_*`), so the tool
projects both into one flat card shape with a `type: "public" | "online"` discriminator. Note
`o_course_price` (3600) < `o_course_netprice` (4500) on the sample row — **do not assume `netprice` is
the discounted one**; open question 4.

**Output shape** — keep `course_id`, `course_name`, `course_teaser`, `course_price`,
`course_trainingdays`, `program_name`, `skill_names[]`, `url`, `type`. Drop `_id`, `__v`, `createdAt`,
`updatedAt`, `sort_order`, all Cloudinary URLs, `related_courses`, `training_topics`,
`course_objectives`, `course_doc_paths`, `course_outline_*`, `course_roadmap_*`, and the four
always-empty fields.

**Size** — measured: **478 bytes per card**, so `limit: 10` ≈ **4.8 KB**, `limit: 30` ≈ **14 KB**.
All 77 cards would be 36.8 KB, which is why the cap is 30. ✅ under 20 KB at every allowed limit.

**Caching** — `listPublicCourses` is `aiFetch` with `revalidate: 3600` + tag `public-courses`;
`listOnlineCourses` the same with tag `online-courses`
([client.js:38](../../src/lib/api/client.js#L38)). Both tags are already busted by the MSDB webhook
([src/lib/api/bustUpstream.js](../../src/lib/api/bustUpstream.js)), and both cache entries are
**shared with the public site** — the Data Cache key is url+options, so an MCP call usually costs zero
upstream requests. Vercel cost: **1 function invocation per tool call**, no extra Fast Origin Transfer
beyond the response body.

### Tool 2 — `get_course_detail`

**`description`**:

> Return the full published detail of one 9Expert course: name, teaser, price, duration, level,
> learning objectives, target audience, prerequisites, system requirements, and the topic outline.
> Accepts the course_id exactly as shown by search_courses. Course ids are matched
> case-insensitively by this tool, so "sql-pg-query" and "SQL-PG-Query" both resolve; the id reported
> back is the canonical one. The price is the standard list price in Thai baht and excludes VAT and
> any active promotion — for current discounts call list_live_promotions. This tool returns no
> training dates and no seat availability; call list_training_rounds for scheduled dates. If no
> course matches, say so plainly rather than guessing at a similar course.

**Input schema**

```js
{
  course_id: z.string().trim().min(2).max(60)
               .describe('course id, e.g. "POWER-BI-ADV". Case-insensitive.'),
  include_outline: z.boolean().default(true)
               .describe('include the full training topic outline; set false for a compact answer'),
}
```

**Upstream calls** — `getCourseByCodeInsensitive(course_id)`
([public-courses.js:251](../../src/lib/api/public-courses.js#L251)). One `?course_id=` fetch on the
happy path; a miss costs one extra list read plus a re-fetch, and only the 4 mixed-case courses take
that path. **Trap (d) is handled in code, not in the description** — the description only promises the
behaviour. If the public tool should also see hidden courses, pass `includeHidden`; default is `false`
and that is correct for MCP.

**Normalisation** — the list row is byte-equivalent to the detail row, so no fan-out is needed. The
tool must still resolve through the helper rather than reading from a cached list, so the canonical
casing comes back.

**Output shape** — keep `course_id`, `course_name`, `course_teaser`, `course_price`,
`course_trainingdays`, `course_traininghours`, `course_levels`, `course_type_public`,
`course_type_inhouse`, `course_certificate_status`, `course_objectives[]`, `course_target_audience[]`,
`course_prerequisites[]`, `course_system_requirements[]`, `training_topics[]` (when
`include_outline`), `program_name`, `skill_names[]`, `url`. Drop `_id`, `__v`, `createdAt`,
`updatedAt`, `sort_order`, `course_netprice` (always null), `course_lab_paths` /
`course_case_study_paths` (always empty), every Cloudinary URL, and **`related_courses` — which alone
is several KB of nested full course objects**. If related courses are wanted, emit their `course_id`s
only.

**Size** — measured on the trimmed shape across all 77 courses: **median 6.9 KB, max 14.9 KB**.
⚠️ **The largest course is 14.9 KB in one call** — under 20 KB but not by much, and almost all of it is
`training_topics`. `include_outline: false` drops it to roughly 1.5–2 KB. Flagging rather than
capping, because a syllabus is the point of the tool.

**Caching** — `aiFetch` `revalidate: 3600`, tag `course:<id>` (plus `public-courses` on the fallback
path), busted by the MSDB course webhook. 1 invocation per call.

### Tool 3 — `list_training_rounds`

**`description`**:

> List scheduled classroom and hybrid training rounds for 9Expert courses, optionally filtered by
> course and by date range. Each round returns its course, its training dates, its delivery type
> (classroom or hybrid) and its official sign-up URL. Only rounds that have not yet finished are
> returned. Do not describe a round as available, nearly full or sold out: the upstream status field
> is editorial and is not maintained after a round ends, so it does not indicate real availability,
> and 9Expert publishes no seat counts at all — never state or estimate how many seats remain. To
> register or check availability, direct the user to the round's sign_up_url. Rounds whose course
> record is missing upstream are omitted. Dates are training days in Asia/Bangkok, listed
> individually rather than as a start and end.

**Input schema**

```js
{
  course_id: z.string().trim().max(60).optional()
               .describe('restrict to one course; case-insensitive'),
  from:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
               .describe('earliest training day, YYYY-MM-DD. Defaults to today (Asia/Bangkok). Past dates are ignored.'),
  to:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
               .describe('latest training day, YYYY-MM-DD'),
  limit:     z.number().int().min(1).max(40).default(20),
}
```

**Traps handled where:**

| Trap | Handled |
|---|---|
| (a) `full` rounds hidden by default | **in code** — always send `PUBLIC_SCHEDULE_STATUSES` |
| (b) stale status on past rounds | **in code** (clamp `from` to today, filter by `dates`) **and in the description** (the "do not describe a round as available…" sentence) |
| no seat field exists | **in the description** — "never state or estimate how many seats remain" |
| (d) mixed-case `course_id` | **in code** — resolve to `_id` before sending `courses=` |
| `course: null` rows | **in code** — dropped; **and in the description** so the model does not conclude the catalogue is incomplete |
| (c) no by-id read | **in code** — the tool never takes a round id |

**Upstream calls** — `listSchedules({ from, to, courses, status: PUBLIC_SCHEDULE_STATUSES })`
([schedules.js:99](../../src/lib/api/schedules.js#L99)), or `listSchedulesByCourse` when a
`course_id` is given ([schedules.js:180](../../src/lib/api/schedules.js#L180)). With a `course_id`,
resolve it first through `getCourseByCodeInsensitive` — `/schedules` filters on the course
**ObjectId**, not the code (`resolveCourseObjectIds` in
[src/lib/api/resolveIds.js](../../src/lib/api/resolveIds.js) is the existing helper for the
code→ObjectId leg).

**Normalisation** — clamp `from` to today (never trust the upstream to do it: §1.2 shows the deployed
route does not); drop any round whose last date is past; drop `course: null` rows; truncate each date
to `YYYY-MM-DD`; pass `signup_url` through **verbatim** (two URL generations coexist — see §1.1).
`excludeStartedRounds` ([src/lib/schedule/roundHasStarted.js](../../src/lib/schedule/roundHasStarted.js))
is the existing helper for "already begun"; whether MCP should use it is open question 3.

**Output shape** — keep `course_id`, `course_name`, `dates[]` (as `YYYY-MM-DD`), `type`,
`sign_up_url`. **Explicitly drop `status`** — not trimmed for size, but because a `full` on a
finished round is actively misleading and a model given the field will quote it. Also drop `_id`,
`createdAt`, `updatedAt`, `__v`, and the whole nested `course` object beyond its id and name.

**Size** — measured: **256 bytes per round**, so `limit: 20` ≈ **5.1 KB**, `limit: 40` ≈ **10 KB**.
All 85 future rounds would be 21.8 KB — just over the line, which is why the cap is 40.
✅ under 20 KB at every allowed limit.

**Caching** — `aiFetch` `revalidate: 1800` (30 min) + tag `schedules`
([schedules.js:103](../../src/lib/api/schedules.js#L103)). The **per-request JS filter re-runs on every
call even on a cache hit** ([schedules.js:48-51](../../src/lib/api/schedules.js#L48-L51)), so a round
that finishes overnight disappears immediately rather than waiting out the fetch cache. Shared cache
entry with the public `/schedule` page. 1 invocation per call.

### Tool 4 — `list_live_promotions`

**`description`**:

> List the 9Expert promotions and special offers that are live right now. Each entry gives its title,
> the public page URL, the date it stops being valid, and — where the offer has a single price — the
> normal price, the special price, the currency and the discount percentage. Entries whose kind is
> "page" are promotional landing pages that cover several offers and carry no single price; present
> those as a page to visit, never as a priced offer, and never infer a price for them. Liveness is
> already decided by the source, which excludes promotions that have expired, have not started, or
> have been unpublished — treat every entry returned as currently valid and do not return entries
> that are not listed here. Prices are in Thai baht. Always quote the deadline alongside a discount,
> and direct the user to the entry's url to claim it.

**Input schema**

```js
{
  kind: z.enum(['early_bird', 'page', 'all']).default('all')
          .describe('narrow to priced early-bird offers or to landing pages'),
}
```

No `limit` — the endpoint returned 2 items and 1,781 bytes in full.

**Upstream calls** — **`GET https://www.9experttraining.com/api/corpus/promotions` only**, with
`x-api-key: CORPUS_API_KEY`.

**Why not MSDB `/promotions`** — this is the load-bearing design decision of the tool, and trap (e)
is the evidence. MSDB's promotions feed has 21 rows, 12 unpublished, **10 of them unpublished but
still inside their date window**, and no `is_active` field — so any liveness rule written against it
would either announce ten deliberately-withdrawn career-path promotions or quietly reimplement the
judgement genesis has already made. The corpus endpoint returns a computed `is_live` and a
`generated_at`, is `force-dynamic` + `no-store` so a passed deadline is gone on the next request
([promotions/route.js:17-20](../../src/app/api/corpus/promotions/route.js#L17-L20)), and merges three
sources. **The trap is handled by choosing the source, and the description states the consequence.**

Trap (f) is handled in **both** places: in code, a `kind: "page"` row's null `price` is omitted from
the output rather than serialised as `null`; in the description, the "never infer a price for them"
sentence.

**Normalisation** — filter `is_live === true` (defence in depth; the source already does it); omit
`price` entirely when `price.normal` is null; surface `sources[*].ok === false` as a one-line
degradation note so a silent partial outage is visible.

**Output shape** — keep `id`, `kind`, `title`, `url`, `live_until`, `price` (when present),
`courses[]` (`course_code` + `title`), `description`. Drop `source`, `live_from`, `is_live` (implied),
`image_url`, and `bundle` (always null).

**Size** — measured: whole body 1,781 bytes; trimmed **1,214 bytes**. ✅ Comfortably the cheapest tool.

**Caching** — **not cached anywhere, by design.** `/api/corpus/promotions` is `force-dynamic` with
`Cache-Control: no-store`, and it fans out to Mongo + the masterclass builder on every call. This is
the one tool where **each MCP call costs two Vercel function invocations** — one for `/api/mcp`, one
for `/api/corpus/promotions` — plus the origin transfer between them, since the MCP route would call
it over HTTP.

**Recommendation: call `buildPromotionsCorpus()` directly instead of fetching our own URL.** It is
already an importable server function
([src/lib/corpus/promotions.js](../../src/lib/corpus/promotions.js), imported at
[promotions/route.js:24](../../src/app/api/corpus/promotions/route.js#L24)). That collapses it back to
**1 invocation per tool call**, removes a network hop, removes a second key from the request path, and
keeps the HTTP endpoint untouched for the chatbot. The same applies to a masterclass tool if one is
added later.

### Not proposed this round

- **`list_taxonomy` (programs + skills)** — 27 programs and **only 7 skills**; both lists are small,
  stable and needed to make `search_courses`'s `program`/`skill` filters usable. This is a better fit
  for an **MCP resource** than a tool, or for inlining the 7 skill ids straight into the
  `search_courses` schema as an enum. Raised as open question 5.
- **Masterclass tools** — `/api/corpus/masterclass` is ~16 KB per course and only 2 courses exist.
  The content is deliberately price-free and round-free (trap g), so a masterclass tool only makes
  sense paired with `list_live_promotions`, and its output would need a summary/detail split. Out of
  scope for round 1.
- **FAQs, instructors, about-us, contact-us** — measured and documented above, but none was in the
  draft and none is needed to answer "what courses are there, what do they cost, when do they run,
  what's on offer".
- **Anything that writes.** See trap (i).

### Cost summary

| Tool | Upstream | Cached in genesis? | Vercel invocations / call | Typical bytes | Worst case |
|---|---|---|---:|---:|---:|
| `search_courses` | `/public-course`, `/online-course` | yes — 1 h, tagged, shared with the site | 1 | 4.8 KB | 14 KB |
| `get_course_detail` | `/public-course?course_id=` | yes — 1 h, tag `course:<id>` | 1 | 6.9 KB | ⚠️ **14.9 KB** |
| `list_training_rounds` | `/schedules` | yes — 30 min, tag `schedules` | 1 | 5.1 KB | 10 KB |
| `list_live_promotions` | `/api/corpus/promotions` | **no — `no-store` by design** | 2 over HTTP, **1 if imported directly** | 1.2 KB | 1.2 KB |

No tool exceeds ~20 KB at its capped limit. `get_course_detail` is the one to watch.

---

## OPEN QUESTIONS — need his ruling before the build round

1. **zod 3 or zod 4?** This is the fork. `mcp-handler@^2` requires `zod@^4` and `@modelcontextprotocol/server@^2`;
   staying on the installed zod 3.25.76 means `mcp-handler@1.1.0` + `@modelcontextprotocol/sdk@1.26.0`,
   which drags `redis@^4.6.0` in as a dependency we will never call. zod is used across this repo's
   forms and server actions, so a v4 bump is not contained to this feature. **Bump zod to 4 in the MCP
   PR, do it as a separate PR first, or accept v1 + the dead Redis dependency?**

2. **Is the MSDB `PATCH /api/online-courses/[id]` hole still open in production?** Confirmed
   unauthenticated in the local clone at `src/app/api/online-courses/[id]/route.js:41` — but that
   clone is from 2026-07-08 and is provably behind the deployment. This round would not send a write
   to find out. It is a genuine production exposure if still live, and it is unrelated to the MCP
   work except that it argues for a strictly read-only MCP server. **Does he want this chased
   separately, by someone who can check the deployed MSDB repo?**

3. **Should MCP hide rounds that have already started, or only rounds that have finished?**
   genesis-lab's public surfaces drop a round the moment its **first** training day arrives
   ([schedules.js:15-35](../../src/lib/api/schedules.js#L15-L35)); admin surfaces deliberately opt
   out. A chat agent asked "is there a Power BI class this week?" on the second day of a two-day round
   is arguably in the admin case, not the public one. **Match the public site (hide started rounds),
   or show in-progress rounds?** Today it makes no difference — 0 rounds are in progress — but it
   will on any Tuesday.

4. **What is `o_course_netprice` on online courses?** On the sample row `o_course_price` is 3600 and
   `o_course_netprice` is 4500 — the "net" price is *higher*. On public courses `course_netprice` is
   **null on all 77 rows**. Getting this backwards in a tool description means quoting a wrong price
   to a customer. **Which of the two is the number a customer pays?**

5. **Do we ship a taxonomy tool/resource in round 1?** Without one, a model has no way to learn the
   valid `program` and `skill` filter values for `search_courses` other than trial and error — and
   `/public-course` **ignores an unknown filter value silently** rather than erroring, so a wrong
   guess returns the unfiltered catalogue and looks like a successful search. Options: a fifth tool, an
   MCP resource, or hard-code the 7 skill ids as a zod enum and leave programs free-text.

6. **Public URL and key distribution.** The snippet in §4 assumes `https://www.9experttraining.com/api/mcp`.
   **Confirm the host** (www, or a separate subdomain), and **who gets `MCP_API_KEY`** — if more than
   one person, use `--header-file` rather than putting the key in `claude_desktop_config.json` args,
   where any other user on the machine can read it from the process list. Also recommend generating
   it as `openssl rand -hex 32` rather than `-base64 32`, to sidestep the Windows args-quoting bug
   entirely.
