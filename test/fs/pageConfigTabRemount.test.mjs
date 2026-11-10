import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * Switching Program URLs ↔ Skill URLs remounts the editor.
 *
 * The two <PageConfigEditor>s are the branches of one ternary, so React sees the
 * same component at the same position and keeps its state: the open row and the
 * form inside it. `DEV` is both a program (.NET) and a skill (Development), so
 * the row stayed open across the switch with .NET's slug in Development's form,
 * and a save wrote .NET's values onto skill DEV. Distinct keys are what make
 * React throw that state away.
 *
 * Read from source because createRoot is banned in this suite's node tiers, so
 * an actual tab switch cannot run here. test/browser is where that lives.
 */

const PAGE = 'src/app/admin/page-configs/page.jsx';
const EDITOR = 'src/app/admin/page-configs/_components/PageConfigEditor.jsx';

const editorElements = () =>
  [...readSource(PAGE).code.matchAll(/<PageConfigEditor\b[\s\S]*?\/>/g)].map((m) => m[0]);

const attr = (element, name) => element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

test('the scan finds both editors, one per kind', () => {
  const kinds = editorElements().map((el) => attr(el, 'kind')).sort();
  assert.deepEqual(kinds, ['program', 'skill']);
});

test('each editor carries its own key, so the tab switch remounts it', () => {
  const keys = editorElements().map((el) => attr(el, 'key'));
  assert.ok(keys.every(Boolean), `an editor has no key: ${JSON.stringify(keys)}`);
  assert.equal(new Set(keys).size, 2, `the keys do not differ: ${JSON.stringify(keys)}`);
});

test('a row is keyed by kind and id, so a shared code can never share state', () => {
  const { code } = readSource(EDITOR);
  assert.ok(code.length > 1000, `scrubbed to ${code.length} chars`);
  assert.match(code, /<li key=\{`\$\{kind\}:\$\{item\.id\}`\}/);
});
