/**
 * The month window for the public /schedule table — YEAR-AWARE.
 *
 * Kept dependency-free ON PURPOSE: no `next/*`, no db, no models, no React. That
 * is what lets the window be unit-tested in the `pure` tier without a DOM —
 * same rationale as joinCourseSchedules.js in this folder.
 *
 * ── THE BUG THIS MODULE EXISTS TO REMOVE ────────────────────────────────────
 * ScheduleClient bucketed schedules on `new Date(s.dates[0]).getMonth()` — a
 * bare 0–11 index with NO YEAR — and built its window with
 * `for (let m = monthFrom; m <= monthTo; m++)`, both selects offering indices
 * 0–11 and `monthTo` defaulting to 11. So the window did not mean "the next N
 * months". It meant "the rest of THIS CALENDAR YEAR", and it degraded as the
 * year went on:
 *
 *     January   → 12 columns
 *     August    →  5 columns
 *     November  →  2 columns
 *     December  →  1 column, and the `ถึง` select had exactly ONE enabled
 *                  option, so nothing in the new year could be selected AT ALL
 *
 * A December visitor saw one month and every session in January onwards was
 * dropped from `filteredCourses` — not just uncolumned, but the course itself
 * removed from the table, because `visibleMonths.some(...)` found nothing. The
 * data was already there: `getAllSchedules()` sends `from = today` with NO `to`
 * bound, so next-year rows were being fetched and then discarded on the client.
 *
 * The fix is not a bigger loop. A bare month index cannot express "December
 * 2026 then January 2027" at all — 0 is not greater than 11 — so the key itself
 * has to carry the year. Everything here is built on `YYYY-MM`, which sorts
 * lexicographically in chronological order and therefore compares with plain
 * `<` / `>`. That property is load-bearing (see `windowBetween`) and is pinned
 * by a test.
 *
 * ── NOT `ADMIN_SCHEDULE_MONTHS`, AND NOT THE EDITOR'S PICKER RANGE ──────────
 * Two other modules export something that is also a number of months, and this
 * one must not borrow from either:
 *
 *   · src/lib/adminScheduleHorizon.js — a FETCH bound; it decides what MSDB is
 *     asked for and how many columns the admin table draws.
 *   · src/lib/schedule/editorCalendarRange.js — the admin editor's date-picker
 *     range; it decides what a user may PICK when editing a round.
 *
 * This one is a DISPLAY range over data that was already fetched unbounded.
 * All three answer different questions, they are tuned by different people for
 * different reasons, and one of them changing must not move the others. Do not
 * import across.
 *
 * That is not a stylistic preference. The picker was rewritten in August 2026
 * because its window was derived from the wrong source, which left 15 of 90
 * live rounds impossible to edit; the fix was to derive it from the data being
 * edited rather than to borrow a horizon from elsewhere.
 *
 * ── THE RANGE IS NOT A COUNT OF MONTHS ANY MORE ─────────────────────────────
 * It was two numbers — a rolling 6 for the default view, a rolling 12 for the
 * dropdowns — and both are gone. The range now runs from the CURRENT MONTH IN
 * BANGKOK to DECEMBER of this year, or to December of NEXT year when an
 * eligible round reaches past this one; `scheduleWindowEnd` below holds that
 * rule and the full argument for it. The dropdowns and the default view share
 * it, so "what the page opens on" and "what the filter can reach" are one
 * range rather than two that can disagree.
 *
 * Three consequences worth knowing before editing anything here:
 *
 *   · THE RANGE IS DATA-DERIVED, so it is computed on the SERVER (see
 *     schedule/page.jsx) from the same joined rows the page renders, and
 *     arrives at the client as one `YYYY-MM` prop. It is not a constant any
 *     caller can read; there is nothing left in this module to tune.
 *   · ITS LENGTH VARIES from 1 (December, no next-year rounds) to 24 (January,
 *     with them). Anything sized off the window must handle both — the table's
 *     `tableMinWidth` already does, and the mobile card's collapse threshold
 *     was cut loose from the window for exactly this reason.
 *   · EVERY MONTH IN RANGE IS A COLUMN, empty ones included. That is unchanged
 *     and deliberate: a missing column is indistinguishable from a month with
 *     no rounds, and the range is now long enough that gaps are normal.
 */

/**
 * December of `key`'s year — the natural end of a schedule year.
 *
 * Separate from `scheduleWindowEnd` below because BOTH ends of that rule are
 * this expression (this year's December, or next year's) and because the client
 * needs it on its own to clamp a cached answer. One spelling, three readers.
 */
export function decemberOf(key, yearsAhead = 0) {
  const parsed = parseMonthKey(key);
  if (!parsed) return null;
  return monthKey(new Date(parsed.year + yearsAhead, 11, 1));
}

/**
 * THE END OF THE MONTH RANGE — the one answer the dropdowns and the default
 * view both use.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * December of the CURRENT year, unless at least one eligible round has any day
 * after that December — then December of NEXT year. Never further, however far
 * out a round sits.
 *
 * ── WHY A YEAR-END AND NOT A ROLLING COUNT ──────────────────────────────────
 * The window this replaces was two independent numbers: a rolling 6 for the
 * default view and a rolling 12 for the dropdown. That had three costs the
 * owner decided were not worth paying.
 *
 * First, the DEFAULT VIEW HID DATA THAT WAS ALREADY ON THE PAGE. Six columns
 * from October reaches March; measured against the live feed on 2026-10-01, 37
 * of 144 future rounds sat beyond it — fetched, joined, rendered by nobody,
 * and reachable only by a visitor who thought to widen a filter. The default
 * and the dropdown are now the SAME range, so "what the filter can reach" and
 * "what the page opens on" cannot diverge at all.
 *
 * Second, a ROLLING count answers a question nobody asks. A visitor planning
 * training thinks in calendar years — "what is left this year", "is there
 * anything in the new year yet" — not in "twelve months from today". A rolling
 * horizon also means the LAST option is a different month every month, so a
 * page bookmarked in March and reopened in April silently offers a different
 * end.
 *
 * Third, the old horizon was a GUESS ABOUT THE DATA and it had already gone
 * stale. The 12 was justified by a measurement (2026-08-12: zero rounds at
 * offset >= 12, furthest +5) that stopped being true: on 2026-10-01 the feed
 * carried rounds at +14. Deriving the end from the rounds themselves is the
 * same correction the admin editor's picker got in August 2026, and for the
 * same reason — see the warning at the top of this file about borrowing a
 * horizon from elsewhere instead of asking the data.
 *
 * ── WHY THE CAP IS DECEMBER NEXT YEAR AND NOT max(dates) ────────────────────
 * Unbounded would let ONE far-future row stretch the dropdown across empty
 * months. On 2026-10-01 exactly two rounds sat at +14 (2027-12), one of them
 * `zztest-canva-01`, and both were orphans upstream had left with `course:
 * null` — so a naive `max(dates)` would have drawn fifteen columns' worth of
 * options on the strength of two rows that cannot render at all. The cap makes
 * the worst case 24 options (January, with next-year rounds) and the typical
 * case far fewer, and it is a bound on the OUTPUT rather than a filter on the
 * input, so it holds no matter what upstream publishes.
 *
 * ELIGIBILITY IS THE CALLER'S JOB, and must be: "a round that actually reaches
 * the page" means after `excludeStartedRounds` and after `joinCourseSchedules`
 * has dropped the rows with no course ref, plus the ZZTEST- exclusion. None of
 * those three live here, and importing them would drag db-shaped concerns into
 * the one module the `pure` tier can run without a DOM. So this takes DATE
 * SPANS, nothing else — see schedule/page.jsx for the one place that decides
 * what is eligible.
 *
 * @param {string} startKey `YYYY-MM`, the current month (Bangkok — see
 *   siteMonthKey). Only its YEAR is read; the month is irrelevant to the end.
 * @param {Array<Array<string|Date>>} spans one entry per ELIGIBLE round, each
 *   that round's list of dates. Unusable dates and empty spans are ignored.
 * @returns {string|null} `YYYY-MM` for December of this year or next, or null
 *   for an unparseable `startKey`
 */
export function scheduleWindowEnd(startKey, spans) {
  const thisDecember = decemberOf(startKey, 0);
  if (!thisDecember) return null;
  const nextDecember = decemberOf(startKey, 1);

  // A plain string `>` on `YYYY-MM`, the module's load-bearing property: any
  // month key above this year's December is in a later year, so the test is
  // "does any eligible day fall past the end of this year".
  for (const span of Array.isArray(spans) ? spans : []) {
    for (const date of Array.isArray(span) ? span : []) {
      const key = date instanceof Date ? monthKey(date) : monthKey(new Date(date));
      if (key && key > thisDecember) return nextDecember;
    }
  }
  return thisDecember;
}

/**
 * How many rounds a mobile course card lists before collapsing.
 *
 * SIX, as a literal. It used to read `PUBLIC_SCHEDULE_DEFAULT_MONTHS` on the
 * reasoning that a course running one round a month fills exactly a default
 * window's worth of rows — which was true while the default window was six
 * months long. It is not a month window any more (the default view is now a
 * calendar range that can be 24 months wide), and a card that showed 24 rounds
 * before collapsing would be the scroll the collapse exists to prevent.
 *
 * So it is its own number now, and it lives here rather than in ScheduleClient
 * because this is where the retired constant it replaces lived — a reader
 * looking for the old name finds the explanation, not an absence. It is a ROUND
 * COUNT, not a month count; nothing about the window may be derived from it and
 * it must not be derived from the window.
 */
export const MOBILE_ROUND_COLLAPSE_THRESHOLD = 6;

/**
 * `YYYY-MM` for a Date, in LOCAL time.
 *
 * Local, not UTC: `toISOString()` shifts the date, and a session at
 * 2026-09-01T00:00 local in Bangkok is August 31st in UTC — i.e. the wrong
 * column. The rest of the app buckets in local time (see adminScheduleMonthCols)
 * and this matches it.
 *
 * @param {Date} date
 * @returns {string|null} null for a missing or invalid date, never 'NaN-NaN'
 */
export function monthKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * `YYYY-MM` → `{ year, month }`, month 0-indexed as `Date.getMonth()` returns.
 * @returns {{year: number, month: number}|null}
 */
export function parseMonthKey(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key ?? ''));
  if (!m) return null;
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year: Number(m[1]), month };
}

/**
 * The bucket key for a schedule row — the month of its FIRST date.
 *
 * Replaces `getMonthIndex`, which returned `d.getMonth()`. Same first-date rule,
 * so a session spanning a month boundary still files under the month it starts
 * in and the cell label (`30 ต.ค. - 2`) still explains itself.
 */
export function scheduleMonthKey(scheduleItem) {
  const first = scheduleItem?.dates?.[0];
  if (!first) return null;
  return monthKey(new Date(first));
}

/**
 * `n` months after `key`. Negative `n` goes back.
 *
 * Goes through `new Date(year, month + n, 1)` rather than doing modular
 * arithmetic on the month, because the Date constructor already normalises an
 * out-of-range month into the following year — which is the entire behaviour
 * being bought. Hand-rolled `% 12` is the mutant the control test runs.
 */
export function addMonths(key, n) {
  const parsed = parseMonthKey(key);
  if (!parsed) return null;
  return monthKey(new Date(parsed.year, parsed.month + n, 1));
}

/** A Date or a `YYYY-MM` string, normalised to a key. */
function asKey(from) {
  return from instanceof Date ? monthKey(from) : (parseMonthKey(from) ? String(from) : null);
}

/**
 * `count` consecutive month keys starting at `from` INCLUSIVE.
 *
 * @param {Date|string} from a Date or a `YYYY-MM` key
 * @param {number} count
 * @returns {string[]} `[]` for an unparseable `from` or a count below 1
 */
export function rollingWindow(from, count) {
  const start = asKey(from);
  const n = Math.floor(Number(count));
  if (!start || !Number.isFinite(n) || n < 1) return [];
  const out = [];
  for (let i = 0; i < n; i++) out.push(addMonths(start, i));
  return out;
}

/**
 * Every month key from `fromKey` to `toKey`, INCLUSIVE at both ends.
 *
 * A `toKey` BEFORE `fromKey` clamps to `[fromKey]` rather than returning an
 * empty or reversed list. That is the same rule the old `safeMonthTo` enforced
 * and it is not cosmetic: an empty window makes `filteredCourses` empty, so the
 * page renders "ไม่พบหลักสูตร" for what is really a transient filter state —
 * the user has picked a new `from` and has not yet moved `to`.
 *
 * The comparison is a plain string `<`. `YYYY-MM` is fixed-width and
 * zero-padded, so lexicographic order IS chronological order, across the year
 * boundary included ('2026-12' < '2027-01'). A test pins that.
 */
export function windowBetween(fromKey, toKey) {
  const start = asKey(fromKey);
  if (!start) return [];
  const rawEnd = asKey(toKey);
  const end = !rawEnd || rawEnd < start ? start : rawEnd;

  const out = [];
  let cursor = start;
  // Bounded by construction — `end` is >= `start` and the cursor strictly
  // increases — but capped anyway so a malformed key can never spin forever.
  for (let guard = 0; cursor <= end && guard < 600; guard++) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

// ── Labels ──────────────────────────────────────────────────────────────────
//
// `th-TH` renders the BUDDHIST ERA natively — `{ year: '2-digit' }` on January
// 2027 gives "พ.ศ. 70", and with a month it gives "ม.ค. 70". Nothing here adds
// 543 by hand; that arithmetic is how a Gregorian year ends up rendered twice
// or a Buddhist one shifted again, and this repo has already paid for it once.

const SHORT_MONTH = new Intl.DateTimeFormat('th-TH', { month: 'short' });
const SHORT_MONTH_YEAR = new Intl.DateTimeFormat('th-TH', { month: 'short', year: '2-digit' });
const YEAR_ONLY = new Intl.DateTimeFormat('th-TH', { year: '2-digit' });
const LONG_MONTH_YEAR = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' });

const dateOf = (key) => {
  const p = parseMonthKey(key);
  return p ? new Date(p.year, p.month, 1) : null;
};

/** `'2027-01'` → `'ม.ค.'` — the bare month, matching the old header exactly. */
export function monthLabel(key) {
  const d = dateOf(key);
  return d ? SHORT_MONTH.format(d) : '';
}

/**
 * `'2027-01'` → `'ม.ค. 70'` — one line, Buddhist era.
 *
 * The FILTER DROPDOWN's label, and only that. The table header uses the
 * two-part form below instead, because a dropdown option is one line of text
 * while a column head has a second line to spend.
 */
export function monthLabelWithYear(key) {
  const d = dateOf(key);
  return d ? SHORT_MONTH_YEAR.format(d) : '';
}

/**
 * `'2027-01'` → `'70'` — the Buddhist year ALONE, for the header's second line.
 *
 * Via `formatToParts` rather than string surgery on `'พ.ศ. 70'`: the era prefix
 * and the separator are locale data, and slicing them off by index or by a
 * space is a guess that an ICU update can quietly invalidate. Asking for the
 * `year` part asks the formatter the question directly.
 *
 * Still Intl, still never `+ 543`.
 */
export function monthYearLabel(key) {
  const d = dateOf(key);
  if (!d) return '';
  return YEAR_ONLY.formatToParts(d).find((p) => p.type === 'year')?.value ?? '';
}

/**
 * `'2026-09'` → `'กันยายน 2569'` — the LONG form, for prose rather than a table.
 *
 * ── IT IS THE SAME `YYYY-MM`, NOT AN `ADMIN_SCHEDULE_MONTHS`-STYLE FALSE FRIEND
 * The module docstring warns against borrowing something that merely LOOKS like
 * a month here, so the check is spelled out: this key is byte-identical to the
 * one `monthKey` produces — `${getFullYear()}-${String(getMonth()+1).padStart(2,
 * '0')}` — and the two producers it now serves both emit exactly that. They are
 * one vocabulary, not two that coincide.
 *
 *   · the public /schedule window, via `monthKey` above;
 *   · the in-house enquiry form's month select, which builds its option VALUES
 *     with that same expression (src/components/registration/InhouseForm.jsx:67-74)
 *     and submits them as `preferredMonth`.
 *
 * ── WHY LONG, AND WHY HERE ──────────────────────────────────────────────────
 * The in-house form shows the customer `toLocaleDateString('th-TH', { month:
 * 'long', year: 'numeric' })` at review time, so this reproduces the string
 * they approved rather than a shorter one they never saw. The siblings above
 * are sized for a table column and a dropdown; an email sentence has room.
 *
 * It lives in this module and not in the email label file ON PURPOSE. A second
 * private Intl formatter is a second place for `+ 543` to grow back, and
 * test/fs/scheduleThaiYearSource only inspects the files it is pointed at —
 * a formatter written elsewhere is a formatter nobody is guarding.
 *
 * ── THE FALLBACK DIFFERS FROM ITS SIBLINGS, DELIBERATELY ────────────────────
 * `monthLabel` / `monthLabelWithYear` / `monthYearLabel` return `''` for an
 * unparseable key, which is right for a table: a column head with no month is
 * blank, and the row beneath still identifies the data. This one returns the
 * RAW VALUE instead, because its output lands in a sentence in a customer's
 * email. A customer reading `2026-09` is confused; a customer reading nothing
 * cannot tell which enquiry the mail is answering. Same reasoning as the
 * `courseName || code` fallback in inhouseRegistrationModel.js — an ugly but
 * actionable value beats a hole.
 *
 * The only input that yields `''` is one that was already empty.
 *
 * @param {string} key
 * @returns {string} the formatted label, else `key` unchanged
 */
export function monthLongLabel(key) {
  // Through `dateOf`, i.e. through `parseMonthKey` — the module's one place
  // where the key vocabulary is decoded.
  const d = dateOf(key);
  return d ? LONG_MONTH_YEAR.format(d) : String(key ?? '');
}

/**
 * The rendered month columns. EVERY column carries its year — no condition.
 *
 * ── WHY THERE IS NO CONDITION, AND WHY THE PREVIOUS ONE WAS WRONG ───────────
 * The shipped rule showed the year only on the first column of a new year, on
 * the reasoning that a bare `ก.พ.` is unambiguous as long as a labelled column
 * is visible beside it. THAT ASSUMPTION DOES NOT SURVIVE A HORIZONTAL SCROLL,
 * and this table scrolls: scroll two columns past `ม.ค. 70` and it leaves the
 * viewport, leaving `ก.พ.` and `มี.ค.` on screen with no year anywhere on the
 * page. A user hit exactly that and could not tell which year they were
 * looking at.
 *
 * The same defect had already surfaced once in another costume — a window
 * sitting entirely in the next year has no internal crossing to hang the label
 * on — and was patched with a "first column" special case. A rule needing a
 * special case per viewing situation is a rule that depends on what else
 * happens to be visible, which is not knowable here. So the condition is
 * DELETED rather than defaulted to `true`: a parameter that only ever takes one
 * value reads like a branch someone can still reach, and the next person to
 * read it will try.
 *
 * Each column head is now independently readable, which is the only property
 * that survives a scroll. It costs a second line, not horizontal space — the
 * columns have a 90px floor and a window can be twelve wide, so growing them
 * sideways was never available.
 *
 * @param {string[]} keys
 * @returns {{key: string, year: number, month: number, label: string, yearLabel: string}[]}
 *   `label` is the month alone (line 1), `yearLabel` the 2-digit Buddhist year
 *   (line 2). Split rather than pre-joined so the caller styles them
 *   independently — the year is rendered smaller and muted.
 */
export function monthColumns(keys) {
  const list = Array.isArray(keys) ? keys : [];
  return list.flatMap((key) => {
    const parsed = parseMonthKey(key);
    if (!parsed) return [];
    return [{
      key,
      year: parsed.year,
      month: parsed.month,
      label: monthLabel(key),
      yearLabel: monthYearLabel(key),
    }];
  });
}
