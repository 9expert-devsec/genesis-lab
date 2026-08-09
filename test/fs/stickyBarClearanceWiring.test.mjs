import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, scrubSource } from '../sourceScan.mjs';

/**
 * The parts of the clearance wiring that are NOT decidable as a pure function:
 * where the hooks sit, that teardown really clears, and how the two numbers are
 * measured. The rule itself is tested once, for both bars, in
 * test/pure/stickyBarOccupancy.
 *
 * ── EVERY READ HERE GOES THROUGH sourceScan ─────────────────────────────────
 * `readSource().code` is comment-stripped and import-stripped, and both matter
 * for this file specifically:
 *   · CourseStickyCTA's docstrings legitimately DISCUSS getBoundingClientRect
 *     and the rect-vs-measurement decision. A raw-text negative would read that
 *     prose as the defect and go red on correct code — the wrong turn recorded
 *     in the heroBannerPointerCapture guard, where the fix was to delete words
 *     from a docstring rather than to fix the matcher.
 *   · with imports stripped, `setOccupiedBox` appears exactly once, at
 *     its call site, so the ordering check below cannot be satisfied by the
 *     import line (defect 5 in sourceScan's own header).
 * The last test proves the stripping actually happens rather than assuming it.
 */

const BAR = readSource('src/app/(public)/[...slug]/_components/CourseStickyCTA.jsx');

// The dock is read again — not to compare a shared constant, which is the
// coupling that got the old gap guard deleted, but because the dock has a
// measurement scope of its own that only source can express. Nothing here
// compares a value in one file against a value in the other.
const DOCK = readSource('src/components/ui/FloatingActionDock.jsx');

// The early return that makes hook placement load-bearing.
const EARLY_RETURN = /if\s*\(barDismissed\)\s*return null/;

// ── TRAP 1: hook order ──────────────────────────────────────────────────────

test('every clearance hook sits ABOVE the barDismissed early return', () => {
  const cut = BAR.code.search(EARLY_RETURN);
  assert.ok(cut > -1, 'the early return is still there — this guard is about its position');

  for (const [label, needle] of [
    ['useId (the publisher key)', 'useId('],
    ['the measuring effect', 'offsetHeight'],
    ['the publish effect', 'setOccupiedBox('],
    ['the teardown effect', 'clearOccupiedBox('],
  ]) {
    const at = BAR.code.indexOf(needle);
    assert.ok(at > -1, `${label} is present`);
    assert.ok(
      at < cut,
      `${label} must precede \`if (barDismissed) return null\` — a hook below it is ` +
        'a conditional hook, and React throws the moment someone presses X'
    );
  }
});

test('CONTROL: the ordering comparison detects a hook on the wrong side', () => {
  // Same two probes, fired at a source where the publish really is below the
  // early return. Without this the `at < cut` assertions could be passing
  // because one of the needles is simply absent.
  const bad = scrubSource(
    'function C(){\n' +
      '  if (barDismissed) return null;\n' +
      '  useEffect(() => { setOccupiedBox(k, n); });\n' +
      '}\n'
  );
  assert.ok(bad.indexOf('setOccupiedBox(') > bad.search(EARLY_RETURN));
});

// ── TRAP 2: unmount must reset ──────────────────────────────────────────────

test('teardown clears the key, in a cleanup that only runs on unmount', () => {
  // `useEffect(() => () => clear(...), [key])` — an effect whose entire body is
  // the cleanup. Route changes unmount this component; if the key survives, the
  // dock stays lifted on every page visited afterwards.
  assert.match(
    BAR.code,
    /\(\)\s*=>\s*\(\)\s*=>\s*clearOccupiedBox\(/,
    'the teardown effect returns a cleanup that clears the key'
  );
});

test('the publish effect does NOT clear on its own cleanup', () => {
  // Clearing there would drop the store to 0 between two non-zero values, so a
  // resize would animate the dock down and back up. Asserted by shape: the only
  // clear in the file is the teardown arrow matched above.
  const clears = BAR.code.match(/clearOccupiedBox\(/g) || [];
  assert.equal(clears.length, 1, 'exactly one clear call — the teardown one');
});

test('CONTROL: the teardown probe fails when the cleanup is missing', () => {
  const noTeardown = scrubSource('useEffect(() => { setOccupiedBox(k, n); }, [n]);');
  assert.equal(
    /\(\)\s*=>\s*\(\)\s*=>\s*clearOccupiedBox\(/.test(noTeardown),
    false,
    'a publish-only component does not satisfy the teardown assertion'
  );
});

// ── TRAP 3: measured, not read from a rect mid-transition ───────────────────

test('the HEIGHT is a layout measurement; only the horizontal edges come from a rect', () => {
  assert.match(BAR.code, /\.offsetHeight\b/, 'height comes from offsetHeight');
  // The card's rect IS read now, for left and right, and that is safe for the
  // very reason it is unsafe for the height: the hide transition is
  // `translate-y`, purely vertical, so a rect's horizontal edges sit still
  // through it while its vertical ones report a position in flight. So the
  // negative is scoped to the VERTICAL fields rather than banning rects.
  for (const forbidden of [
    /getBoundingClientRect\(\)\s*\.\s*height/,
    /\brect\s*\.\s*height\b/,
    /\brect\s*\.\s*top\b/,
    /\brect\s*\.\s*bottom\b/,
  ]) {
    assert.equal(
      forbidden.test(BAR.code),
      false,
      `the occupancy height must not come from ${forbidden} — it would chase the ` +
        'bar down the screen for the 300ms the slide lasts'
    );
  }
  assert.match(BAR.code, /\brect\s*\.\s*left\b/, 'the horizontal edges do come from the rect');
  assert.match(BAR.code, /\brect\s*\.\s*right\b/, 'both of them');
});

test('the bar\'s own bottom offset is read from the DOM, not hardcoded', () => {
  assert.match(BAR.code, /getComputedStyle\(/, 'the offset comes from the computed style');
  // Which means no breakpoint arithmetic in JS: the responsive bottom-2/
  // md:bottom-6 pair stays declared once, in the className this file already
  // writes, instead of being restated as a media query here.
  assert.equal(
    /matchMedia/.test(BAR.code),
    false,
    'no JS breakpoint — the offset is whatever the class resolved to'
  );
});

test('CONTROL: the vertical-rect probes fire on a height taken from a rect', () => {
  const direct = scrubSource('const h = card.getBoundingClientRect().height;');
  assert.equal(/getBoundingClientRect\(\)\s*\.\s*height/.test(direct), true);

  const viaLocal = scrubSource('const rect = card.getBoundingClientRect();\nconst h = rect.height;');
  assert.equal(/\brect\s*\.\s*height\b/.test(viaLocal), true, 'and via a local too');

  // ...while the horizontal read the component actually performs does NOT trip
  // them, or the guard would forbid the safe case along with the unsafe one.
  const horizontalOnly = scrubSource(
    'const rect = card.getBoundingClientRect();\nsetSpan({ left: rect.left, right: rect.right });'
  );
  for (const forbidden of [
    /getBoundingClientRect\(\)\s*\.\s*height/,
    /\brect\s*\.\s*height\b/,
    /\brect\s*\.\s*top\b/,
    /\brect\s*\.\s*bottom\b/,
  ]) {
    assert.equal(forbidden.test(horizontalOnly), false, `${forbidden} tolerates the safe read`);
  }
});

// The dock's gap-3 rhythm was pinned here while the bar published a gap term
// sourced from it. That term is gone — the bar publishes occupancy and the dock
// owns spacing — so the claim this guard made no longer exists, and the guard
// is deleted rather than kept. A guard whose subject has been removed still
// passes, still appears in the count, and reads as coverage of something
// nobody is checking any more; the dock is free to change its own rhythm now,
// and nothing here should imply otherwise.

// ── the published span is the MEASURED one ──────────────────────────────────

test('the bar publishes the span it measured, not a literal', () => {
  // Found by mutation: replacing the two measured edges with `left: 0,
  // right: 99999` — which is the old width-blind behaviour restated — passed
  // every other test in the suite. The measuring code still existed and the
  // guards above still saw `rect.left`/`rect.right`; nothing checked that the
  // measurement was the thing being PUBLISHED.
  assert.match(
    BAR.code,
    /setOccupiedBox\(\s*barKey\s*,\s*\{[^}]*\bcardLeft\b[^}]*\bcardRight\b[^}]*\}/,
    'the box handed to the store carries the measured cardLeft/cardRight'
  );
});

test('CONTROL: that probe rejects a hardcoded span', () => {
  const literal = scrubSource(
    'setOccupiedBox(barKey, { height: h, left: 0, right: 99999 });'
  );
  assert.equal(
    /setOccupiedBox\(\s*barKey\s*,\s*\{[^}]*\bcardLeft\b[^}]*\bcardRight\b[^}]*\}/.test(literal),
    false,
    'a full-width literal does not satisfy it'
  );

  const measured = scrubSource(
    'setOccupiedBox(barKey, { height: h, left: metrics.cardLeft, right: metrics.cardRight });'
  );
  assert.equal(
    /setOccupiedBox\(\s*barKey\s*,\s*\{[^}]*\bcardLeft\b[^}]*\bcardRight\b[^}]*\}/.test(measured),
    true,
    'and the measured form does'
  );
});

// ── THE FEEDBACK LOOP: the dock measures its WIDTH and nothing else ─────────

test('the dock never measures its own height', () => {
  // This is a loop, not a tidiness rule. The query's answer becomes the dock's
  // padding-bottom; padding changes its height; the ResizeObserver fires on
  // that height; and a height measurement would feed the output straight back
  // into the input. Left and right are unaffected by padding-bottom, so the
  // loop has no path to close — which is only true for as long as nobody adds
  // a vertical read here.
  for (const forbidden of [
    /\boffsetHeight\b/,
    /\brect\s*\.\s*height\b/,
    /\brect\s*\.\s*top\b/,
    /\brect\s*\.\s*bottom\b/,
    /getBoundingClientRect\(\)\s*\.\s*height/,
  ]) {
    assert.equal(
      forbidden.test(DOCK.code),
      false,
      `${forbidden} would close the padding -> height -> observe -> padding loop`
    );
  }
  assert.match(DOCK.code, /\brect\s*\.\s*left\b/, 'it does read left');
  assert.match(DOCK.code, /\brect\s*\.\s*right\b/, 'and right');
});

test('CONTROL: those probes fire on a measurement that reads the height', () => {
  const vertical = scrubSource(
    'const rect = el.getBoundingClientRect();\nsetSize({ h: rect.height });'
  );
  assert.equal(/\brect\s*\.\s*height\b/.test(vertical), true);

  // ...and the dock's real horizontal read does not trip them, or the guard
  // would forbid the safe case along with the unsafe one.
  const horizontal = scrubSource(
    'const rect = el.getBoundingClientRect();\nsetSpan({ left: rect.left, right: rect.right });'
  );
  assert.equal(/\brect\s*\.\s*height\b/.test(horizontal), false);
  assert.equal(/\boffsetHeight\b/.test(horizontal), false);
});

test('the dock observes with a ResizeObserver, not a bare window resize', () => {
  // A window listener cannot see the chat launcher expanding into a capsule on
  // hover, which grows the dock LEFTWARD and genuinely changes the answer at
  // the band of widths where a bar's right edge falls between the collapsed and
  // expanded left edges. `window.addEventListener('resize', ...)` survives only
  // as the no-ResizeObserver fallback.
  assert.match(DOCK.code, /new ResizeObserver\(/, 'the dock observes itself');
  assert.match(
    DOCK.code,
    /typeof ResizeObserver === ['"]undefined['"]/,
    'with an explicit fallback rather than an assumption of support'
  );
});

// ── the scanner itself ──────────────────────────────────────────────────────

test('CONTROL: the scan really strips the prose these guards would trip over', () => {
  // CourseStickyCTA's docstrings discuss getBoundingClientRect on purpose. If
  // the reader stopped stripping comments, the negative in the trap-3 test
  // would go red against correct code and the honest-looking fix would be to
  // delete the explanation. Proven here instead.
  assert.ok(
    /getBoundingClientRect/.test(BAR.raw),
    'the raw file really does mention it in prose — otherwise this control is empty'
  );
  const commentOnly = scrubSource('// const h = card.getBoundingClientRect();\n');
  assert.equal(
    /\bcard\.getBoundingClientRect/.test(commentOnly),
    false,
    'a commented-out rect read is not code'
  );
});
