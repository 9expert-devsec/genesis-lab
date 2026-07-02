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

// Grouped exactly like the sidebar (ภาพรวม / จัดการหลักสูตร /
// จัดการคอนเทนต์ / ระบบ). `roles` is the NEW phase-5 role-management page.
export const ADMIN_PAGES = [
  {
    group: 'ภาพรวม',
    pages: [
      { key: 'dashboard', label: 'แดชบอร์ด', href: '/admin', match: 'exact' },
    ],
  },
  {
    group: 'จัดการหลักสูตร',
    pages: [
      { key: 'featured_courses',            label: 'หลักสูตรแนะนำ',     href: '/admin/featured-courses',            match: 'prefix' },
      { key: 'featured_online_courses',     label: 'คอร์สออนไลน์แนะนำ', href: '/admin/featured-online-courses',     match: 'prefix' },
      { key: 'nav_featured_online_courses', label: 'คอร์สออนไลน์ (Navbar)', href: '/admin/nav-featured-online-courses', match: 'prefix' },
      { key: 'courses',        label: 'หลักสูตร',         href: '/admin/courses',      match: 'prefix' },
      { key: 'schedules',      label: 'ตารางอบรม',        href: '/admin/schedules',    match: 'prefix' },
      { key: 'instructors',    label: 'วิทยากร',          href: '/admin/instructors',  match: 'prefix' },
      { key: 'programs',       label: 'โปรแกรม & Skills', href: '/admin/programs',     match: 'prefix' },
      { key: 'career_paths',   label: 'Career Path',      href: '/admin/career-paths', match: 'prefix' },
      { key: 'masterclass',    label: 'Masterclass',      href: '/admin/masterclass',  match: 'prefix' },
      // More specific than 'masterclass' — longest-match wins in
      // resolvePageKey so this is not swallowed by the parent.
      { key: 'mc_registrations', label: 'MC — ผู้ลงทะเบียน', href: '/admin/masterclass/registrations', match: 'prefix' },
      { key: 'tnhs_courses',   label: 'TNHS Courses',      href: '/admin/tnhs-courses', match: 'prefix' },
      { key: 'page_configs',   label: 'Program/Skill URL', href: '/admin/page-configs', match: 'prefix' },
    ],
  },
  {
    group: 'จัดการคอนเทนต์',
    pages: [
      { key: 'banners',    label: 'แบนเนอร์',   href: '/admin/banners',    match: 'prefix' },
      { key: 'promotions', label: 'โปรโมชั่น',  href: '/admin/promotions', match: 'prefix' },
      // More specific than 'promotions' — longest-match wins.
      { key: 'promotions_banner', label: 'แบนเนอร์โปรโมชั่น', href: '/admin/promotions/banner', match: 'prefix' },
      { key: 'notifications', label: 'Notifications', href: '/admin/notifications', match: 'prefix' },
      { key: 'about',      label: 'เกี่ยวกับเรา',     href: '/admin/about',         match: 'prefix' },
      { key: 'contact',    label: 'ติดต่อเรา',        href: '/admin/contact',       match: 'prefix' },
      { key: 'portfolio',  label: 'ผลงานของเรา',      href: '/admin/portfolio',     match: 'prefix' },
      { key: 'nearby_places', label: 'โรงแรม/ร้านอาหาร', href: '/admin/nearby-places', match: 'prefix' },
      { key: 'featured_reviews', label: 'รีวิวแนะนำ', href: '/admin/featured-reviews', match: 'prefix' },
      { key: 'articles',   label: 'บทความ',           href: '/admin/articles',      match: 'prefix' },
      { key: 'pages',      label: 'จัดการหน้าเพจ',    href: '/admin/pages',         match: 'prefix' },
      { key: 'faqs',       label: 'FAQ',              href: '/admin/faqs',          match: 'prefix' },
      { key: 'local_faqs', label: 'FAQ (Local)',      href: '/admin/local-faqs',    match: 'prefix' },
      { key: 'schedule_pdf', label: 'ตารางฝึกอบรม PDF', href: '/admin/schedule-pdf', match: 'prefix' },
    ],
  },
  {
    group: 'ระบบ',
    pages: [
      { key: 'registrations',             label: 'การลงทะเบียน',                href: '/admin/registrations',             match: 'prefix' },
      { key: 'career_path_registrations', label: 'Career Path Registrations',   href: '/admin/career-path-registrations', match: 'prefix' },
      { key: 'recruits',      label: 'ประกาศงาน',     href: '/admin/recruits',      match: 'prefix' },
      { key: 'landing_cache', label: 'Landing Cache', href: '/admin/landing-cache', match: 'prefix' },
      { key: 'webhook_logs',  label: 'Webhook Logs',  href: '/admin/webhook-logs',  match: 'prefix' },
      { key: 'security',      label: 'ความปลอดภัย',   href: '/admin/security',      match: 'prefix' },
      { key: 'profile',       label: 'โปรไฟล์',       href: '/admin/profile',       match: 'prefix' },
      { key: 'accounts',      label: 'บัญชีผู้ดูแล',  href: '/admin/accounts',      match: 'prefix' },
      // NEW in phase 5 — the role-management page itself.
      { key: 'roles',         label: 'บทบาทและสิทธิ์', href: '/admin/roles',        match: 'prefix' },
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
    const isMatch =
      match === 'exact'
        ? path === href
        : path === href || path.startsWith(`${href}/`);
    if (!isMatch) continue;
    if (!best || href.length > best.href.length) best = page;
  }
  return best ? best.key : null;
}
