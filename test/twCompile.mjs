// Shared Tailwind COMPILATION for the guards that ask what the stylesheet really
// contains, rather than what the markup implies.
//
// Extracted from test/fs/tailwindArbitraryValueRules.test.mjs when
// test/render/menuEscapesClip needed the same thing — the second consumer, which
// is the same point at which test/zScale.mjs was extracted and for the same
// reason. Copying it would have given two definitions of "what does this class
// compile to" that must agree, and the note in the file this came from is blunt
// about that class of duplication: a guard about drift should not itself be a
// drift risk.
//
// NOTHING BELOW CHANGED IN THE MOVE. The comments came with the code because
// every one of them records a way this instrument was already wrong once — the
// double-escaped RegExp that never ran, and the enumerated selector tail that
// reported every working space-y-* utility as dead. Those are the reasons the code is
// shaped as it is, and they belong with it.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Compile Tailwind's utilities over `content` and return the CSS. */
export async function compile(content) {
  const config = {
    presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
    content,
  };
  const result = await postcss([tailwindcss(config)]).process(
    '@tailwind utilities;',
    { from: undefined },
  );
  return result.css;
}

/**
 * CJS require from an ESM test — tailwind.config.js is `module.exports`.
 *
 * EXPORTED as `require_` because four tests in tailwindArbitraryValueRules read
 * the config directly rather than through `compile` — they assert about the
 * SCALE (which colours and z values exist) rather than about emitted rules. They
 * used to share this file-local helper; the export is what keeps that true after
 * the move, instead of a second createRequire that would resolve from a
 * different directory.
 */
export function require_(p) {
  // eslint-disable-next-line no-undef
  return globalThis.__twRequire(p);
}

// node:test runs ESM; tailwind.config.js is CJS. One createRequire, reused.
const { createRequire } = await import('node:module');
globalThis.__twRequire = createRequire(import.meta.url);

/**
 * All declarations for `className` in `css`, as `prop: value` strings.
 *
 * ── A STRING SCAN, NOT A BUILT REGEXP ───────────────────────────────────────
 * Tailwind writes the selector in ESCAPED form — `.hover\:bg-\[var\(--x\)\]:hover`
 * — so the class has to be escaped the same way to be found. The first version of
 * this built a RegExp from that escaped string and had to escape it a second time
 * for the regex grammar; the two escapings collided and produced
 * "Range out of order in character class", i.e. the matcher never ran at all.
 *
 * Since the only thing needed is an exact selector, `indexOf` is both simpler and
 * strictly more precise. The escape table is Tailwind's own for the characters
 * these classes actually contain.
 */
/**
 * ── THE COMMA IS NOT BACKSLASH-ESCAPED, AND THAT COST A WRONG DIAGNOSIS ─────
 *
 * Every other character here Tailwind escapes as `\<char>`. The comma it does
 * NOT: it emits a CSS unicode escape, `\2c ` — backslash, hex, and a SIGNIFICANT
 * TRAILING SPACE that terminates the hex run. So
 *
 *     w-[min(52rem,calc(100vw-2rem))]
 *
 * is written by Tailwind as
 *
 *     .w-\[min\(52rem\2c calc\(100vw-2rem\)\)\]
 *
 * and a lookup that escaped the comma as `\,` — or left it bare, as this
 * function did — finds nothing and reports the class as producing NO RULE.
 *
 * THAT IS THE FAILURE MODE THIS FILE'S HEADER IS ABOUT, in a seventh costume:
 * a working utility reported as dead. It is worse than the `space-y-*` case
 * that shaped the tail check, because the answer it returns — an empty
 * declaration list — is the same answer a genuinely dead class returns, and
 * "this class compiles to nothing" is a conclusion a reader acts on.
 *
 * Found in round 10: the picker's width class was diagnosed as the cause of a
 * layout defect on the strength of this function returning nothing for it. The
 * class compiles perfectly; the served stylesheet had the rule all along. No
 * test in the suite passed a comma-bearing class, so nothing was green that
 * should have been red — the defect was latent, and it was an INVESTIGATION
 * that it broke, not an assertion.
 */
export function escapeClass(className) {
  return className
    .replace(/[:[\]()./%#]/g, (c) => `\\${c}`)
    // Must run AFTER the backslash pass above, or that pass would escape the
    // backslash this one introduces.
    .replace(/,/g, '\\2c ');
}

export function declarationsFor(css, className) {
  const selector = `.${escapeClass(className)}`;
  const out = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(selector, from);
    if (at === -1) break;
    from = at + selector.length;

    /**
     * The class name must END here.
     *
     * A Tailwind class selector continues with `[A-Za-z0-9_-]` or a backslash
     * escape, so any of those means we matched a PREFIX of a longer class
     * (`w-0` inside `w-0\.5`) rather than the class itself. This replaced an
     * explicit tail pattern that enumerated the shapes a selector may end with
     * — see the note below for why enumerating was wrong.
     */
    if (/[A-Za-z0-9_\\-]/.test(css[from] ?? '')) continue;

    /**
     * ── WHY THIS NO LONGER ENUMERATES THE ALLOWED TAILS ────────────────────
     *
     * It used to require `^((?::[a-z-]+)*)\s*[{,]` — pseudo-classes, then a
     * brace or a comma. That is not the full grammar of what Tailwind puts
     * between a class and its rule body, and the gap was MEASURED rather than
     * reasoned about: `space-y-[22px]` compiles perfectly well and was reported
     * as producing NO RULE, because Tailwind emits it as
     *
     *     .space-y-\[22px\] > :not([hidden]) ~ :not([hidden]) { … }
     *
     * and a child combinator is not a pseudo-class. Every `space-y-*`,
     * `divide-*` and `group-*` utility has this shape, so the enumeration was
     * about to report a whole family of working classes as dead — a guard that
     * cries wolf gets relaxed, and the relaxation is what would have cost the
     * real coverage.
     *
     * So the tail is now bounded rather than enumerated: whatever sits between
     * the class and the `{` is the rest of the selector — pseudo-classes,
     * combinators, descendants, or a comma joining a selector list — and the
     * only thing that disqualifies it is a `}`, which would mean the class did
     * not occur in a selector at all and we are about to read some other rule's
     * body. The exactness that mattered is preserved by the character check
     * above, which is where it always belonged.
     */
    const open = css.indexOf('{', from);
    if (open === -1) continue;
    if (css.slice(from, open).includes('}')) continue;

    const close = css.indexOf('}', open);
    if (close === -1) continue;

    for (const decl of css.slice(open + 1, close).split(';')) {
      const t = decl.trim();
      if (t) out.push(t);
    }
  }
  return out;
}
