import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readSource } from '../sourceScan.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CourseHero } from '@/app/(public)/[...slug]/_components/CourseHero';
import { SidebarNav } from '@/app/(public)/[...slug]/_components/SidebarNav';
import { toPrivateCourseView } from '@/lib/courses/privateCourseView';
import { outlineFromFormValue } from '@/lib/courses/courseOutline';
import { richSectionPresence } from '@/lib/courses/richSectionPresence';

/**
 * Round 3b: the private hero card is filled — program chip, teaser, level
 * pill, outline downloads — and a NORMAL course's hero and sidebar render
 * byte-for-byte as before.
 *
 * The private fixture is a stored `private_courses` document run through
 * toPrivateCourseView, exactly as the page does it, so the hero only ever sees
 * the reduced view.
 *
 * ── THE NORMAL-COURSE PIN ───────────────────────────────────────────────────
 * The two hashes below were taken from the PRE-round components (CourseHero at
 * 00cf481f, SidebarNav + courseSectionLinks at 8b7db334) rendering NORMAL, and
 * matched the round-3b components byte for byte when recorded. A change to a
 * normal course's hero or sidebar markup turns these red; if it is intended,
 * re-take the hash and say why in the commit.
 */

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const STORED = Object.freeze({
  _id: '6721aa00000000000000c0de',
  course_id: 'COPILOT-CUS-2607-2',
  course_name: 'Microsoft Copilot Chat',
  course_teaser: 'Copilot Chat for one client, from first prompt to daily work.',
  course_trainingdays: 1,
  course_traininghours: 6,
  course_price: 12900,
  course_netprice: 9900,
  course_levels: '1',
  course_type_public: false,
  course_type_inhouse: true,
  course_workshop_status: true,
  course_certificate_status: true,
  course_cover_url: 'https://res.cloudinary.com/x/cover.webp',
  program: '6650aa0000000000000000a1',
  skills: [],
  course_outline_th: outlineFromFormValue('/files/course-outline/copilot-cus-2607-2-course-outline-th.pdf'),
  course_outline_en: outlineFromFormValue(''),
  privateProgram: null,
  privateSkills: [],
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
  __v: 0,
});

const PROGRAMS = [
  { _id: '6650aa0000000000000000a1', program_name: 'Microsoft 365', programcolor: '#D83B01', programiconurl: 'https://res.cloudinary.com/x/m365.svg' },
];

const renderPrivate = (stored = STORED, programs = PROGRAMS) =>
  renderToStaticMarkup(createElement(CourseHero, {
    course: toPrivateCourseView(stored, { programs }),
    heroColor: '#D83B01',
    gallery: [],
    isPrivate: true,
  }));

test('the private card shows the program chip, teaser, level pill, badges and the TH outline button', () => {
  const html = renderPrivate();
  const chip = html.indexOf('>Microsoft 365<');
  assert.ok(chip > 0, 'program chip');
  assert.ok(chip < html.indexOf('COPILOT-CUS-2607-2'), 'the chip sits above the code');
  assert.match(html, /m365\.svg/, 'with the program logo');
  assert.match(html, /<p class="[^"]*line-clamp-3[^"]*">Copilot Chat for one client/, 'teaser, clamped to 3 lines');
  assert.match(html, />Beginner<\/span>/, 'level pill');
  assert.match(html, />Inhouse<\/span>/);
  assert.ok(html.includes('Workshop') && html.includes('e-Certificate'));
  assert.match(html, /ดาวน์โหลด Course Outline/);
  assert.match(html, /href="[^"]*copilot-cus-2607-2-course-outline-th\.pdf"/);
  assert.ok(!/>EN<\/a>/.test(html), 'no EN button without an EN file');
});

test('still no price, no time of day, no quotation button', () => {
  const html = renderPrivate();
  for (const banned of ['12,900', '9,900', '12900', '9900', 'บาท', '9:00', 'ขอใบเสนอราคา', '/registration/']) {
    assert.ok(!html.includes(banned), `${banned} rendered`);
  }
});

test('no program → no chip; no outline file → no outline block', () => {
  const html = renderPrivate({ ...STORED, course_outline_th: outlineFromFormValue('') }, []);
  assert.ok(!html.includes('Microsoft 365'));
  assert.ok(!html.includes('ดาวน์โหลด Course Outline'));
  assert.match(html, /COPILOT-CUS-2607-2/, 'CONTROL: the card still rendered');
});

// ── a NORMAL course is unchanged ───────────────────────────────────────────

const NORMAL = {
  _id: 'oid-mse',
  course_id: 'MSE-L1',
  course_name: 'Microsoft Excel Level 1',
  course_teaser: 'Learn Excel',
  course_price: 4500,
  course_netprice: 3900,
  course_trainingdays: 2,
  course_traininghours: 12,
  course_levels: '1',
  course_type_public: true,
  course_type_inhouse: true,
  course_workshop_status: true,
  course_certificate_status: true,
  course_cover_url: 'https://res.cloudinary.com/x/c.webp',
  program: { _id: 'p1', program_name: 'Excel', programiconurl: 'https://res.cloudinary.com/x/excel.svg' },
  course_objectives: ['a'],
  course_target_audience: ['b'],
  course_prerequisites: ['c'],
  course_system_requirements: ['d'],
  training_topics: [{ title: 't', bullets: ['x'] }],
  course_roadmap_desktop_url: 'https://res.cloudinary.com/x/r.svg',
  course_outline_th: { download_url: 'https://x/th.pdf' },
  course_outline_en: { download_url: 'https://x/en.pdf' },
};

test("a NORMAL course's hero renders byte-for-byte as before round 3b", () => {
  const html = renderToStaticMarkup(createElement(CourseHero, { course: NORMAL, heroColor: '#1D6F42', gallery: [] }));
  assert.equal(sha(html), 'ff28bb573d257d8be7b74eb25b50a0d53fbd0d3a973b6ae9f630e8d9fe83e229');
  assert.ok(!html.includes('Beginner') && !html.includes('ดาวน์โหลด Course Outline'), 'none of the private additions');
  assert.match(html, /ขอใบเสนอราคา Public/, 'CONTROL: it is the on-sale card');
});

test("the body's mobile outline card is skipped on a private page only; the sidebar box stays", () => {
  const page = readSource('src/app/(public)/[...slug]/page.jsx').code;
  assert.match(page, /\{!isPrivate && <PDFDownload course=\{course\} className="lg:hidden" layout="row" \/>\}/);
  assert.match(page, /\n\s*<PDFDownload course=\{course\} className="hidden lg:flex" layout="stacked" \/>/,
    'the sidebar copy is unconditional');
});

test("a NORMAL course with no rich copy: its sidebar renders byte-for-byte as before round 3b", () => {
  // page.jsx now passes richSectionPresence(extension) on every page; a
  // normal course whose extension has no rich bodies gets all-false flags.
  const html = renderToStaticMarkup(createElement(SidebarNav, {
    course: NORMAL, hasSchedules: true, hasRelated: true, hasFaqs: true,
    rich: richSectionPresence({ courseId: 'MSE-L1', objectivesRich: '', descriptionRich: '' }),
  }));
  assert.equal(sha(html), '3bb7af0c5e4f9d9318b6a570332fef5207583d76a5064570ae1bebdafb768995');
});

test('a NORMAL course whose objectives exist only as rich text gets the วัตถุประสงค์ entry', () => {
  const course = { ...NORMAL, course_objectives: [] };
  const nav = (extension) => renderToStaticMarkup(createElement(SidebarNav, {
    course, hasSchedules: true, hasRelated: true, hasFaqs: true, rich: richSectionPresence(extension),
  }));
  assert.match(nav({ courseId: 'MSE-L1', objectivesRich: '<ol><li>Build a pivot table</li></ol>' }),
    /href="#objective"[^>]*>[\s\S]*?วัตถุประสงค์/);
  assert.doesNotMatch(nav({ courseId: 'MSE-L1' }), /href="#objective"/, 'CONTROL: no rich copy, no entry');
});
