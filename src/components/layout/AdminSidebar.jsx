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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logoutAction } from '@/lib/actions/auth';
import { canAccess } from '@/lib/rbac/access';
import { roleBadgeStyle } from '@/lib/rbac/roleColor';

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
};

// Nav config. Each item declares the `pageKey` it maps to (matching
// ADMIN_PAGES / the page + action guards from Phase 3). Visibility is
// decided purely by `canAccess(user, pageKey)` below — no role whitelists.
const NAV_GROUPS = [
  {
    label: 'ภาพรวม',
    items: [
      { label: 'แดชบอร์ด', href: '/admin', icon: 'LayoutDashboard', exact: true, pageKey: 'dashboard' },
    ],
  },
  {
    label: 'จัดการหลักสูตร',
    items: [
      { label: 'หลักสูตรแนะนำ',        href: '/admin/featured-courses',          icon: 'Star',          pageKey: 'featured_courses' },
      { label: 'คอร์สออนไลน์แนะนำ',    href: '/admin/featured-online-courses',   icon: 'Monitor',       pageKey: 'featured_online_courses' },
      { label: 'คอร์สออนไลน์ (Navbar)', href: '/admin/nav-featured-online-courses', icon: 'Monitor',    pageKey: 'nav_featured_online_courses' },
      { label: 'หลักสูตร',             href: '/admin/courses',                   icon: 'GraduationCap', pageKey: 'courses' },
      { label: 'ตารางอบรม',            href: '/admin/schedules',                 icon: 'CalendarDays',  pageKey: 'schedules' },
      { label: 'วิทยากร',              href: '/admin/instructors',               icon: 'User',          pageKey: 'instructors' },
      { label: 'โปรแกรม & Skills',     href: '/admin/programs',                  icon: 'Layers',        pageKey: 'programs' },
      { label: 'Career Path',          href: '/admin/career-paths',              icon: 'Map',           pageKey: 'career_paths' },
      { label: 'Masterclass',          href: '/admin/masterclass',               icon: 'GraduationCap', pageKey: 'masterclass' },
      { label: 'MC — ผู้ลงทะเบียน',   href: '/admin/masterclass/registrations', icon: 'ClipboardList', pageKey: 'mc_registrations' },
      { label: 'TNHS Courses',         href: '/admin/tnhs-courses',              icon: 'ExternalLink',  pageKey: 'tnhs_courses' },
      { label: 'Program/Skill URL',    href: '/admin/page-configs',              icon: 'FileText',      pageKey: 'page_configs' },
    ],
  },
  {
    label: 'จัดการคอนเทนต์',
    items: [
      { label: 'แบนเนอร์',         href: '/admin/banners',          icon: 'Image',          pageKey: 'banners' },
      { label: 'โปรโมชั่น',        href: '/admin/promotions',       icon: 'Tag', exact: true, pageKey: 'promotions' },
      { label: 'แบนเนอร์โปรโมชั่น', href: '/admin/promotions/banner', icon: 'Image',          pageKey: 'promotions_banner' },
      { label: 'Notifications',    href: '/admin/notifications',    icon: 'Bell',           pageKey: 'notifications' },
      { label: 'เกี่ยวกับเรา',     href: '/admin/about',            icon: 'Info',           pageKey: 'about' },
      { label: 'ติดต่อเรา',        href: '/admin/contact',          icon: 'Phone',          pageKey: 'contact' },
      { label: 'ผลงานของเรา',      href: '/admin/portfolio',        icon: 'LayoutTemplate', pageKey: 'portfolio' },
      { label: 'โรงแรม/ร้านอาหาร', href: '/admin/nearby-places',    icon: 'MapPin',         pageKey: 'nearby_places' },
      { label: 'รีวิวแนะนำ',       href: '/admin/featured-reviews', icon: 'MessageSquare',  pageKey: 'featured_reviews' },
      { label: 'บทความ',           href: '/admin/articles',         icon: 'FileText',       pageKey: 'articles' },
      { label: 'จัดการหน้าเพจ',     href: '/admin/pages',            icon: 'LayoutTemplate', pageKey: 'pages' },
      { label: 'FAQ',              href: '/admin/faqs',             icon: 'HelpCircle',     pageKey: 'faqs' },
      { label: 'FAQ (Local)',      href: '/admin/local-faqs',       icon: 'HelpCircle',     pageKey: 'local_faqs' },
      { label: 'ตารางฝึกอบรม PDF', href: '/admin/schedule-pdf',     icon: 'CalendarDays',   pageKey: 'schedule_pdf' },
    ],
  },
  {
    label: 'ระบบ',
    items: [
      { label: 'การลงทะเบียน',              href: '/admin/registrations',              icon: 'ClipboardList', pageKey: 'registrations' },
      { label: 'Career Path Registrations', href: '/admin/career-path-registrations', icon: 'ClipboardList', pageKey: 'career_path_registrations' },
      { label: 'ประกาศงาน',     href: '/admin/recruits',       icon: 'Briefcase', pageKey: 'recruits' },
      { label: 'Landing Cache', href: '/admin/landing-cache',  icon: 'Database',  pageKey: 'landing_cache' },
      { label: 'Webhook Logs',  href: '/admin/webhook-logs',   icon: 'Webhook',   pageKey: 'webhook_logs' },
      { label: 'ความปลอดภัย',   href: '/admin/security',       icon: 'Shield',    pageKey: 'security' },
      { label: 'โปรไฟล์',       href: '/admin/profile',        icon: 'User',      pageKey: 'profile' },
      { label: 'บัญชีผู้ดูแล',   href: '/admin/accounts',       icon: 'Users',     pageKey: 'accounts' },
      { label: 'จัดการ Role',   href: '/admin/roles',          icon: 'ShieldCheck', pageKey: 'roles' },
    ],
  },
];

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

function AdminThemeToggle() {
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
      className="flex w-full items-center gap-3 rounded-9e-md px-3 py-2.5 text-sm text-9e-slate-dp-50 transition-colors hover:bg-9e-ice hover:text-9e-navy dark:hover:bg-[#111d2c] dark:hover:text-white"
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      {/* During SSR / pre-mount, render a stable placeholder so the
          initial markup doesn't depend on theme. */}
      {mounted ? label : 'Theme'}
    </button>
  );
}

function GroupHeader({ label }) {
  return (
    <div className="px-3 pt-4 pb-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-9e-slate-lt-400/60 dark:text-9e-slate-dp-400/60">
        {label}
      </p>
    </div>
  );
}

function SidebarItem({ item, currentPath }) {
  const Icon = ICONS[item.icon];
  const isActive = item.exact
    ? currentPath === item.href
    : currentPath === item.href ||
      (item.href !== '/admin' && currentPath.startsWith(item.href));

  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-3 rounded-9e-md px-3 py-2.5 text-sm transition-colors',
          isActive
            ? 'bg-9e-action/10 text-9e-action font-medium border-l-2 border-9e-action'
            : 'text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#111d2c] hover:text-9e-navy dark:hover:text-white'
        )}
      >
        {Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} /> : null}
        {item.label}
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

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-[var(--surface-border)] md:bg-[var(--surface)] h-screen">
      <div className="p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Admin Panel
        </p>
        <p className="mt-1 text-base font-bold text-[var(--text-primary)]">9Expert</p>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 " aria-label="Admin">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => canAccess(user, item.pageKey));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <GroupHeader label={group.label} />
              <ul className="space-y-1">
                {visibleItems.map((item) => (
                  <SidebarItem
                    key={item.href}
                    item={item}
                    currentPath={pathname}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Footer: signed-in identity + role badge + logout */}
      <div className="border-t border-[var(--surface-border)] p-3">
        {(userName || userEmail) && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 text-xs">
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
          </div>
        )}
        <AdminThemeToggle />
        <button
          type="button"
          onClick={() => setLogoutOpen(true)}
          className="flex w-full items-center gap-3 rounded-9e-md px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
          ออกจากระบบ
        </button>
      </div>
      <LogoutModal open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </aside>
  );
}
