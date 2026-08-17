import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROOT_FILE_EXTENSIONS, ROOT_FILE_MAX_BYTES, ROOT_FILE_MAX_DURATION_SECONDS,
  isAllowedRootExtension, refuseRootFileSize, rootDocumentKey, rootDocumentPublicPath,
  rootFileExtension,
} from '@/lib/rootDocuments.mjs';
import { NO_STORE_DOCUMENT_EXTENSIONS, RAW_EXTENSION_LIST } from '@/lib/legacyTransforms.mjs';
import { WEBROOT_DOCUMENTS, WEBROOT_MAX_BYTES } from '@/lib/webrootDocuments.mjs';

/**
 * THE POLICY FOR PUBLISHING A NEW FILE AT THE SITE ROOT.
 *
 * The first test is the point of the whole extension decision and everything
 * else in this file is secondary to it.
 */

// ── THE SUBSET RULE ─────────────────────────────────────────────────────────

test('THE SUBSET RULE: every root extension is in NO_STORE_DOCUMENT_EXTENSIONS', () => {
  // WHY: an extension outside NO_STORE gets edge-cached. Vercel answers a Range
  // request with 200 instead of 206 on a cache HIT, and a streaming client then
  // treats the partial body as the whole file — a PDF viewer reads the header,
  // jumps to the xref table at the tail, and pulls page 1 before the rest, so a
  // truncated 200 is a document that opens broken.
  const noStore = new Set(NO_STORE_DOCUMENT_EXTENSIONS);
  assert.ok(ROOT_FILE_EXTENSIONS.length > 0, 'an empty list would satisfy any subset claim');
  for (const ext of ROOT_FILE_EXTENSIONS) {
    assert.ok(
      noStore.has(ext),
      `"${ext}" may be published at the root but is NOT held out of the edge `
      + 'cache. A cache HIT answers a Range request with 200 and the client '
      + 'truncates the file. Add it to NO_STORE_DOCUMENT_EXTENSIONS or take it '
      + 'out of ROOT_FILE_EXTENSIONS',
    );
  }
});

test('CONTROL: the subset assertion CATCHES a member outside the set', () => {
  // Synthetic, and it owns its own fixture: `txt` is deliberately absent from
  // NO_STORE (nothing range-requests a text file, so paying a fetch per request
  // to protect a seek it never performs is pure bandwidth loss). Without this
  // control the assertion above would pass just as well for a broken `has`.
  const noStore = new Set(NO_STORE_DOCUMENT_EXTENSIONS);
  const SYNTHETIC = ['pdf', 'txt'];
  assert.equal(noStore.has('txt'), false, 'the fixture must really be outside the set');

  const escaped = SYNTHETIC.filter((ext) => !noStore.has(ext));
  assert.deepEqual(escaped, ['txt'],
    'the same membership test that guards ROOT_FILE_EXTENSIONS must reject txt, '
    + 'or the assertion above proves nothing');
});

test('the list is NOT derived from RAW_EXTENSION_LIST, and here is why that matters', () => {
  // RAW_EXTENSION_LIST means "Cloudinary serves this as a raw asset" and is the
  // wrong list in BOTH directions. src/lib/legacyDelivery.js:53 is already a
  // second copy of it; this must not become a fourth.
  const raw = new Set(RAW_EXTENSION_LIST);
  const noStore = new Set(NO_STORE_DOCUMENT_EXTENSIONS);

  for (const wronglyIncluded of ['txt', 'csv', 'rtf']) {
    assert.equal(raw.has(wronglyIncluded), true, `${wronglyIncluded} is in RAW…`);
    assert.equal(noStore.has(wronglyIncluded), false, `…and deliberately NOT in NO_STORE`);
    assert.equal(ROOT_FILE_EXTENSIONS.includes(wronglyIncluded), false,
      `${wronglyIncluded} reached the root list — that is RAW's shape, not NO_STORE's`);
  }

  assert.equal(raw.has('mp3'), false, 'mp3 is NOT in RAW (these MP3s are on Blob, not Cloudinary)…');
  assert.equal(noStore.has('mp3'), true, '…but IS in NO_STORE, because a player seeks constantly');
});

test('ROOT_FILE_EXTENSIONS is exactly pdf, and frozen', () => {
  assert.deepEqual([...ROOT_FILE_EXTENSIONS], ['pdf']);
  assert.equal(Object.isFrozen(ROOT_FILE_EXTENSIONS), true,
    'a consumer that mutated this would change what every other consumer sees');
});

// ── the size tripwire ───────────────────────────────────────────────────────

test('the cap is 10 MB, and it is NOT the webroot cap', () => {
  assert.equal(ROOT_FILE_MAX_BYTES, 10 * 1024 * 1024);
  assert.notEqual(ROOT_FILE_MAX_BYTES, WEBROOT_MAX_BYTES,
    'the two paths have different constraints: the frozen three are served by '
    + 'static rewrites and never hold a function open');
  assert.ok(ROOT_FILE_MAX_BYTES < WEBROOT_MAX_BYTES,
    'the function path is the tighter one — that is the whole reason it has its own number');
});

test('the frozen three STRADDLE this cap, and the cap is not why any of them work', () => {
  // MEASURED against the numbers, because they do NOT all sit on one side: two
  // are far above the cap and the smallest is comfortably under it. That is the
  // honest shape and it is the stronger argument — these are served by STATIC
  // REWRITES and never touch a function, so the cap does not reach them in
  // either direction. If someone "fixes" the apparent inconsistency by raising
  // the cap to 42.58 MB, the last assertion here goes red and says why.
  const FROZEN_MB = [1.80, 21.84, 42.58];
  const capMb = ROOT_FILE_MAX_BYTES / (1024 * 1024);
  assert.equal(FROZEN_MB.length, WEBROOT_DOCUMENTS.length,
    'one size per frozen document, or this fixture has drifted from the list');

  const above = FROZEN_MB.filter((mb) => mb > capMb);
  const below = FROZEN_MB.filter((mb) => mb <= capMb);
  assert.deepEqual(above, [21.84, 42.58], 'two of the three are above the cap');
  assert.deepEqual(below, [1.80],
    'and one is UNDER it — so "they are all above the cap, and all fine" is not '
    + 'the reason the cap does not apply to them. The reason is the static rewrite');

  assert.ok(capMb < 42.58,
    'the cap was raised to swallow the catalog. A file that large belongs on a '
    + 'static rewrite, which is the escape hatch — not on a bigger cap');
});

test('the refusal names the actual size, the cap, AND the escape hatch', () => {
  const msg = refuseRootFileSize(ROOT_FILE_MAX_BYTES + 1);
  assert.ok(msg, 'a file over the cap must be refused');
  assert.match(msg, /10\.0 MB/, 'it must name the cap');
  assert.match(msg, /MB เกิน/, 'and the actual size, or an admin cannot tell 1 MB over from a video');
  assert.match(msg, /rewrite/,
    'a legitimate large file has a route — a static rewrite and a deploy. A cap '
    + 'that will not say so reads as "never"');
  assert.match(msg, /next\.config\.mjs/, 'and it says where');
});

test('CONTROL: the refusal has a real threshold, not a blanket', () => {
  assert.equal(refuseRootFileSize(ROOT_FILE_MAX_BYTES), null, 'exactly at the cap passes');
  assert.equal(refuseRootFileSize(ROOT_FILE_MAX_BYTES - 1), null, 'just under passes');
  assert.ok(refuseRootFileSize(ROOT_FILE_MAX_BYTES + 1), 'just over is refused');
  assert.match(refuseRootFileSize(0), /ไม่ทราบขนาดไฟล์/, 'and an unknown size is not silently allowed');
  assert.match(refuseRootFileSize('nonsense'), /ไม่ทราบขนาดไฟล์/);
});

test('the duration ceiling is anchored on a declaration that already builds', () => {
  // src/app/api/chat/route.js:62 declares 30 and the project builds. A
  // maxDuration the plan cannot honour FAILS THE BUILD, which is what makes
  // that an observation rather than a hope.
  assert.equal(ROOT_FILE_MAX_DURATION_SECONDS, 30);
});

// ── the path helpers, and THE CASE RULE ─────────────────────────────────────

test('the public path preserves case, because it is what an operator reads', () => {
  assert.equal(rootDocumentPublicPath('Report-2026.pdf'), '/Report-2026.pdf');
  assert.equal(rootDocumentPublicPath('/Report-2026.pdf'), '/Report-2026.pdf',
    'a caller that already has a path must not get a doubled slash');
  assert.equal(rootDocumentPublicPath('  spaced.pdf  '), '/spaced.pdf');
  assert.equal(rootDocumentPublicPath(''), '');
  assert.equal(rootDocumentPublicPath(null), '');
});

test('THE CASE RULE: the lookup key is lowercased, because /Foo.pdf IS /foo.pdf', () => {
  // routes-manifest caseSensitive is false (READ in M5, not assumed), so two
  // rows differing only in case would be two rows claiming one address, with
  // rule order deciding which answers.
  assert.equal(rootDocumentKey('Report-2026.pdf'), '/report-2026.pdf');
  assert.equal(rootDocumentKey('report-2026.pdf'), '/report-2026.pdf');
  assert.equal(rootDocumentKey('REPORT-2026.PDF'), '/report-2026.pdf');
  assert.equal(
    rootDocumentKey('Foo.pdf'), rootDocumentKey('foo.pdf'),
    'these are THE SAME URL to Next. If the key can tell them apart, the unique '
    + 'index admits the colliding pair',
  );
});

test('CONTROL: the display path DOES keep the case the key throws away', () => {
  // Without this, "the key is lowercased" would pass for a module that
  // lowercased everything — and the published path would stop being what the
  // operator actually chose.
  assert.notEqual(rootDocumentPublicPath('Foo.pdf'), rootDocumentKey('Foo.pdf'));
  assert.equal(rootDocumentPublicPath('Foo.pdf'), '/Foo.pdf');
});

test('the extension helper lowercases, and the allow-list uses it', () => {
  assert.equal(rootFileExtension('Report.PDF'), 'pdf');
  assert.equal(rootFileExtension('archive.tar.gz'), 'gz');
  assert.equal(rootFileExtension('noextension'), '');
  assert.equal(rootFileExtension('.hidden'), '', 'a leading dot is not an extension');

  assert.equal(isAllowedRootExtension('Report.PDF'), true, 'case must not decide policy');
  assert.equal(isAllowedRootExtension('notes.txt'), false);
  assert.equal(isAllowedRootExtension('song.mp3'), false,
    'mp3 is in NO_STORE but is NOT on the root allow-list — the subset runs one way only');
});
