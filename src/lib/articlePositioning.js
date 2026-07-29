/**
 * Article positioning and pin-badge visibility.
 *
 * `isPinnedOnArticlePage` used to do two unrelated jobs at once: it sorted the
 * article into the top block of /articles (via the cascade in
 * src/lib/actions/articles.js) AND it drew the pin badge on the card. So there
 * was no way to give an article a chosen position without also branding it as
 * pinned. `showPinBadge` now owns the badge; `isPinnedOnArticlePage` keeps the
 * sort, untouched.
 *
 * ── THE ORDERING MODEL, AND WHAT IT CANNOT EXPRESS ──────────────────────────
 * The public list is TWO CONTIGUOUS BLOCKS: positioned articles ordered by
 * `pinOrder`, then everything else by `publishedAt`. There is no third tier and
 * no gap between the blocks. The only ranks that can be expressed are therefore
 * 1..(block size + 1) — "put this at rank 12" with a 4-article block is NOT
 * representable, because it would need empty slots between the blocks, i.e. a
 * fixed-slot model. Do not add one here; the UI's job is to stop offering what
 * the model cannot store, which is why promoting is a button and an arbitrary
 * rank is not a text field.
 *
 * Dependency-free (no next/*, no db, no models) so it runs in the `pure` tier,
 * on the server page, and in the admin client.
 */

import { compareArticlesForPublicOrder } from '@/lib/articleRank';

/**
 * Does this article's card draw the pin badge on /articles?
 *
 * ── WHY `!== false` AND NOT A TRUTHINESS CHECK ──────────────────────────────
 * DO NOT "simplify" this to `article.showPinBadge`. `getArticles` reads with
 * `.lean()` (src/lib/actions/articles.js), which returns raw BSON and so does
 * NOT apply Mongoose schema defaults, and its result is then run through
 * `serialize` (JSON round-trip), which drops undefined keys entirely. Every
 * article written before `showPinBadge` existed therefore reads back with the
 * key ABSENT — `undefined`, not `true`.
 *
 * Under a truthiness check every one of those articles would lose its badge the
 * moment this deploys, silently, with no migration having run. `!== false`
 * makes absent mean ON, which is what those documents meant when they were
 * written: back then, positioned implied badged.
 *
 * ── WHY POSITIONING IS STILL REQUIRED ───────────────────────────────────────
 * The badge is gated on `isPinnedOnArticlePage` as well, and that half is not
 * optional either: `showPinBadge !== false` is true for EVERY legacy document,
 * including the unpositioned ones, so a badge that keyed off the new field
 * alone would sprout a pin on all ~200 articles. Beyond the regression, a pin
 * badge on an article that is not actually pinned to the top is a lie to the
 * reader.
 */
export function shouldShowPinBadge(article) {
  return article?.isPinnedOnArticlePage === true && article?.showPinBadge !== false;
}

/** Articles that occupy the manually-positioned block. */
export function isPositioned(article) {
  return article?.isPinnedOnArticlePage === true;
}

const orderOf = (a) => (Number.isFinite(Number(a?.pinOrder)) ? Number(a.pinOrder) : 0);

/**
 * Plan the writes that promote `id` into the positioned block.
 *
 * Appends to the END of the block — the first expressible free rank — never the
 * top. Inserting at the top would silently displace a position the admin
 * deliberately chose earlier, and there is no way for them to have asked for
 * that by pressing one button.
 *
 * `pinOrder` is derived as (highest existing) + 1 rather than (block size) + 1:
 * the stored values are not guaranteed contiguous (they are a free number input
 * and two articles may legitimately share one), and only max+1 is guaranteed to
 * sort after every current member. The block is measured over ALL positioned
 * articles including inactive ones, so an inactive member holding a high
 * pinOrder cannot cause a collision when it is switched back on.
 *
 * NOTHING ELSE IS RENUMBERED. The plan touches exactly one document.
 *
 * @returns {{ kind: 'promote', id: string, writes: {_id: string, isPinnedOnArticlePage?: boolean, pinOrder?: number}[] }}
 */
export function planPromotion(articles, id) {
  const list = Array.isArray(articles) ? articles : [];
  const key = String(id);
  const block = list.filter(isPositioned).filter((a) => String(a?._id) !== key);
  const nextOrder = block.length === 0 ? 1 : Math.max(...block.map(orderOf)) + 1;

  return {
    kind: 'promote',
    id: key,
    writes: [{ _id: key, isPinnedOnArticlePage: true, pinOrder: nextOrder }],
  };
}

/**
 * Plan the writes that return `id` to date ordering.
 *
 * Unlike promotion this DOES renumber: pulling a member out of the block leaves
 * a hole in the `pinOrder` sequence, and a hole is not harmless — the next
 * promotion computes max+1 from an inflated maximum, so the numbers drift
 * upward forever and stop resembling the ranks they produce. The survivors are
 * renumbered 1..M in the order the real cascade already put them, so their
 * relative order — the thing the admin actually chose — is preserved exactly.
 *
 * @returns {{ kind: 'demote', id: string, writes: {...}[] }}
 */
export function planDemotion(articles, id) {
  const list = Array.isArray(articles) ? articles : [];
  const key = String(id);

  const survivors = list
    .filter(isPositioned)
    .filter((a) => String(a?._id) !== key)
    .sort(compareArticlesForPublicOrder);

  const writes = [{ _id: key, isPinnedOnArticlePage: false, pinOrder: 0 }];
  survivors.forEach((a, i) => {
    const want = i + 1;
    // Only write the ones that actually move.
    if (orderOf(a) !== want) writes.push({ _id: String(a._id), pinOrder: want });
  });

  return { kind: 'demote', id: key, writes };
}

/** Plan the write that turns the badge on or off. Positioning is untouched. */
export function planBadgeToggle(id, show) {
  return {
    kind: 'badge',
    id: String(id),
    writes: [{ _id: String(id), showPinBadge: Boolean(show) }],
  };
}

/**
 * Apply a plan to a list, returning a new list. Used for the admin's optimistic
 * update and by the tests, so what the UI shows and what the tests assert come
 * out of the same code path.
 */
export function applyPositionPlan(articles, plan) {
  const list = Array.isArray(articles) ? articles : [];
  const byId = new Map((plan?.writes ?? []).map((w) => [String(w._id), w]));
  return list.map((a) => {
    const w = byId.get(String(a?._id));
    if (!w) return a;
    const { _id, ...fields } = w;
    return { ...a, ...fields };
  });
}
