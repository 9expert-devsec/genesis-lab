import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isSlugError } from '@/lib/pages/customPageSaveError';

/**
 * Which refused saves have to re-open ตั้งค่าหน้า.
 *
 * The slug input left the editor's main column this round, so a refusal about
 * the slug now names a field the author cannot see. `isSlugError` is what
 * decides whether the dialog opens — and if it were wrong in either direction
 * the failure would be silent: too narrow and the reason stays hidden behind a
 * closed dialog, too wide and a missing BODY yanks the author into a settings
 * panel that has nothing to do with it.
 *
 * Both directions are asserted against the REAL strings, copied from the guards
 * that produce them, not against paraphrases.
 */

// Every message that can refuse a save because of the slug.
const SLUG_REFUSALS = [
  // CustomPageForm.buildFormData — client side
  'กรุณาใส่ slug',
  'slug ต้องเป็น a-z, 0-9 และ - เท่านั้น',
  // lib/pages/slugGuard.js — server side
  'กรุณาระบุ slug',
  'slug นี้เป็นเส้นทางระบบ ใช้ไม่ได้',
  'Slug นี้ถูกใช้แล้ว',
  'Slug นี้ชนกับโปรโมชันใน MSDB — ใช้ไม่ได้',
  // lib/actions/customPages.js — firstZodMessage prefixes the failing PATH
  'slug: slug ต้องเป็น a-z, 0-9 และ - เท่านั้น',
];

// Every message that can refuse a save for some OTHER reason.
const OTHER_REFUSALS = [
  'กรุณาใส่ชื่อหน้าเพจ',
  'กรุณาใส่เนื้อหา',
  'Editor ยังไม่พร้อม',
  'บันทึกไม่สำเร็จ',
  'บันทึกฉบับร่างไม่สำเร็จ',
  'เผยแพร่ไม่สำเร็จ',
  'ไม่พบหน้าเพจ',
  'title: String must contain at most 200 character(s)',
  'body: กรุณาใส่เนื้อหา',
  'รูปแบบข้อมูลไม่ถูกต้อง',
];

test('every slug refusal is recognised', () => {
  for (const m of SLUG_REFUSALS) {
    assert.equal(isSlugError(m), true,
      `"${m}" refuses a save for the slug but would not open the dialog, so the `
      + 'reason stays behind a closed panel naming a field the author cannot see');
  }
});

test('no OTHER refusal is mistaken for one', () => {
  for (const m of OTHER_REFUSALS) {
    assert.equal(isSlugError(m), false,
      `"${m}" would yank the author into ตั้งค่าหน้า for a field that is not the problem`);
  }
});

test('CONTROL: the two lists are genuinely different, and neither is empty', () => {
  /**
   * Both assertions above are loops. A loop over an empty array passes, and two
   * lists that happened to overlap would make one of them vacuous.
   */
  assert.ok(SLUG_REFUSALS.length >= 7, 'the slug list shrank — a guard was reworded or lost');
  assert.ok(OTHER_REFUSALS.length >= 8, 'the non-slug list shrank');
  const overlap = SLUG_REFUSALS.filter((m) => OTHER_REFUSALS.includes(m));
  assert.deepEqual(overlap, [], 'a message is in both lists, so one loop asserts nothing');
});

test('empty, null and undefined are NOT slug errors', () => {
  // failSave is called with a fallback string, but a caller that passed nothing
  // must not open the dialog on a message the author never sees.
  for (const m of ['', null, undefined]) {
    assert.equal(isSlugError(m), false, `${JSON.stringify(m)} opened the dialog`);
  }
});

test('the capital S is not load-bearing — the guards disagree about it', () => {
  // slugGuard says 'Slug นี้ถูกใช้แล้ว'; the Zod path says 'slug: …'. A
  // case-sensitive rule would recognise one and miss the other.
  assert.equal(isSlugError('SLUG'), true);
  assert.equal(isSlugError('Slug'), true);
  assert.equal(isSlugError('slug'), true);
});
