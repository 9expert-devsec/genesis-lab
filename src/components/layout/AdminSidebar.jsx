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

const ROLE_BADGE = {
  superadmin:        'bg-blue-100 text-blue-700',
  owner:             'bg-blue-100 text-blue-700',
  admin:             'bg-gray-100 text-gray-700',
  editor:            'bg-yellow-100 text-yellow-700',
  registration_admin: 'bg-green-100 text-green-700',
  it_support_admin:  'bg-purple-100 text-purple-700',
};

const SUPERADMIN_ROLES = new Set(['superadmin', 'owner']);

// Roles that are NOT superadmin/admin but still have explicit access to specific nav items.
// Used by the `roles` whitelist on NAV_GROUPS items below.
const REGISTRATION_ADMIN_ROLES = new Set(['superadmin', 'owner', 'admin', 'registration_admin', 'it_support_admin']);
const IT_SUPPORT_ROLES         = new Set(['superadmin', 'owner', 'admin', 'it_support_admin']);

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

// Access key: which roles can see a nav item.
// `roles` is a Set — item is visible only if the current role is in the set.
// Items WITHOUT a `roles` key are visible to superadmin/owner only (default-closed).
// Special sets:
//   ALL_ADMIN_ROLES  — every role including the two new ones
//   REGISTRATION_ADMIN_ROLES — superadmin + admin + registration_admin + it_support_admin
//   IT_SUPPORT_ROLES         — superadmin + admin + it_support_admin
const ALL_ADMIN_ROLES = new Set(['superadmin', 'owner', 'admin', 'editor', 'registration_admin', 'it_support_admin']);

const NAV_GROUPS = [
  {
    label: 'ภาพรวม',
    items: [
      { label: 'แดชบอร์ด', href: '/admin', icon: 'LayoutDashboard', exact: true, roles: ALL_ADMIN_ROLES },
    ],
  },
  {
    label: 'จัดการหลักสูตร',
    items: [
      { label: 'หลักสูตรแนะนำ',        href: '/admin/featured-courses',          icon: 'Star',          roles: IT_SUPPORT_ROLES },
      { label: 'คอร์สออนไลน์แนะนำ',    href: '/admin/featured-online-courses',   icon: 'Monitor',       roles: IT_SUPPORT_ROLES },
      { label: 'คอร์สออนไลน์ (Navbar)', href: '/admin/nav-featured-online-courses', icon: 'Monitor' },
      { label: 'หลักสูตร',             href: '/admin/courses',                   icon: 'GraduationCap', roles: IT_SUPPORT_ROLES },
      { label: 'ตารางอบรม',            href: '/admin/schedules',                 icon: 'CalendarDays',  roles: ALL_ADMIN_ROLES },
      { label: 'วิทยากร',              href: '/admin/instructors',               icon: 'User' },
      { label: 'โปรแกรม & Skills',     href: '/admin/programs',                  icon: 'Layers',        roles: IT_SUPPORT_ROLES },
      { label: 'Career Path',          href: '/admin/career-paths',              icon: 'Map',           roles: IT_SUPPORT_ROLES },
      { label: 'Masterclass',          href: '/admin/masterclass',               icon: 'GraduationCap', roles: IT_SUPPORT_ROLES },
      { label: 'MC — ผู้ลงทะเบียน',   href: '/admin/masterclass/registrations', icon: 'ClipboardList', roles: REGISTRATION_ADMIN_ROLES },
      { label: 'TNHS Courses',         href: '/admin/tnhs-courses',              icon: 'ExternalLink' },
      { label: 'Program/Skill URL',    href: '/admin/page-configs',              icon: 'FileText' },
    ],
  },
  {
    label: 'จัดการคอนเทนต์',
    items: [
      { label: 'แบนเนอร์',         href: '/admin/banners',          icon: 'Image' },
      { label: 'โปรโมชั่น',        href: '/admin/promotions',       icon: 'Tag', exact: true },
      { label: 'แบนเนอร์โปรโมชั่น', href: '/admin/promotions/banner', icon: 'Image' },
      { label: 'Notifications',    href: '/admin/notifications',    icon: 'Bell' },
      { label: 'เกี่ยวกับเรา',     href: '/admin/about',            icon: 'Info' },
      { label: 'ติดต่อเรา',        href: '/admin/contact',          icon: 'Phone' },
      { label: 'ผลงานของเรา',      href: '/admin/portfolio',        icon: 'LayoutTemplate' },
      { label: 'โรงแรม/ร้านอาหาร', href: '/admin/nearby-places',    icon: 'MapPin' },
      { label: 'รีวิวแนะนำ',       href: '/admin/featured-reviews', icon: 'MessageSquare' },
      { label: 'บทความ',           href: '/admin/articles',         icon: 'FileText', roles: IT_SUPPORT_ROLES },
      { label: 'จัดการหน้าเพจ',     href: '/admin/pages',            icon: 'LayoutTemplate', roles: IT_SUPPORT_ROLES },
      { label: 'FAQ',              href: '/admin/faqs',             icon: 'HelpCircle', roles: IT_SUPPORT_ROLES },
      { label: 'FAQ (Local)',      href: '/admin/local-faqs',       icon: 'HelpCircle', roles: IT_SUPPORT_ROLES },
      { label: 'ตารางฝึกอบรม PDF', href: '/admin/schedule-pdf',     icon: 'CalendarDays', roles: IT_SUPPORT_ROLES },
    ],
  },
  {
    label: 'ระบบ',
    items: [
      { label: 'การลงทะเบียน',              href: '/admin/registrations',              icon: 'ClipboardList', roles: REGISTRATION_ADMIN_ROLES },
      { label: 'Career Path Registrations', href: '/admin/career-path-registrations', icon: 'ClipboardList', roles: REGISTRATION_ADMIN_ROLES },
      { label: 'ประกาศงาน',     href: '/admin/recruits',       icon: 'Briefcase' },
      { label: 'Landing Cache', href: '/admin/landing-cache',  icon: 'Database' },
      { label: 'Webhook Logs',  href: '/admin/webhook-logs',   icon: 'Webhook' },
      { label: 'ความปลอดภัย',   href: '/admin/security',       icon: 'Shield' },
      { label: 'โปรไฟล์',       href: '/admin/profile',        icon: 'User',    roles: ALL_ADMIN_ROLES },
      {
        label: 'บัญชีผู้ดูแล',
        href: '/admin/accounts',
        icon: 'Users',
        superadminOnly: true,
      },
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

function SidebarItem({ item, currentPath, isSuper, role }) {
  if (item.superadminOnly && !isSuper) return null;
  if (item.roles && !item.roles.has(role)) return null;

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

export function AdminSidebar({ role = null, userName = null, userEmail = null }) {
  const pathname = usePathname();
  const isSuper = SUPERADMIN_ROLES.has(role);
  const [logoutOpen, setLogoutOpen] = useState(false);

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
          const visibleItems = group.items.filter((item) => {
            if (item.superadminOnly && !isSuper) return false;
            // If item has an explicit roles Set, check membership
            if (item.roles) return item.roles.has(role);
            // No roles key → superadmin/owner only (default-closed for new roles)
            return isSuper;
          });
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
                    isSuper={isSuper}
                    role={role}
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
            {role && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  ROLE_BADGE[role] ?? 'bg-gray-100 text-gray-700'
                )}
              >
                {role}
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
