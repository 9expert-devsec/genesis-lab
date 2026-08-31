/**
 * ROUND 64 — drive the four cases and print what each one actually renders.
 *
 * Not a test: a test says pass/fail, this says WHAT APPEARS. Round 64 §L asks
 * for a section in each of the four states, with the chip each one carries, so
 * the wording can be read rather than inferred from an assertion.
 *
 * READ-ONLY. Renders in-process; writes nothing, touches no DB.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_drive-round64-modes.mjs
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

const { CourseScheduleSection } = await import('@/components/pageBuilder/sections/course_schedule');

const ROWS = [
  { _id: 'r1', dates: ['2026-09-10', '2026-09-11'], status: 'open', type: 'classroom' },
  { _id: 'r2', dates: ['2026-10-02'], status: 'nearly_full', type: 'hybrid' },
  { _id: 'r3', dates: ['2026-11-20'], status: 'full', type: 'classroom' },
];

const CASES = [
  ['1. upcoming (unchanged)', { courseId: 'MSE-L1', limit: 0 }],
  ['2. manual, all valid', { courseId: 'MSE-L1', source: 'manual', roundIds: ['r3', 'r1'] }],
  ['3. manual, one ELAPSED', { courseId: 'MSE-L1', source: 'manual',
    roundIds: ['r1', 'past'],
    roundSnapshots: [{ id: 'past', dates: ['2026-03-04', '2026-03-05'], type: 'hybrid' }] }],
  ['4. manual, one MISSING', { courseId: 'MSE-L1', source: 'manual',
    roundIds: ['r1', 'gone', 'never'],
    roundSnapshots: [{ id: 'gone', dates: ['2027-06-01'], type: 'classroom' }] }],
];

for (const [label, content] of CASES) {
  const html = renderToStaticMarkup(CourseScheduleSection({ content, data: ROWS }));
  const doc = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
  console.log(`\n${'='.repeat(72)}\n${label}\n${'='.repeat(72)}`);
  console.log(`  content : ${JSON.stringify(content)}`);
  if (!html) { console.log('  RENDERS NOTHING (section absent from the page)'); continue; }
  const items = [...doc.querySelectorAll('li')];
  console.log(`  rows    : ${items.length}   anchors: ${(html.match(/<a[\s>]/g) ?? []).length}`);
  items.forEach((li, i) => {
    const lines = [...li.querySelectorAll('span.block')].map((s) => s.textContent.trim());
    const chip = li.querySelector('span.rounded-full');
    const link = li.querySelector('a');
    console.log(
      `   row ${i + 1}: ${String(lines[0] ?? '(no date)').padEnd(16)}`
      + ` type=${String(lines[1] ?? '—').padEnd(12)}`
      + ` chip=${String(chip?.textContent.trim() ?? '(none)').padEnd(12)}`
      + ` clickable=${link ? 'YES → ' + link.getAttribute('href') : 'no'}`
    );
  });
}
console.log();
