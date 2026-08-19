import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoundEditForm } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { storedRoundOption } from '@/lib/registrations/roundSelection';

/**
 * THE ADMIN ROUND SELECT.
 *
 * ══ WHY THE FORM IS RENDERED DIRECTLY ═══════════════════════════════════════
 *
 * It sits behind `editSection === 'course'`, which a CLICK sets, and
 * `renderToStaticMarkup` cannot click. Exporting the form and mounting it here
 * is the same arrangement `InvoiceEditForm` already uses — otherwise every
 * assertion about the control would be about a branch this tier cannot reach.
 *
 * NO createRoot. `isolation: 'none'` means a jsdom window leaks into every other
 * render test in the run.
 *
 * ══ WHAT THIS FILE IS ABOUT ═════════════════════════════════════════════════
 *
 * Requirement 5 above all: a stored round that is no longer in the list renders
 * as the selected option, MARKED, and — the ruling — NOT SELECTABLE, because
 * there is no honest way to offer something the source will not return.
 *
 * That is not an edge case. The schedule endpoint filters `>= today`
 * unconditionally, so every registration for a round that has already run lands
 * on this path.
 */

const ROUNDS = [
  { _id: 'r-open',   dates: ['2026-09-01', '2026-09-02'], type: 'classroom', status: 'open' },
  { _id: 'r-hybrid', dates: ['2026-09-10'],               type: 'hybrid',    status: 'open' },
  { _id: 'r-full',   dates: ['2026-09-20'],               type: 'classroom', status: 'full' },
  { _id: 'r-nearly', dates: ['2026-09-25'],               type: 'online',    status: 'nearly_full' },
];

const form = (props = {}) => renderToStaticMarkup(createElement(RoundEditForm, {
  rounds: ROUNDS,
  storedOption: null,
  classId: 'r-open',
  attendanceMode: '',
  onChange: () => {},
  ...props,
}));

/** Every `<option>` as `{ value, label, disabled, selected }`. */
function options(markup) {
  return [...markup.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((m) => ({
    value: /value="([^"]*)"/.exec(m[1])?.[1] ?? '',
    label: m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
    disabled: /\bdisabled\b/.test(m[1]),
    selected: /\bselected\b/.test(m[1]),
  }));
}

/** Only the round `<select>`'s options — the mode picker has its own. */
function roundOptions(markup) {
  const end = markup.indexOf('รูปแบบการอบรม');
  return options(end === -1 ? markup : markup.slice(0, end));
}

// ── 1. The list ─────────────────────────────────────────────────────────────

test('every upcoming round is offered, with its date label', () => {
  const opts = roundOptions(form());
  assert.deepEqual(opts.map((o) => o.value), ['r-open', 'r-hybrid', 'r-full', 'r-nearly']);
  assert.ok(opts[0].label.startsWith('1-2 ก.ย. 2569'), `first label was "${opts[0].label}"`);
});

test('FULL and NEARLY-FULL rounds are OFFERED and MARKED, not hidden', () => {
  /**
   * The admin case is CORRECTION rather than booking, so a sold-out round is a
   * legitimate destination — someone already promised a seat has to go
   * somewhere. But it must be marked, because it is not a thing to do by
   * accident.
   */
  const opts = roundOptions(form());
  const full = opts.find((o) => o.value === 'r-full');
  const nearly = opts.find((o) => o.value === 'r-nearly');
  assert.match(full.label, /เต็ม/, 'a full round is not marked');
  assert.equal(full.disabled, false, 'a full round is not selectable — the admin case is correction');
  assert.match(nearly.label, /ใกล้เต็ม/, 'a nearly-full round is not marked');
  assert.equal(nearly.disabled, false);
});

test('an OPEN round carries no status suffix at all', () => {
  // Otherwise "marked" means nothing — every option would carry a badge and the
  // eye would stop reading them.
  const open = roundOptions(form()).find((o) => o.value === 'r-open');
  assert.ok(!/เต็ม/.test(open.label), `an open round was marked: "${open.label}"`);
});

// ── 2. REQUIREMENT 5 — the stored round that is gone ────────────────────────

test('a stored round no longer offered RENDERS, marked, and is NOT selectable', () => {
  /**
   * ══ THE RULING, IN ONE ASSERTION ═══════════════════════════════════════════
   *
   * RENDERS — never silently cleared. A select that opened with nothing chosen
   * would invite an admin to pick a new round for a record that already has
   * one, moving an attendee off a course they have already attended.
   *
   * MARKED — the reader must be able to tell it apart from a live option.
   *
   * NOT SELECTABLE — there is no honest way to offer it. The endpoint filters
   * `>= today`, so re-selecting it would send an id the server cannot verify and
   * the save would be refused. A control that can be operated but never succeeds
   * is worse than one that visibly cannot.
   */
  const stored = storedRoundOption(
    { classId: 'r-gone', classDate: '1 ม.ค. 2568' },
    ROUNDS,
  );
  assert.ok(stored, 'the fixture does not actually produce a missing round');

  const opts = roundOptions(form({ storedOption: stored, classId: 'r-gone' }));
  const gone = opts.find((o) => o.value === 'r-gone');

  assert.ok(gone, 'THE STORED ROUND VANISHED — the select opened with nothing chosen');
  assert.equal(gone.disabled, true, 'the gone round is selectable, and the server would refuse it');
  assert.match(gone.label, /ไม่เปิดรับแล้ว/, 'the gone round is not marked as no longer offered');
  assert.match(gone.label, /1 ม.ค. 2568/, 'the gone round lost the label the record stores');

  // It is FIRST, so it is what the select shows when `value` matches it.
  assert.equal(opts[0].value, 'r-gone', 'the stored round is not the first option');
  // …and the live rounds are all still there and all still selectable.
  assert.equal(opts.filter((o) => !o.disabled).length, ROUNDS.length,
    'a live round became unselectable');
});

test('a LIVE stored round produces no duplicate option', () => {
  // `storedRoundOption` returns null when the round is in the list, so the
  // select must not render it twice — which would read as two identical rounds.
  const stored = storedRoundOption({ classId: 'r-open', classDate: '1-2 ก.ย. 2569' }, ROUNDS);
  assert.equal(stored, null);
  const opts = roundOptions(form({ storedOption: stored, classId: 'r-open' }));
  assert.equal(opts.filter((o) => o.value === 'r-open').length, 1, 'the live round was duplicated');
});

// ── 3. REQUIREMENT 4 — the hybrid choice ────────────────────────────────────

test('a NON-hybrid round shows NO mode picker', () => {
  // There is nothing to choose, and the server sets `classroom` itself. A picker
  // here would be the screen asking a question that has one answer.
  const markup = form({ classId: 'r-open' });
  assert.ok(!markup.includes('รูปแบบการอบรม'), 'a classroom round offered a mode picker');
});

test('a HYBRID round shows the picker, UNSET, and says the choice is required', () => {
  /**
   * The server REJECTS a hybrid round with no mode rather than defaulting one,
   * so a pre-selected option would be the screen answering on the admin's
   * behalf — and guessing `classroom` for someone who meant Teams sends an
   * attendee to a building.
   */
  const markup = form({ classId: 'r-hybrid', attendanceMode: '' });
  assert.ok(markup.includes('รูปแบบการอบรม'), 'a hybrid round offered no mode picker');

  const modeOpts = options(markup.slice(markup.indexOf('รูปแบบการอบรม')));
  assert.deepEqual(modeOpts.map((o) => o.value), ['', 'classroom', 'teams'],
    'the mode picker has no empty first option — something is preselected');
  assert.match(markup, /ต้องเลือกรูปแบบการเข้าอบรม/,
    'nothing tells the admin the hybrid choice is required');
});

test('once a mode is chosen the required-warning goes', () => {
  // Otherwise the warning is decoration: it would be there whatever the admin
  // did, and a reader would learn to ignore it.
  const markup = form({ classId: 'r-hybrid', attendanceMode: 'teams' });
  assert.ok(!markup.includes('ต้องเลือกรูปแบบการเข้าอบรม'),
    'the required warning stays after the choice is made');
});

// ── 4. The payload shape, as rendered ───────────────────────────────────────

test('THE FORM HAS NO DATE OR TYPE CONTROL AT ALL', () => {
  /**
   * ══ THE CLIENT HALF OF THE GUARANTEE ═══════════════════════════════════════
   *
   * The free-text editor this replaces had three inputs writing `classDate`,
   * `scheduleType` and `attendanceMode` INDEPENDENTLY, with `classId` in none of
   * them. A control that can hold a label can submit one that disagrees with the
   * id, and nothing on screen would show it.
   *
   * So: no text input anywhere in this form, and no schedule-type select. The
   * only things an admin can express are WHICH ROUND and, when it is hybrid,
   * WHICH MODE.
   */
  for (const classId of ['r-open', 'r-hybrid']) {
    const markup = form({ classId });
    assert.ok(!/<input\b/.test(markup), `a text input is back in the round form (${classId})`);
    assert.ok(!markup.includes('ประเภทรอบ'), 'the schedule-type select is back');
    assert.ok(!markup.includes('วันที่อบรม'), 'the free-text date field is back');
  }
  // Exactly one select for a non-hybrid round, two for a hybrid one.
  assert.equal((form({ classId: 'r-open' }).match(/<select\b/g) ?? []).length, 1);
  assert.equal((form({ classId: 'r-hybrid' }).match(/<select\b/g) ?? []).length, 2);
});

test('the form says the server will derive the rest', () => {
  // Moving someone between rounds changes the day they are expected — the one
  // edit here where a mis-click has a person turning up on the wrong date. The
  // consequence is stated where the decision is made, not after the click.
  assert.match(form(), /ระบบจะบันทึกวันที่และรูปแบบของรอบที่เลือกให้อัตโนมัติ/);
});
