/**
 * Moving an article — one place, to the top of its block, or to a TYPED RANK.
 *
 * ── WHY THIS MODULE EXISTS AT ALL ───────────────────────────────────────────
 * The list is two tiers and always was: a pinned block ordered by `pinOrder`,
 * then everything else ordered by `sortKey`. Which FIELD decides the relative
 * order of two rows therefore depends on WHICH TWO ROWS. An arrow that always
 * wrote `sortKey` would be a lie on the five pinned rows — the cascade never
 * consults their key, so the number would change and the row would not move.
 * That is b-004's failure shape (the data changed, the words did not) with the
 * arrow pointing the other way.
 *
 * So this is the one module that knows the list has two tiers, and it exists so
 * that no UI has to. It answers one question — "what has to be written for this
 * row to move one place?" — and the answer is a plan from
 * src/lib/articlePositioning.js or from src/lib/articleSortKey.js depending on
 * the PAIR.
 *
 *   two unpinned rows  → sortKey   (midpoint between the true neighbours,
 *                                   escalating to a rebalance if exhausted)
 *   two pinned rows    → pinOrder  (the block re-emitted contiguous 1..M)
 *   one of each        → REFUSED   (see below)
 *
 * `planMoveToRank` (further down) answers the same question for a number the
 * admin TYPED rather than an arrow they clicked. It dispatches to the same two
 * sub-planners in the same way and adds no numbering rule of its own; what it
 * adds is the resolution of a RANK to a ROW, which is not arithmetic — see the
 * block comment above it.
 *
 * ── THE PIN BOUNDARY IS REFUSED, NOT SILENTLY IGNORED ───────────────────────
 * Moving the last pinned row down, or the first unpinned row up, does not mean
 * "swap with that row" — it means "leave the pinned block" or "join it". That is
 * a different act with different consequences (it changes what the pin badge
 * does, and it renumbers the block), and it belongs to the pin toggle. The
 * planner returns a `pin-boundary` refusal with the reason attached, the UI
 * disables that one arrow and says why, and the server refuses it too. One
 * function decides both, so the button cannot offer something the action would
 * reject.
 *
 * ── EVERYTHING IS PLANNED AGAINST TRUE NEIGHBOURS ───────────────────────────
 * The neighbour comes from the FULL collection in cascade order — never from the
 * caller's rows. The admin list has a client-side pager and a search box, so the
 * row visually above another on screen is frequently not its neighbour in the
 * collection at all. A move planned against what the screen shows would reorder
 * the list against a filtered view, and the result would look wrong to the next
 * person to clear the search box.
 *
 * Pure — no next/*, no db, no models — so the `pure` tier runs the real planner,
 * the server calls it from a fresh read, and the client calls
 * `describeAllOrderControls` over the rows it already holds to decide what to
 * grey out. That last part is DISPLAY ONLY: the server re-plans from its own read and
 * its refusal, not the button's disabled attribute, is what enforces anything.
 */

import { assignArticleRanks, compareArticlesForPublicOrder } from '@/lib/articleRank';
import { isPositioned, planMoveToPosition } from '@/lib/articlePositioning';
import { nextSortKeyForNew, planSortKeyMove, sortKeyOf } from '@/lib/articleSortKey';

/** Why a step cannot happen. `null` means it can. */
export const STEP_REFUSALS = Object.freeze({
  LIST_END: 'list-end',           // already the first or last row of the collection
  PIN_BOUNDARY: 'pin-boundary',   // the neighbour is on the other side of the pin block
  STRAY_PIN_ORDER: 'stray-pin-order', // b-006: an unpinned row carrying a non-zero pinOrder
  ALREADY_TOP: 'already-top',     // already at the top of its own block
});

/**
 * Why a TYPED rank cannot be honoured. `null` means it can.
 *
 * Two of these four reuse `STEP_REFUSALS` codes deliberately: they are the same
 * two facts about the collection, reached by a different gesture, and the day
 * they are spelled differently is the day the arrow and the input start
 * explaining the same situation in two ways.
 */
export const RANK_REFUSALS = Object.freeze({
  NOT_RANKED: 'not-ranked',       // the SUBJECT is inactive, so it holds no rank at all
  NO_SUCH_RANK: 'no-such-rank',   // no active row holds that number — includes out of range
  PIN_BOUNDARY: STEP_REFUSALS.PIN_BOUNDARY,
  STRAY_PIN_ORDER: STEP_REFUSALS.STRAY_PIN_ORDER,
});

const idOf = (a) => String(a?._id);
const orderOf = (a) => (Number.isFinite(Number(a?.pinOrder)) ? Number(a.pinOrder) : 0);

function notInList(key) {
  const err = new Error(
    `articleOrdering: ${key} is not in the supplied list. Ordering is planned ` +
    'against the WHOLE collection — a filtered or paged view is not enough.'
  );
  err.name = 'NotInListError';
  return err;
}

/** The collection in the order the list renders it. Does not mutate the input. */
export function orderedForDisplay(articles) {
  return (Array.isArray(articles) ? [...articles] : []).sort(compareArticlesForPublicOrder);
}

const refuse = (id, reason) => ({ kind: 'noop', id: String(id), reason, tier: null, writes: [] });

/**
 * CAN this step happen, and if so in which tier? No plan built.
 *
 * ── WHY THIS IS SPLIT OUT OF planOrderStep ──────────────────────────────────
 * Two callers need two different amounts of work from the same decision. A click
 * needs the whole plan. The admin list needs only "is this arrow live?", for
 * three controls on each of 486 rows — and building 1,458 plans to answer that
 * measured 244 ms in a useMemo that reruns after every click.
 *
 * The refusal logic lives HERE, once, and both paths go through it. That is the
 * property that mattered: an availability check written separately from the
 * planner would eventually disagree with it, and the symptom is a live-looking
 * button that silently does nothing.
 *
 * A resolved (non-refused) step always produces at least one write — both
 * sub-planners are given a target that differs from the current position — so
 * "not refused" and "would write something" are the same statement, and the UI
 * does not need the plan to know the button is live.
 *
 * @param {object[]} order the collection ALREADY in display order
 */
function resolveStep(order, key, delta) {
  const from = order.findIndex((a) => idOf(a) === key);
  if (from === -1) throw notInList(key);

  const to = from + delta;
  if (to < 0 || to >= order.length) return { from, to, refusal: STEP_REFUSALS.LIST_END };

  const row = order[from];
  const neighbour = order[to];

  // The pin boundary. Crossing it is the toggle's job, not an arrow's.
  if (isPositioned(row) !== isPositioned(neighbour)) {
    return { from, to, row, refusal: STEP_REFUSALS.PIN_BOUNDARY };
  }

  // Both unpinned — so `sortKey` decides them, UNLESS one is carrying a stray
  // non-zero `pinOrder`. That is b-006, and it matters here rather than being a
  // theoretical nicety: `pinOrder` is the SECOND cascade key and applies to
  // every document, so while the two disagree on it no `sortKey` this planner
  // could write would move the row past its neighbour. Writing one anyway is
  // precisely the "the number changed and nothing moved" failure this module
  // exists to prevent, so it is refused and named. Repair with
  // `npm run normalize:positions`.
  if (!isPositioned(row) && orderOf(row) !== orderOf(neighbour)) {
    return { from, to, row, refusal: STEP_REFUSALS.STRAY_PIN_ORDER };
  }

  return { from, to, row, refusal: null, tier: isPositioned(row) ? 'pinOrder' : 'sortKey' };
}

/**
 * Plan the writes that move `id` one place up or down.
 *
 * @param {object[]} articles the FULL collection
 * @param {string} id
 * @param {'up'|'down'} direction
 * @returns {{kind: string, id: string, tier: 'pinOrder'|'sortKey'|null, reason?: string, writes: object[]}}
 */
export function planOrderStep(articles, id, direction) {
  const delta = direction === 'up' ? -1 : direction === 'down' ? 1 : null;
  if (delta === null) {
    throw new Error(`planOrderStep: unknown direction ${JSON.stringify(direction)} — expected 'up' or 'down'`);
  }

  const list = Array.isArray(articles) ? articles : [];
  const key = String(id);
  const step = resolveStep(orderedForDisplay(list), key, delta);
  if (step.refusal) return refuse(key, step.refusal);

  if (step.tier === 'pinOrder') {
    // Pinned rows occupy the FIRST M slots of the cascade order —
    // `isPinnedOnArticlePage: -1` is the first key — so the display index and
    // the block position are the same number, and planMoveToPosition can be
    // handed the target directly. It re-emits the block as contiguous 1..M,
    // which is what keeps duplicates and gaps (b-005) unrepresentable.
    return { ...planMoveToPosition(list, key, step.to + 1), tier: 'pinOrder' };
  }

  // Planned within the UNPINNED SUBSET, whose sortKey order is exactly the
  // cascade order restricted to those rows (the two tiers above tie across all
  // of them, which the stray-pinOrder check is what guarantees). Handing the
  // full list to planSortKeyMove instead would let a pinned row's key — which
  // decides nothing — become a midpoint neighbour.
  const unpinned = list.filter((a) => !isPositioned(a));
  const subFrom = orderedForDisplay(unpinned).findIndex((a) => idOf(a) === key);
  return { ...planSortKeyMove(unpinned, key, subFrom + 1 + delta), tier: 'sortKey' };
}

/**
 * Plan the writes that move `id` to the top of ITS OWN block.
 *
 * A pinned row goes to `pinOrder` 1 — the top of the pinned block. An unpinned
 * row goes to `max + GAP` — the top of the NORMAL ordering, which is not the top
 * of the page: the pinned block still sits above it. The UI copy has to say so,
 * and it does; promising position 1 and delivering position 6 is the kind of
 * small lie that costs more trust than the feature is worth.
 *
 * `max` is taken over the WHOLE collection rather than over the unpinned rows
 * alone, so the new key also outranks every pinned article's key. That matters
 * later, not now: the day one of those is unpinned it rejoins the normal
 * ordering by `sortKey`, and it should not land above a row someone deliberately
 * sent to the top.
 */
export function planMoveToBlockTop(articles, id) {
  const list = Array.isArray(articles) ? articles : [];
  const key = String(id);
  const order = orderedForDisplay(list);
  const row = order.find((a) => idOf(a) === key);
  if (!row) throw notInList(key);

  if (isPositioned(row)) {
    return { ...planMoveToPosition(list, key, 1), kind: 'top', tier: 'pinOrder' };
  }

  const unpinned = order.filter((a) => !isPositioned(a));
  if (idOf(unpinned[0]) === key) {
    // Already there. An unconditional write would inflate modifiedCount and make
    // "did this move anything?" unanswerable from the plan — the same
    // minimal-write discipline every planner in this codebase keeps.
    return { kind: 'top', id: key, tier: 'sortKey', reason: STEP_REFUSALS.ALREADY_TOP, writes: [] };
  }
  return {
    kind: 'top',
    id: key,
    tier: 'sortKey',
    writes: [{ _id: key, sortKey: nextSortKeyForNew(list) }],
  };
}

// ── MOVING TO A TYPED RANK ──────────────────────────────────────────────────
//
// ── THE NUMBER THE ADMIN TYPES IS A RANK, AND A RANK IS NOT AN INDEX ────────
// The list's first column shows the output of `assignArticleRanks`, which
// numbers ACTIVE articles only: an inactive row sits in the ordering (it still
// has a `sortKey`, it still occupies a slot in the cascade) but holds NO rank.
// So with one inactive article anywhere above, rank 40 is index 41, and with
// nine it is index 49.
//
// Everything below therefore resolves the typed number to the ANCHOR ROW that
// currently holds it, and then plans a move to THAT ROW'S index inside its own
// tier. Nothing converts a rank to an index by arithmetic. The arithmetic
// version is not a near miss — it silently lands the article somewhere other
// than where the admin typed, and nothing errors, which is precisely the
// "the number changed and nothing moved" failure this module exists to prevent.
//
// ── OUT OF RANGE REFUSES, IT DOES NOT CLAMP ─────────────────────────────────
// `planMoveToPosition` and `planSortKeyMove` both CLAMP, and they are right to:
// they serve a CLICK, where the UI bounded the control and an out-of-range
// target means the caller and the collection disagree — the nearest real
// position beats an exception. A typed number is not a click. It is a CLAIM
// about where the article should end up, and honouring "put this at 900" by
// quietly putting it at 486 is the same lie in a smaller font. So this planner
// refuses and says why, and the input says the same thing before the admin
// presses Enter — one function decides both, so a live-looking input cannot
// offer a number the action would reject.
//
// ── WHAT IS NOT WRITTEN HERE ────────────────────────────────────────────────
// No numbering rule. The pinned tier goes through `planMoveToPosition` (which
// re-emits the block contiguous 1..M) and the unpinned tier through
// `planSortKeyMove` (midpoint, escalating to a rebalance) — the same two
// planners `planOrderStep` dispatches to, chosen the same way, for the same
// reason: which FIELD expresses a move depends on WHICH TWO ROWS.

/**
 * Ranks, resolved both ways, from the SHIPPED ranker.
 *
 * `assignArticleRanks` is called rather than re-derived. It is the function the
 * admin column renders, so a second implementation here would be a second
 * answer to "what number is this row showing", and the two would disagree the
 * first time the cascade changed — with the symptom being an input that moves
 * articles to the wrong place while every test on the ranker stays green.
 */
function rankIndex(list) {
  const byRank = [];
  const rankOf = new Map();
  for (const a of assignArticleRanks(list)) {
    if (a?.rank == null) continue;
    byRank[a.rank - 1] = a;
    rankOf.set(idOf(a), a.rank);
  }
  return { byRank, rankOf };
}

/** Thai copy for one refusal. The client and the server both read this. */
function rankRefusalMessage(refusal, { target, max, pinnedRanks, subjectPinned }) {
  if (refusal === RANK_REFUSALS.NOT_RANKED) {
    return 'บทความนี้ยังไม่เผยแพร่ จึงไม่มีลำดับบนหน้า /articles — เปิดใช้งานก่อนจึงจะระบุลำดับได้';
  }
  if (refusal === RANK_REFUSALS.NO_SUCH_RANK) {
    return `ไม่มีบทความที่อยู่ลำดับ ${target} — ระบุได้ตั้งแต่ 1 ถึง ${max} เท่านั้น`;
  }
  if (refusal === RANK_REFUSALS.PIN_BOUNDARY) {
    // Say WHICH numbers are spoken for and WHERE the act lives. "ย้ายไม่ได้"
    // on its own is a dead end: the admin typed a number the list is showing,
    // so being told it does not work without being told why reads as a bug.
    return subjectPinned
      ? `ลำดับ 1 ถึง ${pinnedRanks} เป็นของกลุ่มปักหมุด และบทความนี้อยู่ในกลุ่มนั้น ` +
        `จึงย้ายออกไปลำดับ ${target} ไม่ได้ — ถ้าต้องการออกจากกลุ่ม ให้เลิกปักหมุดที่หน้าแก้ไขบทความ`
      : `ลำดับ 1 ถึง ${pinnedRanks} เป็นของกลุ่มปักหมุด และบทความนี้ไม่ได้ปักหมุด ` +
        `จึงย้ายเข้าไปลำดับ ${target} ไม่ได้ — ถ้าต้องการให้อยู่ในกลุ่มนั้น ให้ปักหมุดที่หน้าแก้ไขบทความ`;
  }
  if (refusal === RANK_REFUSALS.STRAY_PIN_ORDER) {
    return 'บทความนี้มีลำดับปักหมุดค้างอยู่ทั้งที่ไม่ได้ปักหมุด จึงเลื่อนไม่ได้ — รัน normalize:positions เพื่อซ่อม';
  }
  return null;
}

/**
 * What typing `target` into this row's rank box means — WITHOUT planning it.
 *
 * THE SINGLE SOURCE FOR BOTH SIDES. The admin list renders the amber warning
 * from this, and the server action refuses from this. A second condition
 * written in the client would eventually disagree with the action, and the
 * symptom is the one this whole module exists to remove: a control that looks
 * live and silently does nothing (or, worse, quietly does something else).
 *
 * ── BAD INPUT IS TYPE-AWARE, AND THE REASON IS NOT THEORETICAL ──────────────
 * Copied from `planSortKeyMove` / `planMoveToPosition`, which learned it the
 * hard way: `Number(null)`, `Number('')`, `Number([])` and `Number(false)` are
 * ALL 0 — finite — so a coercive `Number.isFinite(Number(target))` guard treats
 * an emptied input as "position 0", clamps it to 1, and promotes the article to
 * the top of the list because someone selected the text and pressed Delete.
 * `null` / `''` / `[]` / `false` / `NaN` / `±Infinity` therefore resolve to the
 * article's CURRENT rank, i.e. a no-op. NEVER to 1.
 *
 * `max` and `pinnedRanks` count ACTIVE rows only, because ranks do: a pinned
 * article that is switched off holds no rank, so the pinned block occupies
 * ranks 1..(active pinned), not 1..(pinned).
 *
 * @param {object[]} articles the FULL collection
 * @param {string} id
 * @param {number|string} target the rank the admin typed
 * @returns {{rank: number|null, min: number, max: number, pinnedRanks: number,
 *            target: number|null, anchorId: string|null,
 *            tier: 'pinOrder'|'sortKey'|null, refusal: string|null,
 *            message: string|null, noop: boolean}}
 */
export function describeRankTarget(articles, id, target) {
  const list = Array.isArray(articles) ? articles : [];
  const key = String(id);
  const subject = list.find((a) => idOf(a) === key);
  if (!subject) throw notInList(key);

  const { byRank, rankOf } = rankIndex(list);
  const max = byRank.length;
  const pinnedRanks = byRank.filter(isPositioned).length;
  const rank = rankOf.get(key) ?? null;

  const base = {
    rank, min: max === 0 ? 0 : 1, max, pinnedRanks,
    target: null, anchorId: null, tier: null, refusal: null, message: null, noop: false,
  };

  const say = (refusal, extra = {}) => ({
    ...base, ...extra, refusal,
    message: rankRefusalMessage(refusal, {
      target: extra.target ?? base.target,
      max, pinnedRanks, subjectPinned: isPositioned(subject),
    }),
  });

  // The subject itself has no position to change. Checked BEFORE the target is
  // parsed: "move an unranked row to rank 4" is not a bad number, it is a row
  // that is not in the numbering at all, and reporting it as a bad number would
  // send the admin looking at the wrong end of the problem.
  if (rank === null) return say(RANK_REFUSALS.NOT_RANKED);

  const wanted =
    typeof target === 'number' ? target
      : typeof target === 'string' && target.trim() !== '' ? Number(target)
        : NaN;
  // Unusable input → the current rank, i.e. nothing happens. See the note above.
  const want = Number.isFinite(wanted) ? Math.trunc(wanted) : rank;

  if (want < 1 || want > max) return say(RANK_REFUSALS.NO_SUCH_RANK, { target: want });

  const anchor = byRank[want - 1];
  const anchorId = idOf(anchor);
  if (anchorId === key) {
    // Already there. Not a refusal and not an error — the input simply agrees
    // with the list. An unconditional write here would inflate modifiedCount
    // and make "did this move anything?" unanswerable from the plan, the same
    // minimal-write discipline every planner in this codebase keeps.
    return { ...base, target: want, anchorId, noop: true, tier: isPositioned(subject) ? 'pinOrder' : 'sortKey' };
  }

  // THE PIN BOUNDARY, reached by typing rather than by clicking. This is the
  // "typed a number that collides with the pinned group" case: ranks 1..P are
  // the pinned block, and moving in or out of it is not a reordering, it is
  // pinning — a different act, with different consequences, that belongs to the
  // toggle on the edit screen.
  if (isPositioned(subject) !== isPositioned(anchor)) {
    return say(RANK_REFUSALS.PIN_BOUNDARY, { target: want, anchorId });
  }

  // b-006, same rule as resolveStep: `pinOrder` is the SECOND cascade key and
  // applies to EVERY document, so while these two disagree on it no `sortKey`
  // this planner could write would move one past the other.
  if (!isPositioned(subject) && orderOf(subject) !== orderOf(anchor)) {
    return say(RANK_REFUSALS.STRAY_PIN_ORDER, { target: want, anchorId });
  }

  return {
    ...base,
    target: want,
    anchorId,
    tier: isPositioned(subject) ? 'pinOrder' : 'sortKey',
  };
}

/**
 * Plan the writes that move `id` to the rank the admin typed.
 *
 * Reuses `planMoveToPosition` for the pinned tier and `planSortKeyMove` over
 * the UNPINNED SUBSET for the other, exactly as `planOrderStep` dispatches.
 * Nothing new is invented about numbering.
 *
 * Return shapes, and the distinction matters to the caller:
 *   refused          `{kind:'noop', reason, message, writes: []}` — nothing happened
 *   already correct  `{kind:'move', reason: null, writes: []}` — nothing NEEDED to
 *   moved            whatever the sub-planner returns (`move` or `rebalance`)
 *
 * So a caller decides on `plan.reason`, not on `plan.kind`: an empty plan with
 * no reason is a success, and reporting it as a failure would tell the admin
 * their correct number was rejected.
 *
 * A REFUSAL CARRIES ITS OWN SENTENCE. The server action returns `plan.message`
 * verbatim rather than calling `describeRankTarget` a second time to ask what to
 * say — one call, one answer, and no chance of the refusal being explained by a
 * different evaluation than the one that produced it.
 *
 * @param {object[]} articles the FULL collection
 * @param {string} id
 * @param {number|string} target the RANK (not the index) to move to
 */
export function planMoveToRank(articles, id, target) {
  const list = Array.isArray(articles) ? articles : [];
  const key = String(id);
  const wanted = describeRankTarget(list, key, target);

  if (wanted.refusal) return { ...refuse(key, wanted.refusal), message: wanted.message };
  if (wanted.noop) return { kind: 'move', id: key, target: wanted.target, tier: wanted.tier, writes: [] };

  if (wanted.tier === 'pinOrder') {
    // The anchor's position INSIDE THE BLOCK, computed over the pinned rows
    // rather than read off the full display index. `planOrderStep` may lean on
    // pinned rows occupying the first M slots of the cascade; this does not
    // need to, and the explicit form costs one filter and removes a premise.
    const block = orderedForDisplay(list).filter(isPositioned);
    const at = block.findIndex((a) => idOf(a) === wanted.anchorId);
    return { ...planMoveToPosition(list, key, at + 1), tier: 'pinOrder' };
  }

  // Planned within the UNPINNED SUBSET, whose sortKey order is the cascade
  // order restricted to those rows — which is what the stray-pinOrder refusal
  // above guarantees for this pair. Handing the full list to planSortKeyMove
  // would let a pinned row's key, which decides nothing, become a neighbour.
  const unpinned = list.filter((a) => !isPositioned(a));
  const at = orderedForDisplay(unpinned).findIndex((a) => idOf(a) === wanted.anchorId);
  return { ...planSortKeyMove(unpinned, key, at + 1), tier: 'sortKey' };
}

/**
 * What the three controls should look like for one row.
 *
 * DERIVED FROM THE PLANNERS THEMSELVES, never from a parallel set of conditions.
 * If the button's disabled state and the action's refusal were computed
 * separately they would disagree eventually, and the visible symptom would be a
 * live-looking button that silently does nothing — which is the entire class of
 * defect this rework is closing.
 *
 * @returns {{position: number, pinned: boolean, pinnedCount: number,
 *            up: {enabled: boolean, reason: string|null},
 *            down: {enabled: boolean, reason: string|null},
 *            top: {enabled: boolean, reason: string|null}}}
 */
function describeFromOrder(order, key, pinnedCount, firstUnpinned) {
  const at = order.findIndex((a) => idOf(a) === key);
  if (at === -1) throw notInList(key);
  const pinned = isPositioned(order[at]);

  const step = (delta) => {
    const { refusal } = resolveStep(order, key, delta);
    return { enabled: refusal === null, reason: refusal };
  };
  // "Already at the top of its own group": index 0 for a pinned row, the first
  // unpinned index for everything else. The same statement planMoveToBlockTop
  // makes by returning no writes.
  const atGroupTop = pinned ? at === 0 : at === firstUnpinned;

  return {
    position: at + 1,
    pinned,
    pinnedCount,
    up: step(-1),
    down: step(1),
    top: { enabled: !atGroupTop, reason: atGroupTop ? STEP_REFUSALS.ALREADY_TOP : null },
  };
}

/** One row's controls. Sorts the collection; prefer the bulk form for a list. */
export function describeOrderControls(articles, id) {
  const order = orderedForDisplay(Array.isArray(articles) ? articles : []);
  return describeFromOrder(
    order, String(id),
    order.filter(isPositioned).length,
    order.findIndex((a) => !isPositioned(a)),
  );
}

/**
 * Every row's controls, sorting ONCE.
 *
 * The admin list needs this for all 486 rows on every change to `rows`. Calling
 * the single-row form in a loop sorts the collection once per row per control —
 * measured at 244 ms, inside a useMemo that reruns after every click. This sorts
 * once and resolves each row against that one ordering.
 *
 * @returns {Map<string, object>} id → the same shape describeOrderControls returns
 */
export function describeAllOrderControls(articles) {
  const order = orderedForDisplay(Array.isArray(articles) ? articles : []);
  const pinnedCount = order.filter(isPositioned).length;
  const firstUnpinned = order.findIndex((a) => !isPositioned(a));

  const out = new Map();
  for (const a of order) {
    const key = idOf(a);
    out.set(key, describeFromOrder(order, key, pinnedCount, firstUnpinned));
  }
  return out;
}

/** Re-exported so a caller reasoning about keys does not need a third import. */
export { sortKeyOf };
