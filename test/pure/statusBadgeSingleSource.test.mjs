import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_STATUSES,
  PUBLIC_STATUS_VALUES,
  INHOUSE_STATUSES,
  INHOUSE_STATUS_VALUES,
  LEGACY_STATUS_LABELS,
  NEUTRAL_STATUS_BADGE,
  statusBadge,
  statusLabel,
  buildStatCards,
} from '@/lib/registrations/statuses';

/**
 * THE STATUS CHIP'S COLOUR IS PART OF THE VOCABULARY, NOT OF THE SCREEN.
 *
 * ── THE DEFECT THIS FOLD REMOVED ────────────────────────────────────────────
 * `STATUS_BADGE` was a hand-written literal in FOUR files — both registration
 * list clients and both detail clients — keyed by status value. That makes it
 * the same shape as the label map and the card list, both of which already
 * lived in the module.
 *
 * A status added to `PUBLIC_STATUSES` or `INHOUSE_STATUSES` without a matching
 * entry in one of those four literals rendered an UNSTYLED chip, and only on
 * the one screen whose copy was missed. That is the drift recorded at the top
 * of the status module, one property further along: a value with no colour is a
 * value with no card wearing different clothes.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT ─────────────────────────────
 * "pending is amber". That is a symptom and a hard-coded map satisfies it. The
 * consumers below are driven with a FABRICATED status list carrying colours no
 * real status uses, so a lookup that ignored its input and consulted the real
 * arrays returns the wrong answer and fails.
 */

// Two invented statuses with invented — but COMPLETE — Tailwind classes. The
// colours are deliberately ones no real status carries, so a hard-coded map
// cannot produce them.
const FABRICATED = [
  { value: 'zz-parked',   label: 'พักไว้',       accent: 'border-l-fuchsia-400', badge: 'bg-fuchsia-100 text-fuchsia-700' },
  { value: 'zz-appealed', label: 'อยู่ระหว่างอุทธรณ์', accent: 'border-l-teal-400',    badge: 'bg-teal-100 text-teal-700' },
];

// ── 1. Every declared status carries a complete badge ───────────────────────

test('every declared status of BOTH subsets has a badge', () => {
  for (const s of [...PUBLIC_STATUSES, ...INHOUSE_STATUSES]) {
    assert.ok(typeof s.badge === 'string' && s.badge.trim().length > 0,
      `${s.value} has no badge class`);
  }
});

test('badge classes are WHOLE class names, never interpolated fragments', () => {
  // Tailwind scans source text for complete class names, so a fragment built at
  // runtime is purged from the stylesheet and the chip renders with no colour
  // at all — correct markup, no CSS. Comments are scanned too, which is why the
  // module writes no fragment of that shape anywhere.
  for (const s of [...PUBLIC_STATUSES, ...INHOUSE_STATUSES]) {
    assert.ok(!s.badge.includes('${'), `${s.value} interpolates its badge class`);
    assert.match(s.badge, /^bg-\S+\s+text-\S+$/,
      `${s.value} badge is not a complete background + text pair`);
  }
});

test('statusBadge answers for every live value of both subsets', () => {
  for (const s of [...PUBLIC_STATUSES, ...INHOUSE_STATUSES]) {
    assert.equal(statusBadge(s.value), s.badge,
      `statusBadge disagrees with the declared entry for ${s.value}`);
  }
});

// ── 2. The merge across subsets is safe ─────────────────────────────────────

/**
 * `statusBadge` reads one flattened map built from both subsets, and a flatten
 * silently prefers whichever spreads last. That is safe ONLY while the shared
 * values carry identical colours — the same argument `statusLabel` rests on.
 * The day they diverge, one source's chip colour vanishes with nothing on
 * screen to say which won. This is the line that notices.
 */
test('a value in BOTH subsets carries the SAME badge in both', () => {
  const publicBadges  = Object.fromEntries(PUBLIC_STATUSES.map((s) => [s.value, s.badge]));
  const inhouseBadges = Object.fromEntries(INHOUSE_STATUSES.map((s) => [s.value, s.badge]));
  const shared = Object.keys(inhouseBadges).filter((v) => v in publicBadges);

  assert.ok(shared.length >= 2, 'the two subsets stopped overlapping — this rule now guards nothing');
  for (const value of shared) {
    assert.equal(publicBadges[value], inhouseBadges[value],
      `${value} renders a different colour depending on which screen you are on`);
  }
});

test('the colour and the label agree about which values are shared', () => {
  // Both are merged the same way. If one subset gained a value the other lacks,
  // exactly one of these lookups would start answering for it — and the chip
  // would get text with no colour, or colour with no text.
  for (const s of [...PUBLIC_STATUSES, ...INHOUSE_STATUSES]) {
    assert.notEqual(statusLabel(s.value), '', `${s.value} has no label`);
    assert.notEqual(statusBadge(s.value), NEUTRAL_STATUS_BADGE,
      `${s.value} is a declared status but falls through to the neutral chip`);
  }
});

// ── 3. The fallback ─────────────────────────────────────────────────────────

test('an unknown value gets the NEUTRAL chip, not an empty string', () => {
  // A chip with no background is invisible against the row, so an unrecognised
  // status would read as an EMPTY CELL rather than as a status nobody styled.
  // Grey says "unknown"; blank says "nothing here", and only one is true.
  assert.equal(statusBadge('zz-never-seen'), NEUTRAL_STATUS_BADGE);
  assert.equal(statusBadge(''), NEUTRAL_STATUS_BADGE);
  assert.equal(statusBadge(undefined), NEUTRAL_STATUS_BADGE);
  assert.match(NEUTRAL_STATUS_BADGE, /^bg-\S+\s+text-\S+$/, 'the neutral chip is not a complete class pair');
});

/**
 * RETIRED VALUES GET THE NEUTRAL CHIP — deliberately unlike `statusLabel`.
 *
 * The label lookup consults the legacy map because the audit trail renders
 * retired statuses as TEXT forever. The colour lookup does NOT, because the
 * audit trail draws no chip and no live document can hold a retired status any
 * more: the round-2 migration ran and the enum is narrowed to the three live
 * values. A retired value reaching a chip today would be a genuine anomaly, and
 * grey is the honest way to render one.
 */
test('a RETIRED value gets the neutral chip while KEEPING its Thai label', () => {
  for (const retired of Object.keys(LEGACY_STATUS_LABELS)) {
    assert.equal(statusBadge(retired), NEUTRAL_STATUS_BADGE,
      `${retired} still has a live chip colour — the retired palette is back`);
    assert.equal(statusLabel(retired), LEGACY_STATUS_LABELS[retired],
      `${retired} lost its label — the two lookups must diverge only on COLOUR`);
  }
});

test('CONTROL: label and badge genuinely differ on a retired value', () => {
  // Proves the test above is about a real divergence rather than two lookups
  // that happen to agree. If `statusLabel` ever started falling through to a
  // neutral too, the assertion above would still pass and mean nothing.
  const retired = Object.keys(LEGACY_STATUS_LABELS)[0];
  assert.ok(retired, 'there are no retired values — this pair of tests is vacuous');
  assert.notEqual(statusLabel(retired), statusBadge(retired));
  assert.notEqual(statusLabel(retired), NEUTRAL_STATUS_BADGE);
});

// ── 4. Driven by a FABRICATED list ──────────────────────────────────────────

/**
 * `buildStatCards` is the consumer that reads the OTHER colour property
 * (`accent`), and it is the one place a fabricated list can prove the module
 * reads its argument rather than the real arrays. `statusBadge` cannot take an
 * argument list by design — it is a lookup over the live vocabulary — so the
 * fabricated check applies to the builder, and the lookup is pinned against the
 * declared entries above instead.
 */
test('buildStatCards carries a fabricated list\'s accent through untouched', () => {
  const cards = buildStatCards(FABRICATED);
  assert.equal(cards.length, FABRICATED.length + 1, 'one card per status, plus the total');
  for (const s of FABRICATED) {
    const card = cards.find((c) => c.filterVal === s.value);
    assert.ok(card, `no card for ${s.value}`);
    assert.ok(card.cls.includes(s.accent),
      `the card ignored the fabricated accent — it is reading the real array`);
  }
});

test('CONTROL: the fabricated colours are not real ones', () => {
  // If a fabricated class collided with a real status's, the test above could
  // pass against a hard-coded map.
  const real = new Set([...PUBLIC_STATUSES, ...INHOUSE_STATUSES].flatMap((s) => [s.accent, s.badge]));
  for (const s of FABRICATED) {
    assert.ok(!real.has(s.accent), `${s.accent} is a real accent — the fixtures are not disjoint`);
    assert.ok(!real.has(s.badge), `${s.badge} is a real badge — the fixtures are not disjoint`);
  }
});

test('CONTROL: no fabricated status is a real one', () => {
  const real = new Set([...PUBLIC_STATUS_VALUES, ...INHOUSE_STATUS_VALUES, ...Object.keys(LEGACY_STATUS_LABELS)]);
  for (const s of FABRICATED) {
    assert.ok(!real.has(s.value), `${s.value} is a real status — the fixtures are not disjoint`);
    // And the lookup must NOT know them, which is what makes the neutral-chip
    // assertions above meaningful.
    assert.equal(statusBadge(s.value), NEUTRAL_STATUS_BADGE);
  }
});
