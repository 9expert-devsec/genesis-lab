import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateFormula, shiftFormula } from '@/lib/play/engine';

/**
 * 9Expert Play formula engine — one table, every row a claim. The error rows
 * (#DIV/0!, #VALUE!, #NAME?, parse errors) are the control: a table whose
 * rows can only come out as numbers would stay green with a broken evaluator.
 */

const S = {
  A1: 'เมนู', B2: 60, B3: 50, B4: 65, B5: 'ยกเลิก', B7: 0.07,
  C2: 3, C3: 4, D2: 'เย็น', D3: 'ร้อน', E2: '5',
};

const VAL = (v) => ({ kind: 'value', v });
const SHIFT = (offset, v) => ({ kind: 'shift', offset, v });

const ROWS = [
  // literals, operators, precedence
  ['=1+2', S, VAL(3)],
  ['=10-4', S, VAL(6)],
  ['=6*7', S, VAL(42)],
  ['=9/4', S, VAL(2.25)],
  ['=2+3*4', S, VAL(14)],
  ['=(2+3)*4', S, VAL(20)],
  ['=10-2-3', S, VAL(5)],
  ['=-B2+100', S, VAL(40)],
  ['=-(1+2)*2', S, VAL(-6)],
  ['=1.5*2', S, VAL(3)],
  ['="ลาเต้"', S, VAL('ลาเต้')],
  ['="say ""hi"""', S, VAL('say "hi"')],
  // refs, case, empties, absolute refs
  ['=B2*C2', S, VAL(180)],
  ['=b2*c2', S, VAL(180)],
  ['=$B$2+B$3+$B3', S, VAL(160)],
  ['=B2*Z9', S, VAL(0)],
  ['=Z9', S, VAL(0)],
  ['=E2+1', S, VAL(6)],
  // comparisons on numbers and text
  ['=B2=60', S, VAL(true)],
  ['=B2<>60', S, VAL(false)],
  ['=B2<B3', S, VAL(false)],
  ['=B2>B3', S, VAL(true)],
  ['=B2<=60', S, VAL(true)],
  ['=B2>=61', S, VAL(false)],
  ['=D2="เย็น"', S, VAL(true)],
  ['=D3="เย็น"', S, VAL(false)],
  ['="a"<"b"', S, VAL(true)],
  ['=1+1>1', S, VAL(true)],
  // functions over ranges, refs, numbers, nested expressions
  ['=SUM(B2:B4)', S, VAL(175)],
  ['=sum(B2:B6)', S, VAL(175)],
  ['=SUM(B2,C2,1+1)', S, VAL(65)],
  ['=AVERAGE(B2:B6)', S, VAL(175 / 3)],
  ['=MIN(B2:B6)', S, VAL(50)],
  ['=MAX(B2:B6)', S, VAL(65)],
  ['=COUNT(B2:B6)', S, VAL(3)],
  ['=COUNT(A1:A9)', S, VAL(0)],
  ['=PRODUCT(B2:C2)', S, VAL(180)],
  ['=PRODUCT(B2,C2)', S, VAL(180)],
  ['=SUM(B2:B3)/COUNT(B2:B3)', S, VAL(55)],
  ['=MAX(Z1:Z5)', S, VAL(0)],
  ['=IF(B2>50,"แพง","ถูก")', S, VAL('แพง')],
  ['=IF(B3>50,"แพง","ถูก")', S, VAL('ถูก')],
  ['=IF(B3>50,"แพง")', S, VAL(false)],
  ['=IF(B2>=100,"A",IF(B2>=50,"B","C"))', S, VAL('B')],
  ['=C2+IF(D2="เย็น",10,0)', S, VAL(13)],
  ['=B2*$B$7', S, VAL(4.2)],
  // runtime errors are values
  ['=B2/0', S, VAL({ error: '#DIV/0!' })],
  ['=B2/Z9', S, VAL({ error: '#DIV/0!' })],
  ['=AVERAGE(Z1:Z3)', S, VAL({ error: '#DIV/0!' })],
  ['="a"+1', S, VAL({ error: '#VALUE!' })],
  ['=B5*2', S, VAL({ error: '#VALUE!' })],
  ['=SUM("a")', S, VAL({ error: '#VALUE!' })],
  ['=B2:B4', S, VAL({ error: '#VALUE!' })],
  ['=SUMPRODUCT(B2:B4)', S, VAL({ error: '#NAME?' })],
  ['=FOO+1', S, VAL({ error: '#NAME?' })],
  ['=1/0+FOO(1)', S, VAL({ error: '#DIV/0!' })],
  // parse errors carry a key, never a throw
  ['B2+C2', S, VAL({ error: '#ERROR!', key: 'missing_equals' })],
  ['=', S, VAL({ error: '#ERROR!', key: 'empty' })],
  ['=SUM(B2:B4', S, VAL({ error: '#ERROR!', key: 'unclosed_paren' })],
  ['=(1+2', S, VAL({ error: '#ERROR!', key: 'unclosed_paren' })],
  ['=1+2)', S, VAL({ error: '#ERROR!', key: 'unexpected_paren' })],
  ['=B2#C2', S, VAL({ error: '#ERROR!', key: 'unknown_token' })],
  ['="abc', S, VAL({ error: '#ERROR!', key: 'unclosed_string' })],
  ['=B2+', S, VAL({ error: '#ERROR!', key: 'unexpected_end' })],
  ['=IF(B2>1)', S, VAL({ error: '#ERROR!', key: 'bad_arg_count' })],
  ['=B2:5', S, VAL({ error: '#ERROR!', key: 'bad_range' })],
  // fill down
  ['=B2*C2', null, SHIFT(1, '=B3*C3')],
  ['=B2*$B$7', null, SHIFT(3, '=B5*$B$7')],
  ['=B2*B$7', null, SHIFT(2, '=B4*B$7')],
  ['=$B7+1', null, SHIFT(2, '=$B9+1')],
  ['=sum( b2:b6 )', null, SHIFT(1, '=sum( b3:b7 )')],
  ['=IF(B2="B2",B2,0)', null, SHIFT(1, '=IF(B3="B2",B3,0)')],
  ['=B2*C2', null, SHIFT(0, '=B2*C2')],
];

test('engine: every row of the formula table', () => {
  const failures = [];
  for (const [formula, sheet, want] of ROWS) {
    const got = want.kind === 'shift'
      ? shiftFormula(formula, want.offset)
      : evaluateFormula(formula, sheet, { anchor: 'H1' });
    const ok = typeof want.v === 'number' && typeof got === 'number'
      ? Math.abs(got - want.v) <= 1e-9
      : JSON.stringify(got) === JSON.stringify(want.v);
    if (!ok) failures.push(`${want.kind} ${formula}: got ${JSON.stringify(got)}, want ${JSON.stringify(want.v)}`);
  }
  assert.deepEqual(failures, []);
});
