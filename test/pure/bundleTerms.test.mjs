import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUNDLE_TERMS,
  BUNDLE_TERMS_DISMISS,
  BUNDLE_TERMS_TITLE,
} from '@/lib/registration/bundleTerms';

/**
 * THE BUNDLE QUOTATION'S TERMS, PINNED CHARACTER FOR CHARACTER.
 *
 * This is legal copy supplied by the product owner. The module's own header
 * records three things a reader will be tempted to "fix" — two near-duplicate
 * clauses, a clause wholly contained in another, and one that reserves the right
 * to GIVE advance notice where the usual formulation reserves the right to act
 * WITHOUT it. All three were raised and ruled on: ship as given.
 *
 * So the point of this file is not that the strings are well-formed. It is that
 * they cannot be quietly improved. Every clause is asserted whole, in position,
 * against a literal written out here — not against a slice of the array under
 * test, which would pass no matter what the array said.
 */

/**
 * The eleven, in order, as supplied. If a clause legitimately changes, this
 * literal is where the change is reviewed — deliberately verbose, deliberately
 * duplicated from the module, because a test that derives its expectation from
 * the thing it tests asserts nothing at all.
 */
const EXPECTED = [
  'ไม่สามารถใช้ร่วมกับโปรโมชันอื่นได้',
  'ราคานี้เป็นราคาก่อนภาษีมูลค่าเพิ่ม',
  'สงวนสิทธิ์การเรียนซ้ำ เลื่อนรอบอบรม หรือยกเลิก ในทุกกรณี',
  'หากผู้อบรมไม่สามารถอบรมได้ในวันดังกล่าว ถือว่าสละสิทธิ์',
  'ทางสถาบันขอสงวนสิทธิ์คืนค่าชำระในทุกกรณี',
  'โปรโมชันดังกล่าว เฉพาะในรอบอบรมที่กำหนด ไม่สามารถย้ายรอบได้ในทุกกรณี และไม่สามารถใช้ร่วมกับโปรโมชันอื่นได้',
  'ไม่สามารถแยกเอกสารการชำระได้ในทุกกรณี เช่น ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จรับเงิน และใบกำกับภาษี',
  'สิทธิ์นี้ไม่สามารถแลกหรือเปลี่ยนเป็นเงินสดได้',
  'สงวนสิทธิ์ในการเปลี่ยนแปลงวันที่การอบรม',
  'สงวนสิทธิ์สำหรับผู้ที่ชำระเงินภายในระยะเวลาที่กำหนดเท่านั้น',
  'หากมีการเปลี่ยนแปลงสิทธิพิเศษเป็นแบบอื่น ทางสถาบันฯ ขอสงวนสิทธิ์ในการแจ้งให้ท่านทราบล่วงหน้า',
];

test('all eleven clauses, verbatim and in the order supplied', () => {
  assert.equal(BUNDLE_TERMS.length, 11);
  assert.deepEqual([...BUNDLE_TERMS], EXPECTED);
  // Position by position as well as as a whole, so a failure names the clause
  // rather than printing two eleven-item arrays and leaving you to diff them.
  EXPECTED.forEach((clause, i) => {
    assert.equal(BUNDLE_TERMS[i], clause, `clause ${i + 1} changed`);
  });
});

test('CONTROL: the comparison is discriminating — a single character fails it', () => {
  /**
   * Without this, `deepEqual` against a literal nobody has checked could be
   * comparing two copies of the same mistake. This shows the assertion moving.
   */
  const tampered = [...EXPECTED];
  tampered[0] = `${tampered[0]} `; // one trailing space
  assert.notDeepEqual([...BUNDLE_TERMS], tampered);

  // …and the specific edit the module forbids: adding the negation to [10].
  const negated = [...EXPECTED];
  negated[10] = 'หากมีการเปลี่ยนแปลงสิทธิพิเศษเป็นแบบอื่น ทางสถาบันฯ ขอสงวนสิทธิ์ในการเปลี่ยนแปลงโดยไม่ต้องแจ้งให้ทราบล่วงหน้า';
  assert.notDeepEqual([...BUNDLE_TERMS], negated);
  assert.notEqual(BUNDLE_TERMS[10], negated[10]);
});

test('the clause that reserves the right to GIVE notice is intact — the negation is NOT added', () => {
  /**
   * Called out on its own because it is the one a well-meaning reader is most
   * likely to "correct". `ขอสงวนสิทธิ์ในการแจ้งให้ท่านทราบล่วงหน้า` reserves the
   * right to NOTIFY; the common formulation reserves the right to act WITHOUT
   * notifying. It was raised as a possible missing `ไม่` and confirmed as
   * intended.
   */
  const eleventh = BUNDLE_TERMS[10];
  assert.ok(eleventh.includes('ขอสงวนสิทธิ์ในการแจ้งให้ท่านทราบล่วงหน้า'));
  assert.ok(!eleventh.includes('ไม่ต้องแจ้ง'), 'the negation was added');
});

test('the two overlapping pairs are BOTH still present — neither was consolidated', () => {
  /**
   * The duplication was reported before building and ruled to stay. A future
   * tidy-up that merges either pair has to delete an assertion here and say why,
   * which is the point: a clause quietly dropped is one nobody agreed to drop.
   */
  // Pair A — cancellation and refund, stated separately.
  assert.ok(BUNDLE_TERMS.includes('สงวนสิทธิ์การเรียนซ้ำ เลื่อนรอบอบรม หรือยกเลิก ในทุกกรณี'));
  assert.ok(BUNDLE_TERMS.includes('ทางสถาบันขอสงวนสิทธิ์คืนค่าชำระในทุกกรณี'));

  // Pair B — [0] is wholly contained in [5], and both stay.
  const alone = 'ไม่สามารถใช้ร่วมกับโปรโมชันอื่นได้';
  assert.ok(BUNDLE_TERMS.includes(alone));
  assert.ok(BUNDLE_TERMS[5].includes(alone), 'the long clause no longer contains the short one');
  assert.notEqual(BUNDLE_TERMS[0], BUNDLE_TERMS[5], 'they are still two separate clauses');

  // CONTROL: containment is a real relation here and not vacuous — the short
  // clause is NOT inside every clause.
  assert.ok(!BUNDLE_TERMS[1].includes(alone));
});

test('every clause is a non-empty trimmed string — no placeholder slipped in', () => {
  for (const [i, clause] of BUNDLE_TERMS.entries()) {
    assert.equal(typeof clause, 'string', `clause ${i + 1} is not a string`);
    assert.ok(clause.length > 0, `clause ${i + 1} is empty`);
    assert.equal(clause, clause.trim(), `clause ${i + 1} has stray whitespace`);
  }
  // Eleven DISTINCT clauses: the modal keys its list items by clause text, and a
  // duplicate string would collide as a React key.
  assert.equal(new Set(BUNDLE_TERMS).size, 11);
});

test('the array is frozen — a consumer cannot sort or splice the shared copy', () => {
  assert.ok(Object.isFrozen(BUNDLE_TERMS));
  assert.throws(() => {
    'use strict';
    BUNDLE_TERMS.push('ข้อกำหนดใหม่');
  });
  assert.equal(BUNDLE_TERMS.length, 11, 'the array was mutated');
});

test('the title is the bundle’s own, NOT the payment modal’s', () => {
  /**
   * The ruling this whole file exists under: a quotation takes no payment, so it
   * must not be titled with, or point at, the payment terms.
   */
  assert.equal(BUNDLE_TERMS_TITLE, 'เงื่อนไขการสมัคร');
  assert.notEqual(BUNDLE_TERMS_TITLE, 'เงื่อนไขการสมัครและการชำระเงิน');
  assert.ok(!BUNDLE_TERMS_TITLE.includes('การชำระเงิน'), 'the title names payment');
});

test('the dismiss label matches the public modal’s, deliberately', () => {
  assert.equal(BUNDLE_TERMS_DISMISS, 'รับทราบและปิด');
});
