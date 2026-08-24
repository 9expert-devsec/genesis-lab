import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accentVars } from '@/lib/pageBuilder/presets';
import { ACCENTS } from '@/lib/schemas/sections/base';

/**
 * A SELF-RETIRING ASSERTION, added by round 75.
 *
 * docs/page-builder-dark-mode.md §D states a verdict that a future palette
 * edit could silently turn into a lie:
 *
 *   "No preset accent follows dark mode."
 *
 * That is not a design choice anyone wrote down as such — it is a CONSEQUENCE
 * of two facts in two files that have no compile-time link:
 *
 *   1. `ACCENT_VARS` in presets.js resolves every accent to **step 50** of its
 *      scale (`var(--9e-orange-50)`, and so on).
 *   2. globals.css declares step 50 with the SAME value in `:root` and in
 *      `.dark`. Steps 100-950 all differ between the two blocks; step 50, the
 *      base, does not — measured round 75 §A: 91 vars differ, and every one of
 *      the 80 accent-scale vars among them is a step other than 50.
 *
 * So a palette author who gives `.dark` a different step 50 — an entirely
 * reasonable thing to do, and invisible from presets.js — changes what every
 * Page Builder accent renders as in dark mode, with no error and no test
 * failing anywhere.
 *
 * THIS TEST RETIRES ITSELF. It does not claim the current state is correct.
 * When it fails, the situation §D describes has genuinely changed and the
 * document needs updating; the failure message says so rather than asking for
 * the value to be put back.
 *
 * Nothing here duplicates twCompile: this reads the STYLESHEET SOURCE, because
 * the question is which block a declaration is written in, not what a browser
 * computes from it.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CSS = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');

/** The text of one top-level rule block, by its selector. */
function blockFor(selector) {
  const start = CSS.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `globals.css has no top-level \`${selector} {\` block`);
  let depth = 0;
  for (let i = start; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) return CSS.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated \`${selector}\` block in globals.css`);
}

/** Every `--custom-property: value;` declared directly in a block. */
function declarations(block) {
  const out = new Map();
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

const ROOT_VARS = declarations(blockFor(':root'));
const DARK_VARS = declarations(blockFor('.dark'));

/**
 * The vars the ACCENT PATH actually reads — derived from `accentVars`, not
 * copied from a list. A copy would be a second statement of the same fact,
 * which is exactly the drift this file exists to catch.
 */
function accentTokensFor(accent) {
  const bundle = accentVars(accent);
  const names = new Set();
  for (const value of Object.values(bundle)) {
    for (const m of String(value).matchAll(/var\((--[\w-]+)\)/g)) names.add(m[1]);
  }
  return names;
}

test('the accent path resolves through vars globals.css actually declares', () => {
  const all = new Set();
  for (const a of ACCENTS) for (const n of accentTokensFor(a)) all.add(n);

  // A control: an empty set would make every assertion below vacuous, and a
  // vacuous pass is indistinguishable from a real one.
  assert.ok(all.size >= ACCENTS.length,
    `expected at least one CSS var per accent, found ${all.size} for ${ACCENTS.length} accents`);

  for (const name of all) {
    assert.ok(ROOT_VARS.has(name),
      `presets.js resolves an accent to ${name}, which globals.css :root does not declare`);
  }
});

test('no preset accent follows dark mode — and this test retires when that changes', () => {
  const follows = [];
  for (const accent of ACCENTS) {
    for (const name of accentTokensFor(accent)) {
      // A var absent from `.dark` inherits `:root`, which is also "does not
      // follow" — only a DIFFERENT value in `.dark` would change the render.
      if (DARK_VARS.has(name) && DARK_VARS.get(name) !== ROOT_VARS.get(name)) {
        follows.push(`${accent} → ${name}: :root ${ROOT_VARS.get(name)} vs .dark ${DARK_VARS.get(name)}`);
      }
    }
  }

  assert.deepEqual(follows, [],
    'A preset accent now resolves to a var that DIFFERS under `.dark`, so the '
    + 'Page Builder accent path follows dark mode for the first time.\n'
    + 'This is not necessarily wrong — but docs/page-builder-dark-mode.md §D '
    + 'says "no preset accent follows dark mode" and is now stale, and §G/§H '
    + 'were argued on top of that.\n'
    + 'Update the document, then delete this test — it exists only to make the '
    + 'change visible.\nChanged:\n  ' + follows.join('\n  '));
});
