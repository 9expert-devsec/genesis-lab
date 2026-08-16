import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import {
  PUBLIC_STATUS_TRANSITIONS,
  INHOUSE_STATUS_TRANSITIONS,
  PUBLIC_STATUS_VALUES,
  INHOUSE_STATUS_VALUES,
} from '@/lib/registrations/statuses';

/**
 * ── THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT ────────
 *
 * RegistrationDetailClient MUST NOT CONTAIN A HAND-WRITTEN STATUS-ACTION MAP.
 *
 * The defect, stated exactly: the file held
 *
 *   const STATUS_ACTIONS = { pending: ['confirmed','cancelled'],
 *                            confirmed: ['paid','cancelled'],
 *                            paid: ['cancelled'], cancelled: ['pending'] };
 *
 * and `updateRegistrationStatus` validated only that the TARGET was a member of
 * the public status set — never the current state. So every rule about which
 * moves were legal lived in that literal, in a CLIENT component. In a Next app
 * every `'use server'` export is a POST endpoint, so the rules were a convention
 * the client was trusted to follow rather than anything enforced. The same
 * shape has already cost this repo once, in applyArticlePositionPlan.
 *
 * A test asserting "the buttons are right" would not have caught it — the
 * buttons WERE right. What was wrong is that they were the only copy. So the
 * assertion has to be about the SHAPE of the file: the actions are a lookup
 * into the shared table, and no second table exists here to disagree with it.
 *
 * The companion assertions live in fs/publicStatusWriteGate (the server does
 * the check) and render/registrationCancelledReadOnly (the buttons that reach
 * the screen match the table for every status).
 */

const DETAIL = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');

// ── 1. No second copy of the rules ─────────────────────────────────────────

test('the detail client contains NO hand-written status-action map', () => {
  assert.ok(!/STATUS_ACTIONS/.test(DETAIL.code), 'the STATUS_ACTIONS literal is back');
});

test('no object literal in the file maps a status to a list of statuses', () => {
  // Broader than the name — renaming the constant must not evade the rule. This
  // matches the SHAPE: an entry whose key is a public status and whose value is
  // an array of quoted strings.
  for (const status of Object.keys(PUBLIC_STATUS_TRANSITIONS)) {
    const asTransitionEntry = new RegExp(String.raw`${status}\s*:\s*\[\s*'`);
    assert.ok(
      !asTransitionEntry.test(DETAIL.code),
      `a transition table keyed by \`${status}\` is back in the client`
    );
  }
});

test('the actions are a lookup into the shared table', () => {
  assert.match(DETAIL.code, /const statusActions = allowedTransitions\(status\)/);
});

/**
 * IMPORT-SHAPED RULE — reads `withImports`, with the control below.
 *
 * sourceScan's CODE view strips imports, so a rule about what a file imports
 * read from `code` sees no import statements at all and passes on any file.
 *
 * ── WIDENED, NOT WEAKENED, WHEN THE COLOUR JOINED THE MODULE ────────────────
 *
 * This named the exact two-binding import
 * `{ allowedTransitions, buildStatusLabels }`. Round 3 folded the status CHIP
 * COLOUR into the module too, so the detail client now takes three bindings
 * (`allowedTransitions, statusBadge, statusLabel`) and holds no local map of
 * any kind.
 *
 * Pinning the literal spelling of an import list means every future addition
 * reddens a test that has no opinion about additions. So the rule is restated
 * over what it was actually protecting — that each of these THREE things comes
 * from the module — and it is now STRICTER than the original: it names three
 * bindings where the old one named two, and the two `no local map` assertions
 * below close the other half.
 */
test('the detail client takes its table, labels AND chip colours from the module', () => {
  for (const binding of ['allowedTransitions', 'statusLabel', 'statusBadge']) {
    assert.match(
      DETAIL.withImports,
      new RegExp(String.raw`import\s*\{[^}]*\b${binding}\b[^}]*\}\s*from\s*'@/lib/registrations/statuses'`),
      `${binding} is not imported from the shared status module`
    );
  }
});

test('the detail client holds no local status colour map', () => {
  // The literal this fold removed. It was one of FOUR copies; a status added to
  // the module without an entry here rendered an unstyled chip on this screen
  // only. Matched on the SHAPE — a status key mapped to a Tailwind colour pair —
  // so renaming the constant does not evade it.
  assert.ok(
    !/STATUS_BADGE\s*=/.test(DETAIL.code),
    'the STATUS_BADGE literal is back in the detail client'
  );
  assert.ok(
    !/\b(pending|confirmed|paid|cancelled)\s*:\s*'bg-/.test(DETAIL.code),
    'a status→colour literal is back under a different name'
  );
});

test('the chip reads its colour through the shared lookup', () => {
  assert.match(DETAIL.code, /statusBadge\(status\)/,
    'the badge is not derived from the module');
  // And the per-call-site fallback is gone with it: the `??` now lives inside
  // `statusBadge`, so a caller cannot forget it or choose a different neutral.
  assert.ok(
    !/statusBadge\(status\)\s*\?\?/.test(DETAIL.code),
    'a local fallback is back beside the shared lookup'
  );
});

test('CONTROL: the CODE view really does strip that import', () => {
  // If this is inert, the assertion above proves nothing about this file.
  assert.ok(
    DETAIL.withImports.includes("from '@/lib/registrations/statuses'"),
    'withImports keeps the import line'
  );
  assert.ok(
    !DETAIL.code.includes("from '@/lib/registrations/statuses'"),
    'the control is inert — code did NOT strip the import'
  );
});

// ── 2. The presentation maps carry only reachable targets ──────────────────

/**
 * ── WIDENED TO THREE MAPS IN ROUND 4, NOT RELAXED ──────────────────────────
 *
 * The status bar has two slots — a 100x38 primary button and a 39x38 "•••" menu
 * — and the button cannot hold 'บันทึกส่งใบเสนอราคาแล้ว' at 100px. So a third
 * presentation map, ACTION_SHORT, carries the button's wording while
 * ACTION_LABEL stays canonical for the menu and the button's `title`.
 *
 * A third map is a third thing to drift, and ON SCREEN the drift does not look
 * like one. The call site falls back with `??`, so a target dropped from
 * ACTION_SHORT renders the canonical label inside a 100px button — a label too
 * long for its box, which reads as a styling problem rather than as two maps
 * disagreeing. That fallback is deliberate and matches the `.filter` on
 * ACTION_LABEL: degrade to something visible, never to something invisible.
 *
 * MEASURED, and the measurement corrected the first draft of this note. The
 * break reddens in TWO tiers, not one: here, and in the render tier, whose
 * `offeredTargets` recognises the primary slot by the button's exact short
 * wording and stops recognising the action at all. The empty-content guards do
 * stay green, because nothing goes empty — see
 * scripts/_rehearse-detail-restyle-controls.mjs, case 4.
 *
 * So the pinning covers all three key sets rather than two. That is strictly
 * stronger than the version it replaces.
 */
test('ACTION_LABEL, ACTION_VARIANT and ACTION_SHORT name the same targets', () => {
  const grab = (name) => [...DETAIL.code.matchAll(new RegExp(String.raw`const ${name}\s*=\s*\{([^}]*)\}`, 'g'))][0]?.[1];
  const labels   = grab('ACTION_LABEL');
  const variants = grab('ACTION_VARIANT');
  const shorts   = grab('ACTION_SHORT');
  assert.ok(labels,   'ACTION_LABEL is gone');
  assert.ok(variants, 'ACTION_VARIANT is gone');
  assert.ok(shorts,   'ACTION_SHORT is gone — the primary button has no wording of its own');
  const keys = (s) => [...s.matchAll(/(\w[\w-]*)\s*:/g)].map((m) => m[1]).sort();
  assert.deepEqual(keys(labels), keys(variants), 'a target with a label but no variant renders unstyled');
  assert.deepEqual(keys(labels), keys(shorts),
    'a target with a menu label but no short form renders an EMPTY primary button');
});

test('the short forms are genuinely shorter, and are not the canonical labels', () => {
  // Otherwise the third map is a copy of the second and the split is decoration.
  // Counted in ADVANCING glyphs, because Thai combining marks take zero advance
  // and a naive `.length` would call 'บันทึกส่งแล้ว' thirteen characters wide.
  const grab = (name) => [...DETAIL.code.matchAll(new RegExp(String.raw`const ${name}\s*=\s*\{([^}]*)\}`, 'g'))][0][1];
  const entries = (s) => Object.fromEntries(
    [...s.matchAll(/(\w[\w-]*)\s*:\s*'([^']*)'/g)].map((m) => [m[1], m[2]])
  );
  const labels = entries(grab('ACTION_LABEL'));
  const shorts = entries(grab('ACTION_SHORT'));
  const advancing = (s) => [...s].filter((ch) => !/[ัิ-ฺ็-๎]/.test(ch)).length;

  for (const [target, short] of Object.entries(shorts)) {
    assert.ok(short.length > 0, `${target}: the short form is empty — the button would render nothing`);
    assert.ok(
      advancing(short) <= advancing(labels[target]),
      `${target}: the "short" form ${JSON.stringify(short)} is not shorter than `
      + `${JSON.stringify(labels[target])} — then the split buys nothing`
    );
    // The 100px button, minus its 12px of padding, at the same 0.65em advance
    // this repo's other width assertion states. Not a claim that it FITS — that
    // needs a layout engine — but a claim that nobody has put a sentence in it.
    assert.ok(
      advancing(short) * 12 * 0.65 <= 100 - 12,
      `${target}: ${JSON.stringify(short)} is ${advancing(short)} advancing glyphs, which does not fit `
      + 'a 100px button at a stated 0.65em advance'
    );
  }
});

test('every target in the table has a label, and no label names an unreachable target', () => {
  const reachable = new Set(Object.values(PUBLIC_STATUS_TRANSITIONS).flat());
  const labels = [...DETAIL.code.matchAll(/const ACTION_LABEL\s*=\s*\{([^}]*)\}/g)][0][1];
  const labelled = new Set([...labels.matchAll(/(\w[\w-]*)\s*:/g)].map((m) => m[1]));

  for (const target of reachable) {
    assert.ok(labelled.has(target), `${target} is a permitted move with no button label`);
  }
  for (const target of labelled) {
    // `paid` and `pending` are the two that used to be here. Neither is a
    // target of anything now; a label for one is a button that can never
    // render, and the next reader would re-add the edge to "fix" it.
    assert.ok(reachable.has(target), `${target} has a button label but nothing can reach it`);
  }
});

test('the retired actions are gone by name', () => {
  assert.ok(!DETAIL.code.includes('บันทึกชำระแล้ว'), 'the admin paid action is back');
  assert.ok(!DETAIL.code.includes('คืนสถานะ'),        'the un-cancel action is back');
});

// ── 3. The read-only state ─────────────────────────────────────────────────

test('the read-only flag is derived from the STORED status', () => {
  assert.match(DETAIL.code, /const readOnly = status === 'cancelled'/);
});

/**
 * ── RE-POINTED IN ROUND 4, AND STRICTLY STRONGER ───────────────────────────
 *
 * The old form counted `<CardEditable` against `readOnly={readOnly}` and
 * asserted the two numbers were equal. That catches a card somebody forgot to
 * gate — but only by ARITHMETIC, so a file with the right count and the wrong
 * card passes it, and it says nothing about a card added tomorrow.
 *
 * The restyle replaced the per-card prop with ONE producer: `editProps(section)`
 * is the only thing in the file that can hand a card an `onEdit` at all, and it
 * is gated. So the claim becomes a UNIQUENESS claim rather than a count, and the
 * failure mode inverts — a card that omits the spread has NO edit affordance
 * (visible immediately) instead of an ungated one (invisible until someone opens
 * a cancelled record).
 */
test('there is exactly ONE producer of an edit affordance, and it is gated', () => {
  const producers = (DETAIL.code.match(/onEdit:/g) ?? []).length;
  assert.equal(producers, 1,
    `${producers} places assign an onEdit. Exactly one — editProps — may, or a card can be `
    + 'given an ungated edit button.');
  assert.match(DETAIL.code, /const editProps = \(section\) => \(\{/,
    'the single gate `editProps` is gone');
  assert.match(DETAIL.code, /onEdit:\s*readOnly \? undefined :/,
    'the one onEdit is not gated on readOnly');
});

/**
 * ── WIDENED IN ROUND 5, NOT RELAXED ────────────────────────────────────────
 *
 * A `<SectionCard>` that takes an `onSave` is an editable card and every one of
 * them must be gated. Round 4 counted `{...editProps(` literally, which was true
 * while every card spread the call inline.
 *
 * The attendee card now takes the gate ONCE into a const, because its
 * + เพิ่มผู้เข้าอบรม button has to read the same `onEdit` the card header reads —
 * calling `editProps('attendees')` a second time for that button would have been
 * a second call site of the gate, which is exactly the shape that lets a future
 * control be added beside it WITHOUT one.
 *
 * So the scan follows the value rather than the spelling: it collects every name
 * assigned from `editProps(...)` and counts spreads of the call OR of those
 * names. That is stricter than the literal count — a spread of some OTHER object
 * would now be counted as ungated, where before it was simply invisible.
 */
test('every editable card goes through that gate', () => {
  const editable = (DETAIL.code.match(/onSave=\{/g) ?? []).length;
  assert.ok(editable > 0, 'no editable card found — the scan is looking at the wrong thing');

  const aliases = [...DETAIL.code.matchAll(/const (\w+)\s*=\s*editProps\(/g)].map((m) => m[1]);
  const direct  = (DETAIL.code.match(/\{\.\.\.editProps\(/g) ?? []).length;
  const viaAlias = aliases.reduce(
    (sum, name) => sum + (DETAIL.code.match(new RegExp(String.raw`\{\.\.\.${name}\}`, 'g')) ?? []).length,
    0,
  );

  assert.equal(direct + viaAlias, editable,
    `${editable} cards can save but only ${direct + viaAlias} are gated `
    + `(${direct} spread the call, ${viaAlias} spread one of [${aliases.join(', ')}])`);
});

test('CONTROL: the alias scan is doing work, not passing on the direct count alone', () => {
  // If no card ever took the gate into a const, the widening above would be
  // inert and the literal round-4 count would be doing all the work. This says
  // the second form is genuinely in use, so the branch that reads it is live.
  const aliases = [...DETAIL.code.matchAll(/const (\w+)\s*=\s*editProps\(/g)].map((m) => m[1]);
  assert.ok(aliases.length > 0,
    'no card takes the gate into a const — the alias branch above is inert');
  for (const name of aliases) {
    assert.match(DETAIL.code, new RegExp(String.raw`\{\.\.\.${name}\}`),
      `${name} is assigned from editProps but never spread — a gate that gates nothing`);
  }
});

/**
 * THE + เพิ่มผู้เข้าอบรม BUTTON IS THE CARD'S GATE, NOT A SECOND ONE.
 *
 * It is an edit affordance in a place the card-header scan does not look, and
 * round 1's ruling is that a cancelled record offers NO edit affordance
 * anywhere. Asserted at source as well as in the render tier, because a render
 * assertion can only see the states a fixture reaches.
 */
test('the + เพิ่มผู้เข้าอบรม button reads the card’s edit gate', () => {
  assert.match(DETAIL.code, /attendeeEdit\.onEdit \?/,
    'the + button does not branch on the card’s own edit gate');
  assert.match(DETAIL.code, /onClick=\{\(\) => \{ attendeeEdit\.onEdit\(\); addAttendee\(\); \}\}/,
    'the + button no longer opens the editor through the gate it was given');
});

test('the shell renders NO control when there is nothing to do, rather than a disabled one', () => {
  // `undefined` rather than a no-op handler, and the shell branches on the
  // callback's presence — so on a cancelled record the button is ABSENT, not
  // greyed out. A greyed-out แก้ไข invites the click and then explains nothing.
  const SHELL = readSource('src/app/admin/registrations/_components/detailShell.jsx');
  assert.match(SHELL.code, /\)\s*:\s*onEdit\s*\?\s*\(/,
    'SectionCard no longer branches on whether it was given an onEdit');
  assert.ok(
    !/readOnly/.test(SHELL.code),
    'the shell has learned about `readOnly`. It is presentational: it renders a button when it is '
    + 'given something to do, and the RULE about when that is lives in the screens.'
  );
});

test('delete is NOT gated by the read-only flag', () => {
  // The ruling. Delete is a different permission from edit and is the only way
  // to clear a wrongly-cancelled row now that cancellation is terminal.
  const from = DETAIL.code.indexOf('const handleDelete');
  assert.notEqual(from, -1, 'handleDelete is gone');
  const body = DETAIL.code.slice(from, DETAIL.code.indexOf('const handleSaveInvoice'));
  assert.ok(!body.includes('readOnly'), 'delete was gated on the read-only flag');
});

test('the confirm dialog makes cancellation`s irreversibility explicit', () => {
  const from = DETAIL.code.indexOf('const handleStatusAction');
  assert.notEqual(from, -1, 'handleStatusAction is gone');
  const body = DETAIL.code.slice(from, DETAIL.code.indexOf('const handleDelete'));
  assert.match(body, /next === 'cancelled'/, 'the cancel target must get its own wording');
  assert.match(body, /ไม่สามารถย้อนกลับได้/, 'the dialog does not say the move is irreversible');
  assert.match(body, /window\.confirm\(message\)/, 'the confirm must consume the branched message');
});


// ════════════════════════════════════════════════════════════════════════════
// ROUND 4 — THE TWO-SLOT ACTION GROUP, AND THE SHELL IT LIVES IN
// ════════════════════════════════════════════════════════════════════════════

const INHOUSE = readSource('src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx');

/**
 * BOTH SCREENS, and every assertion below is written per-client rather than
 * about one of them. The in-house entry arrived as a one-line change with no
 * assertion re-worded, which is the shape that made the split safe.
 */
const CLIENTS = [
  { name: 'public',  src: DETAIL,  table: PUBLIC_STATUS_TRANSITIONS,  values: PUBLIC_STATUS_VALUES },
  { name: 'inhouse', src: INHOUSE, table: INHOUSE_STATUS_TRANSITIONS, values: INHOUSE_STATUS_VALUES },
];

/**
 * WHICH SLOT AN ACTION LANDS IN IS A QUESTION FOR THE TRANSITION TABLE.
 *
 * The "•••" menu holds the moves that cannot be walked back; the 100x38 button
 * holds the ordinary next step. `next === 'cancelled'` would have been shorter
 * and is a hand-written status value in a client component — the shape rounds 1
 * and 2 spent four commits removing, and the one the `no local status map`
 * assertions above forbid.
 */
for (const { name, src, table } of CLIENTS) {
  test(`${name}: the primary/overflow split is derived from the transition table`, () => {
    assert.match(src.code, /const isTerminalTarget = \(target\) =>/,
      'the slot split is no longer expressed as a question about the table');
    assert.match(src.code, /allowedTransitions\(target/,
      'isTerminalTarget does not ask the table anything');
    assert.match(src.code, /const primaryTarget\s*=\s*statusActions\.find\(\(next\) => !isTerminalTarget\(next\)\)/,
      'the primary button is not the first non-terminal permitted move');
    assert.match(src.code, /const menuTargets\s*=\s*statusActions\.filter\(\(next\) => next !== primaryTarget\)/,
      'the menu is not "everything the primary slot did not take" — a permitted move could fall between them');
  });

  test(`${name}: no status VALUE decides which slot an action goes in`, () => {
    /**
     * The shape the derivation replaces. Matched against every status in the
     * TABLE rather than against the word `cancelled` alone, so a future terminal
     * status cannot be hard-coded here either.
     *
     * `readOnly` is the ONE permitted comparison against a literal status and it
     * is round 1's, pinned by its own assertion above — so the slice searched
     * here begins after it, at the slot derivation.
     */
    const from = src.code.indexOf('const isTerminalTarget');
    assert.notEqual(from, -1, 'isTerminalTarget is gone');
    // Bounded at `const readOnly`, which is the ONE permitted comparison
    // against a literal status on this screen — round 1's, and pinned by its
    // own assertion above. Without the bound this window swallows it and the
    // guard reports a defect on correct code, which is how a guard gets relaxed.
    const to = src.code.indexOf('const readOnly', from);
    assert.notEqual(to, -1, 'the read-only flag no longer follows the slot split');
    const slice = src.code.slice(from, to);
    for (const value of Object.keys(table)) {
      assert.ok(
        !new RegExp(String.raw`===\s*'${value}'`).test(slice),
        `the slot split tests for the literal status '${value}' instead of asking the table`
      );
    }
  });

  test(`${name}: delete is in the overflow menu and is NOT gated on readOnly`, () => {
    // The ruling: delete is a different permission from edit and is the only way
    // to clear a wrongly-cancelled row now that cancellation is terminal. It is
    // also what keeps the menu from ever being empty — a cancelled record has no
    // status actions left and still has exactly one item.
    const from = src.code.indexOf('<OverflowMenu');
    assert.notEqual(from, -1, `${name}: the overflow menu is gone`);
    const to = src.code.indexOf('</OverflowMenu>', from);
    assert.notEqual(to, -1, `${name}: the overflow menu is unterminated`);
    const menu = src.code.slice(from, to);
    assert.match(menu, /onClick=\{handleDelete\}/, 'delete is not in the overflow menu');
    assert.ok(!menu.includes('readOnly'), 'the menu gates something on readOnly — delete must survive');
  });

  test(`${name}: the tab is LOCAL state and is not read from or written to the URL`, () => {
    /**
     * The filters-derived-from-props rule forbids copying a URL-derived value
     * into state. The tab is not derived from the URL AT ALL, which is a
     * different thing — and this asserts the difference rather than the rule, so
     * the day somebody deep-links a tab they have to come here and change the
     * claim deliberately.
     */
    assert.match(src.code, /const \[tab,\s*setTab\]\s*=\s*useState\(/, 'the tab is no longer local state');
    const from = src.code.indexOf('const [tab');
    const slice = src.code.slice(Math.max(0, from - 200), from + 200);
    assert.ok(!/searchParams|useSearchParams|router\.replace|router\.push/.test(slice),
      'the tab has acquired a URL round trip');
  });

  test(`${name}: the history panel is a PROP, never fetched by the client`, () => {
    assert.match(src.code, /history = null/, 'the history slot prop is gone');
    assert.ok(!src.withImports.includes('@/components/audit/RecordHistory'),
      'the client imports RecordHistory — it is a SERVER component and this is a client file');
    assert.ok(!src.withImports.includes('readRecordHistory'),
      'the client reads the audit log itself');
  });
}

test('both detail clients import the shell rather than re-declaring it', () => {
  for (const { name, src } of CLIENTS) {
    assert.ok(/from '\.[./]*(?:_components\/)?detailShell'/.test(src.withImports),
      `${name}: the detail client does not import the shared shell`);
    // And holds no second copy of the pieces it was extracted from.
    assert.ok(!/function CardEditable\(/.test(src.code), `${name}: a local CardEditable is back`);
    assert.ok(!/function Card\(/.test(src.code),        `${name}: a local Card is back`);
    assert.ok(!/function Row\(/.test(src.code),         `${name}: a local Row is back`);
  }
});


// ════════════════════════════════════════════════════════════════════════════
// ROUND 5, SECTION 0 — TWO THINGS IN THE FRAMES THAT ARE NOT THE PRODUCT
// ════════════════════════════════════════════════════════════════════════════

/**
 * ── (a) THE MOCKUP'S OWN SAMPLE-SWITCHERS ──────────────────────────────────
 *
 * Both round-5 frames put a pair of dropdowns — ตัวอย่างข้อมูล and ตัวอย่างสถานะ
 * — at the top right of the header. They are the Figma file's controls for
 * viewing states while designing, not the product's, and building them would put
 * a "pretend this record is cancelled" selector on a live admin screen.
 *
 * A ruling that costs nothing to obey is exactly the kind a future reader
 * re-derives from the frame and builds anyway, so it is written down as an
 * assertion rather than only as a decision.
 */
test('neither detail screen builds the frame’s sample-data switchers', () => {
  for (const { name, src } of CLIENTS) {
    for (const control of ['ตัวอย่างข้อมูล', 'ตัวอย่างสถานะ']) {
      assert.ok(!src.raw.includes(control),
        `${name}: the mockup's own sample-switcher "${control}" was built as a product control`);
    }
  }
  // Read locally rather than from a shared const: the shell-purity block above
  // scopes its own `SHELL` inside a test, and reaching into another test's scope
  // is how a rename makes an assertion silently stop running.
  const shell = readSource('src/app/admin/registrations/_components/detailShell.jsx');
  for (const control of ['ตัวอย่างข้อมูล', 'ตัวอย่างสถานะ']) {
    assert.ok(!shell.raw.includes(control), `the shell built "${control}"`);
  }
});

/**
 * ── (b) ส่งใบเสนอราคาอีกครั้ง IS NOT A STATUS TRANSITION ───────────────────
 *
 * Both frames show it as the primary action on a quoted record. RULED OUT:
 * re-sending a quotation is a REPEAT ACTION, not a move between states. There is
 * no implementation behind it, no audit action to record it (the trail carries
 * `status`, `update`, `notes` and `delete` and nothing else), and no rate limit
 * on a control that would send customer mail.
 *
 * The interesting part is that no code changed to obey this. The primary slot is
 * DERIVED — it holds the first permitted move that is not terminal — and a
 * `quoted` record's only permitted move is its cancellation, which is terminal
 * and therefore already in the menu. So the frame's button has nowhere to come
 * from, and the guard is that nobody hand-writes one beside the derivation.
 */
test('no screen offers a re-send action', () => {
  for (const { name, src } of CLIENTS) {
    assert.ok(!src.raw.includes('อีกครั้ง'),
      `${name}: a repeat-send action was built — it is not a status transition`);
  }
});

test('the primary slot is still fed ONLY by the transition table', () => {
  /**
   * The other half: a repeat action would have to reach the primary slot from
   * somewhere, and the only thing that feeds it is `primaryTarget`. If a second
   * expression ever renders into that slot, this says so — which is what stops
   * the ruling above being obeyed in the letter and broken in the spirit.
   */
  for (const { name, src } of CLIENTS) {
    const uses = (src.code.match(/primary=\{/g) ?? []).length;
    assert.equal(uses, 1, `${name}: the status bar's primary slot is fed from ${uses} places`);
    assert.match(src.code, /primary=\{primaryTarget \? \(/,
      `${name}: the primary slot no longer branches on the derived target alone`);
  }
});
