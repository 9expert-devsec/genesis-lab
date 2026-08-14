import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { CoursesAdminClient } from '@/app/admin/courses/_components/CoursesAdminClient';
import { NO_ACCENT_COLOR } from '@/lib/courses/programAccent';

/**
 * The colour actually reaches the group header, and an unmatched group does not
 * inherit its neighbour's.
 *
 * The resolution itself is pure and is driven in test/pure/programAccent. This
 * is the half that only the markup can show: that the resolved value lands on
 * the header cell, per group, and that the neutral is structurally different
 * from a real colour rather than merely a different hue.
 */

const course = (code, programId) => ({
  course_id: code,
  course_name: code,
  _id: `id-${code}`,
  program: { program_id: programId, _id: `oid-${programId}` },
});

const PROGRAM_COLORS = { CLAUDE: '#de7356', 'POWER-BI': '#a88429' };
const PROGRAM_NAMES = { CLAUDE: 'Claude AI', 'POWER-BI': 'Power BI', ORPHAN: 'No Colour Here' };
const ORDER = { CLAUDE: ['CLAUDE-AI'], 'POWER-BI': ['POWER-BI'], ORPHAN: ['ORPHAN-1'] };

function render(props = {}) {
  __setPathname('/admin/courses');
  __setSearchParams('');
  return renderToStaticMarkup(
    createElement(CoursesAdminClient, {
      courses: [course('CLAUDE-AI', 'CLAUDE'), course('POWER-BI', 'POWER-BI')],
      extensions: {},
      programs: [],
      programCourseOrder: ORDER,
      programNames: PROGRAM_NAMES,
      programColors: PROGRAM_COLORS,
      q: '',
      program: '',
      type: '',
      ...props,
    })
  );
}

/**
 * The `border-left-color` of every group header, in document order.
 *
 * Read off the `<th colspan="8">` specifically — the header cell is the only
 * thing that carries an accent, so a match anywhere else would mean the colour
 * leaked onto a row.
 */
function headerAccents(html) {
  return [...html.matchAll(/<th colspan="8"[^>]*style="([^"]*)"[^>]*>/gi)]
    .map((m) => /border-left-color:\s*([^;"]+)/i.exec(m[1])?.[1]?.trim() ?? null);
}

/** Whether each group header's left border is solid or dashed. */
function headerBorderStyles(html) {
  return [...html.matchAll(/<th colspan="8"[^>]*class="([^"]*)"[^>]*>/gi)]
    .map((m) => (/\bborder-dashed\b/.test(m[1]) ? 'dashed' : /\bborder-solid\b/.test(m[1]) ? 'solid' : null));
}

// ── The colour reaches the header ───────────────────────────────────────────

test('each group header carries its OWN programme colour', () => {
  assert.deepEqual(headerAccents(render()), ['#de7356', '#a88429']);
});

test('the colour comes from the shared source, not a literal in the admin tree', () => {
  // Change the map and the markup follows. A copied palette would not.
  const html = render({ programColors: { CLAUDE: '#123456', 'POWER-BI': '#abcdef' } });
  assert.deepEqual(headerAccents(html), ['#123456', '#abcdef']);
});

test('a matched header draws a SOLID bar', () => {
  assert.deepEqual(headerBorderStyles(render()), ['solid', 'solid']);
});

// ── The unmatched group ─────────────────────────────────────────────────────

test('AN UNMATCHED PROGRAMME DOES NOT INHERIT THE PREVIOUS GROUP\'S COLOUR', () => {
  // The stale-carry bug this file exists for. ORPHAN follows CLAUDE, so a
  // carried value would paint it #de7356 and look entirely plausible.
  const html = render({
    courses: [course('CLAUDE-AI', 'CLAUDE'), course('ORPHAN-1', 'ORPHAN')],
  });
  const accents = headerAccents(html);
  assert.equal(accents.length, 2);
  assert.equal(accents[0], '#de7356');
  assert.equal(accents[1], NO_ACCENT_COLOR, 'the unmatched group took its neighbour\'s colour');
  assert.notEqual(accents[1], accents[0]);
});

test('the carry does not happen in the other direction either', () => {
  // Unmatched FIRST, then matched: a naive "remember the last colour" would
  // leave the second group neutral instead.
  const html = render({
    courses: [course('ORPHAN-1', 'ORPHAN'), course('CLAUDE-AI', 'CLAUDE')],
  });
  assert.deepEqual(headerAccents(html), [NO_ACCENT_COLOR, '#de7356']);
});

test('an unmatched group is structurally different, not just a different hue', () => {
  // Several real colours have poor contrast against this surface in one theme
  // or the other, so a neutral distinguished ONLY by its colour would be
  // confusable with a real one exactly when contrast is worst.
  const html = render({
    courses: [course('CLAUDE-AI', 'CLAUDE'), course('ORPHAN-1', 'ORPHAN')],
  });
  assert.deepEqual(headerBorderStyles(html), ['solid', 'dashed']);
});

test('the unmatched header says so in its title', () => {
  const html = render({ courses: [course('ORPHAN-1', 'ORPHAN')] });
  assert.match(html, /title="[^"]*ไม่ได้กำหนดสีของโปรแกรมนี้"/);
});

test('an EMPTY colour map turns every group neutral — the listPrograms-failed case', () => {
  const html = render({ programColors: {} });
  assert.deepEqual(headerAccents(html), [NO_ACCENT_COLOR, NO_ACCENT_COLOR]);
  assert.deepEqual(headerBorderStyles(html), ['dashed', 'dashed']);
});

// ── Colour is an ADDITIONAL cue ─────────────────────────────────────────────

test('the group name and count are unchanged by the accent', () => {
  const html = render();
  assert.match(html, /Claude AI/);
  assert.match(html, /Power BI/);
  assert.match(html, /1 หลักสูตร/);
  // and they survive the neutral too — colour never carries meaning alone
  const neutral = render({ programColors: {} });
  assert.match(neutral, /Claude AI/);
  assert.match(neutral, /1 หลักสูตร/);
});

test('the accent is on the HEADER only — no course row is coloured', () => {
  const html = render();
  const rowStyles = [...html.matchAll(/<tr[^>]*style="([^"]*)"/gi)].map((m) => m[1]);
  assert.deepEqual(rowStyles, [], 'a row carried an inline style — the accent leaked out of the header');
  assert.equal((html.match(/border-left-color/gi) ?? []).length, 2, 'exactly one accent per group header');
});

// ── fc46953 and f596901 behaviour is untouched ──────────────────────────────

test('the skill / mega-menu notice still renders', () => {
  const html = render();
  assert.match(html, /ไม่มีผลกับหน้า Skill/, 'the skill-dimension notice was lost');
  assert.match(html, /snapshot/, 'the mega-menu snapshot caveat was lost');
  assert.match(html, /href="\/admin\/cache"/);
});

test('the drag affordance, the numbering and the unlisted marker survive', () => {
  const html = render({
    courses: [course('BRAND-NEW', 'CLAUDE'), course('CLAUDE-AI', 'CLAUDE')],
  });
  assert.match(html, /aria-label="Drag handle"/, 'the drag affordance was lost');
  assert.match(html, /ยังไม่จัดลำดับ/, 'the unlisted marker was lost');
});

test('the null-order banner and the q-withdrawal survive', () => {
  assert.match(render({ programCourseOrder: null }), /ยังไม่มีลำดับที่บันทึกไว้/);
  assert.match(render({ q: 'CLAUDE' }), /ปิดการจัดลำดับชั่วคราวเพราะกำลังกรองรายการอยู่/);
});

test('a group header still renders its accent while reordering is withdrawn', () => {
  // The accent is about identity, not about editability — withdrawing the drag
  // must not also blank the colour.
  assert.deepEqual(headerAccents(render({ q: 'CLAUDE' })), ['#de7356']);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the accent extractor finds real values and nothing in bare markup', () => {
  // Four assertions above are "this is NOT the neighbour's colour". A broken
  // extractor returning [] or [null] would satisfy several of them.
  assert.deepEqual(headerAccents(render()), ['#de7356', '#a88429']);
  assert.deepEqual(headerAccents('<table><tbody></tbody></table>'), []);
  assert.deepEqual(headerBorderStyles('<table></table>'), []);
});

test('CONTROL: the two colours really are different documents', () => {
  const a = render();
  const b = render({ programColors: {} });
  assert.notEqual(a, b);
  assert.ok(a.includes('#de7356'), 'the matched render lost its colour');
  assert.ok(!b.includes('#de7356'), 'the neutral render still carries a programme colour');
});
