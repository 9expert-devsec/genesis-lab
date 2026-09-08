import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCtaButtons,
  ctaEditorRows,
  ctaIsEmpty,
  MAX_CTA_BUTTONS,
} from '@/lib/pageBuilder/ctaButtons';

/**
 * ── ROUND C: THE COMPATIBILITY RULE IS THE SUBJECT ──────────────────────
 *
 * `cta` grew a `buttons` array. Every cta stored before that reads back with
 * the key ABSENT — `.lean()` applies no Mongoose defaults and a JSON round trip
 * drops `undefined` — so absent has to resolve to the legacy pair or every
 * published page loses its buttons with nobody touching anything.
 *
 * That makes this file's real subject PRECEDENCE and FAIL-CLOSED, not "does an
 * array map to a list". The tests are ordered accordingly: what absent means,
 * what present means, and what each of them refuses to draw.
 */

const LEGACY = {
  buttonLabel: 'สมัครเลย',
  buttonHref: 'https://9expert.co.th/register',
  secondaryButtonLabel: 'ดูตารางอบรม',
  secondaryButtonHref: '/schedule',
};

// ── absent `buttons` ⇒ the legacy pair ────────────────────────────────────

test('absent buttons + the legacy pair ⇒ two buttons, in the legacy order', () => {
  const out = resolveCtaButtons(LEGACY);
  assert.equal(out.length, 2);
  // ORDER, asserted rather than assumed: the primary has always been drawn
  // first, and a resolver that returned the pair reversed would still produce
  // "two buttons" and would silently swap every stored cta's emphasis.
  assert.equal(out[0].label, 'สมัครเลย');
  assert.equal(out[0].href, 'https://9expert.co.th/register');
  assert.equal(out[1].label, 'ดูตารางอบรม');
  assert.equal(out[1].href, '/schedule');
  // Neither carries a style: the CASCADE decides (first = section accent, later
  // = outline), and a resolver inventing one here would freeze that cascade
  // into the data.
  assert.equal(out[0].style, undefined);
  assert.equal(out[1].style, undefined);
});

test('absent buttons + primary only ⇒ one button', () => {
  const out = resolveCtaButtons({
    buttonLabel: 'สมัครเลย',
    buttonHref: 'https://9expert.co.th/register',
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].label, 'สมัครเลย');
});

test('absent buttons + a label with no href ⇒ zero buttons (the pair guard)', () => {
  /**
   * The guard the first button has had since it existed: a label with no href
   * draws nothing rather than a dead button, and an href with no label draws
   * nothing rather than an empty one. Both directions, because they fail for
   * different reasons and a resolver could easily catch one.
   */
  assert.equal(resolveCtaButtons({ buttonLabel: 'สมัครเลย' }).length, 0);
  assert.equal(resolveCtaButtons({ buttonHref: 'https://9expert.co.th' }).length, 0);
  assert.equal(resolveCtaButtons({ buttonLabel: '   ', buttonHref: 'https://9expert.co.th' }).length, 0);
  // ...and a broken PRIMARY does not take the secondary down with it.
  const out = resolveCtaButtons({
    buttonLabel: 'สมัครเลย',
    secondaryButtonLabel: 'ดูตารางอบรม',
    secondaryButtonHref: '/schedule',
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].label, 'ดูตารางอบรม');
});

test('an unsafe legacy href is refused by the same guard', () => {
  assert.equal(
    resolveCtaButtons({ buttonLabel: 'x', buttonHref: 'javascript:alert(1)' }).length,
    0,
  );
});

// ── present `buttons` ⇒ the legacy fields are ignored ─────────────────────

test('CONTROL — a present buttons array wins, and the legacy fields are IGNORED', () => {
  /**
   * The precedence assertion, and it is a control as much as a feature test:
   * the fixture sets BOTH, so a resolver that concatenated them, or that
   * preferred the legacy pair, or that fell back whenever the array was
   * "short", would produce a different length or a different first label. Only
   * a resolver that genuinely chooses the array passes.
   */
  const out = resolveCtaButtons({
    ...LEGACY,
    buttons: [{ label: 'ปุ่มใหม่', href: 'https://9expert.co.th/new' }],
  });
  assert.equal(out.length, 1, 'the legacy pair leaked into the result');
  assert.equal(out[0].label, 'ปุ่มใหม่');
  assert.equal(out[0].href, 'https://9expert.co.th/new');
  assert.ok(!out.some((b) => b.label === 'สมัครเลย'), 'a legacy button was rendered alongside the array');
});

test('an EMPTY array falls back to the legacy pair; a non-empty one never does', () => {
  /**
   * The two ends of the same rule, and they differ on purpose.
   *
   * `buttons: []` is indistinguishable from absent for a document that was
   * SAVED through the schema — `.default([])` writes an empty array — so it has
   * to mean the same thing, or opening and saving a stored cta without touching
   * it would delete its buttons.
   *
   * A NON-EMPTY array whose rows all fail the guard resolves to ZERO, not to
   * the legacy pair. The author has a list; the answer for a list of broken
   * rows is "no buttons", not "the two you had before".
   */
  assert.equal(resolveCtaButtons({ ...LEGACY, buttons: [] }).length, 2);
  assert.equal(resolveCtaButtons({ ...LEGACY, buttons: [{ label: 'x', href: '' }] }).length, 0);
});

test('an unsafe href in the array is dropped, and the rest survive', () => {
  const out = resolveCtaButtons({
    buttons: [
      { label: 'ดี', href: 'https://9expert.co.th' },
      { label: 'ร้าย', href: 'javascript:alert(1)' },
      { label: 'ดีอีก', href: '/schedule' },
    ],
  });
  assert.deepEqual(out.map((b) => b.label), ['ดี', 'ดีอีก'],
    'a refused row took its neighbours with it, or was rendered anyway');
});

test('a per-button style survives; an unknown one is treated as ABSENT', () => {
  /**
   * Unknown is NOT a third meaning, and the reason is specific:
   * `accentButtonClass` falls back to `primary` for a value it does not know,
   * so passing a typo through would turn a LATER button into a second accent
   * fill — the exact arrangement round 57 argued against. Absent keeps the
   * cascade; unknown must land on absent, not on primary.
   */
  const out = resolveCtaButtons({
    buttons: [
      { label: 'a', href: '/a', style: 'outline' },
      { label: 'b', href: '/b', style: 'PRIMARY' },
      { label: 'c', href: '/c', style: 'neon' },
      { label: 'd', href: '/d' },
    ],
  });
  assert.deepEqual(out.map((b) => b.style), ['outline', undefined, undefined, undefined]);
});

test('a hand-seeded newTab is INERT — it is not part of a button', () => {
  /**
   * The field was removed whole, reads included. It could never be written —
   * no control offered it and the schema never defaulted it — so the only way
   * to set one was to edit the database by hand, which on this system means
   * editing production. A value that is honoured at render but invisible to
   * the panel cannot be seen, explained or undone by the author who owns the
   * page, which is why "read it if it is there" was the wrong compromise.
   *
   * Asserted on the RESOLVER's output rather than by grepping for the word, so
   * re-adding the read without re-adding a control turns this red. Whether a
   * link opens a tab is derived from the href, and nothing overrides it — see
   * the decision block in lib/pageBuilder/ctaButtons.js for the measurement
   * that closed this and the condition that would reopen it.
   */
  const out = resolveCtaButtons({
    buttons: [
      { label: 'a', href: '/a' },
      { label: 'b', href: '/b', newTab: true },
      { label: 'c', href: 'https://9expert.co.th', newTab: false },
    ],
  });
  assert.equal(out.length, 3, 'a seeded newTab changed which buttons render');
  for (const b of out) {
    assert.ok(!('newTab' in b), 'newTab survived into a resolved button');
  }
  // ...and the editor does not carry it back into storage either, so it cannot
  // reappear on a row an author edits.
  const rows = ctaEditorRows({ buttons: [{ label: 'a', href: '/a', newTab: true }] });
  assert.deepEqual(rows, [{ label: 'a', href: '/a' }]);
});

test('the cap is not enforced here — it is a UI bound, not a data truth', () => {
  /**
   * A hand-seeded document with more than four renders all of them. Truncating
   * would be a design bound silently deleting an author's content, and the
   * schema deliberately carries no `.max()` for the same reason.
   */
  const many = Array.from({ length: MAX_CTA_BUTTONS + 2 }, (_, i) => ({ label: `b${i}`, href: `/b${i}` }));
  assert.equal(resolveCtaButtons({ buttons: many }).length, MAX_CTA_BUTTONS + 2);
  assert.equal(MAX_CTA_BUTTONS, 4);
});

test('junk never throws — the document is untrusted', () => {
  for (const content of [null, undefined, {}, { buttons: 'nope' }, { buttons: [null, 7, 'x'] }]) {
    assert.deepEqual(resolveCtaButtons(content), [],
      `resolveCtaButtons(${JSON.stringify(content)}) did not degrade to []`);
  }
});

// ── the editor's rows are a DIFFERENT list, deliberately ──────────────────

test('the editor keeps a half-filled row the renderer refuses', () => {
  /**
   * If the panel seeded itself from `resolveCtaButtons`, a stored cta with a
   * label and no href would present ZERO rows — and the author's half-filled
   * data would be dropped the first time they touched anything. Fail-closed is
   * right for the render and wrong for the editor, so they are two functions.
   */
  assert.equal(resolveCtaButtons({ buttonLabel: 'สมัครเลย' }).length, 0);
  const rows = ctaEditorRows({ buttonLabel: 'สมัครเลย' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, 'สมัครเลย');
  assert.equal(rows[0].href, '');
});

test('the editor shows an unsafe href rather than hiding the row that has one', () => {
  const rows = ctaEditorRows({ buttons: [{ label: 'x', href: 'javascript:alert(1)' }] });
  assert.equal(rows.length, 1, 'the panel cannot warn about a row it does not show');
  assert.equal(rows[0].href, 'javascript:alert(1)');
});

test('a cta with nothing at all opens on an empty repeater, not two blank rows', () => {
  assert.deepEqual(ctaEditorRows({}), []);
  assert.deepEqual(ctaEditorRows({ buttons: [] }), []);
});

// ── the marker's half ─────────────────────────────────────────────────────

test('ctaIsEmpty is true only when nothing at all would be drawn', () => {
  assert.equal(ctaIsEmpty({}), true);
  assert.equal(ctaIsEmpty({ buttons: [] }), true, 'the case round C was asked about');
  assert.equal(ctaIsEmpty({ heading: '  ' }), true);
  assert.equal(ctaIsEmpty({ buttonLabel: 'x' }), true, 'a half-filled pair draws nothing, so it is empty');
  assert.equal(ctaIsEmpty({ heading: 'ก' }), false);
  assert.equal(ctaIsEmpty({ description: 'ก' }), false);
  assert.equal(ctaIsEmpty(LEGACY), false);
  assert.equal(ctaIsEmpty({ buttons: [{ label: 'a', href: '/a' }] }), false);
});
