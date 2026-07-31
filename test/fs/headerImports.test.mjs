import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PublicHeaderClient's lucide import block.
 *
 * A dead icon import is invisible at runtime — it bundles, it renders
 * nothing, and no test that inspects markup can see it. When the Orbit
 * action was removed its import stayed behind exactly once already. This
 * pins every named lucide import to at least one real use in the file.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FILE = path.join(ROOT, 'src', 'components', 'layout', 'PublicHeaderClient.jsx');
const SRC = readFileSync(FILE, 'utf8');

/** The named specifiers of the `lucide-react` import block. */
function lucideImports(src) {
  // `[^}]*` and not `[\s\S]*?`: the lazy form starts at the FIRST import in
  // the file and swallows every block up to lucide's closing brace.
  const block = src.match(/import\s*\{([^}]*)\}\s*from\s*'lucide-react'/);
  assert.ok(block, 'lucide-react import block not found');
  return block[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const ICONS = lucideImports(SRC);

test('the lucide import block is non-empty (the check can see something)', () => {
  assert.ok(ICONS.length >= 5, `expected several icons, found ${ICONS.length}`);
});

for (const icon of ICONS) {
  test(`lucide import \`${icon}\` is actually used`, () => {
    // Uses outside the import block: <Icon …/>, {Icon}, icon: Icon, etc.
    const body = SRC.replace(/import\s*\{[\s\S]*?\}\s*from\s*'lucide-react'/, '');
    assert.match(
      body,
      new RegExp(`\\b${icon}\\b`),
      `${icon} is imported but never used — dead import`
    );
  });
}

test('Orbit specifically is gone', () => {
  // The concrete regression: the /universe entry point's icon.
  assert.ok(!ICONS.includes('Orbit'), 'Orbit is imported again — is the /universe link back?');
});
