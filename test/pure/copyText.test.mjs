import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COPY_FIELD_SEPARATOR,
  attendeeCopyText,
  rosterCopyText,
  personCopyText,
} from '@/lib/registrations/copyText';

/**
 * THE TEXT SHAPE OF EVERY MULTI-VALUE COPY, PINNED IN ONE PLACE.
 *
 * The module exists so that three cards cannot grow three formats. These tests
 * are the half that makes that true rather than merely intended: they pin the
 * separator, the field ORDER, and — the one that actually bites — what happens
 * to a missing field.
 *
 * Pure tier: the module imports nothing.
 */

const A = { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' };
const TAB = COPY_FIELD_SEPARATOR;

test('the separator is a TAB, and that is a decision about where this is pasted', () => {
  /**
   * Tab-separated text pastes into adjacent CELLS in Excel and Google Sheets;
   * comma-separated lands in one cell and has to be split by hand. Names and
   * addresses contain commas and do not contain tabs.
   *
   * Pinned as a value rather than left implicit in three template literals,
   * because the day one of them uses a comma is the day a pasted roster stops
   * lining up and nobody can say which control produced it.
   */
  assert.equal(COPY_FIELD_SEPARATOR, '\t');
  assert.ok(!attendeeCopyText(A).includes(','), 'an attendee copy contains a comma');
});

test('one attendee is name, email, phone — in that order', () => {
  assert.equal(attendeeCopyText(A), `สมชาย ใจดี${TAB}somchai@example.com${TAB}0812345678`);
  // The name is the two parts joined and trimmed — the same shape the table's
  // name cell renders, not a third spelling of it.
  assert.ok(attendeeCopyText(A).startsWith('สมชาย ใจดี'));
});

test('a MISSING field keeps its column — the trailing tab is the point', () => {
  /**
   * ── THE ONE THAT ACTUALLY BITES ───────────────────────────────────────────
   * Round 8 made email and phone optional, so rows with gaps are ordinary now.
   * If a missing field were DROPPED rather than emptied, pasting five attendees
   * would put the phone in column C for some rows and column B for others — a
   * block that looks fine until someone sorts it, which is the worst kind of
   * broken.
   *
   * So the shape is POSITIONAL. A row with no phone ends in a tab, and that
   * trailing tab is invisible and load-bearing.
   */
  assert.equal(attendeeCopyText({ ...A, phone: '' }), `สมชาย ใจดี${TAB}somchai@example.com${TAB}`);
  assert.equal(attendeeCopyText({ ...A, email: '' }), `สมชาย ใจดี${TAB}${TAB}0812345678`);
  assert.equal(attendeeCopyText({ firstName: 'ก', lastName: 'ข', email: '', phone: '' }), `ก ข${TAB}${TAB}`);

  // Every row has the same number of columns, whatever it holds. This is the
  // claim in the form the spreadsheet actually cares about.
  const rows = [A, { ...A, phone: '' }, { ...A, email: '', phone: '' }];
  const widths = new Set(rows.map((r) => attendeeCopyText(r).split(TAB).length));
  assert.equal(widths.size, 1, `rows copied at ${[...widths]} columns — a paste would not line up`);
});

test('a row with NOTHING in it copies as the empty string, not two bare tabs', () => {
  /**
   * The absent-means-absent rule, at the clipboard. Two tabs look like nothing
   * on screen and ARE nothing to the user: they press copy, paste, and see no
   * change — which reads as the button being broken rather than as the row
   * being empty.
   *
   * The empty string is what lets the caller drop the control entirely, which is
   * what the attendee row menu does.
   */
  assert.equal(attendeeCopyText({ firstName: '', lastName: '', email: '', phone: '' }), '');
  assert.equal(attendeeCopyText({}), '');
  assert.equal(attendeeCopyText(undefined), '');
  assert.equal(attendeeCopyText(null), '');
  // Whitespace is not a value — the same rule the server applies with `.trim()`.
  assert.equal(attendeeCopyText({ firstName: '  ', lastName: '\t', email: ' ', phone: '' }), '');
});

test('CONTROL: a row with ANY one field is NOT empty', () => {
  // Without this, a function returning '' for everything would satisfy every
  // assertion above and silently remove the copy control from every row.
  for (const field of ['firstName', 'lastName', 'email', 'phone']) {
    const row = { firstName: '', lastName: '', email: '', phone: '', [field]: 'x' };
    assert.notEqual(attendeeCopyText(row), '', `a row holding only ${field} copied as empty`);
  }
});

test('a roster is one attendee per line, with empty rows DROPPED', () => {
  /**
   * Dropped rather than emitted as blank lines: a blank line in the middle of a
   * pasted block is a row the spreadsheet still counts, and the admin has to
   * find and delete it.
   */
  const blank = { firstName: '', lastName: '', email: '', phone: '' };
  const text = rosterCopyText([A, blank, { ...A, firstName: 'สมหญิง' }]);
  assert.equal(text.split('\n').length, 2, 'the empty row was emitted as a blank line');
  assert.ok(text.startsWith('สมชาย ใจดี'));
  assert.ok(text.endsWith('0812345678'));

  // A roster of nothing but empty rows copies as nothing, by the same rule.
  assert.equal(rosterCopyText([blank, blank]), '');
  assert.equal(rosterCopyText([]), '');
  assert.equal(rosterCopyText(undefined), '');
  // A non-array does not throw — `attendees` comes off a lean() document.
  assert.equal(rosterCopyText('not an array'), '');
});

test('a person’s name is one rule for all three shapes on these screens', () => {
  /**
   * The public coordinator, an attendee and the in-house contact all copy their
   * name through this. One function rather than three, because a screen that
   * spelled one of them differently would be copying something the reader did
   * not see.
   */
  assert.equal(personCopyText({ firstName: 'สมชาย', lastName: 'ใจดี' }), 'สมชาย ใจดี');
  assert.equal(personCopyText({ firstName: 'สมชาย', lastName: '' }), 'สมชาย');
  assert.equal(personCopyText({ firstName: '', lastName: 'ใจดี' }), 'ใจดี');
  assert.equal(personCopyText({ firstName: '  ', lastName: ' ' }), '', 'whitespace produced a name');
  assert.equal(personCopyText({}), '');
  assert.equal(personCopyText(undefined), '');

  // …and it agrees with the attendee row's first column, or the two controls on
  // one row would copy the same person's name two ways.
  assert.ok(attendeeCopyText(A).startsWith(personCopyText(A)));
});
