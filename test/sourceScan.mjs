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

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONS (feature branch). Everything ABOVE this line is byte-identical to
// `git show refactor:test/sourceScan.mjs` and must stay that way, so the two
// branches merge without a conflict and without two scrubbers to reason about.
//
// These four are not a second reader — they are a directory walk, a counter and
// two existence checks that the reader above does not attempt, all built ON TOP
// of readSourceForScanning rather than beside it.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * One repo-relative file in the three forms a guard needs.
 *
 * `code` strips imports and `withImports` does not, and CHOOSING WRONG IS A
 * SILENT FAILURE IN BOTH DIRECTIONS:
 *   · a "nothing imports X" guard read from `code` sees no import statements at
 *     all and passes vacuously — the deleted-admin-template guard is exactly
 *     this shape and would have been worthless
 *   · a "this file does not CALL X" guard read from `withImports` is satisfied
 *     by the import line alone, which is defect 5 in the header above
 * So both are handed over and each assertion states which it uses.
 */
export function readSource(rel) {
  const full = path.join(ROOT, rel);
  return {
    rel,
    raw: readFileSync(full, 'utf8').replace(/\r\n?/g, '\n'),
    code: readSourceForScanning(full),
    withImports: readSourceForScanning(full, { stripImports: false }),
  };
}

/** Does the repo-relative path exist? For "this file is gone" guards. */
export function sourceExists(rel) {
  try {
    statSync(path.join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

/** Every .js/.jsx/.mjs under a repo-relative dir, read as above. */
export function walkSources(relDir = 'src') {
  const out = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|jsx|mjs)$/.test(name)) {
        out.push(readSource(path.relative(ROOT, full).split(path.sep).join('/')));
      }
    }
  })(path.join(ROOT, relDir));
  return out;
}

/**
 * Blank the CONTENTS of string and template literals, keeping the quotes, the
 * line count and any `${…}` expressions (which are code, not text).
 *
 * scrubSource deliberately PRESERVES string bodies — defect 4 in its header is
 * a guard that corrupted every URL it matched by stripping them. That is right
 * for a guard asking "does this file mention this path", and wrong for one
 * asking "does this file USE this identifier": a log line reading
 * `"[mc-receipt] ✅ sendMasterclassReceipt complete"` names a function it does
 * not call, and `ARTICLE_SORT_SOURCE = 'actions/articles.js → getArticles()'`
 * names one on purpose. Both read as uses to a plain identifier match — they
 * were the only two false positives the unimported-binding guard produced
 * across all of src/lib, and this is what removes them.
 *
 * Not a replacement for scrubSource. Layer it on top when the subject is an
 * identifier rather than text.
 */
export function blankStringBodies(text) {
  const src = String(text ?? '');
  let out = '';
  let i = 0;

  while (i < src.length) {
    const c = src[i];
    if (c !== "'" && c !== '"' && c !== '`') {
      out += c;
      i += 1;
      continue;
    }

    const quote = c;
    out += quote;
    i += 1;

    while (i < src.length) {
      if (src[i] === '\\') {
        // Two spaces: the escape and its escapee, so offsets do not shift.
        out += '  ';
        i += 2;
        continue;
      }
      if (src[i] === quote) {
        out += quote;
        i += 1;
        break;
      }
      // `${…}` inside a template is real code — copy it through, balanced.
      if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
        let depth = 1;
        out += '${';
        i += 2;
        while (i < src.length && depth > 0) {
          if (src[i] === '{') depth += 1;
          if (src[i] === '}') depth -= 1;
          out += depth === 0 ? '}' : src[i];
          i += 1;
        }
        continue;
      }
      // Newlines survive so reported line numbers stay meaningful.
      out += src[i] === '\n' ? '\n' : ' ';
      i += 1;
    }
  }

  return out;
}

/**
 * How many times `name` is CALLED in already-scrubbed text.
 *
 * COUNTS, rather than detects. A "this path sends exactly one email" claim
 * tested as ">= 1" is the weak-lower-bound failure this repo already shipped as
 * `writes.length >= 2` in planDemotion — satisfied by a plan that writes every
 * row, so breaking the guarded thing produced zero failures.
 *
 * The lookbehind excludes property calls (`obj.sendEmail(`), so this counts the
 * imported binding, and excludes longer identifiers ending the same way.
 */
export function countCallSites(code, name) {
  return (code.match(new RegExp(String.raw`(?<![.\w$])${name}\s*\(`, 'g')) ?? []).length;
}
