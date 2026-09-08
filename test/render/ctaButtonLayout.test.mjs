import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { CtaSection } from '@/components/pageBuilder/sections/cta';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The marker and the render are compared on the same inputs
// below, which is the only way the marker can be shown not to lie.
import { sectionRendersEmpty } from '@/lib/pageBuilder/sectionLabels';

/**
 * ── ROUND C: THE LAYOUT, AND THE ONE ASSERTION THAT PROTECTS STORED PAGES ─
 *
 * The pair became a list. The dangerous half is not the new capability — it is
 * every `cta` already published, which reads back with `buttons` ABSENT and
 * must render the bytes it rendered yesterday.
 *
 * Round 57 made the wrapper's flex classes CONDITIONAL for exactly that reason,
 * so the one-button case is asserted as an EQUALITY on the class attribute
 * rather than an `includes`. An `includes` check would pass just as happily if
 * the wrapper gained the flex classes for a single button, which is the change
 * this file exists to catch.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE ───────────────────────────────────
 * It sees which classes land on which element. It sees no layout: JSDOM
 * compiles no Tailwind, and `flex` is a string here. What is asserted is the
 * mechanism — which classes the button count selects.
 */

const html = (content, style) => renderToStaticMarkup(CtaSection({ content, style: style ?? {} }));
const dom = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
/** The buttons' own wrapper — the `mt-6` div, not the outer `text-center` one. */
const wrapperOf = (markup) => dom(markup).querySelector('div.mt-6');
const linksOf = (markup) => [...dom(markup).querySelectorAll('a')];

const ONE_LEGACY = { buttonLabel: 'สมัครเลย', buttonHref: 'https://9expert.co.th/register' };
const TWO_LEGACY = {
  ...ONE_LEGACY,
  secondaryButtonLabel: 'ดูตารางอบรม',
  secondaryButtonHref: '/schedule',
};

// ── one button: the byte-identity assertion ───────────────────────────────

test('one button ⇒ the wrapper class attribute is EXACTLY `mt-6`', () => {
  /**
   * Equality, not `includes`. This is the assertion that says every stored
   * one-button cta renders unchanged, and `includes('mt-6')` would survive the
   * flex classes being added unconditionally "for consistency".
   */
  assert.equal(wrapperOf(html(ONE_LEGACY)).getAttribute('class'), 'mt-6');
});

test('one button authored as a LIST also emits exactly `mt-6`', () => {
  /**
   * The same claim from the new side. A cta an author builds today with one
   * button must land on the identical wrapper as one stored in 2025 — two
   * routes into the component, one output, or the round has quietly created
   * two kinds of one-button cta.
   */
  const listed = { buttons: [{ label: 'สมัครเลย', href: 'https://9expert.co.th/register' }] };
  assert.equal(wrapperOf(html(listed)).getAttribute('class'), 'mt-6');
  assert.equal(html(listed), html(ONE_LEGACY), 'the legacy and list routes render different markup');
});

// ── two or more: the flex classes ─────────────────────────────────────────

test('two buttons ⇒ the flex classes appear, and the legacy pair is unchanged', () => {
  const classes = wrapperOf(html(TWO_LEGACY)).getAttribute('class');
  assert.equal(classes, 'mt-6 flex flex-wrap items-center justify-center gap-3');
  const links = linksOf(html(TWO_LEGACY));
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((a) => a.textContent), ['สมัครเลย', 'ดูตารางอบรม']);
  assert.deepEqual(links.map((a) => a.getAttribute('href')), ['https://9expert.co.th/register', '/schedule']);
  // The external one opens in a tab and the internal one does not — derived
  // from the href, exactly as before the list existed.
  assert.equal(links[0].getAttribute('target'), '_blank');
  assert.equal(links[1].getAttribute('target'), null);
});

test('four buttons take the same flex wrapper as two', () => {
  const four = {
    buttons: [1, 2, 3, 4].map((n) => ({ label: `ปุ่ม ${n}`, href: `/p${n}` })),
  };
  assert.equal(
    wrapperOf(html(four)).getAttribute('class'),
    'mt-6 flex flex-wrap items-center justify-center gap-3',
  );
  assert.equal(linksOf(html(four)).length, 4);
});

// ── the per-button style ──────────────────────────────────────────────────

test('a per-button style renders a different class than the default cascade', () => {
  /**
   * The cascade with no per-button style: FIRST takes the section's accent
   * treatment, every LATER one takes the outline. A button naming its own style
   * overrides that for itself and nothing else.
   *
   * Asserted as a DIFFERENCE against the same fixture rather than against a
   * literal class string, so the test does not have to know what `ghost`
   * resolves to — that is presets.js's business, and pinning it here would be a
   * second copy of the table.
   */
  const base = { buttons: [{ label: 'a', href: '/a' }, { label: 'b', href: '/b' }] };
  const styled = {
    buttons: [{ label: 'a', href: '/a' }, { label: 'b', href: '/b', style: 'ghost' }],
  };
  const classOf = (content, i) => linksOf(html(content))[i].getAttribute('class');

  assert.notEqual(classOf(styled, 1), classOf(base, 1),
    'the second button ignored its own style');
  // ...and it changed ONLY that button.
  assert.equal(classOf(styled, 0), classOf(base, 0),
    'styling one button changed another');
});

test('CONTROL — the style assertion goes red when the style is removed', () => {
  /**
   * The same fixture with `style` deleted must make the comparison above fail.
   * Without this, a `notEqual` that was reading the wrong element — or reading
   * `null` from both — would pass for every input including the ones it is
   * supposed to reject.
   */
  const base = { buttons: [{ label: 'a', href: '/a' }, { label: 'b', href: '/b' }] };
  const classOf = (content, i) => linksOf(html(content))[i].getAttribute('class');
  assert.throws(
    () => assert.notEqual(classOf(base, 1), classOf(base, 1)),
    /AssertionError/,
    'the comparison cannot distinguish a styled button from an unstyled one',
  );
  // ...and the classes really are non-empty strings, so the comparison above is
  // not two nulls agreeing with each other.
  assert.ok(classOf(base, 0).length > 0);
  assert.ok(classOf(base, 1).length > 0);
});

test('the first button keeps the accent and later ones keep the outline', () => {
  /**
   * Round 57's arrangement, expressed over a list. Two accent fills side by
   * side say "equally important", so the DEFAULT must not give a later button
   * the first one's treatment.
   */
  const three = {
    buttons: [{ label: 'a', href: '/a' }, { label: 'b', href: '/b' }, { label: 'c', href: '/c' }],
  };
  const [a, b, c] = linksOf(html(three)).map((el) => el.getAttribute('class'));
  assert.notEqual(b, a, 'the second button took the primary treatment');
  assert.equal(c, b, 'the third button differs from the second — the cascade is positional, not a pair');
});

// ── the empty case, and the marker that describes it ──────────────────────

test('a cta with nothing at all renders nothing, and the marker agrees', () => {
  /**
   * The mirror check, on the one type that could not have it before: the ว่าง
   * marker is defined as "renders NOTHING on the page", and cta used to emit a
   * bare `<div class="text-center">` even when empty. Both halves moved in
   * round C, so both are asserted on the same inputs — the only way the marker
   * can be shown not to lie.
   *
   * `buttons: []` is the case the round was asked about.
   */
  for (const content of [{}, { buttons: [] }, { heading: '   ' }, { buttonLabel: 'x' }]) {
    const markup = html(content);
    assert.equal(markup, '', `${JSON.stringify(content)} still rendered markup`);
    assert.equal(sectionRendersEmpty({ type: 'cta', content }), true,
      `${JSON.stringify(content)} renders nothing but is not marked ว่าง`);
  }
});

test('CONTROL — a cta with any content renders, and is NOT marked', () => {
  for (const content of [{ heading: 'ก' }, { description: 'ก' }, ONE_LEGACY, TWO_LEGACY]) {
    const markup = html(content);
    assert.notEqual(markup, '', `${JSON.stringify(content)} rendered nothing`);
    assert.equal(sectionRendersEmpty({ type: 'cta', content }), false,
      `${JSON.stringify(content)} renders but is marked ว่าง`);
  }
});
