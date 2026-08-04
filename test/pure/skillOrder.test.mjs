import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  skillOrderKey,
  buildSkillOrderMap,
  orderRowFor,
  sortSkillsByAdminOrder,
  DEFAULT_SKILL_ORDER,
} from '@/lib/navmenu/skillOrder';
import { skills as CONFIG } from '@/config/site';

// The join between the admin's SkillOrder rows and the static skill config.
//
// The defect this guards is silence: SkillOrder.skillId holds the SHORT CODE
// while the config keys on the ObjectId, so a join written the obvious way
// matches ZERO rows and every skill falls to the default order. The menu then
// renders in config order and looks exactly like a feature that was never
// built — no error, no warning, nothing to grep for.
//
// WHAT THIS CANNOT SEE: it is a pure test over fixtures. It cannot prove
// getNavMenuData actually passes the map to the header, nor that the live rows
// still key on the code — that was measured once (2026-08-04: 0/8 match an
// _id, 7/8 match a skill_id) and no tier here reaches Mongo. The render tier
// covers the wiring; the key space is a human measurement.

/** Two fixtures modelled on the real rows, including the ghost. */
const FIXTURE_ROWS = [
  { skillId: 'POWERPLATFORM', order: 0, isHidden: false },
  { skillId: 'BUSINESS', order: 1, isHidden: false },
  { skillId: 'DES', order: 2, isHidden: false },
  { skillId: 'DATA', order: 3, isHidden: false },
  { skillId: 'AI', order: 4, isHidden: false },
  { skillId: 'DEV', order: 5, isHidden: false },
  { skillId: 'RPA', order: 5, isHidden: false }, // ← the ghost, tied with DEV
  { skillId: 'AUT', order: 6, isHidden: false },
];

const entry = (code, extra = {}) => ({
  slug: code.toLowerCase(),
  upstreamId: `id-${code}`,
  upstreamCode: code,
  label: code,
  ...extra,
});

const codes = (list) => list.map((s) => s.upstreamCode);

// ── the normaliser ─────────────────────────────────────────────────

test('skillOrderKey upper-cases and trims, so both sides of the join agree', () => {
  assert.equal(skillOrderKey('aut'), 'AUT');
  assert.equal(skillOrderKey('  AUT  '), 'AUT');
  assert.equal(skillOrderKey('AUT'), 'AUT');
});

test('skillOrderKey turns every absent value into the empty string', () => {
  // Not into "UNDEFINED" or "NULL", which would be a key that could MATCH
  // another absent value and silently join two unrelated rows.
  for (const v of [undefined, null, '']) assert.equal(skillOrderKey(v), '');
});

test('CONTROL: without normalisation the real key spaces do NOT match', () => {
  // This is the measurement that decided the join, in executable form. If
  // someone "simplifies" the reader to compare upstreamId against skillId, the
  // result is this: nothing matches, and nothing says so.
  const rowKeys = new Set(FIXTURE_ROWS.map((r) => r.skillId));
  const byId = CONFIG.filter((s) => rowKeys.has(s.upstreamId));
  assert.equal(byId.length, 0, 'no config upstreamId is a SkillOrder skillId');
  const byCode = CONFIG.filter((s) => rowKeys.has(s.upstreamCode));
  assert.equal(byCode.length, CONFIG.length, 'every config upstreamCode is one');
});

// ── the map ────────────────────────────────────────────────────────

test('buildSkillOrderMap keys on the normalised id and keeps order + isHidden', () => {
  const map = buildSkillOrderMap([{ skillId: 'aut', order: 6, isHidden: true }]);
  assert.deepEqual(map, { AUT: { order: 6, isHidden: true } });
});

test('buildSkillOrderMap defaults a missing order and drops a blank id', () => {
  const map = buildSkillOrderMap([
    { skillId: 'AI' },
    { skillId: '', order: 1 },
    { order: 2 },
  ]);
  assert.deepEqual(map, { AI: { order: DEFAULT_SKILL_ORDER, isHidden: false } });
});

test('orderRowFor finds a row by code, and falls back to the ObjectId', () => {
  // The ObjectId branch is not decorative: SkillOrder's writer is
  // `skillIdOf(s) = skill_id ?? _id`, so a future upstream skill with no
  // short code lands in the map under its ObjectId.
  const byCode = buildSkillOrderMap([{ skillId: 'AUT', order: 6 }]);
  assert.equal(orderRowFor(entry('AUT'), byCode).order, 6);

  const byId = buildSkillOrderMap([{ skillId: 'id-AUT', order: 3 }]);
  assert.equal(orderRowFor(entry('AUT'), byId).order, 3);

  assert.equal(orderRowFor(entry('AUT'), {}), null);
});

// ── the sort ───────────────────────────────────────────────────────

test('the menu follows the admin order, not the config order', () => {
  const config = [entry('AI'), entry('DEV'), entry('POWERPLATFORM'), entry('BUSINESS')];
  const sorted = sortSkillsByAdminOrder(config, buildSkillOrderMap(FIXTURE_ROWS));
  assert.deepEqual(codes(sorted), ['POWERPLATFORM', 'BUSINESS', 'AI', 'DEV']);
});

test('CONTROL: an EMPTY order map leaves the config order intact', () => {
  // The degraded state the whole feature hangs on: a failed Mongo read must
  // cost the ordering, never the menu. `{}` means "no opinion".
  const config = [entry('AI'), entry('DEV'), entry('POWERPLATFORM'), entry('BUSINESS')];
  assert.deepEqual(codes(sortSkillsByAdminOrder(config, {})), codes(config));
  assert.deepEqual(codes(sortSkillsByAdminOrder(config, undefined)), codes(config));
  assert.equal(sortSkillsByAdminOrder([], {}).length, 0);
});

test('a hidden skill is dropped from the list entirely', () => {
  const config = [entry('AI'), entry('DEV')];
  const map = buildSkillOrderMap([
    { skillId: 'AI', order: 0, isHidden: true },
    { skillId: 'DEV', order: 1, isHidden: false },
  ]);
  assert.deepEqual(codes(sortSkillsByAdminOrder(config, map)), ['DEV']);
});

test('CONTROL: isHidden false and a missing row both KEEP the skill', () => {
  // Pairs with the test above — a filter that dropped anything falsy, or
  // anything without a row, would pass there and fail here.
  const config = [entry('AI'), entry('DEV')];
  assert.deepEqual(
    codes(sortSkillsByAdminOrder(config, buildSkillOrderMap([{ skillId: 'AI', order: 0, isHidden: false }]))),
    ['AI', 'DEV']
  );
});

test('a config entry with NO order row sorts last but is never dropped', () => {
  const config = [entry('NEWSKILL'), entry('AI'), entry('DEV')];
  const map = buildSkillOrderMap([
    { skillId: 'AI', order: 4 },
    { skillId: 'DEV', order: 5 },
  ]);
  assert.deepEqual(codes(sortSkillsByAdminOrder(config, map)), ['AI', 'DEV', 'NEWSKILL']);
});

test('an order row with NO config entry is ignored — the ghost RPA row', () => {
  // The ghost is real: upstream renamed RPA → AUT and left the old
  // skill_orders row behind, order 5, not hidden. Rendering from the ROWS
  // instead of from the config would put a menu item on screen for a skill
  // that no longer exists, linking to a URL that no longer resolves.
  const config = [entry('AUT'), entry('DEV')];
  const sorted = sortSkillsByAdminOrder(config, buildSkillOrderMap(FIXTURE_ROWS));
  assert.deepEqual(codes(sorted), ['DEV', 'AUT']);
  assert.equal(sorted.length, 2, 'the ghost row added no menu item');
});

// ── the tie-break, which is mandatory and must be deterministic ────

test('EQUAL order falls back to the config array index — the real DEV/RPA tie', () => {
  // Both sit at order 5 in production. Without a tie-break the result depends
  // on Array.prototype.sort's behaviour for equal keys, which is stable in V8
  // and therefore silently equals input order — a guarantee nobody wrote down
  // and nothing enforces across the Server→Client boundary.
  const config = [entry('DEV'), entry('RPA')];
  const map = buildSkillOrderMap(FIXTURE_ROWS);
  assert.deepEqual(codes(sortSkillsByAdminOrder(config, map)), ['DEV', 'RPA']);
});

test('CONTROL: reversing the config array swaps the tied pair, and only it', () => {
  // The control the brief named. It proves the tie-break reads the CONFIG
  // INDEX: reverse the array and the tied pair swaps, while every
  // differently-ordered skill stays exactly where the admin put it.
  const map = buildSkillOrderMap(FIXTURE_ROWS);

  const forward = [entry('DEV'), entry('RPA')];
  const reversed = [entry('RPA'), entry('DEV')];
  assert.deepEqual(codes(sortSkillsByAdminOrder(forward, map)), ['DEV', 'RPA']);
  assert.deepEqual(codes(sortSkillsByAdminOrder(reversed, map)), ['RPA', 'DEV']);

  // …and the untied skills do NOT move when the array is reversed.
  const a = [entry('AI'), entry('BUSINESS'), entry('DEV'), entry('RPA')];
  const b = [entry('RPA'), entry('DEV'), entry('BUSINESS'), entry('AI')];
  assert.deepEqual(codes(sortSkillsByAdminOrder(a, map)), ['BUSINESS', 'AI', 'DEV', 'RPA']);
  assert.deepEqual(codes(sortSkillsByAdminOrder(b, map)), ['BUSINESS', 'AI', 'RPA', 'DEV']);
});

test('CONTROL: the tie-break is NOT a label comparison', () => {
  // A label sort would put 'AAA' before 'ZZZ' regardless of position. This
  // asserts the opposite, so "sort by name within a tie" cannot creep in as a
  // tidy-up — renaming a skill must never reshuffle the menu.
  const map = buildSkillOrderMap([{ skillId: 'Z', order: 1 }, { skillId: 'A', order: 1 }]);
  const config = [entry('Z', { label: 'ZZZ' }), entry('A', { label: 'AAA' })];
  assert.deepEqual(codes(sortSkillsByAdminOrder(config, map)), ['Z', 'A']);
});

// ── the real config against the real measured rows ─────────────────

test('the live config + the measured rows produce the admin sequence', () => {
  // End to end on real values: the seven configured skills, the eight rows
  // read from skill_orders on 2026-08-04, and the order the admin actually
  // arranged. Design lands third even though it is last in the config array,
  // which is the entire point of the commit.
  const sorted = sortSkillsByAdminOrder(CONFIG, buildSkillOrderMap(FIXTURE_ROWS));
  assert.deepEqual(sorted.map((s) => s.label), [
    'Power Platform',
    'Business',
    'Design',
    'Data',
    'AI',
    'Development',
    'Automation',
  ]);
});
