import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onlineCourseInstructors } from '@/lib/onlineCourseInstructors';

/**
 * The instructor resolver for the online-course card.
 *
 * ── THE EMPTY CASE IS THE PRODUCTION CASE, SO IT IS TESTED FIRST ───────────
 * `o_course_instructor_name` does not exist on any of the 22 upstream rows
 * (measured 2026-08-31, docs/audit/online-course-card-fields.md). Every call in
 * production returns `[]` until somebody fills the field in. A resolver that
 * returned `[{}]`, `[{name: undefined}]` or `null` for that input would put a
 * blank avatar on every card on the home page, so the shape of the empty answer
 * matters more here than the shape of the populated one.
 */

const NAME = 'อ.ชไลเวท พิพัฒพรรณวงศ์';
const IMAGE = 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1/instr.png';

/** A realistic feed row WITHOUT the new fields — i.e. every row today. */
const TODAY = {
  o_course_id: 'ONL-MSE-L2',
  o_course_name: 'Microsoft Excel Advanced',
  o_course_price: 1990,
  o_number_lessons: 13,
  website_urls: ['https://academy.9experttraining.com/courses/mse-l2'],
  skills: [{ _id: 'a', skill_id: 'AI', skill_name: 'AI' }],
};

// ── the empty answer ───────────────────────────────────────────────────────

test('a real feed row as it exists TODAY resolves to no instructors', () => {
  const got = onlineCourseInstructors(TODAY);
  assert.deepEqual(got, []);
  assert.ok(Array.isArray(got), 'must be an array, never null');
});

test('CONTROL: the same row WITH the field populated does resolve — so the empty answer above is about the data, not a broken reader', () => {
  const got = onlineCourseInstructors({ ...TODAY, o_course_instructor_name: NAME });
  assert.equal(got.length, 1);
  assert.equal(got[0].name, NAME);
});

test('unusable inputs all return [] rather than null or a partial entry', () => {
  for (const input of [null, undefined, '', 0, false, [], 'ONL-MSE-L2', 42]) {
    const got = onlineCourseInstructors(input);
    assert.deepEqual(got, [], `input ${JSON.stringify(input)}`);
  }
});

// ── the flat pair, by exact spelling ───────────────────────────────────────

test('the flat pair resolves to one entry carrying both halves', () => {
  assert.deepEqual(
    onlineCourseInstructors({
      ...TODAY,
      o_course_instructor_name: NAME,
      o_course_instructor_image_url: IMAGE,
    }),
    [{ name: NAME, imageUrl: IMAGE }]
  );
});

test('a name with NO image is a valid instructor and survives', () => {
  const got = onlineCourseInstructors({ ...TODAY, o_course_instructor_name: NAME });
  assert.equal(got.length, 1);
  assert.equal(got[0].name, NAME);
  assert.equal(got[0].imageUrl, null, 'null, not "" and not a placeholder path');
});

test('an image with NO name is dropped — an unattributed face is not an instructor', () => {
  assert.deepEqual(
    onlineCourseInstructors({ ...TODAY, o_course_instructor_image_url: IMAGE }),
    []
  );
});

test('whitespace is not a name, and is not an image either', () => {
  assert.deepEqual(
    onlineCourseInstructors({
      ...TODAY,
      o_course_instructor_name: '   ',
      o_course_instructor_image_url: IMAGE,
    }),
    []
  );
  assert.deepEqual(
    onlineCourseInstructors({
      ...TODAY,
      o_course_instructor_name: `  ${NAME}  `,
      o_course_instructor_image_url: '   ',
    }),
    [{ name: NAME, imageUrl: null }]
  );
});

test('a non-string name is not coerced — a number is not a person', () => {
  for (const bad of [42, true, {}, [], { name: NAME }]) {
    assert.deepEqual(
      onlineCourseInstructors({ ...TODAY, o_course_instructor_name: bad }),
      [],
      `name ${JSON.stringify(bad)}`
    );
  }
});

// ── the future array shape ─────────────────────────────────────────────────

test('the future array shape resolves, so the upstream change costs this file only', () => {
  assert.deepEqual(
    onlineCourseInstructors({
      ...TODAY,
      o_course_instructors: [
        { name: NAME, image_url: IMAGE },
        { name: 'Natdhanai Praneenatthavee' },
      ],
    }),
    [
      { name: NAME, imageUrl: IMAGE },
      { name: 'Natdhanai Praneenatthavee', imageUrl: null },
    ]
  );
});

test('the array shape keeps ORDER — a co-taught course lists its lead first', () => {
  const got = onlineCourseInstructors({
    ...TODAY,
    o_course_instructors: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
  });
  assert.deepEqual(got.map((i) => i.name), ['A', 'B', 'C']);
});

test('nameless entries are dropped from the array without dropping their neighbours', () => {
  const got = onlineCourseInstructors({
    ...TODAY,
    o_course_instructors: [{ image_url: IMAGE }, { name: 'B' }, null, 'C', {}],
  });
  assert.deepEqual(got, [
    { name: 'B', imageUrl: null },
    { name: 'C', imageUrl: null },
  ]);
});

test('alternate key spellings on an array entry are accepted', () => {
  const got = onlineCourseInstructors({
    ...TODAY,
    o_course_instructors: [
      { instructor_name: 'A', instructor_image_url: IMAGE },
      { name_th: 'B', imageUrl: IMAGE },
      { o_course_instructor_name: 'C', o_course_instructor_image_url: IMAGE },
    ],
  });
  assert.deepEqual(got.map((i) => i.name), ['A', 'B', 'C']);
  assert.ok(got.every((i) => i.imageUrl === IMAGE));
});

test('the array WINS over a flat pair sitting beside it', () => {
  const got = onlineCourseInstructors({
    ...TODAY,
    o_course_instructor_name: 'flat',
    o_course_instructors: [{ name: 'array' }],
  });
  assert.deepEqual(got.map((i) => i.name), ['array']);
});

test('an EMPTY or unusable array falls through to the flat pair rather than suppressing it', () => {
  for (const list of [[], [null], [{}], [{ image_url: IMAGE }], ['  ']]) {
    assert.deepEqual(
      onlineCourseInstructors({
        ...TODAY,
        o_course_instructor_name: NAME,
        o_course_instructors: list,
      }),
      [{ name: NAME, imageUrl: null }],
      `list ${JSON.stringify(list)}`
    );
  }
});

test('a non-array under the array key is ignored, not thrown on', () => {
  for (const junk of ['x', 42, {}, true]) {
    assert.deepEqual(
      onlineCourseInstructors({
        ...TODAY,
        o_course_instructor_name: NAME,
        o_course_instructors: junk,
      }),
      [{ name: NAME, imageUrl: null }],
      `junk ${JSON.stringify(junk)}`
    );
  }
});

// ── purity ─────────────────────────────────────────────────────────────────

test('the input course object is never mutated', () => {
  const course = {
    ...TODAY,
    o_course_instructor_name: NAME,
    o_course_instructor_image_url: IMAGE,
  };
  const before = JSON.stringify(course);
  onlineCourseInstructors(course);
  assert.equal(JSON.stringify(course), before);
});

test('every returned entry has exactly the two documented keys', () => {
  const got = onlineCourseInstructors({
    ...TODAY,
    o_course_instructors: [{ name: 'A', image_url: IMAGE, bio: 'ignored', _id: 'x' }],
  });
  assert.deepEqual(Object.keys(got[0]).sort(), ['imageUrl', 'name']);
});
