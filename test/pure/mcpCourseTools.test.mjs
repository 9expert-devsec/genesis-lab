import { test } from 'node:test';
import assert from 'node:assert/strict';

import { searchCourses } from '../../src/lib/mcp/tools/searchCourses.js';
import { getCourseDetail } from '../../src/lib/mcp/tools/getCourseDetail.js';

/**
 * Taxonomy validation and course-id casing.
 *
 * ── WHY "RETURNS THE FULL CATALOGUE" IS THE FAILURE TO PIN ─────────────────
 * MSDB ignores a filter value it does not recognise rather than rejecting it
 * (round 1 §1.2, measured: `?zzz_not_a_param=MSE` returned all 24 rows). So the
 * shape of this bug is not a crash — it is a search that looks like it worked.
 * The assertions below therefore check BOTH that an error is raised AND that no
 * course list came back, because an implementation that logged a warning and
 * carried on would satisfy a weaker test.
 */

const PROGRAMS = { items: [{ program_id: 'POWER-BI', program_name: 'Power BI' }, { program_id: 'MSE', program_name: 'Excel' }] };
const SKILLS = { items: [{ skill_id: 'AI', skill_name: 'AI' }, { skill_id: 'DATA', skill_name: 'Data' }] };

const PUBLIC_COURSES = {
  items: [
    {
      _id: 'oid-1',
      course_id: 'POWER-BI-ADV',
      course_name: 'Power BI Advanced',
      course_teaser: 'ต่อยอด Power BI',
      course_price: 9500,
      course_trainingdays: 2,
      course_levels: '3',
      course_type_public: true,
      course_type_inhouse: true,
      course_certificate_status: true,
      course_objectives: ['obj one'],
      course_target_audience: ['analysts'],
      course_prerequisites: ['basic Power BI'],
      course_system_requirements: ['Windows 11'],
      // `bullets`, not `items` — the real upstream key, verified against a live
      // /public-course response. An earlier fixture here said `items` and the
      // code read `items`, so both agreed and both were wrong: every bullet was
      // silently dropped and only the payload SIZE gave it away.
      training_topics: [{ title: 'DAX', bullets: ['CALCULATE', 'FILTER'] }],
      program: { program_id: 'POWER-BI', program_name: 'Power BI' },
      skills: [{ skill_id: 'DATA', skill_name: 'Data' }],
      urlAlias: null,
    },
    {
      _id: 'oid-2',
      // A MIXED-CASE id, exactly the shape that makes upstream ?course_id= miss.
      course_id: 'SQL-PG-Query',
      course_name: 'PostgreSQL Query',
      course_teaser: 'เขียน query',
      course_price: 0, // inhouse-only: must NOT be reported as free
      course_trainingdays: 3,
      program: { program_id: 'MSE', program_name: 'Excel' },
      skills: [{ skill_id: 'DATA', skill_name: 'Data' }],
      urlAlias: null,
    },
  ],
};

const ONLINE_COURSES = {
  items: [
    {
      _id: 'oid-o1',
      o_course_id: 'ONL-AI-1',
      o_course_name: 'AI Automation online',
      o_course_teaser: 'เรียนออนไลน์',
      // The trap: `o_course_price` is what a customer pays, `o_course_netprice`
      // is the struck-through before-price. OnlineCourseCard renders netPrice
      // with line-through (src/app/_components/home/OnlineCourseCard.jsx:311-316).
      o_course_price: 3600,
      o_course_netprice: 4500,
      o_course_traininghours: 8,
      o_number_lessons: 6,
      o_course_levels: '2',
      o_course_certificate_status: true,
      o_course_instructor_name: 'Someone',
      program: { program_id: 'POWER-BI', program_name: 'Power BI' },
      skills: [{ skill_id: 'AI', skill_name: 'AI' }],
      website_urls: ['https://academy.9experttraining.com/courses/ai'],
    },
  ],
};

function deps(overrides = {}) {
  return {
    listPrograms: async () => PROGRAMS,
    listSkills: async () => SKILLS,
    getNavMenuData: async () => ({ programSlugs: {}, skillSlugs: {} }),
    listPublicCourses: async () => PUBLIC_COURSES,
    listOnlineCourses: async () => ONLINE_COURSES,
    getCourseByCodeInsensitive: async (code) =>
      PUBLIC_COURSES.items.find(
        (c) => c.course_id.toLowerCase() === String(code).toLowerCase()
      ) ?? null,
    ...overrides,
  };
}

test('an unknown skill is refused, and the refusal lists the valid ids', async () => {
  await assert.rejects(
    () => searchCourses({ skill: 'MACHINE-LEARNING' }, deps()),
    (err) => {
      assert.match(err.message, /Unknown skill "MACHINE-LEARNING"/);
      assert.match(err.message, /AI/);
      assert.match(err.message, /DATA/);
      return true;
    }
  );
});

test('an unknown skill NEVER falls back to the unfiltered catalogue', async () => {
  let listCalled = false;
  const d = deps({ listPublicCourses: async () => { listCalled = true; return PUBLIC_COURSES; } });

  const result = await searchCourses({ skill: 'NOPE' }, d).then(
    (r) => r,
    () => null
  );

  assert.equal(result, null, 'the call must fail, not return rows');
  assert.equal(listCalled, false, 'validation runs BEFORE any course read, so no request is even made');
});

test('an unknown program is refused too, and names the valid program ids', async () => {
  await assert.rejects(
    () => searchCourses({ program: 'POWER_BI' }, deps()),
    /Unknown program "POWER_BI".*POWER-BI/s
  );
});

test('a known filter value is accepted case-insensitively', async () => {
  const out = await searchCourses({ skill: 'ai', type: 'online' }, deps());
  assert.equal(out.courses.length, 1);
  assert.equal(out.courses[0].course_id, 'ONL-AI-1');
});

test('search returns trimmed cards and an inhouse-only course is not priced at zero', async () => {
  const out = await searchCourses({ query: 'query', type: 'public' }, deps());
  assert.equal(out.courses.length, 1);
  const card = out.courses[0];
  assert.equal(card.course_id, 'SQL-PG-Query', 'the ORIGINAL casing is reported back');
  assert.equal(card.price_label, 'Inhouse Only', 'a zero price is a fact about the course, not a free seat');
  assert.match(card.url, /^https:\/\/www\.9experttraining\.com\//);
  // Bulk upstream fields must not ride along.
  assert.ok(!('related_courses' in card));
  assert.ok(!('course_cover_url' in card));
  assert.ok(!('_id' in card));
});

test('get_course_detail resolves a mixed-case id given in the wrong case', async () => {
  const out = await getCourseDetail({ course_id: 'sql-pg-query' }, deps());
  assert.equal(out.course_id, 'SQL-PG-Query', 'the canonical casing comes back, not what was asked for');
});

test('get_course_detail resolves an id given in upper case', async () => {
  const out = await getCourseDetail({ course_id: 'SQL-PG-QUERY' }, deps());
  assert.equal(out.course_id, 'SQL-PG-Query');
});

test('a course that does not exist is an ERROR, never an empty object', async () => {
  await assert.rejects(
    () => getCourseDetail({ course_id: 'NO-SUCH-COURSE' }, deps()),
    /course not found: "NO-SUCH-COURSE"/
  );
});

test('netprice is absent from public course detail output', async () => {
  const out = await getCourseDetail({ course_id: 'POWER-BI-ADV' }, deps());
  const text = JSON.stringify(out);
  assert.ok(!text.includes('netprice'), 'course_netprice is null on every row upstream and is never emitted');
  assert.ok(!('course_netprice' in out));
  assert.equal(out.price_label, '9,500');
});

test('netprice is absent from ONLINE course detail, and the payable price is the one served', async () => {
  const out = await getCourseDetail({ course_id: 'ONL-AI-1' }, deps());
  const text = JSON.stringify(out);
  assert.ok(!text.includes('netprice'), 'o_course_netprice is the struck-through price and must never be emitted');
  assert.ok(!text.includes('4500'), 'the before-price must not appear as a number anywhere either');
  assert.equal(out.price_label, '3,600', 'o_course_price is what a customer pays');
});

test('the outline keeps its BULLETS, not just its section titles', async () => {
  // The regression this pins: reading a key that does not exist returns titles
  // with the content removed, throws nothing, and looks like a working outline.
  const out = await getCourseDetail({ course_id: 'POWER-BI-ADV' }, deps());
  assert.deepEqual(out.training_topics, [{ title: 'DAX', bullets: ['CALCULATE', 'FILTER'] }]);
});

test('include_outline false drops the bulky topic outline', async () => {
  const withOutline = await getCourseDetail({ course_id: 'POWER-BI-ADV', include_outline: true }, deps());
  const without = await getCourseDetail({ course_id: 'POWER-BI-ADV', include_outline: false }, deps());
  assert.ok(Array.isArray(withOutline.training_topics) && withOutline.training_topics.length > 0);
  assert.ok(!('training_topics' in without));
});

test('a detail payload stays well under the 20 KB budget', async () => {
  const out = await getCourseDetail({ course_id: 'POWER-BI-ADV' }, deps());
  assert.ok(Buffer.byteLength(JSON.stringify(out), 'utf8') < 20_000);
});
