import { requirePage } from '@/lib/rbac/guard';
import { getArticles } from '@/lib/actions/articles';
import { ADMIN_LIST_FIELDS } from '@/lib/articleListFields';
import { ArticlesAdminClient } from './_components/ArticlesAdminClient';

export const metadata = { title: 'จัดการบทความ' };
export const dynamic = 'force-dynamic';

/**
 * How many articles this page fetches in one go.
 *
 * ── THIS IS A TRIPWIRE, NOT A CAPACITY GUESS ────────────────────────────────
 * It is NOT sized so that it will never be hit. It is sized at the payload
 * budget where we want to be TOLD. Measured 2026-07-30 against the real
 * collection, with the projection from ADMIN_LIST_FIELDS applied:
 *
 *   483 rows, projected      →  370 KB JSON   (~785 bytes/row)
 *   200 rows, unprojected    → 1072 KB        (what production served before
 *                              the projection landed, while hiding 283 rows)
 *
 * So the whole collection now costs about a THIRD of what the truncated list
 * used to. The projection cut per-row weight ~7x, and that is what removed the
 * reason this limit existed — not optimism about the row count. At ~785
 * bytes/row, 1500 rows is ~1.18 MB, which is where server-side pagination
 * starts being worth what it costs to build and maintain.
 *
 * The server sorts all 483 documents whatever this number says (the sort is a
 * blocking in-memory SORT — no index serves the cascade, see the note in
 * src/models/Article.js), so the only delta from raising it is serialising and
 * transferring 283 more rows: ~222 KB.
 *
 * ── IF YOU ARE HERE BECAUSE YOU SAW THE AMBER BANNER ────────────────────────
 * Good — that is this constant doing its job. When the collection outgrows this
 * number, `total > reachable` and the banner fires by itself, naming exactly how
 * many articles are unreachable. It is the alarm, and it went off.
 *
 * The correct response is to WEIGH SERVER-SIDE PAGINATION, not to bump this
 * number again. Bumping it is how the original bug survived: each raise buys
 * silence, moves the cliff, and leaves the next person with a bigger payload and
 * the same class of defect. If you raise it anyway, re-measure bytes/row first
 * and update the numbers above — a budget nobody can re-derive is a budget
 * nobody will question.
 */
const ADMIN_LIST_LIMIT = 1500;

export default async function ArticlesAdminPage() {
  await requirePage('articles');

  // `total` is the whole point: countDocuments already computed it and the old
  // code discarded it, which is why nothing on the page could tell that 284
  // articles were missing.
  const { items, total } = await getArticles({
    limit: ADMIN_LIST_LIMIT,
    select: ADMIN_LIST_FIELDS,
  });

  // `reachable` is what this surface can get the admin to, not what it paints.
  // Today those are the same number — one fetch, no pager, every fetched row
  // rendered — so it is `items.length`. Once commit 3 adds a pager it becomes
  // `total` and the banner goes silent. See the contract on describeListWindow.
  return (
    <ArticlesAdminClient
      articles={items}
      total={total}
      reachable={items.length}
    />
  );
}
