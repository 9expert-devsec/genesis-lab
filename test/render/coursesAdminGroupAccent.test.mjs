import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { CoursesAdminClient } from '@/app/admin/courses/_components/CoursesAdminClient';
import { NO_ACCENT_COLOR } from '@/lib/courses/programAccent';

/**
 * The colour actually reaches the group header, and an unmatched group does not
 * inherit its neighbour's.
 *
 * The resolution itself is pure and is driven in test/pure/programAccent. This
 * is the half that only the markup can show: that the resolved value lands on
 * the header cell, per group, and that the neutral is structurally different
 * from a real colour rather than merely a different hue.
 */

const course = (code, programId) => ({
  course_id: code,
  course_name: code,
  _id: `id-${code}`,
  program: { program_id: programId, _id: `oid-${programId}` },
});

const PROGRAM_COLORS = { CLAUDE: '#de7356', 'POWER-BI': '#a88429' };
const PROGRAM_NAMES = { CLAUDE: 'Claude AI', 'POWER-BI': 'Power BI', ORPHAN: 'No Colour Here' };
const ORDER = { CLAUDE: ['CLAUDE-AI'], 'POWER-BI': ['POWER-BI'], ORPHAN: ['ORPHAN-1'] };

function render(props = {}) {
  __setPathname('/admin/courses');
  __setSearchParams('');
  return renderToStaticMarkup(
    createElement(CoursesAdminClient, {
      courses: [course('CLAUDE-AI', 'CLAUDE'), course('POWER-BI', 'POWER-BI')],
      extensions: {},
      programs: [],
      programCourseOrder: ORDER,
      programNames: PROGRAM_NAMES,
      programColors: PROGRAM_COLORS,
      q: '',
      program: '',
      type: '',
      ...props,
    })
  );
}

/**
 * The accent each group header carries, in document order.
 *
 * A matched header paints a gradient BAND (`background-image`); an unmatched
 * one paints no band and takes a dashed neutral left edge
 * (`border-left-color`). Both are read off the `<th colspan="8">` specifically
 * — the header cell is the only thing that may carry an accent, so a match
 * anywhere else would mean the treatment leaked onto a row.
 *
 * Returns the COLOUR in either case, so the stale-carry assertions can compare
 * a matched group against an unmatched one directly.
 */
function headerAccents(html) {
  return [...html.matchAll(/<th colspan="8"[^>]*style="([^"]*)"[^>]*>/gi)].map((m) => {
    const band = /background-image:\s*linear-gradient\(90deg,\s*(#[0-9a-f]{6})[0-9a-f]{2}/i.exec(m[1]);
    if (band) return band[1].toLowerCase();
    return /border-left-color:\s*([^;"]+)/i.exec(m[1])?.[1]?.trim() ?? null;
  });
}

/** The raw `background-image` of each group header, or null. */
function headerBands(html) {
  return [...html.matchAll(/<th colspan="8"[^>]*style="([^"]*)"[^>]*>/gi)]
    .map((m) => /background-image:\s*([^;"]+)/i.exec(m[1])?.[1]?.trim() ?? null);
}

/** Whether each group header wears the dashed neutral edge. */
function headerBorderStyles(html) {
  return [...html.matchAll(/<th colspan="8"[^>]*class="([^"]*)"[^>]*>/gi)]
    .map((m) => (/\bborder-dashed\b/.test(m[1]) ? 'dashed' : 'none'));
}

// ── The colour reaches the header ───────────────────────────────────────────

test('each group header carries its OWN programme colour', () => {
  assert.deepEqual(headerAccents(render()), ['#de7356', '#a88429']);
});

test('the colour comes from the shared source, not a literal in the admin tree', () => {
  // Change the map and the markup follows. A copied palette would not.
  const html = render({ programColors: { CLAUDE: '#123456', 'POWER-BI': '#abcdef' } });
  assert.deepEqual(headerAccents(html), ['#123456', '#abcdef']);
});

test('a matched header draws a BAND that fades to transparent', () => {
  const bands = headerBands(render());
  assert.equal(bands.length, 2);
  for (const b of bands) {
    assert.match(b, /^linear-gradient\(90deg,/, 'the band is not a horizontal gradient');
    assert.match(b, /transparent \d+%\)$/, 'the band does not fade to transparent');
    assert.ok(
      !/#(?:f{3,6}|fff|ffffff)\b/i.test(b) && !/\bwhite\b|\bblack\b/i.test(b),
      `the band fades to a hard-coded colour instead of transparent: ${b}`
    );
  }
});

test('the band carries an ALPHA, not the colour at full strength', () => {
  // It sits behind the group name; at full strength several of these colours
  // put the name below AA. See BAND_ALPHA for the measurements.
  for (const b of headerBands(render())) {
    assert.match(b, /#[0-9a-f]{6}[0-9a-f]{2}\s+0%/i, 'the first stop is not an 8-digit (alpha) colour');
    assert.ok(!/#[0-9a-f]{6}\s+0%/i.test(b), 'the colour is painted at full opacity');
  }
});

test('a matched header takes NO dashed edge', () => {
  assert.deepEqual(headerBorderStyles(render()), ['none', 'none']);
});

// ── The unmatched group ─────────────────────────────────────────────────────

test('AN UNMATCHED PROGRAMME DOES NOT INHERIT THE PREVIOUS GROUP\'S COLOUR', () => {
  // The stale-carry bug this file exists for. ORPHAN follows CLAUDE, so a
  // carried value would paint it #de7356 and look entirely plausible.
  const html = render({
    courses: [course('CLAUDE-AI', 'CLAUDE'), course('ORPHAN-1', 'ORPHAN')],
  });
  const accents = headerAccents(html);
  assert.equal(accents.length, 2);
  assert.equal(accents[0], '#de7356');
  assert.equal(accents[1], NO_ACCENT_COLOR, 'the unmatched group took its neighbour\'s colour');
  assert.notEqual(accents[1], accents[0]);
});

test('the carry does not happen in the other direction either', () => {
  // Unmatched FIRST, then matched: a naive "remember the last colour" would
  // leave the second group neutral instead.
  const html = render({
    courses: [course('ORPHAN-1', 'ORPHAN'), course('CLAUDE-AI', 'CLAUDE')],
  });
  assert.deepEqual(headerAccents(html), [NO_ACCENT_COLOR, '#de7356']);
});

test('an unmatched group is structurally different, not just a different hue', () => {
  // Several real colours have poor contrast against this surface in one theme
  // or the other, so a neutral distinguished ONLY by its colour would be
  // confusable with a real one exactly when contrast is worst. A wash means
  // "has a colour"; a dashed grey edge over a plain surface means "does not".
  const html = render({
    courses: [course('CLAUDE-AI', 'CLAUDE'), course('ORPHAN-1', 'ORPHAN')],
  });
  assert.deepEqual(headerBorderStyles(html), ['none', 'dashed']);
  assert.deepEqual(headerBands(html), [
    'linear-gradient(90deg, #de735624 0%, transparent 55%)',
    null,
  ], 'the unmatched group painted a band');
});

test('the unmatched header says so in its title', () => {
  const html = render({ courses: [course('ORPHAN-1', 'ORPHAN')] });
  assert.match(html, /title="[^"]*ไม่ได้กำหนดสีของโปรแกรมนี้"/);
});

test('an EMPTY colour map turns every group neutral — the listPrograms-failed case', () => {
  const html = render({ programColors: {} });
  assert.deepEqual(headerAccents(html), [NO_ACCENT_COLOR, NO_ACCENT_COLOR]);
  assert.deepEqual(headerBorderStyles(html), ['dashed', 'dashed']);
  assert.deepEqual(headerBands(html), [null, null], 'a band survived with no colours at all');
});

// ── The icon ────────────────────────────────────────────────────────────────

/** The `src` of each group header's icon, or null when no image is rendered. */
function headerIcons(html) {
  return [...html.matchAll(/<th colspan="8"[\s\S]*?<\/th>/gi)]
    .map((m) => /<img[^>]*src="([^"]*)"/i.exec(m[0])?.[1] ?? null);
}

/** The 20×20 slot is rendered whether or not there is an image. */
const iconSlots = (html) => (html.match(/class="inline-flex h-5 w-5 flex-none/g) ?? []).length;

const ICONS = {
  CLAUDE: 'https://res.cloudinary.com/x/programs/icons/claude.png',
  'POWER-BI': 'https://res.cloudinary.com/x/programs/icons/pbi.png',
};

test('each group header renders its programme icon', () => {
  const html = render({ programIcons: ICONS });
  assert.deepEqual(headerIcons(html), [ICONS.CLAUDE, ICONS['POWER-BI']]);
});

test('the icon has FIXED dimensions so a slow image cannot shift the row', () => {
  const html = render({ programIcons: ICONS });
  const imgs = [...html.matchAll(/<img[^>]*>/gi)].map((m) => m[0]);
  assert.equal(imgs.length, 2);
  for (const img of imgs) {
    assert.match(img, /width="20"/, 'the icon has no intrinsic width');
    assert.match(img, /height="20"/, 'the icon has no intrinsic height');
    assert.match(img, /h-5 w-5/, 'the icon is not size-locked in CSS too');
  }
});

/**
 * THE PATH NOBODY SEES UNTIL PRODUCTION.
 *
 * A programme with no icon must still render name + count, with no
 * broken-image box and no collapsed layout. The slot stays so the name starts
 * at the same x in every folder.
 */
test('a programme with NO icon still renders its name and count', () => {
  const html = render({ programIcons: {} });
  assert.deepEqual(headerIcons(html), [null, null], 'an <img> was rendered with no source');
  assert.ok(!/<img[^>]*src=""/.test(html), 'an empty src would request the page itself');
  assert.match(html, /Claude AI/);
  assert.match(html, /Power BI/);
  assert.match(html, /1 หลักสูตร/);
});

test('the slot is reserved even when there is no icon, so nothing shifts', () => {
  assert.equal(iconSlots(render({ programIcons: ICONS })), 2);
  assert.equal(iconSlots(render({ programIcons: {} })), 2, 'the slot collapsed when the icon was absent');
});

test('an unusable icon URL is treated as absent rather than put in src', () => {
  const html = render({
    programIcons: { CLAUDE: 'not-a-url', 'POWER-BI': 'javascript:alert(1)' },
  });
  assert.deepEqual(headerIcons(html), [null, null]);
  assert.ok(!/javascript:/i.test(html), 'a non-http src reached the markup');
});

test('a missing icon says so, rather than rendering a silent gap', () => {
  const html = render({ programIcons: {} });
  assert.match(html, /title="ไม่มีไอคอนสำหรับ Claude AI"/);
});

test('the icon carries no duplicate label for a screen reader', () => {
  // The programme NAME sits immediately beside it; a described icon would be
  // announced twice.
  const html = render({ programIcons: ICONS });
  for (const img of [...html.matchAll(/<img[^>]*>/gi)].map((m) => m[0])) {
    assert.match(img, /alt=""/, 'the icon has non-empty alt beside the name it repeats');
    assert.match(img, /aria-hidden="true"/);
  }
});

test('the icon is independent of the colour — one can exist without the other', () => {
  // A programme with an icon but no colour, and the reverse. Folding the two
  // into one "matched" flag would make both states unrepresentable.
  const iconNoColour = render({ programColors: {}, programIcons: ICONS });
  assert.deepEqual(headerIcons(iconNoColour), [ICONS.CLAUDE, ICONS['POWER-BI']]);
  assert.deepEqual(headerBorderStyles(iconNoColour), ['dashed', 'dashed']);

  const colourNoIcon = render({ programIcons: {} });
  assert.deepEqual(headerIcons(colourNoIcon), [null, null]);
  assert.deepEqual(headerAccents(colourNoIcon), ['#de7356', '#a88429']);
});

test('CONTROL: the icon extractor is not returning null always', () => {
  // Three assertions above are "no icon was rendered". A broken extractor
  // satisfies all of them.
  assert.deepEqual(headerIcons(render({ programIcons: ICONS })), [ICONS.CLAUDE, ICONS['POWER-BI']]);
  assert.deepEqual(headerIcons('<table></table>'), []);
  assert.equal(iconSlots('<table></table>'), 0);
});

// ── Colour is an ADDITIONAL cue ─────────────────────────────────────────────

test('the group name and count are unchanged by the accent', () => {
  const html = render();
  assert.match(html, /Claude AI/);
  assert.match(html, /Power BI/);
  assert.match(html, /1 หลักสูตร/);
  // and they survive the neutral too — colour never carries meaning alone
  const neutral = render({ programColors: {} });
  assert.match(neutral, /Claude AI/);
  assert.match(neutral, /1 หลักสูตร/);
});

test('the accent is on the HEADER only — no course row is coloured', () => {
  const html = render();
  const rowStyles = [...html.matchAll(/<tr[^>]*style="([^"]*)"/gi)].map((m) => m[1]);
  assert.deepEqual(rowStyles, [], 'a row carried an inline style — the accent leaked out of the header');
  assert.equal((html.match(/linear-gradient/gi) ?? []).length, 2, 'exactly one band per group header');
});

// ── fc46953 and f596901 behaviour is untouched ──────────────────────────────

test('the skill / mega-menu notice still renders', () => {
  const html = render();
  assert.match(html, /ไม่มีผลกับหน้า Skill/, 'the skill-dimension notice was lost');
  assert.match(html, /snapshot/, 'the mega-menu snapshot caveat was lost');
  assert.match(html, /href="\/admin\/cache"/);
});

test('the drag affordance, the numbering and the unlisted marker survive', () => {
  const html = render({
    courses: [course('BRAND-NEW', 'CLAUDE'), course('CLAUDE-AI', 'CLAUDE')],
  });
  assert.match(html, /aria-label="Drag handle"/, 'the drag affordance was lost');
  assert.match(html, /ยังไม่จัดลำดับ/, 'the unlisted marker was lost');
});

test('the null-order banner and the q-withdrawal survive', () => {
  assert.match(render({ programCourseOrder: null }), /ยังไม่มีลำดับที่บันทึกไว้/);
  assert.match(render({ q: 'CLAUDE' }), /ปิดการจัดลำดับชั่วคราวเพราะกำลังกรองรายการอยู่/);
});

test('a group header still renders its accent while reordering is withdrawn', () => {
  // The accent is about identity, not about editability — withdrawing the drag
  // must not also blank the colour.
  assert.deepEqual(headerAccents(render({ q: 'CLAUDE' })), ['#de7356']);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the accent extractor finds real values and nothing in bare markup', () => {
  // Four assertions above are "this is NOT the neighbour's colour". A broken
  // extractor returning [] or [null] would satisfy several of them.
  assert.deepEqual(headerAccents(render()), ['#de7356', '#a88429']);
  assert.deepEqual(headerAccents('<table><tbody></tbody></table>'), []);
  assert.deepEqual(headerBorderStyles('<table></table>'), []);
  assert.deepEqual(headerBands('<table></table>'), []);
  // and it reads a band and a neutral edge as DIFFERENT things
  const mixed = render({ courses: [course('CLAUDE-AI', 'CLAUDE'), course('ORPHAN-1', 'ORPHAN')] });
  assert.deepEqual(headerAccents(mixed), ['#de7356', NO_ACCENT_COLOR]);
});

test('CONTROL: the two colours really are different documents', () => {
  const a = render();
  const b = render({ programColors: {} });
  assert.notEqual(a, b);
  assert.ok(a.includes('#de7356'), 'the matched render lost its colour');
  assert.ok(!b.includes('#de7356'), 'the neutral render still carries a programme colour');
});
