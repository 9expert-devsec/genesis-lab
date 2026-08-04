import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceForScanning } from '../sourceScan.mjs';

/**
 * The seam between the sort and the two menus.
 *
 * The pure tier proves `sortSkillsByAdminOrder` is right; the render tier
 * proves the row components emit whatever array they are given. Neither can
 * see the join between them — the real mega panel and the real drawer are
 * both behind `useState` gates and this suite has no DOM, so no rendered
 * markup exists to assert on. That gap is what this file covers, and it
 * covers it the only way available: by reading the source.
 *
 * ── WHAT THIS CANNOT SEE ───────────────────────────────────────────────────
 * It is a text scan. It proves the call sites are SPELLED right, not that
 * React passes the value — a component could accept `orderedSkills` and render
 * something else entirely and this stays green. It is a floor under the seam,
 * not a substitute for the render tier above it.
 *
 * Comments are stripped before matching, or the prose explaining a rule
 * satisfies the assertion about the rule. That has already happened once in
 * this suite (see test/sourceScan.mjs).
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });

const HEADER = read('src/components/layout/PublicHeaderClient.jsx');
const NAVDATA = read('src/lib/navmenu/getNavMenuData.js');

/** How many times a pattern occurs. */
const count = (src, re) => (src.match(re) ?? []).length;

// ── the sort happens exactly once ──────────────────────────────────

test('PublicHeaderClient calls the sort exactly ONCE', () => {
  // Two call sites sorting independently is how the desktop and mobile menus
  // drift apart, and nobody opens both on the same commit. One call, one
  // array, handed to both.
  assert.equal(count(HEADER, /sortSkillsByAdminOrder\(/g), 1);
});

test('CONTROL: the counter would see a second call', () => {
  // Without this, a regex that matched nothing would satisfy the test above
  // only when the answer happened to be 0 — and it is 1, so prove it counts.
  const doubled = `${HEADER}\nconst extra = sortSkillsByAdminOrder(skills, {});`;
  assert.equal(count(doubled, /sortSkillsByAdminOrder\(/g), 2);
});

test('the config `skills` array is read ONLY by that one sort call', () => {
  // The regression this catches: a `.map()` over the imported config array
  // left behind at either menu, which would render the config order on one
  // surface and the admin order on the other.
  assert.equal(count(HEADER, /\bskills\.map\(/g), 0, 'a menu still maps the config array');
  assert.equal(count(HEADER, /\bskills\[0\]/g), 0, 'the auto-load still seeds from the config array');
  assert.match(HEADER, /sortSkillsByAdminOrder\(skills,/, 'the sort is what reads it');
});

test('CONTROL: a reintroduced config map IS caught', () => {
  const regressed = `${HEADER}\n{skills.map((s) => null)}`;
  assert.equal(count(regressed, /\bskills\.map\(/g), 1);
});

// ── both menus are fed the sorted array ────────────────────────────

test('both row components receive the sorted array', () => {
  assert.match(HEADER, /<DesktopSkillRows[\s\S]{0,200}?skills=\{orderedSkills\}/);
  assert.match(HEADER, /<MobileSkillRows[\s\S]{0,200}?skills=\{orderedSkills\}/);
});

test('the skills auto-load seeds from the ordered list', () => {
  // Col 3 opens showing the courses of `orderedSkills[0]`. Seeded from the
  // config array it would highlight a row further down the column and show a
  // different skill's courses — a wrong answer that looks like a working menu.
  assert.match(HEADER, /orderedSkills\[0\]/);
});

// ── the read, and its empty case ───────────────────────────────────

test('getNavMenuData returns skillOrder, and EMPTY carries it too', () => {
  assert.match(NAVDATA, /skillOrder:\s*buildSkillOrderMap\(/, 'the success path builds the map');
  assert.match(NAVDATA, /EMPTY\s*=\s*\{[\s\S]*?skillOrder:\s*\{\}/, 'the failure path returns {}');
});

test('CONTROL: EMPTY returning no skillOrder key would be caught', () => {
  // `{}` is "no admin opinion" → config order. An EMPTY that omitted the key
  // entirely would still work today (the header defaults it), but the two
  // spellings of "empty" are exactly how a later refactor makes one of them
  // mean "hidden". Pin the one that is written down.
  const stripped = NAVDATA.replace(/skillOrder:\s*\{\},?/, '');
  assert.doesNotMatch(stripped, /EMPTY\s*=\s*\{[\s\S]*?skillOrder:\s*\{\}/);
});
