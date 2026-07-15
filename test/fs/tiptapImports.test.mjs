import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The one source-text check that survives the port (item 1) — and it PARSES
 * import specifiers rather than substring-matching the file, so a mention of
 * "@tiptap/extension-*" in a comment can't trip it and a real import can't hide
 * behind formatting. The brittle reader-set greps were replaced by behavioral
 * render checks (test/render/readerSets.test.mjs); this stays fs because "which
 * modules a file imports" has no runtime signal to observe.
 */
const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FILE = path.join(ROOT, 'src/components/pageBuilder/editor/richText/RichTextEditor.jsx');
const src = readFileSync(FILE, 'utf8');

function importSpecifiers(code) {
  const specs = [];
  let m;
  const staticRe = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
  while ((m = staticRe.exec(code))) specs.push(m[1]);
  const dynRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynRe.exec(code))) specs.push(m[1]);
  return specs;
}

test('RichTextEditor imports NO @tiptap/extension-* directly', () => {
  const bad = importSpecifiers(src).filter((s) => s.startsWith('@tiptap/extension-'));
  assert.deepEqual(bad, [], `direct extension imports: ${bad.join(', ')}`);
});

test('control: the import parser actually finds @tiptap/react (empty ≠ broken parser)', () => {
  assert.ok(importSpecifiers(src).includes('@tiptap/react'));
});
