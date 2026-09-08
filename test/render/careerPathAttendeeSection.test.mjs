import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Step2Form,
  Step3Preview,
} from '@/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient';
import { readSource } from '../sourceScan.mjs';

/**
 * THE ATTENDEE SECTION SAYS WHO ท่านที่ 1 IS, AND THE WRITE DID NOT MOVE.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 * With "ผู้ประสานงานเป็นผู้เข้าอบรม" ticked and 2 ผู้สมัคร, the heading read
 * "ข้อมูลผู้เข้าอบรม (1 ท่าน)" above a card labelled "ท่านที่ 2". The heading
 * counted FORMS and the card numbered PEOPLE — two lines a few pixels apart,
 * contradicting each other, with nothing on screen naming the person in slot 1.
 * At 1 ผู้สมัคร it was worse: `attendeeRows` was 0, the whole section was gated
 * away, and ticking the box made the attendee list vanish.
 *
 * ── WHAT THIS FILE HAS TO PROVE, AND WHY BOTH TIERS ARE HERE ────────────────
 * The commit is SCREEN-ONLY. Proving the screen changed is half of it; the other
 * half — the half that could break a customer's registration — is that the
 * SUBMITTED PAYLOAD did not. Those are two different claims about two different
 * pieces of code and neither test substitutes for the other:
 *
 *   RENDER   the coordinator's slot is not a FORM. If the mirror card had been
 *            built out of registered inputs, `attendees` would have gained a
 *            row at index 0 and every downstream reader — the admin detail, the
 *            review step, the mail — would double-count the coordinator. The
 *            assertions below count `attendees.N.` input names, because that
 *            count IS the array's length.
 *   SOURCE   the payload literal itself, byte-pinned against the text as it
 *            stood at commit b40f2543 (the commit before this one). A render
 *            test cannot see `handleConfirm`: it lives in the parent component
 *            and only runs on a confirm click three steps later.
 *
 * Mixing the two tiers in one file follows test/render/coordinatorCardRows,
 * which renders markup and reads source in the same way and for the same reason.
 *
 * ── PROBE DISCIPLINE ────────────────────────────────────────────────────────
 * Thai negates by PREFIX, so every affirmative label is a substring of its own
 * negation and a bare `includes()` cannot tell them apart. Every probe here is
 * bounded as `>label<` on a text node the component renders literally.
 */

const COORDINATOR = {
  contactFirstName: 'สมชาย',
  contactLastName: 'ใจดี',
  contactEmail: 'somchai@example.com',
  // NOT the `0xxxxxxxxx` placeholder — a probe for the placeholder matches
  // whether or not any data reached the component.
  contactPhone: '0891112222',
};

const EMPTY_ATTENDEE = { firstName: '', lastName: '', email: '', phone: '' };

const MIRROR_CARD = 'ผู้เข้าอบรมท่านที่ 1 (ผู้ประสานงาน)';
const MIRROR_NOTE = 'ข้อมูลนี้อ้างอิงจากผู้ประสานงานด้านบน ไม่สามารถแก้ไขได้ที่นี่';

/**
 * `Step2Form` owns its own `useForm`, so `defaultValues` is the whole harness —
 * no RHF wrapper is needed and none is written. `renderToStaticMarkup` runs no
 * effects, which is what makes this the FIRST render the user sees rather than
 * a repaired one.
 */
function html({ attendeeCount, isCoordinator, skipAttendee = false, attendees = [] }) {
  return renderToStaticMarkup(
    createElement(Step2Form, {
      defaultValues: {
        ...COORDINATOR,
        isCoordinator,
        attendeeCount,
        skipAttendee,
        attendees,
        note: '',
        invoice: {
          type: 'individual',
          country: 'TH',
          firstName: '',
          lastName: '',
          companyName: '',
          branchType: 'head_office',
          branchCode: '',
          branchFree: '',
          taxId: '',
          thaiAddress: {
            addressLine: '', subDistrict: '', district: '', province: '', postalCode: '',
          },
          internationalAddress: null,
        },
      },
      selected: {},
      curriculum: [],
      onBack: () => {},
      onSubmit: () => {},
    })
  );
}

/** How many attendee FORMS the markup registered — i.e. `attendees.length`. */
function typedRowCount(markup) {
  const names = markup.match(/name="attendees\.(\d+)\.firstName"/g) ?? [];
  return names.length;
}

/**
 * Occurrences of a text node, matched at its element boundaries.
 *
 * The label is ESCAPED before it becomes a pattern. Two of the strings this file
 * probes for carry parentheses — "(2 ท่าน)" and "(ผู้ประสานงาน)" — and an
 * unescaped `(` turns the probe into a group that matches nothing at all, which
 * reads as "the element is absent" rather than as a broken matcher.
 */
function countLabel(markup, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (markup.match(new RegExp(`>${escaped}<`, 'g')) ?? []).length;
}

// ── 1. The heading counts PEOPLE ────────────────────────────────────────────

test('ticked box, 2 ผู้สมัคร: the heading says 2 ท่าน, not 1', () => {
  const markup = html({ attendeeCount: 2, isCoordinator: true, attendees: [EMPTY_ATTENDEE] });

  assert.equal(countLabel(markup, 'ข้อมูลผู้เข้าอบรม (2 ท่าน)'), 1, 'the heading must count everyone');
  assert.equal(
    countLabel(markup, 'ข้อมูลผู้เข้าอบรม (1 ท่าน)'),
    0,
    'the heading is counting forms again — this is the defect verbatim'
  );
});

test('ticked box, 2 ผู้สมัคร: the coordinator is ท่านที่ 1 and there is ONE typed row', () => {
  const markup = html({ attendeeCount: 2, isCoordinator: true, attendees: [EMPTY_ATTENDEE] });

  assert.equal(countLabel(markup, MIRROR_CARD), 1, 'slot 1 is unnamed');
  assert.equal(
    typedRowCount(markup),
    1,
    'the coordinator gained a FORM — `attendees` would now carry them and every reader double-counts'
  );
  assert.match(markup, />ท่านที่ 2</, 'the typed row must still be numbered 2');
  assert.doesNotMatch(markup, />ท่านที่ 1</, 'the typed rows must not start at 1 when the box is ticked');
});

test('unticked, 2 ผู้สมัคร: no mirror card, two typed rows, still 2 ท่าน', () => {
  const markup = html({
    attendeeCount: 2,
    isCoordinator: false,
    attendees: [EMPTY_ATTENDEE, EMPTY_ATTENDEE],
  });

  assert.equal(countLabel(markup, 'ข้อมูลผู้เข้าอบรม (2 ท่าน)'), 1);
  assert.equal(countLabel(markup, MIRROR_CARD), 0, 'the coordinator is not attending — no slot 1 card');
  assert.equal(typedRowCount(markup), 2);
  assert.match(markup, />ท่านที่ 1</);
  assert.match(markup, />ท่านที่ 2</);
});

// ── 2. The case that used to disappear ──────────────────────────────────────

test('ticked box, 1 ผู้สมัคร: the section RENDERS, with the card and no form', () => {
  /**
   * `attendeeRows` is 0 here, and the old gate was `attendeeRows > 0` — so the
   * entire attendee section was hidden and the sole attendee was never shown.
   * Ticking a box that says "the coordinator is attending" removed the
   * attendees from the screen.
   */
  const markup = html({ attendeeCount: 1, isCoordinator: true, attendees: [] });

  assert.equal(countLabel(markup, 'ข้อมูลผู้เข้าอบรม (1 ท่าน)'), 1, 'the section must still render');
  assert.equal(countLabel(markup, MIRROR_CARD), 1);
  assert.equal(typedRowCount(markup), 0, 'there is nobody left to type in');
});

test('the mirror card shows the live coordinator and offers no control', () => {
  const markup = html({ attendeeCount: 1, isCoordinator: true, attendees: [] });

  assert.match(markup, />สมชาย ใจดี</, 'the card must name the coordinator');
  assert.ok(markup.includes('somchai@example.com'), 'the card must carry the coordinator email');
  assert.ok(markup.includes('0891112222'), 'the card must carry the coordinator phone');
  assert.equal(countLabel(markup, MIRROR_NOTE), 1, 'the card must say it is not editable here');

  // No input is registered for the coordinator's slot — the read-only claim.
  assert.doesNotMatch(markup, /name="attendees\.-?\d*\.?firstName"[^>]*value="สมชาย"/);
});

// ── 3. The opt-out path is untouched ────────────────────────────────────────

test('skipAttendee hides the section entirely, ticked box or not', () => {
  for (const isCoordinator of [true, false]) {
    const markup = html({ attendeeCount: 3, isCoordinator, skipAttendee: true });

    assert.equal(countLabel(markup, MIRROR_CARD), 0, `mirror card leaked with isCoordinator=${isCoordinator}`);
    assert.equal(typedRowCount(markup), 0, `typed rows leaked with isCoordinator=${isCoordinator}`);
    assert.equal(
      (markup.match(/>ข้อมูลผู้เข้าอบรม \(\d+ ท่าน\)</g) ?? []).length,
      0,
      `the section rendered with isCoordinator=${isCoordinator}`
    );
  }
});

// ── 4. THE WRITE DID NOT MOVE — byte-pinned ─────────────────────────────────

const CLIENT = readSource(
  'src/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient.jsx'
);

/**
 * The payload literal EXACTLY as it stood at b40f2543, the commit before this
 * one. Newlines only — `readSource` normalises the CRLF working tree, which is
 * what lets a byte comparison be written down here at all.
 *
 * This is the assertion the whole commit is for. A screen-only change that
 * quietly alters what is written is the failure mode, and it is invisible: the
 * form still submits, the action still returns ok, and the difference only
 * surfaces when someone reads the document back.
 */
const PAYLOAD_AT_B40F2543 = `      const payload = {
        careerPathId:    careerPath.career_path_id ?? String(careerPath._id ?? ''),
        careerName:      careerPath.title ?? '',
        careerSlug,
        selectedCourses,
        contactFirstName: formData.contactFirstName,
        contactLastName:  formData.contactLastName,
        contactEmail:     formData.contactEmail,
        contactPhone:     formData.contactPhone,
        isCoordinator:    formData.isCoordinator,
        attendeeCount:    formData.attendeeCount,
        skipAttendee:     formData.skipAttendee,
        attendees:        formData.skipAttendee ? [] : formData.attendees ?? [],
        ...taxPayload,
        note: formData.note,
      };`;

/** The payload literal as it stands now, sliced from the scrubbed source. */
function payloadNow() {
  const start = CLIENT.code.indexOf('      const payload = {');
  assert.notEqual(start, -1, 'the payload literal is gone — this guard has lost its subject');
  const end = CLIENT.code.indexOf('\n      };', start);
  assert.notEqual(end, -1, 'the payload literal is unterminated — the slice is unbounded');
  return CLIENT.code.slice(start, end + '\n      };'.length);
}

test('the submitted payload is BYTE-IDENTICAL to the commit before this one', () => {
  assert.equal(
    payloadNow(),
    PAYLOAD_AT_B40F2543,
    'this commit is screen-only — the write must not have moved'
  );
});

test('and `attendees` still carries only the TYPED rows', () => {
  /**
   * Stated separately from the byte pin because it is the CLAIM, and a byte pin
   * says only "unchanged" without saying what it is that must not change. If the
   * literal is ever legitimately reformatted, this survives the pin's rewrite.
   */
  assert.match(
    payloadNow(),
    /attendees:\s*formData\.skipAttendee \? \[\] : formData\.attendees \?\? \[\],/,
    'the coordinator must not be prepended at submit — option 3, decided in B1 §4'
  );
  assert.equal(
    /contactFirstName[\s\S]{0,80}attendees\.unshift|\[\{[^}]*contactFirstName[^}]*\}, ?\.\.\.formData\.attendees\]/.test(
      payloadNow()
    ),
    false,
    'the coordinator is being written into the array'
  );
});

// ── 5. Controls ─────────────────────────────────────────────────────────────

test('CONTROL: the heading probe DOES catch the pre-change heading', () => {
  // Without this the "(2 ท่าน)" assertions are vacuous — a matcher that cannot
  // fire reports success forever. Fired at the exact string the defect produced.
  const buggy = '<h2 class="x">ข้อมูลผู้เข้าอบรม (1 ท่าน)</h2><p>ท่านที่ 2</p>';
  assert.equal(countLabel(buggy, 'ข้อมูลผู้เข้าอบรม (1 ท่าน)'), 1);
  assert.equal(countLabel(buggy, 'ข้อมูลผู้เข้าอบรม (2 ท่าน)'), 0);
});

test('CONTROL: typedRowCount really counts, and the byte pin really fires', () => {
  assert.equal(typedRowCount('<input name="attendees.0.firstName"><input name="attendees.1.firstName">'), 2);
  assert.equal(typedRowCount('<input name="contactFirstName">'), 0);

  // One character's difference must be caught — a pin that tolerates drift is
  // not a pin.
  const drifted = PAYLOAD_AT_B40F2543.replace('note: formData.note,', 'note: formData.note ?? "",');
  assert.notEqual(drifted, PAYLOAD_AT_B40F2543, 'the mutation did not change anything');
  assert.throws(() => assert.equal(drifted, PAYLOAD_AT_B40F2543));
});

// ── 6. THE GHOST ROW — the review panel and the admin card ─────────────────

/**
 * The stored array can be LONGER than the slots it fills. Setting จำนวนผู้สมัคร
 * to 2 with the box unticked registers `attendees.0` and `attendees.1`; ticking
 * it re-renders one row, but the form leaves react-hook-form at its default
 * `shouldUnregister: false`, so index 1 survives into the payload.
 *
 * Every reader then rendered the coordinator PLUS both stored rows — three ท่าน
 * under a line reading "จำนวนผู้สมัคร 2 ท่าน", the third blank. A mail with that
 * table was actually sent, so this is not a screen-only defect and the fixture
 * below is the real document shape, not a contrived one.
 */
const GHOST_DOC = {
  contactFirstName: 'สมชาย',
  contactLastName: 'ใจดี',
  contactEmail: 'somchai@example.co.th',
  contactPhone: '0891112222',
  isCoordinator: true,
  attendeeCount: 2,
  skipAttendee: false,
  attendees: [
    { firstName: 'สมหญิง', lastName: 'รักเรียน', email: 'somying@example.co.th', phone: '0812223333' },
    // The ghost: registered while the box was unticked, never unregistered.
    { firstName: '', lastName: '', email: '', phone: '' },
  ],
  invoice: {},
  note: '',
};

const previewHtml = (data) =>
  renderToStaticMarkup(
    createElement(Step3Preview, {
      curriculum: [],
      selected: {},
      data,
      onBack: () => {},
      onConfirm: () => {},
      submitting: false,
      error: null,
    })
  );

/**
 * The ท่านที่ numbers the review panel printed, in order.
 *
 * Anchored on the opening `>` — a real element boundary — rather than on a bare
 * substring, because the row's text continues into interpolated names and there
 * is no closing `<` to bound it with.
 */
const rowNumbers = (markup) =>
  [...markup.matchAll(/>ท่านที่ (\d+) ·/g)].map((m) => Number(m[1]));

test('(ghost) the review panel renders attendeeCount rows, ticked', () => {
  const nums = rowNumbers(previewHtml(GHOST_DOC));

  assert.deepEqual(nums, [1, 2], 'the third, blank ท่าน is back');
  assert.equal(nums.length, GHOST_DOC.attendeeCount, 'row count must equal attendeeCount');
  assert.equal(GHOST_DOC.attendees.length, 2, 'the fixture must actually carry a ghost');
});

test('(ghost) the review panel renders attendeeCount rows, UNticked', () => {
  // Not correct by luck: three stored rows against a count of 2 breaks the
  // unticked path in exactly the same way, so it is capped too.
  const nums = rowNumbers(
    previewHtml({
      ...GHOST_DOC,
      isCoordinator: false,
      attendees: [
        ...GHOST_DOC.attendees.slice(0, 1),
        { firstName: 'ปิติ', lastName: 'มานะ', email: 'piti@example.co.th', phone: '0823334444' },
        { firstName: '', lastName: '', email: '', phone: '' },
      ],
    })
  );

  assert.deepEqual(nums, [1, 2]);
});

test('(ghost) the review panel never invents a row it has no data for', () => {
  /**
   * The cap is a CAP. A request for three people with only one name typed shows
   * the coordinator and that one name — not a blank third. Padding to the count
   * is the defect, spelled the other way round.
   */
  const nums = rowNumbers(
    previewHtml({ ...GHOST_DOC, attendeeCount: 3, attendees: [GHOST_DOC.attendees[0]] })
  );
  assert.deepEqual(nums, [1, 2], 'a row was invented for a person nobody named');
});

test('(ghost) the opt-out panel is unaffected', () => {
  const markup = previewHtml({ ...GHOST_DOC, skipAttendee: true });
  assert.deepEqual(rowNumbers(markup), []);
  assert.equal(countLabel(markup, 'ยังไม่ประสงค์แจ้งรายชื่อ — ทีมขายจะติดต่อกลับ'), 1);
});

/**
 * The admin detail card is a `'use server'`-adjacent async SERVER component that
 * calls `requirePage` and reads Mongo inside itself, so there is no props seam
 * to render it through and no stub for its guard. Source-scanned instead, and
 * the limit is stated rather than left to be discovered: this pins that the
 * card maps the CAPPED list and that the helper computes the cap, not that a
 * browser draws two rows.
 */
const ADMIN_PAGE = readSource('src/app/admin/career-path-registrations/[id]/page.jsx');

function linesMatching(raw, re) {
  return raw
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => re.test(line))
    .map(([n]) => n);
}

function soleLineOf(raw, re, label) {
  const hits = linesMatching(raw, re);
  assert.equal(hits.length, 1, `${label}: expected exactly one line, found ${hits.length}`);

  const [line] = hits;
  assert.notEqual(line, undefined, `${label}: no line number was computed`);
  assert.equal(typeof line, 'number', `${label}: line number is not numeric`);
  assert.ok(Number.isInteger(line) && line > 0, `${label}: ${line} is not a real line number`);

  console.log(`[careerPathAttendeeSection] ${label} → line ${line}`);
  return line;
}

test('(ghost) the admin card maps the CAPPED list, not the raw array', () => {
  const importLine = soleLineOf(
    ADMIN_PAGE.raw,
    /^import \{ typedAttendeeRows \} from '@\/lib\/registration\/careerPathRoster';$/,
    'the admin import'
  );
  const callSite = soleLineOf(ADMIN_PAGE.raw, /typedAttendeeRows\(reg\)\.map\(/, 'the admin call site');
  assert.ok(importLine < callSite, `the import (${importLine}) must precede its use (${callSite})`);

  // The raw array must not be what is mapped any more — that IS the defect.
  assert.equal(
    /\(reg\.attendees \?\? \[\]\)\.map\(/.test(ADMIN_PAGE.code),
    false,
    'the admin card is mapping the uncapped array again'
  );
});

test('(ghost) all three surfaces IMPORT the one roster helper', () => {
  /**
   * ── THIS GUARD CHANGED SHAPE WITH THE CODE, AND THAT IS THE POINT ─────────
   * It used to assert the three surfaces carried the same cap EXPRESSION, by
   * text. That was the right shape while the arithmetic was duplicated — the
   * three live in a server component, a client component and a pure module, and
   * a fix to one that missed the others is exactly how the ghost row survived
   * commit 3.
   *
   * There is one definition now (lib/registration/careerPathRoster), so matching
   * its text in three places would pin a copy that no longer exists and would go
   * red on a rename of a local variable inside it. Worse, leaving BOTH guards
   * standing invites the next person to edit the guard instead of the code.
   *
   * The claim that survives is the one that still means something: all three
   * read the same definition, and none of them has grown a private copy back.
   */
  const HELPER = '@/lib/registration/careerPathRoster';

  const surfaces = {
    'admin detail': ADMIN_PAGE,
    'review panel': CLIENT,
    'mail model': readSource('src/lib/email/models/careerPathRegistrationModel.js'),
  };

  for (const [name, src] of Object.entries(surfaces)) {
    // `withImports`, deliberately: `code` strips import statements, so this
    // assertion read from it would pass vacuously on every file.
    assert.ok(
      src.withImports.includes(`from '${HELPER}'`),
      `${name} does not import the roster helper`
    );

    // And no local re-definition. A second copy beside the import is how one
    // caller silently stops following the shared rule.
    assert.equal(
      /function (typedAttendeeRows|participantCount)\s*\(/.test(src.code),
      false,
      `${name} defines its own copy of the roster arithmetic`
    );
  }
});

test('(ghost) the helper is dependency-free, so the pure tier can import it', () => {
  /**
   * The condition that made three copies necessary in the first place: the mail
   * model states its own purity — no env, no db, no clock — and could not have
   * imported a helper that broke it. Asserted rather than assumed, because the
   * cost of breaking it is that a future edit re-duplicates the arithmetic
   * instead of fixing the import.
   */
  const helper = readSource('src/lib/registration/careerPathRoster.js');

  for (const banned of [/process\.env/, /new Date\(/, /Date\.now\(/, /require\(/, /from ['"]next\//, /from ['"]react/, /dbConnect/, /@\/models\//]) {
    assert.equal(banned.test(helper.withImports), false, `the helper reached for ${banned}`);
  }

  // It imports nothing at all, which is the strongest form of that claim.
  assert.equal(/^import /m.test(helper.withImports), false, 'the helper grew a dependency');
  assert.match(helper.code, /export function participantCount\(/);
  assert.match(helper.code, /export function typedAttendeeRows\(/);
});

test('(ghost) CONTROL: the row counter and the cap matcher both fire', () => {
  // Without this the deepEqual([1,2]) assertions are vacuous — a counter that
  // matches nothing reports [] and an empty list is not [1,2], but a counter
  // that matched the WRONG thing would still look plausible.
  assert.deepEqual(rowNumbers('<div>ท่านที่ 1 · ก</div><div>ท่านที่ 2 · ข</div>'), [1, 2]);
  assert.deepEqual(rowNumbers('<div>ท่านที่ 1 · ก</div><div>ท่านที่ 2 · ข</div><div>ท่านที่ 3 · </div>'), [1, 2, 3]);
  assert.deepEqual(rowNumbers('<p>ผู้เข้าอบรมท่านที่ 1 (ผู้ประสานงาน)</p>'), [], 'the mirror card is not a row');

  // And the import probes fire on planted text, in both directions — otherwise
  // "all three import the helper" and "none re-defines it" are both vacuous.
  assert.ok("import { typedAttendeeRows } from '@/lib/registration/careerPathRoster';".includes(
    "from '@/lib/registration/careerPathRoster'"
  ));
  assert.ok(/function (typedAttendeeRows|participantCount)\s*\(/.test('function typedAttendeeRows(reg) {'));
  assert.equal(/function (typedAttendeeRows|participantCount)\s*\(/.test('typedAttendeeRows(reg).map('), false);
});

test('CONTROL: the render and the reader both produced real content', () => {
  // Every "does not match" and every count-of-zero above passes on an empty
  // string, and both a failed render and a failed read are silent.
  const markup = html({ attendeeCount: 2, isCoordinator: true, attendees: [EMPTY_ATTENDEE] });
  assert.ok(markup.length > 3000, 'the step rendered something substantial');
  assert.equal(countLabel(markup, 'ข้อมูลผู้ประสานงาน'), 1, 'the step rendered its first section');
  assert.ok(CLIENT.code.length > 20000, 'the client was actually read');
});
