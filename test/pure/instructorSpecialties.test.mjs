import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SPECIALTIES,
  MAX_SPECIALTY_LENGTH,
  normalizeSpecialties,
  specialtiesLine,
} from '@/lib/instructors/instructorSpecialties';

/**
 * Instructor specialties ("ความเชี่ยวชาญ"). See
 * src/lib/instructors/instructorSpecialties.js.
 */

test('trims, collapses spaces, drops empties and de-duplicates case-insensitively', () => {
  assert.deepEqual(
    normalizeSpecialties(['  Power BI ', 'Excel', '', '   ', 'power bi', 'Data   Analytics']),
    { ok: true, specialties: ['Power BI', 'Excel', 'Data Analytics'] },
  );
  assert.deepEqual(normalizeSpecialties(undefined), { ok: true, specialties: [] });
});

test(`more than ${MAX_SPECIALTIES} items or an item over ${MAX_SPECIALTY_LENGTH} characters is rejected`, () => {
  const many = Array.from({ length: MAX_SPECIALTIES + 1 }, (_, i) => `skill ${i}`);
  assert.equal(normalizeSpecialties(many).ok, false);
  assert.equal(normalizeSpecialties(many.slice(0, MAX_SPECIALTIES)).ok, true);
  // duplicates do not count toward the limit
  assert.equal(normalizeSpecialties([...many.slice(0, MAX_SPECIALTIES), 'SKILL 0']).ok, true);

  const long = 'ก'.repeat(MAX_SPECIALTY_LENGTH + 1);
  const r = normalizeSpecialties(['Excel', long]);
  assert.equal(r.ok, false);
  assert.match(r.error, /60/);
  assert.equal(normalizeSpecialties(['ก'.repeat(MAX_SPECIALTY_LENGTH)]).ok, true);
});

test('the card line joins with " | "', () => {
  assert.equal(specialtiesLine(['Power BI', 'Excel', 'Power Automate']), 'Power BI | Excel | Power Automate');
  assert.equal(specialtiesLine([]), '');
  assert.equal(specialtiesLine(null), '');
});
