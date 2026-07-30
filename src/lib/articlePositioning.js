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
 * the model cannot store, which is why moving is a bounded control and an
 * arbitrary rank is not a text field.
 *
 * ── CORRECTION: `pinOrder` IS NOT SCOPED TO THE BLOCK (b-006) ───────────────
 * The paragraph above describes the INTENT. It described the implementation
 * wrongly for a long time, and this file's own docstring is what hid a live bug
 * through three rounds of investigation, so read this carefully.
 *
 * The Mongo sort is, verbatim (src/lib/actions/articles.js → getArticles):
 *
 *     { isPinnedOnArticlePage: -1, pinOrder: 1, publishedAt: -1, createdAt: -1 }
 *
 * `pinOrder` is the SECOND key, and a sort key applies to EVERY document — not
 * only to the ones that "care" about it. Every unpinned article ties on
 * `isPinnedOnArticlePage: false`, so among the unpinned mass `pinOrder` is
 * consulted BEFORE `publishedAt`. It is uninformative there only because they
 * almost all hold the default `0`.
 *
 * The consequence, observed in production: ONE unpinned article carrying a
 * stale non-zero `pinOrder` sorted below all 472 unpinned rows holding `0` and
 * landed dead last out of 483, despite a `publishedAt` newer than six of the
 * rows above it. Nothing errored. It simply vanished off the end of the list.
 *
 * So the model has an INVARIANT, not just a convention:
 *
 *     unpinned  ⇒  pinOrder === 0
 *     pinned    ⇒  pinOrder ∈ 1..M, contiguous, no duplicates
 *
 * Every write path must maintain it. A path that writes ONE positioning field
 * and leaves the other stale is how both b-005 (duplicates and gaps inside the
 * block) and b-006 (a stray non-zero on an unpinned row) were produced. That is
 * why `updateArticlePinOrder` and `toggleArticlePinnedOnArticlePage` are gone:
 * both wrote a single field with no view of the block.
 *
 * `compareArticlesForPublicOrder` in src/lib/articleRank.js has always modelled
 * this correctly — its comment on the `pinOrder` tier says so explicitly — which
 * is why the admin rank column showed the right answer while this file's prose
 * said the situation was impossible.
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

/**
 * The block, in the order the public list currently yields.
 *
 * Sorted with the SHIPPED comparator rather than by raw `pinOrder`, which is
 * what makes every planner below correct against UN-NORMALIZED data. A block
 * holding `1,1,2,3,…` has a tie the comparator resolves by `publishedAt`; a
 * naive `sort((a,b) => a.pinOrder - b.pinOrder)` would leave that tie to the
 * engine's whim and could reorder the public list while claiming to renumber it.
 */
function blockInOrder(articles) {
  const list = Array.isArray(articles) ? articles : [];
  return list.filter(isPositioned).sort(compareArticlesForPublicOrder);
}

/**
 * Renumber a sequence to contiguous 1..M, emitting a write ONLY for rows whose
 * value actually changes — the same minimal-write discipline planDemotion uses.
 * A no-op write is not harmless: it inflates `modifiedCount`, and it makes the
 * "did this actually move anything?" question unanswerable from the plan.
 */
function renumberWrites(ordered) {
  const writes = [];
  ordered.forEach((a, i) => {
    const want = i + 1;
    if (orderOf(a) !== want) writes.push({ _id: String(a._id), pinOrder: want });
  });
  return writes;
}

/**
 * Plan the writes that move `id` to position `target` within the block.
 *
 * This is the planner that makes duplicates and gaps UNREPRESENTABLE: it always
 * re-emits the block as contiguous 1..M, so there is no sequence of moves that
 * can produce the `1,1,2,3,4,5,6,7,9,10` state found in production. It replaces
 * the free `pinOrder` number input, which could write any integer to one row
 * while knowing nothing about the others.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 * Never emits `isPinnedOnArticlePage` or `showPinBadge`. Moving is not
 * promoting, demoting, or re-badging; a planner that quietly did two of those
 * at once is the shape of the bug being fixed here.
 *
 * ── TWO KINDS OF BAD INPUT, TWO DIFFERENT ANSWERS ───────────────────────────
 * `target` outside 1..M is CLAMPED. The UI bounds the control to the live block
 * size, so out-of-range means the caller and the block disagree — but this runs
 * in a click path, and clamping to the nearest real position is a better answer
 * for the admin than an exception. A non-finite `target` resolves to the
 * article's CURRENT position, i.e. a no-op, rather than to 1: silently moving an
 * article to the top because a select handed us `NaN` would be worse than doing
 * nothing.
 *
 * `id` not in the block THROWS. That is not user input under any UI — the
 * control only renders on rows that are already positioned — so it is a
 * programmer error, and swallowing it would return an empty plan that looks
 * exactly like a successful no-op move.
 *
 * @param {object[]} articles the FULL list; the block is derived from it
 * @param {string} id
 * @param {number} target 1-based position within the block
 * @returns {{kind: 'move', id: string, target: number, writes: {_id: string, pinOrder: number}[]}}
 */
export function planMoveToPosition(articles, id, target) {
  const block = blockInOrder(articles);
  const key = String(id);
  const from = block.findIndex((a) => String(a?._id) === key);

  if (from === -1) {
    const err = new Error(
      `planMoveToPosition: ${key} is not in the positioned block. Only a ` +
      'positioned article has a position to move; promote it first.'
    );
    err.name = 'NotInBlockError';
    throw err;
  }

  const M = block.length;

  // NOT `Number(target)`. `Number(null)`, `Number('')`, `Number([])` and
  // `Number(false)` are all 0 — finite, and therefore clamped to position 1. A
  // select that hands back `null` or an empty string (no choice made, control
  // cleared, value read before the option list rendered) would then silently
  // move the article to the TOP of the block. "No value" is not "position 0";
  // only an actual number, or a non-empty string that parses as one, is a
  // target. Everything else falls through to the no-op below.
  const wanted =
    typeof target === 'number' ? target
      : typeof target === 'string' && target.trim() !== '' ? Number(target)
        : NaN;

  const to = Number.isFinite(wanted)
    ? Math.min(Math.max(Math.trunc(wanted), 1), M) - 1
    : from; // unusable input → stay put, never "move to the top"

  const next = [...block];
  next.splice(from, 1);
  next.splice(to, 0, block[from]);

  return { kind: 'move', id: key, target: to + 1, writes: renumberWrites(next) };
}

/**
 * Plan the one-shot repair of BOTH positioning defects.
 *
 *   b-005 — the block renumbered to contiguous 1..M, in the order the cascade
 *           ALREADY produces, so the public list does not visibly change
 *   b-006 — `pinOrder: 0` forced onto every unpinned article carrying a stray
 *           non-zero value, which is what sinks a row below the entire unpinned
 *           mass (see the invariant note at the top of this file)
 *
 * Consumed by scripts/normalize-article-positions.mjs. It lives here, pure,
 * rather than inside the script, so the `pure` tier tests the REAL repair
 * instead of a reimplementation that could drift from it — the migration's
 * whole safety claim ("the visible order is unchanged") is a property of this
 * function, and a property nobody can test is a paragraph.
 *
 * Emits nothing for rows already correct, so a second run produces an empty
 * plan. That is the check the script uses to prove the invariant held.
 *
 * @param {object[]} articles the FULL list, pinned and unpinned
 * @returns {{kind: 'normalize', writes: {_id: string, pinOrder: number}[]}}
 */
export function planBlockNormalization(articles) {
  const list = Array.isArray(articles) ? articles : [];
  const writes = renumberWrites(blockInOrder(list));

  for (const a of list) {
    if (isPositioned(a)) continue;
    if (orderOf(a) === 0) continue;
    writes.push({ _id: String(a._id), pinOrder: 0 });
  }

  return { kind: 'normalize', writes };
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
