/**
 * Gantt-style lane packing for the /schedule desktop table.
 *
 * Dependency-free ON PURPOSE — no React, no `next/*`, no db, no models — same
 * rule as monthWindow.js and roundDateLabel.js beside it, so the packing can be
 * exercised in the `pure` tier without a DOM.
 *
 * ── THE TWO REQUIREMENTS, WHICH ONE `<tr>` CANNOT SATISFY ───────────────────
 * Both of these have to hold at the same time:
 *
 *   · a round crossing months is DISPLAYED SPANNING the months it belongs to;
 *   · a round sitting inside one month stays ALIGNED UNDER that month.
 *
 * When the two overlap, a single table row cannot do it. You cannot have a
 * `<td colSpan={2}>` covering ก.ย.+ต.ค. and ALSO a separate `<td>` at ต.ค. in
 * the same row — the second cell has nowhere to go. So a course row becomes one
 * or more LANES, packed like a Gantt chart, and the frozen columns `rowSpan`
 * across them.
 *
 * ── AND THE BUCKETING DEFECT IT FIXES ───────────────────────────────────────
 * `scheduleMonthKey` keys a round by the month of its FIRST DATE ONLY, and the
 * table's per-cell filter and `filteredCourses` both bucketed on that. Filtering
 * to "เฉพาะ ต.ค." therefore made a 30 ก.ย. – 1 ต.ค. round VANISH — and with it
 * the whole course row, because `visibleMonths.some(...)` found nothing in any
 * visible bucket. A round is now visible when ANY month of its span is in the
 * window, and `roundSpanIndices` is the one place that answers that question so
 * the table cells, the course filter and the mobile card cannot disagree.
 */

import { parseMonthKey } from '@/lib/schedule/monthWindow';
import { roundMonthSpan } from '@/lib/schedule/roundDateLabel';

/**
 * A `YYYY-MM` key as an absolute month ordinal, so two keys can be subtracted.
 *
 * Through `parseMonthKey` and `year * 12 + month` rather than `indexOf` in
 * `visibleMonths`: a round can start BEFORE the window and end inside it, and
 * `indexOf` returns the same `-1` for "one month early" as for "three years
 * early". The offset has to be a number for the clipping below to know which
 * side it fell off.
 */
function monthOrdinal(key) {
  const parsed = parseMonthKey(key);
  return parsed ? parsed.year * 12 + parsed.month : null;
}

/**
 * Which visible columns a round occupies, clipped to the window.
 *
 * THE ONE ANSWER to "is this round in view, and where". Exported and used by
 * every surface that has to agree about it: the lane packing below, the table's
 * per-cell filter, `filteredCourses`, and the mobile card's round list.
 *
 * @param {Array<string|Date>} dates the round's dates
 * @param {string[]} visibleMonths contiguous ascending `YYYY-MM` keys
 * @returns {{startIdx:number, endIdx:number, span:number,
 *   clippedBefore:boolean, clippedAfter:boolean,
 *   startKey:string, endKey:string}|null}
 *   `null` when the round has no usable date, or when its span misses the
 *   window entirely. Indices are INCLUSIVE and already clipped to
 *   `[0, visibleMonths.length - 1]`.
 */
export function roundSpanIndices(dates, visibleMonths) {
  const months = Array.isArray(visibleMonths) ? visibleMonths : [];
  if (months.length === 0) return null;

  const { startKey, endKey } = roundMonthSpan(dates);
  if (!startKey || !endKey) return null;

  const base = monthOrdinal(months[0]);
  const start = monthOrdinal(startKey);
  const end = monthOrdinal(endKey);
  if (base === null || start === null || end === null) return null;

  const last = months.length - 1;
  const rawStart = start - base;
  const rawEnd = end - base;

  // Entirely outside — off the front or off the back. Dropped, not clamped:
  // clamping would pin a round from last March into the first visible column.
  if (rawEnd < 0 || rawStart > last) return null;

  return {
    startIdx: Math.max(0, rawStart),
    endIdx: Math.min(last, rawEnd),
    span: Math.min(last, rawEnd) - Math.max(0, rawStart) + 1,
    clippedBefore: rawStart < 0,
    clippedAfter: rawEnd > last,
    // The REAL months, unclipped — what the continuation marker names.
    startKey,
    endKey,
  };
}

/** Whether a round should be shown at all in this window. */
export function roundInWindow(dates, visibleMonths) {
  return roundSpanIndices(dates, visibleMonths) !== null;
}

/** The round's earliest date as a timestamp, for ordering. Infinity when unusable. */
function startTime(round) {
  const times = (round?.dates ?? [])
    .filter((d) => d !== null && d !== undefined && d !== '')
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  return times.length ? Math.min(...times) : Infinity;
}

/**
 * Pack a course's rounds into lanes.
 *
 * @param {Array<{dates: Array<string|Date>}>} rounds
 * @param {string[]} visibleMonths
 * @returns {{lanes: Array<Array<{
 *   startIdx:number, endIdx:number, span:number,
 *   rounds:Array<object>,
 *   clippedBefore:boolean, clippedAfter:boolean,
 *   beforeKey:string|null, afterKey:string|null,
 * }>>}}
 *   `lanes[0]` is the row the frozen columns sit in. An empty `lanes` means the
 *   course has nothing to show in this window.
 *
 * ── THE PROPERTY THAT MATTERS MOST ──────────────────────────────────────────
 * When NO round crosses a month, this returns exactly ONE lane and the rendered
 * markup is what it always was. The common case must not pay for the rare one,
 * and a pure test pins it.
 */
export function laneLayout(rounds, visibleMonths) {
  const list = Array.isArray(rounds) ? rounds : [];

  // 1-2. Span each round, clipped. Rounds outside the window fall out here.
  const placed = [];
  for (const round of list) {
    const span = roundSpanIndices(round?.dates, visibleMonths);
    if (span) placed.push({ round, span });
  }

  // 3. Rounds sharing an IDENTICAL clipped interval become one cell, so two
  //    rounds in the same single month still stack inside one <td> exactly as
  //    they do today.
  const byInterval = new Map();
  for (const { round, span } of placed) {
    const key = `${span.startIdx}:${span.endIdx}`;
    let cell = byInterval.get(key);
    if (!cell) {
      cell = {
        startIdx: span.startIdx,
        endIdx: span.endIdx,
        span: span.span,
        rounds: [],
        clippedBefore: false,
        clippedAfter: false,
        beforeKey: null,
        afterKey: null,
      };
      byInterval.set(key, cell);
    }
    cell.rounds.push(round);
    // The continuation marker is a property of the CELL, but clipping is a
    // property of each round in it. A cell is clipped when any of its rounds
    // is, and it names the furthest month reached — the earliest start before
    // the window, the latest end after it.
    if (span.clippedBefore) {
      cell.clippedBefore = true;
      if (!cell.beforeKey || span.startKey < cell.beforeKey) cell.beforeKey = span.startKey;
    }
    if (span.clippedAfter) {
      cell.clippedAfter = true;
      if (!cell.afterKey || span.endKey > cell.afterKey) cell.afterKey = span.endKey;
    }
  }

  // 4. Left to right, then by the earliest date inside. Deterministic ordering
  //    is what makes the greedy pack below reproducible.
  const cells = [...byInterval.values()].sort((a, b) => {
    if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx;
    return Math.min(...a.rounds.map(startTime)) - Math.min(...b.rounds.map(startTime));
  });

  // Rounds within a cell keep date order too — they stack visibly.
  for (const cell of cells) cell.rounds.sort((a, b) => startTime(a) - startTime(b));

  // 5. Greedy: the first lane whose last used column is strictly left of this
  //    cell's start. Otherwise open a new lane.
  const lanes = [];
  const lastUsed = [];
  for (const cell of cells) {
    let lane = lanes.findIndex((_, i) => lastUsed[i] < cell.startIdx);
    if (lane === -1) {
      lanes.push([]);
      lastUsed.push(-1);
      lane = lanes.length - 1;
    }
    lanes[lane].push(cell);
    lastUsed[lane] = cell.endIdx;
  }

  return { lanes };
}
