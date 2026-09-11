import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { ProgramPageClient } from '@/app/(public)/program/[slug]/_components/ProgramPageClient';
import { SkillPageClient } from '@/app/(public)/skill/[slug]/_components/SkillPageClient';
import { PageCatalogButton } from '@/components/ui/PageCatalogButton';
import { HeroPdfButton } from '@/components/ui/HeroPdfButton';
import { CATALOG_DOWNLOAD_LABEL, hasCatalog } from '@/lib/pageCatalog';

/**
 * The catalog button on the program page and the skill page, RENDERED.
 *
 * TWO PAGES, TWO COMPONENTS, ONE BUTTON. ProgramPageClient and
 * SkillPageClient do not share a page component — different heroes, different
 * props — so the button is the shared piece (PageCatalogButton) and each page
 * is rendered here with and without a file. The decision is hasCatalog(), the
 * same function these tests use to state their expectation, so the page and
 * the test cannot disagree about what "has a file" means.
 *
 * "No file" means NOTHING — the absence is asserted on the DOM, not inferred
 * from an empty href.
 *
 * IT OPENS IN A NEW TAB. The button shipped for one round with a `download`
 * attribute and was reverted on request: the anchor is the repo's
 * external-link shape — `target="_blank" rel="noopener noreferrer"` — and
 * carries NO `download`, like the course outline under the same rewrite.
 */

const dom = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const PROGRAM = {
  _id: '68d3c5b02c6a2f1315c0bce5', program_id: 'POWER-BI', program_name: 'Power BI',
  programiconurl: 'https://res.cloudinary.com/x/pbi.png', program_description: 'BI for everyone',
};
const SKILL = { _id: 's1', skill_id: 'DEV', skill_name: 'Programming', skill_description: 'Code' };
const COURSE = { _id: 'c1', course_id: 'PBI-L1', course_name: 'Power BI Level 1', course_price: 9500, skills: [] };

const WITH_FILE = {
  programId: 'POWER-BI',
  catalogPdf: { path: '/files/catalog/program-power-bi-catalog.pdf', bytes: 1234, uploadedAt: '2026-09-11T00:00:00.000Z', uploadedBy: 'admin', version: 1 },
};
const CLEARED = { programId: 'POWER-BI', catalogPdf: { path: '', bytes: 0, uploadedAt: null, uploadedBy: '', version: 0 } };

const renderProgram = (config) => dom(renderToStaticMarkup(createElement(ProgramPageClient, {
  program: PROGRAM, config, courses: [COURSE], currentYear: 2026,
})));
const renderSkill = (config) => dom(renderToStaticMarkup(createElement(SkillPageClient, {
  skill: SKILL, config, coursesByProgram: [{ program: PROGRAM, courses: [COURSE] }], totalCourses: 1, currentYear: 2026,
})));

/** The catalog anchor, by its label. */
const catalogAnchor = (doc) =>
  [...doc.querySelectorAll('a')].find((a) => a.textContent.includes(CATALOG_DOWNLOAD_LABEL)) ?? null;

/** The description paragraph on either page, by its text. */
const descriptionOf = (doc, text) =>
  [...doc.querySelectorAll('p')].find((p) => p.textContent.trim() === text) ?? null;

// ── The program page ────────────────────────────────────────────────────────

test('program page: WITH a file, the button renders under the description and opens in a new tab', () => {
  assert.equal(hasCatalog(WITH_FILE), true, 'the fixture must be a config with a file');
  const doc = renderProgram(WITH_FILE);
  const a = catalogAnchor(doc);
  assert.ok(a, 'no catalog button rendered');
  assert.equal(a.getAttribute('href'), '/files/catalog/program-power-bi-catalog.pdf');
  assert.equal(a.hasAttribute('download'), false, 'a download attribute is back — the button opens the PDF in a tab, it does not save it');
  assert.equal(a.getAttribute('target'), '_blank');
  assert.equal(a.getAttribute('rel'), 'noopener noreferrer');

  // Placement: the button follows the description in the same hero column.
  const desc = descriptionOf(doc, 'BI for everyone');
  assert.ok(desc, 'description paragraph not found');
  assert.equal(desc.parentElement, a.parentElement, 'the button is not in the description\'s column');
  assert.ok(desc.compareDocumentPosition(a) & 4, 'the button does not FOLLOW the description');
});

test('program page: WITHOUT a file, NOTHING renders — no anchor, no placeholder, no disabled control', () => {
  for (const [label, config] of [['no config', null], ['config without the field', { programId: 'POWER-BI' }], ['cleared record', CLEARED]]) {
    assert.equal(hasCatalog(config), false, `${label}: the fixture must be a config without a file`);
    const doc = renderProgram(config);
    assert.equal(catalogAnchor(doc), null, `${label}: a catalog anchor rendered`);
    assert.equal(doc.querySelector('[download]'), null, `${label}: something with a download attribute rendered`);
    assert.equal(doc.body.textContent.includes(CATALOG_DOWNLOAD_LABEL), false, `${label}: the label appears in the page`);
    assert.equal(doc.body.textContent.includes('แคตตาล็อก'), false, `${label}: a placeholder mentions the catalog`);
  }
});

// ── The skill page ──────────────────────────────────────────────────────────

test('skill page: WITH a file, the button renders under the description and opens in a new tab', () => {
  const config = { skillId: 'DEV', catalogPdf: { ...WITH_FILE.catalogPdf, path: '/files/catalog/skill-dev-catalog.pdf' } };
  const doc = renderSkill(config);
  const a = catalogAnchor(doc);
  assert.ok(a, 'no catalog button rendered');
  assert.equal(a.getAttribute('href'), '/files/catalog/skill-dev-catalog.pdf');
  assert.equal(a.hasAttribute('download'), false, 'a download attribute is back — the button opens the PDF in a tab, it does not save it');
  assert.equal(a.getAttribute('target'), '_blank');
  assert.equal(a.getAttribute('rel'), 'noopener noreferrer');

  const desc = descriptionOf(doc, 'Code');
  assert.ok(desc, 'description paragraph not found');
  assert.equal(desc.parentElement, a.parentElement);
  assert.ok(desc.compareDocumentPosition(a) & 4, 'the button does not FOLLOW the description');
});

test('skill page: WITHOUT a file, NOTHING renders', () => {
  for (const [label, config] of [['no config', null], ['undefined config (a route that passes none)', undefined], ['cleared record', { skillId: 'DEV', catalogPdf: CLEARED.catalogPdf }]]) {
    const doc = renderSkill(config);
    assert.equal(catalogAnchor(doc), null, `${label}: a catalog anchor rendered`);
    assert.equal(doc.querySelector('[download]'), null, `${label}: something with a download attribute rendered`);
    assert.equal(doc.body.textContent.includes('แคตตาล็อก'), false, `${label}: a placeholder mentions the catalog`);
  }
});

// ── The shared piece and its treatment ──────────────────────────────────────

test('the button IS the site\'s HeroPdfButton — same anchor classes as /training-course\'s catalog button', () => {
  const ours = dom(renderToStaticMarkup(createElement(PageCatalogButton, { config: WITH_FILE }))).querySelector('a');
  const theirs = dom(renderToStaticMarkup(createElement(HeroPdfButton, { href: '/x.pdf' }, 'ดาวน์โหลดแคตตาล็อกหลักสูตร'))).querySelector('a');
  assert.ok(ours && theirs);
  assert.equal(ours.getAttribute('class'), theirs.getAttribute('class'));
  assert.equal(ours.querySelectorAll('svg').length, 2, 'the leading document glyph and the trailing download glyph');
});

test('CONTROL: HeroPdfButton itself renders NO download attribute and has no opt-in for one', () => {
  // The `downloadAs` prop that existed for one round is gone; passing it does nothing.
  const a = dom(renderToStaticMarkup(createElement(HeroPdfButton, { href: '/x.pdf', downloadAs: 'x.pdf' }, 'x'))).querySelector('a');
  assert.equal(a.hasAttribute('download'), false);
  assert.equal(a.getAttribute('target'), '_blank');
  assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
});

test('CONTROL: PageCatalogButton alone renders null for every no-file shape', () => {
  for (const config of [undefined, null, {}, { catalogPdf: null }, { catalogPdf: { path: ' ' } }]) {
    assert.equal(renderToStaticMarkup(createElement(PageCatalogButton, { config })), '');
  }
});
