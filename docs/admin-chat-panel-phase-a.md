# Admin chat panel — phase A (genesis side): what exists, and what a panel would reuse

Round A2. Read-only survey on branch `staging` at `e33b6976`, 2026-09-17. No database
connection, no build, no test run — every finding is from source with `file:line` evidence.
The chatbot-side survey runs in parallel and was not read.

**Scope of the panel (from the brief):** thumbs up/down counts, chat-driven search trends
(courses, masterclass, career paths) and full web-chat transcripts, fetched server-to-server
from a new key-guarded chatbot API. No end-user identity, no takeover. Transcripts carry
whatever customers typed (phone numbers, emails).

---

## A. Admin permissions (RBAC)

### A1. How roles and permissions are defined

- **Unit of permission is a page key**, binary (a role either has the page or not). The
  registry is the static `ADMIN_PAGES` array in
  [src/lib/rbac/pages.js:39-195](../src/lib/rbac/pages.js#L39-L195); `ALL_PAGE_KEYS`
  ([:201](../src/lib/rbac/pages.js#L201)) and `PAGE_KEYS_BY_GROUP`
  ([:207-209](../src/lib/rbac/pages.js#L207-L209)) are derived from it.
- **Roles are DB documents** (`Role`, collection `roles`) carrying `pages: [String]`
  ([src/models/Role.js:28](../src/models/Role.js#L28)), an orthogonal `tier`
  (`editor|marketing|developer`, [:35](../src/models/Role.js#L35)) and the singleton
  `isSuperadmin` flag ([:43](../src/models/Role.js#L43)). A pre-validate hook prunes any key
  not in `ALL_PAGE_KEYS` ([:59-65](../src/models/Role.js#L59-L65)) — so a key that is not
  registered in code **cannot be granted**, even by hand-editing Mongo.
- **Session shape.** The credentials provider looks the role up once at login and puts
  `isSuperadmin`, `pages` (array, or `null` = allow-all sentinel for superadmin) and `tier`
  on the user ([src/lib/auth/options.js:96-116](../src/lib/auth/options.js#L96-L116)).
  Permissions are therefore as fresh as the JWT (`updateAge` ≈ 16 h — noted at
  [src/app/admin/layout.jsx:49-56](../src/app/admin/layout.jsx#L49-L56)).
- **Pure predicate:** `canAccess(user, pageKey)`
  ([src/lib/rbac/access.js:20-24](../src/lib/rbac/access.js#L20-L24)) — client-safe, no
  `auth` import. `menusForUser(user)` ([:55-61](../src/lib/rbac/access.js#L55-L61)) is the
  audit-log read clamp.

### A2. How a page and a server action check a permission

| surface | helper | behaviour | evidence |
|---|---|---|---|
| Server Component page | `requirePage(pageKey)` | returns the session; redirects to `/admin/9x-portal` when unauthenticated, `/admin/403` when lacking the key | [src/lib/rbac/guard.js:27-32](../src/lib/rbac/guard.js#L27-L32) |
| Server action / route handler | `requireAdmin(pageKey)` (`'use server'` module) | throws `Error('UNAUTHENTICATED')` `.status=401` / `Error('FORBIDDEN')` `.status=403`; returns the session | [src/lib/actions/auth.js:23-36](../src/lib/actions/auth.js#L23-L36) |
| Server action (alt.) | `requirePageAction(pageKey)` | same as above without `.status` | [src/lib/rbac/guard.js:38-43](../src/lib/rbac/guard.js#L38-L43) |
| Sidebar visibility | `canAccess(user, item.pageKey)` per nav item | presentation only — the page guard is the enforcement | [src/components/layout/AdminSidebar.jsx:1071-1072](../src/components/layout/AdminSidebar.jsx#L1071-L1072) |

Pattern reference: the dashboard calls `requirePage('dashboard')` first and derives its
*sub-scopes* from the returned session, never from `searchParams`
([src/app/admin/page.jsx:21-22](../src/app/admin/page.jsx#L21-L22)); its server action
repeats the check with `requireAdmin('dashboard')` and `dashboardScopes(session.user)`
([src/lib/actions/dashboard.js:98-100](../src/lib/actions/dashboard.js#L98-L100)).

### A3. How a new key is registered so it appears in the superadmin UI

Adding a row to `ADMIN_PAGES` is the whole registration for **three** things at once:

1. the permission key (`ALL_PAGE_KEYS` → `Role.pages` validation),
2. the checkbox in `/admin/roles` — `RolesClient` receives `pageGroups={ADMIN_PAGES}`
   ([src/app/admin/roles/page.jsx:29](../src/app/admin/roles/page.jsx#L29)) and flattens
   `g.pages` ([RolesClient.jsx:217](../src/app/admin/roles/_components/RolesClient.jsx#L217)),
3. membership of the audit `MENU_ENUM` (`[...ALL_PAGE_KEYS, UNKNOWN_MENU]`,
   [src/models/AdminAuditLog.js:61](../src/models/AdminAuditLog.js#L61)).

It does **not** add a sidebar link: `NAV_GROUPS` in
[AdminSidebar.jsx:243-317](../src/components/layout/AdminSidebar.jsx#L243-L317) is a
separate hardcoded list (the registry says so at
[pages.js:134-140](../src/lib/rbac/pages.js#L134-L140)). Two fs-tier tests hold the lists in
step and will fail a PR that forgets either side:

- [test/fs/rbacNavParity.test.mjs](../test/fs/rbacNavParity.test.mjs) — every registered
  `href` must have a nav entry (exceptions named in `NO_SIDEBAR_LINK`, [:70-88](../test/fs/rbacNavParity.test.mjs#L70-L88)).
- [test/fs/adminNavShape.test.mjs](../test/fs/adminNavShape.test.mjs) — key sets equal minus
  `NO_NAV_ITEM` ([:69-90](../test/fs/adminNavShape.test.mjs#L69-L90)); **group labels and
  order must match** between `ADMIN_PAGES` and `NAV_GROUPS` ([:174](../test/fs/adminNavShape.test.mjs#L174));
  item order within a group must match ([:184](../test/fs/adminNavShape.test.mjs#L184));
  every href must resolve to a real route file under `src/app/admin/` ([:276](../test/fs/adminNavShape.test.mjs#L276)).

A third guard, [test/fs/rbacRegistryMirror.test.mjs](../test/fs/rbacRegistryMirror.test.mjs),
pins the hand-kept mirror in the seed script
([src/scripts/migrate-rbac.mjs:46](../src/scripts/migrate-rbac.mjs#L46), `PAGE_SET` at [:89](../src/scripts/migrate-rbac.mjs#L89)):
a new registry key must either be added to the mirror or allow-listed by name in
`MIRROR_MAY_OMIT` with a reason.

Also relevant: `MENUS_WITHOUT_MUTATIONS` in the audit contract is *derived* from
`ALL_PAGE_KEYS` ([src/lib/audit/auditContract.js:493-495](../src/lib/audit/auditContract.js#L493-L495)),
so a read-only page key needs no contract entry and silently joins that list.

### A4. Current permission keys (from code, registry order)

| group | keys |
|---|---|
| ภาพรวม | `dashboard`, `dashboard_registrations` (href null), `dashboard_system` (href null) |
| การลงทะเบียน | `registrations`, `mc_registrations`, `career_path_registrations` |
| หลักสูตร & ตาราง | `courses`, `schedules`, `schedule_pdf`, `instructors`, `programs`, `career_paths`, `masterclass`, `tnhs_courses` |
| จัดวางหน้าเว็บ | `banners`, `featured_courses`, `featured_online_courses`, `nav_featured_online_courses`, `featured_reviews`, `promotions_banner`, `notifications`, `page_configs` |
| เนื้อหา | `articles`, `promotions`, `pages`, `about`, `contact`, `portfolio`, `nearby_places`, `faqs`, `local_faqs`, `recruits`, `media` |
| ระบบ | `landing_cache`, `webhook_logs`, `redirects`, `audit_log`, `accounts`, `roles`, `security`, `profile` |

38 keys. Source: [src/lib/rbac/pages.js:39-195](../src/lib/rbac/pages.js#L39-L195).

### A5. Adding two keys: aggregate stats vs. transcripts

There is an exact precedent for "one page, two permissions": `dashboard` gates the page and
`dashboard_registrations` / `dashboard_system` gate what it contains
([pages.js:44-74](../src/lib/rbac/pages.js#L44-L74)), resolved once in
[src/lib/dashboard/scopes.js:55-60](../src/lib/dashboard/scopes.js#L55-L60) from the session.

Recommended shape (design only):

| key | role | href | match |
|---|---|---|---|
| `chat_stats` | page + aggregate data (thumbs, trends) | `/admin/chat` | `prefix` (or `exact` if `/admin/chat/sessions` gets its own key) |
| `chat_transcripts` | sessions list + transcript detail | `/admin/chat/sessions` | `prefix` — longest-href-wins in `resolvePageKey` ([pages.js:252](../src/lib/rbac/pages.js#L252)) keeps it from being swallowed by `chat_stats`, exactly as `mc_registrations` sits under `masterclass` ([:81-84](../src/lib/rbac/pages.js#L81-L84)) |

Naming follows the registry's `parent_qualifier` convention ([pages.js:54-56](../src/lib/rbac/pages.js#L54-L56)).
What it takes, per key: one `ADMIN_PAGES` row, one `NAV_GROUPS` row (or a `NO_SIDEBAR_LINK` /
`NO_NAV_ITEM` exception if the transcripts list is reached only from the stats page), one
`migrate-rbac.mjs` mirror entry or `MIRROR_MAY_OMIT` line, the route files, and
`requirePage(...)` at the top of each page. If both live in a **new sidebar group** (e.g.
"แชทบอท"), the group must be added to both lists in the same position, or the
[adminNavShape:174](../test/fs/adminNavShape.test.mjs#L174) group-order test fails.

Nothing needs to be granted by migration: superadmin passes any key via the `pages == null`
sentinel; other roles get the checkbox on `/admin/roles`.

---

## B. Admin shell and building blocks

### B1. Registering a sidebar item; page conventions

- **Sidebar:** add `{ label, href, icon, pageKey, exact? }` to a group in `NAV_GROUPS`
  ([AdminSidebar.jsx:243-317](../src/components/layout/AdminSidebar.jsx#L243-L317)); `icon`
  is a lucide name from the map above it. Group `id` is the collapse-persistence key and must
  stay ascii ([:228-236](../src/components/layout/AdminSidebar.jsx#L228-L236)). Items are
  filtered by `canAccess` at render ([:1072](../src/components/layout/AdminSidebar.jsx#L1072)).
- **Layout:** [src/app/admin/layout.jsx](../src/app/admin/layout.jsx) reads `x-pathname`
  (injected by middleware, [src/middleware.js:34-37](../src/middleware.js#L34-L37)), renders
  the login page bare, otherwise `<AdminSidebar>` + `<AdminContentWrapper>` around
  `children` ([:32-80](../src/app/admin/layout.jsx#L32-L80)). The layout is already dynamic.
- **Page convention** (consistent across 36 of 40 `src/app/admin/*/page.jsx`; the four
  without `force-dynamic` are `403`, `9x-portal`, `banners`, `door`):
  - `page.jsx` is a **Server Component**: `export const metadata = { title }`,
    `export const dynamic = 'force-dynamic'`, `await requirePage(key)` first, read
    `searchParams` (awaited — Next 15), run reads in `Promise.all` / `allSettled`, hand plain
    props to a `'use client'` component in `./_components/`. Examples:
    [audit-log/page.jsx:12-47](../src/app/admin/audit-log/page.jsx#L12-L47),
    [webhook-logs/page.jsx:9-31](../src/app/admin/webhook-logs/page.jsx#L9-L31) (also sets
    `runtime = 'nodejs'`).
  - Filters and paging live in **searchParams, not client state**, so links are shareable
    ([audit-log/page.jsx:17-23](../src/app/admin/audit-log/page.jsx#L17-L23)); the client
    navigates with `router.push` of a rebuilt query
    ([AuditLogClient.jsx:28](../src/app/admin/audit-log/_components/AuditLogClient.jsx#L28)).
  - Page wrapper markup: `<div className="mx-auto max-w-7xl space-y-6">` with an `h1` +
    subtitle ([audit-log/page.jsx:88-94](../src/app/admin/audit-log/page.jsx#L88-L94)).
  - 403 boundary: [src/app/admin/forbidden.jsx](../src/app/admin/forbidden.jsx) and the
    `/admin/403` route that `requirePage` redirects to.

### B2. Charting library, date range, table, pager, empty/error states

- **Charting library: none.** `package.json` has no recharts/chart.js/d3/visx
  ([package.json:32-87](../package.json#L32-L87)). The dashboard draws everything by hand:
  `Sparkline` (inline SVG, [DashboardClient.jsx:1028-1075](../src/app/admin/_components/DashboardClient.jsx#L1028-L1075)),
  `AgeHistogram` (div bars, [:1194](../src/app/admin/_components/DashboardClient.jsx#L1194)),
  `ProportionalBar` (stacked status bar, [:1251](../src/app/admin/_components/DashboardClient.jsx#L1251)),
  a stacked trend bar chart ([:285](../src/app/admin/_components/DashboardClient.jsx#L285)),
  `StatCard` with delta badge ([:1109](../src/app/admin/_components/DashboardClient.jsx#L1109), [:976](../src/app/admin/_components/DashboardClient.jsx#L976)).
  Colours come from [src/lib/dashboard/statusColors.js](../src/lib/dashboard/statusColors.js).
  These are file-local (not exported from a shared module) — reuse means lifting them or
  copying the pattern. `react-countup` is present but is a public-site dependency.
- **Date range:** the dashboard's `RANGE_OPTIONS` button row + a native
  `<input type="date">` from/to form, no dependency
  ([DashboardClient.jsx:50](../src/app/admin/_components/DashboardClient.jsx#L50), [:348-405](../src/app/admin/_components/DashboardClient.jsx#L348-L405));
  range vocabulary and bucket rule in [src/lib/dashboard/ranges.js:21-58](../src/lib/dashboard/ranges.js#L21-L58)
  (`today|week|month|all`, default `all`). The registrations list uses the same control in
  [registrations/_components/FilterPanel.jsx](../src/app/admin/registrations/_components/FilterPanel.jsx).
- **Table + pager:**
  - cursor pager (ก่อนหน้า / ถัดไป) with `limit+1` fetch to detect a next page:
    [readAuditLog.js:34-54](../src/lib/audit/readAuditLog.js#L34-L54) and
    [AuditLogClient.jsx:146-205](../src/app/admin/audit-log/_components/AuditLogClient.jsx#L146-L205);
  - page-number pager: webhook logs (`page`, `pageCount`,
    [webhook-logs/page.jsx:16-31](../src/app/admin/webhook-logs/page.jsx#L16-L31));
  - table cell primitives (`Th`, `CellLink`, `ChevronCell`, `DateCell`, `StatusCell`,
    `fmtDate`) in [registrations/_components/tableParts.jsx:117-342](../src/app/admin/registrations/_components/tableParts.jsx#L117-L342);
  - list URL state helpers `withListQuery` / `pageClampTarget` in
    [src/lib/adminListQuery.js](../src/lib/adminListQuery.js) and the "rows dropped without
    saying so" arithmetic in [src/lib/adminListWindow.js](../src/lib/adminListWindow.js).
- **Detail page shell:** `BackLink`, `DetailHeader`, `SectionCard`, `DL`/`DLRow`,
  `CopyButton`, `DetailError`, `TabList`/`TabPanel` in
  [registrations/_components/detailShell.jsx](../src/app/admin/registrations/_components/detailShell.jsx)
  (exports at [:119](../src/app/admin/registrations/_components/detailShell.jsx#L119), [:213](../src/app/admin/registrations/_components/detailShell.jsx#L213), [:1103](../src/app/admin/registrations/_components/detailShell.jsx#L1103), [:1272-1333](../src/app/admin/registrations/_components/detailShell.jsx#L1272-L1333), [:1600](../src/app/admin/registrations/_components/detailShell.jsx#L1600), [:1738](../src/app/admin/registrations/_components/detailShell.jsx#L1738)).
  These are colocated under `registrations/`, not in `src/components/admin/` — importing them
  across routes works but is a cross-route dependency.
- **Empty / error states:** no shared component found. Dashboard has `EmptyRange`
  ([DashboardClient.jsx:870](../src/app/admin/_components/DashboardClient.jsx#L870)) which
  names the most recent record; the chat panel branches on the `chat_unavailable` code for
  a calm "off" state vs. a red error ([chatClient.js:127-140](../src/lib/chat/chatClient.js#L127-L140)).
  Generic: [src/components/layout/PagePlaceholder.jsx](../src/components/layout/PagePlaceholder.jsx).

### B3. The dashboard as a pattern reference

[src/app/admin/page.jsx](../src/app/admin/page.jsx): `requirePage('dashboard')` →
`dashboardScopes(session.user)` → normalise `?range`, `?from`, `?to` only for a caller who
holds the scope ([:34-45](../src/app/admin/page.jsx#L34-L45)) → `Promise.allSettled([
getDashboardMetrics(range, from, to), scopes.system ? getAllSchedules(...) : null ])`
([:68-77](../src/app/admin/page.jsx#L68-L77)) → `<DashboardClient data=… />`. Reads that the
caller is not scoped for are **not started, then filtered** — they are not started
([:47-52](../src/app/admin/page.jsx#L47-L52)). The action re-checks the guard server-side
([dashboard.js:98-100](../src/lib/actions/dashboard.js#L98-L100)) because `'use server'`
exports are reachable as POST endpoints regardless of who renders the page.

---

## C. Existing calls from genesis to the chatbot

### C1. `/api/chat` proxy

[src/app/api/chat/route.js](../src/app/api/chat/route.js) — `runtime='nodejs'`,
`dynamic='force-dynamic'`, `maxDuration=30` ([:39-62](../src/app/api/chat/route.js#L39-L62)).

| concern | how | evidence |
|---|---|---|
| env read | `process.env.CHATBOT_V2_API_URL` inside `upstreamUrl()`, at request time; `new URL('/api/chat', base)` + `?backend=langchain`; null when unset/unparseable | [:162-174](../src/app/api/chat/route.js#L162-L174) |
| timeout | `AbortSignal.timeout((maxDuration − 5) × 1000)` = 25 s, derived so it fires before the platform kill | [:81-82](../src/app/api/chat/route.js#L81-L82), [:247](../src/app/api/chat/route.js#L247) |
| error mapping | `{ error: code, message: Thai }` — 400 `invalid_json`/`empty_message`, 413 `message_too_long`, 429 `rate_limited`, 502 `upstream_failed`, 503 `chat_unavailable`, 504 `upstream_timeout` | [:25-31](../src/app/api/chat/route.js#L25-L31), [:176-283](../src/app/api/chat/route.js#L176-L283) |
| caching | `cache: 'no-store'` on the upstream fetch | [:246](../src/app/api/chat/route.js#L246) |
| logging | `debug()` gated to non-production; bodies never logged in prod | [:84-93](../src/app/api/chat/route.js#L84-L93) |
| rate limit | per-instance speed bump keyed on IP + sessionId | [src/lib/chat/rateLimit.js](../src/lib/chat/rateLimit.js), [:209-229](../src/app/api/chat/route.js#L209-L229) |
| auth header | **none** — the upstream chat endpoint is called with no key | [:233-248](../src/app/api/chat/route.js#L233-L248) |

### C2. Feedback proxy

[src/app/api/chat/feedback/route.js](../src/app/api/chat/feedback/route.js):
`FEEDBACK_API_URL` read at request time, bare host or full endpoint accepted
([:50-55](../src/app/api/chat/feedback/route.js#L50-L55), [:104](../src/app/api/chat/feedback/route.js#L104));
10 s timeout ([:37](../src/app/api/chat/feedback/route.js#L37)); **never fails the UI** —
every path answers 200 `{ ok, forwarded, reason }` ([:13-21](../src/app/api/chat/feedback/route.js#L13-L21));
forwarded body is rebuilt from an allow-list: `rating, messageId, sessionId, userText,
assistantText, pageUrl, createdAt` ([:78-86](../src/app/api/chat/feedback/route.js#L78-L86)).
No auth header.

### C3. `server-only`

**Not used anywhere.** `grep server-only src/` matches only comments
(e.g. [auditContract.js:51](../src/lib/audit/auditContract.js#L51),
[pageBuilder.js:2114](../src/lib/actions/pageBuilder.js#L2114)); the package is not in
`package.json`. The repo's guards are structural instead:

- env vars are read only inside route handlers / server components / `'use server'`
  modules, and the root layout reduces `CHATBOT_V2_API_URL` to a boolean before it can reach
  the RSC payload ([src/app/layout.jsx:114-116](../src/app/layout.jsx#L114-L116));
- an fs-tier test walks `src/` and fails on any `NEXT_PUBLIC_*CHATBOT|FEEDBACK*` variable
  ([test/fs/chatWiring.test.mjs:65-84](../test/fs/chatWiring.test.mjs#L65-L84)) and asserts
  the layout gate shape ([:33-63](../test/fs/chatWiring.test.mjs#L33-L63));
- the MSDB key is read at module scope of `src/lib/api/client.js`
  ([:20-21](../src/lib/api/client.js#L20-L21)) and that module is imported only from
  server code — by convention, not by a guard.

### C4. Where a server-only client for the panel API should live

Recommended: `src/lib/chat/adminApi.js` (or `src/lib/chat-admin/client.js`), modelled on
`aiFetch` ([client.js:38-80](../src/lib/api/client.js#L38-L80)): read
`CHAT_ADMIN_API_URL` / `CHAT_ADMIN_API_KEY` from `process.env` **inside** the function (the
proxy's request-time pattern, not `client.js`'s module-scope constant — module-scope evaluates
in whichever bundle imports it), send `x-api-key`, `cache: 'no-store'`, wrap with
`fetchWithTimeout` ([src/lib/fetchWithTimeout.js:14-22](../src/lib/fetchWithTimeout.js#L14-L22)),
and map failures to a small code vocabulary the page can branch on (mirror
[chat/route.js:25-31](../src/app/api/chat/route.js#L25-L31)).

To guarantee the key cannot reach a client bundle:

1. call it **only from Server Components (`page.jsx`) or `'use server'` actions** that begin
   with `requirePage` / `requireAdmin` — never from a `'use client'` file; pass plain data
   down as props (the dashboard pattern);
2. add the `server-only` package and `import 'server-only'` at the top of the client module —
   this turns a client import into a build error. It would be the first use in the repo; the
   test tier loads modules with a custom loader ([test/run.mjs](../test/run.mjs),
   [test/loader.mjs](../test/loader.mjs)) so a stub for `server-only` may be needed there
   (open decision);
3. extend the `chatWiring` NEXT_PUBLIC walk to the new variable names
   ([test/fs/chatWiring.test.mjs:65-84](../test/fs/chatWiring.test.mjs#L65-L84)) and add an
   fs guard that no file under `src/components/` or any `'use client'` file imports the
   client module (same `readSource` scan style as [rbacNavParity](../test/fs/rbacNavParity.test.mjs)).

No existing test asserts "secret X never appears in a client file" generically — the
`NEXT_PUBLIC_` walk is the only guard of that kind.

### C5. Inbound `/api/corpus/*` auth helper — the reference for the chatbot side

`corpusAuthStatus(presented, configured)` in
[src/lib/corpus/promotionsAuth.js:37-43](../src/lib/corpus/promotionsAuth.js#L37-L43):
pure, returns `503` when no key is configured (**fail closed**), `401` when absent/wrong,
`200` on match; both sides SHA-256 hashed then `timingSafeEqual` so neither length nor bytes
leak by timing ([:13-18](../src/lib/corpus/promotionsAuth.js#L13-L18)). Header name
`x-api-key` (`CORPUS_KEY_HEADER`, [:27](../src/lib/corpus/promotionsAuth.js#L27)). Route
usage: [career-path-cards/route.js:40-49](../src/app/api/corpus/career-path-cards/route.js#L40-L49)
— 503 JSON `corpus_unavailable`, 401 empty body, `Cache-Control: no-store` on every answer,
`force-dynamic`. The env var is `CORPUS_API_KEY`, documented as "a key of its OWN — never the
MSDB AI_API_KEY" ([.env.example:63-66](../.env.example#L63-L66)). The panel API key should
likewise be its own variable, distinct from `CORPUS_API_KEY` (direction is reversed).

---

## D. Audit log — can it record a READ?

`recordAdminAction(entry)` / `recordAdminActionAfter(entry)`
([src/lib/audit/recordAdminAction.js:248-283](../src/lib/audit/recordAdminAction.js#L248-L283),
[:328-340](../src/lib/audit/recordAdminAction.js#L328-L340)). Findings:

- `action` is a **free-form string** in the schema, deliberately not an enum
  ([src/models/AdminAuditLog.js:73-75](../src/models/AdminAuditLog.js#L73-L75)); the writer
  defaults it to `'update'` ([recordAdminAction.js:216](../src/lib/audit/recordAdminAction.js#L216)).
  So `action: 'view'` is accepted today with no schema change.
- `menu` must be a registered page key (else filed under `unknown`, superadmin-only —
  [access.js:40-45](../src/lib/rbac/access.js#L40-L45)), so the new key must exist first.
- `(menu, entity)` must have a **contract entry** or the payload is reduced to `act_only`
  with a console warning ([recordAdminAction.js:194-204](../src/lib/audit/recordAdminAction.js#L194-L204)),
  and the inline history widget will not find it. A row would be
  `entry('chat_transcripts', 'transcript', 'บทสนทนาแชท', 'act_only')` in
  [auditContract.js:194](../src/lib/audit/auditContract.js#L194) — `act_only` is the right
  policy: who/what/when only, no `before/after`, so no customer text enters the trail
  ([:66](../src/lib/audit/auditContract.js#L66)). `recordId` = chat session id, `recordLabel`
  = a non-PII label (e.g. started-at).
- No existing `'view'` action anywhere (`grep 'view'` in `src/lib/audit`, `src/app/admin/audit-log` — not found),
  so the audit-log UI's action filter (`readAuditActions`, [audit-log/page.jsx:43](../src/app/admin/audit-log/page.jsx#L43))
  would simply start listing it. Nothing in `auditRowParts.jsx` special-cases action names
  that I found.
- Write path: `recordAdminActionAfter` uses `next/server`'s `after()` so the write happens
  post-response. From a Server Component page render this works (Next 15 `after` is allowed
  in pages); the existing call sites are all server actions
  ([test/fs/auditCoverage.test.mjs](../test/fs/auditCoverage.test.mjs) only scans
  `SWEPT_FILES`), so a page-render call would be a first and should get its own test.

What it would take: registry key (A5) + one contract line + one `recordAdminActionAfter({
menu: 'chat_transcripts', entity: 'transcript', action: 'view', recordId: sessionId, actor })`
in the transcript page after `requirePage`. Report only — no change proposed here.

---

## E. The chat widget, for linking panel data back to the site

### E1. `sessionId` and every field sent upstream

- **Generated**: `crypto.randomUUID()` (fallback `sess_<ts>_<rand>`), persisted in
  `localStorage['genesis_chat_session_id']`
  ([src/lib/chat/session.js:23](../src/lib/chat/session.js#L23), [:41-45](../src/lib/chat/session.js#L41-L45), [:66-72](../src/lib/chat/session.js#L66-L72)).
  "ล้างแชท" **rotates** to a new id ([:80-84](../src/lib/chat/session.js#L80-L84)) after
  dropping the old transcript; the transcript itself lives in `sessionStorage`
  (`chat_transcript_<id>`, [src/lib/chat/transcriptStore.js:5-27](../src/lib/chat/transcriptStore.js#L5-L27)).
  So one browser can produce many session ids over time, and one id can span many page views.
- **Chat request** — browser → `/api/chat`: `{ sessionId, message, history }`
  ([chatClient.js:142-148](../src/lib/chat/chatClient.js#L142-L148)); proxy → upstream:
  `{ sessionId, user_id: sessionId, message, history[{role,content}] }` capped by
  [src/lib/chat/limits.js](../src/lib/chat/limits.js) ([route.js:240-245](../src/app/api/chat/route.js#L240-L245)).
  **`page_url` is NOT sent on chat turns** — not by the widget
  ([useChatStore.js:65-69](../src/components/chat/useChatStore.js#L65-L69)) and not by the proxy.
- **Feedback request** — browser → `/api/chat/feedback`: `{ rating, messageId
  (server id), sessionId, userText, assistantText, pageUrl: window.location.href, createdAt }`
  ([useChatStore.js:148-156](../src/components/chat/useChatStore.js#L148-L156)); proxy
  forwards the same keys, `pageUrl` capped at 500 chars ([feedback/route.js:78-86](../src/app/api/chat/feedback/route.js#L78-L86)).
  So the page URL is known to the chatbot side **only for rated messages**, and only as
  camelCase `pageUrl`.
- Response fields the widget consumes: `message_id` (server id for the assistant row,
  [chatClient.js:178](../src/lib/chat/chatClient.js#L178)), `courses`, `promotions`,
  `masterclasses`, `career_paths`, quick replies ([:87-125](../src/lib/chat/chatClient.js#L87-L125)).

### E2. `ChatCards.jsx` — how cards render, and a compact chip

[src/components/chat/ChatCards.jsx](../src/components/chat/ChatCards.jsx). All four card
types share `CARD_SHELL`, read a title + one `url`, and render a raw `<img>`:

| card | title | url field | key | evidence |
|---|---|---|---|---|
| `CourseCard` | `item.title \|\| item.name` | `item.course_url \|\| item.url \|\| item.link` | — | [:291-298](../src/components/chat/ChatCards.jsx#L291-L298) |
| `PromotionCard` | — | `item.url \|\| item.link` | — | [:409-416](../src/components/chat/ChatCards.jsx#L409-L416) |
| `MasterclassCard` | `item.title` | `item.url` (absolute, from corpus) | `slug` | [:463-469](../src/components/chat/ChatCards.jsx#L463-L469), [:692](../src/components/chat/ChatCards.jsx#L692) |
| `CareerPathCard` | `item.title` | `item.url` (absolute, from corpus) | `slug` | [:561-567](../src/components/chat/ChatCards.jsx#L561-L567), [:704](../src/components/chat/ChatCards.jsx#L704) |

Carousels are one generic `Carousel` ([:633](../src/components/chat/ChatCards.jsx#L633))
parameterised by width and key. The exported helpers `cleanText`, `cx`, `formatTimeHM`
([:42-63](../src/components/chat/ChatCards.jsx#L42-L63)) are reusable. A compact
**chip (name + link)** is easy to derive: it needs only the `title`/`url` reads at the top
of each card; nothing in the shell is required. The admin panel should not import
`ChatCards.jsx` directly (it is a public-widget file with `'use client'`, animation and
`masterclassPriceView`) — a 10-line `ChatChip` in the panel's `_components/` reading the same
two fields is the honest reuse.

### E3. Building a public URL from an id/slug

| input | helper | output | notes / evidence |
|---|---|---|---|
| MSDB `course_id` (code only) | `courseHref(code)` | `/<code>-training-course` (**does not lowercase**) | [src/lib/utils.js:103-107](../src/lib/utils.js#L103-L107); use `coursePathFromId` for a lowercased, `_`→`-` variant ([courseRevalidatePlan.js:25-29](../src/lib/webhooks/courseRevalidatePlan.js#L25-L29)) — but note the caveat at [courseCanonicalPath.js:42-59](../src/lib/courses/courseCanonicalPath.js#L42-L59): `_` rewriting is lossy |
| `course_id` + extension (canonical) | `courseCanonicalPath(course, extension)` → alias wins, else `/<id.toLowerCase()>-training-course` | canonical path | [src/lib/courses/courseCanonicalPath.js:87-91](../src/lib/courses/courseCanonicalPath.js#L87-L91); absolute: `courseCanonicalUrl` [:107-112](../src/lib/courses/courseCanonicalPath.js#L107-L112) |
| a list row with `urlAlias` attached | `courseLinkHref(course)` | canonical path, exactly one leading slash | [src/lib/courses/courseLinkHref.js:55](../src/lib/courses/courseLinkHref.js#L55) — "the one function every internal link goes through" |
| slug → course (resolution) | `resolveCourse(slug)` | `{course, extension, mode}` — both paths go through `getCourseByCodeInsensitive` | [src/lib/resolveCourse.js:46](../src/lib/resolveCourse.js#L46); the **mixed-case** issue: 5 of 77 ids are mixed-case and upstream may rename, so lookups are case-insensitive ([:12-25](../src/lib/resolveCourse.js#L12-L25), [public-courses.js:251-279](../src/lib/api/public-courses.js#L251-L279)) |
| masterclass `slug` | no helper — literal `/masterclass/${slug}` | | [src/lib/corpus/masterclassCards.js:102](../src/lib/corpus/masterclassCards.js#L102), [masterclass.js:116](../src/lib/corpus/masterclass.js#L116) |
| career-path slug (bare or suffixed) | `careerPathHref(slug)` — idempotent on `-career-path` | `/<slug>-career-path` | [src/lib/utils.js:191-195](../src/lib/utils.js#L191-L195); `bareCareerPathSlug` strips it ([careerPathCards.js:54-56](../src/lib/corpus/careerPathCards.js#L54-L56)); `getCareerPathBySlug` accepts either form ([getCareerPaths.js:39-44](../src/lib/career-paths/getCareerPaths.js#L39-L44)); register page uses the **bare** slug (`/career-path-register/<bare>`, see [career-path-chat-card-phase-a.md](./career-path-chat-card-phase-a.md) A2) |
| course code → display name | `buildCourseNameMap()` / `resolveCourseNames(codes, map)` | | [src/lib/api/courseNameMap.js:43](../src/lib/api/courseNameMap.js#L43), [:91](../src/lib/api/courseNameMap.js#L91) — already used by the registrations list |

Absolute origin for corpus URLs is the constant `CORPUS_PUBLIC_ORIGIN =
'https://www.9experttraining.com'` ([src/lib/corpus/promotions.js:56](../src/lib/corpus/promotions.js#L56));
public pages use `NEXT_PUBLIC_SITE_URL`. For the panel, a **relative** path is enough (same
origin as the admin) — so for a course trend row: `courseHref(code)` is safe for every
current id (it resolves case-insensitively); the canonical alias needs a `CourseExtension`
read (`getCourseExtension`), which is the same call `resolveCourse` makes.

---

## F. Caching

What would cache a panel page or its fetches, and what stops it:

| layer | risk | the existing answer | evidence |
|---|---|---|---|
| Full Route Cache (static render) | a page with no dynamic API use is prerendered | `export const dynamic = 'force-dynamic'` on the page | every admin list page, e.g. [audit-log/page.jsx:13-15](../src/app/admin/audit-log/page.jsx#L13-L15), [admin/page.jsx:9](../src/app/admin/page.jsx#L9) |
| Next Data Cache (`fetch`) | a `fetch()` in a server component may be memoised/cached | `cache: 'no-store'` on the request — the proxy does this ([chat/route.js:246](../src/app/api/chat/route.js#L246)); `aiFetch` maps `revalidate: 0` to `cache: 'no-store'` and the admin schedules page passes it | [client.js:54-64](../src/lib/api/client.js#L54-L64), [schedules/page.jsx:62-72](../src/app/admin/schedules/page.jsx#L62-L72) |
| Router client cache | back/forward can show a stale RSC payload | `RefreshOnNavigate` on lists that must reflect a just-written row | [src/components/admin/RefreshOnNavigate.jsx](../src/components/admin/RefreshOnNavigate.jsx), rendered by [registrations/page.jsx:344](../src/app/admin/registrations/page.jsx#L344) |
| CDN / browser | `/admin` HTML is behind the auth middleware; no `Cache-Control` override for `/admin` in `next.config.mjs` headers() | responses are dynamic + cookie-gated so Vercel does not CDN-cache them; the layout itself reads `headers()` ([layout.jsx:33](../src/app/admin/layout.jsx#L33)) which makes the whole subtree dynamic | [next.config.mjs:548](../next.config.mjs#L548) (headers block exists; no admin rule) |
| `experimental` config | none of `dynamicIO`/`cacheComponents`/`staleTimes` is set | only `serverActions.bodySizeLimit` | [next.config.mjs:30-34](../next.config.mjs#L30-L34) |

Correct reference page for a fetch-backed admin page: [src/app/admin/schedules/page.jsx](../src/app/admin/schedules/page.jsx)
(`force-dynamic` + `revalidate: 0` on the upstream read). For a Mongo-backed one:
[audit-log/page.jsx](../src/app/admin/audit-log/page.jsx). The panel client should hardcode
`cache: 'no-store'` rather than expose a `revalidate` option — there is no public surface
that would ever want these responses cached.

---

## G. Proposed page structure (design only)

Sidebar group **"แชทบอท"** (new `id: 'chat'`) placed before **ระบบ** in both `ADMIN_PAGES`
and `NAV_GROUPS`, or — lower-friction — two rows appended to **ภาพรวม** so no group is added.

| route | page key | file | reads (server-side, via the new client) | reuses |
|---|---|---|---|---|
| `/admin/chat` — overview + trends | `chat_stats` | `src/app/admin/chat/page.jsx` (+ `_components/ChatStatsClient.jsx`) | `GET …/admin/stats?from&to` → thumbs up/down totals, sessions/messages per bucket, top courses / masterclass / career paths by mention | `requirePage`, `normaliseRange` + `RANGE_OPTIONS` + native date form ([DashboardClient:348-405](../src/app/admin/_components/DashboardClient.jsx#L348-L405)), `StatCard`/`Sparkline`/`ProportionalBar` patterns, `courseHref` / `careerPathHref` / `/masterclass/<slug>` for trend rows, `resolveCourseNames` for course labels, `EmptyRange`-style empty state |
| `/admin/chat/sessions` — sessions list | `chat_transcripts` | `src/app/admin/chat/sessions/page.jsx` (+ `_components/SessionsClient.jsx`) | `GET …/admin/sessions?from&to&rating&cursor` → id, started/last-at, turn count, rating summary, first user line (truncated) | `force-dynamic`, cursor pager exactly as [AuditLogClient:189-205](../src/app/admin/audit-log/_components/AuditLogClient.jsx#L189-L205), `tableParts` `Th`/`DateCell`/`ChevronCell`, `withListQuery` for round-tripping filters, `RefreshOnNavigate` |
| `/admin/chat/sessions/[sessionId]` — transcript | `chat_transcripts` | `src/app/admin/chat/sessions/[sessionId]/page.jsx` | `GET …/admin/sessions/:id` → ordered turns with `message_id`, rating, cards shown, `pageUrl` (when rated) | `BackLink`, `DetailHeader`, `SectionCard`, `DL`/`DLRow`, `CopyButton` from `detailShell.jsx`; a local `ChatChip` for cards (E2); `recordAdminActionAfter({ action: 'view' })` (D) |

Gates: `requirePage('chat_stats')` on the first, `requirePage('chat_transcripts')` on the
other two; `resolvePageKey` longest-match ([pages.js:252](../src/lib/rbac/pages.js#L252))
means `/admin/chat/sessions/...` resolves to `chat_transcripts` even though `/admin/chat` is
a prefix. The overview should link to the sessions list **only when
`canAccess(user, 'chat_transcripts')`** (the dashboard's scope pattern), and a stats-only
admin's payload must carry no transcript text (the `null`-not-`0` rule at
[admin/page.jsx:81-89](../src/app/admin/page.jsx#L81-L89)).

Data flow: `page.jsx` → `src/lib/chat/adminApi.js` (server-only, key from env) → chatbot
API. No `'use server'` action is needed for reads unless the client needs to refetch without
navigation; if one is added it must call `requireAdmin(key)` first and it becomes a POST
endpoint (see [bundleRequestReadGuard](../test/fs/bundleRequestReadGuard.test.mjs) header).

---

## Open decisions

1. **One sidebar group or two rows in ภาพรวม?** A new group touches both lists' group order
   (adminNavShape:174); two rows in ภาพรวม touch only item order.
2. **Is the sessions list its own nav row** or reached only from the overview? If the latter,
   `chat_transcripts` must be allow-listed in `NO_SIDEBAR_LINK` and `NO_NAV_ITEM` with a
   reason — but then a transcripts-only role has no entry point (the overview is `chat_stats`).
   Recommendation: its own row.
3. **`server-only` package** — adopt it (first use in repo; may need a loader stub in
   `test/loader.mjs`), or rely on the structural rule + an fs guard as the repo does today.
4. **Audit a transcript view?** `act_only` row per open, or not at all. The trail has never
   recorded a read; it is cheap (D) but changes what "ประวัติการดำเนินการ" means.
5. **Env var names** for the panel API: separate `CHAT_ADMIN_API_URL` / `CHAT_ADMIN_API_KEY`
   vs. reusing `CHATBOT_V2_API_URL` with a new key var. Recommendation: separate URL too, so
   the key-guarded surface can move hosts independently (the feedback proxy already needed
   its own URL, [feedback/route.js:4-6](../src/app/api/chat/feedback/route.js#L4-L6)).
6. **Course links in trends**: `courseHref(code)` (no extension read, resolves via the
   case-insensitive path) vs. canonical alias (one `CourseExtension` read per row).
7. **`page_url` on chat turns** — the widget does not send it (E1). If the panel wants "which
   page was the customer on", the chat proxy + widget must add it (out of this round's scope;
   the feedback body already carries `pageUrl`).
8. **Seed script mirror**: add the two keys to `migrate-rbac.mjs` `PAGE_SET` (which changes
   what re-running the seed grants) or pin them in `MIRROR_MAY_OMIT`.
