import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readSource } from '../sourceScan.mjs';

/**
 * Lists copy as one line per item — the CSS half, pinned at the node tier.
 *
 * WHAT THIS CAN AND CANNOT CLAIM. jsdom has no layout: it cannot serialise a
 * selection the way a browser does and it cannot measure a gap. So this file
 * pins the RULE — that it exists, is scoped to the public prose containers,
 * does not reach the admin editor, and that every restated compensation value
 * equals the number in the typography plugin it mirrors. The BEHAVIOUR — the
 * pasted text has no blank line, and the seven measured gaps did not move —
 * is pinned by test/browser/prose-lists.mjs, which drives real Chrome:
 *
 *     npm run build && node test/browser/prose-lists.mjs
 */

const CSS = readSource('src/app/globals.css').raw;
const require = createRequire(import.meta.url);
const typography = require('@tailwindcss/typography/src/styles.js');
const STYLES = typography.default ?? typography;

/** The plugin's value for one selector under one size, e.g. lookup('sm', '> ul > li p', 'marginTop'). */
function pluginValue(size, selector, prop) {
  const css = STYLES[size].css;
  for (const block of Array.isArray(css) ? css : [css]) {
    if (block[selector]?.[prop]) return block[selector][prop];
  }
  throw new Error(`plugin has no ${size} ${selector} ${prop}`);
}

const COPY_RULE = /:where\(\.prose, \.article-content\) li > p:only-child:not\(\.ProseMirror \*\)\s*\{\s*display:\s*inline;\s*\}/;

test('the copy rule exists ONCE, on a SOLE paragraph, in the two public prose scopes, and not in the editor', () => {
  const hits = CSS.match(new RegExp(COPY_RULE.source, 'g')) ?? [];
  assert.equal(hits.length, 1, `expected the rule once, found ${hits.length}`);
  // The three load-bearing pieces, each named so a removal is a named failure.
  const rule = hits[0];
  assert.match(rule, /:only-child/, 'the rule lost :only-child — a two-paragraph item would merge');
  assert.match(rule, /:not\(\.ProseMirror \*\)/, 'the rule lost the editor exclusion — the admin would see inline paragraphs');
  assert.match(rule, /:where\(\.prose, \.article-content\)/, 'the rule is not scoped to the public prose containers');
});

test('no bare `li p` / `li > p` display rule exists anywhere — the fix is scoped or it is not there', () => {
  const bare = [...CSS.matchAll(/^\s*li\s*>?\s*p[^{]*\{[^}]*display/gm)];
  assert.equal(bare.length, 0, `an unscoped li p display rule: ${bare.map((m) => m[0].trim()).join(' | ')}`);
});

test('the topics scope has its own copy rule, inside its own block', () => {
  assert.match(CSS, /^\.topic-rich li > p:only-child \{ display: inline; \}/m);
});

test('.article-content: the item takes its margin from the SAME declaration as the paragraph', () => {
  // Derived, not restated: one selector list, one value.
  assert.match(
    CSS,
    /^\.article-content p,\r?\n\.article-content li:has\(> p:only-child\):not\(\.ProseMirror \*\) \{ margin: 0 0 1rem; \}/m,
    'the article-content paragraph margin and the item compensation are no longer one declaration'
  );
});

test('every restated .prose compensation equals the typography plugin value it mirrors', () => {
  // [size class, plugin size key, top-level selector, nested selector]
  const SIZES = [
    ['prose',    'DEFAULT'],
    ['prose-sm', 'sm'],
    ['prose-lg', 'lg'],
  ];
  for (const [cls, size] of SIZES) {
    const top = pluginValue(size, '> ul > li > p:first-child', 'marginTop');
    const topBottom = pluginValue(size, '> ul > li > p:last-child', 'marginBottom');
    const nested = pluginValue(size, '> ul > li p', 'marginTop');
    assert.equal(top, topBottom, `${size}: the plugin's first/last paragraph margins differ — the compensation assumes they match`);

    const topRule = new RegExp(`:where\\(\\.${cls.replace('-', '\\-')} li:has\\(> p:only-child\\)\\):not\\(\\.ProseMirror \\*\\)\\s*\\{\\s*margin-top: ([\\d.]+em); margin-bottom: ([\\d.]+em); \\}`);
    const nestedRule = new RegExp(`:where\\(\\.${cls.replace('-', '\\-')} li li:has\\(> p:only-child\\)\\):not\\(\\.ProseMirror \\*\\)\\s*\\{\\s*margin-top: ([\\d.]+em); margin-bottom: ([\\d.]+em); \\}`);
    const t = topRule.exec(CSS); const n = nestedRule.exec(CSS);
    assert.ok(t, `${cls}: top-level compensation rule missing`);
    assert.ok(n, `${cls}: nested compensation rule missing`);
    assert.equal(t[1], top, `${cls}: top-level margin-top ${t[1]} does not mirror the plugin's ${top}`);
    assert.equal(t[2], top, `${cls}: top-level margin-bottom ${t[2]} does not mirror the plugin's ${top}`);
    assert.equal(n[1], nested, `${cls}: nested margin-top ${n[1]} does not mirror the plugin's ${nested}`);
    assert.equal(n[2], nested, `${cls}: nested margin-bottom ${n[2]} does not mirror the plugin's ${nested}`);
  }
});

test('the prose-p:my-1 wrapper mirror exists, and exactly one public wrapper still uses that utility', () => {
  assert.match(CSS, /^\.prose-p\\:my-1 li:has\(> p:only-child\):not\(\.ProseMirror \*\) \{ margin-top: 0\.25rem; margin-bottom: 0\.25rem; \}/m);
  const mc = readSource('src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx').code;
  assert.match(mc, /prose-p:my-1/, 'MasterclassDetailClient no longer uses prose-p:my-1 — the mirror rule has no subject; retire it or re-derive');
});

test('the browser script is enumerated by the tier runner', () => {
  const run = readSource('test/browser/run.mjs').code;
  assert.match(run, /\['prose-lists',/, 'test/browser/run.mjs does not list prose-lists');
});

test('CONTROL: the copy-rule matcher rejects the unscoped and the editor-reaching shapes', () => {
  assert.doesNotMatch('li > p { display: inline; }', COPY_RULE);
  assert.doesNotMatch(':where(.prose, .article-content) li > p { display: inline; }', COPY_RULE, 'without :only-child');
  assert.doesNotMatch(':where(.prose, .article-content) li > p:only-child { display: inline; }', COPY_RULE, 'without the editor exclusion');
  assert.match(':where(.prose, .article-content) li > p:only-child:not(.ProseMirror *) { display: inline; }', COPY_RULE);
});

test('CONTROL: the plugin lookup reads real numbers', () => {
  assert.equal(pluginValue('DEFAULT', '> ul > li > p:first-child', 'marginTop'), '1.25em');
  assert.equal(pluginValue('sm', '> ul > li p', 'marginTop'), '0.5714286em');
});
