import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentChanged, CONTENT_FIELDS } from '@/lib/articles/contentChanged';

/**
 * contentChanged decides whether a save moves `contentUpdatedAt`. A false
 * positive is the expensive direction: every no-op re-save would read as an
 * edit, which is exactly the problem with `updatedAt` this field exists to fix.
 */

const STORED = {
  title: 'Power BI คืออะไร',
  excerpt: 'สรุปสั้นๆ',
  content: '<p>เนื้อหา <strong>หลัก</strong></p>',
  coverUrl: 'https://res.cloudinary.com/x/cover.png',
};

test('the content fields are exactly title, excerpt, content, coverUrl', () => {
  assert.deepEqual(CONTENT_FIELDS, ['title', 'excerpt', 'content', 'coverUrl']);
});

test('unchanged → false', () => {
  assert.equal(contentChanged(STORED, { ...STORED }), false);
});

test('non-content fields differing → false', () => {
  assert.equal(
    contentChanged(STORED, { ...STORED, tags: ['x'], seoTitle: 'new', active: false, sortKey: 9 }),
    false,
  );
});

test('whitespace-only differences in the trimmed fields → false', () => {
  assert.equal(
    contentChanged(STORED, {
      ...STORED,
      title: `  ${STORED.title}  `,
      excerpt: `${STORED.excerpt}\n`,
      coverUrl: ` ${STORED.coverUrl}`,
    }),
    false,
  );
});

test('each content field changing on its own → true', () => {
  for (const [field, value] of [
    ['title', 'Power BI คืออะไร (2026)'],
    ['excerpt', 'สรุปใหม่'],
    ['content', '<p>เนื้อหาใหม่</p>'],
    ['coverUrl', 'https://res.cloudinary.com/x/other.png'],
  ]) {
    assert.equal(contentChanged(STORED, { ...STORED, [field]: value }), true, `${field} change missed`);
  }
});

test('stored HTML the sanitiser would rewrite, re-saved unchanged → false', () => {
  // A legacy body carrying an attribute the sanitiser strips. The save path
  // sanitises the incoming copy, so comparing raw stored bytes would call this
  // a change.
  const legacy = { ...STORED, content: '<p onclick="alert(1)">เนื้อหา <strong>หลัก</strong></p>' };
  assert.equal(contentChanged(legacy, { ...STORED }), false);
});

test('absent fields on either side compare as empty, not as a change', () => {
  assert.equal(contentChanged({ ...STORED, excerpt: undefined }, { ...STORED, excerpt: '' }), false);
  assert.equal(contentChanged({ ...STORED, coverUrl: null }, { ...STORED, coverUrl: '' }), false);
});
