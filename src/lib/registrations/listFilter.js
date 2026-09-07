/**
 * The Mongo filter for the registrations list — ONE builder, so the table and
 * the summary cards cannot answer to different questions.
 *
 * ── THE DEFECT THIS FILE EXISTS TO FIX ──────────────────────────────────────
 * The date range was computed inside `getRegistrationStatusCounts` and nowhere
 * else. `listRegistrations` never received it and never applied it. So selecting
 * วันนี้ produced a screen where the cards read ทั้งหมด 1, the table listed every
 * row regardless of date, and the header said `7 รายการทั้งหมด` — three numbers,
 * one filter, two of them ignoring it.
 *
 * The range now lives here and BOTH callers derive from it. A range that reaches
 * one query and not the other is no longer expressible: there is one function
 * that turns `range` into a `createdAt` clause, and the counts action and the
 * list action both call it.
 *
 * ── WHY `now` IS A PARAMETER ────────────────────────────────────────────────
 * `new Date()` inside a filter builder makes the builder untestable — "today"
 * moves while the suite runs, and an assertion about a boundary can only be
 * written against a clock it controls. Every caller in the app omits it and gets
 * the real clock; the tests pass a fixed instant and assert the exact boundary.
 *
 * ── LOCAL MIDNIGHT, NOT UTC MIDNIGHT ────────────────────────────────────────
 * `setHours(0,0,0,0)` is deliberate and is carried over unchanged from the
 * counts action. The server runs on the deployment's timezone and the staff
 * reading this screen are in Bangkok; "วันนี้" has to mean the day they are
 * having, not the day UTC is having. Changing this to `setUTCHours` would move
 * every boundary by seven hours and silently reclassify evening enquiries — the
 * 19:27 in-house enquiry this screen was recently audited over would land on the
 * previous day.
 *
 * Pure: no db, no env. ONE import, and it is a sibling constant module that is
 * itself import-free (lib/registrations/statuses.js), so the pure tier still
 * loads this file with nothing stubbed. That import replaced what would
 * otherwise have been a THIRD hand-written copy of the status vocabulary — see
 * `buildRegistrationFilter`.
 */

import { storedValuesForFilter } from '@/lib/registrations/statuses';

/** The ranges the UI offers. `all` is the absence of a date clause. */
export const RANGE_VALUES = ['all', 'today', 'week', 'month'];

/**
 * A range name → the `createdAt` clause for it, as a spreadable object.
 *
 * Returns `{}` — not `{ createdAt: undefined }` — for `all` and for anything
 * unrecognised, so a caller can spread it unconditionally and an unknown value
 * degrades to "no date filter" rather than to a clause matching nothing.
 *
 * @param {string} range
 * @param {Date} [now]
 * @returns {{ createdAt?: { $gte: Date } }}
 */
export function rangeToDateFilter(range, now = new Date()) {
  let from = null;

  if (range === 'today') {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
  } else if (range === 'week') {
    // Six days back INCLUSIVE of today — a seven-day window, matching the
    // '7 วัน' chip. Carried over from the counts action unchanged.
    from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else if (range === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  return from ? { createdAt: { $gte: from } } : {};
}

/**
 * ══ THE CUSTOM DATE RANGE, AND ITS RELATIONSHIP TO THE CHIPS ════════════════
 *
 * Round 8 adds a from/to range to a screen that already had ทั้งหมด / วันนี้ /
 * 7 วัน / เดือนนี้ chips over THE SAME FIELD. Two independent controls over one
 * field is a screen where the chips say one thing and the panel says another and
 * neither is wrong, so they are not independent:
 *
 *   THE CHIPS ARE PRESETS. There is ONE resolved window, and two ways to fill
 *   it. `from`/`to` WIN when either is present, and a chip is shown selected
 *   only when neither is — so picking a custom range deselects the chips and
 *   picking a chip is what clears the custom range.
 *
 * That keeps every existing `?range=today` bookmark working: `range` is still
 * the parameter the presets use, and the new pair is additive.
 *
 * ── WHICH DATE. `createdAt`. ──────────────────────────────────────────────
 * The date the list ALREADY SHOWS in its first column — วันที่สมัคร on public,
 * วันที่ส่งคำขอ on in-house. Both are `createdAt` on their collection.
 *
 * NOT the training round's dates. `classDate` is a LABEL STRING ('12 - 13 ส.ค.
 * 2569'), not a date, and `coursesInterested` has no dates at all — so a filter
 * over "when is the course" is not merely a different question, it is one this
 * data cannot answer. A control labelled วันที่สมัคร that filtered the round
 * would be the quiet kind of wrong this screen has shipped before.
 */

/**
 * `YYYY-MM-DD` → a local Date, or null for anything else.
 *
 * ── PARSED BY HAND RATHER THAN BY `new Date(s)` ───────────────────────────
 * `new Date('2026-08-13')` parses as UTC MIDNIGHT and then reads back in local
 * time, so in Bangkok it is 07:00 on the 13th — which silently drops every
 * registration made before 07:00 from a range that names that day. The whole
 * point of `setHours(0,0,0,0)` elsewhere in this file is that these boundaries
 * are LOCAL, and a `<input type="date">` value has no timezone to honour.
 *
 * Rejects anything that is not exactly ten characters of the right shape,
 * including `new Date('nonsense')` (Invalid Date) and partials like `2026-08`,
 * so the caller can treat null as "no bound" — which is what makes an
 * unparseable date degrade to UNFILTERED rather than to a clause matching
 * nothing.
 */
export function parseDateInput(value) {
  const s = String(value ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(y, mo - 1, d, 0, 0, 0, 0);
  // Round-trip, so 2026-02-31 is rejected rather than rolling into March.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * THE ONE RESOLVED DATE WINDOW. Every caller reads this and nothing else.
 *
 * @returns {{ clause: object, preset: string|null, from: Date|null, to: Date|null,
 *             custom: boolean, swapped: boolean }}
 *   `clause` spreads into a Mongo filter; `preset` is the chip to show selected,
 *   or null when a custom range is in force.
 *
 * ── OPEN ENDS ARE ALLOWED, BOTH WAYS ──────────────────────────────────────
 * `from` alone means "since"; `to` alone means "up to". Both are ordinary
 * questions — "everything since the campaign started", "everything before the
 * price change" — and refusing them would make the reader type a bound they do
 * not have an opinion about.
 *
 * ── A REVERSED RANGE IS SWAPPED, NOT OBEYED AND NOT IGNORED ───────────────
 * `from` after `to` describes an empty interval, and honouring it returns an
 * empty table — which is indistinguishable from "there are no records" and is
 * the exact failure this screen's degrade rules exist to prevent.
 *
 * Ignoring it silently would be the other kind of wrong: the reader asked for
 * something and got the unfiltered list with no sign their input was dropped.
 *
 * So the two bounds are SWAPPED — which is what a reader who typed them the
 * wrong way round meant — and `swapped` is returned so the UI can SAY SO. A
 * correction the reader cannot see is still a screen deciding on their behalf.
 *
 * ── `to` IS INCLUSIVE ─────────────────────────────────────────────────────
 * A range ending on the 13th includes the 13th. `$lte` at 23:59:59.999 local
 * rather than `$lt` at the next midnight: both are correct, and this one reads
 * as the same day in a query log.
 */
export function resolveDateWindow({ range = 'all', from = '', to = '', now = new Date() } = {}) {
  let f = parseDateInput(from);
  let t = parseDateInput(to);

  if (!f && !t) {
    const clause = rangeToDateFilter(range, now);
    // An unrecognised range degrades to unfiltered AND to no chip being lit, so
    // the chrome cannot claim a filter the query is not applying.
    const preset = RANGE_VALUES.includes(range) ? range : 'all';
    return { clause, preset, from: null, to: null, custom: false, swapped: false };
  }

  let swapped = false;
  if (f && t && f.getTime() > t.getTime()) {
    [f, t] = [t, f];
    swapped = true;
  }

  const createdAt = {};
  if (f) createdAt.$gte = f;
  if (t) {
    const end = new Date(t);
    end.setHours(23, 59, 59, 999);
    createdAt.$lte = end;
  }

  return { clause: { createdAt }, preset: null, from: f, to: t, custom: true, swapped };
}

/**
 * ══ THE COURSE FILTER ═══════════════════════════════════════════════════════
 *
 * ── THE TWO SOURCES REFERENCE COURSES DIFFERENTLY, SO THE CLAUSE DOES TOO ──
 * Public carries the REGISTERED course as `courseCode`/`courseId` scalars (and
 * `courseName` denormalised beside them). In-house carries COURSES OF INTEREST
 * as an ARRAY of codes in `coursesInterested`. A single clause over one field
 * name would match nothing on one of the two collections while looking correct.
 *
 * Mongo matches an array field against a scalar by element, so `{
 * coursesInterested: 'MSE-L2' }` finds an enquiry listing it among several —
 * which is the intended meaning of "show me the in-house requests interested in
 * this course".
 *
 * ── PUBLIC MATCHES `courseCode` OR `courseId` ─────────────────────────────
 * Measured, not assumed: on all 39 production registrations the two hold the
 * same value. They are separate fields on the schema and nothing enforces that,
 * so matching only one would silently miss any document where they diverge —
 * and a filter that hides rows is worse than one that does not exist.
 */
export function courseClause(course, source) {
  const code = String(course ?? '').trim();
  if (!code || code === 'all') return {};
  return source === 'inhouse'
    ? { coursesInterested: code }
    : { $or: [{ courseCode: code }, { courseId: code }] };
}

/**
 * ══ IMPORTED FROM DRUPAL, OR BORN HERE ══════════════════════════════════════
 *
 * `'only'` → the rows the legacy import wrote. `'exclude'` → the rows this
 * system took itself. Anything else, including the empty default, adds NO
 * clause and shows both — the same degrade direction `rangeToDateFilter` and
 * the status clause already take, and for the same reason: a filter value
 * nobody recognises must produce the unfiltered list, never a clause matching
 * nothing, because an empty table reads as lost data.
 *
 * ── IT ASKS ABOUT `legacy.sid`, NOT ABOUT `legacy` ────────────────────────
 * `legacy` is a subdocument defaulting to NULL, so `{ legacy: { $exists: true } }`
 * would be TRUE for every document ever written — the path exists and holds
 * null. `legacy.sid` is the dedup key the import actually writes, and under a
 * null parent it does not exist. This is the same predicate the unique partial
 * index on both models is built from, so the filter and the constraint agree by
 * construction rather than by two people remembering the same thing.
 *
 * ── ONE CLAUSE, SAME ON BOTH COLLECTIONS ──────────────────────────────────
 * Unlike `courseClause`, this does not branch on `source`: both register_public
 * and register_inhouse carry the identical `legacy` subdocument from the shared
 * models/legacyImportSchema, so one predicate is correct on either side. If that
 * ever stops being true, this is the function that has to learn about it.
 *
 * @param {string} legacy 'only' | 'exclude' | anything (unfiltered)
 */
export function legacyClause(legacy) {
  const v = String(legacy ?? '').trim();
  if (v === 'only')    return { 'legacy.sid': { $exists: true } };
  if (v === 'exclude') return { 'legacy.sid': { $exists: false } };
  return {};
}

/**
 * The search `$or` for a source.
 *
 * The two sources search DIFFERENT fields and that is not an oversight: an
 * in-house enquiry has no `courseName` and no `coordinator`, and a public
 * registration has no `companyName`.
 *
 * ══ IN-HOUSE SEARCHES หลักสูตร IN TWO CLAUSES, NOT ONE ══════════════════════
 *
 * `coursesInterested` used to be deliberately ABSENT here, and the note said
 * why: it holds course CODES, so matching a typed course NAME against it would
 * return nothing while looking like it should work. That reasoning was right and
 * it is why this is two clauses rather than the one-line addition it looks like.
 *
 *   · `{ coursesInterested: rx }` — the RAW text against the code, so someone
 *     who types `ZZTEST-EXCEL-01` gets what they expect;
 *   · `{ coursesInterested: { $in: courseCodes } }` — the codes the typed text
 *     resolved to by NAME, upstream of this function.
 *
 * The `$in` clause is OMITTED when nothing resolved, which is what makes an
 * unresolvable name degrade to "no match on that term" instead of to an empty
 * result for the whole query: the other four clauses still run. `{$in: []}`
 * would match nothing, which is harmless inside an `$or` — but omitting it says
 * what is meant and keeps the query readable in a log.
 *
 * THE RESOLUTION IS NOT DONE HERE. It needs the course catalogue, which is an
 * upstream fetch, and this module is pure and synchronous by design — every
 * consumer of it is a different action and a fetch in here would happen three
 * times per render. See `inhouseCourseCodes`, which is the one derivation site.
 *
 * @param {string} source
 * @param {string} term already trimmed and known non-empty
 * @param {string[]} courseCodes codes the term resolved to by name; may be empty
 */
function searchClauses(source, term, courseCodes = []) {
  const rx = { $regex: term, $options: 'i' };
  if (source !== 'inhouse') {
    return [
      { courseName:              rx },
      { 'coordinator.firstName': rx },
      { 'coordinator.lastName':  rx },
      { 'coordinator.email':     rx },
    ];
  }

  const clauses = [
    { companyName:      rx },
    { contactFirstName: rx },
    { contactLastName:  rx },
    { contactEmail:     rx },
    { coursesInterested: rx },
  ];
  const codes = (Array.isArray(courseCodes) ? courseCodes : []).filter(Boolean);
  if (codes.length) clauses.push({ coursesInterested: { $in: codes } });
  return clauses;
}

/**
 * EVERYTHING EXCEPT THE STATUS — the scope the whole screen counts inside.
 *
 * ══ WHY THIS IS SPLIT OUT ═══════════════════════════════════════════════════
 *
 * Requirement: the stat cards, the toggle badges, the "N รายการ" header and the
 * pager must all count the SAME SET. They cannot all call
 * `buildRegistrationFilter`, because the counts action runs ONE COUNT PER
 * STATUS and therefore supplies its own status clause.
 *
 * Before round 8 that was expressed as the counts calling `rangeToDateFilter`
 * directly while the list called the full builder — two call sites that HAPPENED
 * to agree because the date was the only shared dimension. Adding two more
 * dimensions to one of them and not the other is exactly how this screen
 * previously came to show cards reading 29 above a table filtered to 3.
 *
 * So the shared part is a function. `buildRegistrationFilter` is this plus a
 * status clause, and the counts action spreads this beside its own — a dimension
 * added here reaches every number on the screen without any of them being
 * edited.
 *
 * ── `q` REACHES EVERY CONSUMER NOW, AND IT DID NOT BEFORE ─────────────────
 * Until this commit, page.jsx called `getRegistrationStatusCounts({ range,
 * source })` and `getRegistrationTotal({ range, source })` with no `q` at all —
 * so the stat cards and the toggle badges had NEVER followed the search box.
 * Type a name and the table filtered to one row under cards still reading 39.
 *
 * Same defect as the range one this module was created for, on a different
 * dimension, and it survived because every guard over this seam ENUMERATED
 * FILTERS BY NAME: there were tests that `range` reaches the list, `range`
 * reaches the counts, `range` reaches the total — and nothing that asked whether
 * the SET of dimensions was the same in all four places. A dimension nobody
 * wrote a test for was a dimension with no test.
 *
 * `SCOPE_PARAMS` below is the fix for that shape. It is the one list, and the
 * guard reads it rather than naming dimensions itself.
 */

/**
 * EVERY DIMENSION OF THE SHARED SCOPE, BY NAME. The single enumeration.
 *
 * ── WHY THIS EXISTS RATHER THAN A TEST PER DIMENSION ──────────────────────
 * The seam this module guards has now leaked twice — `range` in round 2 and `q`
 * in round 8 — and both times the guards were per-name and hand-written, so the
 * dimension that leaked was simply not among them. One hand-written list is
 * still hand-written, but it is ONE, and it lives where a dimension is added:
 * anyone extending `buildRegistrationScope` edits this line in the same diff, and
 * test/fs/registrationsFilterWiring asserts every consumer takes every member.
 *
 * `source` is deliberately NOT here. It is not a filter — it SELECTS THE
 * COLLECTION, and the two collections are separate. It appears in the signatures
 * for a different reason (it decides which fields the search names), and folding
 * it in would make the guard demand it of callers that already have it by
 * another route.
 */
export const SCOPE_PARAMS = Object.freeze(['q', 'range', 'from', 'to', 'course', 'legacy']);
/**
 * `courseCodes` is NOT a SCOPE_PARAM, and the distinction is worth one line.
 *
 * SCOPE_PARAMS is the set of dimensions the URL carries and the PAGE must hand
 * to all three actions — fs/registrationsFilterWiring asserts exactly that.
 * `courseCodes` is not a dimension: it is `q` RESOLVED, derived inside the
 * actions from the course catalogue, and the page never sees it. Adding it to
 * SCOPE_PARAMS would make that guard demand the page pass something the page
 * cannot compute.
 *
 * It still has to reach all three actions or the four numbers disagree — that is
 * the same invariant, and it is guarded separately in the same file.
 */
export function buildRegistrationScope({
  q = '', source = 'public', range = 'all', from = '', to = '', course = '',
  legacy = '', courseCodes = [], now,
} = {}) {
  const scope = {};

  const term = String(q ?? '').trim();
  if (term) scope.$or = searchClauses(source, term, courseCodes);

  Object.assign(scope, resolveDateWindow({ range, from, to, now }).clause);

  const byCourse = courseClause(course, source);
  if (Object.keys(byCourse).length) scope.$and = [byCourse];

  /**
   * ── ASSIGNED FLAT, NOT PUSHED INTO `$and`, AND THAT IS SAFE HERE ─────────
   * `legacyClause` returns a single `'legacy.sid'` key, which no other clause in
   * this function can produce: the search owns `$or`, the window owns
   * `createdAt`, the course owns `$and`. So a plain assign cannot clobber
   * anything, and it keeps the query readable in a log. The course needs `$and`
   * for a reason that does not apply here — its clause is ITSELF an `$or` and
   * would replace the search's.
   */
  Object.assign(scope, legacyClause(legacy));

  return scope;
}

/**
 * The complete filter for one list query.
 *
 * `source` is NOT a filter field — it selects the COLLECTION, and the two
 * collections are separate. It is a parameter here only because it decides which
 * fields the search clause names.
 *
 * @param {object} input
 * @param {string} [input.status] a status value, or 'all' for no status clause
 * @param {string} [input.q] free-text search
 * @param {string} [input.source] 'public' | 'inhouse'
 * @param {string} [input.range] see RANGE_VALUES
 * @param {Date} [input.now] injected clock; omit in production
 * @returns {object} a Mongo filter document
 */
export function buildRegistrationFilter({
  status = 'all',
  q = '',
  source = 'public',
  range = 'all',
  from = '',
  to = '',
  course = '',
  legacy = '',
  courseCodes = [],
  now,
} = {}) {
  const filter = {};

  /**
   * ── AN UNRECOGNISED STATUS SHOWS EVERYTHING, NOT NOTHING ────────────────
   *
   * This used to be `filter.status = status` for any non-'all' value, so any
   * status the collection does not hold produced `{status: 'whatever'}` — a
   * clause matching no document, rendering an EMPTY LIST. An empty list is
   * indistinguishable from "all your records are gone".
   *
   * That stopped being hypothetical in round 2. In-house collapsed from five
   * stored values to three, so every bookmark and every still-open tab holding
   * `?status=new` or `?status=closed-won` now names a status that no longer
   * exists. Those are ordinary URLs that ordinary people kept, and the honest
   * answer to one is the unfiltered list — the same shape `rangeToDateFilter`
   * above already applies to an unknown `range`, and the same shape page.jsx
   * applies to `source`.
   *
   * `storedValuesForFilter` returns [] for anything outside the source's LIVE
   * vocabulary, which is the signal to add no clause at all. For a recognised
   * in-house status it also widens to the retired values that migrate onto it,
   * so the list agrees with the summary cards during the window before the
   * migration runs — see its own docstring.
   *
   * `$in` unconditionally rather than a scalar for the single-member case:
   * `{status: {$in: ['pending']}}` and `{status: 'pending'}` are the same query
   * to Mongo and use the same index, and one shape means one thing for a
   * reader of this function to check.
   */
  if (status && status !== 'all') {
    const values = storedValuesForFilter(status, source);
    if (values.length) filter.status = { $in: values };
  }

  /**
   * EVERYTHING ELSE COMES FROM THE SHARED SCOPE — the search, the date window
   * and the course. See `buildRegistrationScope`: the same object feeds the stat
   * cards and the toggle totals, so a dimension cannot reach the table and miss
   * the numbers above it.
   *
   * ── THE COURSE IS `$and`, NOT A SECOND `$or`, AND THAT IS LOAD-BEARING ──
   * The public course clause is itself an `$or` (courseCode OR courseId), and
   * the search sets `$or` too. Assigning the second would REPLACE the first — a
   * screen where typing a name and picking a course quietly ignores the name —
   * and an object literal cannot hold two `$or` keys anyway. `$and` composes
   * them, each keeping its own internal `$or`. That is done in the scope.
   */
  Object.assign(filter, buildRegistrationScope({ q, source, range, from, to, course, legacy, courseCodes, now }));

  return filter;
}
