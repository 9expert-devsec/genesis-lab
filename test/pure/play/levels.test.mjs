import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXCEL_BEGINNER_LEVELS, getLevel } from '@/lib/play/levels/excel/beginner';
import { EXCEL_INTERMEDIATE_LEVELS } from '@/lib/play/levels/excel/intermediate';
import { RETIRED_SHOP_SUMMARY_BOSS } from '@/lib/play/levels/excel/retired';
import { EXCEL_TIERS, getTier } from '@/lib/play/levels/excel/tiers';
import { checkTask, valuesEqual } from '@/lib/play/levels/check';
import { validateLevel } from '@/lib/play/levels/schema';

/**
 * Every Excel level, graded by the real checker: the model and each
 * alternative pass, each listed reject fails for its stated reason, and a
 * typed-in answer fails as no_cell_ref. Boss tasks run in order, each seeing
 * the cells the previous ones filled.
 *
 * The expected values in the level files were computed in advance from the
 * approved level document. A disagreement here is a finding about the engine
 * or the data — report it, do not edit the expected value to match.
 */

const literal = (v) => (typeof v === 'string' ? `="${v}"` : `=${v}`);
const toFilled = (result) => Object.fromEntries(result.cells.map((c) => [c.ref, c.value]));
const show = (r) => JSON.stringify({ reason: r.reason, cells: r.cells.map((c) => [c.ref, c.value]) });

test('the index holds 16 levels in play order with unique ids', () => {
  assert.deepEqual(
    EXCEL_BEGINNER_LEVELS.map((l) => l.id),
    ['1-1', '1-2', '1-3', '1-4', '1-5', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3', '3-4', '3-5', 'boss'],
  );
});

const GRADED = [...EXCEL_BEGINNER_LEVELS, ...EXCEL_INTERMEDIATE_LEVELS, RETIRED_SHOP_SUMMARY_BOSS];

for (const level of GRADED) {
  test(`level ${level.series}/${level.id} ${level.title}: valid, model + alternatives pass, rejects and typed answers fail`, () => {
    assert.deepEqual(validateLevel(level), []);
    let filled = {};
    for (const task of level.tasks) {
      const at = `${level.id}/${task.id}`;
      const model = checkTask(level, task.id, task.model, filled);
      assert.equal(model.pass, true, `${at} model ${task.model}: ${show(model)}`);

      for (const alt of task.alternatives) {
        const r = checkTask(level, task.id, alt, filled);
        assert.equal(r.pass, true, `${at} alternative ${alt}: ${show(r)}`);
      }
      for (const { formula, reason } of task.rejects) {
        const r = checkTask(level, task.id, formula, filled);
        assert.equal(r.pass, false, `${at} reject ${formula} passed`);
        assert.equal(r.reason, reason, `${at} reject ${formula}: ${show(r)}`);
      }
      const typed = checkTask(level, task.id, literal(task.expected[0]), filled);
      assert.equal(typed.pass, false, `${at} typed answer passed`);
      assert.equal(typed.reason, 'no_cell_ref', `${at} typed answer: ${show(typed)}`);

      filled = { ...filled, ...toFilled(model) };
    }
  });
}

/** Each row of the brief: exact cell values for the main and every "must also pass" formula. */
const BRIEF = [
  ['3-1', ['=LEFT(A2,3)', '=MID(A2,1,3)'], ['LAT', 'AME', 'MOC', 'MAT', 'COC']],
  ['3-2', ['=RIGHT(A2,3)', '=MID(A2,7,3)'], ['001', '002', '003', '004', '005']],
  ['3-3', ['=MID(A2,5,1)', '=LEFT(RIGHT(A2,5),1)'], ['M', 'L', 'S', 'M', 'L']],
  ['3-4', ['=LEN(B2)'], [10, 9, 10, 8, 10]],
  ['3-5', ['=UPPER(A2)'], ['LAT-M-001', 'AME-L-002', 'MOC-S-003', 'MAT-M-004', 'COC-L-005']],
];

for (const [id, formulas, want] of BRIEF) {
  test(`${id}: ${formulas.join(' and ')} fill C2:C6 with the exact answers`, () => {
    const level = getLevel(id);
    assert.deepEqual(level.tasks[0].expected, want);
    for (const f of formulas) {
      const r = checkTask(level, 't1', f);
      assert.equal(r.pass, true, show(r));
      assert.deepEqual(r.cells.map((c) => c.ref), ['C2', 'C3', 'C4', 'C5', 'C6']);
      assert.deepEqual(r.cells.map((c) => c.value), want);
    }
  });
}

test('boss: the three steps in order, main and alternative, each sees the cells before it', () => {
  const level = getLevel('boss');
  const steps = [
    ['t1', ['=LEFT(A2,3)', '=MID(A2,1,3)'], ['LAT', 'MOC', 'AME', 'LAT', 'MAT']],
    ['t2', ['=SUM(B2:B6)', '=B2+B3+B4+B5+B6'], [315]],
    ['t3', ['=AVERAGE(B2:B6)', '=B7/COUNT(B2:B6)'], [63]],
  ];
  let filled = {};
  for (const [id, formulas, want] of steps) {
    for (const f of formulas) {
      const r = checkTask(level, id, f, filled);
      assert.equal(r.pass, true, `${f}: ${show(r)}`);
      assert.deepEqual(r.cells.map((c) => c.value), want);
    }
    filled = { ...filled, ...toFilled(checkTask(level, id, formulas[0], filled)) };
  }
  assert.deepEqual(level.tasks.map((t) => t.anchor), ['C2', 'B7', 'C7']);
  assert.equal(level.tasks[1].fill, undefined);
});

test('text answers: "001" is not 1, and numeric-looking sheet cells stay text', () => {
  assert.equal(valuesEqual('001', '001'), true);
  assert.equal(valuesEqual(1, '001'), false);
  assert.equal(valuesEqual('1', '001'), false);
  assert.equal(valuesEqual('10', 10), false);
  const serial = checkTask(getLevel('3-2'), 't1', '=RIGHT(A2,3)+0');
  assert.equal(serial.pass, false);
  assert.equal(serial.reason, 'mismatch', 'a number made from the serial must not pass as the text answer');
  assert.equal(typeof getLevel('3-4').sheet.B2, 'string');
  assert.equal(getLevel('3-4').sheet.B5, '02123456');
});

test('anti-cheat: a literal answer is refused on the text levels, as a typed number is', () => {
  for (const [id, typed] of [['3-1', 'MOC'], ['3-1', 'LAT'], ['3-2', '001']]) {
    const r = checkTask(getLevel(id), 't1', typed);
    assert.equal(r.pass, false, typed);
    assert.equal(r.reason, 'error', `${typed} is not a formula`);
  }
  for (const [id, typed] of [['3-1', '="MOC"'], ['3-1', '="LAT"'], ['3-2', '=001'], ['3-2', '="001"'], ['3-4', '=10'], ['3-1', '=LEFT("LAT-M-001",3)']]) {
    const r = checkTask(getLevel(id), 't1', typed);
    assert.equal(r.pass, false, typed);
    assert.equal(r.reason, 'no_cell_ref', `${typed}: ${show(r)}`);
  }
});

test('tiers: Beginner CH.3 is text, the IF levels moved whole, coming-soon chapters have no levels', () => {
  assert.deepEqual(EXCEL_TIERS.map((t) => t.series), ['beginner', 'intermediate', 'advanced']);
  assert.deepEqual(EXCEL_INTERMEDIATE_LEVELS.map((l) => l.id), ['1-1', '1-2', '1-3', '1-4', '1-5']);
  assert.ok(EXCEL_INTERMEDIATE_LEVELS.every((l) => l.series === 'intermediate' && l.chapter === 1));
  assert.ok(EXCEL_INTERMEDIATE_LEVELS.every((l) => l.tasks[0].mustUse.includes('IF')));
  assert.deepEqual(EXCEL_INTERMEDIATE_LEVELS.map((l) => l.scene.kind), ['stock', 'receipts', 'discount', 'iced', 'tiers']);
  for (const tier of EXCEL_TIERS) {
    assert.deepEqual(Object.keys(tier.chapters), ['1', '2', '3', '4'], tier.series);
    for (const [c, chapter] of Object.entries(tier.chapters)) {
      const built = tier.levels.some((l) => l.chapter === Number(c));
      assert.equal(built, !chapter.comingSoon, `${tier.series} CH.${c}`);
    }
  }
  assert.equal(getTier('beginner').chapters[3].name, 'จัดข้อความให้เป๊ะ');
  assert.equal(getTier('intermediate').chapters[1].name, 'ตัดสินใจด้วย IF');
  assert.equal(getTier('advanced').levels.length, 0);
});

test('the old shop-summary boss is defined but no tier lists it', () => {
  assert.equal(RETIRED_SHOP_SUMMARY_BOSS.title, 'สรุปยอดร้านมืออาชีพ');
  assert.ok(!EXCEL_TIERS.flatMap((t) => t.levels).includes(RETIRED_SHOP_SUMMARY_BOSS));
  assert.deepEqual(getLevel('boss').tasks.map((t) => t.model), ['=LEFT(A2,3)', '=SUM(B2:B6)', '=AVERAGE(B2:B6)']);
});

test('2-5: =B2*B7 fails as mismatch — filled down, row 3 reads the empty B8', () => {
  const r = checkTask(getLevel('2-5'), 't1', '=B2*B7');
  assert.equal(r.pass, false);
  assert.equal(r.reason, 'mismatch');
  assert.equal(r.cells[0].ok, true);
  assert.deepEqual(r.cells.slice(1).map((c) => c.value), [0, 0, 0]);
});

test('2-1: =B2+B3+B4+B5+B6 gets the right total but fails as must_use', () => {
  const r = checkTask(getLevel('2-1'), 't1', '=B2+B3+B4+B5+B6');
  assert.equal(r.pass, false);
  assert.equal(r.reason, 'must_use');
  assert.equal(r.cells[0].value, 4890);
});
