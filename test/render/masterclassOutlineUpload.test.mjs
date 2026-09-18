// MasterclassOutlineUpload — display-only value, three states, no text input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { MasterclassOutlineUpload } from '@/components/admin/MasterclassOutlineUpload';

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const render = (props) => docOf(renderToStaticMarkup(createElement(MasterclassOutlineUpload, {
  lang: 'th', slug: 'mas-ai-dmc', courseId: 'abc', label: 'ภาษาไทย (TH)', onChange: () => {}, ...props,
})));

const OURS = '/files/masterclass-outline/mas-ai-dmc-course-outline-th.pdf';
const CLOUDINARY = 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1783332535/masterclass-ai-digital-marketing-creator_trvpnp.pdf';

test('empty: no file, upload enabled with a slug, disabled without one', () => {
  const doc = render({ value: '' });
  assert.match(doc.body.textContent, /ยังไม่มีไฟล์/);
  assert.equal(doc.querySelector('a'), null);
  assert.equal(doc.querySelector('input[type="file"]').hasAttribute('disabled'), false);
  const noSlug = render({ value: '', slug: '' });
  assert.equal(noSlug.querySelector('input[type="file"]').hasAttribute('disabled'), true);
  assert.match(noSlug.body.textContent, /กรอก slug ก่อน/);
});

test('our path: shown, openable via ดูไฟล์ที่อัพโหลด, replace offered, not labelled external', () => {
  const doc = render({ value: OURS });
  assert.equal(doc.querySelector('code').textContent, OURS);
  const open = [...doc.querySelectorAll('a')].find((a) => a.getAttribute('href') === OURS);
  assert.ok(open);
  assert.match(open.textContent, /ดูไฟล์ที่อัพโหลด/);
  assert.equal(open.getAttribute('target'), '_blank');
  assert.match(doc.body.textContent, /อัปโหลดแทนที่ \(PDF\)/);
  assert.doesNotMatch(doc.body.textContent, /ลิงก์ภายนอก/);
});

test('the live Cloudinary URL (transition): kept, openable, labelled external, upload offered', () => {
  const doc = render({ value: CLOUDINARY });
  assert.equal(doc.querySelector('code').textContent, CLOUDINARY);
  assert.ok([...doc.querySelectorAll('a')].find((a) => a.getAttribute('href') === CLOUDINARY), 'the working link is still openable');
  assert.match(doc.body.textContent, /ลิงก์ภายนอก \(ค่าเดิม\)/);
  assert.match(doc.body.textContent, /อัปโหลดแทนที่ \(PDF\)/);
});

test('a value that is not a link is shown but gets no anchor', () => {
  const doc = render({ value: '9exp.link/x' });
  assert.equal(doc.querySelector('code').textContent, '9exp.link/x');
  assert.equal(doc.querySelector('a'), null, 'no href for a non-link value');
});

test('never a text input: the value is display-only in every state', () => {
  for (const value of ['', OURS, CLOUDINARY]) {
    const doc = render({ value });
    assert.equal(doc.querySelector('input[type="text"]'), null);
    assert.equal(doc.querySelector('input[type="url"]'), null);
    assert.equal(doc.querySelector('textarea'), null);
    assert.equal(doc.querySelector('input[type="file"]').getAttribute('accept'), 'application/pdf,.pdf');
  }
});
