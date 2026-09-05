/**
 * Admin page registry — the static source of truth for RBAC page-level
 * permissions (phase 0 of the dynamic RBAC rollout).
 *
 * A "page" is the unit of permission: a role either can access a page
 * fully or not at all (binary, no per-action CRUD flags). Keys here are
 * stable permission slugs stored on Role.pages; labels/hrefs mirror the
 * current AdminSidebar `NAV_GROUPS` so the phase-5 checkbox UI can render
 * the same grouping the sidebar uses.
 *
 * `match`:
 *   - 'exact'  → only the exact href counts (used for '/admin' so it does
 *                not swallow every child route).
 *   - 'prefix' → the href and any child route inherit the key, e.g.
 *                '/admin/courses/new' resolves to the 'courses' key.
 *   (default is 'prefix'.)
 *
 * NOTE: additive only. Nothing imports this yet — the live auth/sidebar/
 * guard system is untouched in phase 0.
 */

// Grouped exactly like the sidebar: six groups, same labels, same order, same
// order of rows within each group — ภาพรวม / การลงทะเบียน / หลักสูตร & ตาราง /
// จัดวางหน้าเว็บ / เนื้อหา / ระบบ.
//
// ── WHY THE MIRRORING IS THE POINT, NOT TIDINESS ────────────────────────────
// This grouping is what /admin/roles renders its permission checkboxes from
// (PAGE_KEYS_BY_GROUP, below, is keyed on `group`). If the two lists drift, the
// roles screen starts describing a menu that no longer exists: an admin ticks
// "จัดการคอนเทนต์ → รีวิวแนะนำ" looking for a group the sidebar has not had for
// months. The grouping is free to change — it is presentation — but it has to
// change in BOTH files at once, so test/fs/adminNavShape asserts the group
// labels and their order match NAV_GROUPS.
//
// The `key` strings are NOT free to change: they are stored on Role.pages
// documents in Mongo, they are the AdminAuditLog `menu` enum, and historical
// rows would fail their own schema if one were renamed. Rows move between
// groups; nothing on a row is edited.
export const ADMIN_PAGES = [
  {
    group: 'ภาพรวม',
    pages: [
      { key: 'dashboard', label: 'แดชบอร์ด', href: '/admin', match: 'exact' },
      // ── THE TWO DASHBOARD SCOPES — REGISTERED KEYS WITH NO ROUTE ──────────
      //
      // `dashboard` gates the PAGE. These two gate what the page CONTAINS, and
      // they are ordinary page keys rather than a new field on Role or a
      // `dashboardScope` enum, for the reason every other permission here is a
      // page key: one mechanism, one checkbox list, one audit enum, one place a
      // superadmin bypass is written down. A second permission system would
      // have to re-answer all four questions and would answer at least one of
      // them differently.
      //
      // NAMING follows `promotions_banner` — the parent key, then the qualifier
      // — which is the registry's existing convention for a sub-surface of a
      // page that already has a key.
      //
      // ── `href: null` IS THE LOAD-BEARING PART ────────────────────────────
      // These are the first registry rows with NO ROUTE OF THEIR OWN, and that
      // is the difference from `profile`, which is unlinked but still has
      // /admin/profile behind it. There is no /admin/dashboard-registrations to
      // navigate to, so an href would have to be either a lie or a duplicate of
      // '/admin' — and a duplicate would make resolvePageKey('/admin')
      // ambiguous between `dashboard` and a scope, which is precisely the
      // permission that must NOT be reachable by URL. resolvePageKey skips
      // href-less rows explicitly (see below) rather than relying on
      // `undefined` failing a string comparison by luck.
      //
      // Both are allow-listed BY NAME in the two nav guards —
      // NO_NAV_ITEM in test/fs/adminNavShape.test.mjs and NO_SIDEBAR_LINK in
      // test/fs/rbacNavParity.test.mjs — for the same reason `profile` is: a
      // key that goes quiet must fail the suite unless somebody wrote down why.
      { key: 'dashboard_registrations', label: 'แดชบอร์ด — การลงทะเบียน', href: null, match: 'none' },
      { key: 'dashboard_system',        label: 'แดชบอร์ด — ภาพรวมระบบ',   href: null, match: 'none' },
    ],
  },
  {
    group: 'การลงทะเบียน',
    pages: [
      { key: 'registrations',             label: 'การลงทะเบียน',              href: '/admin/registrations',             match: 'prefix' },
      // More specific than 'masterclass' — longest-match wins in
      // resolvePageKey so this is not swallowed by the parent, which now lives
      // in a different group entirely.
      { key: 'mc_registrations',          label: 'MC — ผู้ลงทะเบียน',         href: '/admin/masterclass/registrations', match: 'prefix' },
      { key: 'career_path_registrations', label: 'Career Path Registrations', href: '/admin/career-path-registrations', match: 'prefix' },
    ],
  },
  {
    group: 'หลักสูตร & ตาราง',
    pages: [
      { key: 'courses',      label: 'หลักสูตร',         href: '/admin/courses',      match: 'prefix' },
      { key: 'schedules',    label: 'ตารางอบรม',        href: '/admin/schedules',    match: 'prefix' },
      { key: 'schedule_pdf', label: 'ตารางฝึกอบรม PDF', href: '/admin/schedule-pdf', match: 'prefix' },
      { key: 'instructors',  label: 'วิทยากร',          href: '/admin/instructors',  match: 'prefix' },
      { key: 'programs',     label: 'โปรแกรม & Skills', href: '/admin/programs',     match: 'prefix' },
      { key: 'career_paths', label: 'Career Path',      href: '/admin/career-paths', match: 'prefix' },
      { key: 'masterclass',  label: 'Masterclass',      href: '/admin/masterclass',  match: 'prefix' },
      { key: 'tnhs_courses', label: 'TNHS Courses',     href: '/admin/tnhs-courses', match: 'prefix' },
    ],
  },
  {
    group: 'จัดวางหน้าเว็บ',
    pages: [
      { key: 'banners',                     label: 'แบนเนอร์',              href: '/admin/banners',                     match: 'prefix' },
      { key: 'featured_courses',            label: 'หลักสูตรแนะนำ',         href: '/admin/featured-courses',            match: 'prefix' },
      { key: 'featured_online_courses',     label: 'คอร์สออนไลน์แนะนำ',     href: '/admin/featured-online-courses',     match: 'prefix' },
      { key: 'nav_featured_online_courses', label: 'คอร์สออนไลน์ (Navbar)', href: '/admin/nav-featured-online-courses', match: 'prefix' },
      { key: 'featured_reviews',            label: 'รีวิวแนะนำ',            href: '/admin/featured-reviews',            match: 'prefix' },
      // More specific than 'promotions' — longest-match wins.
      { key: 'promotions_banner',           label: 'แบนเนอร์โปรโมชั่น',     href: '/admin/promotions/banner',           match: 'prefix' },
      { key: 'notifications',               label: 'Notifications',         href: '/admin/notifications',               match: 'prefix' },
      { key: 'page_configs',                label: 'Program/Skill URL',     href: '/admin/page-configs',                match: 'prefix' },
    ],
  },
  {
    group: 'เนื้อหา',
    pages: [
      { key: 'articles',      label: 'บทความ',           href: '/admin/articles',      match: 'prefix' },
      { key: 'promotions',    label: 'โปรโมชั่น',        href: '/admin/promotions',    match: 'prefix' },
      { key: 'pages',         label: 'จัดการหน้าเพจ',    href: '/admin/pages',         match: 'prefix' },
      { key: 'about',         label: 'เกี่ยวกับเรา',     href: '/admin/about',         match: 'prefix' },
      { key: 'contact',       label: 'ติดต่อเรา',        href: '/admin/contact',       match: 'prefix' },
      { key: 'portfolio',     label: 'ผลงานของเรา',      href: '/admin/portfolio',     match: 'prefix' },
      { key: 'nearby_places', label: 'โรงแรม/ร้านอาหาร', href: '/admin/nearby-places', match: 'prefix' },
      { key: 'faqs',          label: 'FAQ',              href: '/admin/faqs',          match: 'prefix' },
      { key: 'local_faqs',    label: 'FAQ (Local)',      href: '/admin/local-faqs',    match: 'prefix' },
      { key: 'recruits',      label: 'ประกาศงาน',        href: '/admin/recruits',      match: 'prefix' },
      // The file manager that replaces FileZilla. Registering it HERE is what
      // earns it two things and only two: a place in MENU_ENUM, so its own
      // actions are auditable, and a checkbox in the roles UI, so granting a
      // person upload rights is an ordinary role edit rather than a code
      // change. Both come from this file — see ALL_PAGE_KEYS below.
      //
      // The SIDEBAR LINK DOES NOT COME FROM HERE. src/components/layout/
      // AdminSidebar.jsx renders from its own hardcoded NAV_GROUPS array and
      // never imports this registry, so a page added here appears in no menu
      // until it is added there too. This entry and audit_log were both
      // registered here with no link at all for exactly that reason. An entry
      // added here needs a matching NAV_GROUPS entry, and the two lists are
      // held in step by an automated parity check — see test/fs/.
      { key: 'media', label: 'จัดการไฟล์', href: '/admin/media', match: 'prefix' },
    ],
  },
  {
    group: 'ระบบ',
    pages: [
      // THE KEY IS DELIBERATELY STILL `landing_cache` while the page is now the
      // whole cache console at /admin/cache. `Role.pages` stores these strings
      // in Mongo, so renaming the key would revoke the screen from every role
      // that had been granted it until each was edited by hand — a silent
      // permission regression dressed up as a tidy-up. The label and href moved;
      // the permission did not. /admin/landing-cache still resolves to this key
      // through its own requirePage call (that page is now a redirect).
      { key: 'landing_cache', label: 'Cache Console', href: '/admin/cache', match: 'prefix' },
      { key: 'webhook_logs',  label: 'Webhook Logs',  href: '/admin/webhook-logs',  match: 'prefix' },
      // Redirect Panel — per-path redirect rules and the 404 worklist. Registered
      // HERE grants the permission key, MENU_ENUM membership (so rule changes are
      // auditable) and the checkbox in the roles UI. The sidebar LINK is a
      // separate list in AdminSidebar.jsx and is added there too — see
      // test/fs/rbacNavParity for the two pages that were once registered here
      // and reachable only by typing the URL.
      { key: 'redirects',     label: 'Redirect & 404', href: '/admin/redirects',    match: 'prefix' },
      // Phase 3a — the admin action history. Adding it here has two INTENDED
      // consequences, neither of them a side effect: it enters MENU_ENUM
      // automatically (MENU_ENUM = [...ALL_PAGE_KEYS, UNKNOWN_MENU]), so the
      // audit log becomes auditable by the same machinery; and it gets a
      // checkbox in the roles UI, which renders from ADMIN_PAGES. Granting it
      // is therefore a normal role edit.
      //
      // The sidebar link is NOT one of them — that lives in NAV_GROUPS in
      // AdminSidebar.jsx, a separate hardcoded list. This entry had no link
      // for exactly that reason; the two lists are now held in step by an
      // automated parity check.
      { key: 'audit_log',     label: 'ประวัติการดำเนินการ', href: '/admin/audit-log', match: 'prefix' },
      { key: 'accounts',      label: 'บัญชีผู้ดูแล',  href: '/admin/accounts',      match: 'prefix' },
      // NEW in phase 5 — the role-management page itself.
      { key: 'roles',         label: 'บทบาทและสิทธิ์', href: '/admin/roles',        match: 'prefix' },
      { key: 'security',      label: 'ความปลอดภัย',   href: '/admin/security',      match: 'prefix' },
      // ── THE ONE ROW WITH NO SIDEBAR LINK, AND WHY IT STAYS HERE ───────────
      // `profile` left NAV_GROUPS: it is reached from the signed-in identity
      // card in the sidebar footer instead of taking its own row. It must NOT
      // leave this registry — it is still permission-gated (the page calls
      // requirePage), it is still a MENU_ENUM member so profile edits are
      // auditable, and /admin/roles still needs its checkbox. Deleting it here
      // would revoke the page from every non-superadmin role and break the
      // schema enum for every historical row filed under it.
      //
      // The absence from the nav is allow-listed BY NAME in
      // test/fs/adminNavShape.test.mjs (NO_NAV_ITEM), so this is the only key
      // that may be registered-but-unlinked, and any other key going quiet
      // fails the suite.
      { key: 'profile',       label: 'โปรไฟล์',       href: '/admin/profile',       match: 'prefix' },
    ],
  },
];

// Flat list of every page item (across groups), preserving order.
const FLAT_PAGES = ADMIN_PAGES.flatMap((g) => g.pages);

/** Every page key, in registry order. */
export const ALL_PAGE_KEYS = FLAT_PAGES.map((p) => p.key);

/**
 * Keys grouped by their sidebar group label — for the phase-5 checkbox UI:
 *   { 'ภาพรวม': ['dashboard'], 'จัดการหลักสูตร': [...], ... }
 */
export const PAGE_KEYS_BY_GROUP = Object.fromEntries(
  ADMIN_PAGES.map((g) => [g.group, g.pages.map((p) => p.key)])
);

/** Strip a single trailing slash (but keep the root '/'). */
function normalizePath(pathname) {
  if (typeof pathname !== 'string' || pathname === '') return '';
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

/**
 * Resolve a pathname to the best-matching page key, or null if none match.
 *
 * A page matches when:
 *   - match === 'exact'  → pathname equals href, or
 *   - match === 'prefix' → pathname equals href OR starts with `href + '/'`
 *     (the trailing slash keeps '/admin/coursesX' from matching '/admin/courses').
 * When several pages match, the one with the longest href wins.
 *
 * Examples:
 *   resolvePageKey('/admin')                          → 'dashboard'
 *   resolvePageKey('/admin/courses/new')              → 'courses'
 *   resolvePageKey('/admin/masterclass/registrations')→ 'mc_registrations' (not 'masterclass')
 *   resolvePageKey('/admin/promotions/banner')        → 'promotions_banner' (not 'promotions')
 *   resolvePageKey('/admin/unknown-route')            → null
 */
export function resolvePageKey(pathname) {
  const path = normalizePath(pathname);
  if (!path) return null;

  let best = null;
  for (const page of FLAT_PAGES) {
    const { href, match } = page;
    // A registry row with no href is a PERMISSION WITHOUT A ROUTE — the two
    // dashboard scopes. Skipped explicitly: without this, `path.startsWith(
    // `${undefined}/`)` would be doing the work, i.e. the correctness of a
    // permission boundary would rest on the string 'undefined/' happening never
    // to prefix an admin path. That is true today and is not a reason.
    if (!href) continue;
    const isMatch =
      match === 'exact'
        ? path === href
        : path === href || path.startsWith(`${href}/`);
    if (!isMatch) continue;
    if (!best || href.length > best.href.length) best = page;
  }
  return best ? best.key : null;
}
