# 9exp-genesis-lab v2 — Manifesto

> The north-star document. Every architectural decision, feature addition, or refactor
> should be measured against this. If something in this document becomes wrong,
> update the Manifesto *first*, then change the code — not the other way around.

---

## 1. What this project is

**9exp-genesis-lab v2** is a ground-up rebuild of the 9Expert Training public website
and internal admin panel, consolidating what used to be a sprawling legacy codebase
into a single, modern, maintainable Next.js application.

It is **not** a faithful port. It is a **deliberate redesign** — dark-themed,
component-driven, SEO-preserving at the URL level but free to reimagine everything
behind the URL.

---

## 2. Why v2 exists (the failure mode we are avoiding)

v1 failed because:
- Faithful-port discipline locked us into legacy shapes that didn't fit modern Next.js
- Scope crept — features we didn't need were carried forward because "they were there"
- TypeScript overhead slowed iteration without commensurate benefit at our scale
- Too many decisions were deferred, then made reactively under time pressure

v2 corrects each of these:
- **No legacy code.** Only URL structure and external API contracts are preserved.
- **Explicit scope.** 17 features enumerated. `online-course`, `bundle`, `portfolio`,
  `review`, `receipt`, `tax-invoice`, `certificate`, `instructor` are out.
- **JavaScript + JSX only.** Zero TypeScript, even at infrastructure layers.
- **Decisions made up-front and locked.** The stack table below does not change
  without updating this Manifesto.

---

## 3. The locked stack

| Concern              | Choice                                              |
| -------------------- | --------------------------------------------------- |
| Framework            | Next.js 15 (App Router)                             |
| Language             | JavaScript + JSX                                    |
| Styling              | Tailwind CSS                                        |
| UI components        | Shadcn/UI (copy-paste, owned) + Lucide icons        |
| Auth                 | NextAuth.js v5 (Credentials + Mongoose adapter)     |
| Data fetching        | RSC + Server Actions (default), SWR (client-only)   |
| Form validation      | Zod schemas + react-hook-form                       |
| Architecture         | Unified Next.js monorepo                            |
| Database             | MongoDB (Mongoose)                                  |
| Image storage        | Cloudinary                                          |
| Transactional email  | Postmark                                            |
| Deploy               | Vercel                                              |
| DNS / CDN            | Cloudflare                                          |
| External API auth    | `x-api-key` header                                  |

---

## 4. Principles

### 4.1 Design-first
For any feature with non-trivial shape (schemas, multi-step flows, admin CRUD),
propose the shape (data model, routes, state transitions) **before** writing code.
Approval, then implementation.

### 4.2 One feature per commit
Commits are scoped. A commit message should tell a future maintainer exactly
what changed and why. No "misc fixes" commits.

### 4.3 Evidence over assumption
When integrating with the external `9exp-sec.com/api/ai`:
- `curl` the endpoint before writing the schema
- Confirm the envelope variant (canonical vs paginated)
- Confirm status casing per domain (do not normalize)
- Confirm path (remember `/schedules` is the one plural)

### 4.4 Explicit scope
If the ask is feature X, build feature X. Do not quietly add feature Y "because it
might be useful." Future Y goes in the backlog, not in this PR.

### 4.5 Server-first rendering
Default to React Server Components. Client Components are opt-in, for genuine
interactivity only. This keeps the bundle small and SEO strong — both matter for
a course-catalog site.

### 4.6 Schema as single source of truth
Zod schemas define validation once. Client forms, Server Actions, and API route
handlers all import the same schema. No duplicated rules.

### 4.7 Upstream quirks are handled at the edge
When external API returns inconsistent casing, variant envelopes, or odd field
names, wrap those quirks in a thin adapter layer (`lib/api/<domain>.js`).
Downstream code sees clean, consistent shapes.

### 4.8 Cache at the right layer

Upstream read-only data (courses, schedules, career paths, programs,
faqs, contact, promotions) is cached via Next.js ISR with appropriate
`revalidate` intervals (typically 1 hour). We do NOT mirror upstream
data into our MongoDB.

Mirroring upstream into our DB is a different pattern for a different
problem — cross-domain queries, aggregation, offline access — and adds
infrastructure surface area (cron jobs, data drift, failure recovery)
without solving any current performance issue at our scale.

When an admin action needs upstream data to refresh immediately, use
`revalidateTag()` from a Server Action, not a scheduled sync job.

---

## 5. Scope — what we are building

### HIGH priority (10)
1. Home
2. Public courses list (`/training-course`)
3. Schedule (`/schedule`)
4. Course detail (`/<slug>-training-course`) — schedule embedded as tab
5. Register (public class) (`/registration/public`)
6. Register (inhouse) (`/registration/in-house`)
7. Admin panel — accounts + registrations
8. Banner management
9. "Online" menu → external redirect to `academy.9experttraining.com`
10. (reserved)

### MEDIUM priority (11)
1. Promotion (`/promotion`)
2. Career Path (`/career-path-project` + `/<slug>-career-path`)
3. Contact (`/contact-us`)
4. About (`/about-us`)
5. Articles (`/articles` + `/articles/<slug>`)
6. Search (`/search`)
7. FAQ (`/faq`)
8. Join us (`/join-us`)
9. Course catalog by skill (`/<skill>-all-courses`) — 6 skills
10. Course catalog by program (`/<program>-all-courses`) — 21 programs
11. **ผลงานของเรา (portfolio)** — `/portfolio` — visual project showcase

### Explicitly excluded
`online-course` (external), `bundle`, `review`, `receipt`,
`tax-invoice`, `certificate`, `instructor`, `course-group`,
`course-homepage`, `technology-area`.

(`portfolio` was previously excluded but was moved back to MEDIUM
priority on 2026-04-22 based on nav parity with the live site.)

---

## 6. Data boundaries

### External (read-only, via `9exp-sec.com/api/ai`)
`faqs`, `contact-us`, `public-course`, `schedules`, `career-path`, `promotions`.
Admin UIs for these live on the upstream MSDB system, not here.

### Internal (full CRUD, our MongoDB)
`admin`, `banner`, `article`, `register-public`, `register-inhouse`, `recruit`.

The boundary is strict. We never try to write to external domains. We never
try to re-host read-only data in our Mongo.

**Promotions are strictly read-only from MSDB** *(clarified 2026-07-15)*. An
earlier build let admins create/edit promotions in Genesis and dual-wrote them
back to MSDB, with a loop-back webhook to avoid echo. That violated the boundary
above and has been removed: `source`, `msdb_id`, the MSDB write-back, and the
anti-loop webhook branch are all gone. The flow is now one-directional — a promo
is created in MSDB, synced down as a catalogue row (title, cover, short text,
date range), and its detail page is authored here in the Page Builder and linked
by `promotion_id`. MSDB never learns Genesis exists.

---

## 7. Design system anchors

- **Palette:** dark-mode-first. Navy `#0D1B2A` background, card `#132638`,
  brand blue `#2486FF`, lime CTA `#D4F73F`.
- **Typography:** LINE Seed Sans TH (Thai primary), Inter (English / numerals).
- **Iconography:** Lucide, 1.5–2px stroke, outline style.
- **Motion:** 200ms micro, 300ms reveal, 500ms page, `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Hover pattern:** `translateY(-2px)` + shadow increase.
- **Breakpoints:** 640 / 768 / 1024 / 1280.

These are CI tokens — they live in `tailwind.config.js` and as CSS variables.
Pages and components never hardcode colors.

---

## 8. Phasing

- **Phase 1 — Foundation.** Scaffold, config, CI tokens, root layout, empty
  placeholder pages for all 17 routes, home shell with no data.
- **Phase 2 — HIGH priority.** Feature by feature, in priority order. Home →
  courses list → course detail → schedule → registration flows → admin.
- **Phase 3 — MEDIUM priority.** Articles, promotions, career paths, static
  pages, catalog-by-skill and catalog-by-program.
- **Phase 4 — Polish.** SEO metadata, OG images, sitemap, robots, analytics,
  performance budget enforcement, accessibility audit.

Each phase ends when its features are deployed to Vercel and verified on a
preview URL. We do not start the next phase until the previous one is green.

---

## 9. Non-goals (for this project, intentionally)

- We build a **narrow, brand-locked page builder** — not a general-purpose CMS.
  *(Amended 2026-07-15.)* The original non-goal read "we will **not** build a
  CMS." That is no longer true, and here is why it stopped being true: the
  marketing team needs to author promotion and landing pages **without a
  developer in the loop**, and the one primitive we gave them for it — a raw
  HTML box on `CustomPage` — proved to be the wrong tool. Raw HTML is unsafe to
  hand to non-developers, impossible to keep on-brand, and produces pages no one
  can restyle when the design system moves. So we are replacing it with a
  section-based **Page Builder**: a fixed catalogue of preset-driven,
  CI-token-locked section components the team composes on a canvas. The
  constraint that actually mattered still holds — this is **not** a
  general-purpose, multi-tenant, plugin-extensible CMS. It is a page builder for
  **one brand, one site**, with a curated section set and no user-authored code
  paths (raw HTML/CSS stays gated to the `developer` tier). Legacy `advanced_html`
  pages remain for the exceptions; new pages default to the builder.
- We will **not** support multi-tenant. One brand, one site.
- We will **not** build a certificate generator. That concern moved out.
- We will **not** handle payments on-site. FlowAccount handles invoicing
  externally.
- We will **not** build online course delivery. `academy.9experttraining.com`
  owns that.

---

## 10. How to change this Manifesto

Edit it in a PR. One PR, one principle change. Explain *why* the previous
decision no longer holds. Then — and only then — change the code.

---

*Last ratified: 2026-07-15 (Page Builder — amended §9 to allow a narrow brand-locked page builder; clarified §6 that promotions are strictly read-only from MSDB, dual-write removed)*
