'use client';

import Link from 'next/link';
import { withListQuery } from '@/lib/courses/adminListQuery';
import { tabVariants, tabCountVariants } from '@/app/admin/registrations/_components/detailShell';

/**
 * หลักสูตรทั้งหมด / Private Courses on /admin/courses.
 *
 * LINKS, NOT STATE. The active tab is `?tab=private` (or absent), read from
 * `searchParams` by page.jsx and passed down as `active` — there is nothing to
 * seed and nothing to write back, so Back/Forward and a reload keep the tab
 * (the url-filter-state rule CoursesAdminClient's header describes).
 *
 * Navigation links, so `aria-current="page"` inside a labelled <nav> rather
 * than role="tab": an ARIA tab is a widget that swaps panels in place with
 * arrow keys, and these load a different URL. The look is the registrations
 * detail TabList's own variants, imported rather than copied.
 *
 * `query` is the page's other params (q / program / type) without `tab`, so
 * switching tabs keeps the search term and returning to the first tab keeps
 * its filters.
 */
export function CourseListTabs({ active = '', query = '', counts = {} }) {
  const tabs = [
    { key: '', label: 'หลักสูตรทั้งหมด', count: counts.all },
    { key: 'private', label: 'Private Courses', count: counts.private },
  ];
  return (
    <nav
      aria-label="รายการหลักสูตร"
      className="mb-4 inline-flex h-[49px] items-center gap-[4px] rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-[5px]"
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        const qs = new URLSearchParams(query);
        if (tab.key) qs.set('tab', tab.key);
        return (
          <Link
            key={tab.key || 'all'}
            href={withListQuery('/admin/courses', qs.toString())}
            aria-current={selected ? 'page' : undefined}
            className={`${tabVariants({ selected })} whitespace-nowrap px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-action`}
          >
            <span>{tab.label}</span>
            {tab.count == null ? null : (
              <span className={tabCountVariants({ selected })}>{tab.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
