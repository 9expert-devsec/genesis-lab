import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';
import {
  AUDIT_CONTRACT,
  AUDIT_CONTRACT_ENTRIES,
  CONTRACT_MENUS,
  MENUS_WITHOUT_MUTATIONS,
  DIFF_POLICIES,
  DIFF_POLICY_RANK,
  ORDERED_IDS_POLICY,
  ROUND_AND_STATUS_POLICY,
  ROUND_AND_STATUS_KEYS,
  isValidPair,
  pairContract,
  isDualKeySpace,
} from '@/lib/audit/auditContract';
import { reducePayload } from '@/lib/audit/recordAdminAction';

// The (menu, entity) vocabulary the audit trail is allowed to contain.
//
// WHAT THIS FILE CANNOT SEE: whether any action actually RECORDS a pair, or
// records the right one. That is the coverage guard's job and it can only run
// after the sweep — a guard written now would have 159 call sites to check and
// zero of them instrumented, so it would be vacuous rather than green.
//
// What it CAN see is the half that fails silently. `entity` is free-form in the
// schema by design, so a typo is written, looks correct in the central list,
// and is permanently invisible to the inline widget's {menu, entity, recordId}
// query. Everything below is about keeping that vocabulary checkable.

// Taken from the live registry rather than hardcoded, so these tests cannot
// drift into asserting a string this file made up.
const REAL_KEY = CONTRACT_MENUS[0];
const FAKE_KEY = `${REAL_KEY}X`; // one character off — a plausible typo

const SLUG = /^[a-z][a-z0-9_]*$/;
const HAS_THAI = /[฀-๿]/;

/** Every (menu, entity, contract) triple, flattened. */
function everyPair() {
  const out = [];
  for (const [menu, def] of Object.entries(AUDIT_CONTRACT)) {
    for (const [entity, contract] of Object.entries(def.entities ?? {})) {
      out.push({ menu, entity, contract });
    }
  }
  return out;
}

// ── the menu vocabulary is the RBAC registry, not a second list ────

test('every menu key in the contract exists in ALL_PAGE_KEYS', () => {
  const registry = new Set(ALL_PAGE_KEYS);
  for (const menu of CONTRACT_MENUS) {
    assert.ok(
      registry.has(menu),
      `"${menu}" is not an RBAC page key — the contract must not invent menus, ` +
      'because the reading surface renders its Thai label from ADMIN_PAGES and ' +
      'clamps permissions with canAccess(user, menu)'
    );
  }
});

test('CONTROL: a one-character typo of a REAL contract menu is not in the registry', () => {
  // Pairs with the test above. Together they prove the assertion consults
  // ALL_PAGE_KEYS rather than passing everything: a pass-through implementation
  // reddens here, a hardcoded-reject one reddens above.
  assert.ok(
    !ALL_PAGE_KEYS.includes(FAKE_KEY),
    `${FAKE_KEY} must not be a real page key, or the check above proves nothing`
  );
  assert.equal(isValidPair(FAKE_KEY, 'anything'), false);
});

// ── §1's correction, encoded so it cannot drift back ───────────────

test('dashboard is ABSENT — it has no mutating action', () => {
  // `landing_cache` USED TO BE HERE and is not any more. That is the expected
  // consequence of the cache console gaining destructive actions, not a
  // regression — the same shape the `security` test below describes for sweep
  // round 6. It was correctly listed while the page was read-only; a menu that
  // can now purge a collection needs a contract or the writer silently
  // discards its payload.
  assert.ok(
    ALL_PAGE_KEYS.includes('dashboard'),
    'dashboard must still be a real page key, or this test is asserting nothing'
  );
  assert.equal(
    'dashboard' in AUDIT_CONTRACT, false,
    'dashboard is read-only — a contract entry would promise rows that never come'
  );
});

test('landing_cache IS present now, with both cache-console entities', () => {
  // The replacement for the assertion above, so the move is pinned in both
  // directions: reverting the contract entry reddens here rather than leaving
  // a menu whose destructive rows are silently reduced to act_only.
  assert.ok(ALL_PAGE_KEYS.includes('landing_cache'));
  assert.equal('landing_cache' in AUDIT_CONTRACT, true);
  assert.equal(isValidPair('landing_cache', 'snapshot'), true);
  assert.equal(isValidPair('landing_cache', 'mirror'), true);
  // `full`, not count_only: a reset has a real before→after, and count_only
  // would null both sides of exactly the pre-image the ruling requires.
  assert.equal(pairContract('landing_cache', 'snapshot').diff, 'full');
  assert.equal(pairContract('landing_cache', 'mirror').diff, 'full');
});

test('security is ABSENT — UNTIL SWEEP ROUND 6, which is EXPECTED to change this line', () => {
  // `security` is NOT read-only. 2FA setup/verify/disable are route handlers
  // (§5.3), which the action-layer hook cannot see, so the menu has no
  // contract entry yet. Round 6 instruments those three handlers and adds it.
  //
  // WHEN ROUND 6 LANDS: move `security` into AUDIT_CONTRACT and DELETE this
  // test, replacing it with a normal pair assertion. A failure here is the
  // expected consequence of that work, not a regression — this is the one
  // assertion in the file that is meant to be deleted rather than kept green.
  assert.ok(ALL_PAGE_KEYS.includes('security'));
  assert.equal('security' in AUDIT_CONTRACT, false);
  assert.ok(
    MENUS_WITHOUT_MUTATIONS.includes('security'),
    'and it is listed as un-instrumented rather than silently missing'
  );
});

test('profile IS present — the other half of the §1 correction', () => {
  // §1 originally counted four page keys that "will never appear in the log"
  // and included `profile`. It counted mutating exports by their requireAdmin
  // literal, and updateOwnProfile has no guard to count — but it does mutate
  // (admin-accounts.js:250, `await admin.save()`).
  assert.ok('profile' in AUDIT_CONTRACT, 'updateOwnProfile mutates');
  assert.equal(isValidPair('profile', 'admin'), true);
});

test('CONTROL: the absent list and the contract are disjoint and together cover the registry', () => {
  // Without this, MENUS_WITHOUT_MUTATIONS could list a menu that also has a
  // contract entry, and both assertions above would pass while the module
  // contradicted itself.
  for (const menu of MENUS_WITHOUT_MUTATIONS) {
    assert.equal(menu in AUDIT_CONTRACT, false, `${menu} cannot be both`);
  }
  assert.deepEqual(
    new Set([...CONTRACT_MENUS, ...MENUS_WITHOUT_MUTATIONS]),
    new Set(ALL_PAGE_KEYS),
    'every page key is either instrumented or explicitly not — no third state'
  );
});

// ── entity keys ────────────────────────────────────────────────────

test('every menu declares at least one entity', () => {
  for (const menu of CONTRACT_MENUS) {
    const entities = Object.keys(AUDIT_CONTRACT[menu].entities ?? {});
    assert.ok(
      entities.length > 0,
      `${menu} has no entity — the inline widget queries {menu, entity, recordId}, ` +
      'so a menu with no named entity produces rows it can never find'
    );
  }
});

test('entity keys are non-empty and slug-shaped', () => {
  for (const { menu, entity } of everyPair()) {
    assert.ok(entity.length > 0, `${menu} has an empty entity key`);
    assert.match(
      entity, SLUG,
      `${menu}.${entity} — lower_snake, leading letter; entity is a query key, not prose`
    );
  }
});

test('CONTROL: the slug shape actually rejects the things it is meant to', () => {
  // Without this, a permissive regex would let every entity above pass.
  for (const bad of ['', ' ', 'Batch', 'promo-link', '2fa', 'promo link', '_x']) {
    assert.ok(!SLUG.test(bad), `"${bad}" must not pass the slug shape`);
  }
  assert.ok(SLUG.test('early_bird'), 'and a real entity key must pass');
});

test('no (menu, entity) pair is declared twice', () => {
  // This is why the contract is an ARRAY with the map derived from it. As a
  // nested object literal the duplicate would be unrepresentable — JS drops the
  // earlier definition at parse time, silently deleting a contract entry, and
  // `new Set(keys).size === keys.length` would be true by construction. In the
  // array the mistake EXISTS, so this assertion can actually fail.
  const seen = new Map();
  const dupes = [];
  for (const { menu, entity } of AUDIT_CONTRACT_ENTRIES) {
    const pair = `${menu}|${entity}`;
    if (seen.has(pair)) dupes.push(pair);
    seen.set(pair, true);
  }
  assert.deepEqual(
    dupes, [],
    'a duplicate pair silently overwrites the first entry when the lookup map ' +
    'is built, so the losing definition — its label and its diff ceiling — ' +
    'vanishes with no error anywhere'
  );
});

test('CONTROL: the duplicate check is looking at the ARRAY, not the derived map', () => {
  // Without this, the test above could be reading Object.keys of the map and
  // passing for the reason that makes it useless. Prove the array carries more
  // entries than any single menu bucket, and that flattening the map back out
  // gives the same count — i.e. today there are genuinely no duplicates, and
  // the array is the wider of the two structures.
  const fromMap = Object.values(AUDIT_CONTRACT)
    .flatMap((def) => Object.keys(def.entities));
  assert.equal(
    AUDIT_CONTRACT_ENTRIES.length, fromMap.length,
    'array length equals map-pair count ONLY while there are no duplicates — ' +
    'add one and these diverge, which is exactly what the test above catches'
  );
  assert.ok(AUDIT_CONTRACT_ENTRIES.length > 0);
});

test('every array entry survives into the derived map, unchanged', () => {
  // The map is what callers read; the array is what the tests check. If the
  // reduce dropped or altered an entry, every other assertion in this file
  // would be checking a structure the application does not use.
  for (const { menu, entity, label, diff } of AUDIT_CONTRACT_ENTRIES) {
    const got = pairContract(menu, entity);
    assert.ok(got, `${menu}|${entity} is in the array but not in the map`);
    assert.equal(got.label, label, `${menu}|${entity} label`);
    assert.equal(got.diff, diff, `${menu}|${entity} diff`);
  }
});

test('the same entity name may be reused ACROSS menus', () => {
  // Not a defect: `masterclass|course` and `courses|course` are different
  // records, and `accounts|admin` / `profile|admin` differ by who may act.
  // Asserted so nobody "fixes" it into globally-unique entity names, which
  // would make every key redundantly prefixed with its own menu.
  assert.equal(isValidPair('accounts', 'admin'), true);
  assert.equal(isValidPair('profile', 'admin'), true);
  assert.notEqual(
    pairContract('accounts', 'admin').label,
    pairContract('profile', 'admin').label,
    'shared key, distinct labels — the pair is what identifies a record kind'
  );
});

// ── diff policy ────────────────────────────────────────────────────

test('every diff policy is in the closed set', () => {
  for (const { menu, entity, contract } of everyPair()) {
    assert.ok(
      DIFF_POLICIES.includes(contract.diff),
      `${menu}.${entity} has diff "${contract.diff}", which is not one of ` +
      DIFF_POLICIES.join(' | ')
    );
  }
});

test('CONTROL: the closed set rejects a plausible typo', () => {
  // Without this, a `DIFF_POLICIES.includes` against an array containing
  // everything would pass the test above.
  for (const bad of ['status', 'statusonly', 'status-only', 'none', 'partial', '']) {
    assert.ok(!DIFF_POLICIES.includes(bad), `"${bad}" must not be a legal policy`);
  }
});

test('the policy set is exactly the ranked ceilings plus the two off-scale ones', () => {
  /**
   * TWO off-scale policies now. `round_and_status` joined `ordered_ids` for the
   * same structural reason: neither is a POINT on a "how much may be recorded"
   * scale. `ordered_ids` records a set of ids; `round_and_status` records an
   * allowlist of five named fields. A rank would have to answer "is this more or
   * less than status_only", and the honest answer is "it is a different axis".
   *
   * Their `undefined` rank is asserted below because it is load-bearing rather
   * than incidental: the PII test has an explicit branch for it, and a policy
   * that quietly acquired a rank would take the other branch and be compared as
   * though it sat on the scale.
   */
  assert.deepEqual(
    new Set(DIFF_POLICIES),
    new Set([...Object.keys(DIFF_POLICY_RANK), ORDERED_IDS_POLICY, ROUND_AND_STATUS_POLICY]),
    'the ranks and the legal values must not drift apart — a policy with no ' +
    'rank cannot be compared, and a rank with no policy is unreachable'
  );
  assert.equal(DIFF_POLICY_RANK[ORDERED_IDS_POLICY], undefined, 'off the scale on purpose');
  assert.equal(DIFF_POLICY_RANK[ROUND_AND_STATUS_POLICY], undefined, 'off the scale on purpose');
});

test('the PII entities are capped below a full diff — §5.2 made executable', () => {
  // The four PII entities from §5.1. This is the assertion that stops a sweep
  // edit from copying a customer's phone number into an append-only collection
  // whose whole premise is that rows are never modified.
  const PII = [
    ['registrations', 'public'],
    ['registrations', 'inhouse'],
    ['mc_registrations', 'registration'],
    ['career_path_registrations', 'registration'],
  ];
  /**
   * ── OFF-SCALE POLICIES NEED THEIR OWN CLAUSE, AND HERE IS WHY ─────────────
   *
   * `DIFF_POLICY_RANK[c.diff]` is `undefined` for a policy that is deliberately
   * off the ranked scale (`ordered_ids`, `round_and_status`), and
   * `undefined < 3` is FALSE — so the original one-line form would have failed
   * on a correct contract, and the tempting fix (`<= status_only`, or a `?? 0`)
   * would have made it pass on ANY off-scale policy including a future one that
   * permitted everything.
   *
   * So the rule is stated in two parts: never `full`, and an off-scale policy
   * must be one of a NAMED set whose key allowlist is written down here. Adding
   * a policy to a PII pair now requires editing this list, which is the point.
   */
  const SAFE_OFF_SCALE = {
    // Status enum + the four coupled round fields. A round id, a date label and
    // two short enums are not personal data; the reduction drops every other
    // key, so the cap on names/emails/phones is untouched.
    round_and_status: ['status', 'classId', 'classDate', 'scheduleType', 'attendanceMode'],
  };

  for (const [menu, entity] of PII) {
    const c = pairContract(menu, entity);
    assert.ok(c, `${menu}.${entity} must exist`);
    assert.notEqual(c.diff, 'full',
      `${menu}.${entity} is a PII entity and must not permit a full field diff`);

    const ranked = DIFF_POLICY_RANK[c.diff];
    if (ranked === undefined) {
      assert.ok(c.diff in SAFE_OFF_SCALE,
        `${menu}.${entity} uses the off-scale policy "${c.diff}", which is not in this test's `
        + 'reviewed set. An off-scale policy bypasses the rank comparison entirely, so it has '
        + 'to be read and listed here before it may guard a PII entity.');
      // …and the allowlist it claims must actually be the one the writer applies.
      assert.deepEqual([...ROUND_AND_STATUS_KEYS], SAFE_OFF_SCALE[c.diff],
        `the key allowlist for "${c.diff}" has changed since it was reviewed here`);
    } else {
      assert.ok(ranked < DIFF_POLICY_RANK.full,
        `${menu}.${entity} is a PII entity and must not permit a full field diff`);
    }
  }
});

test('the round_and_status reduction DROPS a personal field', () => {
  /**
   * The policy above is only safe if its reduction really is an allowlist. This
   * hands the writer a payload containing a customer's email beside the round
   * fields — the exact mistake a future action could make — and requires the
   * email to be gone.
   */
  const reduced = reducePayload(
    { classId: 'c1', classDate: '1 ม.ค. 2569', scheduleType: 'hybrid',
      attendanceMode: 'teams', status: 'paid',
      coordinatorEmail: 'someone@example.com', notes: 'a customer note' },
    ROUND_AND_STATUS_POLICY,
  );
  assert.deepEqual(Object.keys(reduced).sort(),
    ['attendanceMode', 'classDate', 'classId', 'scheduleType', 'status']);
  assert.ok(!('coordinatorEmail' in reduced), 'a personal field survived the reduction');
  assert.ok(!('notes' in reduced), 'the customer note survived the reduction');
});

test('the round_and_status reduction returns NULL when nothing survives', () => {
  // `{}` would read as a diff that happened to be empty. Null reads as
  // act-only, which is what a row carrying no permitted field actually is.
  assert.equal(reducePayload({ coordinatorEmail: 'x@y.z' }, ROUND_AND_STATUS_POLICY), null);
  assert.equal(reducePayload(null, ROUND_AND_STATUS_POLICY), null);
  assert.equal(reducePayload(['status'], ROUND_AND_STATUS_POLICY), null, 'an array was let through');
});

test('the preview ceiling is STRUCTURAL — pages|preview cannot carry a payload', () => {
  // §8.7 ruling: `preview` was split so that "never log the preview password"
  // stops being prose nothing enforces. enable / regenerate-password / revoke
  // all live at `preview`, capped at act_only, so a row carrying the password
  // is a contract violation rather than a review comment someone might make.
  // regeneratePreviewPassword is the single most dangerous pair in the table to
  // leave at `full`.
  assert.equal(pairContract('pages', 'preview').diff, 'act_only');
  assert.equal(
    DIFF_POLICY_RANK[pairContract('pages', 'preview').diff], DIFF_POLICY_RANK.act_only,
    'act_only means before/after are null — there is no field for a secret to land in'
  );
});

test('CONTROL: the expiry date got its OWN pair rather than raising that ceiling', () => {
  // The other half of the split, and the reason it is a split rather than a
  // demotion: the expiry date is not a secret and is worth recording. If
  // preview_expiry vanished, someone would raise `preview` back to full to get
  // it — which is the exact regression this pair exists to prevent.
  const expiry = pairContract('pages', 'preview_expiry');
  assert.ok(expiry, 'pages|preview_expiry must exist');
  assert.equal(expiry.diff, 'full');
});

test('local_faq is a valid pair under all four menus its guard can resolve to', () => {
  // pageKeyForType(course_type) resolves to one of these four, and §8.7 rules
  // that the RESOLVED key is what gets recorded. Without every pair, a FAQ
  // edited under a course produces a row the pair set rejects — a real row,
  // refused by the contract, which is worse than no contract at all.
  for (const menu of ['courses', 'career_paths', 'masterclass', 'local_faqs']) {
    assert.equal(
      isValidPair(menu, 'local_faq'), true,
      `${menu}|local_faq must be legal — pageKeyForType can resolve to it`
    );
  }
});

test('CONTROL: local_faq is NOT legal under a menu its guard cannot resolve to', () => {
  // Without this, declaring local_faq under every menu would satisfy the test
  // above while making the pair set meaningless.
  for (const menu of ['articles', 'banners', 'roles']) {
    assert.equal(isValidPair(menu, 'local_faq'), false, `${menu}|local_faq must not be legal`);
  }
});

test('CONTROL: a non-PII content entity DOES permit a full diff', () => {
  // Without this, capping everything at act_only would satisfy the test above
  // while destroying the trail's value everywhere else.
  assert.equal(pairContract('articles', 'article').diff, 'full');
  assert.equal(pairContract('recruits', 'recruit').diff, 'full');
});

// ── dualKeySpace ───────────────────────────────────────────────────

test('dualKeySpace is true for courses', () => {
  assert.equal(isDualKeySpace('courses'), true);
});

test('CONTROL: dualKeySpace is true for NOTHING else', () => {
  // Pairs with the test above: a getter returning true unconditionally reddens
  // here, one returning false unconditionally reddens above.
  const flagged = CONTRACT_MENUS.filter((m) => isDualKeySpace(m));
  assert.deepEqual(
    flagged, ['courses'],
    'only `courses` splits recordId across two key spaces (MSDB _id for the ' +
    'course, the course_id CODE for its extension/early-bird/promo rows). ' +
    'A second dual-key menu is a design change, not a data edit'
  );
});

test('an unknown menu is not dual-key rather than throwing', () => {
  assert.equal(isDualKeySpace(FAKE_KEY), false);
  assert.equal(isDualKeySpace(undefined), false);
});

// ── labels ─────────────────────────────────────────────────────────

// A label may be pure Latin ONLY when it is a proper noun the admin already
// reads in Latin. ADMIN_PAGES sets that precedent itself — `Career Path`,
// `FAQ`, `Webhook Logs`, `TNHS Courses` are its own labels — so demanding a
// Thai codepoint in every entity label would force a mistranslation of `FAQ`
// rather than catch anything. The allow-list is the compromise: small,
// explicit, and adding to it is a visible act in a diff.
const LATIN_PROPER_NOUNS = new Set([
  'Skill',
  'Career Path',
  'FAQ',
  'Webhook Log',
]);

test('every entry carries a non-empty label, in Thai unless it is a proper noun', () => {
  for (const { menu, entity, contract } of everyPair()) {
    const label = contract.label;
    assert.ok(
      typeof label === 'string' && label.length > 0 && label.trim() === label,
      `${menu}.${entity} has no label, or one with stray whitespace`
    );
    assert.ok(
      HAS_THAI.test(label) || LATIN_PROPER_NOUNS.has(label),
      `${menu}.${entity} label "${label}" is neither Thai nor an allow-listed ` +
      'proper noun. The admin reads this surface in Thai, and `entity` is the ' +
      'one field with no label source anywhere else — an untranslated ' +
      'placeholder here reaches a user'
    );
  }
});

test('CONTROL: an all-Latin label that is NOT an allow-listed proper noun is rejected', () => {
  // Without this the label check would pass for anything, and the most likely
  // real defect — a new entity shipped with its English key as its label —
  // would sail through.
  for (const untranslated of ['Banner', 'Client Logo', 'batch', 'TODO']) {
    assert.ok(
      !(HAS_THAI.test(untranslated) || LATIN_PROPER_NOUNS.has(untranslated)),
      `"${untranslated}" must fail the label check`
    );
  }
  assert.ok(HAS_THAI.test('บทความ'), 'and a Thai label must pass it');
  assert.ok(LATIN_PROPER_NOUNS.has('FAQ'), 'as must an allow-listed proper noun');
});

test('CONTROL: the allow-list has no dead entries', () => {
  // An allow-list that outlives its labels stops being a decision and becomes
  // a hole — the next all-Latin label to match a stale entry passes silently.
  const used = new Set(everyPair().map((p) => p.contract.label));
  for (const noun of LATIN_PROPER_NOUNS) {
    assert.ok(used.has(noun), `"${noun}" is allow-listed but no entity uses it`);
  }
});

// ── pair lookup ────────────────────────────────────────────────────

test('isValidPair accepts a declared pair and rejects a typo of its entity', () => {
  const { menu, entity } = everyPair()[0];
  assert.equal(isValidPair(menu, entity), true);
  assert.equal(
    isValidPair(menu, `${entity}s`), false,
    'a pluralised entity is the typo that makes rows invisible to the widget'
  );
});

test('CONTROL: a valid entity under the WRONG menu is rejected', () => {
  // The pair is the unit, not the entity. `batch` is real under `masterclass`
  // and meaningless under `articles`; if the lookup ignored the menu, a
  // mis-filed row would validate.
  assert.equal(isValidPair('masterclass', 'batch'), true);
  assert.equal(isValidPair('articles', 'batch'), false);
});

test('pairContract returns null for an unknown pair instead of throwing', () => {
  assert.equal(pairContract(FAKE_KEY, 'anything'), null);
  assert.equal(pairContract('articles', 'nope'), null);
  assert.equal(pairContract(undefined, undefined), null);
});
