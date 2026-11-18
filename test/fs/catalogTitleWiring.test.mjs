import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The program and skill branches of generateMetadata in the catch-all page
 * build their metadata through lib/seo/catalogPageMetadata — the brand-aware
 * title. test/pure/brandAwarePageTitle pins what that helper returns; this pins
 * that the page actually calls it, so an inline `return { title, … }` coming
 * back in either branch (the shape that rendered `… | 9Expert | 9Expert
 * Training`) goes red.
 *
 * Anchors are CODE (readSource strips comments).
 */

const PAGE = readSource('src/app/(public)/[...slug]/page.jsx');
const gmStart = PAGE.code.indexOf('export async function generateMetadata');
const gmEnd = PAGE.code.indexOf('export default async function', gmStart);
const GM = PAGE.code.slice(gmStart, gmEnd);

/** What the branch that destructures `anchor` returns first. */
function branchReturn(anchor) {
  const i = GM.indexOf(anchor);
  if (i < 0) return null;
  return GM.slice(i).match(/\breturn\s+([\w{]+)/)?.[1] ?? null;
}

test('generateMetadata is located', () => {
  assert.ok(gmStart >= 0 && gmEnd > gmStart, 'generateMetadata / default export moved — re-anchor');
});

for (const [kind, anchor] of [
  ['program', 'const { program, config } = resolved;'],
  ['skill', 'const { skill, config } = resolved;'],
]) {
  test(`${kind} branch returns catalogPageMetadata(…), not an inline object`, () => {
    assert.equal(branchReturn(anchor), 'catalogPageMetadata', `${kind} branch no longer brand-aware`);
  });
}

test('the helper is imported', () => {
  assert.match(PAGE.withImports, /import \{ catalogPageMetadata \} from ['"]@\/lib\/seo\/catalogPageMetadata['"]/);
});
