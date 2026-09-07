import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';
import { readSource } from '../sourceScan.mjs';

/**
 * src/scripts/migrate-rbac.mjs's HAND-MAINTAINED MIRROR of the page registry.
 *
 * ══ WHAT `assertRegistryCoverage()` ACTUALLY CHECKS, AND WHAT IT DOES NOT ════
 *
 * That function is named as though it guards the registry. It does not. It
 * compares two constants that both live INSIDE migrate-rbac.mjs — its local
 * `ALL_PAGE_KEYS` copy and its local `PAGE_SET` map — and never reads
 * src/lib/rbac/pages.js at all. So it is a self-consistency check: it catches
 * "you added a key to one local list and not the other", and is structurally
 * incapable of catching "the registry grew and this file did not".
 *
 * It also only runs when the script runs, which needs MONGODB_URI and a live
 * Atlas connection. Nothing in `npm test` executes it. A drift could therefore
 * sit here indefinitely and be discovered by a migration that quietly seeded
 * roles with fewer pages than the registry has.
 *
 * MEASURED, round E2, before any edit: the mirror was ALREADY THREE KEYS BEHIND
 * — `media`, `redirects` and `audit_log` are registered in ADMIN_PAGES and
 * absent here — and `assertRegistryCoverage()` was green throughout, exactly as
 * the paragraph above predicts. The seed roles this script builds therefore
 * grant three fewer pages than the registry knows about.
 *
 * ── WHY THIS FILE DOES NOT SIMPLY FIX THAT ──────────────────────────────────
 * Adding the three would change WHAT MIGRATE-RBAC GRANTS to every seeded role,
 * which is a permissions decision belonging to whoever owns those roles, not a
 * side effect of a dashboard round. So the three are allow-listed BY NAME with
 * the reason, in the shape this repo already uses for NO_NAV_ITEM: the drift
 * that exists is pinned so it cannot GROW, and a fourth key going missing fails
 * here instead of joining a number nobody reads.
 *
 * ── READING THE SCRIPT AS TEXT ──────────────────────────────────────────────
 * migrate-rbac.mjs is a CLI entry point: importing it would run its
 * MONGODB_URI check and `process.exit(1)`. It is scanned as source, and — the
 * weak point of any source guard — THE EXTRACTION IS ASSERTED FIRST, with a
 * floor and a known member, before a single conclusion is drawn from it.
 */

const SCRIPT_REL = 'src/scripts/migrate-rbac.mjs';
const SCRIPT = readSource(SCRIPT_REL);

/**
 * Registry keys the mirror is allowed to be missing, each with its reason.
 *
 * NAMED, never counted. This is a record of pre-existing drift, not a licence:
 * anything not on this list must be in the mirror.
 */
const MIRROR_MAY_OMIT = new Map([
  ['media', 'pre-existing drift, measured round E2 — registered in ADMIN_PAGES '
    + 'long after this mirror was written. Adding it would change which pages '
    + 'the seeded roles are granted, which is a permissions decision and not '
    + 'the dashboard round\'s to make'],
  ['redirects', 'pre-existing drift, measured round E2 — same reason as `media`'],
  ['audit_log', 'pre-existing drift, measured round E2 — same reason as `media`'],
]);

/** The braced literal that follows `const NAME = ` — brackets walked, not regexed. */
function extractBlock(code, decl, open, close) {
  const start = code.indexOf(decl);
  assert.notEqual(start, -1, `${decl} not found in ${SCRIPT_REL}`);
  const from = code.indexOf(open, start);
  let depth = 0;
  for (let i = from; i < code.length; i += 1) {
    if (code[i] === open) depth += 1;
    else if (code[i] === close) {
      depth -= 1;
      if (depth === 0) return code.slice(from, i + 1);
    }
  }
  assert.fail(`${decl} literal is unbalanced in ${SCRIPT_REL}`);
}

/**
 * Quoted strings out of the local ALL_PAGE_KEYS array.
 *
 * Read from `.code`, which has comments stripped, so a key mentioned only in
 * prose cannot satisfy this — the mirror's own header now names all three
 * omitted keys in a comment, and reading `.raw` would let that text pass for
 * membership.
 */
const MIRROR_KEYS = [
  ...extractBlock(SCRIPT.code, 'const ALL_PAGE_KEYS = [', '[', ']')
    .matchAll(/'([a-z_]+)'/g),
].map((m) => m[1]);

/** `foo: 'ALL',` property names out of the local PAGE_SET object. */
const PAGE_SET_KEYS = [
  ...extractBlock(SCRIPT.code, 'const PAGE_SET = {', '{', '}')
    .matchAll(/^\s*([a-z_]+):/gm),
].map((m) => m[1]);

const sorted = (a) => [...a].sort();

// ── the extraction is asserted BEFORE it is trusted ─────────────────────────
test('rbac mirror: both literals were extracted and are populated', () => {
  assert.ok(
    MIRROR_KEYS.length >= 30,
    `extracted only ${MIRROR_KEYS.length} keys from the ALL_PAGE_KEYS mirror — `
    + 'the matcher is broken and every assertion below would pass vacuously',
  );
  assert.ok(
    PAGE_SET_KEYS.length >= 30,
    `extracted only ${PAGE_SET_KEYS.length} PAGE_SET keys — matcher broken`,
  );
  assert.ok(MIRROR_KEYS.includes('dashboard'), 'a known member is missing — bad scan');
  assert.ok(PAGE_SET_KEYS.includes('dashboard'), 'a known member is missing — bad scan');
  assert.deepEqual(
    sorted(MIRROR_KEYS.filter((k, i, a) => a.indexOf(k) !== i)), [],
    'the mirror lists a key twice',
  );
});

// ── the real assertions ─────────────────────────────────────────────────────
test('rbac mirror: every registry key is mirrored, minus the named omissions', () => {
  const missing = ALL_PAGE_KEYS
    .filter((k) => !MIRROR_KEYS.includes(k))
    .filter((k) => !MIRROR_MAY_OMIT.has(k));
  assert.deepEqual(
    missing, [],
    `${SCRIPT_REL} keeps its own copy of ALL_PAGE_KEYS and nothing imports the `
    + 'real one (the repo ships no "type": "module", so a .mjs CLI script cannot '
    + 'import those CommonJS ESM exports). Add the key there too, or add it to '
    + 'MIRROR_MAY_OMIT in this file WITH the reason it is deliberately unseeded',
  );
});

test('rbac mirror: the mirror invents no key the registry does not have', () => {
  const registry = new Set(ALL_PAGE_KEYS);
  assert.deepEqual(
    MIRROR_KEYS.filter((k) => !registry.has(k)), [],
    'a key here that ADMIN_PAGES does not have would be seeded onto roles and '
    + 'then silently pruned by Role.pruneUnknownPages on the next save',
  );
});

test('rbac mirror: PAGE_SET covers the mirror exactly — assertRegistryCoverage, in CI', () => {
  // The same comparison assertRegistryCoverage() makes at runtime, run here
  // where it needs no MONGODB_URI and no Atlas. Both directions, because the
  // script throws on both.
  assert.deepEqual(
    sorted(MIRROR_KEYS.filter((k) => !PAGE_SET_KEYS.includes(k))), [],
    'missing from PAGE_SET — migrate-rbac would throw on its own guard',
  );
  assert.deepEqual(
    sorted(PAGE_SET_KEYS.filter((k) => !MIRROR_KEYS.includes(k))), [],
    'unknown in PAGE_SET — migrate-rbac would throw on its own guard',
  );
});

test('rbac mirror: every MIRROR_MAY_OMIT entry is real, explained, and still missing', () => {
  const registry = new Set(ALL_PAGE_KEYS);
  for (const [key, reason] of MIRROR_MAY_OMIT) {
    assert.ok(registry.has(key), `MIRROR_MAY_OMIT names '${key}', not a registered page — stale`);
    assert.ok(
      typeof reason === 'string' && reason.trim().length >= 20,
      `MIRROR_MAY_OMIT['${key}'] needs a written reason`,
    );
    assert.equal(
      MIRROR_KEYS.includes(key), false,
      `'${key}' IS in the mirror now — delete its MIRROR_MAY_OMIT entry. A stale `
      + 'exception excuses a key that can no longer go missing, which weakens the '
      + 'assertion above for every key that still can',
    );
  }
});

// ── the two keys this round added, pinned by name in both halves ────────────
test('rbac mirror: both dashboard scopes are mirrored AND in PAGE_SET', () => {
  for (const key of ['dashboard_registrations', 'dashboard_system']) {
    assert.ok(ALL_PAGE_KEYS.includes(key), `${key} left the registry`);
    assert.ok(
      MIRROR_KEYS.includes(key),
      `${key} is registered but absent from the ${SCRIPT_REL} mirror — the seed `
      + 'roles would grant `dashboard` and neither half of it, and every seeded '
      + 'role would open the dashboard to the no-section state',
    );
    assert.ok(PAGE_SET_KEYS.includes(key), `${key} is missing from PAGE_SET`);
  }
});

test('rbac mirror: the scopes ride with `dashboard`, so no seeded role changes', () => {
  // The whole point of the backfill rule: a role that could see the dashboard
  // before must see both halves after. In this script that means the same set
  // name, not merely presence — 'IT' would silently narrow four seeded roles.
  const setOf = (key) => {
    const m = SCRIPT.code.match(new RegExp(`^\\s*${key}:\\s*'([A-Z]+)'`, 'm'));
    assert.ok(m, `no PAGE_SET entry found for ${key}`);
    return m[1];
  };
  const base = setOf('dashboard');
  assert.equal(setOf('dashboard_registrations'), base);
  assert.equal(setOf('dashboard_system'), base);
});

// ── CONTROLS — synthetic data, so they stay green while the real ones redden ─
//
// Same reasoning as the controls in test/fs/rbacNavParity: deriving a control's
// fixture from the real arrays makes it fail whenever its subject fails, which
// measures the subject rather than the control.

const FIXTURE_REGISTRY = ['alpha', 'beta', 'gamma'];

function mirrorGaps(registry, mirror, omissions = new Map()) {
  return registry.filter((k) => !mirror.includes(k)).filter((k) => !omissions.has(k));
}

test('CONTROL: the fixture pair is itself clean (baseline)', () => {
  assert.deepEqual(mirrorGaps(FIXTURE_REGISTRY, ['alpha', 'beta', 'gamma']), []);
});

test('CONTROL: a key missing from the mirror is detected', () => {
  assert.deepEqual(mirrorGaps(FIXTURE_REGISTRY, ['alpha', 'beta']), ['gamma']);
});

test('CONTROL: an omission silences the gap — and only for its own key', () => {
  assert.deepEqual(
    mirrorGaps(FIXTURE_REGISTRY, ['alpha', 'beta'], new Map([['gamma', 'why']])), [],
  );
  assert.deepEqual(
    mirrorGaps(FIXTURE_REGISTRY, ['alpha', 'beta'], new Map([['alpha', 'wrong one']])),
    ['gamma'],
  );
});

test('CONTROL: the extractor really reads this file, and can come back empty', () => {
  // Without this, `extractBlock` could be returning a constant and every
  // assertion above would be about nothing.
  assert.ok(MIRROR_KEYS.length > PAGE_SET_KEYS.length - 1);
  assert.deepEqual(
    [...'const NOTHING = [];'.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), [],
    'the key matcher must be able to find nothing',
  );
  assert.throws(
    () => extractBlock(SCRIPT.code, 'const DEFINITELY_NOT_DECLARED = [', '[', ']'),
    'a missing declaration must fail rather than scan the whole file',
  );
});
