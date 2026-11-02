'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gamepad2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const LABEL = '9Expert Play — เกมฝึกทักษะ';

export function isPlayPath(pathname) {
  return pathname === '/play' || String(pathname ?? '').startsWith('/play/');
}

/**
 * The header's game entry: a 36px round icon with a lime "new" dot, filled
 * lime with a navy icon (and no dot) on any /play route. It is only rendered
 * when the server says PLAY_ENABLED — PublicHeader reads the flag and passes a
 * boolean; nothing on the client reads the environment.
 *
 * `onHero` follows the bar's transparent-on-hero mode, like the search icon. It
 * is deliberately NOT named `overlay`: test/fs/heroOverlayOptIn counts exactly
 * three `overlay={overlayTransparent}` props — the nav triggers — in the header.
 */
export function PlayHeaderLink({ onHero = false }) {
  const active = isPlayPath(usePathname());
  return (
    <Link
      href="/play"
      aria-label={LABEL}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-9e-micro ease-9e',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-lime',
        active
          ? 'bg-[#D4F73F] text-[#0D1B2A]'
          : onHero
            ? 'bg-white/15 text-white hover:bg-white/25'
            : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-9e-brand'
      )}
    >
      <Gamepad2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
      {!active && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[#D4F73F] ring-2 ring-[var(--page-bg)]"
        />
      )}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-[#0D1B2A] px-2.5 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-9e-micro group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {LABEL}
      </span>
    </Link>
  );
}
