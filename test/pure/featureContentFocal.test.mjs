import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CENTRE,
  focalPosition,
  mapBannersToFeatureContent,
} from '@/lib/home/featureContentFromBanners';

/**
 * THE FOCAL POINT: which part of a banner survives being cropped.
 *
 * ── WHY THIS RULE NEEDS A GUARD OF ITS OWN ──────────────────────────────────
 * One uploaded picture is shown in three frames of two shapes — the desktop
 * stage at 12:5, the mobile stage at 16:9, and the strip card at 16:9 — and
 * `object-fit: cover` throws away whatever does not fit. Measured on all five
 * live image records, every one of which is 2.743:1: a 16:9 frame keeps 64.8%
 * of the width, so a CENTRED crop takes 17.6% off each side and renders
 * "EARLY Bird! … Masterclass" as "APLY … asterclass".
 *
 * `image_focal` is the record's answer to "then which 64.8%". This file pins
 * the two halves that are easy to get wrong and impossible to see going wrong:
 *
 *   1. ABSENT MEANS CENTRE, in exactly one place. Three frames render this
 *      value; a fallback repeated at each of them drifts, and the failure is a
 *      picture cropped differently in the strip than in the stage that strip
 *      feeds — which reads as a rendering fault, not as a missing default.
 *   2. A HALF-SET POINT IS NOT A POINT. `{x: 34}` with no y would produce
 *      `object-position: 34% undefined%`, which the browser drops silently —
 *      leaving the crop centred while the record claims otherwise. That is
 *      worse than having no field, because it looks configured.
 *
 * ── WHAT THIS TIER CANNOT SEE ───────────────────────────────────────────────
 * That the string reaches an element, and that the element is the one being
 * cropped. Those are render- and browser-tier facts; the render tier asserts
 * the attribute is emitted on the image, and a CDP harness measures the
 * computed `object-position` and `object-fit` on the live page.
 */

const imageBanner = (over = {}) => ({
  _id: 'img-1',
  type: 'image_desktop',
  title: 'Early Bird AI Digital Marketing Creator Masterclass',
  image_url: 'https://res.cloudinary.com/x/image/upload/v1/banner.jpg',
  link_url: 'https://example.com/x',
  active: true,
  weight: 0,
  ...over,
});

// ── (1) ABSENT MEANS CENTRE ─────────────────────────────────────────────────

test('a record with no focal point is anchored at the centre', () => {
  assert.equal(focalPosition({}), CENTRE);
  assert.equal(focalPosition({ image_focal: undefined }), CENTRE);
  assert.equal(focalPosition({ image_focal: null }), CENTRE);
});

test('and so is no record at all — the reader never receives undefined', () => {
  // The snapshot is Mixed and a mapper caller can pass anything; a crash here
  // would take the whole section down for a malformed row.
  assert.equal(focalPosition(undefined), CENTRE);
  assert.equal(focalPosition(null), CENTRE);
});

test('CENTRE is a real CSS object-position value, not a sentinel', () => {
  // It is set straight onto `style`, with no conversion step — so if this were
  // 'center' or {x:50,y:50} the fallback would render nothing at all.
  assert.match(CENTRE, /^\d+% \d+%$/);
  assert.equal(CENTRE, '50% 50%');
});

// ── (2) A STORED POINT IS RENDERED VERBATIM ─────────────────────────────────

test('a stored focal point becomes the object-position string', () => {
  assert.equal(focalPosition({ image_focal: { x: 22, y: 40 } }), '22% 40%');
});

test('fractions survive — the control will not be integer-only', () => {
  assert.equal(focalPosition({ image_focal: { x: 22.5, y: 61.25 } }), '22.5% 61.25%');
});

test('0 and 100 are legal, and 0 is not mistaken for absent', () => {
  // The trap: a falsy check instead of a finite check sends {x:0,y:0} — the
  // top-left anchor, which is exactly what these left-aligned banners want —
  // straight back to the centre.
  assert.equal(focalPosition({ image_focal: { x: 0, y: 0 } }), '0% 0%');
  assert.equal(focalPosition({ image_focal: { x: 100, y: 100 } }), '100% 100%');
});

test('numeric strings are coerced — the snapshot is Mixed, not typed', () => {
  assert.equal(focalPosition({ image_focal: { x: '30', y: '70' } }), '30% 70%');
});

// ── (3) A HALF-SET OR NONSENSE POINT FALLS BACK, IT DOES NOT LEAK ───────────

test('a focal point with only an x is refused, not half-applied', () => {
  assert.equal(focalPosition({ image_focal: { x: 34 } }), CENTRE);
  assert.equal(focalPosition({ image_focal: { y: 34 } }), CENTRE);
});

test('an empty object is not a focal point', () => {
  assert.equal(focalPosition({ image_focal: {} }), CENTRE);
});

test('non-numeric coordinates fall back rather than emitting NaN%', () => {
  assert.equal(focalPosition({ image_focal: { x: 'left', y: 'top' } }), CENTRE);
});

test('the EMPTY values that Number() turns into 0 are refused too', () => {
  /**
   * This is the one that a plain `Number(v)` + `Number.isFinite` check gets
   * wrong, and it gets it wrong in the confident direction. Every value below
   * coerces to 0 — a finite number, in range, indistinguishable from an admin
   * deliberately anchoring at the left edge. So `{x: null, y: 40}` would render
   * `0% 40%`: a hard crop to one edge, from a record that set nothing.
   */
  for (const empty of [null, '', '   ', false, []]) {
    assert.equal(Number(empty), 0, 'the premise: this really does coerce to 0');
    assert.equal(focalPosition({ image_focal: { x: empty, y: 40 } }), CENTRE,
      `x: ${JSON.stringify(empty)} must not read as 0`);
    assert.equal(focalPosition({ image_focal: { x: 40, y: empty } }), CENTRE,
      `y: ${JSON.stringify(empty)} must not read as 0`);
  }
});

test('CONTROL: a REAL zero is still a real zero', () => {
  // The check above must reject empties without also rejecting the top-left
  // anchor, which is the value these left-aligned banners will actually want.
  assert.equal(focalPosition({ image_focal: { x: 0, y: 40 } }), '0% 40%');
  assert.equal(focalPosition({ image_focal: { x: '0', y: '40' } }), '0% 40%');
});

test('out-of-range values are clamped, never emitted as-is', () => {
  // A negative object-position is legal CSS and moves the picture OUT of its
  // box, leaving a strip of panel showing along one edge.
  assert.equal(focalPosition({ image_focal: { x: -20, y: 130 } }), '0% 100%');
});

// ── (4) IT REACHES THE VIEW MODEL, ON EVERY TYPE ────────────────────────────

test('the mapper puts objectPosition on the item', () => {
  const [item] = mapBannersToFeatureContent(
    [imageBanner({ image_focal: { x: 25, y: 50 } })],
    { now: new Date('2026-08-20T00:00:00Z') }
  );
  assert.equal(item.objectPosition, '25% 50%');
});

test('…and on a record with none, as the centre', () => {
  const [item] = mapBannersToFeatureContent([imageBanner()], {
    now: new Date('2026-08-20T00:00:00Z'),
  });
  assert.equal(item.objectPosition, CENTRE);
});

test('EVERY type carries the field, video included', () => {
  // A YouTube thumbnail is already 16:9 so the value is inert there — but a
  // field that exists on some items and is undefined on others turns every
  // consumer into `item.objectPosition ?? something`, which is the second copy
  // of the default this whole design exists to avoid.
  const items = mapBannersToFeatureContent(
    [
      imageBanner(),
      { _id: 'vid-1', type: 'youtube', title: 'v', youtube_id: 'abc123',
        active: true, weight: 1 },
    ],
    { now: new Date('2026-08-20T00:00:00Z') }
  );
  assert.equal(items.length, 2, 'fixture produced fewer items than expected');
  for (const item of items) {
    assert.equal(typeof item.objectPosition, 'string', `${item.type} has no anchor`);
    assert.match(item.objectPosition, /^[\d.]+% [\d.]+%$/);
  }
});

test('CONTROL: the mapper really does read the record, not a constant', () => {
  // Without this, every assertion above would pass on a mapper that hard-coded
  // '50% 50%' and ignored the field entirely.
  const [a] = mapBannersToFeatureContent([imageBanner({ image_focal: { x: 12, y: 88 } })],
    { now: new Date('2026-08-20T00:00:00Z') });
  const [b] = mapBannersToFeatureContent([imageBanner({ image_focal: { x: 88, y: 12 } })],
    { now: new Date('2026-08-20T00:00:00Z') });
  assert.notEqual(a.objectPosition, b.objectPosition);
  assert.equal(a.objectPosition, '12% 88%');
  assert.equal(b.objectPosition, '88% 12%');
});
