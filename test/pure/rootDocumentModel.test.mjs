import { test } from 'node:test';
import assert from 'node:assert/strict';

import RootDocument, { FROZEN_KEYS } from '@/models/RootDocument';
import { WEBROOT_DOCUMENTS } from '@/lib/webrootDocuments.mjs';
import { rootDocumentKey } from '@/lib/rootDocuments.mjs';

/**
 * The registry, asserted against the REAL Mongoose schema rather than the text
 * of the model file — the same approach as test/pure/articleSortKeySchema.mjs,
 * because a declaration that is merely spelled right in source is not the thing
 * that runs.
 *
 * ══ WHY THESE USE `await validate()` AND NOT `validateSync()` ═══════════════
 *
 * MEASURED while writing this file: mongoose runs `pre('validate')` middleware
 * on `.save()`/`.create()`/`.validate()` and NOT on `validateSync()`. The key
 * derivation is a hook, so a `validateSync()` test reports `pathKey: required`
 * and proves nothing about the rule. Driving the async path is driving what the
 * publish action will actually run.
 *
 * The one place `validateSync()` is used below is deliberate and is the point of
 * that test: it SIMULATES a hook-bypassing write.
 *
 * NOTHING HERE CONNECTS TO MONGO. Validation runs in process; no query is made.
 */

const doc = (over = {}) => new RootDocument({
  publicPath: '/annual-report-2026.pdf',
  blobPathname: 'root-documents/annual-report-2026.pdf',
  ...over,
});

/** Run the real validation path; return the error or null. */
async function validated(d) {
  try {
    await d.validate();
    return null;
  } catch (err) {
    return err;
  }
}

// ── THE CASE RULE, on write ─────────────────────────────────────────────────

test('THE CASE RULE: the key is lowercased ON WRITE, by application code', async () => {
  // Not by a Mongo collation: collation belongs to the index and the query, it
  // is invisible in the model, and a unique index that silently compared
  // case-sensitively would admit the colliding pair while looking like a guard.
  const d = doc({ publicPath: '/Annual-Report-2026.PDF' });
  assert.equal(await validated(d), null);
  assert.equal(d.pathKey, '/annual-report-2026.pdf');
  assert.equal(d.publicPath, '/Annual-Report-2026.PDF',
    'the published path keeps its case — it is what the operator reads and copies');
});

test('CONTROL: mixed case and lower case land on the SAME key', async () => {
  // The collision this rule exists to prevent, fed in as data. routes-manifest
  // caseSensitive is false, so these are one URL.
  const mixed = doc({ publicPath: '/Foo.pdf' });
  const lower = doc({ publicPath: '/foo.pdf' });
  await validated(mixed);
  await validated(lower);
  assert.equal(mixed.pathKey, lower.pathKey,
    'two rows for one address. The unique index cannot object if the keys differ');
  assert.notEqual(mixed.publicPath, lower.publicPath,
    'and the DISPLAY paths still differ, or the fixture is not testing anything');
});

test('CONTROL: a schema WITHOUT the derivation would keep the two apart', () => {
  // What the assertion above is worth, shown by the alternative: storing the
  // path verbatim as the key gives two distinct strings, and a unique index on
  // them admits both rows.
  const naive = ['/Foo.pdf', '/foo.pdf'];
  assert.notEqual(naive[0], naive[1], 'verbatim, these are two different index entries');
  assert.equal(rootDocumentKey(naive[0]), rootDocumentKey(naive[1]), 'derived, they are one');
});

test('the key is DERIVED, so a caller cannot supply a wrong one', async () => {
  const d = doc({ publicPath: '/Real.pdf', pathKey: '/something-else.pdf' });
  assert.equal(await validated(d), null);
  assert.equal(d.pathKey, '/real.pdf',
    'a supplied key must be overwritten. Trusting it would let one row claim an '
    + 'address its publicPath does not name');
});

// ── THE FROZEN THREE ARE REFUSED ────────────────────────────────────────────

test('a row claiming one of the frozen three is REFUSED', async () => {
  // MEASURED (M4): a document-extension rule placed above the three webroot
  // rewrite rules once STOLE a published PDF. A registry row claiming one of
  // those paths is that incident with a database behind it.
  for (const filename of WEBROOT_DOCUMENTS) {
    const err = await validated(doc({ publicPath: `/${filename}` }));
    assert.ok(err, `${filename} was accepted into the registry`);
    assert.match(String(err.message), new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'the refusal must name what it refused');
  }
});

test('the refusal is CASE-INSENSITIVE, because the URL is', async () => {
  const shouty = `/${WEBROOT_DOCUMENTS[1].toUpperCase()}`;
  const err = await validated(doc({ publicPath: shouty }));
  assert.ok(err, `${shouty} slipped past the frozen-three guard by changing case`);
});

test('the refusal is a VALIDATOR, so it survives a write that BYPASSES the hook', () => {
  // `validateSync()`, `insertMany()` and `updateOne()` do not run
  // `pre('validate')`. A VALIDATOR runs on all of them. This is the rule that
  // protects three live public URLs, so it does not rest on the write path
  // being the expected one — and this test drives the bypass on purpose by
  // supplying the key directly and validating synchronously.
  //
  // A copy of this check inside the hook was written first and DELETED: no
  // revert of it could redden a single test, because this validator already
  // caught every case. An unfalsifiable branch is not a second layer.
  const frozen = doc({ publicPath: '/whatever.pdf', pathKey: rootDocumentKey(WEBROOT_DOCUMENTS[0]) });
  const err = frozen.validateSync();
  assert.ok(err, 'a hook-bypassing write placed a frozen key in the registry');
  assert.match(String(err.message), /ตรึงไว้/, 'and it must say why');
});

test('CONTROL: the same bypass ACCEPTS an ordinary key', () => {
  // Without this, "layer 2 refuses" would pass for a validator that refused
  // everything — or for a validateSync that failed on `required` and never
  // reached the validator at all.
  const fine = doc({ publicPath: '/whatever.pdf', pathKey: '/whatever.pdf' });
  const err = fine.validateSync();
  assert.equal(err, undefined, err ? String(err.message) : '');
});

test('CONTROL: an ordinary root path VALIDATES on the same fixture', async () => {
  // Without this, "the frozen three are refused" would pass for a model that
  // refused everything.
  assert.equal(await validated(doc({ publicPath: '/annual-report-2026.pdf' })), null);
});

test('FROZEN_KEYS is derived from the shared list, not re-typed', () => {
  assert.equal(FROZEN_KEYS.size, WEBROOT_DOCUMENTS.length);
  for (const f of WEBROOT_DOCUMENTS) {
    assert.ok(FROZEN_KEYS.has(rootDocumentKey(f)), `${f} is missing from the derived set`);
  }
});

// ── the shape, and the limitation ───────────────────────────────────────────

test('CURRENT STATE ONLY — there is no versioning, archive or restore here', () => {
  // The limitation is deliberate and the header says so in plain words. This
  // pins it so that adding a `version` field is a conversation rather than an
  // afternoon: replacement needs the archive-before-overwrite machinery, and
  // must not be reached by hoping.
  for (const absent of ['version', 'archivePathname', 'restoredFrom']) {
    assert.equal(RootDocument.schema.path(absent), undefined,
      `${absent} appeared on RootDocument. This collection is one row per PATH; `
      + 'a replacement story needs src/lib/webroot/ and its own round');
  }
});

test('the fields a published row must carry are declared and required', () => {
  for (const required of ['publicPath', 'pathKey', 'blobPathname']) {
    const path = RootDocument.schema.path(required);
    assert.ok(path, `${required} is not on the schema`);
    assert.equal(path.isRequired, true, `${required} must be required`);
  }
  for (const [name, instance] of [['bytes', 'Number'], ['sha256', 'String'],
    ['contentType', 'String'], ['uploadedAt', 'Date'], ['uploadedBy', 'String']]) {
    assert.equal(RootDocument.schema.path(name)?.instance, instance, `${name} is wrong or absent`);
  }
});

test('sourceFilename is a LABEL: defaults to empty, never required, never a path', async () => {
  // Same rule as WebrootDocumentFile.sourceFilename. `File.name` comes from the
  // browser; it is display-only and must never be an input to a key.
  const path = RootDocument.schema.path('sourceFilename');
  assert.ok(path, 'sourceFilename is not on the schema');
  assert.equal(path.defaultValue, '', "'' means unknown, and is not backfilled");
  assert.equal(path.isRequired, undefined, 'a row may predate the field, or come from a script');

  const d = doc({ sourceFilename: '../../etc/passwd' });
  assert.equal(await validated(d), null);
  assert.equal(d.pathKey, '/annual-report-2026.pdf',
    'THE LABEL REACHED A PATH. It is derived from publicPath and nothing else');
  assert.equal(d.blobPathname, 'root-documents/annual-report-2026.pdf');
});

test('status is an enum that can only be published or withdrawn', async () => {
  // Shipped now even though the withdraw ACTION is a later round: a permanent
  // public URL with no way to take it down is an incident with no lever, and
  // the lever has to exist in the data before a surface can pull it.
  const path = RootDocument.schema.path('status');
  assert.ok(path, 'status is not on the schema');
  assert.deepEqual(path.enumValues, ['published', 'withdrawn']);
  assert.equal(path.defaultValue, 'published');

  assert.ok(RootDocument.schema.path('withdrawnAt'), 'withdrawnAt is missing');
  assert.ok(RootDocument.schema.path('withdrawnBy'), 'withdrawnBy is missing');

  assert.ok(await validated(doc({ status: 'deleted' })),
    'an unknown status was accepted — the enum is decorative');
});

test('the unique index is on the LOWERCASED key, not on the display path', () => {
  const indexes = RootDocument.schema.indexes();
  const unique = indexes.filter(([, opts]) => opts?.unique);
  assert.equal(unique.length, 1, 'exactly one unique index is expected');
  assert.deepEqual(unique[0][0], { pathKey: 1 },
    'a unique index on publicPath would let /Foo.pdf and /foo.pdf both exist, '
    + 'which is two rows for one URL');
});

test('the collection is its own, and separate from the frozen three', () => {
  assert.equal(RootDocument.schema.options.collection, 'root_documents');
  assert.notEqual(RootDocument.schema.options.collection, 'webroot_document_files',
    'the two models have opposite shapes — one row per PATH here, one row per '
    + 'REPLACEMENT there. Sharing a collection would make both unreadable');
});
