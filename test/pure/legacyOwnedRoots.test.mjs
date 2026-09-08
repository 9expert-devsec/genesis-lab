import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FILES_SEGMENT,
  OWNED_ROOTS,
  isWithinFilesCategory,
  refuseDeletePath,
} from '@/lib/legacyUploadPolicy.mjs';
import { LEGACY_PUBLIC_ID_PREFIX } from '@/lib/legacyPublicId';

// ── WHAT THIS FILE GUARDS ───────────────────────────────────────────────────
//
// The file manager used to own ONE root, `files/`. It now owns two: `files/`
// and `resources/`. Widening what a screen OWNS also widens what it can
// DESTROY, and a destroyed legacy asset does not come back cleanly — Cloudinary
// keeps a `bytes: 0, placeholder: true` tombstone at that public_id, and
// signMediaUpload refuses any id that still resolves. So the re-upload an admin
// would reach for is refused by the screen that deleted it.
//
// Every test below is therefore a NEGATIVE: it names something that must stay
// refused after the widening. They were written and run BEFORE the second root
// was admitted, against the one-root code, so they are a control rather than a
// description of whatever the implementation happened to do.
//
// MEASURED against the live account at the time of the change:
//   9exp-genesis/legacy/resources/  0 assets   ← the widening exposes nothing
//   sites   5557 · images 1195 · download 7    ← 6,759 that must stay refused
//   files    395                               ← already owned

const PREFIX = LEGACY_PUBLIC_ID_PREFIX;

/**
 * The roots that are NOT owned, spelled out rather than derived.
 *
 * Deriving them (every first segment minus OWNED_ROOTS) would make this file
 * agree with the implementation by construction, which is precisely what a
 * guard must not do: if someone admits `sites` as a third root tomorrow, a
 * derived list would quietly stop testing it and this file would still pass.
 * These four are named because each one is a real place assets live.
 */
const UNOWNED_ROOTS = ['sites', 'images', 'download', 'schedule-pdf'];

test('OWNED_ROOTS is exactly files and resources — a third needs a deliberate diff', () => {
  assert.deepEqual([...OWNED_ROOTS].sort(), ['files', 'resources']);
  // The upload root is still a single scalar, and still `files`. If this ever
  // becomes a set, the browser uploader gained the ability to write into the
  // legacy tree's other roots — which is a separate decision from ownership.
  assert.equal(FILES_SEGMENT, 'files');
});

// ── PATHS OUTSIDE BOTH ROOTS ────────────────────────────────────────────────

test('a path outside BOTH owned roots is still refused', () => {
  for (const p of [
    '/sites/default/files/articles/images/foo.png',
    '/images/course/cover.png',
    '/download/brochure.pdf',
    '/promotions/banner.png',
    '/avatar/avatar-default-512.png',
    '/',
    '',
  ]) {
    assert.ok(refuseDeletePath(p), `${JSON.stringify(p)} must be refused`);
  }
});

test('the same paths are refused as public_ids by the prefix guard', () => {
  for (const root of UNOWNED_ROOTS) {
    const id = `${PREFIX}/${root}/some-category/asset.png`;
    assert.equal(isWithinFilesCategory(id, PREFIX), false, id);
  }
  // The single most expensive mistake this guard can make: the 5,557 migrated
  // article images sit under this exact shape.
  assert.equal(
    isWithinFilesCategory(`${PREFIX}/sites/default/files/articles/images/foo`, PREFIX),
    false,
    'the migrated article tree must never be deletable from /admin/media',
  );
});

// ── A ROOT NAME IS A WHOLE SEGMENT, NOT A PREFIX OF ONE ─────────────────────

test('a path that merely STARTS WITH a root name is refused', () => {
  // `resourcesX` is not `resources`. Matching on a bare startsWith of the root
  // name without its separator would hand the manager a folder it does not own
  // — and the delete guard is the one place a near-miss must not be generous.
  for (const p of [
    '/resourcesX/flag/thai.png',
    '/filesX/photo/g01.png',
    '/resources-old/flag/thai.png',
    '/files-backup/photo/g01.png',
    '/resourcesflag/thai.png',
  ]) {
    assert.ok(refuseDeletePath(p), `${p} must be refused`);
  }
});

test('the same near-misses are refused as public_ids', () => {
  for (const id of [
    `${PREFIX}/resourcesX/flag/thai`,
    `${PREFIX}/filesX/photo/g01`,
    `${PREFIX}/resources-old/flag/thai`,
    `${PREFIX}/files-backup/photo/g01`,
  ]) {
    assert.equal(isWithinFilesCategory(id, PREFIX), false, id);
  }
});

// ── TRAVERSAL ───────────────────────────────────────────────────────────────

test('a traversal out of an owned root is refused', () => {
  for (const p of [
    '/resources/../sites/default/files/articles/images/foo.png',
    '/files/../sites/default/files/articles/images/foo.png',
    '/resources/flag/../../download/brochure.pdf',
    '/resources/flag/..',
    '/resources//flag/thai.png',
    '/resources/flag//thai.png',
    '/resources/./flag/thai.png',
    '/resources\\flag\\thai.png',
  ]) {
    assert.ok(refuseDeletePath(p), `${p} must be refused`);
  }
});

test('traversal is refused at the public_id layer too', () => {
  for (const id of [
    `${PREFIX}/resources/../sites/default/files/foo`,
    `${PREFIX}/resources/flag/../../download/brochure.pdf`,
    `${PREFIX}//resources/flag/thai`,
    `${PREFIX}/resources//flag/thai`,
  ]) {
    assert.equal(isWithinFilesCategory(id, PREFIX), false, id);
  }
});

// ── SHAPE INSIDE AN OWNED ROOT ──────────────────────────────────────────────

test('a path that stops at the root or the category is refused, in BOTH roots', () => {
  for (const p of [
    '/resources', '/resources/', '/resources/flag', '/resources/flag/',
    '/files', '/files/', '/files/photo', '/files/photo/',
  ]) {
    assert.ok(refuseDeletePath(p), `${p} must be refused`);
  }
});

test('an invalid category segment is refused in the resources root too', () => {
  // The widening must not bring a weaker category rule with it: whatever
  // `files/` demands of a category, `resources/` demands identically.
  for (const bad of ['-leading-dash', '.hidden', 'has space', 'a'.repeat(65)]) {
    assert.ok(
      refuseDeletePath(`/resources/${bad}/file.png`),
      `/resources/${bad}/ must be refused`,
    );
    assert.equal(
      isWithinFilesCategory(`${PREFIX}/resources/${bad}/file.png`, PREFIX), false,
      bad,
    );
  }
});

test('a dotfile is refused in the resources root too', () => {
  assert.ok(refuseDeletePath('/resources/flag/.htaccess'));
  assert.ok(refuseDeletePath('/resources/flag/.env'));
});

test('non-string input cannot slip past either predicate', () => {
  for (const junk of [null, undefined, 0, {}, []]) {
    assert.ok(refuseDeletePath(junk), String(junk));
    assert.equal(isWithinFilesCategory(junk, PREFIX), false, String(junk));
  }
});
