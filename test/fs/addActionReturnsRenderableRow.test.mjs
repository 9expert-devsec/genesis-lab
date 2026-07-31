import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceForScanning } from '../sourceScan.mjs';

// ── THE RULE THIS GUARD ENFORCES ────────────────────────────────────────────
//
//   AN ACTION FEEDING A SPLICE MUST RETURN THE SHAPE THE **PAGE** PRODUCES,
//   NOT THE SHAPE THE **MODEL** STORES.
//
// The two are not the same whenever a page decorates its rows before handing
// them to a list, and when they differ the client renders something the server
// never would. Both instances found so far:
//
//   featured-courses  the model stores `course_cover_url: ''` (the list
//                     endpoint has no cover) and an un-awaited backfill filled
//                     it in later, so the spliced row had no image
//   featured-reviews  the PAGE attaches the live review payload
//                     (`{ ...f, review: allById.get(f.review_id) }`) and the
//                     list renders `c.review.reviewerName`; the action returned
//                     the bare document, so the card rendered empty
//
// If you are writing a new splice: open the page, find what it does to each row
// between the database read and the list prop, and make the action produce
// that. This applies to any action instrumented later that already feeds a
// splice — the rule does not stop at these five menus.
//
// The required-field list is DERIVED from the list component, not transcribed,
// so a sixth rendered field added later cannot silently ship empty.
//
// WHAT THIS CANNOT SEE:
//   · a field read through a helper (`fmt(c)`) rather than as `c.field` — the
//     scan matches property access on the row variable
//   · whether the VALUE is correct, only that the key is provided
//   · computed access — `c[key]`
//
// The one blind spot that USED to be here — a field read by a child component
// handed the row whole — is now closed from the other side: no list may pass a
// whole row to a child (see the test at the bottom). That coverage previously
// held only by accident, and a refactor extracting a `<Row c={c}/>` would have
// walked all five menus out of scope with this file still green.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const read = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });

// Supplied by Mongo/Mongoose rather than by the create call, so a document
// always has them and the action never needs to name them.
const IMPLICIT = new Set(['_id', 'createdAt', 'updatedAt', '__v']);

/** Every `<rowVar>.<field>` the component reads. */
function fieldsRenderedBy(listRel, rowVars) {
  const src = read(listRel);
  const found = new Set();
  for (const v of rowVars) {
    for (const m of src.matchAll(new RegExp(`\\b${v}\\.([a-zA-Z_][a-zA-Z0-9_]*)`, 'g'))) {
      if (!IMPLICIT.has(m[1])) found.add(m[1]);
    }
  }
  return found;
}

/**
 * Keys the RETURNED document carries: those handed to `create({…})`, plus any
 * added when the action builds its `data`.
 *
 * The second half is not hypothetical — featured-reviews returns
 * `{ ...doc, review }` because the page hydrates each row with the live review
 * payload before the list ever sees it. A guard that read only the create call
 * would demand `review` be a schema field, which it is not and should not be.
 */
function fieldsProvidedBy(actionRel, modelName) {
  const src = read(actionRel);
  const i = src.indexOf(`await ${modelName}.create({`);
  assert.notEqual(i, -1, `${actionRel}: could not find the ${modelName}.create call`);
  const open = src.indexOf('{', i);
  const close = src.indexOf('});', open);
  assert.notEqual(close, -1, `${actionRel}: could not find the end of the create call`);
  const body = src.slice(open, close);
  const provided = new Set(
    [...body.matchAll(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*[:,]/gm)].map((m) => m[1])
  );

  // Fields attached at return time: `data: { ...serialised, review }`.
  const ret = src.indexOf('data: {', close);
  if (ret !== -1) {
    const tail = src.slice(ret, src.indexOf('};', ret) + 2);
    for (const m of tail.matchAll(/(?:^|[{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:[,:}]|$)/gm)) {
      if (m[1] !== 'data') provided.add(m[1]);
    }
  }
  return provided;
}

/** THE CHECK, as a pure function so a control can feed it a broken fixture. */
function missingFields(rendered, provided) {
  return [...rendered].filter((f) => !provided.has(f)).sort();
}

const CASES = [
  {
    menu: 'featured-courses',
    action: 'src/lib/actions/featured-courses.js',
    model: 'FeaturedCourse',
    list: 'src/app/admin/featured-courses/_components/FeaturedCourseList.jsx',
    rowVars: ['c', 'course'],
  },
  {
    menu: 'featured-online-courses',
    action: 'src/lib/actions/featured-online-courses.js',
    model: 'FeaturedOnlineCourse',
    list: 'src/app/admin/featured-online-courses/_components/FeaturedOnlineCourseList.jsx',
    rowVars: ['c', 'course'],
  },
  {
    menu: 'nav-featured-online-courses',
    action: 'src/lib/actions/nav-featured-online-courses.js',
    model: 'NavFeaturedOnlineCourse',
    list: 'src/app/admin/nav-featured-online-courses/_components/NavFeaturedOnlineCourseList.jsx',
    rowVars: ['c', 'course'],
  },
  {
    menu: 'tnhs-courses',
    action: 'src/lib/actions/tnhs-courses.js',
    model: 'TnhsCourse',
    list: 'src/app/admin/tnhs-courses/_components/TnhsCourseList.jsx',
    rowVars: ['c', 'course'],
  },
  {
    // `c.review` is a HYDRATED field, not a schema path: the page attaches the
    // live review payload to each row. The action therefore has to attach it
    // too, or the spliced row renders as an empty card. `r.*` is deliberately
    // NOT in rowVars — those are reads off `c.review`, one level down, and the
    // action supplies that object whole.
    menu: 'featured-reviews',
    action: 'src/lib/actions/featured-reviews.js',
    model: 'FeaturedReview',
    list: 'src/app/admin/featured-reviews/_components/FeaturedReviewList.jsx',
    rowVars: ['c', 'item'],
  },
];

for (const c of CASES) {
  test(`${c.menu}: the created document carries every field the list renders`, () => {
    const rendered = fieldsRenderedBy(c.list, c.rowVars);
    assert.ok(rendered.size > 0, 'the scan found fields at all — otherwise this passes vacuously');
    assert.deepEqual(missingFields(rendered, fieldsProvidedBy(c.action, c.model)), []);
  });
}

test('CONTROL: a fixture missing one field goes red', () => {
  // Without this, `missingFields` returning a constant [] would satisfy every
  // assertion above forever.
  const rendered = new Set(['course_id', 'course_name', 'course_cover_url', 'active']);
  const provided = new Set(['course_id', 'course_name', 'active']); // cover dropped
  assert.deepEqual(missingFields(rendered, provided), ['course_cover_url']);
});

test('CONTROL: the field scan is live — it finds the cover on the real list', () => {
  // Pins the specific field this bug was about, so a scan that silently stopped
  // matching cannot leave the suite green.
  const rendered = fieldsRenderedBy(CASES[0].list, CASES[0].rowVars);
  assert.ok(rendered.has('course_cover_url'), 'the list renders a cover');
  assert.ok(rendered.has('active') && rendered.has('sort_order'));
});

test('CONTROL: the create scan is live — it finds the keys actually passed', () => {
  const provided = fieldsProvidedBy(CASES[0].action, CASES[0].model);
  assert.ok(provided.has('course_cover_url'));
  assert.ok(provided.has('sort_order') && provided.has('active'));
});

test('featured-courses AWAITS the cover — no floating promise', () => {
  // A floating promise in a serverless function may never run: the platform can
  // freeze or terminate the invocation once the response is sent. On localhost
  // the process lives, so it always completes and the hazard is invisible.
  const src = read('src/lib/actions/featured-courses.js');
  assert.ok(src.includes('await getCourseByCode(course_id)'), 'the detail fetch is awaited');
  assert.ok(
    !/getCourseByCode\([^;]*\)\s*\.then\(/.test(src),
    'no fire-and-forget .then( chain remains'
  );
});

test('CONTROL: that matcher would catch the fossil if it came back', () => {
  const fossil = 'getCourseByCode(course_id)\n  .then((detail) => {})';
  assert.ok(/getCourseByCode\([^;]*\)\s*\.then\(/.test(fossil));
  assert.ok(!/getCourseByCode\([^;]*\)\s*\.then\(/.test('await getCourseByCode(course_id);'));
});

// ── the blind spot, closed from the other side ─────────────────────

/**
 * JSX that hands a WHOLE row to a child: `<Row c={c}/>`, `<X item={item}/>`,
 * `<Y {...course}/>`.
 *
 * `={c.field}` is fine and must not match — the closing brace has to follow the
 * variable directly, which is why the pattern ends `\s*\}` rather than allowing
 * a property access.
 */
function wholeRowProps(src, rowVars) {
  const found = [];
  for (const v of rowVars) {
    const attr = new RegExp(`[a-zA-Z-]+=\\{\\s*${v}\\s*\\}`, 'g');
    const spread = new RegExp(`\\{\\s*\\.\\.\\.\\s*${v}\\s*\\}`, 'g');
    for (const m of src.matchAll(attr)) found.push(m[0]);
    for (const m of src.matchAll(spread)) found.push(m[0]);
  }
  return found.sort();
}

for (const c of CASES) {
  test(`${c.menu}: the list passes no WHOLE row to a child component`, () => {
    // If it did, the field scan above would stop seeing what is rendered and
    // this whole file would go quietly out of coverage while staying green.
    // Extracting a row component is a natural refactor, so it has to redden
    // HERE rather than ship empty cards.
    assert.deepEqual(wholeRowProps(read(c.list), c.rowVars), []);
  });
}

test('CONTROL: a list that DOES pass the row whole is reported', () => {
  assert.deepEqual(
    wholeRowProps('<FeaturedRow c={c} key={c._id} />', ['c']),
    ['c={c}']
  );
  assert.deepEqual(wholeRowProps('<Row {...course} />', ['course']), ['{...course}']);
});

test('CONTROL: ordinary property access does NOT trip it', () => {
  // The matcher has to be quiet on every line these components actually
  // contain, or the assertion above is unmaintainable and gets deleted.
  assert.deepEqual(
    wholeRowProps('<img src={c.course_cover_url} alt={c.course_name} key={c._id} />', ['c']),
    []
  );
  assert.deepEqual(wholeRowProps('<DragHandle {...getDragProps(i)} />', ['c', 'course']), []);
  assert.deepEqual(wholeRowProps('onClick={() => handleDelete(c._id)}', ['c']), []);
});

test('the OTHER add actions have no detail-fetch backfill to await', () => {
  // Verified rather than assumed: the two online-course menus carry
  // `course_cover_url` on their LIST endpoint (o_course_cover_url), tnhs takes
  // an uploaded URL from its form, and reviews have no cover concept. Only
  // featured-courses needed a detail lookup, so only it had the defect — the
  // "same template" resemblance does not extend to this.
  for (const rel of [
    'src/lib/actions/featured-online-courses.js',
    'src/lib/actions/nav-featured-online-courses.js',
    'src/lib/actions/featured-reviews.js',
    'src/lib/actions/tnhs-courses.js',
  ]) {
    assert.ok(!read(rel).includes('.then('), `${rel} has no floating promise chain`);
  }
});
