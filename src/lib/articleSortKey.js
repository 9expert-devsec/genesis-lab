/**
 * Article sort keys — one number per article, spaced, descending.
 *
 * Every article carries its own `sortKey`, so ordering an article no longer
 * means switching "จัดตำแหน่ง" on for its row first. Higher key = higher on the
 * page.
 *
 * LIVE SINCE ROUND 2: the cascade in src/lib/actions/articles.js sorts by
 * `sortKey`, ARTICLE_ORDER_INDEX serves it, and the admin list moves rows with
 * it. Round 1 shipped this module, the schema field and the backfill first, so
 * that every row already held a value before anything read one — `getArticles`
 * reads with `.lean()` (no Mongoose defaults) and then JSON round-trips through
 * `serialize` (which drops undefined keys), so a schema default does NOT reach a
 * pre-existing document. Had the cascade switched first, all 486 articles would
 * have sorted as if they had no key at all.
 *
 * The CROSS-TIER question — "which field moves this row one place?" — is not
 * here. It is in src/lib/articleOrdering.js, because the answer depends on
 * whether the pair being swapped is pinned.
 *
 * ── WHY A SIBLING MODULE AND NOT MORE OF articlePositioning.js ──────────────
 * The two files encode OPPOSITE disciplines over the same collection, and that
 * is the whole reason to keep them apart:
 *
 *   articlePositioning.js  the pinned BLOCK. `pinOrder` must be CONTIGUOUS
 *                          1..M with no gaps — a gap inflates the maximum and
 *                          every later promotion drifts upward (b-005).
 *   this file              the WHOLE collection. `sortKey` must be SPACED —
 *                          a contiguous 1..485 makes every insert-at-top a
 *                          485-row write.
 *
 * `renumberWrites` over there and `assignSortKeysFromOrder` here look like the
 * same function and are each wrong in the other's file. Putting them side by
 * side would invite exactly one reuse of the wrong one, and it would fail
 * quietly: contiguous sortKeys still sort correctly, right up until the first
 * insertion between two neighbours has nowhere to go. Different invariants,
 * different files. (articlePositioning.js is also already ~320 lines carrying
 * two bug post-mortems in its docstring, which is a second, weaker reason.)
 *
 * Plans use the SAME shape as that module — `{kind, writes: [{_id, …fields}]}` —
 * so `applyPositionPlan` replays either one. That is deliberate reuse of a
 * generic replayer, not a dependency: nothing here imports it.
 *
 * Dependency-free apart from the shipped comparator (no next/*, no db, no
 * models) so it runs in the `pure` tier, on the server, and in the admin client.
 */

import { compareArticlesByDate, compareBySortKeyDesc, sortKeyOf } from '@/lib/articleRank';

/**
 * Re-exported from articleRank.js, which is where they have to LIVE.
 *
 * Both belong to this module by subject and both started here. They moved when
 * the cascade adopted `sortKey`: `compareArticlesForPublicOrder` needs them, and
 * this module already imports `compareArticlesByDate` from that file, so keeping
 * them here would have made a cycle. The alternative — a second copy in each
 * module — is the failure this repo keeps paying for. Re-exporting means callers
 * can still ask the module that owns the concept, with one implementation behind
 * it.
 */
export { compareBySortKeyDesc, sortKeyOf };

/**
 * The space left between two neighbouring articles.
 *
 * ── WHY A GAP AT ALL, AND WHY THIS SIZE ─────────────────────────────────────
 * Contiguous ranks (1..485, the shape `pinOrder` uses inside its block) make
 * every insert-at-top a 485-row write: put an article first and every other
 * article's number is now wrong. With a gap the same operation is ONE row:
 *
 *   new article                   → max + GAP
 *   between two neighbours        → the midpoint of their keys
 *   gap exhausted between a pair  → a REBALANCE plan for the affected span
 *
 * 1000 gives ~10 successive halvings between any adjacent pair (1000 → 500 →
 * 250 → … → 1) before the midpoint is exhausted, which is far more repositioning
 * than one region of a 485-article list will ever see between rebalances, while
 * keeping the whole collection inside 485,000 — a number a human can read in
 * Compass and reason about. It is a constant rather than a literal because the
 * backfill, the create path and the rebalancer must all agree on it; two of them
 * agreeing and one drifting is how a "spaced" scheme silently becomes a dense
 * one.
 *
 * Exhaustion is DETECTED (see `midpointSortKey`), never rounded away, because
 * the alternative is two articles holding one key — at which point the tie falls
 * through to the date order and the position the admin chose stops deciding
 * anything, with no error. That is b-005's failure mode wearing a new field.
 */
export const SORT_KEY_GAP = 1000;

/** The collection in sortKey order, highest first. Does not mutate the input. */
export function sortedBySortKey(articles) {
  return (Array.isArray(articles) ? [...articles] : []).sort(compareBySortKeyDesc);
}

/**
 * Plan the backfill: give every article the key its CURRENT position earns.
 *
 * Ordered by `compareArticlesByDate` — publishedAt desc, createdAt desc, _id —
 * for ALL articles, PINNED INCLUDED. A pinned article gets the key its date
 * earns, not one that floats it to the top, because `sortKey` means "where this
 * sits in the normal ordering": unpinning it later must return it to a sensible
 * place rather than stranding it at the head of the list. Nothing a reader sees
 * moves either way — for a pinned row the first two cascade keys decide before
 * `sortKey` is ever consulted.
 *
 * The comparator MUST be total or this is not deterministic; see the note on
 * `compareArticlesByDate`. `publishedAt` ties are the normal case here, not an
 * edge one.
 *
 * EMITS A WRITE FOR EVERY ROW, unlike the minimal-write planners in
 * articlePositioning.js. This is a backfill: "485 of 485 carry a value" is the
 * thing being established, and a row skipped because its key happens to be right
 * is indistinguishable from a row the planner forgot.
 *
 * @param {object[]} articles the FULL collection
 * @returns {{kind:'assign', writes: {_id: string, sortKey: number}[]}}
 */
export function assignSortKeysFromOrder(articles) {
  const ordered = (Array.isArray(articles) ? [...articles] : []).sort(compareArticlesByDate);
  const n = ordered.length;
  return {
    kind: 'assign',
    writes: ordered.map((a, i) => ({
      _id: String(a?._id),
      sortKey: (n - i) * SORT_KEY_GAP,
    })),
  };
}

/**
 * The key for a newly created article: the TOP of the list.
 *
 * `max + GAP`, regardless of `publishedAt`. Backdating the publish date must not
 * bury a new article — "I wrote it and I can't find it" is the worst outcome
 * this ordering can produce, and dragging it down afterwards is one action away.
 *
 * Derived from the highest EXISTING key rather than from the count, for the same
 * reason `planPromotion` uses max+1: the stored values are spaced and need not
 * be a function of the row count, and only max+GAP is guaranteed to sort above
 * every current member. Measured over the whole collection including inactive
 * articles, so reactivating one cannot collide.
 *
 * An empty collection — and, transiently, a collection where nothing has been
 * backfilled yet — starts at GAP rather than 0, keeping every key positive.
 */
export function nextSortKeyForNew(articles) {
  const keys = (Array.isArray(articles) ? articles : [])
    .map(sortKeyOf)
    .filter((k) => k !== null);
  if (keys.length === 0) return SORT_KEY_GAP;
  return Math.max(...keys) + SORT_KEY_GAP;
}

/**
 * The key strictly between two neighbours, or `null` when the gap is exhausted.
 *
 * `null` is the whole point of this function. Rounding to a neighbour's value
 * would put two articles on one key, and a tie falls through to the date order —
 * so the position the admin just chose would silently stop deciding anything,
 * with no error raised. Detecting exhaustion is what lets the caller escalate to
 * a rebalance instead.
 *
 * @param {number} above the higher key (nearer the top of the page)
 * @param {number} below the lower key
 */
export function midpointSortKey(above, below) {
  const hi = Number(above);
  const lo = Number(below);
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  if (hi - lo < 2) return null; // no integer strictly between — equal, adjacent, or inverted
  return Math.floor((hi + lo) / 2);
}

/** Named error for an id the planner cannot find. */
function notInList(key) {
  const err = new Error(
    `planSortKeyMove: ${key} is not in the supplied list. The planner needs the ` +
    'WHOLE collection to pick neighbours; a filtered page is not enough.'
  );
  err.name = 'NotInListError';
  return err;
}

/**
 * Re-space a contiguous span so the arrangement `next` becomes representable.
 *
 * Called only when the midpoint between two neighbours is exhausted. The span
 * starts at the insertion point and grows OUTWARD, alternating down and up, so
 * a collision near the top does not rewrite the bottom of the list and vice
 * versa. It stops as soon as the two rows bracketing the span leave room for one
 * distinct integer per row inside it.
 *
 * Termination: reaching index 0 gives an UNBOUNDED ceiling (there is nothing
 * above the first row), at which point the span is simply re-spaced at GAP above
 * whatever sits below it — so the loop always ends, at worst having re-spaced
 * the whole list.
 *
 * Minimal writes: a row whose key does not actually change is not emitted, the
 * same discipline as articlePositioning.js. A no-op write inflates
 * `modifiedCount` and makes "did this move anything?" unanswerable from the plan.
 */
function planRebalanceAround(next, at) {
  const n = next.length;
  let lo = at;
  let hi = at;
  let expandDown = true;

  let floorKey;
  let ceilKey;
  for (;;) {
    const count = hi - lo + 1;
    floorKey = hi < n - 1 ? sortKeyOf(next[hi + 1]) : 0;
    ceilKey = lo > 0 ? sortKeyOf(next[lo - 1]) : floorKey + (count + 1) * SORT_KEY_GAP;
    if (ceilKey - floorKey >= count + 1) break;

    if (expandDown && hi < n - 1) hi += 1;
    else if (lo > 0) lo -= 1;
    else hi += 1;
    expandDown = !expandDown;
  }

  const count = hi - lo + 1;
  const step = Math.floor((ceilKey - floorKey) / (count + 1));
  const writes = [];
  for (let i = 0; i < count; i += 1) {
    const row = next[lo + i];
    const sortKey = ceilKey - step * (i + 1);
    if (sortKeyOf(row) !== sortKey) writes.push({ _id: String(row?._id), sortKey });
  }
  return { span: { from: lo + 1, to: hi + 1 }, writes };
}

/**
 * Plan the writes that move `id` to position `target` in the sortKey ordering.
 *
 * ONE ROW, normally: the article takes the midpoint of its new neighbours and
 * nobody else is touched. When that midpoint is exhausted the plan comes back as
 * `kind: 'rebalance'` with the affected span re-spaced — reported rather than
 * hidden, because a caller that logs "moved 1 row" when 40 changed has an audit
 * trail that lies.
 *
 * Edges: moving to the TOP takes `below + GAP` (there is no ceiling, so this can
 * never exhaust). Moving to the BOTTOM takes the midpoint between the last key
 * and an implicit floor of 0, which CAN exhaust — that is what keeps every key
 * positive instead of letting the tail march into negative numbers.
 *
 * ── BAD INPUT, TWO DIFFERENT ANSWERS (inherited from planMoveToPosition) ────
 * `target` outside 1..N is CLAMPED: this runs in a click path and the nearest
 * real position beats an exception. An UNUSABLE target — `null`, `''`, `[]`,
 * `false`, `NaN`, `±Infinity` — resolves to the article's CURRENT position, i.e.
 * a no-op. NOT to 1. `Number(null)`, `Number('')`, `Number([])` and
 * `Number(false)` are all 0, so a coercive `Number.isFinite(Number(target))`
 * guard clamps every one of them to the top and silently promotes an article
 * because a select handed back an empty string. The parse below is type-aware
 * for that reason.
 *
 * An `id` that is not in the list THROWS `NotInListError` — no UI can produce
 * it, and an empty plan would look exactly like a successful no-op move.
 *
 * @param {object[]} articles the FULL collection
 * @param {string} id
 * @param {number} target 1-based position in the sortKey ordering
 */
export function planSortKeyMove(articles, id, target) {
  const order = sortedBySortKey(articles);
  const key = String(id);
  const from = order.findIndex((a) => String(a?._id) === key);
  if (from === -1) throw notInList(key);

  const n = order.length;
  const wanted =
    typeof target === 'number' ? target
      : typeof target === 'string' && target.trim() !== '' ? Number(target)
        : NaN;
  const to = Number.isFinite(wanted)
    ? Math.min(Math.max(Math.trunc(wanted), 1), n) - 1
    : from; // unusable input → stay put, never "move to the top"

  if (to === from) return { kind: 'move', id: key, target: to + 1, writes: [] };

  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, order[from]);

  const above = to > 0 ? sortKeyOf(next[to - 1]) : null;
  const below = to < n - 1 ? sortKeyOf(next[to + 1]) : null;

  const wantKey =
    above === null ? (below ?? 0) + SORT_KEY_GAP   // to the top: no ceiling
      : midpointSortKey(above, below === null ? 0 : below);

  if (wantKey !== null) {
    return {
      kind: 'move',
      id: key,
      target: to + 1,
      writes: [{ _id: key, sortKey: wantKey }],
    };
  }

  const { span, writes } = planRebalanceAround(next, to);
  return { kind: 'rebalance', id: key, target: to + 1, span, writes };
}
