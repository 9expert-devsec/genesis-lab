import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { PUBLIC_STATUS_TRANSITIONS } from '@/lib/registrations/statuses';

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

test('ACTION_LABEL and ACTION_VARIANT name the same targets', () => {
  const labels   = [...DETAIL.code.matchAll(/const ACTION_LABEL\s*=\s*\{([^}]*)\}/g)][0]?.[1];
  const variants = [...DETAIL.code.matchAll(/const ACTION_VARIANT\s*=\s*\{([^}]*)\}/g)][0]?.[1];
  assert.ok(labels,   'ACTION_LABEL is gone');
  assert.ok(variants, 'ACTION_VARIANT is gone');
  const keys = (s) => [...s.matchAll(/(\w[\w-]*)\s*:/g)].map((m) => m[1]).sort();
  assert.deepEqual(keys(labels), keys(variants), 'a target with a label but no variant renders unstyled');
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

test('every editable card is passed the flag', () => {
  // A card that is not passed `readOnly` keeps its แก้ไข button on a cancelled
  // record — one missed prop is the whole defect, and it is invisible until
  // someone opens a cancelled registration.
  const cards = (DETAIL.code.match(/<CardEditable/g) ?? []).length;
  const gated = (DETAIL.code.match(/readOnly=\{readOnly\}/g) ?? []).length;
  assert.ok(cards > 0, 'no CardEditable found — the scan is looking at the wrong thing');
  assert.equal(gated, cards, `${cards} editable cards but only ${gated} are gated`);
});

test('CardEditable renders NO control when read-only, rather than a disabled one', () => {
  assert.match(DETAIL.code, /readOnly\s*\?\s*null\s*:/, 'a disabled button still invites the click');
  assert.match(DETAIL.code, /function CardEditable\(\{[^}]*readOnly = false/, 'the prop must default to false');
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
// THE SHARED DETAIL SHELL IS PRESENTATIONAL, AND THAT IS ASSERTED
// ════════════════════════════════════════════════════════════════════════════

const SHELL = readSource('src/app/admin/registrations/_components/detailShell.jsx');

test('the shell takes no `source` prop and knows of no per-source branching', () => {
  /**
   * THE DEFECT THIS PREVENTS IS ON RECORD. A single body branching on `source`
   * per cell is how an in-house document came to be rendered through public
   * columns on the list screen — ten `source ===` tests inside one row. The fix
   * was two components, and this is the same constraint applied to the frame
   * they will share.
   */
  assert.ok(!/\bsource\b/.test(SHELL.code), 'the shell mentions `source`');
  assert.ok(!SHELL.code.includes('inhouse'), 'the shell knows there is an in-house collection');
  assert.ok(!SHELL.code.includes('Public'),  'the shell knows there is a public collection');
});

test('the shell imports no status vocabulary', () => {
  // Colours, labels and transitions arrive as props. A shell that looked a
  // status up would be a third screen with an opinion about the vocabulary.
  assert.ok(
    !SHELL.withImports.includes('@/lib/registrations/statuses'),
    'the shell imports the status module — the vocabulary must reach it as props'
  );
  assert.ok(!/statusLabel|statusBadge|allowedTransitions/.test(SHELL.code),
    'the shell calls into the status vocabulary');
});

test('the shell holds no field list for either document', () => {
  // The line between "shared frame" and "shared body". A card header is a card
  // header; a card's FIELDS are not, and a field named here would be a field
  // both screens had to reason about.
  for (const field of ['courseName', 'attendeesCount', 'coordinator', 'participantsCount', 'quotationCompany', 'omiseStatus']) {
    assert.ok(!SHELL.code.includes(field), `the shell names a document field: ${field}`);
  }
});

test('the shell renders NO control when there is nothing to do, rather than a disabled one', () => {
  // A greyed-out แก้ไข invites the click and then explains nothing. The shell
  // branches on whether it was GIVEN a callback, so a card can only render the
  // button by being handed something for it to do — and the RULE about when that
  // is stays in the screens.
  assert.match(SHELL.code, /\)\s*:\s*onEdit\s*\?\s*\(/,
    'SectionCard no longer branches on whether it was given an onEdit');
  assert.ok(
    !/readOnly/.test(SHELL.code),
    'the shell has learned about `readOnly`. It is presentational: it renders a button when it is '
    + 'given something to do, and the RULE about when that is lives in the screens.'
  );
});
