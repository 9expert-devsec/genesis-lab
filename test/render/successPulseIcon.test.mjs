import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CheckCircle2 } from 'lucide-react';
import { StepComplete } from '@/components/registration/RegisterWizard';
import { SuccessPulseIcon } from '@/components/ui/SuccessPulseIcon';

/**
 * The registration success screens swapped the flat lucide CheckCircle2 for the
 * animated SuccessPulseIcon. StepComplete has TWO branches (paid / quote) and
 * the icon was duplicated across both, so both are rendered here — a swap that
 * only lands on one of them is the obvious way to get this half-right.
 *
 * Every "absent" assertion is paired with the identical probe fired at a real
 * CheckCircle2 render, so a probe that stopped describing the lucide icon fails
 * in the control rather than passing vacuously here.
 */

const PAID = { kind: 'paid', method: 'card', amount: 21400, referenceNumber: 'REG-1' };
const QUOTE = { kind: 'quote', referenceNumber: 'REG-2' };
const EMAIL = 'somchai@example.com';

const paidHtml = () =>
  renderToStaticMarkup(createElement(StepComplete, { result: PAID, email: EMAIL }));
const quoteHtml = () =>
  renderToStaticMarkup(createElement(StepComplete, { result: QUOTE, email: EMAIL }));
const lucideHtml = () =>
  renderToStaticMarkup(
    createElement(CheckCircle2, { className: 'mx-auto h-16 w-16 text-9e-brand', strokeWidth: 1.5 })
  );

// Markers unique to the new artwork: its viewBox, its animated class, its
// keyframe name, and the literal check-glyph fill.
const PULSE_PROBES = ['viewBox="0 0 300 300"', 'pulseCircle', 'growAndShrink', '#16C479'];

// lucide stamps `lucide-<kebab icon name>` on every icon it renders; in
// 0.454.0 CheckCircle2 is an alias of CircleCheck.
const LUCIDE_PROBE = 'lucide-circle-check';

// ── The swap, both branches ─────────────────────────────────────────────────

test('paid branch renders SuccessPulseIcon', () => {
  const html = paidHtml();
  assert.ok(html.includes('ชำระเงินสำเร็จ'), 'the paid branch is the one being rendered');
  for (const probe of PULSE_PROBES) {
    assert.ok(html.includes(probe), `paid branch must contain "${probe}"`);
  }
});

test('paid branch no longer renders CheckCircle2', () => {
  assert.equal(paidHtml().includes(LUCIDE_PROBE), false);
});

test('quote branch renders SuccessPulseIcon', () => {
  const html = quoteHtml();
  assert.ok(html.includes('ขอบคุณสำหรับการลงทะเบียน'), 'the quote branch is the one being rendered');
  for (const probe of PULSE_PROBES) {
    assert.ok(html.includes(probe), `quote branch must contain "${probe}"`);
  }
});

test('quote branch no longer renders CheckCircle2', () => {
  assert.equal(quoteHtml().includes(LUCIDE_PROBE), false);
});

test('CONTROL: the lucide probe DOES match a real CheckCircle2 render', () => {
  // If this fails, the two "no longer renders" assertions above were passing
  // against a probe that matches nothing and prove nothing.
  assert.ok(lucideHtml().includes(LUCIDE_PROBE));
});

test('CONTROL: the pulse probes do NOT match a CheckCircle2 render', () => {
  // Proves the presence probes identify THIS artwork rather than any <svg> —
  // otherwise the swap tests would stay green if the old icon came back.
  const html = lucideHtml();
  for (const probe of PULSE_PROBES) {
    assert.equal(html.includes(probe), false, `"${probe}" must not match the old icon`);
  }
});

// ── clipPath id collision ───────────────────────────────────────────────────

const clipIds = (html) => [...html.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);

// Both instances must be in ONE render tree: renderToStaticMarkup restarts the
// useId counter per call, so two separate calls would collide by construction
// and the test would be measuring the harness, not the component.
const twoIcons = () =>
  renderToStaticMarkup(
    createElement(Fragment, null, createElement(SuccessPulseIcon), createElement(SuccessPulseIcon))
  );

test('two instances on one page get different clipPath ids', () => {
  const ids = clipIds(twoIcons());
  assert.equal(ids.length, 2, 'both instances emitted a clipPath');
  assert.notEqual(ids[0], ids[1], 'useId must namespace the clipPath per instance');
});

test('each instance references its OWN clipPath id', () => {
  // Distinct ids are worthless if both <g> elements point at the same one.
  const html = twoIcons();
  const [a, b] = clipIds(html);
  for (const id of [a, b]) {
    assert.ok(html.includes(`clip-path="url(#${id})"`), `#${id} is referenced by a <g>`);
  }
});

test('CONTROL: a literal clipPath id DOES collide across two instances', () => {
  // The failure mode the useId requirement exists to prevent, reproduced. If
  // this passes with notEqual, the extractor or the comparison is broken and
  // the test above cannot go red.
  const Literal = () =>
    createElement('svg', null, createElement('clipPath', { id: 'successPulseClip' }));
  const ids = clipIds(
    renderToStaticMarkup(createElement(Fragment, null, createElement(Literal), createElement(Literal)))
  );
  assert.equal(ids.length, 2, 'the extractor found both');
  assert.equal(ids[0], ids[1], 'literal ids collide — this is what useId avoids');
});

// ── reduced motion ──────────────────────────────────────────────────────────

// Rendered from SuccessPulseIcon directly, not through StepComplete: these
// assert the component's own stylesheet, and routing them through the wizard
// would make them fail for the unrelated reason that the swap was reverted.
const iconHtml = () => renderToStaticMarkup(createElement(SuccessPulseIcon));

/**
 * The growAndShrink frames as { '0%': 1, '50%': 0.8, '100%': 1 }.
 *
 * Parsed rather than substring-matched, and that is not fussiness: an earlier
 * version asserted /0%\s*\{\s*transform: scale\(1\)/, which also matches the
 * tail of `100% { transform: scale(1); }`. It stayed green against a component
 * whose 0% frame had been flipped to scale(0.8) — the exact regression the test
 * exists to catch. Capturing (\d+)% keys each frame exactly.
 */
function keyframeScales(html) {
  const block = html.match(/@keyframes\s+growAndShrink\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(block, 'the growAndShrink block is emitted at all');
  const frames = {};
  for (const m of block[1].matchAll(/(\d+)%\s*\{\s*transform:\s*scale\(([\d.]+)\);\s*\}/g)) {
    frames[`${m[1]}%`] = Number(m[2]);
  }
  return frames;
}

test('the resting keyframe is scale(1), so the mark is whole with motion off', () => {
  // globals.css clamps animation-duration to 0.01ms under reduced motion rather
  // than removing the animation, so the 0% frame is what those users see. A
  // scale(0.8) at 0% would ship them a permanently shrunken mark.
  const frames = keyframeScales(iconHtml());
  assert.equal(frames['0%'], 1, '0% frame is full size');
  assert.equal(frames['100%'], 1, '100% frame is full size');
});

test('the explicit reduced-motion opt-out sits on top of the global clamp', () => {
  const html = iconHtml();
  assert.ok(html.includes('prefers-reduced-motion: reduce'), 'the media query is emitted');
  assert.match(html, /\.pulseCircle\s*\{\s*animation:\s*none;/, 'the opt-out kills the animation');
});

test('CONTROL: the pulse still dips at the midpoint', () => {
  // Without this, the two tests above are satisfied by a stylesheet whose
  // keyframes never move at all — no animation, and nothing to opt out of.
  const frames = keyframeScales(iconHtml());
  assert.equal(frames['50%'], 0.8, 'the midpoint dip is what makes it a pulse');
  assert.deepEqual(Object.keys(frames), ['0%', '50%', '100%'], 'all three frames parsed');
});

test('CONTROL: the animation is actually attached to the pulsing circles', () => {
  // The keyframes and the opt-out are both inert if nothing references them.
  const html = iconHtml();
  assert.match(html, /animation:\s*growAndShrink 2s/, 'the class runs the keyframes');
  assert.equal(
    (html.match(/class="pulseCircle/g) || []).length, 2,
    'both circles carry the class the reduced-motion rule targets'
  );
});
