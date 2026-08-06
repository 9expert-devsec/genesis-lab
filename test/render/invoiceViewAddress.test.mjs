import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvoiceView } from '@/components/registration/PreviewRows';

/**
 * InvoiceView is the step-2 review block, shared by BOTH faces of step 2 —
 * StepPreview (payment toggle OFF) and ReviewAndPayStep (toggle ON) — so this
 * one component is the whole customer-facing review surface for the address.
 *
 * Rendered rather than source-scanned: what matters is that the prefixes reach
 * the screen, not which expression produced them.
 */

const base = {
  type: 'corporate',
  country: 'TH',
  companyName: 'ACME จำกัด',
  taxId: '0123456789012',
};

const thai = (province, postalCode) => ({
  ...base,
  thaiAddress: {
    addressLine: '1 ถนนสุขุมวิท',
    subDistrict: 'ลาดพร้าว',
    district: 'ลาดพร้าว',
    province,
    postalCode,
  },
});

const html = (invoice) => renderToStaticMarkup(createElement(InvoiceView, { invoice }));

test('the review screen shows a Bangkok address with แขวง/เขต', () => {
  const out = html(thai('กรุงเทพมหานคร', '10230'));
  assert.ok(out.includes('แขวงลาดพร้าว'), 'แขวง prefix reaches the screen');
  assert.ok(out.includes('เขตลาดพร้าว'), 'เขต prefix reaches the screen');
});

test('THE BUG, pinned: the review screen no longer shows the bare join', () => {
  const out = html(thai('กรุงเทพมหานคร', '10230'));
  assert.ok(
    !out.includes('1 ถนนสุขุมวิท ลาดพร้าว ลาดพร้าว กรุงเทพมหานคร 10230'),
    'the prefix-less string is exactly what the customer used to read'
  );
});

test('an upcountry address renders ตำบล/อำเภอ/จังหวัด', () => {
  const out = html(thai('เชียงใหม่', '50000'));
  assert.ok(out.includes('ตำบลลาดพร้าว'));
  assert.ok(out.includes('อำเภอลาดพร้าว'));
  assert.ok(out.includes('จังหวัดเชียงใหม่'));
});

test('CONTROL: the rendered row is driven by the province, not a constant', () => {
  // Identical subDistrict/district either side — only the province differs. A
  // row hardcoded to one branch (or back to a flat join) collapses these two.
  const bkk = html(thai('กรุงเทพมหานคร', '10230'));
  const up = html(thai('เชียงใหม่', '50000'));
  assert.ok(bkk.includes('แขวงลาดพร้าว') && !bkk.includes('ตำบลลาดพร้าว'));
  assert.ok(up.includes('ตำบลลาดพร้าว') && !up.includes('แขวงลาดพร้าว'));
});

test('CONTROL: the address row renders at all, and only under country TH', () => {
  // Proves the "no bare join" assertion is not passing because the row vanished.
  assert.ok(html(thai('กรุงเทพมหานคร', '10230')).includes('ที่อยู่'), 'the row is present');
  const noAddr = html({ ...base, thaiAddress: null });
  assert.ok(!noAddr.includes('ที่อยู่'), 'and absent when there is no address');
});

// ── The international row, deliberately NOT changed in this commit ──────────

test('the international row still renders its own comma-joined address', () => {
  // Out of scope by instruction — the outer country conditionals were left
  // as-is. If this goes red, the international rendering changed shape when it
  // was not supposed to.
  const out = html({
    ...base,
    country: 'OTHER',
    internationalAddress: {
      line1: '1 Raffles Place',
      city: 'Singapore',
      postalCode: '048616',
      country: 'Singapore',
    },
  });
  assert.ok(out.includes('1 Raffles Place, Singapore, 048616, Singapore'));
  assert.ok(!out.includes('แขวง') && !out.includes('ตำบล'));
});
