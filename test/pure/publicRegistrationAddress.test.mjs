import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoiceDisplay } from '@/lib/registration/build-public';
import { formatBillingAddress } from '@/lib/address/formatBillingAddress';

/**
 * buildInvoiceDisplay produces the flat `invoiceAddress` string that every
 * public-registration email renders. It used to hand-roll a bare
 * `[...].join(' ')`, which is what put "ลาดพร้าว ลาดพร้าว กรุงเทพมหานคร 10230"
 * — no แขวง, no เขต — on customer quotations.
 *
 * Behavioural, not a source scan: this module is pure and importable, so the
 * output itself is what gets pinned. The source-level guard for the call sites
 * that CANNOT be imported lives in test/fs/sharedAddressFormatterWiring.
 */

const BKK_INVOICE = {
  country: 'TH',
  thaiAddress: {
    addressLine: '1 ถนนสุขุมวิท',
    subDistrict: 'ลาดพร้าว',
    district: 'ลาดพร้าว',
    province: 'กรุงเทพมหานคร',
    postalCode: '10230',
  },
};

const UPCOUNTRY_INVOICE = {
  country: 'TH',
  thaiAddress: { ...BKK_INVOICE.thaiAddress, province: 'เชียงใหม่', postalCode: '50000' },
};

const FOREIGN_INVOICE = {
  country: 'OTHER',
  internationalAddress: {
    line1: '1 Raffles Place',
    city: 'Singapore',
    postalCode: '048616',
    country: 'Singapore',
  },
};

test('a Bangkok invoice reaches the email with แขวง/เขต prefixes', () => {
  const { invoiceAddress } = buildInvoiceDisplay({ invoice: BKK_INVOICE });
  assert.equal(invoiceAddress, '1 ถนนสุขุมวิท แขวงลาดพร้าว เขตลาดพร้าว กรุงเทพมหานคร 10230');
});

test('THE BUG, pinned: the prefix-less join must never come back', () => {
  // The exact string the old code produced. Named as data rather than probed
  // piecemeal so the regression is unmistakable in the failure output.
  const { invoiceAddress } = buildInvoiceDisplay({ invoice: BKK_INVOICE });
  assert.notEqual(invoiceAddress, '1 ถนนสุขุมวิท ลาดพร้าว ลาดพร้าว กรุงเทพมหานคร 10230');
});

test('an upcountry invoice gets ตำบล/อำเภอ/จังหวัด', () => {
  const { invoiceAddress } = buildInvoiceDisplay({ invoice: UPCOUNTRY_INVOICE });
  assert.equal(invoiceAddress, '1 ถนนสุขุมวิท ตำบลลาดพร้าว อำเภอลาดพร้าว จังหวัดเชียงใหม่ 50000');
});

test('CONTROL: the two provinces still diverge through buildInvoiceDisplay', () => {
  // Same fixture fields either side. If the builder stopped delegating and went
  // back to a flat join, both of these collapse to the same prefix-less string
  // and this goes red — the branch has to survive the delegation, not just
  // exist inside the formatter.
  const bkk = buildInvoiceDisplay({ invoice: BKK_INVOICE }).invoiceAddress;
  const up = buildInvoiceDisplay({ invoice: UPCOUNTRY_INVOICE }).invoiceAddress;
  assert.notEqual(bkk, up);
  assert.ok(bkk.includes('แขวง') && !bkk.includes('ตำบล'));
  assert.ok(up.includes('ตำบล') && !up.includes('แขวง'));
});

test('it delegates to the shared formatter rather than reimplementing it', () => {
  // Equality with formatBillingAddress across all three shapes. A local copy of
  // the prefix logic would satisfy the assertions above but drift from the
  // masterclass flow the moment either side is edited.
  for (const invoice of [BKK_INVOICE, UPCOUNTRY_INVOICE, FOREIGN_INVOICE]) {
    assert.equal(
      buildInvoiceDisplay({ invoice }).invoiceAddress,
      formatBillingAddress(invoice)
    );
  }
});

// ── International + edges, unchanged by this fix but pinned against drift ────

test('the international branch is still comma-joined', () => {
  const { invoiceCountry, invoiceAddress } = buildInvoiceDisplay({ invoice: FOREIGN_INVOICE });
  assert.equal(invoiceCountry, 'OTHER');
  assert.equal(invoiceAddress, '1 Raffles Place, Singapore, 048616, Singapore');
});

test('CONTROL: the international result differs from the Thai formatting', () => {
  // Guards against a delegation that ignored country and ran everything through
  // the Thai branch — which would return '' here, not a comma-joined line.
  const foreign = buildInvoiceDisplay({ invoice: FOREIGN_INVOICE }).invoiceAddress;
  assert.ok(foreign.includes(', '), 'comma-joined');
  assert.ok(!foreign.includes('แขวง') && !foreign.includes('ตำบล'));
});

test('invoiceCountry still defaults to TH, and no invoice yields an empty address', () => {
  assert.deepEqual(buildInvoiceDisplay({}), { invoiceCountry: 'TH', invoiceAddress: '' });
  assert.deepEqual(buildInvoiceDisplay({ invoice: null }), { invoiceCountry: 'TH', invoiceAddress: '' });
});
