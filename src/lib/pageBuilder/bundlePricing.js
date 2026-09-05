/**
 * A bundle's two prices, and the one thing derived from them.
 *
 * ── WHY THIS IS A MODULE AND NOT TWO EXPRESSIONS ──────────────────────────
 * Each function here has MORE THAN ONE reader, and the readers must not be able
 * to disagree:
 *
 *   discountPercent   the renderer's ลด N% chip, AND the editor's live preview
 *                     under the price fields. An author who sees 20% while
 *                     editing and 19% on the page has been lied to by one of
 *                     them, and neither would error.
 *   isInvertedPrice   the editor's red warning at the field, AND
 *                     `publishBlockers`' refusal. Those two MUST agree exactly:
 *                     a warning that does not block is noise, and a block with
 *                     no warning is an author stuck at เผยแพร่ with nothing on
 *                     screen explaining why.
 *
 * Pure and dependency-free — no React, no db, no clock — so both tiers can
 * exercise it, and so `publishReadiness.js` can import it without pulling
 * anything server-only into the editor's client bundle.
 *
 * ── THE PERCENTAGE IS DERIVED, NEVER STORED ──────────────────────────────
 * The two PRICES are what must match a real quotation; the percentage is
 * display. Storing it would create a third number that can drift from the two
 * it describes, with nothing to notice — which is the shape this repo keeps
 * removing (five round-date formatters, seven inhouse-price ternaries, five
 * schedule-status maps).
 */

/**
 * Is this a real, set price? `null`/absent means UNSET; `0` is a real price.
 *
 * The distinction is load-bearing all the way from the schema to the screen: a
 * percentage computed from an unset price is not 0%, it is nothing at all. A
 * truthiness check anywhere on this path collapses the two.
 */
function isPrice(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * `20` for 40,800 → 32,640. `null` when there is nothing honest to show.
 *
 * Returns null — meaning "draw no chip" — for every case where a number would
 * be a claim the prices do not support:
 *
 *   · either price unset. Nothing to compare.
 *   · `listPrice === 0`. The division is undefined, and "100% off nothing" is
 *     not a discount.
 *   · `netPrice > listPrice`. There is no negative discount; the page must not
 *     render `ลด -8%` while the editor is warning about the same pair. The
 *     REFUSAL is `isInvertedPrice`'s job and `publishBlockers`', not this
 *     function's — this one only declines to invent a number.
 *
 * Rounded to a whole percent, which is what the reference page shows (ลด 20%)
 * and what a marketing chip means. `Math.round`, not floor: 19.6% is nearer 20
 * than 19, and floor would systematically understate the offer.
 */
export function discountPercent(listPrice, netPrice) {
  if (!isPrice(listPrice) || !isPrice(netPrice)) return null;
  if (listPrice <= 0) return null;
  if (netPrice > listPrice) return null;
  return Math.round((1 - netPrice / listPrice) * 100);
}

/**
 * Is the net price ABOVE the list price — a pair that cannot be published?
 *
 * FALSE when either is unset, and that is the whole design rather than an edge
 * case. An author types one number before the other, so "net set, list not yet"
 * is a normal intermediate state and must not warn, must not block, and above
 * all must not stop the page autosaving. That last one is why this rule is NOT
 * a zod `.refine()` on the section content: that content is validated on every
 * autosave, and a refusal there would freeze the whole page's saving because a
 * second number had not been typed yet.
 *
 * Equal prices are NOT inverted. A bundle sold at its list price is a bundle
 * with no discount, which is odd but honest — `discountPercent` answers 0 and
 * the renderer draws no chip for it.
 */
export function isInvertedPrice(listPrice, netPrice) {
  if (!isPrice(listPrice) || !isPrice(netPrice)) return false;
  return netPrice > listPrice;
}
