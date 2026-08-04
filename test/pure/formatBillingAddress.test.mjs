import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBillingAddress } from '@/lib/address/formatBillingAddress';

/**
 * The shared Thai billing-address formatter. It had no tests, and three more
 * call sites in the public registration flow are about to depend on it, so the
 * branch behaviour is pinned here first.
 *
 * The rule it encodes: Bangkok subdivides into แขวง/เขต and the province name
 * stands bare; every other province uses ตำบล/อำเภอ/จังหวัด. Getting this wrong
 * is not cosmetic — it is what a customer reads on their quotation.
 */

const BKK = {
  country: 'TH',
  thaiAddress: {
    addressLine: '1 ถนนสุขุมวิท',
    subDistrict: 'ลาดพร้าว',
    district: 'ลาดพร้าว',
    province: 'กรุงเทพมหานคร',
    postalCode: '10230',
  },
};

// Same subDistrict/district strings on purpose — the only variable is the
// province, so any difference in output is the branch and nothing else.
const CHIANG_MAI = {
  country: 'TH',
  thaiAddress: { ...BKK.thaiAddress, province: 'เชียงใหม่', postalCode: '50000' },
};

const FOREIGN = {
  country: 'OTHER',
  internationalAddress: {
    line1: '1 Raffles Place',
    line2: '#20-01',
    city: 'Singapore',
    state: 'Central',
    postalCode: '048616',
    country: 'Singapore',
  },
};

// ── Thai: the Bangkok / non-Bangkok split ───────────────────────────────────

test('Bangkok gets แขวง/เขต and leaves the province bare', () => {
  const out = formatBillingAddress(BKK);
  assert.equal(out, '1 ถนนสุขุมวิท แขวงลาดพร้าว เขตลาดพร้าว กรุงเทพมหานคร 10230');
  assert.ok(!out.includes('จังหวัดกรุงเทพ'), 'Bangkok is never prefixed จังหวัด');
  assert.ok(!out.includes('ตำบล') && !out.includes('อำเภอ'), 'no upcountry prefixes in Bangkok');
});

test('a non-Bangkok province gets ตำบล/อำเภอ/จังหวัด', () => {
  const out = formatBillingAddress(CHIANG_MAI);
  assert.equal(out, '1 ถนนสุขุมวิท ตำบลลาดพร้าว อำเภอลาดพร้าว จังหวัดเชียงใหม่ 50000');
  assert.ok(!out.includes('แขวง') && !out.includes('เขต'), 'no Bangkok prefixes upcountry');
});

test('CONTROL: identical fields under the two provinces produce DIFFERENT prefixes', () => {
  // BKK and CHIANG_MAI share subDistrict/district verbatim. If the function is
  // mutated to always take one branch, these two collapse to the same shape and
  // this goes red — which is the only thing proving the split above is real
  // rather than two fixtures that happen to differ in their own right.
  const bkk = formatBillingAddress(BKK);
  const upcountry = formatBillingAddress(CHIANG_MAI);
  assert.notEqual(bkk, upcountry);
  assert.ok(bkk.includes('แขวงลาดพร้าว') && !upcountry.includes('แขวงลาดพร้าว'));
  assert.ok(upcountry.includes('ตำบลลาดพร้าว') && !bkk.includes('ตำบลลาดพร้าว'));
});

test('Bangkok is matched on the กรุงเทพ prefix, not an exact string', () => {
  // The data carries both "กรุงเทพมหานคร" and the abbreviated "กรุงเทพฯ".
  const out = formatBillingAddress({
    country: 'TH',
    thaiAddress: { ...BKK.thaiAddress, province: 'กรุงเทพฯ' },
  });
  assert.ok(out.includes('แขวงลาดพร้าว'), 'the abbreviated form still takes the Bangkok branch');
});

// ── International ───────────────────────────────────────────────────────────

test("country 'OTHER' takes the international branch and comma-joins", () => {
  const out = formatBillingAddress(FOREIGN);
  assert.equal(out, '1 Raffles Place, #20-01, Singapore, Central, 048616, Singapore');
  assert.ok(!out.includes('แขวง') && !out.includes('ตำบล'), 'no Thai prefixes on a foreign address');
});

test('CONTROL: the same object under TH would NOT produce the international line', () => {
  // Proves the branch is chosen by invoice.country and not by which address
  // sub-object happens to be populated — the failure mode of passing
  // thaiAddress alone instead of the whole invoice.
  const out = formatBillingAddress({ ...FOREIGN, country: 'TH' });
  assert.notEqual(out, formatBillingAddress(FOREIGN));
  assert.equal(out, '', 'with no thaiAddress the Thai branch yields nothing');
});

test('country defaults to TH when absent', () => {
  const { country, ...noCountry } = BKK;
  assert.equal(formatBillingAddress(noCountry), formatBillingAddress(BKK));
});

// ── Missing fields ──────────────────────────────────────────────────────────

test('missing fields drop out rather than leaving a bare prefix', () => {
  const out = formatBillingAddress({
    country: 'TH',
    thaiAddress: { addressLine: '99/1', province: 'กรุงเทพมหานคร', postalCode: '10110' },
  });
  assert.equal(out, '99/1 กรุงเทพมหานคร 10110');
  // A bare "แขวง"/"เขต" with nothing after it is the bug this guards.
  assert.ok(!out.includes('แขวง'), 'no orphaned แขวง');
  assert.ok(!out.includes('เขต'), 'no orphaned เขต');
});

test('CONTROL: those same probes DO fire when the fields are present', () => {
  // Without this, the assertions above pass against any string at all —
  // including one where the prefixes were removed from the function entirely.
  const out = formatBillingAddress(BKK);
  assert.ok(out.includes('แขวง'), 'แขวง appears when subDistrict is set');
  assert.ok(out.includes('เขต'), 'เขต appears when district is set');
});

test('an empty thaiAddress yields an empty string, not a run of prefixes', () => {
  assert.equal(formatBillingAddress({ country: 'TH', thaiAddress: {} }), '');
  assert.equal(formatBillingAddress({ country: 'TH' }), '');
});

test('a falsy invoice returns an empty string', () => {
  for (const falsy of [null, undefined, 0, '', false]) {
    assert.equal(formatBillingAddress(falsy), '');
  }
});
