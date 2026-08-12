import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * ONE definition per fact, across TWO layouts.
 *
 * Below `lg` the /schedule page renders cards instead of the table, and both
 * subtrees are in the DOM at once. Every fact they share — the registration
 * href, the type colour, the status badge, the date label, the early-bird
 * condition — is now something two renderers read. A second copy of any of them
 * does not error and does not look wrong on the layout you happen to be
 * testing; it just means the phone and the desktop quietly say different
 * things, and no viewport shows both at once to catch it.
 *
 * Read through test/sourceScan.mjs so comments (including the prose in this
 * component explaining what was unified) cannot satisfy a matcher, and so CRLF
 * is normalised before matching.
 */

const CLIENT = readSource('src/app/(public)/schedule/_components/ScheduleClient.jsx');
const FILTERS = readSource('src/lib/schedule/scheduleFilters.js');
const HREF = readSource('src/lib/schedule/scheduleRegistrationHref.js');

/** The body of a top-level function declaration, as text. */
function functionSlice(code, name) {
  const start = code.search(new RegExp(String.raw`^(export\s+)?function\s+${name}\s*\(`, 'm'));
  assert.notEqual(start, -1, `${name} not found — this guard has lost its subject`);
  const rest = code.slice(start + 1);
  const end = rest.search(/^(export\s+)?(function|const)\s/m);
  return end === -1 ? rest : rest.slice(0, end);
}

const countOf = (code, pattern) => (code.match(pattern) ?? []).length;

// ── The registration href ───────────────────────────────────────────────────

test('the registration href is built in exactly one place', () => {
  /**
   * Both layouts link the same round to the same wizard, and the `&class=` half
   * is load-bearing beyond this page (RegisterWizard skips its round-confirm
   * step when it resolves — see registrationEntryPointClassParam.test.mjs). A
   * second builder that dropped it would restore the extra click on one layout
   * only, which is the kind of regression nobody reports.
   *
   * THE ONE PLACE IS NO LONGER THIS FILE. It moved to
   * lib/schedule/scheduleRegistrationHref when /search's schedule section turned
   * out to be carrying a byte-identical third copy — a copy this guard, scoped
   * to one component, was structurally unable to see. The claim is unchanged;
   * only its subject moved outward far enough to be true.
   */
  assert.equal(
    countOf(HREF.code, /export function scheduleRegistrationHref\(/g),
    1,
    'the builder is declared exactly once, in the shared module',
  );
  assert.ok(
    HREF.code.includes('/registration/public?course='),
    'and that module is the one that owns the template',
  );
  assert.equal(
    countOf(CLIENT.code, /`\/registration\/public\?course=/g),
    0,
    'this component must no longer write the URL at all',
  );
  assert.equal(
    countOf(CLIENT.code, /function scheduleRegistrationHref\(/g),
    0,
    'nor keep a local declaration beside the imported one',
  );
  assert.match(
    CLIENT.withImports,
    /import \{ scheduleRegistrationHref \} from "@\/lib\/schedule\/scheduleRegistrationHref"/,
    'it imports the shared builder',
  );
});

test('CONTROL: the href probes DO fire on the shape this replaced', () => {
  /**
   * Three of the five assertions above are absences in CLIENT.code, and an
   * absence is what a matcher that can see nothing also reports. Run the two
   * patterns against the local builder exactly as it was written here before the
   * move.
   */
  const before = [
    'function scheduleRegistrationHref(schedule, courseId) {',
    '  if (schedule?._id && courseId) {',
    '    return `/registration/public?course=${String(courseId).toLowerCase()}&class=${schedule._id}`;',
    '  }',
    '  return schedule?.signup_url || null;',
    '}',
  ].join('\n');
  assert.equal(countOf(before, /`\/registration\/public\?course=/g), 1, 'the template probe works');
  assert.equal(countOf(before, /function scheduleRegistrationHref\(/g), 1, 'and the declaration probe');
  // …and the module the claim moved to was really read, not silently empty.
  assert.ok(HREF.code.length > 100, 'the shared module was read');
});

test('both layouts call the builder rather than inlining a URL', () => {
  for (const component of ['ScheduleCell', 'RoundRow']) {
    const body = functionSlice(CLIENT.code, component);
    assert.match(
      body,
      /scheduleRegistrationHref\(\s*schedule\s*,\s*courseId\s*\)/,
      `${component} must build its href through the shared function`,
    );
    assert.equal(
      body.includes('/registration/public'),
      false,
      `${component} must not write the URL itself`,
    );
  }
});

// ── One definition per shared fact ──────────────────────────────────────────

test('TYPE_COLOR is declared once and read by both layouts', () => {
  assert.equal(countOf(CLIENT.code, /const TYPE_COLOR\s*=/g), 1, 'one declaration');
  for (const component of ['ScheduleCell', 'RoundRow']) {
    assert.match(
      functionSlice(CLIENT.code, component),
      /TYPE_COLOR\[schedule\.type\]/,
      `${component} must read the shared type map`,
    );
  }
  // The legend rows are data too — the swatches and the dots cannot be
  // describing different colours.
  assert.equal(countOf(CLIENT.code, /const TYPE_LEGEND\s*=/g), 1);
});

test('the date label is ONE imported formatter and two option objects', () => {
  /**
   * ── WHAT CHANGED, AND WHY THE CLAIM SURVIVED THE CHANGE ────────────────────
   * This test used to assert that `formatDateLabel` was declared exactly once IN
   * THIS FILE and that `formatCardDateLabel` was built on top of it. Both of
   * those functions are gone, so the assertion as written no longer has a
   * subject — but the claim it was making is the one worth keeping, and it is
   * now true of a WIDER scope than this file.
   *
   * The old arrangement was "one local formatter, wrapped by a second local
   * formatter". It held the two layouts on this page in agreement and could not
   * see anything outside it — which is exactly how /search, the page-builder
   * section and lib/formatScheduleDate each grew their own copy, and how three
   * of the five ended up rendering a round on 8, 10 and 12 ต.ค. as `8-12`.
   *
   * The new arrangement is "one formatter, IMPORTED, called at two sites that
   * differ only in their options object". So the guard now checks:
   *   · the formatter is imported, not declared here;
   *   · neither of the two old local functions has grown back;
   *   · the table cell calls it with NO options (the column header carries the
   *     month and the year, so the cell must not repeat them);
   *   · the card row calls it with month + 'auto' year + a threaded currentYear;
   *   · this file no longer carries a MONTH_TH array at all.
   */
  assert.match(
    CLIENT.withImports,
    /import\s*\{\s*formatRoundDays\s*\}\s*from\s*"@\/lib\/schedule\/roundDateLabel"/,
    'the formatter must be imported from the shared module',
  );
  assert.equal(
    countOf(CLIENT.code, /function formatRoundDays\b/g),
    0,
    'and never redeclared here',
  );
  for (const retired of ['formatDateLabel', 'formatCardDateLabel']) {
    assert.equal(
      countOf(CLIENT.code, new RegExp(String.raw`function ${retired}\s*\(`, 'g')),
      0,
      `${retired} was replaced by the shared formatter — it must not grow back`,
    );
  }

  // The table cell: no options at all.
  assert.match(
    functionSlice(CLIENT.code, 'ScheduleCell'),
    /formatRoundDays\(schedule\.dates\)/,
    'the desktop cell takes the bare call — the header supplies month and year',
  );

  // The card row: month, 'auto' year, and a currentYear it was HANDED.
  const row = functionSlice(CLIENT.code, 'RoundRow');
  assert.match(row, /formatRoundDays\(schedule\.dates,\s*\{/);
  assert.match(row, /showMonth:\s*true/);
  assert.match(row, /showYear:\s*"auto"/);
  assert.match(row, /currentYear/);

  // No ninth month table. The card's month and year are locale data now.
  assert.equal(countOf(CLIENT.code, /const MONTH_TH\s*=/g), 0);
});

test('the card year comes from the page\'s ONE clock read, in Asia/Bangkok', () => {
  /**
   * `showYear: 'auto'` needs to know what year it is, and roundDateLabel refuses
   * to find out for itself. That read has to happen exactly once and in a pinned
   * zone, for two separate reasons:
   *
   *   · ONCE — this page already reads the clock a single time into `now` and
   *     derives the window, the reset target and the horizon from it, precisely
   *     because three separate `new Date()` calls once disagreed. A fourth read
   *     inside RoundRow would be the same defect wearing a fourth hat.
   *   · IN BANGKOK — RoundRow renders during SSR too, and Vercel is UTC. Between
   *     17:00 and midnight Bangkok on 31 December, `getFullYear()` differs
   *     between server and browser, so every card holding a next-year round
   *     would hydrate to a different string than it rendered.
   */
  assert.match(
    CLIENT.withImports,
    /import\s*\{\s*siteDateParts\s*\}\s*from\s*"@\/lib\/articlePublishTime"/,
    'the zone must come from the module that owns it',
  );
  assert.match(
    functionSlice(CLIENT.code, 'ScheduleClient'),
    /siteDateParts\(now\)\.year/,
    'derived from the SAME `now` the rest of the page uses',
  );
  // And nowhere below it. `new Date()` appears once in this file, in the
  // `useState` initialiser that produces `now`.
  assert.equal(
    countOf(CLIENT.code, /new Date\(\)/g),
    1,
    'a second clock read is a second answer to "what year is it"',
  );
  assert.equal(
    countOf(functionSlice(CLIENT.code, 'RoundRow'), /new Date\(/g),
    0,
    'RoundRow must be handed the year, not go and get one',
  );
});

test('CONTROL: the wiring probes above DO fire on the arrangement they replaced', () => {
  /**
   * Every assertion in the two tests above is either a `match` on the current
   * text or an `equal(count, 0)`. Both shapes pass trivially against a file that
   * simply does not contain the thing — so the probes are run here against a
   * SAMPLE of the old arrangement to show they discriminate.
   */
  const oldShape = [
    'const MONTH_TH = ["ม.ค."];',
    'function formatDateLabel(scheduleItem) { return "8-12"; }',
    'function formatCardDateLabel(scheduleItem) { return formatDateLabel(scheduleItem); }',
    'function RoundRow() { const y = new Date().getFullYear(); }',
  ].join('\n');

  assert.equal(countOf(oldShape, /const MONTH_TH\s*=/g), 1, 'the MONTH_TH probe must see one');
  assert.equal(countOf(oldShape, /function formatDateLabel\s*\(/g), 1);
  assert.equal(countOf(oldShape, /function formatCardDateLabel\s*\(/g), 1);
  assert.equal(countOf(oldShape, /new Date\(\)/g), 1, 'the second-clock probe must see the read');
  // And the import probe finds nothing in it, which is the whole point.
  assert.equal(/import\s*\{\s*formatRoundDays\s*\}/.test(oldShape), false);
});

test('resolveScheduleBadge is imported, never redefined, and used by both', () => {
  assert.equal(
    countOf(CLIENT.code, /function resolveScheduleBadge\b/g),
    0,
    'the badge policy belongs to lib/scheduleStatus',
  );
  assert.match(
    CLIENT.withImports,
    /import\s*\{[\s\S]*?resolveScheduleBadge[\s\S]*?\}\s*from\s*"@\/lib\/scheduleStatus"/,
  );
  for (const component of ['ScheduleCell', 'RoundRow']) {
    assert.match(
      functionSlice(CLIENT.code, component),
      /resolveScheduleBadge\(schedule\.status\)/,
      `${component} must resolve its badge from the shared policy`,
    );
    assert.match(
      functionSlice(CLIENT.code, component),
      /statusStyle &&/,
      `${component} must omit the badge entirely when there is none`,
    );
  }
});

test('the early-bird condition and lookup are each written once', () => {
  assert.equal(countOf(CLIENT.code, /function isEarlyBirdSchedule\(/g), 1);
  assert.match(
    functionSlice(CLIENT.code, 'isEarlyBirdSchedule'),
    /!!ebScheduleId && schedule\._id === ebScheduleId/,
    'the shipped condition, unchanged',
  );
  assert.equal(countOf(CLIENT.code, /function earlyBirdIdFor\(/g), 1);
  assert.equal(
    countOf(CLIENT.code, /isEarlyBirdSchedule\(/g),
    3,
    'declared once, called by the table and by the card',
  );
});

test('the matcher and the window are shared, not re-derived by the card', () => {
  /**
   * `courseRounds` is the agreement point: the SAME round list, the SAME
   * visibleMonths and the SAME matcher the table's lanes are packed from.
   *
   * The first argument used to be `scheduleMap[c._id] ?? {}` — the per-month
   * BUCKETS. It is `roundsByCourse[c._id] ?? []` now, a flat list, and the change
   * is not cosmetic: buckets keyed a round by its first date only, so a
   * cross-month round was invisible from its second month. Under the span-based
   * rule that replaced them, a round appears in two months' worth of columns, and
   * a bucket walk would emit it once per month and list it twice on the card.
   */
  assert.match(
    functionSlice(CLIENT.code, 'ProgramGroup'),
    /courseRounds\(\s*roundsByCourse\[c\._id\] \?\? \[\],\s*visibleMonths,\s*sessionMatches,?\s*\)/,
    'the card must be fed the table’s own window and matcher',
  );
  assert.equal(
    countOf(CLIENT.code, /function matchesSession\(/g),
    0,
    'the matcher lives in lib/schedule/scheduleFilters',
  );
  assert.equal(countOf(FILTERS.code, /export function matchesSession\(/g), 1);
});

// ── The sheet is live, not draft ────────────────────────────────────────────

test('the filter panel holds no state and offers no apply step', () => {
  /**
   * The structural half of "live, not draft". A panel with no state cannot
   * represent a value the list has not applied; the render tier asserts the two
   * agree, and this asserts they cannot stop agreeing.
   */
  const panel = functionSlice(CLIENT.code, 'ScheduleFilterPanel');
  assert.equal(/useState\(/.test(panel), false, 'no draft state in the sheet');
  assert.equal(/useReducer\(/.test(panel), false);
  assert.equal(CLIENT.code.includes('ใช้ตัวกรอง'), false, 'no button that applies what is applied');
  assert.match(panel, /onChange=\{\(program\) => onFilterChange\(\{ program \}\)\}/,
    'every control writes straight through to the page’s own setter');
  assert.match(panel, /onClick=\{onReset\}/);
  assert.match(panel, /aria-label="ปิดตัวกรอง"/, 'the dismiss affordance is labelled as closing');
});

test('the sheet reads the page’s own count, not a second derivation', () => {
  const board = functionSlice(CLIENT.code, 'ScheduleBoard');
  assert.equal(
    countOf(board, /resultCount=\{filteredCourses\.length\}/g),
    1,
    'the sheet is handed the very number the page renders',
  );
  assert.equal(
    countOf(board, /<ResultCount count=\{filteredCourses\.length\} \/>/g),
    2,
    'and the page prints the same expression through the same component',
  );
  assert.equal(countOf(CLIENT.code, /function ResultCount\(/g), 1, 'one result line, three homes');
  assert.equal(
    countOf(CLIENT.code, /filteredCourses\.filter\(|\.filter\(sessionMatches\)\.length/g),
    0,
    'no second count computed off a parallel filter path',
  );
});

test('the defaults, the initial state and the reset target are one object', () => {
  const shell = functionSlice(CLIENT.code, 'ScheduleClient');
  assert.match(shell, /const \[defaults\] = useState\(\(\) => defaultScheduleFilters\(now\)\)/);
  assert.match(shell, /const \[filters, setFilters\] = useState\(defaults\)/);
  assert.match(shell, /setFilters\(defaults\)/, 'ล้างตัวกรอง restores that same object');
  assert.equal(
    countOf(CLIENT.code, /defaultScheduleFilters\(/g),
    1,
    'the rolling window is computed once, not once per consumer',
  );
  assert.equal(countOf(CLIENT.code, /new Date\(\)/g), 1, 'and the clock is read once per mount');
});

test('the sheet follows the drawer precedent: portal, scroll lock, z-[9999]', () => {
  const sheet = functionSlice(CLIENT.code, 'ScheduleFilterSheet');
  assert.match(sheet, /createPortal\(panel, document\.body\)/, 'portalled out of the sticky bar');
  assert.match(sheet, /document\.body\.style\.overflow = "hidden"/, 'body scroll lock');
  assert.match(sheet, /document\.body\.style\.overflow = previous/, 'and it is restored');
  assert.match(sheet, /e\.key === "Escape"/, 'Escape closes');
  assert.match(sheet, /panelRef\.current\?\.focus\?\.\(\)/, 'focus moves into the sheet');
  assert.match(sheet, /returnFocusRef\?\.current\?\.focus\?\.\(\)/, 'and returns to the button');
  assert.ok(CLIENT.code.includes('z-[9999]'), 'the same z the site drawer uses');
});

// ── The two layouts ─────────────────────────────────────────────────────────

test('the layout switch is CSS at lg, not a media-query hook', () => {
  /**
   * A JS media query has no answer on the server, so first paint is either a
   * hydration mismatch or a flash of the wrong layout on every visit. The cost
   * of the CSS answer is the duplicated subtree the guards above pay for.
   */
  assert.equal(/matchMedia/.test(CLIENT.code), false, 'no media-query hook');
  assert.ok(CLIENT.code.includes('className="hidden lg:block"'), 'the table hides below lg');
  assert.ok(CLIENT.code.includes('lg:hidden'), 'and the cards hide from lg up');
  assert.equal(/\bmd:hidden\b/.test(CLIENT.code), false, 'the break is lg, not md');
});

test('no hand-written element id survives in a doubled subtree', () => {
  assert.equal(
    /\bid="[^"]/.test(CLIENT.code),
    false,
    'a literal id renders twice once two courses do',
  );
  assert.equal(countOf(CLIENT.code, /useId\(\)/g), 2, 'the card list and the dialog title');
});

test('the collapse threshold is derived from the default window, not guessed', () => {
  assert.match(
    CLIENT.code,
    /const ROUND_COLLAPSE_THRESHOLD = PUBLIC_SCHEDULE_DEFAULT_MONTHS;/,
    'so the untouched page never shows a toggle',
  );
});

test('measure() returns before its arithmetic when there is nothing to scroll', () => {
  /**
   * Below `lg` the table is inside `display: none`, so `measure()` reads
   * clientWidth 0 and scrollWidth 0. The early return is what keeps the
   * proportional maths — which divides by scrollWidth — off a zero.
   */
  const table = functionSlice(CLIENT.code, 'ProgramTable');
  const guard = table.indexOf('if (!need || !bar) return;');
  const maths = table.indexOf('clientWidth / scrollWidth');
  assert.notEqual(guard, -1, 'the early return is gone');
  assert.notEqual(maths, -1, 'the proportional maths is gone — this guard lost its subject');
  assert.ok(guard < maths, 'the guard must come first');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: functionSlice returns a real body, bounded at the next declaration', () => {
  /**
   * Every assertion above is scoped by this helper. If it returned '' each
   * `includes(...) === false` would pass together; if it returned the whole file
   * each positive match would pass off a neighbour's code.
   */
  const cell = functionSlice(CLIENT.code, 'ScheduleCell');
  assert.ok(cell.length > 200, 'the slice is not empty');
  assert.ok(cell.includes('resolveScheduleBadge'), 'and it contains that function’s own code');
  assert.equal(cell.includes('function RoundRow'), false, 'but not the next declaration');
  assert.equal(cell.includes('createPortal'), false, 'nor anything from elsewhere in the file');

  const panel = functionSlice(CLIENT.code, 'ScheduleFilterPanel');
  assert.ok(panel.includes('ล้างตัวกรอง'), 'the panel slice really is the panel');
  assert.equal(panel.includes('function SheetField'), false, 'bounded at the next declaration');
});

test('CONTROL: the useState probe DOES fire on state that is really there', () => {
  // Without this, "no draft state in the sheet" is satisfiable by a probe that
  // cannot see state at all.
  assert.ok(/useState\(/.test(functionSlice(CLIENT.code, 'CourseCard')), 'the card DOES hold state');
  assert.ok(/useState\(/.test(functionSlice(CLIENT.code, 'TypeLegend')));
});

test('CONTROL: the source was actually read and scrubbed', () => {
  // A wrong path or a failed scrub returns '' and every "does not contain"
  // assertion passes together — the worst possible combination.
  assert.ok(CLIENT.code.length > 5000, 'the component was read');
  assert.match(CLIENT.code, /export function ScheduleBoard/);
  assert.match(CLIENT.code, /export function ScheduleFilterPanel/);
  assert.ok(FILTERS.code.length > 500, 'the filter module was read');
  assert.match(FILTERS.code, /export function defaultScheduleFilters/);
  // …and the prose in these files did not survive into `code`.
  assert.equal(CLIENT.code.includes('draft-then-apply'), false, 'comments must be stripped');
});
