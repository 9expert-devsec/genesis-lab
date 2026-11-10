import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { ProgramPageClient } from '@/app/(public)/program/[slug]/_components/ProgramPageClient';
import { SkillPageClient } from '@/app/(public)/skill/[slug]/_components/SkillPageClient';

/**
 * The hero fields on the rendered pages. The skill page has TWO heroes chosen
 * by the roadmap, each with its own <h1>, so both are rendered here: wiring one
 * and missing the other looks correct on three skills and wrong on four.
 *
 * The sub-line keeps the short name in every case. That is the whole point of a
 * separate title, and the easiest thing to break by swapping one variable.
 */

const dom = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const COPY = { heroTitle: 'หัวข้อยาวสำหรับหน้าเว็บ', heroDescription: 'คำอธิบายยาวสำหรับหน้าเว็บ' };
const PROGRAM = { _id: 'p1', program_id: 'POWER-BI', program_name: 'Power BI', program_description: 'upstream' };
const SKILL = { _id: 's1', skill_id: 'AI', skill_name: 'AI', skill_description: 'upstream' };
const ROADMAP = 'https://res.cloudinary.com/x/roadmap.png';

const renderProgram = (config) =>
  dom(renderToStaticMarkup(createElement(ProgramPageClient, {
    program: PROGRAM, config, courses: [], currentYear: 2026,
  })));

const renderSkill = (config, skill) =>
  dom(renderToStaticMarkup(createElement(SkillPageClient, {
    skill, config, coursesByProgram: [], totalCourses: 0, currentYear: 2026,
  })));

const SURFACES = [
  ['program', renderProgram, 'Power BI', 'กลุ่มหลักสูตร Power BI'],
  ['skill, centred hero', (c) => renderSkill(c, SKILL), 'AI', 'กลุ่ม Skill AI'],
  ['skill, roadmap hero', (c) => renderSkill(c, { ...SKILL, skill_roadmap_url: ROADMAP }), 'AI', 'กลุ่ม Skill AI'],
];

for (const [where, render, name, subLine] of SURFACES) {
  test(`${where}: both fields empty renders the short name and the upstream description`, () => {
    const doc = render({ heroTitle: '', heroDescription: '' });
    assert.equal(doc.querySelector('h1').textContent, name);
    assert.ok(doc.body.textContent.includes('upstream'));
  });

  test(`${where}: the fields set replace the H1 and the description`, () => {
    const doc = render(COPY);
    assert.equal(doc.querySelector('h1').textContent, COPY.heroTitle);
    assert.ok(doc.body.textContent.includes(COPY.heroDescription));
    assert.equal(doc.body.textContent.includes('upstream'), false);
  });

  test(`${where}: the sub-line keeps the short name`, () => {
    assert.ok(render(COPY).body.textContent.includes(subLine));
  });
}
