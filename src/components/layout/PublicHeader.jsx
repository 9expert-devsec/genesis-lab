import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { mainNav } from '@/config/site';

/**
 * Public site header — sticky, theme-aware surface, lime CTA.
 * Server Component; no client state yet. Mobile nav toggle will be
 * added later as a Client Component island.
 */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--surface-border)] bg-[var(--page-bg)]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-4 py-3 lg:px-6">
        <Logo priority />

        <nav className="hidden lg:flex items-center gap-1" aria-label="Primary">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              className={
                'px-3 py-2 text-sm font-medium text-[var(--text-secondary)] ' +
                'rounded-9e-sm transition-colors duration-9e-micro ease-9e ' +
                'hover:text-9e-brand hover:bg-[var(--surface-muted)]'
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="cta" size="sm">
            <Link href="/registration/in-house">
              สอบถามหลักสูตรองค์กร
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
