import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { buildStatusLabels } from '@/lib/registrations/statuses';

/**
 * ONE PUBLIC LABEL VOCABULARY — and one deliberate divergence.
 *
 * ── THE RELABEL ─────────────────────────────────────────────────────────────
 * For PUBLIC registrations `confirmed` now reads 'ส่งใบเสนอราคาแล้ว' rather than
 * 'ยืนยันแล้ว'. The STORED VALUE IS UNCHANGED — this is a label change with no
 * migration, and a "fix" that renamed the enum would be a silent data change.
 *
 * It had FOUR copies across the admin (the list screen's options, its label
 * map, its stat-card literal, the detail screen) plus the dashboard's two, so
 * changing it meant finding six places. That is the drift this pins.
 *
 * ── MASTERCLASS IS DELIBERATELY LEFT ALONE ──────────────────────────────────
 * `masterclass_registrations` is a different collection with its own flow and
 * is out of scope for the whole rework. Its `confirmed` still reads 'ยืนยันแล้ว'
 * and SHOULD. The two vocabularies now diverge on purpose, and the tests at the
 * bottom are what stop a well-meaning sweep from "finishing" the relabel —
 * which would change what the masterclass team's screen says without anyone
 * having decided that.
 */

const LIST      = readSource('src/app/admin/registrations/_components/RegistrationsClient.jsx');
const DETAIL    = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');
const DASH_ACT  = readSource('src/lib/actions/dashboard.js');
const DASH_CLI  = readSource('src/app/admin/_components/DashboardClient.jsx');

const MC_LIST   = readSource('src/app/admin/masterclass/registrations/_components/MasterclassRegistrationsClient.jsx');
const MC_DETAIL = readSource('src/app/admin/masterclass/registrations/[id]/_components/MasterclassRegDetailClient.jsx');

const PUBLIC_SITES = [LIST, DETAIL, DASH_ACT, DASH_CLI];

// ── 1. The module says the new thing, and still stores the old value ────────

test('the module labels `confirmed` as the quotation step', () => {
  assert.equal(buildStatusLabels().confirmed, 'ส่งใบเสนอราคาแล้ว');
});

// ── 2. No public site spells a public status label by hand ──────────────────

test('no public registration site contains the retired label', () => {
  for (const f of PUBLIC_SITES) {
    assert.ok(!f.code.includes('ยืนยันแล้ว'), `${f.rel} still says ยืนยันแล้ว`);
  }
});

test('no public site hand-writes the new label either — it is derived', () => {
  // Stronger than "the string was replaced". A site that pasted the NEW label
  // in has simply moved the drift forward one round: the next relabel finds
  // four copies again. The only place the text may appear is the module.
  //
  // ── MATCHED AS A COMPLETE STRING LITERAL, QUOTES INCLUDED ────────────────
  // Thai compounds without a separator, so a bare `includes` here is wrong and
  // was MEASURED to be wrong: RegistrationDetailClient's ACTION_LABEL says
  // 'บันทึกส่งใบเสนอราคาแล้ว' — the admin's VERB for making the transition —
  // which CONTAINS the status label and is a legitimately different string. A
  // substring scan reported that file as hand-writing the label and there was
  // no way to comply short of renaming the button. Anchoring on the quotes
  // separates "this literal IS the label" from "this literal mentions it".
  const asLiteral = /'ส่งใบเสนอราคาแล้ว'/;
  for (const f of PUBLIC_SITES) {
    assert.ok(
      !asLiteral.test(f.code),
      `${f.rel} hand-writes the label instead of deriving it from the status module`
    );
  }
});

test('CONTROL: the quoted match separates the label from the action verb', () => {
  // Proves the anchoring above does real work. The verb must NOT match and the
  // label must, on the same input — otherwise the test above is either vacuous
  // or unsatisfiable.
  const asLiteral = /'ส่งใบเสนอราคาแล้ว'/;
  assert.ok(!asLiteral.test("{ confirmed: 'บันทึกส่งใบเสนอราคาแล้ว' }"), 'the verb must not match');
  assert.ok(asLiteral.test("{ confirmed: 'ส่งใบเสนอราคาแล้ว' }"), 'the label itself must match');
  // And the file that actually holds the verb is one of the sites under test,
  // so this control is describing the real situation, not a hypothetical.
  assert.match(DETAIL.code, /'บันทึกส่งใบเสนอราคาแล้ว'/);
});

test('CONTROL: the label text IS findable this way when it is hand-written', () => {
  // Proves the two assertions above are not passing because `code` cannot see
  // Thai string literals at all.
  //
  // It used to read lib/registrations/inhouseStatuses.js, which wrote this exact
  // string out and was ABSORBED in round 2. The control now points at the
  // surviving module, which is the one place the label is legitimately
  // hand-written — twice, once per source subset — and the same scan finds it.
  const MODULE = readSource('src/lib/registrations/statuses.js');
  assert.ok(
    MODULE.code.includes('ส่งใบเสนอราคาแล้ว'),
    'the control is inert — a hand-written label is invisible to this scan'
  );
});

/**
 * IMPORT-SHAPED RULE — reads `withImports`, with the control below.
 */
test('every public site imports the vocabulary from the module', () => {
  for (const f of PUBLIC_SITES) {
    assert.match(
      f.withImports,
      /from\s*'@\/lib\/registrations\/statuses'/,
      `${f.rel} does not import the shared public status module`
    );
  }
});

test('CONTROL: the CODE view really does strip those imports', () => {
  // Without this, the rule above could be written against `code`, see no import
  // statements at all, and pass vacuously on any file in the repo.
  for (const f of PUBLIC_SITES) {
    assert.ok(
      !f.code.includes("from '@/lib/registrations/statuses'"),
      `the control is inert on ${f.rel} — code did not strip the import`
    );
  }
});

// ── 3. The list screen derives all three of its lists ──────────────────────

/**
 * THE THREE ALIASES ARE GONE WITH THE SECOND MODULE.
 *
 * Round 1 imported the public builders as `buildPublicStatCards` and friends,
 * because the same three names arrived from a separate in-house module and had
 * to be told apart. There is one module now, so the aliases are noise — and
 * this test used to assert their presence, which would have blocked the fold.
 *
 * What it guards instead is unchanged in substance: the screen's three lists
 * are BUILT, not written out. The cards and chips are covered in
 * fs/registrationsFilterWiring (they take the per-source subset); the LABEL map
 * is here because it is the public-only one, read by the public สถานะ cell.
 */
test('the list screen derives its public status labels', () => {
  assert.match(LIST.code, /const STATUS_LABEL = buildStatusLabels\(\)/,
    'the public label map is not derived from the module');
});

test('the list screen has no hand-written public status list left', () => {
  // The three literals that used to be here, matched by their shape rather than
  // by a bare status name — `pending`/`cancelled` legitimately appear elsewhere
  // in this file (the URL default checks), and forbidding the names outright
  // would forbid those too.
  assert.ok(
    !/\{\s*value:\s*'pending',\s*label:/.test(LIST.code),
    'the STATUS_OPTIONS literal is back'
  );
  assert.ok(
    !/\{\s*key:\s*'pending',\s*label:/.test(LIST.code),
    'the public stat-card literal is back'
  );
  assert.ok(
    !/pending:\s*'รอดำเนินการ'/.test(LIST.code),
    'the STATUS_LABEL literal is back'
  );
});

/**
 * THE IN-HOUSE LISTS COME FROM THE SAME MODULE NOW — AND STILL FROM A SUBSET.
 *
 * Round 1 left this asserting that the screen imported a SEPARATE
 * inhouseStatuses module and picked its cards with a `source === 'inhouse' ?`
 * ternary, on the grounds that folding the two early would let the screen offer
 * a status the selected collection cannot hold.
 *
 * Round 2 did the fold, so the old assertion is retired — but the RISK it named
 * is not, and this is what replaces it. The screen must still resolve ONE
 * per-source list and build both consumers from it. What would reintroduce the
 * danger is not the shared module; it is calling the builders with no argument,
 * which silently defaults to the PUBLIC list and would put a ชำระแล้ว card over
 * in-house records.
 */
test('the list screen derives ONE per-source vocabulary and builds both lists from it', () => {
  assert.match(LIST.withImports, /statusesForSource[\s\S]*?from '@\/lib\/registrations\/statuses'/);
  assert.match(LIST.code, /statusesForSource\(source\)/,
    'the screen must resolve the subset from `source`, not pick lists with a ternary');
});

test('neither strip builder is called argument-less — that would default to PUBLIC', () => {
  // The specific way the fold could go wrong. `buildStatCards()` with no
  // argument returns the public list, and on an in-house render every
  // assertion about "one card per status" would still hold — over the wrong
  // vocabulary, including a `paid` card in-house can never fill.
  assert.ok(!/buildStatCards\(\s*\)/.test(LIST.code),  'buildStatCards() defaults to the public list');
  assert.ok(!/buildStatusChips\(\s*\)/.test(LIST.code), 'buildStatusChips() defaults to the public list');
});

test('CONTROL: the argument-less form is what the default actually does', () => {
  // Proves the rule above is about a real hazard rather than a style
  // preference: the module's builders really do fall back to PUBLIC_STATUSES.
  const MODULE = readSource('src/lib/registrations/statuses.js');
  assert.match(MODULE.code, /export function buildStatCards\(statuses = PUBLIC_STATUSES\)/);
  assert.match(MODULE.code, /export function buildStatusChips\(statuses = PUBLIC_STATUSES\)/);
});

// ── 4. The dashboard's two sites ───────────────────────────────────────────

test('the dashboard donut derives its labels and keeps its own colours', () => {
  assert.match(DASH_ACT.code, /label:\s*PUBLIC_STATUS_LABEL\.confirmed/);
  // The colours are this chart's business and belong to no other consumer, so
  // they stay here. If they ever move into the module, this is the line that
  // says the decision was reversed deliberately.
  assert.match(DASH_ACT.code, /color:\s*'#3b82f6'/);
});

test('the four dashboard stat cards derive their labels', () => {
  for (const value of ['pending', 'confirmed', 'paid', 'cancelled']) {
    assert.ok(
      DASH_CLI.code.includes(`PUBLIC_STATUS_LABEL.${value}`),
      `the ${value} card still hand-writes its label`
    );
  }
});

// ── 5. MASTERCLASS IS UNTOUCHED, AND THAT IS THE POINT ─────────────────────

test('masterclass still labels `confirmed` as ยืนยันแล้ว', () => {
  // NOT a bug. Different collection, different flow, out of scope for all four
  // rounds. If this goes red, someone swept the relabel across a screen whose
  // owners never agreed to it.
  assert.ok(MC_LIST.code.includes('ยืนยันแล้ว'),   'the masterclass list lost its own label');
  assert.ok(MC_DETAIL.code.includes('ยืนยันแล้ว'), 'the masterclass detail lost its own label');
});

test('masterclass does not import the public status module', () => {
  for (const f of [MC_LIST, MC_DETAIL]) {
    assert.ok(
      !/from\s*'@\/lib\/registrations\/statuses'/.test(f.withImports),
      `${f.rel} was wired to the public vocabulary — the two are deliberately separate`
    );
  }
});

test('masterclass says nothing about quotations', () => {
  for (const f of [MC_LIST, MC_DETAIL]) {
    assert.ok(!f.code.includes('ส่งใบเสนอราคาแล้ว'), `${f.rel} picked up the public relabel`);
  }
});
