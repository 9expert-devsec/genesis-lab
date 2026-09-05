import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBundleLegs, orderLegsMarkerLast } from '@/lib/registration/bundleLegs';
import { roundFieldsFor } from '@/lib/registrations/roundSelection';
import { bundleRegistrationSchema } from '@/lib/schemas/register-bundle';

/**
 * ONE REQUEST → N LEGS, and the order they are written in.
 *
 * The shape argument is on the `bundle` field of models/RegisterPublic. What is
 * asserted here is that a leg really is an ORDINARY registration — because that
 * is the property every existing reader of `register_public` depends on, and it
 * is the one that would rot silently if a leg quietly stopped carrying a
 * `courseCode` or wrote its own `classDate` format.
 */

const TODAY = '2026-09-05';

const LIVE = { _id: 'r1', dates: ['2026-10-20', '2026-10-21'], type: 'classroom' };
const LIVE_2 = { _id: 'r2', dates: ['2026-11-03'], type: 'online' };

const items = [
  { id: 'i1', courseId: 'MSE-L1', roundId: 'r1' },
  { id: 'i2', courseId: 'PBI-L1', roundId: 'r2' },
];

const resolved = [
  { id: 'i1', courseId: 'MSE-L1', course: { course_id: 'MSE-L1', course_name: 'Excel Level 1' }, rounds: [LIVE] },
  { id: 'i2', courseId: 'PBI-L1', course: { course_id: 'PBI-L1', course_name: 'Power BI Level 1' }, rounds: [LIVE_2] },
];

const DATA = {
  coordinator: {
    firstName: 'สมหญิง', lastName: 'ดีใจ',
    email: 'somying@example.com', phone: '081-234-5678', isAttending: true,
  },
  attendeesCount: 1,
  attendeesListProvided: false,
  attendees: [],
  requestInvoice: false,
  invoice: null,
  notes: 'ขอใบเสนอราคาในนามบริษัท',
  consent: { dataChecked: true, noRefund: true, changePolicy: true, termsAccepted: true },
};

const BUNDLE = {
  pageId: '6500000000000000000000aa',
  sectionId: 'sec-1',
  requestId: 'cccccccccccccccccccc0005',
  name: 'Data Analyst Starter',
};

const build = (over = {}) =>
  buildBundleLegs({ items, resolved, todayKey: TODAY, data: DATA, attendees: [], bundle: BUNDLE, ipAddress: '1.2.3.4', ...over });

// ── a leg is an ordinary registration ─────────────────────────────────────

test('one leg per item, in the author’s order, each naming its own course and round', () => {
  const res = build();
  assert.equal(res.ok, true);
  assert.equal(res.legs.length, 2);
  assert.deepEqual(res.legs.map((l) => l.courseId), ['MSE-L1', 'PBI-L1']);
  assert.deepEqual(res.legs.map((l) => l.classId), ['r1', 'r2']);
  assert.deepEqual(res.legs.map((l) => l.courseName), ['Excel Level 1', 'Power BI Level 1']);
});

test('courseId AND courseCode both hold the short code — the readers need both', () => {
  /**
   * `courseClause` matches `{$or: [{courseCode}, {courseId}]}` and the rename
   * preview matches `courseCode` EXACTLY. RegisterWizard sets both from
   * `course.course_id`, so a leg that filled only one would be findable by some
   * filters and not others — the class of silent miss the several-rows shape
   * was chosen to avoid in the first place.
   */
  for (const leg of build().legs) {
    assert.equal(leg.courseCode, leg.courseId);
    assert.ok(leg.courseId, 'a leg has no course code at all');
  }
});

test('the round fields come from roundFieldsFor, not from a local template', () => {
  /**
   * Compared against the function itself rather than against a literal: if
   * `roundFieldsFor` ever changes how it formats `classDate` or what it does
   * with a missing `type`, a leg must change with it. A hand-written literal
   * here would pass for ever and the leg would drift from what the wizard and
   * the admin round editor write.
   */
  const [first] = build().legs;
  const expected = roundFieldsFor(LIVE);
  for (const key of ['classId', 'classDate', 'scheduleType', 'attendanceMode']) {
    assert.equal(first[key], expected[key], `${key} was not built by roundFieldsFor`);
  }
});

test('CONTROL: roundFieldsFor really is producing non-trivial values', () => {
  // Otherwise the comparison above is satisfied by two matching undefineds.
  const expected = roundFieldsFor(LIVE);
  assert.equal(expected.classId, 'r1');
  assert.ok(expected.classDate.length > 0, 'classDate is empty — the comparison proves nothing');
  assert.equal(expected.attendanceMode, 'classroom');
});

test('every leg carries the same people, the same invoice and the same notes', () => {
  /**
   * One person attends every course in the package, so this repetition is the
   * design rather than an accident — and it is what makes the seat accounting
   * count them in each round, which is correct: they are expected in each room.
   */
  const [a, b] = build().legs;
  for (const key of ['coordinator', 'attendeesCount', 'attendeesListProvided', 'requestInvoice', 'invoice', 'notes']) {
    assert.deepEqual(a[key], b[key], `${key} differs between legs of one request`);
  }
});

test('every leg carries the SAME bundle tag', () => {
  for (const leg of build().legs) assert.deepEqual(leg.bundle, BUNDLE);
});

test('consent is built through the shared record builder, not stored raw', () => {
  /**
   * `accepted` is DERIVED from the four flags rather than assumed, and the ip
   * is recorded. Storing `data.consent` directly would give a bundle a
   * different audit shape from every other registration.
   */
  const [leg] = build().legs;
  assert.equal(leg.consent.accepted, true);
  assert.equal(leg.consent.ipAddress, '1.2.3.4');
  assert.ok(leg.consent.acceptedAt instanceof Date);
});

test('CONTROL: a partial consent is recorded as NOT accepted', () => {
  const partial = { ...DATA, consent: { dataChecked: true, noRefund: false, changePolicy: true, termsAccepted: true } };
  const [leg] = build({ data: partial }).legs;
  assert.equal(leg.consent.accepted, false, 'an acceptance the customer did not give was recorded');
});

test('status and source match an ordinary quote registration', () => {
  for (const leg of build().legs) {
    assert.equal(leg.status, 'pending');
    assert.equal(leg.source, 'web');
  }
});

// ── refusals ──────────────────────────────────────────────────────────────

test('an item whose round is not LIVE refuses the whole build, naming the item', () => {
  /**
   * A snapshot can draw a date but cannot hold a seat. This is the second
   * reader of a fact `resolveBundleRequest` has already checked — it refuses
   * rather than assuming its sibling ran, because the two guards run over data
   * fetched at different moments.
   */
  const rolled = [
    resolved[0],
    { ...resolved[1], rounds: [] },
  ];
  const withSnapshot = [
    items[0],
    { ...items[1], roundSnapshot: { id: 'r2', dates: ['2026-08-01'], type: 'online' } },
  ];
  const res = buildBundleLegs({
    items: withSnapshot, resolved: rolled, todayKey: TODAY,
    data: DATA, attendees: [], bundle: BUNDLE,
  });
  assert.equal(res.ok, false);
  assert.equal(res.index, 1);
  assert.equal(res.courseId, 'PBI-L1');
});

test('an unresolved course refuses too', () => {
  const res = buildBundleLegs({
    items, resolved: [resolved[0], { ...resolved[1], course: null }], todayKey: TODAY,
    data: DATA, attendees: [], bundle: BUNDLE,
  });
  assert.equal(res.ok, false);
  assert.equal(res.index, 1);
});

test('a HYBRID round with no chosen mode is REFUSED, never defaulted to classroom', () => {
  /**
   * The form asks the customer nothing round-shaped, so a hybrid round in a
   * bundle has no mode to carry. `attendanceModeFor` returns null and this
   * propagates it: guessing `classroom` for someone who meant Teams sends them
   * to a building on the day.
   */
  const hybrid = [{ ...resolved[0], rounds: [{ _id: 'r1', dates: ['2026-10-20'], type: 'hybrid' }] }];
  const res = buildBundleLegs({
    items: [items[0]], resolved: hybrid, todayKey: TODAY,
    data: DATA, attendees: [], bundle: BUNDLE,
  });
  assert.equal(res.ok, false, 'a hybrid round was silently defaulted');
  assert.equal(res.index, 0);
});

test('CONTROL: the same item with a CLASSROOM round builds fine', () => {
  const res = buildBundleLegs({
    items: [items[0]], resolved: [resolved[0]], todayKey: TODAY,
    data: DATA, attendees: [], bundle: BUNDLE,
  });
  assert.equal(res.ok, true);
  assert.equal(res.legs[0].attendanceMode, 'classroom');
});

test('no items at all is a refusal, not an empty success', () => {
  const res = buildBundleLegs({ items: [], resolved: [], todayKey: TODAY, data: DATA, attendees: [], bundle: BUNDLE });
  assert.equal(res.ok, false);
});

// ── the marker ordering ───────────────────────────────────────────────────

test('the MARKER is written LAST, and it is the leg whose _id is the requestId', () => {
  /**
   * The completeness property: a request is complete iff a row exists with
   * `_id === bundle.requestId`. Writing that row last is what makes an
   * interrupted write leave a state with a NAME rather than an anonymous short
   * bundle.
   */
  const { legs } = build();
  const ordered = orderLegsMarkerLast(legs, 'REQ-1');

  assert.equal(ordered.length, legs.length);
  assert.equal(ordered.at(-1)._id, 'REQ-1', 'the marker is not last');
  // …and it is the FIRST authored item that became the marker, so the author's
  // order decides which course a person would name.
  assert.equal(ordered.at(-1).courseId, 'MSE-L1');
  // Nothing but the marker carries an explicit _id — the rest get theirs from
  // Mongo, and a second explicit id would be a second marker.
  const withId = ordered.filter((l) => l._id !== undefined);
  assert.equal(withId.length, 1);
});

test('CONTROL: the un-ordered legs put that same course FIRST', () => {
  // Without this, "the marker is last" could be satisfied by a list that was
  // already in that order.
  const { legs } = build();
  assert.equal(legs[0].courseId, 'MSE-L1');
  assert.notEqual(orderLegsMarkerLast(legs, 'REQ-1')[0].courseId, 'MSE-L1');
});

test('a single-course bundle still gets its marker, and the ordering is a no-op', () => {
  const one = buildBundleLegs({
    items: [items[0]], resolved: [resolved[0]], todayKey: TODAY,
    data: DATA, attendees: [], bundle: BUNDLE,
  });
  const ordered = orderLegsMarkerLast(one.legs, 'REQ-1');
  assert.equal(ordered.length, 1);
  assert.equal(ordered[0]._id, 'REQ-1');
});

test('ordering an empty list is empty, not a phantom marker', () => {
  assert.deepEqual(orderLegsMarkerLast([], 'REQ-1'), []);
  assert.deepEqual(orderLegsMarkerLast(null, 'REQ-1'), []);
});

// ── the customer payload cannot name a course, a round, or a payment ──────

test('the bundle schema accepts NO course, round, bundle or payment key', () => {
  /**
   * The absences are the guard. A client that could name its own course and
   * round would be filing a registration under a package's price; a client that
   * could send a `paymentMethod` would be putting a quotation down a charge
   * path. Zod strips in both cases, so the assertion is that none of them
   * SURVIVES.
   */
  const parsed = bundleRegistrationSchema.safeParse({
    pageId: 'p1',
    sectionId: 's1',
    coordinator: DATA.coordinator,
    attendeesCount: 1,
    attendeesListProvided: false,
    attendees: [],
    requestInvoice: false,
    invoice: null,
    notes: '',
    // Every one of these is an attempt to decide something the server decides.
    courseId: 'FREE-101',
    classId: 'r-of-my-choosing',
    courseName: 'Anything',
    attendanceMode: 'teams',
    bundle: { pageId: 'x', sectionId: 'y', requestId: 'z', name: 'Free Everything' },
    paymentMethod: 'credit_card',
    omiseToken: 'tokn_test',
  });
  assert.equal(parsed.success, true, 'the fixture must be otherwise valid or this proves nothing');
  for (const key of ['courseId', 'classId', 'courseName', 'attendanceMode', 'bundle', 'paymentMethod', 'omiseToken']) {
    assert.equal(key in parsed.data, false, `a client-supplied ${key} survived validation`);
  }
});

test('CONTROL: the same parse KEEPS the keys the customer really does own', () => {
  const parsed = bundleRegistrationSchema.safeParse({
    pageId: 'p1', sectionId: 's1', coordinator: DATA.coordinator,
    attendeesCount: 1, attendeesListProvided: false, attendees: [],
    requestInvoice: false, invoice: null, notes: 'ขอใบเสนอราคา',
  });
  assert.equal(parsed.success, true);
  for (const key of ['pageId', 'sectionId', 'coordinator', 'notes']) {
    assert.equal(key in parsed.data, true, `${key} was stripped — the probe is over-broad`);
  }
});

test('the pair is REQUIRED — a submission that names no bundle cannot be valid', () => {
  const parsed = bundleRegistrationSchema.safeParse({
    coordinator: DATA.coordinator, attendeesCount: 1, attendeesListProvided: false,
    attendees: [], requestInvoice: false, invoice: null,
  });
  assert.equal(parsed.success, false);
});
