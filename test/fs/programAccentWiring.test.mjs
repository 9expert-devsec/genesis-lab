import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources, countCallSites } from '../sourceScan.mjs';

/**
 * The accent's colour reaches the admin screen FROM UPSTREAM, and no second
 * palette was created on the way.
 *
 * test/pure/programAccent drives the resolution and test/render/…GroupAccent
 * checks the markup. Neither can see the seam this file is about: that the
 * value travels from the `listPrograms()` call the page already makes, rather
 * than from a table of hexes somebody pasted into the admin tree.
 */

const PAGE = 'src/app/admin/courses/page.jsx';
const CLIENT = 'src/app/admin/courses/_components/CoursesAdminClient.jsx';
const MODULE = 'src/lib/courses/programAccent.js';

test('the page builds both maps from ONE shared walk and passes the colours down', () => {
  const { code, withImports } = readSource(PAGE);
  assert.match(withImports, /from '@\/lib\/courses\/programAccent'/, 'the page does not import the accessor');
  assert.equal(countCallSites(code, 'buildProgramIndex'), 1, 'the index is not built exactly once');
  assert.match(code, /programColors=\{programColors\}/, 'the colours are not passed to the client');
  assert.match(code, /programNames=\{programNames\}/, 'the names stopped being passed');
});

test('the colours ride on the listPrograms call the page already makes', () => {
  // No second fetch. The accent must be free — `programcolor` is on the
  // `/programs` response this page reads for the filter dropdown anyway.
  const { code } = readSource(PAGE);
  assert.equal(countCallSites(code, 'listPrograms'), 1, 'a second programs fetch appeared');
});

test('the client resolves through the shared accessor', () => {
  const { code, withImports } = readSource(CLIENT);
  assert.match(withImports, /programAccentOf/, 'the client does not import the accessor');
  assert.equal(countCallSites(code, 'programAccentOf'), 1, 'the accent is resolved somewhere else too');
});

/**
 * NO SECOND MAP OF COLOUR VALUES.
 *
 * The whole rule for this round. A hex literal in the admin tree is a copy that
 * will not follow when upstream changes a programme's colour, and the divergence
 * shows up as "the admin list disagrees with the public page" — which nobody
 * reports because both look plausible.
 */
test('no programme colour was pasted into the /admin/courses tree', () => {
  /**
   * THE RULE IS ABOUT INLINE STYLE, NOT ABOUT HEXES IN GENERAL.
   *
   * This tree legitimately holds `#0D1B2A`, `#111d2c` and `#94a3b8` — Tailwind
   * arbitrary values for the dark-mode surfaces, present long before this
   * round and nothing to do with programmes. Failing on those would be a guard
   * that reads as "no colour anywhere" and gets deleted the first time someone
   * needs a dark-mode class.
   *
   * A COPIED PROGRAMME COLOUR would land where this one lands: in an inline
   * `style`, because that is the only way to paint a value that is not known at
   * build time. So that is what is scanned.
   */
  const offenders = [];
  for (const f of walkSources('src/app/admin/courses')) {
    for (const m of f.code.matchAll(/style=\{\{([^}]*)\}\}/g)) {
      if (/#[0-9a-f]{3,8}\b/i.test(m[1])) offenders.push(`${f.rel}: ${m[1].trim()}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    'a hex literal reached an inline style — a programme colour must come from upstream:\n  '
    + offenders.join('\n  ')
  );
});

test('the only inline style in the tree is the accent, and it reads from the accessor', () => {
  const { code } = readSource(CLIENT);
  const styles = [...code.matchAll(/style=\{\{([^}]*)\}\}/g)].map((m) => m[1].trim());
  assert.deepEqual(
    styles, ['borderLeftColor: accent.color'],
    'the inline styles in this file are no longer just the accent'
  );
});

test('the accent module holds NO colour values of its own', () => {
  // It is a reader and a validator, not a palette. The neutral is an existing
  // CSS token precisely so this stays true.
  const { code } = readSource(MODULE);
  const hexes = code.match(/#[0-9a-f]{3,6}\b/gi) ?? [];
  assert.deepEqual(hexes, [], `the module carries colour values: ${hexes.join(', ')}`);
  assert.match(code, /var\(--text-muted\)/, 'the neutral is not an existing token');
});

test('nothing added a colour field to a model', () => {
  // Out of scope by ruling, and the kind of thing that arrives quietly.
  for (const rel of ['src/models/ProgramOrder.js', 'src/models/SkillOrder.js']) {
    const { code } = readSource(rel);
    assert.ok(!/color/i.test(code), `${rel} gained a colour field`);
  }
});

test('CONTROL: the sweeps are live — they see real files and a real hex', () => {
  // Both assertions above are negatives over a walk; an empty walk satisfies
  // them forever.
  const files = walkSources('src/app/admin/courses');
  assert.ok(files.length >= 5, `only ${files.length} files under /admin/courses`);
  assert.ok(files.some((f) => f.rel === CLIENT), 'the client is not in the swept set');
  // and the inline-style matcher finds one where one genuinely exists: the
  // public programme page paints its hero from the same upstream field.
  const publicStyles = walkSources('src/app/(public)/program')
    .flatMap((f) => [...f.code.matchAll(/style=\{\{([^}]*)\}\}/g)].map((m) => m[1]));
  assert.ok(publicStyles.length > 0, 'the inline-style matcher found nothing in a tree known to have one');
  assert.ok(
    publicStyles.some((s) => /background/i.test(s)),
    'the matcher is not reading real style bodies'
  );
});
