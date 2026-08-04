import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepPreview } from '@/components/registration/RegisterWizard';
import { ReviewAndPayStep } from '@/components/registration/ReviewAndPayStep';
import { computePricing } from '@/lib/pricing';

// Step 2 of the public registration wizard has two faces, chosen by the
// course's `omisePaymentEnabled` toggle:
//   OFF → StepPreview      (quote only; NO payment controls at all)
//   ON  → ReviewAndPayStep (review + method/channel/consent/pay)
// These render both with the SAME data and assert the payment surface is
// present in exactly one of them. Every "absent" assertion is paired with the
// identical probe against the other component, so a probe that stopped
// matching anything would fail there rather than pass here by accident.

const DATA = {
  courseId: 'DA-PBI',
  courseCode: 'DA-PBI',
  courseName: 'Power BI Essentials',
  classId: 'sch-1',
  classDate: '10-11 ส.ค. 2569',
  scheduleType: 'classroom',
  coordinator: {
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    email: 'somchai@example.com',
    phone: '0812345678',
    isAttending: true,
  },
  attendeesCount: 2,
  attendeesListProvided: true,
  attendees: [
    { firstName: 'สมหญิง', lastName: 'ดีใจ', email: 'somying@example.com', phone: '0898765432' },
  ],
  requestInvoice: true,
  invoice: {
    type: 'corporate',
    country: 'TH',
    companyName: 'ACME จำกัด',
    taxId: '0123456789012',
    thaiAddress: {
      addressLine: '1 ถนนสุขุมวิท',
      subDistrict: 'คลองเตย',
      district: 'คลองเตย',
      province: 'กรุงเทพมหานคร',
      postalCode: '10110',
    },
  },
  notes: 'แพ้อาหารทะเล',
};

const PRICING = computePricing(10000, 2); // total 21,400.00

const noop = () => {};

const previewHtml = () =>
  renderToStaticMarkup(
    createElement(StepPreview, {
      data: DATA,
      onBack: noop,
      onConfirm: noop,
      submitting: false,
      error: null,
    }),
  );

const payHtml = (pricing) =>
  renderToStaticMarkup(
    createElement(ReviewAndPayStep, {
      data: DATA,
      pricing,
      onBack: noop,
      onQuoteConfirm: noop,
      onPaid: noop,
      submitting: false,
      error: null,
    }),
  );

// Strings that exist on the payment surface at FIRST paint. The channel
// picker and consent row are deliberately excluded — they only appear after
// the user picks a method, which a static render can't do.
const PAYMENT_PROBES = ['เลือกวิธีดำเนินการ', 'ชำระทันที', 'ขอใบเสนอราคา'];

/**
 * Every <button> in `html` whose own markup contains `text`. MethodRadio /
 * ChannelCard never nest a button, so slicing to the first </button> is exact.
 */
function buttonsContaining(html, text) {
  return html
    .split('<button')
    .slice(1)
    .map((chunk) => '<button' + chunk.slice(0, chunk.indexOf('</button>') + '</button>'.length))
    .filter((b) => b.includes(text));
}

// ── Toggle OFF: StepPreview has no payment surface ──────────────────────────

test('toggle OFF (StepPreview) renders the review data', () => {
  const html = previewHtml();
  assert.ok(html.includes('Power BI Essentials'), 'course name is on screen');
  assert.ok(html.includes('ข้อมูลผู้ประสานงาน'), 'coordinator section is on screen');
  assert.ok(html.includes('ยืนยันการสมัคร'), 'the quote submit button is on screen');
});

test('toggle OFF (StepPreview) renders NO payment method controls', () => {
  const html = previewHtml();
  for (const probe of PAYMENT_PROBES) {
    assert.equal(html.includes(probe), false, `StepPreview must not contain "${probe}"`);
  }
});

test('CONTROL: those same probes DO match ReviewAndPayStep', () => {
  // If this fails, the probes above stopped describing the payment surface and
  // the "absent" assertion was passing vacuously.
  const html = payHtml(PRICING);
  for (const probe of PAYMENT_PROBES) {
    assert.ok(html.includes(probe), `ReviewAndPayStep must contain "${probe}"`);
  }
});

test('CONTROL: both components render the same underlying review data', () => {
  // Proves the two renders are comparable — the difference above is the payment
  // surface, not one component failing to render at all. Only the course
  // section is asserted: ReviewAndPayStep opens that one by default and keeps
  // the rest collapsed, so it is the overlap between the two screens.
  for (const html of [previewHtml(), payHtml(PRICING)]) {
    assert.ok(html.includes('Power BI Essentials'), 'course name');
    assert.ok(html.includes('10-11 ส.ค. 2569'), 'class date');
  }
});

test('ReviewAndPayStep opens the course section and collapses the rest', () => {
  const html = payHtml(PRICING);
  assert.ok(html.includes('Power BI Essentials'), 'course section body is expanded');
  assert.ok(html.includes('ข้อมูลผู้ประสานงาน'), 'coordinator heading is present…');
  assert.equal(html.includes('somchai@example.com'), false, '…but its body is collapsed');
});

test('CONTROL: StepPreview (no collapsing) DOES render the collapsed body', () => {
  // Proves the collapse assertion above measures the collapsible Section and
  // not a component that simply never renders the coordinator email.
  assert.ok(previewHtml().includes('somchai@example.com'));
});

// ── Toggle ON: method radios ────────────────────────────────────────────────

test('toggle ON renders both method radios as pressable controls', () => {
  const html = payHtml(PRICING);
  const instant = buttonsContaining(html, 'ชำระทันที');
  const quote = buttonsContaining(html, 'ขอใบเสนอราคา');
  assert.equal(instant.length, 1, 'exactly one ชำระทันที radio');
  assert.equal(quote.length, 1, 'exactly one ขอใบเสนอราคา radio');
  assert.ok(instant[0].includes('aria-pressed'), 'instant radio exposes aria-pressed');
  assert.ok(quote[0].includes('aria-pressed'), 'quote radio exposes aria-pressed');
});

// ── pricing: null ───────────────────────────────────────────────────────────

test('pricing null: the instant option is disabled, the quote option is not', () => {
  const html = payHtml(null);
  const [instant] = buttonsContaining(html, 'ชำระทันที');
  const [quote] = buttonsContaining(html, 'ขอใบเสนอราคา');
  assert.ok(instant, 'instant radio still rendered');
  assert.ok(quote, 'quote radio still rendered');
  assert.ok(instant.includes('disabled=""'), 'ชำระทันที is disabled with no price');
  assert.equal(quote.includes('disabled=""'), false, 'ขอใบเสนอราคา stays available');
});

test('CONTROL: with a price, the instant option is NOT disabled', () => {
  // The disabled probe must be able to come back false, or the test above is
  // asserting nothing.
  const [instant] = buttonsContaining(payHtml(PRICING), 'ชำระทันที');
  assert.equal(instant.includes('disabled=""'), false);
});

test('pricing null: no amount is rendered anywhere, and the fallback copy is', () => {
  const html = payHtml(null);
  assert.equal(html.includes('บาท'), false, 'no THB amount may reach the screen');
  assert.ok(html.includes('ไม่สามารถคำนวณราคาได้'), 'the existing fallback copy is shown');
});

test('CONTROL: with a price, amounts ARE rendered and the fallback copy is not', () => {
  const html = payHtml(PRICING);
  assert.ok(html.includes('บาท'), 'amounts render when pricing exists');
  assert.ok(html.includes('21,400.00'), 'the computed total renders');
  assert.equal(html.includes('ไม่สามารถคำนวณราคาได้'), false);
});

// ── Wording kept from the registration flow, not the masterclass one ────────

test('the per-seat line says ราคาต่อท่าน (registration wording), not ราคาต่อที่นั่ง', () => {
  const html = payHtml(PRICING);
  assert.ok(html.includes('ราคาต่อท่าน'), 'registration wording is used');
  assert.equal(html.includes('ราคาต่อที่นั่ง'), false, 'masterclass wording did not leak in');
});
