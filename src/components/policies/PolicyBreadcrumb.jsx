import Link from 'next/link';
import { PolicyIcon } from './PolicyIcon';

/**
 * Breadcrumb trail for the legal centre.
 *
 * Every one of the five pages has one and the repo had no shared component for
 * it — the only existing breadcrumb, SkillBreadcrumb, is welded to the skill
 * route's data shape.
 *
 * The last item is the current page: rendered as plain text with
 * `aria-current="page"`, never as a link to itself. Items before it are links.
 *
 * @param {{items: Array<{label: string, href?: string}>}} props
 */
export function PolicyBreadcrumb({ items }) {
  if (!items?.length) return null;

  return (
    <nav aria-label="เส้นทางนำทาง" className="text-xs">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.href ?? item.label} className="flex items-center gap-2">
              {i > 0 && (
                <PolicyIcon
                  name="chevronRight"
                  className="h-3 w-3 shrink-0 text-[var(--text-muted)]"
                />
              )}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className="font-semibold text-9e-action dark:text-[#48B0FF]"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-[var(--text-secondary)] transition-colors hover:text-9e-action dark:hover:text-[#48B0FF]"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
