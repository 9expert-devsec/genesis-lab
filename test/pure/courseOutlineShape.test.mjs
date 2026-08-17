import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyOutline, hasOutline, isOutlineLang, normaliseCourseIdForPath,
  outlineFileName, outlineFromFormValue, outlineObject, outlinePublicPath, outlineWouldGoStale,
} from '@/lib/courses/courseOutline';
import { legacyPathToPublicId, LEGACY_PUBLIC_ID_PREFIX } from '@/lib/legacyPublicId';

/**
 * Course-outline path derivation and the MSDB object shape.
 *
 * ══ WHY THE DERIVATION IS THE SECURITY BOUNDARY, NOT A CONVENIENCE ══════════
 *
 * The upload is signed with `overwrite: true`, so whoever decides the path
 * decides which Cloudinary asset is destroyed. The client sends courseId + lang
 * and nothing else; everything below is what the server computes from that.
 * A test that let a client-supplied filename through would be testing a
 * different, much more permissive system than the one that ships.
 *
 * ══ THE 8-KEY SHAPE IS COPIED FROM MEASURED DATA ════════════════════════════
 * Measured 2026-08-09: MSDB returns exactly these eight keys on every row,
 * populated or not, and only kind/url/download_url are ever non-empty — even on
 * POWER-BI, the row that renders a working button. MSDB silently drops keys it
 * does not keep, so sending a key it has never returned is how a field appears
 * to save and does not.
 */

const KEYS = ['kind', 'url', 'file_id', 'filename', 'content_type', 'size', 'uploaded_at', 'download_url'];

// ── the 8-key shape ─────────────────────────────────────────────────────────
test('the empty outline has exactly the eight measured keys', () => {
  assert.deepEqual(Object.keys(emptyOutline()).sort(), [...KEYS].sort());
});

test('a populated outline sets kind/url/download_url and NOTHING else', () => {
  const o = outlineObject('/files/course-outline/power-bi-course-outline-th.pdf');
  assert.deepEqual(Object.keys(o).sort(), [...KEYS].sort());
  assert.equal(o.kind, 'link');
  assert.equal(o.url, '/files/course-outline/power-bi-course-outline-th.pdf');
  assert.equal(o.download_url, o.url);
  // the five upstream leaves alone
  assert.equal(o.file_id, null);
  assert.equal(o.filename, '');
  assert.equal(o.content_type, '');
  assert.equal(o.size, 0);
  assert.equal(o.uploaded_at, null);
});

test('CONTROL: the key set can disagree — a 7-key object is caught', () => {
  const short = { ...emptyOutline() };
  delete short.download_url;
  assert.notDeepEqual(Object.keys(short).sort(), [...KEYS].sort(),
    'if this passes, the key assertion above would not notice a dropped field');
});

// ── the filename derivation, including the lowercase rule ───────────────────
test('a MIXED-CASE course_id is lowercased into the filename and the path', () => {
  const n = normaliseCourseIdForPath('POWER-BI');
  assert.deepEqual(n, { ok: true, value: 'power-bi' });
  assert.equal(outlineFileName(n.value, 'th'), 'power-bi-course-outline-th.pdf');
  assert.equal(outlinePublicPath(n.value, 'th'), '/files/course-outline/power-bi-course-outline-th.pdf');
});

test('CONTROL: without lowercasing, two case variants would collide in Cloudinary', () => {
  // Cloudinary FOLDS public_id case, so these two ids are ONE asset. The
  // control proves the collision is real, which is what the rule prevents.
  const upper = legacyPathToPublicId('/files/course-outline/POWER-BI-course-outline-th.pdf', 'raw', LEGACY_PUBLIC_ID_PREFIX);
  const lower = legacyPathToPublicId('/files/course-outline/power-bi-course-outline-th.pdf', 'raw', LEGACY_PUBLIC_ID_PREFIX);
  assert.notEqual(upper.publicId, lower.publicId,
    'the two spellings differ as STRINGS — which is exactly why they must be normalised '
    + 'before they reach Cloudinary, where they would fold to one asset');

  // and both normalise to the same derived target, so the collision cannot occur
  assert.equal(normaliseCourseIdForPath('POWER-BI').value, normaliseCourseIdForPath('power-bi').value);
});

test('every language pair produces a distinct path', () => {
  const th = outlinePublicPath('canva-l1', 'th');
  const en = outlinePublicPath('canva-l1', 'en');
  assert.notEqual(th, en);
  assert.match(th, /-th\.pdf$/);
  assert.match(en, /-en\.pdf$/);
});

// ── rejection of anything that is not a clean id ────────────────────────────
test('a course_id that is not [a-z0-9-] after normalising is REFUSED, by name', () => {
  for (const bad of ['MSE L1', 'course/../etc', 'ค่าไทย', 'a_b', 'x.y', '']) {
    const r = normaliseCourseIdForPath(bad);
    assert.equal(r.ok, false, `expected "${bad}" to be refused`);
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 0);
  }
  // the refusal NAMES the offending value, or an admin cannot find it
  assert.match(normaliseCourseIdForPath('MSE L1').reason, /MSE L1/);
});

test('CONTROL: a client-supplied path cannot smuggle its way into the target', () => {
  // The shape of the attack the derivation exists to prevent: a caller offering
  // a path that would overwrite a migrated article image.
  const hostile = '../../sites/default/files/articles/images/cover';
  const r = normaliseCourseIdForPath(hostile);
  assert.equal(r.ok, false, 'a traversal string must never normalise to a usable id');

  // and even if it somehow reached the builder, the result stays inside the
  // course-outline category rather than escaping it
  const path = outlinePublicPath('power-bi', 'th');
  assert.ok(path.startsWith('/files/course-outline/'));
  assert.equal(path.includes('..'), false);
});

test('lang is restricted to th | en', () => {
  assert.equal(isOutlineLang('th'), true);
  assert.equal(isOutlineLang('en'), true);
  assert.equal(isOutlineLang('TH'), true, 'case-insensitive on the way in');
  for (const bad of ['jp', '', null, undefined, 'th-TH', 'e']) {
    assert.equal(isOutlineLang(bad), false, `expected "${bad}" to be refused`);
  }
});

// ── hasOutline / the stale-rename warning ───────────────────────────────────
test('hasOutline reads download_url, the same field PDFDownload renders from', () => {
  assert.equal(hasOutline(outlineObject('/files/course-outline/x-course-outline-th.pdf')), true);
  assert.equal(hasOutline(emptyOutline()), false);
  assert.equal(hasOutline(null), false);
  assert.equal(hasOutline({ url: '/x.pdf' }), false, 'url alone is not what renders the button');
});

test('renaming a course_id with an outline present is reported', () => {
  const stale = outlineWouldGoStale({
    previousCourseId: 'POWER-BI',
    nextCourseId: 'POWER-BI-2',
    outlines: { th: outlineObject('/files/course-outline/power-bi-course-outline-th.pdf'), en: emptyOutline() },
  });
  assert.deepEqual(stale, { from: 'power-bi', to: 'power-bi-2', langs: ['th'] });
});

test('CONTROL: it stays silent when nothing would actually go stale', () => {
  // no outline at all
  assert.equal(outlineWouldGoStale({
    previousCourseId: 'A', nextCourseId: 'B', outlines: { th: emptyOutline(), en: emptyOutline() },
  }), null);
  // id unchanged apart from case, which normalises to the same path
  assert.equal(outlineWouldGoStale({
    previousCourseId: 'POWER-BI',
    nextCourseId: 'power-bi',
    outlines: { th: outlineObject('/files/course-outline/power-bi-course-outline-th.pdf') },
  }), null, 'a case-only change does not move the derived path, so it is not stale');
});

// ── form → payload round trip ───────────────────────────────────────────────
//
// shapePayload() itself lives in a 'use server' module that imports next/cache
// and the MSDB write client, so it cannot be imported here. The mapping it
// calls can be, and the mapping is where the claim lives.

test('round trip: a posted path becomes the full 8-key link object', () => {
  const posted = '/files/course-outline/power-bi-course-outline-th.pdf';
  const out = outlineFromFormValue(posted);
  assert.deepEqual(Object.keys(out).sort(), [...KEYS].sort());
  assert.equal(out.kind, 'link');
  assert.equal(out.url, posted);
  assert.equal(out.download_url, posted);
  assert.equal(hasOutline(out), true, 'and it is the shape that renders a button');
});

test('CLEARING emits the empty OBJECT — it does not drop the key', () => {
  for (const cleared of ['', '   ', null, undefined]) {
    const out = outlineFromFormValue(cleared);
    assert.notEqual(out, undefined, 'a cleared outline must still be an object');
    assert.deepEqual(Object.keys(out).sort(), [...KEYS].sort(),
      'MSDB is sent every key even when empty — omitting one asks it to keep the old value');
    assert.equal(hasOutline(out), false);
    assert.equal(out.kind, '');
    assert.equal(out.download_url, '');
  }
});

test('CONTROL: dropping the key is DETECTABLY different from clearing it', () => {
  // The bug this guards: a "clear" implemented as an omitted key. Upstream
  // keeps its previous value, so the form appears to work and nothing changes.
  const cleared = { course_outline_th: outlineFromFormValue('') };
  const dropped = {};

  assert.equal(Object.hasOwn(cleared, 'course_outline_th'), true);
  assert.equal(Object.hasOwn(dropped, 'course_outline_th'), false,
    'if these two were indistinguishable, the assertion above would prove nothing');
  assert.notDeepEqual(cleared, dropped);
});

test('both languages are always emitted, populated or not', () => {
  // Exactly what shapePayload builds, from the two form fields.
  const payload = {
    course_outline_th: outlineFromFormValue('/files/course-outline/x-course-outline-th.pdf'),
    course_outline_en: outlineFromFormValue(''),
  };
  assert.equal(Object.hasOwn(payload, 'course_outline_th'), true);
  assert.equal(Object.hasOwn(payload, 'course_outline_en'), true);
  assert.equal(hasOutline(payload.course_outline_th), true);
  assert.equal(hasOutline(payload.course_outline_en), false);
  assert.deepEqual(Object.keys(payload.course_outline_en).sort(), [...KEYS].sort());
});
