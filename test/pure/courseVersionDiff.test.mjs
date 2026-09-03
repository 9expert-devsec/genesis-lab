import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_KIND,
  COURSE_FIELDS,
  EXTENSION_FIELDS,
  OUTLINE_REF_FIELDS,
  isBlank,
  valuesEqual,
  diffSnapshots,
  summariseChanges,
  SUMMARY_LABEL_LIMIT,
  VERSION_PAGE_SIZE,
} from '@/lib/courses/courseVersionDiff';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { COURSE_SECTION_LABELS } from '@/lib/courseSectionNav';

/**
 * THE DIFF ENGINE, and above all its EQUALITY RULE.
 *
 * ── WHY THE NEAR-MISSES GET THEIR OWN SECTION ──────────────────────────────
 * A diff shown for a field the admin never touched destroys trust in the whole
 * feature faster than a missing one does. A missing diff is a gap; a false one
 * is a liar, and after the second false positive nobody opens the tab again.
 *
 * The obvious implementation — `JSON.stringify(a) === JSON.stringify(b)` — is
 * wrong three separate ways, each of which really occurs in this data, and each
 * has a case below aimed at it directly rather than being covered incidentally.
 */

const snap = (over = {}) => ({
  course: {
    course_name: 'Power BI',
    course_price: 12900,
    course_teaser: 'สรุปสั้น',
    course_objectives: ['ข้อ 1', 'ข้อ 2'],
    training_topics: [{ title: 'บทที่ 1', bullets: ['ก', 'ข'] }],
    course_type_public: true,
    ...over.course,
  },
  extension: {
    descriptionRich: '<p>คำอธิบายยาว</p>',
    metaTitle: 'Power BI',
    ...over.extension,
  },
  outlineRefs: { th: null, en: null, ...over.outlineRefs },
});

// ── V9 / APPROVAL 3 — the near-miss cases, one per failure mode ─────────────

test('V9 near-miss: REORDERED OBJECT KEYS are not a change', () => {
  // A document read back from Mongo does not promise the key order of one built
  // in memory. Under string equality every field on every save would "change".
  const a = { course: { course_name: 'X', course_price: 1 }, extension: null, outlineRefs: {} };
  const b = { outlineRefs: {}, extension: null, course: { course_price: 1, course_name: 'X' } };

  assert.notEqual(JSON.stringify(a), JSON.stringify(b),
    'CONTROL: these really do serialise differently — that is the trap');
  assert.deepEqual(diffSnapshots(a, b), [], 'and the diff sees no change');
});

test('V9 near-miss: "" and null and undefined are ONE state', () => {
  assert.equal(valuesEqual('', null), true);
  assert.equal(valuesEqual(null, undefined), true);
  assert.equal(valuesEqual('', undefined), true);

  const before = snap({ extension: { metaTitle: '' } });
  const after = snap({ extension: { metaTitle: null } });
  assert.deepEqual(diffSnapshots(before, after), []);
});

test('V9 near-miss: TRAILING AND LEADING WHITESPACE is not a change', () => {
  assert.equal(valuesEqual('Power BI', 'Power BI  '), true);
  assert.equal(valuesEqual('  Power BI\n', 'Power BI'), true);
  // CRLF folded too — a value round-tripped through a textarea on Windows.
  assert.equal(valuesEqual('a\r\nb', 'a\nb'), true);

  const before = snap({ course: { course_name: 'Power BI' } });
  const after = snap({ course: { course_name: '  Power BI\n' } });
  assert.deepEqual(diffSnapshots(before, after), []);
});

test('CONTROL: each near-miss rule still catches a REAL edit', () => {
  // Without these the three rules above could be satisfied by an equality
  // function that returns true for everything.
  assert.equal(valuesEqual('Power BI', 'Power BI Advanced'), false);
  assert.equal(valuesEqual('', 'x'), false);
  assert.equal(valuesEqual('a b', 'a  b'), false, 'INTERIOR whitespace is content');
});

test('a number and its string spelling agree — the form posts strings', () => {
  assert.equal(valuesEqual(7500, '7500'), true);
  assert.equal(valuesEqual(7500, '7501'), false);
});

test('0 and false and [] are NOT blank — folding them would hide a real edit', () => {
  assert.equal(isBlank(0), false);
  assert.equal(isBlank(false), false);
  assert.equal(isBlank([]), false);
  // A price cleared to null is not a price of 0.
  assert.equal(valuesEqual(0, null), false);
  // An unchecked box is not an absent one.
  assert.equal(valuesEqual(false, null), false);
  // An emptied list is a real edit.
  assert.equal(valuesEqual([], null), false);
});

test('ARRAY ORDER is content and is never sorted away', () => {
  // The objectives render in stored order and the public page numbers them.
  // Moving item 2 above item 1 IS an edit, unlike an object key moving.
  assert.equal(valuesEqual(['a', 'b'], ['b', 'a']), false);
  assert.equal(valuesEqual(['a', 'b'], ['a', 'b']), true);
});

test('nested objects compare semantically too', () => {
  assert.equal(
    valuesEqual({ title: 'ก', bullets: ['x'] }, { bullets: ['x'], title: 'ก' }),
    true
  );
  assert.equal(
    valuesEqual({ title: 'ก', bullets: ['x'] }, { title: 'ก', bullets: ['y'] }),
    false
  );
  // A key that is blank on both sides does not make two objects differ.
  assert.equal(valuesEqual({ a: 'x', b: '' }, { a: 'x' }), true);
});

// ── V3 — a real-shaped pair: short changed, long changed, one unchanged ─────

test('V3: a short field, a long rich field, and an unchanged field', () => {
  const before = snap();
  const after = snap({
    course: { course_name: 'Power BI Advanced' },                 // short: changed
    extension: { descriptionRich: '<p>เขียนใหม่ทั้งหมด</p>' },      // rich: changed
    // course_price is untouched in both.
  });

  const changes = diffSnapshots(before, after);
  const keys = changes.map((c) => c.key);

  assert.ok(keys.includes('course_name'), 'the short change is missing');
  assert.ok(keys.includes('descriptionRich'), 'the rich change is missing');
  assert.equal(
    keys.includes('course_price'), false,
    'THE UNCHANGED FIELD APPEARS — a wall of unchanged rows is what makes a diff unreadable'
  );
  assert.equal(changes.length, 2, `expected exactly 2 changes, got ${keys.join(', ')}`);

  const rich = changes.find((c) => c.key === 'descriptionRich');
  assert.equal(rich.kind, FIELD_KIND.RICH, 'the long field must render stacked, not inline');
  assert.equal(rich.before, '<p>คำอธิบายยาว</p>');
  assert.equal(rich.after, '<p>เขียนใหม่ทั้งหมด</p>');

  const short = changes.find((c) => c.key === 'course_name');
  assert.equal(short.kind, FIELD_KIND.TEXT);
});

test('V3: only changed fields are returned, over a snapshot with many fields', () => {
  const before = snap();
  const after = snap({ course: { course_price: 15900 } });
  const changes = diffSnapshots(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].key, 'course_price');
  assert.equal(changes[0].kind, FIELD_KIND.NUMBER);
});

test('an identical pair produces NO changes at all', () => {
  assert.deepEqual(diffSnapshots(snap(), snap()), []);
});

test('changes come back in the form reading order, not key order', () => {
  const before = snap();
  const after = snap({
    extension: { metaTitle: 'ใหม่' },        // order 81
    course: { course_name: 'ใหม่' },          // order 10
  });
  const changes = diffSnapshots(before, after);
  assert.deepEqual(changes.map((c) => c.key), ['course_name', 'metaTitle']);
});

// ── the labels are the admin's, not the database's ──────────────────────────

test('every rendered field carries a Thai label, never a raw database key', () => {
  for (const [key, meta] of Object.entries({ ...COURSE_FIELDS, ...EXTENSION_FIELDS, ...OUTLINE_REF_FIELDS })) {
    assert.ok(meta.label && meta.label.length > 0, `${key} has no label`);
    assert.notEqual(meta.label, key, `${key} is labelled with its own database key`);
    assert.ok(Number.isFinite(meta.order), `${key} has no reading order`);
    assert.ok(Object.values(FIELD_KIND).includes(meta.kind), `${key} has an unknown render kind`);
  }
});

test('the shared section names come from COURSE_SECTION_LABELS, not a second copy', () => {
  // A second set of names for one concept is how the form and this surface
  // would come to call the same section different things.
  assert.equal(COURSE_FIELDS.training_topics.label, COURSE_SECTION_LABELS.outline);
  assert.equal(COURSE_FIELDS.course_objectives.label, COURSE_SECTION_LABELS.objective);
  assert.equal(COURSE_FIELDS.related_courses.label, COURSE_SECTION_LABELS.related);
  assert.ok(EXTENSION_FIELDS.descriptionRich.label.startsWith(COURSE_SECTION_LABELS.description));
});

test('a key with no label is SKIPPED rather than rendered raw', () => {
  const before = { course: { unknown_future_field: 'a' }, extension: null, outlineRefs: {} };
  const after = { course: { unknown_future_field: 'b' }, extension: null, outlineRefs: {} };
  assert.deepEqual(diffSnapshots(before, after), [],
    'an unlabelled key reached the UI — a raw database key is indistinguishable from a bug');
});

// ── the outline refs: the trap, at diff level ──────────────────────────────

test('a replaced outline shows as a change even though the path is identical', () => {
  const before = snap({ outlineRefs: { th: { outlineVersion: 3, bytes: 240000, uploadedAt: '2026-09-01T00:00:00.000Z' } } });
  const after = snap({ outlineRefs: { th: { outlineVersion: 4, bytes: 318500, uploadedAt: '2026-09-03T00:00:00.000Z' } } });

  const changes = diffSnapshots(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].key, 'outline.th');
  assert.match(changes[0].label, /ภาษาไทย/);
});

// ── the list summary ────────────────────────────────────────────────────────

test('the summary names the fields, and caps with a +N rather than a count alone', () => {
  const changes = [
    { label: 'ราคา' }, { label: 'ชื่อหลักสูตร' }, { label: 'Meta Title' }, { label: 'Tags' },
  ];
  const s = summariseChanges(changes);
  assert.match(s, /ราคา/);
  assert.match(s, /\+1$/, 'the overflow is not marked');
  assert.equal(s.split(',').length, SUMMARY_LABEL_LIMIT);
});

test('a summary of nothing is empty, not "0 fields"', () => {
  assert.equal(summariseChanges([]), '');
  assert.equal(summariseChanges(null), '');
  assert.equal(summariseChanges(undefined), '');
});

test('a summary at exactly the limit carries no +N', () => {
  const s = summariseChanges([{ label: 'ก' }, { label: 'ข' }, { label: 'ค' }]);
  assert.equal(s, 'ก, ข, ค');
});

// ── the page size ───────────────────────────────────────────────────────────

test('the page size lives OUTSIDE the use-server module, and matches the page-builder', () => {
  // A plain `export const` in a 'use server' file is a build error, not a style
  // preference — every export of such a module must be an async function.
  assert.equal(VERSION_PAGE_SIZE, 20);
});

// ── a null snapshot is not a comparison ─────────────────────────────────────

test('diffing against nothing returns nothing, rather than "everything changed"', () => {
  // The first version of a course has no predecessor. The ACTION decides what
  // to say about that; the differ must not invent a change per field.
  assert.deepEqual(diffSnapshots(null, snap()), []);
  assert.deepEqual(diffSnapshots(snap(), null), []);
  assert.deepEqual(diffSnapshots(null, null), []);
});
