import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { buildStatusLabels } from '@/lib/registrations/publicStatuses';

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
      `${f.rel} hand-writes the label instead of deriving it from publicStatuses`
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
  // Thai string literals at all. The in-house module writes its own labels out,
  // including this exact string, and the same scan finds it there.
  const INHOUSE = readSource('src/lib/registrations/inhouseStatuses.js');
  assert.ok(
    INHOUSE.code.includes('ส่งใบเสนอราคาแล้ว'),
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
      /from\s*'@\/lib\/registrations\/publicStatuses'/,
      `${f.rel} does not import the shared public status module`
    );
  }
});

test('CONTROL: the CODE view really does strip those imports', () => {
  // Without this, the rule above could be written against `code`, see no import
  // statements at all, and pass vacuously on any file in the repo.
  for (const f of PUBLIC_SITES) {
    assert.ok(
      !f.code.includes("from '@/lib/registrations/publicStatuses'"),
      `the control is inert on ${f.rel} — code did not strip the import`
    );
  }
});

// ── 3. The list screen derives all three of its lists ──────────────────────

test('the list screen derives its public cards, chips and labels', () => {
  assert.match(LIST.code, /buildPublicStatCards\(\)/);
  assert.match(LIST.code, /buildPublicStatusChips\(\)/);
  assert.match(LIST.code, /buildPublicStatusLabels\(\)/);
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

test('the in-house lists on the same screen still come from THEIR module', () => {
  // Round 2 owns in-house. The two vocabularies are aliased apart on purpose;
  // if this reddens, the merge happened early and the screen can now offer a
  // status the selected collection cannot hold.
  assert.match(LIST.withImports, /from '@\/lib\/registrations\/inhouseStatuses'/);
  assert.match(LIST.code, /source === 'inhouse'\s*\?\s*buildStatCards\(\)/);
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
      !/from\s*'@\/lib\/registrations\/publicStatuses'/.test(f.withImports),
      `${f.rel} was wired to the public vocabulary — the two are deliberately separate`
    );
  }
});

test('masterclass says nothing about quotations', () => {
  for (const f of [MC_LIST, MC_DETAIL]) {
    assert.ok(!f.code.includes('ส่งใบเสนอราคาแล้ว'), `${f.rel} picked up the public relabel`);
  }
});
