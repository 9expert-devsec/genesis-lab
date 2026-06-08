'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ImageIcon,
  Menu,
  Search,
  X,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { mainNav, skills, careerPaths, siteConfig } from '@/config/site';
import { cn, courseHref } from '@/lib/utils';
import { toKebab } from '@/lib/slug';
import {
  getFirstCourseByProgram,
  getFirstCourseBySkill,
} from '@/lib/actions/nav-course-preview';

/**
 * Normalize career paths to `{ label, href }` rows for the mega menu's
 * Career Path section. Prefers the live DB list; falls back to the
 * static config so the section is never empty.
 */
function careerPathRows(dynamicCareerPaths) {
  if (Array.isArray(dynamicCareerPaths) && dynamicCareerPaths.length > 0) {
    return dynamicCareerPaths
      .filter((cp) => cp.api_slug)
      .map((cp) => ({
        label: cp.title || cp.api_slug,
        href: `/${cp.api_slug}`,
        hero_image_url: cp.hero_image_url ?? '',
      }));
  }
  return careerPaths
    .filter((c) => c.slug)
    .map((c) => ({ label: c.label, href: `/${c.slug}-career-path`, hero_image_url: '' }));
}

/**
 * Public site header — interactive shell.
 * - Desktop: three-zone flex (logo · nav · actions) with hover dropdowns
 *   driven by Tailwind's `group` variant (no JS state per item)
 * - Mobile (< lg): hamburger drawer; dropdowns become accordions
 *
 * The top-level nav is หลักสูตร · ตารางฝึกอบรม · โปรโมชัน · บทความ ·
 * ผลงานของเรา · ติดต่อเรา. Career Path, TNHS, and หลักสูตรออนไลน์ are NOT
 * top-level items — they live only inside the หลักสูตร mega panel, fed by
 * the `tnhsCourses` / `navOnlineCourses` / `dynamicCareerPaths` props
 * fetched by the parent Server Component (PublicHeader). Each may be an
 * empty array on upstream failure — every consumer degrades gracefully.
 */
export function PublicHeaderClient({
  programs = [],
  dynamicCareerPaths = [],
  tnhsCourses = [],
  navOnlineCourses = [],
}) {
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
              return (
                <DesktopMega
                  key={item.label}
                  item={item}
                  programs={programs}
                  dynamicCareerPaths={dynamicCareerPaths}
                  tnhsCourses={tnhsCourses}
                  navOnlineCourses={navOnlineCourses}
                />
              );
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
          dynamicCareerPaths={dynamicCareerPaths}
          tnhsCourses={tnhsCourses}
          navOnlineCourses={navOnlineCourses}
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
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close immediately on route change — same JS-state fix as DesktopMega.
  // A pure CSS `group-hover:` rule would keep the panel open after a
  // client-side navigation since the cursor often stays over the header.
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <Link
        href={item.href}
        className={cn(
          'inline-flex items-center gap-1 rounded-9e-sm px-3 py-2 text-[15px] font-medium',
          'transition-colors duration-9e-micro ease-9e',
          isOpen ? 'text-9e-brand' : 'text-[var(--text-secondary)]'
        )}
      >
        {item.label}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-9e-micro ease-9e',
            isOpen ? 'rotate-180' : ''
          )}
          strokeWidth={2}
        />
      </Link>

      <div
        className={cn(
          'absolute left-0 top-full z-50 pt-2',
          'transition-opacity duration-9e-micro ease-9e',
          isOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
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
                onClick={() => setIsOpen(false)}
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

function ProgramIcon({ src, size, alt }) {
  if (!src) return null;
  return (
    <Image
      src={src}
      alt={alt ? `ไอคอน ${alt}` : ''}
      width={size}
      height={size}
      className="flex-none shrink-0 object-contain"
    />
  );
}

// ── Mega menu (4-column cascade) ────────────────────────────────

const COL1_ITEMS = [
  { key: 'courses', label: 'หลักสูตรทั้งหมด', href: '/training-course' },
  { key: 'career-path', label: 'Career Path', href: '/career-path-project' },
  { key: 'tnhs', label: 'TNHS', href: 'https://www.thenexthumansskills.com/', external: true },
  { key: 'online', label: 'หลักสูตรออนไลน์', href: 'https://academy.9experttraining.com/', external: true },
];

const MEGA_COL_HEADER =
  'text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]';
const MEGA_SEE_ALL =
  'text-[10px] font-medium text-9e-brand hover:underline';
const MEGA_ROW =
  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm cursor-pointer transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)]';

/**
 * หลักสูตร mega menu — a four-column cascade:
 *   Col 1  Sidebar (always visible) selects the active section
 *   Col 2  Programs / Skills toggle (only when "หลักสูตรทั้งหมด" active)
 *   Col 3  Dynamic list driven by Col 1 (+ Col 2)
 *   Col 4  Lazy course-cover preview for the hovered program/skill
 *
 * Col 1/2/3 state is hover-driven; Col 4 fetches a cover on demand via
 * Server Actions, cached per id so repeated hovers don't re-fire.
 */
function DesktopMega({
  item,
  programs,
  dynamicCareerPaths,
  tnhsCourses = [],
  navOnlineCourses = [],
}) {
  const cpRows = careerPathRows(dynamicCareerPaths);
  const hasPrograms = programs.length > 0;

  // The panel is JS-controlled (not CSS group-hover) so a client-side
  // navigation can force it shut: the component stays mounted and the
  // cursor often remains over the header, which a pure CSS `:hover` rule
  // would keep open. `isOpen` is driven by mouse enter/leave and reset on
  // every route change.
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Defaults for the Career Path / TNHS Col 4 previews — the first row.
  // These come straight from props (no fetch), so a hover is instant.
  const defaultCareerPathPreview = cpRows[0]
    ? { title: cpRows[0].label, hero_image_url: cpRows[0].hero_image_url, href: cpRows[0].href }
    : null;
  const defaultTnhsPreview = tnhsCourses[0]
    ? {
        course_name: tnhsCourses[0].course_name,
        cover_url: tnhsCourses[0].cover_url,
        external_url: tnhsCourses[0].external_url,
      }
    : null;

  const [col1Active, setCol1Active] = useState('courses'); // COL1_ITEMS key
  const [col2Active, setCol2Active] = useState('programs'); // 'programs' | 'skills'
  const [preview, setPreview] = useState(null); // course | null
  const [previewLoading, setPreviewLoading] = useState(false);
  const [careerPathPreview, setCareerPathPreview] = useState(defaultCareerPathPreview);
  const [tnhsPreview, setTnhsPreview] = useState(defaultTnhsPreview);
  // Cache across hover cycles so repeated hovers don't re-fetch.
  const previewCache = useRef(new Map());

  function selectCol1(key) {
    if (key === col1Active) return;
    setCol1Active(key);
    setCol2Active('programs');
    setPreview(null);
    setPreviewLoading(false);
    if (key === 'career-path') setCareerPathPreview(defaultCareerPathPreview);
    if (key === 'tnhs') setTnhsPreview(defaultTnhsPreview);
  }

  function handleCareerPathHover(cp) {
    setCareerPathPreview({ title: cp.label, hero_image_url: cp.hero_image_url, href: cp.href });
  }

  async function loadPreview(cacheKey, fetcher, id) {
    if (!id) return;
    if (previewCache.current.has(cacheKey)) {
      setPreview(previewCache.current.get(cacheKey));
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    const result = await fetcher(id);
    previewCache.current.set(cacheKey, result);
    setPreview(result);
    setPreviewLoading(false);
  }

  function handleProgramHover(program) {
    const id = program.program_id ?? program._id;
    loadPreview(`program:${id}`, getFirstCourseByProgram, id);
  }

  function handleSkillHover(skill) {
    loadPreview(`skill:${skill.upstreamId}`, getFirstCourseBySkill, skill.upstreamId);
  }

  // Hovering a Col 2 button switches the list and previews the first item.
  function selectSection(section) {
    setCol2Active(section);
    if (section === 'programs' && programs[0]) handleProgramHover(programs[0]);
    else if (section === 'skills' && skills[0]) handleSkillHover(skills[0]);
  }

  // Close the panel immediately when a link inside it is clicked, rather
  // than waiting for the route-change effect.
  function closeMegaMenu() {
    setIsOpen(false);
  }

  // Normalize whichever section's preview is active into one card shape:
  // { name, imageUrl, href, external }. Col 4 renders for every section
  // except หลักสูตรออนไลน์ (which shows its own cards in Col 3).
  let col4Preview = null;
  if (col1Active === 'courses') {
    col4Preview = preview
      ? {
          name: preview.course_name,
          imageUrl: preview.course_cover_url ?? null,
          href: courseHref(preview.course_id),
          external: false,
        }
      : null;
  } else if (col1Active === 'career-path') {
    col4Preview = careerPathPreview
      ? {
          name: careerPathPreview.title,
          imageUrl: careerPathPreview.hero_image_url ?? null,
          href: careerPathPreview.href,
          external: false,
        }
      : null;
  } else if (col1Active === 'tnhs') {
    col4Preview = tnhsPreview
      ? {
          name: tnhsPreview.course_name,
          imageUrl: tnhsPreview.cover_url ?? null,
          href: tnhsPreview.external_url || 'https://www.thenexthumansskills.com/',
          external: true,
        }
      : null;
  }

  return (
    // `static` so the absolutely-positioned panel anchors to the <header>
    // instead of this trigger — lets the mega menu span the viewport width.
    // `h-20` matches the header row so the trigger's hover area reaches the
    // panel's top edge with no dead zone.
    <div
      className="static h-20"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <Link
        href={item.href}
        onClick={() => setIsOpen(false)}
        className={cn(
          'inline-flex h-full items-center gap-1 rounded-9e-sm px-3 text-[15px] font-medium',
          'transition-colors duration-9e-micro ease-9e',
          isOpen ? 'text-9e-brand' : 'text-[var(--text-secondary)]'
        )}
      >
        {item.label}
        {hasPrograms && (
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-9e-micro ease-9e',
              isOpen ? 'rotate-180' : ''
            )}
            strokeWidth={2}
          />
        )}
      </Link>

      <div
        className={cn(
          'absolute left-0 right-0 top-full z-50',
          'transition-opacity duration-9e-micro ease-9e',
          isOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      >
        <div
          className={cn(
            'max-h-[440px] max-w-[1200px] mx-auto overflow-hidden border-t shadow-9e-lg rounded-b-2xl',
            'bg-[var(--surface)] border-[var(--surface-border)]'
          )}
        >
          <div className="max-w-[1200px] px-4 py-3">
            <div
              className={cn(
                'grid h-[440px]',
                col1Active === 'courses'
                  ? 'grid-cols-[192px_200px_350px_1fr]'
                  : col1Active === 'online'
                    ? 'grid-cols-[192px_1fr]'
                    : 'grid-cols-[192px_500px_1fr]' // career-path | tnhs
              )}
            >
              {/* ── COL 1 — Sidebar ──────────────────────────── */}
              <div className="min-h-0 overflow-y-auto border-r border-[var(--surface-border)] pr-2">
                <ul className="flex flex-col gap-0.5">
                  {COL1_ITEMS.map((c) => {
                    const active = col1Active === c.key;
                    const itemClass = cn(
                      'flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors duration-9e-micro ease-9e',
                      active
                        ? 'border-l-2 border-9e-brand bg-[var(--surface-muted)] font-medium text-9e-brand'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
                    );
                    const inner = (
                      <>
                        <span>{c.label}</span>
                        <ChevronRight
                          className="h-3.5 w-3.5 flex-none opacity-40"
                          strokeWidth={2}
                        />
                      </>
                    );
                    return (
                      <li key={c.key}>
                        {c.external ? (
                          <a
                            href={c.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onMouseEnter={() => selectCol1(c.key)}
                            onClick={closeMegaMenu}
                            className={itemClass}
                          >
                            {inner}
                          </a>
                        ) : (
                          <Link
                            href={c.href}
                            onMouseEnter={() => selectCol1(c.key)}
                            onClick={closeMegaMenu}
                            className={itemClass}
                          >
                            {inner}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* ── COL 2 — Section selector (only for หลักสูตรทั้งหมด) ── */}
              {col1Active === 'courses' && (
                <div className="min-h-0 overflow-y-auto border-r border-[var(--surface-border)] px-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onMouseEnter={() => selectSection('programs')}
                      className={cn(
                        'flex cursor-pointer items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-9e-micro ease-9e',
                        col2Active === 'programs'
                          ? 'bg-[var(--surface-muted)] text-9e-brand'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
                      )}
                    >
                      <span>Programs</span>
                      <ChevronRight className="h-3.5 w-3.5 flex-none opacity-40" strokeWidth={2} />
                    </button>
                    <hr className="my-1 border-[var(--surface-border)]" />
                    <button
                      type="button"
                      onMouseEnter={() => selectSection('skills')}
                      className={cn(
                        'flex cursor-pointer items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-9e-micro ease-9e',
                        col2Active === 'skills'
                          ? 'bg-[var(--surface-muted)] text-9e-brand'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
                      )}
                    >
                      <span>Skills</span>
                      <ChevronRight className="h-3.5 w-3.5 flex-none opacity-40" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── COL 3 — Dynamic list ─────────────────────── */}
              <div className={'max-h-[420px] min-h-0 overflow-y-auto ' + (col1Active === 'online' ? '' : 'border-r border-[var(--surface-border)] px-2' ) + ' scrollbar-thin scrollbar-thumb-[var(--surface-border)] scrollbar-track-transparent'}>
                {col1Active === 'courses' && col2Active === 'programs' && (
                  <>
                    <div className="flex items-center justify-between px-3 pb-1 pt-1">
                      <span className={MEGA_COL_HEADER}>PROGRAMS</span>
                      <Link href="/training-course" onClick={closeMegaMenu} className={MEGA_SEE_ALL}>
                        ดูหลักสูตรทั้งหมด →
                      </Link>
                    </div>
                    <ul>
                      {programs.map((p) => (
                        <li key={p._id ?? p.program_id}>
                          <Link
                            href={programHref(p)}
                            onMouseEnter={() => handleProgramHover(p)}
                            onClick={closeMegaMenu}
                            className={MEGA_ROW}
                          >
                            <ProgramIcon src={p.programiconurl} size={20} alt={p.program_name} />
                            <span className="flex-1 text-[var(--text-primary)]">
                              {p.program_name}
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 flex-none opacity-30" strokeWidth={2} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {col1Active === 'courses' && col2Active === 'skills' && (
                  <>
                    <div className="px-3 pb-1 pt-1">
                      <span className={MEGA_COL_HEADER}>SKILLS</span>
                    </div>
                    <ul>
                      {skills.map((s) => (
                        <li key={s.slug}>
                          <Link
                            href={`/skill/${s.slug}`}
                            onMouseEnter={() => handleSkillHover(s)}
                            onClick={closeMegaMenu}
                            className={MEGA_ROW}
                          >
                            <Image
                              src={s.iconUrl}
                              alt={`ไอคอน ${s.label}`}
                              width={20}
                              height={20}
                              className="h-5 w-5 flex-none object-contain"
                              unoptimized
                            />
                            <span className="flex-1 text-[var(--text-primary)]">{s.label}</span>
                            <ChevronRight className="h-3.5 w-3.5 flex-none opacity-30" strokeWidth={2} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {col1Active === 'career-path' && (
                  <>
                    <div className="flex items-center justify-between px-3 pb-1 pt-1">
                      <span className={MEGA_COL_HEADER}>CAREER PATH</span>
                      <Link href="/career-path-project" onClick={closeMegaMenu} className={MEGA_SEE_ALL}>
                        ดูทั้งหมด →
                      </Link>
                    </div>
                    <ul>
                      {cpRows.map((cp) => (
                        <li key={cp.href}>
                          <Link
                            href={cp.href}
                            onMouseEnter={() => handleCareerPathHover(cp)}
                            onClick={closeMegaMenu}
                            className="flex items-center rounded-md px-3 py-2 text-sm text-[var(--text-primary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)] hover:text-9e-brand"
                          >
                            {cp.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {col1Active === 'tnhs' && (
                  <>
                    <div className="px-3 pb-1 pt-1">
                      <span className={MEGA_COL_HEADER}>The Next Humans Skills</span>
                    </div>
                    {tnhsCourses.length > 0 ? (
                      <ul>
                        {tnhsCourses.map((c) => (
                          <li key={c._id}>
                            <a
                              href={c.external_url || '#'}
                              target={c.external_url ? '_blank' : undefined}
                              rel={c.external_url ? 'noopener noreferrer' : undefined}
                              onMouseEnter={() =>
                                setTnhsPreview({
                                  course_name: c.course_name,
                                  cover_url: c.cover_url,
                                  external_url: c.external_url,
                                })
                              }
                              onClick={closeMegaMenu}
                              className={MEGA_ROW}
                            >
                              {/* <div className="relative h-[22px] w-8 flex-none overflow-hidden rounded-sm bg-[var(--surface-muted)]">
                                {c.cover_url && (
                                  <Image
                                    src={c.cover_url}
                                    alt=""
                                    fill
                                    className="object-cover"
                                    sizes="32px"
                                    unoptimized
                                  />
                                )}
                              </div> */}
                              <span className="flex-1 text-[var(--text-primary)]">{c.course_name}</span>
                              <ExternalLink className="h-3 w-3 flex-none text-[var(--text-muted)]" strokeWidth={1.75} />
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-3 py-2 text-sm text-[var(--text-muted)]">ยังไม่มีหลักสูตร</p>
                    )}
                  </>
                )}

                {col1Active === 'online' && (
                  <div className="h-full p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                        หลักสูตรออนไลน์
                      </span>
                      <a
                        href={siteConfig.academyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={closeMegaMenu}
                        className="text-[10px] text-9e-brand hover:underline"
                      >
                        ดูทั้งหมด →
                      </a>
                    </div>
                    {navOnlineCourses.length > 0 ? (
                      <div className="grid grid-cols-3 gap-3">
                        {navOnlineCourses.map((c) => (
                          <a
                            key={c._id ?? c.course_id}
                            href={courseHref(c.course_id)}
                            onClick={closeMegaMenu}
                            className="group flex flex-col gap-1.5 overflow-hidden rounded-md p-1.5 transition-colors duration-9e-micro hover:bg-[var(--surface-muted)]"
                          >
                            <div className="relative aspect-video w-full overflow-hidden rounded-md bg-[var(--surface-muted)]">
                              {c.course_cover_url ? (
                                <Image
                                  src={c.course_cover_url}
                                  alt={c.course_name ?? ''}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <ImageIcon className="h-5 w-5 text-[var(--text-muted)]" />
                                </div>
                              )}
                            </div>
                            <p className="line-clamp-2 text-xs font-medium leading-snug text-[var(--text-primary)]">
                              {c.course_name}
                            </p>
                            <span className="text-[10px] text-9e-brand group-hover:underline">
                              ดูรายละเอียด →
                            </span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">ยังไม่มีคอร์สแนะนำ</p>
                    )}
                  </div>
                )}
              </div>

              {/* ── COL 4 — Clickable cover card (courses · career-path · tnhs) ── */}
              {col1Active !== 'online' && (
                <div className="max-h-[392px] min-h-0 overflow-y-auto p-3">
                  {col1Active === 'courses' && previewLoading ? (
                    <Col4Skeleton />
                  ) : col4Preview ? (
                    <Col4Card preview={col4Preview} onClose={closeMegaMenu} />
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Col 4 of the mega menu — a single clickable card for the hovered
 * program / skill / career-path / TNHS preview. `preview` is the
 * normalized shape `{ name, imageUrl, href, external }`. Internal links
 * use <Link> for client-side nav; external ones open in a new tab.
 */
function Col4Card({ preview, onClose }) {
  const cardClass = [
    'group flex flex-col rounded-xl overflow-hidden',
    'border border-[var(--surface-border)]',
    'bg-[var(--surface)]',
    'shadow-sm hover:shadow-md',
    'transition-all duration-9e-micro ease-9e',
    'hover:border-9e-brand/40',
    'cursor-pointer',
    'no-underline',
  ].join(' ');

  const inner = (
    <>
      {/* Cover image area */}
      <div className="relative aspect-video w-full overflow-hidden bg-[var(--surface-muted)]">
        {preview.imageUrl ? (
          <Image
            src={preview.imageUrl}
            alt={preview.name ?? ''}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-6 w-6 text-[var(--text-muted)]" />
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-col gap-1.5 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--text-primary)]">
          {preview.name}
        </p>
        <span className="text-xs text-9e-brand group-hover:underline">
          {preview.external ? 'เปิดเว็บไซต์ →' : 'ดูรายละเอียด →'}
        </span>
      </div>
    </>
  );

  if (preview.external) {
    return (
      <a
        href={preview.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        className={cardClass}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link href={preview.href} onClick={onClose} className={cardClass}>
      {inner}
    </Link>
  );
}

/** Pulse placeholder shown while a Programs/Skills cover is in flight. */
function Col4Skeleton() {
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-xl border border-[var(--surface-border)]">
      <div className="aspect-video w-full bg-[var(--surface-muted)]" />
      <div className="flex flex-col gap-2 p-3">
        <div className="h-3 w-3/4 rounded bg-[var(--surface-muted)]" />
        <div className="h-3 w-1/2 rounded bg-[var(--surface-muted)]" />
      </div>
    </div>
  );
}

// ── Mobile drawer ───────────────────────────────────────────────

function MobileDrawer({
  open,
  programs,
  dynamicCareerPaths,
  tnhsCourses = [],
  navOnlineCourses = [],
  onClose,
}) {
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
                  dynamicCareerPaths={dynamicCareerPaths}
                  tnhsCourses={tnhsCourses}
                  navOnlineCourses={navOnlineCourses}
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

/**
 * Generic collapsible used by the mobile หลักสูตร menu. Nests freely —
 * "หลักสูตรทั้งหมด" expands to "Programs"/"Skills" sub-accordions.
 */
function MobileSub({ label, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-9e-sm px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)]"
      >
        <span>{label}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform duration-9e-micro ease-9e',
            open && 'rotate-180'
          )}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="ml-2 mt-1 space-y-1 border-l border-[var(--surface-border)] pl-2">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Mobile หลักสูตร menu — accordion-in-accordion mirror of the desktop
 * cascade. No cover previews; everything is plain links.
 */
function MobileMegaAccordion({
  item,
  programs,
  dynamicCareerPaths,
  tnhsCourses = [],
  navOnlineCourses = [],
  onNavigate,
}) {
  const [open, setOpen] = useState(false);
  const cpRows = careerPathRows(dynamicCareerPaths);

  const rowClass =
    'flex items-center gap-3 rounded-9e-sm px-3 py-2 text-sm text-[var(--text-primary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)] hover:text-9e-brand';

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
        <div className="ml-3 mt-1 space-y-1 border-l border-[var(--surface-border)] pl-3">
          {/* หลักสูตรทั้งหมด → Programs / Skills */}
          <MobileSub label="หลักสูตรทั้งหมด" defaultOpen>
            <MobileSub label="Programs">
              {programs.map((p) => (
                <Link
                  key={p._id ?? p.program_id}
                  href={programHref(p)}
                  onClick={onNavigate}
                  className={rowClass}
                >
                  <ProgramIcon src={p.programiconurl} size={20} alt={p.program_name} />
                  <span>{p.program_name}</span>
                </Link>
              ))}
            </MobileSub>
            <MobileSub label="Skills">
              {skills.map((s) => (
                <Link
                  key={s.slug}
                  href={`/skill/${s.slug}`}
                  onClick={onNavigate}
                  className={rowClass}
                >
                  <Image
                    src={s.iconUrl}
                    alt=""
                    aria-hidden="true"
                    width={20}
                    height={20}
                    className="h-5 w-5 flex-none object-contain"
                    unoptimized
                  />
                  <span>{s.label}</span>
                </Link>
              ))}
            </MobileSub>
          </MobileSub>

          {/* Career Path */}
          <MobileSub label="Career Path">
            {cpRows.map((cp) => (
              <Link
                key={cp.href}
                href={cp.href}
                onClick={onNavigate}
                className={rowClass}
              >
                <span>{cp.label}</span>
              </Link>
            ))}
          </MobileSub>

          {/* TNHS */}
          <MobileSub label="TNHS">
            {tnhsCourses.length > 0 ? (
              tnhsCourses.map((c) => (
                <a
                  key={c._id}
                  href={c.external_url || '#'}
                  target={c.external_url ? '_blank' : undefined}
                  rel={c.external_url ? 'noopener noreferrer' : undefined}
                  onClick={onNavigate}
                  className="flex items-center justify-between gap-3 rounded-9e-sm px-3 py-2 text-sm text-[var(--text-primary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-muted)] hover:text-9e-brand"
                >
                  <span>{c.course_name}</span>
                  <ExternalLink className="h-3.5 w-3.5 flex-none text-[var(--text-muted)]" strokeWidth={1.75} />
                </a>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-[var(--text-muted)]">ยังไม่มีหลักสูตร</p>
            )}
          </MobileSub>

          {/* หลักสูตรออนไลน์ */}
          <MobileSub label="หลักสูตรออนไลน์">
            {navOnlineCourses.length > 0 ? (
              navOnlineCourses.map((c) => (
                <Link
                  key={c._id}
                  href={courseHref(c.course_id)}
                  onClick={onNavigate}
                  className={rowClass}
                >
                  <span className="line-clamp-2">{c.course_name}</span>
                </Link>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-[var(--text-muted)]">ยังไม่มีคอร์สแนะนำ</p>
            )}
            <a
              href={siteConfig.academyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onNavigate}
              className="flex items-center px-3 py-2 text-xs font-medium text-9e-brand hover:underline"
            >
              ดูทั้งหมด →
            </a>
          </MobileSub>
        </div>
      )}
    </div>
  );
}
