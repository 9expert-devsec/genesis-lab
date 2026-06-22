'use client';

import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

/**
 * Public site header — masterclass-only mode.
 *
 * Stripped down to just the brand logo and the dark-mode toggle. The full
 * site's search, mega-menu navigation, and mobile drawer are intentionally
 * removed: this deployment serves only /masterclass/* pages, so there is
 * nothing else to navigate to.
 */
export function PublicHeaderClient() {
  return (
    <header className="sticky top-0 left-0 right-0 z-50 border-b border-[var(--surface-border)] bg-white backdrop-blur-md transition-colors dark:bg-9e-navy">
      <div className="mx-auto flex h-20 max-w-[1200px] items-center gap-4 max-md:px-4">
        {/* ── Logo ─────────────────────────────────────────────── */}
        <div className="flex-none">
          <Logo priority />
        </div>

        {/* ── Right-side actions (dark-mode toggle only) ───────── */}
        <div className="ml-auto flex flex-none items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
