import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminSidebarHeader } from '@/components/layout/AdminSidebar';
import { ROOT } from '../sourceScan.mjs';

/**
 * The rail header: the brand lockup, in both rail states.
 *
 * ══ THE COLLAPSED HALF IS THE HALF THAT MATTERS ═════════════════════════════
 * Expanded, the header says what the product is three times over — a mark and
 * two lines of text. Collapsed, both lines are hidden and the mark is the only
 * thing left, which is precisely when a decorative image becomes the accessible
 * name and precisely when nobody checks. So the assertions come in pairs, one
 * per state, rather than one assertion about "the header".
 *
 * That is only testable because the header takes `collapsed` as a PROP. It is
 * post-mount localStorage state inside AdminSidebar and is therefore ALWAYS
 * false in a server render — the same reason AdminSidebarFooter was extracted
 * in round B, and the same fix.
 *
 * ── WHAT THIS TIER CANNOT SEE ───────────────────────────────────────────────
 * Attributes and class strings, not pixels. It cannot tell you that a 400x400
 * mark is legible scaled to 36px, that the two text lines optically balance
 * against it, that the blue reads on navy at that size, or how the stacked
 * collapsed header looks at 64px. Named as unverified in the round report.
 */

const header = (collapsed) =>
  renderToStaticMarkup(createElement(AdminSidebarHeader, { collapsed, onToggleCollapsed() {} }));

const tags = (markup, name) => [...markup.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) ?? [])[1];

const MARK_SRC = '/logo/9exp-stand.png';

// ── the asset ───────────────────────────────────────────────────────────────
test('the mark renders from a path this repo actually ships', () => {
  for (const collapsed of [false, true]) {
    const imgs = tags(header(collapsed), 'img');
    assert.equal(imgs.length, 1, `collapsed=${collapsed}: expected one mark, found ${imgs.length}`);
    assert.equal(attr(imgs[0], 'src'), MARK_SRC, `collapsed=${collapsed}`);
  }
});

test('…and that file is in the directory listing with EXACTLY that case', () => {
  // Development is on Windows (case-insensitive), the build is Linux (case-
  // sensitive), so a case-only mismatch renders perfectly here and 404s in
  // production — and nothing in this suite loads an image, so no other test
  // would notice. readdirSync returns the real entries and `includes` is a
  // STRING compare, which is case-sensitive even on Windows; existsSync would
  // resolve through the filesystem and happily accept the wrong case.
  // Same hazard, same method, as test/fs/chatWiring's check on the chat mark.
  const rel = MARK_SRC.replace(/^\//, '');
  const entries = readdirSync(path.join(ROOT, 'public', path.posix.dirname(rel)));
  const base = path.posix.basename(rel);
  assert.ok(entries.includes(base),
    `public/${rel} is not in the listing. Present: ${entries.join(', ')}`);
  assert.ok(!entries.includes(base.toUpperCase()), 'CONTROL: the matcher is case-sensitive');
});

test('the mark is rendered at 36px, the same tile as the avatar and the rows', () => {
  for (const collapsed of [false, true]) {
    const img = tags(header(collapsed), 'img')[0];
    assert.equal(attr(img, 'width'), '36', `collapsed=${collapsed}`);
    assert.equal(attr(img, 'height'), '36', `collapsed=${collapsed}`);
  }
});

test('no second brand asset crept in — the horizontal lockup is not used here', () => {
  // /brand/logo-*.png are the full lockups: the mark with "Expert" already set
  // beside it. Any of them here would print the word twice, once as pixels and
  // once as the text below.
  const markup = header(false) + header(true);
  assert.ok(!/\/brand\/logo-/.test(markup), 'a horizontal lockup asset is in the rail header');
});

// ── the two text lines ──────────────────────────────────────────────────────
test('expanded: both lines render, "Expert" then "Admin Panel"', () => {
  const markup = header(false);
  const expert = markup.indexOf('>Expert<');
  const panel = markup.indexOf('>Admin Panel<');
  assert.notEqual(expert, -1, 'the "Expert" line is missing');
  assert.notEqual(panel, -1, 'the "Admin Panel" line is missing');
  assert.ok(expert < panel, 'the two lines are in the wrong order');
});

test('expanded: both lines are bold and take the brand token', () => {
  // Not "a colour" — the specific token round C added for the wordmark. A line
  // painted with --admin-rail-item would still be visible and would still pass
  // a presence check while being the wrong thing.
  const lines = tags(header(false), 'p');
  assert.equal(lines.length, 2, `expected two lines, found ${lines.length}`);
  for (const line of lines) {
    assert.match(line, /font-bold/, line);
    assert.match(line, /text-\[var\(--admin-rail-brand\)\]/, line);
  }
});

test('collapsed: neither line renders — there is no room for them', () => {
  const markup = header(true);
  assert.ok(!markup.includes('>Expert<'), 'the "Expert" line survives at 64px wide');
  assert.ok(!markup.includes('>Admin Panel<'), 'the "Admin Panel" line survives at 64px wide');
  assert.equal(tags(markup, 'p').length, 0, 'a text line is still being rendered');
});

// ── the accessible name, in BOTH states ─────────────────────────────────────
test('collapsed: the mark carries the product name, because nothing else can', () => {
  // THE ASSERTION THIS FILE EXISTS FOR. With both lines gone the header has
  // exactly one element left, and an `alt=""` on it would leave a screen-reader
  // user with a rail that never says what application it is.
  const img = tags(header(true), 'img')[0];
  const alt = attr(img, 'alt');
  assert.ok(alt && alt.trim().length > 0, `the collapsed mark has alt="${alt}"`);
  assert.match(alt, /9Expert/, alt);
  assert.match(alt, /Admin Panel/, alt);
});

test('expanded: the mark is decorative, because the text beside it says the same thing', () => {
  // The other half, and it is a real requirement rather than a nicety: an alt
  // here would make a screen reader announce the product, then "Expert", then
  // "Admin Panel" — the same name three times before the first menu item.
  const img = tags(header(false), 'img')[0];
  assert.equal(attr(img, 'alt'), '', `the expanded mark has alt="${attr(img, 'alt')}"`);
  // …and the name really is present as text, so nothing was lost by hiding it.
  assert.match(header(false), />Expert</);
});

// ── the collapse toggle is untouched apart from where it sits ───────────────
test('the toggle keeps its own accessible name, labels and ring in both states', () => {
  for (const [collapsed, label] of [[false, 'ย่อเมนู'], [true, 'ขยายเมนู']]) {
    const button = tags(header(collapsed), 'button')[0];
    assert.ok(button, `collapsed=${collapsed}: no toggle rendered`);
    assert.equal(attr(button, 'aria-label'), label, button);
    assert.equal(attr(button, 'title'), label, button);
    assert.equal(attr(button, 'aria-expanded'), String(!collapsed), button);
    assert.match(button, /focus-visible:ring-\[var\(--admin-rail-focus\)\]/, button);
    assert.match(button, /p-1\.5/, 'the toggle was restyled; only its position was meant to change');
  }
});

test('the header is NOT a link, in either state', () => {
  // It was not one before this round and making it one is structure. Stated as
  // an assertion because "add an href to the logo" is the single most likely
  // next edit to this component.
  for (const collapsed of [false, true]) {
    assert.equal(tags(header(collapsed), 'a').length, 0, `collapsed=${collapsed}: the header links`);
  }
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the two states really do render differently', () => {
  // Half the assertions above are per-state. If the prop did nothing, each
  // would be checking the other state's markup and the pairs would be one test.
  assert.notEqual(header(false), header(true));
});

test('CONTROL: the markup really was read — the sweeps are not empty', () => {
  const markup = header(false);
  assert.ok(markup.length > 200, `the header rendered ${markup.length} chars`);
  assert.equal(tags(markup, 'img').length, 1);
  assert.equal(tags(markup, 'button').length, 1);
});
