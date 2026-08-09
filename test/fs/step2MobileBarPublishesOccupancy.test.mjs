import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, scrubSource } from '../sourceScan.mjs';
import { dockLiftsForBottomBar } from '@/lib/floatingDock';
import {
  bottomInsetAcross,
  setOccupiedBox,
  clearOccupiedBox,
} from '@/lib/viewportBottomInset';

/**
 * Step2MobileBar — the THIRD page-owned fixed bottom bar, and the last one the
 * floating dock did not know about.
 *
 * ── WHAT WAS BROKEN ─────────────────────────────────────────────────────────
 * It is `fixed inset-x-0 bottom-0 z-30 lg:hidden`: full-width, so it always
 * shares the dock's column, and BELOW the dock's z-50, so the dock sat on its
 * controls for every mobile session on step 2. Neither mechanism covered it —
 * dockLiftsForBottomBar does not match /registration/*, and nothing published.
 *
 * ── THE TWO CALLERS ARE NOT SYMMETRICAL, AND THAT IS THE TRAP ───────────────
 * The same component is rendered from /registration/* (no static lift → must
 * publish) and from /masterclass/[slug]/register (static lift already fires →
 * must NOT publish, or the dock double-counts). Publishing is therefore
 * opt-in, and both halves of that are asserted below with controls: the
 * enabling caller enables it, and the lifted caller does not.
 *
 * ── EVERY SOURCE READ GOES THROUGH sourceScan ───────────────────────────────
 * `.code` is comment- and import-stripped, `.withImports` keeps imports.
 * Choosing wrong fails silently in both directions — an "imports X" guard read
 * from `code` sees no imports and passes vacuously; a "does not CALL X" guard
 * read from `withImports` is satisfied by the import line alone. Each
 * assertion says which it uses. It matters concretely here: these files
 * discuss double-counting and publishing in prose.
 */

const BAR = readSource('src/components/payment/Step2MobileBar.jsx');
const REVIEW = readSource('src/components/registration/ReviewAndPayStep.jsx');
const MC_REGISTER = readSource(
  'src/app/(public)/masterclass/[slug]/register/_components/MasterclassRegisterClient.jsx'
);
const DOCK_RULES = readSource('src/lib/floatingDock.js');

// ── it uses the shared rule, and does not grow a third copy ─────────────────

test('the bar IMPORTS the shared occupancy rule', () => {
  assert.match(
    BAR.withImports,
    /import\s*\{[^}]*stickyBarOccupancyHeight[^}]*\}\s*from\s*['"]@\/lib\/stickyBarOccupancy['"]/,
    'the third caller takes the rule from lib, like the other two'
  );
});

test('it does not carry a third copy of the rule', () => {
  // Read from `code`, so the import line cannot satisfy it.
  assert.equal(
    /function\s+stickyBarOccupancyHeight/.test(BAR.code),
    false,
    'no local redefinition'
  );
  assert.equal(
    /(barHeight|cardHeight)\s*\+\s*(bottomOffset|offset)\b/.test(BAR.code),
    false,
    'and no inlined re-derivation of height + offset'
  );
});

test('CONTROL: those probes fire on a file that DOES reimplement it', () => {
  const copied = scrubSource(
    'function stickyBarOccupancyHeight({ barHeight, bottomOffset }) {\n' +
      '  return barHeight + bottomOffset;\n}\n'
  );
  assert.equal(/function\s+stickyBarOccupancyHeight/.test(copied), true);
  assert.equal(/(barHeight|cardHeight)\s*\+\s*(bottomOffset|offset)\b/.test(copied), true);
});

// ── the publish wiring ──────────────────────────────────────────────────────

test('it publishes a box and clears it on unmount', () => {
  assert.match(BAR.code, /setOccupiedBox\(/, 'it publishes');
  assert.match(
    BAR.code,
    /\(\)\s*=>\s*\(\)\s*=>\s*clearOccupiedBox\(/,
    'an effect whose whole body is the cleanup clears the key on unmount'
  );
  const clears = BAR.code.match(/clearOccupiedBox\(/g) || [];
  assert.equal(clears.length, 1, 'exactly one clear — the teardown one');
});

test('it publishes the span it MEASURED, never a literal', () => {
  // The hole 9b7f7cd found: replacing the measured edges with
  // `left: 0, right: 99999` passed the whole suite, because the measuring code
  // still existed and only the PUBLISH site had changed.
  assert.match(
    BAR.code,
    /setOccupiedBox\(\s*barKey\s*,\s*\{[^}]*\bbarLeft\b[^}]*\bbarRight\b[^}]*\}/,
    'the box handed to the store carries the measured barLeft/barRight'
  );
});

test('CONTROL: that probe rejects a hardcoded span', () => {
  const probe = /setOccupiedBox\(\s*barKey\s*,\s*\{[^}]*\bbarLeft\b[^}]*\bbarRight\b[^}]*\}/;
  const literal = scrubSource('setOccupiedBox(barKey, { height: h, left: 0, right: 99999 });');
  assert.equal(probe.test(literal), false, 'a full-width literal does not satisfy it');
  const measured = scrubSource(
    'setOccupiedBox(barKey, { height: h, left: metrics.barLeft, right: metrics.barRight });'
  );
  assert.equal(probe.test(measured), true, 'and the measured form does');
});

test('the height is a layout read, not a rect read', () => {
  assert.match(BAR.code, /\.offsetHeight\b/, 'height comes from offsetHeight');
  assert.match(BAR.code, /getComputedStyle\(/, 'the bottom offset is read, not assumed to be 0');
  for (const forbidden of [
    /getBoundingClientRect\(\)\s*\.\s*height/,
    /\brect\s*\.\s*height\b/,
  ]) {
    assert.equal(forbidden.test(BAR.code), false, `${forbidden} is not how the height is taken`);
  }
  assert.match(BAR.code, /\brect\s*\.\s*left\b/, 'the horizontal edges come from the rect');
  assert.match(BAR.code, /\brect\s*\.\s*right\b/, 'both of them');
});

test('lg:hidden is handled by the MEASUREMENT, not by a breakpoint in JS', () => {
  // A display:none element reports offsetHeight 0, and the shared rule turns a
  // zero height into zero occupancy. Naming a breakpoint here would be a third
  // place the lg boundary is written down.
  assert.equal(/matchMedia/.test(BAR.code), false, 'no media query in JS');
  assert.equal(/\b1024\b/.test(BAR.code), false, 'and no hardcoded lg pixel value');
});

// ── the opt-in, and the double-count it exists to prevent ───────────────────

test('the /registration caller OPTS IN — that route has no static lift', () => {
  assert.equal(
    dockLiftsForBottomBar('/registration/public'),
    false,
    'the predicate really does not fire there — this is why publishing is needed'
  );
  assert.match(
    REVIEW.code,
    /publishesOccupancy/,
    'ReviewAndPayStep enables publishing'
  );
});

test('the masterclass register caller does NOT opt in — the lift already serves it', () => {
  assert.equal(
    dockLiftsForBottomBar('/masterclass/excel-101/register'),
    true,
    'the predicate DOES fire there'
  );
  // Read from `code`, so the explanatory comment at that call site — which
  // names the prop in prose — cannot satisfy or break this.
  assert.equal(
    /publishesOccupancy/.test(MC_REGISTER.code),
    false,
    'so it must not also publish, or the dock double-counts static lift + inset'
  );
});

test('CONTROL: the opt-in probe distinguishes the two call sites', () => {
  // Without this, "does not opt in" could hold because the probe matches
  // nothing anywhere.
  const optedIn = scrubSource('<Step2MobileBar pricing={p} publishesOccupancy />');
  const notOptedIn = scrubSource('<Step2MobileBar pricing={p} />');
  assert.equal(/publishesOccupancy/.test(optedIn), true);
  assert.equal(/publishesOccupancy/.test(notOptedIn), false);
});

test('CONTROL: the comment naming the prop is not read as opting in', () => {
  // The masterclass call site explains in prose why it does NOT pass the prop.
  // A raw-source probe would read that explanation as the thing it forbids —
  // the "assertion satisfied by a comment" defect this suite records.
  assert.ok(
    /publishesOccupancy/.test(MC_REGISTER.raw),
    'the raw file really does name it in prose, or this control is empty'
  );
  const commentOnly = scrubSource('// deliberately not passing publishesOccupancy here\n');
  assert.equal(/publishesOccupancy/.test(commentOnly), false, 'prose is not code');
});

// ── the docstring that was false ────────────────────────────────────────────

test('floatingDock no longer claims the registration wizards have no bottom bar', () => {
  // Read RAW on purpose: the subject IS a comment. sourceScan's own header
  // records this as the one legitimate exception, and the heroBannerPointerCapture
  // guard records what happens when it is ignored.
  assert.equal(
    /the registration wizards have none/.test(DOCK_RULES.raw),
    false,
    'the false sentence is gone'
  );
  assert.match(
    DOCK_RULES.raw,
    /Step2MobileBar/,
    'and the docstring names the bar it used to deny the existence of'
  );
});

test('the predicate itself is UNCHANGED', () => {
  // Correcting prose must not quietly change behaviour. Both call sites above
  // depend on this staying exactly as it is.
  assert.equal(dockLiftsForBottomBar('/masterclass/x/register'), true);
  assert.equal(dockLiftsForBottomBar('/registration/public'), false);
  assert.equal(dockLiftsForBottomBar('/registration/in-house'), false);
  assert.equal(dockLiftsForBottomBar('/data-analytics/power-bi'), false);
});

// ── full-width means there is NO threshold width ────────────────────────────

const DOCK_W = 44; // h-11 w-11
const DOCK_RIGHT_GAP = 16; // right-4
const dockColumn = (vw) => ({ left: vw - DOCK_RIGHT_GAP - DOCK_W, right: vw - DOCK_RIGHT_GAP });

// `fixed inset-x-0` with no max-width: the bar is the full viewport, always.
const barEdges = (vw) => ({ left: 0, right: vw });

describe('Step2MobileBar occupancy, in its own lane', { concurrency: 1 }, () => {
  // ── THIS FILE'S PRIVATE LANE ──────────────────────────────────────────────
  // Three other files write to this store — test/pure/viewportBottomInset
  // (lane 0), test/render/floatingDockClearance (1_000_000) and
  // test/fs/masterclassBarPublishesOccupancy (2_000_000). run.mjs uses
  // `isolation: 'none', concurrency: true`, so all of them share one process
  // and interleave. Occupancy is spatial, so isolation is too: own lane, own
  // key prefix, assertions only about this lane.
  const LANE = 3_000_000;
  const LANE_END = LANE + 5_000;
  const k = (name) => `step2:${name}`;

  afterEach(() => {
    clearOccupiedBox(k('bar'));
  });

  test('there is NO threshold width — a full-width bar always shares the column', () => {
    // The course bar separates from the dock at 904px and the masterclass bar
    // at 1020px, because both are capped and positioned. This one is capped at
    // nothing, so the honest answer is that no such width exists rather than a
    // number derived from geometry that does not constrain it.
    for (let vw = 320; vw <= 2400; vw += 1) {
      const bar = barEdges(vw);
      const dock = dockColumn(vw);
      if (!(bar.left < dock.right && bar.right > dock.left)) {
        assert.fail(`found a separation width at ${vw}px, which this bar cannot have`);
      }
    }
  });

  test('CONTROL: the same sweep DOES find a separation width for a capped bar', () => {
    // Proves the sweep can report separation, so "never separates" above is a
    // real finding rather than a loop that cannot fail.
    const capped = (vw) => ({ left: 16, right: Math.min(860, vw) - 16 });
    let separatesAt = null;
    for (let vw = 320; vw <= 2400; vw += 1) {
      const bar = capped(vw);
      const dock = dockColumn(vw);
      if (!(bar.left < dock.right && bar.right > dock.left)) {
        separatesAt = vw;
        break;
      }
    }
    assert.ok(separatesAt, 'a capped, left-aligned bar does separate somewhere');
  });

  test('a published full-width box occupies the dock column at every width tried', () => {
    for (const vw of [360, 768, 1024, 1440]) {
      const bar = barEdges(vw);
      const dock = dockColumn(vw);
      setOccupiedBox(k('bar'), { height: 68, left: LANE + bar.left, right: LANE + bar.right });
      assert.equal(
        bottomInsetAcross(LANE + dock.left, LANE + dock.right),
        68,
        `at ${vw}px the dock must clear this bar`
      );
    }
  });

  test('a zero-height publish releases the dock without clearing the key', () => {
    // This is the lg:hidden path: still mounted, still full-width, covering
    // nothing. The dock must come back down.
    const dock = dockColumn(1440);
    setOccupiedBox(k('bar'), { height: 68, left: LANE, right: LANE + 1440 });
    assert.equal(bottomInsetAcross(LANE + dock.left, LANE + dock.right), 68, 'lifted first');
    setOccupiedBox(k('bar'), { height: 0, left: LANE, right: LANE + 1440 });
    assert.equal(bottomInsetAcross(LANE + dock.left, LANE + dock.right), 0, 'and back down');
  });

  test('this file leaves its lane EMPTY for everything that runs after it', () => {
    assert.equal(bottomInsetAcross(LANE, LANE_END), 0, 'no box from this file survives');
  });
});
