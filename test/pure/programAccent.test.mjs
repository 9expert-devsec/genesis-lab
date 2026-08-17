import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProgramIndex,
  programAccentOf,
  programIconOf,
  programBandStyle,
  BAND_ALPHA,
  NO_ACCENT_COLOR,
} from '@/lib/courses/programAccent';

/**
 * The programme accent — where the colour comes from, and what happens when
 * there isn't one.
 *
 * Measured against production on 2026-08-14: `/programs` returns 27 programmes
 * and ALL 27 carry a `programcolor`; all 25 that appear as course groups are
 * matched. So the unmatched path has no live instance, which is exactly why it
 * is driven here instead of being eyeballed on screen. It fires the day a
 * programme is created upstream without a colour — and, all at once, whenever
 * `listPrograms()` fails and page.jsx falls back to `[]`.
 */

const PROGRAMS = [
  { program_id: 'CLAUDE',   program_name: 'Claude AI',   programcolor: '#de7356' },
  { program_id: 'POWER-BI', program_name: 'Power BI',    programcolor: '#a88429' },
  { program_id: 'MS-FB',    program_name: 'Microsoft Fabric', programcolor: '#84e9aa' },
];

// ── The index ───────────────────────────────────────────────────────────────

test('one walk produces both maps, keyed by program_id', () => {
  const { names, colors } = buildProgramIndex(PROGRAMS);
  assert.deepEqual(names, {
    CLAUDE: 'Claude AI', 'POWER-BI': 'Power BI', 'MS-FB': 'Microsoft Fabric',
  });
  assert.deepEqual(colors, {
    CLAUDE: '#de7356', 'POWER-BI': '#a88429', 'MS-FB': '#84e9aa',
  });
});

test('the key is program_id, NEVER the ObjectId', () => {
  // The admin filter dropdown carries `_id` and the stored order carries the
  // code. Keying the colours by the wrong one would paint every group neutral
  // while looking like a colour problem.
  const { colors } = buildProgramIndex([
    { _id: 'oid-CLAUDE', program_id: 'CLAUDE', program_name: 'Claude AI', programcolor: '#de7356' },
  ]);
  assert.deepEqual(Object.keys(colors), ['CLAUDE']);
});

test('a programme with no id contributes to neither map', () => {
  const { names, colors } = buildProgramIndex([
    { program_name: 'Nameless', programcolor: '#ffffff' },
    { program_id: '   ', program_name: 'Blank', programcolor: '#ffffff' },
  ]);
  assert.deepEqual(names, {});
  assert.deepEqual(colors, {});
});

test('a programme with a name but no colour lands in names only', () => {
  const { names, colors } = buildProgramIndex([
    { program_id: 'NEW', program_name: 'Brand New' },
  ]);
  assert.deepEqual(names, { NEW: 'Brand New' });
  assert.deepEqual(colors, {}, 'a colourless programme must not occupy the colour map');
});

test('empty and non-array input yield empty maps rather than throwing', () => {
  for (const input of [[], null, undefined]) {
    const { names, colors } = buildProgramIndex(input);
    assert.deepEqual(names, {});
    assert.deepEqual(colors, {});
  }
});

// ── The accessor ────────────────────────────────────────────────────────────

const { colors: COLORS } = buildProgramIndex(PROGRAMS);

test('a known programme gets its own upstream colour', () => {
  const claude = programAccentOf(COLORS, 'CLAUDE');
  assert.equal(claude.color, '#de7356');
  assert.equal(claude.matched, true);
  assert.equal(programAccentOf(COLORS, 'POWER-BI').color, '#a88429');
});

test('an UNKNOWN programme gets the neutral, and is marked unmatched', () => {
  const a = programAccentOf(COLORS, 'NOT-A-PROGRAM');
  assert.equal(a.matched, false);
  assert.equal(a.color, NO_ACCENT_COLOR);
});

/**
 * AN UNMATCHED ACCENT CARRIES NO BAND — asserted on the MODULE, not through
 * the screen.
 *
 * The component's ternary only paints `band` when `matched` is true, so a
 * stale band leaking out of this function is invisible in the markup. That
 * makes the render tier unable to catch it, which is exactly the shape of
 * defect that survives review: the module is wrong, the screen happens to be
 * right, and the next caller inherits the bug. Found by the revert drill —
 * reverting to a carried `lastBand` reddened nothing until this existed.
 */
test('an unmatched accent has NO band, and never the previous one', () => {
  assert.equal(programAccentOf(COLORS, 'CLAUDE').band !== null, true, 'a matched accent must have a band');
  assert.equal(programAccentOf(COLORS, 'NOT-A-PROGRAM').band, null, 'the unmatched accent carried a band');
  // and the order of calls cannot change the answer
  programAccentOf(COLORS, 'POWER-BI');
  assert.equal(programAccentOf(COLORS, 'NOT-A-PROGRAM').band, null, 'the band carried from the previous call');
  assert.equal(programAccentOf({}, 'CLAUDE').band, null);
});

test('a matched accent band is built from ITS OWN colour', () => {
  const claude = programAccentOf(COLORS, 'CLAUDE');
  const pbi = programAccentOf(COLORS, 'POWER-BI');
  assert.ok(claude.band.includes('#de7356'), `band does not carry its colour: ${claude.band}`);
  assert.ok(pbi.band.includes('#a88429'));
  assert.notEqual(claude.band, pbi.band);
});

test('an EMPTY programme id gets the neutral — the no-program folder', () => {
  for (const id of ['', '   ', null, undefined]) {
    const a = programAccentOf(COLORS, id);
    assert.equal(a.matched, false, `${JSON.stringify(id)} was treated as a programme`);
    assert.equal(a.color, NO_ACCENT_COLOR);
  }
});

test('an EMPTY colour map makes every programme neutral', () => {
  // The listPrograms()-failed case: page.jsx falls back to `[]`, so every group
  // turns neutral at once. It must read as "no colour set", not as broken.
  for (const id of ['CLAUDE', 'POWER-BI', 'MS-FB']) {
    assert.equal(programAccentOf({}, id).matched, false);
  }
  assert.equal(programAccentOf(undefined, 'CLAUDE').matched, false);
});

/**
 * THE NEUTRAL CANNOT BE MISTAKEN FOR A PROGRAMME COLOUR.
 *
 * It is not a hex value at all — it is an existing token — so no upstream
 * colour can ever collide with it, however the palette changes.
 */
test('the neutral is not a hex colour, so nothing upstream can collide with it', () => {
  assert.ok(!/^#/.test(NO_ACCENT_COLOR), 'the neutral is a hex value — an upstream colour could equal it');
  assert.equal(NO_ACCENT_COLOR, 'var(--text-muted)');
  for (const c of Object.values(COLORS)) assert.notEqual(c, NO_ACCENT_COLOR);
});

// ── The icon ────────────────────────────────────────────────────────────────

const ICON = 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1/programs/icons/x.png';

test('the icon rides on the SAME walk as the name and the colour', () => {
  const { names, colors, icons } = buildProgramIndex([
    { program_id: 'CLAUDE', program_name: 'Claude AI', programcolor: '#de7356', programiconurl: ICON },
  ]);
  assert.deepEqual(names, { CLAUDE: 'Claude AI' });
  assert.deepEqual(colors, { CLAUDE: '#de7356' });
  assert.deepEqual(icons, { CLAUDE: ICON });
});

test('a known programme gets its icon', () => {
  const { icons } = buildProgramIndex([{ program_id: 'C', program_name: 'x', programiconurl: ICON }]);
  assert.equal(programIconOf(icons, 'C'), ICON);
});

test('an unknown programme, or none at all, gets the empty string', () => {
  const { icons } = buildProgramIndex([{ program_id: 'C', program_name: 'x', programiconurl: ICON }]);
  assert.equal(programIconOf(icons, 'NOPE'), '');
  assert.equal(programIconOf(icons, ''), '');
  assert.equal(programIconOf({}, 'C'), '');
  assert.equal(programIconOf(undefined, 'C'), '');
});

/**
 * A URL WE ARE NOT WILLING TO PUT IN `src`.
 *
 * Upstream is free text. An empty or relative value in `src` makes the browser
 * re-request the current page as an image; a `javascript:` value is inert in
 * `src` but is still a value nobody vetted. Routing anything non-http to the
 * empty string means the header degrades to name + count, which is the
 * documented behaviour, rather than to a broken-image glyph.
 */
test('a non-http icon value is treated as ABSENT', () => {
  const { icons } = buildProgramIndex([
    { program_id: 'A', program_name: 'x', programiconurl: 'not-a-url' },
    { program_id: 'B', program_name: 'x', programiconurl: '/programs/icons/x.png' },
    { program_id: 'C', program_name: 'x', programiconurl: 'javascript:alert(1)' },
    { program_id: 'D', program_name: 'x', programiconurl: '   ' },
    { program_id: 'E', program_name: 'x' },
  ]);
  assert.deepEqual(icons, {});
  for (const id of ['A', 'B', 'C', 'D', 'E']) {
    assert.equal(programIconOf(icons, id), '', `${id} was accepted`);
  }
});

test('http and https are both accepted', () => {
  const { icons } = buildProgramIndex([
    { program_id: 'S', program_name: 'x', programiconurl: 'https://cdn/x.png' },
    { program_id: 'P', program_name: 'x', programiconurl: 'http://cdn/x.png' },
  ]);
  assert.deepEqual(icons, { S: 'https://cdn/x.png', P: 'http://cdn/x.png' });
});

test('the icon and the colour are INDEPENDENT — either can exist alone', () => {
  const { colors, icons } = buildProgramIndex([
    { program_id: 'ICON-ONLY',   program_name: 'x', programiconurl: ICON },
    { program_id: 'COLOUR-ONLY', program_name: 'x', programcolor: '#de7356' },
  ]);
  assert.deepEqual(Object.keys(icons), ['ICON-ONLY']);
  assert.deepEqual(Object.keys(colors), ['COLOUR-ONLY']);
  assert.equal(programAccentOf(colors, 'ICON-ONLY').matched, false);
  assert.equal(programIconOf(icons, 'COLOUR-ONLY'), '');
});

test('CONTROL: the icon matcher rejects as well as accepts', () => {
  const { icons } = buildProgramIndex([
    { program_id: 'OK',  program_name: 'x', programiconurl: ICON },
    { program_id: 'NOT', program_name: 'x', programiconurl: 'ftp://cdn/x.png' },
  ]);
  assert.deepEqual(Object.keys(icons), ['OK']);
});

// ── The band ────────────────────────────────────────────────────────────────

test('the band is a horizontal gradient that fades to transparent', () => {
  const band = programBandStyle('#de7356');
  assert.match(band, /^linear-gradient\(90deg, #de7356[0-9a-f]{2} 0%, transparent \d+%\)$/i);
});

test('the band never fades to a hard-coded light or dark colour', () => {
  // The row has to sit on whatever surface the theme provides; an end stop
  // written as a colour would be right in one theme and wrong in the other.
  const band = programBandStyle('#de7356');
  assert.ok(!/#fff|#ffffff|#000|white|black/i.test(band), `the band ends on a literal: ${band}`);
});

test('a 3-digit colour is expanded so the alpha suffix is valid CSS', () => {
  // `#abc24` is not a colour. #abc and #aabbcc are the same value by spec, so
  // expanding changes nothing about what is painted.
  const band = programBandStyle('#abc');
  assert.match(band, /#aabbcc[0-9a-f]{2}/i);
  assert.ok(!/#abc[0-9a-f]{2}\b/i.test(band), 'a 3-digit colour took an alpha suffix directly');
});

test('the alpha is applied, not the colour at full strength', () => {
  const band = programBandStyle('#de7356');
  const stop = /(#[0-9a-f]{6})([0-9a-f]{2})/i.exec(band);
  assert.ok(stop, 'the first stop is not an 8-digit colour');
  const alpha = parseInt(stop[2], 16) / 255;
  assert.ok(alpha > 0 && alpha < 0.35, `alpha ${alpha.toFixed(2)} is outside the measured readable range`);
  assert.equal(alpha.toFixed(2), BAND_ALPHA.toFixed(2), 'the emitted alpha disagrees with BAND_ALPHA');
});

test('an unpaintable colour yields NO band rather than a broken gradient', () => {
  for (const bad of ['rebeccapurple', '#12345', '', null, undefined, 42]) {
    assert.equal(programBandStyle(bad), null, `${JSON.stringify(bad)} produced a band`);
  }
});

// ── Malformed upstream values ───────────────────────────────────────────────

test('a value that is not a paintable hex is treated as ABSENT', () => {
  // `programcolor` is free text upstream. A value the browser cannot paint
  // renders as nothing, which would be indistinguishable from "no colour set" —
  // so it is routed to the neutral deliberately instead of silently.
  const { colors } = buildProgramIndex([
    { program_id: 'BAD1', program_name: 'x', programcolor: 'rebeccapurple' },
    { program_id: 'BAD2', program_name: 'x', programcolor: '#12345' },
    { program_id: 'BAD3', program_name: 'x', programcolor: 'rgb(1,2,3)' },
    { program_id: 'BAD4', program_name: 'x', programcolor: '   ' },
    { program_id: 'BAD5', program_name: 'x', programcolor: '#ggg' },
  ]);
  assert.deepEqual(colors, {});
  for (const id of ['BAD1', 'BAD2', 'BAD3', 'BAD4', 'BAD5']) {
    assert.equal(programAccentOf(colors, id).matched, false, `${id} was accepted`);
  }
});

test('both hex lengths are accepted, and case does not matter', () => {
  const { colors } = buildProgramIndex([
    { program_id: 'SHORT', program_name: 'x', programcolor: '#ABC' },
    { program_id: 'LONG',  program_name: 'x', programcolor: '#DE7356' },
    { program_id: 'PAD',   program_name: 'x', programcolor: '  #de7356  ' },
  ]);
  assert.deepEqual(colors, { SHORT: '#ABC', LONG: '#DE7356', PAD: '#de7356' });
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the accessor varies with its input, it is not a constant', () => {
  const a = programAccentOf(COLORS, 'CLAUDE');
  const b = programAccentOf(COLORS, 'POWER-BI');
  const c = programAccentOf(COLORS, 'UNKNOWN');
  assert.notEqual(a.color, b.color);
  assert.notEqual(b.color, c.color);
  assert.notEqual(a.matched, c.matched);
});

test('CONTROL: the hex matcher rejects as well as accepts', () => {
  // Every "malformed is absent" assertion is a negative; a matcher that
  // accepted everything would satisfy the positives and a matcher that rejected
  // everything would satisfy the negatives. This pins both directions.
  const { colors } = buildProgramIndex([
    { program_id: 'OK',  program_name: 'x', programcolor: '#005CFF' },
    { program_id: 'NOT', program_name: 'x', programcolor: 'blue' },
  ]);
  assert.deepEqual(Object.keys(colors), ['OK']);
});
