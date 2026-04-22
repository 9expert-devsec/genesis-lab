# External API — Domain Reference

> Source of truth: `9Expert_MSDB_API__-_Integration_Guide.docx`. This file
> tracks **curl-verified** paths, envelope shapes, and quirks per domain.
> Update after verifying each endpoint against the live API.

## Base

- Base URL: `https://9exp-sec.com/api/ai`
- Auth: `x-api-key: <AI_API_KEY>` header on every request
- Env vars: `AI_API_BASE`, `AI_API_KEY`

## Verification status

**⚠️ The integration guide mixes singular/plural paths in examples.** Before
wiring any page to a domain, run `curl -H "x-api-key: $AI_API_KEY" <url>`
and pin the path that returns 200. Update the `// curl-verified:` stamp in
the corresponding `src/lib/api/<domain>.js` adapter.

| Domain           | Adapter file                              | Path (tentative)     | curl-verified |
| ---------------- | ----------------------------------------- | -------------------- | ------------- |
| Public courses   | `src/lib/api/public-courses.js`           | `/public-courses`    | ❌ not yet    |
| Schedules        | `src/lib/api/schedules.js`                | `/schedules`         | ❌ not yet    |
| Career paths     | `src/lib/api/career-paths.js`             | `/career-path`       | ❌ not yet    |
| Promotions       | `src/lib/api/promotions.js`               | `/promotions`        | ❌ not yet    |
| FAQs             | `src/lib/api/faqs.js`                     | `/faqs`              | ❌ not yet    |
| Contact us       | `src/lib/api/contact-us.js`               | `/contact-us`        | ❌ not yet    |

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

**Paginated envelope** (career-path, public-courses):

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

### `/public-courses`
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
