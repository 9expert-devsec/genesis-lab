import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUpload, rulesForFolder, DEFAULT_RULE, FOLDER_RULES } from '@/lib/uploads/uploadRules';

/**
 * What /api/admin/upload accepts, per folder.
 *
 * ══ THE ASSERTION THAT MATTERS MOST IS NOT ABOUT AVATARS ════════════════════
 * It is `courses/covers` still taking a 4 MB PDF.
 *
 * This round narrows one folder. The plausible damage is not "the avatar rule
 * is wrong" — that is the thing being written, tested, and looked at. It is the
 * 2 MB cap or the three-MIME allowlist escaping its row and applying to
 * everything, so the course-cover upload that every admin uses quietly stops
 * accepting the documents it has always accepted. Nobody would connect that to
 * an avatar commit.
 *
 * So the regression guard is not an afterthought at the bottom of this file; it
 * is the reason the file has a table at all, and control (c) exists to prove it
 * fires.
 *
 * ── WHY THIS TIER AND NOT AN HTTP TEST ──────────────────────────────────────
 * The route imports `auth`, which drags NextAuth and its Edge config in. The
 * DECISION is pure and is what has the rules in it; the route's job is turning
 * a verdict into a 400. The seam between them — that the route actually calls
 * this and does not keep its own copy — is asserted in test/fs/uploadRouteWiring,
 * because round A's lesson was that a correct function nothing calls passes
 * every test written about it.
 */

const MB = 1024 * 1024;
const jpeg = (mb) => ({ type: 'image/jpeg', size: mb * MB });

// ── the avatars rule ────────────────────────────────────────────────────────
test('avatars: a 1 MB JPEG is allowed', () => {
  assert.deepEqual(checkUpload('avatars', jpeg(1)), { ok: true });
});

test('avatars: PNG and WebP are allowed too', () => {
  assert.equal(checkUpload('avatars', { type: 'image/png', size: MB }).ok, true);
  assert.equal(checkUpload('avatars', { type: 'image/webp', size: MB }).ok, true);
});

test('avatars: a PDF is rejected', () => {
  const v = checkUpload('avatars', { type: 'application/pdf', size: MB });
  assert.equal(v.ok, false);
  assert.ok(v.error, 'a refusal must carry a message the admin can read');
});

test('avatars: an SVG is rejected — it is script-bearing', () => {
  // The specific reason this folder has a rule. An SVG matches `image/*`, so
  // the default rule accepts it; a profile image renders inside the admin
  // chrome on every admin page, and the two must never meet.
  const v = checkUpload('avatars', { type: 'image/svg+xml', size: 1024 });
  assert.equal(v.ok, false);
});

test('avatars: a 3 MB JPEG is rejected', () => {
  const v = checkUpload('avatars', jpeg(3));
  assert.equal(v.ok, false);
  assert.notEqual(v.error, checkUpload('avatars', { type: 'application/pdf', size: 1 }).error,
    'too-big and wrong-type must not report the same reason');
});

test('avatars: the cap is 2 MB, checked at the boundary', () => {
  assert.equal(checkUpload('avatars', { type: 'image/jpeg', size: 2 * MB }).ok, true);
  assert.equal(checkUpload('avatars', { type: 'image/jpeg', size: 2 * MB + 1 }).ok, false);
});

test('avatars: an invented image MIME is rejected — allowlist, not blocklist', () => {
  // The difference between `image/*` minus exclusions and three named types.
  assert.equal(checkUpload('avatars', { type: 'image/avif', size: 1024 }).ok, false);
  assert.equal(checkUpload('avatars', { type: 'image/gif', size: 1024 }).ok, false);
});

// ── THE REGRESSION GUARD: existing folders are untouched ────────────────────
test('courses/covers: a 4 MB PDF is STILL allowed', () => {
  // The behaviour that existed before per-folder rules, asserted so narrowing
  // one folder cannot narrow this one by accident.
  assert.deepEqual(checkUpload('courses/covers', { type: 'application/pdf', size: 4 * MB }), { ok: true });
});

test('every pre-existing folder keeps the 5 MB cap and the image-or-PDF rule', () => {
  const untouched = [
    'courses/covers', 'courses/galleries', 'courses/body', 'promotions',
    'instructors', 'banners', 'articles', 'custom-pages', 'page-builder',
    'promotion-covers', 'page-builder-icons', 'notifications', 'about',
    'career-paths', 'masterclass', 'uploads',
  ];
  for (const folder of untouched) {
    assert.equal(rulesForFolder(folder), DEFAULT_RULE, `${folder} picked up a bespoke rule`);
    assert.equal(checkUpload(folder, { type: 'application/pdf', size: 4 * MB }).ok, true, folder);
    assert.equal(checkUpload(folder, { type: 'image/jpeg', size: 5 * MB }).ok, true, folder);
    assert.equal(checkUpload(folder, { type: 'image/jpeg', size: 5 * MB + 1 }).ok, false, folder);
    // Named rather than left implicit: SVG is still accepted here. That is
    // pre-existing behaviour for every one of these folders and this round does
    // not widen or narrow it — `avatars` refuses SVG explicitly instead.
    assert.equal(checkUpload(folder, { type: 'image/svg+xml', size: 1024 }).ok, true, folder);
  }
});

test('the default error strings are unchanged, character for character', () => {
  // Anything matching on these — a client, a log filter — is unaffected by the
  // refactor. This is the "byte for byte" half of the regression guard.
  assert.equal(
    checkUpload('uploads', { type: 'text/plain', size: 10 }).error,
    'Only image or PDF files allowed',
  );
  assert.equal(
    checkUpload('uploads', { type: 'image/jpeg', size: 6 * MB }).error,
    'File too large (max 5 MB)',
  );
});

// ── the table's own shape ───────────────────────────────────────────────────
test('an unknown folder falls back to the default rule, not to nothing', () => {
  // The route maps an unlisted folder to 'uploads', but the table must not
  // throw or return undefined if it is ever handed one directly.
  assert.equal(rulesForFolder('not-a-folder'), DEFAULT_RULE);
  assert.equal(rulesForFolder(undefined), DEFAULT_RULE);
  assert.equal(rulesForFolder(''), DEFAULT_RULE);
});

test('avatars is the only folder with a bespoke rule today', () => {
  // Not a style check. If a second entry appears, the regression list above
  // needs to know about it — otherwise that folder is silently exempt from the
  // "existing behaviour" assertion while still being listed in it.
  assert.deepEqual(Object.keys(FOLDER_RULES), ['avatars']);
});

test('a missing or non-numeric size is refused rather than passed through', () => {
  // `undefined > 2MB` is false, so a naive comparison lets a sizeless object
  // past. Fail closed.
  assert.equal(checkUpload('avatars', { type: 'image/jpeg' }).ok, false);
  assert.equal(checkUpload('avatars', { type: 'image/jpeg', size: '1' }).ok, false);
  assert.equal(checkUpload('uploads', { type: 'image/jpeg' }).ok, false);
});

test('a missing type is refused, and does not throw', () => {
  assert.equal(checkUpload('avatars', {}).ok, false);
  assert.equal(checkUpload('avatars', null).ok, false);
  assert.equal(checkUpload('uploads', { type: null, size: 10 }).ok, false);
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the two rules genuinely differ, so the table is doing work', () => {
  // If the avatars rule were accidentally identical to the default, every
  // assertion above would still pass except these — a table that partitions
  // nothing looks exactly like a table that works.
  const pdf = { type: 'application/pdf', size: MB };
  assert.equal(checkUpload('uploads', pdf).ok, true);
  assert.equal(checkUpload('avatars', pdf).ok, false);

  const big = jpeg(3);
  assert.equal(checkUpload('uploads', big).ok, true);
  assert.equal(checkUpload('avatars', big).ok, false);
});
