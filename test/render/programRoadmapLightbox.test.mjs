import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ProgramPageClient } from '@/app/(public)/program/[slug]/_components/ProgramPageClient';

/**
 * The program hero's roadmap: no crop, a real button, and a lightbox.
 *
 * ── WHAT IS RENDERED HERE AND WHAT IS NOT ──────────────────────────────────
 * `renderToStaticMarkup` cannot render portals, and the lightbox portals to
 * <body> — so the OVERLAY's own markup is not reachable from this tier. That
 * is fine and is stated rather than worked around: the overlay is
 * `components/ui/ImageLightbox`, it shipped and was measured in the commit
 * before this one, and its behaviour (Escape, backdrop, scroll lock, focus) is
 * covered in test/render/imageLightbox. What THIS file owns is the hero side —
 * the trigger, the framing, and the no-roadmap case.
 *
 * ── MATCHER TRAPS OBEYED ───────────────────────────────────────────────────
 *   · Thai negates by prefix, so element text is matched at its boundaries.
 *   · Never grep a bare HTML attribute name in Tailwind markup — every variant
 *     prefix carries a colon, so `fill` matches `fill-current`, `hidden`
 *     matches `md:hidden`. Attributes are matched as `attr="`.
 */

const ROADMAP = 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1/programs/roadmaps/x.png';

const PROGRAM = {
  _id: '68d3c5b02c6a2f1315c0bce5',
  program_id: 'POWER-BI',
  program_name: 'Power BI',
  programiconurl: 'https://res.cloudinary.com/x/pbi.png',
  program_roadmap_url: ROADMAP,
};

const COURSE = {
  _id: 'c1',
  course_id: 'PBI-L1',
  course_name: 'Power BI Level 1',
  course_price: 9500,
  skills: [],
};

const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(ProgramPageClient, {
      program: PROGRAM,
      config: {},
      courses: [COURSE],
      currentYear: 2026,
      ...props,
    })
  );

const dom = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const SRC = 'src/app/(public)/program/[slug]/_components/ProgramPageClient.jsx';
const scrubbed = () =>
  readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The roadmap trigger, found by its accessible name rather than its classes. */
const trigger = (doc) =>
  [...doc.querySelectorAll('button')].find((b) =>
    (b.getAttribute('aria-label') ?? '').includes('ผังการเรียนรู้')
  );

// ── the no-roadmap case: hero reflows, nothing left behind ─────────────────

test('a program with NO roadmap renders no button and no frame', () => {
  const doc = dom(render({ program: { ...PROGRAM, program_roadmap_url: undefined } }));
  assert.equal(trigger(doc), undefined, 'no trigger button');
  assert.equal(doc.querySelector(`img[src="${ROADMAP}"]`), null, 'no roadmap image');
});

test('a program with NO roadmap leaves no empty container in the hero grid', () => {
  const withRoadmap = dom(render());
  const without = dom(render({ program: { ...PROGRAM, program_roadmap_url: undefined } }));
  const gridOf = (d) => d.querySelector('section > div');
  assert.equal(gridOf(withRoadmap).children.length, 2, 'text column + roadmap column');
  assert.equal(
    gridOf(without).children.length, 1,
    'the roadmap column must not survive as an empty element — the grid reflows'
  );
});

test('CONTROL: the roadmap column really does appear when the field is set', () => {
  const doc = dom(render());
  assert.ok(trigger(doc), 'trigger present');
  assert.ok(doc.querySelector(`img[src="${ROADMAP}"]`), 'image present');
});

test('the hero still renders its other content with no roadmap — the guard is about the frame, not the hero', () => {
  const html = render({ program: { ...PROGRAM, program_roadmap_url: undefined } });
  assert.match(html, />Power BI</, 'the program name still renders');
  assert.ok(html.includes('หลักสูตร'), 'the course-count line still renders');
});

// ── the dead fallback keys are gone ────────────────────────────────────────

test('only `program_roadmap_url` is read — the two never-populated spellings are gone', () => {
  const code = scrubbed();
  assert.match(code, /program\?\.program_roadmap_url/);
  assert.ok(!/programroadmapurl/.test(code), 'programroadmapurl was present on 0/27 programs');
  assert.ok(!/roadmap_url\s*\?\?/.test(code.replace(/program_roadmap_url/g, '')), 'roadmap_url likewise');
});

test('CONTROL: a row carrying only an old spelling now renders NO roadmap — which is what 0/27 means', () => {
  const doc = dom(render({
    program: { ...PROGRAM, program_roadmap_url: undefined, programroadmapurl: ROADMAP },
  }));
  assert.equal(trigger(doc), undefined);
});

// ── the trigger is a real button ───────────────────────────────────────────

test('the trigger is a <button type="button"> with an accessible name naming the program', () => {
  const btn = trigger(dom(render()));
  assert.ok(btn, 'found by accessible name, not by class');
  assert.equal(btn.tagName, 'BUTTON');
  assert.equal(btn.getAttribute('type'), 'button');
  assert.match(btn.getAttribute('aria-label'), /Power BI/, 'the program is named');
});

test('the trigger is NOT a div-with-onClick and NOT an anchor', () => {
  const doc = dom(render());
  const img = doc.querySelector(`img[src="${ROADMAP}"]`);
  const host = img.closest('button, a, div[onclick]');
  assert.equal(host.tagName, 'BUTTON', `the image is wrapped in a <${host.tagName}>`);
  assert.equal(
    [...doc.querySelectorAll('a')].some((a) => a.getAttribute('href') === '#'), false,
    'no href="#" anchor anywhere'
  );
});

test('the trigger carries cursor-zoom-in', () => {
  assert.match(trigger(dom(render())).getAttribute('class'), /cursor-zoom-in/);
});

// ── no crop, no fixed ratio ────────────────────────────────────────────────

test('the roadmap image carries NO object-cover', () => {
  const cls = dom(render()).querySelector(`img[src="${ROADMAP}"]`).getAttribute('class');
  assert.ok(!/object-cover/.test(cls), `a roadmap carries text at its edges: ${cls}`);
  assert.match(cls, /object-contain/);
});

test('aspect-video does NOT come back on the program hero', () => {
  /*
   * The same guard shape as the three in test/render/courseRoadmap, and for the
   * same reason: this defect regressed once already in this repo. Measured
   * 2026-08-31, all 14 roadmaps are 1.414 and a 16:9 box wasted exactly 20%.
   *
   * SCOPED TO THE HERO SECTION, not the page. CourseCard's cover legitimately
   * uses `aspect-video` and renders in the course grid below — a whole-document
   * scan reports it and says nothing about the hero.
   */
  const hero = dom(render()).querySelector('section');
  const html = hero.outerHTML;
  assert.match(html, /Power BI Roadmap/, 'the slice really contains the roadmap');
  assert.ok(!/aspect-video/.test(html), 'the hardcoded 16:9 box must stay gone');
  assert.ok(!/aspect-\[/.test(html), 'and no other fixed ratio took its place');
});

test('CONTROL: the hero slice is live — the page DOES contain aspect-video elsewhere', () => {
  // Without this, the assertion above would pass just as happily against an
  // empty or wrongly-anchored slice.
  const full = render();
  assert.ok(/aspect-video/.test(full), 'the course grid below still uses it');
});

test('the frame follows the image: h-auto w-full intrinsic sizing, not a fill layer', () => {
  const img = dom(render()).querySelector(`img[src="${ROADMAP}"]`);
  const cls = img.getAttribute('class');
  assert.match(cls, /h-auto/);
  assert.match(cls, /w-full/);
  // `fill` as an ATTRIBUTE, never as a bare word — `fill-current` would match.
  assert.ok(!/\sfill=""/.test(render()), 'no next/image fill layer');
});

test('the seeded width/height are the measured intrinsic size', () => {
  /*
   * READ FROM SOURCE, not from the markup, and that is not a shortcut: the
   * next/image stub in test/stub-next-image.mjs deliberately drops next-only
   * props so react-dom/server does not warn on them, so `width`/`height` never
   * reach the rendered <img> at this tier. Asserting the attribute would fail
   * on correct code — the mirror-image trap recorded in test/run.mjs's header.
   */
  const code = scrubbed();
  assert.match(code, /width=\{5266\}/, 'the measured intrinsic width');
  assert.match(code, /height=\{3724\}/, 'the measured intrinsic height');
  assert.ok(
    !/width=\{1600\}|height=\{900\}/.test(code),
    'not a placeholder ratio copied from elsewhere'
  );
});

// ── the lightbox is wired, and shows the same asset ────────────────────────

test('the lightbox is mounted with plate on', () => {
  const code = scrubbed();
  assert.match(code, /<ImageLightbox/);
  assert.match(code, /plate\s*\n?\s*\/>/, 'plate is passed');
});

test('the lightbox shows the SAME url as the thumbnail — no derived transform', () => {
  const code = scrubbed();
  assert.match(code, /src: roadmapUrl/, 'the overlay is handed the same variable');
  assert.ok(
    !/w_\d|c_fill|f_auto|q_auto|\/upload\/[a-z]_/.test(code),
    'no Cloudinary transform is constructed anywhere in this file'
  );
});

test('the trigger ref is threaded so focus can return to it', () => {
  const code = scrubbed();
  assert.match(code, /ref=\{roadmapButtonRef\}/);
  assert.match(code, /trigger: roadmapButtonRef\.current/);
});

test('CONTROL: with no roadmap the lightbox is handed null, so it renders and locks nothing', () => {
  // The component is mounted unconditionally; `image` is what gates it.
  const code = scrubbed();
  assert.match(code, /lightboxOpen && roadmapUrl/, 'both the state AND the url gate it');
  const html = render({ program: { ...PROGRAM, program_roadmap_url: undefined } });
  assert.ok(!html.includes('role="dialog"'), 'no overlay markup in the hero output');
});
