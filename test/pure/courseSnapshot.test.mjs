import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  VERSION_KIND,
  VERSION_KINDS,
  PRE_IMAGE,
  canonicalCourseKey,
  buildCourseSnapshot,
  snapshotFingerprint,
  snapshotsEqual,
} from '@/lib/courses/courseSnapshot';

/**
 * What a course snapshot CONTAINS, and what makes two of them equal.
 *
 * The no-op rule and the whole diff UI rest on this being stable: a snapshot
 * that varies with anything other than the course's content writes a version on
 * every save, and one that varies with too little hides a real edit.
 */

const course = (over = {}) => ({
  course_id: 'PBI-101',
  course_name: 'Power BI',
  course_teaser: 'สรุปสั้น',
  course_price: 12900,
  course_cover_url: 'https://res.cloudinary.com/x/image/upload/v1/covers/a.jpg',
  program: 'prog1',
  related_courses: ['c1', 'c2'],
  training_topics: [
    { title: 'บทที่ 1', bullets: ['หัวข้อย่อย ก', 'หัวข้อย่อย ข'] },
  ],
  course_outline_th: { download_url: '/files/courses/pbi-101-outline-th.pdf' },
  ...over,
});

const extension = (over = {}) => ({
  urlAlias: '/power-bi',
  metaTitle: 'Power BI',
  descriptionRich: '<p>คำอธิบายหลักสูตรแบบยาว</p>',
  trainingTopicsRich: ['<p>เนื้อหาบทที่ 1</p>'],
  gallery: [{ type: 'image', url: 'https://x/1.jpg', alt: 'a', order: 0 }],
  ...over,
});

// ── the long fields the audit log refuses to hold ────────────────────────────

test('the snapshot carries the long text the audit log excludes by name', () => {
  const s = buildCourseSnapshot({ course: course(), extension: extension() });

  // The course description lives in the extension — MSDB's `title` is
  // unreadable, so the rich body an admin types goes to course_extensions.
  assert.equal(s.extension.descriptionRich, '<p>คำอธิบายหลักสูตรแบบยาว</p>');
  assert.deepEqual(s.extension.trainingTopicsRich, ['<p>เนื้อหาบทที่ 1</p>']);

  // Topic TITLES and BODIES both — the audit log records only a count of these.
  assert.deepEqual(s.course.training_topics, [
    { title: 'บทที่ 1', bullets: ['หัวข้อย่อย ก', 'หัวข้อย่อย ข'] },
  ]);
});

test('CONTROL: a changed topic bullet really does change the snapshot', () => {
  const a = buildCourseSnapshot({ course: course(), extension: extension() });
  const b = buildCourseSnapshot({
    course: course({ training_topics: [{ title: 'บทที่ 1', bullets: ['หัวข้อย่อย ก', 'แก้แล้ว'] }] }),
    extension: extension(),
  });
  assert.equal(snapshotsEqual(a, b), false);
});

test('CONTROL: a changed rich description really does change the snapshot', () => {
  const a = buildCourseSnapshot({ course: course(), extension: extension() });
  const b = buildCourseSnapshot({
    course: course(),
    extension: extension({ descriptionRich: '<p>เขียนใหม่</p>' }),
  });
  assert.equal(snapshotsEqual(a, b), false);
});

// ── the fields that must NOT make a snapshot vary ────────────────────────────

/**
 * MSDB returns `program`, `previous_course` and `related_courses` either
 * POPULATED or as bare ObjectIds depending on the route and the query. If the
 * snapshot kept whichever arrived, two reads of an UNCHANGED course would
 * compare as different and every save would write a version — the exact failure
 * the no-op rule exists to prevent.
 */
test('a populated reference and a bare id produce the SAME snapshot', () => {
  const bare = buildCourseSnapshot({
    course: course({ program: 'prog1', related_courses: ['c1', 'c2'], previous_course: 'p9' }),
  });
  const populated = buildCourseSnapshot({
    course: course({
      program: { _id: 'prog1', program_name: 'Data' },
      related_courses: [{ _id: 'c1', course_name: 'A' }, { _id: 'c2', course_name: 'B' }],
      previous_course: { _id: 'p9' },
    }),
  });
  assert.equal(snapshotsEqual(bare, populated), true);
});

test('CONTROL: a DIFFERENT reference is still seen as a change', () => {
  const a = buildCourseSnapshot({ course: course({ program: 'prog1' }) });
  const b = buildCourseSnapshot({ course: course({ program: { _id: 'prog2' } }) });
  assert.equal(snapshotsEqual(a, b), false);
});

test('key order is not content — the fingerprint sorts at every level', () => {
  const a = { z: 1, a: { n: 2, m: [{ q: 1, p: 2 }] } };
  const b = { a: { m: [{ p: 2, q: 1 }], n: 2 }, z: 1 };
  assert.equal(snapshotFingerprint(a), snapshotFingerprint(b));
  assert.equal(snapshotsEqual(a, b), true);
});

test('MSDB fields genesis cannot READ are absent, not recorded as empty', () => {
  const s = buildCourseSnapshot({ course: course({ title: 'ignored', bullets: ['ignored'] }) });
  assert.equal('title' in s.course, false, 'upstream returns it on 0 of 80 courses');
  assert.equal('bullets' in s.course, false);
});

// ── absence is a state, and it is distinguishable ────────────────────────────

test('a course with no extension row records null, not an empty object', () => {
  const s = buildCourseSnapshot({ course: course(), extension: null });
  assert.equal(s.extension, null);
});

test('an unread course records null, and is not equal to an empty course', () => {
  const missing = buildCourseSnapshot({ course: null, extension: extension() });
  assert.equal(missing.course, null);
  assert.equal(snapshotsEqual(missing, buildCourseSnapshot({ course: {}, extension: extension() })), false);
});

test('two nulls are never equal — an absent comparison is not a match', () => {
  assert.equal(snapshotsEqual(null, null), false);
  assert.equal(snapshotsEqual(null, buildCourseSnapshot({ course: course() })), false);
});

test('an absent isPublished reads as VISIBLE, matching the rest of the app', () => {
  assert.equal(buildCourseSnapshot({ extension: {} }).extension.isPublished, true);
  assert.equal(buildCourseSnapshot({ extension: { isPublished: false } }).extension.isPublished, false);
});

// ── V3 at snapshot level: the outline trap ───────────────────────────────────

/**
 * THE DEFECT THE outlineRefs BLOCK EXISTS FOR.
 *
 * The outline public_id is derived from (course_id, lang) and the upload signs
 * `overwrite: true`, so the stored path is byte-identical before and after a
 * replacement. Two snapshots of a course whose PDF was swapped would otherwise
 * be equal, the no-op rule would drop the version, and the change would be
 * invisible everywhere.
 */
test('V3: an outline replaced at an IDENTICAL path is still a change', () => {
  const before = buildCourseSnapshot({
    course: course(),
    outlineFiles: [{ lang: 'th', version: 3, bytes: 240_000, uploadedAt: '2026-09-01T00:00:00.000Z' }],
  });
  const afterSwap = buildCourseSnapshot({
    course: course(),
    outlineFiles: [{ lang: 'th', version: 4, bytes: 318_500, uploadedAt: '2026-09-03T00:00:00.000Z' }],
  });

  assert.equal(
    before.course.course_outline_th.download_url,
    afterSwap.course.course_outline_th.download_url,
    'CONTROL: the path really is identical — that is the whole trap'
  );
  assert.equal(snapshotsEqual(before, afterSwap), false, 'and the snapshot still sees a change');

  // Each of the three discriminators moved.
  assert.notEqual(before.outlineRefs.th.outlineVersion, afterSwap.outlineRefs.th.outlineVersion);
  assert.notEqual(before.outlineRefs.th.bytes, afterSwap.outlineRefs.th.bytes);
  assert.notEqual(before.outlineRefs.th.uploadedAt, afterSwap.outlineRefs.th.uploadedAt);
});

test('CONTROL: WITHOUT the outline refs the two states are indistinguishable', () => {
  // The naive snapshot — the course fields alone — is what a version history
  // would have stored if the trap had not been designed for. It cannot tell
  // them apart, which is why the refs are not optional.
  const naive = (s) => JSON.stringify(s.course);
  const a = buildCourseSnapshot({ course: course(), outlineFiles: [{ lang: 'th', version: 3, bytes: 1 }] });
  const b = buildCourseSnapshot({ course: course(), outlineFiles: [{ lang: 'th', version: 4, bytes: 2 }] });
  assert.equal(naive(a), naive(b), 'the course half alone shows NOTHING');
});

test('the outline ref is a POINTER, not a copy of the CourseOutlineFile row', () => {
  const s = buildCourseSnapshot({
    course: course(),
    outlineFiles: [{
      lang: 'th', version: 4, bytes: 318_500, uploadedAt: '2026-09-03T00:00:00.000Z',
      // Everything below stays where it already lives and must not be duplicated.
      publicId: 'legacy/files/courses/pbi-101-outline-th', legacyPath: '/files/x.pdf',
      contentType: 'application/pdf', uploadedBy: 'Pirasak S.',
    }],
  });
  assert.deepEqual(Object.keys(s.outlineRefs.th).sort(), ['bytes', 'outlineVersion', 'uploadedAt']);
});

test('no file for a language records null rather than a zeroed ref', () => {
  const s = buildCourseSnapshot({ course: course(), outlineFiles: [{ lang: 'th', version: 1 }] });
  assert.equal(s.outlineRefs.en, null);
  assert.ok(s.outlineRefs.th);
});

test('a Date and its ISO string produce the same ref', () => {
  const iso = '2026-09-03T00:00:00.000Z';
  const a = buildCourseSnapshot({ outlineFiles: [{ lang: 'th', version: 1, uploadedAt: new Date(iso) }] });
  const b = buildCourseSnapshot({ outlineFiles: [{ lang: 'th', version: 1, uploadedAt: iso }] });
  assert.equal(snapshotsEqual(a, b), true);
});

// ── the course key ───────────────────────────────────────────────────────────

test('the course key is upper-cased and trimmed, so casing cannot fork a history', () => {
  assert.equal(canonicalCourseKey('  power-bi '), 'POWER-BI');
  assert.equal(canonicalCourseKey('POWER-BI'), 'POWER-BI');
  assert.equal(canonicalCourseKey(null), '');
  assert.equal(canonicalCourseKey(undefined), '');
});

// ── the two kinds, as a vocabulary ───────────────────────────────────────────

test('there are exactly two kinds of row, and they are named not inferred', () => {
  assert.deepEqual([...VERSION_KINDS], ['content', 'file_replacement']);
  assert.equal(VERSION_KIND.CONTENT, 'content');
  assert.equal(VERSION_KIND.FILE_REPLACEMENT, 'file_replacement');
});

test('the four pre-image states are distinct — a create is not a failed read', () => {
  const values = Object.values(PRE_IMAGE);
  assert.equal(new Set(values).size, values.length);
  assert.notEqual(PRE_IMAGE.ABSENT, PRE_IMAGE.UNAVAILABLE);
  assert.deepEqual(values.sort(), ['absent', 'captured', 'skipped', 'unavailable']);
});

test('the kind vocabulary is frozen — a stray push cannot widen it', () => {
  assert.throws(() => { VERSION_KINDS.push('other'); });
  assert.throws(() => { VERSION_KIND.CONTENT = 'x'; });
});
