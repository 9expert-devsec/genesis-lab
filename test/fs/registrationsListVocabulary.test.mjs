import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import {
  PUBLIC_STATUSES,
  INHOUSE_STATUSES,
  LEGACY_STATUS_LABELS,
  INHOUSE_LEGACY_STATUS_MAP,
  NEUTRAL_STATUS_BADGE,
  buildStatCards,
  isSystemSet,
  statusBadge,
  statusLabel,
} from '@/lib/registrations/statuses';

/**
 * NO STATUS VALUE, LABEL OR COLOUR IS WRITTEN BY HAND IN A LIST CLIENT.
 *
 * ── WHY A FOURTH FILE ON THIS SUBJECT ───────────────────────────────────────
 * publicStatusLabelSources and registrationsFilterWiring each own a slice of
 * this rule and both are pinned to a specific defect that happened. This one is
 * the GENERAL form, and it exists because round 3 gave the screens a new reason
 * to want a status literal: the summary card for a system-set status carries a
 * lock, and the shortest way to write that is `s.value === 'paid'`.
 *
 * That shortcut passes every other test in this suite. The render guard asserts
 * the number of locks matches `isSystemSet`'s answer — and for today's data the
 * hard-coded form gives the identical number, so it reddens nothing. Measured,
 * not assumed: the rehearsal script makes exactly that edit and the render tier
 * stays green. This file is what catches it.
 *
 * ── THE LISTS ARE DERIVED FROM THE MODULE ───────────────────────────────────
 * Every forbidden string below comes out of lib/registrations/statuses at run
 * time — live values, retired values, live labels, retired labels. A status
 * added or relabelled there is covered here with this file untouched, which
 * matters because "somebody added a status and hand-wrote it into a screen" is
 * the whole failure mode.
 *
 * ── WHAT IS DELIBERATELY *NOT* FORBIDDEN, AND WHY ───────────────────────────
 * THE COLOUR STRINGS. Forbidding `bg-emerald-100 text-emerald-700` in these
 * files goes RED ON CORRECT CODE: it is `paid`'s badge AND it is
 * `SCHEDULE_BADGE.online`, character for character. Two unrelated vocabularies
 * that happen to have picked the same green.
 *
 * That is the same trap commit 1 measured and narrowed for `bg-slate-100
 * text-slate-600`, which is both the neutral status chip and SCHEDULE_BADGE's
 * unknown-type fallback. Banning the string would be banning the wrong thing.
 *
 * So the colour half is expressed as a SHAPE instead — no object in these files
 * may be KEYED BY A STATUS VALUE — which is what a hand-written colour map
 * actually is, and which no schedule or training-format map can trip.
 */

/**
 * EVERY FILE THE LIST SCREEN IS BUILT FROM.
 *
 * Enumerated by path, and the enumeration is updated in the SAME commit as any
 * move — round 3 added PublicTable and tableParts when the public body was
 * extracted and the status chip was folded into a shared cell. A rule of this
 * shape is only worth what its file list covers: a status literal in a file
 * nobody scans is a status literal.
 */
const CLIENTS = [
  'src/app/admin/registrations/_components/RegistrationsClient.jsx',
  'src/app/admin/registrations/_components/PublicTable.jsx',
  'src/app/admin/registrations/_components/InhouseTable.jsx',
  'src/app/admin/registrations/_components/tableParts.jsx',
  'src/app/admin/registrations/_components/ListPanel.jsx',
].map((rel) => readSource(rel));

/** Every status value the product has ever stored, live or retired. */
const ALL_VALUES = [
  ...new Set([
    ...PUBLIC_STATUSES.map((s) => s.value),
    ...INHOUSE_STATUSES.map((s) => s.value),
    ...Object.keys(INHOUSE_LEGACY_STATUS_MAP),
  ]),
];

/** Every Thai label, live or retired. */
const ALL_LABELS = [
  ...new Set([
    ...PUBLIC_STATUSES.map((s) => s.label),
    ...INHOUSE_STATUSES.map((s) => s.label),
    ...Object.values(LEGACY_STATUS_LABELS),
  ]),
];

test('the derived lists are non-empty and cover both vocabularies', () => {
  // Every assertion below is a NEGATIVE over these arrays. An empty array
  // satisfies all of them forever while reading as "all clear".
  assert.ok(ALL_VALUES.length >= 7, `only ${ALL_VALUES.length} status values — the derivation is wrong`);
  assert.ok(ALL_LABELS.length >= 6, `only ${ALL_LABELS.length} status labels — the derivation is wrong`);
  assert.ok(ALL_VALUES.includes('paid'), 'the public-only value is missing from the derivation');
  assert.ok(ALL_VALUES.includes('closed-won'), 'a retired value is missing — a "restore the old enum" edit would pass');
});

for (const src of CLIENTS) {
  const name = src.rel.split('/').pop();

  test(`${name}: no status VALUE appears as a string literal`, () => {
    for (const value of ALL_VALUES) {
      const literal = new RegExp(`['"\`]${value}['"\`]`);
      assert.ok(
        !literal.test(src.code),
        `'${value}' is written by hand in ${src.rel}. Ask the module instead — `
        + 'statusesForSource / isSystemSet / statusLabel / statusBadge all take the value '
        + 'and none of them requires naming one.',
      );
    }
  });

  test(`${name}: no status LABEL appears at all`, () => {
    for (const label of ALL_LABELS) {
      assert.ok(
        !src.code.includes(label),
        `the label ${label} is hard-coded in ${src.rel}. Labels come from statusLabel(); a `
        + 'second spelling is how the list, the card and the detail header start disagreeing '
        + 'about what a status is called.',
      );
    }
  });

  /**
   * THE COLOUR HALF, AS A SHAPE.
   *
   * A hand-written badge or accent map is an object keyed by status value. That
   * is the thing to forbid — not the class strings, which two unrelated
   * vocabularies legitimately share (see the header).
   *
   * Both key forms, because `{ paid: … }` and `{ 'paid': … }` are the same
   * object and only the second is a string literal the test above would see.
   *
   * The leading character class INCLUDES THE QUOTES, and that was found by the
   * control rather than reasoned about: a hyphenated value cannot be a bare
   * identifier, so `closed-won` only ever appears as `'closed-won':` — and a
   * matcher demanding `{`, `,` or whitespace immediately before the name never
   * fires on it. The value-literal test above happens to catch that one anyway,
   * but a rule that silently covers seven of nine values is worse than one that
   * covers all nine, because nothing says which is which.
   */
  test(`${name}: no object is keyed by a status value`, () => {
    for (const value of ALL_VALUES) {
      const key = new RegExp(`(^|[{,\\s'"\`])${value.replace(/-/g, '\\-')}\\s*['"\`]?\\s*:`, 'm');
      assert.ok(
        !key.test(src.code),
        `${src.rel} contains an object keyed by '${value}'. A map keyed by status value is a `
        + 'colour/label list by another name — that shape existed in four files and drifted in '
        + 'three of them.',
      );
    }
  });
}

/**
 * THE LOCK IS ASKED, NOT NAMED.
 *
 * The positive half. Everything above forbids the shortcut; this asserts the
 * derivation is actually wired, so the file cannot satisfy the rule by having no
 * lock at all.
 */
test('the summary card decides the lock by asking the transition table', () => {
  const client = CLIENTS.find((c) => c.rel.endsWith('RegistrationsClient.jsx'));
  assert.match(client.code, /isSystemSet\(s\.value,\s*source\)/,
    'the lock is not derived from isSystemSet — it is decided some other way');
});

// ── The consumers, driven by a FABRICATED vocabulary ────────────────────────

/**
 * A status list that exists nowhere in the product.
 *
 * ── WHY FABRICATED AND NOT THE REAL ARRAYS ──────────────────────────────────
 * Driving the builders with `PUBLIC_STATUSES` proves they return the right
 * answer for the one input anybody has ever passed them. It cannot tell a
 * derivation from a lookup table that happens to agree: a `buildStatCards` that
 * secretly ignored its argument and returned the public cards would pass every
 * such test, and so would one that filtered its input down to values it
 * recognised.
 *
 * These values and labels are deliberately unlike anything real — no Thai, no
 * `pending`, colours that are not in the palette — so a builder that leaked a
 * real status, dropped an unfamiliar one, or substituted a known colour is
 * visible immediately.
 */
const FABRICATED = [
  { value: 'zzz-alpha', label: 'ALPHA-LABEL', accent: 'border-l-fuchsia-400', badge: 'bg-fuchsia-100 text-fuchsia-700' },
  { value: 'zzz-beta',  label: 'BETA-LABEL',  accent: 'border-l-lime-400',    badge: 'bg-lime-100 text-lime-700' },
];

test('buildStatCards passes a fabricated vocabulary straight through', () => {
  const cards = buildStatCards(FABRICATED);

  // The total card, then one per fabricated status — in order, and nothing else.
  assert.equal(cards.length, FABRICATED.length + 1, 'the builder added or dropped a card');
  assert.deepEqual(cards.slice(1).map((c) => c.key), ['zzz-alpha', 'zzz-beta']);
  assert.deepEqual(cards.slice(1).map((c) => c.label), ['ALPHA-LABEL', 'BETA-LABEL']);

  // The accent travels with the value, complete, and is not swapped for a known
  // one. `border-l-4` is prepended by the builder; the colour is the input's.
  assert.equal(cards[1].cls, 'border-l-4 border-l-fuchsia-400');
  assert.equal(cards[2].cls, 'border-l-4 border-l-lime-400');

  // And no real status leaked in, which a table-lookup implementation would do.
  for (const real of PUBLIC_STATUSES) {
    assert.ok(!cards.some((c) => c.key === real.value),
      `the builder emitted the real status ${real.value} for a fabricated list`);
  }
});

/**
 * The lookups answer for a value they have never heard of, and answer HONESTLY.
 *
 * `statusLabel` returns the value unchanged rather than a dash — an audit row
 * from a collection this module knows nothing about must show what it holds.
 * `statusBadge` returns the neutral grey rather than '' — a chip with no
 * background reads as an empty cell, and "unknown" is not "nothing here".
 */
test('statusLabel and statusBadge answer for a fabricated value without inventing one', () => {
  assert.equal(statusLabel('zzz-alpha'), 'zzz-alpha');
  assert.equal(statusBadge('zzz-alpha'), NEUTRAL_STATUS_BADGE);
  assert.ok(NEUTRAL_STATUS_BADGE.length > 0, 'the neutral chip is empty — an unknown status would be invisible');
});

test('isSystemSet says no to a fabricated value rather than throwing', () => {
  // A value with no row in the transition table is not "locked", it is unknown —
  // and a screen rendering an unmigrated or foreign status must not grow a lock
  // it cannot explain.
  assert.equal(isSystemSet('zzz-alpha', 'public'), false);
  assert.equal(isSystemSet('zzz-alpha', 'inhouse'), false);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: each matcher fires on the shape it bans', () => {
  /**
   * All three per-file tests are negatives over real files. If a matcher were
   * wrong they would pass forever. Point each at the exact source it is meant to
   * reject — including the two key forms, since only one of them is a string
   * literal and an earlier version of this file caught only that one.
   */
  const valueLiteral = new RegExp(`['"\`]paid['"\`]`);
  assert.ok(valueLiteral.test("const locked = s.value === 'paid';"), 'the value matcher misses the shortcut it exists for');
  assert.ok(!valueLiteral.test('const locked = isSystemSet(s.value, source);'), 'and does not fire on the correct form');

  const key = (v) => new RegExp(`(^|[{,\\s'"\`])${v.replace(/-/g, '\\-')}\\s*['"\`]?\\s*:`, 'm');
  assert.ok(key('paid').test("const M = { paid: 'bg-emerald-100' };"), 'the key matcher misses an unquoted map key');
  assert.ok(key('paid').test("const M = {\n  paid: 'x',\n};"), 'and misses one on its own line');
  assert.ok(key('paid').test("const M = { 'paid': 'x' };"), 'and misses a quoted one');

  /**
   * The hyphenated case, which is what made this control worth writing. A value
   * like `closed-won` is not a legal bare identifier, so it can ONLY appear as a
   * quoted key — and the first version of this matcher required `{`, `,` or
   * whitespace immediately before the name, which a quote is not. It matched
   * nothing for two of the nine values.
   */
  assert.ok(key('closed-won').test("const M = { 'closed-won': 'x' };"), 'a hyphenated value is not matched as a key');
  assert.ok(key('closed-lost').test("const M = {\n  'closed-lost': 'y',\n};"), 'nor one on its own line');

  // …and it does NOT fire on a call that merely passes the value along, or the
  // per-file tests would be failing on correct code rather than on a map.
  assert.ok(!key('paid').test('const x = isSystemSet(value, source);'));
  assert.ok(!key('paid').test("navigate({ status: filterVal });"));

  // The label matcher is a plain `includes`, which is right for SOURCE (a label
  // in code is always inside a quoted string) and would be wrong for MARKUP,
  // where Thai negates by prefix. Pinned so the two are not confused later.
  assert.ok("const L = 'ยกเลิก';".includes('ยกเลิก'));
});

test('CONTROL: the scanned clients are real, non-empty code', () => {
  // A path typo makes readSource throw, but a matcher pointed at a file the
  // scrubber reduced to nothing passes quietly-green forever.
  for (const src of CLIENTS) {
    assert.ok(src.code.length > 400, `${src.rel} scrubbed to ${src.code.length} chars — the scan is inert`);
  }
  // And each really is the file it claims to be — checked by the export it must
  // carry, so a path that silently started resolving to a different module does
  // not go unnoticed.
  const exports = [
    /export function RegistrationsClient/,
    /export function PublicTable/,
    /export function InhouseTable/,
    /export function StatusCell/,
    /export function ListPanel/,
  ];
  assert.equal(CLIENTS.length, exports.length, 'the file list and the export list have drifted apart');
  CLIENTS.forEach((src, i) => assert.match(src.code, exports[i], `${src.rel} is not the file it is listed as`));
});
