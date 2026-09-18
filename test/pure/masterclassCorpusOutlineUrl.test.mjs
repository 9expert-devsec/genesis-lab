// The corpus hands the chatbot an ABSOLUTE outline URL, whichever shape is stored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absoluteOutlineUrl, masterclassCourseItem } from '@/lib/corpus/masterclass';
import { CORPUS_PUBLIC_ORIGIN } from '@/lib/corpus/promotions';

test('a /files path gets the corpus origin prefixed', () => {
  assert.equal(
    absoluteOutlineUrl('/files/masterclass-outline/mas-ai-dmc-course-outline-th.pdf'),
    `${CORPUS_PUBLIC_ORIGIN}/files/masterclass-outline/mas-ai-dmc-course-outline-th.pdf`,
  );
  assert.equal(CORPUS_PUBLIC_ORIGIN, 'https://www.9experttraining.com', 'the origin the rest of the corpus already uses');
  assert.equal(absoluteOutlineUrl('/x.pdf', 'https://example.test'), 'https://example.test/x.pdf', 'origin is injectable');
});

test('a full http(s) URL — the two live Cloudinary files — passes through untouched', () => {
  const live = 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1783332535/masterclass-ai-digital-marketing-creator_trvpnp.pdf';
  assert.equal(absoluteOutlineUrl(live), live);
  assert.equal(absoluteOutlineUrl('  ' + live + '  '), live, 'trimmed, not altered');
  assert.equal(absoluteOutlineUrl('http://example.com/a.pdf'), 'http://example.com/a.pdf');
  assert.equal(absoluteOutlineUrl('HTTPS://EXAMPLE.COM/A.PDF'), 'HTTPS://EXAMPLE.COM/A.PDF', 'scheme case does not matter');
});

test('anything else is null', () => {
  for (const bad of ['', '   ', null, undefined, 'files/a/b.pdf', '9exp.link/x', 'ftp://x/a.pdf', 'javascript:alert(1)']) {
    assert.equal(absoluteOutlineUrl(bad), null, JSON.stringify(bad));
  }
});

test('masterclassCourseItem emits it through the same rule', () => {
  const base = { _id: 'id1', slug: 'mas-ai-dmc', title_th: 'T' };
  assert.equal(
    masterclassCourseItem({ ...base, course_outline_url: '/files/masterclass-outline/mas-ai-dmc-course-outline-th.pdf' }).outline_pdf_url,
    `${CORPUS_PUBLIC_ORIGIN}/files/masterclass-outline/mas-ai-dmc-course-outline-th.pdf`,
  );
  assert.equal(masterclassCourseItem({ ...base, course_outline_url: 'https://res.cloudinary.com/x/outline.pdf' }).outline_pdf_url, 'https://res.cloudinary.com/x/outline.pdf');
  assert.equal(masterclassCourseItem({ ...base, course_outline_url: '' }).outline_pdf_url, null);
  assert.equal(masterclassCourseItem({ ...base, course_outline_url: 'not a link' }).outline_pdf_url, null);
});
