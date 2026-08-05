import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBulletGlyphs } from '@/lib/chat/messageText';

// The bullet glyph substitution.
//
// THE POINT OF THIS FILE IS THE BOUNDARY, not the happy path. One character at
// the start of a line is all this is allowed to do, and every test below either
// pins that it does that, or pins something it must leave alone. If a future
// change makes any of the "untouched" cases start changing, the function has
// stopped being a glyph swap and become a parser — which is a different
// decision with a different risk profile. See the header of
// src/lib/chat/messageText.js.

// The real shape, taken from a captured upstream reply rather than invented:
// `*` + three spaces at line start, nested items indented four more.
const REAL = [
  'ทาง 9Expert Training มีหลักสูตรทั้งหมด 3 หลักสูตร ดังนี้ครับ',
  '',
  '*   Generative AI for Business Transformation (GEN-AI-L1)',
  '    *   หลักสูตรนี้เหมาะสำหรับผู้บริหาร นักการตลาด',
  '*   AI Content Creator for Business (CC-AI)',
  '',
  'หากคุณต้องการสอบถามรายละเอียดเพิ่มเติม สามารถแจ้งได้เลยนะครับ',
].join('\n');

test('a leading bullet marker becomes a glyph, at every indent level', () => {
  const out = toBulletGlyphs(REAL).split('\n');
  assert.equal(out[2], '•   Generative AI for Business Transformation (GEN-AI-L1)');
  assert.equal(
    out[3],
    '    •   หลักสูตรนี้เหมาะสำหรับผู้บริหาร นักการตลาด',
    'the indent is preserved — it is the ONLY thing marking the nested level',
  );
  assert.equal(out[4], '•   AI Content Creator for Business (CC-AI)');
});

test('everything that is not a leading bullet is returned untouched', () => {
  const out = toBulletGlyphs(REAL).split('\n');
  assert.equal(out[0], 'ทาง 9Expert Training มีหลักสูตรทั้งหมด 3 หลักสูตร ดังนี้ครับ', 'prose');
  assert.equal(out[1], '', 'blank lines survive — they are the paragraph breaks');
  assert.equal(out[6], 'หากคุณต้องการสอบถามรายละเอียดเพิ่มเติม สามารถแจ้งได้เลยนะครับ');
  assert.equal(toBulletGlyphs(REAL).split('\n').length, 7, 'no line is added or lost');
});

test('CONTROL: a mid-line asterisk is left alone', () => {
  // The case a naive global replace destroys. Arithmetic, footnote markers and
  // shell globs all put an asterisk mid-line, and none of them is a bullet.
  for (const s of ['2 * 3 = 6', 'ราคา 14,900 * รวม VAT', 'run rm *.log', 'a*b*c']) {
    assert.equal(toBulletGlyphs(s), s, `must not touch: ${s}`);
  }
  // …and prove the naive version really would have, so this is a live control.
  assert.notEqual('2 * 3 = 6'.replaceAll('*', '•'), '2 * 3 = 6');
});

test('CONTROL: emphasis markers are not bullets and stay as they are', () => {
  // `*bold*` and `**bold**` at line start look like bullets to a careless
  // matcher. The whitespace lookahead is what tells them apart, and without it
  // this function would turn emphasis into `•bold*` — worse than doing nothing.
  for (const s of ['**bold**', '*emphasis*', '**สำคัญ** ครับ', '*x']) {
    assert.equal(toBulletGlyphs(s), s, `must not touch: ${s}`);
  }
  // The distinguishing feature, stated as an assertion: a bullet has whitespace
  // after the marker, emphasis does not.
  assert.equal(toBulletGlyphs('* item'), '• item');
  assert.equal(toBulletGlyphs('*item'), '*item');
});

test('it does exactly ONE substitution and nothing a renderer would do', () => {
  // The boundary, as a test rather than only as a comment. If any of these
  // starts changing, this stopped being a glyph swap.
  const notMine = [
    '# heading',
    '1. ordered item',
    '- dash bullet',
    '[link](https://example.com)',
    '> quote',
    '`code`',
    '<b>html</b>',
  ];
  for (const s of notMine) assert.equal(toBulletGlyphs(s), s, `not this function's job: ${s}`);
  // …and the output is still a plain string, never markup.
  assert.equal(typeof toBulletGlyphs(REAL), 'string');
  assert.ok(!toBulletGlyphs('*   x').includes('<'), 'no tags are ever produced');
});

test('degenerate input does not throw', () => {
  assert.equal(toBulletGlyphs(undefined), '');
  assert.equal(toBulletGlyphs(null), '');
  assert.equal(toBulletGlyphs(''), '');
});
