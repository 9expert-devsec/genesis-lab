import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { AttendeesList } from '@/components/registration/AttendeesList';

/**
 * The opt-out checkbox disappears when there is exactly ONE attendee and it is
 * the coordinator — the mirror card below it already IS the complete list, so
 * the checkbox asks the user to decline naming someone they have just named.
 *
 * ── THE VACUOUS-PROBE TRAP, AVOIDED ────────────────────────────────────────
 * `0812345678` is a PLACEHOLDER on AttendeeBlock, so probing for it matches
 * whether or not any data reached the component. This repo has shipped that
 * mistake three times. Every probe below is a label the component renders
 * literally, and each is bounded as `>label<` — Thai negates by PREFIX, so
 * every affirmative label is a substring of its own negation and a bare
 * `includes()` cannot tell "แจ้งรายชื่อ" from "ยังไม่ประสงค์แจ้งรายชื่อ".
 */

const OPT_OUT   = 'ยังไม่ประสงค์แจ้งรายชื่อผู้เข้าอบรม';
const LATER_NOTE = 'แจ้งรายชื่อผู้เข้าอบรมภายหลัง';
const MIRROR_CARD = 'ผู้เข้าอบรมท่านที่ 1 (ผู้ประสานงาน)';

const COORDINATOR = {
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  email: 'somchai@example.com',
  // NOT the placeholder — see the header note.
  phone: '0891112222',
};

/**
 * AttendeesList takes RHF bindings, so the harness owns a real useForm.
 * renderToStaticMarkup runs no effects, which is exactly the point: it shows
 * what the user sees on the render where the count DROPS back to 1, before any
 * effect has had a chance to repair the flag.
 */
function Harness({ defaultValues }) {
  const { control, register, watch, setValue, formState: { errors } } = useForm({ defaultValues });
  return createElement(AttendeesList, { control, register, watch, setValue, errors });
}

const html = (values) =>
  renderToStaticMarkup(
    createElement(Harness, {
      defaultValues: {
        coordinator: { ...COORDINATOR, isAttending: true },
        attendeesCount: 1,
        attendeesListProvided: true,
        attendees: [],
        ...values,
      },
    })
  );

/** Text as an ELEMENT's whole content, not as a loose substring. */
const hasLabel = (out, label) => out.includes(`>${label}<`);

// ── The hide condition ──────────────────────────────────────────────────────

test('checkbox is ABSENT when the coordinator is attending and the count is 1', () => {
  const out = html({});
  assert.equal(hasLabel(out, OPT_OUT), false, 'the opt-out must not render');
  assert.ok(out.includes(MIRROR_CARD), 'and the mirror card IS the list');
});

test('checkbox is PRESENT when the count is 2', () => {
  const out = html({ attendeesCount: 2 });
  assert.ok(hasLabel(out, OPT_OUT), 'a second, unnamed attendee is something to opt out of');
});

test('checkbox is PRESENT when the coordinator is NOT attending, even at count 1', () => {
  const out = html({ coordinator: { ...COORDINATOR, isAttending: false } });
  assert.ok(hasLabel(out, OPT_OUT));
  assert.equal(out.includes(MIRROR_CARD), false, 'and there is no mirror card to stand in for the list');
});

// ── THE TRANSITION ──────────────────────────────────────────────────────────

test('THE TRAP: count 2 → opt out → back to 1 does not leave the flag stuck false', () => {
  /**
   * The checkbox is the ONLY control for `attendeesListProvided`. Set the count
   * to 2, tick the opt-out, drop back to 1: the checkbox vanishes and the flag
   * stays false. Step 2 then tells the user "ยังไม่ระบุรายชื่อผู้เข้าอบรม"
   * about a sole attendee it has the full name, email and phone of — and the
   * confirmation email says the same.
   *
   * This is the exact post-transition state, rendered. The repair is a derived
   * value and not only an effect, precisely so that this render is already
   * correct.
   */
  const out = html({ attendeesCount: 1, attendeesListProvided: false });

  assert.equal(hasLabel(out, OPT_OUT), false, 'the checkbox is gone');
  assert.equal(out.includes(LATER_NOTE), false, '…and so is the "we will collect the names later" note');
  assert.ok(out.includes(MIRROR_CARD), 'the coordinator is shown as the attendee, which is the truth');
});

test('CONTROL: the same stuck flag at count 2 DOES show the note', () => {
  // Without this, a component that had simply stopped rendering the note at all
  // would pass the test above.
  const out = html({ attendeesCount: 2, attendeesListProvided: false });
  assert.ok(out.includes(LATER_NOTE), 'the opt-out state must still be visible where it is reachable');
  assert.ok(hasLabel(out, OPT_OUT));
});

test('CONTROL: the `>label<` probe is not vacuous — it fires on a rendered label', () => {
  // Proves the boundary form matches real markup. If `>OPT_OUT<` could never
  // match anything, all three absence assertions above would be free passes.
  assert.ok(hasLabel(html({ attendeesCount: 2 }), OPT_OUT));
});

test('CONTROL: a bare substring probe CANNOT tell the two Thai labels apart', () => {
  // Thai negates by prefix: 'แจ้งรายชื่อผู้เข้าอบรมภายหลัง' contains
  // 'แจ้งรายชื่อผู้เข้าอบรม', and the opt-out label contains it too. This is why
  // every probe above is bounded.
  assert.ok(OPT_OUT.includes('แจ้งรายชื่อผู้เข้าอบรม'));
  assert.ok(LATER_NOTE.includes('แจ้งรายชื่อผู้เข้าอบรม'));
});
