import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WriterDeactivateDialog } from '@/app/admin/writers/_components/WriterDeactivateDialog';

const writer = { _id: 'b', slug: 'chalaivate', displayName: 'อ.เวท', avatarPublicId: 'writers/abc' };
const preview = {
  total: 5,
  sole: 3,
  coWritten: 2,
  academy: { displayName: '9Expert Academy', avatarPublicId: 'writers/academy' },
};

const render = (props) => renderToStaticMarkup(createElement(WriterDeactivateDialog, {
  writer, preview, working: false, onCancel() {}, onConfirm() {}, ...props,
})).replace(/<!-- -->/g, '');

test('the title names the writer', () => {
  assert.match(render(), /ปิดใช้งาน อ\.เวท\?/);
});

test('the graphic shows both avatars and the total', () => {
  const html = render();
  assert.equal((html.match(/<img /g) ?? []).length, 2);
  assert.match(html, />5 บทความ</);
});

test('the four lines, with the real numbers', () => {
  const html = render();
  assert.ok(html.includes('บทความ 3 รายการที่ อ.เวท เขียนคนเดียว → ผู้เขียนเปลี่ยนเป็น 9Expert Academy'));
  assert.ok(html.includes('บทความ 2 รายการที่เขียนร่วมกับคนอื่น → เอาชื่อ อ.เวท ออก'));
  assert.ok(html.includes('หน้า /author/chalaivate จะ redirect ไปที่ /author/9expert-academy'));
  assert.ok(html.includes('เปิดใช้งานอีกครั้งได้ แต่บทความที่โอนไปแล้วจะไม่ย้ายกลับอัตโนมัติ'));
});

test('cancel and the danger button', () => {
  const html = render();
  assert.match(html, />ยกเลิก</);
  assert.match(html, /bg-red-600[^>]*>ปิดใช้งานและโอนบทความ</);
});

test('both buttons lock while it runs', () => {
  assert.equal((render({ working: true }).match(/disabled=""/g) ?? []).length, 2);
});
