import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 72 — THE ONE FACT docs/mobile-padding.md's BUILD SEQUENCE RESTS ON.
 *
 * ══ READ THIS BEFORE YOU MAKE IT GREEN AGAIN ════════════════════════════════
 * SELF-RETIRING. Step 2 of that document's sequence changes exactly this class,
 * and when it does this assertion fails. The correct response is to DELETE this
 * file together with the Tests section of the document — never to update the
 * expectation so it agrees with the new code. A tripwire edited to match
 * whatever it finds is not a tripwire; it is a second copy of the source.
 *
 * ══ WHAT IT GUARDS, AND WHY IT IS THE ONLY ASSERTION THE SURVEY ADDS ════════
 * The survey measured, in headless Chrome at 390px, that a leaf section loses
 * 32px at top level, 64px inside one container, 176px in the author's real
 * three-level case and 208px at the depth cap. Every one of those numbers is
 * the SAME 16px-per-side padding counted once per nesting level, because every
 * section — nested ones included — renders through SectionRenderer's wrapper.
 *
 * The whole sequence therefore rests on that padding being the SINGLE source of
 * the compounding. If a second horizontal padding appears on the render path,
 * or if this one moves, step 2 stops being sufficient and the document's table
 * becomes wrong with nothing connecting the two. That is what this connects.
 *
 * It deliberately does NOT pin the measured pixel table (that belongs in step
 * 1's browser tier, where it can be measured rather than inferred) and does NOT
 * pin the dead-control finding in §C (pinning a defect that step 3 exists to
 * fix would obstruct the fix).
 */

const REL = 'src/components/pageBuilder/SectionRenderer.jsx';

/**
 * The scan is scoped to SectionRenderer's OWN body, and the exclusion is
 * measured rather than assumed. The file also defines `EmptyInEditor`, whose
 * `px-3` and `px-1.5` are the canvas's "ว่าง" marker chrome — it is rendered
 * only when `path != null`, so it never reaches a published page and is not on
 * the compounding chain the survey measured. Scoping it out is what makes the
 * exact-set assertion meaningful instead of a list of three unrelated numbers;
 * the test below it proves the exclusion is really editor-only.
 */
const rendererBody = (code) => code.slice(code.indexOf('export function SectionRenderer'));

const HORIZ = /(?<![\w-])(px-\d+(?:\.\d+)?|pl-\d+(?:\.\d+)?|pr-\d+(?:\.\d+)?|px-\[[^\]]+\])(?![\w-])/g;
const horizontalIn = (s) => [...s.matchAll(HORIZ)].map((m) => m[1]);

test('SectionRenderer declares exactly ONE horizontal padding, and it is px-4', () => {
  /**
   * Source is read COMMENT-STRIPPED. This round adds a document that spells
   * `px-4` out in prose and the component's own header may yet quote it; a raw
   * text scan would count those and fail against a perfectly correct file —
   * defect 1/2 in sourceScan.mjs's header, arriving from the direction where
   * the documentation creates the trap.
   */
  const { code } = readSource(REL);

  assert.deepEqual(horizontalIn(rendererBody(code)), ['px-4'],
    'SectionRenderer\'s horizontal padding moved or gained a sibling. docs/mobile-padding.md '
    + '§A row 3 and §D name this class as the SINGLE source of the per-level compounding, and '
    + '§B\'s measured table (32 / 64 / 176 / 208px consumed) is arithmetic on it. If step 2 of '
    + 'that document\'s sequence has landed, DELETE this file and the Tests section it belongs '
    + 'to. If it has not, a second horizontal padding has appeared and the survey is stale.');
});

test('the padding excluded from that scan really is editor-only', () => {
  /**
   * Otherwise the scope above is a loophole: a padding moved a few lines up
   * would leave the exact-set assertion green while the published page changed.
   * EmptyInEditor is the only thing before SectionRenderer that carries one, and
   * it is reachable ONLY through the canvas's non-null `path`.
   */
  const { code } = readSource(REL);
  const beforeBody = code.slice(0, code.indexOf('export function SectionRenderer'));

  assert.deepEqual(horizontalIn(beforeBody), ['px-3', 'px-1.5'],
    'something other than the ว่าง marker now carries a horizontal padding above SectionRenderer '
    + '— check whether it is on the published render path before trusting the scope above');
  assert.match(code, /path != null && sectionRendersEmpty\(section\) && <EmptyInEditor/,
    'the ว่าง marker is no longer gated on a non-null path, so its padding may now reach a '
    + 'published page and the exclusion above is no longer safe');
});

test('CONTROL: the scan can SEE a horizontal padding, and ignores vertical ones', () => {
  /**
   * Without this, the exact-set assertion above passes just as well on a regex
   * that matches nothing at all — which is the failure mode that makes a
   * source-scan guard worthless.
   */
  const seen = horizontalIn; // the SAME scanner the assertions above use

  assert.deepEqual(seen('a px-4 b'), ['px-4'], 'the scan cannot see a plain px-*');
  assert.deepEqual(seen('pl-6 pr-2'), ['pl-6', 'pr-2'], 'the scan cannot see one-sided padding');
  assert.deepEqual(seen('px-[13px]'), ['px-[13px]'], 'the scan cannot see an arbitrary value');
  // Vertical padding and the spacing presets must NOT be counted — those are
  // round 71's and the envelope's business, not this survey's.
  assert.deepEqual(seen('pt-8 pb-16 py-4'), [], 'the scan counted a vertical padding');
  // …and a class that merely CONTAINS the token is not a match.
  assert.deepEqual(seen('lg:px-4-ish max-px-4x'), [], 'the scan matched inside another token');
  assert.deepEqual(seen('nothing here'), []);
});

test('the wrapper that carries it is still the one every section passes through', () => {
  // The compounding is not the class alone — it is the class on an element that
  // renders once per nesting level. If that stops being true the arithmetic
  // changes even with px-4 untouched.
  const { code } = readSource(REL);
  assert.match(code, /className=\{cn\('mx-auto px-4'/,
    'the container div is no longer assembled as `cn(\'mx-auto px-4\', …)` — check whether it is '
    + 'still rendered once per section before trusting docs/mobile-padding.md §B');
  assert.match(code, /<SectionRenderer\s/,
    'SectionRenderer no longer recurses into itself, so "once per nesting level" needs re-measuring');
});
