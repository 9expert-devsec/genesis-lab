# main-only audit + masterclass-host retirement blast radius — 2026-09-07

Read-only measurement. No merge, no `merge-tree`, no cherry-pick, no build, no
tests. Nothing committed; no refs modified beyond `git fetch --no-tags origin`.

Two questions:
(a) which `origin/main` commits are genuinely missing from `origin/dev`;
(b) what breaks when `masterclass.9experttraining.com` is retired onto `www`.

---

## 1. Snapshot

| ref | sha | date | subject |
| --- | --- | --- | --- |
| `origin/main` | `ea0787275cb47f8ca543415e1a05143ad0b0668f` | 2026-08-31 | refactor(masterclass): move Early Bird deadline above the register button |
| `origin/dev`  | `65a17d294ff041474607f52d17c3202a9e6c9af9` | 2026-09-07 | test(actionsParse): a real V8 parse, because sucrase is not one |
| `HEAD` (dev)  | `65a17d294ff041474607f52d17c3202a9e6c9af9` | 2026-09-07 | (identical to `origin/dev`) |

- **merge-base** = `5a457640181aff01ffce6b2465a95717c81c1e4f` — **unchanged** from
  the 2026-08-25 measurement (`5a45764`). Neither branch has been merged into or
  rebased onto the other since.
- `git rev-list --left-right --count origin/dev...origin/main` → **560 dev-only / 69 main-only**
- Main-only is **69**, up from **64** on 2026-08-25.
- `git cherry` covers 68 of the 69; the 69th is a merge commit (`2b0dfb01`,
  2026-06-26), which `git cherry` skips by design.
- `git diff --name-only origin/dev origin/main` → set **D** = **1829 paths**.

## 2. Patch-id equivalence (`git cherry -v origin/dev origin/main`)

- `-` (equivalent patch already on dev): **51**
- `+` (no equivalent found): **17**

The commit-count divergence of 69 overstates the real gap by ~4x before §3 is
applied at all.

## 3. The "+" table — effective-content check

Verdict by intersecting each commit's touched paths with **D**. The
still-differing column is `main-adds / main-removes` per path from
`git diff --numstat origin/dev origin/main`. **A large "removes" number means dev
is AHEAD on that file, not behind** — the single most misleading thing in the raw
commit list, and why several LIVE rows below are not port candidates.

| sha | date | author | subject | bucket | verdict | still-differing paths (`+main / −main`) |
| --- | --- | --- | --- | --- | --- | --- |
| `cb69a755` | 2026-06-22 | Pirasak S. | masterclass sub domain | gate (+ masterclass-product, config/tracking, other) | **LIVE** | `src/middleware.js` 22/23 · `src/config/site.js` 81/140 · `MasterclassRegisterClient.jsx` 566/27 · `src/app/(public)/layout.jsx` 4/11 · `PublicHeader.jsx` 5/79 · `PublicHeaderClient.jsx` 9/**1689** |
| `f408c98d` | 2026-06-22 | Pirasak S. | update href | other | **LIVE** | `src/components/brand/Logo.jsx` 9/23 |
| `a420723d` | 2026-06-22 | Pirasak S. | logo 9expert | other | **LIVE** | `src/components/brand/Logo.jsx` 9/23 |
| `22c8224d` | 2026-06-22 | Pirasak S. | fix middleware | gate | **LIVE** | `src/middleware.js` 22/23 |
| `cc741b7a` | 2026-06-22 | Pirasak S. | fix logo | other | **LIVE** | `src/components/brand/Logo.jsx` 9/23 |
| `126f8b77` | 2026-06-23 | Pirasak S. | update component | masterclass-product | **LIVE** | `MasterclassRegisterClient.jsx` 566/27 |
| `339c9b70` | 2026-06-24 | Pirasak S. | feat(masterclass): add per-choice info popup and global license acknowledgement | masterclass-product | **LIVE** (partial) | `MasterclassRegisterClient.jsx` 566/27 — its other 2 files (`MasterclassCourseFormClient.jsx`, `models/MasterclassCourse.js`) are identical on dev |
| `cf110f09` | 2026-06-29 | Pirasak S. | fix api credit card final | gate | **LIVE** (see §3.3) | `src/middleware.js` 22/23 |
| `d8358982` | 2026-07-01 | Pirasak S. | fix filter course public / online | other | **LIVE** | `ProgramSelector.jsx` 43/48 · `src/app/page.jsx` 20/107 · `syncLandingData.js` 22/267 · `syncNavMenuData.js` 2/190 |
| `3a7bf9fe` | 2026-07-23 | Pirasak S. | edit og image default | masterclass-product (+ other) | **LIVE** (partial) | `(public)/masterclass/[slug]/page.jsx` 17/2 · `src/app/layout.jsx` 1/60 — `src/lib/seo/ogImage.js`, `test/pure/ogImage.test.mjs` and the OG png are identical on dev |
| `5a519c82` | 2026-07-24 | 9expert-devsec | fix: serve sitemap.xml and robots.txt from masterclass deployment | gate (+ config/tracking, masterclass-product, other) | **LIVE** | 20 paths. New-on-main: `scripts/verify-seo.mjs` 228/0 · `src/lib/masterclass/routeAccess.js` 55/0 · `test/pure/masterclassRoute.test.mjs` 72/0 · `src/lib/masterclass/getMasterclass.js` 20/0. Also `src/app/robots.js` 17/4 · `src/app/sitemap.js` 37/139 · `src/config/site.js` 81/140 · `src/middleware.js` 22/23 · `generateJsonLd.js` 6/2 · `(public)/masterclass/[slug]/page.jsx` 17/2 · six `(public)/*/page.jsx` at 3/2 · `articles/[slug]/page.jsx` 7/47 · `[...slug]/page.jsx` 64/654 · `schedules.js` 28/188 · `buildCourseJsonLd.js` 9/19 · `.gitignore` 0/24 |
| `bb4671e8` | 2026-08-11 | Pirasak S. | feat(address): the 2026 postcode dataset, and a build-time derivation of it (A1, A2, A3) | other (address) | **ABSORBED** | only `package.json` 1/10, and that is dev-side surplus (§3.1) |
| `3f0a9a18` | 2026-08-11 | Pirasak S. | feat(address): one reader for the postcode index, shaped so the district cannot be wrong (A2, B2) | other (address) | **ABSORBED** | none — `src/lib/address/postcodeIndex.js` identical on dev |
| `7e1e9cc6` | 2026-08-16 | NU-YaniP | feat(masterclass): add course-detail link button to registration batch summary | masterclass-product | **LIVE** | `MasterclassRegisterClient.jsx` 566/27 |
| `02a5fe5c` | 2026-08-20 | Pirasak S. | feat(masterclass): per-batch quote_enabled toggle for quotation registration | masterclass-product | **ABSORBED** (content-verified) | `src/app/api/masterclass/register/route.js` 1/2 — dev already carries the `isQuoteEnabled` import and the `quote_disabled` 409 guard verbatim; the 1/2 is unrelated drift. `quoteAccess.js`, `MasterclassBatch.js`, `MasterclassBatchListClient.jsx` all identical on dev. |
| `8264b080` | 2026-08-20 | Pirasak S. | feat(masterclass): disable the quotation option when quote_enabled is off | masterclass-product | **LIVE** | `MasterclassRegisterClient.jsx` 566/27 |
| `c01f61c2` | 2026-08-30 | NU-YaniP | feat(masterclass): per-course prep checklist in MC_PAID/MC_QUOTE emails | email | **SUPERSEDED** | `src/lib/email/template-senders/masterclass.js` 2/4 — §3.2 |

Totals: **13 LIVE · 3 ABSORBED · 1 SUPERSEDED**.

### 3.1 Trap — `src/lib/address/*` (confirmed)

The postcode work landed on both branches under different SHAs, as the
2026-08-25 note predicted. None of `src/data/postcode-index.generated.json`,
`src/data/thailand_postcode_2026.json`, `src/data/postcode-overrides.json`,
`scripts/derive-postcode-index.mjs` or `src/lib/address/postcodeIndex.js` is in
D. Two commits, zero content gap.

`bb4671e8`'s only surviving path is `package.json`, and the diff runs the wrong
way: dev's `scripts` and `devDependencies` are a strict superset of main's (dev
adds `test:browser`, four audit/migrate scripts, `@vercel/blob`, `parse5`,
`jsdom`, `sucrase`). main holds nothing there that dev lacks.

The only `src/lib/address/*` files in D are `formatBillingAddress.js` and
`formatThaiAddress.js`, and no "+" commit touches either.

### 3.2 Trap — `src/lib/email/**` (SUPERSEDED, not missing)

18 email/promotion paths sit in D (`postmark-variables.js`, six
`templates/registration-*.js`, five `models/*`, four `template-senders/*`,
`sendPlan.js`, `admin/promotions/_components/PromotionModal.jsx`). Per standing
ruling these are dev-side supersessions.

`c01f61c2` is the only "+" commit landing in them, and its effect is verifiably
already on dev: `src/lib/email/buildPrepModel.js` exists on dev byte-identical to
main's, and dev's `template-senders/masterclass.js` already imports it, calls it
at both the MC_PAID and MC_QUOTE sites, and spreads `...prepModel` into both
payloads — same wiring, different line numbers. **SUPERSEDED. Do not port.**

### 3.3 The three middleware commits are not what they look like

`22c8224d` and `cf110f09` are LIVE only because `src/middleware.js` is in D.
Their *text* is already on dev: dev's `isMasterclassRoute` contains the
`/masterclass/payment/` early-return (cf110f09) and the
`/brand/ /assets/ /fonts/ /icons/` allowances (22c8224d) verbatim.

What dev lacks is the wiring. On dev: `isMasterclassRoute` is defined but
**never called** — dead code; there is no redirect block in the `auth()` handler;
`config.matcher` is `['/admin/:path*']` only; and
`src/lib/masterclass/routeAccess.js`, `scripts/verify-seo.mjs` and
`test/pure/masterclassRoute.test.mjs` **do not exist on dev at all**.

The masterclass-only gate is inert on dev. `5a519c82` is the commit that
extracted the predicate and switched the gate on.

### 3.4 Several LIVE rows have dev ahead, not behind

By direction of change these are main being *older*, not main holding something
dev needs: `PublicHeaderClient.jsx` (−1689), `Logo.jsx` (dev carries 23 lines of
CI colour documentation main lacks, main adds 9), `d8358982`
(`syncLandingData.js` −267, `syncNavMenuData.js` −190, `page.jsx` −107),
`src/app/layout.jsx` (−60/+1), and inside `5a519c82` the `.gitignore`,
`[...slug]/page.jsx` (−654) and `schedules.js` (−188). Divergence, not backlog.

---

## 4. REDIRECT: path shape — **LANDS**

A 1:1 path-preserving host redirect is the correct shape. Evidence, from actual
route files rather than the gate whitelist:

| branch | masterclass detail route file | public URL |
| --- | --- | --- |
| `origin/main` | `src/app/(public)/masterclass/[slug]/page.jsx` | `/masterclass/<slug>` |
| `origin/dev`  | `src/app/(public)/masterclass/[slug]/page.jsx` | `/masterclass/<slug>` |

`(public)` is a Next.js route group — parenthesised segments contribute nothing
to the URL — so both branches serve the identical public path. The supporting
routes match too, on both branches: `masterclass/page.jsx` (`/masterclass`),
`masterclass/[slug]/register/page.jsx`, `masterclass/payment/complete/page.jsx`.

**Does main serve anything masterclass-related at the ROOT of the host? No.**

- `git show 'origin/main:src/app/(public)/[...slug]/page.jsx' | grep -i masterclass`
  → **zero matches**. The root catch-all resolves courses, career paths and
  custom pages; it never resolves a masterclass record. Same on dev: zero.
- `git show origin/main:src/app/page.jsx | grep -i masterclass` → **zero
  matches** (the one `masterclass`-adjacent hit is the word "custom slug" in an
  unrelated comment at line 76).

So every masterclass URL on the retiring host is already under `/masterclass/…`,
and `www` serves that same prefix. `source: '/:path*' → https://www.9experttraining.com/:path*`
maps correctly with no rewriting.

**Already built, and already env-gated.** `origin/dev`'s `next.config.mjs`
carries this rule, inert until armed:

```js
const masterclassRedirectHost = process.env.MASTERCLASS_REDIRECT_HOST;
const masterclassHostRedirect = masterclassRedirectHost
  ? [{ source: '/:path*',
       has: [{ type: 'host', value: masterclassRedirectHost }],
       destination: 'https://www.9experttraining.com/:path*',
       permanent: true }]
  : [];
```

Its comment block records measured behaviour (Next 15.5.15): the masterclass host
308s path-for-path, `www` is *not* caught, and localhost is not caught. **To arm:
set `MASTERCLASS_REDIRECT_HOST` on the redirecting deployment only.** `origin/main`
has no such rule.

### 4.1 ⚠ Two root-served files the blanket rule will swallow

main's `routeAccess.js` deliberately exempts `/sitemap.xml` and `/robots.txt`
from the gate, with the reasoning written in: Googlebot fetches them directly, and
if the redirect swallows them the crawler never reaches the deployment's URLs.
A `'/:path*'` host rule catches both.

At cutover that is *intended* — but it only works if `www` already lists the
masterclass URLs, and **it does not**:

| branch | `src/app/sitemap.js` masterclass references |
| --- | --- |
| `origin/main` | imports `getPublishedMasterclassSlugs`, emits `${base}/masterclass/${slug}` for every published course |
| `origin/dev`  | **zero references** |

main's sitemap is the *only* thing listing masterclass URLs, and it dies with the
host. **This is not fixable by a redirect.** Port the masterclass branch of
`sitemap.js` (and `getPublishedMasterclassSlugs`, which is main-only at 20/0) to
`www` *before* arming the redirect, or the masterclass pages drop out of the
index with nothing advertising their new home.

---

## 5. MUST PORT BEFORE CUTOVER

LIVE commits in buckets **masterclass-product** + **payment** only.

| sha | date | subject |
| --- | --- | --- |
| `126f8b77` | 2026-06-23 | update component |
| `339c9b70` | 2026-06-24 | feat(masterclass): add per-choice info popup and global license acknowledgement |
| `3a7bf9fe` | 2026-07-23 | edit og image default — *only the `(public)/masterclass/[slug]/page.jsx` half (17/2); `src/app/layout.jsx` is dev-ahead* |
| `7e1e9cc6` | 2026-08-16 | feat(masterclass): add course-detail link button to registration batch summary |
| `8264b080` | 2026-08-20 | feat(masterclass): disable the quotation option when quote_enabled is off |

**The payment bucket is empty.** Nothing in the "+" set touches
`src/app/api/webhooks/omise` or `src/components/payment`. `cf110f09` ("fix api
credit card final") sounds like payment but only edits `src/middleware.js`, so it
buckets as **gate** — and its line is already on dev.

Four of the five collapse onto one file,
`src/app/(public)/masterclass/[slug]/register/_components/MasterclassRegisterClient.jsx`,
where main is **+566 / −27** ahead. The real main-only content is checkout UI,
not logic: `SummaryLine` + `Step2MobileBar` (a mobile bottom bar with collapsed
total, CTA and expandable summary sheet, ~495 lines inside `BatchSummary`),
`TermsModal` (the four-clause Thai terms dialog, ~65 lines), and three smaller
hunks around imports, the step-2 confirm path and the license popup.

Port it as **one reconciled edit, not five cherry-picks** — the commits overlap
heavily and dev has rewritten the surrounding code. `339c9b70`'s license
acknowledgement is already on dev (the `license` token count matches main exactly
at 156), so only its popup/summary hunks are in play.

`02a5fe5c` is deliberately **not** listed: content-verified as already on dev.

Add to this list, from §4.1: the **masterclass branch of `src/app/sitemap.js`**
plus `src/lib/masterclass/getPublishedMasterclassSlugs` — a cutover blocker that
the commit buckets do not surface, because it sits inside gate-bucketed
`5a519c82`.

## 6. GATE — do not port, ticket after 8 Sep

Bucket **gate**. Each encodes "this deployment serves masterclass only and
redirects everything else to www". On a unified `www` they would redirect the
site to itself.

| sha | date | subject | what it actually does |
| --- | --- | --- | --- |
| `cb69a755` | 2026-06-22 | masterclass sub domain | introduces `MASTERCLASS_DOMAIN`, the redirect, and the header/layout trimming for the subdomain build |
| `22c8224d` | 2026-06-22 | fix middleware | static-asset allowances + matcher — **predicate text already on dev**; only the matcher entry is missing |
| `cf110f09` | 2026-06-29 | fix api credit card final | allows `/masterclass/payment/*` (the Omise 3DS return page) past the gate — **already on dev, inside the dead predicate** |
| `5a519c82` | 2026-07-24 | fix: serve sitemap.xml and robots.txt from masterclass deployment | extracts `routeAccess.js` (55 lines, absent on dev), wires the redirect + 308 parent recovery, adds `verify-seo.mjs` (228) and `masterclassRoute.test.mjs` (72), reworks `robots.js` / `sitemap.js` / `config/site.js` for per-domain canonicals |

**Carve-outs to ticket separately** — these are inside `5a519c82` but are SEO
correctness, not gate policy, and survive the host retirement:

- the multi-domain `resolveSiteUrl()` in `src/config/site.js` (81/140) — removes
  the hardcoded canonical-host fallback that silently poisons SEO on a second
  domain;
- `src/app/robots.js` (17/4);
- `src/app/sitemap.js` masterclass branch + `getMasterclass.js` (20/0) — **this
  one is a cutover blocker, see §4.1**;
- `parentMasterclassPath()`'s 308 parent recovery: shared/ad links with a stale
  tail currently recover to the course page instead of stranding on a homepage.
  The blanket host redirect preserves the path, so a stale tail will now 308 to
  `www/masterclass/<slug>/<junk>` and 404 there. Decide whether `www` wants that
  recovery.

`src/config/site.js` is contested by both `cb69a755` and `5a519c82` and is
81/140 divergent — reconcile by hand.

## 7. REPOINT AT SOURCE (not fixable by redirect)

### 7.1 Outbound URL builders

| # | file:line | branch | env var | BUILDS or COMPARES |
| --- | --- | --- | --- | --- |
| 1 | `src/app/api/masterclass/register/charge/route.js:37` | main | `NEXT_PUBLIC_BASE_URL` | **BUILDS** — Omise 3DS `return_uri` |
| 1′ | `src/app/api/masterclass/register/charge/route.js:38` | dev | `NEXT_PUBLIC_BASE_URL` | **BUILDS** — same expression |
| 2 | `src/app/api/registration/public/charge/route.js:80` | dev only | `NEXT_PUBLIC_BASE_URL` | **BUILDS** — 3DS `return_uri` for public registration |
| 3 | `src/config/site.js:39,53,57` (`resolveSiteUrl`) | main | `NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → localhost | **BUILDS** — canonical, OG, JSON-LD |
| 4 | `src/app/api/registration/inhouse/route.js:39`, `src/app/api/registration/public/route.js:80` | main only | `AUTH_URL \|\| ${proto}://${host}` | **BUILDS** — `adminDashboardUrl` in admin emails. Removed on dev (superseded email layer); dev's `headers()` call is for IP only. |
| 5 | `src/lib/actions/redirects.js:295` | dev only | `NEXT_PUBLIC_SITE_URL \|\| NEXT_PUBLIC_BASE_URL` | **BUILDS** |
| 6 | `src/middleware.js:60,74` `MASTERCLASS_DOMAIN` | main | hardcoded `'https://www.9experttraining.com'` | **BUILDS** the redirect `Location`. Note the name is misleading — it holds the **www** host, not the masterclass host. Dead once the host is retired. |

**#1 is the critical one, and the reason a redirect is not sufficient.**

```js
const returnUri = `${process.env.NEXT_PUBLIC_BASE_URL}/masterclass/payment/complete?registrationId=${registrationId}`;
```

Three things about it:

- It is fed by **`NEXT_PUBLIC_BASE_URL`, not `NEXT_PUBLIC_SITE_URL`** — a third
  env var, separate from everything `src/config/site.js` resolves. Repointing
  `NEXT_PUBLIC_SITE_URL` at cutover does **nothing** for payments.
- It has **no fallback**. Unset, the template literal yields the string
  `"undefined/masterclass/payment/complete?…"`, which is handed to Omise as
  `return_uri`. Contrast `resolveSiteUrl()`, which has a four-level chain and
  logs loudly.
- The URL is baked into the charge **at creation time**, before any HTTP redirect
  can act. A 308 on the old host rescues the customer's return hop only while
  that host still resolves in DNS. **Keep `masterclass.9experttraining.com`
  resolving and 308-ing through the full 3DS settlement window** — do not delete
  the DNS record at the same moment the redirect arms, or in-flight card payments
  strand.

### 7.2 Inbound webhook endpoints — repoint in each provider's dashboard

Both branches, identical:

- `src/app/api/webhooks/omise/route.js` → `POST /api/webhooks/omise`
- `src/app/api/webhooks/msdb/route.js` → `POST /api/webhooks/msdb`

main's gate whitelists `/api/` wholesale, so both are **live on the masterclass
host today**. A 308 host redirect is not a safe substitute: POST-with-body
following across a redirect is inconsistent across HTTP clients, and Omise's
sender should not be relied on for it. Repoint these at the source — Omise
dashboard and the MSDB integration config — to the `www` host.

### 7.3 Literal-host references — no action

- `origin/main`: `scripts/verify-seo.mjs:14` (a usage-doc comment) and
  `test/pure/ogImage.test.mjs:16` (`const BASE = 'https://masterclass.9experttraining.com'`,
  a test fixture). Neither is production code.
- `origin/dev`: the literal appears only inside `next.config.mjs` comments; the
  live value comes from `MASTERCLASS_REDIRECT_HOST`.

### 7.4 Email absolute hosts — clean

`git grep -E 'https?://[a-z0-9.-]*(9experttraining|genesis-lab|vercel)' -- src/lib/email/`:

- `origin/dev`: **zero matches**.
- `origin/main`: one — `postmark-variables.js:80`
  `meta_admin_url: 'https://genesis-lab.9expert.app/admin/registrations/abc123'`
  — a **sample fixture** in the documentation constant (neighbouring values are
  `'abc123'` and placeholder names), not a live link.

No masterclass host is baked into any email template or model on either branch.
Email links are built at send time from #4 above (main) or omitted (dev).

---

## 8. Ungrouped LIVE (bucket `other`) — no cutover action

`f408c98d`, `a420723d`, `cc741b7a` (Logo.jsx) and `d8358982` (home/landing
filter). All dev-ahead per §3.4. Recorded for completeness.
