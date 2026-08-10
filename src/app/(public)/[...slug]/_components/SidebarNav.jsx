import { courseSectionLinks } from '@/lib/courseSectionNav';

/**
 * In-page jump links, as the desktop sidebar's vertical list.
 *
 * WHICH links exist is not decided here — it comes from courseSectionLinks, so
 * this rendering and the mobile tab strip cannot disagree about which sections
 * a course has. This file owns presentation only.
 */
export function SidebarNav({ course, hasSchedules, hasRelated, hasFaqs }) {
  const links = courseSectionLinks({ course, hasSchedules, hasRelated, hasFaqs });

  if (!links.length) return null;

  // `hidden lg:block` is load-bearing, not cosmetic. Below lg the <aside> that
  // holds this reflows to the BOTTOM of the page, after every section it links
  // to, and CourseSectionTabs renders the same links as a sticky strip at the
  // top instead. Without this the links ship TWICE below lg — usable tabs up
  // top and a dead copy at the bottom — which looks correct in a screenshot of
  // the top of the page and is wrong on every real one. The aside itself stays
  // visible: it also carries PDFDownload, which mobile still needs.
  return (
    <nav className="hidden rounded-2xl border border-[var(--surface-divider)] bg-[var(--surface-raised)] p-4 shadow-9e-md lg:block">
      <ul className="space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-base text-[var(--text-secondary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-hover)] hover:text-9e-action"
              >
                <Icon
                  className="h-[18px] w-[18px] shrink-0 text-9e-air"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                {link.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
