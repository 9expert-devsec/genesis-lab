import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_WINDOWS, DIVERGENCE, divergentRoutes } from '@/lib/cache-console/routeWindows';
import { readSource, sourceExists, walkSources, blankStringBodies } from '../sourceScan.mjs';

/** An exported generateStaticParams DECLARATION — not a mention of the name. */
const DECLARES_STATIC_PARAMS = /export\s+(?:async\s+)?function\s+generateStaticParams\s*\(/;

/**
 * The route-window table vs the route files it describes.
 *
 * ══ WHAT THIS GUARD CANNOT SEE — READ THIS BEFORE TRUSTING A GREEN RUN ══════
 *
 * It compares the table's `exported` column against the segment exports it can
 * grep out of each route file. That is ALL it can do, and it is strictly less
 * than the table claims.
 *
 * IT CANNOT SEE THE `effective` COLUMN. A route's effective revalidate is
 * lowered by the shortest `next: { revalidate }` of any fetch reached during
 * its render — INCLUDING fetches inside a shared layout that the route file
 * neither mentions nor imports. That is not a hypothetical: it is exactly how
 * /terms and /contact-us diverge. /terms exports nothing and fetches nothing,
 * and builds at 1h because (public)/layout.jsx renders PublicHeader, which
 * calls listPrograms(), which is a tagged aiFetch at aiFetch's default 3600.
 * /contact-us exports 86400 and builds at 1h for the same reason. Nothing
 * reachable from either route file says so.
 *
 * So `effective` is a BUILD MEASUREMENT, stamped with the commit it was taken
 * at (MEASURED_COMMIT), and it can go stale without a single route file
 * changing — someone adding a 60s fetch to PublicHeader would silently drop
 * every chrome-rendering page to 1m and every assertion below would stay green.
 * The only way to refresh it is to run `next build` and read the table.
 *
 * What this guard DOES catch: the `exported` column drifting from the source,
 * a route file being deleted or moved out from under an entry, and a row
 * claiming a divergence that the source contradicts.
 */

/** Rows whose `file` names one concrete file (not a glob or a comma list). */
const CONCRETE = ROUTE_WINDOWS.filter(
  (r) => !r.file.includes('*') && !r.file.includes('{') && !r.path.includes(',')
);

test('the table is non-empty and mostly concrete — nothing below is vacuous', () => {
  // Every assertion here iterates CONCRETE. If the filter ever emptied it, the
  // whole file would pass while checking nothing.
  assert.ok(ROUTE_WINDOWS.length >= 15, 'the table still has rows');
  assert.ok(CONCRETE.length >= 12, `${CONCRETE.length} concrete rows to check`);
});

test('every route file named in the table exists', () => {
  for (const r of CONCRETE) {
    assert.ok(sourceExists(r.file), `${r.path} → ${r.file} is missing`);
  }
});

test("the `exported` column matches each file's actual segment export", () => {
  for (const r of CONCRETE) {
    const { code } = readSource(r.file);
    const revalidate = /export const revalidate\s*=\s*(\d+)/.exec(code);
    const dynamic = /export const dynamic\s*=\s*'([a-z-]+)'/.exec(code);

    if (r.exported === null) {
      assert.ok(
        !revalidate && !dynamic,
        `${r.path} is recorded as exporting nothing, but ${r.file} exports ` +
          `${revalidate ? `revalidate = ${revalidate[1]}` : `dynamic = '${dynamic?.[1]}'`}`
      );
      continue;
    }

    const actual = revalidate
      ? `revalidate = ${revalidate[1]}`
      : dynamic
        ? `dynamic = '${dynamic[1]}'`
        : null;
    assert.equal(actual, r.exported, `${r.path} (${r.file})`);
  }
});

test('CONTROL: the export matcher really does read these files', () => {
  // The failure mode this file is most exposed to: a regex that matches
  // nothing, making "exported is null" true of every route and the whole
  // comparison vacuous. Assert extraction on a file KNOWN to export a value.
  const { code } = readSource('src/app/(public)/schedule/page.jsx');
  const m = /export const revalidate\s*=\s*(\d+)/.exec(code);
  assert.ok(m, 'the matcher extracts a revalidate export it is pointed at');
  assert.equal(m[1], '1800');

  // /articles, not /faq: the FAQ page moved to ISR in the caching round, and
  // the list page is the one that stays force-dynamic (it is searchParams-driven).
  const dyn = readSource('src/app/(public)/articles/page.jsx').code;
  const d = /export const dynamic\s*=\s*'([a-z-]+)'/.exec(dyn);
  assert.ok(d, 'and a dynamic export');
  assert.equal(d[1], 'force-dynamic');
});

test('CONTROL: a file that exports NOTHING is really matched as nothing', () => {
  // The other half — otherwise "exports nothing" could be an artifact of a
  // matcher that never fires, and /terms is the row that depends on it.
  const { code } = readSource('src/app/(public)/terms/page.jsx');
  assert.ok(!/export const revalidate/.test(code));
  assert.ok(!/export const dynamic/.test(code));
});

test('/terms and /contact-us are BOTH present as divergent rows', () => {
  // Required to be displayed rows, not footnotes: they are the two cases that
  // prove reading route config is not enough.
  const paths = divergentRoutes().map((r) => r.path);
  assert.ok(paths.includes('/terms'), '/terms is a divergent row');
  assert.ok(paths.includes('/contact-us'), '/contact-us is a divergent row');
});

test('/contact-us records the exported value that never takes effect', () => {
  const row = ROUTE_WINDOWS.find((r) => r.path === '/contact-us');
  assert.equal(row.exported, 'revalidate = 86400');
  assert.equal(row.effective, '1h');
  assert.equal(row.divergence, DIVERGENCE.LOWERED_BY_LAYOUT);
  // And the source really does export 86400 — so the row is describing a real
  // mismatch rather than preserving a stale note.
  assert.match(readSource('src/app/(public)/contact-us/page.jsx').code, /export const revalidate = 86400/);
});

test('every divergent row explains itself; every agreeing row needs no excuse', () => {
  for (const r of ROUTE_WINDOWS) {
    if (r.divergence === DIVERGENCE.NONE) continue;
    assert.ok(r.why && r.why.length > 20, `${r.path} is marked divergent with no explanation`);
    assert.ok(
      Object.values(DIVERGENCE).includes(r.divergence),
      `${r.path} carries an unknown divergence kind`
    );
  }
});

test('the unenumerable-segment rows rest on a fact that still holds', () => {
  /**
   * Rows marked INERT_UNENUMERABLE claim their exported revalidate is inert
   * because the segment has no generateStaticParams; rows for a `[param]`
   * segment marked NONE claim the opposite — the segment declares one (empty is
   * enough: it is what puts the route into prerender-manifest's dynamicRoutes
   * and makes the revalidate real). Both are premises the source can be
   * checked against, so assert the premise for every row rather than the
   * conclusion. This used to assert "no declaration anywhere in src/app";
   * that encoded the decision the caching round reversed for /articles/[slug].
   */
  const unenumerable = ROUTE_WINDOWS.filter((r) => r.divergence === DIVERGENCE.INERT_UNENUMERABLE);
  assert.ok(unenumerable.length >= 3, 'the rows that depend on this exist');

  const files = walkSources('src/app');
  assert.ok(files.length > 50, 'the walk found the app tree at all');

  // A DECLARATION, not a mention. The first draft of this matched the bare
  // name and its only hit was the console panel's own label text explaining
  // what generateStaticParams is — a string, not a route export. Blanking
  // string bodies first removes that whole class; the declaration pattern is
  // then what actually decides whether a segment can be prerendered.
  const declares = (rel) => DECLARES_STATIC_PARAMS.test(blankStringBodies(readSource(rel).code));
  const withStaticParams = files
    .filter((f) => DECLARES_STATIC_PARAMS.test(blankStringBodies(f.code)))
    .map((f) => f.rel);
  assert.ok(withStaticParams.length >= 1, 'at least one ISR [param] route exists (the check can see something)');

  // Every INERT_UNENUMERABLE row's file(s) still lack the declaration.
  for (const r of unenumerable) {
    // `{program,skill}` brace groups expand to one path per alternative.
    const brace = /\{([^}]*)\}/.exec(r.file);
    const rels = brace
      ? brace[1].split(',').map((s) => r.file.replace(brace[0], s.trim()))
      : [r.file];
    for (const rel of rels) {
      assert.ok(!declares(rel), `${r.path} is marked INERT_UNENUMERABLE but ${rel} declares generateStaticParams — the row is wrong`);
    }
  }

  // Every [param] row marked NONE declares it, and its body is the EMPTY list —
  // on-demand ISR, not a build-time enumeration this table would then have to
  // describe differently.
  const isrParamRows = CONCRETE.filter((r) => r.divergence === DIVERGENCE.NONE && r.file.includes('['));
  assert.ok(isrParamRows.length >= 1, 'the ISR [param] rows exist');
  for (const r of isrParamRows) {
    assert.ok(declares(r.file), `${r.path} is marked NONE but ${r.file} has no generateStaticParams — its revalidate is inert`);
    assert.match(
      blankStringBodies(readSource(r.file).code),
      /export\s+(?:async\s+)?function\s+generateStaticParams\s*\(\s*\)\s*\{\s*return\s*\[\s*\]\s*;?\s*\}/,
      `${r.file}: generateStaticParams must return [] (on-demand ISR)`
    );
  }

  // And no declaration exists that the table does not account for.
  const accounted = new Set(isrParamRows.map((r) => r.file));
  assert.deepEqual(
    withStaticParams.filter((rel) => !accounted.has(rel)),
    [],
    'a generateStaticParams appeared in a file the table has no ISR row for'
  );
});

test('CONTROL: the generateStaticParams matcher tells a declaration from a mention', () => {
  // Both halves, because getting either wrong makes the check above useless in
  // a different direction: too loose and it fires on prose forever, too tight
  // and it never fires at all.
  assert.ok(DECLARES_STATIC_PARAMS.test('export async function generateStaticParams() {}'));
  assert.ok(DECLARES_STATIC_PARAMS.test('export function generateStaticParams(){}'));
  assert.ok(
    !DECLARES_STATIC_PARAMS.test(blankStringBodies("const s = 'no generateStaticParams here';")),
    'a mention inside a string is not a declaration'
  );

  /**
   * The realistic near-miss, as a fixture rather than as a real file.
   *
   * The first draft asserted against an actual admin panel that mentions the
   * name in its label copy — which made THIS commit depend on a file that only
   * lands in the next one, so the data layer did not pass its own tests in
   * isolation. A fixture reproduces the same shape and keeps the commit
   * self-contained. Whether any real file violates the rule is what the sweep
   * above answers, over the whole of src/app.
   */
  const mentionInJsxProp = "const L = { key: 'dynamic segment with no generateStaticParams' };";
  assert.ok(mentionInJsxProp.includes('generateStaticParams'), 'the fixture does mention it');
  assert.ok(!DECLARES_STATIC_PARAMS.test(blankStringBodies(mentionInJsxProp)));
});
