/**
 * The /schedule table's horizontal geometry — the arithmetic only.
 *
 * Dependency-free (no React, no next/*) so the `pure` tier can check the
 * numbers without a DOM. jsdom does not do layout, so a rendered test cannot
 * measure a column; what CAN be pinned is that the offsets are cumulative sums
 * of the widths and that the table's floor grows with the month count. That is
 * exactly what shears when someone edits one width and misses another.
 *
 * ── WHY THE OFFSETS ARE COMPUTED AND NOT WRITTEN DOWN ───────────────────────
 * The four frozen columns are `position: sticky`, and a sticky column's `left`
 * has to equal the SUM OF THE WIDTHS TO ITS LEFT or it lands on top of its
 * neighbour once the user scrolls. Those four widths used to appear about a
 * dozen times in ScheduleClient.jsx — once in the `<colgroup>`, then again as
 * `w-/min-w-/max-w-` triples and as hardcoded `left-[120px]` / `left-[480px]` /
 * `left-[540px]` offsets on both the `<th>` row and the `<td>` row — with
 * nothing making them agree. Widening the course-name column by 20px meant
 * finding and editing seven numbers, and missing one sheared the frozen block
 * silently: it looks right until you scroll.
 *
 * ── THE TAILWIND TRAP THIS AVOIDS ───────────────────────────────────────────
 * Arbitrary Tailwind values must be STATIC STRINGS at build time — the compiler
 * scans source text and never evaluates it. `left-[${offset}px]` produces no
 * class at all and fails SILENTLY as an unstyled element. Cumulative offsets are
 * therefore inline `style={{ left }}`, never a template-literal class name, and
 * an fs guard asserts no `left-[` survives on the frozen cells.
 */

/**
 * The floor a single month column may shrink to.
 *
 * Below this the table overflows its container and the custom scrollbar takes
 * over; above it the month columns absorb the slack (see `tableMinWidth`). 90
 * is the width the old hardcoded `<col style={{ width: 90 }}>` used, so the
 * dense case looks exactly as it did.
 */
export const MONTH_MIN_WIDTH = 90;

/**
 * The four frozen columns, left to right. THE ONLY PLACE THESE WIDTHS EXIST.
 *
 * Labels live here too so the `<colgroup>` and the `<th>` row cannot fall out
 * of order with one another — an off-by-one there puts the course name under
 * the "วัน" heading, which no width guard would catch.
 */
export const FROZEN_COLUMNS = [
  { key: 'code',  width: 120, label: 'รหัสหลักสูตร' },
  { key: 'name',  width: 360, label: 'ชื่อหลักสูตร' },
  { key: 'days',  width: 60,  label: 'วัน' },
  { key: 'price', width: 100, label: 'ราคา' },
];

/** Total frozen width — DERIVED, so it cannot disagree with the array. */
export const FROZEN_TOTAL = FROZEN_COLUMNS.reduce((sum, c) => sum + c.width, 0);

/**
 * The `left` each frozen column sticks at: the cumulative sum of everything to
 * its left, so `[0, 120, 480, 540]` for the widths above. The first is always
 * 0 and the last is always `FROZEN_TOTAL - last.width`.
 */
export function frozenOffsets(columns = FROZEN_COLUMNS) {
  let running = 0;
  return columns.map((c) => {
    const left = running;
    running += c.width;
    return left;
  });
}

/** The frozen columns with their sticky offsets attached, ready to render. */
export function frozenLayout(columns = FROZEN_COLUMNS) {
  const offsets = frozenOffsets(columns);
  return columns.map((c, i) => ({ ...c, left: offsets[i], isLast: i === columns.length - 1 }));
}

/**
 * The table's `min-width` for a given number of month columns.
 *
 * THIS ONE NUMBER PRODUCES BOTH BEHAVIOURS, which is why the old fixed
 * `min-w-[900px]` had to go — it was a constant that stopped describing
 * anything the moment the month count became variable:
 *
 *   · MANY months → the sum exceeds the container, the table overflows, every
 *     month sits at exactly MONTH_MIN_WIDTH and the scrollbar appears.
 *   · FEW months  → the sum is under the container, `width: 100%` wins, and the
 *     month `<col>`s (which carry NO width) divide the slack equally under
 *     `table-fixed`. The frozen `<col>`s keep their specified widths, so the
 *     sticky offsets above stay correct.
 *
 * The old markup got the second case wrong: with every column carrying a hard
 * width and the table forced to 900px, the surplus was redistributed across ALL
 * columns including the frozen ones — while their `left-[…]` offsets stayed
 * pinned to the unstretched widths. Two months on a sub-900px viewport therefore
 * sheared the frozen block as soon as you scrolled.
 */
export function tableMinWidth(monthCount) {
  const n = Math.max(0, Math.floor(Number(monthCount) || 0));
  return FROZEN_TOTAL + MONTH_MIN_WIDTH * n;
}

/**
 * The narrowest the custom scrollbar track may become.
 *
 * The thumb has its own 40px floor (`Math.max(40, …)` in ProgramTable), so a
 * track shorter than that is a control with no travel at all. 120 leaves at
 * least 80px of drag range in the worst case — usable — and is about a thumb's
 * width of margin on either side.
 */
export const MIN_TRACK_WIDTH = 120;

/**
 * How far in from the container's left edge the scrollbar track should start.
 *
 * ── WHY IT IS INSET AT ALL ──────────────────────────────────────────────────
 * The four frozen columns are `position: sticky` INSIDE the scroll container,
 * so they never move. The entire horizontal overflow is the month area. A track
 * spanning the full table therefore begins under รหัสหลักสูตร — pointing at
 * something that cannot scroll — and the thumb's travel is scaled against a
 * distance the content does not have. Starting the track at `FROZEN_TOTAL`
 * makes it sit over exactly the region it controls.
 *
 * ── THE NARROW-VIEWPORT FLOOR ───────────────────────────────────────────────
 * Below ~640px of container the frozen block alone fills or exceeds the width,
 * and a naive `left: FROZEN_TOTAL` leaves the track zero-width or negative — an
 * invisible or inverted scrollbar on a phone, which is the one place the custom
 * scrollbar is doing essential work (there is no visible native one; the
 * container is `no-native-scrollbar`). So the inset yields to a minimum track
 * width. On a 390px phone the inset becomes 270 and the track is exactly
 * MIN_TRACK_WIDTH; on a 1200px desktop it is the full 640.
 *
 * Clamped to a MINIMUM WIDTH rather than to a fraction of the container: a
 * fraction still collapses toward zero as the viewport shrinks, just more
 * slowly, so it postpones the failure instead of removing it.
 *
 * @param {number} containerWidth the scroll container's clientWidth
 * @returns {number} px, never negative
 */
export function scrollTrackInset(containerWidth) {
  const w = Math.max(0, Math.floor(Number(containerWidth) || 0));
  return Math.max(0, Math.min(FROZEN_TOTAL, w - MIN_TRACK_WIDTH));
}
