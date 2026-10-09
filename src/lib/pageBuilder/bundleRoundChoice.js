/**
 * ── WHICH OFFERED ROUNDS A BUNDLE APPLICANT MAY PICK ───────────────────────
 *
 * A bundle item offers SEVERAL rounds of one course and the applicant picks
 * exactly one. This module answers, for every offered round, "may it be
 * picked, and if not why" — and the two questions built on top of that: is a
 * given set of picks valid, and is the bundle registrable at all.
 *
 * ── NO I/O, NO CLOCK ──────────────────────────────────────────────────────
 * `today` is a PARAMETER everywhere, never read in here. That is the rule the
 * rest of this repo already holds to (`chooseRounds`, `roundHasStarted`,
 * `formatRoundDays` all take a `todayKey`), and it is what lets the boundary
 * cases below — today === the deadline, today === the day after — be tested as
 * facts rather than as whatever the suite happened to run at. Callers get it
 * from `siteTodayKey()`, which is the one place a default `new Date()` lives.
 *
 * ── ONE DEFINITION OF "REGISTRABLE", ASSEMBLED FROM THE EXISTING PARTS ────
 * There is no single `isRegistrable(round)` in this codebase to import; the
 * public surfaces assemble it from three pieces, and this module uses the SAME
 * three rather than inventing a fourth:
 *
 *   · `normalizeScheduleStatus` (lib/scheduleStatus.js) — the status vocabulary
 *     is exactly ['open','nearly_full','full'] and anything else (closed,
 *     cancelled, an admin override, a value upstream invented this morning)
 *     normalises to `null`. So "not in the vocabulary" IS the closed test, and
 *     this module does not keep its own list of closed-ish words.
 *   · `full` is a status, not a seat count. `PUBLIC_SCHEDULE_STATUSES`
 *     deliberately INCLUDES `full` in the fetch so a surface can tell a visitor
 *     the round is sold out rather than hiding it; the registration page does
 *     exactly that. Same here: a full round stays visible and is not pickable.
 *   · `roundHasStarted(dates, today)` (lib/schedule/roundHasStarted.js) — the
 *     started/elapsed test, lexicographic on the day key.
 *
 * The STATUS HANDED IN IS ALWAYS LIVE. Callers resolve it through
 * `resolveScheduleStatusBatch`, which applies the admin override layer
 * (open → closed, scheduled changes) on top of what MSDB reported. A stored
 * `roundSnapshot` must never reach this module as a status: the snapshot shape
 * deliberately carries no `status` for that reason, and a round MSDB no longer
 * returns is `closed` here rather than "whatever it was when we saved it".
 */

import { roundFirstDayKey, roundLastDayKey, roundHasStarted } from '@/lib/schedule/roundHasStarted';
import { normalizeScheduleStatus } from '@/lib/scheduleStatus';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The ONE normaliser for a bundle item's offered rounds.
// Load-bearing: nothing parses on read, so a module that read `item.rounds`
// directly would see no rounds at all for every bundle currently stored.
import { offeredRoundsOf } from '@/lib/pageBuilder/chosenRounds';

/**
 * Why a round cannot be picked. Ordered by the PRECEDENCE the ruling asks for:
 * the schedule's own reasons first, then the deadline, then the sequence.
 *
 * The order matters because several can be true at once and the applicant is
 * shown one. A round that is full AND past its pick deadline is reported
 * `full`, because that is the fact about the world; `deadline_passed` is a fact
 * about this promotion and would read as our rule hiding theirs.
 */
export const PICK_REASONS = Object.freeze([
  'closed',
  'full',
  'started',
  'deadline_passed',
  'previous_not_picked',
  'before_previous',
]);

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` string, or null. */
function dayKeyOrNull(value) {
  return typeof value === 'string' && DAY_KEY_RE.test(value) ? value : null;
}

/**
 * The calendar day before `key`.
 *
 * ── THIS IS CALENDAR ARITHMETIC, NOT TIMEZONE MATH ───────────────────────
 * `key` is already a Bangkok calendar date — every caller gets it from
 * `siteTodayKey()` or from `roundFirstDayKey()`, both of which have done the
 * zone conversion. Stepping back one day from a date that is already local is
 * month- and leap-year arithmetic and nothing else, so `Date.UTC` is the right
 * tool: it does that arithmetic exactly and, because the value never leaves as
 * an instant, introduces no offset of its own.
 *
 * Writing it with a local `new Date(y, m, d)` instead WOULD introduce one — the
 * runner's zone — which is the trap the repo's own date helpers exist to avoid.
 */
export function previousDayKey(key) {
  const k = dayKeyOrNull(key);
  if (k === null) return null;
  const [y, m, d] = k.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) - 86400000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** The dates of an offered round — from its display snapshot, or the live row. */
function roundDates(round, live) {
  if (Array.isArray(live?.dates) && live.dates.length) return live.dates;
  const snap = round?.snapshot?.dates;
  return Array.isArray(snap) ? snap : [];
}

/**
 * The last day an offered round may be PICKED, as `YYYY-MM-DD` inclusive.
 *
 * ── EARLIEST OF THE TWO, ALWAYS ──────────────────────────────────────────
 * `pickUntil` is the author's own cut-off and the day before the round starts
 * is the structural one (a round you cannot attend from day one is not an
 * offer). The effective deadline is the EARLIER, which is what makes the
 * ruling's two halves consistent:
 *
 *   · empty `pickUntil`  → closes the day before the round starts;
 *   · `pickUntil` earlier → the author's date wins, the round closes sooner;
 *   · `pickUntil` LATER   → still closes the day before the round starts.
 *
 * The third case is why this is a `min` and not a `??`. The editor refuses such
 * a value at the field and `publishBlockers` refuses the publish, so it should
 * never be stored — but a directly-seeded document can carry anything, and the
 * rule a stored value must never be able to break is "pickUntil can only close
 * a round EARLIER, never extend it". Clamping at READ is what guarantees that
 * independently of every writer. Nothing is silently rewritten: the stored
 * value stays as typed and the author is told at the field.
 *
 * With no usable dates at all the round's structural cap is unknown, so the
 * author's date is the only thing that can speak — and if there is none either,
 * the answer is `null`, which `roundChoices` reads as "no deadline to fail".
 * Such a round is already `closed` on the live-status test, because a round
 * MSDB cannot return has no live row.
 */
export function effectivePickDeadline(round, live = null) {
  const first = roundFirstDayKey(roundDates(round, live));
  const cap = first === null ? null : previousDayKey(first);
  const authored = dayKeyOrNull(round?.pickUntil);
  if (cap === null) return authored;
  if (authored === null) return cap;
  return authored < cap ? authored : cap;
}

/** The latest `pickUntil` the editor and `publishBlockers` will accept. */
export function latestAllowedPickUntil(round, live = null) {
  const first = roundFirstDayKey(roundDates(round, live));
  return first === null ? null : previousDayKey(first);
}

/** Is a stored `pickUntil` later than the day before the round starts? */
export function pickUntilTooLate(round, live = null) {
  const authored = dayKeyOrNull(round?.pickUntil);
  const cap = latestAllowedPickUntil(round, live);
  if (authored === null || cap === null) return false;
  return authored > cap;
}

/** `liveStatusById` may be a Map or a plain object; read it one way. */
function liveOf(liveStatusById, roundId) {
  if (!roundId) return null;
  if (liveStatusById instanceof Map) return liveStatusById.get(roundId) ?? null;
  if (liveStatusById && typeof liveStatusById === 'object') {
    return liveStatusById[roundId] ?? null;
  }
  return null;
}

/**
 * An item's offered rounds, tolerant of a half-authored document.
 *
 * ── THIS DELEGATES, AND THE BUG IT FIXES WAS SEVERE ──────────────────────
 * It used to read `item.rounds` only. That is wrong for every bundle actually
 * stored: all 91 items carry the LEGACY `roundId`, nothing parses on read, and
 * so this module saw zero offered rounds for all of them — which made
 * `bundleRegistrable` answer false and would have AUTO-CLOSED every existing
 * bundle on the public card the moment the card started asking.
 *
 * Caught by a card test whose fixture used the legacy shape. The lesson is the
 * one `offeredRoundsOf`'s own note already states and this module did not
 * follow: EVERY reader has to normalise, because the preprocess only runs on
 * save. So it delegates rather than keeping a second, narrower answer.
 *
 * No cycle: `chosenRounds` imports only `lib/schedule/roundHasStarted`.
 */
function offeredRounds(item) {
  return offeredRoundsOf(item).filter((r) => r && typeof r === 'object');
}

const roundIdOf = (round) => String(round?.id ?? '').trim();

/**
 * The reason this round cannot be picked, or `null` if it can.
 *
 * `prevLastDay` is the last day of the round picked for the PREVIOUS item, or
 * `null` when there is no previous item / the bundle is not sequential.
 * `locked` says the previous item has no pick yet.
 */
function reasonFor({ round, live, today, locked, prevLastDay }) {
  // 1. The schedule's own reasons. A round with no live row is closed: the
  //    status is always live, so "not returned" is not "assume it is fine".
  if (live === null) return 'closed';

  /**
   * ── `closed` IS READ FROM THE RAW STATUS, BEFORE NORMALISING, AND WHY ───
   * MEASURED, because it contradicts the obvious reading of the code:
   * `normalizeScheduleStatus` ALIASES `closed` to `full`
   * (lib/scheduleStatus.js, ALIASES). That alias is deliberate and correct for
   * what it was written for — its note says mapping them "stops a full session
   * from rendering as green", i.e. it is a BADGE-COLOUR decision, and for a
   * badge the two really are the same amber-to-red treatment.
   *
   * It is not the right answer here. The ruling asks for `closed` and `full` as
   * separate reasons because the applicant is told different things — ปิดรับ
   * means the organiser shut the round, เต็ม means other people took the seats,
   * and one of those might reopen. So the raw word is checked first.
   *
   * THIS IS NOT A SECOND DEFINITION OF REGISTRABLE. Both answers are "not
   * pickable" and the normaliser is still the gate for everything else — what
   * forks here is only the label. Had this instead kept its own list of
   * closed-ish words, a status upstream added tomorrow would be registrable
   * here and not elsewhere; by falling through to `normalizeScheduleStatus`,
   * anything outside the three-value vocabulary is still refused.
   */
  if (typeof live?.status === 'string' && live.status.trim().toLowerCase() === 'closed') {
    return 'closed';
  }
  const status = normalizeScheduleStatus(live?.status);
  if (status === null) return 'closed';
  if (status === 'full') return 'full';
  if (roundHasStarted(roundDates(round, live), today)) return 'started';

  // 2. This promotion's own cut-off.
  const deadline = effectivePickDeadline(round, live);
  if (deadline !== null && dayKeyOrNull(today) !== null && today > deadline) {
    return 'deadline_passed';
  }

  // 3. The sequence. Last, because it is the most recoverable — the applicant
  //    can change an earlier pick and come back.
  if (locked) return 'previous_not_picked';
  if (prevLastDay !== null) {
    const first = roundFirstDayKey(roundDates(round, live));
    // STRICTLY after: a round starting the same day the previous one ends is
    // not pickable. Two courses on one day is a clash, not a tight schedule.
    if (first === null || first <= prevLastDay) return 'before_previous';
  }
  return null;
}

/**
 * Every item's options, in item order, given the picks made so far.
 *
 * @param {object} args
 * @param {Array<object>} args.items `content.items`, in the author's order
 * @param {boolean} args.sequential `content.sequential`
 * @param {Map<string,{status?:string,dates?:Array}>|object} args.liveStatusById
 *   LIVE status per round id, already through `resolveScheduleStatusBatch`
 * @param {Record<string,string>|Map<string,string>} args.picks itemId → roundId
 * @param {string} args.today Bangkok calendar date, `'YYYY-MM-DD'`
 * @returns {Array<{itemId: string, locked: boolean,
 *   options: Array<{roundId: string, pickable: boolean, reason: string|null,
 *   deadline: string|null}>}>}
 *
 * ── `deadline` HAS NO RENDERER LEFT, AND IS KEPT ANYWAY ────────────────────
 * Stated rather than left for someone to discover. Its one reader drew
 * `ยืนยันรอบนี้ได้ถึง <date>` on the wizard's pick step, and that line is gone:
 * the pick deadline is not shown to applicants, which is the ruling the public
 * bundle card already followed. The round's own CARD never showed it either.
 *
 * The field is NOT removed with the line, and the distinction is which half of
 * this function does the work. `deadline` is the value `reasonFor` already
 * compared against `today` to answer `deadline_passed` — the enforcement the
 * greyed chip, the server's re-validation and `bundleRegistrable`'s auto-close
 * all rest on. Reporting it beside the verdict is what makes that verdict
 * checkable: test/pure/bundleRoundChoice pins it directly ("the reported
 * deadline is the EFFECTIVE one, not the stored one"), which is the one
 * assertion that can tell a correct deadline from a correct-looking one.
 *
 * So this is a field whose readers are a test and a rule, not a field with no
 * reader. If a future round wants it gone, `effectivePickDeadline` is the thing
 * to keep — the editor calls it directly for the author, who DOES act on the
 * date.
 */
export function roundChoices({ items, sequential = false, liveStatusById, picks, today }) {
  const list = Array.isArray(items) ? items : [];
  const pickOf = (itemId) => {
    if (picks instanceof Map) return String(picks.get(itemId) ?? '').trim();
    if (picks && typeof picks === 'object') return String(picks[itemId] ?? '').trim();
    return '';
  };

  const out = [];
  // The last day of the previous item's PICKED round. `undefined` means "no
  // constraint" (non-sequential, or the first item); `null` means "the previous
  // item has no pick", which locks this one.
  let prevLastDay;
  let locked = false;

  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const itemId = String(item?.id ?? '').trim();
    const rounds = offeredRounds(item);

    const options = rounds.map((round) => {
      const roundId = roundIdOf(round);
      const live = liveOf(liveStatusById, roundId);
      const reason = reasonFor({
        round,
        live,
        today,
        locked: sequential && locked,
        prevLastDay: sequential && prevLastDay !== undefined ? prevLastDay : null,
      });
      return {
        roundId,
        pickable: reason === null,
        reason,
        deadline: effectivePickDeadline(round, live),
      };
    });

    out.push({ itemId, locked: sequential && locked, options });

    if (sequential) {
      const picked = pickOf(itemId);
      const pickedRound = picked ? rounds.find((r) => roundIdOf(r) === picked) : undefined;
      if (!pickedRound) {
        // No usable pick here, so everything after this is locked.
        locked = true;
        prevLastDay = null;
      } else {
        const live = liveOf(liveStatusById, picked);
        prevLastDay = roundLastDayKey(roundDates(pickedRound, live));
        // A picked round whose dates nobody can read cannot constrain the next
        // course, and treating that as "no constraint" would let a later round
        // slip in front of it. Lock instead.
        if (prevLastDay === null) { locked = true; }
      }
    }
  }
  return out;
}

/**
 * Are these picks a complete, valid set?
 *
 * Used by BOTH the wizard (to enable submit) and the server (to accept the
 * write). One function, so the two cannot disagree about what is allowed — the
 * failure the whole module is shaped to prevent, because the wizard runs on a
 * page that may be an hour stale and the server is the authority.
 *
 * @returns {{ok: true} | {ok: false, errors: Array<{itemId: string, reason: string}>}}
 */
export function validateBundlePicks({ items, sequential = false, liveStatusById, picks, today }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return { ok: false, errors: [{ itemId: '', reason: 'no_items' }] };

  const choices = roundChoices({ items: list, sequential, liveStatusById, picks, today });
  const pickOf = (itemId) => {
    if (picks instanceof Map) return String(picks.get(itemId) ?? '').trim();
    if (picks && typeof picks === 'object') return String(picks[itemId] ?? '').trim();
    return '';
  };

  const errors = [];
  for (const row of choices) {
    const picked = pickOf(row.itemId);
    if (!picked) { errors.push({ itemId: row.itemId, reason: 'not_picked' }); continue; }
    const option = row.options.find((o) => o.roundId === picked);
    // A pick that is not among the offered rounds is the shape a tampered
    // payload takes, and it is NOT the same error as an unpickable one.
    if (!option) { errors.push({ itemId: row.itemId, reason: 'not_offered' }); continue; }
    if (!option.pickable) errors.push({ itemId: row.itemId, reason: option.reason });
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Does ANY complete valid set of picks exist?
 *
 * This is the auto-close question: a bundle nobody can complete must not offer
 * a register button, however many rounds it lists.
 *
 * ── NON-SEQUENTIAL IS PER-COURSE AND INDEPENDENT ─────────────────────────
 * Every item simply needs one pickable round; no item's choice constrains
 * another's.
 *
 * ── SEQUENTIAL IS GREEDY, AND THE GREEDY ANSWER IS EXACT ─────────────────
 * Walk the items in order and take, at each step, the pickable round with the
 * EARLIEST LAST DAY. If that walk completes, a chain exists; if it gets stuck,
 * none does.
 *
 * The second half is the part worth arguing, because "greedy therefore
 * approximate" is the usual reading and it is wrong here. The only way an
 * earlier pick affects a later one is through its LAST DAY: a later round is
 * pickable iff its first day is strictly after it. So a pick with an earlier
 * last day permits a SUPERSET of what any later-ending pick permits — the
 * constraint is monotone. Exchange argument: given any valid chain, replacing
 * its first pick with the earliest-ending pickable round keeps every subsequent
 * pick legal (the constraint only loosened), and by induction the greedy chain
 * is valid whenever any chain is. So greedy failing proves no chain exists.
 *
 * What this does NOT do is choose FOR the applicant — it only answers whether
 * a choice is possible. The applicant's own picks go through
 * `validateBundlePicks`.
 */
export function bundleRegistrable({ items, sequential = false, liveStatusById, today }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return false;

  if (!sequential) {
    return list.every((item) => {
      const rounds = offeredRounds(item);
      if (rounds.length === 0) return false;
      return rounds.some((round) => {
        const live = liveOf(liveStatusById, roundIdOf(round));
        return reasonFor({ round, live, today, locked: false, prevLastDay: null }) === null;
      });
    });
  }

  let prevLastDay = null;
  for (let i = 0; i < list.length; i += 1) {
    const rounds = offeredRounds(list[i]);
    if (rounds.length === 0) return false;

    let bestLast = null;
    for (const round of rounds) {
      const live = liveOf(liveStatusById, roundIdOf(round));
      const reason = reasonFor({
        round, live, today, locked: false, prevLastDay: i === 0 ? null : prevLastDay,
      });
      if (reason !== null) continue;
      const last = roundLastDayKey(roundDates(round, live));
      // A pickable round with unreadable dates cannot anchor the chain — the
      // same reason roundChoices locks on one.
      if (last === null) continue;
      if (bestLast === null || last < bestLast) bestLast = last;
    }
    if (bestLast === null) return false;
    prevLastDay = bestLast;
  }
  return true;
}

/**
 * The picks that are no longer valid once an earlier one changes, so the
 * applicant can be TOLD which were cleared rather than finding them gone.
 *
 * Walks in item order and drops a pick the moment it stops satisfying the rule,
 * which also clears everything after it that depended on it. Returns the kept
 * picks and the cleared item ids.
 *
 * @returns {{picks: Record<string,string>, cleared: string[]}}
 */
export function prunePicks({ items, sequential = false, liveStatusById, picks, today }) {
  const list = Array.isArray(items) ? items : [];
  const read = (itemId) => {
    if (picks instanceof Map) return String(picks.get(itemId) ?? '').trim();
    if (picks && typeof picks === 'object') return String(picks[itemId] ?? '').trim();
    return '';
  };

  const kept = {};
  const cleared = [];
  for (let i = 0; i < list.length; i += 1) {
    const itemId = String(list[i]?.id ?? '').trim();
    const picked = read(itemId);
    if (!picked) continue;
    // Re-ask with only the picks kept SO FAR. That is what makes the cascade
    // work: an earlier pick that was cleared is absent from `kept`, so the
    // items after it see `previous_not_picked` and are cleared in turn.
    const row = roundChoices({ items: list, sequential, liveStatusById, picks: kept, today })[i];
    const option = row?.options?.find((o) => o.roundId === picked);
    if (option?.pickable) kept[itemId] = picked;
    else cleared.push(itemId);
  }
  return { picks: kept, cleared };
}
