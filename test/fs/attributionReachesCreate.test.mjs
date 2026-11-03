import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildQuoteRegistration } from '@/lib/registration/build-public';
import { createPaidRegistration } from '@/lib/registration/create-public';
import { buildBundleLegs } from '@/lib/registration/bundleLegs';
import { attributionField } from '@/lib/attribution/attribution';
import { careerPathCreatePayload } from '@/lib/registration/careerPathPayload';
import { POST as masterclassRegister } from '@/app/api/masterclass/register/route';
import RegisterPublic from '@/models/RegisterPublic';
import MasterclassBatch from '@/models/MasterclassBatch';
import MasterclassCourse from '@/models/MasterclassCourse';
import MasterclassRegistration from '@/models/MasterclassRegistration';

/**
 * ATTRIBUTION REACHES THE WRITE — one proof per registration entry point.
 *
 * The defect this guards has shipped in this repo before: zod runs in STRIP
 * mode, so a field the schema does not declare is discarded between parse and
 * write, and the save is green. Attribution is NOT on any zod schema — every
 * route reads it from the RAW body beside the parse — so two things must hold
 * per entry point, and each is pinned below:
 *
 *   1. the payload handed to `Model.create` carries a SANITISED attribution
 *      with a server-computed channel (executed, model mocked — no Mongo);
 *   2. the route hands the RAW `body.attribution` to that step, not the parsed
 *      `data` (source pin — `data.attribution` would always be undefined).
 *
 * Where a handler could be run whole with only model calls to mock (the charge
 * path's createPaidRegistration, the masterclass route) it IS run whole. The
 * public quote, bundle, in-house and career-path handlers also call the
 * hidden-course loader, upstream course fetches and the email senders, so the
 * pure step that builds their create payload is executed instead
 * (buildQuoteRegistration, buildBundleLegs, careerPathCreatePayload — the last
 * extracted this round — and for in-house the attribution spread; see there).
 *
 * Nothing here talks to a database: dbConnect is stubbed by the loader and
 * every model method a handler reaches is replaced for the duration of a test.
 */

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/** What a browser sends: forged channel, an unknown key, a control character. */
const RAW = {
  first: { utm_source: 'newsletter', utm_medium: 'email', captured_at: '2026-11-01T00:00:00.000Z' },
  last: { utm_source: 'line\u0007', utm_medium: 'line_oa', utm_campaign: 'nov', evil: 'x', captured_at: '2026-11-02T00:00:00.000Z' },
  channel: 'Paid Search',
};

function assertSanitised(attribution, where) {
  assert.ok(attribution, `${where}: no attribution on the create payload`);
  assert.equal(attribution.channel, 'LINE', `${where}: channel must be server-computed, not the client's`);
  assert.equal(attribution.last.utm_source, 'line', `${where}: control character must be stripped`);
  assert.equal('evil' in attribution.last, false, `${where}: unknown key must be dropped`);
  assert.ok(attribution.last.captured_at instanceof Date, `${where}: captured_at is a Date`);
}

/** Swap methods on a model for one test; always restored. */
async function withPatched(patches, fn) {
  const saved = patches.map(([obj, key]) => [obj, key, obj[key]]);
  for (const [obj, key, value] of patches) obj[key] = value;
  try {
    return await fn();
  } finally {
    for (const [obj, key, value] of saved) obj[key] = value;
  }
}

// ── 1. public quote — /api/registration/public ────────────────────────────

const PUBLIC_DATA = {
  courseId: 'PBI-L1', courseCode: 'PBI-L1', courseName: 'Power BI', classId: 'c1',
  coordinator: { firstName: 'ก', lastName: 'ข', email: 'a@b.co', phone: '0812345678', isAttending: true },
  attendeesCount: 1, attendees: [], requestInvoice: false, invoice: null,
  consent: { dataChecked: true, noRefund: true, changePolicy: true, termsAccepted: true },
};

test('public quote: buildQuoteRegistration carries sanitised attribution', () => {
  const doc = buildQuoteRegistration({ data: PUBLIC_DATA, attendees: [], ipAddress: null, attribution: RAW });
  assertSanitised(doc.attribution, 'public quote');
});

test('public quote: the route passes the RAW body field, not parsed data', () => {
  assert.ok(src('src/app/api/registration/public/route.js').includes('attribution: body?.attribution'));
});

// ── 2. public charge — create-public.js, run whole ────────────────────────

test('public charge: createPaidRegistration hands RegisterPublic.create a sanitised attribution', async () => {
  let handed = null;
  await withPatched([[RegisterPublic, 'create', async (doc) => { handed = doc; return { _id: 'x', ...doc }; }]], () =>
    createPaidRegistration({
      data: PUBLIC_DATA,
      pricing: { pricePerSeat: 100, seats: 1, subtotal: 100, vatAmount: 7, total: 107 },
      method: 'promptpay',
      consent: PUBLIC_DATA.consent,
      ipAddress: null,
      attribution: RAW,
    }),
  );
  assertSanitised(handed?.attribution, 'public charge');
});

test('public charge: the route passes the RAW body field', () => {
  assert.ok(src('src/app/api/registration/public/charge/route.js').includes('attribution: body?.attribution'));
});

// ── 3. bundle — every leg, same copy ──────────────────────────────────────

test('bundle: every leg carries the same sanitised attribution', () => {
  const res = buildBundleLegs({
    items: [{ id: 'i1', courseId: 'MSE-L1', roundId: 'r1' }, { id: 'i2', courseId: 'PBI-L1', roundId: 'r2' }],
    resolved: [
      { id: 'i1', courseId: 'MSE-L1', course: { course_id: 'MSE-L1', course_name: 'Excel' }, rounds: [{ _id: 'r1', dates: ['2026-12-01'], type: 'classroom' }] },
      { id: 'i2', courseId: 'PBI-L1', course: { course_id: 'PBI-L1', course_name: 'PBI' }, rounds: [{ _id: 'r2', dates: ['2026-12-02'], type: 'online' }] },
    ],
    todayKey: '2026-11-03',
    data: { ...PUBLIC_DATA, attendeesListProvided: false, notes: '' },
    attendees: [],
    bundle: { pageId: 'p', sectionId: 's', requestId: 'r', name: 'n' },
    attribution: RAW,
  });
  assert.equal(res.ok, true);
  assert.equal(res.legs.length, 2);
  for (const leg of res.legs) assertSanitised(leg.attribution, 'bundle leg');
  assert.deepEqual(res.legs[0].attribution, res.legs[1].attribution);
});

test('bundle: the route passes the RAW body field', () => {
  assert.ok(src('src/app/api/registration/bundle/route.js').includes('attribution: body?.attribution'));
});

// ── 4. in-house ───────────────────────────────────────────────────────────

/*
 * NOT extracted into a builder, deliberately. The create literal in the
 * in-house route is read in place by two existing guards —
 * test/fs/branchLegacyReadOnly (companyName written ONCE, there) and
 * test/fs/inhouseEnumNarrowed (the status the route writes) — so moving it
 * would trade one proof for two broken ones. The smallest pure step is the
 * spread itself: attributionField is executed on the raw blob, and the pin
 * below requires that exact spread INSIDE the RegisterInhouse.create({ … })
 * literal, reading the raw body.
 */
test('in-house: the spread the route uses yields a sanitised attribution', () => {
  const doc = { status: 'pending', ...attributionField(RAW) };
  assertSanitised(doc.attribution, 'in-house');
});

test('in-house: the spread sits inside the RegisterInhouse.create literal and reads the RAW body', () => {
  const code = src('src/app/api/registration/inhouse/route.js');
  const start = code.indexOf('RegisterInhouse.create({');
  assert.notEqual(start, -1, 'create call not found');
  const end = code.indexOf('\n  });', start);
  assert.notEqual(end, -1, 'end of the create literal not found');
  const literal = code.slice(start, end);
  assert.equal(literal.split('...attributionField(body?.attribution)').length - 1, 1);
});

// ── 5. career path ────────────────────────────────────────────────────────

test('career path: careerPathCreatePayload REPLACES the raw blob with the sanitised one', () => {
  const doc = careerPathCreatePayload({ careerSlug: 'x', attribution: RAW }, [{ courseName: 'A' }]);
  assertSanitised(doc.attribution, 'career path');
  assert.deepEqual(doc.selectedCourses, [{ courseName: 'A' }]);
});

test('career path: a forged blob with nothing usable is removed, not passed through', () => {
  const doc = careerPathCreatePayload({ attribution: { channel: 'Paid Search', junk: 1 } }, []);
  assert.equal(doc.attribution, undefined);
});

test('career path: the action builds through it', () => {
  assert.ok(src('src/lib/actions/career-path-registrations.js').includes('careerPathCreatePayload(data, resolved.selectedCourses, requestMeta)'));
});

// ── 6. masterclass — /api/masterclass/register, run whole ─────────────────

test('masterclass: the route hands MasterclassRegistration.create a sanitised attribution', async () => {
  let handed = null;
  const lean = (value) => ({ lean: async () => value });
  const res = await withPatched(
    [
      [MasterclassBatch, 'findById', () => lean({ _id: 'b1', course_id: 'c1', status: 'open', price_normal: 1000, batch_no: 1, dates: [] })],
      [MasterclassCourse, 'findById', () => lean({ _id: 'c1', title_th: 'Masterclass' })],
      [MasterclassRegistration, 'create', async (doc) => { handed = doc; return { _id: '6500000000000000000000ab', ...doc }; }],
    ],
    () => masterclassRegister({
      json: async () => ({
        batchId: 'b1',
        coordinator: { firstName: 'ก', lastName: 'ข', email: 'a@b.co', phone: '0812345678' },
        attendeesCount: 1,
        method: 'credit_card',
        attribution: RAW,
      }),
    }),
  );
  assert.equal(res.status, 200);
  assertSanitised(handed?.attribution, 'masterclass');
  const body = await res.json();
  assert.equal(body.leadChannel, 'LINE', 'the response reports the server-derived channel');
});
