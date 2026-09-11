'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { articlePublicListQuery, withListQuery } from '@/lib/articles/publicListQuery';

/**
 * กลับไปยังบทความทั้งหมด — back to the list page and filter the reader came from.
 *
 * ── WHY THIS IS A CLIENT COMPONENT INSIDE ITS OWN SUSPENSE ─────────────────
 * The article page is ISR (`revalidate = 3600` in page.jsx) and it stays that
 * way. Reading `searchParams` on the server page would flip every article to
 * per-request rendering to serve one link. Reading `useSearchParams` in a
 * client component during a static render makes Next bail that subtree out to
 * client rendering UP TO THE NEAREST SUSPENSE BOUNDARY — so the boundary is
 * here, around this anchor and nothing else. The article body, the share
 * strip and the table of contents stay prerendered.
 *
 * ── THE FALLBACK IS THE BARE LINK, AND THAT IS WHAT THE SERVER SENDS ────────
 * A crawler, a no-JS reader and the first paint all get `/articles`, which is
 * the right destination for anyone who did not arrive from a paged list. Once
 * hydrated, the link carries whatever list state is on the article's own URL —
 * '' when there is none, so a shared bare link stays a bare back link.
 *
 * The list state is the SAME serialiser the list page uses to write the card's
 * link (lib/articles/publicListQuery), so the two ends of the round trip
 * cannot disagree about which params are state.
 */
const CLASS = 'inline-flex items-center gap-1 text-sm text-9e-action hover:underline';

function BackAnchor({ href }) {
  return (
    <Link href={href} className={CLASS}>
      <ChevronLeft className="h-4 w-4" /> กลับไปยังบทความทั้งหมด
    </Link>
  );
}

function BackToList() {
  const searchParams = useSearchParams();
  return <BackAnchor href={withListQuery('/articles', articlePublicListQuery(searchParams))} />;
}

export function ArticleBackLink() {
  return (
    <Suspense fallback={<BackAnchor href="/articles" />}>
      <BackToList />
    </Suspense>
  );
}
