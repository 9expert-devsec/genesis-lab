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
import { avatarUrl } from '@/lib/avatar/avatarUrl';
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

// The one size the rail renders an avatar at, in both states. An allowlisted
// value of avatarUrl (36/72/128/256) — passing anything else throws, which is
// the point of the allowlist.
const AVATAR_PX = 36;

/**
 * The focus ring every interactive element in the rail wears.
 *
 * ONE CONSTANT, because A2 and B5 both depend on this ring existing and there
 * are now five controls carrying it (collapse toggle, group headers, nav items,
 * the profile card, theme + logout). Five copies of a class string is five
 * chances for one of them to be missed on the day the colour changes.
 *
 * THE COLOUR IS --admin-rail-focus (#48B0FF), NOT --9e-action, which is the
 * ring colour used everywhere else in the admin. Action is tuned for a white
 * background; on this rail it scores 3.29:1 and all but disappears. Air scores
 * 7.40:1. The offset colour is the rail itself, so the ring reads as a ring
 * rather than as a halo — measured in test/fs/adminRailContrast.
 *
 * Focus is deliberately a RING and hover is a FILL, so the three states stay
 * three: hover lifts the ground, focus draws an outline, active is a solid
 * blue pill. Two of them sharing a treatment would collapse into one.
 */
const RAIL_FOCUS = cn(
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--admin-rail-focus)]',
  'focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--admin-rail-surface)]'
);

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
      {/* The card is a LIGHT surface on a dark rail, so these two are the only
          text in the sidebar that is dark-on-light. They read --admin-rail-card-*
          rather than --text-primary/--text-muted: the latter flip with the theme
          and would turn near-white on a card that stays light. */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--admin-rail-card-fg)]">
          {userName || userEmail}
        </p>
        {userEmail && userName && (
          <p className="truncate text-[11px] text-[var(--admin-rail-card-muted)]">{userEmail}</p>
        )}
      </div>
      {/* ── THE BADGE COLOUR IS DATA, NOT A TOKEN ───────────────────────────
          `badgeStyle` is an inline style computed from the role's free-hex
          colour in Mongo, so no token can govern it and this round does not
          try. What DID change is which variant: `solid` instead of `soft`.
          `soft` paints the role hex as text on a 14% tint of itself, which on
          this card measures 2.46–4.18:1 across the five shipped default roles —
          every one of them below AA. `solid` fills with the hex and lets
          readableInk pick the better of two inks, which lifts the same five to
          4.44–5.14:1. That is a colour choice between two variants the helper
          already offers for exactly this purpose, not a change to shared logic.
          It is NOT a guarantee: a custom role colour can still land under 4.5,
          and closing that properly means teaching readableInk to guarantee a
          ratio — shared with /admin/roles and /admin/accounts, and out of scope
          here. Reported rather than papered over.
          radius 6 = rounded-md, per the mockup. */}
      {badgeLabel && (
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium"
          style={badgeStyle}
        >
          {badgeLabel}
        </span>
      )}
    </>
  );
}

/**
 * The signed-in admin's avatar, at the one size the rail uses.
 *
 * PLAIN <img>, NOT next/image, and the reasoning lives in
 * src/lib/avatar/avatarUrl.js: that function already returns an asset at
 * exactly the requested pixel size with f_auto/q_auto, so next/image would run
 * a second optimiser pass over an already-optimised URL and its srcset would
 * have nothing to choose between across four allowlisted sizes. It also keeps
 * the `Image` identifier out of this file — which imports lucide icons, and
 * where `new Map(...)` already cost the whole admin layout once.
 *
 * `aria-hidden` because in both rail states this sits inside a control that
 * already has an accessible name ("โปรไฟล์ของฉัน"), or beside text that says
 * the same thing. An alt of "profile photo" would make a screen reader
 * announce the person twice.
 *
 * NOT lazy: it is above the fold in every admin page load, in a fixed-size box
 * that is on screen the moment the rail paints. `loading="lazy"` is for the
 * things below it.
 */
function SidebarAvatar({ publicId }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={avatarUrl(publicId, AVATAR_PX)}
      alt=""
      width={AVATAR_PX}
      height={AVATAR_PX}
      aria-hidden="true"
      className="shrink-0 rounded-full object-cover"
      style={{ width: AVATAR_PX, height: AVATAR_PX }}
    />
  );
}

/**
 * The footer: avatar + identity + role badge, the theme toggle, and logout.
 *
 * ── WHY THIS IS ITS OWN EXPORTED COMPONENT ──────────────────────────────────
 * `collapsed` lives in AdminSidebar as post-mount state read from localStorage,
 * so it is ALWAYS false in a server render and the collapsed rail could not be
 * rendered by a test at all. Round A could only assert the collapsed branch by
 * reading the source, and said so in the test that did it.
 *
 * Taking `collapsed` as a PROP here costs nothing at runtime — AdminSidebar
 * passes exactly the state it already had — and turns that source-read into a
 * real render assertion. See test/render/adminSidebarAvatar.
 */
export function AdminSidebarFooter({
  collapsed = false,
  canReachProfile = false,
  userName = null,
  userEmail = null,
  userImagePublicId = null,
  badgeLabel = null,
  badgeStyle = undefined,
  onLogout,
}) {
  // Collapsed → the identity text (all truncate-prone) is hidden so nothing
  // overflows the narrow rail; theme + logout degrade to centred icon-only
  // with tooltips.
  return (
    // 16px horizontal to match the nav above it; the rule across the top is the
    // rail's own divider, not --surface-border, which flips with the theme and
    // is a near-invisible 12%-alpha navy on this surface in light mode.
    <div className="border-t border-[var(--admin-rail-divider)] px-4 py-3">
      {!collapsed && (userName || userEmail) && (
        canReachProfile ? (
          // The identity card IS the link to /admin/profile — โปรไฟล์ gave up
          // its nav row for this. Because it is a control and not a label, it
          // needs the things a control needs: it is an <a>, so it is in the tab
          // order; `focus-visible:ring` gives keyboard users a ring the mouse
          // never shows; hover tints the whole card so it reads as clickable
          // before it is clicked.
          //
          // ONE RING AROUND THE WHOLE CONTROL. The avatar is inside this <a>
          // and is not a link of its own — a second tab stop landing on the
          // same destination is a control that looks broken to anyone using a
          // keyboard, and two rings on one row look like two controls.
          <Link
            href="/admin/profile"
            aria-label="โปรไฟล์ของฉัน"
            // A light card ON the dark rail: radius 12 and 12px padding, per the
            // mockup. The hover lift is --admin-rail-card-hover (white) rather
            // than the rail's own hover fill — inverting a light card to a dark
            // one on hover would take the user's name from 16.6:1 to unreadable.
            className={cn(
              'mb-2 flex items-center gap-2 rounded-9e-md bg-[var(--admin-rail-card)] p-3 transition-colors',
              'hover:bg-[var(--admin-rail-card-hover)]',
              RAIL_FOCUS
            )}
          >
            <SidebarAvatar publicId={userImagePublicId} />
            <ProfileIdentity
              userName={userName}
              userEmail={userEmail}
              badgeLabel={badgeLabel}
              badgeStyle={badgeStyle}
            />
          </Link>
        ) : (
          // No `profile` permission → inert text. Not a disabled-looking link
          // and not a link to a 403: a control that visibly exists and refuses
          // is worse than one that was never offered.
          //
          // THE AVATAR STILL RENDERS. It is not a control — it is part of
          // saying who is signed in, which is this block's other job and is not
          // permission-gated. Dropping it here would make the rail look
          // different for a role rather than offer less.
          // Same card, no interaction: identical surface, radius and padding so
          // the rail does not look different for a role — it just offers less.
          <div className="mb-2 flex items-center gap-2 rounded-9e-md bg-[var(--admin-rail-card)] p-3">
            <SidebarAvatar publicId={userImagePublicId} />
            <ProfileIdentity
              userName={userName}
              userEmail={userEmail}
              badgeLabel={badgeLabel}
              badgeStyle={badgeStyle}
            />
          </div>
        )
      )}

      {/* ── THE COLLAPSED AFFORDANCE ──────────────────────────────────────────
          Collapsed, the identity text is hidden — so the card above is hidden
          with it, and /admin/profile would have NO route from the menu at all
          now that its nav row is gone. So collapsed gets its own row: the same
          36px avatar, centred, with the label as a native tooltip and the same
          focus ring.
          THE AVATAR IS THE AFFORDANCE, not a User glyph beside it — at this
          width there is room for exactly one thing, and a photo of the person
          says "your account" faster than an outline of a generic head. When no
          photo is set, avatarUrl returns the bundled default, so the box is
          never empty.
          Same permission gate as above: no link when the page is unreachable —
          but the avatar still renders, as inert markup, for the same reason it
          does in the expanded case. */}
      {collapsed && (
        canReachProfile ? (
          <Link
            href="/admin/profile"
            title="โปรไฟล์"
            aria-label="โปรไฟล์ของฉัน"
            // Collapsed there is no card — the avatar sits directly on the
            // rail, so this row takes the RAIL's hover fill, not the card's.
            className={cn(
              'mb-1 flex w-full items-center justify-center rounded-9e-sm px-0 py-2 transition-colors',
              'hover:bg-[var(--admin-rail-hover)]',
              RAIL_FOCUS
            )}
          >
            <SidebarAvatar publicId={userImagePublicId} />
          </Link>
        ) : (
          <div className="mb-1 flex w-full items-center justify-center px-0 py-2">
            <SidebarAvatar publicId={userImagePublicId} />
          </div>
        )
      )}

      <AdminThemeToggle collapsed={collapsed} />
      <button
        type="button"
        onClick={onLogout}
        title={collapsed ? 'ออกจากระบบ' : undefined}
        className={cn(
          'flex w-full items-center rounded-9e-sm py-2 text-[13px] transition-colors',
          'text-[var(--admin-rail-item)]',
          'hover:bg-[var(--admin-rail-hover)] hover:text-[var(--admin-rail-brand)]',
          RAIL_FOCUS,
          collapsed ? 'justify-center px-0' : 'gap-3 px-3'
        )}
      >
        <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {!collapsed && 'ออกจากระบบ'}
      </button>
    </div>
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
      {/* THE ONE THING IN THIS FILE THAT IS STILL THEME-AWARE, deliberately:
          this is a dialog over the main column, not rail chrome, so it follows
          the theme like every other admin dialog.
          `bg-white dark:bg-[#111d2c]` became `bg-[var(--surface)]`, which IS
          white in light and #132638 in dark — the same intent, expressed with
          the token instead of a stray literal that matched no palette entry.
          That literal was the last raw hex in this file, and the no-raw-hex
          guard would otherwise have needed an exclusion carved around it. */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-xl">
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
      // The control that switches the REST of the admin, styled like every
      // other rail row — and it does not switch the rail itself, which is the
      // point of C2's ruling. Icon inherits currentColor.
      className={cn(
        'flex w-full items-center gap-3 rounded-9e-sm px-3 py-2 text-[13px] transition-colors',
        'text-[var(--admin-rail-item)]',
        'hover:bg-[var(--admin-rail-hover)] hover:text-[var(--admin-rail-brand)]',
        RAIL_FOCUS,
        collapsed && 'justify-center'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
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
    return <div className="mx-2 mt-6 mb-2 border-t border-[var(--admin-rail-divider)]" aria-hidden />;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={listId}
      title={forcedOpen ? 'กลุ่มนี้เปิดอยู่เพราะคุณอยู่ในหน้านี้' : undefined}
      // ── NO HOVER FILL ON THIS ROW, AND THAT IS MEASURED ──────────────────
      // Every other row in the rail lifts to --admin-rail-hover on hover. This
      // one does not: --admin-rail-group on that fill measures 3.90:1, below
      // AA, so a header that lifted would become unreadable at exactly the
      // moment the pointer was on it. It brightens its TEXT to the wordmark
      // colour instead and leaves the ground alone — 16.64:1. The failing pair
      // is asserted to still fail in test/fs/adminRailContrast, so if the
      // palette ever makes it safe, that test says so rather than this comment
      // quietly going stale.
      className={cn(
        'group/hdr flex w-full items-center justify-between gap-2 rounded-9e-sm px-3 pb-2 pt-1 text-left transition-colors',
        'text-[var(--admin-rail-group)] hover:text-[var(--admin-rail-brand)]',
        RAIL_FOCUS
      )}
    >
      {/* 11px, uppercase, semibold, wide tracking. THE HIERARCHY LIVES HERE,
          not in the colour: the header is only one step dimmer than an item
          label (5.90:1 vs 7.08:1) because the alternative — reaching the
          contrast floor by going faint — is what the mockup did, and it lands
          at 3.66:1. */}
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
        {label}
      </span>
      {/* currentColor: the chevron inherits the button's text colour, so it
          brightens with the label on hover and needs no colour of its own. */}
      <ChevronDown
        className={cn(
          'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
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
        // Three states, three treatments, none of them shared:
        //   active  a SOLID --admin-rail-active-bg pill, radius 8
        //   hover   a --admin-rail-hover fill, label brightened to the wordmark
        //   focus   the RAIL_FOCUS ring
        // The old left-border-plus-10%-tint active marker is gone: a 10% tint of
        // --9e-action on a navy rail is nearly invisible, and it was carrying the
        // "you are here" signal that aria-current only states.
        //
        // The mockup's geometry gives the active row more vertical padding and a
        // larger icon than an inactive one — it is the only row that is meant to
        // have weight. Collapsed, both go to the same box: with no label there is
        // nothing for the extra height to balance.
        className={cn(
          'flex items-center rounded-9e-sm text-[13px] transition-colors',
          RAIL_FOCUS,
          collapsed
            ? 'justify-center px-0 py-2.5'
            : cn('gap-3 px-3', isActive ? 'py-2.5' : 'py-1.5'),
          isActive
            ? 'bg-[var(--admin-rail-active-bg)] font-medium text-[var(--admin-rail-active-fg)]'
            : cn(
              'text-[var(--admin-rail-item)]',
              'hover:bg-[var(--admin-rail-hover)] hover:text-[var(--admin-rail-brand)]'
            )
        )}
      >
        {/* currentColor — the icon takes the row's label colour, so it is white
            on the active pill and slate otherwise with nothing to keep in sync. */}
        {Icon ? (
          <Icon
            className={cn('shrink-0', isActive || collapsed ? 'h-[18px] w-[18px]' : 'h-4 w-4')}
            strokeWidth={1.75}
          />
        ) : null}
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
  // Read from Mongo by AdminLayout, NOT from the session — see the comment
  // there. Defaulting to null means an omitted prop renders the bundled
  // default rather than throwing.
  userImagePublicId = null,
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
  // `solid`, not `soft` — see the note on the badge in ProfileIdentity. The
  // helper's own docstring says callers choose per context; the light user card
  // on a dark rail is a different context from the white pages `soft` was
  // picked for, and `soft` measures below AA there for every shipped role.
  const badgeStyle = roleBadgeStyle(roleColor).solid;

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
    // ── THE RAIL IS THEME-INVARIANT ────────────────────────────────────────
    // Every colour inside this <aside> comes from --admin-rail-*, which
    // globals.css declares on :root and NEVER under .dark. That is where the
    // exemption lives — not in a specificity race — and no element inside the
    // rail carries a `dark:` variant. test/fs/adminRailTheme keeps it that way.
    //
    // The theme toggle still switches the REST of the admin: main, the content
    // header and every table read --surface and --text-* exactly as before.
    // Only what is inside this element opts out.
    //
    // LogoutModal is the one thing rendered from this file that is NOT the
    // rail: it is `fixed inset-0`, a dialog over the main column, and it stays
    // theme-aware like every other admin dialog. The guard names it as an
    // exclusion by element rather than by file, so the exemption cannot quietly
    // widen to cover the rail again.
    //
    // The right edge keeps a border, and it is load-bearing rather than
    // decorative: in DARK mode --page-bg is #0D1B2A, the same colour as the
    // rail, so without this line the rail and the main column merge into one
    // surface. The mockup's light hairline is not used — on a dark rail it
    // reads as a white stripe, which is a leftover from a light-mode draft.
    <aside
      className={cn(
        'hidden h-screen md:flex md:flex-col md:border-r',
        'md:border-[var(--admin-rail-divider)] md:bg-[var(--admin-rail-surface)]',
        'transition-[width] duration-200 ease-9e',
        // 240px expanded, per the mockup's geometry (was 256).
        collapsed ? 'md:w-16' : 'md:w-60'
      )}
    >
      {/* Header: ADMIN PANEL title + collapse toggle. Collapsed → just the
          toggle, centred (the title text would overflow the rail). */}
      {/* 16 horizontal / 24 vertical, and mb-8 = the mockup's 32px gap down to
          the first group. The wordmark stays TEXT — the mockup draws a brand
          lockup, but swapping a <p> for an <img> is structure, not colour, and
          this round changes neither. */}
      <div className={cn('flex items-start gap-2', collapsed ? 'justify-center p-3' : 'justify-between px-4 py-6 mb-8')}>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-rail-group)]">
              Admin Panel
            </p>
            <p className="mt-1 text-base font-bold text-[var(--admin-rail-brand)]">9Expert</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
          aria-expanded={!collapsed}
          title={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
          className={cn(
            'shrink-0 rounded-9e-sm p-1.5 text-[var(--admin-rail-item)] transition-colors',
            'hover:bg-[var(--admin-rail-hover)] hover:text-[var(--admin-rail-brand)]',
            RAIL_FOCUS
          )}
        >
          {collapsed
            ? <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.75} />
            : <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} />}
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-4 pb-4" aria-label="Admin">
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
            // 24px between groups, per the mockup. `first:mt-0` because the
            // brand block above already owns the 32px gap down to the first
            // group, and stacking the two would make that gap 56px.
            <div key={group.id} className="mt-6 first:mt-0">
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
              {/* 8px between rows inside a group, per the mockup. */}
              <ul id={listId} hidden={!expanded} className="space-y-2">
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

      <AdminSidebarFooter
        collapsed={collapsed}
        canReachProfile={canReachProfile}
        userName={userName}
        userEmail={userEmail}
        userImagePublicId={userImagePublicId}
        badgeLabel={badgeLabel}
        badgeStyle={badgeStyle}
        onLogout={() => setLogoutOpen(true)}
      />
      <LogoutModal open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </aside>
  );
}
