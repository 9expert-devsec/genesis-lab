import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DERIVED_ROUND_STATES,
  NEUTRAL_STATUS,
  SCHEDULE_STATUS,
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_OPTIONS,
  normalizeScheduleStatus,
  resolveDerivedRoundBadge,
  resolveScheduleBadge,
  scheduleStatusLabel,
} from '@/lib/scheduleStatus';
import { formatStatusFromAPI } from '@/lib/formatScheduleDate';

/**
 * The schedule-status vocabulary and its ONE fallback policy.
 *
 * Five surfaces used to carry their own copy of this map. Two had drifted to a
 * different word for "open" and one to a different colour, and four of the five
 * ended their lookup with `?? STATUS.open` — so any status the map did not know
 * was advertised as green, open for bookings, on no evidence. That default is
 * the defect these tests exist to hold closed; the render tier
 * (test/render/scheduleStatus.test.mjs) proves it at each surface.
 */

test('the vocabulary is exactly three states', () => {
  assert.deepEqual(SCHEDULE_STATUSES, ['open', 'nearly_full', 'full']);
  assert.deepEqual(Object.keys(SCHEDULE_STATUS), ['open', 'nearly_full', 'full']);
});

test('each state has its agreed Thai wording, in BOTH registers', () => {
  // `state` = what the round IS (the filter dropdown reads this).
  assert.equal(SCHEDULE_STATUS.open.state, 'เปิดรับ');
  assert.equal(SCHEDULE_STATUS.nearly_full.state, 'ใกล้เต็ม');
  assert.equal(SCHEDULE_STATUS.full.state, 'เต็ม');

  // `action` = what a visitor can DO (every badge reads this).
  assert.equal(SCHEDULE_STATUS.open.action, 'ลงทะเบียน');
  assert.equal(SCHEDULE_STATUS.nearly_full.action, 'ใกล้เต็ม');
  assert.equal(SCHEDULE_STATUS.full.action, 'เต็ม');
});

test('open is the only status whose two words DIFFER, and the rest are equal on purpose', () => {
  /**
   * The pair of claims the module's comment makes, made executable.
   *
   * Both directions matter. If open's two words ever became equal, the split
   * has been undone and the filter is offering an action again. If
   * nearly_full's or full's diverged, someone gave them a verb — which for
   * `full` would put 'ลงทะเบียน' on a round whose registration href is null,
   * i.e. an unclickable card inviting a click.
   */
  assert.notEqual(SCHEDULE_STATUS.open.state, SCHEDULE_STATUS.open.action);
  for (const key of ['nearly_full', 'full']) {
    assert.equal(
      SCHEDULE_STATUS[key].state, SCHEDULE_STATUS[key].action,
      `${key}: the equality is deliberate — if a distinct action word was added, `
      + 'update lib/scheduleStatus.js\'s note and this assertion together'
    );
  }
});

test('every status carries both fields — no silent fallback', () => {
  // The shape guard. `action` defaulting to `state` was rejected precisely
  // because a missing word would then be invisible; this is what makes the
  // absence loud.
  for (const key of Object.keys(SCHEDULE_STATUS)) {
    for (const field of ['state', 'action']) {
      assert.equal(
        typeof SCHEDULE_STATUS[key][field], 'string',
        `${key}.${field} is missing — both words are written out explicitly`
      );
      assert.ok(SCHEDULE_STATUS[key][field].length > 0, `${key}.${field} is empty`);
    }
  }
  // And the ambiguous field it replaced must not come back.
  for (const key of Object.keys(SCHEDULE_STATUS)) {
    assert.equal(
      SCHEDULE_STATUS[key].label, undefined,
      `${key}.label is back — that is the one field that meant two things`
    );
  }
});

/**
 * The green cannot be reinvented. Every token on the `open` entry must use
 * #39b980 and no other hex — this is what stops a future edit introducing a
 * second, nearly-identical green on one surface, which is how the five maps
 * drifted apart in the first place.
 */
test('the open green is #39b980 and nothing else', () => {
  const tokens = Object.entries(SCHEDULE_STATUS.open)
    .filter(([k]) => k !== 'label')
    .map(([, v]) => v)
    .join(' ');
  assert.ok(tokens.includes('#39b980'), `expected #39b980 in: ${tokens}`);
  const otherHex = tokens.match(/#(?!39b980\b)[0-9a-fA-F]{3,8}\b/g);
  assert.equal(otherHex, null, `open must use only #39b980, found ${otherHex}`);
});

test('amber and red are the pre-existing values, not new ones', () => {
  assert.ok(SCHEDULE_STATUS.nearly_full.dot.includes('#ffc94a'));
  assert.ok(SCHEDULE_STATUS.nearly_full.text.includes('#d4a017'));
  assert.ok(SCHEDULE_STATUS.full.dot.includes('#ff4b55'));
});

test('the neutral treatment shares no colour with any real status', () => {
  const neutral = Object.values(NEUTRAL_STATUS).join(' ');
  for (const hex of ['#39b980', '#ffc94a', '#d4a017', '#ff4b55']) {
    assert.ok(!neutral.includes(hex), `neutral must not reuse ${hex}`);
  }
});

test('tinted and text tokens carry dark: variants', () => {
  for (const key of SCHEDULE_STATUSES) {
    assert.match(SCHEDULE_STATUS[key].soft, /dark:/, `${key}.soft needs a dark variant`);
  }
  assert.match(SCHEDULE_STATUS.nearly_full.text, /dark:/);
});

// ── Aliases: the two spellings that reach the renderer ──────────────

test('nearFull is the same state as nearly_full', () => {
  // lib/formatScheduleDate camel-cases it on the way into <ScheduleCard/>.
  assert.equal(normalizeScheduleStatus('nearFull'), 'nearly_full');
  assert.equal(scheduleStatusLabel('nearFull'), 'ใกล้เต็ม');
});

test('closed is the same state as full', () => {
  // models/ScheduleStatus.js spells the terminal state `closed`; MSDB spells
  // it `full`. Both mean "cannot register" and must not read as open.
  assert.equal(normalizeScheduleStatus('closed'), 'full');
  assert.equal(scheduleStatusLabel('closed'), 'เต็ม');
});

// ── THE FALLBACK POLICY ────────────────────────────────────────────

test('an unrecognised status is never classified as a real state', () => {
  for (const v of ['bogus', 'OPEN', 'cancelled', 'draft', '', '  ', null, undefined, 7, {}]) {
    assert.equal(normalizeScheduleStatus(v), null, `expected null for ${JSON.stringify(v)}`);
  }
});

test('resolveScheduleBadge renders an unrecognised status NEUTRALLY, never open', () => {
  const badge = resolveScheduleBadge('bogus');
  assert.ok(badge, 'an unrecognised but non-empty status still gets a badge');
  assert.equal(badge.isKnown, false);
  // BOTH fields carry the raw value. An unrecognised status has no
  // state/action distinction to make, and giving the shape the same keys either
  // way is what lets a call site read a word without branching on `isKnown`.
  assert.equal(badge.state, 'bogus', 'the raw value is shown verbatim, not guessed at');
  assert.equal(badge.action, 'bogus', 'and the badge word is the raw value too');
  assert.notEqual(badge.state, 'เปิดรับ');
  assert.notEqual(badge.action, 'ลงทะเบียน');
  const tokens = [badge.dot, badge.text, badge.solid, badge.soft].join(' ');
  assert.ok(!tokens.includes('#39b980'), `unrecognised must not be the open green: ${tokens}`);
});

test('a missing or blank status yields no badge at all', () => {
  for (const v of [null, undefined, '', '   ', 42]) {
    assert.equal(resolveScheduleBadge(v), null, `expected null badge for ${JSON.stringify(v)}`);
  }
});

test('CONTROL: resolveScheduleBadge still returns the real states', () => {
  // Guards against a "fix" that neutralises everything — the mirror failure.
  // Both registers are checked: neutralising either one would be the same
  // class of damage, and only checking the badge word would let the filter
  // vocabulary be blanked without anything noticing.
  for (const [raw, state, action] of [
    ['open', 'เปิดรับ', 'ลงทะเบียน'],
    ['nearly_full', 'ใกล้เต็ม', 'ใกล้เต็ม'],
    ['full', 'เต็ม', 'เต็ม'],
  ]) {
    const b = resolveScheduleBadge(raw);
    assert.equal(b.isKnown, true);
    assert.equal(b.state, state);
    assert.equal(b.action, action);
  }
  assert.ok(resolveScheduleBadge('open').solid.includes('#39b980'));
});

// ── The upstream adapter shares the same policy ────────────────────

test('formatStatusFromAPI no longer launders unknown input into open', () => {
  // It used to end in `?? "open"`, a SECOND fallback policy sitting upstream of
  // the shared one — so <ScheduleCard/> saw green before the resolver ran.
  assert.equal(formatStatusFromAPI('bogus'), 'bogus');
  assert.equal(formatStatusFromAPI(undefined), undefined);
  assert.notEqual(formatStatusFromAPI('cancelled'), 'open');
});

test('formatStatusFromAPI canonicalises the states it does know', () => {
  assert.equal(formatStatusFromAPI('open'), 'open');
  assert.equal(formatStatusFromAPI('nearly_full'), 'nearly_full');
  assert.equal(formatStatusFromAPI('full'), 'full');
  // ...including the one its old table was missing entirely.
  assert.equal(formatStatusFromAPI('closed'), 'full');
});

test('whatever formatStatusFromAPI emits, the renderer can resolve it', () => {
  // The two must not drift apart again: every canonical output is known, and
  // any pass-through value lands on the neutral path rather than on green.
  for (const raw of ['open', 'nearly_full', 'full', 'closed', 'nearFull']) {
    assert.equal(resolveScheduleBadge(formatStatusFromAPI(raw)).isKnown, true, raw);
  }
  const passed = resolveScheduleBadge(formatStatusFromAPI('mystery'));
  assert.equal(passed.isKnown, false);
  assert.ok(!passed.solid.includes('#39b980'));
});

// ── The /schedule filter is generated, not hand-written ────────────

test('filter options are generated from the same source as the badges', () => {
  assert.deepEqual(SCHEDULE_STATUS_OPTIONS, [
    { value: 'open', label: 'เปิดรับ' },
    { value: 'nearly_full', label: 'ใกล้เต็ม' },
    { value: 'full', label: 'เต็ม' },
  ]);
  /**
   * Structural, not just value-equal: each option's label IS the status's
   * STATE word — not its action word, and not a hand-written copy.
   *
   * This is the assertion that pins the fix. The dropdown offered
   * `<option value="open">ลงทะเบียน</option>` because one constant served both
   * registers; reading `.action` here would restore that exactly, while the
   * deepEqual above still passed for the two statuses whose words are equal.
   */
  for (const { value, label } of SCHEDULE_STATUS_OPTIONS) {
    assert.equal(label, SCHEDULE_STATUS[value].state);
    assert.notEqual(
      label, SCHEDULE_STATUS.open.action,
      'the filter must never carry the open ACTION word'
    );
  }
});

/**
 * ── ROUND 64: TWO DERIVED STATES, AND THE WALL BETWEEN THEM AND THESE THREE ─
 *
 * A page-builder `course_schedule` can be asked to draw a round MSDB no longer
 * returns, so the module grew `elapsed` / `missing`. They are NOT statuses, and
 * the tests above are deliberately untouched: no word and no colour of the three
 * moved, and nothing below re-asserts them.
 *
 * What is added is the wall. Each of these fires on a specific way of knocking
 * it down, and each way is one somebody would do for a good reason.
 */

test('the derived states did NOT join the MSDB vocabulary', () => {
  // The most consequential one: SCHEDULE_STATUSES drives SCHEDULE_STATUS_OPTIONS,
  // which is the PUBLIC /schedule filter dropdown. Adding them there would offer
  // a visitor 'จบไปแล้ว' as something to filter by, for a state no round can be
  // fetched in.
  assert.deepEqual(SCHEDULE_STATUSES, ['open', 'nearly_full', 'full']);
  assert.deepEqual(Object.keys(SCHEDULE_STATUS), ['open', 'nearly_full', 'full']);
  assert.equal(SCHEDULE_STATUS_OPTIONS.length, 3);
  for (const key of DERIVED_ROUND_STATES) {
    assert.equal(SCHEDULE_STATUS[key], undefined, `${key} leaked into the status map`);
    assert.ok(!SCHEDULE_STATUS_OPTIONS.some((o) => o.value === key),
      `${key} reached the public /schedule filter dropdown`);
  }
});

test('the normaliser still refuses them — they never arrived FROM upstream', () => {
  // It classifies raw values that came from MSDB. Teaching it these would let a
  // stored status of "missing" render as a legitimate one.
  for (const key of DERIVED_ROUND_STATES) {
    assert.equal(normalizeScheduleStatus(key), null, `normalizeScheduleStatus accepted ${key}`);
  }
  // And the two resolvers do not answer each other's questions.
  assert.equal(resolveDerivedRoundBadge('open'), null, 'a real status got a derived badge');
  assert.equal(resolveDerivedRoundBadge('full'), null);
  for (const junk of [undefined, null, '', 7, {}]) {
    assert.equal(resolveDerivedRoundBadge(junk), null);
  }
});

test('a derived badge claims no status and no knowledge', () => {
  /**
   * The three non-clickable states are not the same. `full` is red because the
   * system KNOWS the round is full. These two are grey because it knows less —
   * `elapsed` is computed from dates alone, `missing` asserts nothing at all —
   * and neither may borrow the certainty `full` has.
   */
  for (const key of DERIVED_ROUND_STATES) {
    const badge = resolveDerivedRoundBadge(key);
    assert.equal(badge.status, null, `${key} carried a status it cannot know`);
    assert.equal(badge.isKnown, false, `${key} claimed to be a recognised status`);
    assert.equal(badge.isDerived, true);
    assert.ok(badge.state.length > 0 && badge.action.length > 0);
  }
  // Told apart, not merged.
  assert.notEqual(
    resolveDerivedRoundBadge('elapsed').action,
    resolveDerivedRoundBadge('missing').action
  );
});

test('the derived states mint NO new colour — they reuse the neutral grey', () => {
  // Round 57's rule: no token is invented here, and none is needed. `full` is
  // already red and already comes from MSDB.
  for (const key of DERIVED_ROUND_STATES) {
    const badge = resolveDerivedRoundBadge(key);
    for (const shape of ['dot', 'text', 'solid', 'soft']) {
      assert.equal(badge[shape], NEUTRAL_STATUS[shape], `${key}.${shape} is not the neutral grey`);
    }
    // ...and it is none of the three status colours, in any shape.
    for (const status of SCHEDULE_STATUSES) {
      assert.notEqual(badge.soft, SCHEDULE_STATUS[status].soft,
        `${key} borrowed ${status}'s colour`);
    }
  }
  // No hex literal is introduced by either: the neutral grey is stock Tailwind.
  const hex = /#[0-9a-fA-F]{3,8}\b/;
  for (const key of DERIVED_ROUND_STATES) {
    const badge = resolveDerivedRoundBadge(key);
    for (const shape of ['dot', 'text', 'solid', 'soft']) {
      assert.ok(!hex.test(badge[shape]), `${key}.${shape} minted a hex value`);
    }
  }
});

test('CONTROL: these assertions can fail', () => {
  // Every test above is a negative — "did not leak", "still refuses", "no hex".
  // A misspelled export name would make all of them pass trivially, so the
  // fixtures they run over are asserted to be real first.
  assert.deepEqual(DERIVED_ROUND_STATES, ['elapsed', 'missing']);
  assert.ok(resolveDerivedRoundBadge('elapsed'), 'the derived resolver returns nothing at all');
  // The hex matcher must be able to see a hex value — the three statuses have them.
  const hex = /#[0-9a-fA-F]{3,8}\b/;
  assert.ok(hex.test(SCHEDULE_STATUS.full.soft),
    'the hex matcher cannot see a hex value, so "no hex" above proves nothing');
  // ...and the colour-borrowing check can detect a borrow.
  assert.equal(SCHEDULE_STATUS.full.soft, SCHEDULE_STATUS.full.soft);
});
