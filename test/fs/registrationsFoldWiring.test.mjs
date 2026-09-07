import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE FOLD, AT THE SEAM. What the pure tier cannot see.
 *
 * `foldLegsIntoRows` and `requestStatusOf` are pure and are tested as such. The
 * three properties below are about the QUERY, and the query is a `'use server'`
 * export that calls `requireAdmin` and opens Mongo on its first line, so nothing
 * here can invoke it. These are shape checks on the code.
 *
 * They are also the only tier that can see the property with the most teeth:
 *
 *     `$skip` AND `$limit` COME AFTER `$group`.
 *
 * Move them above it and the screen still renders, the tests still pass, the
 * numbers still look plausible — and a request straddling a page boundary is
 * rendered twice, incomplete both times, on two different pages. There is no
 * rendered symptom on page one.
 */

const ACTIONS = readSource('src/lib/actions/registrations.js');

function actionBody(name) {
  const start = ACTIONS.code.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone`);
  const rest = ACTIONS.code.slice(start + 1);
  const next = rest.indexOf('\nexport ');
  return next === -1 ? rest : rest.slice(0, next);
}

const LIST   = actionBody('listRegistrations');
const TOTAL  = actionBody('getRegistrationTotal');
const COUNTS = actionBody('getRegistrationStatusCounts');

// ── 1. ONE KEY, THREE CONSUMERS ─────────────────────────────────────────────

test('all three query actions group by the SHARED key expression', () => {
  /**
   * The header, the badge and the cards must count the set the ROWS are. They
   * can only do that if they group by the same thing, and the only way to
   * guarantee that is for there to be one definition of it.
   */
  assert.match(ACTIONS.withImports,
    /import\s*\{[^}]*\bREQUEST_KEY_EXPR\b[^}]*\}\s*from\s*'@\/lib\/registrations\/foldRequests'/,
    'the actions file does not import the shared grouping key');

  for (const [name, body] of [['listRegistrations', LIST], ['getRegistrationTotal', TOTAL], ['getRegistrationStatusCounts', COUNTS]]) {
    assert.match(body, /_id:\s*REQUEST_KEY_EXPR/,
      `${name} does not group by REQUEST_KEY_EXPR — it is counting a different set from the rows`);
  }
});

test('no action rolls its own grouping key', () => {
  // A hand-written `$ifNull` here would be a second definition that happens to
  // agree today. That is how the cards and the table drifted apart twice.
  for (const [name, body] of [['listRegistrations', LIST], ['getRegistrationTotal', TOTAL], ['getRegistrationStatusCounts', COUNTS]]) {
    assert.ok(!/\$ifNull/.test(body), `${name} builds its own key expression`);
    assert.ok(!/bundle\.requestId'\s*\}\s*\}/.test(body.replace(/\s+/g, ' ')) || /REQUEST_KEY_EXPR/.test(body),
      `${name} names bundle.requestId in a group stage of its own`);
  }
});

test('CONTROL: the body extractor found three real functions', () => {
  // Every assertion above is a `match` on a string. An empty string fails them,
  // but a WRONG string could pass them, so pin that each body is the one named.
  assert.ok(LIST.includes('PAGE_SIZE'), 'the listRegistrations body is not the list');
  assert.ok(TOTAL.includes('countDocuments'), 'the getRegistrationTotal body is not the total');
  assert.ok(COUNTS.includes('INHOUSE_STATUS_VALUES'), 'the counts body is not the counts');
  for (const body of [LIST, TOTAL, COUNTS]) assert.ok(body.length > 300, `a body parsed to ${body.length} chars`);
});

// ── 2. THE PAGINATION PROPERTY ──────────────────────────────────────────────

test('$skip and $limit come AFTER $group — pagination is over REQUESTS', () => {
  const group = LIST.indexOf('$group');
  const skip  = LIST.indexOf('$skip');
  const limit = LIST.indexOf('$limit');

  assert.notEqual(group, -1, 'no $group in listRegistrations — the fold is gone');
  assert.notEqual(skip,  -1, 'no $skip in listRegistrations');
  assert.notEqual(limit, -1, 'no $limit in listRegistrations');

  assert.ok(group < skip,
    'THE PAGINATION BUG: $skip precedes $group, so skip/limit are applied over LEGS. '
    + 'A page of twenty legs folds to fewer rows, pageCount describes a set the rows are not, '
    + 'and a request straddling a page boundary renders twice.');
  assert.ok(skip < limit, '$limit precedes $skip — the page window is inverted');
});

test('the pagination property, reported by LINE so a reviewer can look', () => {
  /**
   * The same claim as above, expressed as line numbers and printed, because
   * "an index is smaller than another index" is not something a reader can
   * check against the file. Each marker must occur EXACTLY ONCE in the raw
   * source of this action, or the ordering claim is about an arbitrary one of
   * several.
   */
  const rawStart = ACTIONS.raw.indexOf('export async function listRegistrations');
  assert.notEqual(rawStart, -1);
  const rawEnd = ACTIONS.raw.indexOf('\nexport ', rawStart + 1);
  const body = ACTIONS.raw.slice(rawStart, rawEnd === -1 ? undefined : rawEnd);
  const baseLine = ACTIONS.raw.slice(0, rawStart).split('\n').length;

  const lineOf = (needle) => {
    const lines = body.split('\n');
    const hits = [];
    lines.forEach((l, i) => { if (l.includes(needle)) hits.push(baseLine + i); });
    assert.equal(hits.length, 1,
      `"${needle}" occurs ${hits.length} times in listRegistrations — expected exactly once`);
    const n = hits[0];
    assert.ok(Number.isInteger(n) && n > 0, `computed line for "${needle}" is not a positive integer: ${n}`);
    return n;
  };

  const groupLine = lineOf('_id: REQUEST_KEY_EXPR,');
  const skipLine  = lineOf('{ $skip: skip },');
  const limitLine = lineOf('{ $limit: PAGE_SIZE },');

  console.log(`      [fold] $group at line ${groupLine}, $skip at ${skipLine}, $limit at ${limitLine}`);
  assert.ok(groupLine < skipLine && skipLine < limitLine,
    `pipeline order is wrong: group ${groupLine}, skip ${skipLine}, limit ${limitLine}`);
});

test('the count of requests is its own grouped pipeline, not countDocuments', () => {
  // `countDocuments(filter)` counts LEGS. The header would then read 46 above
  // 43 rows — the silent-wrong-number class, which is the whole subject here.
  assert.match(LIST, /\$count:\s*'n'/, 'the public total is not a grouped $count');
  assert.ok(!/const total = await Model\.countDocuments\(filter\)/.test(LIST),
    'the public branch counts documents again — that is legs, not requests');
});

// ── 3. THE SECOND QUERY FETCHES THE REQUEST WHOLE ───────────────────────────

test('the leg re-fetch does NOT re-apply the list filter', () => {
  /**
   * The filter matches LEGS. Applying it again to the second query would return
   * only the legs that matched — rendering a three-course package as a
   * one-course row under a course filter, which is the screen lying about the
   * size of the request.
   */
  const start = LIST.indexOf("{ 'bundle.requestId': { $in: keys } }");
  assert.notEqual(start, -1, 'the sibling lookup by requestId is gone');

  const fetchStart = LIST.lastIndexOf('Model.find(', start);
  assert.notEqual(fetchStart, -1);
  const fetchCall = LIST.slice(fetchStart, start);
  assert.ok(!/\bfilter\b/.test(fetchCall),
    'the leg re-fetch applies `filter` — it would return only the legs that matched');
});

test('the re-fetch covers BOTH kinds of key', () => {
  // An ordinary registration keys on its own `_id`; a bundle leg on its
  // `bundle.requestId`. Missing either branch drops half the list.
  assert.match(LIST, /\{ _id: \{ \$in: ids \} \}/, 'plain registrations are not fetched back');
  assert.match(LIST, /\{ 'bundle\.requestId': \{ \$in: keys \} \}/, 'bundle siblings are not fetched back');
});

test('the rows are assembled by the shared pure function', () => {
  assert.match(ACTIONS.withImports,
    /import\s*\{[^}]*\bfoldLegsIntoRows\b[^}]*\}\s*from\s*'@\/lib\/registrations\/foldRequests'/,
    'the action does not import the shared assembler');
  assert.match(LIST, /docs = foldLegsIntoRows\(keys, legs\)/,
    'the action assembles rows itself instead of calling the tested function');
});

// ── 4. IN-HOUSE IS UNTOUCHED ────────────────────────────────────────────────

test('in-house still counts documents and does not fold', () => {
  /**
   * `register_inhouse` has no `bundle` field on any document, so there is
   * nothing to fold — and a grouped pipeline there would be a rewrite with no
   * behaviour change and a new way to be wrong.
   */
  assert.match(LIST, /total = await Model\.countDocuments\(filter\)/,
    'the in-house branch no longer counts documents');
  assert.match(TOTAL, /if \(source === 'inhouse'\) return Model\.countDocuments\(scope\)/,
    'the in-house toggle badge no longer counts documents');
});

// ── 5. THE CARDS COLLAPSE EACH REQUEST BEFORE COUNTING ──────────────────────

test('the summary cards count one bucket per REQUEST, via the shared precedence', () => {
  assert.match(ACTIONS.withImports,
    /import\s*\{[^}]*\brequestStatusExpr\b[^}]*\}\s*from\s*'@\/lib\/registrations\/requestStatus'/,
    'the counts action does not import the shared precedence');
  assert.match(COUNTS, /requestStatusExpr\('\$statuses'\)/,
    'the counts action does not collapse a request to one status before counting');
  assert.match(COUNTS, /statuses:\s*\{\s*\$addToSet:\s*'\$status'\s*\}/,
    'the per-request status set is not collected');
  assert.ok(!/Model\.countDocuments\(\{ \.\.\.scope, status: value \}\)/.test(COUNTS),
    'a per-status countDocuments is back — that counts a mixed request into two cards');
});

test('the card keys are still built from the declared vocabulary', () => {
  // The property the previous shape had and this one must keep: a status added
  // to PUBLIC_STATUSES is counted without this file being edited.
  assert.match(COUNTS, /PUBLIC_STATUS_VALUES\.map\(\(value\)\s*=>/,
    'the card keys are hand-named again');
});

// ── 6. THE DASHBOARD COUNTS THE SAME THING THE LIST DOES ────────────────────

/**
 * TWO SCREENS, ONE QUESTION, ONE ANSWER.
 *
 * The dashboard's registration numbers and the list's header describe the same
 * set. A dashboard total differing from the list header by the number of bundle
 * legs, with nothing on either screen explaining which is right, is the
 * silent-wrong-number class in its cross-screen form — and it is worse than the
 * within-screen version, because the two numbers are never visible together.
 */
/**
 * ══ THE DASHBOARD'S HALF OF THIS RULE MOVED, AND SO DID ITS GUARD ═══════════
 *
 * It used to be asserted here, as three `assert.match` calls against
 * `src/lib/actions/dashboard.js`. That was wrong twice over:
 *
 * 1. THE BEHAVIOUR IS NOT THERE ANY MORE. `dashboard.js` is a thin authorised
 *    wrapper — guard, scopes, models, delegate — and the reads live in
 *    `lib/dashboard/buildMetrics.js`. A guard reading the action for an
 *    aggregation stage was asserting against a file that will never contain one
 *    again, and would have stayed red against perfectly correct code until
 *    somebody deleted it.
 *
 * 2. THOSE THREE PASSED FOR A DAY ON A FILE THAT COULD NOT COMPILE. A
 *    cherry-pick concatenated two versions of the action and left the folding
 *    code unreachable — computed into locals nothing read, under a `return` that
 *    built its payload elsewhere. Every string the regexes looked for was
 *    present, in dead code, in a module that took the build down. A source scan
 *    matches text, and text survives in dead code; see
 *    docs/ticket-a-source-scan-cannot-tell-live-code-from-dead-code.md for why
 *    no cleverer regex reaches this and what does.
 *
 * THE BEHAVIOURAL HALF now lives in `test/pure/dashboardFoldsRequests.test.mjs`,
 * which runs `buildDashboardMetrics` against counting doubles and asserts on the
 * PIPELINE OBJECT THE REAL CODE BUILT. That cannot pass on dead code, because a
 * dead branch constructs nothing.
 *
 * WHAT STAYS HERE is the one claim that genuinely is about source text: that the
 * dashboard IMPORTS the two shared rules rather than restating them. It belongs
 * beside the list's half of the same rule, which is the whole point of this
 * file — the two screens must not merely agree, they must read the same
 * definitions.
 */
const BUILD_METRICS = readSource('src/lib/dashboard/buildMetrics.js');

test('the dashboard imports the SAME key and the SAME precedence', () => {
  assert.match(BUILD_METRICS.withImports,
    /import\s*\{[^}]*\bREQUEST_KEY_EXPR\b[^}]*\}\s*from\s*'@\/lib\/registrations\/foldRequests'/,
    'the dashboard does not group by the shared key');
  assert.match(BUILD_METRICS.withImports,
    /import\s*\{[^}]*\brequestStatusExpr\b[^}]*\}\s*from\s*'@\/lib\/registrations\/requestStatus'/,
    'the dashboard does not collapse a request with the shared precedence');
});

test('the dashboard does not restate either rule as a second copy', () => {
  /**
   * The failure this prevents is not a missing import — it is a SECOND
   * DEFINITION sitting beside the import and quietly winning. A hand-written
   * `$ifNull` on `bundle.requestId` agrees with the list today and drifts the
   * first time one of the two is edited, which is the cross-screen version of
   * the defect this file exists for.
   *
   * Read from `.code`, so a doc block quoting the expression — this file's own
   * header does — cannot satisfy it. The pure-tier test asserts the same claim
   * from the other side, by IDENTITY against the imported object: measured, a
   * structurally identical copy passes `deepEqual` and fails `===`.
   */
  assert.equal(
    /\$ifNull:\s*\[\s*'\$bundle\.requestId'/.test(BUILD_METRICS.code), false,
    'buildMetrics writes its own request-key expression instead of importing REQUEST_KEY_EXPR',
  );
  assert.equal(
    /REQUEST_STATUS_PRECEDENCE|\$setIsSubset/.test(BUILD_METRICS.code), false,
    'buildMetrics reimplements the request-status precedence instead of calling requestStatusExpr',
  );
});

test('CONTROL: the copy-detector finds a planted second definition', () => {
  // Without this, both `false` assertions above are satisfied by a regex that
  // never matches anything — the classic vacuous negative.
  const planted = "reqKey: { $ifNull: ['$bundle.requestId', { $toString: '$_id' }] },";
  assert.ok(/\$ifNull:\s*\[\s*'\$bundle\.requestId'/.test(planted),
    'the key-copy matcher does not recognise the very shape it forbids');
  assert.ok(/REQUEST_STATUS_PRECEDENCE|\$setIsSubset/.test('case: { $setIsSubset: [f, T] }'),
    'the precedence-copy matcher does not recognise a reimplementation');
  // …and the real file is not empty, so the negatives above have a subject.
  assert.ok(BUILD_METRICS.code.length > 2000,
    `buildMetrics scanned to ${BUILD_METRICS.code.length} chars — too little to conclude anything from`);
});

test('the seat count that KEEPS legs says so where it is rendered', () => {
  /**
   * `getRoundRegistrationSummary` answers "who is expected in this room" and
   * must count legs — a bundle's three courses are three rooms on three days.
   * That is a different question from the list's, and the label is what stops
   * the two numbers reading as a disagreement.
   */
  const panel = readSource('src/app/admin/schedules/_components/RegistrationSummaryPanel.jsx');
  assert.match(panel.code, /ผู้เข้าอบรมในรอบนี้/,
    'the round total no longer says it counts attendees in this round');
  // …and the word the render tier pins is still there.
  assert.match(panel.code, /ทั้งหมด/, 'the pinned total label was renamed');
});

// ── 7. THE PRECEDENCE RULING LIVES BESIDE THE ARRAY ─────────────────────────

/**
 * ══ WHY A TEST GUARDS A COMMENT ════════════════════════════════════════════
 *
 * `cancelled` is NOT at the top of `REQUEST_STATUS_PRECEDENCE`, and that is
 * the least obvious decision in this whole area. "A request with any cancelled
 * leg is cancelled" is what anyone reaches for first — it was proposed, and it
 * was ruled against because `cancelled` is a LOCK in this codebase rather than
 * a stage, and because it would move outstanding work off the card the team
 * works from.
 *
 * The next person to reorder that array will read THE ARRAY, not the commit
 * history. So the ruling has to be at the array, and a comment is the only
 * mechanism that can put it there — which means a test is the only mechanism
 * that can keep it there. Same reasoning as the schema note in
 * test/fs/bundleTagReaders.
 *
 * Asserted against RAW source, because the subject IS a comment: reading
 * `.code` here would strip the thing being checked.
 */
test('the cancelled-wins ruling is recorded AT the precedence array', () => {
  const mod = readSource('src/lib/registrations/requestStatus.js');
  const at = mod.raw.indexOf('export const REQUEST_STATUS_PRECEDENCE');
  assert.notEqual(at, -1, 'the precedence array is gone');

  // The note ABOVE the declaration — bounded by the previous export, so this
  // reads the array's own docblock and not the whole file.
  const prev = mod.raw.lastIndexOf('export const', at - 1);
  assert.notEqual(prev, -1, 'the bound is wrong — nothing precedes the array');
  const note = mod.raw.slice(prev, at);

  // Matched on a CONTIGUOUS fragment: the sentence this came from wraps across
  // a comment line ("IT WAS PROPOSED, AND IT" / "WAS RULED AGAINST"), and a
  // probe spanning the break fails on prose that plainly satisfies it.
  assert.ok(note.includes('WAS RULED AGAINST'),
    'the note does not say the obvious ordering was considered and rejected — a reader will assume nobody thought of it');
  assert.ok(note.includes('LOCK, NOT A STAGE'),
    'the first reason (cancelled is a lock) is no longer recorded');
  assert.ok(note.includes('HIDES LIVE WORK'),
    'the second reason (it hides outstanding work) is no longer recorded');
  assert.ok(note.includes('updateRegistration'),
    'the note no longer points at the code that makes cancelled a lock');
});

test('CONTROL: the note bound is the array’s own docblock, not the file', () => {
  const mod = readSource('src/lib/registrations/requestStatus.js');
  const at = mod.raw.indexOf('export const REQUEST_STATUS_PRECEDENCE');
  const prev = mod.raw.lastIndexOf('export const', at - 1);
  const note = mod.raw.slice(prev, at);

  assert.ok(note.length > 400 && note.length < 4000, `the note slice is ${note.length} chars`);
  // It must NOT reach the generated-expression note further down the file, or
  // "the note says X" is really "the file says X somewhere".
  assert.equal(note.includes('WHY THIS IS GENERATED AND NOT WRITTEN OUT'), false,
    'the slice has run past the array into requestStatusExpr’s docblock');
});
