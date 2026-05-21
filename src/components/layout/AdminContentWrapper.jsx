'use client';

import { usePathname } from 'next/navigation';

/**
 * Wraps admin page content with the standard `p-6` padding, except on
 * routes that manage their own full-height layout (currently only the
 * article create/edit forms, which use an internal `h-[100dvh]` flex
 * column and would double-scroll if the wrapper added padding).
 *
 * Driven by the live route via `usePathname` so we don't have to plumb
 * a flag through every page.
 */
export function AdminContentWrapper({ children }) {
  const pathname = usePathname() ?? '';

  // `/admin/articles/new` and `/admin/articles/[id]/edit` both fall
  // under the `/admin/articles/` prefix; the list page `/admin/articles`
  // (no trailing slash) doesn't match and keeps the padding.
  const isArticleEditor = pathname.startsWith('/admin/articles/');

  return (
    <div className={isArticleEditor ? '' : 'p-6'}>
      {children}
    </div>
  );
}