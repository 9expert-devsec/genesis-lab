import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * ONE NUMBER, FOUR DECLARATIONS.
 *
 * In-house is sold in rounds of 15, and 15 is written down in four independent
 * places:
 *
 *   1. InhouseForm's MIN_PARTICIPANTS  — the stepper clamp and the disabled minus
 *   2. the zod rule                    — what a hand-crafted POST hits
 *   3. the zod defaults object         — what an omitted key becomes
 *   4. RegisterInhouse's Mongoose min  — the last line before the collection
 *
 * THE FAILURE THIS GUARD EXISTS FOR: fixing three of the four gives a form that
 * looks right, refuses to step below 15, and still writes 3 the moment anything
 * reaches it by another road. No behavioural test can see that, because each
 * layer is individually consistent — the defect is the DISAGREEMENT, and the
 * only way to see a disagreement is to read all four and compare.
 *
 * Read through test/sourceScan.mjs, so the prose in these very files explaining
 * the floor cannot satisfy a matcher, and so CRLF is normalised before matching.
 */

const FLOOR = 15;

const FORM   = readSource('src/components/registration/InhouseForm.jsx');
const SCHEMA = readSource('src/lib/schemas/register-inhouse.js');
const MODEL  = readSource('src/models/RegisterInhouse.js');

/** Pull a single integer out of `code` with `re`, failing loudly if it is gone. */
function numberFrom(code, re, what) {
  const m = code.match(re);
  assert.ok(m, `${what}: not found — this guard has lost its subject, which is NOT a pass`);
  return Number(m[1]);
}

const LAYERS = () => ({
  'InhouseForm MIN_PARTICIPANTS': numberFrom(
    FORM.code, /const\s+MIN_PARTICIPANTS\s*=\s*(\d+)\s*;/, 'the form constant'
  ),
  'zod .min()': numberFrom(
    SCHEMA.code, /participantsCount:\s*z\.number\(\)\.int\(\)\.min\((\d+)\s*,/, 'the zod rule'
  ),
  'zod default': numberFrom(
    SCHEMA.code, /participantsCount:\s*(\d+)\s*,/, 'the defaults object'
  ),
  'Mongoose min': numberFrom(
    MODEL.code, /participantsCount:\s*\{\s*type:\s*Number,\s*min:\s*(\d+)/, 'the Mongoose min'
  ),
});

test('all four layers declare the SAME floor', () => {
  const layers = LAYERS();
  const wrong = Object.entries(layers).filter(([, n]) => n !== FLOOR);
  assert.deepEqual(
    wrong,
    [],
    `every layer must be ${FLOOR}. Got ${JSON.stringify(layers)} — ` +
      'a form that refuses to step below 15 while another layer still accepts 3 ' +
      'is the exact defect this guard exists for.'
  );
});

test('CONTROL: each of the four extractors really reads its own file', () => {
  /**
   * Without this, a regex that matched nothing would throw the "not found"
   * assertion — good — but a regex that matched the WRONG file's text would
   * silently agree with itself forever. Each value is re-read from a source the
   * others cannot supply.
   */
  assert.ok(FORM.code.includes('MIN_PARTICIPANTS'), 'the form declares the constant');
  assert.equal(SCHEMA.code.includes('MIN_PARTICIPANTS'), false, 'and the schema does NOT — four declarations, not one import');
  assert.equal(MODEL.code.includes('MIN_PARTICIPANTS'), false);
  assert.equal(Object.keys(LAYERS()).length, 4, 'four layers, no more and no fewer');
});

test('CONTROL: the comparison DOES fire when one layer disagrees', () => {
  /**
   * The sweep above compares against a literal, so a broken extractor that
   * returned 15 for everything would pass. This runs the same comparison on a
   * deliberately mismatched set and asserts it reports exactly the odd one out.
   *
   * BUILT FROM LITERALS, NOT FROM `LAYERS()`. A control assembled out of the
   * live readings goes red whenever the source is wrong — which is the sweep's
   * job, not the control's, and it means a single real regression reports twice
   * and neither failure tells you which one is the diagnosis.
   */
  const mutant = {
    'InhouseForm MIN_PARTICIPANTS': 15,
    'zod .min()': 15,
    'zod default': 15,
    'Mongoose min': 1, // <-- three of four fixed: the exact defect being guarded
  };
  const wrong = Object.entries(mutant).filter(([, n]) => n !== FLOOR);
  assert.deepEqual(wrong, [['Mongoose min', 1]]);

  // …and the all-agreeing set reports nothing, so the filter is not simply
  // always-true.
  const clean = Object.fromEntries(Object.keys(mutant).map((k) => [k, 15]));
  assert.deepEqual(Object.entries(clean).filter(([, n]) => n !== FLOOR), []);
});

// ── The stepper handlers ────────────────────────────────────────────────────

test('the minus handler clamps at the constant, not at a literal 1', () => {
  // The pre-change expression was `Math.max(1, participantsCount - 1)`. A
  // rendered probe cannot see a click handler at all, so the handler is pinned
  // here and the resulting `disabled=""` is pinned in the render tier.
  assert.match(
    FORM.code,
    /onClick=\{\(\)\s*=>\s*setValue\('participantsCount',\s*clampParticipants\(participantsCount - 1\)\)\}/,
    'the minus button must go through clampParticipants'
  );
  assert.equal(
    /Math\.max\(\s*1\s*,\s*participantsCount/.test(FORM.code),
    false,
    'the old floor-of-1 expression must be gone'
  );
});

test('the plus handler clamps too, so a stale below-floor draft heals in one press', () => {
  assert.match(
    FORM.code,
    /onClick=\{\(\)\s*=>\s*setValue\('participantsCount',\s*clampParticipants\(participantsCount \+ 1\)\)\}/
  );
  // …and the clamp is two-sided, so plus from 3 lands on 15 rather than 4.
  assert.match(
    FORM.code,
    /clampParticipants\s*=\s*\(n\)\s*=>\s*Math\.min\(MAX_PARTICIPANTS,\s*Math\.max\(MIN_PARTICIPANTS,\s*n\)\)/
  );
});

test('the minus button is disabled from the constant', () => {
  assert.match(FORM.code, /disabled=\{participantsCount <= MIN_PARTICIPANTS\}/);
});

// ── The admin allowlist ─────────────────────────────────────────────────────

test('participantsCount is still admin-editable, and still unvalidated there', () => {
  /**
   * Both halves are decisions on record.
   *
   * EDITABLE: sales genuinely revise the headcount after a call, so removing it
   * from the allowlist would be a regression, not a safety improvement.
   *
   * UNVALIDATED: `updateRegistration` runs no zod and passes
   * `runValidators: false`, per the ruling from the previous round that the
   * action gets narrow per-field guards rather than `parse()`. So an admin can
   * still write 3 today. This test pins the current state so the gap is
   * documented rather than discovered; see the report for why this field is a
   * candidate for the first per-field guard.
   */
  const actions = readSource('src/lib/actions/registrations.js');
  const allowlist = actions.code.match(/const\s+inhouseFields\s*=\s*\[([\s\S]*?)\]\s*;/);
  assert.ok(allowlist, 'inhouseFields array not found');
  assert.ok(allowlist[1].includes("'participantsCount'"), 'sales must still be able to revise the headcount');

  assert.match(actions.code, /runValidators:\s*false/, 'the Mongoose min cannot fire on this path');
  assert.equal(
    /participantsCount[\s\S]{0,80}?(parse|min\s*\(|>=\s*15)/.test(allowlist[1]),
    false,
    'no per-field guard yet — if one is added, update this test and say so'
  );
});

test('no in-house write path runs Mongoose validators on an existing document', () => {
  /**
   * WHY THIS MATTERS FOR HISTORICAL DATA: raising the Mongoose `min` from 1 to
   * 15 would be a live hazard if any admin save validated — every enquiry in
   * the collection written for fewer than 15 people would start failing to
   * save, with an error about a field the admin never touched. Checked rather
   * than assumed:
   *   · the only validating write is RegisterInhouse.create in the API route,
   *     and it receives zod-parsed data, so it cannot be below the floor;
   *   · every admin write is findByIdAndUpdate with runValidators: false;
   *   · there is no .save() on this model anywhere.
   */
  const route = readSource('src/app/api/registration/inhouse/route.js');
  assert.match(route.code, /RegisterInhouse\.create\(/, 'the one validating writer');

  for (const rel of ['src/lib/actions/registrations.js', 'src/lib/actions/inhouse-registrations.js']) {
    const src = readSource(rel);
    assert.equal(/runValidators:\s*true/.test(src.code), false, `${rel} must not validate on update`);
    assert.equal(/RegisterInhouse[\s\S]{0,40}\.save\(/.test(src.code), false, `${rel} must not .save() the model`);
  }
});

test('CONTROL: the runValidators probe DOES match a real `true`', () => {
  // Several actions in this repo legitimately use runValidators: true. Firing
  // the probe on one proves the absence assertions above are not vacuous.
  assert.match(readSource('src/lib/actions/articles.js').code, /runValidators:\s*true/);
});
