import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { FROZEN_COLUMNS, MIN_TRACK_WIDTH } from '@/lib/schedule/scheduleTableLayout';

/**
 * THE FROZEN COLUMN WIDTHS ARE DECLARED ONCE.
 *
 * Before this change each of the four widths appeared roughly a dozen times
 * across ScheduleClient.jsx — in the `<colgroup>`, then again as `w-[120px]
 * min-w-[120px] max-w-[120px]` triples and as cumulative `left-[480px]`
 * offsets, on BOTH the `<th>` row and the `<td>` row. Nothing made them agree.
 *
 * WHY A SOURCE SCAN AND NOT A RENDER TEST: jsdom does no layout, so nothing in
 * this repo can measure a column and notice that one of them sheared. And the
 * shear is invisible until the user SCROLLS — a sticky column with a stale
 * `left` sits in the right place at scrollLeft 0 and slides under its neighbour
 * afterwards. The only thing that can be checked mechanically is that the
 * number exists in one place, so that is what is checked.
 *
 * Read through test/sourceScan.mjs, so the prose in these files explaining the
 * old widths cannot satisfy a matcher and CRLF is normalised before matching.
 */

const CLIENT = readSource('src/app/(public)/schedule/_components/ScheduleClient.jsx');
const LAYOUT = readSource('src/lib/schedule/scheduleTableLayout.js');

/**
 * Every occurrence of `n` as a standalone pixel quantity in scrubbed code —
 * both the bare `width: 120` form and the Tailwind `w-[120px]` form, since a
 * width re-declared as an arbitrary class is exactly as much of a second
 * declaration as one re-declared as a number.
 *
 * The lookaround is the whole matcher. Without it:
 *   · `360` reports a hit for 60, and `1200` for 120 — the widths would look
 *     duplicated everywhere and the sweep would be red for the wrong reason;
 *   · `text-9e-slate-dp-400/60` (a Tailwind OPACITY suffix, which really is in
 *     this component) reports a hit for 60. Hence `/` in the exclusion set.
 */
const countLiteral = (code, n) =>
  (code.match(new RegExp(String.raw`(?<![\w./-])${n}(?:px)?(?![\w.])`, 'g')) ?? []).length;

/**
 * The `FROZEN_COLUMNS = [...]` array literal, as text.
 *
 * The count is scoped to the ARRAY rather than to the whole module, and that
 * narrowing was forced by a real collision rather than chosen for comfort:
 * `MIN_TRACK_WIDTH` is also 120, the same number as the รหัสหลักสูตร column.
 * Two unrelated concepts that happen to share a value — the ADMIN_SCHEDULE_MONTHS
 * lesson exactly — and a whole-file count reported the width as declared twice.
 * Scoping keeps the claim the guard actually makes ("each frozen width is
 * written once") instead of the one it accidentally made ("this number is
 * unique in the file"). The next test pins the coincidence so it stays a
 * coincidence.
 */
const FROZEN_ARRAY = (() => {
  const m = LAYOUT.code.match(/const\s+FROZEN_COLUMNS\s*=\s*\[([\s\S]*?)\]\s*;/);
  assert.ok(m, 'FROZEN_COLUMNS array not found — this guard has lost its subject');
  return m[1];
})();

test('each frozen width is written exactly once, in the FROZEN_COLUMNS array', () => {
  for (const { key, width } of FROZEN_COLUMNS) {
    assert.equal(
      countLiteral(FROZEN_ARRAY, width),
      1,
      `${key}: width ${width} must appear exactly once in the array literal`,
    );
  }
  // …and nowhere else in the module except the one documented collision.
  const outside = LAYOUT.code.replace(FROZEN_ARRAY, '');
  for (const { key, width } of FROZEN_COLUMNS) {
    const extra = countLiteral(outside, width);
    const allowed = width === 120 ? 1 : 0; // MIN_TRACK_WIDTH — see below
    assert.equal(extra, allowed, `${key}: ${width} re-declared outside the array`);
  }
});

test('MIN_TRACK_WIDTH sharing 120 with the code column is a COINCIDENCE', () => {
  /**
   * Written down so it stays one. The two numbers are equal today and answer
   * unrelated questions — one is a table column, the other the narrowest a
   * scrollbar track may become — so neither may be derived from the other, and
   * changing one must not move the other. Same rule adminScheduleHorizon.js
   * states about its own horizon and the date-picker's.
   *
   * If this goes red because they diverged, that is CORRECT and the allowance
   * in the test above is what needs updating.
   */
  assert.equal(MIN_TRACK_WIDTH, 120);
  assert.equal(FROZEN_COLUMNS.find((c) => c.key === 'code').width, 120);
  assert.equal(
    /MIN_TRACK_WIDTH\s*=\s*\d+/.test(LAYOUT.code),
    true,
    'MIN_TRACK_WIDTH is its own literal, not FROZEN_COLUMNS[0].width',
  );
  assert.equal(
    /MIN_TRACK_WIDTH\s*=\s*FROZEN/.test(LAYOUT.code),
    false,
    'and it must never be derived from a column width',
  );
});

test('ScheduleClient contains none of the frozen widths as a literal', () => {
  // The component renders them; it must not know them. Includes the derived
  // offsets 480 and 540, which were the ones most likely to be edited last and
  // therefore most likely to be missed.
  for (const n of [120, 360, 60, 100, 480, 540, 640, 90, 900]) {
    assert.equal(
      countLiteral(CLIENT.code, n),
      0,
      `${n} is still hardcoded in ScheduleClient.jsx — derive it from FROZEN_COLUMNS`,
    );
  }
});

test('the old fixed table floor and dead month widths are gone', () => {
  for (const dead of ['min-w-[900px]', 'min-w-[90px]', 'max-w-[360px]', 'w-[120px]']) {
    assert.equal(
      CLIENT.code.includes(dead),
      false,
      `${dead} survives — it stopped describing anything when the month count became variable`,
    );
  }
});

test('no arbitrary left-[…] class is written anywhere in the component', () => {
  /**
   * The Tailwind trap, guarded at the source rather than only in the render.
   * Arbitrary values must be STATIC strings at build time — the compiler scans
   * text and never evaluates it — so `left-[${offset}px]` emits no class at all
   * and fails silently as an unstuck column. A render test catches the computed
   * form; only a source scan catches someone re-adding a static one.
   */
  assert.equal(/left-\[/.test(CLIENT.code), false, 'sticky offsets must be inline styles');
});

test('ScheduleClient imports the geometry rather than re-deriving it', () => {
  for (const symbol of ['frozenLayout', 'scrollTrackInset', 'tableMinWidth']) {
    assert.match(
      CLIENT.withImports,
      new RegExp(String.raw`import\s*\{[\s\S]*?${symbol}[\s\S]*?\}\s*from\s*"@/lib/schedule/scheduleTableLayout"`),
      `${symbol} must come from the layout module`,
    );
  }
});

test('the scrollbar track is inset from the module, never from a literal 640', () => {
  /**
   * The whole point of the inset seam. `FROZEN_TOTAL` is derived from the
   * column array, so a written-out 640 is a fourth copy of a number that
   * already has three consumers — and it would go stale the moment a column
   * width changed, leaving the track pointing at the wrong place with nothing
   * to report it. The zero-literals sweep above already covers 640; this pins
   * that the track actually calls the helper.
   */
  assert.match(CLIENT.code, /scrollTrackInset\(\s*clientWidth\s*\)/,
    'measure() must derive the inset from the container it just measured');
  assert.match(CLIENT.code, /marginLeft:\s*trackInset/,
    'and the track element must consume it');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: countLiteral DOES find a second declaration', () => {
  /**
   * Without this the sweep is vacuous — a matcher that can never fire reports
   * "declared once" forever. Run against injected text in each of the three
   * shapes the old markup actually used.
   */
  assert.equal(countLiteral('const a = { width: 120 };', 120), 1);
  assert.equal(countLiteral('{ width: 120 } <col style={{ width: 120 }} />', 120), 2);
  assert.equal(countLiteral('className="sticky left-[120px] w-[120px]"', 120), 2);
  assert.equal(
    countLiteral('<col style={{ width: 120 }} /> <th className="left-[480px]">', 480),
    1,
    'and it distinguishes one width from another',
  );
});

test('CONTROL: countLiteral does NOT fire on a number that merely contains it', () => {
  // The traps this matcher was written around, each one a real string from this
  // component or its neighbours.
  assert.equal(countLiteral('width: 360', 60), 0, '60 is inside 360');
  assert.equal(countLiteral('z-1200 gap-1200', 120), 0, 'not the head of a longer number');
  assert.equal(
    countLiteral('text-9e-slate-dp-400/60 dark:text-9e-slate-lt-400/60', 60),
    0,
    'a Tailwind opacity suffix is not a width — this string IS in ScheduleClient',
  );
  assert.equal(countLiteral('const n = 60;', 60), 1, '…but a real one still counts');
  assert.equal(countLiteral('style={{ width: 60 }}', 60), 1);
});

test('CONTROL: the layout module really is what was read', () => {
  // A wrong path or a failed scrub returns '' and every "exactly once" and
  // "exactly zero" assertion above passes together, which is the worst possible
  // combination. Anchored on symbols only that file has.
  assert.match(LAYOUT.code, /export const FROZEN_COLUMNS/);
  assert.match(LAYOUT.code, /export function frozenOffsets/);
  assert.ok(CLIENT.code.length > 5000, 'the component was actually read');
  assert.match(CLIENT.code, /function ProgramTable/);
});
