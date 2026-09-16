# Career Path answers and chat card — phase A (genesis side): what the site says, and from where

Round CP-S. Read-only survey on branch `staging` at `fe74fc40`, 2026-09-16, against the live
database (`find` / `countDocuments` / `aggregate` only) and ONE read-only GET of MSDB
`/api/ai/career-path?status=all`. Every value below is measured unless marked **hypothesis**.
The reference for every ruling is the Masterclass card round
([masterclass-chat-card-phase-a.md](./masterclass-chat-card-phase-a.md), shipped as
`203e7f42` / `1701f060` / `fe74fc40`).

---

## A. Source of truth

### A1. Where the public site reads career paths

**A mix, but with a clean split: MSDB is written FROM, Mongo is read FROM.** No public route
fetches MSDB at request time.

| layer | what | where |
|---|---|---|
| upstream fetch | `aiFetch('/career-path', { params: { limit, q, status } })` → `listCareerPaths()`; `getCareerPath(slug)` (defined, **no caller** outside the adapter) | [src/lib/api/career-paths.js:20-38](../src/lib/api/career-paths.js#L20-L38); base `AI_API_BASE ?? 'https://9exp-sec.com/api/ai'`, header `x-api-key: AI_API_KEY` ([client.js:20-21](../src/lib/api/client.js#L20-L21)) |
| sync (the only MSDB reader) | `syncCareerPaths()` upserts every upstream item into Mongo; admin-owned fields ride `$setOnInsert`, `curriculum` is merged item-by-item | [src/lib/career-paths/syncCareerPaths.js:157-252](../src/lib/career-paths/syncCareerPaths.js#L157-L252); mapper [:43-100](../src/lib/career-paths/syncCareerPaths.js#L43-L100); callers: cron [/api/cron/career-paths-sync](../src/app/api/cron/career-paths-sync/route.js), admin [/api/admin/career-paths/sync](../src/app/api/admin/career-paths/sync/route.js), `triggerCareerPathSync` |
| model | `CareerPath`, collection **`career_paths`** | [src/models/CareerPath.js:33-116](../src/models/CareerPath.js#L33-L116) |
| public reads | `getActiveCareerPaths()` (`is_active: true`, sort `display_order: 1`) and `getCareerPathBySlug(slug)` (`api_slug ∈ {slug, slug-career-path, slug minus suffix}` ∧ `is_active`) | [src/lib/career-paths/getCareerPaths.js:18-51](../src/lib/career-paths/getCareerPaths.js#L18-L51) |
| register reads | `getCareerPathForRegistration(slug)` (same predicate, `$or` on the two spellings) and `getCareerPathWithSchedules(slug)` (adds live MSDB schedules per course code) | [src/lib/actions/career-paths.js:630-640](../src/lib/actions/career-paths.js#L630-L640), [:552-570](../src/lib/actions/career-paths.js#L552-L570) |
| FAQs | `getLocalFaqsForCourse('career_path', career_path_id)` — collection `local_faqs` | [[...slug]/page.jsx:647-650](../src/app/(public)/[...slug]/page.jsx#L647-L650) |
| nav | a **hardcoded** slug list, deliberately not a DB read | [src/config/site.js:215-227](../src/config/site.js#L215-L227) (PublicHeader.jsx:3 also reads `getActiveCareerPaths` for the dropdown) |

Registrations (`CareerPathRegistration`, collection `career_path_registrations`) are a genesis-only
write path; **0 rows** today.

### A2. Public routes

| route | reads | mode (W1 build) | canonical |
|---|---|---|---|
| `/career-path-project` (listing) — [page.jsx](../src/app/(public)/career-path-project/page.jsx) | `getActiveCareerPaths()` [:290](../src/app/(public)/career-path-project/page.jsx#L290) | ○ static, `revalidate = 3600` [:10](../src/app/(public)/career-path-project/page.jsx#L10) | `${NEXT_PUBLIC_SITE_URL}/career-path-project` [:8](../src/app/(public)/career-path-project/page.jsx#L8) |
| `/<api_slug>` (detail) — the `-career-path` suffix is dispatched inside the catch-all [[...slug]/page.jsx:644-651](../src/app/(public)/[...slug]/page.jsx#L644-L651) | `getCareerPathBySlug(segment)`; 404 when missing or inactive | ƒ dynamic (`/[...slug]`) | `${NEXT_PUBLIC_SITE_URL}/${segment}` — self-canonical [:344](../src/app/(public)/[...slug]/page.jsx#L344), [:429](../src/app/(public)/[...slug]/page.jsx#L429) |
| `/career-path-register/<bare-slug>` — [page.jsx](../src/app/(public)/career-path-register/[slug]/page.jsx) | `getCareerPathWithSchedules(slug)`; renders "ยังไม่เปิดรับสมัคร" (200, not 404) when closed [:30-41](../src/app/(public)/career-path-register/[slug]/page.jsx#L30-L41) | ƒ `force-dynamic` [:7](../src/app/(public)/career-path-register/[slug]/page.jsx#L7) | `${NEXT_PUBLIC_SITE_URL}/career-path-register/${slug}` [:17](../src/app/(public)/career-path-register/[slug]/page.jsx#L17) |

Host: `NEXT_PUBLIC_SITE_URL` = `https://www.9experttraining.com` in production, which is also the
`links.detailUrl` MSDB stores on every row (A3) and the corpus's `CORPUS_PUBLIC_ORIGIN`
([promotions.js:56](../src/lib/corpus/promotions.js#L56)). Note the detail URL is the **suffixed**
slug at the root (`/prompt-engineer-career-path`), while the register URL uses the **bare** slug
(`/career-path-register/prompt-engineer`) — the detail page strips the suffix itself
([CareerPathDetail.jsx:510-512](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L510-L512)).
The sitemap lists only `/career-path-project` ([sitemap.js:21](../src/app/sitemap.js#L21)) — no detail
URLs.

### A3. Count and identity

**10 rows in `career_paths`, all `is_active: true`, all `upstream_status: 'active'`. MSDB
`/career-path?status=all` returns the same 10** (`total: 10`), with identical `_id`s, slugs, titles
and prices. The chatbot's 10 documents therefore cover the same set. The card identifier is the
same on both sides — no drift.

| # (genesis `display_order`) | `api_slug` (= MSDB `slug`) | title | `career_path_id` (= MSDB `_id`) | MSDB `sortOrder` |
|---|---|---|---|---|
| 0 | `prompt-engineer-career-path` | Prompt Engineer | `699ecb4f63ca14138ab0404f` | 0 |
| 1 | `business-analytics-career-path` | Business Analytics | `6a102f56037d38f24bdd50a0` | **0** |
| 2 | `citizen-developer-career-path` | Citizen Developer | `699feec0859e4ddad9fa958b` | 2 |
| 3 | `rpa-developer-career-path` | RPA Developer | `699fec91859e4ddad9fa9579` | 3 |
| 4 | `accounting-and-finance-career-path` | Accounting & Finance | `699ff093f7aba2f0cde718bc` | 4 |
| 5 | `data-analyst-career-path` | Data Analyst | `699ff5ca141cd4eeab1d3029` | 5 |
| 6 | `data-engineer-bi-career-path` | Data Engineering & Business Intelligence | `699ffa9b141cd4eeab1d30ce` | 6 |
| 7 | `power-automate-specialist-career-path` | Power Automate Specialist | `699ffd2e141cd4eeab1d311a` | 7 |
| 8 | `web-developer-career-path` | Web Developer | `69a0011a141cd4eeab1d315e` | 8 |
| 9 | `visual-communication-and-presentation-career-path` | Visual Communication & Presentation | `69a002ed141cd4eeab1d31ae` | 9 |

Flags:
- **Three spellings of one identifier** exist, all derivable: MSDB `slug` / genesis `api_slug`
  (suffixed, the detail URL), the bare slug (nav list [site.js:216-226](../src/config/site.js#L216-L226)
  and the register URL), and `career_path_id` (the MSDB ObjectId string, the FAQ `ref_id` and the
  React key). MSDB `/career-path` has no separate "code". The chatbot documents are composed from
  MSDB, so they carry the suffixed slug — the same string genesis serves.
- **Order differs at the top**: MSDB returns Business Analytics first (`sortOrder` 0, tied with
  Prompt Engineer at 0; upstream tie-break is insertion); genesis lists Prompt Engineer first because
  `display_order` is admin-owned and survives sync ([syncCareerPaths.js:86-88](../src/lib/career-paths/syncCareerPaths.js#L86-L88)).
  A card feed must use `getActiveCareerPaths()` to match the listing.
- The nav title for `data-engineer-bi` is "Data Engineering & BI" ([site.js:223](../src/config/site.js#L223)),
  the row's `title` is "Data Engineering & Business Intelligence". Cosmetic.

---

## B. Card fields available per path

### B4. Field sources

All from the `career_paths` row as `getActiveCareerPaths()` returns it (serialised `lean()`).

| card field | source | notes |
|---|---|---|
| name | `title` | English on every row |
| slug | `api_slug` | suffixed; bare = `api_slug.replace(/-career-path$/, '')` |
| canonical URL | `${CORPUS_PUBLIC_ORIGIN}/${api_slug}` | equals `links.detailUrl` on all 10 rows |
| tagline | `short_description` (MSDB `cardDetail`) — the **listing card** renders it under a 2-line clamp [page.jsx:68-72](../src/app/(public)/career-path-project/page.jsx#L68-L72); the **detail hero** prefers `tagline` [CareerPathDetail.jsx:37-40](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L37-L40) | identical strings on 8/10 rows; differ on `prompt-engineer` (short 142 / tagline 465) and `business-analytics` (181 / 146) |
| longer description | `intro` (472–784 chars, "เกี่ยวกับเส้นทางอาชีพนี้" [:83-92](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L83-L92)); `description_html` is **empty on all 10** | |
| cover | `hero_image_url` — absolute, `https://res.cloudinary.com/ddva7xvdt/image/upload/q_auto,f_auto/v…/msdb/career-path/<id>.jpg` on all 10 | the URL already carries a Cloudinary transform (`q_auto,f_auto`); MSDB-owned, not `9exp-genesis/` |
| courses | `curriculum[].items[].snap` — `{ code, name, teaser, days, hours, price, imageUrl, publicUrl }` (8 keys, no level) | see the table below |
| total duration | **not shown** for the path; per-course `days`/`hours` shown on each snap card [:225-229](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L225-L229). Computable as Σ`snap.days`, but the one `choice` group needs a rule | |
| level | **no field anywhere** — not on the path, not on the snap | |

Per-path lengths and courses (order = `curriculum` order, which is MSDB's):

| path | short / tagline / intro | courses (`snap.code`, in order) | Σdays / Σhours |
|---|---|---|---|
| Prompt Engineer | 142 / 465 / 714 | 5: PYTHON-L1, PYTHON-L2, GEN-AI-L1, COPILOT-STU, N8N-L1 | 11 / 66 |
| Business Analytics | 181 / 146 / 728 | 5: MSE-L2, MSE-L6, POWER-BI, POWER-BI-DAX, COPILOT-M365 | 10 / 60 |
| Citizen Developer | 136 / 136 / 784 | 5: Power-Apps, POWER-APPS-ADV, PAM-CLD, PAM-CLD-ADV, PP-AI | 10 / 60 |
| RPA Developer | 134 / 134 / 472 | 4: PAM-DSK, PAM-DSK-ADV, GEN-AI-L1, N8N-L1 | 8 / 48 |
| Accounting & Finance | 239 / 239 / 749 | 4: MSE-L1, MSE-L2, POWER-BI, COPILOT-M365 | 8 / 48 |
| Data Analyst | 121 / 121 / 642 | 6: POWER-BI, POWER-BI-PQ, POWER-BI-DAX, POWER-BI-ADV, POWER-BI-XDM, GEN-AI-L1 | 12 / 72 |
| Data Engineering & BI | 176 / 176 / 603 | 5: SQL-101, SQL-BI-ETL, MS-FB-101, POWER-BI, POWER-BI-XDM | 11 / 66 |
| Power Automate Specialist | 149 / 149 / 656 | 5: PAM-CLD, PAM-CLD-ADV, PAM-DSK, PAM-DSK-ADV, PP-AI | 10 / 60 |
| Web Developer | 159 / 159 / 707 | 5: DEV-VS-01, SQL-PG-Query, DEV-VS-04, DEV-VS-06, COPILOT-DEV | 14 / 84 |
| Visual Communication & Presentation | 146 / 146 / 598 | 3 fixed: CANVA-L1, CANVA-L2, GEN-AI-L1 + **choice 1 of 2**: MSE-L4, POWER-BI | 10 / 60 (with one choice) |

Nine paths have one `fixed` group ("Core Courses"; Prompt Engineer's has an empty title); Visual
Communication adds a `choice` group (`chooseMin: 1, chooseMax: 1`, title "เลือกเรียนระหว่าง").
`snap.code` is present on every item (`kind: 'public'` throughout; no `external` items today), and
`snap.publicUrl` is the course's `www.9experttraining.com/<alias>-training-course` URL. Note
`Power-Apps` is mixed-case as stored. `localCourses` is `[]` on all 10 (legacy, unread by the
register page — [CareerPathRegisterClient.jsx:21-22](../src/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient.jsx#L21-L22)).

Other fields on the row: `objectives` (4–5), `suitable_for` (3–5), `prerequisites` (2–5),
`benefits` (1–2) — rendered as the four highlight cards ([:109-145](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L109-L145));
`roadmap_image_url` (Cloudinary, all 10); `links.outlineUrl` (9exp.link short links);
`registerBannerUrl` (genesis Cloudinary, register page only); `registrationOpen` **true on 9/10**
(false on `accounting-and-finance`).

### B5. Price

**The site shows a total price, on the detail page only.** `PriceSummary`
([CareerPathDetail.jsx:503-587](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L503-L587))
renders "ราคาทั้งหมด (ก่อน VAT)" = `price.salePrice ?? price.fullPrice`, and when
`salePrice < fullPrice` the struck `fullPrice` plus "ลด {discountPct}%". The listing page shows **no
per-path price**; its promotion block is the static group-discount table (15/20/25/30 %)
[page.jsx:82-92](../src/app/(public)/career-path-project/page.jsx#L82-L92).

How it is computed: **it is not computed on genesis at all.** `price` is MSDB's object, stored
verbatim by the sync ([syncCareerPaths.js:79](../src/lib/career-paths/syncCareerPaths.js#L79)) and
read raw — `Number(...).toLocaleString('th-TH')` inline, **no resolver** (nothing like
`resolveBatchPrice`). Values: `discountPct: 15` and `currency: 'THB'` on all 10;
`salePrice = fullPrice × 0.85` on 8/10. There is **no clock in it**: no deadline, no early bird,
no `now` — a card would serve the same numbers the detail page does, per request, and the "one
`now`" ruling is satisfied trivially (nothing to judge). Whether the card shows it is an open
decision (below); the Masterclass ruling "price only through an existing resolver" has no resolver
to route through here — the raw MSDB object is the only source, on the site as well.

Measured inconsistencies in that object (report only):
- `accounting-and-finance`: `fullPrice 39000`, but Σ`snap.price` = **39,800** (7,900 + 8,500 + 8,500 + 14,900) and `salePrice 33830` = 0.85 × **39,800**, not 0.85 × 39,000 (= 33,150). The strike-through and the headline disagree about the base.
- `rpa-developer`: `salePrice 43800` ≠ 0.85 × 51,600 (= 43,860).
- `visual-communication-and-presentation`: `fullPrice 43200` = core 34,700 + one choice (8,500) — consistent with `chooseMax: 1`; Σ of all five snaps is 51,700.
- The other seven: `fullPrice` = Σ`snap.price` exactly, `salePrice` = 0.85 × `fullPrice`.

### B6. The image the site renders

- Listing card: raw `<img src={path.hero_image_url}>` at 200 px, eslint-disable, `loading="lazy"`
  ([page.jsx:38-45](../src/app/(public)/career-path-project/page.jsx#L38-L45)); fallback is an
  `icon_url` (a field **not in the schema** — never set) then the title's first letter.
- Detail hero: the same `hero_image_url`, raw `<img>`, `loading="eager"`
  ([CareerPathDetail.jsx:44-51](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L44-L51)).
- OG image: `hero_image_url || ''` ([[...slug]/page.jsx:426](../src/app/(public)/[...slug]/page.jsx#L426)) — no
  helper, unlike Masterclass's `resolveCourseOgImage`.

No helper anywhere — **no URL builder, no transform, no `next/image`**. "The same image as the
site" is `hero_image_url`, raw, on both pages.

### B7. Shown on the site but NOT for a chat card

- **Group-discount tiers and their conditions** ([page.jsx:82-129](../src/app/(public)/career-path-project/page.jsx#L82-L129),
  duplicated in the detail's `CareerPathPromotionSection` [:295](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L295)):
  "ลด 15/20/25/30 %", "ระยะเวลาโปรโมชั่น 1 ม.ค. 69 - 31 ธ.ค. 69", payment-within-30-days,
  no-refund, name-change and invoicing clauses — **contractual terms with a hard-coded date**; the
  bot links, never quotes (the Masterclass licence-terms ruling).
- **Alumni "Transfer Module" terms** ([:234-250](../src/app/(public)/career-path-project/page.jsx#L234-L250)): a
  10-year entitlement clause — contractual.
- **Per-course prices and "ใกล้เต็ม"**: the register page shows a `nearly_full` badge on a
  schedule ([CareerPathRegisterClient.jsx:960-970](../src/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient.jsx#L960-L970)) —
  an availability state (the seats ruling). Per-course `snap.price` on the detail is a fact about the
  course, not the path.
- **Countdowns**: none exist on any career-path page — nothing to exclude.
- `registrationOpen`: an admin switch, not a seat count. Serving it is not covered by the seats
  ruling either way (open decision).

---

## C. Overview copy for a static document

### C8. The site's own copy, as plain text

Where the concept is explained: **only `/career-path-project`** (the detail pages explain one path
each). Sentences that exist on that page, verbatim:

| # | text | source |
|---|---|---|
| S1 | เส้นทางอาชีพด้านเทคโนโลยี พร้อมหลักสูตรแนะนำเพื่อพัฒนาทักษะที่ตลาดต้องการ | meta description [page.jsx:7](../src/app/(public)/career-path-project/page.jsx#L7); hero (with the count in front) [:21-22](../src/app/(public)/career-path-project/page.jsx#L21-L22) |
| S2 | เลือกเส้นทางอาชีพของคุณ | h1 [:17](../src/app/(public)/career-path-project/page.jsx#L17) |
| S3 | Build your Future with Career Path Program / 9Expert ชวนอัปสกิลและต่อยอดความรู้ตามสายอาชีพ (Career Path) | [:304-306](../src/app/(public)/career-path-project/page.jsx#L304-L306) |
| S4 | มาคนเดียวก็เลิศ มาทั้งกลุ่มก็ปัง ลดสูงสุด 30 % ได้ความรู้+ใบรับรอง อัปความมั่นใจในสายงาน / ปี 2026 นี้เราเตรียมแพ็กเกจคอร์สอบรมมามอบให้แล้วกว่า 10 สายอาชีพ | [:310-312](../src/app/(public)/career-path-project/page.jsx#L310-L312) |
| S5 | สำหรับการเรียนในโปรแกรม Career Path ท่านจะได้รับสิทธิพิเศษดังต่อไปนี้ | [:195](../src/app/(public)/career-path-project/page.jsx#L195) |
| S6 | Certificate — ใบประกาศนียบัตรสำหรับทุกหลักสูตรที่อยู่ในโปรแกรม Career Path ที่ท่านลงเรียน | [:96-98](../src/app/(public)/career-path-project/page.jsx#L96-L98) |
| S7 | Digital Badge Certificate — ตรารับรองทักษะและความสามารถของผู้เรียนในโปรแกรม Career Path (*ได้รับเมื่อผ่าน Workshop Project ตามเกณฑ์แต่ละ Career Path) | [:101-104](../src/app/(public)/career-path-project/page.jsx#L101-L104) |
| S8 | Cheat Sheet — สำหรับใช้เป็นแนวทางในการทำโปรเจกต์และทบทวนความรู้ | [:107-108](../src/app/(public)/career-path-project/page.jsx#L107-L108) |
| S9 | ผู้เรียนที่เคยเรียนบางคอร์สใน Career Path Program สามารถใช้สิทธิ์ Transfer Module เพื่อหักค่าใช้จ่ายในการลงทะเบียนได้ / ต้องลงทะเบียนเรียนคอร์สที่เหลือในโปรแกรมให้ครบเท่านั้น เพื่อรับใบประกาศนียบัตรพิเศษ (Certificate) สำหรับ Career Path Program เพิ่มอีก 1 ใบ / ใช้สิทธิ์ได้ภายใน 10 ปี นับจากวันเรียนเดิมของคอร์สนั้น ๆ | [:234-250](../src/app/(public)/career-path-project/page.jsx#L234-L250) — contractual, see B7 |
| S10 | ท่านสามารถสอบถามเพื่อรับสิทธิ์ราคาพิเศษได้กับเจ้าหน้าที่ฝ่ายขายทาง LINE @9expert | [:180-189](../src/app/(public)/career-path-project/page.jsx#L180-L189) |
| S11 | หากมีคำถามหรือข้อสงสัยเพิ่มเติม ติดต่อเราได้ที่ LINE Official @9expert | [:265-273](../src/app/(public)/career-path-project/page.jsx#L265-L273) |
| S12 | หลักสูตรที่ต้องอบรม (section heading), เส้นทางการพัฒนาทักษะ (roadmap heading), ราคาทั้งหมด (ก่อน VAT), ลงทะเบียน, ดาวน์โหลด Course Outline | detail page [CareerPathDetail.jsx:258](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L258), [:150](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L150), [:532](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L532), [:562](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L562), [:581](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L581) |
| S13 | พร้อมเริ่มต้นเส้นทางอาชีพของคุณแล้วหรือยัง? / ดูหลักสูตรทั้งหมด | CTA banner [:594-601](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L594-L601) |
| S14 | Career Path นี้ยังไม่เปิดรับสมัครในขณะนี้ | register page, closed state [page.jsx:37](../src/app/(public)/career-path-register/[slug]/page.jsx#L37) |

**What the site does NOT say anywhere**: a one-sentence definition of "Career Path" ("a bundle of
N courses taken in sequence"), how many courses a path has in general, that the courses are
classroom rounds chosen at registration, or how registration works beyond the "ลงทะเบียน" button.
The bridging sentences below are therefore marked, and the ten path names/course counts are facts
from A3/B4, not prose.

#### DRAFT overview (Thai) — for approval, not shipped

> **[DRAFT — career-path-overview.txt — every sentence is from the site unless marked ⟨bridge⟩]**
>
> Career Path Program ของ 9Expert Training
>
> เลือกเส้นทางอาชีพของคุณ — เส้นทางอาชีพด้านเทคโนโลยี พร้อมหลักสูตรแนะนำเพื่อพัฒนาทักษะที่ตลาดต้องการ Build your Future with Career Path Program: 9Expert ชวนอัปสกิลและต่อยอดความรู้ตามสายอาชีพ (Career Path) ได้ความรู้+ใบรับรอง อัปความมั่นใจในสายงาน ปี 2026 นี้เราเตรียมแพ็กเกจคอร์สอบรมมามอบให้แล้วกว่า 10 สายอาชีพ
>
> ⟨bridge⟩ Career Path แต่ละเส้นทางคือแพ็กเกจหลักสูตรอบรมหลายหลักสูตรที่จัดลำดับไว้ให้สำหรับสายอาชีพนั้น ๆ ในหน้าของแต่ละ Career Path จะมี "เส้นทางการพัฒนาทักษะ" และรายการ "หลักสูตรที่ต้องอบรม" ⟨/bridge⟩
>
> ⟨bridge — the ten names are data, the sentence frame is not on the site⟩ ปัจจุบันมี 10 เส้นทางอาชีพ ได้แก่ Prompt Engineer, Business Analytics, Citizen Developer, RPA Developer, Accounting & Finance, Data Analyst, Data Engineering & Business Intelligence, Power Automate Specialist, Web Developer และ Visual Communication & Presentation ⟨/bridge⟩
>
> สำหรับการเรียนในโปรแกรม Career Path ท่านจะได้รับสิทธิพิเศษดังต่อไปนี้
> - Certificate — ใบประกาศนียบัตรสำหรับทุกหลักสูตรที่อยู่ในโปรแกรม Career Path ที่ท่านลงเรียน
> - Digital Badge Certificate — ตรารับรองทักษะและความสามารถของผู้เรียนในโปรแกรม Career Path (ได้รับเมื่อผ่าน Workshop Project ตามเกณฑ์แต่ละ Career Path)
> - Cheat Sheet — สำหรับใช้เป็นแนวทางในการทำโปรเจกต์และทบทวนความรู้
>
> มาคนเดียวก็เลิศ มาทั้งกลุ่มก็ปัง ลดสูงสุด 30 % ⟨bridge⟩ สำหรับผู้ที่สมัครพร้อมกันเป็นกลุ่ม ⟨/bridge⟩ ท่านสามารถสอบถามเพื่อรับสิทธิ์ราคาพิเศษได้กับเจ้าหน้าที่ฝ่ายขายทาง LINE @9expert
>
> ⟨bridge⟩ วิธีสมัคร: เข้าไปที่หน้าของ Career Path ที่สนใจ แล้วกดปุ่ม "ลงทะเบียน" หรือ "ดาวน์โหลด Course Outline" เพื่อดูรายละเอียดหลักสูตร ⟨/bridge⟩ หาก Career Path ใดยังไม่เปิดรับสมัครในขณะนี้ หน้าเว็บจะแจ้งว่า "ยังไม่เปิดรับสมัคร" หากมีคำถามหรือข้อสงสัยเพิ่มเติม ติดต่อเราได้ที่ LINE Official @9expert
>
> พร้อมเริ่มต้นเส้นทางอาชีพของคุณแล้วหรือยัง? ดูหลักสูตรทั้งหมดได้ที่ https://www.9experttraining.com/career-path-project

Length: ~1,650 characters. Deliberately omitted: every price, the 15/20/25/30 % table and its
conditions, the Transfer Module clause (S9), the "1 ม.ค. 69 - 31 ธ.ค. 69" window. The "ลดสูงสุด
30 %" phrase is kept only because it is in the page's own headline sentence (S4) — drop it if the
no-discount-figures rule should be absolute.

### C9. Contradictions between pages

1. **"กว่า 10 สายอาชีพ" vs exactly 10.** The listing body says "more than 10" ([page.jsx:312](../src/app/(public)/career-path-project/page.jsx#L312));
   the hero on the same page prints the live count "10 เส้นทางอาชีพ…" ([:21](../src/app/(public)/career-path-project/page.jsx#L21)),
   and there are exactly 10 active rows. The draft keeps the sentence as written; the composer may
   prefer the counted form.
2. **"ปี 2026" vs "1 ม.ค. 69 - 31 ธ.ค. 69".** The headline is Gregorian, the conditions are
   Buddhist-era for the same year ([:312](../src/app/(public)/career-path-project/page.jsx#L312) vs [:114](../src/app/(public)/career-path-project/page.jsx#L114)).
   Both hard-coded; neither reads the clock.
3. **Detail meta description vs hero.** `generateMetadata` uses `short_description.slice(0,160)`
   first ([[...slug]/page.jsx:423-425](../src/app/(public)/[...slug]/page.jsx#L423-L425)); the hero
   prefers `tagline` ([CareerPathDetail.jsx:37-40](../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L37-L40)).
   They are the same string on 8 rows and differ on Prompt Engineer (a 465-char tagline the meta
   never shows) and Business Analytics.
4. **Listing meta title "เส้นทางอาชีพ | 9Expert Training"** ([page.jsx:5](../src/app/(public)/career-path-project/page.jsx#L5))
   vs body branding "Career Path Program" — the concept has two names on one page (Thai
   เส้นทางอาชีพ / English Career Path); the not-found query "Career Path คืออะไร" uses the English one.
5. **Price base on Accounting & Finance** (B5): headline 39,000 vs the course sum 39,800 the sale
   price was derived from. On the site today the strike-through reads 39,000 and the sale price
   33,830 — "ลด 15%" is printed, but 33,830 / 39,000 is 13.3 %.
6. **The "Data Engineering & BI" nav label vs the row title** (A3) — cosmetic.
7. **Listing shows no price; detail shows a total.** Not a contradiction, but the card ruling
   "same as the listing card" (Masterclass) would give a price-less card, while the detail page
   does show one.

---

## D. Delivery

### D10. Two options, costs only

**Option 1 — sibling `GET /api/corpus/career-path-cards`, the `masterclass-cards` shell verbatim.**
The data lives in genesis Mongo (A1), so this is the direct analogue: a route file that is
[masterclass-cards/route.js](../src/app/api/corpus/masterclass-cards/route.js) with one import
swapped, plus a lib module `src/lib/corpus/careerPathCards.js` shaped like
[masterclassCards.js](../src/lib/corpus/masterclassCards.js) (injectable `readPaths`, a pure
`careerPathCardItem`, `{ items }`).

Importable unchanged:
- `corpusAuthStatus`, `CORPUS_KEY_HEADER` ([promotionsAuth.js:27-43](../src/lib/corpus/promotionsAuth.js#L27-L43));
- `CORPUS_PUBLIC_ORIGIN` ([promotions.js:56](../src/lib/corpus/promotions.js#L56));
- `getActiveCareerPaths()` ([getCareerPaths.js:18-24](../src/lib/career-paths/getCareerPaths.js#L18-L24)) —
  the listing's own selector, `is_active` + `display_order`, so the card set and order cannot drift
  from `/career-path-project`;
- `plainText` / `htmlToText` ([htmlToText.js](../src/lib/corpus/htmlToText.js)) if `intro` or the
  bullets are served (all plain today; `description_html` is empty).

Nothing needs lifting out of a component: there is no level map (no level field), no duration
helper (the site prints per-course days only), no price resolver (B5 — the raw object is the site's
own source). The only per-item logic a mapper would own is (a) reading `curriculum[].items[].snap`
into `{ code, name, url }` and (b) whether to sum `snap.days` (and how to count the `choice` group).
Both would be new, small, and pure.

Costs: one route, one lib, one test file (the `masterclassCards.test.mjs` shape, ~15–20 tests), a
floor bump, and one more `CORPUS_API_KEY` consumer to wire on the chatbot side. The read is one
`find` — no joins (courses are embedded snaps; instructors do not exist on a path).

**Option 2 — the chatbot reads MSDB `/api/ai/career-path` directly (it already does for the 10
documents), and genesis ships nothing.** The MSDB payload carries every field the card needs
(`title`, `slug`, `cardDetail`, `coverImage.url`, `curriculum[].items[].snap`, `price`, `links`).
Costs: the card would follow MSDB's `sortOrder` (Business Analytics first), not the site's
`display_order`; it would include any path an admin has hidden on genesis (`is_active: false` —
none today) and cannot see `registrationOpen`; and `/api/ai/career-path` has no `now` at all, so the
"one clock" property is moot. Zero genesis code; the survey cannot see the chatbot-side cost.

**Option 3 (a variant of 1, listed for completeness)** — add `career_paths` as a fourth source on
`/api/corpus/promotions`. Rejected on the same grounds as the Masterclass round: the 15 % is not a
dated promotion and would never expire out of the feed.

### D11. Image host coverage

Every `hero_image_url` (and `roadmap_image_url`, `registerBannerUrl`, and every `snap.imageUrl`)
is on **`res.cloudinary.com`** (measured on all 10 rows and 49 snap items).

- `images.remotePatterns` lists `res.cloudinary.com` and `ddva7xvdt.res.cloudinary.com`
  ([next.config.mjs:42-45](../next.config.mjs#L42-L45)) — covered, though the chat card uses raw
  `<img>` and never consults it.
- Report-only CSP `img-src` lists `https://res.cloudinary.com https://ddva7xvdt.res.cloudinary.com`
  ([next.config.mjs:557](../next.config.mjs#L557)) — covered; no violation would be logged.
- Not covered anywhere: `9exp.link` (the outline short links) — but that is an `<a href>`, not an
  image, and CSP `img-src` does not apply. One row's `outlineUrl` has **no scheme**
  (`9exp.link/business-analytics-course-outline`, Business Analytics) — as an `href` it resolves
  relative to the page and 404s on the site today.

---

## E. Widget

### E12. What `ChatCards.jsx` would need

How `fe74fc40` added the Masterclass type, as the template:

| piece | Masterclass (`fe74fc40`) | Career Path would need |
|---|---|---|
| upstream field | `masterclasses[]` on `/api/chat`, relayed as-is by the proxy | a fourth top-level array (say `career_paths[]`) — the proxy relays it untouched ([survey D10](./masterclass-chat-card-phase-a.md)) |
| pick | `normalizeMasterclasses(d)` — one name, no chain ([chatClient.js:109-119](../src/lib/chat/chatClient.js#L109-L119)) | one more function of the same shape + one key on `sendChat`'s return |
| dispatch | `masterclasses: result.masterclasses` and `[]` on the apology ([useChatStore.js](../src/components/chat/useChatStore.js)) | the same two lines |
| reducer | `masterclasses: safeArr(action.masterclasses)` ([chatState.js:110](../src/lib/chat/chatState.js#L110)) | one line; the `Object.keys` pin in `chatState.test.mjs` grows by one, as do the `chatRatingThumbs` / `chatCarousel` fixtures |
| persistence | nothing (the store copies unknown fields) | nothing |
| card | `MasterclassCard` ([ChatCards.jsx:461-550](../src/components/chat/ChatCards.jsx#L461-L550)) | a `CareerPathCard`: cover → title → `short_description` under `line-clamp-3` → a courses line → (optional) price → "ดูรายละเอียด" |
| carousel | `MasterclassCarousel` ([:607-617](../src/components/chat/ChatCards.jsx#L607-L617)), keyed on `slug` | one more ten-line wrapper over the shared `Carousel` ([:552-582](../src/components/chat/ChatCards.jsx#L552-L582)) |
| panel | a fourth block after the courses ([ChatPanel.jsx:454-459](../src/components/chat/ChatPanel.jsx#L454-L459)) with a heading | the same, heading "Career Path" |

**Shared without a discriminator** (all already shared by the three cards): `CARD_SHELL`, `PILL`
([:281-284](../src/components/chat/ChatCards.jsx#L281-L284)), `cleanText`, the raw `<img>` block
and its eslint-disable, the link markup (`target="_blank" rel="noreferrer"`, `text-9e-action …
dark:text-9e-air`), `Carousel` with its single-card chevron guard, and `formatBaht` if a price
row is shown. The discriminator stays "which message array the item sits in" — no `type` field
on any item, exactly as today.

**Not shareable from `MasterclassCard`**: its price row and `masterclassPriceView` — those encode
`early_bird` / `early_bird_ends_at`, which a career path does not have. A career-path price row,
if any, would be `salePrice` + struck `fullPrice`, no date, no stale-snapshot rule (nothing
expires). The instructors line and the level/duration pills also have no source (B4).

**Courses on the card**: the one genuinely new element. `snap.code` + `snap.name` for 3–6 items;
the Visual Communication path also needs the "เลือกเรียนระหว่าง" choice group represented (or
collapsed to "3 หลักสูตร + เลือก 1 จาก 2"). This is the field the current cards have no analogue
for, and it is also what makes a career-path card taller than the other three.

---

## Open decisions (facts and costs only)

1. **Delivery** — D10: sibling route (one route + lib + test on the proven shell; order and
   `is_active` follow the site) vs the chatbot reading MSDB directly (no genesis code; MSDB order,
   no admin gating, no `registrationOpen`).
2. **Price on the card** — B5/C9-7: the listing card shows none, the detail shows
   `salePrice` / struck `fullPrice` / "ลด 15%". There is no resolver to route through and no clock;
   two of ten rows carry internally inconsistent numbers (Accounting & Finance, RPA Developer)
   that the site prints as-is today.
3. **Which tagline** — B4: `short_description` (listing card, ≤239 chars, what the meta
   description uses) vs `tagline` (detail hero; 465 chars on Prompt Engineer). Identical on 8/10.
4. **Courses on the card** — E12: codes + names (3–6 per path), and how to show the one `choice`
   group. Σ`days` is computable (8–14 days) but not a figure the site prints for a path.
5. **`registrationOpen`** — B7: an admin switch, true on 9/10; not a seat count, not covered by
   the seats ruling either way. Serving it would let the card say "ยังไม่เปิดรับสมัคร" as the
   register page does; not serving it keeps the card static.
6. **The overview's bridges** — C8: three bridged passages (what a path is, the list of ten, how
   to register). The site has no sentence for any of them; the alternative is a shorter document
   that never defines the term, which is the not-found reply's cause.
7. **"ลดสูงสุด 30 %" in the overview** — C8: in the page's headline sentence, but a discount
   figure; keep or drop.
8. **Corpus identifier** — A3: the chatbot's 10 documents are keyed by MSDB slug (suffixed); a
   card keyed the same way joins by string with no drift today.

---

*Method: read-only Mongo `find` / `aggregate` / `countDocuments` from scratch scripts (deleted),
one read-only GET of MSDB `/career-path?status=all`, files read as cited, no source file
modified, no tests run. The W1 build log (`fe74fc40`) supplied the route modes in A2.*
