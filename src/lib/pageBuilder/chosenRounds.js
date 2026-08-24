import { roundHasStarted } from '@/lib/schedule/roundHasStarted';

/**
 * WHICH ROUNDS A `course_schedule` DRAWS, AND WHAT EACH ONE IS.
 *
 * The pure half of the chosen-rounds mode (round 64, step 2 of
 * docs/course-schedule-selection.md). Given the rows the resolver fetched and
 * the section's stored content, it answers the only question the renderer has:
 * what rows go on the page, in what order, and what does the site actually know
 * about each one.
 *
 * Dependency-free apart from `roundHasStarted`, which is itself dependency-free
 * — no `next/*`, no db, no React, no clock. `todayKey` is a PARAMETER for the
 * same reason `excludeStartedRounds` takes one: the boundary is then exercisable
 * at a pinned date in the `pure` tier, and there is exactly one module in this
 * repo that decides what day it is in Asia/Bangkok (`siteTodayKey`). The
 * renderer supplies it, precisely as `lib/api/schedules.js` already does.
 *
 * ── WHY THIS IS NOT IN `assembleResolved`, AGAINST LOCAL PRECEDENT ──────────
 *
 * `limit` — the other thing that narrows this section's rows — IS applied in the
 * resolver (`resolveSectionRefs.assembleResolved`). The selection deliberately
 * is not, and the reason is the editor rather than the page (round 63 §G).
 *
 * The editor's round picker has to offer the rounds the author has NOT chosen.
 * Its option list is the `resolved` map the canvas already receives from
 * `resolveBuilderSectionData` — the same map, from the same resolver, that the
 * public page gets. Filter the selection into the resolver and that map arrives
 * pre-narrowed to the chosen rounds, and the picker can no longer see what it
 * exists to offer. The escapes from that are to change the `data` shape (which
 * breaks the one-renderer, one-data-shape invariant 2C.2a was built on) or to
 * add a second admin action that re-fetches what arrived 350 ms ago.
 *
 * Filtering here instead costs nothing on either side. The public page is a
 * server component, so the ~4 KB of unchosen rows it discards never crosses to a
 * browser; and `roundIds` never has to enter `dataRefSignature`, so changing the
 * selection re-DRAWS without re-FETCHING.
 *
 * This does not create a second authority over what is shown. The resolver
 * decides what EXISTS (the fetch, and `limit` where it applies); this decides
 * what the author asked to SEE from it. One reads upstream, one reads the stored
 * document, and neither can answer the other's question.
 *
 * ── THE THREE STATES, AND WHY A CHOSEN ROUND IS NEVER DROPPED ───────────────
 *
 *   live      the row came back from MSDB. Everything is known: dates, delivery
 *             type, and the status that says whether it is taking bookings.
 *   elapsed   not in the feed, and the snapshot's dates say it has begun.
 *             `excludeStartedRounds` removes a round from every public feed the
 *             moment its FIRST training day arrives, so this is the ordinary
 *             end of a chosen round's life, not a fault.
 *   missing   not in the feed, and nothing says it elapsed — it was withdrawn
 *             upstream while still in the future, or was never resolvable. The
 *             site knows the dates it last saw and NOTHING else.
 *
 * The author's rule (round 64, amending round 63 §C.1): on the page a chosen
 * round is never silently dropped. A page that quietly gets shorter is the
 * failure rounds 46 §D.1 and 48 §A already ruled against for stale course
 * codes — an author who can SEE the dead row can remove it; one whose page
 * shrank cannot. Round 63 §A.5 measured a 51-day median to a round's first day,
 * which is an argument for making that decay visible, not for automating it
 * away.
 *
 * `elapsed` and `missing` are kept apart rather than collapsed into one grey
 * because they are different claims (round 63 §C.2): `elapsed` is computed from
 * dates the site still holds, `missing` asserts nothing at all. Neither may
 * carry a status or a link, and neither can: the snapshot schema STRIPS
 * `status` and `signup_url`, so there is nothing here to draw them from.
 */

/** The row states this module can return. Display-independent. */
export const ROUND_ROW_STATES = ['live', 'elapsed', 'missing'];

/** `_id`-keyed index of the live rows, tolerant of a non-array. */
function liveById(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row?._id;
    if (id === undefined || id === null || id === '') continue;
    // First writer wins: duplicate ids upstream would be a data fault, and
    // silently preferring the last one would make which row draws depend on
    // fetch order.
    const key = String(id);
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

/** `id`-keyed index of the stored snapshots. */
function snapshotById(list) {
  const map = new Map();
  for (const snap of Array.isArray(list) ? list : []) {
    const id = snap?.id;
    if (typeof id !== 'string' || id === '') continue;
    if (!map.has(id)) map.set(id, snap);
  }
  return map;
}

/** A live MSDB row, as a drawable descriptor. */
function liveRow(row) {
  return {
    id: row?._id === undefined || row?._id === null ? '' : String(row._id),
    state: 'live',
    live: row,
    dates: Array.isArray(row?.dates) ? row.dates : [],
    type: typeof row?.type === 'string' ? row.type : '',
  };
}

/**
 * The rows a `course_schedule` draws.
 *
 * @param {Array<object>} rows the resolved MSDB rows for this section's course,
 *   already narrowed by the resolver (upcoming only, and `limit` where it
 *   applies). A non-array is treated as none.
 * @param {object} content the section's stored content.
 * @param {string} todayKey today in Asia/Bangkok, `'YYYY-MM-DD'`, from
 *   `siteTodayKey()`. A missing or malformed key makes `roundHasStarted` answer
 *   `false`, so an unidentifiable round reads as `missing` rather than as
 *   `elapsed` — the state that claims less.
 * @returns {Array<{id: string, state: 'live'|'elapsed'|'missing', live: object|null,
 *   dates: Array<string|Date>, type: string}>}
 */
export function chooseRounds(rows, content, todayKey) {
  const list = Array.isArray(rows) ? rows : [];

  // ABSENT MEANS 'upcoming'. Read `=== 'manual'`, never `!== 'upcoming'`: a
  // document stored before this field existed reads the key back ABSENT (a
  // `.lean()` read applies no defaults and JSON drops `undefined`), and the
  // negative test would send every one of them down the new branch. Round 39
  // recorded that trap; round 50 re-proved it.
  if (content?.source !== 'manual') return list.map(liveRow);

  const ids = Array.isArray(content?.roundIds) ? content.roundIds : [];
  const live = liveById(list);
  const snaps = snapshotById(content?.roundSnapshots);

  const out = [];
  for (const raw of ids) {
    if (typeof raw !== 'string' || raw === '') continue;
    const row = live.get(raw);
    if (row) { out.push(liveRow(row)); continue; }

    const snap = snaps.get(raw);
    const dates = Array.isArray(snap?.dates) ? snap.dates : [];
    out.push({
      id: raw,
      state: roundHasStarted(dates, todayKey) ? 'elapsed' : 'missing',
      live: null,
      dates,
      type: typeof snap?.type === 'string' ? snap.type : '',
    });
  }
  return out;
}
