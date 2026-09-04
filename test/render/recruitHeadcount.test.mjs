import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { JSDOM } from 'jsdom';
import OpenPositionsSection, { JobDetailModal } from '@/components/join-us/OpenPositionsSection';
import { RecruitsAdminClient } from '@/app/admin/recruits/_components/RecruitsAdminClient';
import { MAX_HEADCOUNT } from '@/lib/recruitHeadcount';

/**
 * The headcount as it reaches the three surfaces that show it.
 *
 * ══ WHY A RENDER TIER WHEN THE RULE IS ALREADY PINNED ═══════════════════════
 * test/pure/recruitHeadcount proves the normaliser answers correctly, and
 * test/pure/recruitHeadcountWrite proves the server stores what it decides.
 * Both stay green if a component never calls it — if the card renders
 * `{recruit.headcount}` raw, or hides the text and leaves the icon behind.
 * A correct value that reaches the wrong element, or reaches it by a different
 * route, is invisible to every tier below this one.
 *
 * ── "ABSENT" IS ASSERTED BY COUNTING THE ROW, NOT BY GREPPING THE TEXT ──────
 * The defect this shape ships with is not a stray label — it is the LEFTOVER:
 * the text hides, and the icon or the <span> carrying the row's gap stays. A
 * test that only asserts `!markup.includes('จำนวน')` passes against a row with
 * an empty chip and a 12px hole in it. So each "hidden" case compares the meta
 * row's chip COUNT against the same card with a headcount, and asserts the
 * count went down by exactly one and the row has no empty element.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * Class strings and element counts, not pixels. It cannot tell you the real
 * spacing of the row with and without the chip, whether the line wraps at a
 * phone width, or how the number input behaves on a mobile keyboard. Named in
 * the round report as unverified.
 */

const JOB = {
  _id: 'job-1',
  slug: 'data-analyst',
  title: 'Data Analyst',
  department: 'Data',
  location: 'กรุงเทพฯ',
  employmentType: 'full-time',
  description: 'ทำงานกับข้อมูล',
  responsibilities: ['วิเคราะห์ข้อมูล'],
  qualifications: ['ปริญญาตรี'],
  benefits: ['ประกันสุขภาพ'],
  applyEmail: 'jobs@9expert.co.th',
  active: true,
};

const withCount = (headcount) => ({ ...JOB, headcount });

const LABEL = (n) => `จำนวน ${n} ตำแหน่ง`;

/** Every value that must render NOTHING, per the normaliser's rule. */
const HIDDEN = [
  ['the field is absent', undefined],
  ['null', null],
  ['zero', 0],
  ['the empty string', ''],
  ['whitespace', '   '],
  ['a negative', -2],
  ['a negative string', '-2'],
  ['text', 'abc'],
  ['a fraction', 3.7],
  ['over the cap', MAX_HEADCOUNT + 1],
];

// ── the public card ─────────────────────────────────────────────────────────

const card = (headcount) =>
  renderToStaticMarkup(createElement(OpenPositionsSection, { recruits: [withCount(headcount)] }));

/**
 * The card's meta row — the one holding location / งานประจำ / the headcount.
 *
 * Anchored on the row's own class string rather than on "the third div":
 * position is what changes when someone adds a chip, and an index-based
 * selector would silently start measuring a different element.
 */
function cardMetaRow(markup) {
  const m = markup.match(
    /<div class="mt-2 flex flex-wrap items-center gap-x-3[^"]*">([\s\S]*?)<\/div>/,
  );
  assert.ok(m, 'the card meta row was not found — its class string moved');
  return m[1];
}

const chips = (row) => [...row.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map((x) => x[1]);

test('card: a headcount renders as จำนวน N ตำแหน่ง, after งานประจำ', () => {
  const row = cardMetaRow(card(3));
  assert.match(row, /จำนวน 3 ตำแหน่ง/, 'the line is missing from the card');
  // ORDER, not just presence — the brief puts it after งานประจำ.
  assert.ok(row.indexOf('งานประจำ') < row.indexOf('จำนวน 3 ตำแหน่ง'),
    'the headcount renders before the employment type');
  assert.ok(row.indexOf('กรุงเทพฯ') < row.indexOf('จำนวน 3 ตำแหน่ง'),
    'the headcount renders before the location');
});

test('card: the number shown is the NORMALISED one, not the raw field', () => {
  // A card rendering `{recruit.headcount}` would print '3' for the string '3'
  // and look identical — but would also print 0, -2 and 3.7. This asserts the
  // route rather than the appearance: a value the normaliser CHANGES.
  assert.match(cardMetaRow(card('3')), /จำนวน 3 ตำแหน่ง/, 'a numeric string did not render');
  assert.match(cardMetaRow(card(' 4 ')), /จำนวน 4 ตำแหน่ง/, 'a padded string did not render');
});

for (const [label, value] of HIDDEN) {
  test(`card: ${label} renders no text, no icon, and no empty chip`, () => {
    const row = cardMetaRow(card(value));
    const withValue = cardMetaRow(card(3));

    // 1. no text
    assert.ok(!/จำนวน/.test(row), `the label rendered for ${JSON.stringify(value)}`);
    // 2. no stray zero — the `{value && …}` bug prints a bare 0 into the row
    assert.ok(!/>\s*0\s*</.test(row), 'a bare 0 was rendered into the meta row');
    // 3. NO LEFTOVER ELEMENT. This is the assertion the "hidden" claim needs:
    //    one fewer chip than the same card with a headcount, so an empty span
    //    or an orphaned icon fails here even though (1) passes.
    assert.equal(chips(row).length, chips(withValue).length - 1,
      `the row still has ${chips(row).length} chips — an element was left behind`);
    // 4. and none of the remaining chips is empty
    for (const chip of chips(row)) {
      assert.notEqual(chip.replace(/<[^>]*>/g, '').trim(), '',
        'an empty chip is in the meta row');
    }
    // 5. the icon went with it
    assert.equal((row.match(/<svg/g) ?? []).length, (withValue.match(/<svg/g) ?? []).length - 1,
      'the icon is still in the row without its text');
  });
}

// ── the detail dialog ───────────────────────────────────────────────────────
//
// jsdom rather than renderToStaticMarkup: the dialog portals to <body>, and the
// server renderer throws on portals. Same harness as
// test/render/joinUsJobDialog, and the same warning applies — the global swap
// must never yield, because the runner interleaves files.

function withDom(run, headcount) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
  });
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    raf: globalThis.requestAnimationFrame,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);

  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    flushSync(() =>
      root.render(createElement(JobDetailModal, { job: withCount(headcount), onClose() {} })),
    );
    return run(dom.window.document);
  } finally {
    try { flushSync(() => root.unmount()); } catch { /* already torn down */ }
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.requestAnimationFrame = prev.raf;
  }
}

/** The dialog's meta row: the flex row holding location and the type. */
function dialogMetaRow(doc) {
  const row = [...doc.querySelectorAll('[role="dialog"] div')].find((d) =>
    /(^|\s)mt-2(\s|$)/.test(d.className) && /flex-wrap/.test(d.className),
  );
  assert.ok(row, 'the dialog meta row was not found — its class string moved');
  return row;
}

const dialogChips = (row) => [...row.querySelectorAll(':scope > span')];

test('dialog: a headcount renders on the same line, after งานประจำ', () => {
  withDom((doc) => {
    const row = dialogMetaRow(doc);
    assert.match(row.textContent, /จำนวน 3 ตำแหน่ง/, 'the line is missing from the dialog');
    assert.ok(row.textContent.indexOf('งานประจำ') < row.textContent.indexOf('จำนวน 3'),
      'the headcount renders before the employment type');
  }, 3);
});

test('dialog: the wording matches the card exactly, from the one helper', () => {
  // Three surfaces, one string. If any of them formatted its own, this is where
  // the drift would show — a card saying "จำนวน 3 ตำแหน่ง" and a dialog saying
  // "รับ 3 คน" is the kind of thing nobody notices for a year.
  const inDialog = withDom((doc) => dialogMetaRow(doc).textContent, 3);
  assert.ok(inDialog.includes(LABEL(3)));
  assert.ok(cardMetaRow(card(3)).includes(LABEL(3)));
});

for (const [label, value] of HIDDEN) {
  test(`dialog: ${label} renders no text, no icon, and no empty chip`, () => {
    const hidden = withDom((doc) => {
      const row = dialogMetaRow(doc);
      return {
        text: row.textContent,
        chips: dialogChips(row).length,
        svgs: row.querySelectorAll('svg').length,
        empties: dialogChips(row).filter((s) => s.textContent.trim() === '').length,
      };
    }, value);
    const shown = withDom((doc) => {
      const row = dialogMetaRow(doc);
      return { chips: dialogChips(row).length, svgs: row.querySelectorAll('svg').length };
    }, 3);

    assert.ok(!/จำนวน/.test(hidden.text), `the label rendered for ${JSON.stringify(value)}`);
    assert.ok(!/(^|\s)0(\s|$)/.test(hidden.text), 'a bare 0 reached the dialog meta row');
    assert.equal(hidden.chips, shown.chips - 1, 'an element was left behind in the dialog row');
    assert.equal(hidden.svgs, shown.svgs - 1, 'the icon is still there without its text');
    assert.equal(hidden.empties, 0, 'an empty chip is in the dialog meta row');
  });
}

// ── the admin list row ──────────────────────────────────────────────────────

const adminRow = (headcount) =>
  renderToStaticMarkup(createElement(RecruitsAdminClient, {
    initialRecruits: [{ ...withCount(headcount), order: 0 }],
  }));

/** The admin row's meta line — location / type / headcount / slug. */
function adminMetaRow(markup) {
  const m = markup.match(
    /<div class="mt-1 flex flex-wrap items-center gap-x-3[^"]*">([\s\S]*?)<\/div>/,
  );
  assert.ok(m, 'the admin meta row was not found — its class string moved');
  return m[1];
}

test('admin list: a headcount renders between งานประจำ and the slug', () => {
  const row = adminMetaRow(adminRow(2));
  assert.match(row, /จำนวน 2 ตำแหน่ง/, 'the admin cannot confirm what they entered');
  assert.ok(row.indexOf('งานประจำ') < row.indexOf('จำนวน 2 ตำแหน่ง'));
  assert.ok(row.indexOf('จำนวน 2 ตำแหน่ง') < row.indexOf('slug:'),
    'the headcount renders after the slug rather than before it');
});

for (const [label, value] of HIDDEN) {
  test(`admin list: ${label} renders no text, no icon, and no empty chip`, () => {
    const row = adminMetaRow(adminRow(value));
    const withValue = adminMetaRow(adminRow(2));

    assert.ok(!/จำนวน/.test(row), `the label rendered for ${JSON.stringify(value)}`);
    assert.ok(!/>\s*0\s*</.test(row), 'a bare 0 was rendered into the admin meta row');
    assert.equal(chips(row).length, chips(withValue).length - 1,
      `the row still has ${chips(row).length} chips — an element was left behind`);
    assert.equal((row.match(/<svg/g) ?? []).length, (withValue.match(/<svg/g) ?? []).length - 1,
      'the icon is still in the admin row without its text');
    // The slug survived — the chip that was removed is the right one.
    assert.match(row, /slug: data-analyst/, 'the wrong chip was removed');
  });
}

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the row extractors find a real row, with real chips in it', () => {
  // Every "hidden" assertion above is a count comparison. If an extractor
  // returned '' — a class string that moved, a regex that matched nothing —
  // both sides would be 0, `0 === 0 - 1` would fail loudly, but the "no text"
  // half would pass vacuously. This pins the shape the counts are read from.
  const row = cardMetaRow(card(3));
  assert.ok(row.length > 50, `the card meta row extracted ${row.length} chars`);
  assert.equal(chips(row).length, 3, 'expected location + type + headcount');
  assert.equal(chips(cardMetaRow(card(null))).length, 2);

  const admin = adminMetaRow(adminRow(2));
  assert.equal(chips(admin).length, 4, 'expected location + type + headcount + slug');

  withDom((doc) => {
    assert.equal(dialogChips(dialogMetaRow(doc)).length, 3);
  }, 3);
});

test('CONTROL: the three surfaces really do differ with and without a value', () => {
  // If the components ignored the prop entirely, every "hidden" case would
  // compare two identical renders and the count assertions would fail — but the
  // "shown" tests would fail too, and the pair would read as one bug. This says
  // outright that the input reaches the output.
  assert.notEqual(cardMetaRow(card(3)), cardMetaRow(card(null)));
  assert.notEqual(adminMetaRow(adminRow(2)), adminMetaRow(adminRow(null)));
  assert.notEqual(
    withDom((doc) => dialogMetaRow(doc).textContent, 3),
    withDom((doc) => dialogMetaRow(doc).textContent, null),
  );
});
