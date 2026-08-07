import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  RegistrationDetailClient,
  InvoiceEditForm,
} from '@/app/admin/registrations/_components/RegistrationDetailClient';

/**
 * The admin edit surface gets the SAME branch control as the public form.
 *
 * This path does not run the zod schema — `updateRegistration` trusts its
 * inputs — so a free-text box here is a way for an admin to write a branch
 * value the customer-facing form would have rejected, after which the two
 * representations disagree with nothing to say which was meant. The control is
 * therefore the enforcement, and this file is what pins it.
 *
 * ── ATTRIBUTE PROBES ARE `attr=""`, NEVER THE BARE NAME ─────────────────────
 * `disabled` matches `disabled:opacity-30` in Tailwind markup, and `selected`
 * matches nothing useful either. Every attribute assertion below is written as
 * `attr=""` or `attr="value"`.
 */

const NOOP = () => {};

const TH_ADDR = {
  addressLine: '1 ถนนสุขุมวิท',
  subDistrict: 'ลาดพร้าว',
  district:    'ลาดพร้าว',
  province:    'กรุงเทพมหานคร',
  postalCode:  '10230',
};

const CORPORATE = {
  type: 'corporate',
  country: 'TH',
  companyName: 'บริษัท ตัวอย่าง จำกัด',
  taxId: '0105556012345',
  branchType: 'head_office',
  branchCode: '',
  thaiAddress: TH_ADDR,
  internationalAddress: null,
};

const editHtml = (invoice) =>
  renderToStaticMarkup(
    createElement(InvoiceEditForm, {
      requestInvoice: true,
      setRequestInvoice: NOOP,
      invoice,
      setInvoice: NOOP,
    })
  );

const hasLabel = (out, label) => out.includes(`>${label}<`);

// ── The control itself ──────────────────────────────────────────────────────

test('the corporate edit view renders a branch SELECT, not a text box', () => {
  const out = editHtml(CORPORATE);
  assert.ok(out.includes('<select'), 'there is a select');
  assert.ok(hasLabel(out, 'สำนักงานใหญ่'), 'head-office option');
  assert.ok(hasLabel(out, 'สาขาย่อย'), 'sub-branch option');
});

test('the head-office option is the one SELECTED for a head-office invoice', () => {
  const out = editHtml(CORPORATE);
  // `selected=""`, not a bare `selected` — see the header note.
  assert.ok(
    /<option value="head_office" selected="">/.test(out),
    'head_office must be the selected option'
  );
  assert.equal(/<option value="branch" selected="">/.test(out), false);
});

test('the sub-branch option is selected for a sub-branch invoice', () => {
  const out = editHtml({ ...CORPORATE, branchType: 'branch', branchCode: '00001' });
  assert.ok(/<option value="branch" selected="">/.test(out));
  assert.equal(/<option value="head_office" selected="">/.test(out), false);
});

test('the CODE input renders only for สาขาย่อย', () => {
  assert.equal(hasLabel(editHtml(CORPORATE), 'เลขที่สาขา'), false, 'hidden for head office');

  const sub = editHtml({ ...CORPORATE, branchType: 'branch', branchCode: '00001' });
  assert.ok(hasLabel(sub, 'เลขที่สาขา'), 'shown for a sub-branch');
  assert.ok(sub.includes('value="00001"'), 'and it carries the code');
});

test('the old free-text branch box is gone', () => {
  const out = editHtml(CORPORATE);
  assert.equal(hasLabel(out, 'สาขา (ถ้ามี)'), false, 'the free-text label must not render');
});

test('an INDIVIDUAL invoice gets no branch control at all', () => {
  const out = editHtml({ ...CORPORATE, type: 'individual', firstName: 'สมชาย', lastName: 'ใจดี' });
  assert.equal(hasLabel(out, 'สาขา'), false);
  assert.equal(hasLabel(out, 'เลขที่สาขา'), false);
});

test("a FOREIGN corporate invoice keeps free text and drops the dropdown", () => {
  const out = editHtml({
    ...CORPORATE,
    country: 'OTHER',
    thaiAddress: null,
    branchFree: 'Asia Pacific HQ',
    internationalAddress: { line1: '1 Raffles Place', line2: '', city: 'Singapore', state: '', postalCode: '048616', country: 'Singapore' },
  });
  assert.ok(hasLabel(out, 'Branch / Division (optional)'));
  assert.ok(out.includes('value="Asia Pacific HQ"'));
  assert.equal(hasLabel(out, 'สาขาย่อย'), false, 'a Thai branch number is meaningless abroad');
});

test('CONTROL: the `selected=""` probe DOES fire, and the bare word would not discriminate', () => {
  /**
   * Without the first assertion, every "is not selected" check above would pass
   * against markup that never emits the attribute at all. The second is the
   * Tailwind trap stated as data: a bare attribute-name probe matches class
   * text, so it cannot be used to assert an attribute's presence.
   */
  const out = editHtml(CORPORATE);
  assert.ok(out.includes('selected=""'), 'the attribute really is emitted');
  assert.ok(
    out.includes('disabled:') || out.includes('focus-visible:'),
    'this markup carries Tailwind variant classes — the reason bare-name probes are banned'
  );
});

// ── The read view ───────────────────────────────────────────────────────────

const DOC = {
  _id: '000000000000000000000001',
  status: 'pending',
  createdAt: '2026-08-01T03:00:00.000Z',
  updatedAt: '2026-08-01T03:00:00.000Z',
  courseName: 'Power BI Essentials',
  classDate: '10-11 ก.ย. 2569',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0891112222', isAttending: true },
  attendeesCount: 1,
  attendeesListProvided: true,
  attendees: [],
  requestInvoice: true,
  invoice: CORPORATE,
};

const readHtml = (invoice) =>
  renderToStaticMarkup(createElement(RegistrationDetailClient, { doc: { ...DOC, invoice } }));

test('the read view derives the label from the structured pair', () => {
  assert.ok(readHtml(CORPORATE).includes('>สำนักงานใหญ่<'));
  assert.ok(readHtml({ ...CORPORATE, branchType: 'branch', branchCode: '00007' }).includes('>สาขาที่ 00007<'));
});

test('the read view still shows a LEGACY free-text branch', () => {
  // Documents written before the split hold `branch` and no branchType. The row
  // must not vanish for them.
  const { branchType, branchCode, ...legacy } = CORPORATE;
  assert.ok(readHtml({ ...legacy, branch: 'สาขาบางนา' }).includes('>สาขาบางนา<'));
});

test('the read view hides the row when there is nothing to say', () => {
  const { branchType, branchCode, ...none } = CORPORATE;
  const out = readHtml(none);
  assert.equal(out.includes('>สาขา<'), false, 'no label without a value');
});
