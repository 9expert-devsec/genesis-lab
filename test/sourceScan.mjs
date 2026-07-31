/**
 * ONE reader for every guard that scans source text.
 *
 * WHY THIS EXISTS. Six separate matcher defects have shipped in guards in this
 * suite, each caught by a control, each patched locally in whichever guard hit
 * it. Every one was the same mistake in a different costume — matching TEXT
 * that is not CODE:
 *
 *   1. a module's own docstring        — the tag scanner swallowed 20 lines of
 *                                        prose from bustUpstream.js explaining
 *                                        the `tags:` option
 *   2. a sentence mentioning a symbol  — `!src.includes('aiFetch')` was
 *                                        satisfied by the comment saying
 *                                        reviews.js does NOT use aiFetch
 *   3. a commented-out import          — counted as a live host
 *   4. CRLF vs a bare \n               — the working tree is CRLF, so a
 *                                        multi-line matcher written with \n
 *                                        matched nothing, which for a "does NOT
 *                                        contain" assertion looks like a pass
 *   5. an import line satisfying       — deleting a call left the guard green
 *      includes()                        because `import { x }` still mentioned x
 *   6. a regex bounded by [^)]*        — could not cross the arrow function's
 *                                        OWN `)` in `setTimeout(() => …)`
 *
 * Defects 1-5 are removed by reading the file through this module. Defect 6 is
 * NOT — it is a property of the regex a guard writes, not of the text — so the
 * lesson is encoded as a control in sourceScan.test.mjs instead: bound a
 * statement match on `;`, never on `)`.
 *
 * WHAT IT STILL CANNOT SEE, and no text scanner can:
 *   - computed access: `doc['pinOrder']`, `obj[field]`, `await import(name)`
 *   - anything generated at build or run time
 *   - meaning that depends on SYNTAX rather than text. This module deletes
 *     comments and imports; it does not parse. `foo(bar)` and `foo (bar)` and a
 *     `foo` that is shadowed by a local variable all read the same to it.
 *   - re-exports and barrel files: `export { x } from './y'` is left intact
 *     (it is not an import), so a symbol reached through one is invisible.
 *   - whether the code RUNS. Every guard built on this is a shape guard.
 *
 * A NOTE ON STRINGS. The scanner is string-aware on purpose: a naive
 * comment-stripper turns `'https://example.com'` into `'https:` and silently
 * corrupts every guard that matches a URL or a path. Regex literals are
 * detected by the standard previous-token heuristic, which is good enough for
 * this repo but is a heuristic — see the test.
 */

import { readFileSync } from 'node:fs';

// A `/` starts a regex literal (rather than division) when the previous
// meaningful character cannot end an expression.
const REGEX_MAY_FOLLOW = new Set([
  '', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*',
  '%', '<', '>', '~', '^', '\n',
]);

/**
 * Remove comments (and optionally import statements) from JS/JSX text without
 * touching string or template contents. Line endings are normalised to \n.
 */
export function scrubSource(text, { stripImports = true } = {}) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  let out = '';
  let i = 0;
  let prev = ''; // last meaningful (non-whitespace) character emitted

  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];

    // line comment → drop to end of line, keep the newline
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    // block comment → replace with a space so tokens don't fuse
    if (c === '/' && d === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      out += ' ';
      continue;
    }
    // string / template literal → copy verbatim, including any // inside
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i];
        if (src[i] === quote) { i += 1; break; }
        i += 1;
      }
      prev = quote;
      continue;
    }
    // regex literal → copy verbatim so a `/` inside it is not read as a comment
    if (c === '/' && REGEX_MAY_FOLLOW.has(prev)) {
      out += c;
      i += 1;
      let inClass = false;
      while (i < src.length) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) { out += src[i]; i += 1; break; }
        else if (src[i] === '\n') break; // unterminated — not a regex after all
        out += src[i];
        i += 1;
      }
      prev = '/';
      continue;
    }

    out += c;
    if (!/\s/.test(c)) prev = c;
    else if (c === '\n') prev = '\n';
    i += 1;
  }

  return stripImports ? removeImports(out) : out;
}

/**
 * Drop `import …` statements, including multi-line and side-effect forms.
 * `export … from …` is deliberately left alone: it is not an import, and a
 * guard asking "does this file re-export X" needs to see it.
 */
function removeImports(text) {
  return text
    .replace(/^[ \t]*import\s+[\s\S]*?\sfrom\s*(['"])[^'"]*\1\s*;?[ \t]*$/gm, '')
    .replace(/^[ \t]*import\s*(['"])[^'"]*\1\s*;?[ \t]*$/gm, '');
}

/**
 * Read a file and return it ready to scan.
 *
 * @param {string} filePath absolute, or relative to the repo root
 * @param {object} [opts]
 * @param {boolean} [opts.stripImports=true] set FALSE for a guard that is
 *        ABOUT imports — headerImports and tiptapImports assert which modules a
 *        file pulls in, and stripping them would delete the subject.
 */
export function readSourceForScanning(filePath, opts) {
  return scrubSource(readFileSync(filePath, 'utf8'), opts);
}
