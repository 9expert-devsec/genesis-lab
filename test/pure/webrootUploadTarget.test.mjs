import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEBROOT_DOCUMENTS, WEBROOT_BLOB_PREFIX, WEBROOT_ARCHIVE_PREFIX, WEBROOT_MAX_BYTES,
  webrootUploadTarget, webrootArchivePathname, isWebrootDocument,
} from '@/lib/webrootDocuments.mjs';
import { RAW_MAX_BYTES } from '@/lib/legacyUploadPolicy.mjs';

/**
 * Replace-only: the client says WHICH of the three, never where it goes.
 *
 * ══ THIS IS THE WHOLE SECURITY MODEL OF THE FEATURE ═════════════════════════
 *
 * The upload overwrites a fixed Blob key at the SITE ROOT. If a caller could
 * influence the pathname it could write anywhere in the store, including over
 * the other two documents or into a key some future rewrite serves. So the only
 * thing that crosses the wire is a NAME, and it is matched against a frozen
 * list rather than sanitised — sanitising accepts a shape and hopes; matching
 * accepts three strings and refuses the rest of the universe.
 *
 * ── AND THE CEILING IS NOT THE MEDIA CEILING ────────────────────────────────
 * legacyUploadPolicy's RAW_MAX_BYTES is Cloudinary's 10 MB limit. These files
 * are on Blob BECAUSE they exceed it. A test pins that they differ, so a future
 * "consistency" edit that points this path at RAW_MAX_BYTES has to delete an
 * assertion that says why not.
 */

test('the three known documents resolve to their fixed keys', () => {
  for (const file of WEBROOT_DOCUMENTS) {
    const t = webrootUploadTarget(file);
    assert.equal(t.ok, true, `${file} must be replaceable`);
    assert.equal(t.filename, file);
    assert.equal(t.blobPathname, `${WEBROOT_BLOB_PREFIX}/${file}`);
    assert.equal(t.publicPath, `/${file}`);
  }
});

test('surrounding whitespace is tolerated, nothing else is', () => {
  const t = webrootUploadTarget(`  ${WEBROOT_DOCUMENTS[0]}  `);
  assert.equal(t.ok, true);
  assert.equal(t.filename, WEBROOT_DOCUMENTS[0]);
});

test('anything not in the list is REFUSED, and the refusal names it', () => {
  const hostile = [
    'other.pdf',
    '../9expert-company-profile.pdf',
    'webroot-documents/9expert-company-profile.pdf',
    '/9expert-company-profile.pdf',
    '9EXPERT-COMPANY-PROFILE.PDF',
    '9expert-company-profile.pdf.exe',
    '',
    '   ',
    null,
    undefined,
    42,
    {},
  ];
  for (const bad of hostile) {
    const t = webrootUploadTarget(bad);
    assert.equal(t.ok, false, `expected ${JSON.stringify(bad)} to be refused`);
    assert.equal(typeof t.reason, 'string');
    assert.ok(t.reason.length > 0);
    assert.equal(t.blobPathname, undefined, 'a refused target must carry no path at all');
  }
  assert.match(webrootUploadTarget('other.pdf').reason, /other\.pdf/);
});

test('CONTROL: the refusal is not a blanket — the real names DO pass', () => {
  // Without this, `return { ok: false }` unconditionally would satisfy every
  // assertion above.
  assert.equal(webrootUploadTarget(WEBROOT_DOCUMENTS[0]).ok, true);
  assert.equal(isWebrootDocument(WEBROOT_DOCUMENTS[2]), true);
});

test('CONTROL: a near-miss filename is genuinely different from a real one', () => {
  // Proves the hostile fixtures above are not trivially rejected for some other
  // reason — they differ from a valid name by exactly the thing under test.
  const real = WEBROOT_DOCUMENTS[1];
  const near = `${real}.exe`;
  assert.notEqual(near, real);
  assert.equal(isWebrootDocument(real), true);
  assert.equal(isWebrootDocument(near), false);
});

// ── the archive key ─────────────────────────────────────────────────────────
test('the archive key is grouped by document and sits OUTSIDE the served prefix', () => {
  const key = webrootArchivePathname('9expert-company-profile.pdf', '2026-08-10T00-00-00Z');
  assert.equal(key, `${WEBROOT_ARCHIVE_PREFIX}/9expert-company-profile/2026-08-10T00-00-00Z-9expert-company-profile.pdf`);
  assert.equal(key.startsWith(`${WEBROOT_BLOB_PREFIX}/`), false,
    'an archive under the served prefix is one rewrite away from being public');
});

test('two replacements of the same document get distinct archive keys', () => {
  const a = webrootArchivePathname(WEBROOT_DOCUMENTS[0], '2026-08-10T00-00-00Z');
  const b = webrootArchivePathname(WEBROOT_DOCUMENTS[0], '2026-08-10T00-00-01Z');
  assert.notEqual(a, b, 'a colliding archive key would destroy the copy it just made');
});

test('CONTROL: the archive prefix and the served prefix are not the same string', () => {
  assert.notEqual(WEBROOT_ARCHIVE_PREFIX, WEBROOT_BLOB_PREFIX,
    'if these were equal, the "outside the served prefix" assertion would be vacuous');
});

// ── the ceiling ─────────────────────────────────────────────────────────────
test('the ceiling is NOT the Cloudinary media cap', () => {
  assert.ok(WEBROOT_MAX_BYTES > RAW_MAX_BYTES,
    'these documents are on Blob BECAUSE they exceed Cloudinary’s raw limit — '
    + 'applying RAW_MAX_BYTES here would refuse the catalog this feature exists to replace');
  assert.ok(WEBROOT_MAX_BYTES >= 45 * 1024 * 1024,
    'the catalog is 42.6 MiB today and grows; the ceiling must clear it with room');
});

test('CONTROL: the two ceilings are real numbers and really differ', () => {
  assert.equal(typeof WEBROOT_MAX_BYTES, 'number');
  assert.equal(typeof RAW_MAX_BYTES, 'number');
  assert.equal(RAW_MAX_BYTES, 10 * 1024 * 1024, 'the media cap is still 10 MB, so the comparison above means what it says');
});
