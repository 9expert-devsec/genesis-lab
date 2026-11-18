import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * D25 — the closed mobile drawer is `inert`, not just aria-hidden.
 *
 * aria-hidden alone kept its 9 links in the Tab order (measured on www), so a
 * keyboard user could focus things a screen reader would not announce. The
 * drawer is portalled client-side only, so this cannot be checked in rendered
 * HTML; the render tier would also need a React root, which this suite does
 * not spin up. So the wiring is read from source: the wrapper's `inert` DOM
 * property follows `!open`, and Esc / focus-return are wired.
 */

const HEADER = 'src/components/layout/PublicHeaderClient.jsx';

test('the drawer wrapper is inert whenever it is closed, and focus is managed', () => {
  const { code } = readSource(HEADER);
  // inert tracks !open on the wrapper that also carries aria-hidden.
  assert.match(code, /wrapperRef\.current\.inert\s*=\s*!open/);
  assert.match(code, /<div ref=\{wrapperRef\}[^>]*aria-hidden=\{!open\}/);
  // Esc closes; focus goes in on open and back to the hamburger on close.
  assert.match(code, /event\.key === 'Escape'/);
  assert.match(code, /closeButtonRef\.current\?\.focus\(/);
  assert.match(code, /returnFocusRef\?\.current\?\.focus\(/);
  assert.match(code, /returnFocusRef=\{menuButtonRef\}/);
  // CONTROL: the matcher is not satisfied by an always-inert or never-inert drawer.
  assert.doesNotMatch('wrapperRef.current.inert = true', /wrapperRef\.current\.inert\s*=\s*!open/);
  assert.doesNotMatch('wrapperRef.current.inert = open', /wrapperRef\.current\.inert\s*=\s*!open/);
});
