import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aliasMapFromRows,
  attachAliases,
  loadCourseExtensionIndex,
  loadHiddenCourseIds,
  loadCourseAliasMap,
} from '@/lib/courses/hiddenCourses';
import { listPublicCourses } from '@/lib/api/public-courses';

/**
 * THE ALIAS REACHES THE LIST ROWS, FROM THE READ THAT WAS ALREADY HAPPENING.
 *
 * ══ WHY THIS TIER, AND WHAT IT IS REALLY GUARDING ═══════════════════════════
 * Internal links have to emit the same path the page's own canonical tag
 * declares, and that path needs `CourseExtension.urlAlias` — which lives in
 * Mongo, while every course list comes from upstream's HTTP API. Something has
 * to join them, and this round joins them ONCE, inside `listPublicCourses`.
 *
 * The failure this file exists to catch is not "the join is wrong". It is THE
 * JOIN SILENTLY NOT HAPPENING: if `urlAlias` never reaches a row, every call
 * site falls back to the derived `/<code>-training-course`, which is a valid
 * URL that resolves — so nothing breaks, nothing 404s, and the whole round
 * quietly does nothing. A fallback that works is the hardest kind of gap to
 * see, so the assertions below are about the field being PRESENT and CARRIED,
 * not about the href that eventually comes out of it.
 *
 * ── listPublicCourses IS EXECUTED, WITH ITS SEAMS INJECTED ──────────────────
 * Not source-scanned. It takes `deps` for exactly this — `fetchUpstream`,
 * `loadHidden`, `loadOrder` — so the ordering, the hidden filter and now the
 * alias attachment can all be driven without a network or a database. An fs
 * guard asserting "attachAliases is called" is what let the ORIGINAL hidden
 * filter cover one surface out of twelve while staying green; that lesson is
 * written in this function's own docstring.
 */

const rows = (...pairs) => pairs.map(([courseId, urlAlias, isPublished = true]) =>
  ({ courseId, urlAlias, isPublished }));

// ── the map ─────────────────────────────────────────────────────────────────
test('aliasMapFromRows keys on the UPPERCASED code', () => {
  // `course_id` has no canonical casing upstream and the stored copy can lag a
  // rename. Matching case-sensitively would drop the alias for exactly the five
  // mixed-case courses, silently, and they would emit the code form forever.
  const map = aliasMapFromRows(rows(['SQL-PG-Query', '/query-data-with-tsql-training-course']));
  assert.equal(map.get('SQL-PG-QUERY'), '/query-data-with-tsql-training-course');
  assert.equal(map.size, 1);
});

test('aliasMapFromRows drops rows with nothing usable', () => {
  const map = aliasMapFromRows([
    { courseId: 'A', urlAlias: '' },
    { courseId: 'B', urlAlias: '   ' },
    { courseId: 'C', urlAlias: null },
    { courseId: '', urlAlias: '/orphan' },
    { urlAlias: '/no-code' },
    null,
  ]);
  assert.equal(map.size, 0);
});

test('aliasMapFromRows keeps the leading slash exactly as stored', () => {
  // `normaliseAlias` writes it with one and `courseCanonicalPath` expects one.
  // Stripping here — which every previous call site did, by hand — is how
  // `//alias` got shipped twice.
  assert.equal(aliasMapFromRows(rows(['A', '/pretty'])).get('A'), '/pretty');
});

// ── the attach ──────────────────────────────────────────────────────────────
test('attachAliases puts the alias on the row under `urlAlias`', () => {
  const out = attachAliases(
    [{ course_id: 'POWER-BI', course_name: 'Power BI' }],
    aliasMapFromRows(rows(['POWER-BI', '/power-bi-desktop-training-course'])),
  );
  assert.equal(out[0].urlAlias, '/power-bi-desktop-training-course');
  assert.equal(out[0].course_name, 'Power BI', 'the rest of the row was lost');
});

test('a course with no extension gets urlAlias: null, not an absent key', () => {
  // A consistent shape is what lets a test assert the field is THERE. An absent
  // key and a null read identically to courseCanonicalPath, but only one of
  // them can be checked for.
  const out = attachAliases([{ course_id: 'NO-EXT' }], aliasMapFromRows(rows(['OTHER', '/x'])));
  assert.equal(out[0].urlAlias, null);
  assert.ok('urlAlias' in out[0], 'the key is absent, so a plumbing gap is invisible');
});

test('attachAliases DOES NOT MUTATE the upstream rows', () => {
  // aiFetch memoises upstream responses across requests. Writing onto a row
  // would leak one request's aliases into the next, and would outlive an alias
  // being renamed.
  const upstream = [{ course_id: 'POWER-BI' }];
  const out = attachAliases(upstream, aliasMapFromRows(rows(['POWER-BI', '/pretty'])));
  assert.equal(upstream[0].urlAlias, undefined, 'the shared upstream row was written to');
  assert.notEqual(out[0], upstream[0], 'the same object was handed back');
});

test('an empty map still normalises the shape', () => {
  const out = attachAliases([{ course_id: 'A' }], new Map());
  assert.equal(out[0].urlAlias, null);
  assert.ok('urlAlias' in out[0]);
});

test('attachAliases tolerates a non-array without throwing', () => {
  // It sits on the path every course list takes. A throw here takes out the
  // catalogue, the schedule page, the search corpus and the mega menu at once.
  for (const input of [null, undefined, {}, 'nope']) {
    assert.doesNotThrow(() => attachAliases(input, new Map()));
  }
});

// ── one read, two structures ────────────────────────────────────────────────
test('THE PROJECTION ASKS FOR urlAlias — the fake model cannot enforce this', () => {
  /**
   * ── WRITTEN BECAUSE A CONTROL FIRED NOTHING ──────────────────────────────
   * Dropping `urlAlias` from the real `.find()` projection reddened NOTHING in
   * the first draft of this file. Every other test here injects a `model` whose
   * `lean()` returns fixture rows that already carry the field, so the
   * projection argument is never read and the fake happily hands back a column
   * production would not have fetched.
   *
   * That is the same class of gap this whole round is about: a fallback that
   * works hides the plumbing being gone. Against a real Mongo, a missing
   * projection key means `urlAlias` is `undefined` on every row, the alias map
   * is empty, and every internal link quietly reverts to the code form — with
   * this file green.
   *
   * So the QUERY ITSELF is asserted. Not a substitute for the behavioural tests
   * below; the half of the contract they structurally cannot see.
   */
  const calls = [];
  const model = {
    find(filter, projection) {
      calls.push({ filter, projection });
      return { lean: async () => [] };
    },
  };
  return loadCourseExtensionIndex({ model, connect: async () => {}, error: () => {} }).then(() => {
    assert.equal(calls.length, 1, `the index issued ${calls.length} reads`);
    const { filter, projection } = calls[0];
    assert.equal(projection?.urlAlias, 1,
      'the read does not project urlAlias, so every alias arrives undefined and '
      + 'every internal link silently falls back to the code form');
    assert.equal(projection?.courseId, 1, 'without the code the map cannot be keyed');
    assert.equal(projection?.isPublished, 1, 'without the flag the hidden set cannot be derived');
    assert.deepEqual(filter, {},
      'the filter narrowed again — a hidden-only read cannot see the published '
      + 'majority, which is where almost every alias lives');
  });
});

test('the hidden set and the alias map come from ONE read', () => {
  // The query count is the point of the design. If these ever became two
  // queries, every request would pay twice for the same 81 rows.
  let reads = 0;
  const model = {
    find() {
      reads += 1;
      return { lean: async () => rows(['VISIBLE', '/pretty'], ['HIDDEN', '/hidden-x', false]) };
    },
  };
  const deps = { model, connect: async () => {}, error: () => {} };
  return loadCourseExtensionIndex(deps).then((index) => {
    assert.equal(reads, 1, `the index issued ${reads} reads`);
    assert.deepEqual([...index.hidden], ['HIDDEN']);
    assert.equal(index.aliasByCode.get('VISIBLE'), '/pretty');
    assert.equal(index.aliasByCode.get('HIDDEN'), '/hidden-x',
      'a hidden course still has an alias — hiding is a separate question from naming');
  });
});

test('only an EXPLICIT false hides — the pre-existing reading is unchanged', () => {
  // The schema default, resolveCourse's `!== false` and this must agree. A row
  // with the field absent is published.
  const model = {
    find: () => ({ lean: async () => [
      { courseId: 'ABSENT', urlAlias: '/a' },
      { courseId: 'TRUE', urlAlias: '/b', isPublished: true },
      { courseId: 'FALSE', urlAlias: '/c', isPublished: false },
    ] }),
  };
  const deps = { model, connect: async () => {}, error: () => {} };
  return loadCourseExtensionIndex(deps).then((index) => {
    assert.deepEqual([...index.hidden], ['FALSE']);
  });
});

test('loadHiddenCourseIds still returns a Set — its contract did not change', () => {
  // Four callers depend on it, including the hot findHiddenCourseForSlug path
  // that short-circuits on `size === 0`. It is a projection of the index now,
  // and must be indistinguishable from what it was.
  const model = { find: () => ({ lean: async () => rows(['H', '/h', false]) }) };
  const deps = { model, connect: async () => {}, error: () => {} };
  return loadHiddenCourseIds(deps).then((set) => {
    assert.ok(set instanceof Set);
    assert.equal(set.size, 1);
    assert.ok(set.has('H'));
  });
});

test('a read failure fails OPEN in both directions, and says so', () => {
  // Pre-existing behaviour for the hidden set: listings serve unfiltered, and
  // it is logged. New for the alias map: links fall back to the derived path,
  // which still resolves — a working URL that is merely not the canonical one.
  const logged = [];
  const deps = {
    model: { find: () => ({ lean: async () => { throw new Error('mongo down'); } }) },
    connect: async () => {},
    error: (msg) => logged.push(msg),
  };
  return loadCourseExtensionIndex(deps).then((index) => {
    assert.equal(index.hidden.size, 0);
    assert.equal(index.aliasByCode.size, 0);
    assert.equal(logged.length, 1, 'the degradation was silent');
    assert.match(logged[0], /UNFILTERED/);
  });
});

// ── the seam that matters: listPublicCourses, executed ──────────────────────
const upstreamRows = [
  { course_id: 'POWER-BI', course_name: 'Power BI', _id: '1' },
  { course_id: 'NO-ALIAS', course_name: 'No Alias', _id: '2' },
  { course_id: 'HIDDEN-ONE', course_name: 'Hidden', _id: '3' },
];
const fetchUpstream = async () => ({ items: upstreamRows, total: upstreamRows.length });
const loadOrder = async () => null;
const ALIASES = aliasMapFromRows(rows(['POWER-BI', '/power-bi-pretty'], ['HIDDEN-ONE', '/hidden-pretty']));

test('listPublicCourses puts urlAlias on every row it returns', async () => {
  const { items } = await listPublicCourses({}, {
    fetchUpstream,
    loadOrder,
    loadHidden: async () => new Set(),
    loadAliases: async () => ALIASES,
  });
  assert.equal(items.length, 3);
  assert.equal(items.find((c) => c.course_id === 'POWER-BI').urlAlias, '/power-bi-pretty');
  assert.equal(items.find((c) => c.course_id === 'NO-ALIAS').urlAlias, null);
  for (const c of items) assert.ok('urlAlias' in c, `${c.course_id} has no urlAlias key`);
});

test('THE includeHidden PATH GETS IT TOO — the mega menu and the landing cache', async () => {
  // THE ORDERING ASSERTION. Thirteen of the twenty-five call sites take this
  // path, including syncNavMenuData (the mega menu) and syncLandingData (the
  // home page's cached course strip). Attaching below the early return would
  // give the alias to the catalogue and withhold it from the two
  // highest-traffic surfaces — and every test on the other surfaces would still
  // pass.
  const { items } = await listPublicCourses({ includeHidden: true }, {
    fetchUpstream,
    loadOrder,
    loadHidden: async () => new Set(['HIDDEN-ONE']),
    loadAliases: async () => ALIASES,
  });
  assert.equal(items.length, 3, 'includeHidden must return everything');
  assert.equal(items.find((c) => c.course_id === 'HIDDEN-ONE').urlAlias, '/hidden-pretty');
  assert.equal(items.find((c) => c.course_id === 'POWER-BI').urlAlias, '/power-bi-pretty');
});

test('the alias survives the hidden filter', async () => {
  const { items } = await listPublicCourses({}, {
    fetchUpstream,
    loadOrder,
    loadHidden: async () => new Set(['HIDDEN-ONE']),
    loadAliases: async () => ALIASES,
  });
  assert.equal(items.length, 2, 'the hidden course is still filtered out');
  assert.equal(items.find((c) => c.course_id === 'POWER-BI').urlAlias, '/power-bi-pretty');
});

// ── THE WHOLE CHAIN, WITH A MODEL THAT HONOURS THE PROJECTION ───────────────
test('END TO END: Mongo row → projection → list row → link href', async () => {
  /**
   * ── WHY THIS EXISTS, AND WHICH CONTROL DEMANDED IT ───────────────────────
   * Dropping `urlAlias` from the real projection reddens the query-shape test
   * above and NOTHING ELSE — not one per-surface render test. Those tests feed
   * rows shaped exactly as `listPublicCourses` returns them, which is the right
   * fixture for asking "does this card link correctly", but they never run the
   * fetch, so no amount of realism in them can catch a projection that stopped
   * asking for the column.
   *
   * The two halves are only joined by a fake model that APPLIES the projection
   * the way Mongo would. That is what this is: real `loadCourseExtensionIndex`,
   * real `attachAliases`, real `listPublicCourses`, real `courseLinkHref`, and
   * a `model` that returns only the fields it was asked for.
   *
   * Now a missing projection key produces `urlAlias: undefined` on the row, the
   * map is empty, and the href silently reverts to the code form — which is
   * exactly what would happen in production, and it fails here.
   */
  const { courseLinkHref } = await import('@/lib/courses/courseLinkHref');

  const stored = [
    { courseId: 'POWER-BI', urlAlias: '/power-bi-pretty', isPublished: true },
    { courseId: 'NO-ALIAS', urlAlias: '', isPublished: true },
  ];
  /** A fake Mongo that respects `{ field: 1 }` projections, as Mongo does. */
  const projectingModel = {
    find(_filter, projection) {
      const keys = Object.keys(projection ?? {}).filter((k) => projection[k] === 1);
      return {
        lean: async () => stored.map((row) =>
          Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]]))),
      };
    },
  };

  const { items } = await listPublicCourses({}, {
    fetchUpstream: async () => ({
      items: [{ course_id: 'POWER-BI', _id: '1' }, { course_id: 'NO-ALIAS', _id: '2' }],
    }),
    loadOrder: async () => null,
    loadHidden: async () => new Set(),
    // The REAL alias loader, driven through the projecting model.
    loadAliases: () => loadCourseAliasMap({
      model: projectingModel, connect: async () => {}, error: () => {},
    }),
  });

  assert.equal(courseLinkHref(items.find((c) => c.course_id === 'POWER-BI')), '/power-bi-pretty',
    'the alias did not survive the chain — check the projection');
  assert.equal(courseLinkHref(items.find((c) => c.course_id === 'NO-ALIAS')), '/no-alias-training-course');
});

test('CONTROL: the projecting model really projects', () => {
  // The end-to-end test above is only meaningful if the fake drops unrequested
  // fields. If it returned whole rows, it would be no stronger than the others.
  const rows = [{ a: 1, b: 2, c: 3 }];
  const model = {
    find(_f, projection) {
      const keys = Object.keys(projection ?? {}).filter((k) => projection[k] === 1);
      return { lean: async () => rows.map((r) => Object.fromEntries(keys.filter((k) => k in r).map((k) => [k, r[k]]))) };
    },
  };
  return model.find({}, { a: 1 }).lean().then((out) => {
    assert.deepEqual(out, [{ a: 1 }], 'the fake ignored the projection');
  });
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the alias really travels — the rows do not already carry one', async () => {
  // Every assertion above reads `urlAlias` off a returned row. If the upstream
  // fixture carried the field itself, all of them would pass with the join
  // removed entirely — which is precisely the silent gap this file is for.
  for (const row of upstreamRows) {
    assert.equal(row.urlAlias, undefined, 'the fixture pre-loads the field under test');
  }
  const { items } = await listPublicCourses({}, {
    fetchUpstream, loadOrder, loadHidden: async () => new Set(), loadAliases: async () => new Map(),
  });
  assert.equal(items.find((c) => c.course_id === 'POWER-BI').urlAlias, null,
    'an empty map still produced an alias — it came from somewhere else');
});
