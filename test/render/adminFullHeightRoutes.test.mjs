import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname } from 'next/navigation';
import { AdminContentWrapper } from '@/components/layout/AdminContentWrapper';
import { readSource } from '../sourceScan.mjs';

/**
 * A viewport-height page must not sit inside a padded, scrolling wrapper.
 *
 * ── THE CHAIN, AND WHY THE PADDING IS THE BUG ───────────────────────────────
 *   admin/layout.jsx:49   <div class="flex h-screen overflow-hidden">
 *   admin/layout.jsx:59     <main class="h-screen flex-1 overflow-y-auto">
 *   AdminContentWrapper:23    <div class={isFullHeight ? '' : 'p-6'}>
 *   CourseForm / ArticleForm    <form class="flex h-[100dvh] flex-col">
 *
 * A page that declares `h-[100dvh]` fills `main` exactly — but only if nothing
 * between them adds height. `p-6` makes the content box 100dvh + 48px, so
 * `main` grows a SECOND scrollbar inside the one the sidebar row already pins,
 * and the page's header — a `flex-shrink-0` child whose whole purpose is to
 * stay on screen — scrolls out of view. It is reported as a spacing problem and
 * is not one: the padding is fine, nesting a viewport-height box in it is not.
 *
 * This is height arithmetic, not appearance, so it holds at ANY viewport: the
 * overflow is 48px whether the screen is 600px tall or 1400px. A short viewport
 * is simply where it is most visible, because the header is a larger fraction
 * of what is lost.
 *
 * `usePathname` is stubbed per case (the loader's next/navigation stub reads a
 * module-level value), so this exercises the REAL matcher against real paths.
 */

/**
 * Set the route and render, SYNCHRONOUSLY and in one tick.
 *
 * Two things this shape is load-bearing for, both learned the hard way:
 *
 *   · it imports `next/navigation`, NOT the stub file by relative path. The
 *     loader maps the specifier; importing the file directly yields a SECOND
 *     module instance on Windows (the loader's absolute path and a relative
 *     resolve disagree on drive-letter casing), so the setter writes to a copy
 *     the component never reads.
 *   · nothing here awaits. The pathname is shared module state and this runner
 *     runs tests concurrently with `isolation: 'none'`, so an `await` between
 *     setting and rendering lets another test set it first. No await means no
 *     interleaving, and the value never escapes the tick it was set in.
 */
function wrapperFor(pathname) {
  __setPathname(pathname);
  try {
    return renderToStaticMarkup(
      createElement(AdminContentWrapper, null, createElement('form', {
        className: 'flex h-[100dvh] flex-col',
      }))
    );
  } finally {
    __setPathname('/');
  }
}

const padded = (html) => /class="p-6"/.test(html);

// ── the route this round fixes ──────────────────────────────────────────────

test('the full-height matcher covers the course editor and the article editor', () => {
  for (const path of [
    '/admin/courses/692d39b52ee07293c9131fd8/edit',
    // FLIPPED DELIBERATELY. `/admin/courses/new` used to be asserted below as
    // a route that KEEPS its padding, and that was correct while it rendered a
    // linear layout. It now renders the same h-[100dvh] shell as the editor, so
    // the padding is the defect rather than the requirement — a 100dvh child in
    // a p-6 box is 100dvh + 48px, which is the second scrollbar this file
    // exists to prevent.
    '/admin/courses/new',
    '/admin/articles/abc123/edit',
    '/admin/articles/new',
  ]) {
    assert.equal(padded(wrapperFor(path)), false, `${path} is still padded`);
  }
});

test('the full-height matcher covers the Page Builder editor', () => {
  // Added in the SAME commit as the FULL_HEIGHT_ROUTES entry and as
  // EditorShell's height, for the reason the /admin/courses/new note above
  // gives: an assertion about padding that is left to be flipped later fails
  // mysteriously, at a moment when nobody is holding the reason in their head.
  //
  // EditorShell declares `h-[100dvh]`, so the same arithmetic applies here as to
  // CourseForm and ArticleForm — 100dvh inside p-6 is 100dvh + 48px, and `main`
  // grows the second scrollbar this file exists to prevent. Before this round
  // the shell said `calc(100dvh-4rem)`, which had no referent on this route (the
  // admin chrome is a sidebar, not a top bar) and merely happened to leave 16px
  // of slack over the padding rather than overflowing. That near-miss is why
  // this went unreported, and is not a reason to keep either number.
  for (const path of [
    '/admin/pages/builder/new',
    '/admin/pages/builder/692d39b52ee07293c9131fd8/edit',
  ]) {
    assert.equal(padded(wrapperFor(path)), false, `${path} is still padded`);
  }
});

test('CONTROL: the builder prefix does not reach the sibling /admin/pages routes', () => {
  // The negative case, and the reason the entry is anchored on
  // `/admin/pages/builder/` rather than `/admin/pages/`. `/admin/pages` is the
  // list of both page kinds; a prefix on `/admin/pages/` would strip its padding
  // — the same three-pages-broken-to-fix-one regression the courses control
  // above guards against.
  assert.equal(padded(wrapperFor('/admin/pages')), true, '/admin/pages lost its padding');
  assert.equal(padded(wrapperFor('/admin/pages/')), true, '/admin/pages/ lost its padding');
});

test('CONTROL: a path merely CONTAINING "builder" is not opted out', () => {
  // `startsWith` is the anchor. A custom page whose id or slug contains the word
  // must not lose its padding, and a sibling segment that begins with it must
  // not either.
  assert.equal(padded(wrapperFor('/admin/pages/builder-notes')), true);
  assert.equal(padded(wrapperFor('/admin/articles/page-builder')), false); // articles prefix, not this one
  assert.equal(padded(wrapperFor('/admin/media/builder/x')), true);
});

test('the builder shell states 100dvh, and the wrapper is what makes that fit', () => {
  // THE PAIR, asserted together for the same reason the registrations case below
  // asserts its own: two numbers in two files with nothing mechanical holding
  // them together. `h-[100dvh]` is only correct while this route is unpadded,
  // and the route being unpadded is only worth doing while the shell declares a
  // viewport height. Either one changing alone is the defect.
  const shell = readSource('src/components/pageBuilder/editor/EditorShell.jsx').code;
  assert.match(shell, /h-\[100dvh\]/,
    'EditorShell no longer declares a viewport height — if it went back to auto '
    + 'height, opting the route out of p-6 is now just missing padding');
  assert.doesNotMatch(shell, /calc\(100dvh-4rem\)/,
    'the 4rem is back. There is no 4rem on this route: the admin chrome is a '
    + 'sidebar beside <main>, not a bar above it, so the subtraction has no '
    + 'referent and now leaves a 64px dead band under the shell');
  assert.equal(padded(wrapperFor('/admin/pages/builder/new')), false,
    'the wrapper pads the builder route again — the shell’s 100dvh is now '
    + '100dvh + 48px and <main> has a second scrollbar');
});

test('CONTROL: the height probe reads the shell, and can tell the two forms apart', () => {
  // Discrimination rather than existence: `h-[calc(100dvh-4rem)]` CONTAINS
  // `100dvh`, so a naive /100dvh/ match would have passed happily on the old
  // file and this guard would have been green about nothing.
  const before = '<div className="flex h-[calc(100dvh-4rem)] flex-col">';
  const after = '<div className="flex h-[100dvh] flex-col">';
  assert.match(before, /100dvh/);                    // both contain it…
  assert.match(after, /100dvh/);
  assert.doesNotMatch(before, /h-\[100dvh\]/);       // …only the probe used above separates them
  assert.match(after, /h-\[100dvh\]/);
  assert.match(before, /calc\(100dvh-4rem\)/);
  assert.doesNotMatch(after, /calc\(100dvh-4rem\)/);
});

/**
 * ── THE ADVANCED HTML EDITOR, PINNED AT LAST ───────────────────────────────
 *
 * This block used to say the opposite: that `/admin/pages/new` and
 * `/admin/pages/[id]/edit` had been MEASURED as the 100dvh-inside-p-6 shape
 * this file exists to prevent, and were deliberately not asserted either way.
 * The reasoning was sound and is kept here rather than deleted, because it is
 * why the assertions below took this long to arrive:
 *
 *   · asserting they KEPT their padding would have written a defect down as a
 *     requirement, and this file's own history is what that costs — the
 *     `/admin/courses/new` assertion above was correct when written and had to
 *     be flipped later;
 *   · asserting they LOST it would have been a layout change to a different
 *     editor, smuggled in through a Page Builder commit and verified by nobody
 *     clicking it.
 *
 * So it asked for "its own round, with a browser pass on the Tiptap form". This
 * is that round. The browser pass was done first, in Chrome at 1440×900 against
 * the running dev server, and it is what these assertions are written from
 * rather than the other way about:
 *
 *   BEFORE  wrapper `p-6`, computed 24px on all four sides,
 *           main.scrollHeight 948 > main.clientHeight 900 — second scrollbar
 *   AFTER   wrapper class empty, computed 0px on all four sides,
 *           900 = 900 — no second scrollbar
 *
 * Nothing below is a FLIP: no assertion in this file ever claimed these two
 * routes were padded, which is exactly what the block above bought by declining
 * to guess. They are additions, and the controls that already pinned
 * `/admin/pages` and `/admin/pages/builder-notes` as padded are unchanged and
 * still pass — which is what proves the two new patterns are narrow.
 */

test('the full-height matcher covers the Advanced HTML editor', () => {
  // CustomPageForm declares `flex h-[100dvh] flex-col`, so the same arithmetic
  // applies to it as to CourseForm, ArticleForm and EditorShell: 100dvh inside
  // p-6 is 100dvh + 48px, and <main> grows a second scrollbar inside the one the
  // sidebar row already pins.
  for (const path of [
    '/admin/pages/new',
    '/admin/pages/6a968329b88308d8ed4afeca/edit',
    '/admin/pages/new/',
    '/admin/pages/6a968329b88308d8ed4afeca/edit/',
  ]) {
    assert.equal(padded(wrapperFor(path)), false, `${path} is still padded`);
  }
});

test('the Tiptap form states 100dvh, and the wrapper is what makes that fit', () => {
  // THE PAIR, for the same reason the builder's pair is asserted above: two
  // numbers in two files with nothing mechanical holding them together.
  // `h-[100dvh]` is only correct while this route is unpadded, and the route
  // being unpadded is only worth doing while the form declares a viewport
  // height. Either one changing alone is the defect.
  const form = readSource('src/app/admin/pages/_components/CustomPageForm.jsx').code;
  assert.match(form, /h-\[100dvh\]/,
    'CustomPageForm no longer declares a viewport height — if it went back to auto '
    + 'height, opting these two routes out of p-6 is now just missing padding');
  assert.equal(padded(wrapperFor('/admin/pages/new')), false,
    'the wrapper pads the Advanced HTML editor again — the form’s 100dvh is now '
    + '100dvh + 48px and <main> has a second scrollbar');
});

test('CONTROL: the two new patterns are narrow, and reach nothing else', () => {
  /**
   * The whole risk of this change is a matcher that is one character too wide.
   * `/admin/pages` is the list of BOTH page kinds and must keep its padding, and
   * so must anything under it that is not one of the two editors.
   *
   * The first two cases are the ones a `/admin/pages/` prefix would have broken,
   * and they are asserted here as well as in the builder control above because
   * this commit is the one that could break them.
   */
  for (const path of [
    '/admin/pages',                       // the list
    '/admin/pages/',
    '/admin/pages/builder-notes',         // a sibling that merely starts alike
    '/admin/pages/6a968329b8/edit-notes', // ends alike, is not /edit
    '/admin/pages/6a968329b8/preview',    // a future non-editor subroute
    '/admin/pages/newsletter',            // starts with "new", is not "new"
    '/admin/pages/a/b/edit',              // too deep for [^/]+
  ]) {
    assert.equal(padded(wrapperFor(path)), true, `${path} lost its padding`);
  }
});

// ── THE CONTROL: everything else keeps its padding ──────────────────────────

test('CONTROL: the other course routes KEEP their padding', () => {
  // The reason this is an exact pattern and not a `/admin/courses/` prefix.
  // A prefix would strip the padding off three working pages to fix one, which
  // is the regression this control exists to catch.
  for (const path of [
    '/admin/courses',                  // the list
    '/admin/courses/COPILOT-STU',      // promos / Early Bird / FAQ / payment
  ]) {
    assert.equal(padded(wrapperFor(path)), true, `${path} lost its padding`);
  }
});

test('CONTROL: an unrelated admin page keeps its padding', () => {
  // Proves the assertion above can fail — if the wrapper stopped padding
  // everything, every "is not padded" test would pass and be worthless.
  for (const path of ['/admin/articles', '/admin/registrations', '/admin/media']) {
    assert.equal(padded(wrapperFor(path)), true, `${path} lost its padding`);
  }
});

/**
 * ── THE REGISTRATIONS PAGE CANCELS THE SHELL'S TOP PADDING, AND ONLY THE TOP ─
 *
 * REPORTED AS "a large empty band above the ระบบจัดการ eyebrow". The cause was
 * this wrapper: `/admin/registrations` is not a full-height route, so it gets
 * `p-6`, and the 24px that contributes STACKED with the page's own `pt-[34px]`
 * — putting the eyebrow 58px down where the geometry says 34px.
 *
 * The page answers with `-mt-6`, which cancels the top and leaves the left,
 * right and bottom padding it still wants. That makes the geometry's 34px stated
 * exactly ONCE, on the page's own header, where it can be read against the
 * design.
 *
 * ── THE COUPLING IS THE WHOLE REASON THIS TEST EXISTS ──────────────────────
 * `-mt-6` only cancels `p-6` while the wrapper says `p-6`. Nothing mechanical
 * holds them together: they are two numbers in two files, and if this wrapper's
 * padding ever changes, the registrations page silently acquires a gap or an
 * overlap that no other guard would notice. Asserting the PAIR here — the
 * rendered wrapper class and the page's source — is what keeps them in step, and
 * this file is the right home because it already owns the claim that
 * `/admin/registrations` is padded at all.
 */
// `readSource` is a static import now (the builder height guard above needs it
// too). This case no longer awaits, which is what the header asks of every case
// in this file: no await can interleave between setting the pathname and
// rendering.
test('the registrations page cancels the shell’s top padding, and the two numbers agree', () => {
  const page = readSource('src/app/admin/registrations/page.jsx').code;

  // The page cancels the top…
  assert.match(page, /-mt-6/, 'the registrations page no longer cancels the shell padding — the '
    + 'eyebrow will sit 24px lower than the geometry says');
  // …and still states the geometry's 34px exactly once, itself.
  assert.match(page, /pt-\[34px\]/, 'the page header lost its 34px offset');

  // The wrapper really does supply `p-6` on this route, so `-mt-6` cancels it
  // exactly. If this ever becomes p-4 or p-8 the negative margin is wrong and
  // this is the assertion that says so.
  assert.equal(padded(wrapperFor('/admin/registrations')), true,
    'the wrapper stopped padding /admin/registrations — the page’s -mt-6 now pulls it off the top');
});

test('CONTROL: the coupling assertion reads the real pair, not one side twice', () => {
  // `-mt-6` is Tailwind's 1.5rem, the same scale step as `p-6`. If the wrapper
  // used a different step the cancellation would be silently partial, so the
  // control pins that the assertion above is comparing 6 with 6 rather than
  // merely finding two classes that happen to exist.
  const wrapper = wrapperFor('/admin/registrations');
  const step = /class="p-(\d+)"/.exec(wrapper);
  assert.ok(step, `no padding class found on the wrapper: ${wrapper.slice(0, 120)}`);
  assert.equal(step[1], '6', `the wrapper pads with p-${step[1]}, but the page cancels -mt-6`);
});

test('CONTROL: a course id that merely CONTAINS "edit" is not opted out', () => {
  // The pattern is anchored, so a course whose code contains the word does not
  // accidentally lose its padding.
  assert.equal(padded(wrapperFor('/admin/courses/edit-suite')), true);
  assert.equal(padded(wrapperFor('/admin/courses/edit-suite/')), true);
});
