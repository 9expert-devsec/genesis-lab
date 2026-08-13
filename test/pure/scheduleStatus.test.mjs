import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NEUTRAL_STATUS,
  SCHEDULE_STATUS,
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_OPTIONS,
  normalizeScheduleStatus,
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

test('each state has its agreed Thai wording', () => {
  assert.equal(SCHEDULE_STATUS.open.label, 'เปิดรับ');
  assert.equal(SCHEDULE_STATUS.nearly_full.label, 'ใกล้เต็ม');
  assert.equal(SCHEDULE_STATUS.full.label, 'เต็ม');
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
  for (const [raw, label] of [['open', 'เปิดรับ'], ['nearly_full', 'ใกล้เต็ม'], ['full', 'เต็ม']]) {
    const b = resolveScheduleBadge(raw);
    assert.equal(b.isKnown, true);
    assert.equal(b.label, label);
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
  // Structural, not just value-equal: each option's label IS the badge label.
  for (const { value, label } of SCHEDULE_STATUS_OPTIONS) {
    assert.equal(label, SCHEDULE_STATUS[value].label);
  }
});
