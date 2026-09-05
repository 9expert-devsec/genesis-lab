import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBundleTag, buildQuoteRegistration } from '@/lib/registration/build-public';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';

/**
 * The bundle tag: what makes one row a leg of a package rather than an ordinary
 * registration.
 *
 * The shape decision behind it — several rows sharing a reference, rather than
 * one row holding a list — is argued at the `bundle` field on
 * models/RegisterPublic. What is asserted here is the consequence of that
 * decision at the write site: a leg is an ORDINARY quote registration plus four
 * strings, and an ordinary registration is completely unchanged.
 */

const DATA = {
  courseId: 'MSE-L1',
  courseCode: 'MSE-L1',
  courseName: 'Excel Level 1',
  classId: '65f0000000000000000000a1',
  classDate: '20 - 21 ต.ค. 2569',
  scheduleType: 'classroom',
  attendanceMode: 'classroom',
  coordinator: {
    firstName: 'สมหญิง', lastName: 'ดีใจ',
    email: 'somying@example.com', phone: '081-234-5678', isAttending: true,
  },
  attendeesCount: 1,
  attendeesListProvided: false,
  attendees: [],
  requestInvoice: false,
  invoice: null,
  notes: '',
};

const TAG = {
  pageId: '6500000000000000000000aa',
  sectionId: 'sec-1',
  requestId: 'cccccccccccccccccccc0005',
  name: 'Data Analyst Starter',
};

// ── the tag itself ────────────────────────────────────────────────────────

test('a complete tag is built, trimmed', () => {
  assert.deepEqual(
    buildBundleTag({ pageId: ' p1 ', sectionId: ' s1 ', requestId: ' r1 ', name: '  Bundle 1  ' }),
    { pageId: 'p1', sectionId: 's1', requestId: 'r1', name: 'Bundle 1' },
  );
});

test('ALL THREE identity fields are required — a partial tag is worse than none', () => {
  /**
   * A `requestId` with no `pageId` is a leg nothing can trace back to a bundle;
   * a `pageId` with no `requestId` is a leg nothing can group with its
   * siblings. Either would be a row that LOOKS tagged and answers no question
   * the tag exists to answer, which is the failure a nullable field invites.
   */
  const cases = [
    ['no pageId', { sectionId: 's1', requestId: 'r1' }],
    ['no sectionId', { pageId: 'p1', requestId: 'r1' }],
    ['no requestId', { pageId: 'p1', sectionId: 's1' }],
    ['blank pageId', { pageId: '   ', sectionId: 's1', requestId: 'r1' }],
    ['blank sectionId', { pageId: 'p1', sectionId: '', requestId: 'r1' }],
    ['blank requestId', { pageId: 'p1', sectionId: 's1', requestId: '  ' }],
    ['nothing at all', {}],
    ['no argument', undefined],
  ];
  for (const [label, input] of cases) {
    assert.equal(buildBundleTag(input), undefined, `${label} produced a tag`);
  }
});

test('CONTROL: the same three fields WITH values do produce one', () => {
  // Otherwise every undefined above is satisfied by a function that always
  // returns undefined.
  assert.notEqual(buildBundleTag({ pageId: 'p1', sectionId: 's1', requestId: 'r1' }), undefined);
});

test('a MISSING NAME is not a missing tag — an author may ship an unnamed bundle', () => {
  /**
   * `promotion_bundle.name` defaults to '' and no publish rule demands one. The
   * storage floor accepts it (see the model's note, which makes the same
   * argument the AttendeeSchema note makes at length), and the READERS decide
   * what to draw. Refusing the tag here would turn a cosmetic authoring gap
   * into a customer who cannot submit the form.
   */
  const tag = buildBundleTag({ pageId: 'p1', sectionId: 's1', requestId: 'r1' });
  assert.equal(tag.name, '');
  assert.equal(buildBundleTag({ ...TAG, name: '   ' }).name, '');
});

test('the tag is UNDEFINED, never null — absent must write no key at all', () => {
  /**
   * The model defaults `bundle` to `undefined`, so an ordinary registration
   * stores no key. A null here would write one, and `bundle == null` would stop
   * being the whole test for "is this an ordinary row" the moment something
   * reached for `bundle.name` on a null.
   */
  assert.equal(buildBundleTag({}), undefined);
  assert.notEqual(buildBundleTag({}), null, 'null and undefined are the same to ==, so this is the identity check');
  assert.equal(Object.is(buildBundleTag({}), undefined), true);
});

// ── the document it produces ──────────────────────────────────────────────

test('a leg is an ORDINARY quote registration plus the tag', () => {
  /**
   * The whole several-rows shape rests on this: every reader of this collection
   * sees a normal single-course, single-round registration. Asserted by
   * DIFFERENCE rather than by listing fields — the two documents must be
   * identical but for `bundle`, whatever the builder happens to write.
   */
  const plain = buildQuoteRegistration({ data: DATA, attendees: [], ipAddress: '1.2.3.4' });
  const leg = buildQuoteRegistration({ data: DATA, attendees: [], ipAddress: '1.2.3.4', bundle: TAG });

  assert.deepEqual(leg.bundle, TAG);
  const { bundle, ...legWithoutTag } = leg;
  // `consent` is null on both and `acceptedAt` would be a fresh Date if it were
  // not — so this comparison is only meaningful because neither has one.
  assert.equal(plain.consent, null);
  assert.deepEqual(legWithoutTag, plain, 'a leg differs from an ordinary quote by more than its tag');
});

test('an ordinary registration writes NO bundle key', () => {
  const plain = buildQuoteRegistration({ data: DATA, attendees: [] });
  assert.equal('bundle' in plain, false, 'an ordinary registration carries a bundle key');
});

test('CONTROL: the `in` probe does see the key when a tag is passed', () => {
  const leg = buildQuoteRegistration({ data: DATA, attendees: [], bundle: TAG });
  assert.equal('bundle' in leg, true);
});

test('a falsy tag is not written either — undefined and null both mean ordinary', () => {
  for (const bundle of [undefined, null, false, '']) {
    assert.equal(
      'bundle' in buildQuoteRegistration({ data: DATA, attendees: [], bundle }),
      false,
      `bundle: ${String(bundle)} wrote a key`,
    );
  }
});

// ── it is not customer input ──────────────────────────────────────────────

test('a client CANNOT post a bundle tag — the zod schema strips it', () => {
  /**
   * The tag is derived server-side from the (pageId, sectionId) pair after the
   * guard has resolved it. If the customer schema carried the key, anything
   * that can POST could file a registration under a package it never opened —
   * and the admin screens would show it as a leg of that bundle.
   *
   * Zod is in strip mode, so an unknown key is dropped at this boundary rather
   * than rejected. The assertion is that it does not SURVIVE, which is the
   * property that matters.
   */
  const parsed = publicRegistrationSchema.safeParse({
    ...DATA,
    bundle: { pageId: 'attacker', sectionId: 'x', requestId: 'y', name: 'Free Everything' },
  });
  assert.equal(parsed.success, true, 'the fixture itself must be valid, or this proves nothing');
  assert.equal('bundle' in parsed.data, false, 'a client-supplied bundle tag survived validation');
});

test('CONTROL: the same probe sees a key the schema DOES keep', () => {
  // Otherwise "bundle was stripped" could be a parse that dropped everything.
  const parsed = publicRegistrationSchema.safeParse({ ...DATA, notes: 'ขอใบเสนอราคา' });
  assert.equal(parsed.success, true);
  assert.equal('notes' in parsed.data, true);
  assert.equal(parsed.data.notes, 'ขอใบเสนอราคา');
});
