'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Image as ImageIcon,
  Star,
  Monitor,
  MessageSquare,
  FileText,
  Briefcase,
  Database,
  Shield,
  ShieldCheck,
  User,
  GraduationCap,
  Layers,
  LogOut,
  Sun,
  Moon,
  CalendarDays,
  Tag,
  Info,
  Phone,
  LayoutTemplate,
  MapPin,
  HelpCircle,
  Map,
  Bell,
  Webhook,
  ExternalLink,
  FolderOpen,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Shuffle,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logoutAction } from '@/lib/actions/auth';
import { canAccess } from '@/lib/rbac/access';
import { activeNavHref } from '@/lib/admin/activeNavItem';
import {
  parseGroupCollapse,
  isGroupExpanded,
  toggleGroup as toggleGroupCollapse,
} from '@/lib/admin/navGroupCollapse';
import { roleBadgeStyle } from '@/lib/rbac/roleColor';

// Per-browser persistence for the collapse choice. Chrome, not page data — the
// sidebar is a real app component (not an artifact), so localStorage is allowed
// here; it is SSR-guarded via the post-mount pattern below (read after mount, so
// server and first client render agree → no hydration mismatch, same shape as
// AdminThemeToggle).
const COLLAPSE_KEY = 'admin-sidebar-collapsed';

// Per-group collapse, ONE key holding a { groupId: collapsed } map rather than
// a key per group — six keys would leave five behind the day a group is removed
// and nothing would ever clean them up. Read after mount, same as COLLAPSE_KEY.
// The parsing (and every way the stored value can be malformed) lives in
// src/lib/admin/navGroupCollapse.js so it can be tested without a browser.
const GROUPS_KEY = 'admin-sidebar-groups';

// Icon name → component map. Group config below references icons by
// string so the data shape stays serializable / easy to scan.
const ICONS = {
  LayoutDashboard,
  Users,
  ClipboardList,
  Image: ImageIcon,
  Star,
  Monitor,
  MessageSquare,
  FileText,
  Briefcase,
  Database,
  Shield,
  ShieldCheck,
  User,
  GraduationCap,
  Layers,
  CalendarDays,
  Tag,
  Info,
  Phone,
  LayoutTemplate,
  MapPin,
  HelpCircle,
  Map,
  Bell,
  Webhook,
  ExternalLink,
  // The file manager holds PDFs, mp3s and documents as well as images, so it
  // gets a folder rather than a picture — an Image icon would misdescribe it.
  FolderOpen,
  History,
  // Redirect Panel — a path going somewhere other than where it points.
  Shuffle,
};

// Nav config. Each item declares the `pageKey` it maps to (matching
// ADMIN_PAGES / the page + action guards from Phase 3). Visibility is
// decided purely by `canAccess(user, pageKey)` below — no role whitelists.
//
// ── `id` IS THE PERSISTENCE KEY, AND THAT IS WHY IT EXISTS ──────────────────
// Per-group collapse is stored under these ids (GROUPS_KEY below), never under
// `label`. The labels are Thai display copy and have ALREADY been reworded once
// — this very regroup renamed จัดการหลักสูตร → หลักสูตร & ตาราง and split
// จัดการคอนเทนต์ into จัดวางหน้าเว็บ + เนื้อหา. Keyed by label, every stored
// preference would have silently reset at that commit and nobody would have
// known why. Ids are ascii slugs so they survive rewording, and
// test/fs/adminNavShape asserts they stay ascii and unique.
//
// The GROUPING here is presentation and is free to change; the `pageKey` and
// `href` on each row are NOT. Those strings are stored in Role.pages documents
// in Mongo, enumerated in Role.ALL_PAGE_KEYS and AdminAuditLog.MENU_ENUM, and
// resolved by resolvePageKey — renaming one would strip the page from every
// non-superadmin role AND make historical audit rows fail their own schema
// enum. Move rows between groups freely; do not edit what is on them.
const NAV_GROUPS = [
  {
    id: 'overview',
    label: 'ภาพรวม',
    items: [
      { label: 'แดชบอร์ด', href: '/admin', icon: 'LayoutDashboard', exact: true, pageKey: 'dashboard' },
    ],
  },
  {
    id: 'registrations',
    label: 'การลงทะเบียน',
    items: [
      { label: 'การลงทะเบียน',              href: '/admin/registrations',             icon: 'ClipboardList', pageKey: 'registrations' },
      { label: 'MC — ผู้ลงทะเบียน',         href: '/admin/masterclass/registrations', icon: 'ClipboardList', pageKey: 'mc_registrations' },
      { label: 'Career Path Registrations', href: '/admin/career-path-registrations', icon: 'ClipboardList', pageKey: 'career_path_registrations' },
    ],
  },
  {
    id: 'courses',
    label: 'หลักสูตร & ตาราง',
    items: [
      { label: 'หลักสูตร',          href: '/admin/courses',      icon: 'GraduationCap', pageKey: 'courses' },
      { label: 'ตารางอบรม',         href: '/admin/schedules',    icon: 'CalendarDays',  pageKey: 'schedules' },
      { label: 'ตารางฝึกอบรม PDF',  href: '/admin/schedule-pdf', icon: 'CalendarDays',  pageKey: 'schedule_pdf' },
      { label: 'วิทยากร',           href: '/admin/instructors',  icon: 'User',          pageKey: 'instructors' },
      { label: 'โปรแกรม & Skills',  href: '/admin/programs',     icon: 'Layers',        pageKey: 'programs' },
      { label: 'Career Path',       href: '/admin/career-paths', icon: 'Map',           pageKey: 'career_paths' },
      { label: 'Masterclass',       href: '/admin/masterclass',  icon: 'GraduationCap', pageKey: 'masterclass' },
      { label: 'TNHS Courses',      href: '/admin/tnhs-courses', icon: 'ExternalLink',  pageKey: 'tnhs_courses' },
    ],
  },
  {
    id: 'layout',
    label: 'จัดวางหน้าเว็บ',
    items: [
      { label: 'แบนเนอร์',              href: '/admin/banners',                     icon: 'Image',         pageKey: 'banners' },
      { label: 'หลักสูตรแนะนำ',         href: '/admin/featured-courses',            icon: 'Star',          pageKey: 'featured_courses' },
      { label: 'คอร์สออนไลน์แนะนำ',     href: '/admin/featured-online-courses',     icon: 'Monitor',       pageKey: 'featured_online_courses' },
      { label: 'คอร์สออนไลน์ (Navbar)', href: '/admin/nav-featured-online-courses', icon: 'Monitor',       pageKey: 'nav_featured_online_courses' },
      { label: 'รีวิวแนะนำ',            href: '/admin/featured-reviews',            icon: 'MessageSquare', pageKey: 'featured_reviews' },
      { label: 'แบนเนอร์โปรโมชั่น',     href: '/admin/promotions/banner',           icon: 'Image',         pageKey: 'promotions_banner' },
      { label: 'Notifications',         href: '/admin/notifications',               icon: 'Bell',          pageKey: 'notifications' },
      { label: 'Program/Skill URL',     href: '/admin/page-configs',                icon: 'FileText',      pageKey: 'page_configs' },
    ],
  },
  {
    id: 'content',
    label: 'เนื้อหา',
    items: [
      { label: 'บทความ',           href: '/admin/articles',      icon: 'FileText',       pageKey: 'articles' },
      // `exact` because /admin/promotions/banner is a SEPARATE row above, and
      // this page's own child routes are not menu rows. See activeNavItem.js.
      { label: 'โปรโมชั่น',        href: '/admin/promotions',    icon: 'Tag', exact: true, pageKey: 'promotions' },
      { label: 'จัดการหน้าเพจ',    href: '/admin/pages',         icon: 'LayoutTemplate', pageKey: 'pages' },
      { label: 'เกี่ยวกับเรา',     href: '/admin/about',         icon: 'Info',           pageKey: 'about' },
      { label: 'ติดต่อเรา',        href: '/admin/contact',       icon: 'Phone',          pageKey: 'contact' },
      { label: 'ผลงานของเรา',      href: '/admin/portfolio',     icon: 'LayoutTemplate', pageKey: 'portfolio' },
      { label: 'โรงแรม/ร้านอาหาร', href: '/admin/nearby-places', icon: 'MapPin',         pageKey: 'nearby_places' },
      { label: 'FAQ',              href: '/admin/faqs',          icon: 'HelpCircle',     pageKey: 'faqs' },
      { label: 'FAQ (Local)',      href: '/admin/local-faqs',    icon: 'HelpCircle',     pageKey: 'local_faqs' },
      { label: 'ประกาศงาน',        href: '/admin/recruits',      icon: 'Briefcase',      pageKey: 'recruits' },
      { label: 'จัดการไฟล์',       href: '/admin/media',         icon: 'FolderOpen',     pageKey: 'media' },
    ],
  },
  {
    id: 'system',
    label: 'ระบบ',
    items: [
      { label: 'Cache Console',       href: '/admin/cache',        icon: 'Database',    pageKey: 'landing_cache' },
      { label: 'Webhook Logs',        href: '/admin/webhook-logs', icon: 'Webhook',     pageKey: 'webhook_logs' },
      { label: 'Redirect & 404',      href: '/admin/redirects',    icon: 'Shuffle',     pageKey: 'redirects' },
      { label: 'ประวัติการดำเนินการ', href: '/admin/audit-log',    icon: 'History',     pageKey: 'audit_log' },
      { label: 'บัญชีผู้ดูแล',        href: '/admin/accounts',     icon: 'Users',       pageKey: 'accounts' },
      { label: 'จัดการ Role',         href: '/admin/roles',        icon: 'ShieldCheck', pageKey: 'roles' },
      { label: 'ความปลอดภัย',         href: '/admin/security',     icon: 'Shield',      pageKey: 'security' },
      // `profile` is DELIBERATELY not a row here. It is still a registered,
      // permission-gated page (ADMIN_PAGES → ระบบ) — it simply reaches the user
      // through the signed-in identity card in the footer instead of taking a
      // 38th slot in a rail that was already too long. The absence is named in
      // NO_NAV_ITEM in test/fs/adminNavShape.test.mjs, so a key vanishing from
      // the nav in future fails instead of passing quietly.
    ],
  },
];

/** Every nav item across every group, flat — the input to activeNavHref. */
const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** The group ids this build renders — the whitelist for stored collapse state. */
const GROUP_IDS = NAV_GROUPS.map((g) => g.id);

/**
 * href → the id of the group it belongs to, for the force-open-the-active-group
 * rule.
 *
 * A PLAIN OBJECT and not `new Map(...)`, which is not a style choice: this file
 * imports lucide's `Map` icon (the Career Path row), so the identifier `Map` in
 * this module scope is a React component and `new Map()` throws
 * "Map is not a constructor" at import time — taking the whole admin layout
 * down, not just the sidebar. Found by test/render/adminSidebarGroupToggle,
 * which is the only reason it is not in this commit.
 */
const GROUP_ID_BY_HREF = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((item) => [item.href, g.id]))
);

/**
 * The signed-in identity: name, email, role badge.
 *
 * Extracted so the linked and the unlinked footer cards render IDENTICAL
 * content and only their wrapper differs. Written twice, the two would drift —
 * and the drift would show only to users without the `profile` permission,
 * which is nobody who is likely to be looking.
 */
function ProfileIdentity({ userName, userEmail, badgeLabel, badgeStyle }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-[var(--text-primary)]">
          {userName || userEmail}
        </p>
        {userEmail && userName && (
          <p className="truncate text-[var(--text-muted)]">{userEmail}</p>
        )}
      </div>
      {badgeLabel && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={badgeStyle}
        >
          {badgeLabel}
        </span>
      )}
    </>
  );
}

function LogoutModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ยืนยันการออกจากระบบ"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--surface-border)] bg-white p-6 shadow-xl dark:bg-[#111d2c]">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <LogOut className="h-5 w-5 text-red-600 dark:text-red-400" strokeWidth={1.75} />
        </div>
        <h2 className="text-base font-bold text-[var(--text-primary)]">ออกจากระบบ?</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          คุณต้องการออกจากระบบใช่หรือไม่
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-[var(--surface-border)] py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
          >
            ยกเลิก
          </button>
          <form action={logoutAction} className="flex-1">
            <button
              type="submit"
              className="w-full rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
            >
              ออกจากระบบ
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function AdminThemeToggle({ collapsed = false }) {
  // next-themes already handles localStorage + class on <html>; we just
  // mirror its state. Wait for mount before reading to avoid hydration
  // mismatch (server render has no theme info).
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? 'Light Mode' : 'Dark Mode';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
      title={collapsed ? (mounted ? label : 'Theme') : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-9e-md px-3 py-2.5 text-sm text-9e-slate-dp-50 transition-colors hover:bg-9e-ice hover:text-9e-navy dark:hover:bg-[#111d2c] dark:hover:text-white',
        collapsed && 'justify-center'
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
      {/* During SSR / pre-mount, render a stable placeholder so the
          initial markup doesn't depend on theme. Hidden when collapsed. */}
      {!collapsed && (mounted ? label : 'Theme')}
    </button>
  );
}

/**
 * A group heading — and, when the rail is expanded, the control that folds the
 * group away.
 *
 * It is a real <button>, not a div with an onClick: that is what puts it in the
 * tab order, makes Enter and Space work, and lets `aria-expanded` +
 * `aria-controls` describe the relationship a sighted user reads from the
 * chevron. The <ul> it names stays in the DOM when folded (hidden, not
 * unmounted) because `aria-controls` pointing at an element that does not exist
 * tells a screen reader nothing at all.
 *
 * `forcedOpen` is the case worth reading twice: the group holding the current
 * route is shown open whatever is stored, so a click here cannot close it —
 * what it does instead is record the preference, which takes effect the moment
 * you navigate elsewhere. A control that silently does nothing is a bug, so
 * that one case says so in its tooltip rather than leaving the user to wonder.
 */
function GroupHeader({ label, collapsed, expanded, forcedOpen, listId, onToggle }) {
  // Rail collapsed: the text label would overflow the narrow rail, so drop it
  // and keep a thin divider so groups stay visually separated. There is no
  // per-group toggle here either — the items are icon-only and a folded group
  // would leave no way to unfold it (see the nav loop, which ignores per-group
  // state entirely while the rail is collapsed).
  if (collapsed) {
    return <div className="mx-3 mt-4 mb-1 border-t border-[var(--surface-border)]" aria-hidden />;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={listId}
      title={forcedOpen ? 'กลุ่มนี้เปิดอยู่เพราะคุณอยู่ในหน้านี้' : undefined}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-9e-md px-3 pt-4 pb-1 text-left transition-colors',
        'hover:text-9e-navy dark:hover:text-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-action focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface)]'
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-9e-slate-lt-400/60 dark:text-9e-slate-dp-400/60">
        {label}
      </span>
      <ChevronDown
        className={cn(
          'h-3.5 w-3.5 shrink-0 text-9e-slate-lt-400/60 transition-transform duration-200 dark:text-9e-slate-dp-400/60',
          !expanded && '-rotate-90'
        )}
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}

// `isActive` is decided ONCE for the whole sidebar and handed down — see
// src/lib/admin/activeNavItem.js for why a per-item `startsWith` cannot be
// right (it lit both Masterclass and MC — ผู้ลงทะเบียน at the same time).
function SidebarItem({ item, isActive, collapsed }) {
  const Icon = ICONS[item.icon];

  return (
    <li>
      <Link
        href={item.href}
        // Collapsed: icon-only, centred, with the label as a native tooltip so
        // the rail stays usable. The active left-border is dropped when centred
        // (it would sit oddly under a lone icon); the tinted bg still marks it.
        title={collapsed ? item.label : undefined}
        // The active row was marked by colour alone. `aria-current` states it in
        // the accessibility tree as well — and gives the guard in
        // test/render/adminSidebarActiveItem a hook that survives a restyle.
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex items-center rounded-9e-md text-sm transition-colors',
          collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
          isActive
            ? cn('bg-9e-action/10 text-9e-action font-medium', !collapsed && 'border-l-2 border-9e-action')
            : 'text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#111d2c] hover:text-9e-navy dark:hover:text-white'
        )}
      >
        {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} /> : null}
        {!collapsed && item.label}
      </Link>
    </li>
  );
}

export function AdminSidebar({
  pages = [],
  isSuperadmin = false,
  roleKey = null,
  roleName = null,
  roleColor = null,
  userName = null,
  userEmail = null,
}) {
  const pathname = usePathname();
  const [logoutOpen, setLogoutOpen] = useState(false);

  // Collapse is chrome, persisted per-browser. Default expanded on SSR + first
  // client render (no localStorage read yet), then hydrate the stored choice
  // AFTER mount — so the initial markup is deterministic and there is no
  // hydration mismatch (same pattern as AdminThemeToggle's `mounted`).
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
    } catch { /* storage blocked (private mode) — stay expanded */ }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  // Per-group collapse. `{}` — every group expanded — is the SSR and first
  // client render value, which is today's behaviour and makes the initial
  // markup independent of storage, so there is no hydration mismatch. The
  // stored map is read in the effect below, exactly like COLLAPSE_KEY above and
  // AdminThemeToggle's `mounted`. Anything unparseable comes back as `{}` from
  // parseGroupCollapse rather than throwing inside a render.
  const [groupCollapse, setGroupCollapse] = useState({});
  useEffect(() => {
    try {
      setGroupCollapse(parseGroupCollapse(localStorage.getItem(GROUPS_KEY), GROUP_IDS));
    } catch { /* storage blocked (private mode) — every group stays expanded */ }
  }, []);
  const handleToggleGroup = (groupId, wasExpanded) => {
    setGroupCollapse((prev) => {
      const next = toggleGroupCollapse(prev, groupId, wasExpanded);
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Visibility is permission-driven: a nav item shows iff the user can
  // access its page. Superadmin (`isSuperadmin`) passes every key via the
  // allow-all path in canAccess. This is presentation only — the page and
  // action guards from Phase 3 are the real enforcement.
  const user = { pages, isSuperadmin };

  // Display label + free-hex color for the role badge come from the DB
  // Role doc (via the session). Inline style + readable ink keep any custom
  // color legible — Tailwind can't compile dynamic hex.
  const badgeLabel = roleName ?? roleKey;
  const badgeStyle = roleBadgeStyle(roleColor).soft;

  // ONE winner for the whole rail. Computed over the FULL list rather than the
  // canAccess-filtered one on purpose: a user who cannot see the child row
  // should still get no highlight on the parent for a path that belongs to the
  // child, rather than a parent row lighting up for a page they are on but
  // cannot navigate back to from the menu.
  const activeHref = activeNavHref(pathname, ALL_NAV_ITEMS);

  // The SAME check the โปรไฟล์ nav row used before it moved to the footer —
  // `canAccess(user, 'profile')`, not a role test and not "is there a user".
  // The permission did not change when the entry point did.
  const canReachProfile = canAccess(user, 'profile');

  // The group holding the current route, or null. It is shown expanded whatever
  // is stored — otherwise someone who folded จัดวางหน้าเว็บ last week and then
  // follows a link into /admin/banners arrives on a page whose own menu row is
  // invisible, with nothing on screen explaining why. Display only: nothing is
  // written back, so the preference survives the visit.
  const activeGroupId = activeHref ? GROUP_ID_BY_HREF[activeHref] ?? null : null;

  return (
    <aside
      className={cn(
        'hidden h-screen md:flex md:flex-col md:border-r md:border-[var(--surface-border)] md:bg-[var(--surface)]',
        'transition-[width] duration-200 ease-9e',
        collapsed ? 'md:w-16' : 'md:w-64'
      )}
    >
      {/* Header: ADMIN PANEL title + collapse toggle. Collapsed → just the
          toggle, centred (the title text would overflow the rail). */}
      <div className={cn('flex items-start gap-2', collapsed ? 'justify-center p-3' : 'justify-between p-6')}>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Admin Panel
            </p>
            <p className="mt-1 text-base font-bold text-[var(--text-primary)]">9Expert</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
          aria-expanded={!collapsed}
          title={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
          className="shrink-0 rounded-9e-md p-1.5 text-9e-slate-dp-50 transition-colors hover:bg-9e-ice hover:text-9e-navy dark:hover:bg-[#111d2c] dark:hover:text-white"
        >
          {collapsed
            ? <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.75} />
            : <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} />}
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 " aria-label="Admin">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => canAccess(user, item.pageKey));
          if (visibleItems.length === 0) return null;

          const listId = `admin-nav-${group.id}`;
          const forcedOpen = group.id === activeGroupId;
          // Rail collapsed → per-group state is IGNORED and everything shows.
          // There is no group header to click while the rail is narrow, so a
          // folded group would be unreachable until the rail was reopened.
          const expanded = collapsed || isGroupExpanded(group.id, groupCollapse, activeGroupId);

          return (
            <div key={group.id}>
              <GroupHeader
                label={group.label}
                collapsed={collapsed}
                expanded={expanded}
                forcedOpen={forcedOpen}
                listId={listId}
                onToggle={() => handleToggleGroup(group.id, expanded)}
              />
              {/* Hidden rather than unmounted: `aria-controls` above names this
                  element, and pointing it at something that is not in the DOM
                  describes nothing. */}
              <ul id={listId} hidden={!expanded} className="space-y-1">
                {visibleItems.map((item) => (
                  <SidebarItem
                    key={item.href}
                    item={item}
                    isActive={item.href === activeHref}
                    collapsed={collapsed}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Footer: signed-in identity + role badge + logout. Collapsed → the
          identity text (all truncate-prone) is hidden so nothing overflows the
          narrow rail; theme + logout degrade to centred icon-only with tooltips. */}
      <div className="border-t border-[var(--surface-border)] p-3">
        {!collapsed && (userName || userEmail) && (
          canReachProfile ? (
            // The identity card IS the link to /admin/profile — โปรไฟล์ gave up
            // its nav row for this. Because it is now a control and not a label,
            // it needs the things a control needs: it is an <a>, so it is in the
            // tab order; `focus-visible:ring` gives keyboard users a ring the
            // mouse never shows; hover tints the whole card so it reads as
            // clickable before it is clicked.
            <Link
              href="/admin/profile"
              aria-label="โปรไฟล์ของฉัน"
              className={cn(
                'mb-2 flex items-center gap-2 rounded-9e-md px-3 py-2 text-xs transition-colors',
                'hover:bg-9e-ice dark:hover:bg-[#111d2c]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-action focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface)]'
              )}
            >
              <ProfileIdentity
                userName={userName}
                userEmail={userEmail}
                badgeLabel={badgeLabel}
                badgeStyle={badgeStyle}
              />
            </Link>
          ) : (
            // No `profile` permission → the SAME markup as before, as inert
            // text. Not a disabled-looking link and not a link to a 403: a
            // control that visibly exists and refuses is worse than one that
            // was never offered, and this block's job is to say who is signed
            // in, which it still does.
            <div className="mb-2 flex items-center gap-2 px-3 py-2 text-xs">
              <ProfileIdentity
                userName={userName}
                userEmail={userEmail}
                badgeLabel={badgeLabel}
                badgeStyle={badgeStyle}
              />
            </div>
          )
        )}
        {/* ── THE COLLAPSED AFFORDANCE ────────────────────────────────────────
            Collapsed, the identity text is hidden — so the link above is hidden
            with it, and /admin/profile would have NO route from the menu at all
            now that its nav row is gone. (Before this round it kept its own row,
            which survived collapse as an icon.) So collapsed gets an icon-only
            row in the footer, same treatment as the theme and logout buttons
            beside it: centred User glyph, label as a native tooltip, same focus
            ring. Same permission gate — when the user cannot reach the page,
            nothing renders here rather than a dead icon. */}
        {collapsed && canReachProfile && (
          <Link
            href="/admin/profile"
            title="โปรไฟล์"
            aria-label="โปรไฟล์ของฉัน"
            className={cn(
              'mb-1 flex w-full items-center justify-center rounded-9e-md px-0 py-2 text-sm text-[var(--text-secondary)] transition-colors',
              'hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-action focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface)]'
            )}
          >
            <User className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          </Link>
        )}
        <AdminThemeToggle collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setLogoutOpen(true)}
          title={collapsed ? 'ออกจากระบบ' : undefined}
          className={cn(
            'flex w-full items-center rounded-9e-md py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          {!collapsed && 'ออกจากระบบ'}
        </button>
      </div>
      <LogoutModal open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </aside>
  );
}
