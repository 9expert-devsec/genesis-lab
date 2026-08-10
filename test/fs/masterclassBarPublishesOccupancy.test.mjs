import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, scrubSource } from '../sourceScan.mjs';
import {
  bottomInsetAcross,
  setOccupiedBox,
  clearOccupiedBox,
} from '@/lib/viewportBottomInset';

/**
 * The masterclass detail page's sticky bar publishes its occupied box, using
 * the SAME rule as the course bar.
 *
 * ── ONE RULE, TWO CALLERS ───────────────────────────────────────────────────
 * `stickyBarOccupancyHeight` moved to src/lib in this commit precisely so this
 * bar could use it without either copying it or importing across a route
 * boundary from another page's component folder. The rule's behaviour is
 * tested once, in test/pure/stickyBarOccupancy; what is checked HERE is that
 * this second caller really imports it rather than growing its own copy.
 *
 * ── EVERY SOURCE READ GOES THROUGH sourceScan ───────────────────────────────
 * `readSource().code` is comment- and import-stripped; `.withImports` keeps the
 * import statements. Choosing wrong is a silent failure in both directions —
 * an "imports X" guard read from `code` sees no imports at all and passes
 * vacuously, and a "does not CALL X" guard read from `withImports` is satisfied
 * by the import line. Each assertion below says which it uses.
 */

const MC = readSource('src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx');
const REGISTER = readSource(
  'src/app/(public)/masterclass/[slug]/register/_components/MasterclassRegisterClient.jsx'
);

// ── it uses the shared rule, and does not reimplement it ────────────────────

test('the masterclass bar IMPORTS the shared occupancy rule', () => {
  assert.match(
    MC.withImports,
    /import\s*\{[^}]*stickyBarOccupancyHeight[^}]*\}\s*from\s*['"]@\/lib\/stickyBarOccupancy['"]/,
    'it takes the rule from lib rather than from the course page or from a copy'
  );
});

test('it does not carry a second copy of the rule', () => {
  // A local definition would shadow the import and drift the moment either page
  // changed. Read from `code`, so the import line cannot satisfy it.
  assert.equal(
    /function\s+stickyBarOccupancyHeight/.test(MC.code),
    false,
    'no local redefinition'
  );
  // The arithmetic itself, in case someone inlines it under another name.
  assert.equal(
    /cardHeight\s*\+\s*(bottomOffset|offset)\b/.test(MC.code),
    false,
    'and no inlined re-derivation of height + offset'
  );
});

test('CONTROL: those probes fire on a file that DOES reimplement it', () => {
  const copied = scrubSource(
    'function stickyBarOccupancyHeight({ cardHeight, bottomOffset }) {\n' +
      '  return cardHeight + bottomOffset;\n}\n'
  );
  assert.equal(/function\s+stickyBarOccupancyHeight/.test(copied), true);
  assert.equal(/cardHeight\s*\+\s*(bottomOffset|offset)\b/.test(copied), true);
});

// ── the publish wiring ──────────────────────────────────────────────────────

test('it publishes a box and clears it on unmount', () => {
  assert.match(MC.code, /setOccupiedBox\(/, 'it publishes');
  assert.match(
    MC.code,
    /\(\)\s*=>\s*\(\)\s*=>\s*clearOccupiedBox\(/,
    'and an effect whose whole body is the cleanup clears the key on unmount'
  );
  const clears = MC.code.match(/clearOccupiedBox\(/g) || [];
  assert.equal(clears.length, 1, 'exactly one clear — the teardown one');
});

test('THE HOLE 9b7f7cd FOUND: it publishes the span it MEASURED', () => {
  // In 9b7f7cd, replacing the measured edges with `left: 0, right: 99999`
  // passed the entire suite: the measuring code still existed and the guards
  // still saw rect.left/rect.right, but nothing checked that the measurement
  // was what got published. Closed here for this publisher too.
  assert.match(
    MC.code,
    /setOccupiedBox\(\s*barKey\s*,\s*\{[^}]*\bcardLeft\b[^}]*\bcardRight\b[^}]*\}/,
    'the box handed to the store carries the measured cardLeft/cardRight'
  );
});

test('CONTROL: that probe rejects a hardcoded span', () => {
  const probe = /setOccupiedBox\(\s*barKey\s*,\s*\{[^}]*\bcardLeft\b[^}]*\bcardRight\b[^}]*\}/;
  const literal = scrubSource('setOccupiedBox(barKey, { height: h, left: 0, right: 99999 });');
  assert.equal(probe.test(literal), false, 'a full-width literal does not satisfy it');
  const measured = scrubSource(
    'setOccupiedBox(barKey, { height: h, left: metrics.cardLeft, right: metrics.cardRight });'
  );
  assert.equal(probe.test(measured), true, 'and the measured form does');
});

test('the height is a layout read; only the horizontal edges come from a rect', () => {
  assert.match(MC.code, /\.offsetHeight\b/, 'height comes from offsetHeight');
  assert.match(MC.code, /getComputedStyle\(/, 'the bottom offset comes from the computed style');
  // The hide transition is translate-y, purely vertical: a rect's horizontal
  // edges hold still through it while its vertical ones report a position in
  // flight. So the negative is scoped to the vertical fields, not to rects.
  for (const forbidden of [
    /getBoundingClientRect\(\)\s*\.\s*height/,
    /\brect\s*\.\s*height\b/,
  ]) {
    assert.equal(
      forbidden.test(MC.code),
      false,
      `${forbidden} would chase the bar for the 300ms the slide lasts`
    );
  }
  assert.match(MC.code, /\brect\s*\.\s*left\b/, 'the horizontal edges do come from the rect');
  assert.match(MC.code, /\brect\s*\.\s*right\b/, 'both of them');
});

// ── the OTHER fixed bottom bars must stay non-publishers ────────────────────

test('the masterclass REGISTER bar does not publish — it is served by the static lift', () => {
  // /masterclass/[slug]/register is the one path dockLiftsForBottomBar fires
  // on, so that page's own bar is already accounted for by a hardcoded
  // bottom-24. A publisher on top of that lift would make the dock
  // DOUBLE-COUNT and float roughly 200px off the bottom.
  assert.equal(
    /viewportBottomInset|setOccupiedBox|stickyBarOccupancy/.test(REGISTER.withImports),
    false,
    'it imports neither the store nor the rule'
  );
});

test('CONTROL: that probe DOES detect a publisher import', () => {
  const publishing = scrubSource(
    "import { setOccupiedBox } from '@/lib/viewportBottomInset';",
    { stripImports: false }
  );
  assert.equal(/viewportBottomInset|setOccupiedBox/.test(publishing), true);
});

// ── the two bars separate from the dock at DIFFERENT widths ─────────────────
// This is why no threshold is written down anywhere. Each bar's is a
// consequence of its own alignment, re-derived from the geometry each page
// declares — the course bar is left-aligned in a 1200px box, this one is
// centred from md up.

const DOCK_W = 44; // h-11 w-11
const DOCK_RIGHT_GAP = 16; // right-4
const dockColumn = (vw) => ({ left: vw - DOCK_RIGHT_GAP - DOCK_W, right: vw - DOCK_RIGHT_GAP });

// mx-auto max-w-[900px] from md up; mx-2 below it.
const masterclassCardEdges = (vw) => {
  if (vw >= 768) {
    const w = Math.min(900, vw);
    return { left: (vw - w) / 2, right: (vw - w) / 2 + w };
  }
  const w = Math.min(900, vw - 16);
  return { left: 8, right: 8 + w };
};

// max-w-[860px] px-4, left-aligned inside mx-auto max-w-[1200px] justify-start.
const courseCardEdges = (vw) => ({ left: 16, right: Math.min(860, vw) - 16 });

/** First viewport width at which this bar and the dock no longer intersect. */
function separationWidth(edgesAt) {
  for (let vw = 320; vw <= 2400; vw += 1) {
    const bar = edgesAt(vw);
    const dock = dockColumn(vw);
    if (!(bar.left < dock.right && bar.right > dock.left)) return vw;
  }
  return null;
}

describe('masterclass bar occupancy, in its own lane', { concurrency: 1 }, () => {
  // ── THIS FILE'S PRIVATE LANE ──────────────────────────────────────────────
  // test/pure/viewportBottomInset (lane 0) and
  // test/render/floatingDockClearance (lane 1_000_000) also write to this
  // store, and run.mjs uses `isolation: 'none', concurrency: true`, so all
  // three share one process and interleave. Occupancy is spatial, so isolation
  // can be too: this file claims its own stretch of the imaginary viewport,
  // namespaces its keys, and asserts only about its own lane. Without that,
  // "is the store empty" is a question about other files' work.
  const LANE = 2_000_000;
  const LANE_END = LANE + 5_000;
  const k = (name) => `mc:${name}`;

  afterEach(() => {
    clearOccupiedBox(k('bar'));
  });

  test('the two bars separate from the dock at DIFFERENT widths', () => {
    const mc = separationWidth(masterclassCardEdges);
    const course = separationWidth(courseCardEdges);
    assert.ok(mc && course, 'both thresholds are derivable');
    assert.notEqual(
      mc,
      course,
      'a single hardcoded breakpoint could not serve both — which is why the ' +
        'clearance is a runtime query and no threshold is encoded anywhere'
    );
    // The masterclass bar is centred, so it reaches further right and stays in
    // the dock's way longer.
    assert.ok(mc > course, 'the centred bar separates later than the left-aligned one');
  });

  test('above its own separation width the dock column is clear; below it, occupied', () => {
    const separates = separationWidth(masterclassCardEdges);

    const wide = separates;
    const wideBar = masterclassCardEdges(wide);
    const wideDock = dockColumn(wide);
    setOccupiedBox(k('bar'), {
      height: 120,
      left: LANE + wideBar.left,
      right: LANE + wideBar.right,
    });
    assert.equal(
      bottomInsetAcross(LANE + wideDock.left, LANE + wideDock.right),
      0,
      `at ${wide}px the bar and the dock do not meet, so the dock must not move`
    );

    // CONTROL: one pixel narrower, the same box in the same store DOES occupy
    // the dock's column. Only the width differs between the two halves.
    const narrow = separates - 1;
    const narrowBar = masterclassCardEdges(narrow);
    const narrowDock = dockColumn(narrow);
    setOccupiedBox(k('bar'), {
      height: 120,
      left: LANE + narrowBar.left,
      right: LANE + narrowBar.right,
    });
    assert.equal(
      bottomInsetAcross(LANE + narrowDock.left, LANE + narrowDock.right),
      120,
      `at ${narrow}px they overlap, so the dock must clear the bar`
    );
  });

  test('this file leaves its lane EMPTY for everything that runs after it', () => {
    assert.equal(bottomInsetAcross(LANE, LANE_END), 0, 'no box from this file survives');
  });
});
