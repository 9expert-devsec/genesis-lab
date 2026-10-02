import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleView, scheduleViewQuery } from '@/lib/schedule/scheduleView';

/**
 * /schedule's `?view=`: `list` is the legacy /register-public layout; anything
 * else is the table, which stays the default. Choosing a view keeps every other
 * parameter, and choosing the default removes the key (one canonical URL).
 */

for (const [what, value] of [
  ['absent', null],
  ['undefined', undefined],
  ['empty', ''],
  ['table', 'table'],
  ['garbage', 'grid'],
  ['wrong case', 'LIST'],
  ['padded', ' list'],
]) {
  test(`parse: ${what} → table`, () => {
    assert.equal(parseScheduleView(value), 'table');
  });
}

test('parse: list → list', () => {
  assert.equal(parseScheduleView('list'), 'list');
});

test('choosing list keeps every other parameter, in order', () => {
  assert.equal(
    scheduleViewQuery('utm_source=line&program=Excel&x=1', 'list'),
    'utm_source=line&program=Excel&x=1&view=list',
  );
});

test('choosing table removes the key and keeps the rest', () => {
  assert.equal(scheduleViewQuery('utm_source=line&view=list&x=1', 'table'), 'utm_source=line&x=1');
});

test('choosing table with nothing else leaves an empty query (the bare /schedule)', () => {
  assert.equal(scheduleViewQuery('view=list', 'table'), '');
});

test('choosing an unknown view is choosing the default', () => {
  assert.equal(scheduleViewQuery('a=1&view=list', 'cards'), 'a=1');
});

test('accepts a URLSearchParams as well as a string', () => {
  assert.equal(scheduleViewQuery(new URLSearchParams('a=1'), 'list'), 'a=1&view=list');
});
