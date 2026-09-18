// The note textarea, as rendered, on the two flows that render statically
// with small fixtures (career-path Step2Form, InhouseStepForm). Both are OUT
// of the 200-cap scope: they must show their own placeholder, carry no
// maxlength, and render no counter. The public wizard is not statically
// renderable; test/fs/registrationNoteFieldWiring pins its markup at source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Step2Form } from '@/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient';
import { InhouseStepForm } from '@/components/registration/InhouseForm';
import { CUSTOMER_NOTE_PLACEHOLDER } from '@/lib/registration/noteField';

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

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

test('the public placeholder is what the ticket asked for — and it appears on neither of these forms', () => {
  assert.equal(CUSTOMER_NOTE_PLACEHOLDER, 'เช่น ต้องการใบแจ้งหนี้ (ไม่เกิน 200 ตัวอักษร)');
  for (const doc of [careerPath('x'.repeat(300)), inhouse({ message: 'x'.repeat(300) })]) {
    assert.equal(doc.body.innerHTML.includes(CUSTOMER_NOTE_PLACEHOLDER), false);
    assert.equal(doc.querySelector('[data-testid="notes-counter"]'), null, 'no counter outside the public form');
  }
});

test('career-path: note textarea keeps its own placeholder and has no maxlength', () => {
  const ta = careerPath('').querySelector('textarea[name="note"]');
  assert.ok(ta, 'the note textarea renders');
  assert.equal(ta.getAttribute('placeholder'), 'ระบุข้อมูลเพิ่มเติม (ถ้ามี)');
  assert.equal(ta.hasAttribute('maxlength'), false);
});

test('in-house: message textarea keeps its own placeholder and has no maxlength', () => {
  const ta = inhouse(null).querySelector('textarea[name="message"]');
  assert.ok(ta, 'the message textarea renders');
  assert.equal(ta.getAttribute('placeholder'), 'ระบุข้อมูลเพิ่มเติม');
  assert.equal(ta.hasAttribute('maxlength'), false);
});
