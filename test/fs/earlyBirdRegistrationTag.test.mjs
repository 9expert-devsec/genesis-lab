import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildEarlyBirdTag, buildQuoteRegistration } from '@/lib/registration/build-public';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The D3 ruling is asserted against the SOURCE of the two
// bundle files, because the correct behaviour there is an absence.
import { readSource } from '../sourceScan.mjs';

/**
 * THE EARLY BIRD TAG IS FROZEN ONTO THE REGISTRATION AT SUBMIT.
 *
 * The harm this exists to prevent: an admin issues every quotation BY HAND, so
 * a registration that does not SAY it was Early Bird gets quoted at full price
 * and nobody notices. The tag is what says it.
 *
 * ── WHY THE DECISION IS AT SUBMIT AND NOT AT RENDER ───────────────────────
 * The form renders once and the customer then types for minutes. A flag decided
 * at render would file a discount that had already expired, and nothing
 * downstream could tell. `getEarlyBirdByCourse` answers as of NOW — null for an
 * inactive config, null once the deadline has passed — so the route's read IS
 * the decision, and these assertions are about what the builder does with it.
 *
 * ── THE FIXTURE IS THE ONE LIVE EARLY BIRD ────────────────────────────────
 * `COPILOT-STU-ADV` — measured as the only row that `getEarlyBirdByCourse`
 * currently returns a document for (the other four are inactive or past their
 * deadline). Its real values are used so the shape under test is the shape that
 * actually exists.
 */

const ROUND = '6a4b5bc0dbabef601ece8918';
const OTHER_ROUND = '693139a13c08be72a485d79f';

/** What `getEarlyBirdByCourse` returns for the live row. */
const config = (over = {}) => ({
  course_id: 'COPILOT-STU-ADV',
  schedule_id: ROUND,
  special_price: 12665,
  label_th: 'Early Bird',
  deadline: new Date('2026-09-10T16:59:59.999Z'),
  is_active: true,
  ...over,
});

// ── the tag itself ──────────────────────────────────────────────────────────

test('a live config on the MATCHING round mints the tag, price included', () => {
  const tag = buildEarlyBirdTag(config(), { classId: ROUND });
  assert.deepEqual(tag, {
    courseCode: 'COPILOT-STU-ADV',
    scheduleId: ROUND,
    specialPrice: 12665,
    labelTh: 'Early Bird',
    deadline: new Date('2026-09-10T16:59:59.999Z'),
  });
});

test('THE DEADLINE CASE: an expired config reaches the builder as null', () => {
  /**
   * `getEarlyBirdByCourse` is what applies the deadline — it returns null past
   * it — so the builder's job is to mint nothing from nothing. Asserted because
   * this is the race the whole submit-time placement exists for: the customer
   * who was inside the window when the form rendered and outside it when they
   * pressed submit.
   */
  assert.equal(buildEarlyBirdTag(null, { classId: ROUND }), undefined);
  assert.equal(buildEarlyBirdTag(undefined, { classId: ROUND }), undefined);
});

test('THE WRONG ROUND: a different round of the same course gets nothing', () => {
  // An Early Bird belongs to exactly ONE round. Booking another round of the
  // same course must not pick the discount up by association.
  assert.equal(buildEarlyBirdTag(config(), { classId: OTHER_ROUND }), undefined);
  assert.equal(buildEarlyBirdTag(config(), { classId: '' }), undefined);
  assert.equal(buildEarlyBirdTag(config(), {}), undefined);
});

test('a config that cannot name its course or its round mints nothing', () => {
  // Partial is worse than absent — the rule buildBundleTag already applies. A
  // tag that names neither can be checked against nothing.
  assert.equal(buildEarlyBirdTag(config({ schedule_id: '' }), { classId: ROUND }), undefined);
  assert.equal(buildEarlyBirdTag(config({ course_id: '' }), { classId: ROUND }), undefined);
});

test('an unset price is null, and a real 0 survives as 0', () => {
  // 0 is a free course; null is "the config had no price". Collapsing them
  // would make a free Early Bird indistinguishable from an unpriced one on a
  // quotation. `Number(undefined)` is NaN and must never be stored.
  assert.equal(buildEarlyBirdTag(config({ special_price: null }), { classId: ROUND }).specialPrice, null);
  assert.equal(buildEarlyBirdTag(config({ special_price: undefined }), { classId: ROUND }).specialPrice, null);
  assert.equal(buildEarlyBirdTag(config({ special_price: 0 }), { classId: ROUND }).specialPrice, 0);
});

// ── how it reaches the document ─────────────────────────────────────────────

const quoteArgs = {
  data: {
    courseId: 'COPILOT-STU-ADV', classId: ROUND,
    coordinator: {}, attendeesCount: 1, attendeesListProvided: false,
    consent: null,
  },
  attendees: [],
};

test('an ordinary registration writes NO earlyBird key at all', () => {
  // Not a null one: `earlyBird == null` is the whole test for "no promotion",
  // the same idiom `bundle` uses, and an explicit undefined would still be a key.
  const doc = buildQuoteRegistration(quoteArgs);
  assert.equal('earlyBird' in doc, false);
});

test('a tagged registration carries the frozen tag', () => {
  const earlyBird = buildEarlyBirdTag(config(), { classId: ROUND });
  const doc = buildQuoteRegistration({ ...quoteArgs, earlyBird });
  assert.equal(doc.earlyBird.specialPrice, 12665);
  assert.equal(doc.earlyBird.scheduleId, ROUND);
});

test('CONTROL: the two promotions do not interfere in the builder', () => {
  // They are never both passed — the ruling is enforced at the bundle route —
  // but the builder must not drop one when handed the other.
  const bundle = { pageId: 'p', sectionId: 's', requestId: 'r', name: 'ชุด' };
  assert.equal('earlyBird' in buildQuoteRegistration({ ...quoteArgs, bundle }), false);
  assert.equal('bundle' in buildQuoteRegistration({ ...quoteArgs, earlyBird: { courseCode: 'x' } }), false);
});

// ── the client cannot post one ──────────────────────────────────────────────

test('a posted `earlyBird` is STRIPPED by the schema, not honoured', () => {
  /**
   * The same guarantee `bundle` relies on, asserted rather than assumed:
   * `publicRegistrationSchema` is a plain `z.object()` with no
   * `.passthrough()`, so zod drops an unknown key. Without this a customer
   * could file a registration claiming a discount they were never offered.
   */
  const person = {
    firstName: 'ทดสอบ', lastName: 'ระบบ', email: 'a@b.co', phone: '0812345678',
  };
  const parsed = publicRegistrationSchema.safeParse({
    courseId: 'COPILOT-STU-ADV',
    classId: ROUND,
    coordinator: { ...person, isAttending: false },
    attendeesCount: 1,
    attendeesListProvided: true,
    attendees: [person],
    earlyBird: { courseCode: 'HACKED', specialPrice: 1 },
    bundle: { pageId: 'x', sectionId: 'y', requestId: 'z' },
  });

  // A VALID payload, deliberately: asserting on a rejected one would prove
  // nothing about what the schema ACCEPTS, which is the whole claim.
  assert.equal(parsed.success, true, 'the fixture stopped being a valid submission');
  assert.equal('earlyBird' in parsed.data, false, 'a client can post an Early Bird tag');
  assert.equal('bundle' in parsed.data, false, 'a client can post a bundle tag');

  // CONTROL: the probe is live — a key the schema DOES accept survives the
  // same parse, so "absent" above is the schema stripping rather than the
  // fixture never having carried it.
  assert.equal(parsed.data.courseId, 'COPILOT-STU-ADV');
});

// ── D3: a bundle leg is never tagged ────────────────────────────────────────

test('A BUNDLE LEG CARRIES NO EARLY BIRD TAG — the ruling, not the accident', () => {
  /**
   * ONE PROMOTION PER REGISTRATION. A bundle already carries its own package
   * pricing and an admin writes the quotation by hand; a leg wearing both chips
   * would leave them unable to say which price applies — a wrong invoice, not a
   * display problem.
   *
   * Today this holds because legs are built on a different path that asks for
   * no Early Bird. That is EMERGENT, and emergent correctness is what nearly
   * became a defect in the ownership rule, where a behaviour nobody had named
   * looked like an oversight. So the source is asserted: the bundle route makes
   * no Early Bird read, and the leg builder mints no tag.
   */
  // `.code` is the repo's own comment- and import-stripped read, so the long
  // ruling comments in both files cannot satisfy an assertion about the CODE.
  const legs = readSource('src/lib/registration/bundleLegs.js').code;
  const route = readSource('src/app/api/registration/bundle/route.js').withImports;

  assert.equal(/getEarlyBirdByCourse|buildEarlyBirdTag/.test(route), false,
    'the bundle route now derives an Early Bird — that is a rule change, say so');
  assert.equal(/earlyBird/.test(legs), false,
    'the leg builder now writes an earlyBird key — that is a rule change, say so');

  // CONTROL: the probe is live — the ordinary route DOES carry both, read the
  // same way. Without this, a broken reader would make the assertions above
  // pass vacuously, which is the failure test/sourceScan's own header warns of.
  const publik = readSource('src/app/api/registration/public/route.js').withImports;
  assert.equal(/getEarlyBirdByCourse/.test(publik), true,
    'the ordinary route lost its Early Bird derivation');
  assert.equal(/buildEarlyBirdTag/.test(publik), true);
});
