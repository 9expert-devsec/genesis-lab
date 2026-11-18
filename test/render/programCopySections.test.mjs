import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { ProgramPageClient } from '@/app/(public)/program/[slug]/_components/ProgramPageClient';

/**
 * The program page's admin copy: "intro" under the hero, "why" + "benefit"
 * between the online courses and the FAQ. Empty fields render neither, so a
 * program without copy is today's page.
 */

const dom = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const PROGRAM = { _id: 'p1', program_id: 'PBI', program_name: 'Power BI', program_description: 'upstream' };

const ONLINE = [{
  _id: 'oid-1',
  o_course_id: 'ONL-PBI-1',
  o_course_name: 'Online 1',
  o_course_teaser: 't',
  o_course_price: 1990,
  o_number_lessons: 13,
  o_course_traininghours: 8,
  o_course_levels: '3',
  o_course_certificate_status: false,
  website_urls: ['https://academy.9experttraining.com/courses/pbi-1'],
  skills: [],
  program: PROGRAM,
}];
const FAQS = [{ _id: 'f1', question_th: 'คำถาม?', answer_html: '<p>ตอบ</p>' }];

const FULL = {
  introHeading: 'หัวข้อแนะนำ Power BI',
  introHtml: '<p>ย่อหน้าหนึ่ง</p><p>ย่อหน้าสอง</p><script>bad()</script>',
  whyHeading: 'ทำไมต้องเรียน Power BI ?',
  whyLead: 'คำนำ why',
  whyItems: [1, 2, 3, 4, 5].map((n) => ({ title: `เหตุผล ${n}`, description: `รายละเอียด ${n}` })),
  benefitHeading: 'Power BI ช่วยองค์กรอย่างไร ?',
  benefitLead: 'คำนำ benefit',
  benefitCards: [
    { icon: 'chart', title: 'Sales', description: 'd1' },
    { icon: 'database', title: 'Finance', description: 'd2' },
    { icon: 'truck', title: 'Ops', description: 'd3' },
    { icon: 'not-a-key', title: 'IT', description: 'd4' },
  ],
};

const render = (config, extra = {}) =>
  dom(renderToStaticMarkup(createElement(ProgramPageClient, {
    program: PROGRAM, config, courses: [], currentYear: 2026, ...extra,
  })));

test('empty copy renders neither section', () => {
  for (const config of [null, {}, { introHeading: '', introHtml: '', whyHeading: '', whyItems: [], benefitHeading: '', benefitCards: [] }]) {
    const doc = render(config);
    for (const id of ['program-intro', 'program-why', 'program-benefit']) {
      assert.equal(doc.getElementById(id), null, `${id} rendered for ${JSON.stringify(config)}`);
    }
  }
});

test('intro: H2 + sanitised paragraphs', () => {
  const s = render(FULL).getElementById('program-intro');
  assert.equal(s.querySelector('h2').textContent, FULL.introHeading);
  assert.deepEqual([...s.querySelectorAll('p')].map((p) => p.textContent), ['ย่อหน้าหนึ่ง', 'ย่อหน้าสอง']);
  assert.equal(s.querySelector('script'), null);
});

test('why: one <ul>, 5 <li>, each with "<strong>title :</strong> description"', () => {
  const s = render(FULL).getElementById('program-why');
  assert.equal(s.querySelector('h2').textContent, FULL.whyHeading);
  assert.ok(s.textContent.includes(FULL.whyLead));
  const lis = s.querySelectorAll('ul > li');
  assert.equal(lis.length, 5);
  lis.forEach((li, i) => {
    assert.equal(li.querySelector('strong').textContent, `เหตุผล ${i + 1} :`);
    assert.ok(li.textContent.includes(`รายละเอียด ${i + 1}`));
    assert.ok(li.querySelector('svg'), 'check icon');
  });
});

test('benefit: 4 <article> with an icon and an H3; an unknown key renders the fallback', () => {
  const s = render(FULL).getElementById('program-benefit');
  assert.equal(s.querySelector('h2').textContent, FULL.benefitHeading);
  const cards = [...s.querySelectorAll('article')];
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map((c) => c.querySelector('h3').textContent), ['Sales', 'Finance', 'Ops', 'IT']);
  for (const c of cards) assert.ok(c.querySelector('svg'), 'card icon');
  assert.match(cards[0].querySelector('svg').getAttribute('class'), /lucide-(bar-chart|chart-column)/);
  assert.match(cards[3].querySelector('svg').getAttribute('class'), /lucide-sparkles/);
});

test('order: hero → intro → courses → online → why → benefit → FAQ, one H1', () => {
  const doc = render(FULL, { onlineCourses: ONLINE, faqs: FAQS });
  assert.equal(doc.querySelectorAll('h1').length, 1);
  const h2s = [...doc.querySelectorAll('h2')].map((h) => h.textContent);
  assert.deepEqual(h2s, [
    FULL.introHeading,
    'หลักสูตรในโปรแกรม',
    'หลักสูตรออนไลน์ในโปรแกรม',
    FULL.whyHeading,
    FULL.benefitHeading,
    'คำถามที่พบบ่อย',
  ]);
  const all = [...doc.querySelectorAll('h1, section[id]')];
  const at = (sel) => all.indexOf(doc.querySelector(sel));
  const order = ['h1', '#program-intro', '#online-courses', '#program-why', '#program-benefit', '#faq'].map(at);
  assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});
