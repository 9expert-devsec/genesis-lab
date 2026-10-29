import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MILESTONES } from '@/lib/about/milestones';

/**
 * /about-us timeline data. See src/lib/about/milestones.js.
 */

test('six milestones, 2005 → 2026, years strictly ascending', () => {
  assert.equal(MILESTONES.length, 6);
  assert.deepEqual(MILESTONES.map((m) => m.year), [2005, 2020, 2022, 2023, 2025, 2026]);
  for (let i = 1; i < MILESTONES.length; i += 1) {
    assert.ok(MILESTONES[i].year > MILESTONES[i - 1].year, `${MILESTONES[i].year} after ${MILESTONES[i - 1].year}`);
  }
});

test('every milestone has a title and a description', () => {
  for (const m of MILESTONES) {
    assert.ok(m.title.trim(), `${m.year} title`);
    assert.ok(m.description.trim(), `${m.year} description`);
  }
});
