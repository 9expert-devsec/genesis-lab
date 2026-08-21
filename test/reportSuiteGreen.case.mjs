// The passing half of the pair driven by test/fs/runnerFlush.test.mjs — the
// control for "exit 0 on green", and the vehicle for the floor / undiscovered
// meta-control checks, which need a run that would otherwise be clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('deliberate pass; nothing here should redden a run', () => {
  assert.equal('same', 'same');
});
