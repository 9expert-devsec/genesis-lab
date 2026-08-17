import Link from 'next/link';
import { PolicyIcon } from './PolicyIcon';

/**
 * The detail pages' left rail: an in-page table of contents plus a help card.
 *
 * ── WIDTH ───────────────────────────────────────────────────────────────────
 * 280px fixed. The Figma drew this rail at 280 on three pages and 320 on the
 * privacy page; nothing depended on the extra 40px, so all four are normalised
 * to 280 and the four pages now share one rail. Inside a 1200 container that
 * leaves 280 + 40 gap + 880 for content, which is the column math the whole
 * legal centre is built to.
 *
 * ── NO SCROLL-SPY ───────────────────────────────────────────────────────────
 * These are plain anchors with no active-section tracking. A scroll-spy here
 * would need an IntersectionObserver against sections that are collapsed most
 * of the time — it would spend most of its life highlighting nothing, and it
 * cannot be verified without a browser. Anchors work with JavaScript disabled
 * and are what the page actually needs.
 */
export function PolicyTocSidebar({ items, numbered = true, help }) {
  return (
    <aside className="w-[280px] shrink-0 max-lg:w-full">
      <div className="sticky top-24 flex flex-col gap-6">
        <nav
          aria-label="สารบัญ"
          className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-4"
        >
          <p className="mb-2 px-2 text-sm font-bold text-[var(--text-primary)]">
            สารบัญ
          </p>
          <ol className="flex flex-col">
            {items.map((item, i) => (
              <li key={item.id}>
                <Link
                  href={`#${item.id}`}
                  className="flex gap-2 rounded-lg px-2 py-2 text-[13px] leading-snug text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-9e-action dark:hover:text-[#48B0FF]"
                >
                  {numbered && (
                    <span className="shrink-0 font-semibold text-9e-action dark:text-[#48B0FF]">
                      {i + 1}.
                    </span>
                  )}
                  <span>{item.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        {help && (
          <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-9e-action/10 text-9e-action dark:bg-[#48B0FF]/10 dark:text-[#48B0FF]">
              <PolicyIcon name={help.icon} className="h-6 w-6" />
            </span>
            <p className="text-sm font-bold text-[var(--text-primary)]">
              {help.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              {help.blurb}
            </p>
            <Link
              href={help.href}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-9e-action px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0049CC]"
            >
              {help.cta}
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
