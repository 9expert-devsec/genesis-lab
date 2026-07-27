import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_BG_DARK, PAGE_BG_LIGHT } from '@/lib/articles/normalizeAuthoredColors';

/**
 * The authored-colour fix spans three files that have no compile-time link to
 * each other, and every one of the seams fails SILENTLY:
 *
 *   1. globals.css `.dark { --page-bg }`  <->  PAGE_BG_DARK in the JS module.
 *      The classifier measures contrast against a copy of the token, because
 *      it runs in Node where the stylesheet does not exist. Re-theme the dark
 *      background and the copy goes stale — classification keeps "working",
 *      just against the wrong background.
 *
 *   2. The data attribute the transform writes  <->  the selector in
 *      globals.css that consumes it. Rename either and nothing errors; the
 *      article just quietly goes back to being unreadable.
 *
 *   3. `html:not(.dark)` in the light-mode rule  <->  where next-themes
 *      actually puts the class. next-themes with attribute="class" sets it on
 *      document.documentElement (<html>). Switch that config to a data
 *      attribute and the selector matches nothing — invisible today because
 *      the light rule is inert on the current corpus, and it would only
 *      surface the first time an author picks a near-white colour.
 *
 * None of these can be caught by the pure tests, which never see the CSS.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CSS = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const THEME_PROVIDER = readFileSync(
  path.join(ROOT, 'src/components/layout/ThemeProvider.jsx'), 'utf8'
);

/** The value of a custom property inside a given top-level rule block. */
function tokenIn(selector, prop) {
  const start = CSS.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `expected a "${selector}" block in globals.css`);
  const block = CSS.slice(start, CSS.indexOf('}', start));
  const m = new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(block);
  assert.ok(m, `expected ${prop} inside "${selector}"`);
  return m[1].trim();
}

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ── Seam 1: the token the classifier measures against ──────────────

test('PAGE_BG_DARK still equals --page-bg in the .dark block', () => {
  const css = tokenIn('.dark', '--page-bg');
  assert.match(css, /^#[0-9a-fA-F]{6}$/, `--page-bg is "${css}"; update this test if the format changed`);
  assert.deepEqual(
    PAGE_BG_DARK,
    hexToRgb(css),
    `globals.css says --page-bg: ${css} but the classifier measures against `
    + `rgb(${PAGE_BG_DARK.join(', ')}). Re-theming the dark background requires `
    + 'updating PAGE_BG_DARK in src/lib/articles/normalizeAuthoredColors.js.'
  );
});

test('PAGE_BG_LIGHT still equals --page-bg on :root', () => {
  // The light side is now measured against a token too, not against a
  // hardcoded white, so it has the same drift risk as the dark side.
  const css = tokenIn(':root', '--page-bg');
  assert.match(css, /^#[0-9a-fA-F]{6}$/, `--page-bg is "${css}"; update this test if the format changed`);
  assert.deepEqual(
    PAGE_BG_LIGHT,
    hexToRgb(css),
    `globals.css says :root --page-bg: ${css} but the classifier measures against `
    + `rgb(${PAGE_BG_LIGHT.join(', ')}). Update PAGE_BG_LIGHT in `
    + 'src/lib/articles/normalizeAuthoredColors.js.'
  );
});

// ── Seam 2: attribute <-> selector ─────────────────────────────────

/**
 * UPDATED with the hue-preserving adjustment. The declaration changed from
 * `inherit` — which discarded the author's colour — to
 * `var(--authored-fg-<theme>)`, the per-theme replacement the transform now
 * emits. The SELECTOR mechanism is unchanged: still attribute-driven, so
 * what moved is what the rule SETS, not how it is chosen. Selection is by
 * attribute presence; the value records which theme needed the help.
 */
test('each theme rule reads that theme custom property', () => {
  assert.match(
    CSS,
    /\.dark\s+\.article-content \[data-authored-fg\]\s*\{\s*color:\s*var\(--authored-fg-dark\)\s*!important/,
    'the dark-mode rule is missing, renamed, or no longer reads the per-theme value'
  );
  assert.match(
    CSS,
    /html:not\(\.dark\)\s+\.article-content \[data-authored-fg\]\s*\{\s*color:\s*var\(--authored-fg-light\)\s*!important/,
    'the light-mode rule is missing, renamed, or no longer reads the per-theme value'
  );
});

test('a theme rule never reads the OTHER theme value', () => {
  // Crossing the two would apply the dark replacement on white and vice
  // versa — worse than doing nothing, and invisible without this check.
  const darkRule = CSS.match(/\.dark\s+\.article-content \[data-authored-fg\]\s*\{[^}]*\}/)[0];
  const lightRule = CSS.match(/html:not\(\.dark\)\s+\.article-content \[data-authored-fg\]\s*\{[^}]*\}/)[0];
  assert.ok(!darkRule.includes('--authored-fg-light'), `dark rule reads the light value: ${darkRule}`);
  assert.ok(!lightRule.includes('--authored-fg-dark'), `light rule reads the dark value: ${lightRule}`);
});

test('the rules use !important, or the inline style wins', () => {
  const rules = CSS.match(/\[data-authored-(?:fg|bg)\]\s*\{[^}]*\}/g) ?? [];
  assert.ok(rules.length >= 4, `expected at least 4 authored-colour rules, found ${rules.length}`);
  for (const r of rules) {
    assert.match(r, /!important/, `an inline style outranks this rule without !important: ${r}`);
  }
});

test('"mid" is never targeted — that is what preserves authorial intent', () => {
  assert.ok(!/data-authored-fg="mid"/.test(CSS));
  assert.ok(!/data-authored-bg="mid"/.test(CSS));
});

// ── Seam 3: where the `dark` class actually lands ──────────────────

test('each per-theme rule is scoped to exactly one theme', () => {
  assert.match(CSS, /html:not\(\.dark\)\s+\.article-content \[data-authored-fg\]/);
  assert.match(CSS, /\.dark\s+\.article-content \[data-authored-fg\]/);
  // An unscoped variant would fire in BOTH themes, so one of the two values
  // would always be the wrong one.
  assert.ok(
    !/^\s*\.article-content \[data-authored-(?:fg|bg)\]/m.test(CSS),
    'an unscoped authored-colour rule would apply the wrong theme value'
  );
});

test('`html:not(.dark)` is valid because next-themes puts the class on <html>', () => {
  // next-themes with attribute="class" writes to document.documentElement.
  // Any other attribute mode breaks BOTH `.dark ...` and `html:not(.dark)`.
  assert.match(
    THEME_PROVIDER,
    /attribute\s*=\s*["']class["']/,
    'ThemeProvider no longer uses attribute="class"; the `.dark` class may not '
    + 'land on <html>, which would make every html:not(.dark) rule dead'
  );
  // The pre-existing rule that already assumes the same thing.
  assert.match(CSS, /html\.dark\s*\{/, 'globals.css should still carry the html.dark convention');
});

// ── The transform is wired in, on the server ───────────────────────

test('the article page applies the transform, and does so server-side', () => {
  const page = readFileSync(
    path.join(ROOT, 'src/app/(public)/articles/[slug]/page.jsx'), 'utf8'
  );
  assert.match(page, /normalizeAuthoredColors/, 'the transform is not applied to the article body');
  assert.ok(
    !page.includes("'use client'"),
    'the transform must run on the server so its output is deterministic for hydration'
  );
});
