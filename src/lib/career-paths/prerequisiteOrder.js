/**
 * Career-path course codes, group rules and prerequisite pairs — pure, shared by the public
 * pick step (CareerPathRegisterClient) and the server re-check
 * (createCareerPathRegistration). No imports, no I/O.
 *
 * ── CODES HAVE NO CANONICAL CASING ─────────────────────────────────────────
 * A curriculum item carries the code it was synced with (`Power-Apps`) while
 * upstream may now spell it `POWER-APPS`; see getCourseByCodeInsensitive in
 * lib/api/public-courses for why neither spelling is wrong. Course resolution
 * goes through that function, and everything that MATCHES one code against
 * another — a prerequisite against a pick, a stored code against a resolved one
 * — goes through `courseCodeKey` here. Exact-except-case, nothing fuzzier.
 */

// ── Round dates ──────────────────────────────────────────────────
// MOVED here from CareerPathRegisterClient so the pick step and the server
// read a round's span through the same four functions. Unchanged.

export function sortedDates(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return [];
  return [...dates].filter(Boolean).sort();
}

export function minDateOf(dates) {
  const s = sortedDates(dates);
  return s.length ? s[0] : null;
}

export function maxDateOf(dates) {
  const s = sortedDates(dates);
  return s.length ? s[s.length - 1] : null;
}

// ISO `YYYY-MM-DD` strings sort lexicographically — same order as time,
// so `'2026-05-23' > '2026-05-22'` does the right thing.
export function isAfter(a, b) {
  if (!a || !b) return false;
  return a > b;
}

/**
 * A round's first / last DAY as `YYYY-MM-DD`. Upstream sends midnight-UTC
 * datetimes (`2026-11-09T00:00:00.000Z`); the pair rule compares DAYS, so the
 * time part is cut rather than compared — a round ending at 00:00 and one
 * starting at 09:00 the same day is the same day. `null` when there are none.
 */
export function roundStartDay(dates) {
  const m = minDateOf(dates);
  return m ? String(m).slice(0, 10) : null;
}

export function roundEndDay(dates) {
  const m = maxDateOf(dates);
  return m ? String(m).slice(0, 10) : null;
}

/**
 * One date as a Bangkok `YYYY-MM-DD` day, for the stored `startDate` /
 * `endDate` of a registration row — a readable day, not upstream's datetime.
 * Bangkok has no DST, so a fixed +07:00 is exact. A bare day string passes
 * through; anything unparseable is `null`.
 */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
export function bangkokDayKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** The comparison key for a course code: exact except for case. */
export function courseCodeKey(code) {
  return String(code ?? '').toLowerCase();
}

// ── Curriculum ───────────────────────────────────────────────────
// MOVED here from CareerPathRegisterClient, unchanged, so the server
// re-check applies the same group rules the pick step does.

export function itemCode(item) {
  return String(item?.snap?.code ?? item?.course_id ?? '');
}

export function isChoiceGroup(group) {
  return String(group?.kind ?? '').toLowerCase() === 'choice';
}

export function groupItems(group) {
  return Array.isArray(group?.items) ? group.items : [];
}

// Hybrid picks are stored with `type: 'hybrid'` until the user resolves
// them to Classroom or MS Teams (at which point `type` becomes
// "Hybrid (Classroom)" / "Hybrid (MS Teams)"). Unresolved picks must
// not count toward group completion.
export function isPickResolved(sel) {
  return Boolean(sel) && String(sel?.type ?? '').toLowerCase() !== 'hybrid';
}

// A group is "satisfied" when its own selection threshold is met. Used
// to decide whether the NEXT group's overlay should unlock.
export function isGroupSatisfied(group, selected) {
  const items = groupItems(group);
  if (items.length === 0) return true; // nothing to pick, treat as done
  const picks = items.filter((it) => isPickResolved(selected[itemCode(it)])).length;
  if (isChoiceGroup(group)) {
    return picks >= Math.max(1, Number(group?.chooseMin) || 1);
  }
  return picks === items.length;
}

/**
 * Rewrite a curriculum so every item code and every prerequisite code is the
 * CANONICAL resolved code. Returns a new array; the input is not mutated, and
 * nothing here is ever written back to the stored document.
 *
 * @param {Array} curriculum  career_paths.curriculum
 * @param {Map<string,string>} canonicalByCode  stored item code → resolved `course_id`
 *   (codes that did not resolve are simply absent and keep their own spelling)
 */
export function canonicaliseCurriculumCodes(curriculum, canonicalByCode) {
  const byKey = new Map();
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const code = itemCode(it);
      if (code && !byKey.has(courseCodeKey(code))) byKey.set(courseCodeKey(code), code);
    }
  }
  for (const [code, canonical] of canonicalByCode ?? []) {
    if (code && canonical) byKey.set(courseCodeKey(code), String(canonical));
  }
  const canon = (code) => byKey.get(courseCodeKey(code)) ?? String(code);

  return (Array.isArray(curriculum) ? curriculum : []).map((g) => ({
    ...g,
    items: (Array.isArray(g?.items) ? g.items : []).map((it) => {
      const code = itemCode(it);
      const next = { ...it };
      if (code) {
        if (it?.snap?.code != null) next.snap = { ...it.snap, code: canon(code) };
        if (it?.course_id != null) next.course_id = canon(code);
      }
      if (Array.isArray(it?.prerequisites)) {
        next.prerequisites = it.prerequisites.map((p) => canon(p));
      }
      return next;
    }),
  }));
}

// ── Prerequisite pairs ───────────────────────────────────────────
//
// THE RULE. Course D lists course P under "ต้องเรียนก่อน". When BOTH are
// picked, D's round must START strictly after P's round ENDS — by day, so the
// same day or any overlap is a violation. A round with no dates cannot satisfy
// a pair it is part of. An unpicked P imposes nothing on D (it may simply not
// have been chosen in a Choice group), and chains A → B → C hold because every
// pair is checked on its own.

/**
 * Every (dependent, prerequisite) pair in the curriculum, both as spelled on
 * their curriculum items. A prerequisite code is matched to an item without
 * regard to case; one that names no item in this path, or the item itself,
 * is ignored.
 *
 * @returns {Array<{ dependent: string, prerequisite: string }>}
 */
export function prerequisitePairs(curriculum) {
  const byKey = new Map();
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const code = itemCode(it);
      if (code && !byKey.has(courseCodeKey(code))) byKey.set(courseCodeKey(code), code);
    }
  }
  const pairs = [];
  const seen = new Set();
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const dependent = itemCode(it);
      if (!dependent || !Array.isArray(it?.prerequisites)) continue;
      for (const p of it.prerequisites) {
        const prerequisite = byKey.get(courseCodeKey(p));
        if (!prerequisite || courseCodeKey(prerequisite) === courseCodeKey(dependent)) continue;
        const id = `${courseCodeKey(dependent)}|${courseCodeKey(prerequisite)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        pairs.push({ dependent, prerequisite });
      }
    }
  }
  return pairs;
}

/** Does a dependent round (by its dates) come strictly after a prerequisite round? */
export function pairHolds(dependentDates, prerequisiteDates) {
  return isAfter(roundStartDay(dependentDates), roundEndDay(prerequisiteDates));
}

function pickLookup(picks) {
  const byKey = new Map();
  for (const [code, pick] of Object.entries(picks ?? {})) {
    if (pick) byKey.set(courseCodeKey(code), pick);
  }
  return (code) => byKey.get(courseCodeKey(code)) ?? null;
}

/**
 * Pairs whose BOTH courses are picked and whose rounds break the rule.
 *
 * @param {Array} curriculum
 * @param {Record<string, { dates?: string[] }>} picks  course code → picked round
 * @returns {Array<{ dependent: string, prerequisite: string }>}
 */
export function pairViolations(curriculum, picks) {
  const pickOf = pickLookup(picks);
  return prerequisitePairs(curriculum).filter(({ dependent, prerequisite }) => {
    const d = pickOf(dependent);
    const p = pickOf(prerequisite);
    // A transfer on EITHER side takes the pair out of the rule: a transferred
    // prerequisite is already satisfied, and a transferred dependent is not
    // checked against its own prerequisites.
    if (isTransfer(d) || isTransfer(p)) return false;
    return d && p && !pairHolds(d.dates, p.dates);
  });
}

/**
 * Would picking a round with `dates` for course `code` break a pair against the
 * OTHER current picks? Returns the first blocking pick, or null when allowed.
 *
 *   needs: 'after'  — `code` is the dependent; it must start after `code`'s blocker ends
 *   needs: 'before' — `code` is the prerequisite; it must end before the blocker starts
 *
 * A counterpart picked as a transfer never blocks (see `pairViolations`).
 *
 * @returns {{ code: string, needs: 'after' | 'before' } | null}
 */
export function roundBlocker(curriculum, picks, code, dates) {
  const pickOf = pickLookup(picks);
  const self = courseCodeKey(code);
  for (const { dependent, prerequisite } of prerequisitePairs(curriculum)) {
    if (courseCodeKey(dependent) === self) {
      const p = pickOf(prerequisite);
      if (p && !isTransfer(p) && !pairHolds(dates, p.dates)) return { code: prerequisite, needs: 'after' };
    } else if (courseCodeKey(prerequisite) === self) {
      const d = pickOf(dependent);
      if (d && !isTransfer(d) && !pairHolds(d.dates, dates)) return { code: dependent, needs: 'before' };
    }
  }
  return null;
}

// ── Transfer Module ──────────────────────────────────────────────
//
// A learner who already attended a course in the path may TRANSFER it instead
// of picking a future round. A transfer is an ordinary entry in the picks with
// `type: 'transfer'`, `scheduleId` = the PAST round attended and that round's
// dates. It counts as picked for the group rules (`isPickResolved` — its type
// is not 'hybrid'), it is outside every prerequisite pair, and it is judged by:
//
//   · the round has ENDED — its last day is before today;
//   · its last day is on/after today − 1 year (inclusive, Bangkok day keys);
//   · at most `maxTransfers(curriculum)` per registration, and at least one
//     picked course is NOT a transfer.
//
// Every ended round counts as attended; a cancelled round cannot be told apart
// upstream and is not special-cased.
//
// A MANUAL transfer (`transferManual: true`, `scheduleId: null`) is one whose
// round the learner typed as two days because it was not in the past-round
// list. It is judged by `manualTransferRoundError` on those days instead of a
// past-round lookup, and is otherwise an ordinary transfer.

export const TRANSFER_OUT_OF_WINDOW_MESSAGE =
  'รอบอบรมนี้เกินระยะเวลาที่กำหนด จึงไม่สามารถใช้สิทธิ์ Transfer Module ได้';

/** The pick step's hint once no further transfer is possible. */
export const TRANSFER_LIMIT_HINT = 'ต้องสมัครเรียนอย่างน้อย 1 หลักสูตร';

/** The server's refusal of a selection with too many transfers. */
export const TRANSFER_LIMIT_MESSAGE =
  'ต้องสมัครเรียนอย่างน้อย 1 หลักสูตร ไม่สามารถใช้สิทธิ์ Transfer ได้ครบทุกหลักสูตร';

export function isTransfer(pick) {
  return String(pick?.type ?? '').toLowerCase() === 'transfer';
}

export function isManualTransfer(pick) {
  return isTransfer(pick) && pick?.transferManual === true;
}

/**
 * How many transfers a registration may hold: one fewer than the smallest
 * complete selection (every Fixed course + each Choice group's `chooseMin`),
 * so at least one course is always actually attended. Never below 0.
 */
export function maxTransfers(curriculum) {
  let n = 0;
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    if (isChoiceGroup(g)) n += Math.max(1, Number(g?.chooseMin) || 1);
    else n += groupItems(g).length;
  }
  return Math.max(0, n - 1);
}

/** Is at least one pick in `picks` something other than a transfer? */
export function hasNonTransferPick(picks) {
  return Object.values(picks ?? {}).some((p) => p && !isTransfer(p));
}

/**
 * The per-selection transfer limit: over `maxTransfers`, or transfers and
 * nothing else. `null` when the selection stands (or holds no transfer).
 */
export function transferLimitError(curriculum, picks) {
  const n = Object.values(picks ?? {}).filter(isTransfer).length;
  if (n === 0) return null;
  if (n > maxTransfers(curriculum) || !hasNonTransferPick(picks)) return TRANSFER_LIMIT_MESSAGE;
  return null;
}

/**
 * `todayKey` moved by whole years, as a `YYYY-MM-DD` day key. A Feb 29 that
 * lands on a non-leap year becomes Feb 28. `null` for a malformed key.
 */
export function shiftYearsKey(todayKey, years) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(todayKey ?? ''));
  if (!m) return null;
  const y = Number(m[1]) + years;
  let day = m[3];
  if (m[2] === '02' && day === '29') {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (!leap) day = '28';
  }
  return `${y}-${m[2]}-${day}`;
}

/** The earliest LAST day a transferable round may have: today − 1 year, inclusive. */
export function transferWindowStart(todayKey) {
  return shiftYearsKey(todayKey, -1);
}

/**
 * May a past round with these dates be transferred today? False for a round
 * with no dates, one that has not ended (last day today or later), or one that
 * ended before the window.
 *
 * @param {string[]} dates
 * @param {string} todayKey  `siteTodayKey()` — Bangkok
 */
export function transferRoundAllowed(dates, todayKey) {
  const end = roundEndDay(dates);
  const start = transferWindowStart(todayKey);
  if (!end || !start) return false;
  return end < todayKey && end >= start;
}

// ── Manual transfer rounds ───────────────────────────────────────

/** The longest round a learner may type: 7 training days, i.e. end − start ≤ 6. */
export const MANUAL_TRANSFER_MAX_SPAN_DAYS = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A real calendar day as `YYYY-MM-DD` → its UTC midnight ms; else `null`. */
function dayKeyMs(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ''));
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().slice(0, 10) === key ? ms : null;
}

/** `key` moved by whole days, as a `YYYY-MM-DD` day key. `null` for a malformed key. */
export function shiftDaysKey(key, days) {
  const ms = dayKeyMs(key);
  return ms === null ? null : new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

/** Every day from `start` to `end` inclusive, as `YYYY-MM-DD`; `[]` when either is malformed or start > end. */
export function dayRangeKeys(start, end) {
  const a = dayKeyMs(start);
  const b = dayKeyMs(end);
  if (a === null || b === null || a > b) return [];
  const out = [];
  for (let t = a; t <= b; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Why a typed round (first / last day, `YYYY-MM-DD`) cannot be transferred
 * today, as a Thai sentence — or `null` when it can. Shared by the pick step's
 * form and the server.
 */
export function manualTransferRoundError(start, end, todayKey) {
  if (!start || !end) return 'กรุณาระบุวันเริ่มอบรมและวันสุดท้ายของการอบรม';
  const a = dayKeyMs(start);
  const b = dayKeyMs(end);
  if (a === null || b === null) return 'รูปแบบวันที่ไม่ถูกต้อง';
  if (a > b) return 'วันเริ่มอบรมต้องไม่อยู่หลังวันสุดท้ายของการอบรม';
  if (!(end < todayKey)) return 'รอบอบรมต้องจบก่อนวันนี้ จึงจะใช้สิทธิ์ Transfer Module ได้';
  const windowStart = transferWindowStart(todayKey);
  if (!windowStart || end < windowStart) return TRANSFER_OUT_OF_WINDOW_MESSAGE;
  if ((b - a) / DAY_MS > MANUAL_TRANSFER_MAX_SPAN_DAYS) return 'ช่วงวันที่อบรมยาวเกินไป กรุณาตรวจสอบอีกครั้ง';
  return null;
}

/**
 * Server check of every transfer in `picks`. `pastByCourse` is the past-round
 * loader's output keyed by canonical course code; the pick's own dates are NOT
 * judged — only the past round its `scheduleId` names. A manual transfer has no
 * past round: its `startDate` / `endDate` are judged by
 * `manualTransferRoundError` instead.
 *
 * @returns {Array<{ code: string | null, message: string }>}  empty when they stand
 */
export function transferViolations(curriculum, picks, pastByCourse, todayKey) {
  const out = [];
  const transfers = Object.entries(picks ?? {}).filter(([, pick]) => isTransfer(pick));
  const limit = transferLimitError(curriculum, picks);
  if (limit) out.push({ code: null, message: limit });

  const inPath = new Set();
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    for (const it of groupItems(g)) {
      const c = itemCode(it);
      if (c) inPath.add(courseCodeKey(c));
    }
  }
  const pastOf = new Map(
    Object.entries(pastByCourse ?? {}).map(([c, rows]) => [courseCodeKey(c), Array.isArray(rows) ? rows : []])
  );

  for (const [code, pick] of transfers) {
    if (!inPath.has(courseCodeKey(code))) {
      out.push({
        code,
        message: `หลักสูตร ${code} ไม่อยู่ใน Career Path นี้ จึงไม่สามารถใช้สิทธิ์ Transfer Module ได้`,
      });
      continue;
    }
    if (isManualTransfer(pick)) {
      const message = manualTransferRoundError(pick.startDate, pick.endDate, todayKey);
      if (message) out.push({ code, message });
      continue;
    }
    const round = (pastOf.get(courseCodeKey(code)) ?? []).find(
      (r) => String(r?.scheduleId ?? '') === String(pick?.scheduleId ?? '')
    );
    if (!round) {
      out.push({ code, message: `ไม่พบรอบอบรมที่เลือกสำหรับ Transfer Module ของ ${code} กรุณาเลือกรอบใหม่` });
      continue;
    }
    const end = roundEndDay(round.dates);
    if (!end || !(end < todayKey)) {
      out.push({ code, message: `รอบอบรมของ ${code} ยังไม่จบ จึงไม่สามารถใช้สิทธิ์ Transfer Module ได้` });
      continue;
    }
    if (!transferRoundAllowed(round.dates, todayKey)) {
      out.push({ code, message: TRANSFER_OUT_OF_WINDOW_MESSAGE });
    }
  }
  return out;
}

/**
 * Restore-time pruning of stored transfer picks (the pick step's draft). A
 * transfer survives only while its `scheduleId` is still one of that course's
 * past rounds AND that round is still inside the window — a manual transfer,
 * while `manualTransferRoundError` still passes for today; past
 * `maxTransfers`, the first ones in CURRICULUM ORDER are kept, and when every
 * remaining pick is a transfer the last one in course order goes too.
 * Non-transfer picks are returned untouched — they have their own restore rules.
 *
 * @returns {{ picks: object, dropped: boolean }}  a new picks object
 */
export function pruneTransferPicks(curriculum, picks, pastByCourse, todayKey) {
  const order = new Map();
  let i = 0;
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    for (const it of groupItems(g)) {
      const c = itemCode(it);
      if (c && !order.has(courseCodeKey(c))) order.set(courseCodeKey(c), i++);
    }
  }
  const pastOf = new Map(
    Object.entries(pastByCourse ?? {}).map(([c, rows]) => [courseCodeKey(c), Array.isArray(rows) ? rows : []])
  );
  const rank = (c) => order.get(courseCodeKey(c)) ?? Number.POSITIVE_INFINITY;

  const out = { ...(picks ?? {}) };
  let dropped = false;
  const limit = maxTransfers(curriculum);
  const kept = [];
  const transferCodes = Object.keys(out)
    .filter((c) => isTransfer(out[c]))
    .sort((a, b) => rank(a) - rank(b));
  for (const code of transferCodes) {
    const pick = out[code];
    let ok;
    if (isManualTransfer(pick)) {
      ok = manualTransferRoundError(pick.startDate, pick.endDate, todayKey) === null;
    } else {
      const round = (pastOf.get(courseCodeKey(code)) ?? []).find(
        (r) => String(r?.scheduleId ?? '') === String(pick?.scheduleId ?? '')
      );
      ok = Boolean(round) && transferRoundAllowed(round.dates, todayKey);
    }
    if (!ok || kept.length >= limit) {
      delete out[code];
      dropped = true;
    } else {
      kept.push(code);
    }
  }
  // Only a COMPLETE selection is judged here: a half-made draft holding just a
  // transfer is still on its way to a non-transfer pick.
  const complete = (Array.isArray(curriculum) ? curriculum : []).every((g) => isGroupSatisfied(g, out));
  if (kept.length && complete && !hasNonTransferPick(out)) {
    delete out[kept[kept.length - 1]];
    dropped = true;
  }
  return { picks: out, dropped };
}

// ── Server: resolving a submitted registration ──────────────────

const HYBRID_RESOLVED = /^hybrid \((classroom|ms teams)\)$/i;

/**
 * The server's whole judgement of a submitted `selectedCourses`, as one pure
 * function so it can be tested without a network. Every pick is resolved to the
 * LIVE round it names — a future round for an ordinary pick, a past round for a
 * transfer — and is judged on that round alone. On success the courses come
 * back with `dates`, `startDate`, `endDate`, `round` and `type` REWRITTEN from
 * the live round: nothing the browser sent about a round's days is stored.
 *
 *   · ordinary pick whose round is not offered   → "… ไม่เปิดรับสมัครแล้ว"
 *   · any transfer problem                       → transferViolations' message
 *     (a transfer is never reported as "ไม่เปิดรับสมัครแล้ว")
 *   · a group not satisfied
 *   · a prerequisite pair broken (pairs with a transfer are skipped)
 *
 * `type` of an ordinary pick is the live round's type, except that a hybrid
 * round keeps the payload's resolved sub-mode ("Hybrid (Classroom)" /
 * "Hybrid (MS Teams)") — that is the learner's choice, not round data, and
 * without it the group rule would read the pick as unresolved.
 *
 * @param {object} o
 * @param {Array} o.curriculum            canonical (getCareerPathWithSchedules)
 * @param {object} o.schedulesByCourse    future rounds, `{ _id, dates, type }`
 * @param {object} o.pastByCourse         past rounds (getCareerPathPastSchedules)
 * @param {Array} o.selectedCourses       the payload's rows
 * @param {string} o.todayKey             Bangkok `YYYY-MM-DD`
 * @param {(dates: string[]) => string} o.formatRound  the stored/printed label
 * @returns {{ error: string } | { picks: object, selectedCourses: Array }}
 */
export function resolveSubmittedPicks({
  curriculum,
  schedulesByCourse,
  pastByCourse,
  selectedCourses,
  todayKey,
  formatRound,
}) {
  const codeByKey = new Map();
  const nameOf = {};
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    for (const it of groupItems(g)) {
      const code = itemCode(it);
      if (!code) continue;
      codeByKey.set(courseCodeKey(code), code);
      nameOf[code] = String(it?.snap?.name ?? it?.externalName ?? code);
    }
  }
  const label = (dates) => (typeof formatRound === 'function' ? formatRound(dates) : '');
  const pastOf = new Map(
    Object.entries(pastByCourse ?? {}).map(([c, rows]) => [courseCodeKey(c), Array.isArray(rows) ? rows : []])
  );

  const rows = Array.isArray(selectedCourses) ? selectedCourses : [];
  const picks = {};
  const live = []; // per row: { code, dates, type }

  for (const sel of rows) {
    const code = codeByKey.get(courseCodeKey(sel?.courseCode)) ?? null;

    if (isTransfer(sel)) {
      // Judged below by transferViolations; a code outside the path keeps its
      // own spelling so the message can name it.
      const key = code ?? String(sel?.courseCode ?? '');
      picks[key] =
        sel?.transferManual === true
          ? {
              type: 'transfer',
              transferManual: true,
              startDate: String(sel?.startDate ?? ''),
              endDate: String(sel?.endDate ?? ''),
            }
          : { type: 'transfer', scheduleId: String(sel?.scheduleId ?? '') };
      live.push({ code: key, transfer: true, manual: sel?.transferManual === true });
      continue;
    }

    const round = code
      ? (schedulesByCourse?.[code] ?? []).find(
          (s) => String(s?._id ?? '') === String(sel?.scheduleId ?? '')
        )
      : null;
    if (!round) {
      const name = code ? nameOf[code] : sel?.courseName || sel?.courseCode || '';
      return { error: `รอบ ${sel?.round || ''} ของ ${name} ไม่เปิดรับสมัครแล้ว กรุณาเลือกรอบใหม่` };
    }
    const dates = Array.isArray(round.dates) ? round.dates.map(String) : [];
    const liveType = String(round.type ?? '').toLowerCase();
    const type =
      liveType === 'hybrid' && HYBRID_RESOLVED.test(String(sel?.type ?? ''))
        ? String(sel.type)
        : liveType;
    picks[code] = { dates, type };
    live.push({ code, dates, type });
  }

  const transferProblems = transferViolations(curriculum, picks, pastByCourse, todayKey);
  if (transferProblems.length) return { error: transferProblems[0].message };
  // Every transfer is now a known past round of a course in the path: take its
  // days from that round. A manual transfer's days are every day of its
  // (already validated) typed range.
  for (const row of live) {
    if (!row.transfer) continue;
    if (row.manual) {
      row.dates = dayRangeKeys(picks[row.code].startDate, picks[row.code].endDate);
    } else {
      const past = (pastOf.get(courseCodeKey(row.code)) ?? []).find(
        (r) => String(r?.scheduleId ?? '') === picks[row.code].scheduleId
      );
      row.dates = Array.isArray(past?.dates) ? past.dates.map(String) : [];
    }
    row.type = 'transfer';
    picks[row.code].dates = row.dates;
  }

  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    if (!isGroupSatisfied(g, picks)) {
      return { error: `ยังเลือกรอบอบรมไม่ครบ${g?.title ? ` ในกลุ่ม "${g.title}"` : ''} กรุณาเลือกรอบใหม่` };
    }
  }

  const broken = pairViolations(curriculum, picks)[0];
  if (broken) {
    return {
      error:
        `รอบของ ${nameOf[broken.dependent]} (${label(picks[broken.dependent].dates)}) ` +
        `ต้องเริ่มหลัง ${nameOf[broken.prerequisite]} (${label(picks[broken.prerequisite].dates)}) จบแล้ว ` +
        'กรุณาเลือกรอบใหม่',
    };
  }

  return {
    picks,
    selectedCourses: rows.map((sel, i) => {
      const { dates, type, manual } = live[i];
      return {
        ...sel,
        dates,
        // Bangkok day strings, not upstream's datetimes — `dates` keeps the raw
        // list for anything that needs the days themselves.
        startDate: bangkokDayKey(minDateOf(dates)) ?? '',
        endDate: bangkokDayKey(maxDateOf(dates)) ?? '',
        round: label(dates),
        type,
        // Only a manual transfer carries the flag (and no round id); a flag on
        // any other row is the payload's, and is not stored.
        ...(manual ? { scheduleId: '', transferManual: true } : { transferManual: undefined }),
      };
    }),
  };
}
