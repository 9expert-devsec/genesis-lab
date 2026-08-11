import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgramSelector } from '@/app/_components/home/ProgramSelector';

/**
 * "Nothing here yet" and "could not load" are different sentences.
 *
 * They used to be one string, shown whenever the list was empty — so a
 * correctly-empty tab accused the site of being broken, and a genuinely broken
 * one was indistinguishable from a quiet day. That is precisely why the
 * Programs tab going empty for hours read as "flaky site" rather than "the
 * snapshot lost 17 programs".
 *
 * Both branches are reachable and neither is invented: `snapshotAvailable` is
 * false exactly when getLandingData could not serve a snapshot — the cache doc
 * is missing, its schemaVersion is stale, or the read threw.
 */

const NOTHING_YET = 'ยังไม่มีรายการในขณะนี้';
const CANNOT_LOAD = 'ไม่สามารถโหลดรายการได้ในขณะนี้';

const render = (props) =>
  renderToStaticMarkup(createElement(ProgramSelector, { programs: [], skills: [], ...props }));

test('an empty list with a snapshot says there is nothing yet', () => {
  const html = render({ snapshotAvailable: true });
  assert.match(html, new RegExp(NOTHING_YET));
  assert.doesNotMatch(html, new RegExp(CANNOT_LOAD), 'an empty tab still blames the loader');
});

test('no snapshot at all says it could not load', () => {
  const html = render({ snapshotAvailable: false });
  assert.match(html, new RegExp(CANNOT_LOAD));
  assert.doesNotMatch(html, new RegExp(NOTHING_YET));
});

test('the two strings are actually different', () => {
  // Guards the whole point: splitting the branch is worthless if both arms
  // render the same sentence.
  assert.notEqual(NOTHING_YET, CANNOT_LOAD);
});

test('CONTROL: a POPULATED list shows neither message', () => {
  // Without this, a component that always rendered the empty state would pass
  // both assertions above.
  const html = render({
    snapshotAvailable: true,
    programs: [{ _id: 'p1', program_id: 'DEV', program_name: '.NET' }],
  });
  assert.doesNotMatch(html, new RegExp(NOTHING_YET));
  assert.doesNotMatch(html, new RegExp(CANNOT_LOAD));
  assert.match(html, /\.NET/, 'the program did not render');
});

test('CONTROL: the default is "nothing yet", never "could not load"', () => {
  // A caller that forgets the prop must not accuse the site of being broken.
  assert.match(render({}), new RegExp(NOTHING_YET));
});
