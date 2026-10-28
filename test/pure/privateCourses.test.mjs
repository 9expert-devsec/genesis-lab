import { test } from 'node:test';
import assert from 'node:assert/strict';

import { courseIdConflict } from '@/lib/courses/courseIdAvailability';
import {
  privateCourseDoc,
  insertPrivateCourse,
  updatePrivateCourseDoc,
  findPrivateCourseCodeInsensitive,
} from '@/lib/courses/privateCourseStore';
import { outlineFromFormValue } from '@/lib/courses/courseOutline';

/**
 * Private courses — the genesis-only store and the course-code rule that now
 * spans three stores (MSDB, course_extensions, private_courses).
 *
 * The fixture is the body `shapePayload` (src/lib/actions/courses.js) returns
 * for a filled-in form — the exact key set, in its shapes: numbers already
 * numbers, flags already booleans, the refs still course_id CODES, both
 * outlines the full 8-key object. That body is what the private actions hand
 * to the store unchanged, so it is what the store is tested against.
 */
function shapedPayload(overrides = {}) {
  return {
    course_name: 'Excel for Finance (Private)',
    course_id: 'acme-xl-01',
    course_teaser: 'teaser',
    course_trainingdays: 2,
    course_traininghours: 12,
    course_levels: '2',
    course_price: 0,
    course_netprice: null,
    course_cover_url: 'https://res.cloudinary.com/x/cover.webp',
    sort_order: 0,
    course_type_public: true,
    course_type_inhouse: true,
    course_workshop_status: true,
    course_certificate_status: false,
    course_promote_status: false,
    program: '6650aa0000000000000000a1',
    skills: ['6650bb0000000000000000b1'],
    previous_course: 'MSE-L1',
    related_courses: ['MSE-L2'],
    course_objectives: ['objective one'],
    course_target_audience: ['finance staff'],
    course_prerequisites: [],
    course_system_requirements: ['Excel 365'],
    training_topics: [{ title: 'Topic', bullets: ['a', 'b'] }],
    course_outline_th: outlineFromFormValue('/files/course-outline/acme-xl-01-course-outline-th.pdf'),
    course_outline_en: outlineFromFormValue(''),
    ...overrides,
  };
}

/** A fake mongoose model that records what the store asked of it. */
function fakeModel({ found = null } = {}) {
  const calls = [];
  const chain = (value) => ({
    select: () => chain(value),
    lean: async () => value,
  });
  return {
    calls,
    create: async (doc) => { calls.push(['create', doc]); return { ...doc, _id: 'p1' }; },
    findOne: (query) => { calls.push(['findOne', query]); return chain(found); },
    findByIdAndUpdate: (id, update, opts) => {
      calls.push(['findByIdAndUpdate', id, update, opts]);
      return chain({ _id: id, ...update.$set });
    },
  };
}

// ── the code rule across all three stores ──────────────────────────────────

test('a code held ONLY by a private course is refused', () => {
  const c = courseIdConflict({ code: 'ACME-XL-01', existingPrivateId: 'ACME-XL-01' });
  assert.equal(c?.field, 'course_id');
  assert.match(c.error, /Private Course/);
});

test('MSDB and extension hits are still refused, and private wins over extension', () => {
  assert.equal(courseIdConflict({ code: 'MSE-L1', existingCourseId: 'MSE-L1' })?.field, 'course_id');
  assert.equal(courseIdConflict({ code: 'GONE-01', existingExtensionId: 'GONE-01' })?.field, 'course_id');
  // A private course normally has an extension row too; the message must
  // name what the code actually belongs to.
  const both = courseIdConflict({ code: 'ACME', existingExtensionId: 'ACME', existingPrivateId: 'ACME' });
  assert.match(both.error, /Private Course/);
  assert.equal(courseIdConflict({ code: 'BRAND-NEW' }), null, 'CONTROL: a free code is free');
});

test('the private lookup is case-insensitive, anchored and escaped', async () => {
  const model = fakeModel({ found: { course_id: 'ACME.XL' } });
  const hit = await findPrivateCourseCodeInsensitive('acme.xl', { model });
  assert.equal(hit, 'ACME.XL', 'returns the STORED spelling');
  const [, query] = model.calls[0];
  assert.equal(query.course_id.$options, 'i');
  assert.equal(query.course_id.$regex, '^acme\\.xl$', '`.` is escaped and the match is anchored');
  assert.equal(await findPrivateCourseCodeInsensitive('  ', { model }), null, 'blank → no lookup');
  assert.equal(model.calls.length, 1);
});

// ── the store ──────────────────────────────────────────────────────────────

test('course_id is stored UPPERCASE; the rest of the shaped body is stored as given', async () => {
  const model = fakeModel();
  const body = shapedPayload();
  const saved = await insertPrivateCourse(body, { model });
  const [, doc] = model.calls[0];
  assert.equal(doc.course_id, 'ACME-XL-01');
  assert.deepEqual({ ...doc, course_id: body.course_id }, body, 'no other key added, dropped or changed');
  assert.equal(Object.keys(doc.course_outline_th).length, 8, 'the full 8-key outline object');
  assert.equal(saved._id, 'p1');
  assert.equal(privateCourseDoc({ course_id: ' x-1 ' }).course_id, 'X-1');
});

test('an update never changes course_id — the extension row is keyed by it', async () => {
  const model = fakeModel();
  await updatePrivateCourseDoc('p1', shapedPayload({ course_id: 'SOMETHING-ELSE' }), { model });
  const [, id, update] = model.calls[0];
  assert.equal(id, 'p1');
  assert.ok(!('course_id' in update.$set), 'course_id is not in the $set');
  assert.equal(update.$set.course_name, 'Excel for Finance (Private)');
});
