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
  assert.match(code, /programIcons=\{programIcons\}/, 'the icons are not passed to the client');
  assert.match(code, /programNames=\{programNames\}/, 'the names stopped being passed');
});

test('the icons come from the SAME walk as the names and colours', () => {
  // One walk, one key discipline. A second derivation is a second chance to key
  // by `_id` instead of `program_id` and paint every group blank.
  const { code } = readSource(PAGE);
  assert.match(
    code,
    /names:\s*programNames,[\s\S]{0,80}colors:\s*programColors,[\s\S]{0,80}icons:\s*programIcons/,
    'the three maps are not destructured from one buildProgramIndex call'
  );
});

test('the icon is the upstream field, NOT the ProgramOrder mirror', () => {
  /**
   * `ProgramOrder.iconUrl` is written by syncProgramsFromAPI and refreshed only
   * when somebody presses sync, and it has ALREADY drifted — measured
   * 2026-08-14, GHC holds a superseded Cloudinary asset in Mongo while upstream
   * carries a newer one. Reading the mirror would show admins a stale icon that
   * disagrees with the mega menu.
   */
  const { code, withImports } = readSource(MODULE);
  assert.match(code, /programiconurl/, 'the module does not read the upstream field');
  assert.ok(!/iconUrl/.test(code), 'the module reads the ProgramOrder mirror');
  assert.ok(!/ProgramOrder/.test(withImports), 'the accent module reached into the order model');
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

test('the accent is the only thing painted inline, and it reads from the accessor', () => {
  const { code } = readSource(CLIENT);
  // One `style=` on the group header, branching between the band and the
  // neutral edge. Both arms read the accessor's output; neither names a colour.
  // Sliced by position rather than by a balanced-brace regex: the attribute is
  // a multi-line ternary, and `[^}]*` / non-greedy `}` both stop at the first
  // inner object — the `[^)]*` family of matcher defects in sourceScan's header.
  const starts = [...code.matchAll(/style=\{/g)].map((m) => m.index);
  assert.equal(starts.length, 1, `expected exactly one inline style, found ${starts.length}`);
  const slice = code.slice(starts[0], starts[0] + 220);
  assert.match(slice, /backgroundImage:\s*accent\.band/, 'the band does not come from the accessor');
  assert.match(slice, /borderLeftColor:\s*accent\.color/, 'the neutral edge does not come from the accessor');
});

test('the gradient is built in the shared module, not spelled out in the screen', () => {
  const { code } = readSource(CLIENT);
  assert.ok(
    !/linear-gradient/.test(code),
    'the screen writes its own gradient — the alpha and the fade must live in one place'
  );
  assert.match(readSource(MODULE).code, /linear-gradient\(90deg/, 'the module no longer owns the band');
});

test('the band fades to transparent, never to a theme colour', () => {
  // A hard end stop would be a second palette wearing a gradient, and it would
  // be wrong in one of the two themes by construction.
  const { code } = readSource(MODULE);
  const grad = /linear-gradient\(90deg,[^`]*/.exec(code)?.[0] ?? '';
  assert.match(grad, /transparent/, 'the band does not fade to transparent');
  assert.ok(!/#fff|#ffffff|white|#000|black/i.test(grad), 'the band fades to a hard-coded colour');
});

test('the accent module holds NO colour values of its own', () => {
  // It is a reader and a validator, not a palette. The neutral is an existing
  // CSS token precisely so this stays true.
  const { code } = readSource(MODULE);
  const hexes = code.match(/#[0-9a-f]{3,6}\b/gi) ?? [];
  assert.deepEqual(hexes, [], `the module carries colour values: ${hexes.join(', ')}`);
  assert.match(code, /var\(--text-muted\)/, 'the neutral is not an existing token');
});

/**
 * THE ICON'S FAILURE PATH IS WIRED, and only source can show it.
 *
 * `renderToStaticMarkup` cannot fire `onError` — there is no DOM and no network
 * — so the render tier can prove the NO-ICON case and not the FAILED-ICON one.
 * A 404 or a blocked Cloudinary asset renders a broken-image glyph in a table
 * that is otherwise plain text, and it is the case nobody sees until it happens
 * in production. Asserted from source, with that limit stated rather than
 * implied: this proves the handler is attached, not that it fires.
 */
test('the icon drops itself on a load failure rather than showing a broken glyph', () => {
  const { code } = readSource(CLIENT);
  assert.match(code, /onError=\{\(\)\s*=>\s*setFailed\(true\)\}/, 'the icon has no error handler');
  assert.match(code, /const show = Boolean\(src\) && !failed;/, 'the failure flag does not gate the image');
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
