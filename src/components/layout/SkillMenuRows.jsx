'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight } from 'lucide-react';
import { cn, skillHref } from '@/lib/utils';

/**
 * The skill rows of the mega menu, for both the desktop panel and the mobile
 * drawer.
 *
 * ── WHY THESE TWO LISTS LIVE IN ONE FILE ──────────────────────────────────
 *
 * They render the SAME sequence in two different skins. Left inline in
 * PublicHeaderClient they were two `.map()` calls 600 lines apart, and the
 * skill ORDER was about to become a third thing they each had to get right —
 * which is how a desktop menu and a mobile menu start disagreeing about what
 * comes first without anyone noticing, because nobody opens both on the same
 * commit.
 *
 * Neither component sorts, filters or looks anything up. They take an array
 * that is already in final order (PublicHeaderClient sorts once, via
 * lib/navmenu/skillOrder.js) and render it in order. If the two menus ever
 * disagree again it is because they were handed different arrays, which is a
 * much easier bug to find than two diverging sorts.
 *
 * It also makes the order TESTABLE. The suite renders with
 * renderToStaticMarkup and has no DOM or interaction, so the real menus —
 * both behind `useState(false)` gates — emit no skill markup at all in a
 * static render. Exported here, the rows can be rendered on their own and the
 * sequence asserted for real rather than grepped for out of the source.
 *
 * `label`, `iconUrl` and the href all come from the config entry; only the
 * ORDER of the array came from the database.
 */

/**
 * Desktop mega-panel rows: icon · label · course count · chevron, with the
 * hover handler that drives Col 3 and the active-row highlight.
 *
 * @param {object[]} skills    already ordered and visibility-filtered
 * @param {Function} countFor  skill → cached course count (or undefined)
 * @param {string}   activeKey upstreamId of the row whose courses are showing
 */
export function DesktopSkillRows({
  skills = [],
  slugMap = {},
  rowClass = '',
  countFor = () => undefined,
  activeKey = null,
  onHover = () => {},
  onNavigate = () => {},
}) {
  return (
    <ul>
      {skills.map((s) => {
        const count = countFor(s);
        const isActiveRow = activeKey === s.upstreamId;
        return (
          <li key={s.slug}>
            <Link
              href={skillHref(s, slugMap)}
              onMouseEnter={() => onHover(s)}
              onClick={onNavigate}
              className={cn(
                rowClass,
                isActiveRow && 'bg-[var(--surface-muted)] font-medium text-9e-action dark:text-9e-brand'
              )}
            >
              <Image
                src={s.iconUrl}
                alt={`ไอคอน ${s.label}`}
                width={20}
                height={20}
                className="h-5 w-5 flex-none object-contain"
                unoptimized
              />
              <span
                className={cn(
                  'flex-1',
                  isActiveRow ? 'text-9e-action dark:text-9e-brand' : 'text-[var(--text-primary)]'
                )}
              >
                {s.label}
              </span>
              {count > 0 && (
                <span className="flex-none text-[10px] text-[var(--text-muted)]">({count})</span>
              )}
              <ChevronRight className="h-3.5 w-3.5 flex-none opacity-30" strokeWidth={2} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Mobile drawer rows: icon · label, plain links, no counts and no hover. */
export function MobileSkillRows({
  skills = [],
  slugMap = {},
  rowClass = '',
  onNavigate = () => {},
}) {
  return (
    <>
      {skills.map((s) => (
        <Link
          key={s.slug}
          href={skillHref(s, slugMap)}
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
    </>
  );
}
