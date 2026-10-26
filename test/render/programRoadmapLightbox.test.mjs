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
 * ── SINCE SK-RM-1 THE THUMBNAIL IS A SHARED COMPONENT ──────────────────────
 * The hero's roadmap column moved into components/ui/RoadmapHeroThumbnail,
 * which the skill page now uses too. Three rules this file used to pin were
 * deliberately REVERSED by that round, and the cases below say so where they
 * stand:
 *   · the thumbnail is a 960px Cloudinary rendition and the lightbox a
 *     full-resolution auto-format one — two URLs, not "the same url";
 *   · the box is a FIXED ISO-216 ratio (1414/1000) with object-contain, so its
 *     height is reserved before load — not intrinsic `h-auto w-full` sizing;
 *   · the lightbox wiring (state, ref, plate) lives in the component.
 * What did NOT change is still pinned: no crop, no aspect-video, a real
 * <button>, one roadmap field, nothing left in the grid without a roadmap,
 * focus returned to the trigger, and no Cloudinary URL built by hand in the
 * page itself.
 *
 * ── WHAT IS RENDERED HERE AND WHAT IS NOT ──────────────────────────────────
 * `renderToStaticMarkup` cannot render portals, and the lightbox portals to
 * <body> — so the OVERLAY's own markup is not reachable from this tier. The
 * overlay is `components/ui/ImageLightbox`, covered in test/render/imageLightbox.
 * What THIS file owns is the hero side — the trigger, the framing, the URLs,
 * and the no-roadmap case.
 *
 * ── MATCHER TRAPS OBEYED ───────────────────────────────────────────────────
 *   · Thai negates by prefix, so element text is matched at its boundaries.
 *   · Never grep a bare HTML attribute name in Tailwind markup — every variant
 *     prefix carries a colon, so `fill` matches `fill-current`, `hidden`
 *     matches `md:hidden`. Attributes are matched as `attr="`.
 */

const ROADMAP = 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1/programs/roadmaps/x.png';
const THUMB = 'https://res.cloudinary.com/ddva7xvdt/image/upload/w_960,c_limit,f_auto,q_auto/v1/programs/roadmaps/x.png';

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

const scrub = (file) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const SRC = 'src/app/(public)/program/[slug]/_components/ProgramPageClient.jsx';
const THUMB_SRC = 'src/components/ui/RoadmapHeroThumbnail.jsx';
const scrubbed = () => scrub(SRC);
const thumbCode = () => scrub(THUMB_SRC);

/** The roadmap trigger, found by its accessible name rather than its classes. */
const trigger = (doc) =>
  [...doc.querySelectorAll('button')].find((b) =>
    (b.getAttribute('aria-label') ?? '').startsWith('ดู Roadmap แบบเต็ม')
  );

// ── the no-roadmap case: hero reflows, nothing left behind ─────────────────

test('a program with NO roadmap renders no button and no frame', () => {
  const doc = dom(render({ program: { ...PROGRAM, program_roadmap_url: undefined } }));
  assert.equal(trigger(doc), undefined, 'no trigger button');
  assert.equal(doc.querySelector('img[alt$="Roadmap"]'), null, 'no roadmap image');
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
  assert.ok(doc.querySelector(`img[src="${THUMB}"]`), 'thumbnail image present');
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

test('the trigger is a <button type="button"> whose name starts with the visible label and names the program', () => {
  const btn = trigger(dom(render()));
  assert.ok(btn, 'found by accessible name, not by class');
  assert.equal(btn.tagName, 'BUTTON');
  assert.equal(btn.getAttribute('type'), 'button');
  assert.match(btn.getAttribute('aria-label'), /Power BI/, 'the program is named');
  assert.match(btn.textContent, /ดู Roadmap แบบเต็ม/, 'the label is visible, not only in aria-label');
});

test('the trigger is NOT a div-with-onClick and NOT an anchor', () => {
  const doc = dom(render());
  const img = doc.querySelector(`img[src="${THUMB}"]`);
  const host = img.closest('button, a, div[onclick]');
  assert.equal(host.tagName, 'BUTTON', `the image is wrapped in a <${host.tagName}>`);
  assert.equal(
    [...doc.querySelectorAll('a')].some((a) => a.getAttribute('href') === '#'), false,
    'no href="#" anchor anywhere'
  );
});

test('the trigger carries cursor-zoom-in and a theme surface, not a white literal', () => {
  const cls = trigger(dom(render())).getAttribute('class');
  assert.match(cls, /cursor-zoom-in/);
  assert.match(cls, /bg-\[var\(--surface\)\]/);
  assert.ok(!/(^|\s)bg-white(\s|$)/.test(cls), 'bg-white came back on the thumbnail');
});

// ── no crop; one fixed ISO-216 box ─────────────────────────────────────────

test('the roadmap image carries NO object-cover', () => {
  const cls = dom(render()).querySelector(`img[src="${THUMB}"]`).getAttribute('class');
  assert.ok(!/object-cover/.test(cls), `a roadmap carries text at its edges: ${cls}`);
  assert.match(cls, /object-contain/);
});

test('aspect-video does NOT come back on the program hero, and the only fixed ratio is ISO-216', () => {
  /*
   * aspect-video wasted exactly 20% on every 1.414 roadmap (measured
   * 2026-08-31). SK-RM-1 reintroduced a fixed ratio ON PURPOSE — the ISO one,
   * with object-contain, so the box's height is reserved before the image
   * loads and nothing is cropped. Any other ratio is still a regression.
   *
   * SCOPED TO THE HERO SECTION, not the page. CourseCard's cover legitimately
   * uses `aspect-video` and renders in the course grid below.
   */
  const hero = dom(render()).querySelector('section');
  const html = hero.outerHTML;
  assert.match(html, /Power BI Roadmap/, 'the slice really contains the roadmap');
  assert.ok(!/aspect-video/.test(html), 'the hardcoded 16:9 box must stay gone');
  const ratios = html.match(/aspect-\[[^\]]+\]/g) ?? [];
  assert.deepEqual(ratios, ['aspect-[1414/1000]'], `fixed ratios in the hero: ${ratios.join(', ')}`);
});

test('CONTROL: the hero slice is live — the page DOES contain aspect-video elsewhere', () => {
  // Without this, the assertion above would pass just as happily against an
  // empty or wrongly-anchored slice.
  const full = render();
  assert.ok(/aspect-video/.test(full), 'the course grid below still uses it');
});

test('the image fills the ISO box rather than sizing the frame (no layout shift before load)', () => {
  const img = dom(render()).querySelector(`img[src="${THUMB}"]`);
  const box = img.parentElement;
  assert.match(box.getAttribute('class'), /aspect-\[1414\/1000\]/);
  assert.match(box.getAttribute('class'), /relative/, 'the fill layer needs a positioned box');
  // next/image `fill` and `priority` are next-only props the test stub drops,
  // so they are read from the component's source.
  assert.match(thumbCode(), /<Image[\s\S]*?\bfill\b[\s\S]*?\bpriority\b[\s\S]*?\/>/);
});

test('the thumbnail is a 960px Cloudinary rendition, not the original', () => {
  const doc = dom(render());
  assert.ok(doc.querySelector(`img[src="${THUMB}"]`), 'the w_960 auto-format URL is rendered');
  assert.equal(doc.querySelector(`img[src="${ROADMAP}"]`), null, 'the 1–2 MB original is not');
});

// ── the lightbox is wired, and shows the full-resolution asset ─────────────

test('the lightbox is mounted with plate on', () => {
  const code = thumbCode();
  assert.match(code, /<ImageLightbox/);
  assert.match(code, /plate\s*=\s*true/, 'plate defaults on');
  assert.match(code, /plate=\{plate\}/, 'and is passed through');
});

test('the lightbox shows the full-resolution auto-format URL; the page builds no URL by hand', () => {
  const code = thumbCode();
  assert.match(code, /THUMB_TRANSFORM\s*=\s*'w_960,c_limit,f_auto,q_auto'/);
  assert.match(code, /FULL_TRANSFORM\s*=\s*'f_auto,q_auto'/);
  assert.match(code, /src:\s*withCloudinaryTransform\(src,\s*FULL_TRANSFORM\)/, 'the overlay gets the full one');
  assert.ok(
    !/w_\d|c_fill|f_auto|q_auto|\/upload\/[a-z]_/.test(scrubbed()),
    'no Cloudinary transform is constructed in ProgramPageClient — it goes through the helper'
  );
});

test('the trigger ref is threaded so focus can return to it', () => {
  const code = thumbCode();
  assert.match(code, /ref=\{buttonRef\}/);
  assert.match(code, /trigger: buttonRef\.current/);
});

test('CONTROL: with no roadmap the lightbox is not mounted at all, so it renders and locks nothing', () => {
  const code = thumbCode();
  assert.match(code, /if \(!src\) return null;/, 'no src, no component');
  assert.match(code, /image=\{open \?/, 'closed, the overlay is handed null');
  const html = render({ program: { ...PROGRAM, program_roadmap_url: undefined } });
  assert.ok(!html.includes('role="dialog"'), 'no overlay markup in the hero output');
});

test('the program page renders the shared thumbnail with the program roadmap field', () => {
  assert.match(scrubbed(), /<RoadmapHeroThumbnail[\s\S]*?src=\{roadmapUrl\}/);
});
