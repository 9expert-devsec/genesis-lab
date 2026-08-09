import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FILES_SEGMENT,
  isWithinFilesCategory,
  publicPathFromPublicId,
  refuseDeletePath,
  refuseUpload,
} from '@/lib/legacyUploadPolicy.mjs';
import { legacyPathToPublicId, LEGACY_PUBLIC_ID_PREFIX } from '@/lib/legacyPublicId';

// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────
//
// /admin/media v2 can DESTROY a Cloudinary asset, and destroying one takes its
// public URL down with it — permanently, publicly, with no redirect possible
// because the public_id IS the URL.
//
// `cloudinary.uploader.destroy` has no notion of "the folder this screen
// manages". It takes an id and removes it. So the only thing standing between a
// crafted request and the 1,600 migrated assets that the live site serves is the
// pair of predicates below, plus the fact that deleteMediaFile DERIVES the id
// rather than accepting one. This file is what keeps that pair honest.
//
// Both are pure and exported on their own for exactly this reason: a guard that
// can only be exercised through a server action against a live Cloudinary
// account is a guard whose shape nobody actually knows.

const PREFIX = LEGACY_PUBLIC_ID_PREFIX;
const ROOT = `${PREFIX}/${FILES_SEGMENT}`;

// ── THE PREFIX GUARD ────────────────────────────────────────────────────────

test('an id inside a category of the files tree is deletable', () => {
  for (const id of [
    `${ROOT}/photo/g01`,
    `${ROOT}/document/case-study.xlsx`,
    `${ROOT}/excel-text-functions/LEFT-RIGHT-MID.xlsx`,
    // Thai script, spaces and parentheses all survive verbatim into a public_id
    // (measured — see src/lib/legacyPublicId.js) and must stay deletable.
    `${ROOT}/document/case-study-excel-ช่วยทำ-project-plan.xlsx`,
    `${ROOT}/photo/hello world (v1)`,
  ]) {
    assert.equal(isWithinFilesCategory(id, PREFIX), true, id);
  }
});

test('NESTING BELOW THE CATEGORY IS ALLOWED — 79 real assets need it', () => {
  // MEASURED against the live account: of 236 assets under files/, 79 sit more
  // than one segment deep (files/images/course/…, files/images/articles/…).
  // A guard that required exactly two segments would make every one of those
  // undeletable from the screen that exists to delete files.
  for (const id of [
    `${ROOT}/images/course/arrow-next`,
    `${ROOT}/images/articles/data_analyst-infographic-full-size`,
    `${ROOT}/images/a/b/c/deep`,
  ]) {
    assert.equal(isWithinFilesCategory(id, PREFIX), true, id);
  }
});

test('THE POINT OF THE GUARD: an id outside files/ is refused', () => {
  // Each of these is a real place assets live in this account. If the guard let
  // one through, one request would delete a migrated article image, a course
  // cover, or a schedule PDF — and the URL would stop resolving on the live
  // site with no way to put it back.
  for (const id of [
    `${PREFIX}/sites/default/files/articles/images/foo`,
    `${PREFIX}/images/course/cover`,
    `${PREFIX}/download/brochure.pdf`,
    '9exp-genesis/schedule-pdf/schedule',
    'some-other-account-folder/thing',
    'files/photo/g01',                       // no prefix at all
    `${PREFIX}/filesX/photo/g01`,            // prefix-of-a-prefix, not the folder
  ]) {
    assert.equal(isWithinFilesCategory(id, PREFIX), false, id);
  }
});

test('an id that stops at the category, or has no category, is refused', () => {
  // `files/loose-file` is a real shape — the discovery walk deliberately skips
  // files sitting directly under files/ with no category, so they have no tab
  // and no row. Nothing should be able to delete one from here either.
  for (const id of [
    `${ROOT}/photo`,          // the category itself
    `${ROOT}/photo/`,         // trailing separator, no asset named
    `${ROOT}/loose-file`,     // directly under files/, no category
    `${ROOT}/`,
    ROOT,
    `${PREFIX}/`,
    '',
  ]) {
    assert.equal(isWithinFilesCategory(id, PREFIX), false, JSON.stringify(id));
  }
});

test('traversal and empty segments are refused wherever they appear', () => {
  for (const id of [
    `${ROOT}/../sites/default/files/articles/images/foo`,
    `${ROOT}/photo/../../download/brochure.pdf`,
    `${ROOT}/photo/..`,
    `${ROOT}//photo/g01`,
    `${ROOT}/photo//g01`,
  ]) {
    assert.equal(isWithinFilesCategory(id, PREFIX), false, id);
  }
});

test('the category segment must be a VALID category, not merely non-empty', () => {
  // isValidCategory is what makes a category round-trip as a URL segment. A
  // segment that fails it names a folder this screen could never have created
  // and could never link to, so a delete aimed at one is not an operation this
  // screen owns.
  // NOT in this list: a segment containing a slash. `files/has/slash/file.png`
  // is not an invalid category — it is the category `has` with a nested asset,
  // which the previous test establishes as legitimate.
  for (const bad of ['-leading-dash', '.hidden', 'has space', 'a'.repeat(65)]) {
    assert.equal(
      isWithinFilesCategory(`${ROOT}/${bad}/file.png`, PREFIX), false,
      bad,
    );
  }
  assert.equal(isWithinFilesCategory(`${ROOT}/${'a'.repeat(64)}/file.png`, PREFIX), true,
    '64 characters is the documented ceiling and must still pass');
});

test('non-string input cannot slip past', () => {
  for (const junk of [null, undefined, 0, {}, []]) {
    assert.equal(isWithinFilesCategory(junk, PREFIX), false, String(junk));
  }
});

// ── THE PATH-SHAPE REFUSAL ──────────────────────────────────────────────────

test('a well-formed public path under a category is accepted', () => {
  for (const p of [
    '/files/photo/g01.jpg',
    '/files/document/case-study.xlsx',
    '/files/images/course/arrow-next.png',
    '/files/photo/hello world (v1).png',
  ]) {
    assert.equal(refuseDeletePath(p), null, p);
  }
});

test('a path outside /files/ is refused with a reason', () => {
  for (const p of [
    '/sites/default/files/articles/images/foo.png',
    '/images/course/cover.jpg',
    '/download/brochure.pdf',
    'files/photo/g01.jpg',       // no leading slash
    '/filesX/photo/g01.jpg',
    '/files',
    '/',
    '',
  ]) {
    const reason = refuseDeletePath(p);
    assert.ok(reason, `${JSON.stringify(p)} must be refused`);
    assert.equal(typeof reason, 'string');
  }
});

test('separator tricks are refused before an id is ever derived', () => {
  for (const p of [
    '/files/photo/../../sites/default/files/x.png',
    '/files/../download/brochure.pdf',
    '/files//photo/g01.jpg',
    '/files/photo//g01.jpg',
    '/files/photo/g01.jpg\\..',
    '/files/photo/.',
    '/files/photo/.hidden',
    '/files/photo/',
    '/files/photo',              // names a category, not a file
  ]) {
    assert.ok(refuseDeletePath(p), `${p} must be refused`);
  }
});

test('the reasons are Thai, because the only caller shows them to a Thai admin', () => {
  // Same rule as refuseUpload's. An internal English string here reaches a
  // non-English admin at the moment they are trying to delete something.
  for (const p of ['/images/x.png', '/files/photo/../x.png', '/files/x.png']) {
    assert.match(refuseDeletePath(p), /[฀-๿]/, p);
  }
});

// ── THE TWO HALVES AGREE, AND AGREE WITH THE UPLOAD SIDE ────────────────────

test('every path refuseDeletePath ACCEPTS derives an id the prefix guard accepts', () => {
  // The two predicates are applied in sequence by deleteMediaFile, with
  // legacyPathToPublicId between them. If a path could pass the first and fail
  // the second, the screen would offer a delete that always errors; if it could
  // pass the second having failed the first, the shape check would be
  // decorative. Neither, over the shapes the live tree actually contains.
  for (const [p, rt] of [
    ['/files/photo/g01.jpg', 'image'],
    ['/files/document/case-study.xlsx', 'raw'],
    ['/files/images/course/arrow-next.png', 'image'],
    ['/files/photo/hello world (v1).png', 'image'],
    ['/files/document/case-study-excel-ช่วยทำ-project-plan.xlsx', 'raw'],
  ]) {
    assert.equal(refuseDeletePath(p), null, p);
    const { publicId } = legacyPathToPublicId(p, rt, PREFIX);
    assert.equal(isWithinFilesCategory(publicId, PREFIX), true, publicId);
  }
});

test('THE ROUND TRIP: a listed file deletes the id it was listed from', () => {
  // The list builds each row's publicPath from the STORED public_id, and the
  // delete rebuilds an id from that path. If the two disagreed, Cloudinary
  // would answer `not found`, the idempotent path would report success, and the
  // row would vanish from the screen while the asset stayed live — a failure
  // that looks exactly like a successful delete. This is the assertion that
  // says it does not happen, including for the ids the substitution rules
  // rewrote.
  for (const [storedId, rt, format] of [
    [`${ROOT}/photo/g01`, 'image', 'jpg'],
    [`${ROOT}/document/case-study.xlsx`, 'raw', ''],
    [`${ROOT}/images/course/arrow-next`, 'image', 'png'],
    // `&` → `and` and `#` → `sharp` are LOSSY and non-invertible, so the listed
    // path already carries the substituted spelling. Re-deriving from it must
    // land on the same id rather than trying to undo the rule.
    [`${ROOT}/course/Sales and Marketing`, 'image', 'png'],
    [`${ROOT}/course/Programming in Csharp`, 'image', 'png'],
  ]) {
    const publicPath = publicPathFromPublicId(storedId, PREFIX, rt, format);
    assert.ok(publicPath, storedId);
    assert.equal(refuseDeletePath(publicPath), null, publicPath);
    const { publicId } = legacyPathToPublicId(publicPath, rt, PREFIX);
    assert.equal(publicId, storedId, `${publicPath} must derive back to ${storedId}`);
    assert.equal(isWithinFilesCategory(publicId, PREFIX), true, publicId);
  }
});

test('DELETE IS NOT GATED ON THE UPLOAD ALLOW-LIST — that is deliberate', () => {
  // The tree was filled by a full-disk backfill and the allow-list has since
  // narrowed. Reusing refuseUpload here would make exactly the files an admin
  // most wants gone the ones they cannot remove.
  const legacy = '/files/document/old-recording.mp3';
  assert.ok(refuseUpload({ filename: 'old-recording.mp3', bytes: 10 }),
    'the uploader refuses this extension…');
  assert.equal(refuseDeletePath(legacy), null,
    '…and the delete guard must still allow removing one that is already there');
});

test('CONTROL: the guard is not a blanket true — the sequence really can refuse', () => {
  // Without this, every assertion above could be satisfied by a predicate that
  // returns true for everything. Prove the pipeline refuses at BOTH stations
  // for the case that matters most: an id aimed outside the files tree.
  const escape = '/sites/default/files/articles/images/foo.png';
  assert.ok(refuseDeletePath(escape), 'the shape check refuses it');
  const { publicId } = legacyPathToPublicId(escape, 'image', PREFIX);
  assert.equal(
    isWithinFilesCategory(publicId, PREFIX), false,
    'and had the shape check been bypassed, the prefix guard still refuses the derived id',
  );
});
