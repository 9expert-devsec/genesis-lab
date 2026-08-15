import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_STATUSES,
  PUBLIC_STATUS_VALUES,
  PUBLIC_STATUS_TRANSITIONS,
  INHOUSE_STATUSES,
  INHOUSE_STATUS_VALUES,
  INHOUSE_STATUS_TRANSITIONS,
  INHOUSE_LEGACY_STATUS_MAP,
  LEGACY_STATUS_LABELS,
  ALL_FILTER,
  allowedFromStates,
  allowedTransitions,
  isTransitionAllowed,
  buildStatusLabels,
  buildStatCards,
  buildStatusChips,
  statusesForSource,
  statusValuesForSource,
  transitionsForSource,
  statusLabel,
  statusBadge,
  NEUTRAL_STATUS_BADGE,
  storedValuesForFilter,
  normaliseStatusParam,
} from '@/lib/registrations/statuses';

/**
 * THE IN-HOUSE COLLAPSE — five stored values become three, and the two things
 * that must survive it.
 *
 * This is the round-2 half of the status module. The public half lives in
 * pure/registrationStatuses and its technique is carried over unchanged: the
 * RULES are asserted against the real tables, and the CONSUMERS are driven with
 * FABRICATED input so that nothing hard-coded can satisfy them.
 *
 * ── WHY THIS IS A SEPARATE FILE AND NOT MORE OF THAT ONE ────────────────────
 * The two halves guard different claims. That file's subject is "one array, one
 * table, every consumer derived". This file's subject is a MIGRATION: what the
 * mapping is, what it destroys, and the rule that keeps a value it destroyed
 * from ever becoming selectable again. Those outlive the migration and need to
 * be findable on their own.
 *
 * ── THE FABRICATED FIXTURES ARE DIFFERENT INVENTED VALUES ───────────────────
 * `zz-onhold` / `zz-lapsed` here, against `zz-refunded` / `zz-disputed` there.
 * A consumer that reached for the wrong source's fixture fails rather than
 * coincides.
 */

const THREE_PLUS_TWO = [
  ...INHOUSE_STATUSES,
  { value: 'zz-onhold', label: 'พักไว้',      accent: 'border-l-fuchsia-400' },
  { value: 'zz-lapsed', label: 'หมดความสนใจ', accent: 'border-l-rose-400' },
];

const FAKE_INHOUSE_TABLE = {
  'zz-one':   ['zz-two', 'zz-three'],
  'zz-two':   ['zz-three'],
  'zz-three': [],
};

// ── 1. `paid` IS PUBLIC ONLY ────────────────────────────────────────────────

/**
 * `paid` IS UNREACHABLE FROM EVERY IN-HOUSE STATE, and there are TWO separate
 * things to prove.
 *
 * On the public side `paid` is a declared status with no admin edge into it, so
 * the rule is about the TABLE. In-house does not have the value at all, so the
 * rule is about the VOCABULARY as well: no row can name it, because there is
 * nothing to name.
 *
 * An in-house engagement is invoiced and settled off-platform. No Omise charge
 * exists, so nothing in the system ever observes the money arriving, and a
 * `paid` in-house record would be an admin asserting a payment against no
 * evidence at all.
 */
test('`paid` is not an in-house status at all', () => {
  assert.ok(!INHOUSE_STATUS_VALUES.includes('paid'), '`paid` leaked into the in-house vocabulary');
  assert.ok(!INHOUSE_STATUSES.some((s) => s.value === 'paid'), '`paid` has an in-house card');
});

test('`paid` is not a target of any in-house transition, from any state', () => {
  for (const from of Object.keys(INHOUSE_STATUS_TRANSITIONS)) {
    assert.ok(
      !allowedTransitions(from, INHOUSE_STATUS_TRANSITIONS).includes('paid'),
      `${from} to paid is reachable in-house, where no charge can ever exist`
    );
  }
  assert.deepEqual(allowedFromStates('paid', INHOUSE_STATUS_TRANSITIONS), [],
    'nothing may reach paid in-house');
});

test('`paid` is unreachable from every in-house state, including retired ones', () => {
  // Walks the vocabulary rather than the table's keys, so a status with NO row
  // is covered too — every unmigrated document holds one of those, and
  // `allowedTransitions` returning [] is what makes that a blank toolbar rather
  // than a crash.
  const everyFrom = [...INHOUSE_STATUS_VALUES, ...Object.keys(INHOUSE_LEGACY_STATUS_MAP), 'zz-nonsense'];
  for (const from of everyFrom) {
    assert.equal(
      isTransitionAllowed(from, 'paid', INHOUSE_STATUS_TRANSITIONS),
      false,
      `${from} to paid is permitted in-house`
    );
  }
});

// ── 2. `cancelled` IS TERMINAL IN-HOUSE TOO ─────────────────────────────────

test('in-house `cancelled` has no outgoing transitions', () => {
  assert.deepEqual(allowedTransitions('cancelled', INHOUSE_STATUS_TRANSITIONS), []);
  for (const to of INHOUSE_STATUS_VALUES) {
    assert.equal(
      isTransitionAllowed('cancelled', to, INHOUSE_STATUS_TRANSITIONS),
      false,
      `cancelled to ${to} would make in-house cancellation reversible`
    );
  }
});

test('the real in-house table is exactly the three agreed rows', () => {
  assert.deepEqual(INHOUSE_STATUS_TRANSITIONS, {
    pending:   ['quoted', 'cancelled'],
    quoted:    ['cancelled'],
    cancelled: [],
  });
});

test('nothing reaches in-house `pending` either', () => {
  // The entry state is not a target of anything, so there is no way to un-send
  // a quotation by moving back to it.
  assert.deepEqual(allowedFromStates('pending', INHOUSE_STATUS_TRANSITIONS), []);
});

test('every in-house table entry is a declared status, and every status has a row', () => {
  const declared = new Set(INHOUSE_STATUS_VALUES);
  for (const [from, targets] of Object.entries(INHOUSE_STATUS_TRANSITIONS)) {
    assert.ok(declared.has(from), `from-state ${from} is not a declared in-house status`);
    for (const to of targets) {
      assert.ok(declared.has(to), `${from} to ${to}: ${to} is not a declared in-house status`);
    }
  }
  for (const value of INHOUSE_STATUS_VALUES) {
    // A status with no row is not "no transitions" — it is a detail screen that
    // silently offers nothing and a write gate reading `undefined`.
    assert.ok(
      Object.prototype.hasOwnProperty.call(INHOUSE_STATUS_TRANSITIONS, value),
      `${value} has no row in the in-house transition table`
    );
  }
});

test('the two in-house directions describe the SAME edges', () => {
  for (const table of [INHOUSE_STATUS_TRANSITIONS, FAKE_INHOUSE_TABLE]) {
    for (const from of Object.keys(table)) {
      for (const to of allowedTransitions(from, table)) {
        assert.ok(allowedFromStates(to, table).includes(from),
          `${from} to ${to} is offered forwards but not permitted backwards`);
      }
    }
    for (const to of Object.keys(table)) {
      for (const from of allowedFromStates(to, table)) {
        assert.ok(allowedTransitions(from, table).includes(to),
          `${from} to ${to} is permitted backwards but not offered forwards`);
      }
    }
  }
});

// ── 3. THE LEGACY MAP — SEPARATE, AND DISJOINT FROM THE LIVE VOCABULARY ─────

/**
 * ── ON "ALL FIVE RETIRED VALUES" ────────────────────────────────────────────
 * The old in-house vocabulary had FIVE values. Only FOUR of them are RETIRED:
 * `quoted` maps to itself and survives into the live set.
 *
 * A five-member legacy map would therefore have to contain `quoted` — and the
 * very next rule, that the legacy map shares NO value with the live vocabulary
 * so that a retired value can never become selectable, would then be
 * unsatisfiable. Four is the only count at which both hold, and the
 * disjointness assertion below is what forces it rather than a comment.
 */
test('the legacy map covers every retired value — the four the collapse removes', () => {
  assert.deepEqual(
    Object.keys(LEGACY_STATUS_LABELS).sort(),
    ['closed-lost', 'closed-won', 'contacted', 'new'],
    'the retired set changed without the labels following'
  );
});

test('the legacy LABELS and the migration MAP cover exactly the same values', () => {
  // A value migrated away from is exactly a value whose label must survive. If
  // these two drift, either a retired value renders as a raw enum in the audit
  // trail, or a label exists for something that was never retired.
  assert.deepEqual(
    Object.keys(LEGACY_STATUS_LABELS).sort(),
    Object.keys(INHOUSE_LEGACY_STATUS_MAP).sort()
  );
});

test('the legacy map shares NO value with the live vocabulary of either source', () => {
  // THE RULE THAT KEEPS A RETIRED VALUE UNSELECTABLE. Everything in the live
  // arrays becomes a filter chip, a summary card and a transition target; the
  // legacy map only ever decorates history. An overlap puts `contacted` back on
  // the screen as something an admin can choose.
  const live = new Set([...PUBLIC_STATUS_VALUES, ...INHOUSE_STATUS_VALUES]);
  for (const retired of Object.keys(LEGACY_STATUS_LABELS)) {
    assert.ok(!live.has(retired), `${retired} is both retired and live — it would be selectable`);
  }
});

test('every legacy value maps ONTO a live in-house status', () => {
  const live = new Set(INHOUSE_STATUS_VALUES);
  for (const [retired, target] of Object.entries(INHOUSE_LEGACY_STATUS_MAP)) {
    assert.ok(live.has(target), `${retired} migrates to ${target}, which is not a live status`);
  }
});

test('the mapping is the one that was ruled, value for value', () => {
  // Written out because it is a DECISION, not a derivation — and two of its
  // edges are lossy. See the module for why `closed-won` to `quoted` is right.
  assert.deepEqual(INHOUSE_LEGACY_STATUS_MAP, {
    new:           'pending',
    contacted:     'pending',
    'closed-won':  'quoted',
    'closed-lost': 'cancelled',
  });
});

test('`quoted` survives the collapse — it is live, not legacy', () => {
  assert.ok(INHOUSE_STATUS_VALUES.includes('quoted'));
  assert.ok(!('quoted' in LEGACY_STATUS_LABELS), '`quoted` must not be a legacy label');
  assert.ok(!('quoted' in INHOUSE_LEGACY_STATUS_MAP), '`quoted` must not be a migration key');
});

test('every legacy value has a non-empty Thai label', () => {
  for (const [value, label] of Object.entries(LEGACY_STATUS_LABELS)) {
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${value} has no legacy label`);
  }
});

// ── 4. statusLabel — LIVE OR RETIRED, ONE READER ────────────────────────────

test('statusLabel answers for every live value of both sources', () => {
  const publicLabels  = buildStatusLabels(PUBLIC_STATUSES);
  const inhouseLabels = buildStatusLabels(INHOUSE_STATUSES);
  for (const [value, label] of Object.entries(publicLabels)) {
    assert.equal(statusLabel(value), label, `statusLabel disagrees with the public list on ${value}`);
  }
  for (const [value, label] of Object.entries(inhouseLabels)) {
    assert.equal(statusLabel(value), label, `statusLabel disagrees with the in-house list on ${value}`);
  }
});

test('statusLabel answers for every RETIRED value', () => {
  // The audit trail holds rows carrying these forever. Without this they render
  // as raw enum strings next to properly-labelled live ones.
  for (const [value, label] of Object.entries(LEGACY_STATUS_LABELS)) {
    assert.equal(statusLabel(value), label, `a retired ${value} renders as a raw enum`);
  }
});

test('statusLabel returns an unknown value UNCHANGED, not a dash', () => {
  // An audit row from somewhere this module has never heard of should show what
  // it holds. Replacing it with an em dash hides evidence in the one place that
  // exists to preserve it.
  assert.equal(statusLabel('zz-never-seen'), 'zz-never-seen');
  assert.equal(statusLabel(''), '');
});

/**
 * THE MERGE INSIDE statusLabel IS ONLY SAFE BECAUSE THE SUBSETS DO NOT COLLIDE.
 *
 * It reads one flattened map built from both lists. `pending` and `cancelled`
 * are in both, and a flatten silently prefers whichever spreads last. That is
 * fine ONLY while they carry identical labels. The day they stop doing so, one
 * source's wording vanishes from the audit trail with nothing on screen to say
 * which one won. This is the line that notices.
 */
test('a value in BOTH subsets carries the SAME label in both', () => {
  const publicLabels  = buildStatusLabels(PUBLIC_STATUSES);
  const inhouseLabels = buildStatusLabels(INHOUSE_STATUSES);
  const shared = Object.keys(inhouseLabels).filter((v) => v in publicLabels);
  assert.ok(shared.length >= 2, 'the two subsets stopped overlapping — this rule now guards nothing');
  for (const value of shared) {
    assert.equal(publicLabels[value], inhouseLabels[value], `${value} means two different things`);
  }
});

// ── 5. PER-SOURCE SELECTION ─────────────────────────────────────────────────

test('statusesForSource returns the in-house subset for `inhouse`, public for everything else', () => {
  assert.deepEqual(statusesForSource('inhouse'), INHOUSE_STATUSES);
  // The fallback must match `getModel`, which treats everything not 'inhouse'
  // as public. If the two disagree, a screen renders one collection's chrome
  // over the other's documents.
  for (const source of ['public', undefined, '', 'nonsense']) {
    assert.deepEqual(statusesForSource(source), PUBLIC_STATUSES,
      `source ${JSON.stringify(source)} must fall back to public`);
  }
});

test('transitionsForSource picks the same way', () => {
  assert.deepEqual(transitionsForSource('inhouse'),  INHOUSE_STATUS_TRANSITIONS);
  assert.deepEqual(transitionsForSource('public'),   PUBLIC_STATUS_TRANSITIONS);
  assert.deepEqual(transitionsForSource('nonsense'), PUBLIC_STATUS_TRANSITIONS);
});

test('statusValuesForSource agrees with statusesForSource', () => {
  for (const source of ['public', 'inhouse']) {
    assert.deepEqual(statusValuesForSource(source), statusesForSource(source).map((s) => s.value));
  }
});

test('CONTROL: the two subsets really are different — the selector does work', () => {
  // Without this, every assertion above could hold with one list serving both.
  assert.notDeepEqual(INHOUSE_STATUS_VALUES, PUBLIC_STATUS_VALUES);
  const publicOnly = PUBLIC_STATUS_VALUES.filter((v) => !INHOUSE_STATUS_VALUES.includes(v));
  assert.ok(publicOnly.includes('paid'), '`paid` must be one of the public-only values');
});

// ── 6. THE FILTER WIDENING AND THE UNKNOWN-STATUS DEGRADE ───────────────────

test('an in-house filter matches its own value AND the legacy values that migrate onto it', () => {
  // The window between this code deploying and the migration's --apply. Without
  // the widening the summary strip reads a real total over cards summing to
  // almost nothing — the original defect, arriving from the other direction.
  assert.deepEqual(storedValuesForFilter('pending', 'inhouse').sort(),   ['contacted', 'new', 'pending']);
  assert.deepEqual(storedValuesForFilter('quoted', 'inhouse').sort(),    ['closed-won', 'quoted']);
  assert.deepEqual(storedValuesForFilter('cancelled', 'inhouse').sort(), ['cancelled', 'closed-lost']);
});

test('the live value is always FIRST in the widened list', () => {
  for (const value of INHOUSE_STATUS_VALUES) {
    assert.equal(storedValuesForFilter(value, 'inhouse')[0], value);
  }
});

test('the widened lists PARTITION the stored vocabulary — none in two, none missed', () => {
  const all = INHOUSE_STATUS_VALUES.flatMap((v) => storedValuesForFilter(v, 'inhouse'));
  assert.equal(new Set(all).size, all.length, 'a stored value is counted by two different cards');
  const expected = [...INHOUSE_STATUS_VALUES, ...Object.keys(INHOUSE_LEGACY_STATUS_MAP)].sort();
  assert.deepEqual([...new Set(all)].sort(), expected,
    'a stored value belongs to no card — it would sit in the total and be displayed by nothing');
});

test('a public filter is never widened — public has no legacy vocabulary', () => {
  for (const value of PUBLIC_STATUS_VALUES) {
    assert.deepEqual(storedValuesForFilter(value, 'public'), [value]);
  }
});

test('an unrecognised status returns [] — the signal for "no clause, show all"', () => {
  for (const status of ['new', 'contacted', 'closed-won', 'closed-lost', 'zz-nonsense', '', 'all']) {
    assert.deepEqual(storedValuesForFilter(status, 'inhouse'), [],
      `${status} must not produce a filter clause`);
  }
  // Cross-source. `paid` is a real status, but not one in-house can hold.
  assert.deepEqual(storedValuesForFilter('paid', 'inhouse'), [],
    '`paid` must not be filterable on the in-house list');
  assert.deepEqual(storedValuesForFilter('quoted', 'public'), [],
    '`quoted` must not be filterable on the public list');
});

test('normaliseStatusParam keeps a live value and degrades everything else to `all`', () => {
  for (const value of INHOUSE_STATUS_VALUES) {
    assert.equal(normaliseStatusParam(value, 'inhouse'), value);
  }
  for (const value of PUBLIC_STATUS_VALUES) {
    assert.equal(normaliseStatusParam(value, 'public'), value);
  }
  // The bookmarks and open tabs this exists for.
  for (const stale of ['new', 'contacted', 'closed-won', 'closed-lost']) {
    assert.equal(normaliseStatusParam(stale, 'inhouse'), ALL_FILTER.value,
      `a bookmarked status=${stale} must degrade to show-all, not to an empty list`);
  }
  assert.equal(normaliseStatusParam('paid', 'inhouse'), ALL_FILTER.value);
  assert.equal(normaliseStatusParam(undefined, 'public'), ALL_FILTER.value);
});

test('normaliseStatusParam and storedValuesForFilter agree on what is recognised', () => {
  // Two functions, one notion of "live". If they disagree the screen shows a
  // chip selected while the query ignores it, or the reverse — two answers to
  // one question, in the small.
  const everyStatus = [
    ...PUBLIC_STATUS_VALUES, ...INHOUSE_STATUS_VALUES,
    ...Object.keys(LEGACY_STATUS_LABELS), 'zz-nonsense',
  ];
  for (const source of ['public', 'inhouse']) {
    for (const status of everyStatus) {
      const uiRecognises    = normaliseStatusParam(status, source) !== ALL_FILTER.value;
      const queryRecognises = storedValuesForFilter(status, source).length > 0;
      assert.equal(uiRecognises, queryRecognises,
        `${source}/${status}: the UI and the query disagree about whether this is a status`);
    }
  }
});

// ── 7. THE CONSUMERS, DRIVEN BY A FABRICATED IN-HOUSE LIST ──────────────────

test('a 5-member in-house list produces 5 chips + the all chip', () => {
  const chips = buildStatusChips(THREE_PLUS_TWO);
  assert.equal(chips.length, THREE_PLUS_TWO.length + 1, 'one chip per status, plus ทั้งหมด');
  assert.deepEqual(chips.map((c) => c.value), [ALL_FILTER.value, ...THREE_PLUS_TWO.map((s) => s.value)]);
});

test('a 5-member in-house list produces 5 cards + the total card', () => {
  const cards = buildStatCards(THREE_PLUS_TWO);
  assert.equal(cards.length, THREE_PLUS_TWO.length + 1, 'one card per status, plus ทั้งหมด');
  assert.deepEqual(cards.map((c) => c.filterVal), [ALL_FILTER.value, ...THREE_PLUS_TWO.map((s) => s.value)]);
});

test('the two invented in-house statuses reach cards, chips AND labels', () => {
  const chipValues  = new Set(buildStatusChips(THREE_PLUS_TWO).map((c) => c.value));
  const cardFilters = new Set(buildStatCards(THREE_PLUS_TWO).map((c) => c.filterVal));
  const labels      = buildStatusLabels(THREE_PLUS_TWO);
  for (const value of ['zz-onhold', 'zz-lapsed']) {
    assert.ok(chipValues.has(value),  `chip missing for ${value}`);
    assert.ok(cardFilters.has(value), `card missing for ${value}`);
    assert.ok(labels[value],          `label missing for ${value}`);
  }
});

/**
 * THE DRIFT ASSERTION ITSELF — the two lists offer the same statuses.
 *
 * This is the one that would have caught the shipped defect the module was
 * created for: the chips offered `quoted` and the cards did not, so these two
 * sets differed by one member and the strip read 6 over cards summing to 5.
 */
test('cards, chips and labels offer the same set for any in-house-shaped list', () => {
  for (const list of [INHOUSE_STATUSES, THREE_PLUS_TWO, INHOUSE_STATUSES.slice(0, 1)]) {
    const fromChips = buildStatusChips(list).map((c) => c.value).filter((v) => v !== ALL_FILTER.value);
    const fromCards = buildStatCards(list).map((c) => c.filterVal).filter((v) => v !== ALL_FILTER.value);
    assert.deepEqual(fromCards, fromChips, `card/chip divergence on a ${list.length}-member list`);
    assert.deepEqual(Object.keys(buildStatusLabels(list)), fromChips,
      `label divergence on a ${list.length}-member list`);
  }
});

test('the same status carries the same LABEL in cards and chips', () => {
  const chipLabel = new Map(buildStatusChips(THREE_PLUS_TWO).map((c) => [c.value, c.label]));
  for (const card of buildStatCards(THREE_PLUS_TWO)) {
    if (card.filterVal === ALL_FILTER.value) continue;
    assert.equal(card.label, chipLabel.get(card.filterVal), `label drift on ${card.filterVal}`);
  }
});

test('allowedTransitions reads the in-house table it is GIVEN, not a real one', () => {
  assert.deepEqual(allowedTransitions('zz-one', FAKE_INHOUSE_TABLE), ['zz-two', 'zz-three']);
  assert.deepEqual(allowedTransitions('zz-three', FAKE_INHOUSE_TABLE), []);
  // Every REAL status, against the fabricated table. A function consulting the
  // real table and ignoring its argument fails here.
  for (const real of [...PUBLIC_STATUS_VALUES, ...INHOUSE_STATUS_VALUES]) {
    assert.deepEqual(allowedTransitions(real, FAKE_INHOUSE_TABLE), [],
      `${real} is named by the fabricated table — the fixtures are not disjoint`);
  }
});

test('CONTROL: a builder that ignored its argument would fail the 5-member expectation', () => {
  assert.notEqual(
    buildStatCards(INHOUSE_STATUSES).length,
    THREE_PLUS_TWO.length + 1,
    'the control is inert — the real in-house list already has 5 members, so rewrite THREE_PLUS_TWO'
  );
});

test('CONTROL: no fabricated in-house state is a real status of either source', () => {
  const real = new Set([
    ...PUBLIC_STATUS_VALUES, ...INHOUSE_STATUS_VALUES, ...Object.keys(LEGACY_STATUS_LABELS),
  ]);
  const fabricated = new Set([
    ...Object.keys(FAKE_INHOUSE_TABLE),
    ...Object.values(FAKE_INHOUSE_TABLE).flat(),
    ...THREE_PLUS_TWO.slice(INHOUSE_STATUSES.length).map((s) => s.value),
  ]);
  for (const value of fabricated) {
    assert.ok(!real.has(value), `${value} is a real status — the fixtures are not disjoint`);
  }
});

// ── 8. Invariants of the REAL in-house list ─────────────────────────────────

test('the in-house stored values are the three agreed, in pipeline order', () => {
  assert.deepEqual(INHOUSE_STATUS_VALUES, ['pending', 'quoted', 'cancelled']);
});

test('the in-house list has unique values, non-empty labels and whole accent classes', () => {
  assert.equal(new Set(INHOUSE_STATUS_VALUES).size, INHOUSE_STATUS_VALUES.length);
  for (const s of INHOUSE_STATUSES) {
    assert.ok(s.label.trim().length > 0,  `${s.value} has no label`);
    assert.ok(s.accent.trim().length > 0, `${s.value} has no accent class`);
    // Tailwind scans source text for complete class names, so a fragment built
    // at runtime is purged and the card renders with no colour at all.
    assert.ok(!s.accent.includes('${'), `${s.value} interpolates its accent class`);
    assert.match(s.accent, /^border-l-/, `${s.value} accent is not a left-border class`);
  }
});

test('every in-house card key is a stored value and equals its filterVal', () => {
  const stored = new Set(INHOUSE_STATUS_VALUES);
  for (const card of buildStatCards(INHOUSE_STATUSES).slice(1)) {
    assert.ok(stored.has(card.key), `card key ${card.key} is not a stored in-house status`);
    assert.equal(card.key, card.filterVal, 'key and filterVal must be the same string');
  }
});

test('in-house `quoted` reads as the quotation step, in the same words public uses', () => {
  // The collapse's premise: both flows END at "quotation sent" and stay there.
  // If these two ever differ, the two strips describe one act two ways.
  assert.equal(buildStatusLabels(INHOUSE_STATUSES).quoted,   'ส่งใบเสนอราคาแล้ว');
  assert.equal(buildStatusLabels(PUBLIC_STATUSES).confirmed, 'ส่งใบเสนอราคาแล้ว');
});
