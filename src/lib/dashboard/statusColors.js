/**
 * THE DASHBOARD'S STATUS COLOURS, IN ONE PLACE.
 *
 * ══ WHY THIS MODULE EXISTS NOW AND DID NOT BEFORE ═══════════════════════════
 *
 * Until round E5 the status colour appeared ONCE, as four `color:` literals in
 * the `statusDist` array in lib/dashboard/buildMetrics.js, and one consumer read
 * it — the donut. A literal beside its only consumer is not drift; it is a
 * value written where it is used, and round E3's guard recorded exactly that
 * decision ("The colours are this chart's business and belong to no other
 * consumer, so they stay here").
 *
 * E5 makes it four consumers:
 *
 *   1. the proportional bar that replaces the donut  (segment fill, hex)
 *   2. the age histogram                             (bar fill, hex)
 *   3. the per-card sparklines                       (stroke, hex)
 *   4. the pills in the รายการล่าสุด table           (Tailwind chip classes)
 *
 * Four copies of one decision is the shape this repo has already paid for twice
 * — the four `STATUS_BADGE` literals folded into lib/registrations/statuses.js,
 * and the six copies of 'ยืนยันแล้ว' before that. So the value moves, and the
 * guard that recorded the old decision is UPDATED to record the new one rather
 * than deleted or loosened. See test/fs/publicStatusLabelSources.
 *
 * ══ WHY IT IS NOT IN lib/registrations/statuses.js ══════════════════════════
 *
 * That module owns the VOCABULARY — which statuses exist, what they are called,
 * which transitions are legal, and what a chip looks like on a list screen. Its
 * header states it deliberately has NO IMPORTS so the pure tier and the scripts
 * under scripts/ can load it bare.
 *
 * A hex for an SVG fill is not vocabulary. It is a charting decision belonging
 * to one screen, and no other consumer of `statuses.js` — the list, the detail
 * screens, the migration script, the public site — draws a chart. Putting it
 * there would push a dashboard concern into six unrelated importers.
 *
 * So: the vocabulary stays there, the CHART palette lives here, and `statusBadge`
 * is RE-EXPORTED below so a dashboard surface that needs both takes both from
 * one import rather than reaching into two modules and being tempted to write
 * the second one out by hand.
 *
 * ══ THE HEXES ARE THE ONES THAT WERE ALREADY SHIPPING ═══════════════════════
 *
 * Not new colours. These are the four literals lifted verbatim out of
 * `statusDist`, so the donut's palette and the bar's palette are the same
 * palette and this round changes no pixel's colour. They are the Tailwind 500-
 * ish stops matching the chip classes each status already wears on the list
 * screen: amber for pending, blue for the quotation step, emerald for paid,
 * slate for cancelled.
 */

import { statusBadge } from '@/lib/registrations/statuses';

/**
 * Status value → the chart colour, as a hex an SVG `fill`/`stroke` can take.
 *
 * KEYED BY THE STORED VALUE, like every other status-keyed map in this repo.
 * `quoted` is the in-house spelling of the same real-world step as the public
 * `confirmed` — lib/registrations/statuses.js gives both the same label and the
 * same chip — so they take the same colour here too. Two statuses that read
 * alike everywhere else must not diverge on a chart.
 */
export const STATUS_COLOR = Object.freeze({
  pending:   '#f59e0b',
  confirmed: '#3b82f6',
  quoted:    '#3b82f6',
  paid:      '#10b981',
  cancelled: '#94a3b8',
});

/**
 * The colour for a series that is a TOTAL rather than a status.
 *
 * The two ทั้งหมด cards have no status, but their sparklines still have to be
 * coloured from somewhere, and "somewhere" was about to become two more
 * literals in the client. These are the hexes behind the `bg-9e-action` and
 * `bg-violet-400` the trend chart's two stacked series already use, so a
 * card's sparkline matches the chart bar it sums into.
 */
export const SERIES_COLOR = Object.freeze({
  public:  '#005CFF',  // --9e-action
  inhouse: '#a78bfa',  // violet-400
});

/**
 * The colour for a value the palette does not know.
 *
 * A named constant and a REAL colour, for the same reason
 * `NEUTRAL_STATUS_BADGE` is: a segment with no fill is invisible, so an
 * unrecognised status would read as "nothing here" rather than as "a status
 * nobody has coloured". Grey says unknown; blank says absent.
 */
export const NEUTRAL_STATUS_COLOR = '#cbd5e1';

/** One status value → its chart colour, neutral for anything unrecognised. */
export function statusColor(value) {
  return STATUS_COLOR[value] ?? NEUTRAL_STATUS_COLOR;
}

/**
 * The chip classes, RE-EXPORTED rather than restated.
 *
 * The pills in รายการล่าสุด are the same chip the list screen draws, and there
 * is exactly one definition of that — in the vocabulary module, keyed by status,
 * with its own neutral. Re-exporting means a dashboard surface imports "the
 * status colours" from one module and gets both forms, while the chip classes
 * still have a single home and a single guard.
 */
export { statusBadge };
