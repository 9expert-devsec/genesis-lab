import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WritersAdminClient } from '@/app/admin/writers/_components/WritersAdminClient';

/**
 * The rendered list. Nothing is seeded on a local run, so the populated table
 * can only be seen here.
 */

const academy = {
  _id: 'a', slug: '9expert-academy', displayName: '9Expert Academy', type: 'organization',
  avatarPublicId: '', isActive: true, isDefault: true, instructorName: '', articleCount: 0,
};
const vate = {
  _id: 'b', slug: 'chalaivate', displayName: 'อ.เวท', type: 'person',
  avatarPublicId: 'writers/abc', isActive: true, isDefault: false,
  instructorName: 'อ.ชไลเวท พิพัฒพรรณวงศ์', articleCount: 7,
};
const off = { ...vate, _id: 'c', slug: 'gone', displayName: 'ปิดแล้ว', isActive: false, instructorName: '', articleCount: 0 };

const render = (props) => renderToStaticMarkup(createElement(WritersAdminClient, {
  rows: [academy, vate, off],
  counts: { all: 3, active: 2, inactive: 1 },
  status: 'all',
  q: '',
  ...props,
}));

const rowOf = (html, slug) => {
  const end = html.indexOf(`/writer/${slug}`);
  assert.notEqual(end, -1, `${slug} is not on the page`);
  const start = html.lastIndexOf('<tr', end);
  return html.slice(start, html.indexOf('</tr>', end));
};

test('the header and the footer note are the agreed Thai', () => {
  const html = render();
  assert.match(html, />ผู้เขียน</);
  assert.match(html, /โปรไฟล์ผู้เขียนบทความ — แสดงที่ \/writer/);
  assert.match(html, /เพิ่มผู้เขียน/);
  assert.match(html, /9Expert Academy ปิดใช้งาน\/ลบไม่ได้/);
});

test('the tabs show the counts they were given', () => {
  const html = render({ counts: { all: 12, active: 9, inactive: 3 } });
  assert.match(html, /ทั้งหมด 12/);
  assert.match(html, /ใช้งาน 9/);
  assert.match(html, /ปิดใช้งาน 3/);
});

test('the tab the URL names is the pressed one', () => {
  const html = render({ status: 'inactive' });
  assert.match(html, /aria-pressed="true"[^>]*>ปิดใช้งาน|data-testid="writers-tab-inactive" aria-pressed="true"/);
  assert.match(html, /data-testid="writers-tab-all" aria-pressed="false"/);
});

test('the default writer has its pill, a disabled toggle and a lock', () => {
  const row = rowOf(render(), '9expert-academy');
  assert.match(row, /ผู้เขียนหลัก/);
  assert.match(row, /role="switch"[^>]*disabled=""/);
  assert.match(row, /data-testid="writer-lock"/);
});

test('CONTROL: an ordinary writer has none of those', () => {
  const row = rowOf(render(), 'chalaivate');
  assert.doesNotMatch(row, /ผู้เขียนหลัก/);
  assert.doesNotMatch(row, /role="switch"[^>]*disabled=""/);
  assert.doesNotMatch(row, /data-testid="writer-lock"/);
});

test('a row shows its type, instructor and computed article count', () => {
  const row = rowOf(render(), 'chalaivate');
  assert.match(row, /บุคคล/);
  assert.match(row, /อ\.ชไลเวท พิพัฒพรรณวงศ์/);
  assert.match(row, />7</);
  assert.match(rowOf(render(), '9expert-academy'), /องค์กร/);
});

test('no linked instructor renders as a dash', () => {
  assert.match(rowOf(render(), '9expert-academy'), />—</);
});

test('only an inactive row is dimmed', () => {
  assert.match(rowOf(render(), 'gone'), /opacity-50/);
  assert.doesNotMatch(rowOf(render(), 'chalaivate'), /opacity-50/);
});

test('the avatar is delivered through avatarUrl, and a missing one uses the default', () => {
  assert.match(rowOf(render(), 'chalaivate'), /res\.cloudinary\.com[^"]*writers\/abc/);
  assert.match(rowOf(render(), '9expert-academy'), /\/avatar\/avatar-default-/);
});

test('an empty collection says to run the seed', () => {
  const html = render({ rows: [], counts: { all: 0, active: 0, inactive: 0 } });
  assert.match(html, /ยังไม่มีผู้เขียน — รัน seed เพื่อสร้าง 9Expert Academy/);
});

test('CONTROL: an empty filter result does not say that', () => {
  const html = render({ rows: [], status: 'inactive', q: 'zzz' });
  assert.doesNotMatch(html, /รัน seed/);
  assert.match(html, /ไม่พบผู้เขียนตามเงื่อนไขนี้/);
});
