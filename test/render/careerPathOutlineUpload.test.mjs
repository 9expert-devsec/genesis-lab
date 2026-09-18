// CareerPathOutlineUpload — what the admin sees for each stored value.
//
// Three states matter and each is a different promise to the admin:
//   · nothing stored      → "ยังไม่มีไฟล์", upload enabled once a slug exists
//   · one of OUR paths    → the path, a link to open it, replace-upload
//   · an external paste   → the SAME link kept (never blanked), labelled
//                           external, with the upload offered to replace it
// renderToStaticMarkup only — the upload flow itself is a server action and
// is stubbed to throw in this tier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { CareerPathOutlineUpload } from '@/components/admin/CareerPathOutlineUpload';

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const render = (props) => docOf(renderToStaticMarkup(createElement(CareerPathOutlineUpload, {
  lang: 'th', apiSlug: 'rpa-developer', careerPathId: 'abc', label: 'ภาษาไทย (TH)', onChange: () => {}, ...props,
})));

const OURS = '/files/course-outline/career-rpa-developer-course-outline-th.pdf';
const EXTERNAL = 'https://9exp.link/rpa-developer-course-outline';

test('empty: says there is no file, offers an upload, no clear button, no link', () => {
  const doc = render({ value: '' });
  assert.match(doc.body.textContent, /ยังไม่มีไฟล์/);
  assert.match(doc.body.textContent, /อัปโหลด PDF/);
  assert.equal(doc.querySelector('a'), null, 'nothing to open');
  assert.doesNotMatch(doc.body.textContent, /ล้างค่า/);
  const input = doc.querySelector('input[type="file"]');
  assert.ok(input);
  assert.equal(input.getAttribute('accept'), 'application/pdf,.pdf');
  assert.equal(input.hasAttribute('disabled'), false, 'a slug is present, so the upload is enabled');
});

test('empty + no slug: the upload is disabled and the reason names the slug', () => {
  const doc = render({ value: '', apiSlug: '' });
  assert.equal(doc.querySelector('input[type="file"]').hasAttribute('disabled'), true);
  assert.match(doc.body.textContent, /กรอก slug ก่อน/);
});

test('our path: shows it, links to it, offers replace, is NOT labelled external', () => {
  const doc = render({ value: OURS });
  assert.equal(doc.querySelector('code').textContent, OURS);
  const open = [...doc.querySelectorAll('a')].find((a) => a.getAttribute('href') === OURS);
  assert.ok(open, 'a link opens the stored file');
  assert.equal(open.getAttribute('target'), '_blank');
  assert.match(open.getAttribute('rel'), /noopener/);
  assert.match(doc.body.textContent, /อัปโหลดแทนที่ \(PDF\)/);
  assert.match(doc.body.textContent, /ล้างค่า/);
  assert.doesNotMatch(doc.body.textContent, /ลิงก์ภายนอก/);
});

test('external paste: the link is KEPT and rendered, labelled external, upload offered to replace', () => {
  const doc = render({ value: EXTERNAL });
  assert.equal(doc.querySelector('code').textContent, EXTERNAL, 'never blanked');
  const open = [...doc.querySelectorAll('a')].find((a) => a.getAttribute('href') === EXTERNAL);
  assert.ok(open, 'the working external link is still openable');
  assert.match(doc.body.textContent, /ลิงก์ภายนอก \(ค่าเดิม\)/);
  assert.match(doc.body.textContent, /อัปโหลดแทนที่ \(PDF\)/);
});

test('the component never renders a text input for the path — the client cannot type one', () => {
  for (const value of ['', OURS, EXTERNAL]) {
    const doc = render({ value });
    assert.equal(doc.querySelector('input[type="text"]'), null);
    assert.equal(doc.querySelector('input[type="url"]'), null);
    assert.equal(doc.querySelector('textarea'), null);
  }
});

test('CONTROL: the external label really is keyed on the path shape, not on the presence of a value', () => {
  assert.doesNotMatch(render({ value: OURS }).body.textContent, /ค่าเดิม/);
  assert.match(render({ value: '9exp.link/no-scheme' }).body.textContent, /ลิงก์ภายนอก/, 'a scheme-less paste is external too');
});
