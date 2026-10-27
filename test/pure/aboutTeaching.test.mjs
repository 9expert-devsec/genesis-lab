import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEACHING_STEPS, WORKSHOP_ITEMS } from '@/lib/about/teaching';

/**
 * /about-us "เราสอนอย่างไร" data. See src/lib/about/teaching.js.
 */

test('four teaching steps, each titled and described', () => {
  assert.equal(TEACHING_STEPS.length, 4);
  for (const s of TEACHING_STEPS) {
    assert.ok(s.title.trim(), 'step title');
    assert.ok(s.description.trim(), `${s.title} description`);
  }
});

test('three workshop items numbered 01–03, each labelled and described', () => {
  assert.deepEqual(WORKSHOP_ITEMS.map((w) => w.number), ['01', '02', '03']);
  for (const w of WORKSHOP_ITEMS) {
    assert.ok(w.label.trim(), `${w.number} label`);
    assert.ok(w.description.trim(), `${w.number} description`);
  }
});
