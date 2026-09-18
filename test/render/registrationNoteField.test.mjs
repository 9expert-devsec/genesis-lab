// The note textarea, as rendered: the exact placeholder, maxLength=200 in the
// markup, and a counter that reflects the field's value. Two flows render
// statically with small fixtures (career-path Step2Form, InhouseStepForm);
// the fs guard covers the same wiring in the other three.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Step2Form } from '@/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient';
import { InhouseStepForm } from '@/components/registration/InhouseForm';
import { CUSTOMER_NOTE_MAX_LENGTH, CUSTOMER_NOTE_PLACEHOLDER } from '@/lib/registration/noteField';

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const PLACEHOLDER = 'เช่น ต้องการใบแจ้งหนี้ (ไม่เกิน 200 ตัวอักษร)';

const CP_DEFAULTS = (note) => ({
  contactFirstName: 'สมชาย', contactLastName: 'ใจดี', contactEmail: 'somchai@example.com', contactPhone: '0891112222',
  isCoordinator: true, attendeeCount: 1, skipAttendee: false, attendees: [], note,
  invoice: {
    type: 'individual', country: 'TH', firstName: '', lastName: '', companyName: '', branchType: 'head_office',
    branchCode: '', branchFree: '', taxId: '',
    thaiAddress: { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' },
    internationalAddress: null,
  },
});

function careerPath(note) {
  return docOf(renderToStaticMarkup(createElement(Step2Form, {
    defaultValues: CP_DEFAULTS(note), selected: {}, curriculum: [], onBack: () => {}, onSubmit: () => {},
  })));
}

function inhouse(initialValues) {
  return docOf(renderToStaticMarkup(createElement(InhouseStepForm, {
    courses: [{ id: 'DA-PBI', name: 'Power BI Essentials', program: 'Data' }],
    preselectedCourse: null, initialValues, onSubmit: () => {},
  })));
}

test('the constants render as the placeholder the ticket asked for, verbatim', () => {
  assert.equal(CUSTOMER_NOTE_PLACEHOLDER, PLACEHOLDER);
  assert.equal(CUSTOMER_NOTE_MAX_LENGTH, 200);
});

test('career-path: note textarea has the placeholder and maxlength=200; counter starts at 0/200', () => {
  const doc = careerPath('');
  const ta = doc.querySelector('textarea[name="note"]');
  assert.ok(ta, 'the note textarea renders');
  assert.equal(ta.getAttribute('placeholder'), PLACEHOLDER);
  assert.equal(ta.getAttribute('maxlength'), '200');
  assert.equal(doc.querySelector('[data-testid="notes-counter"]').textContent, '0/200');
});

test('career-path: the counter reflects the field value (183 chars → 183/200)', () => {
  // react-hook-form applies a registered default through the ref after mount,
  // so the static markup's <textarea> is empty either way; the counter, read
  // from watch(), is what proves the value is being counted.
  const doc = careerPath('x'.repeat(183));
  assert.equal(doc.querySelector('[data-testid="notes-counter"]').textContent, '183/200');
  assert.equal(careerPath('').querySelector('[data-testid="notes-counter"]').textContent, '0/200');
});

test('in-house: message textarea has the placeholder and maxlength=200; counter reflects the value', () => {
  const empty = inhouse(null);
  const ta = empty.querySelector('textarea[name="message"]');
  assert.ok(ta, 'the message textarea renders');
  assert.equal(ta.getAttribute('placeholder'), PLACEHOLDER);
  assert.equal(ta.getAttribute('maxlength'), '200');
  assert.equal(empty.querySelector('[data-testid="notes-counter"]').textContent, '0/200');
  const filled = inhouse({ message: 'ต้องการใบแจ้งหนี้' });
  assert.equal(filled.querySelector('[data-testid="notes-counter"]').textContent, `${'ต้องการใบแจ้งหนี้'.length}/200`);
});
