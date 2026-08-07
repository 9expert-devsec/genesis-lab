/**
 * ONE reader for "which branch is this invoice for".
 *
 * ── WHY A FORMATTER AND NOT A STORED STRING ─────────────────────────────────
 * The old shape was a single free-text `branch` field holding whatever the
 * customer typed — 'สำนักงานใหญ่', 'สาขา 5', '00005', 'HQ'. The new shape is
 * structured: `branchType` ('head_office' | 'branch') plus a 5-digit
 * `branchCode`. The obvious migration — keep writing a derived `branch` string
 * alongside the structured pair — is the mistake this repo has already paid for
 * once as `quotation_address` / `billing_address`: one value under two names,
 * and the wrong one ends up in the template. So `branch` is written by NOTHING
 * any more; it survives on both Mongoose schemas as a legacy read-only path so
 * documents written before this change still say what they said, and this
 * module is the single place that turns any of it into a label.
 *
 * ── THE SUB-BRANCH WORDING ──────────────────────────────────────────────────
 * `สาขาที่ 00001`, with ONE space and the code verbatim. That is the wording
 * the Revenue Department uses on a Thai tax invoice, and the code is NOT
 * re-padded or re-formatted here: the schema already pins it at exactly five
 * digits, so anything else reaching this function is legacy or hand-edited data
 * and rewriting it would hide that.
 *
 * PURE: no env, no db, no network, no `new Date()`.
 *
 * @param {object} p
 * @param {'head_office'|'branch'|undefined} p.branchType
 * @param {string|undefined} p.branchCode   5 digits, only meaningful for 'branch'
 * @param {string|undefined} p.legacyBranch the free-text `branch` path on old docs
 * @returns {string} '' when there is nothing to say — never null, never 'undefined'
 */
export function formatBranchLabel({ branchType, branchCode, legacyBranch } = {}) {
  if (branchType === 'head_office') return HEAD_OFFICE_LABEL;

  if (branchType === 'branch') {
    const code = String(branchCode ?? '').trim();
    // A 'branch' with no code is not representable through either form — the
    // schema requires 5 digits — so this is a hand-edited or partially-migrated
    // document. Naming it a branch without a number is still true and still
    // more useful than ''.
    return code ? `${SUB_BRANCH_PREFIX}${code}` : SUB_BRANCH_BARE;
  }

  // Neither present: an old document. Its free text verbatim, because we have
  // no idea which of the two shapes it meant and guessing would invent data.
  return String(legacyBranch ?? '').trim();
}

/**
 * The same question asked of a whole public-registration `invoice` object,
 * which has one wrinkle the three-argument form deliberately does not model:
 * COUNTRY.
 *
 * สำนักงานใหญ่ / สาขาที่ NNNNN are Thai Revenue-Department concepts. A foreign
 * invoice has neither, so that branch of the form keeps a free-text
 * division/branch field (`branchFree`) and this returns it verbatim. Reading
 * `branchType` there would print สำนักงานใหญ่ on a Singapore invoice purely
 * because the field carries a default.
 *
 * `branchFree` before `branch`: the second is the pre-split legacy path, and a
 * document that has both was edited after the split.
 */
export function formatInvoiceBranchLabel(invoice) {
  if (!invoice) return '';
  if (invoice.country === 'OTHER') {
    return String(invoice.branchFree || invoice.branch || '').trim();
  }
  return formatBranchLabel({
    branchType:   invoice.branchType,
    branchCode:   invoice.branchCode,
    legacyBranch: invoice.branch,
  });
}

export const HEAD_OFFICE_LABEL = 'สำนักงานใหญ่';
export const SUB_BRANCH_PREFIX = 'สาขาที่ ';
const SUB_BRANCH_BARE = 'สาขาย่อย';
