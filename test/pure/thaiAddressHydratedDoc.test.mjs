import { test } from 'node:test';
import assert from 'node:assert/strict';
import MasterclassRegistration from '@/models/MasterclassRegistration';
import { formatBillingAddress } from '@/lib/address/formatBillingAddress';
import { formatThaiAddress } from '@/lib/address/formatThaiAddress';

/**
 * A HYDRATED Mongoose subdocument must format exactly like the plain object.
 *
 * ── THE BUG ─────────────────────────────────────────────────────────────────
 * Production: a masterclass "ขอใบเสนอราคา" confirmation mailed the billing
 * address as "ตำบล… อำเภอ… จังหวัด…" — no house number/street, no postcode —
 * although the stored document had both (measured: every recent invoice row
 * has addressLine and postalCode filled).
 *
 * The senders are handed `await MasterclassRegistration.findById(id)` — a
 * hydrated document, no `.lean()` — in the quote path (api/masterclass/register)
 * and the paid path (register/charge, the Omise webhook). formatThaiAddress
 * built its working object as `{ ...raw, subDistrict, district, province }`.
 * On a Mongoose subdocument the fields are prototype GETTERS; the own
 * enumerable keys are `$__parent`, `$basePath`, `$__`, `_doc`. So the spread
 * copied none of them: the three fields re-read explicitly survived, and
 * addressLine and postalCode — which only came through the spread — vanished.
 *
 * Fake address values only.
 */

const THAI = {
  addressLine: '99/9 FAKE-LINE',
  subDistrict: 'ในเมือง',
  district:    'เมือง',
  province:    'ขอนแก่น',
  postalCode:  '40000',
};
const BKK = { ...THAI, subDistrict: 'แขวงสามเสนใน', district: 'เขตพญาไท', province: 'กรุงเทพมหานคร', postalCode: '10400' };

function hydrated(thaiAddress) {
  return new MasterclassRegistration({
    request_invoice: true,
    invoice: { type: 'individual', country: 'TH', thaiAddress },
  });
}

test('CONTROL: the hydrated subdocument really hides its fields from a spread', () => {
  const sub = hydrated(THAI).invoice.thaiAddress;
  assert.equal(sub.addressLine, THAI.addressLine, 'the getter works');
  assert.equal({ ...sub }.addressLine, undefined, 'the spread does not see it — the shape that lost it');
});

for (const [label, addr] of [['non-Bangkok', THAI], ['Bangkok', BKK]]) {
  test(`${label}: formatBillingAddress(hydrated doc.invoice) === formatBillingAddress(plain invoice)`, () => {
    const doc = hydrated(addr);
    const plain = { type: 'individual', country: 'TH', thaiAddress: addr };
    assert.equal(formatBillingAddress(doc.invoice), formatBillingAddress(plain));
  });

  test(`${label}: the hydrated address keeps its address line and postcode`, () => {
    const out = formatThaiAddress(hydrated(addr).invoice.thaiAddress);
    assert.ok(out.startsWith(addr.addressLine), out);
    assert.ok(out.endsWith(addr.postalCode), out);
  });
}

test('a getter-only object (no own keys) formats every field', () => {
  const proto = Object.fromEntries(Object.keys(THAI).map((k) => [k, { get: () => THAI[k], enumerable: false }]));
  const getterOnly = Object.create(Object.defineProperties({}, proto));
  assert.equal(formatThaiAddress(getterOnly), formatThaiAddress(THAI));
});
