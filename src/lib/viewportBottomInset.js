// src/lib/viewportBottomInset.js
//
// Which parts of the viewport's BOTTOM EDGE are currently covered by
// page-owned fixed furniture — today that means a sticky bottom bar such as
// CourseStickyCTA. A consumer that must float clear of whatever is down there
// (FloatingActionDock) asks about its OWN column instead of guessing from the
// URL.
//
// ── IT HOLDS BOXES, NOT A SCALAR, AND THAT WAS A BUG FIX ────────────────────
// The first version stored one number per publisher and answered with the
// greatest. That silently asserted bottom-edge occupancy is uniform across the
// width, and it is not: the course page's bar is capped at 860px and
// left-aligned inside a 1200px box, while the dock hugs the right edge. Above
// ~904px of viewport they cannot touch — but the dock lifted anyway and
// floated over nothing, because HOW MUCH was the only question the store could
// answer. Each publisher now stores an occupied BOX (height + horizontal
// extent) and consumers ask bottomInsetAcross(left, right).
//
// The two rejected alternatives, so they are not reproposed: gating the lift on
// a breakpoint (a magic 904, or lg, that has to agree with the bar's max-width
// AND the dock's right offset — the exact coupling this module exists to
// remove, and wrong the day either changes), and having the publisher measure
// its own distance from the right edge (that is the publisher holding the
// consumer's geometry).
//
// The direction is still one-way. A publisher describes ONLY itself and learns
// nothing about who reads it; a consumer owns its own positioning and never
// learns what kind of furniture it is clearing.
//
// ── WHY AN EXTERNAL STORE AND NOT REACT CONTEXT ─────────────────────────────
// Verified in the tree rather than assumed:
//
//   consumer  FloatingActionDock  imported and mounted at src/app/layout.jsx:8
//                                 and :156 — the ROOT layout.
//   publisher CourseStickyCTA     imported at src/app/(public)/[...slug]/
//                                 page.jsx:26, rendered at :811 — a leaf of one
//                                 page inside the (public) group.
//   src/app/(public)/layout.jsx mounts NEITHER.
//
// So the nearest common ancestor of the two is the root layout, and nothing
// else. A context provider would therefore have to live there, which means
// wrapping the entire application — every route, admin included — in a client
// provider to serve a concern that exists on a couple of public pages. A module
// -level store has no ancestor requirement at all: the publisher and the
// consumer each import it, and neither needs to know the other exists.
//
// This is also the first useSyncExternalStore-shaped module in the repo, so the
// subscribe/getRevision/getServerRevision trio below is deliberately the exact
// shape that hook wants, nothing more. The two getters are named for what they
// RETURN rather than getSnapshot/getServerSnapshot: since the store went from
// a scalar to boxes, the snapshot is no longer a measurement, and a getter
// still called getSnapshot would invite a consumer to render an opaque
// revision counter as pixels.
//
// React is 18.3.1 (package.json: react ^18.3.1, react-dom ^18.3.1).
// useSyncExternalStore is a React 18 API and is available. useOptimistic is a
// React 19 API and is NOT available here.
//
// ── WHAT THIS REPLACES, EVENTUALLY ──────────────────────────────────────────
// src/lib/floatingDock.js has dockLiftsForBottomBar(pathname), which decides
// the same question by testing whether the path contains '/register'. That is a
// guess about which pages have a bar, hardcoded away from the bars themselves.
// A measured value cannot go stale when a fourth page grows a bottom bar.
//
// ── TWO PUBLISHERS AT ONCE: KEYED, NOT SINGLE-VALUE ─────────────────────────
// This cannot happen today — one bar per route — but the failure mode if it
// ever does is bad and silent: a stale non-zero inset that nothing clears,
// leaving the dock floating in mid-air above nothing.
//
// The two options were (a) one value plus a documented "every publisher MUST
// reset to 0 on unmount" contract, or (b) a keyed map whose snapshot is the
// max. THIS MODULE IMPLEMENTS (b), for two reasons:
//
//   1. max() is not a tie-break, it is the correct answer. Furniture pinned to
//      the bottom edge OVERLAPS at that edge; the space a consumer must clear
//      is the tallest one, not the sum and not the newest. A single value
//      cannot express that, so under (a) a shorter bar mounting second would
//      shrink the inset while a taller bar is still on screen.
//   2. Cleanup becomes local and total. A publisher clears ITS OWN key and can
//      neither strand another publisher's value nor clobber it. Under (a),
//      correctness depends on a global ordering contract that nothing enforces
//      — a test can demonstrate the happy sequence but cannot make a future
//      publisher honour it, and the penalty for forgetting is the permanent
//      mid-air dock above.
//
// The cost is one argument. That is cheap enough that "it cannot happen today"
// does not justify the sharper edge.
//
// The behaviour of the design NOT chosen is recorded in the tests as well: two
// publishers sharing ONE key is exactly what (a) is, and the test named for it
// pins the fact that the first unmount then zeroes the inset while the second
// publisher is still live.
//
// ── NAMING ──────────────────────────────────────────────────────────────────
// Not `bottomBarClearance`: "clearance" reads as the gap that must be LEFT
// FREE, which is the inverse of what is stored and invites a consumer to apply
// the number the wrong way round. This is an inset — a distance in from an edge
// — and it composes with the same vocabulary as env(safe-area-inset-bottom).
// It is also named for the QUANTITY rather than for one consumer's use of it,
// which matters because the publisher and the consumer are decoupled by design.
//
// NOTE FOR THE WIRING COMMIT, and it is a real trap:
// test/render/stickyBarButtonCoordination.test.mjs:231 asserts
// `!/stickyBottomBar/.test(DOCK)` — "no dependency on the removed coordination
// store". A previous store was deleted on purpose and that assertion guards its
// return. This module is not called stickyBottomBar, so that regex will not
// match it: the assertion stays GREEN while the claim it encodes stops being
// true the moment the dock imports this file. It was NOT renamed to dodge the
// regex and it must NOT be renamed to satisfy it either — the assertion is what
// has to change, deliberately, in the commit that wires the dock up.

// key -> { height, left, right }. Insertion order is irrelevant; the query
// scans for the greatest height among the boxes that intersect its span.
const boxes = new Map();

// Monotonic change counter, and the whole of the useSyncExternalStore
// snapshot. It is NOT a measurement: consumers learn "something moved" from
// this and then ask bottomInsetAcross what that means for their own column.
let revision = 0;

const listeners = new Set();

/**
 * Coerce a candidate box to something storable.
 *
 * Returns null for a REFUSAL — a box that must not be stored at all — and a
 * fresh normalised box otherwise. Refusal is silent (no throw) on purpose: the
 * realistic publisher is a ResizeObserver measurement running on every layout
 * change, and a throw on the one frame that produced a NaN would take down the
 * page for a cosmetic offset.
 *
 * Number.isFinite does NOT coerce, so it rejects '64', null, undefined, {} and
 * NaN/±Infinity in one test. The three fields fail in two different directions
 * on purpose:
 *
 *   height   clamps a negative to 0. Nothing can occupy less than none of the
 *            edge, and clamping leaves the consumer at its resting position,
 *            whereas refusing would leave the PREVIOUS, larger box in place.
 *            0 is legal and meaningful: "this publisher is still here and is
 *            currently occupying nothing" (hidden, dismissed, mid-slide).
 *   left/right REFUSE. A span is not a magnitude — there is no safe direction
 *            to clamp `right <= left` toward, and a guessed span would answer
 *            intersection questions about a region the publisher is not in.
 *            Refusing keeps the last known good span, which is the only honest
 *            option.
 */
function normalizeBox(box) {
  if (!box || typeof box !== 'object') return null;
  const { height, left, right } = box;
  if (!Number.isFinite(height)) return null;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  if (right <= left) return null;
  return { height: height < 0 ? 0 : height, left, right };
}

function sameBox(a, b) {
  return (
    a !== undefined &&
    b !== undefined &&
    a.height === b.height &&
    a.left === b.left &&
    a.right === b.right
  );
}

/**
 * Bump the revision and notify.
 *
 * Called ONLY from a path that has already established the box set really
 * changed — see the equality guard in setOccupiedBox. That guard is the
 * load-bearing line: a realistic publisher republishes an identical box on
 * every layout tick, and without it every tick would wake the consumer.
 *
 * The guard lives per-BOX now rather than on a derived total, and it had to
 * move: the total is no longer a property of the store. It depends on WHO is
 * asking and where they are, so the store cannot know whether a change matters
 * to any particular consumer. "Did the box set change" is the strongest
 * statement this module can still make.
 */
function commit() {
  revision += 1;
  for (const listener of listeners) listener();
}

/**
 * Subscribe to changes in the box set. Returns the unsubscribe function.
 *
 * The listener takes no arguments and is called AFTER the change has landed —
 * that is the contract useSyncExternalStore relies on, since it re-reads the
 * snapshot itself rather than being handed a value.
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The useSyncExternalStore snapshot: an opaque revision token, NOT pixels.
 *
 * Named for what it returns rather than `getSnapshot`, deliberately. Under the
 * old scalar store the snapshot WAS the inset, so a consumer could render it
 * directly. It no longer is, and a function still called `getSnapshot` invites
 * exactly that mistake — a number that looks like an inset, renders without
 * complaint, and is meaningless. Ask `bottomInsetAcross` for pixels.
 *
 * A revision rather than the box set itself because a snapshot must be
 * referentially stable between changes; rebuilding an array on every call
 * would make useSyncExternalStore loop.
 */
export function getRevision() {
  return revision;
}

/**
 * Always 0.
 *
 * There is no viewport on the server, so there is no furniture in it, and the
 * revision on a fresh client is also 0 — so the server and the first client
 * render agree, which is the hydration mismatch this hook exists to prevent.
 */
export function getServerRevision() {
  return 0;
}

/**
 * THE QUERY. How many pixels of the viewport's bottom edge are occupied
 * ACROSS the horizontal span [left, right), in viewport coordinates.
 *
 * Named for the question it answers, not for the caller — the same reasoning
 * that made this module viewportBottomInset rather than bottomBarClearance.
 * Anything pinned to the bottom edge can ask it; nothing about a dock, a bar
 * or a chat launcher appears here.
 *
 * ── WHY A SPAN AND NOT A SCALAR ─────────────────────────────────────────────
 * Bottom-edge occupancy is not uniform across the width, and a scalar silently
 * asserted that it was. The course page's bar is capped at 860px and
 * left-aligned inside a 1200px box while the floating dock hugs the right
 * edge, so above ~904px of viewport they never overlap — yet the dock lifted
 * anyway, floating over nothing, because the store could only say HOW MUCH and
 * never WHERE.
 *
 * Intersection is STRICT (`box.left < right && box.right > left`), so boxes
 * that merely touch do not count. That is the correct reading of "occupied
 * here" and it reproduces the measured threshold exactly: at 904px the bar's
 * right edge and the dock's left edge are both at 844px, which is a touch, not
 * an overlap, and the dock correctly stays down.
 *
 * An unusable span answers 0 rather than falling back to the greatest box.
 * The direction is deliberate: an unmeasured consumer is in its first frame,
 * and 0 is what the server rendered, so it holds still and then settles. The
 * alternative would lift on first paint and drop on the next, which is a
 * visible jump on every page load rather than a one-frame delay nobody sees.
 */
export function bottomInsetAcross(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return 0;
  let greatest = 0;
  for (const box of boxes.values()) {
    if (box.left < right && box.right > left && box.height > greatest) {
      greatest = box.height;
    }
  }
  return greatest;
}

/**
 * Publish the box `key` currently occupies at the bottom edge.
 *
 * `box` is `{ height, left, right }`: how far up from the viewport's bottom
 * edge the publisher reaches, and its horizontal extent in VIEWPORT
 * coordinates — the same frame getBoundingClientRect reports in, so a consumer
 * can compare the two without either side knowing the other's layout.
 *
 * `key` identifies the PUBLISHER, not the measurement, and must be stable for
 * the lifetime of that publisher's mount — it is what lets clearOccupiedBox
 * remove exactly one contribution. A nullish or empty key is refused rather
 * than stored, because `undefined` as a Map key silently merges every
 * anonymous publisher into one bucket, which is the single-value failure this
 * module is shaped to avoid.
 */
export function setOccupiedBox(key, box) {
  if (key == null || key === '') return;
  const next = normalizeBox(box);
  if (next === null) return;
  if (sameBox(boxes.get(key), next)) return;
  boxes.set(key, next);
  commit();
}

/**
 * Remove `key`'s box — the unmount half of the contract.
 *
 * Deletes rather than storing a zero-height box so the map does not accumulate
 * one dead entry per route change. Clearing a key that was never set is a
 * no-op and does not notify.
 */
export function clearOccupiedBox(key) {
  if (!boxes.delete(key)) return;
  commit();
}
