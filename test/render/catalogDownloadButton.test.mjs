import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { HeroPdfButton } from '@/components/ui/HeroPdfButton';
import { HeroSearch } from '@/app/(public)/training-course/_components/HeroSearch';
import { ProgramPageClient } from '@/app/(public)/program/[slug]/_components/ProgramPageClient';
import { SkillPageClient } from '@/app/(public)/skill/[slug]/_components/SkillPageClient';
import { CATALOG_DOWNLOAD_LABEL } from '@/lib/pageCatalog';
import { ScheduleBoard } from '@/app/(public)/schedule/_components/ScheduleClient';
import { PUBLIC_SCHEDULE_FILTER_HORIZON, rollingWindow } from '@/lib/schedule/monthWindow';
import { defaultScheduleFilters } from '@/lib/schedule/scheduleFilters';
import { siteDateParts } from '@/lib/articlePublishTime';

/**
 * The hero PDF button, on its FOUR surfaces: the three catalog buttons
 * (label "ดาวน์โหลด Catalog") and /schedule's timetable download (label
 * "ดาวน์โหลดตารางการฝึกอบรม"). ONE glyph (the download one) BEFORE the label,
 * the document glyph gone. All four render HeroPdfButton — there is no
 * variant any more — so this is one component asserted at each place it
 * appears, with each surface's own label.
 *
 * renderToStaticMarkup + JSDOM; never a client root.
 */

const NEW_LABEL = 'ดาวน์โหลด Catalog';
const OLD_LABELS = ['ดาวน์โหลดแคตตาล็อกหลักสูตร', 'ดาวน์โหลดแคตตาล็อก'];

const dom = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const PROGRAM = { _id: 'p1', program_id: 'POWER-BI', program_name: 'Power BI', programiconurl: 'https://res.cloudinary.com/x/pbi.png', program_description: 'BI for everyone' };
const SKILL = { _id: 's1', skill_id: 'AI', skill_name: 'AI', skill_description: 'AI courses' };
const COURSE = { _id: 'c1', course_id: 'PBI-L1', course_name: 'Power BI Level 1', course_price: 9500, skills: [] };
const WITH_FILE = { programId: 'POWER-BI', catalogPdf: { path: '/files/catalog/program-power-bi-catalog.pdf', bytes: 1234, uploadedAt: '2026-09-11T00:00:00.000Z', uploadedBy: 'admin', version: 1 } };

/** The catalog anchor on a rendered page: the one whose text is the label. */
const catalogAnchor = (doc) =>
  [...doc.querySelectorAll('a')].find((a) => a.textContent.trim() === NEW_LABEL) ?? null;

function assertCatalogButton(a, where, label = NEW_LABEL) {
  assert.ok(a, `${where}: no anchor reads "${label}"`);
  assert.equal(a.textContent.trim(), label, `${where}: label`);

  const svgs = a.querySelectorAll('svg');
  assert.equal(svgs.length, 1, `${where}: expected exactly one <svg>, saw ${svgs.length}`);

  // Markup order: the <svg> opens before the label text.
  const markup = a.innerHTML;
  assert.ok(markup.indexOf('<svg') < markup.indexOf(label), `${where}: the icon must precede the label`);
  assert.equal(a.firstElementChild.tagName.toLowerCase(), 'svg', `${where}: the icon is not the first child`);
  assert.equal(a.lastChild.nodeType, 3, `${where}: the label text is not the last node — a trailing glyph is back`);
  assert.equal(svgs[0].getAttribute('aria-hidden'), 'true', `${where}: the glyph is decorative`);

  for (const old of OLD_LABELS) {
    assert.equal(a.textContent.includes(old), false, `${where}: old label "${old}" still present`);
  }
}

test('HeroPdfButton: one leading download glyph, the label, nothing after it', () => {
  const a = dom(renderToStaticMarkup(createElement(HeroPdfButton, { href: '/x.pdf' }, CATALOG_DOWNLOAD_LABEL))).querySelector('a');
  assertCatalogButton(a, 'HeroPdfButton');
  // It is the lucide Download glyph, the same component the button already
  // used for its trailing icon: the arrow-into-tray path is the tell.
  assert.match(a.querySelector('svg').innerHTML, /polyline points="7 10 12 15 17 10"/);
  assert.equal(a.querySelector('svg').getAttribute('stroke'), 'currentColor');
});

test('/training-course: the hero renders the unified button', () => {
  const doc = dom(renderToStaticMarkup(createElement(HeroSearch, { onDebouncedChange: () => {} })));
  const a = catalogAnchor(doc);
  assertCatalogButton(a, '/training-course');
  assert.equal(a.getAttribute('href'), '/9expert-training-course-catalog.pdf');
  for (const old of OLD_LABELS) assert.equal(doc.body.textContent.includes(old), false, `old label "${old}" on the page`);
});

test('program page: the unified button, when a catalog exists', () => {
  const doc = dom(renderToStaticMarkup(createElement(ProgramPageClient, { program: PROGRAM, config: WITH_FILE, courses: [COURSE], currentYear: 2026 })));
  assertCatalogButton(catalogAnchor(doc), 'program page');
  for (const old of OLD_LABELS) assert.equal(doc.body.textContent.includes(old), false, `old label "${old}" on the page`);
});

test('skill page: the unified button, when a catalog exists', () => {
  const doc = dom(renderToStaticMarkup(createElement(SkillPageClient, {
    skill: SKILL, config: { skillId: 'AI', catalogPdf: WITH_FILE.catalogPdf }, coursesByProgram: [{ program: PROGRAM, courses: [COURSE] }], totalCourses: 1, currentYear: 2026,
  })));
  assertCatalogButton(catalogAnchor(doc), 'skill page');
  for (const old of OLD_LABELS) assert.equal(doc.body.textContent.includes(old), false, `old label "${old}" on the page`);
});

test('/schedule: the timetable download renders the same row — label unchanged, one <svg>, before the label', () => {
  // Was the CONTROL "the default variant is untouched — two glyphs, document
  // first — so /schedule did not move". /schedule has now moved, the pair
  // has no caller, and this asserts /schedule the way the other three
  // surfaces are asserted above. Rendered through ScheduleBoard, the same
  // component test/render/scheduleFilterSheet drives, with an empty board:
  // the hero and its PDF link do not depend on rows.
  const now = new Date();
  const defaults = defaultScheduleFilters(now);
  const html = renderToStaticMarkup(createElement(ScheduleBoard, {
    courses: [], programs: [], schedulePDF: { url: 'https://example.com/schedule.pdf' }, earlyBirdMap: {},
    filters: defaults, defaults, currentYear: siteDateParts(now).year,
    monthOptions: rollingWindow(now, PUBLIC_SCHEDULE_FILTER_HORIZON),
    onFilterChange() {}, onReset() {}, sheetOpen: false, onSheetOpenChange() {},
  }));
  const doc = dom(html);
  const a = doc.querySelector('a[href="https://example.com/schedule.pdf"]');
  assertCatalogButton(a, '/schedule', 'ดาวน์โหลดตารางการฝึกอบรม');
  assert.match(a.querySelector('svg').innerHTML, /polyline points="7 10 12 15 17 10"/, 'the same lucide Download glyph as the catalog buttons');
  assert.equal(doc.body.textContent.includes(NEW_LABEL), false, 'the catalog label does not leak onto /schedule');
});

test('no caller opts into a variant, and the component offers none', () => {
  // The two-glyph layout was deleted with its last caller. If a `variant`
  // prop comes back, so does the drift this file exists to catch.
  const el = renderToStaticMarkup(createElement(HeroPdfButton, { href: '/x.pdf', variant: 'catalog' }, 'x'));
  const plain = renderToStaticMarkup(createElement(HeroPdfButton, { href: '/x.pdf' }, 'x'));
  assert.equal(el, plain, 'an unknown prop changes nothing — there is no variant to select');
});
