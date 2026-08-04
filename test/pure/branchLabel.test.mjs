import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBranchLabel,
  formatInvoiceBranchLabel,
} from '@/lib/registration/branchLabel';

/**
 * The branch label is DERIVED at every read site and stored nowhere.
 *
 * The alternative — writing a `branch` string alongside `branchType` /
 * `branchCode` — is the shape this repo already paid for as
 * `quotation_address` / `billing_address`: one value under two names, and the
 * wrong one ends up in a template with nothing to say which was meant. So
 * `branch` survives on both Mongoose schemas as a legacy READ path for
 * documents written before the split, is written by nothing, and this module is
 * the single place any of the three shapes becomes a label.
 */

// ── formatBranchLabel: the three-argument form ──────────────────────────────

test('head office', () => {
  assert.equal(formatBranchLabel({ branchType: 'head_office', branchCode: '' }), 'สำนักงานใหญ่');
});

test('a sub-branch names its 5-digit code', () => {
  // THE WORDING, pinned as a decision: `สาขาที่ ` + the code verbatim, one
  // space, no re-padding. That is what a Thai tax invoice says, and the code is
  // already pinned at five digits by the schema — reformatting it here would
  // hide anything that arrived in another shape.
  assert.equal(formatBranchLabel({ branchType: 'branch', branchCode: '00001' }), 'สาขาที่ 00001');
  assert.equal(formatBranchLabel({ branchType: 'branch', branchCode: '00123' }), 'สาขาที่ 00123');
});

test('head office IGNORES a leftover code rather than printing it', () => {
  // The schema blanks this pair, but a hand-edited document can still hold it
  // and the label must not announce a branch the type says does not exist.
  assert.equal(formatBranchLabel({ branchType: 'head_office', branchCode: '00042' }), 'สำนักงานใหญ่');
});

test('a LEGACY document falls back to its free text, verbatim', () => {
  // No branchType at all — a document written before the split. Verbatim
  // because we cannot know which structured shape it meant, and normalising it
  // would invent data.
  assert.equal(formatBranchLabel({ legacyBranch: 'สาขาบางนา' }), 'สาขาบางนา');
  assert.equal(formatBranchLabel({ legacyBranch: 'สำนักงานใหญ่' }), 'สำนักงานใหญ่');
  assert.equal(formatBranchLabel({ legacyBranch: '  สาขา 5  ' }), 'สาขา 5', 'trimmed, not reworded');
});

test('the structured pair WINS over a legacy string when a document has both', () => {
  assert.equal(
    formatBranchLabel({ branchType: 'branch', branchCode: '00007', legacyBranch: 'สำนักงานใหญ่' }),
    'สาขาที่ 00007'
  );
});

test('nothing at all is the EMPTY STRING — never null, never "undefined"', () => {
  // Read sites gate their row on the return value being truthy, so a nullish or
  // stringified-undefined return would print a สาขา row with junk in it.
  assert.equal(formatBranchLabel({}), '');
  assert.equal(formatBranchLabel(), '');
  assert.equal(formatBranchLabel({ branchType: undefined, branchCode: undefined, legacyBranch: undefined }), '');
  assert.equal(formatBranchLabel({ legacyBranch: '   ' }), '');
});

test('a branch with NO code is still named a branch', () => {
  // Unrepresentable through either form — the schema requires five digits — so
  // this is hand-edited or partially-migrated data. Saying "a branch, number
  // unknown" is true; returning '' would silently drop the row.
  assert.equal(formatBranchLabel({ branchType: 'branch', branchCode: '' }), 'สาขาย่อย');
  assert.equal(formatBranchLabel({ branchType: 'branch' }), 'สาขาย่อย');
});

// ── CONTROL ─────────────────────────────────────────────────────────────────

test('CONTROL: a mutant that ignores branchCode reddens the sub-branch case ONLY', () => {
  /**
   * Without this, every assertion above could be satisfied by an implementation
   * that never reads `branchCode` at all — head office, the legacy fallback and
   * the empty case would all still pass. This runs that exact mutant and
   * asserts it disagrees on precisely one of the cases the suite covers.
   */
  const mutant = ({ branchType, branchCode, legacyBranch } = {}) => {
    if (branchType === 'head_office') return 'สำนักงานใหญ่';
    if (branchType === 'branch') return 'สาขาย่อย'; // <-- ignores branchCode
    return String(legacyBranch ?? '').trim();
  };

  const CASES = [
    { branchType: 'head_office', branchCode: '' },
    { branchType: 'head_office', branchCode: '00042' },
    { branchType: 'branch', branchCode: '00001' },
    { branchType: 'branch', branchCode: '' },
    { legacyBranch: 'สาขาบางนา' },
    {},
  ];

  const disagreements = CASES.filter((c) => mutant(c) !== formatBranchLabel(c));
  assert.equal(disagreements.length, 1, 'exactly one case distinguishes the mutant');
  assert.deepEqual(disagreements[0], { branchType: 'branch', branchCode: '00001' });
});

// ── formatInvoiceBranchLabel: the public-invoice wrapper ────────────────────

test('a Thai invoice reads the structured pair', () => {
  assert.equal(
    formatInvoiceBranchLabel({ country: 'TH', branchType: 'branch', branchCode: '00002' }),
    'สาขาที่ 00002'
  );
  assert.equal(
    formatInvoiceBranchLabel({ country: 'TH', branchType: 'head_office', branchCode: '' }),
    'สำนักงานใหญ่'
  );
});

test('a FOREIGN invoice reads its free text and never says สำนักงานใหญ่', () => {
  // THE BUG THIS PREVENTS: `branchType` carries a default, so reading it
  // unconditionally would stamp a Thai Revenue-Department term onto a Singapore
  // invoice purely because nobody cleared a field.
  const foreign = { country: 'OTHER', branchType: 'head_office', branchCode: '', branchFree: 'Asia Pacific HQ' };
  assert.equal(formatInvoiceBranchLabel(foreign), 'Asia Pacific HQ');
  assert.equal(formatInvoiceBranchLabel({ country: 'OTHER', branchType: 'head_office' }), '');
});

test('a foreign LEGACY invoice still reads its old free-text branch', () => {
  assert.equal(
    formatInvoiceBranchLabel({ country: 'OTHER', branch: 'Regional office' }),
    'Regional office'
  );
});

test('an absent country takes the Thai path, matching the schema default', () => {
  assert.equal(formatInvoiceBranchLabel({ branchType: 'head_office' }), 'สำนักงานใหญ่');
});

test('a falsy invoice is the empty string', () => {
  assert.equal(formatInvoiceBranchLabel(null), '');
  assert.equal(formatInvoiceBranchLabel(undefined), '');
});

test('CONTROL: the country split is real — the SAME object reads differently', () => {
  // If the wrapper stopped branching on country, these two would collapse to
  // one answer and the foreign assertions above would be vacuous.
  const shared = { branchType: 'branch', branchCode: '00009', branchFree: 'Asia Pacific HQ' };
  assert.notEqual(
    formatInvoiceBranchLabel({ ...shared, country: 'TH' }),
    formatInvoiceBranchLabel({ ...shared, country: 'OTHER' })
  );
});
