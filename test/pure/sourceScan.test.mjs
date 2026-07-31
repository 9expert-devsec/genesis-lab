import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scrubSource, readSourceForScanning } from '../sourceScan.mjs';

// One control per defect class this module exists to remove. Each names the
// guard that actually shipped the bug, so the test doubles as the record of why
// the helper exists.

test('DEFECT 1 — a module docstring cannot satisfy a code match', () => {
  // The tag scanner matched bustUpstream.js's own prose about `tags:`.
  const src = `
/**
 * Sets tags: ['from-the-docstring'] on every read.
 */
const x = 1;
`;
  assert.ok(!scrubSource(src).includes('from-the-docstring'));
  assert.ok(scrubSource(src).includes('const x = 1'));
});

test('DEFECT 2 — a sentence mentioning a symbol cannot satisfy includes()', () => {
  // `!src.includes('aiFetch')` was satisfied by the comment saying the file
  // does NOT use aiFetch.
  const src = `// this file deliberately does not use aiFetch\nconst y = 2;\n`;
  assert.ok(!scrubSource(src).includes('aiFetch'));
});

test('DEFECT 3 — a commented-out import is not an import', () => {
  const src = `// import { Thing } from '@/x';\nexport const z = 3;\n`;
  assert.ok(!scrubSource(src).includes('Thing'));
});

test('DEFECT 4 — CRLF ON DISK is normalised before matching', () => {
  // Not a string fixture: a real file with real \r\n, because the bug was that
  // the working tree is CRLF and the matcher was written with \n.
  const dir = mkdtempSync(path.join(tmpdir(), 'scan-'));
  const file = path.join(dir, 'crlf.js');
  writeFileSync(file, 'const a = 1;\r\nconst b = 2;\r\n', 'utf8');
  assert.ok(readFileSync(file, 'utf8').includes('\r\n'), 'the fixture really is CRLF');
  const scanned = readSourceForScanning(file);
  assert.ok(!scanned.includes('\r'), 'no carriage returns survive');
  assert.ok(/const a = 1;\nconst b = 2;/.test(scanned), 'a \\n matcher now works');
});

test('DEFECT 5 — an import line cannot satisfy a "does this file use X" check', () => {
  const src = `import { useAddedRowSink } from '@/x';\n\nexport function C() { return null; }\n`;
  assert.ok(!scrubSource(src).includes('useAddedRowSink'));
  assert.ok(scrubSource(src).includes('export function C'));
});

test('DEFECT 5b — multi-line and side-effect imports go too', () => {
  const src = `import {\n  a,\n  b,\n} from '@/x';\nimport '@/styles.css';\nconst kept = 1;\n`;
  const out = scrubSource(src);
  assert.ok(!out.includes('@/x'));
  assert.ok(!out.includes('styles.css'));
  assert.ok(out.includes('const kept = 1'));
});

test('DEFECT 6 — bound a statement match on ";", never on ")"', () => {
  // This one the module CANNOT fix: it is a property of the regex a guard
  // writes. Encoded here so the lesson has a home. `[^)]*` cannot cross the
  // arrow function's own closing paren, so it matched nothing and five
  // "the fossil is gone" assertions passed vacuously.
  const line = 'setTimeout(() => router.refresh(), 300);';
  assert.ok(!/setTimeout\([^)]*router\.refresh/.test(line), 'the broken bound misses it');
  assert.ok(/setTimeout\([^;]*?router\.refresh/.test(line), 'the ";" bound catches it');
  assert.ok(!/setTimeout\([^;]*?router\.refresh/.test('router.refresh();'), 'and does not over-match');
});

// ── the hazard the helper introduces, and its control ──────────────

test('a // inside a STRING survives — a naive stripper would corrupt URLs', () => {
  const src = `const u = 'https://example.com/a';\nconst v = "x//y";\n`;
  const out = scrubSource(src);
  assert.ok(out.includes("'https://example.com/a'"), 'url intact');
  assert.ok(out.includes('"x//y"'), 'double-quoted intact');
});

test('a // inside a TEMPLATE literal survives', () => {
  const src = 'const t = `see https://x.test/y`;\n';
  assert.ok(scrubSource(src).includes('https://x.test/y'));
});

test('a / inside a REGEX literal is not read as a comment', () => {
  const src = 'const re = /a\\/\\/b/g;\nconst after = 1;\n';
  const out = scrubSource(src);
  assert.ok(out.includes('const after = 1'), 'the rest of the file survives');
});

test('a character class containing / does not terminate the regex early', () => {
  const src = 'const re = /[/]x/;\nconst after = 2;\n';
  assert.ok(scrubSource(src).includes('const after = 2'));
});

test('division is not mistaken for a regex', () => {
  const src = 'const r = total / count;\nconst after = 3;\n';
  const out = scrubSource(src);
  assert.ok(out.includes('total / count'));
  assert.ok(out.includes('const after = 3'));
});

// ── options and controls on the options ────────────────────────────

test('stripImports:false keeps imports, for guards that are ABOUT imports', () => {
  const src = `import { X } from '@/x';\nconst y = 1;\n`;
  assert.ok(scrubSource(src, { stripImports: false }).includes("import { X } from '@/x'"));
  assert.ok(!scrubSource(src, { stripImports: false }).includes('//'));
});

test('CONTROL: stripImports:false still strips comments', () => {
  // Pairs with the test above — proves the flag turns off ONE behaviour, not
  // the whole scrubber.
  const src = `// import { Ghost } from '@/g';\nimport { X } from '@/x';\n`;
  const out = scrubSource(src, { stripImports: false });
  assert.ok(!out.includes('Ghost'), 'comment still gone');
  assert.ok(out.includes('@/x'), 'real import kept');
});

test('export … from is NOT treated as an import', () => {
  // A re-export is a fact about the module's surface; a guard asking about it
  // must still be able to see it.
  const src = `export { thing } from './y';\n`;
  assert.ok(scrubSource(src).includes("export { thing } from './y'"));
});

test('CONTROL: the scrubber is not simply returning its input', () => {
  // The cheapest way for every test above to pass vacuously.
  const src = `import { A } from '@/a';\n// gone\n/* gone too */\nconst kept = 1;\n`;
  const out = scrubSource(src);
  assert.notEqual(out, src);
  assert.ok(out.includes('const kept = 1'));
});

test('degenerate inputs do not throw', () => {
  for (const bad of [undefined, null, '', '/*', '//', "'unterminated", '`']) {
    assert.doesNotThrow(() => scrubSource(bad));
  }
});
