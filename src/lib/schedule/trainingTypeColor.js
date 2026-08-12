/**
 * THE training-type palette. One definition, every surface.
 *
 * Dependency-free ON PURPOSE — no `next/*`, no React, no models — the same rule
 * as monthWindow.js, roundDateLabel.js and monthLanes.js beside it, so it can be
 * exercised in the `pure` tier without a DOM.
 *
 * ── FOUR MAPS DISAGREED, AND THE REASON THEY DID IS THE DESIGN CONSTRAINT ────
 * Before this module there were four copies of "the training type colours" plus
 * a fifth spelling in a legend:
 *
 *   ScheduleClient.TYPE_COLOR        #00CCFF / #8B5CF6 / #22C55E   (the correct one)
 *   SearchClient.TYPE_COLOR          byte-identical copy
 *   ScheduleCard.TYPE_BORDER         #005eff / #a854f7 / #22C55E   (wrong two)
 *   ScheduleCarousel.TYPE_BADGE_CLASS  bg-sky-100 / bg-violet-100 / bg-emerald-100
 *   ScheduleSection.TrainingTypeLegend  bg-9e-action / bg-purple-500
 *
 * They did not drift by accident. They drifted because three surfaces needed
 * three different FORMS of the same value — a hex for an inline `style`, a hex
 * for an SVG stroke, and a light/dark class pair for a pill — and no single
 * source offered more than one, so each surface wrote the form it needed and
 * the values went their own way from there.
 *
 * THAT is why this module exports both a hex and a tint. A palette that serves
 * only one form guarantees the fourth copy grows back the first time a surface
 * needs the other, and the legend then starts describing colours nothing uses.
 *
 * ── WHY `online` IS HERE EVEN THOUGH IT NEVER DISAGREED ─────────────────────
 * `#22C55E` was identical in all four copies and does not change colour. It is
 * still declared here, because leaving it out means every consumer keeps a local
 * map just to cover the one type this module does not answer for — which is the
 * duplication being removed, reintroduced for a value that happens to agree
 * today.
 */

/**
 * The one palette.
 *
 * These are the `/schedule` values, which were correct: the desktop table, the
 * mobile round row and both of that page's legends already agreed on them, and
 * that is the largest surface showing the delivery type. Adopting them repaints
 * the course card's round border (classroom #005eff → #00CCFF, hybrid #a854f7 →
 * #8B5CF6) and the detail-page legend dots. Both are intended.
 */
export const TRAINING_TYPE_COLOR = {
  classroom: '#00CCFF',
  hybrid: '#8B5CF6',
  online: '#22C55E',
};

/**
 * The hex for a delivery type, falling back to classroom.
 *
 * Classroom and not a neutral grey: every surface that draws this already had
 * `?? TYPE_COLOR.classroom` inline, because an absent `type` on a round is
 * overwhelmingly a classroom round with a missing field rather than a fourth
 * kind of training. Keeping that behaviour here means no consumer needs its own
 * `??`, which is where a local map starts.
 *
 * @param {string} [type]
 * @returns {string} a 6-digit hex, always
 */
export function trainingTypeColor(type) {
  return TRAINING_TYPE_COLOR[type] ?? TRAINING_TYPE_COLOR.classroom;
}

/**
 * The same colour at a given alpha, as `rgba(r, g, b, a)`.
 *
 * ── WHY `rgba()` AND NOT AN 8-DIGIT HEX OR `color-mix()` ────────────────────
 * All three can express "this colour at 12%". `rgba()` is chosen because it is
 * EXACTLY expressible from the hex with integer arithmetic, needs no
 * browser-support argument, and — the deciding reason — is a plain string a pure
 * test can assert byte for byte. `#00CCFF1F` requires the reader to know that
 * 0x1F is 12%, and `color-mix()` would make the computed value something only a
 * browser can tell you.
 *
 * Alpha is passed through untouched, so `0` and `1` produce `rgba(…, 0)` and
 * `rgba(…, 1)` rather than being special-cased into `transparent` or the bare
 * hex. A caller asking for an alpha gets an alpha.
 *
 * @param {string} [type]
 * @param {number} alpha 0..1
 * @returns {string} e.g. `rgba(0, 204, 255, 0.12)`
 */
export function trainingTypeTint(type, alpha) {
  const hex = trainingTypeColor(type);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
