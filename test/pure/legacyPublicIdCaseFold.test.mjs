import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { legacyPathToPublicId, LEGACY_PUBLIC_ID_PREFIX } from '@/lib/legacyPublicId';

// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// CLOUDINARY FOLDS PUBLIC_ID CASE. That is measured, not assumed:
//
//   image/upload/<prefix>/sites/default/files/articles/images/access.gif  → 343,614 B
//   image/upload/<prefix>/sites/default/files/articles/images/Access.gif  → 343,614 B
//
// One asset, two spellings. And requesting the legacy path `/…/Access.png`
// returns the webp transcode of `access.gif` — a file it has nothing to do with.
//
// legacyPathToPublicId() PRESERVES case, which is correct: the id is the path,
// and mangling case would break the "public_id IS the path" invariant that lets
// delivery resolve with no lookup. The consequence is that two deliverable files
// can derive DIFFERENT id strings that name the SAME stored asset.
//
// Anything that groups files by public_id to detect a collision must therefore
// fold the case, or it under-groups and lets both into an upload set. Measured
// cost of getting that wrong: two files reached Cloudinary on the Stage-2 run,
// were refused by overwrite:false, and were recorded 'failed'. 8 groups / 16
// files across the deliverable tree are only visible once the key is folded.
//
// These tests pin the PROPERTY the grouping key depends on. They deliberately do
// not import the uploader — it is a script with side effects at module scope —
// so they pin the derivation and the folding rule that scripts/backfill-upload-
// stage.mjs applies to it.

/** The grouping key every collision check must use. */
const foldKey = (publicId) => String(publicId).toLowerCase();

test('case is PRESERVED in the derived public_id — the id is the path', () => {
  // If this ever starts lower-casing, delivery breaks for every mixed-case file:
  // the rewrite would ask for a path Cloudinary does not hold under that name.
  const upper = legacyPathToPublicId('/sites/default/files/articles/images/Access.png', 'image');
  const lower = legacyPathToPublicId('/sites/default/files/articles/images/access.gif', 'image');
  assert.equal(upper.publicId, `${LEGACY_PUBLIC_ID_PREFIX}/sites/default/files/articles/images/Access`);
  assert.equal(lower.publicId, `${LEGACY_PUBLIC_ID_PREFIX}/sites/default/files/articles/images/access`);
  assert.notEqual(upper.publicId, lower.publicId, 'the id strings differ — that is the trap');
});

test('THE DEFECT: exact-id grouping does NOT see a case-fold collision', () => {
  // The control for the fix. This is what the uploader used to do, and it is why
  // two files were let through to collide at the API.
  const a = legacyPathToPublicId('/sites/default/files/skills/icon/AI.svg', 'image').publicId;
  const b = legacyPathToPublicId('/sites/default/files/skills/icon/ai.webp', 'image').publicId;
  const exactGroups = new Map();
  for (const id of [a, b]) exactGroups.set(id, (exactGroups.get(id) ?? 0) + 1);
  assert.equal(exactGroups.size, 2, 'exact keys separate them — the under-grouping bug');
});

test('THE FIX: the case-folded key groups AI.svg and ai.webp together', () => {
  const a = legacyPathToPublicId('/sites/default/files/skills/icon/AI.svg', 'image').publicId;
  const b = legacyPathToPublicId('/sites/default/files/skills/icon/ai.webp', 'image').publicId;
  assert.equal(foldKey(a), foldKey(b));
  assert.equal(foldKey(a), `${LEGACY_PUBLIC_ID_PREFIX}/sites/default/files/skills/icon/ai`.toLowerCase());
});

test('all four real skills/icon pairs fold together', () => {
  // The population that made this defect visible. Each is a vector source beside
  // a raster export of it, which Rule A now excludes once they group.
  for (const stem of ['AI', 'RPA', 'Data', 'Business']) {
    const svg = legacyPathToPublicId(`/sites/default/files/skills/icon/${stem}.svg`, 'image').publicId;
    const webp = legacyPathToPublicId(`/sites/default/files/skills/icon/${stem.toLowerCase()}.webp`, 'image').publicId;
    assert.equal(foldKey(svg), foldKey(webp), stem);
  }
});

test('the real case-fold pairs from the tree all fold together', () => {
  const PAIRS = [
    ['/sites/default/files/articles/images/access.gif', '/sites/default/files/articles/images/Access.png', 'image'],
    ['/sites/default/files/articles/images/artwork-01_0.png', '/sites/default/files/articles/images/Artwork-01_0.png', 'image'],
    ['/sites/default/files/articles/images/artwork-02_0.png', '/sites/default/files/articles/images/Artwork-02_0.png', 'image'],
    [
      '/sites/default/files/course/outline/ai-agents-with-microsoft-copilot-studio-course-outline-en.pdf',
      '/sites/default/files/course/outline/ai-agents-with-microsoft-copilot-studio-course-outline-EN.pdf',
      'raw',
    ],
  ];
  for (const [a, b, rt] of PAIRS) {
    const ida = legacyPathToPublicId(a, rt).publicId;
    const idb = legacyPathToPublicId(b, rt).publicId;
    assert.notEqual(ida, idb, `${a} vs ${b}: exact ids should differ`);
    assert.equal(foldKey(ida), foldKey(idb), `${a} vs ${b}: folded keys must match`);
  }
});

test('CONTROL: folding does NOT merge files that merely look similar', () => {
  // The fix must not over-group. `Artwork-01_0` and `Artwork-02_0` differ in a
  // character that is not case, so they stay separate however the key is folded —
  // otherwise the six real Artwork-03..08 files would collapse into one asset.
  const ids = ['Artwork-01_0', 'Artwork-02_0', 'Artwork-03_0', 'artwork-01_0']
    .map((n) => foldKey(legacyPathToPublicId(`/sites/default/files/articles/images/${n}.png`, 'image').publicId));
  // 4 names, 3 distinct folded keys: only the first and last collide.
  assert.equal(new Set(ids).size, 3);
  assert.equal(ids[0], ids[3]);
  assert.notEqual(ids[0], ids[1]);
  assert.notEqual(ids[1], ids[2]);
});

test('folding is applied to the WHOLE id, not just the filename', () => {
  // A directory that differs only by case is the same trap one level up, and a
  // filename-only fold would miss it.
  const a = legacyPathToPublicId('/sites/default/files/Course/cover/x.png', 'image').publicId;
  const b = legacyPathToPublicId('/sites/default/files/course/cover/x.png', 'image').publicId;
  assert.notEqual(a, b);
  assert.equal(foldKey(a), foldKey(b));
});

test('the uploader keys its collision groups on the folded id', () => {
  // A seam guard: the property above is worthless if the script stops using it.
  // Matched against the source because the uploader cannot be imported — it
  // connects to Mongo and walks a staging tree at module scope.
  const src = fs.readFileSync(new URL('../../scripts/backfill-upload-stage.mjs', import.meta.url), 'utf8');
  assert.match(src, /const foldKey = \(publicId\) => String\(publicId\)\.toLowerCase\(\)/,
    'the uploader must define a case-folding key');
  assert.match(src, /groups\.set\(k, \[\]\)/, 'groups must be keyed on the folded key `k`');
  assert.ok(
    !/groups\.has\(c\.publicId\)/.test(src),
    'the uploader must NOT group on the exact publicId — that is the defect',
  );
});
