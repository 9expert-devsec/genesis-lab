# URL Structure

All routes scaffolded in Phase 1. Legend: 🟢 working shell · 🟡 placeholder · 🔒 protected.

## Public pages

| URL                            | Status | Notes                                              |
| ------------------------------ | :----: | -------------------------------------------------- |
| `/`                            | 🟢     | Home (hero + highlights; data in Phase 2)          |
| `/training-course`             | 🟡     | Public courses list                                |
| `/schedule`                    | 🟡     | Training schedule (standalone)                     |
| `/promotion`                   | 🟡     | Promotions                                         |
| `/articles`                    | 🟡     | Blog list                                          |
| `/articles/<slug>`             | 🟡     | Article detail                                     |
| `/about-us`                    | 🟡     | About (static content)                             |
| `/contact-us`                  | 🟡     | Contact + map                                      |
| `/faq`                         | 🟡     | FAQ                                                |
| `/join-us`                     | 🟡     | Careers                                            |
| `/search`                      | 🟡     | On-site search                                     |
| `/career-path-project`         | 🟡     | All career paths                                   |

## Pattern URLs (catch-all dispatcher)

Handled by `src/app/(public)/[...slug]/page.jsx`. Dispatched by suffix.

| Pattern                                  | Dispatches to                         |
| ---------------------------------------- | ------------------------------------- |
| `/<slug>-training-course`                | Course detail (Phase 2)               |
| `/<slug>-career-path`                    | Career path detail (Phase 3)          |
| `/<skill>-all-courses`                   | Catalog by skill (Phase 3, 6 skills)  |
| `/<program>-all-courses`                 | Catalog by program (Phase 3, 21 progs)|

Anything else under `(public)` that doesn't match these suffixes → 404.

## Registration

| URL                             | Status | Notes                                         |
| ------------------------------- | :----: | --------------------------------------------- |
| `/registration/public`          | 🟡     | Public class registration form                |
| `/registration/in-house`        | 🟡     | Corporate / in-house enquiry form             |

Accepts query params: `?class=<classId>&course=<courseId>` for public registration.

## Admin (🔒 all protected by `src/middleware.js`)

| URL                             | Status | Notes                                         |
| ------------------------------- | :----: | --------------------------------------------- |
| `/admin/login`                  | 🟡     | Visual shell (form wiring in Phase 2)         |
| `/admin`                        | 🟡🔒   | Dashboard                                     |
| `/admin/accounts`               | 🟡🔒   | Admin account CRUD                            |
| `/admin/registrations`          | 🟡🔒   | View/update registrations                     |
| `/admin/banners`                | 🟡🔒   | Homepage banner CRUD                          |
| `/admin/articles`               | 🟡🔒   | Article CRUD                                  |
| `/admin/recruits`               | 🟡🔒   | Job posting CRUD                              |

## External redirects

| URL                | Destination                               |
| ------------------ | ----------------------------------------- |
| `/online-course`   | https://academy.9experttraining.com (301) |
| `/online-course/*` | https://academy.9experttraining.com/*     |

Configured in `next.config.mjs` — does not create a Next.js page.

## API routes

| URL                                 | Purpose                                    |
| ----------------------------------- | ------------------------------------------ |
| `/api/auth/[...nextauth]`           | NextAuth.js endpoints (signin, callback)   |
| `/api/banners`                      | Banner CRUD (Phase 2)                      |
| `/api/articles`                     | Article CRUD (Phase 3)                     |
| `/api/register/public`              | Public registration submission (Phase 2)   |
| `/api/register/in-house`            | Inhouse registration submission (Phase 2)  |

## Not built here (external)

- **Online courses** → academy.9experttraining.com
- **Course bundles, portfolio, reviews** → dropped from scope (Manifesto §5)
- **Certificates, tax invoices, receipts** → FlowAccount UI directly
