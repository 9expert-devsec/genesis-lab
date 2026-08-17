import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_UPLOAD_EXTENSIONS,
  IMAGE_MAX_BYTES,
  RAW_MAX_BYTES,
  extensionOf,
  isValidCategory,
  publicPathFor,
  publicPathFromPublicId,
  refuseUpload,
  resourceTypeFor,
} from '@/lib/legacyUploadPolicy.mjs';
import { legacyPathToPublicId, LEGACY_PUBLIC_ID_PREFIX } from '@/lib/legacyPublicId';

// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────
//
// /admin/media signs an upload and the BROWSER then sends the bytes straight to
// Cloudinary. Once a signature exists the upload is authorised and nothing of
// ours is in the path to reconsider — so every check that matters happens before
// signing, and this file is what keeps those checks honest.
//
// The filter is an ALLOW-LIST because these files are served from the site's own
// origin at /files/…: an accepted `.php` is published server-adjacent content, not
// a bug you fix afterwards.

test('the allow-list and the refusal set do not overlap', () => {
  // A dangerous extension appearing in both lists would resolve by whichever
  // check ran first — the kind of ambiguity that only shows up under a rename.
  for (const ext of ['php', 'htaccess', 'exe', 'sql', 'env', 'js', 'html', 'yml']) {
    assert.equal(
      ALLOWED_UPLOAD_EXTENSIONS.includes(ext), false,
      `.${ext} must not be allow-listed`,
    );
    assert.ok(refuseUpload({ filename: `x.${ext}`, bytes: 10 }), `.${ext} must be refused`);
  }
});

test('every allow-listed extension is routable by the delivery layer', () => {
  // The property that makes the allow-list honest: accepting a file the rewrite
  // cannot serve would store an asset with no working URL. mp3/mp4 are excluded
  // for exactly this reason.
  for (const ext of ALLOWED_UPLOAD_EXTENSIONS) {
    assert.ok(resourceTypeFor(ext), `.${ext} is allowed but has no resource type`);
  }
});

test('media extensions are NOT accepted, because nothing can serve them', () => {
  for (const ext of ['mp3', 'mp4', 'wav', 'webm']) {
    assert.equal(resourceTypeFor(ext), null, `.${ext} should be unroutable`);
    assert.ok(refuseUpload({ filename: `podcast.${ext}`, bytes: 1000 }));
  }
});

test('a filename is a NAME, never a path', () => {
  // Each of these could place the asset outside its category folder, where no
  // URL would find it again.
  for (const bad of [
    '../escape.png', 'a/b.png', 'a\\b.png', '..\\x.png', 'sub/dir/file.pdf',
  ]) {
    assert.ok(refuseUpload({ filename: bad, bytes: 10 }), `${bad} must be refused`);
  }
});

test('dotfiles and unreviewed invalid characters are refused', () => {
  assert.ok(refuseUpload({ filename: '.htaccess', bytes: 10 }));
  assert.ok(refuseUpload({ filename: '.env', bytes: 10 }));
  // `? % < > \` have no reviewed public_id substitution — see legacyPublicId.js.
  for (const ch of ['?', '%', '<', '>', '\\']) {
    assert.ok(refuseUpload({ filename: `bad${ch}name.png`, bytes: 10 }), `${ch} must be refused`);
  }
});

test('& and # ARE accepted — both have reviewed substitutions', () => {
  // The point of the reviewed rules: these filenames are legal and must not be
  // rejected as if they were unreviewed characters.
  assert.equal(refuseUpload({ filename: 'Sales & Marketing.png', bytes: 10 }), null);
  assert.equal(refuseUpload({ filename: 'Programming in C#.pdf', bytes: 10 }), null);
});

test('a file with no extension is refused', () => {
  assert.ok(refuseUpload({ filename: 'README', bytes: 10 }));
  assert.equal(extensionOf('README'), '');
});

test('the v1 size caps: raw at 10 MB, images at 20 MB', () => {
  assert.equal(refuseUpload({ filename: 'a.pdf', bytes: RAW_MAX_BYTES }), null);
  assert.match(
    refuseUpload({ filename: 'a.pdf', bytes: RAW_MAX_BYTES + 1 }) ?? '',
    /10 MB/,
    'an oversized document must say so, and mention the v2 path',
  );
  assert.equal(refuseUpload({ filename: 'a.png', bytes: IMAGE_MAX_BYTES }), null);
  assert.ok(refuseUpload({ filename: 'a.png', bytes: IMAGE_MAX_BYTES + 1 }));
  // A document just over the RAW cap must NOT be waved through as an image.
  assert.ok(refuseUpload({ filename: 'big.zip', bytes: RAW_MAX_BYTES + 1 }));
});

test('category names are a single safe path segment', () => {
  for (const ok of ['catalog', 'excel-text-functions', 'photo_2026', 'A1']) {
    assert.ok(isValidCategory(ok), `${ok} should be valid`);
  }
  for (const bad of ['', '..', 'a/b', 'a\\b', '.hidden', '-leading', 'a'.repeat(65), 'ก']) {
    assert.equal(isValidCategory(bad), false, `${bad} should be invalid`);
  }
});

// ── THE ROUND TRIP THAT MAKES "NO NEW ROUTE" TRUE ───────────────────────────

test('publicPath → public_id → publicPath survives intact', () => {
  // This is the whole mechanism: a file stored under an id that IS its path is
  // already served at that path by the deployed rewrite. If the round trip ever
  // stops closing, uploads land somewhere delivery does not look.
  const cases = [
    ['catalog', 'excel-2026.pdf', 'raw'],
    ['photo', 'team-outing.jpg', 'image'],
    ['brochure', 'ปกโบรชัวร์.png', 'image'],
    ['doc', 'Case Study (Final).xlsx', 'raw'],
  ];
  for (const [cat, name, expectType] of cases) {
    const publicPath = publicPathFor(cat, name);
    const ext = extensionOf(name);
    assert.equal(resourceTypeFor(ext), expectType, name);
    const { publicId } = legacyPathToPublicId(publicPath, expectType, LEGACY_PUBLIC_ID_PREFIX);
    const back = publicPathFromPublicId(publicId, LEGACY_PUBLIC_ID_PREFIX, expectType, ext);
    assert.equal(back, publicPath, `${name} did not round-trip`);
  }
});

test('a substituted name does NOT round-trip, and that is why the resolver exists', () => {
  // `&` → `and` is lossy, so the id cannot reproduce the path. The file is still
  // reachable — through /legacy-file, keyed on publicIdSubstituted — but anything
  // that assumed the round trip closes for every file would be wrong.
  const publicPath = publicPathFor('catalog', 'Sales & Marketing.pdf');
  const { publicId, substituted } = legacyPathToPublicId(publicPath, 'raw', LEGACY_PUBLIC_ID_PREFIX);
  assert.equal(substituted, true);
  assert.notEqual(
    publicPathFromPublicId(publicId, LEGACY_PUBLIC_ID_PREFIX, 'raw', 'pdf'),
    publicPath,
  );
});

test('publicPathFor produces the /files/<category>/<filename> shape', () => {
  assert.equal(publicPathFor('catalog', 'a.pdf'), '/files/catalog/a.pdf');
});

test('publicPathFromPublicId refuses an id outside the legacy prefix', () => {
  assert.equal(publicPathFromPublicId('some/other/thing', LEGACY_PUBLIC_ID_PREFIX, 'raw'), null);
});
