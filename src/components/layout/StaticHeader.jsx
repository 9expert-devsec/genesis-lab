import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

/**
 * StaticHeader — the site bar with NO data behind it.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Next renders the root `not-found.jsx` into EVERY page's RSC tree (that is how
 * a client-side 404 can paint without a round trip). The root not-found used to
 * mount `PublicHeader`, so every page on the site — static or dynamic — ran the
 * header's ~9 Mongo reads a second time and serialised the ~195 K-char nav
 * catalogue twice. MEASURED before the change: a 404 body was 734 KB and a
 * prerendered /about-us carried two identical `programs` chunks.
 *
 * The rule, then: whatever sits in the not-found tree above the public pages
 * fetches NOTHING. This bar is logo + two links, all static imports. Do not
 * "upgrade" it by importing PublicHeader, listPrograms, getNavMenuData or any
 * `@/lib/actions/*` — test/fs/notFoundChrome.test.mjs guards the import view.
 *
 * Styling mirrors PublicHeaderClient's non-overlay shell so the 404 still
 * reads as the site; the mega menu and search box are deliberately absent.
 */
export function StaticHeader() {
  return (
    <header className="sticky top-0 left-0 right-0 z-60 border-b border-[var(--surface-border)] bg-white backdrop-blur-md dark:bg-9e-navy">
      <div className="mx-auto flex h-20 max-w-[1200px] items-center gap-4 max-md:px-4">
        <div className="flex-none">
          <Logo priority />
        </div>
        <nav
          className="font-thai ml-auto flex items-center gap-4 text-sm font-medium text-[var(--text-primary)]"
          aria-label="Primary"
        >
          <Link href="/" className="hover:text-9e-action">
            หน้าแรก
          </Link>
          <Link href="/training-course" className="hover:text-9e-action">
            หลักสูตร
          </Link>
          <Link href="/search" className="hover:text-9e-action">
            ค้นหา
          </Link>
        </nav>
      </div>
    </header>
  );
}
