import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * TWO FIELDS THE CAREER-PATH FORM COLLECTED AND THREW AWAY.
 *
 * ── ONE DEFECT CLASS, TWICE ─────────────────────────────────────────────────
 * The customer answers on screen, the review step shows it back, and the value
 * never reaches Mongo. Nothing throws, the action returns `{ ok: true }`, and
 * the loss is invisible until someone tries to issue the invoice.
 *
 *   BRANCH   the shape declared a bare `branch`, which `InvoiceFields` and
 *            `BranchFields` stopped writing when `branchType`/`branchCode`
 *            (and `branchFree` for non-TH) replaced it. zod is in strip mode, so
 *            the three real keys were deleted before `handleConfirm` saw them
 *            and `companyBranch: inv.branch` stored '' on every registration
 *            ever filed.
 *   COUNTRY  a Thai and an international address squash into ONE flat set of
 *            columns, and neither the flag saying which nor the country the
 *            customer typed was stored. `province` holding "California" reads
 *            as a Thai province to every reader that does not know to ask.
 *
 * ── WHY SOURCE-SCANNED ──────────────────────────────────────────────────────
 * The subject is a zod object literal and a payload object literal inside a
 * client component — no exported function, no seam. A render test can drive the
 * form and watch the review step, and would have stayed green throughout: the
 * review step read `invoice.branch` too, so screen and storage agreed with each
 * other and both were wrong.
 *
 * Read through test/sourceScan.mjs: comments stripped (the files under test now
 * discuss `branch` at length) and line endings normalised, which is what makes
 * these matchers safe on this CRLF working tree.
 *
 * The `branch`-is-legacy rule itself lives in test/fs/branchLegacyReadOnly —
 * this file is the career-path seam that its repo-wide sweep deliberately does
 * not read, asserted positively.
 */

const MODEL = readSource('src/models/CareerPathRegistration.js');
const CLIENT = readSource(
  'src/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient.jsx'
);
const ADMIN = readSource('src/app/admin/career-path-registrations/[id]/page.jsx');

/** The 1-based line numbers in `raw` whose text matches `re`. */
function linesMatching(raw, re) {
  return raw
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => re.test(line))
    .map(([n]) => n);
}

/**
 * The line `re` occurs on, asserted to be a real line number occurring EXACTLY
 * ONCE, and printed so a later failure can be located without re-deriving it.
 */
function soleLineOf(raw, re, label) {
  const hits = linesMatching(raw, re);
  assert.equal(hits.length, 1, `${label}: expected exactly one line, found ${hits.length}`);

  const [line] = hits;
  assert.notEqual(line, undefined, `${label}: no line number was computed`);
  assert.equal(typeof line, 'number', `${label}: line number is not numeric`);
  assert.ok(Number.isInteger(line) && line > 0, `${label}: ${line} is not a real line number`);

  console.log(`[careerPathInvoicePersistence] ${label} → line ${line}`);
  return line;
}

/** The `taxPayload` object literal, as scrubbed text. */
const TAX_PAYLOAD = (() => {
  const m = CLIENT.code.match(/const\s+taxPayload\s*=\s*\{([\s\S]*?)\n\s{6}\};/);
  assert.ok(m, 'taxPayload literal not found — this guard has lost its subject');
  return m[1];
})();

/** The `invoiceShape` zod object literal, as scrubbed text. */
const INVOICE_SHAPE = (() => {
  const m = CLIENT.code.match(/const\s+invoiceShape\s*=\s*z\.object\(\{([\s\S]*?)\n\}\);/);
  assert.ok(m, 'invoiceShape literal not found — this guard has lost its subject');
  return m[1];
})();

// ── 1. Branch: the form's three fields survive ──────────────────────────────

test('the zod invoice shape declares the three fields InvoiceFields writes', () => {
  assert.match(INVOICE_SHAPE, /\bbranchType:\s*z\.enum\(\[\s*'head_office',\s*'branch'\s*\]\)/);
  assert.match(INVOICE_SHAPE, /\bbranchCode:\s*z\.string\(\)/);
  assert.match(INVOICE_SHAPE, /\bbranchFree:\s*z\.string\(\)/);
});

test('and it no longer declares the retired `branch` key', () => {
  /**
   * The load-bearing half. zod strips what it does not declare, so leaving
   * `branch` here while adding the trio would not be harmless duplication — it
   * would be a second name for one value, which is the failure branchLabel.js's
   * header describes this repo as having already paid for once.
   */
  assert.equal(
    /\bbranch:\s*z\./.test(INVOICE_SHAPE),
    false,
    'the stripped key is back — nothing has written it since the pair replaced it'
  );
});

test('the default invoice seeds the trio, not the retired key', () => {
  // A default carrying `branch: ''` re-introduces the key on every form mount,
  // and RHF would then submit it — the schema is not the only way back in.
  const m = CLIENT.code.match(/const\s+EMPTY_INVOICE\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(m, 'EMPTY_INVOICE literal not found');
  const seed = m[1];

  assert.match(seed, /\bbranchType:\s*'head_office'/);
  assert.match(seed, /\bbranchCode:\s*''/);
  assert.match(seed, /\bbranchFree:\s*''/);
  assert.equal(/\bbranch:\s*''/.test(seed), false, 'the retired key is seeded again');
});

test('the submitted payload writes the trio and NOT the legacy column', () => {
  assert.match(TAX_PAYLOAD, /\bbranchType:\s*inv\.branchType/);
  assert.match(TAX_PAYLOAD, /\bbranchCode:\s*inv\.branchCode/);
  assert.match(TAX_PAYLOAD, /\bbranchFree:\s*inv\.branchFree/);

  // `companyBranch` is the legacy column. Writing it from anywhere is how the
  // derived string and the structured pair start disagreeing.
  assert.equal(
    /\bcompanyBranch:/.test(TAX_PAYLOAD),
    false,
    'companyBranch is legacy read-only — the payload must not write it'
  );
});

test('the model declares the trio, the legacy column, and the same enum as public', () => {
  soleLineOf(MODEL.raw, /\bbranchType:\s*\{/, 'branchType declaration');
  soleLineOf(MODEL.raw, /\bbranchCode:\s*\{/, 'branchCode declaration');
  soleLineOf(MODEL.raw, /\bbranchFree:\s*\{/, 'branchFree declaration');

  assert.match(
    MODEL.code,
    /branchType:\s*\{\s*type:\s*String,\s*enum:\s*\[\s*'head_office',\s*'branch'\s*\]/,
    'the enum must match RegisterPublic, or a reader translating between the two gets it wrong'
  );

  // The legacy path stays DECLARED. Dropping it is how a historical value
  // disappears on read with nothing to catch it — the same reason
  // branchLegacyReadOnly asserts it positively on both public models.
  assert.match(MODEL.code, /companyBranch:\s*\{\s*type:\s*String/, 'the legacy path must survive');
});

// ── 2. Country: the flag AND the name ───────────────────────────────────────

test('the model records which address shape the flat columns hold', () => {
  soleLineOf(MODEL.raw, /\binvoiceCountry:\s*\{/, 'invoiceCountry declaration');
  assert.match(
    MODEL.code,
    /invoiceCountry:\s*\{\s*type:\s*String,\s*enum:\s*\[\s*'TH',\s*'OTHER'\s*\]/,
    'the flag must carry the same two values the public invoice does'
  );
});

test('the model records the country the customer TYPED', () => {
  soleLineOf(MODEL.raw, /\bcountryName:\s*\{/, 'countryName declaration');
  assert.match(MODEL.code, /countryName:\s*\{\s*type:\s*String,\s*default:\s*''\s*\}/);
});

test('the payload writes both, and derives them from the same answer', () => {
  /**
   * `isThai` is the one discriminator already governing all five flat columns.
   * A second source for the flag — reading `inv.country` here while the columns
   * are filled from `isThai` — is how the flag comes to describe a mapping that
   * did not happen.
   */
  assert.match(TAX_PAYLOAD, /\binvoiceCountry:\s*isThai\s*\?\s*'TH'\s*:\s*'OTHER'/);
  assert.match(TAX_PAYLOAD, /\bcountryName:\s*isThai\s*\?\s*''\s*:\s*\(intl\.country\s*\?\?\s*''\)/);
});

// ── 3. Both fields have readers, and neither reader hand-rolls a label ──────

test('the admin detail asks branchLabel.js for the สาขา row', () => {
  /**
   * A stored field nobody reads is an orphan column. This row EXISTED and read
   * `reg.companyBranch`, which is why it never appeared: the value was always ''.
   */
  assert.match(ADMIN.withImports, /from\s*'@\/lib\/registration\/branchLabel'/);
  assert.match(ADMIN.code, /formatInvoiceBranchLabel\(\{[\s\S]*?branchType:\s*reg\.branchType/);
  assert.equal(
    /reg\.companyBranch\s*&&/.test(ADMIN.code),
    false,
    'the row is reading the always-empty legacy column again'
  );
});

test('the admin detail prints the country name in the address', () => {
  assert.match(ADMIN.code, /reg\.countryName/, 'countryName has no reader');
});

test('the review step asks the same module — screen and storage cannot disagree', () => {
  /**
   * The review step read `invoice.branch` too. That is why the defect survived:
   * the screen and the document were consistent with each other, and both were
   * wrong. Pointing both at one label module is what removes the second opinion.
   */
  assert.match(CLIENT.withImports, /from\s*'@\/lib\/registration\/branchLabel'/);
  assert.match(CLIENT.code, /formatInvoiceBranchLabel\(invoice\)/);
  assert.equal(
    /invoice\.branch\s*&&/.test(CLIENT.code),
    false,
    'the review step is reading the retired key again'
  );
});

test('neither reader writes a สาขา label of its own', () => {
  // The wording is Revenue-Department text with one definition. A local copy is
  // how สำนักงานใหญ่ ends up on a Singapore invoice.
  for (const src of [ADMIN, CLIENT]) {
    assert.equal(
      /'สำนักงานใหญ่'|'สาขาที่/.test(src.code),
      false,
      `${src.rel} spells the branch label itself instead of asking branchLabel.js`
    );
  }
});

// ── 4. Controls ─────────────────────────────────────────────────────────────

test('CONTROL: the probes DO go red on the shapes as they stood BEFORE this change', () => {
  /**
   * Without this every "no longer declares" assertion is vacuous. Fired at the
   * exact text that has to stay caught.
   */
  const oldShape = "  companyName: z.string().default(''),\n  branch:      z.string().default(''),";
  assert.ok(/\bbranch:\s*z\./.test(oldShape), 'the old zod shape must read as an offender');

  const oldSeed = "  companyName: '',\n  branch: '',";
  assert.ok(/\bbranch:\s*''/.test(oldSeed), 'the old seed must read as an offender');

  const oldPayload = "        companyBranch: inv.branch       ?? '',";
  assert.ok(/\bcompanyBranch:/.test(oldPayload), 'the old payload must read as an offender');

  const oldRow = '{reg.companyBranch && <Row label="สาขา" value={reg.companyBranch} />}';
  assert.ok(/reg\.companyBranch\s*&&/.test(oldRow), 'the old admin row must read as an offender');

  // And the country half: a payload with neither key.
  const oldTax = "        taxType: 'personal',\n        taxAddress: '',";
  assert.equal(/\binvoiceCountry:/.test(oldTax), false);
  assert.equal(/\bcountryName:/.test(oldTax), false);
});

test('CONTROL: soleLineOf refuses zero matches and refuses two', () => {
  assert.throws(
    () => soleLineOf('a\nb', /zzz-not-here/, 'absent'),
    /expected exactly one line, found 0/
  );
  assert.throws(
    () => soleLineOf('hit\nx\nhit', /hit/, 'doubled'),
    /expected exactly one line, found 2/
  );
});

test('CONTROL: all three readers are reading the real files', () => {
  // Every "does not match" assertion above passes on an empty string, and a
  // failed read is silent.
  assert.ok(MODEL.raw.length > 2000, 'the model was actually read');
  assert.ok(CLIENT.code.length > 20000, 'the client was actually read');
  assert.ok(ADMIN.code.length > 2000, 'the admin page was actually read');
  assert.ok(TAX_PAYLOAD.length > 300, 'the taxPayload literal was actually captured');
  assert.ok(INVOICE_SHAPE.length > 200, 'the invoiceShape literal was actually captured');
  assert.match(MODEL.code, /collection:\s*'career_path_registrations'/, 'the right model');
});
