import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PDFDownload } from '@/app/(public)/[...slug]/_components/PDFDownload';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { readSource } from '../sourceScan.mjs';

/**
 * The course-outline download card, in two slots.
 *
 * ── WHAT WAS BROKEN ─────────────────────────────────────────────────────────
 * It rendered only inside the <aside>, which below lg reflows to the very
 * bottom of the page — the same defect fb03dc1 fixed for the section nav, one
 * component later in the same aside. A download card you reach by scrolling
 * past the entire course is not reachable in practice.
 *
 * ── THE TRAP THE TWO-SLOT PATTERN SPRINGS ───────────────────────────────────
 * Add the mobile copy and leave the aside copy visible, and the card ships
 * TWICE below lg. It looks correct in any screenshot of the top of the page and
 * is wrong on every real one, which is why never-both is asserted here rather
 * than eyeballed. fb03dc1 hit exactly this and the guard is what caught it.
 *
 * ── WHAT THIS TIER CANNOT SEE ───────────────────────────────────────────────
 * It renders to a string: no layout, no viewport, no breakpoints. That the card
 * actually appears under the strip on a phone, and that left-aligned reads
 * better than centred at the widths involved, are click-tested by a human and
 * by nothing else. What is checked here is which classes reach the DOM and
 * which slots page.jsx mounts.
 */

const COURSE = {
  course_outline_th: { download_url: 'https://example.com/th.pdf' },
  course_outline_en: { download_url: 'https://example.com/en.pdf' },
};

const card = (props = {}) =>
  renderToStaticMarkup(createElement(PDFDownload, { course: COURSE, ...props }));

/** The card's root element. */
function root(markup) {
  const m = markup.match(/<div class="[^"]*rounded-2xl[^"]*"/);
  if (!m) {
    throw new Error(
      'the download card did not render, or lost its rounded-2xl root. Every ' +
        'class check below would then pass vacuously, so this throws.'
    );
  }
  return m[0];
}

const PAGE = readSource('src/app/(public)/[...slug]/page.jsx');

// ── never both ──────────────────────────────────────────────────────────────

test('page.jsx mounts exactly two slots, one hidden at each breakpoint', () => {
  // Read as CODE: the surrounding comments discuss lg:hidden and hidden lg:flex
  // by name, and a raw scan would count the prose as a third mount.
  const mounts = PAGE.code.match(/<PDFDownload[^/]*\/>/g) || [];
  assert.equal(mounts.length, 2, 'exactly two — a mobile slot and a desktop slot');

  const classes = mounts.map((m) => (m.match(/className="([^"]*)"/) || [])[1]);
  assert.deepEqual(
    classes.slice().sort(),
    ['hidden lg:flex', 'lg:hidden'],
    'one is mobile-only and the other desktop-only — never both at one width'
  );
});

test('CONTROL: that probe would accept a duplicate if both slots were visible', () => {
  // Without this, "deepEqual to those two strings" could be passing because the
  // probe cannot see a className at all.
  const bothVisible = '<PDFDownload course={course} />\n<PDFDownload course={course} />';
  const mounts = bothVisible.match(/<PDFDownload[^/]*\/>/g) || [];
  assert.equal(mounts.length, 2, 'the mount probe still finds two');
  const classes = mounts.map((m) => (m.match(/className="([^"]*)"/) || [])[1]);
  assert.notDeepEqual(
    classes.slice().sort(),
    ['hidden lg:flex', 'lg:hidden'],
    'but the class check rejects them — which is the assertion doing work'
  );
});

test('the desktop slot restores FLEX, not block', () => {
  // The root is a flex row. `hidden lg:block` would bring it back at lg as a
  // block and stack the icon above the text.
  assert.match(PAGE.code, /<PDFDownload[^/]*className="hidden lg:flex"/);
  assert.equal(
    /<PDFDownload[^/]*className="hidden lg:block"/.test(PAGE.code),
    false,
    'lg:block would break the row it is restoring'
  );
});

test('CONTROL: the block/flex probes tell the two apart', () => {
  const withBlock = '<PDFDownload course={course} className="hidden lg:block" />';
  assert.equal(/className="hidden lg:block"/.test(withBlock), true);
  assert.equal(/className="hidden lg:flex"/.test(withBlock), false);
});

// ── the className seam ──────────────────────────────────────────────────────

test('the slot class reaches the root and the card is authored once', () => {
  assert.match(root(card({ className: 'lg:hidden' })), /\blg:hidden\b/);
  assert.match(root(card({ className: 'hidden lg:flex' })), /\bhidden lg:flex\b/);
  // Both slots are the same card: the base classes are identical either way.
  for (const base of ['rounded-2xl', 'flex-wrap', 'items-center', 'shadow-9e-md']) {
    assert.match(root(card({ className: 'lg:hidden' })), new RegExp(`\\b${base}\\b`));
    assert.match(root(card({ className: 'hidden lg:flex' })), new RegExp(`\\b${base}\\b`));
  }
});

test('CONTROL: a card rendered with no slot class carries neither', () => {
  // Proves the two assertions above read the passed value rather than something
  // the card ships regardless.
  const bare = root(card());
  assert.equal(/\blg:hidden\b/.test(bare), false);
  assert.equal(/\bhidden\b/.test(bare), false);
});

// ── not sticky ──────────────────────────────────────────────────────────────

test('neither slot is sticky', () => {
  // A second sticky element would force SECTION_ANCHOR_CLASS up again — it is
  // scroll-mt-36 = 80 header + 48 strip + 16 — in a place nobody remembers to
  // look, and this card is several times the strip's height.
  //
  // Asserted at the CALL SITES, not against a hardcoded class string. The first
  // draft rendered the card with a literal 'lg:hidden' and asked whether THAT
  // was sticky, which is a question about the test's own input: adding `sticky`
  // in page.jsx left this green (a mutation caught it, via an unrelated
  // assertion). Reading what page.jsx actually passes is what makes the claim
  // about the page.
  const mounts = PAGE.code.match(/<PDFDownload[^/]*\/>/g) || [];
  assert.equal(mounts.length, 2, 'both slots are being examined');
  for (const mount of mounts) {
    assert.equal(/\bsticky\b/.test(mount), false, `slot is in flow: ${mount}`);
    assert.equal(/\bfixed\b/.test(mount), false, `slot is not pinned either: ${mount}`);
  }
  // The card does not bring stickiness of its own either.
  assert.equal(/\bsticky\b/.test(root(card())), false, 'nor does the card itself');
});

test('CONTROL: the sticky probe fires on something that is sticky', () => {
  // The tab strip, which genuinely is — so the negative above is a reading of
  // this card rather than a regex that matches nothing.
  const tabs = readSource('src/app/(public)/[...slug]/_components/CourseSectionTabs.jsx');
  assert.match(tabs.code, /\bsticky\b/, 'the strip is sticky');
  assert.equal(/\bsticky\b/.test(root(card({ className: 'lg:hidden' }))), false);
});

// ── the alignment decision ──────────────────────────────────────────────────

test('the card is ONE row: label absorbs the slack, buttons sit at the right edge', () => {
  // Replaces an assertion about a stacked label above a button row. That
  // arrangement is gone: the label and the buttons are siblings on one line now,
  // which is what "use the width" means here — and it dissolves the question of
  // whether the two share a left edge, since they no longer sit above each
  // other. (They did share one: both were flex items of an items-start column
  // with no margin or padding. What looked like an offset was the old button's
  // own border-2 + px-4 insetting its TEXT 18px from its box edge.)
  const markup = card({ className: 'lg:hidden', layout: 'row' });
  assert.match(
    markup,
    /<p class="[^"]*\bflex-1\b[^"]*"/,
    'the label is flex-1, so it pushes the buttons right'
  );
  assert.equal(
    /min-w-0/.test(markup),
    false,
    'and NOT min-w-0 — that would let it shrink to nothing instead of wrapping'
  );
  assert.match(markup, /<div class="flex shrink-0 gap-2"/, 'the button group is content-sized');
  assert.match(markup, /flex-row items-center/, 'the row layout runs horizontally');
});

test('CONTROL: the one-row probes reject the stacked layout they replaced', () => {
  const stacked =
    '<div class="flex flex-col items-start w-full gap-3">' +
    '<p class="text-sm font-semibold">x</p><div class="flex flex-wrap gap-2 "></div></div>';
  assert.equal(/<p class="flex-1 [^"]*"/.test(stacked), false, 'no flex-1 label');
  assert.equal(/<div class="flex shrink-0 gap-2"/.test(stacked), false, 'no shrink-0 group');
  assert.equal(/flex flex-col items-start w-full/.test(stacked), true, 'and it IS the old shape');
});

test('a single button does not stretch across the card', () => {
  // The filtered list can hold one entry. `shrink-0` on the group and no flex-1
  // on the button means it stays a button rather than becoming a full-width CTA.
  const oneOnly = card({ course: { course_outline_th: { download_url: 'https://x/th.pdf' } } });
  const anchors = oneOnly.match(/<a\b[^>]*>/g) || [];
  assert.equal(anchors.length, 1);
  assert.equal(/\bflex-1\b/.test(anchors[0]), false, 'the button itself never grows');
  assert.equal(/\bw-full\b/.test(anchors[0]), false, 'nor is it stretched by a width class');
  assert.match(oneOnly, /<div class="flex shrink-0 gap-2"/, 'its container is still shrink-0');
});

// ── the shared Button, not a second dialect ─────────────────────────────────

test('the buttons come from the shared Button, not a hand-rolled class string', () => {
  const markup = card({ className: 'lg:hidden' });
  const anchors = markup.match(/<a\b[^>]*>/g) || [];
  assert.equal(anchors.length, 2, 'both language buttons render');

  for (const a of anchors) {
    // Signatures only the shared component produces: its cva base ring and
    // radius token. A hand-rolled string had neither.
    assert.match(a, /focus-visible:ring-9e-brand/, 'it carries the design-system focus ring');
    assert.match(a, /\brounded-9e-md\b/, 'and a token radius from the 9e scale');
    assert.match(a, /border-9e-brand/, 'and the outline variant');
    // The old dialect, gone.
    assert.equal(/\bborder-2\b/.test(a), false, 'no hand-rolled border-2');
    assert.equal(/\brounded-xl\b/.test(a), false, 'no hand-rolled rounded-xl');
    assert.equal(/\bpy-2\b/.test(a), false, 'no hand-rolled py-2');
  }

  // asChild must keep the anchor an anchor, with its attributes intact.
  assert.match(
    markup,
    /<a href="https:\/\/example\.com\/th\.pdf" target="_blank" rel="noopener noreferrer"/,
    'Radix Slot passes href/target/rel straight through to the anchor'
  );
});

test('the component imports the shared Button rather than restyling one', () => {
  // Read as CODE: the docstring explains the old class string by quoting
  // border-2 and py-2, and a raw scan would read that explanation as the defect
  // — the heroBannerPointerCapture wrong turn.
  const src = readSource('src/app/(public)/[...slug]/_components/PDFDownload.jsx');
  assert.match(
    src.withImports,
    /import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*['"]@\/components\/ui\/button['"]/,
    'it imports the shared Button'
  );
  assert.equal(/\bborder-2\b/.test(src.code), false, 'and no hand-rolled border-2 survives in code');
});

test('CONTROL: those probes fire on the class string this replaced', () => {
  // The real pre-change OutlineButton, quoted.
  const handRolled =
    '<a class="inline-flex items-center gap-2 rounded-xl border-2 ' +
    'border-[var(--surface-border)] px-4 py-2 text-sm font-semibold">';
  assert.equal(/\bborder-2\b/.test(handRolled), true);
  assert.equal(/\brounded-xl\b/.test(handRolled), true);
  assert.equal(/\bpy-2\b/.test(handRolled), true);
  assert.equal(/focus-visible:ring-9e-brand/.test(handRolled), false, 'it had no focus ring');
  assert.equal(/\brounded-9e-\w+\b/.test(handRolled), false, 'and no token radius at all');
  // ...and the prose exemption is real: the docstring quotes those tokens.
  const src = readSource('src/app/(public)/[...slug]/_components/PDFDownload.jsx');
  assert.equal(/\bborder-2\b/.test(src.raw), true, 'the raw file names it in prose');
  assert.equal(/\bborder-2\b/.test(src.code), false, 'the scrub is what tells them apart');
});

// ── the radius, and the merge trap behind it ────────────────────────────────

test('the buttons are a rounded rectangle, and EXACTLY ONE radius class survives', () => {
  // Read off the RENDER, never the source. A source-level check would go green
  // on markup carrying both classes, which is precisely the failure mode here:
  // the wrong shape would still ship.
  for (const a of card({ className: 'lg:hidden' }).match(/<a\b[^>]*>/g) || []) {
    const radii = a.match(/\brounded-9e-\w+\b/g) || [];
    assert.deepEqual(
      radii,
      ['rounded-9e-md'],
      'one radius class, and it is the 12px one — two would mean the winner is ' +
        'decided by stylesheet order rather than by this component'
    );
  }
});

test('12px clears the pill threshold that 24px does not', () => {
  // A radius at or above HALF the height collapses the shape to a full pill.
  // The buttons are h-11 = 44px, so the threshold is 22px. Both numbers come
  // from the config scale rather than being restated here.
  const CONFIG = readSource('tailwind.config.js').raw;
  const radiusOf = (key) => Number(CONFIG.match(new RegExp(`'9e-${key}':\\s*'(\\d+)px'`))[1]);
  const HEIGHT = 44; // h-11 = 2.75rem, asserted against the tree below

  assert.equal(radiusOf('md'), 12, 'the chosen value');
  assert.equal(radiusOf('xl'), 24, "Button's default");
  assert.ok(radiusOf('md') < HEIGHT / 2, '12 < 22, so the shape stays a rectangle');
  assert.ok(radiusOf('xl') >= HEIGHT / 2, '24 >= 22, which is why the default read as a circle');
  // And it matches the icon box beside it: rounded-xl is stock 12px too.
  assert.match(card({ className: 'lg:hidden' }), /rounded-xl bg-red-50/, 'icon box is 12px');
});

test('CONTROL: a className override would have left BOTH classes in the markup', () => {
  // This is why the radius is a cva variant and not `className="rounded-9e-md"`.
  // twMerge only drops the base when it recognises the two as one conflict
  // group, and the 9e keys are custom — measured, not assumed.
  assert.equal(
    cn('rounded-9e-xl', 'rounded-9e-md'),
    'rounded-9e-xl rounded-9e-md',
    'both survive, so the winner would be decided by emission order'
  );
  // ...while the STOCK pair merges correctly, which is the control proving the
  // probe is reading a real difference and not a broken cn.
  assert.equal(cn('rounded-xl', 'rounded-md'), 'rounded-md');
  assert.equal(cn('px-6', 'px-3'), 'px-3', 'and why the px override does work');
});

test('a default Button is unchanged by the radius becoming a variant', () => {
  // The variant defaults to xl, so every other Button on the site renders
  // exactly as before. Without this, moving the radius out of the base could
  // have silently restyled every button in the app.
  const dflt = renderToStaticMarkup(createElement(Button, null, 'X'));
  assert.match(dflt, /\brounded-9e-xl\b/, 'still xl by default');
  assert.deepEqual((dflt.match(/\brounded-9e-\w+\b/g) || []), ['rounded-9e-xl'], 'and only one');
});

// ── the two slots differ in LAYOUT, not just visibility ─────────────────────

test('row puts label and buttons side by side; stacked puts buttons underneath', () => {
  const row = card({ layout: 'row', className: 'lg:hidden' });
  const stacked = card({ layout: 'stacked', className: 'hidden lg:flex' });

  assert.match(row, /flex flex-1 gap-3 flex-row items-center/, 'row runs horizontally');
  assert.equal(/flex-col/.test(row), false, 'and never vertically');

  assert.match(stacked, /flex flex-1 gap-3 flex-col items-center/, 'stacked runs vertically');
  assert.equal(/flex-row/.test(stacked), false, 'and never horizontally');
});

// ── alignment: centred stacked, left in the row ─────────────────────────────

test('the stacked slot CENTRES the download zone; the row slot does not', () => {
  // Overrules c3d0268's "left is right in both". That argument was about a
  // one-row layout with a leading icon to align to; a stacked column has
  // nothing to align to, so it centres.
  assert.match(
    card({ layout: 'stacked' }),
    /flex-col items-center/,
    'heading and button row centre as a column'
  );
  assert.equal(
    /flex-col items-start/.test(card({ layout: 'stacked' })),
    false,
    'the old left alignment is gone from the stacked slot'
  );
  // The row slot is unaffected. Note `items-center` appears there too and is
  // NOT centring: on a flex-ROW it is vertical alignment, which is what keeps
  // the label optically level with the buttons. Horizontal centring is
  // flex-COL + items-center, and only the stacked slot has that pair — which
  // is why every probe here names the direction alongside the alignment.
  assert.match(card({ layout: 'row' }), /flex-row items-center/, 'vertical alignment, not centring');
  assert.match(
    card({ layout: 'row' }),
    /<p class="[^"]*\bflex-1\b[^"]*"/,
    'and its label is left-anchored, absorbing the slack toward the buttons'
  );
});

test('CONTROL: the centring probe distinguishes the two slots', () => {
  // Without this, `items-center` could be matching the ROOT, which carries it
  // in both layouts for the leading icon.
  const row = card({ layout: 'row' });
  const stacked = card({ layout: 'stacked' });
  assert.equal(/flex-col items-center/.test(row), false, 'the row slot never centres a column');
  assert.equal(/flex-col items-center/.test(stacked), true, 'the stacked slot does');
});

test('the leading file icon stays a left badge in BOTH slots', () => {
  // It does not join the centring: the root keeps flex-row/items-center either
  // way, so the icon is the same element in the same place in both shapes. The
  // alternative — one centred stack with the icon on top — was rejected; see
  // the component docstring.
  for (const layout of ['row', 'stacked']) {
    const markup = card({ layout });
    assert.match(
      markup,
      /<div class="flex flex-wrap items-center gap-3 [^"]*">\s*<div class="flex h-11 w-11 shrink-0/,
      `${layout}: the icon is the first child of a horizontal, vertically-centred root`
    );
    assert.equal(
      /<div class="[^"]*\bflex-col\b[^"]*">\s*<div class="flex h-11 w-11/.test(markup),
      false,
      `${layout}: the root never stacks the icon above the content`
    );
  }
});

test('CONTROL: the direction probes tell the two layouts apart', () => {
  // Without this, both `match` calls could be passing against a string that
  // contains every utility.
  const row = card({ layout: 'row' });
  const stacked = card({ layout: 'stacked' });
  assert.notEqual(row, stacked, 'the two layouts really do render differently');
  assert.equal(/flex-col items-start/.test(row), false);
  assert.equal(/flex-row items-center/.test(stacked), false);
});

// ── the Download-icon asymmetry ─────────────────────────────────────────────

test('each button carries a Download icon when STACKED and none when ROW', () => {
  // Deliberately not symmetric. Stacked, the buttons own a whole row and the
  // icon is free. In the row slot the label and buttons share one line, so the
  // icon would come out of the label's budget and the card's 70px would depend
  // on the label's rendered width instead of being true by construction.
  const stackedIcons = (card({ layout: 'stacked' }).match(/lucide-download/g) || []).length;
  const rowIcons = (card({ layout: 'row' }).match(/lucide-download/g) || []).length;

  assert.equal(stackedIcons, 2, 'one per button in the stacked slot');
  assert.equal(rowIcons, 0, 'and none at all in the row slot');
});

test('CONTROL: restoring symmetry in EITHER direction is caught', () => {
  // This is the whole reason the test exists: someone tidying the asymmetry
  // away would silently re-grow the mobile card, and nothing else in the suite
  // reads this component's icons. Both directions must be detectable, so the
  // probe is fired at markup standing in for each mistake.
  const iconsIn = (s) => (s.match(/lucide-download/g) || []).length;

  const bothHaveIcons = '<a>lucide-download</a><a>lucide-download</a>';
  assert.notEqual(iconsIn(bothHaveIcons), 0, 'icons everywhere would not read as 0');

  const neitherHasIcons = '<a>TH</a><a>EN</a>';
  assert.notEqual(iconsIn(neitherHasIcons), 2, 'icons nowhere would not read as 2');

  // ...and the probe really is counting this component's icons, not the card's
  // own file icon, which is present in both slots and is a different glyph.
  assert.equal((card({ layout: 'row' }).match(/lucide-file-text/g) || []).length, 1);
  assert.equal((card({ layout: 'stacked' }).match(/lucide-file-text/g) || []).length, 1);
});

test('the icon does not change the button height, so the card does not grow', () => {
  // The icon sits inside a fixed h-11 button. If it ever escaped that box the
  // stacked card would get taller, which is the thing the ruling trades away.
  for (const a of card({ layout: 'stacked' }).match(/<a\b[^>]*>/g) || []) {
    assert.match(a, /\bh-11\b/, 'still the 44px tap target with an icon inside');
  }
});

test('the label is flex-1 only in the row layout', () => {
  // Stacked has no slack to absorb — the label is simply the first row — so
  // flex-1 there would be noise.
  assert.match(card({ layout: 'row' }), /<p class="[^"]*\bflex-1\b[^"]*"/);
  assert.equal(/<p class="[^"]*\bflex-1\b[^"]*"/.test(card({ layout: 'stacked' })), false);
});

test('page.jsx names a layout at each mount, and no breakpoint decides it', () => {
  // The subject is what page.jsx passes, not what this file constructs — the
  // fixture-versus-source failure from 0e18d85.
  const mounts = PAGE.code.match(/<PDFDownload[^/]*\/>/g) || [];
  assert.equal(mounts.length, 2);
  const layouts = mounts.map((m) => (m.match(/layout="([^"]*)"/) || [])[1]);
  assert.deepEqual(layouts.slice().sort(), ['row', 'stacked'], 'one of each, said explicitly');

  // A breakpoint would read BACKWARDS here: the narrow slot is the lg one.
  const src = readSource('src/app/(public)/[...slug]/_components/PDFDownload.jsx');
  assert.equal(
    /\blg:flex-(col|row)\b/.test(src.code),
    false,
    'direction is never decided by an lg: prefix'
  );
});

test('CONTROL: the layout probe would notice a mount that named none', () => {
  const missing = '<PDFDownload course={course} className="lg:hidden" />';
  assert.equal((missing.match(/layout="([^"]*)"/) || [])[1], undefined);
});

// ── the tap target ──────────────────────────────────────────────────────────

test('every button meets the 44px tap target', () => {
  for (const a of card({ className: 'lg:hidden' }).match(/<a\b[^>]*>/g) || []) {
    assert.match(a, /\bh-11\b/, 'h-11 = 2.75rem = 44px, the site-wide interactive height');
    for (const shorter of [/\bh-9\b/, /\bh-10\b/]) {
      assert.equal(shorter.test(a), false, `${shorter} is under the minimum`);
    }
  }
});

test('44px is read off the ruling, not hardcoded here', () => {
  // ScrollToTopButton's docstring records why: it shipped at h-10 and was raised
  // because 40px was four under the minimum. If the site rule ever moves, this
  // goes red rather than the card quietly drifting away from it.
  const scrollTop = readSource('src/components/ui/ScrollToTopButton.jsx');
  assert.match(scrollTop.code, /\bh-11\b/, 'the ruling still stands in the tree');
  assert.match(card({ className: 'lg:hidden' }), /\bh-11\b/, 'and this card matches it');
});

test('CONTROL: the height probe can tell 44px from what was there before', () => {
  // The old string had no height class at all — it measured 40px from
  // text-sm's 20px line box + py-2's 16px + border-2's 4px.
  const old = '<a class="inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm">';
  assert.equal(/\bh-11\b/.test(old), false, 'no explicit height, and 40px in practice');
  assert.equal(/\bh-11\b/.test('<a class="h-11 px-3">'), true, 'while the probe does see one');
});

// ── unchanged behaviour ─────────────────────────────────────────────────────

test('a course with no outline files still renders nothing', () => {
  assert.equal(renderToStaticMarkup(createElement(PDFDownload, { course: {} })), '');
  assert.equal(
    renderToStaticMarkup(createElement(PDFDownload, { course: {}, className: 'lg:hidden' })),
    '',
    'and a slot class does not conjure an empty card'
  );
});

test('one language present renders one button, not two', () => {
  const markup = card({ course: { course_outline_th: COURSE.course_outline_th } });
  const links = markup.match(/<a\b/g) || [];
  assert.equal(links.length, 1);
  assert.match(markup, />TH</);
});
