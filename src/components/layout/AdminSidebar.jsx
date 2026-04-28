'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Image as ImageIcon,
  Star,
  Monitor,
  MessageSquareQuote,
  FileText,
  Briefcase,
  Database,
  ShieldCheck,
  UserCircle2,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_BADGE = {
  superadmin: 'bg-blue-100 text-blue-700',
  owner:      'bg-blue-100 text-blue-700',
  admin:      'bg-gray-100 text-gray-700',
  editor:     'bg-yellow-100 text-yellow-700',
};

const SUPERADMIN_ROLES = new Set(['superadmin', 'owner']);

// `superadminOnly: true` items are filtered out for non-superadmin
// callers. Layout passes the live session role into the sidebar.
const adminNav = [
  { label: 'แดชบอร์ด',         href: '/admin',                       icon: LayoutDashboard, exact: true },
  { label: 'บัญชีผู้ดูแล',       href: '/admin/accounts',              icon: Users, superadminOnly: true },
  { label: 'การลงทะเบียน',     href: '/admin/registrations',         icon: ClipboardList },
  { label: 'แบนเนอร์',         href: '/admin/banners',               icon: ImageIcon },
  { label: 'คอร์สแนะนำ',        href: '/admin/featured-courses',      icon: Star },
  { label: 'คอร์สออนไลน์แนะนำ', href: '/admin/featured-online-courses', icon: Monitor },
  { label: 'รีวิวแนะนำ',        href: '/admin/featured-reviews',      icon: MessageSquareQuote },
  { label: 'บทความ',           href: '/admin/articles',              icon: FileText },
  { label: 'ประกาศงาน',         href: '/admin/recruits',              icon: Briefcase },
  { label: 'Landing Cache',    href: '/admin/landing-cache',         icon: Database },
  { label: 'ความปลอดภัย',       href: '/admin/security',              icon: ShieldCheck },
  { label: 'โปรไฟล์',           href: '/admin/profile',               icon: UserCircle2 },
];

export function AdminSidebar({ role = null, userName = null, userEmail = null }) {
  const pathname = usePathname();
  const isSuper = SUPERADMIN_ROLES.has(role);
  const visibleNav = adminNav.filter((item) => !item.superadminOnly || isSuper);

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-[var(--surface-border)] md:bg-[var(--surface)]">
      <div className="p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Admin Panel
        </p>
        <p className="mt-1 text-base font-bold text-[var(--text-primary)]">9Expert</p>
      </div>

      <nav className="flex-1 px-3 pb-4" aria-label="Admin">
        <ul className="space-y-1">
          {visibleNav.map(({ label, href, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-9e-md px-3 py-2 text-sm',
                    'transition-colors duration-9e-micro ease-9e',
                    active
                      ? 'bg-9e-brand/10 text-9e-brand'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
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
        <Link
          href="/api/auth/signout"
          className="flex items-center gap-3 rounded-9e-md px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
          ออกจากระบบ
        </Link>
      </div>
    </aside>
  );
}
