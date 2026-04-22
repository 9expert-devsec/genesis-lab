'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink, Menu, Search, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { mainNav } from '@/config/site';
import { cn } from '@/lib/utils';

/**
 * Public site header.
 * - Desktop: three-zone flex (logo · nav · actions) with hover dropdowns
 *   driven by Tailwind's `group` variant (no JS state per item)
 * - Mobile (< lg): hamburger drawer; dropdowns become accordions
 */
export function PublicHeader() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--surface-border)] bg-[var(--page-bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-[1280px] items-center gap-4 px-4 lg:px-6">
        {/* ── Logo ─────────────────────────────────────────────── */}
        <div className="flex-none">
          <Logo priority />
        </div>

        {/* ── Desktop nav (center) ─────────────────────────────── */}
        <nav
          className="hidden flex-1 items-center justify-center gap-1 lg:flex"
          aria-label="Primary"
        >
          {mainNav.map((item) =>
            item.children ? (
              <DesktopDropdown key={item.label} item={item} />
            ) : (
              <DesktopLink key={item.label} item={item} />
            )
          )}
        </nav>

        {/* ── Right-side actions ───────────────────────────────── */}
        <div className="ml-auto flex flex-none items-center gap-2 lg:ml-0">
          <Link
            href="/search"
            aria-label="ค้นหา"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)] hover:text-9e-brand"
          >
            <Search className="h-5 w-5" strokeWidth={1.75} />
          </Link>

          <ThemeToggle />

          <div className="hidden lg:block">
            <Button asChild variant="cta" size="sm">
              <Link href="/registration/in-house">
                สอบถามหลักสูตรองค์กร
              </Link>
            </Button>
          </div>

          {/* Hamburger — mobile only */}
          <button
            type="button"
            aria-label={drawerOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)] lg:hidden"
          >
            {drawerOpen ? (
              <X className="h-5 w-5" strokeWidth={1.75} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ──────────────────────────────────────── */}
      {drawerOpen && (
        <MobileDrawer onNavigate={() => setDrawerOpen(false)} />
      )}
    </header>
  );
}

// ── Desktop sub-components ──────────────────────────────────────

function DesktopLink({ item }) {
  return (
    <Link
      href={item.href}
      target={item.external ? '_blank' : undefined}
      rel={item.external ? 'noopener noreferrer' : undefined}
      className="rounded-9e-sm px-3 py-2 text-[15px] font-medium text-[var(--text-secondary)] transition-colors duration-9e-micro ease-9e hover:text-9e-brand"
    >
      {item.label}
    </Link>
  );
}

function DesktopDropdown({ item }) {
  return (
    <div className="group relative">
      <Link
        href={item.href}
        className="inline-flex items-center gap-1 rounded-9e-sm px-3 py-2 text-[15px] font-medium text-[var(--text-secondary)] transition-colors duration-9e-micro ease-9e group-hover:text-9e-brand"
      >
        {item.label}
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform duration-9e-micro ease-9e group-hover:rotate-180"
          strokeWidth={2}
        />
      </Link>

      {/* Panel — CSS-only hover reveal */}
      <div
        className={cn(
          'invisible absolute left-0 top-full z-50 pt-2 opacity-0',
          'transition-[opacity,visibility] duration-9e-micro ease-9e',
          'group-hover:visible group-hover:opacity-100',
          'group-focus-within:visible group-focus-within:opacity-100'
        )}
      >
        <ul
          className={cn(
            'min-w-[240px] rounded-9e-lg border bg-[var(--surface)] p-2 shadow-9e-lg',
            'border-[var(--surface-border)]'
          )}
        >
          {item.children.map((child) => (
            <li key={child.label}>
              <Link
                href={child.href}
                target={child.external ? '_blank' : undefined}
                rel={child.external ? 'noopener noreferrer' : undefined}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-9e-sm px-3 py-2',
                  'text-sm text-[var(--text-primary)]',
                  'transition-colors duration-9e-micro ease-9e',
                  'hover:bg-[var(--surface-muted)] hover:text-9e-brand'
                )}
              >
                <span>{child.label}</span>
                {child.external && (
                  <ExternalLink
                    className="h-3.5 w-3.5 text-[var(--text-muted)]"
                    strokeWidth={1.75}
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Mobile drawer ───────────────────────────────────────────────

function MobileDrawer({ onNavigate }) {
  return (
    <div
      id="mobile-drawer"
      className="border-t border-[var(--surface-border)] bg-[var(--page-bg)] lg:hidden"
    >
      <nav
        className="mx-auto flex max-w-[1280px] flex-col gap-1 px-4 py-4"
        aria-label="Mobile primary"
      >
        {mainNav.map((item) =>
          item.children ? (
            <MobileAccordion
              key={item.label}
              item={item}
              onNavigate={onNavigate}
            />
          ) : (
            <Link
              key={item.label}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              onClick={onNavigate}
              className="rounded-9e-sm px-3 py-3 text-base font-medium text-[var(--text-primary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)]"
            >
              {item.label}
            </Link>
          )
        )}

        <div className="mt-3 border-t border-[var(--surface-border)] pt-3">
          <Button asChild variant="cta" size="md" className="w-full">
            <Link
              href="/registration/in-house"
              onClick={onNavigate}
            >
              สอบถามหลักสูตรองค์กร
            </Link>
          </Button>
        </div>
      </nav>
    </div>
  );
}

function MobileAccordion({ item, onNavigate }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-9e-sm px-3 py-3 text-base font-medium text-[var(--text-primary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)]"
      >
        <span>{item.label}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform duration-9e-micro ease-9e',
            open && 'rotate-180'
          )}
          strokeWidth={2}
        />
      </button>
      {open && (
        <ul className="ml-3 mt-1 space-y-1 border-l border-[var(--surface-border)] pl-3">
          {item.children.map((child) => (
            <li key={child.label}>
              <Link
                href={child.href}
                target={child.external ? '_blank' : undefined}
                rel={child.external ? 'noopener noreferrer' : undefined}
                onClick={onNavigate}
                className="flex items-center justify-between gap-3 rounded-9e-sm px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)] hover:text-9e-brand"
              >
                <span>{child.label}</span>
                {child.external && (
                  <ExternalLink
                    className="h-3.5 w-3.5 text-[var(--text-muted)]"
                    strokeWidth={1.75}
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
