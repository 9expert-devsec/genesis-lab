'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ChevronDown, ExternalLink, Menu, Search, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { mainNav, skills } from '@/config/site';
import { cn } from '@/lib/utils';

/**
 * Public site header — interactive shell.
 * - Desktop: three-zone flex (logo · nav · actions) with hover dropdowns
 *   driven by Tailwind's `group` variant (no JS state per item)
 * - Mobile (< lg): hamburger drawer; dropdowns become accordions
 *
 * `programs` is fetched by the parent Server Component (PublicHeader)
 * and passed in. May be an empty array if the upstream fetch failed —
 * in that case the mega trigger still navigates to /training-course but
 * the panel is hidden (handled inside DesktopMega/MobileMegaAccordion).
 */
export function PublicHeaderClient({ programs = [] }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--surface-border)] bg-[var(--page-bg)] backdrop-blur-md">
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
          {mainNav.map((item) => {
            if (item.type === 'mega') {
              return <DesktopMega key={item.label} item={item} programs={programs} />;
            }
            if (item.children) {
              return <DesktopDropdown key={item.label} item={item} />;
            }
            return <DesktopLink key={item.label} item={item} />;
          })}
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
        <MobileDrawer programs={programs} onNavigate={() => setDrawerOpen(false)} />
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

      <div
        className={cn(
          'pointer-events-none absolute left-0 top-full z-50 pt-2 opacity-0',
          'transition-opacity duration-9e-micro ease-9e',
          'group-hover:pointer-events-auto group-hover:opacity-100',
          'group-focus-within:pointer-events-auto group-focus-within:opacity-100'
        )}
      >
        <ul
          className={cn(
            'max-h-[70vh] min-w-[240px] overflow-y-auto rounded-9e-lg border p-2 shadow-9e-lg',
            'bg-[var(--surface)] border-[var(--surface-border)]'
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

/**
 * Build a stable URL slug for a program from its short upstream code.
 * Used only for the mega-menu link target — the program catalog page
 * (Phase 3) will own the canonical slug → upstream lookup.
 */
function programHref(program) {
  const code = String(program.program_id ?? '').toLowerCase();
  return `/${code}-all-courses`;
}

function DesktopMega({ item, programs }) {
  const hasPrograms = programs.length > 0;

  return (
    // `static` so the absolutely-positioned panel anchors to the <header>
    // instead of this trigger — lets the mega menu span the viewport width.
    // `h-20` matches the header row so the trigger's hover area reaches the
    // panel's top edge with no dead zone (cursor would otherwise lose :hover
    // crossing the gap between the centered label and the header's bottom).
    <div className="group static h-20">
      <Link
        href={item.href}
        className="inline-flex h-full items-center gap-1 rounded-9e-sm px-3 text-[15px] font-medium text-[var(--text-secondary)] transition-colors duration-9e-micro ease-9e group-hover:text-9e-brand"
      >
        {item.label}
        {hasPrograms && (
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform duration-9e-micro ease-9e group-hover:rotate-180"
            strokeWidth={2}
          />
        )}
      </Link>

      {hasPrograms && (
        <div
          className={cn(
            'pointer-events-none absolute left-0 right-0 top-full z-50 pt-2 opacity-0',
            'transition-opacity duration-9e-micro ease-9e',
            'group-hover:pointer-events-auto group-hover:opacity-100',
            'group-focus-within:pointer-events-auto group-focus-within:opacity-100'
          )}
        >
          <div
            className={cn(
              'border-t shadow-9e-lg',
              'bg-[var(--surface)] border-[var(--surface-border)]'
            )}
          >
            <div className="mx-auto grid max-w-[1280px] grid-cols-[2fr_1fr] gap-8 px-6 py-8">
              {/* Programs column */}
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Programs
                  </h3>
                  <Link
                    href="/training-course"
                    className="inline-flex items-center gap-1 text-xs font-medium text-9e-brand hover:underline"
                  >
                    ดูหลักสูตรทั้งหมด
                    <ArrowRight className="h-3 w-3" strokeWidth={2} />
                  </Link>
                </div>
                <ul className="grid grid-cols-3 gap-2">
                  {programs.map((p) => (
                    <li key={p._id ?? p.program_id}>
                      <Link
                        href={programHref(p)}
                        className="flex items-center gap-3 rounded-9e-md p-2 transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)]"
                      >
                        <ProgramIcon src={p.programiconurl} size={32} />
                        <span className="text-sm text-[var(--text-primary)]">
                          {p.program_name}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Skills column */}
              <div>
                <div className="mb-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Skills
                  </h3>
                </div>
                <ul className="space-y-1">
                  {skills.map((s) => (
                    <li key={s.slug}>
                      <Link
                        href={`/${s.slug}-all-courses`}
                        className="flex items-center gap-3 rounded-9e-md p-2 transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)]"
                      >
                        <Image
                          src={s.iconUrl}
                          alt=""
                          aria-hidden="true"
                          width={24}
                          height={24}
                          className="h-6 w-6 flex-none object-contain"
                        />
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {s.label}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgramIcon({ src, size }) {
  if (!src) return null;
  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="shrink-0 object-contain"
    />
  );
}

// ── Mobile drawer ───────────────────────────────────────────────

function MobileDrawer({ programs, onNavigate }) {
  return (
    <div
      id="mobile-drawer"
      className="border-t border-[var(--surface-border)] bg-[var(--page-bg)] lg:hidden"
    >
      <nav
        className="mx-auto flex max-w-[1280px] flex-col gap-1 px-4 py-4"
        aria-label="Mobile primary"
      >
        {mainNav.map((item) => {
          if (item.type === 'mega') {
            return (
              <MobileMegaAccordion
                key={item.label}
                item={item}
                programs={programs}
                onNavigate={onNavigate}
              />
            );
          }
          if (item.children) {
            return (
              <MobileAccordion
                key={item.label}
                item={item}
                onNavigate={onNavigate}
              />
            );
          }
          return (
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
          );
        })}
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

function MobileMegaAccordion({ item, programs, onNavigate }) {
  const [open, setOpen] = useState(false);
  const hasPrograms = programs.length > 0;

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
        <div className="ml-3 mt-1 space-y-4 border-l border-[var(--surface-border)] pl-3">
          {hasPrograms && (
            <MobileMegaProgramList programs={programs} onNavigate={onNavigate} />
          )}
          <MobileMegaSkillList onNavigate={onNavigate} />
          <Link
            href="/training-course"
            onClick={onNavigate}
            className="flex items-center gap-1 px-3 pb-1 text-xs font-medium text-9e-brand hover:underline"
          >
            ดูหลักสูตรทั้งหมด
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        </div>
      )}
    </div>
  );
}

function MobileMegaProgramList({ programs, onNavigate }) {
  return (
    <div>
      <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Programs
      </p>
      <ul>
        {programs.map((p) => (
          <li key={p._id ?? p.program_id}>
            <Link
              href={programHref(p)}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-9e-sm px-3 py-2 text-sm text-[var(--text-primary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)] hover:text-9e-brand"
            >
              <ProgramIcon src={p.programiconurl} size={24} />
              <span>{p.program_name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileMegaSkillList({ onNavigate }) {
  return (
    <div>
      <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Skills
      </p>
      <ul>
        {skills.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/${s.slug}-all-courses`}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-9e-sm px-3 py-2 text-sm text-[var(--text-primary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)] hover:text-9e-brand"
            >
              <Image
                src={s.iconUrl}
                alt=""
                aria-hidden="true"
                width={24}
                height={24}
                className="h-6 w-6 flex-none object-contain"
              />
              <span>{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
