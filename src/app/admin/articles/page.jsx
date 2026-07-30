import { requirePage } from '@/lib/rbac/guard';
import { getArticles } from '@/lib/actions/articles';
import { ADMIN_LIST_FIELDS } from '@/lib/articleListFields';
import { ArticlesAdminClient } from './_components/ArticlesAdminClient';

export const metadata = { title: 'จัดการบทความ' };
export const dynamic = 'force-dynamic';

/**
 * How many articles this page fetches in one go.
 *
 * DELIBERATELY NOT RAISED IN THIS COMMIT. The collection holds 484 articles, so
 * this window hides 284 of them — but raising it is not the fix, it is a bigger
 * version of the same fix-by-luck that produced the bug. The real repair is
 * server-side pagination (next commit), which removes the window entirely.
 * What this commit changes is that the window can no longer LIE about itself:
 * `total` now reaches the client and drives a banner naming every hidden row.
 *
 * The projection has to land before the number moves. `getArticles` had no
 * `.select()`, so it serialised whole documents — every `content` HTML body —
 * into the RSC payload; raising the limit first would have multiplied an
 * already-heavy payload by 2.4x.
 */
const ADMIN_LIST_LIMIT = 200;

export default async function ArticlesAdminPage() {
  await requirePage('articles');

  // `total` is the whole point: countDocuments already computed it and the old
  // code discarded it, which is why nothing on the page could tell that 284
  // articles were missing.
  const { items, total } = await getArticles({
    limit: ADMIN_LIST_LIMIT,
    select: ADMIN_LIST_FIELDS,
  });

  return (
    <ArticlesAdminClient
      articles={items}
      total={total}
      limit={ADMIN_LIST_LIMIT}
    />
  );
}
