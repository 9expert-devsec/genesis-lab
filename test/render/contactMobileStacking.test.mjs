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
 * The contact-us redesign replaced that markup (the narrative panel and
 * InfoRow are gone; the channels are a 3-card row of ContactRow lists). The
 * claims are unchanged and re-anchored on the new markup: stack by default,
 * go side by side only at a breakpoint, and never `break-all`.
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
  // Tokens are matched literally: arbitrary values like grid-cols-[auto_1fr]
  // carry regex metacharacters.
  const lit = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mobileRe = new RegExp(`(?:^|\\s)${lit(mobileToken)}(?:\\s|$)`);
  const desktopRe = new RegExp(`(?:^|\\s)${lit(desktopToken)}(?:\\s|$)`);
  assert.match(className, mobileRe, `missing mobile base "${mobileToken}"`);
  assert.match(className, desktopRe, `missing desktop override "${desktopToken}"`);
}

test('GetInTouchSection: the LINE / phone / email card row stacks on mobile and goes 3-up at lg:', () => {
  // Anchored on the first card (the first <ChannelCard> directly after the
  // row's opening div). Comments are scrubbed to a lone `{ }`, so one remnant
  // is allowed in the gap — and only one, or it could match an earlier <div>.
  const row = GET_IN_TOUCH.code.match(/<div className="([^"]*)">\s*(?:\{\s*\}\s*)?<ChannelCard accent=/);
  assert.ok(row, 'could not find the channel card row');
  assertMobileBaseWithDesktopOverride(row[1], { mobileToken: 'grid-cols-1', desktopToken: 'lg:grid-cols-3' });
});

test('BusinessInfoSection: the address-cards/office-hours grid stacks on mobile and splits only at lg:', () => {
  // Anchored on the address-card <ul> (the one that maps COMPANY_CARDS), which
  // is unique in the file. The split is now 2/3 + 1/3, hence lg:grid-cols-3.
  const outer = BUSINESS_INFO.code.match(/<div className="([^"]*)">\s*<ul className="[^"]*">\s*\{COMPANY_CARDS\.map/);
  assert.ok(outer, 'could not find the address-cards/office-hours grid container');
  assertMobileBaseWithDesktopOverride(outer[1], { mobileToken: 'grid-cols-1', desktopToken: 'lg:grid-cols-3' });
});

test('BusinessInfoSection: each address card stacks on mobile and lays out as a row from sm:', () => {
  const li = BUSINESS_INFO.code.match(/\{COMPANY_CARDS\.map\([\s\S]*?<li\s+key=\{key\}\s+className=\{`([^`]*)`\}/);
  assert.ok(li, 'could not find the address card <li>');
  assertMobileBaseWithDesktopOverride(li[1], { mobileToken: 'flex-col', desktopToken: 'sm:flex-row' });
  // the long English address line wraps at word boundaries, never mid-word
  assert.doesNotMatch(BUSINESS_INFO.code, /\bbreak-all\b/);
  assert.match(BUSINESS_INFO.code, /(?:^|[\s"`])break-words(?:[\s"`]|$)/);
});

test('control: the pre-fix bare row/grid classes redden the same ordering check', () => {
  assert.throws(() =>
    assertMobileBaseWithDesktopOverride('grid grid-cols-3 gap-6', { mobileToken: 'grid-cols-1', desktopToken: 'lg:grid-cols-3' }),
  );
  assert.throws(() =>
    assertMobileBaseWithDesktopOverride('grid grid-cols-2 gap-6', {
      mobileToken: 'grid-cols-1',
      desktopToken: 'lg:grid-cols-2',
    }),
  );
});

const CONTACT_ROW_LI = /function ContactRow[\s\S]*?<li className="([^"]*)"/;

test('ContactRow: label and value stack on mobile and sit side by side from sm:', () => {
  const li = GET_IN_TOUCH.code.match(CONTACT_ROW_LI);
  assert.ok(li, 'could not find the ContactRow <li>');
  assertMobileBaseWithDesktopOverride(li[1], { mobileToken: 'flex-col', desktopToken: 'sm:flex-row' });
});

test('the phone and email lists both render through ContactRow and are vertical lists at every width', () => {
  // The old lists turned into a ROW at sm: and squeezed three addresses onto one
  // line; the new lists never do — each item handles its own orientation.
  const uls = [
    ...GET_IN_TOUCH.code.matchAll(/<ul className="([^"]*)">\s*\{(PHONES|EMAILS)\.map\(\(\w+\) => \(\s*<ContactRow/g),
  ];
  assert.deepEqual(uls.map((m) => m[2]).sort(), ['EMAILS', 'PHONES'], 'expected exactly the phone and email lists');
  for (const [, className] of uls) {
    assert.match(className, /(?:^|\s)flex-col(?:\s|$)/);
    assert.doesNotMatch(className, /(?:^|\s)(?:\w+:)?flex-row(?:\s|$)/, 'a list-level row brings the squeeze back');
  }
});

/** The divider claim: rows in a vertical list divide with a bottom border, never a right border at any width. */
function assertBottomDividerOnly(className) {
  assert.match(className, /(?:^|\s)border-b(?:\s|$)/, 'missing the bottom divider');
  assert.match(className, /(?:^|\s)last:border-b-0(?:\s|$)/, 'the last row must drop its divider');
  assert.doesNotMatch(
    className,
    /(?:^|\s)(?:\w+:)*border-r(?:\s|$)/,
    'a right border belongs to a row layout this list no longer has',
  );
}

test('ContactRow: the divider is a bottom border only, never a right border', () => {
  const li = GET_IN_TOUCH.code.match(CONTACT_ROW_LI);
  assert.ok(li, 'could not find the ContactRow <li>');
  assertBottomDividerOnly(li[1]);
});

test('control: the pre-redesign InfoRow divider (bottom on mobile, right from sm:) fails the bottom-only check', () => {
  const previous = 'border-b border-[#E2E8F0] pb-3 pt-3 first:pt-0 last:border-b-0 last:pb-0 sm:border-b-0 sm:border-r sm:px-4';
  assert.throws(() => assertBottomDividerOnly(previous));
});

test('the training-room card stacks on mobile and lays out as a 3-column row from md:', () => {
  // A grid now (icon | text | map thumbnail). The mobile base is two columns
  // — icon beside the h3 only — and everything else spans both, i.e. stacks.
  const card = GET_IN_TOUCH.code.match(/<div className="([^"]*)">\s*<IconTile icon=\{MapPin\}/);
  assert.ok(card, 'could not find the training-room card');
  assertMobileBaseWithDesktopOverride(card[1], {
    mobileToken: 'grid-cols-[auto_minmax(0,1fr)]',
    desktopToken: 'md:grid-cols-[auto_minmax(0,1fr)_260px]',
  });
  const thumb = GET_IN_TOUCH.code.match(/<MapThumbnailButton className="([^"]*)"/);
  assert.ok(thumb, 'could not find the map thumbnail');
  assertMobileBaseWithDesktopOverride(thumb[1], { mobileToken: 'col-span-2', desktopToken: 'md:col-span-1' });
});

test('the phone/email anchor no longer forces character-level breaks', () => {
  assert.doesNotMatch(GET_IN_TOUCH.code, /\bbreak-all\b/);
  // the ContactRow anchor specifically must still carry SOME wrap rule, not none
  const anchor = GET_IN_TOUCH.code.match(/<a\s+href=\{href\}\s+className="([^"]*)"/);
  assert.ok(anchor, 'could not find the ContactRow anchor');
  assert.match(anchor[1], /(?:^|\s)break-words(?:\s|$)/);
});

test('control: break-all reappearing on the anchor reddens the check above', () => {
  const reverted = '<a href={href} className="break-all text-base">';
  assert.throws(() => assert.doesNotMatch(reverted, /\bbreak-all\b/));
});
