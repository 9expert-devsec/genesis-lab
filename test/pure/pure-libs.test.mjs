import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedSrc } from '@/lib/pageBuilder/embedSrc';
import { isKnownIconName } from '@/lib/pageBuilder/lucideIcon';
import { dataRefSignature } from '@/lib/pageBuilder/dataRefs';

test('embedSrc: youtube share URL → embed URL', () => {
  assert.equal(embedSrc('youtube', 'https://youtu.be/abcdef12345'), 'https://www.youtube.com/embed/abcdef12345');
});
test('embedSrc: vimeo URL → player URL', () => {
  assert.equal(embedSrc('vimeo', 'https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789');
});
test('embedSrc: junk → null (fail closed)', () => {
  assert.equal(embedSrc('youtube', 'not a url'), null);
});

test('lucideIcon: known PascalCase icon resolves', () => {
  assert.ok(isKnownIconName('Rocket') && isKnownIconName('ShieldCheck'));
});
test('lucideIcon: unknown name and non-icon exports rejected', () => {
  assert.ok(!isKnownIconName('NotAnIcon_zz') && !isKnownIconName('createLucideIcon') && !isKnownIconName('icons'));
});

test('dataRefSignature: stable when only non-ref content changes', () => {
  const base = [{ id: 'a', type: 'course_card', content: { courseId: 'A' } }];
  const same = [{ id: 'a', type: 'course_card', content: { courseId: 'A', note: 'ignored' } }];
  assert.equal(dataRefSignature(base), dataRefSignature(same));
});
test('dataRefSignature: changes when the ref changes', () => {
  const a = [{ id: 'a', type: 'course_card', content: { courseId: 'A' } }];
  const b = [{ id: 'a', type: 'course_card', content: { courseId: 'B' } }];
  assert.notEqual(dataRefSignature(a), dataRefSignature(b));
});
