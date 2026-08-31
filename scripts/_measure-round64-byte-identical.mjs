/**
 * ROUND 64 — does a stored `course_schedule` render byte-for-byte as it did?
 *
 * The commit adds a MODE to a component the published site renders through, and
 * a branch to the resolver that feeds it. "It is gated on `source`, and no
 * stored section carries one" is an argument; this is the measurement.
 *
 * The shape is round 45's, which is round 50/57/59/60/61's: the pre-change files
 * are read out of git and written BESIDE the current ones, so their relative and
 * aliased imports resolve to the same modules, and both are driven over the same
 * corpus. Every pair must match byte for byte.
 *
 * ── TWO LAYERS, BECAUSE TWO FILES MOVED ───────────────────────────────────
 *   RESOLVER  assembleResolved decides how many rows reach the renderer, and
 *             round 64 taught it to skip `limit` under the new mode. Compared
 *             over the same sections and the same fetched rows.
 *   RENDERER  CourseScheduleSection now asks chosenRounds which rows to draw.
 *             Compared over the resolver's output.
 *
 * ── THE CONTROL, WHICH IS THE POINT ───────────────────────────────────────
 * "0 differences" and "the comparison never ran" print the same number. So the
 * same corpus is driven a second time with `source: 'manual'` SET, and those
 * pairs must DIFFER — the pre-change component cannot know the mode, so it draws
 * every row where the post-change one draws the chosen ones. A run where both
 * columns report zero is a broken harness, not a clean result, and it says so.
 *
 * READ-ONLY apart from two temp files it creates and removes under src/.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_measure-round64-byte-identical.mjs
 *   BASE_REF=<sha> node --import ./scripts/_probe-panel-register.mjs scripts/_measure-round64-byte-identical.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = process.cwd();
const BASE_REF = process.env.BASE_REF ?? 'HEAD';

const TARGETS = [
  {
    from: 'src/components/pageBuilder/sections/course_schedule.jsx',
    to: 'src/components/pageBuilder/sections/_baseline_course_schedule.jsx',
  },
  {
    from: 'src/lib/pageBuilder/resolveSectionRefs.js',
    to: 'src/lib/pageBuilder/_baseline_resolveSectionRefs.js',
  },
];

for (const t of TARGETS) {
  const text = execFileSync('git', ['show', `${BASE_REF}:${t.from}`], { encoding: 'utf8' });
  writeFileSync(path.join(ROOT, t.to), text, 'utf8');
}

let report;
try {
  const { CourseScheduleSection: Now } =
    await import('@/components/pageBuilder/sections/course_schedule');
  const { CourseScheduleSection: Then } =
    await import('@/components/pageBuilder/sections/_baseline_course_schedule');
  const { assembleResolved: assembleNow } =
    await import('@/lib/pageBuilder/resolveSectionRefs');
  const { assembleResolved: assembleThen } =
    await import('@/lib/pageBuilder/_baseline_resolveSectionRefs');

  /**
   * THE FETCHED ROWS. Real shapes: `_id`, a `dates` array, one of the three MSDB
   * statuses, a delivery type, and the legacy `signup_url` that 77 of 88 rounds
   * carry. Plus the degenerate ones a renderer comparison has to include,
   * because they are where `row.dates ?? []` could differ from `s?.dates`:
   * a round with no dates at all, one with no type, one with no `_id`, and one
   * whose status upstream does not emit.
   */
  const ROWS = [
    { _id: 'a1', dates: ['2026-09-10', '2026-09-11'], status: 'open', type: 'classroom',
      signup_url: 'https://www.9experttraining.com/registration/public?class=2596&course=2205' },
    { _id: 'a2', dates: ['2026-10-02'], status: 'nearly_full', type: 'hybrid' },
    { _id: 'a3', dates: ['2026-11-20', '2026-11-21', '2026-11-22'], status: 'full', type: 'classroom' },
    { _id: 'a4', dates: [], status: 'open', type: 'hybrid' },                    // no usable date
    { _id: 'a5', dates: ['2026-12-01'], status: 'open' },                        // no type
    { dates: ['2026-12-08'], status: 'open', type: 'hybrid',                     // no _id
      signup_url: 'https://ext/signup' },
    { _id: 'a7', dates: ['2027-01-05'], status: 'sold-out', type: 'classroom' }, // unknown status
    { _id: 'a8', dates: ['2027-02-02'], type: 'classroom' },                     // no status
  ];

  /**
   * THE STORED SHAPES. The three sections in `page_builder_pages` when round 63
   * measured this clone, plus every other content shape a stored document can
   * legally be in: no course, a stale code, and each limit that appears.
   *
   * NONE of them carries `source` — that is the fact the whole change rests on,
   * and it is what makes this corpus the right one.
   */
  const STORED = [
    { courseId: 'MSE-L1', limit: 1 },          // stored, twice (draft + live)
    { courseId: 'VIBE-CODE-L2', limit: 0 },    // stored
    { courseId: 'MSE-L1' },                    // limit absent
    { courseId: 'MAKE-L1', limit: 0 },         // a real course with no rounds
    { courseId: 'NOPE-XX', limit: 0 },         // a code MSDB does not have
    { courseId: '', limit: 0 },                // no course chosen
    {},                                        // nothing at all
    { courseId: 'MSE-L1', limit: 3 },
    { courseId: 'MSE-L1', limit: 99 },         // a cap past the row count
  ];

  /** What the fetch returned for each code — including the two empty cases. */
  const FETCHED = new Map([
    ['MSE-L1', ROWS],
    ['VIBE-CODE-L2', ROWS.slice(0, 2)],
    ['MAKE-L1', []],
    ['NOPE-XX', []],
  ]);

  const resolveWith = (assemble, content) => assemble(
    [{ id: 's1', type: 'course_schedule', content }],
    new Map(), new Map(),
    { scheduleMap: FETCHED }
  ).s1;

  const draw = (Component, content, data) =>
    renderToStaticMarkup(Component({ content, data }));

  const compare = (corpus) => {
    const rows = [];
    for (const content of corpus) {
      const before = resolveWith(assembleThen, content);
      const after = resolveWith(assembleNow, content);
      const resolverSame = JSON.stringify(before) === JSON.stringify(after);

      // Each component is fed the rows ITS OWN resolver produced — otherwise a
      // resolver difference would be hidden by handing both the same input.
      const drawnBefore = draw(Then, content, before);
      const drawnAfter = draw(Now, content, after);

      rows.push({
        content: JSON.stringify(content),
        resolvedBefore: Array.isArray(before) ? before.length : String(before),
        resolvedAfter: Array.isArray(after) ? after.length : String(after),
        resolverSame,
        bytesBefore: Buffer.byteLength(drawnBefore, 'utf8'),
        bytesAfter: Buffer.byteLength(drawnAfter, 'utf8'),
        renderSame: drawnBefore === drawnAfter,
      });
    }
    return rows;
  };

  const stored = compare(STORED);

  /**
   * THE CONTROL. The same contents with `source: 'manual'` and a two-round
   * selection spliced in. The pre-change files cannot know the mode: their
   * resolver still applies `limit` and their renderer still draws every row, so
   * every pair whose section HAS rounds must differ. The pairs with no rounds
   * stay equal — both render nothing — and are excluded from the control's
   * denominator rather than counted as failures, since there is nothing there
   * for a mode to change.
   */
  const CONTROL = STORED.map((c) => ({ ...c, source: 'manual', roundIds: ['a3', 'a1'] }));
  const control = compare(CONTROL).map((r, i) => ({
    ...r,
    hasRounds: (resolveWith(assembleThen, STORED[i])?.length ?? 0) > 0,
  }));

  const controlLive = control.filter((r) => r.hasRounds);

  report = {
    baseRef: BASE_REF,
    '── STORED SHAPES: must be byte-identical ──': '',
    storedShapes: stored.length,
    resolverDiffering: stored.filter((r) => !r.resolverSame).length,
    renderDiffering: stored.filter((r) => !r.renderSame).length,
    totalBytesBefore: stored.reduce((a, r) => a + r.bytesBefore, 0),
    totalBytesAfter: stored.reduce((a, r) => a + r.bytesAfter, 0),
    detail: stored,

    '── CONTROL: the comparison CAN report a difference ──': '',
    controlShapesWithRounds: controlLive.length,
    controlRenderDiffering: controlLive.filter((r) => !r.renderSame).length,
    controlDiscriminates:
      controlLive.length > 0 && controlLive.every((r) => !r.renderSame),
    controlDetail: control,
  };
} finally {
  for (const t of TARGETS) rmSync(path.join(ROOT, t.to), { force: true });
}

console.log(JSON.stringify(report, null, 2));

const clean = report.resolverDiffering === 0 && report.renderDiffering === 0;
if (!clean) { console.error('\nSTORED SHAPES CHANGED — the gate did not hold.'); process.exit(1); }
if (!report.controlDiscriminates) {
  console.error('\nTHE CONTROL DID NOT DISCRIMINATE — the zero above means nothing.');
  process.exit(1);
}
console.log('\nzero differing over stored shapes, and the control discriminates.');
