'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ChevronDown, ExternalLink, Menu, Search, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { mainNav, skills } from '@/config/site';
import { cn } from '@/lib/utils';
import { toKebab } from '@/lib/slug';

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
  // Gate the portal until after first client render — `document.body`
  // doesn't exist on the server, and the SSR markup must match.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock the page underneath while the drawer is open so iOS rubber-band
  // and laptop trackpad scroll don't leak through the backdrop.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  return (
    <>
    <header className="sticky top-0 left-0 right-0 z-50 border-b border-[var(--surface-border)] bg-white backdrop-blur-md transition-colors dark:bg-9e-navy">
      <div className="mx-auto flex h-20 max-w-[1200px] items-center gap-4 max-md:px-4">
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

    </header>

    {/* ── Mobile drawer ──────────────────────────────────────────
        Rendered through a portal into <body> so the fixed-positioned
        backdrop and panel escape any stacking context created by the
        sticky header (z:50) or by transformed/will-changed page
        sections (carousels, etc.). The drawer's own z-[9999] then
        only competes with body-level siblings, not with nested
        contexts that would otherwise cap us at z:50. */}
    {mounted &&
      createPortal(
        <MobileDrawer
          open={drawerOpen}
          programs={programs}
          onClose={() => setDrawerOpen(false)}
        />,
        document.body
      )}
    </>
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
 * Build the public /program/[slug] URL for a mega-menu entry. Uses
 * kebab-case of `program_name`; admins can override with a custom
 * urlSlug via /admin/page-configs (the resolver tries that first).
 */
function programHref(program) {
  return `/program/${toKebab(program.program_name)}`;
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
            <div className="mx-auto grid max-w-[1280px] grid-cols-[2fr_1fr] gap-6 px-6 py-6">
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
                <ul className="grid grid-cols-4 gap-1">
                  {programs.map((p) => (
                    <li key={p._id ?? p.program_id}>
                      <Link
                        href={programHref(p)}
                        className="flex items-center gap-3 rounded-9e-md p-1.5 transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)]"
                      >
                        <ProgramIcon src={p.programiconurl} size={24} />
                        <span className="text-sm leading-tight text-[var(--text-primary)]">
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
                <ul className="flex flex-col gap-1">
                  {skills.map((s) => (
                    <li key={s.slug}>
                      <Link
                        href={`/skill/${s.slug}`}
                        className="flex items-center gap-3 rounded-9e-md p-1.5 transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)]"
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

function MobileDrawer({ open, programs, onClose }) {
  // Always mounted so the translate-x slide animation has a stable
  // starting position. Pointer events on the backdrop are gated by
  // `open` so the closed state doesn't intercept clicks.
  return (
    <div className="lg:hidden" aria-hidden={!open}>
      <div
        className={cn(
          'fixed inset-0 z-[9998] bg-black/50 transition-opacity duration-9e-reveal ease-9e',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />
      <aside
        id="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="เมนูหลัก"
        className={cn(
          'fixed top-0 right-0 z-[9999] flex h-full w-[280px] max-w-[85vw] flex-col',
          'bg-[var(--page-bg)] shadow-2xl',
          'transition-transform duration-9e-reveal ease-9e',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-4 py-3">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดเมนู"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <nav
          className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4"
          aria-label="Mobile primary"
        >
          {mainNav.map((item) => {
            if (item.type === 'mega') {
              return (
                <MobileMegaAccordion
                  key={item.label}
                  item={item}
                  programs={programs}
                  onNavigate={onClose}
                />
              );
            }
            if (item.children) {
              return (
                <MobileAccordion
                  key={item.label}
                  item={item}
                  onNavigate={onClose}
                />
              );
            }
            return (
              <Link
                key={item.label}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                onClick={onClose}
                className="rounded-9e-sm px-3 py-3 text-base font-medium text-[var(--text-primary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)]"
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
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
