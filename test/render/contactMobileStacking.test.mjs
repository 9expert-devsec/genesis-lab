import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource } from '../sourceScan.mjs';

/**
 * Teeny ticket: /contact-us squeezed onto phone widths — two sections split
 * into side-by-side columns with no mobile single-column base
 * (GetInTouchSection's left-narrative/right-cards flex, BusinessInfoSection's
 * company-info/office-hours grid), and email addresses inside the right-card
 * InfoRows broke mid-word because of `break-all` on a container that was
 * ALSO too narrow to need a break rule that aggressive.
 *
 * These are source-shape guards (via test/sourceScan.mjs), not render/CSS
 * assertions — jsdom does no layout, so nothing here can observe an actual
 * computed width or wrap point. Each check anchors on a stable, unrelated
 * sibling string rather than a line number, so it survives reformatting.
 */

const GET_IN_TOUCH = readSource('src/components/contact/GetInTouchSection.jsx');
const BUSINESS_INFO = readSource('src/components/contact/BusinessInfoSection.jsx');

/**
 * T1's claim, extracted so both the real file and the reverted-bug literal
 * can be run through the identical check (the control IS the pre-fix code).
 */
function assertMobileBaseWithDesktopOverride(className, { mobileToken, desktopToken }) {
  const mobileRe = new RegExp(`(?:^|\\s)${mobileToken}(?:\\s|$)`);
  const desktopRe = new RegExp(`(?:^|\\s)${desktopToken}(?:\\s|$)`);
  assert.match(className, mobileRe, `missing mobile base "${mobileToken}"`);
  assert.match(className, desktopRe, `missing desktop override "${desktopToken}"`);
}

test('GetInTouchSection: the left/right split stacks on mobile and keeps its lg: row layout', () => {
  // Anchored on the LEFT panel's own div, which is unique in the file and
  // untouched by this round — not on a line number or a comment (comments
  // are stripped before this file is even read for scanning).
  // Comments are stripped to a lone `{ }` by scrubSource, not to nothing —
  // and the gap must stay narrow (whitespace + at most one `{ }` remnant),
  // not [\s\S]*?, or it matches from the wrong, EARLIER <div> in the file.
  const outer = GET_IN_TOUCH.code.match(/<div className="([^"]*)">\s*(?:\{\s*\}\s*)?<div className="lg:w-2\/5">/);
  assert.ok(outer, 'could not find the left/right split container');
  assertMobileBaseWithDesktopOverride(outer[1], { mobileToken: 'flex-col', desktopToken: 'lg:flex-row' });
});

test('BusinessInfoSection: the company-info/office-hours grid stacks on mobile and keeps its lg: 2-column layout', () => {
  // Anchored on the company-info <ul>, which is unique in the file and
  // untouched by this round.
  const outer = BUSINESS_INFO.code.match(/<div className="([^"]*)">\s*<ul className="grid grid-rows-2 gap-4">/);
  assert.ok(outer, 'could not find the company-info/office-hours grid container');
  assertMobileBaseWithDesktopOverride(outer[1], { mobileToken: 'grid-cols-1', desktopToken: 'lg:grid-cols-2' });
});

test('control: the pre-fix bare row/grid classes redden the same ordering check', () => {
  assert.throws(() =>
    assertMobileBaseWithDesktopOverride('flex flex-row', { mobileToken: 'flex-col', desktopToken: 'lg:flex-row' }),
  );
  assert.throws(() =>
    assertMobileBaseWithDesktopOverride('grid grid-cols-2 gap-6', {
      mobileToken: 'grid-cols-1',
      desktopToken: 'lg:grid-cols-2',
    }),
  );
});

test('InfoRow: the phone and email card lists stack on mobile and keep their sm: row layout', () => {
  // Both <ul> wrappers use the identical className, one per card.
  const uls = [...GET_IN_TOUCH.code.matchAll(/<ul className="([^"]*)">\s*<InfoRow/g)].map((m) => m[1]);
  assert.equal(uls.length, 2, 'expected exactly the phone and email card <ul> wrappers');
  for (const className of uls) {
    assertMobileBaseWithDesktopOverride(className, { mobileToken: 'flex-col', desktopToken: 'sm:flex-row' });
  }
});

/** The InfoRow divider claim: bottom border on mobile, turned off and replaced by the original right border at sm:. */
function assertResponsiveDivider(className) {
  assert.match(className, /(?:^|\s)border-b(?:\s|$)/, 'missing the mobile bottom divider');
  assert.match(className, /(?:^|\s)sm:border-b-0(?:\s|$)/, 'the mobile bottom divider must turn off at sm:');
  assert.match(className, /(?:^|\s)sm:border-r(?:\s|$)/, 'missing the sm: right divider (the original treatment)');
}

test('InfoRow: the divider moves from a right border (row) to a bottom border (stack), never both at once', () => {
  const infoRowLi = GET_IN_TOUCH.code.match(/<li className="([^"]*)">\s*<div className="mb-1/);
  assert.ok(infoRowLi, 'could not find the InfoRow <li>');
  assertResponsiveDivider(infoRowLi[1]);
});

test('control: a divider left as border-r at every width (the pre-fix shape) fails the responsive-divider check', () => {
  const flattened = 'border-r border-[#E2E8F0] px-4 first:pl-0 last:border-r-0';
  assert.throws(() => assertResponsiveDivider(flattened));
});

test('the phone/email anchor no longer forces character-level breaks', () => {
  assert.doesNotMatch(GET_IN_TOUCH.code, /\bbreak-all\b/);
  // the href branch specifically must still carry SOME wrap rule, not none
  const hrefBranch = GET_IN_TOUCH.code.match(/<a href=\{href\} className=\{`\$\{valueClasses\} ([\w-]+)`\}>/);
  assert.ok(hrefBranch, 'could not find the href branch of InfoRow');
  assert.equal(hrefBranch[1], 'break-words');
});

test('control: break-all reappearing on the href branch reddens the check above', () => {
  const reverted = '<a href={href} className={`${valueClasses} break-all`}>';
  assert.throws(() => assert.doesNotMatch(reverted, /\bbreak-all\b/));
});
