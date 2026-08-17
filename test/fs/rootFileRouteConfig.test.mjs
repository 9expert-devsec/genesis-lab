import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource, sourceExists } from '../sourceScan.mjs';
import { ROOT_FILE_MAX_DURATION_SECONDS } from '@/lib/rootDocuments.mjs';
import { ROOT_FILE_TAG } from '@/lib/rootFileDelivery';

/**
 * THE SEAMS test/pure/rootFileDelivery.test.mjs CANNOT REACH.
 *
 * The pure file drives the decision with injected fakes. What it cannot see is
 * the ROUTE SEGMENT CONFIG — `runtime`, `dynamic` and `maxDuration` are read by
 * Next statically, never by any code a test can call, so the only way to assert
 * them is to read the source.
 *
 * ══ WHY maxDuration IS A LITERAL AND NOT AN IMPORT — MEASURED ═══════════════
 *
 * The route was written first as
 *   `export const maxDuration = ROOT_FILE_MAX_DURATION_SECONDS`
 * so the two could not drift. `npm run build` REFUSED IT, exit 1:
 *
 *   ⨯ Next.js can't recognize the exported `config` field in route
 *     "/root-file/[...path]/route":
 *     Unknown identifier "ROOT_FILE_MAX_DURATION_SECONDS" at "maxDuration".
 *
 * Compilation succeeded; it is the route-segment-config validation that
 * rejects it, because that field is read before any module graph exists. So the
 * drift the import was meant to prevent is prevented HERE instead.
 */

const ROUTE = 'src/app/root-file/[...path]/route.js';
const LEGACY = 'src/app/legacy-file/[...path]/route.js';
const DELIVERY = 'src/lib/rootFileDelivery.js';

test('CONTROL: the files under scan exist and were really read', () => {
  for (const rel of [ROUTE, LEGACY, DELIVERY]) {
    assert.ok(sourceExists(rel), `${rel} is missing`);
    assert.ok(readSource(rel).code.length > 300, `${rel} scanned to almost nothing`);
  }
});

/** The numeric literal a route segment config exports, or null. */
function segmentNumber(code, name) {
  const m = code.match(new RegExp(String.raw`export\s+const\s+${name}\s*=\s*(\d+)\s*;`));
  return m ? Number(m[1]) : null;
}

test('maxDuration is a LITERAL equal to the policy constant', () => {
  // This is the assertion that replaces the import the build rejected. If
  // ROOT_FILE_MAX_DURATION_SECONDS is ever changed, this goes red and names the
  // file that has to change with it.
  const declared = segmentNumber(readSource(ROUTE).code, 'maxDuration');
  assert.notEqual(declared, null,
    'maxDuration is not declared as a numeric literal. An imported identifier '
    + 'fails the build; an absent one inherits a platform default that is NOT '
    + 'ESTABLISHED');
  assert.equal(declared, ROOT_FILE_MAX_DURATION_SECONDS,
    'the route and src/lib/rootDocuments.mjs disagree about the ceiling');
});

test('CONTROL: the literal matcher rejects an imported identifier', () => {
  // Without this, `notEqual(declared, null)` could be passing on a matcher that
  // matches anything — and the import form is precisely what the build refuses.
  assert.equal(segmentNumber('export const maxDuration = ROOT_FILE_MAX_DURATION_SECONDS;', 'maxDuration'), null);
  assert.equal(segmentNumber('export const maxDuration = 30;', 'maxDuration'), 30);
  assert.equal(segmentNumber('const maxDuration = 30;', 'maxDuration'), null, 'it must be EXPORTED');
});

test('the route declares runtime and dynamic explicitly', () => {
  const { code } = readSource(ROUTE);
  assert.match(code, /export\s+const\s+runtime\s*=\s*'nodejs'/,
    'the proxy streams a body and reads process.env — it is not an edge route');
  assert.match(code, /export\s+const\s+dynamic\s*=\s*'force-dynamic'/,
    'this route reads a database per request; a static answer would serve one '
    + 'document for every path');
});

test('the route is WIRING — the decision lives in the injectable module', () => {
  const src = readSource(ROUTE);
  assert.match(src.withImports, /from '@\/lib\/rootFileDelivery'/);
  assert.match(src.code, /serveRootFile\(/, 'the ordering must come from the tested function');
  for (const reimplemented of ['proxyUpstream(', 'rootDocumentKey(', 'WEBROOT_DOCUMENTS']) {
    assert.equal(
      src.code.includes(reimplemented), false,
      `the route reaches past serveRootFile to ${reimplemented}. The refusals are `
      + 'the feature; a caller that can interleave them can get them wrong',
    );
  }
});

test('THE ROUTE IS READ-ONLY against Mongo', () => {
  // No seed rows, no temp rows, no "I will delete it after". A registry a test
  // or a route has written to is no longer evidence about the registry.
  const { code } = readSource(ROUTE);
  for (const write of ['.save(', '.create(', 'updateOne(', 'findOneAndUpdate(',
    'insertMany(', 'bulkWrite(', 'deleteOne(', 'deleteMany(']) {
    assert.equal(code.includes(write), false, `the route calls ${write}`);
  }
  assert.match(code, /\.findOne\(/, 'and it must actually read, or the guard above is vacuous');
  assert.match(code, /\.lean\(\)/, 'a read that does not need a document should not hydrate one');
});

test('the route sets no cache-control of its own', () => {
  // MEASURED: no-store for these paths comes from the headers() rule in
  // next.config.mjs, keyed on NO_STORE_DOCUMENT_EXTENSIONS and matched by
  // request path. A second claim here would fight it.
  const { code } = readSource(ROUTE);
  assert.equal(/cache-control/i.test(code), false, 'the route names cache-control');
  assert.equal(/s-maxage|no-store/i.test(code), false, 'the route sets a caching directive');
});

// ── the two routes must not claim to be each other ──────────────────────────

/** The `tag:` value a route passes to the shared proxy. */
function tagOf(code) {
  const m = code.match(/tag:\s*'([^']+)'/);
  return m ? m[1] : null;
}

test('the two routes carry DIFFERENT delivery tags', () => {
  // `x-legacy-delivery: resolver` on a root-file response would be a lie, and
  // it is the header somebody greps when they are working out which path
  // answered.
  const legacyTag = tagOf(readSource(LEGACY).code);
  assert.equal(legacyTag, 'resolver', 'the legacy tag moved — this comparison assumed it');
  assert.notEqual(ROOT_FILE_TAG, legacyTag,
    'both routes claim the same delivery tag, so the header cannot tell them apart');
  assert.equal(ROOT_FILE_TAG, 'root-file');
});

test('CONTROL: the tag matcher really reads a tag, and can come back empty', () => {
  assert.equal(tagOf("proxyUpstream(r, u, { tag: 'resolver' })"), 'resolver');
  assert.equal(tagOf('proxyUpstream(r, u, {})'), null,
    'a route that passed no tag must not read as passing one');
});

// ── the gap, recorded in the code and not only in a commit message ──────────

test('the route header states that nothing has been served end to end', () => {
  // The honest limitation is the easiest thing to lose. If this feature is ever
  // reported as working, the file itself must be the thing that disagrees.
  const { raw } = readSource(ROUTE);
  assert.match(raw, /NO BYTE HAS EVER BEEN SERVED FROM A REAL REGISTRY ROW/,
    'the route header no longer records that this is unproven end to end');
  assert.match(readSource(DELIVERY).raw, /NO BYTE HAS EVER BEEN SERVED FROM A REAL REGISTRY ROW/);
});
