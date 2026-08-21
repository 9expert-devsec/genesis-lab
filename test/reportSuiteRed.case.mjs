// A deliberately-FAILING case for test/fs/runnerFlush.test.mjs. Not a
// *.test.mjs, so the runner's discovery meta-control never sees it and the
// manifest never enumerates it; the only thing that runs it is
// test/reportSuiteChild.mjs, spawned by that control.
//
// THE TOKEN LIVES ONLY IN THE ASSERTION VALUES — never in the test NAME, and
// that is the whole design of this fixture. The bug being guarded printed the
// "✖ <name>" line and nothing after it. If the name carried the token, the
// control's "the token reached stdout" assertion would pass in exactly the
// broken state it exists to catch. A sibling control asserts the ✖ line for
// this test is clean, which is what makes the token's presence attributable to
// the flushed detail and nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('deliberate failure; its detail carries the flush token', () => {
  assert.equal('flush-detail-actual', 'RUNNER_FLUSH_DETAIL_9E');
});
