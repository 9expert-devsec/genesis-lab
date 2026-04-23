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

Quirks:
- All top-level field names are `snake_case`, not camelCase.
- `course_trainingdays` is an integer day count. Format as
  "N วัน (N×6 ชม.)" — 9Expert's standard is 6 training hours per day.
- `skills` is an array of ObjectId strings, not objects. Map these to
  UI skill slugs via the table in "Skill slug mapping" above
  (`findSkillBySlug` in `src/config/site.js`).
- `program.programiconurl` is an already-usable absolute Cloudinary URL.

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
- `?course=<course_id_or_code>` — single course (code like `MSE-L1` works)

### `/schedules`
- `?date=YYYY-MM-DD` — single day
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — range
- `?date=YYYY-MM-DD&courses=id1,id2,id3` — specific courses on a day

### `/career-path`
- `?limit=50` — list (default limit is small)
- `?q=<query>` — search
- `?status=all` — include inactive (default is active only)
- `?slug=<slug>` — single item

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
