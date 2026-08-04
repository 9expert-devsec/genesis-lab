import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsThai, ENGLISH_ONLY_MESSAGE } from '@/lib/registration/englishOnly';

/**
 * The 'Other country' branch of both quotation/invoice schemas is English-only.
 *
 * The rule is stated as an EXCLUSION of the Thai block (U+0E00–U+0E7F) and not
 * as an `/^[A-Za-z ]+$/` allowlist, and that choice is the entire subject of
 * this file: an allowlist rejects real customers, and it does so silently at
 * the point of sale.
 */

const ACCEPTED = [
  ["Côte d'Ivoire",      'accented Latin, and an apostrophe — a real country'],
  ['A/S',                'the Danish company suffix'],
  ['#12-04',             'a Singapore unit number'],
  ['São Paulo',          'Portuguese'],
  ['Zürich',             'German'],
  ['Ñuñoa',              'Spanish'],
  ["O'Brien & Sons",     'punctuation an allowlist would eat'],
  ['1 Raffles Place',    'the ordinary case'],
  ['048616',             'digits only'],
  ['ACME (Thailand) Co., Ltd.', 'the WORD Thailand is not a Thai character'],
];

for (const [value, why] of ACCEPTED) {
  test(`accepts ${JSON.stringify(value)} — ${why}`, () => {
    assert.equal(containsThai(value), false);
  });
}

test('rejects a string with ONE Thai character embedded mid-value', () => {
  // The realistic failure is not a wholly-Thai string, it is a mostly-English
  // one with a Thai word inside — so the predicate searches, it does not anchor.
  assert.equal(containsThai('ACME (ไทย) Co., Ltd.'), true);
  assert.equal(containsThai('1 Sukhumvit Rd, กรุงเทพฯ'), true);
  assert.equal(containsThai('บริษัท ตัวอย่าง จำกัด'), true);
  assert.equal(containsThai('ฯ'), true, 'a lone Thai punctuation mark is still in the block');
});

test('emptiness and non-strings are NOT a Thai-character failure', () => {
  // "Is this field filled in" is a different question, answered by .min(1) on
  // the field. If '' were rejected here, every optional field in the branch
  // would be unfillable.
  assert.equal(containsThai(''), false);
  assert.equal(containsThai(undefined), false);
  assert.equal(containsThai(null), false);
  assert.equal(containsThai(12345), false);
});

test('the message is the one both schemas quote', () => {
  assert.equal(ENGLISH_ONLY_MESSAGE, 'กรุณากรอกเป็นภาษาอังกฤษ');
});

// ── CONTROL ─────────────────────────────────────────────────────────────────

test('CONTROL: an ALLOWLIST implementation reddens the accepted cases', () => {
  /**
   * The whole point, executed. `/^[A-Za-z ]+$/` is the implementation a future
   * edit is most likely to reach for, and it looks correct until a customer in
   * Abidjan cannot get a quotation. This runs it and names every value it would
   * have refused.
   */
  const allowlist = (v) => !/^[A-Za-z ]+$/.test(String(v ?? ''));

  const wronglyRejected = ACCEPTED
    .map(([value]) => value)
    .filter((v) => allowlist(v) !== containsThai(v));

  assert.deepEqual(
    wronglyRejected,
    [
      "Côte d'Ivoire",
      'A/S',
      '#12-04',
      'São Paulo',
      'Zürich',
      'Ñuñoa',
      "O'Brien & Sons",
      '1 Raffles Place',
      '048616',
      'ACME (Thailand) Co., Ltd.',
    ],
    'an allowlist rejects every one of these; the exclusion form accepts them all'
  );

  // …and it agrees with us on the rejections, which is exactly why the mistake
  // survives review: it is only wrong in the direction nobody tests.
  assert.equal(allowlist('ACME (ไทย) Co., Ltd.'), containsThai('ACME (ไทย) Co., Ltd.'));
});

test('CONTROL: the predicate is not simply always-false', () => {
  // Without this, `containsThai = () => false` would pass every acceptance test
  // in this file and disable the rule in both schemas.
  assert.equal(containsThai('ก'), true);
});
