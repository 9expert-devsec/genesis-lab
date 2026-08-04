import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources, countCallSites } from '../sourceScan.mjs';

/**
 * THREE SEAMS, one rule: `branch` is legacy READ-ONLY, `companyName` is a
 * mirror written in exactly one place, and the admin allowlists are the layer
 * where both of those quietly stop being true.
 *
 * ── WHY SOURCE-SCANNED ──────────────────────────────────────────────────────
 * "Nothing writes this field" is a claim about the WHOLE repo, and no render or
 * pure test can make it: a second writer added in a file nobody thought to
 * import would satisfy every behavioural test in the suite. The allowlist in
 * updateRegistration is worse still — an unnamed key is dropped silently, the
 * action returns ok, and the admin sees the old value after a refresh. Nothing
 * throws, so there is nothing to catch behaviourally.
 *
 * Read through test/sourceScan.mjs, so comments (including the ones in these
 * very files explaining that `branch` is legacy) and import lines cannot
 * satisfy a matcher. Line endings are normalised there, which is what makes
 * these matchers safe on a CRLF working tree.
 */

const ACTIONS = readSource('src/lib/actions/registrations.js');
const INHOUSE_ROUTE = readSource('src/app/api/registration/inhouse/route.js');

// ── 1. Nothing writes `branch` ──────────────────────────────────────────────

/**
 * A WRITE, not a mention. Three spellings reach Mongo:
 *   branch: <expr>            — an object literal handed to create/update
 *   update['invoice.branch']  — the admin action's bracket form
 *   set('branch', …)          — the admin edit form's setter
 * The `(?!Type|Code|Free|Label)` guard is what keeps this from matching the
 * three fields that legitimately replaced it.
 */
const BRANCH_WRITE = /\bbranch(?!Type|Code|Free|Label)\b\s*:(?!:)|\[['"][\w.]*\bbranch(?!Type|Code|Free)\b['"]\]\s*=|\bset\(\s*['"]branch(?!Type|Code|Free)['"]/;

/**
 * OUT OF SCOPE BY INSTRUCTION, and useful precisely for that: these files still
 * carry the old shape, so they are the control anchor below.
 */
const OUT_OF_SCOPE = [
  'src/lib/email/template-senders/masterclass.js',
  'src/models/MasterclassRegistration.js',
  'src/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient.jsx',
];

const isOutOfScope = (rel) =>
  OUT_OF_SCOPE.some((f) => rel === f) || /masterclass|career-path/i.test(rel);

/**
 * The two Mongoose models are exempt from the WRITE sweep and only from it.
 * `branch: { type: String }` is a schema DECLARATION and is textually
 * indistinguishable from an object-literal write — it is also the whole point:
 * the path has to stay declared or historical documents stop reading back. So
 * the models are excluded here and asserted POSITIVELY in the next test, which
 * is the stronger claim anyway.
 */
const MODELS = ['src/models/RegisterInhouse.js', 'src/models/RegisterPublic.js'];

test('no in-scope source file WRITES `branch`', () => {
  const offenders = walkSources('src')
    .filter((f) => !isOutOfScope(f.rel) && !MODELS.includes(f.rel))
    .filter((f) => BRANCH_WRITE.test(f.code))
    .map((f) => f.rel);

  assert.deepEqual(
    offenders,
    [],
    'branch is legacy read-only — the structured pair replaced it. ' +
      'A second writer is how one value under two names starts disagreeing with itself.'
  );
});

test('both models still DECLARE branch, and declare the pair that replaced it', () => {
  // The exemption above is only safe because this holds. Dropping the path is
  // the other way this goes wrong: every pre-split document silently loses its
  // branch on read, with no error anywhere.
  for (const rel of MODELS) {
    const src = readSource(rel);
    assert.match(src.code, /branch\s*:\s*\{\s*type:\s*String/, `${rel} must keep the legacy path`);
    assert.match(src.code, /branchType\s*:\s*\{/, `${rel} must declare branchType`);
    assert.match(src.code, /branchCode\s*:\s*\{\s*type:\s*String/, `${rel} must declare branchCode`);
  }
});

test('CONTROL: BRANCH_WRITE DOES match the untouched out-of-scope code', () => {
  // Without this the sweep above is vacuous: a matcher that can never fire
  // reports "no offenders" forever. Fired at files that were deliberately left
  // alone and still hold the old shape.
  const career = readSource('src/app/(public)/career-path-register/[slug]/_components/CareerPathRegisterClient.jsx');
  assert.ok(BRANCH_WRITE.test(career.code), 'the career-path copy still writes branch');
});

test('CONTROL: BRANCH_WRITE matches an INJECTED write in each shape', () => {
  // One control per spelling the matcher claims to cover, so a regex edit that
  // silently drops a form is caught here rather than in production.
  assert.ok(BRANCH_WRITE.test("const doc = { branch: 'สำนักงานใหญ่' };"), 'object literal');
  assert.ok(BRANCH_WRITE.test("update['invoice.branch'] = String(inv.branch);"), 'bracket assignment');
  assert.ok(BRANCH_WRITE.test("onChange={(v) => set('branch', v)}"), 'setter call');
});

test('CONTROL: BRANCH_WRITE does NOT match the fields that replaced it', () => {
  // The trap this matcher was written around: `branch` is a prefix of all three
  // successors, so an unguarded \bbranch\b would report every new write as an
  // offender and the sweep would be red for exactly the wrong reason.
  for (const ok of [
    "{ branchType: 'head_office' }",
    "update['invoice.branchType'] = inv.branchType;",
    "update['invoice.branchCode'] = String(inv.branchCode);",
    "set('branchFree', v)",
    'const branchLabel = formatBranchLabel({ branchType, branchCode });',
  ]) {
    assert.equal(BRANCH_WRITE.test(ok), false, `false positive on: ${ok}`);
  }
});

// ── 2. The admin allowlists ─────────────────────────────────────────────────

test("updateRegistration's public branch names branchType and branchCode", () => {
  // The third of three layers (JSX control → invoice skeleton → this
  // allowlist). Two out of three saves nothing and reports success.
  assert.match(ACTIONS.code, /update\['invoice\.branchType'\]\s*=/);
  assert.match(ACTIONS.code, /update\['invoice\.branchCode'\]\s*=/);
  assert.match(ACTIONS.code, /update\['invoice\.branchFree'\]\s*=/);
});

test("updateRegistration's public branch does NOT name `branch`", () => {
  assert.equal(
    /update\['invoice\.branch'\]/.test(ACTIONS.code),
    false,
    'leaving branch writable is how the two representations drift apart'
  );
});

/** The `inhouseFields` array literal, as text, so membership can be asserted. */
const INHOUSE_ALLOWLIST = (() => {
  const m = ACTIONS.code.match(/const\s+inhouseFields\s*=\s*\[([\s\S]*?)\]\s*;/);
  assert.ok(m, 'inhouseFields array not found — this guard has lost its subject');
  return m[1];
})();

test('the in-house allowlist names the NEW fields', () => {
  for (const field of ['onsiteVenue', 'branchType', 'branchCode']) {
    assert.ok(
      INHOUSE_ALLOWLIST.includes(`'${field}'`),
      `${field} is unreachable from the admin edit surface`
    );
  }
});

test('the in-house allowlist no longer names any DELETED field', () => {
  const deleted = [
    'skillLevel', 'objective', 'scheduleMode', 'preferredDateFrom', 'preferredDateTo',
    'onsiteEquipment', 'onsiteAddress', 'onsiteProvince', 'onsiteDistrict',
    'branch', 'companyName',
  ];
  const survivors = deleted.filter((f) => INHOUSE_ALLOWLIST.includes(`'${f}'`));
  assert.deepEqual(
    survivors,
    [],
    'these paths survive on the Mongoose schema for historical documents only — ' +
      'writable means the admin surface can create data in a shape nothing else produces'
  );
});

test('CONTROL: the allowlist probe DOES find the fields that are still there', () => {
  // Without this, a mangled regex capture (or a renamed array) would make both
  // membership tests above pass on an empty string.
  for (const field of ['coursesInterested', 'trainingFormat', 'quotationCompany', 'adminNotes']) {
    assert.ok(INHOUSE_ALLOWLIST.includes(`'${field}'`), `${field} should still be editable`);
  }
});

// ── 3. companyName is mirrored at exactly ONE call site ─────────────────────

test('the in-house route writes companyName from quotationCompany, ONCE', () => {
  const routeWrites = INHOUSE_ROUTE.code.match(/\bcompanyName\s*:/g) ?? [];
  assert.equal(routeWrites.length, 1, 'exactly one call site');
  assert.match(
    INHOUSE_ROUTE.code,
    /companyName\s*:\s*data\.quotationCompany/,
    'and it derives from quotationCompany'
  );
});

test('the admin action READS companyName but never writes the in-house one', () => {
  /**
   * It is derived, so an admin editing `quotationCompany` and an admin editing
   * `companyName` would be two ways to set one thing, with the winner whichever
   * ran second.
   *
   * READS are expected and required — the list projection and its $regex search
   * are precisely why the mirror exists at all — so this asserts the WRITE
   * forms only, and asserts the reads are still there so the exemption cannot
   * hide their removal.
   */
  assert.equal(/update\.companyName\s*=/.test(ACTIONS.code), false, 'no direct assignment');
  assert.equal(/update\[['"]companyName['"]\]/.test(ACTIONS.code), false, 'no bracket assignment');
  assert.equal(INHOUSE_ALLOWLIST.includes("'companyName'"), false, 'not in the allowlist');

  assert.match(ACTIONS.code, /\{\s*companyName:\s*\{\s*\$regex/, 'the search still matches on it');
  assert.match(ACTIONS.code, /\.select\('companyName /, 'the list projection still selects it');
});

test('nothing ELSE in src DERIVES an in-house companyName', () => {
  /**
   * `companyName: <something>.<field>` is the shape of the mirror. Two
   * exemptions, both named rather than pattern-matched away:
   *
   *   · the route — the one legitimate writer, asserted above;
   *   · the email SENDER — not a write at all. It passes `companyName` as an
   *     ARGUMENT to the HTML fallback template, from `data.quotationCompany`,
   *     which is the same single source. Asserted here rather than exempted
   *     silently, because the failure mode if it ever reads `data.companyName`
   *     again is the literal string 'undefined' in a subject line.
   *
   * Scoped to the `<obj>.<field>` form on purpose: `invoice.companyName` and
   * the masterclass model are different fields that share a name, and a blanket
   * sweep would be red for something unrelated on day one.
   */
  const SENDER = 'src/lib/email/template-senders/inhouse-registration.js';
  const offenders = walkSources('src')
    .filter((f) => !isOutOfScope(f.rel))
    .filter((f) => f.rel !== 'src/app/api/registration/inhouse/route.js' && f.rel !== SENDER)
    .filter((f) => /\bcompanyName\s*:\s*(data|d|doc)\./.test(f.code))
    .map((f) => f.rel);
  assert.deepEqual(offenders, [], 'the mirror is maintained in exactly one place');

  const sender = readSource(SENDER);
  assert.match(sender.code, /companyName\s*:\s*data\.quotationCompany/);
  assert.equal(/\bdata\.companyName\b/.test(sender.code), false, 'the stripped key must not be read');
});

test('the zod schema does not carry companyName at all', () => {
  const schema = readSource('src/lib/schemas/register-inhouse.js');
  assert.equal(
    /\bcompanyName\s*:/.test(schema.code),
    false,
    'zod is in strip mode — a key here would make the route`s mirror a second writer'
  );
});

// ── 4. The stub mirrors the real module ─────────────────────────────────────

test('the registrations action stub offers exactly the real module`s exports', () => {
  /**
   * A stub that keeps offering a retired action is a fixture that lies: the
   * render tier would go on proving a deleted code path works. Same rule the
   * article-actions stub is held to.
   */
  const names = (code) => (code.match(/export\s+async\s+function\s+(\w+)/g) ?? [])
    .map((s) => s.replace(/.*\s/, ''))
    .sort();

  const real = names(ACTIONS.code);
  const stub = names(readSource('test/stub-registration-actions.mjs').code);
  assert.deepEqual(stub, real, 'stub and real module must export the same set');
});

test('CONTROL: countCallSites is reading real code, not an empty string', () => {
  // The reader could be handing back '' (wrong path, failed scrub) and every
  // "does not appear" assertion in this file would pass. Anchored on a call
  // that must exist.
  assert.ok(countCallSites(ACTIONS.code, 'requireAdmin') >= 6, 'the action guards every export');
  assert.ok(ACTIONS.code.length > 2000, 'the file was actually read');
});
