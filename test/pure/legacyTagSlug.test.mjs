import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTagKey,
  buildTagIndex,
  resolveLegacyTag,
  legacySlugToText,
  safeDecode,
} from '@/lib/articles/legacyTagSlug';

/**
 * Legacy Drupal `/tags/<slug>` → Genesis article tag (TAGS-1).
 */

test('%c2%a0free (leading NBSP, encoded) and the tag "Free" share a key', () => {
  assert.equal(normalizeTagKey('%c2%a0free'), 'free');
  assert.equal(normalizeTagKey('Free'), 'free');
  const index = buildTagIndex([{ tag: 'Free', count: 3 }]);
  assert.equal(resolveLegacyTag('%c2%a0free', index)?.tag, 'Free');
});

test('Thai + hyphens matches the display tag with spaces', () => {
  const slug = encodeURIComponent('การใช้สูตร-excel');
  assert.equal(normalizeTagKey(slug), normalizeTagKey('การใช้สูตร Excel'));
  const index = buildTagIndex([{ tag: 'การใช้สูตร Excel', count: 2 }]);
  assert.equal(resolveLegacyTag(slug, index)?.tag, 'การใช้สูตร Excel');
});

test('c resolves to C# (punctuation dropped on both sides)', () => {
  assert.equal(normalizeTagKey('C#'), 'c');
  const index = buildTagIndex([{ tag: 'C#', count: 31 }, { tag: 'C# 9', count: 1 }, { tag: '.NET', count: 7 }]);
  assert.equal(resolveLegacyTag('c', index)?.tag, 'C#');
  assert.equal(resolveLegacyTag('c-9', index)?.tag, 'C# 9');
  assert.equal(resolveLegacyTag('net', index)?.tag, '.NET');
});

test('a malformed percent sequence is used raw, not thrown', () => {
  assert.equal(safeDecode('%E0%B8'), '%E0%B8');
  assert.equal(normalizeTagKey('%E0%B8'), '%e0%b8');
  assert.equal(resolveLegacyTag('%E0%B8', buildTagIndex([{ tag: 'Excel', count: 1 }])), null);
});

test('collision: most active articles wins; a tie goes to code-point order', () => {
  const index = buildTagIndex([
    { tag: 'Power BI', count: 101 },
    { tag: 'PowerBI', count: 2 },
    { tag: 'no-code', count: 4 },
    { tag: 'No Code', count: 4 },
  ]);
  const pbi = index.get('powerbi');
  assert.equal(pbi.tag, 'Power BI');
  assert.deepEqual(pbi.candidates, ['Power BI', 'PowerBI']);
  // 'N' (0x4E) sorts before 'n' (0x6E): deterministic regardless of locale.
  assert.equal(index.get('nocode').tag, 'No Code');
  // Input order does not change the winner.
  const reversed = buildTagIndex([{ tag: 'No Code', count: 4 }, { tag: 'no-code', count: 4 }]);
  assert.equal(reversed.get('nocode').tag, 'No Code');
});

test('other Unicode spaces, underscores and listed punctuation are stripped; Thai and digits survive', () => {
  assert.equal(normalizeTagKey(`ASP.NET${String.fromCharCode(0x2009)}Core_2`), 'aspnetcore2');
  assert.equal(normalizeTagKey("Map & Power Map (\"x\"): a/b, c+d 'e'"), 'mappowermapxabcde');
  assert.equal(normalizeTagKey('แปลงปี พ.ศ. 2567'), 'แปลงปีพศ2567');
});

test('unknown slug → null; free-text form turns hyphens and NBSP into spaces', () => {
  assert.equal(resolveLegacyTag('sql-server-view', buildTagIndex([{ tag: 'SQL', count: 9 }])), null);
  assert.equal(legacySlugToText('%c2%a0sql-server-view'), 'sql server view');
  assert.equal(legacySlugToText(encodeURIComponent('แยกชื่อ-นามสกุล-excel')), 'แยกชื่อ นามสกุล excel');
});
