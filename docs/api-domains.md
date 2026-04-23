# External API — Domain Reference

> Source of truth: `9Expert_MSDB_API__-_Integration_Guide.docx`. This file
> tracks **curl-verified** paths, envelope shapes, and quirks per domain.
> Update after verifying each endpoint against the live API.

## Base

- Base URL: `https://9exp-sec.com/api/ai`
- Auth: `x-api-key: <AI_API_KEY>` header on every request
- Env vars: `AI_API_BASE`, `AI_API_KEY`

## Verified field shapes (as of 2026-04-22)

The shapes below were observed in responses from the live MSDB API on
the verification date. Only the fields we actually consume downstream
are documented; upstream may return more.

### Skill (from `/skills` items)

```json
{
  "_id": "68d4f556581cb350290597d1",
  "skill_id": "AI",
  "skill_name": "AI",
  "skilliconurl": "https://res.cloudinary.com/ddva7xvdt/image/upload/.../skills/icons/xxxx.svg",
  "skillcolor": "#dee6f1",
  "skill_teaser": "Artificial Intelligence",
  "skill_roadmap_url": "https://...",
  "programs": [ /* nested programs that belong to this skill */ ]
}
```

Quirks:
- `_id` is the filter key for `/public-course?skill=<_id>`.
- `skill_id` is a short upstream-internal code (e.g. `AI`, `DEV`,
  `POWERPLATFORM`). It is **not** usable for upstream filtering and
  does **not** match our UI slugs — see Skill slug mapping below.

### Program (from `/programs` items)

```json
{
  "_id": "68da60bb87a228e4c5f4c2c7",
  "program_id": "DEV",
  "program_name": ".NET",
  "programiconurl": "https://res.cloudinary.com/ddva7xvdt/image/upload/.../programs/icons/yyyy.png",
  "programcolor": "#482adf",
  "skills": [ /* nested skills this program belongs to */ ],
  "skillCount": 1
}
```

Quirks:
- `programiconurl` is an absolute Cloudinary URL — render directly with
  `next/image` (no `unoptimized`). The Cloudinary host is already in
  `next.config.mjs` `remotePatterns`.
- `/programs` returns 27 items today; the live `/programming-all-courses`
  legacy menu listed 21. Treat upstream as authoritative.

### Skill slug mapping

The 6 UI skill slugs map to upstream `_id`s as follows:

| UI slug          | upstream `skill_id` | upstream `_id`             |
| ---------------- | ------------------- | -------------------------- |
| `ai`             | `AI`                | `68d4f556581cb350290597d1` |
| `business`       | `BUSINESS`          | `68d4f506581cb350290597c6` |
| `data`           | `DATA`              | `68d3c5af2c6a2f1315c0bcdb` |
| `power-platform` | `POWERPLATFORM`     | `68d3c5af2c6a2f1315c0bcdc` |
| `programming`    | `DEV`               | `68d4f5b3581cb350290597de` |
| `rpa`            | `RPA`               | `68d4f493581cb350290597b5` |

Upstream `skill_id` does NOT match our UI slugs — `power-platform`
upstream is `POWERPLATFORM` (no dash), and `programming` upstream is
`DEV` (different label). A `toUpperCase()` transform won't work; we
keep an explicit lookup in `src/config/site.js` (`findSkillBySlug`).
We can't rename the upstream codes without breaking their internal
references, and we can't rename our slugs without an SEO migration
plan (the URLs `/programming-all-courses` etc. are legacy SEO routes).

### Course (from `/public-course` items, also nested under `schedules[i].course`)

The **list response** (`/public-course` with no filter or `?skill=X`)
returns a compact shape:

```json
{
  "_id": "69267e3bbbad44df87120492",
  "course_id": "PYTHON-L1",
  "course_name": "Python Programming",
  "course_trainingdays": 3,
  "course_price": 11900,
  "sort_order": 0,
  "program": {
    "_id": "68da61c687a228e4c5f4c2d4",
    "program_id": "PYTHON",
    "program_name": "Python",
    "programiconurl": "https://res.cloudinary.com/ddva7xvdt/image/upload/v1764054427/programs/icons/yo2gj0zs8gmmg7smrgs9.png"
  },
  "skills": ["68d4f5b3581cb350290597de"]
}
```

The **detail response** (`/public-course?course_id=<X>`) returns a
richer shape, including fields absent from the list response:

```json
{
  "_id": "692d39b52ee07293c9131fd8",
  "course_id": "COPILOT-STU",
  "course_name": "AI Agents with Microsoft Copilot Studio",
  "course_teaser": "เรียนรู้การทำงานของ Microsoft Copilot Studio...",
  "course_trainingdays": 1,
  "course_traininghours": 6,
  "course_price": 7500,
  "course_cover_url": "https://res.cloudinary.com/.../covers/...png",
  "course_levels": "2",
  "sort_order": 0,
  "program": { "_id": "...", "program_id": "CPS", "program_name": "Copilot Studio", "programiconurl": "..." },
  "skills": [
    { "_id": "...", "skill_id": "AI", "skill_name": "AI", "skilliconurl": "...", "skillcolor": "#dee6f1" }
  ],
  "previous_course": null,
  "related_courses": [ /* pre-computed, 2-5 courses */ ]
}
```

Quirks:
- All top-level field names are `snake_case`, not camelCase.
- `course_trainingdays` is an integer day count. The detail response
  also provides `course_traininghours` — prefer that over computing
  `days * 6`. The list response does NOT include `course_traininghours`,
  so fall back to `days * 6` when absent.
- `skills` shape differs by response:
  - **List response:** array of ObjectId strings. Map these to UI
    skill slugs via the table in "Skill slug mapping" above
    (`findSkillBySlug` in `src/config/site.js`).
  - **Detail response:** array of full skill objects, including
    `skilliconurl`, `skillcolor`, `skill_name`, `skill_id`, `_id`.
    No extra fetch needed to render skill chips.
- `program.programiconurl` and `course_cover_url` are already-usable
  absolute Cloudinary URLs.
- `course_levels` is a string `"1"` | `"2"` | `"3"` (1=Beginner,
  2=Intermediate, 3=Advanced).
- `related_courses` is pre-computed by upstream; render as-is, each
  entry is a list-shape course object.

### Schedule item (from `/schedules`)

Status and type use lowercase strings:

- `status`: `"open"` | `"nearly_full"` | (others TBD)
- `type`: `"classroom"` | `"hybrid"`

Per Manifesto §4.3 we **do not normalize** these values at the adapter
layer — each consuming page handles its own casing.

### Career path (from `/career-path`)

```json
{
  "slug": "prompt-engineer-career-path",
  "title": "Prompt Engineer"
}
```

Quirk: `slug` **already contains the `-career-path` suffix**. The
`careerPathHref()` utility in `src/lib/utils.js` is idempotent — it
detects the existing suffix and avoids double-appending.

### Promotion (from `/promotions`)

Returned under the canonical `{ ok, summary: { total, … }, items }`
envelope. Field-level shape to be documented when first consumed.

## Verification status

| Domain           | Adapter file                              | Path                 | curl-verified |
| ---------------- | ----------------------------------------- | -------------------- | ------------- |
| Public courses   | `src/lib/api/public-courses.js`           | `/public-course`     | 2026-04-22    |
| Schedules        | `src/lib/api/schedules.js`                | `/schedules`         | 2026-04-22    |
| Career paths     | `src/lib/api/career-paths.js`             | `/career-path`       | 2026-04-22    |
| Promotions       | `src/lib/api/promotions.js`               | `/promotions`        | 2026-04-22    |
| FAQs             | `src/lib/api/faqs.js`                     | `/faqs`              | 2026-04-22    |
| Contact us       | `src/lib/api/contact-us.js`               | `/contact-us`        | 2026-04-22    |
| Skills           | `src/lib/api/skills.js`                   | `/skills`            | 2026-04-22    |
| Programs         | `src/lib/api/programs.js`                 | `/programs`          | 2026-04-22    |

## Envelope variants

Upstream returns one of two shapes. Our `unwrap()` helper in `client.js`
flattens both to `{ items, total }`.

**Canonical envelope** (faqs, contact-us, promotions, schedules):

```json
{
  "ok": true,
  "summary": { "total": 42 },
  "items": [ … ]
}
```

**Paginated envelope** (career-path, public-course):

```json
{
  "ok": true,
  "total": 42,
  "page": 1,
  "limit": 20,
  "items": [ … ]
}
```

## Query parameters — documented examples

### `/public-course`
- `?skill=<skill_id>` — filter by skill
- `?program=<program_id>` — filter by program
- `?course_id=<short_code>` — single course by short code (e.g. `COPILOT-STU`)

### `/schedules`
- `?date=YYYY-MM-DD` — single day
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — range
- `?date=YYYY-MM-DD&courses=id1,id2,id3` — specific courses on a day
- `?course=<objectId>&limit=N` — upcoming schedules for one course

### `/career-path`
- `?limit=50` — list (default limit is small)
- `?q=<query>` — search
- `?status=all` — include inactive (default is active only)
- `?slug=<slug>` — single item

## Query parameter conventions

Upstream uses inconsistent identifier parameters between endpoints.
Verified 2026-04-23.

| Endpoint           | Identifier param | Value type                                    |
| ------------------ | ---------------- | --------------------------------------------- |
| `/public-course`   | `course_id`      | Short code string (e.g. `COPILOT-STU`)        |
| `/schedules`       | `course`         | MongoDB ObjectId (e.g. `69267e3b...`)         |

### Known quirks

- `/public-course?_id=<objectId>` — the `_id` parameter is **silently
  ignored**. The endpoint returns all 73 courses unfiltered. Always
  use `course_id` for filtering individual courses.
- `/schedules` auto-filters to status `open` or `nearly_full`, a
  non-empty `signup_url`, and `dates >= today`. No need to re-filter
  client-side.

## Known quirks (from v1 experience)

1. **Status casing is inconsistent across domains.** Some return `"active"`,
   others `"Active"`, others `"open"`. Do NOT normalize at the adapter layer
   — handle per-page so we never silently mask upstream changes.
2. **Price fields can be numbers OR numeric strings.** Use `Number(x)` before
   arithmetic or `formatPrice()` from `@/lib/utils`.
3. **Image URLs** may be absolute OR relative paths. Check before rendering
   with Next.js `<Image>` (add `remotePatterns` in `next.config.mjs` for new
   hosts as they appear).
4. **`summary.total` vs `total` at top level** — varies by domain. The
   `unwrap()` helper handles both, prefer using it over reading raw.

## Internal (our MongoDB) domains

Full CRUD via admin panel; schemas in `src/models/`:

| Collection        | Model                    | Purpose                            |
| ----------------- | ------------------------ | ---------------------------------- |
| `admins`          | `Admin.js`               | Admin accounts (bcrypt passwords)  |
| `banners`         | `Banner.js`              | Homepage banners                   |
| `articles`        | `Article.js`             | Blog articles                      |
| `register_public` | `RegisterPublic.js`      | Public class registrations         |
| `register_inhouse`| `RegisterInhouse.js`     | Inhouse enquiry submissions        |
| `recruits`        | `Recruit.js`             | Job postings                       |

Zod validation schemas mirror these in `src/lib/schemas/`, and are shared
between client forms and Server Actions (Manifesto §4.6).
