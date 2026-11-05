import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_WRITER, DEFAULT_WRITER_SLUG, planDefaultWriterSeed } from '@/lib/writers/defaultWriter';

const now = new Date('2026-11-05T00:00:00Z');
const plan = (patch) => planDefaultWriterSeed({ existing: null, otherDefault: null, now, ...patch });

test('the default writer is the row the brief names', () => {
  assert.deepEqual({ ...DEFAULT_WRITER }, {
    slug: '9expert-academy',
    displayName: '9Expert Academy',
    type: 'organization',
    role: 'ทีมคอนเทนต์ 9Expert Training',
    isDefault: true,
    isActive: true,
  });
});

test('an empty collection plans one insert, with every array present', () => {
  const res = plan({});
  assert.equal(res.action, 'insert');
  assert.equal(res.doc.slug, DEFAULT_WRITER_SLUG);
  assert.equal(res.doc.isDefault, true);
  assert.deepEqual(res.doc.socialLinks, []);
  assert.deepEqual(res.doc.sections.experience, []);
  assert.equal(res.doc.createdAt, now);
});

test('a second run changes nothing', () => {
  assert.deepEqual(plan({ existing: plan({}).doc }), { action: 'noop' });
});

test('another default writer refuses the whole run', () => {
  const otherDefault = { slug: 'someone-else', isDefault: true };
  assert.deepEqual(plan({ otherDefault }), { action: 'refuse', otherDefault });
  assert.equal(plan({ otherDefault, existing: { isDefault: false } }).action, 'refuse');
});

test('a row that lost its flags gets the flags back, and nothing else', () => {
  const res = plan({ existing: { isDefault: false, isActive: false, displayName: 'แก้แล้ว' } });
  assert.equal(res.action, 'repair');
  assert.deepEqual(res.$set, { isDefault: true, isActive: true, updatedAt: now });
});

test('text an admin edited survives a re-run', () => {
  const edited = { ...plan({}).doc, displayName: 'แก้แล้ว', role: 'บทบาทใหม่' };
  assert.deepEqual(plan({ existing: edited }), { action: 'noop' });
});

test('the script is a dry run unless --apply, and never loads the Writer model', () => {
  const source = readFileSync(new URL('../../scripts/seed-default-writer.mjs', import.meta.url), 'utf8');
  assert.match(source, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.equal([...source.matchAll(/if \(APPLY\) await writers\./g)].length, 2, 'every write is behind APPLY');
  assert.equal((source.match(/writers\.(?:insertOne|updateOne)\(/g) ?? []).length, 2, 'and there are no others');
  assert.doesNotMatch(source, /from ['"][^'"]*models\/Writer/);
});
