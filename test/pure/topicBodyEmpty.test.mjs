import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTopicBodyEmpty } from '@/lib/courses/topicBodyEmpty';

/**
 * The one rule CourseOutline uses to decide whether a training-topic row can
 * open. Empty = no visible text after tags, `&nbsp;` and whitespace are gone.
 */

const NBSP = String.fromCharCode(160);
const ZWSP = String.fromCharCode(8203);

for (const [what, body] of [
  ['an empty array', []],
  ['an array of empty and blank strings', ['', '   ', NBSP, ZWSP]],
  ['null', null],
  ['undefined', undefined],
  ['an empty string', ''],
  ['whitespace only', ' \n\t  '],
  ['<ul></ul>', '<ul></ul>'],
  ['<p>&nbsp;</p>', '<p>&nbsp;</p>'],
  ['nested empty markup with numeric nbsp', '<ul><li><p>&#160;</p></li><li> </li></ul><br>'],
]) {
  test(`EMPTY: ${what}`, () => {
    assert.equal(isTopicBodyEmpty(body), true);
  });
}

for (const [what, body] of [
  ['one real bullet', ['การอ่าน email จาก outlook']],
  ['one real bullet among blanks', ['', ' ', 'x']],
  ['a list with one real item', '<ul><li>Power Query</li></ul>'],
  ['text beside an nbsp', '<p>&nbsp;a</p>'],
  ['a plain bullet that only looks like a tag (React prints it)', ['<mailmessage>']],
]) {
  test(`NOT EMPTY: ${what}`, () => {
    assert.equal(isTopicBodyEmpty(body), false);
  });
}
