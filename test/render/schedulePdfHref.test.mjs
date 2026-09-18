// During the transition the stored schedule URL is EITHER the old absolute
// Cloudinary secure_url OR the new root-relative /files path. Both must render
// as a working href on the two surfaces that read it: the admin client's
// เปิดไฟล์ link, and HeroPdfButton (the element /schedule renders).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import SchedulePDFClient from '@/app/admin/schedule-pdf/_components/SchedulePDFClient';
import { HeroPdfButton } from '@/components/ui/HeroPdfButton';

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const OLD = 'https://res.cloudinary.com/ddva7xvdt/raw/upload/v1789443533/9exp-genesis/schedule/schedule-1789443531635.pdf';
const NEW = '/files/schedule/9expert-training-schedule.pdf';

for (const [label, url] of [['old absolute secure_url', OLD], ['new /files path', NEW]]) {
  test(`admin client: ${label} renders as the เปิดไฟล์ href, with the stored filename and uploader`, () => {
    const doc = docOf(renderToStaticMarkup(createElement(SchedulePDFClient, {
      current: { url, filename: 'public-class-2026 - 2027.pdf', uploadedAt: '2026-09-15T03:38:54.608Z', uploadedBy: 'admin@example.test' },
    })));
    const open = [...doc.querySelectorAll('a')].find((a) => a.textContent.includes('เปิดไฟล์'));
    assert.ok(open, 'the open link exists');
    assert.equal(open.getAttribute('href'), url);
    assert.equal(open.getAttribute('target'), '_blank');
    assert.match(doc.body.textContent, /public-class-2026 - 2027\.pdf/);
    assert.match(doc.body.textContent, /admin@example\.test/);
    assert.match(doc.body.textContent, /อัปโหลดไฟล์ใหม่/, 'replace, not first upload');
  });

  test(`HeroPdfButton (what /schedule renders): ${label} is the href, no download attribute`, () => {
    const doc = docOf(renderToStaticMarkup(createElement(HeroPdfButton, { href: url }, 'ดาวน์โหลดตารางการฝึกอบรม')));
    const a = doc.querySelector('a');
    assert.ok(a);
    assert.equal(a.getAttribute('href'), url);
    assert.equal(a.hasAttribute('download'), false, 'inline-vs-save is decided by the response headers, not the anchor');
  });
}

test('admin client with no row: no link, first-upload wording', () => {
  const doc = docOf(renderToStaticMarkup(createElement(SchedulePDFClient, { current: null })));
  assert.equal([...doc.querySelectorAll('a')].find((a) => a.textContent.includes('เปิดไฟล์')), undefined);
  assert.match(doc.body.textContent, /อัปโหลดไฟล์/);
  assert.doesNotMatch(doc.body.textContent, /25 ?MB/, 'no stale size hint');
});
