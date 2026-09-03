import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { VersionDetail, versionTitle } from '@/app/admin/courses/_components/CourseVersionHistory';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { FIELD_KIND } from '@/lib/courses/courseVersionDiff';

/**
 * The history panel's DETAIL body — the three things it can say, and the fact
 * that they are mutually exclusive.
 *
 * ══ NO ROW OF THESE SHAPES HAS EVER EXISTED ════════════════════════════════
 *
 * Read from the real `course_versions` collection while this was built: 2 rows,
 * 1 course, both `content`, both numbered, none flagged. There has never been a
 * `file_replacement` row, never a null `versionNumber`, and never a
 * `preImageMissing: true`.
 *
 * So everything below is driven by SYNTHETIC FIXTURES and none of it is
 * "verified against production data". That is not a hedge, it is the argument
 * for the tests: these shapes are rare, which means the UI will meet each of
 * them for the FIRST time in production, in front of an admin, with nobody
 * watching. A shape that is never exercised until then is a shape that has
 * never been exercised.
 *
 * `VersionDetail` is exported for this reason — the panel around it fetches in
 * a `useEffect`, which `renderToStaticMarkup` never runs, so the body is driven
 * directly with the data the action would have returned.
 */

const render = (data) => renderToStaticMarkup(createElement(VersionDetail, { data }));

// ── V5 — a file replacement is an EVENT, never a diff ───────────────────────

test('V5: a file_replacement renders as an event, with the values that make it visible', () => {
  const html = render({
    kind: 'file_replacement',
    file: {
      field: 'course_outline_th', lang: 'th', filename: 'power-bi-outline-th.pdf',
      publicPath: '/files/courses/power-bi-outline-th.pdf',
      bytes: 318500, uploadedAt: '2026-09-03T04:00:00.000Z', outlineVersion: 4,
    },
    changes: [],
    previousMissing: false,
  });

  assert.match(html, /แทนที่ไฟล์/, 'it does not announce itself as a replacement');
  assert.match(html, /power-bi-outline-th\.pdf/, 'the filename is missing');
  assert.match(html, /311\.0 KB|318500/, 'the byte size is missing — it is what makes the change visible');
  assert.match(html, /TH/, 'the language is missing');
  assert.match(html, /4/, 'the file version counter is missing');
});

test('V5: a file_replacement is never fed to the diff renderer', () => {
  // The diff blocks are recognisable by their ก่อน/หลัง headings and the arrow.
  // None may appear: the stored path is byte-identical before and after, so a
  // comparison would render two identical values as if something moved.
  const html = render({
    kind: 'file_replacement',
    file: { lang: 'en', filename: 'x.pdf', bytes: 10, uploadedAt: null, outlineVersion: 1 },
    changes: [],
    previousMissing: false,
  });
  assert.doesNotMatch(html, /→/, 'a diff arrow reached a file event');
  assert.doesNotMatch(html, /เปลี่ยนแปลง \d+ ฟิลด์/, 'it claims a field count');
});

test('V5: the file event says the old bytes are gone, so nobody looks for them', () => {
  const html = render({
    kind: 'file_replacement',
    file: { lang: 'th', filename: 'x.pdf', bytes: 1, uploadedAt: null, outlineVersion: 2 },
    changes: [], previousMissing: false,
  });
  assert.match(html, /ไม่ได้เก็บไฟล์เวอร์ชันก่อนหน้าไว้/);
});

test('CONTROL: a content row DOES produce diff markup — the V5 checks are not vacuous', () => {
  const html = render({
    kind: 'content', file: null, preImageMissing: false, previousMissing: false,
    previousVersionNumber: 1,
    changes: [{ key: 'course_price', label: 'ราคา', kind: FIELD_KIND.NUMBER, order: 23, before: 12900, after: 15900 }],
  });
  assert.match(html, /→/, 'the arrow is not rendered at all, so its absence above proved nothing');
  assert.match(html, /เปลี่ยนแปลง 1 ฟิลด์/);
});

// ── V4 — the three shapes B6 named ──────────────────────────────────────────

test('V4: preImageMissing says the previous state was never captured, and shows no diff', () => {
  const html = render({
    kind: 'content', file: null,
    preImageMissing: true,
    previousMissing: true,
    changes: [],
  });
  assert.match(html, /ไม่ได้บันทึกสถานะก่อนหน้า/, 'it does not explain the missing pre-image');
  assert.match(html, /การบันทึกครั้งนั้นสำเร็จตามปกติ/, 'it reads as though the save failed');
  assert.doesNotMatch(html, /→/, 'it rendered a diff against nothing');
});

test('V4: the FIRST version says so, rather than claiming nothing changed', () => {
  const html = render({
    kind: 'content', file: null, preImageMissing: false,
    previousMissing: true,
    changes: [],
  });
  assert.match(html, /เวอร์ชันแรก/, 'the first version does not identify itself');
  assert.doesNotMatch(html, /ไม่ได้บันทึกสถานะก่อนหน้า/,
    'a first version is NOT a failed pre-image read — they must not read alike');
  assert.doesNotMatch(html, /→/);
});

test('V4: preImageMissing and previousMissing are told apart, not merged', () => {
  // Both arrive with previousMissing true. If the panel keyed only on that, a
  // failed read would be reported as "this is the first version" — which is a
  // false reassurance about a real gap in the record.
  const failed = render({ kind: 'content', preImageMissing: true, previousMissing: true, changes: [] });
  const first = render({ kind: 'content', preImageMissing: false, previousMissing: true, changes: [] });
  assert.notEqual(failed, first, 'the two states render identically');
});

test('V4: a null versionNumber is named by kind, never by a placeholder', () => {
  // The concurrency fallback. A row that could not win a number is still a real
  // version; "เวอร์ชัน —" would read as a rendering bug.
  assert.equal(versionTitle({ kind: 'content', versionNumber: null }), 'เวอร์ชัน (ไม่มีหมายเลข)');
  assert.equal(versionTitle({ kind: 'content', versionNumber: undefined }), 'เวอร์ชัน (ไม่มีหมายเลข)');
  assert.equal(versionTitle({ kind: 'content', versionNumber: 7 }), 'เวอร์ชัน 7');
  assert.equal(versionTitle({ kind: 'file_replacement', versionNumber: null }), 'แทนที่ไฟล์');
});

test('V4: an unnumbered predecessor does not print "เทียบกับเวอร์ชัน null"', () => {
  const html = render({
    kind: 'content', file: null, preImageMissing: false, previousMissing: false,
    previousVersionNumber: null,
    changes: [{ key: 'course_price', label: 'ราคา', kind: FIELD_KIND.NUMBER, order: 23, before: 1, after: 2 }],
  });
  assert.doesNotMatch(html, /null/);
  assert.doesNotMatch(html, /เทียบกับเวอร์ชัน/, 'it names a version number it does not have');
  assert.match(html, /เปลี่ยนแปลง 1 ฟิลด์/, 'but it still reports the change count');
});

// ── V3 at render level — long text stays readable, unchanged fields absent ──

test('V3: a long rich-text change renders stacked with both sides in full', () => {
  const long = '<p>' + 'ก'.repeat(400) + '</p>';
  const html = render({
    kind: 'content', file: null, preImageMissing: false, previousMissing: false,
    previousVersionNumber: 3,
    changes: [{
      key: 'descriptionRich', label: 'รายละเอียดหลักสูตร (รูปแบบ Rich text)',
      kind: FIELD_KIND.RICH, order: 14, before: '<p>เดิม</p>', after: long,
    }],
  });

  assert.match(html, /ก่อน/, 'the stacked layout labels are missing');
  assert.match(html, /หลัง/);
  assert.match(html, /ก{400}/, 'the long value was truncated — this tab took the full width to avoid that');
  assert.match(html, /whitespace-pre-wrap/, 'long text is not wrapping');
});

test('rich text is shown as stored markup, never executed as HTML', () => {
  const html = render({
    kind: 'content', file: null, preImageMissing: false, previousMissing: false,
    changes: [{ key: 'descriptionRich', label: 'x', kind: FIELD_KIND.RICH, order: 14, before: '', after: '<script>alert(1)</script>' }],
  });
  assert.doesNotMatch(html, /<script>alert/, 'admin-authored markup was rendered live inside the admin');
  assert.match(html, /&lt;script&gt;/, 'the stored markup is not shown as text either');
});

test('an empty side reads as (ว่าง), not as a blank gap', () => {
  const html = render({
    kind: 'content', file: null, preImageMissing: false, previousMissing: false,
    changes: [{ key: 'metaTitle', label: 'Meta Title', kind: FIELD_KIND.TEXT, order: 81, before: null, after: 'ใหม่' }],
  });
  assert.match(html, /\(ว่าง\)/, 'an empty previous value renders as nothing at all');
});

test('a list field shows its lines, not just a count', () => {
  const html = render({
    kind: 'content', file: null, preImageMissing: false, previousMissing: false,
    changes: [{
      key: 'course_objectives', label: 'วัตถุประสงค์', kind: FIELD_KIND.LIST, order: 50,
      before: ['เดิมหนึ่ง', 'เดิมสอง'], after: ['ใหม่หนึ่ง'],
    }],
  });
  assert.match(html, /เดิมสอง/, 'the removed line is not shown — a count cannot say WHICH line went');
  assert.match(html, /ใหม่หนึ่ง/);
});

test('training topics render titles AND bullet bodies', () => {
  const html = render({
    kind: 'content', file: null, preImageMissing: false, previousMissing: false,
    changes: [{
      key: 'training_topics', label: 'หัวข้อการฝึกอบรม', kind: FIELD_KIND.TOPICS, order: 60,
      before: [{ title: 'บทที่ 1', bullets: ['เดิม ก'] }],
      after: [{ title: 'บทที่ 1', bullets: ['ใหม่ ก', 'ใหม่ ข'] }],
    }],
  });
  assert.match(html, /บทที่ 1/);
  assert.match(html, /เดิม ก/, 'the old bullet body is missing — it is the thing the audit log cannot hold');
  assert.match(html, /ใหม่ ข/);
});

test('booleans read as เปิด/ปิด, not true/false', () => {
  const html = render({
    kind: 'content', file: null, preImageMissing: false, previousMissing: false,
    changes: [{ key: 'isPublished', label: 'เผยแพร่บนเว็บสาธารณะ', kind: FIELD_KIND.BOOL, order: 85, before: true, after: false }],
  });
  assert.match(html, /เปิด/);
  assert.match(html, /ปิด/);
  assert.doesNotMatch(html, /true|false/);
});

test('a content row with no changes says so plainly', () => {
  const html = render({
    kind: 'content', file: null, preImageMissing: false, previousMissing: false, changes: [],
  });
  assert.match(html, /ไม่พบความแตกต่าง/);
  assert.doesNotMatch(html, /เวอร์ชันแรก/, 'it must not be confused with the first version');
});
