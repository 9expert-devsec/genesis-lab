import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource } from '../sourceScan.mjs';

/**
 * ONE source for the course name in the mega menu.
 *
 * test/pure/navCoursePreview.test.mjs pins the composition: given a row and a
 * cover that disagree, the row wins. That holds no matter what the action
 * returns — which is the point of putting the ruling in a pure function.
 *
 * This file pins the other half, the half a pure test structurally cannot see:
 * that the second name is not PRODUCED, and that the caller still routes the
 * hovered row through the composition instead of setting the response straight
 * into state. Both are one edit away from undoing the fix while every pure
 * assertion above stays green — `setCol4Preview(cover)` type-checks, renders,
 * and puts the detail endpoint's name back on the card.
 *
 * Read from `code` (imports stripped) throughout: every assertion here is about
 * what the file DOES, and an import line satisfying a "does not mention X"
 * check is defect 5 in sourceScan's own header.
 */

const ACTION = 'src/lib/actions/nav-course-preview.js';
const CLIENT = 'src/components/layout/PublicHeaderClient.jsx';

/** The body of one top-level `export async function <name>` in a scrubbed source. */
function functionBody(code, name) {
  const start = code.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const open = code.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  assert.fail(`unbalanced braces reading ${name}`);
}

test('getCoursePreview does not return a course_name', () => {
  const body = functionBody(readSource(ACTION).code, 'getCoursePreview');

  assert.ok(
    !/course_name/.test(body),
    'getCoursePreview mentions course_name. The cover lookup exists for the ' +
      'cover; a name on its response is the second source that made the menu ' +
      'show two names for one course. The Col 3 row already has the name.'
  );
});

test('getCoursePreview still fetches the detail — the cover genuinely needs it', () => {
  // The lazy way to make the assertion above pass is to delete the call. That
  // would take the cover with it and turn a wrong name into a missing image,
  // which is not the trade this change makes.
  const body = functionBody(readSource(ACTION).code, 'getCoursePreview');
  assert.match(body, /getCourseByCode\(/, 'the detail fetch must stay');
  assert.match(body, /course_cover_url/, 'and it must still yield the cover URL');
});

test('the two LIST readers keep their names — they are the surviving source', () => {
  // Symmetric risk. "One source for the name" gets misread as "no names in this
  // module", and stripping the list mappings would empty Col 3 itself.
  const src = readSource(ACTION).code;
  for (const fn of ['getCoursesByProgram', 'getCoursesBySkill']) {
    assert.match(
      functionBody(src, fn),
      /course_name:\s*c\.course_name/,
      `${fn} must keep mapping the list's course_name — Col 3 renders it, and ` +
        'it is now the ONLY name the card can show'
    );
  }
});

test('the hover handler routes the row through the composition', () => {
  const code = readSource(CLIENT).code;
  const body = code.slice(code.indexOf('async function handleCourseHover('));
  const handler = body.slice(0, body.indexOf('\n  }') + 4);

  assert.match(
    handler,
    /handleCourseHover\(course\)/,
    'handleCourseHover must take the whole row; an id alone cannot carry the name'
  );

  // Both branches — cache hit and fresh fetch — must compose. The cache-hit
  // branch is the one that looks safe to shortcut, and shortcutting it is how a
  // second hover would serve whatever the first one stored.
  assert.equal(
    (handler.match(/composeCoursePreview\(course,/g) ?? []).length,
    2,
    'both the cache-hit and the fetch branch must build the preview through ' +
      'composeCoursePreview(course, …)'
  );
  assert.ok(
    !/setCol4Preview\(\s*(cover|result)\s*\)/.test(handler),
    'the lookup result must never be set into state directly — that is exactly ' +
      'the line that put the detail endpoint\'s name back on the card'
  );
});

test('the Col 3 row is what gets handed to the handler', () => {
  const code = readSource(CLIENT).code;
  assert.match(
    code,
    /onMouseEnter=\{\(\)\s*=>\s*handleCourseHover\(course\)\}/,
    'the list row passes itself, not course.course_id'
  );
});
