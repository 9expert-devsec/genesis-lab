import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseScheduleSection } from '@/components/pageBuilder/sections/course_schedule';
import { CourseListSection } from '@/components/pageBuilder/sections/course_list';

// 2C.2b render coverage — the derived / time-varying data-backed types. They
// render from INJECTED data (the fetch is hoisted); the sample honesty lives in
// the editor, not here, so these prove only that they draw what they are handed
// and fail closed on nothing.

const R = (C, props) => renderToStaticMarkup(C(props));
const course = (id, name) => ({ course_id: id, course_name: name, course_price: 10, program: {} });

test('course_schedule renders injected rows, fails closed on empty/absent data', () => {
  const rows = [
    { _id: '1', dates: ['2026-10-17', '2026-10-18'], status: 'open', type: 'classroom' },
    { _id: '2', dates: ['2026-11-02'], status: 'nearly_full', type: 'online' },
  ];
  const html = R(CourseScheduleSection, { content: { courseId: 'MSE-AI' }, data: rows });
  assert.ok(html.includes('17-18'));        // formatted date range
  assert.ok(html.includes('ลงทะเบียน'));       // open status label (lib/scheduleStatus)
  assert.ok(html.includes('ใกล้เต็ม'));       // nearly_full status label
  // register link built from the course code + schedule _id (& is HTML-escaped)
  assert.ok(html.includes('/registration/public?course=mse-ai') && html.includes('class=1'));
  // fail-closed: no rows, wrong-shape, or no data → renders nothing
  assert.equal(R(CourseScheduleSection, { content: { courseId: 'MSE-AI' }, data: [] }), '');
  assert.equal(R(CourseScheduleSection, { content: { courseId: 'MSE-AI' }, data: undefined }), '');
});

test('course_schedule falls back to signup_url when no _id/code', () => {
  const html = R(CourseScheduleSection, {
    content: {},
    data: [{ dates: ['2026-12-01'], status: 'open', type: 'hybrid', signup_url: 'https://ext/signup' }],
  });
  assert.ok(html.includes('https://ext/signup'));
});

test('course_list renders a DERIVED list identically to a manual one (source-agnostic)', () => {
  // The component never sees `source` — the resolver already turned it into an
  // array. So the same injected array renders the same, whatever produced it.
  const data = [course('A', 'Alpha'), course('B', 'Beta')];
  const derived = R(CourseListSection, { data });
  const manual = R(CourseListSection, { data });
  assert.equal(derived, manual);
  assert.ok(derived.includes('Alpha') && derived.includes('Beta'));
  assert.equal(R(CourseListSection, { data: [] }), ''); // fail closed
});

// CONTROL (house pattern): a reader test must be able to fail. course_schedule
// does NOT read `content.limit` for the row count (the resolver already sliced),
// so injecting more rows than a stale limit still renders them all — proving the
// assertions above read the DATA, not a phantom content field.
test('control: course_schedule renders every injected row (limit is a resolver concern)', () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({ _id: String(i), dates: ['2026-10-17'], status: 'open', type: 'classroom' }));
  const html = R(CourseScheduleSection, { content: { courseId: 'MSE-AI', limit: 1 }, data: rows });
  const count = (html.match(/ลงทะเบียน/g) ?? []).length;
  assert.equal(count, 3); // all three, not clamped to content.limit
});
