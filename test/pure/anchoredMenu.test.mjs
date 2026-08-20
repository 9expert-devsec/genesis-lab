import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchoredMenuPosition, MENU_VIEWPORT_MARGIN } from '@/lib/anchoredMenu';

/**
 * WHERE A DISCLOSURE SHEET GOES — the arithmetic, with real numbers.
 *
 * ══ WHY THIS TIER, AND WHAT IT HONESTLY COVERS ══════════════════════════════
 *
 * The defect this belongs to is a LAYOUT one: the attendee row menu opened
 * downward past the bottom of the screen and could not be reached.
 * `renderToStaticMarkup` cannot see that. It has no viewport, no boxes and no
 * getBoundingClientRect, so an assertion about the rendered markup can only ever
 * say "a class string is present", which is precisely the shape that has
 * produced nine vacuity findings in this suite already.
 *
 * So the fix was split, and the split is the whole reason this file can exist:
 * the COMPONENT measures and applies, and DECIDES NOTHING; the decision — flip
 * or not, which edge, how tall — is pure arithmetic over two rectangles and is
 * in src/lib/anchoredMenu.js. Rectangles are exactly the thing a pure test can
 * supply honestly, so every number below is a real geometry a reader could
 * produce, not a fixture shaped to make the code pass.
 *
 * WHAT THIS FILE STILL CANNOT SAY, stated rather than implied: it cannot say
 * that the component passes the RIGHT rectangles, that `position: fixed`
 * actually escapes the clip in a browser, or that a real menu is legible where
 * it lands. The first is structural and is in test/render/menuEscapesClip; the
 * other two are on the human checklist and nowhere else.
 *
 * ══ THE GEOMETRIES ══════════════════════════════════════════════════════════
 * Taken from the screen this is about: a 1080-wide content column in a 1440x900
 * window, the 28x28 compact trigger in the roster's 32px menu column, and a
 * two-item sheet — 8px of `py-[4px]`, two 34px `OverflowItem`s and 2px of
 * border, so 78px. The last row of a two-row roster sits low enough that the
 * sheet does not fit under it, which is the reported defect exactly.
 */

const VIEWPORT = { width: 1440, height: 900 };

/** The 28x28 row trigger, with its top edge at `top`. */
const rowTrigger = (top) => ({ top, bottom: top + 28, right: 1240 });

/** Two แก้ไขรายชื่อ-sized items in a sheet: 4 + 34 + 34 + 4 + 2 borders. */
const TWO_ITEM_SHEET = 78;

/** The compact gap — the old `top-[30px]` less the 28px trigger. */
const GAP = 2;

const place = (top, over = {}) => anchoredMenuPosition({
  trigger: rowTrigger(top),
  viewport: VIEWPORT,
  height: TWO_ITEM_SHEET,
  gap: GAP,
  ...over,
});

// ════════════════════════════════════════════════════════════════════════════
// 1. THE FLIP — the defect, and the answer to it
// ════════════════════════════════════════════════════════════════════════════

test('with room below, the sheet opens DOWNWARD — the resting behaviour is unchanged', () => {
  // A trigger near the top of the window: 900 - 328 - 2 - 8 = 562px below.
  const at = place(300);
  assert.equal(at.placement, 'below');
  assert.equal(at.top, 330, 'the sheet hangs 2px under the 28px trigger, as top-[30px] did');
  assert.equal(at.bottom, undefined, 'a downward sheet must not also pin its bottom edge');
});

test('with no room below, the sheet opens UPWARD — this is the defect', () => {
  /*
   * THE REPORTED CASE. Row 2 of a two-row roster, near the bottom of the
   * window: the trigger's bottom edge is at 840, leaving 900-840-2-8 = 50px,
   * and the sheet is 78. Before this it opened downward anyway and the second
   * item was below the fold with no scrollbar anywhere that could reach it.
   */
  const at = place(812);
  assert.equal(at.placement, 'above', 'the sheet still opens downward off the bottom of the window');
  assert.equal(at.bottom, 90, 'the sheet BOTTOM edge sits 2px above the trigger top (900-812+2)');
  assert.equal(at.top, undefined, 'an upward sheet must not also pin its top edge');
});

test('the flip is an EDGE, not a subtracted height — clamping cannot fling the sheet away', () => {
  /*
   * The alternative implementation is `top = trigger.top - gap - height`, and
   * it is the same pixel whenever the sheet RENDERS at the height it was
   * measured at. It does not always: maxHeight below clamps it. A sheet
   * measured at 5000 and clamped to 802 that was placed by subtracting 5000
   * ends up at top -4190 with its far edge at -3388 — the whole sheet above
   * the window, which is the original defect pointing the other way.
   *
   * Anchored by `bottom`, the near edge is exact by construction and any
   * discrepancy between the measured and the rendered height spends itself at
   * the FAR end, where maxHeight is already waiting.
   *
   * The near edge is asserted as a PIXEL and not merely as "equal across
   * heights": two undefined `bottom`s are also equal, which is what a
   * top-placing implementation would produce, and the first version of this
   * test passed on exactly that.
   */
  const tight   = place(812);
  const clamped = place(812, { height: 5000 });
  assert.equal(tight.bottom, 90, 'the near edge is not against the trigger');
  assert.equal(clamped.bottom, 90, 'a clamped sheet was flung away from its trigger');
  assert.equal(clamped.top, undefined, 'the sheet is being placed by its far edge');
  assert.equal(clamped.placement, 'above');
});

test('ties keep the sheet BELOW — a flip needs a strictly better reason', () => {
  /*
   * Exactly equal room both ways, AND a sheet that fits in neither — which is
   * the only way to reach the comparison at all. The first version of this
   * test used the 78px sheet, which fits below at the midpoint, so the flip
   * test short-circuited before the tie was ever considered and the assertion
   * held for a reason that had nothing to do with ties. Its control stayed
   * green and said so.
   */
  const top = (VIEWPORT.height - 28) / 2;                 // 436
  const roomBelow = VIEWPORT.height - (top + 28) - GAP - MENU_VIEWPORT_MARGIN;
  const roomAbove = top - GAP - MENU_VIEWPORT_MARGIN;
  assert.equal(roomAbove, roomBelow, 'the fixture is not actually a tie');

  const tall = roomBelow + 100;
  const at = place(top, { height: tall });
  assert.ok(tall > roomBelow, 'the sheet fits below, so the tie is never reached');
  assert.equal(at.placement, 'below');
});

test('when NOTHING fits, it picks the roomier side rather than flipping blindly', () => {
  /*
   * A short window — a laptop with three toolbars. `height > roomBelow` alone
   * would flip into a space that is even smaller, which is the worse of the
   * two answers every time.
   */
  const shallow = { width: 1440, height: 200 };
  const nearBottom = anchoredMenuPosition({
    trigger: { top: 150, bottom: 178, right: 1240 }, viewport: shallow, height: 400, gap: GAP,
  });
  assert.equal(nearBottom.placement, 'above', 'more room above (140) than below (12)');

  const nearTop = anchoredMenuPosition({
    trigger: { top: 20, bottom: 48, right: 1240 }, viewport: shallow, height: 400, gap: GAP,
  });
  assert.equal(nearTop.placement, 'below', 'more room below (142) than above (10) — it must NOT flip');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. maxHeight — the half that stops "escaped the clip" becoming "hangs off"
// ════════════════════════════════════════════════════════════════════════════

test('maxHeight is the room actually available, on BOTH placements', () => {
  const below = place(300);
  assert.equal(below.maxHeight, 900 - 328 - GAP - MENU_VIEWPORT_MARGIN);

  const above = place(812);
  assert.equal(above.maxHeight, 812 - GAP - MENU_VIEWPORT_MARGIN);
});

test('a sheet taller than either side is CLAMPED, not left hanging off the viewport', () => {
  /*
   * The claim requirement (1) is really making: escaping the clip only to hang
   * off the bottom of the window is the same defect one box outward. maxHeight
   * is what makes the roomier-side fallback above honest.
   */
  const huge = place(812, { height: 5000 });
  assert.equal(huge.placement, 'above');
  assert.ok(huge.maxHeight < 5000, 'the sheet is allowed to be taller than the space it is in');
  assert.equal(huge.bottom + huge.maxHeight, VIEWPORT.height - MENU_VIEWPORT_MARGIN,
    'the clamped sheet far edge lands exactly on the viewport margin');
});

test('a trigger scrolled off the TOP opens downward — there is a whole window under it', () => {
  const at = anchoredMenuPosition({
    trigger: { top: -120, bottom: -92, right: 1240 }, viewport: VIEWPORT, height: TWO_ITEM_SHEET, gap: GAP,
  });
  assert.equal(at.placement, 'below');
  assert.equal(at.maxHeight, VIEWPORT.height + 92 - GAP - MENU_VIEWPORT_MARGIN);
});

test('a viewport too small for its own trigger still yields a non-negative maxHeight', () => {
  /*
   * BOTH rooms negative — a window dragged down to almost nothing, or an iframe
   * shorter than the control inside it. This is the only geometry where the
   * clamps in `roomBelow`/`roomAbove` actually bite, and its control said so:
   * the first version of this file removed them and the suite stayed green,
   * because every fixture had a window with room in it somewhere.
   *
   * `max-height: -5px` is not a value CSS has. The browser drops the whole
   * declaration, the sheet reverts to its natural height, and the one case
   * where clamping mattered most is the one where it silently does nothing.
   */
  const tiny = { width: 300, height: 20 };
  const at = anchoredMenuPosition({
    trigger: { top: 5, bottom: 15, right: 280 }, viewport: tiny, height: TWO_ITEM_SHEET, gap: GAP,
  });
  assert.ok(at.maxHeight >= 0, `maxHeight went negative: ${at.maxHeight}`);
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE HORIZONTAL EDGE — `right-0` preserved, and clamped
// ════════════════════════════════════════════════════════════════════════════

test('the sheet is right-aligned to its trigger, as `right-0` in a relative box was', () => {
  assert.equal(place(300).right, VIEWPORT.width - 1240);
});

test('a trigger at or past the right edge cannot push the sheet off it', () => {
  const flush = anchoredMenuPosition({
    trigger: { top: 300, bottom: 328, right: VIEWPORT.width + 40 }, viewport: VIEWPORT, height: 78, gap: GAP,
  });
  assert.equal(flush.right, MENU_VIEWPORT_MARGIN, 'a negative right offset puts the sheet outside the window');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. REFUSAL — an unusable measurement leaves the sheet where it was
// ════════════════════════════════════════════════════════════════════════════

test('an unusable measurement is REFUSED with null rather than guessed at', () => {
  /*
   * The realistic caller is a scroll handler running every frame of a flick.
   * A throw there takes the page down for a cosmetic offset, and a guess puts
   * the sheet somewhere nobody chose; null means "keep the last good place".
   */
  const bad = [
    { trigger: null, viewport: VIEWPORT, height: 78 },
    { trigger: rowTrigger(300), viewport: null, height: 78 },
    { trigger: rowTrigger(300), viewport: VIEWPORT, height: NaN },
    { trigger: { top: 300, bottom: Infinity, right: 1240 }, viewport: VIEWPORT, height: 78 },
    { trigger: rowTrigger(300), viewport: { width: 1440, height: undefined }, height: 78 },
  ];
  for (const [i, args] of bad.entries()) {
    assert.equal(anchoredMenuPosition(args), null, `case ${i} was answered rather than refused`);
  }
});

test('CONTROL: a usable measurement of the same shape is NOT refused', () => {
  // Without this, every assertion above would pass on a function that returned
  // null for everything.
  assert.notEqual(anchoredMenuPosition({
    trigger: rowTrigger(300), viewport: VIEWPORT, height: 78,
  }), null);
});

test('CONTROL: the fixtures really do straddle the flip — same sheet, both answers', () => {
  /*
   * The vacuity this file could most easily have shipped: a set of geometries
   * that all fall on one side, so `placement` is a constant and every
   * assertion about it is decoration. One sheet, one trigger size, one
   * viewport; only the row Y moves.
   */
  const answers = [200, 400, 600, 812, 860].map((y) => place(y).placement);
  assert.deepEqual(answers, ['below', 'below', 'below', 'above', 'above']);
});
