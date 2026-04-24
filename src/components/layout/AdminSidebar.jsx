'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Image as ImageIcon,
  Star,
  FileText,
  Briefcase,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const adminNav = [
  { label: 'แดชบอร์ด',   href: '/admin',               icon: LayoutDashboard, exact: true },
  { label: 'บัญชีผู้ดูแล', href: '/admin/accounts',      icon: Users },
  { label: 'การลงทะเบียน', href: '/admin/registrations', icon: ClipboardList },
  { label: 'แบนเนอร์',    href: '/admin/banners',       icon: ImageIcon },
  { label: 'คอร์สแนะนำ',   href: '/admin/featured-courses', icon: Star },
  { label: 'บทความ',      href: '/admin/articles',      icon: FileText },
  { label: 'ประกาศงาน',   href: '/admin/recruits',      icon: Briefcase },
];

export function AdminSidebar() {
  const pathname = usePathname();

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
          {adminNav.map(({ label, href, icon: Icon, exact }) => {
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

      <div className="border-t border-[var(--surface-border)] p-3">
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
