import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildQuoteRegistration } from '@/lib/registration/build-public';
import { createPaidRegistration } from '@/lib/registration/create-public';
import { buildBundleLegs } from '@/lib/registration/bundleLegs';
import { careerPathCreatePayload } from '@/lib/registration/careerPathPayload';
import { buildRequestMeta, requestMetaField } from '@/lib/registration/requestMeta';
import { POST as masterclassRegister } from '@/app/api/masterclass/register/route';
import RegisterPublic from '@/models/RegisterPublic';
import MasterclassBatch from '@/models/MasterclassBatch';
import MasterclassCourse from '@/models/MasterclassCourse';
import MasterclassRegistration from '@/models/MasterclassRegistration';
import { clearHeaders, setHeaders } from '../stub-next-headers.mjs';

/**
 * REQUEST FORENSICS REACH THE WRITE — one proof per registration entry point,
 * the same six R2b covers for attribution (test/fs/attributionReachesCreate).
 *
 * Per entry point, two things are pinned:
 *   1. the object handed to `Model.create` carries `requestMeta` (executed,
 *      model mocked — no Mongo);
 *   2. the route BUILDS it from the request headers with requestMetaFor —
 *      under its own kind — and hands it to that step (source pin).
 *
 * The masterclass route is run whole with headers set on the next/headers
 * stub, so for that path the header → record → warn chain is executed end to
 * end. Nothing here submits a registration or talks to a database.
 */

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/** A mirror relaying a submission: foreign origin, our host, a datacenter IP. */
const RELAY_HEADERS = {
  origin: 'https://9expert-loan.example',
  referer: 'https://9expert-loan.example/register?ref=sms',
  host: 'www.9experttraining.com',
  'user-agent': 'Mozilla/5.0',
  'x-forwarded-for': '198.51.100.20',
  'x-vercel-ip-country': 'SG',
};
const META = buildRequestMeta({ get: (n) => RELAY_HEADERS[n] ?? null });

function assertMeta(meta, where) {
  assert.ok(meta, `${where}: no requestMeta on the create payload`);
  assert.equal(meta.origin, 'https://9expert-loan.example', `${where}: origin`);
  assert.equal(meta.referer_host, '9expert-loan.example', `${where}: referer_host`);
  assert.equal(meta.forwarded_for, '198.51.100.20', `${where}: forwarded_for`);
  assert.equal(meta.origin_trusted, false, `${where}: origin_trusted`);
}

async function withPatched(patches, fn) {
  const saved = patches.map(([obj, key]) => [obj, key, obj[key]]);
  for (const [obj, key, value] of patches) obj[key] = value;
  try {
    return await fn();
  } finally {
    for (const [obj, key, value] of saved) obj[key] = value;
  }
}

/** The route computes it under its kind and passes it on. */
function assertRouteWires(file, kind, handOff) {
  const code = src(file);
  assert.equal(code.split(`requestMetaFor('${kind}', `).length - 1, 1, `${file}: requestMetaFor('${kind}', …) exactly once`);
  assert.ok(code.includes(handOff), `${file}: must hand requestMeta on via \`${handOff}\``);
}

const PUBLIC_DATA = {
  courseId: 'PBI-L1', courseCode: 'PBI-L1', courseName: 'Power BI', classId: 'c1',
  coordinator: { firstName: 'ก', lastName: 'ข', email: 'a@b.co', phone: '0812345678', isAttending: true },
  attendeesCount: 1, attendees: [], requestInvoice: false, invoice: null,
  consent: { dataChecked: true, noRefund: true, changePolicy: true, termsAccepted: true },
};

// ── 1. public quote ───────────────────────────────────────────────────────

test('public quote: buildQuoteRegistration carries requestMeta', () => {
  assertMeta(buildQuoteRegistration({ data: PUBLIC_DATA, attendees: [], requestMeta: META }).requestMeta, 'public quote');
});

test('public quote: the route builds it from headers and passes it', () => {
  assertRouteWires('src/app/api/registration/public/route.js', 'public', 'attribution: body?.attribution, requestMeta })');
});

// ── 2. public charge — createPaidRegistration run whole ───────────────────

test('public charge: createPaidRegistration hands RegisterPublic.create the requestMeta', async () => {
  let handed = null;
  await withPatched([[RegisterPublic, 'create', async (doc) => { handed = doc; return { _id: 'x', ...doc }; }]], () =>
    createPaidRegistration({
      data: PUBLIC_DATA,
      pricing: { pricePerSeat: 100, seats: 1, subtotal: 100, vatAmount: 7, total: 107 },
      method: 'promptpay',
      consent: PUBLIC_DATA.consent,
      ipAddress: null,
      requestMeta: META,
    }),
  );
  assertMeta(handed?.requestMeta, 'public charge');
});

test('public charge: the route builds it from headers and passes it', () => {
  assertRouteWires('src/app/api/registration/public/charge/route.js', 'public_paid', '    requestMeta,\n    supersedesRegistrationId,');
});

// ── 3. bundle — every leg ─────────────────────────────────────────────────

test('bundle: every leg carries the same requestMeta', () => {
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
    requestMeta: META,
  });
  assert.equal(res.ok, true);
  assert.equal(res.legs.length, 2);
  for (const leg of res.legs) assertMeta(leg.requestMeta, 'bundle leg');
});

test('bundle: the route builds it from headers — after the preview return — and passes it', () => {
  const file = 'src/app/api/registration/bundle/route.js';
  assertRouteWires(file, 'bundle', '    attribution: body?.attribution,\n    requestMeta,\n  });');
  const code = src(file);
  assert.ok(code.indexOf("requestMetaFor('bundle'") > code.indexOf('if (preview) {'), 'a preview run must not build or log it');
});

// ── 4. in-house ───────────────────────────────────────────────────────────

test('in-house: the spread the route uses yields requestMeta', () => {
  assertMeta({ status: 'pending', ...requestMetaField(META) }.requestMeta, 'in-house');
});

test('in-house: the spread sits inside the RegisterInhouse.create literal; the route builds it from headers', () => {
  const file = 'src/app/api/registration/inhouse/route.js';
  const code = src(file);
  const start = code.indexOf('RegisterInhouse.create({');
  const end = code.indexOf('\n  });', start);
  assert.ok(start !== -1 && end !== -1, 'create literal not found');
  assert.equal(code.slice(start, end).split('...requestMetaField(requestMeta)').length - 1, 1);
  assertRouteWires(file, 'inhouse', '...requestMetaField(requestMeta)');
});

// ── 5. career path — the one create that spreads its payload ──────────────

test('career path: careerPathCreatePayload stores the server meta, never the payload\'s', () => {
  const forged = { origin: 'https://www.9experttraining.com', origin_trusted: true };
  const doc = careerPathCreatePayload({ careerSlug: 'x', requestMeta: forged }, [], META);
  assertMeta(doc.requestMeta, 'career path');
  const none = careerPathCreatePayload({ careerSlug: 'x', requestMeta: forged }, [], {});
  assert.equal(none.requestMeta, undefined, 'a forged blob with no server meta is removed, not stored');
});

test('career path: the action reads headers() itself and passes the meta on', () => {
  assertRouteWires(
    'src/lib/actions/career-path-registrations.js',
    'career_path',
    'careerPathCreatePayload(data, resolved.selectedCourses, requestMeta)',
  );
  assert.ok(src('src/lib/actions/career-path-registrations.js').includes("requestMetaFor('career_path', await headers())"));
});

// ── 6. masterclass — run whole, headers on the stub ───────────────────────

test('masterclass: the route records the request headers and warns once, without personal data', async () => {
  let handed = null;
  const warns = [];
  const savedWarn = console.warn;
  const lean = (value) => ({ lean: async () => value });
  setHeaders(RELAY_HEADERS);
  console.warn = (...args) => warns.push(args);
  try {
    const res = await withPatched(
      [
        [MasterclassBatch, 'findById', () => lean({ _id: 'b1', course_id: 'c1', status: 'open', price_normal: 1000, batch_no: 1, dates: [] })],
        [MasterclassCourse, 'findById', () => lean({ _id: 'c1', title_th: 'Masterclass' })],
        [MasterclassRegistration, 'create', async (doc) => { handed = doc; return { _id: '6500000000000000000000ab', ...doc }; }],
      ],
      () => masterclassRegister({
        json: async () => ({
          batchId: 'b1',
          coordinator: { firstName: 'ก', lastName: 'ข', email: 'victim@example.com', phone: '0812345678' },
          attendeesCount: 1,
          method: 'credit_card',
          notes: 'need money',
          // A body field by the same name must be ignored.
          requestMeta: { origin: 'https://www.9experttraining.com', origin_trusted: true },
        }),
      }),
    );
    assert.equal(res.status, 200, 'flagged, never refused');
  } finally {
    console.warn = savedWarn;
    clearHeaders();
  }
  assertMeta(handed?.requestMeta, 'masterclass');
  assert.equal(handed.requestMeta.vercel_ip_country, 'SG');
  const flagged = warns.filter((w) => w[0] === '[registration] untrusted origin');
  assert.equal(flagged.length, 1);
  assert.deepEqual(flagged[0][1], {
    kind: 'masterclass',
    origin: 'https://9expert-loan.example',
    referer_host: '9expert-loan.example',
    host: 'www.9experttraining.com',
  });
  assert.equal(JSON.stringify(flagged).includes('victim@example.com'), false);
});

test('no create site copies requestMeta from the request body', () => {
  for (const file of [
    'src/app/api/registration/public/route.js',
    'src/app/api/registration/public/charge/route.js',
    'src/app/api/registration/bundle/route.js',
    'src/app/api/registration/inhouse/route.js',
    'src/app/api/masterclass/register/route.js',
    'src/lib/actions/career-path-registrations.js',
  ]) {
    assert.equal(/body\??\.requestMeta|data\??\.requestMeta/.test(src(file)), false, file);
  }
});
