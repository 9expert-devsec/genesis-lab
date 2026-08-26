import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseOutline } from '@/app/(public)/[...slug]/_components/CourseOutline';

/**
 * ══ B2 MUST BE INVISIBLE IN PRODUCTION ═════════════════════════════════════
 *
 * No course has a rich copy and there is no backfill, so every one of the 79
 * courses must render EXACTLY what it rendered before this round. That is not a
 * hope; it is this file.
 *
 * ── HOW THE COMPARISON IS MADE HONEST ──────────────────────────────────────
 * The reference is not "what I think the old markup was". It is the component
 * rendered with the prop ABSENT — the literal pre-B2 call shape, `<CourseOutline
 * course={course} />` — compared against the same component with the prop
 * explicitly `null`, which is what `prepareOutlineRichHtml` returns for every
 * live course. If those two ever diverge, the plain path has been touched.
 *
 * ── FIXTURES START FROM THE API'S ROW SHAPE ────────────────────────────────
 * `{ course_id, training_topics: [{ title, bullets }] }` — what
 * GET /api/ai/public-course returns, not props already massaged into whatever
 * the component wants. This suite has been burned by the opposite: eight tests
 * seeded with post-fix shapes stayed green against a defective function, proved
 * by physical revert. A fixture in the target shape never runs the code.
 */

// ── FIXTURES: real rows, verbatim from the live API ────────────────────────

/**
 * UIPATH. `List<mailmessage>` is a C# generic — the ONLY angle bracket in 4,443
 * measured values, and not markup. React escaping renders it. HTML rendering
 * would eat it as an unknown element, which is why the plain path must never be
 * routed through dangerouslySetInnerHTML.
 */
const UIPATH = {
  course_id: 'UIPATH',
  training_topics: [{
    title: 'การทำงานกับ Outlook',
    bullets: [
      '​การอ่าน email จาก outlook',
      'อธิบายความสามารถของ List<mailmessage> ที่ได้จากการอ่าน email',
    ],
  }],
};

/**
 * A TITLE-ONLY ROW. 125 of these exist across 27 courses and they are
 * LEGITIMATE HEADINGS, not damage — `rowHasContent` is `title ||
 * bullets.length > 0` precisely so a save cannot delete them.
 */
const TITLE_ONLY = {
  course_id: 'MSWO365-PRO',
  training_topics: [
    { title: 'Part 9. สรุปเนื้อหา และ Q&A', bullets: [] },
    { title: 'สรุปเนื้อหาทั้งหมด และแนวทางการต่อยอด', bullets: [] },
  ],
};

/** U+00A0 NO-BREAK SPACE — 35 live values carry one. */
const NBSP_ROW = {
  course_id: 'MANUS-MKT',
  training_topics: [{
    title: 'Brand DNA',
    bullets: [`Product-Market Fit:${String.fromCharCode(160)}ตรวจสอบความต้องการของตลาด`],
  }],
};

/** U+200B ZERO WIDTH SPACE — 14 live bullets lead with one. */
const ZWSP_ROW = {
  course_id: 'GOO-ADK',
  training_topics: [{
    title: 'Agentic AI VS Traditional AI',
    bullets: [`${String.fromCharCode(8203)}เรียนรู้เกี่ยวกับความแตกต่างระหว่าง AI แบบดั้งเติม`],
  }],
};

/** A run of 2+ plain spaces — 41 live values have them. */
const DOUBLE_SPACE = {
  course_id: 'GEN-AI-L1',
  training_topics: [{ title: 'GPT', bullets: ['รู้จักกับ GPT Models  GPT-o1, GPT-4o vs GPT-3.5'] }],
};

/** The catalogue's largest panel: 41 bullets under one heading. */
const LARGEST = {
  course_id: 'POWER-BI-XDM',
  training_topics: [{
    title: 'Dimensional Model และ Relationship',
    bullets: Array.from({ length: 41 }, (_, i) => `bullet ${i + 1}`),
  }],
};

/** A course mixing every shape, in the order the API would return them. */
const MIXED = {
  course_id: 'MIXED',
  training_topics: [
    ...UIPATH.training_topics,
    ...TITLE_ONLY.training_topics,
    ...NBSP_ROW.training_topics,
    ...ZWSP_ROW.training_topics,
  ],
};

const FIXTURES = [
  ['UIPATH — List<mailmessage> + U+200B', UIPATH],
  ['MSWO365-PRO — title-only rows, zero bullets', TITLE_ONLY],
  ['MANUS-MKT — U+00A0', NBSP_ROW],
  ['GOO-ADK — U+200B', ZWSP_ROW],
  ['GEN-AI-L1 — a run of plain spaces', DOUBLE_SPACE],
  ['POWER-BI-XDM — the largest panel, 41 bullets', LARGEST],
  ['a course mixing all of them', MIXED],
];

/** Pre-B2 call shape: the prop did not exist. */
const before = (course) => renderToStaticMarkup(createElement(CourseOutline, { course }));
/** Post-B2, for every live course: `prepareOutlineRichHtml` returns null. */
const after = (course) => renderToStaticMarkup(createElement(CourseOutline, { course, richHtml: null }));

// ── THE PROOF ──────────────────────────────────────────────────────────────

for (const [what, course] of FIXTURES) {
  test(`INERT: ${what} renders byte-identical with and without the new prop`, () => {
    assert.equal(
      after(course), before(course),
      'B2 changed the plain render. No course has a rich copy, so every one of '
      + 'the 79 must render exactly as it did before this round.',
    );
  });
}

test('INERT: every value that is NOT a rich array reaches the plain path', () => {
  /**
   * `prepareOutlineRichHtml` returns null today, but the component is also the
   * last line of defence: a future caller passing something odd must degrade to
   * plain rather than to a blank section.
   */
  const baseline = before(MIXED);
  for (const richHtml of [null, undefined, [], '', 0, false, 'a string', {}]) {
    assert.equal(
      renderToStaticMarkup(createElement(CourseOutline, { course: MIXED, richHtml })),
      baseline,
      `richHtml=${JSON.stringify(richHtml)} did not reach the plain path`,
    );
  }
});

test('INERT: the plain path emits no rich wrapper, on every fixture', () => {
  // The structural half. Byte-equality above would also hold if BOTH paths had
  // been rewritten the same wrong way; this pins which path ran.
  for (const [what, course] of FIXTURES) {
    assert.ok(!after(course).includes('topic-rich'), `the rich wrapper rendered for ${what}`);
  }
});

test('INERT: bullets still render as ESCAPED React children', () => {
  /**
   * Scoped to the fixtures that HAVE bullets, on purpose. MSWO365-PRO is
   * title-only — 125 such rows exist — so it renders no bullet spans at all,
   * and sweeping it here would assert something that was never true of it.
   * (The first draft did exactly that and went red on a correct component: the
   * heading's span carries a className, so `includes('<span>')` never matched.)
   */
  for (const [what, course] of FIXTURES) {
    const hasBullets = course.training_topics.some((r) => (r.bullets ?? []).length > 0);
    if (!hasBullets) continue;
    assert.ok(
      after(course).includes('<span>'),
      `${what}: the plain path stopped rendering bullets as escaped children`,
    );
  }
});

test('INERT: `List<mailmessage>` is ESCAPED, and the text survives', () => {
  /**
   * The row that decides whether unifying the two paths is allowed. Escaped it
   * reads correctly; rendered as HTML the browser swallows `<mailmessage>` as an
   * unknown element and the text between the brackets disappears.
   */
  const html = after(UIPATH);
  assert.ok(html.includes('List&lt;mailmessage&gt;'), 'the C# generic was not escaped');
  assert.ok(!html.includes('List<mailmessage>'), 'raw angle brackets reached the markup');
});

test('INERT: a title-only row renders its heading and no bullet list', () => {
  // 125 legitimate headings. A rich path that assumed every row has bullets
  // would drop them; the plain path must keep rendering the <button> heading
  // with no <ul> under it.
  const html = after(TITLE_ONLY);
  assert.ok(html.includes('Part 9. สรุปเนื้อหา และ Q&amp;A'), 'the title-only heading vanished');
  assert.ok(!html.includes('<ul'), 'a bullet list rendered for a row with zero bullets');
});

test('INERT: invisible characters survive the plain render untouched', () => {
  const nbsp = String.fromCharCode(160);
  const zwsp = String.fromCharCode(8203);
  assert.ok(after(NBSP_ROW).includes(`Product-Market Fit:${nbsp}ตรวจสอบ`), 'U+00A0 was rewritten');
  assert.ok(after(ZWSP_ROW).includes(`${zwsp}เรียนรู้`), 'U+200B was stripped');
  assert.ok(after(DOUBLE_SPACE).includes('GPT Models  GPT-o1'), 'a run of spaces was collapsed');
});

test('CONTROL: the byte-identity check CAN fail', () => {
  /**
   * Every assertion above is an equality between two renders of the same
   * component. If the component rendered nothing — or the same nothing on both
   * sides — they would all pass. Two independent checks that it does not:
   * a rich array DOES change the output, and the render is substantial.
   */
  const rich = renderToStaticMarkup(createElement(CourseOutline, {
    course: UIPATH,
    richHtml: ['<ul><li>x</li></ul>'],
  }));
  assert.notEqual(rich, before(UIPATH), 'a rich array produced identical output to plain — '
    + 'the rich path is unreachable and every inertness assertion above is vacuous');
  assert.ok(before(UIPATH).length > 800, `the baseline render is suspiciously short`);
  assert.ok(before(UIPATH).includes('หัวข้อการฝึกอบรม'), 'the section heading did not render');
});
