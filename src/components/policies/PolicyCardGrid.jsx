import Link from 'next/link';
import { PolicyIcon } from './PolicyIcon';
import { POLICY_PAGES } from '@/config/policies';

/**
 * The hub's 2×2 grid of policy cards.
 *
 * ── THE ACTIVE STATE ────────────────────────────────────────────────────────
 * One card can be marked active: 2px brand border, a tinted icon box and a
 * checked badge, against the plain 1px border the other three carry.
 *
 * On the hub, the active card is whichever policy the summary panel beside it
 * is currently describing — which is how the Figma drew it, with the privacy
 * card ringed and the privacy summary alongside. It is a "you are reading about
 * this one" marker, not a navigation state, so it is derived from a prop rather
 * than from the current route. That also keeps this a server component: the
 * active card is known at render time and never changes without a navigation,
 * so there is nothing here worth shipping JavaScript for.
 */
export function PolicyCardGrid({ activeSlug }) {
  return (
    <ul className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
      {POLICY_PAGES.map((policy) => {
        const isActive = policy.slug === activeSlug;

        return (
          <li key={policy.slug}>
            <Link
              href={policy.href}
              aria-current={isActive ? 'true' : undefined}
              className={`relative flex h-full flex-col gap-4 rounded-2xl bg-[var(--surface)] p-6 transition-colors ${
                isActive
                  ? 'border-2 border-9e-action dark:border-[#48B0FF]'
                  : 'border border-[var(--surface-border)] hover:border-9e-action dark:hover:border-[#48B0FF]'
              }`}
            >
              {isActive && (
                <span className="absolute right-3.5 top-3.5 flex h-6 w-6 items-center justify-center rounded-full bg-9e-action text-white dark:bg-[#48B0FF] dark:text-[#0D1B2A]">
                  <PolicyIcon name="check" className="h-3 w-3" strokeWidth={3} />
                </span>
              )}

              <div className="flex items-center gap-4">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                    isActive
                      ? 'bg-9e-action/10 text-9e-action dark:bg-[#48B0FF]/15 dark:text-[#48B0FF]'
                      : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]'
                  }`}
                >
                  <PolicyIcon name={policy.icon} className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold leading-snug text-[var(--text-primary)]">
                    {policy.title}
                  </span>
                  <span className="block text-[14px] font-semibold text-[var(--text-secondary)]">
                    ({policy.titleEn})
                  </span>
                </span>
              </div>

              <p className="text-[13px] leading-[1.6] text-[var(--text-secondary)]">
                {policy.blurb}
              </p>

              <span className="mt-auto flex justify-end text-9e-action dark:text-[#48B0FF]">
                <PolicyIcon name="chevronRight" className="h-4 w-4" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
