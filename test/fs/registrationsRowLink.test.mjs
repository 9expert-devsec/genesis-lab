import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * TWO CLAIMS THE RENDER TIER CANNOT MAKE ABOUT THE LIST TABLES.
 *
 *   1. ROW NAVIGATION IS A LINK, NOT A CLICK HANDLER. `renderToStaticMarkup`
 *      strips event handlers, so "there is no onClick" is not a statement about
 *      any markup — a table that navigated by `router.push` would render
 *      exactly the same `<td>`s. It has to be read from the source.
 *
 *   2. THE PROJECTION AND THE RENDER LIST ARE EQUAL. `listRegistrations` is a
 *      `'use server'` export that calls `requireAdmin` and opens Mongo on its
 *      first line, so it cannot be invoked here; and a render test cannot see a
 *      missing projection field at all, because an absent field and a field
 *      whose value happens to be empty produce the same cell.
 */

const ACTIONS   = readSource('src/lib/actions/registrations.js');
const PUB_TABLE = readSource('src/app/admin/registrations/_components/PublicTable.jsx');
const INHOUSE   = readSource('src/app/admin/registrations/_components/InhouseTable.jsx');
const PARTS     = readSource('src/app/admin/registrations/_components/tableParts.jsx');

// ── 1. The row is a real link ───────────────────────────────────────────────

/**
 * ── WHY A LINK AND NOT `onClick={() => router.push(href)}` ──────────────────
 *
 * A div with a click handler cannot be middle-clicked into a new tab, cannot be
 * cmd/ctrl-clicked, has no URL to copy or bookmark, does not appear in the
 * browser's link list, and is invisible to keyboard navigation. Every one of
 * those is a thing an admin actually does with a list of records — opening four
 * registrations in four tabs is the normal way to compare them.
 *
 * None of that can be asserted from server-rendered markup, which is why this
 * guard is a source scan and why the render tier's version of the claim is
 * narrower: it counts anchors and their hrefs.
 */
test('no registrations table navigates by router.push', () => {
  for (const f of [PUB_TABLE, INHOUSE, PARTS]) {
    assert.ok(!/router\.push/.test(f.code),
      `${f.rel} navigates with router.push. A row must be a real <a href> — middle-click, `
      + 'cmd-click, copy-link and keyboard focus are all browser behaviours of an anchor and '
      + 'none of them survives a click handler.');
    assert.ok(!/useRouter/.test(f.code), `${f.rel} imports a router it should not need`);
  }
});

test('the row link is a next/link Link with an href', () => {
  // The positive half. Without it, "no router.push" is satisfied by a table
  // that does not navigate at all.
  assert.match(PARTS.withImports, /import Link from 'next\/link'/, 'tableParts does not import Link');
  assert.match(PARTS.code, /<Link\s+href=\{href\}/, 'CellLink does not render a Link with the row href');
});

test('every cell delegates to CellLink rather than rolling its own anchor', () => {
  // One definition of "a clickable cell", so the 82px height, the padding and
  // the tab-order rule are decided once. A hand-written <a> in a cell would be
  // a second definition and would drift.
  for (const f of [PUB_TABLE]) {
    assert.ok(!/<a\b/.test(f.code), `${f.rel} writes a raw <a> instead of using CellLink`);
    assert.ok(!/<Link\b/.test(f.code), `${f.rel} writes its own Link instead of using CellLink`);
    assert.match(f.code, /<CellLink/, `${f.rel} does not use CellLink at all`);
  }
});

test('only the first cell of a row is a tab stop', () => {
  // Six anchors per row is 120 tab stops on a page of twenty. The rule is
  // expressed once, in CellLink, and this pins that it is expressed at all —
  // the render tier counts the RESULT, this pins the mechanism.
  assert.match(PARTS.code, /tabIndex=\{first \? undefined : -1\}/,
    'CellLink no longer removes the non-first cells from the tab order');
});

// ── 2. The projection IS the render list ────────────────────────────────────

/**
 * The two `.select(…)` strings in `listRegistrations`, identified by a field
 * only one of them can contain rather than by their order in the file.
 *
 * Order would be the obvious way and is the fragile one: the two branches are
 * an if/else and swapping them is a legitimate edit that must not silently
 * re-point this whole test at the wrong table.
 */
function listRegistrationsBody() {
  /**
   * SCOPED TO ONE FUNCTION, and that was not optional.
   *
   * The first version of this scanned the whole actions file and found FOUR
   * `.select(…)` calls, not two: `updateRegistrationStatus` and
   * `updateRegistration` each read `.select('status')` before writing, to check
   * the transition. Those are not projections of a list and have nothing to do
   * with what a table renders — but `find(s => s.includes('courseName'))` over
   * all four would have picked whichever happened to match, and a `select`
   * added to any other action later would have silently changed which string
   * this whole file is about.
   */
  const start = ACTIONS.code.indexOf('export async function listRegistrations');
  assert.notEqual(start, -1, 'listRegistrations not found in the actions file');
  const rest = ACTIONS.code.slice(start + 1);
  const next = rest.indexOf('\nexport ');
  assert.notEqual(next, -1, 'listRegistrations is the last export — the bound is wrong');
  return rest.slice(0, next);
}

function projections() {
  const body = listRegistrationsBody();
  const selects = [...body.matchAll(/\.select\('([^']*)'\)/g)].map((m) => m[1]);
  assert.equal(selects.length, 2, `expected 2 projections in listRegistrations, found ${selects.length}`);

  const inhouse = selects.find((s) => s.includes('companyName'));
  const publik  = selects.find((s) => s.includes('courseName'));
  assert.ok(inhouse, 'no in-house projection found (none mentions companyName)');
  assert.ok(publik,  'no public projection found (none mentions courseName)');
  assert.notEqual(inhouse, publik, 'both discriminators matched the same projection');

  return { inhouse: inhouse.split(/\s+/).filter(Boolean), publik: publik.split(/\s+/).filter(Boolean) };
}

/**
 * Every `row.<field>` a table reads, as base field names.
 *
 * `row.coordinator?.email` counts as `coordinator`, which is right: the
 * projection selects the whole subdocument and Mongo has no way to send half of
 * one at this level.
 */
function fieldsRead(src) {
  return new Set([...src.matchAll(/\brow\.(\w+)/g)].map((m) => m[1]));
}

/**
 * ── THE RULE, IN BOTH DIRECTIONS ────────────────────────────────────────────
 *
 * A projection that is a SUBSET of the render makes cells render `undefined` —
 * this whole in-house table was once blank because it was fed a public-shaped
 * projection, and the em-dashes looked like missing data rather than a bug.
 *
 * A projection that is a SUPERSET is dead weight over the wire, and worse, it is
 * how `payment` and `pricing` — two entire subdocuments — went on being fetched
 * for twenty rows a page after the columns that read them were removed. Round 3
 * removed them, and this is what would have said so at the time.
 *
 * `_id` is exempt: Mongo always returns it and no projection names it.
 */
for (const [name, rel, key] of [
  ['PublicTable',  'src/app/admin/registrations/_components/PublicTable.jsx',  'publik'],
  ['InhouseTable', 'src/app/admin/registrations/_components/InhouseTable.jsx', 'inhouse'],
]) {
  test(`${name}: every field it renders is projected`, () => {
    const projected = new Set(projections()[key]);
    const read = fieldsRead(readSource(rel).code);
    const missing = [...read].filter((f) => f !== '_id' && !projected.has(f));
    assert.deepEqual(missing, [],
      `${name} renders ${missing.join(', ')} but listRegistrations does not select ${missing.length > 1 ? 'them' : 'it'}. `
      + 'The cell will render undefined, which looks like missing data rather than a bug.');
  });

  test(`${name}: every projected field is rendered`, () => {
    const projected = projections()[key];
    const read = fieldsRead(readSource(rel).code);
    const unused = projected.filter((f) => !read.has(f));
    assert.deepEqual(unused, [],
      `listRegistrations selects ${unused.join(', ')} but ${name} renders ${unused.length > 1 ? 'none of them' : 'it nowhere'}. `
      + 'Either a column was removed and its field was left behind, or the field belongs on the detail page.');
  });
}

/**
 * THE THREE FIELDS ROUND 3 DROPPED, NAMED.
 *
 * The equality tests above would go green if a future edit removed a column AND
 * its field together — which is correct. This is the narrower claim that these
 * particular three are gone and are not to come back into the LIST, because the
 * ruling was about where the information lives rather than about tidiness.
 */
test('payment, pricing and requestInvoice have left the public projection', () => {
  const publik = projections().publik;
  for (const field of ['payment', 'pricing', 'requestInvoice']) {
    assert.ok(!publik.includes(field),
      `${field} is back in the public list projection. The tick columns and the payment `
      + 'chip were removed by ruling and that information lives on the detail page.');
  }
});

/**
 * AND THE TWO THE SAME RULING KEPT.
 *
 * `attendanceMode` looks like the obvious next thing to drop — it is only ever
 * read by one chip — and dropping it would collapse "Hybrid · Teams" and
 * "Hybrid · Class" into one word. ScheduleBadge stays whole by ruling, which
 * means both halves stay projected.
 *
 * `classDate` lost its own column and kept its field: it is the รอบอบรม line
 * inside the course cell now. A field losing a column is not a field losing a
 * home, and that is the distinction this round's removals turn on.
 */
test('scheduleType, attendanceMode and classDate all stay projected', () => {
  const publik = projections().publik;
  for (const field of ['scheduleType', 'attendanceMode', 'classDate']) {
    assert.ok(publik.includes(field),
      `${field} left the public projection. It is still rendered — see the course cell.`);
  }
});

test('contactPhone stays in the in-house projection', () => {
  // Kept by ruling: an in-house enquiry is followed up by telephone, and the
  // number is the one thing a salesperson needs straight off this screen.
  assert.ok(projections().inhouse.includes('contactPhone'),
    'contactPhone left the in-house projection — it is kept by ruling');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the extractors find real things', () => {
  /**
   * Both equality tests are `deepEqual(x, [])`. An extractor returning nothing
   * satisfies them in every direction at once, which is the worst possible
   * failure for a test that claims to compare two lists.
   */
  const { publik, inhouse } = projections();
  assert.ok(publik.length >= 6, `the public projection parsed to ${publik.length} fields`);
  assert.ok(inhouse.length >= 8, `the in-house projection parsed to ${inhouse.length} fields`);
  assert.ok(publik.includes('status') && publik.includes('createdAt'), 'the parse lost known fields');

  const read = fieldsRead(PUB_TABLE.code);
  assert.ok(read.size >= 6, `only ${read.size} row.* reads found in PublicTable`);
  assert.ok(read.has('coordinator'), 'the row.* matcher does not reduce an optional chain to its base field');
  assert.ok(read.has('_id'), 'the row.* matcher missed row._id');
});

test('CONTROL: the function bound really excludes the other actions’ selects', () => {
  /**
   * The scoping above is the load-bearing part of this file — get it wrong and
   * every assertion here is about a string from some other function. So: the
   * slice must contain both list projections and NEITHER of the write path's
   * `.select('status')` reads, and it must be a small part of the file.
   */
  const body = listRegistrationsBody();
  assert.ok(body.includes('courseName'),  'the slice lost the public projection');
  assert.ok(body.includes('companyName'), 'the slice lost the in-house projection');
  assert.equal(/\.select\('status'\)/.test(body), false,
    'the slice reaches into updateRegistrationStatus — its select is not a list projection');
  assert.ok(body.length < ACTIONS.code.length / 3, 'the slice is most of the file — the bound is wrong');

  // …and the whole file really does contain those other selects, so this
  // control is describing the real situation rather than a hypothetical.
  assert.equal((ACTIONS.code.match(/\.select\(/g) ?? []).length, 4,
    'the actions file no longer has four selects — re-read the scoping note');
});

test('CONTROL: the field matcher would catch an unprojected read', () => {
  // Point it at the exact shape the rule forbids — a cell reading a field the
  // projection does not name.
  const fake = fieldsRead('<p>{row.notProjectedAtAll}</p>');
  assert.deepEqual([...fake], ['notProjectedAtAll']);
  assert.equal(projections().publik.includes('notProjectedAtAll'), false);
});

test('CONTROL: the projection discriminators are not interchangeable', () => {
  // The two branches are told apart by a field only one can hold. If both
  // projections ever mentioned both, `find` would return the same string twice
  // and every assertion above would silently be about one table.
  const { publik, inhouse } = projections();
  assert.ok(!publik.includes('companyName'), 'the public projection names an in-house field');
  assert.ok(!inhouse.includes('courseName'), 'the in-house projection names a public field');
});
