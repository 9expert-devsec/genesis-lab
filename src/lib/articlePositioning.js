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

// ── THE PINNED BLOCK IS CAPPED ──────────────────────────────────────────────
//
// ── WHAT THE CAP DOES, AND THE THREE THINGS IT DELIBERATELY DOES NOT DO ─────
// It REFUSES NEW PINS. That is the whole of it. It never demotes, never
// renumbers, and never fires on an article that is already in the block.
//
// An OVER-CAP BLOCK IS A LEGAL STATE, not corruption, and this is the
// distinction the rest of this file makes it easy to get wrong. b-005
// (duplicate pinOrder) and b-006 (a stray non-zero on an unpinned row) are
// states the MODEL cannot express correctly — the number stops deciding the
// position, silently — so the planners repair them by construction. A block of
// eleven under a cap of five expresses itself perfectly: eleven articles are
// pinned, they are numbered 1..11, and the page renders exactly that. It is a
// POLICY overshoot, and the policy is about what may be ADDED. Treating it like
// corruption would mean demoting six articles somebody deliberately chose,
// which is a far worse outcome than a list that is longer than intended and
// drains as the admin unpins. Reordering inside an over-cap block therefore
// stays fully allowed.
//
// ── THE COUNT IS OVER THE WHOLE BLOCK, ACTIVE OR NOT ────────────────────────
// Every document with `isPinnedOnArticlePage: true` counts, including inactive
// ones. That is not an oversight and it has a visible consequence:
//
//     AN INACTIVE PINNED ARTICLE OCCUPIES A SLOT.
//
// It has to. `pinOrder` is contiguous 1..M over the BLOCK — planMoveToPosition
// and planDemotion both re-emit it that way, and neither has any notion of
// `active` — so a cap counting only active rows would be counting a different
// set from the one being numbered. With one inactive member you could pin a
// sixth article into a block whose numbering already ran to 6, and the cap
// would report five while the model held six. The alternative failure is
// milder and visible: an admin who cannot pin sees a count they can go and
// check against the list.
//
// ── ENFORCED BY THE PLANNER, NOT BY THE UI ──────────────────────────────────
// `describePinCapacity` answers the question once; `planPromotion` refuses from
// it and the form disables from it. A disabled button is a hint —
// `setArticlePinned` is an exported function in a `'use server'` module, i.e. a
// POST endpoint, and anything that can be reached without the button has to
// refuse on its own. Same shape as `resolveStep`, shared by
// `describeOrderControls` and `planOrderStep`.

/**
 * How many articles may sit in the pinned block.
 *
 * THE ONLY PLACE THIS NUMBER IS WRITTEN. Every other surface derives from it,
 * including the Thai copy — `pinCapacityMessage` interpolates it rather than
 * spelling it out, so raising the cap changes one line and not five, and no
 * sentence can be left claiming a limit that is no longer the limit. That is
 * the same discipline `adminScheduleHorizon` records: one concept written as a
 * literal in three places that have to agree, and they did not.
 */
export const MAX_PINNED_ARTICLES = 5;

/** Why a pin cannot happen. `null` means it can. */
export const PIN_REFUSALS = Object.freeze({
  BLOCK_FULL: 'pin-block-full',
});

/**
 * Can `id` be pinned right now, and what would we tell the admin if not?
 *
 * ONE ANSWER, TWO READERS: the form disables its toggle from this and
 * `planPromotion` refuses from it. Written separately they would drift, and the
 * symptom is the pair this codebase keeps producing — a live-looking control
 * that silently does nothing, or a disabled one guarding an endpoint that would
 * happily have said yes.
 *
 * `alreadyPinned` is what keeps the cap OFF an article that is already in the
 * block: `canPin` is true for it at any block size, so re-saving, reordering,
 * or a stale form cannot be refused because of a limit the article is not
 * asking to cross. Unpinning does not consult this at all.
 *
 * @param {object[]} articles the FULL collection (or at minimum the whole block)
 * @param {string} id
 * @returns {{count: number, max: number, full: boolean, alreadyPinned: boolean,
 *            canPin: boolean, reason: string|null}}
 */
export function describePinCapacity(articles, id) {
  const list = Array.isArray(articles) ? articles : [];
  const key = String(id);
  const block = list.filter(isPositioned);

  const count = block.length;
  const alreadyPinned = block.some((a) => String(a?._id) === key);
  // `>=`, not `>`. At exactly MAX the block is FULL — one more would be
  // MAX + 1. An off-by-one here is invisible in every fixture of size other
  // than MAX, which is why the boundary has a test of its own.
  const full = count >= MAX_PINNED_ARTICLES;
  const canPin = alreadyPinned || !full;

  return {
    count,
    max: MAX_PINNED_ARTICLES,
    full,
    alreadyPinned,
    canPin,
    reason: canPin ? null : PIN_REFUSALS.BLOCK_FULL,
  };
}

/**
 * Why the pin was refused, in the admin's language. `null` when it was not.
 *
 * SPLIT FROM THE DESCRIPTOR so the descriptor stays pure data that a test can
 * compare structurally, while the copy still has exactly one author. Both the
 * server's error string and the sentence beside the form's toggle come from
 * here, so the two cannot describe different situations.
 *
 * THE OVER-CAP CASE GETS ITS OWN SENTENCE, and that is not politeness. "ปักหมุด
 * ได้สูงสุด 5 รายการ และตอนนี้ครบ 5 แล้ว" is simply FALSE when the block holds
 * eleven, and an admin who counts the list and finds eleven has been told a
 * number that does not match what is in front of them — which is the shape of
 * defect this whole area exists to remove. It also has to say what would
 * actually help, and "unpin one" does not help at eleven: the block has to come
 * down to MAX - 1 before a new pin becomes possible.
 */
export function pinCapacityMessage(capacity) {
  if (!capacity || capacity.canPin !== false) return null;
  const { count, max } = capacity;
  if (count > max) {
    return `ตอนนี้มีบทความปักหมุดอยู่ ${count} รายการ ซึ่งเกินขีดจำกัด ${max} รายการอยู่แล้ว ` +
      `จึงปักหมุดเพิ่มไม่ได้ — ต้องเลิกปักหมุดให้เหลือไม่เกิน ${max - 1} รายการก่อน`;
  }
  return `ปักหมุดได้สูงสุด ${max} รายการ และตอนนี้ครบ ${count} แล้ว ` +
    `จึงปักหมุดเพิ่มไม่ได้ — ต้องเลิกปักหมุดบทความอื่นก่อนจึงจะปักหมุดบทความนี้ได้`;
}

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
 * ── THE CAP REFUSES HERE ────────────────────────────────────────────────────
 * A full block returns a no-op plan carrying `reason` and `message` — the same
 * shape `planMoveToRank` uses, so the action returns `plan.message` verbatim
 * rather than asking a second time and risking a second answer. Refusal is the
 * PLANNER's job, not the button's: see the block comment on
 * `describePinCapacity`.
 *
 * `planDemotion` has no equivalent and must never grow one. Unpinning is how an
 * over-cap block drains, so a cap that could block it would be a trap with no
 * way out.
 *
 * @returns {{ kind: 'promote', id: string, reason?: string, message?: string,
 *             writes: {_id: string, isPinnedOnArticlePage?: boolean, pinOrder?: number}[] }}
 */
export function planPromotion(articles, id) {
  const list = Array.isArray(articles) ? articles : [];
  const key = String(id);

  const capacity = describePinCapacity(list, key);
  if (!capacity.canPin) {
    return {
      kind: 'promote',
      id: key,
      reason: capacity.reason,
      message: pinCapacityMessage(capacity),
      writes: [],
    };
  }

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
 * DELIBERATELY UNAFFECTED BY MAX_PINNED_ARTICLES, and it must stay that way.
 * Unpinning is the ONLY way an over-cap block gets back under the cap, so a
 * capacity check here would lock the block at whatever size it had reached.
 * There is no state in which refusing to unpin is the right answer.
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
