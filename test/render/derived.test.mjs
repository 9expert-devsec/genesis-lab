import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseScheduleSection } from '@/components/pageBuilder/sections/course_schedule';
import { CourseListSection } from '@/components/pageBuilder/sections/course_list';

// 2C.2b render coverage — the derived / time-varying data-backed types. They
// render from INJECTED data (the fetch is hoisted); the sample honesty lives in
// the editor, not here, so these prove only that they draw what they are handed
// and fail closed on nothing.

const R = (C, props) => renderToStaticMarkup(C(props));
const course = (id, name) => ({ course_id: id, course_name: name, course_price: 10, program: {} });

test('course_schedule renders injected rows, fails closed on empty/absent data', () => {
  const rows = [
    { _id: '1', dates: ['2026-10-17', '2026-10-18'], status: 'open', type: 'classroom' },
    { _id: '2', dates: ['2026-11-02'], status: 'nearly_full', type: 'online' },
  ];
  const html = R(CourseScheduleSection, { content: { courseId: 'MSE-AI' }, data: rows });
  assert.ok(html.includes('17-18'));        // formatted date range
  assert.ok(html.includes('ลงทะเบียน'));       // open status label (lib/scheduleStatus)
  assert.ok(html.includes('ใกล้เต็ม'));       // nearly_full status label
  // register link built from the course code + schedule _id (& is HTML-escaped)
  assert.ok(html.includes('/registration/public?course=mse-ai') && html.includes('class=1'));
  // fail-closed: no rows, wrong-shape, or no data → renders nothing
  assert.equal(R(CourseScheduleSection, { content: { courseId: 'MSE-AI' }, data: [] }), '');
  assert.equal(R(CourseScheduleSection, { content: { courseId: 'MSE-AI' }, data: undefined }), '');
});

test('course_schedule falls back to signup_url when no _id/code', () => {
  const html = R(CourseScheduleSection, {
    content: {},
    data: [{ dates: ['2026-12-01'], status: 'open', type: 'hybrid', signup_url: 'https://ext/signup' }],
  });
  assert.ok(html.includes('https://ext/signup'));
});

test('course_list renders a DERIVED list identically to a manual one (source-agnostic)', () => {
  // The component never sees `source` — the resolver already turned it into an
  // array. So the same injected array renders the same, whatever produced it.
  const data = [course('A', 'Alpha'), course('B', 'Beta')];
  const derived = R(CourseListSection, { data });
  const manual = R(CourseListSection, { data });
  assert.equal(derived, manual);
  assert.ok(derived.includes('Alpha') && derived.includes('Beta'));
  assert.equal(R(CourseListSection, { data: [] }), ''); // fail closed
});

// CONTROL (house pattern): a reader test must be able to fail. course_schedule
// does NOT read `content.limit` for the row count (the resolver already sliced),
// so injecting more rows than a stale limit still renders them all — proving the
// assertions above read the DATA, not a phantom content field.
test('control: course_schedule renders every injected row (limit is a resolver concern)', () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({ _id: String(i), dates: ['2026-10-17'], status: 'open', type: 'classroom' }));
  const html = R(CourseScheduleSection, { content: { courseId: 'MSE-AI', limit: 1 }, data: rows });
  const count = (html.match(/ลงทะเบียน/g) ?? []).length;
  assert.equal(count, 3); // all three, not clamped to content.limit
});

// ── ROUND 23 — course_schedule follows the section accent ──────────────────

/**
 * The calendar icon used to name the DEFAULT accent's own colour token, which
 * is the quietest form of the dead-control defect: it LOOKED accented, so an
 * author who chose a different accent had no symptom to notice — the icon just
 * stayed the colour it had always been.
 *
 * ── WHAT THESE TESTS CAN AND CANNOT SEE ────────────────────────────────────
 * The accent travels as a CSS custom property, so the class string is a
 * CONSTANT: the markup is identical for all six accent values and no render
 * test can tell one from another. What a render test CAN prove is which
 * mechanism the element is wired to — the variable rather than a fixed token —
 * and that is what these assert.
 *
 * The colour itself was measured in real Chrome, through real compiled Tailwind
 * and the real :root block, by scripts/_probe-schedule-accent.mjs. Round 23
 * measured 6 distinct icon colours across the 7 accent cases where the
 * pre-change component painted 1, and byte-identical output at the default.
 * That instrument is where the colour claim lives; this file pins the wiring.
 */

const scheduleRow = { _id: '1', dates: ['2026-10-17', '2026-10-18'], status: 'open', type: 'classroom' };

/** The one element the accent belongs on: the row's ornament icon. */
const iconClassOf = (html) => html.match(/<svg[^>]*class="([^"]*)"/)?.[1] ?? null;

test('course_schedule: the calendar icon is wired to the section accent, not a fixed token', () => {
  const html = R(CourseScheduleSection, { content: { courseId: 'MSE-AI' }, data: [scheduleRow] });
  const cls = iconClassOf(html);

  // Exact class, not a substring: a check for "contains the variable" would
  // pass on an element that carried BOTH the variable and the old token, where
  // the later utility silently wins.
  assert.equal(cls, 'lucide lucide-calendar-days h-4 w-4 shrink-0 text-[var(--pb-accent-fill)]',
    'the calendar icon no longer takes the accent through --pb-accent-fill');

  // ORNAMENT, not a key figure: `fill` is the role checklist's tick, timeline's
  // dot and icon_card's / stat_card's icons all use. The text role would be the
  // wrong precedent for a decorative mark.
  assert.equal(cls.includes('--pb-accent-text'), false,
    'the icon took the key-figure role; ornament is --pb-accent-fill (round 21, three roles)');
});

test('CONTROL: the icon probe DOES match the pre-round-23 hardcoded token', () => {
  /**
   * Without this, "the class equals the accent one" says nothing about whether
   * the probe could ever have seen the token it replaced — a selector that
   * matched nothing would pass the negative half of every assertion below.
   */
  const before = '<svg class="lucide lucide-calendar-days h-4 w-4 shrink-0 text-9e-action"></svg>';
  assert.equal(iconClassOf(before), 'lucide lucide-calendar-days h-4 w-4 shrink-0 text-9e-action');
  assert.equal(iconClassOf('<div>no icon here</div>'), null);
});

test('course_schedule: body copy is NOT accented — the first negative rule', () => {
  /**
   * Holds across all nine pre-existing consumers without exception: price_card
   * accents its price and not its title, stat_card its value and not its label.
   * Here the row's date range is primary text and its type is secondary text;
   * both keep their surface tokens.
   */
  const html = R(CourseScheduleSection, { content: { courseId: 'MSE-AI' }, data: [scheduleRow] });
  const spanClasses = [...html.matchAll(/<span[^>]*class="([^"]*)"/g)].map((m) => m[1]);

  assert.deepEqual(spanClasses, [
    'min-w-0 flex-1',
    'block text-sm font-bold text-[var(--text-primary)]',
    'block text-xs text-[var(--text-secondary)]',
    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold bg-[#39b980]/10 text-[#39b980] dark:bg-[#39b980]/20',
  ], 'a span in the schedule row changed its classes — check it did not take the accent');

  // Stated separately from the exact set above, so the failure names the RULE.
  for (const cls of spanClasses) {
    assert.equal(/--pb-accent-/.test(cls), false,
      `a text span took the accent (${cls}) — headings and body copy are never accented`);
  }
});

test('course_schedule: the status badge is NOT accented — the second negative rule', () => {
  /**
   * resolveScheduleBadge encodes open / nearly-full. Repainting it with a
   * chosen accent would make the badge lie about how full a round is, which is
   * the one thing the nine consumers never do. Both variants are checked,
   * because a fix that reached only one would be invisible in a one-row fixture.
   */
  const html = R(CourseScheduleSection, {
    content: { courseId: 'MSE-AI' },
    data: [scheduleRow, { _id: '2', dates: ['2026-11-02'], status: 'nearly_full', type: 'online' }],
  });
  const badges = [...html.matchAll(/<span class="(shrink-0 rounded-full[^"]*)"/g)].map((m) => m[1]);

  assert.deepEqual(badges, [
    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold bg-[#39b980]/10 text-[#39b980] dark:bg-[#39b980]/20',
    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold bg-[#ffc94a]/15 text-[#d4a017] dark:bg-[#ffc94a]/20 dark:text-[#ffc94a]',
  ], 'the status badges changed — the two variants must stay semantically coloured, and distinct');

  // …and they are DIFFERENT from each other, which is what "semantic" means
  // here: one accent value would have collapsed them to one colour.
  assert.notEqual(badges[0], badges[1]);
});
