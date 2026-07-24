import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveInitialCourseId,
  buildInhouseInitialValues,
} from '@/lib/registration/resolveInitialCourse';

// ISSUE 1: an explicit ?course= must win over a STALE draft, without clobbering
// an in-session choice. The store/DOM plumbing lives in the component; this pure
// resolver holds the decision and is exercised directly. Whether the URL param
// resolves to a real course, and reading/writing the source marker, are the
// component's job — here `preselectedId`/`sourceCourse` are passed in.

const A = 'DA-EXCEL-VBA'; // Excel VBA (the stale draft in the repro)
const B = 'MSP-L3'; // PowerPoint (the freshly-clicked course)

test('draft + resolvable ?course= for a DIFFERENT course → URL wins', () => {
  // draft is for A, marker says the draft was started from A, URL now asks for B
  assert.equal(
    resolveInitialCourseId({ preselectedId: B, restoredCourseId: A, sourceCourse: A }),
    B,
    'the freshly-clicked course overrides the stale draft',
  );
});

test('draft + no ?course= → draft wins (unchanged)', () => {
  assert.equal(
    resolveInitialCourseId({ preselectedId: null, restoredCourseId: A, sourceCourse: A }),
    A,
  );
});

test('?course= present but unresolvable → falls back to the draft, not empty', () => {
  // the component passes preselectedId=null when the param isn't in the list
  assert.equal(
    resolveInitialCourseId({ preselectedId: null, restoredCourseId: A, sourceCourse: null }),
    A,
    'never blanks the selection on an unknown course',
  );
});

test('moving within the wizard (same course, user changed the dropdown) → draft wins', () => {
  // arrived at A, changed the dropdown to B, navigating back to step 1 with ?course=A
  assert.equal(
    resolveInitialCourseId({ preselectedId: A, restoredCourseId: B, sourceCourse: A }),
    B,
    'an in-progress change is not clobbered by the stale URL param',
  );
});

test('same course, unchanged → stays on that course', () => {
  assert.equal(
    resolveInitialCourseId({ preselectedId: A, restoredCourseId: A, sourceCourse: A }),
    A,
  );
});

test('fresh arrival, no draft → URL course', () => {
  assert.equal(
    resolveInitialCourseId({ preselectedId: A, restoredCourseId: '', sourceCourse: null }),
    A,
  );
});

test('buildInhouseInitialValues restores every field but overrides the course', () => {
  const merged = buildInhouseInitialValues({
    defaults: { companyName: '', contactEmail: '', coursesInterested: [] },
    restored: { companyName: 'Acme', contactEmail: 'x@y.z', coursesInterested: [A] },
    initialCourseId: B,
  });
  assert.equal(merged.companyName, 'Acme', 'name preserved from draft');
  assert.equal(merged.contactEmail, 'x@y.z', 'email preserved from draft');
  assert.deepEqual(merged.coursesInterested, [B], 'course overridden, not the draft value');
});

test('buildInhouseInitialValues with no draft → empty course array from a blank id', () => {
  const merged = buildInhouseInitialValues({
    defaults: { coursesInterested: [] },
    restored: null,
    initialCourseId: '',
  });
  assert.deepEqual(merged.coursesInterested, []);
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
// The current (buggy) rule is `restoredCourseId || preselectedId`: the draft
// ALWAYS wins. Feed it the repro inputs and it returns the stale course A — which
// is exactly the bug (URL says B, form shows A). The fix returns B.
test('CONTROL: the old `restored || preselected` rule keeps the stale course', () => {
  const oldRule = (restoredCourseId, preselectedId) => restoredCourseId || preselectedId || '';
  assert.equal(oldRule(A, B), A, 'old rule shows the stale draft (the bug)');
  assert.equal(
    resolveInitialCourseId({ preselectedId: B, restoredCourseId: A, sourceCourse: A }),
    B,
    'fix shows the freshly-clicked course',
  );
});
