import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * WITNESS 3b — the LOCK is intact (2C.3), and it is REQUIRED, not optional. It is
 * the ONLY witness that can fail in the one state that silently reverts design
 * (a) to convention: someone re-exports cardStyleClass and a component calls it
 * directly. In that state the behavioral witness (the wire still renders) and the
 * structural witness (the panel still derives) BOTH stay green — the drift is
 * back, undetected — because neither checks whether a component reads a style
 * prop OUTSIDE the caps-gated helper. This does.
 *
 * Re-exporting an unused function looks like a cleanup, not a regression, which
 * is exactly why this is the most likely way 2C.3 decays and exactly why it needs
 * a control that fires.
 */
const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SECT = path.join(ROOT, 'src/components/pageBuilder/sections');

// Named bindings imported from '@/lib/pageBuilder/presets' across all section files.
function presetImportsAcrossSections() {
  const names = new Set();
  for (const f of readdirSync(SECT).filter((n) => n.endsWith('.jsx'))) {
    const src = readFileSync(path.join(SECT, f), 'utf8');
    const re = /import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/pageBuilder\/presets['"]/g;
    let m;
    while ((m = re.exec(src))) {
      m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean).forEach((n) => names.add(n));
    }
  }
  return names;
}

test('NO section component imports the raw cardStyleClass / buttonStyleClass', () => {
  const imported = presetImportsAcrossSections();
  assert.ok(!imported.has('cardStyleClass'), 'a component imports the raw cardStyleClass — the lock is open');
  assert.ok(!imported.has('buttonStyleClass'), 'a component imports the raw buttonStyleClass — the lock is open');
});

test('control: components DO import the capability helpers (parser works, sanctioned path used)', () => {
  const imported = presetImportsAcrossSections();
  assert.ok(imported.has('cardSurfaceClass') || imported.has('accentButtonClass'),
    'no component imports a capability helper — parser broken or refactor reverted');
});
