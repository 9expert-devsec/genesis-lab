import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { __setSearchParams, __setPathname } from 'next/navigation';
import { CourseListClient } from '@/app/(public)/training-course/_components/CourseListClient';
import { skills } from '@/config/site';

/**
 * /training-course renders the SET THE URL ASKS FOR.
 *
 * ── SCOPE. THIS ASSERTS THE COMPONENT'S SSR OUTPUT, NOT THE PAGE'S. ─────────
 * The route wraps this component in `<Suspense fallback={null}>` (page.jsx),
 * which it must, because the component calls `useSearchParams`. Measured
 * against the real build artifact: `.next/server/app/training-course.html` is
 * 1,391,649 bytes of which 95.1% sits inside 55 `<script>` blocks, the rendered
 * markup is 67,782 bytes of header and footer, the visible text is 1,455
 * characters, and there are ZERO course links in it. The page's server render
 * emits no list at all, filtered or unfiltered, and this file does not change
 * that.
 *
 * So what follows is a claim about THIS COMPONENT — that its output is a
 * function of the query string — and not a claim that a crawler receives a
 * filtered page. Reading it as the latter would make it an SEO guarantee that
 * guarantees nothing. Server-rendering the list is a separate decision about
 * page.jsx and is not taken here.
 *
 * ── WHAT THIS FILE CANNOT CARRY, SAID PLAINLY ──────────────────────────────
 * Not the erasure. That defect needs a SURVIVING component instance re-rendered
 * with changed searchParams — the old effect wrote its stale state back over the
 * incoming URL — and reproducing it needs `createRoot` plus a second render into
 * the same root, which this suite forbids for a measured reason (it leaks
 * globalThis.window across the shared process and once broke 28 render tests).
 * Under `renderToStaticMarkup` every render is a first render, and a first
 * render was ALWAYS correct even before the fix: the state was seeded from the
 * very URL it was about to be compared against.
 *
 * The erasure is carried by the source-shape rule in test/fs/urlFilterNoState.
 * What this file adds is the other half — that the filter is genuinely computed
 * from the URL rather than from anything else — which is what makes that shape
 * rule mean something.
 */

// A real slug/id pair: the filter resolves a slug through findSkillBySlug and
// matches upstreamId against course.skills, so an invented slug would resolve
// to null and silently disable the filter — the test would then pass by
// rendering everything, which is precisely the failure it exists to catch.
const DATA = skills.find((s) => s.slug === 'data');
const POWER = skills.find((s) => s.slug === 'power-platform');

const course = (id, name, skillId, programName) => ({
  course_id: id,
  course_name: name,
  slug: id.toLowerCase(),
  skills: [skillId],
  program: { _id: `p-${programName}`, program_name: programName },
});

const ITEMS = [
  course('DATA-1', 'Data Analytics Foundation', DATA.upstreamId, 'Data'),
  course('DATA-2', 'Data Storytelling', DATA.upstreamId, 'Data'),
  course('PP-1', 'Power Apps Essentials', POWER.upstreamId, 'Power Platform'),
];

function render(query) {
  __setPathname('/training-course');
  __setSearchParams(query);
  return renderToStaticMarkup(
    createElement(CourseListClient, {
      items: ITEMS,
      programOrder: ['Data', 'Power Platform'],
      earlyBirdMap: {},
      currentYear: 2026,
    })
  );
}

// ── 1. The skill parameter selects the set ──────────────────────────────────

test('no query renders every course', () => {
  const html = render('');
  for (const c of ITEMS) assert.ok(html.includes(c.course_name), `missing ${c.course_name}`);
});

test('?skill=data renders ONLY the data courses', () => {
  const html = render('skill=data');
  assert.ok(html.includes('Data Analytics Foundation'));
  assert.ok(html.includes('Data Storytelling'));
  assert.ok(
    !html.includes('Power Apps Essentials'),
    'a course outside the requested skill rendered — the filter did not come from the URL'
  );
});

test('?skill=power-platform renders ONLY the power-platform course', () => {
  const html = render('skill=power-platform');
  assert.ok(html.includes('Power Apps Essentials'));
  assert.ok(!html.includes('Data Analytics Foundation'));
  assert.ok(!html.includes('Data Storytelling'));
});

/**
 * CONTROL: the two skill renders are genuinely different documents.
 *
 * Every assertion above is "X present, Y absent". If the filter silently did
 * nothing, the first test would still pass and the negatives would be the only
 * thing holding the file up. This states the difference positively, so a filter
 * that stopped working could not leave the file green by rendering everything
 * every time.
 */
test('CONTROL: different skills produce different markup', () => {
  const a = render('skill=data');
  const b = render('skill=power-platform');
  assert.notEqual(a, b, 'both skills rendered identically — the filter is inert');
  assert.ok(a.length > 500 && b.length > 500, 'a render collapsed to near-nothing');
});

/**
 * CONTROL: the stub is actually delivering the query string.
 *
 * If `__setSearchParams` did not reach `useSearchParams`, every filtered case
 * would render the full catalogue and the negatives would fail loudly — except
 * for the unfiltered test, which would pass for the wrong reason. This pins the
 * seam itself rather than inferring it from the results.
 */
test('CONTROL: __setSearchParams reaches the component', () => {
  const all = render('');
  const one = render('skill=power-platform');
  assert.ok(all.includes('Data Storytelling'), 'the unfiltered render is missing a course');
  assert.ok(!one.includes('Data Storytelling'), 'the query string never reached useSearchParams');
});

// ── 2. The program parameter, and the two composed ──────────────────────────

test('?program= filters by program name', () => {
  const html = render(`program=${encodeURIComponent('Power Platform')}`);
  assert.ok(html.includes('Power Apps Essentials'));
  assert.ok(!html.includes('Data Analytics Foundation'));
});

test('skill and program compose — a contradictory pair renders nothing', () => {
  const html = render(`skill=data&program=${encodeURIComponent('Power Platform')}`);
  for (const c of ITEMS) {
    assert.ok(!html.includes(c.course_name), `${c.course_name} survived a contradictory filter`);
  }
});

/**
 * An unknown slug renders the UNFILTERED catalogue, and that is documented
 * behaviour rather than an accident — see src/config/site.js, which records
 * that a renamed slug makes the filter "SILENTLY DROP, showing the unfiltered
 * catalog rather than an error". Pinned here so a future change to that
 * behaviour is a deliberate one.
 */
test('an unknown skill slug falls back to the full catalogue, as documented', () => {
  const html = render('skill=no-such-skill-slug');
  for (const c of ITEMS) assert.ok(html.includes(c.course_name), `missing ${c.course_name}`);
});

// ── 3. The view parameter — ARRIVAL half of the rule ────────────────────────

test('?view=table renders the table view', () => {
  const html = render('view=table');
  assert.match(html, /<table/, 'view=table did not render a table');
});

test('no view parameter renders the card view', () => {
  assert.ok(!/<table/.test(render('')), 'the default view rendered a table');
});

/**
 * `?view=card` IS RESPECTED ON ARRIVAL.
 *
 * The effect this replaces normalised it away on load — it only ever persisted
 * 'table' — so a link somebody shared with `view=card` lost the parameter the
 * moment it opened. Arrival must now leave the URL alone. The removal of a
 * default belongs to the ACTION path, which is a click and is not observable
 * here; see the header.
 */
test('?view=card is respected on arrival and renders cards', () => {
  const html = render('view=card');
  assert.ok(!/<table/.test(html), 'view=card rendered the table view');
  for (const c of ITEMS) assert.ok(html.includes(c.course_name));
});

test('an unrelated parameter does not disturb the render', () => {
  const html = render('utm_source=newsletter&skill=data');
  assert.ok(html.includes('Data Storytelling'));
  assert.ok(!html.includes('Power Apps Essentials'));
});
