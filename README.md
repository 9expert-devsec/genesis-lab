# 9exp-genesis-lab

> 9Expert Training — v2 rebuild. Clean-slate Next.js app replacing the
> legacy codebase. Dark-mode-first, JavaScript-only, SEO-preserving.

**North-star document:** [`MANIFESTO.md`](./MANIFESTO.md) — always read this before making architectural decisions.

---

## Stack

- **Next.js 15** (App Router) · **JavaScript + JSX only** (no TypeScript)
- **Tailwind CSS** with 9Expert CI design tokens
- **Shadcn/UI** components (copy-paste, owned) + **Lucide** icons
- **NextAuth.js v5** (Credentials + bcrypt) for admin auth
- **Mongoose** for internal MongoDB data
- **Zod + react-hook-form** for form validation
- **SWR** for client-side data fetching (server components are the default)
- **Cloudinary** for image uploads · **Postmark** for transactional email
- **Vercel** for hosting · **Cloudflare** for DNS

---

## Getting Started

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.example` → `.env.local` and fill in real values:

```bash
cp .env.example .env.local
```

Required secrets:
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `MONGODB_URI` — Mongo Atlas connection string
- `AI_API_KEY` — 9exp-sec.com MSDB integration key
- `CLOUDINARY_*` — from Cloudinary dashboard
- `POSTMARK_SERVER_TOKEN` — from Postmark dashboard

### 3. Run

```bash
npm run dev        # → http://localhost:3000
npm run build
npm run start
npm run lint
```

---

## Project structure

```
genesis-lab/
├── MANIFESTO.md                 # Project north-star (read first)
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── layout.jsx           # Root layout + fonts + metadata
│   │   ├── page.jsx             # Home (working shell)
│   │   ├── globals.css          # CI tokens + Tailwind layers
│   │   ├── (public)/            # Public-facing pages (route group)
│   │   │   ├── layout.jsx       # PublicHeader + Footer shell
│   │   │   ├── training-course/…
│   │   │   ├── schedule/…
│   │   │   └── [...slug]/       # Catch-all dispatcher for pattern URLs
│   │   ├── registration/        # Public + inhouse registration forms
│   │   ├── admin/               # Admin panel (protected by middleware)
│   │   └── api/                 # Route handlers (backend)
│   ├── components/
│   │   ├── ui/                  # Shadcn primitives (Button, Card, …)
│   │   ├── layout/              # Header, Footer, AdminSidebar, PagePlaceholder
│   │   ├── brand/               # Logo
│   │   ├── home/                # Home-specific sections (Phase 2)
│   │   ├── course/              # Course cards, schedule tables (Phase 2)
│   │   └── forms/               # Registration forms (Phase 2)
│   ├── lib/
│   │   ├── api/                 # External MSDB adapters (one per domain)
│   │   ├── db/                  # Mongoose connection
│   │   ├── auth/                # NextAuth config
│   │   ├── schemas/             # Zod schemas (shared client+server)
│   │   └── utils.js             # cn(), formatters, URL builders
│   ├── models/                  # Mongoose models
│   ├── middleware.js            # Admin route protection
│   └── config/site.js           # Nav, brand constants
├── public/brand/                # Logos (copied from CI assets)
└── docs/                        # Living documentation
```

---

## Conventions

### Code
- **JavaScript + JSX only.** No TypeScript, anywhere.
- **Server Components by default.** Add `'use client'` only for genuine interactivity.
- **Path aliases:** `@/components/*`, `@/lib/*`, `@/models/*`, `@/config/*`.
- **Import order:** React / Next.js → third-party → `@/lib` → `@/components` → local.

### Styling
- **Tailwind first.** Use CSS variables only for gradients, SVG inline styles, or dynamic runtime colors.
- **CI tokens** live in `tailwind.config.js` and `src/app/globals.css`. Never hardcode hex values in components.
- **Color ratios:** Blues 60% / Highlights 30% / Lime 10% (CI guide, non-negotiable).
- **Motion:** use `duration-9e-micro`, `duration-9e-reveal`, `duration-9e-page` + `ease-9e`.

### Git
- **One feature per commit.** Clear conventional-style messages (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **Never commit `.env.local`.** Use `.env.example` as the template.

### Upstream API
- **Always `curl`-verify** an endpoint before wiring the first page that consumes it.
- Update `// curl-verified: YYYY-MM-DD` stamps in `src/lib/api/*.js` adapters.
- Do **not** normalize upstream status casing — handle per-page (Manifesto §4.3).

---

## Current phase

**Phase 1 — Foundation (complete):**
- Scaffold, config, CI tokens
- Root layout, working home shell
- 17 placeholder routes (public + registration + admin)
- External API adapter stubs (6 domains)
- Mongoose models (6), Zod schemas (5), NextAuth config, admin middleware

**Phase 2 — HIGH priority features** (next):
1. Public courses list (wire `/api/ai/public-courses` — curl-verify path first)
2. Course detail
3. Schedule
4. Registration forms
5. Admin panel (login, accounts, registrations, banners)

See [`MANIFESTO.md`](./MANIFESTO.md) §8 for full phasing.

---

## License

Private. © 9Expert Training.
