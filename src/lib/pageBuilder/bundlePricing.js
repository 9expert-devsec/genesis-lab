/**
 * A bundle's two prices, and the one thing derived from them.
 *
 * ── WHY THIS IS A MODULE AND NOT TWO EXPRESSIONS ──────────────────────────
 * These functions must not be able to disagree with each other or with
 * themselves across surfaces:
 *
 *   discountPercent   the renderer's ลด N% chip, AND the editor's live preview
 *                     under the price fields. An author who sees 20% while
 *                     editing and 19% on the page has been lied to by one of
 *                     them, and neither would error.
 *   discountAmount    the bundle quotation summary's three-line price panel.
 *                     ONE reader today, and it is here rather than inline in
 *                     that panel because it must share `discountPercent`'s
 *                     refusals EXACTLY — the two describe the same pair from
 *                     different sides, and a pair the panel would draw an
 *                     amount for but no percentage is a discount line with a
 *                     hole in its label. See the note at the function.
 *   isInvertedPrice   the editor's red warning at the field, AND
 *                     `publishBlockers`' refusal. Those two MUST agree exactly:
 *                     a warning that does not block is noise, and a block with
 *                     no warning is an author stuck at เผยแพร่ with nothing on
 *                     screen explaining why.
 *
 * The header used to open "Each function here has MORE THAN ONE reader", which
 * was true of the two that were here and stopped being the rule when
 * discountAmount arrived with one. Restated rather than quietly falsified: the
 * property that actually earns a shared module is that the answers must AGREE,
 * and multiple readers is the usual reason for that rather than the requirement.
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
 * `8160` for 40,800 → 32,640 — the money saved, as a positive number. `null`
 * when there is nothing honest to show.
 *
 * Read by the bundle quotation summary's price panel, which prints three lines:
 *
 *     ราคาปกติ (รวม 2 หลักสูตร)      ฿40,800
 *     ส่วนลดแพ็กเกจ 20%              -฿8,160
 *     ราคาสุทธิ                       ฿32,640
 *
 * ── IT IS `list - net`, AND NEVER `percent × list` ────────────────────────
 * This is the whole reason the function exists rather than the panel doing its
 * own arithmetic from the chip. `discountPercent` ROUNDS: a bundle at
 * 40,000 → 32,100 is 19.75%, which the chip prints as 20%. Deriving the amount
 * from that rounded percentage would print 8,000, and the three lines above
 * would then read 40,800 − 8,000 = 32,100 — a subtraction that is visibly wrong
 * on screen, in front of a customer who is looking at prices and can do it in
 * their head. Taking the difference directly makes the panel add up for every
 * pair, and lets the percentage stay what it is: a rounded label on an exact
 * number.
 *
 * So the two functions describe the same pair from different sides and are not
 * derivable from one another. That is intended, and it is why they live in one
 * module with one set of refusals.
 *
 * ── THE REFUSALS ARE `discountPercent`'S, CASE FOR CASE ───────────────────
 * Same three: either price unset, `listPrice <= 0`, and `netPrice > listPrice`.
 *
 * The `listPrice <= 0` case is the interesting one, because THIS function's
 * arithmetic does not need it — `0 - 0` is a perfectly good 0, and there is no
 * division to be undefined. It is here anyway, and deliberately: two functions
 * answering differently about the same pair is how the next defect gets in. A
 * caller that draws the panel when the amount is non-null and the chip when the
 * percentage is non-null would otherwise meet a pair with an amount and no
 * percentage, and render a discount line with no percentage in its label.
 *
 * Equal prices give `0`, matching the percentage's `0`, and NOT null. A bundle
 * sold at list price has a real discount of nothing; the caller's `> 0` branch
 * is what declines to draw a `-฿0` line, exactly as `> 0` is what declines to
 * draw a `ลด 0%` chip.
 */
export function discountAmount(listPrice, netPrice) {
  if (!isPrice(listPrice) || !isPrice(netPrice)) return null;
  if (listPrice <= 0) return null;
  if (netPrice > listPrice) return null;
  return listPrice - netPrice;
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
