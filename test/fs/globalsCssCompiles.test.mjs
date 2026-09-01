import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { ROOT } from '../sourceScan.mjs';

/**
 * `src/app/globals.css` actually COMPILES — the check the previous round's
 * tests did not have.
 *
 * ══ WHY THIS EXISTS ══════════════════════════════════════════════════════
 * 217f8c0 added list-marker CSS and, in a follow-up edit meant to dodge an
 * unrelated string-matcher trap, left one comment block's `/* … *​/`
 * unbalanced — a `*​/` closed early, so the next paragraph of prose
 * (including a literal `ul { list-style-type: disc }` inside it) sat in the
 * stylesheet as uncommented text. `npx next build` failed:
 * "Expected a pseudo-class or pseudo-element." at globals.css:630.
 *
 * Every existing test that reads this file (test/fs/courseListMarkers,
 * test/fs/courseOutlineRichSeam, …) does it via `readSource(...).raw` and a
 * REGEX — a string match a syntactically broken file satisfies exactly as
 * well as a valid one. None of them would have caught this, and none did:
 * the previous round's suite was fully green with a build that could not
 * compile. This test is what makes that gap visible in the fast suite
 * instead of only in `next build`.
 *
 * ══ A REAL PARSE, THE SAME PLUGIN CHAIN THE BUILD USES ══════════════════
 * `postcss.config.js` names exactly `tailwindcss` + `autoprefixer` — both
 * already installed (Tailwind's own dependencies, nothing new added for
 * this). Running the file through that same chain is what actually
 * reproduces `next build`'s failure mode: verified by hand before writing
 * this file — reintroducing the exact removed `*​/` throws
 * "Expected a pseudo-class or pseudo-element." here too, byte-for-byte the
 * same message `next build` gave.
 *
 * ══ WHAT THIS DOES NOT REPLACE ═══════════════════════════════════════════
 * This proves the STYLESHEET compiles. It says nothing about JS/TS
 * compilation, routing, imports, or anything else `next build` also
 * checks. THE BUILD COMMAND (`npx next build`) REMAINS THE GATE for "is
 * the app actually buildable" — this is a fast, narrow, always-on tripwire
 * for the one failure class this incident was, so it is caught in seconds
 * during `npm test` rather than only when someone happens to run a build.
 *
 * ══ WHY THIS ONE TEST, NOT A SUITE OF THEM ═══════════════════════════════
 * A full Tailwind JIT pass over the whole content glob takes ~3.5s — far
 * slower than everything else in this suite, which runs in milliseconds.
 * That cost is paid once, for a check with real, demonstrated value (it
 * would have caught 217f8c0's break; nothing else in the suite would have).
 * Multiplying it across several near-duplicate assertions would not add
 * coverage, only wall-clock time — so this stays one test, not a pattern.
 */

const CSS_PATH = path.join(ROOT, 'src/app/globals.css');

test('globals.css compiles through the real tailwindcss + autoprefixer chain', async () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  await assert.doesNotReject(
    async () => {
      const result = await postcss([tailwindcss(), autoprefixer()]).process(css, {
        from: CSS_PATH,
      });
      // `.css` is lazily computed by postcss — awaiting `.process()` alone
      // is not enough to force selector-level errors like the one this
      // test exists to catch; reading the output is what triggers them.
      void result.css;
    },
    'globals.css failed to compile — see the thrown error for the selector/line PostCSS points at'
  );
});
