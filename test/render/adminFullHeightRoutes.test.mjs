import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname } from 'next/navigation';
import { AdminContentWrapper } from '@/components/layout/AdminContentWrapper';

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
test('the registrations page cancels the shell’s top padding, and the two numbers agree', async () => {
  const { readSource } = await import('../sourceScan.mjs');
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
