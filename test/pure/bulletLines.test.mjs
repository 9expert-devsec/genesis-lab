import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBulletLines,
  formatBulletLines,
  isBulletMarkerKind,
  numberLabel,
  BULLET_MARKER_KINDS,
} from '@/lib/courses/bulletLines';

/**
 * The round trip for section 6's four fields, started from the RAW API SHAPE.
 *
 * ── WHY THE FIXTURES ARE ARRAYS AND NOT TEXT ────────────────────────────────
 * MSDB stores each of these as an array of strings — measured across all 78
 * courses, 1118 items, 100% arrays, no newline-delimited text, no HTML, no
 * second shape. The training_topics defect happened because a test started one
 * step downstream of the real shape, so the defective mapping never executed
 * and the suite stayed green while the editor overwrote good data. These
 * fixtures are therefore the shape the API actually returns.
 *
 * Every case below is REAL DATA, copied from the live catalogue, except where
 * marked as a deliberately constructed edge.
 */

/** Verbatim from the live API. */
const REAL = {
  course_objectives: [
    'ออกแบบและพัฒนา AI Workflow ตั้งแต่เริ่มต้น ช่วยงานอัตโนมัติได้ ทำงานได้ 24/7',
  ],
  course_target_audience: [
    'ผู้ที่ต้องการเริ่มต้นใช้งาน Power BI',
    'นักวิเคราะห์ข้อมูล',
  ],
  course_prerequisites: [
    'ควรมีพื้นฐานการใช้งาน Microsoft 365, Power Platform หรือ Power Automate เบื้องต้น',
  ],
  course_system_requirements: [
    '1.3GHz or faster core speed',
    '8GB RAM or more',
    'License: Microsoft 365 Copilot Studio',
    'Google Workspace (Gmail, Calendar, Drive) หรือ Microsoft 365 (Outlook, Calendar, OneDrive)',
  ],
};

/** stored array → textarea text → payload array. The whole contract. */
function roundTrip(items) {
  return parseBulletLines(formatBulletLines(items));
}

for (const [field, items] of Object.entries(REAL)) {
  test(`${field}: real stored value round-trips byte-for-byte`, () => {
    assert.deepEqual(
      roundTrip(items),
      items,
      'the value that comes back is not the value that went in',
    );
  });
}

/**
 * THE ONE THAT MATTERS MOST. "1.3GHz" begins with a digit and a dot; "24/7",
 * "Microsoft 365" and the parenthesised list all carry digits and punctuation
 * inside the text. Any "strip the leading marker" logic added later eats these.
 *
 * Measured: those three "1.3GHz or faster core speed" rows were the ONLY items
 * in all 1118 that a naive leading-number regex matched, and every one is a
 * hardware spec, not a list marker.
 */
test('items whose TEXT contains digits, dots or dashes survive untouched', () => {
  const tricky = [
    '1.3GHz or faster core speed',
    '4 GB RAM (8 GB Recommended)',
    '50 GB free disk space',
    'ทำงานได้ 24/7',
    'Power BI - ระดับเริ่มต้น',
    'Windows 10 / 11',
  ];
  assert.deepEqual(roundTrip(tricky), tricky);
});

test('a single-item field round-trips', () => {
  assert.deepEqual(roundTrip(['เพียงข้อเดียว']), ['เพียงข้อเดียว']);
});

test('an empty field yields [] — the key is still sent, never undefined', () => {
  assert.deepEqual(roundTrip([]), []);
  assert.equal(formatBulletLines([]), '');
  assert.deepEqual(parseBulletLines(''), []);

  // The absent-key cases `linesOf` also has to survive.
  assert.deepEqual(parseBulletLines(null), []);
  assert.deepEqual(parseBulletLines(undefined), []);
  assert.equal(formatBulletLines(null), '');
  assert.equal(formatBulletLines(undefined), '');
});

/**
 * `parseBulletLines` must agree with `linesOf` (lib/actions/courses.js:184) —
 * split '\n', trim, drop empties. Pinned by re-implementing linesOf here: if
 * the two ever diverge the editor's item count and preview stop describing the
 * payload.
 */
test('parseBulletLines matches linesOf exactly, including its lossy edges', () => {
  const linesOf = (raw) => String(raw ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

  const samples = [
    'a\nb\nc',
    '  padded  \n\n  another  ',
    'one',
    '',
    '\n\n\n',
    'trailing\n',
    'ทำงานได้ 24/7\nPower BI - ระดับเริ่มต้น',
  ];
  for (const s of samples) {
    assert.deepEqual(parseBulletLines(s), linesOf(s), `disagreed on ${JSON.stringify(s)}`);
  }
});

/**
 * These two are lossy, they were lossy before this module existed, and NEITHER
 * occurs in the live data — 0 of 1118 items has padding, 0 contains a newline.
 * Recorded so the byte-for-byte claim above is scoped rather than absolute.
 */
test('KNOWN LOSSY, and absent from the real data: padding and embedded newlines', () => {
  assert.deepEqual(roundTrip(['  padded  ']), ['padded'], 'padding is trimmed by linesOf');
  assert.deepEqual(roundTrip(['two\nlines']), ['two', 'lines'], 'a newline splits the item');
});

test('non-string members are dropped rather than stringified', () => {
  assert.equal(formatBulletLines(['ok', null, undefined, 42, {}]), 'ok');
});

test('a bare string value is tolerated, matching the public toArray', () => {
  assert.equal(formatBulletLines('just one'), 'just one');
  assert.deepEqual(roundTrip('just one'), ['just one']);
});

/**
 * MARKERS ARE PRESENTATION. The public page draws its own from the index
 * (CourseObjectives.jsx:12) or as an icon; zero of the 1118 stored items
 * carries one. Nothing in this module may put one into a value.
 */
test('numberLabel matches the public page, and is never part of the value', () => {
  assert.equal(numberLabel(0), '1.');
  assert.equal(numberLabel(4), '5.');

  const items = ['first', 'second'];
  assert.deepEqual(roundTrip(items), items);
  assert.ok(
    !formatBulletLines(items).includes('1.'),
    'a marker leaked into the textarea text',
  );
});

test('the marker vocabulary is exactly the two the public page uses', () => {
  assert.deepEqual([...BULLET_MARKER_KINDS], ['number', 'check']);
  assert.equal(isBulletMarkerKind('number'), true);
  assert.equal(isBulletMarkerKind('check'), true);
  assert.equal(isBulletMarkerKind('bullet'), false);
  assert.equal(isBulletMarkerKind(null), false);
  assert.equal(isBulletMarkerKind(undefined), false);
});
