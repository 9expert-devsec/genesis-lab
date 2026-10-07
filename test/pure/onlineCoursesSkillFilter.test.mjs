import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOnlineCourses } from '@/lib/api/online-courses';

/**
 * `getOnlineCourses({ skill })` — the skill page's filter reaches the request,
 * through the same `deps` seam onlineCoursesProgramFilter uses (no global
 * fetch swap: the suite shares one process).
 */

function spy() {
  const calls = [];
  const fetchUpstream = async (path, options) => {
    calls.push({ path, options });
    return { ok: true, total: 0, items: [] };
  };
  return { calls, deps: { fetchUpstream } };
}

test('the skill argument is forwarded as the `skill` request param', async () => {
  const { calls, deps } = spy();
  await getOnlineCourses({ skill: 'AI' }, deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/online-course');
  assert.equal(calls[0].options.params.skill, 'AI');
  assert.equal(calls[0].options.params.program, undefined, 'a skill call names no program');
});

test('CONTROL: a program call names no skill, and an unfiltered call names neither', async () => {
  const p = spy(); await getOnlineCourses({ program: 'MSE' }, p.deps);
  assert.equal(p.calls[0].options.params.skill, undefined);
  const u = spy(); await getOnlineCourses(undefined, u.deps);
  assert.equal(u.calls[0].options.params.skill, undefined);
  assert.equal(u.calls[0].options.params.program, undefined);
});

test('a skill call carries the same tag and no bespoke revalidate — same cache story as program', async () => {
  const { calls, deps } = spy();
  await getOnlineCourses({ skill: 'BUSINESS' }, deps);
  assert.deepEqual(calls[0].options.tags, ['online-courses']);
  assert.equal(calls[0].options.revalidate, undefined);
});
