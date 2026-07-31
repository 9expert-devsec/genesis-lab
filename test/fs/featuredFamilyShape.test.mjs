import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceForScanning } from '../sourceScan.mjs';

// FIVE admin menus share one narrow shape: a sibling add-form and a list that
// owns its rows. The add succeeded, the server render was fresh, and the list
// discarded it — measured in a browser for the shape, and visible on screen as
// an asymmetry: the server-computed "N / M active" counter in the header moved
// while the list below it did not.
//
// This file pins the whole family so the five cannot drift apart again.
//
// WHAT IT CANNOT SEE: it is a source-shape guard, not a behavioural one. It
// cannot prove the channel actually delivers at runtime — only that each menu
// names the pieces. The behavioural evidence is the browser measurement
// recorded in docs/admin-staleness-audit.md.
//
// NOTE `\r?\n` throughout: the working tree is CRLF, and a matcher written with
// a bare \n silently matches nothing — which for a "does NOT contain" assertion
// is indistinguishable from a pass.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// Both readers go through test/sourceScan.mjs — see its header for the six
// matcher defects it removes and the one it deliberately cannot.
//
// `strip` keeps imports: for assertions about the file as a whole.
const strip = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });
// `body` drops them too: `import { useAddedRowSink } from …` satisfies a naive
// "does this file use useAddedRowSink" check while the component that should
// call it does nothing — which is exactly what the red-check found.
const body = (rel) => readSourceForScanning(path.join(ROOT, rel));

const FAMILY = [
  {
    menu: 'featured-courses',
    action: 'src/lib/actions/featured-courses.js',
    page: 'src/app/admin/featured-courses/page.jsx',
    form: 'src/app/admin/featured-courses/_components/AddFeaturedCourseForm.jsx',
    list: 'src/app/admin/featured-courses/_components/FeaturedCourseList.jsx',
  },
  {
    menu: 'featured-online-courses',
    action: 'src/lib/actions/featured-online-courses.js',
    page: 'src/app/admin/featured-online-courses/page.jsx',
    form: 'src/app/admin/featured-online-courses/_components/AddFeaturedOnlineCourseForm.jsx',
    list: 'src/app/admin/featured-online-courses/_components/FeaturedOnlineCourseList.jsx',
  },
  {
    menu: 'nav-featured-online-courses',
    action: 'src/lib/actions/nav-featured-online-courses.js',
    page: 'src/app/admin/nav-featured-online-courses/page.jsx',
    form: 'src/app/admin/nav-featured-online-courses/_components/AddNavFeaturedOnlineCourseForm.jsx',
    list: 'src/app/admin/nav-featured-online-courses/_components/NavFeaturedOnlineCourseList.jsx',
  },
  {
    menu: 'featured-reviews',
    action: 'src/lib/actions/featured-reviews.js',
    page: 'src/app/admin/featured-reviews/page.jsx',
    form: 'src/app/admin/featured-reviews/_components/ReviewSelector.jsx',
    list: 'src/app/admin/featured-reviews/_components/FeaturedReviewList.jsx',
  },
  {
    menu: 'tnhs-courses',
    action: 'src/lib/actions/tnhs-courses.js',
    page: 'src/app/admin/tnhs-courses/page.jsx',
    form: 'src/app/admin/tnhs-courses/_components/TnhsCourseForm.jsx',
    list: 'src/app/admin/tnhs-courses/_components/TnhsCourseList.jsx',
  },
];

test('the family is exactly these five menus', () => {
  // An exact set. Adding a sixth menu with this shape must be a deliberate edit
  // here, not something that quietly inherits or quietly misses the fix.
  assert.deepEqual(
    FAMILY.map((f) => f.menu).sort(),
    [
      'featured-courses',
      'featured-online-courses',
      'featured-reviews',
      'nav-featured-online-courses',
      'tnhs-courses',
    ]
  );
});

for (const f of FAMILY) {
  test(`${f.menu}: the read comparator is still { sort_order: 1, createdAt: -1 }`, () => {
    // featuredListOrder.js exists to mirror THIS. If a query changes, the
    // client comparator is silently wrong and only this test says so.
    assert.ok(
      strip(f.action).includes('.sort({ sort_order: 1, createdAt: -1 })'),
      `${f.action} must still sort this way`
    );
  });

  test(`${f.menu}: the add action returns the created document`, () => {
    const src = strip(f.action);
    assert.ok(src.includes('const created = await'), 'the created doc is captured');
    // The serialisation, not the whole expression: featured-reviews wraps it as
    // `{ ...JSON.parse(…), review }` because its list rows are hydrated with the
    // live review payload before they are ever rendered. What matters here is
    // that the document is serialised the way the READ path serialises;
    // test/fs/addActionReturnsRenderableRow.test.mjs is what checks that every
    // field the list renders is actually present.
    assert.ok(
      src.includes('JSON.parse(JSON.stringify(created.toObject()))'),
      'and returned as { ok, data }, serialised like the read path'
    );
  });

  test(`${f.menu}: the form hands the row to the channel`, () => {
    const src = body(f.form);
    assert.ok(src.includes('useAddedRow('), 'form joins the channel');
    assert.ok(src.includes('add(result.data)'), 'and passes the created row');
  });

  test(`${f.menu}: the 300ms setTimeout fossil is gone`, () => {
    // It was never a fix. Someone read the symptom as a race and added a delay,
    // but no delay makes useState accept new props.
    assert.ok(
      !/setTimeout\([^;]*?router\.refresh/.test(read(f.form)),
      'no delayed refresh remains'
    );
  });

  test(`${f.menu}: the list accepts an added row and orders it`, () => {
    const src = body(f.list);
    assert.ok(src.includes('useAddedRowSink('), 'list registers a sink');
    assert.ok(src.includes('insertFeaturedRow('), 'and places the row by the shared comparator');
  });

  test(`${f.menu}: the page wraps the two siblings in the channel`, () => {
    assert.ok(read(f.page).includes('<AddedRowChannel>'), 'provider present');
  });

  test(`${f.menu}: the header counter is computed on the SERVER`, () => {
    // This is the on-screen proof of the bug and the reason router.refresh is
    // kept: the counter comes from the same server data the list gets, so
    // before the fix it moved while the list did not.
    const src = strip(f.page);
    assert.ok(/activeCount/.test(src), 'the page computes an active count server-side');
  });

  test(`${f.menu}: router.refresh is KEPT, because the counter needs it`, () => {
    assert.ok(
      /router\.refresh\(\)/.test(strip(f.form)),
      'the refresh still runs — the list splice does not update the header'
    );
  });
}

test('CONTROL: the setTimeout matcher would catch the fossil if it returned', () => {
  // Without this, the "fossil is gone" assertions could be passing because the
  // regex is wrong rather than because the code is clean — and on the first run
  // that is exactly what happened. The original `[^)]*` could not cross the
  // arrow function's OWN closing paren in `setTimeout(() => …)`, so it matched
  // nothing and all five "fossil is gone" tests passed vacuously. Bounding on
  // `;` instead keeps the match inside one statement.
  assert.ok(/setTimeout\([^;]*?router\.refresh/.test('setTimeout(() => router.refresh(), 300);'));
  assert.ok(!/setTimeout\([^;]*?router\.refresh/.test('router.refresh();'));
});

test('banners is deliberately NOT in the family', () => {
  // Same-looking symptom, different cause and no bug: BannerForm lives on its
  // own route (/admin/banners/new) and navigates with router.push, so the list
  // MOUNTS FRESH on arrival and its useState seeds from the new data. Verified
  // rather than assumed, because "it also calls router.refresh" is exactly the
  // resemblance that would get it fixed for no reason.
  const form = strip('src/app/admin/banners/_components/BannerForm.jsx');
  assert.ok(form.includes("router.push('/admin/banners')"), 'it navigates');
  assert.ok(!form.includes('useAddedRow'), 'and was left alone');
  const listPage = strip('src/app/admin/banners/page.jsx');
  assert.ok(!listPage.includes('BannerForm'), 'the form is not a sibling of the list');
});
