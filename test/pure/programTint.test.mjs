import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgramHex, programTint } from '@/lib/programTint';

/**
 * lib/programTint — the program colour for the program page's copy sections.
 * Valid hex → rgba() at the asked alpha; anything else → null, never a throw.
 */

test('6-digit hex, with and without #, any case, padded', () => {
  assert.equal(programTint('#F2C811', 0.08), 'rgba(242, 200, 17, 0.08)');
  assert.equal(programTint('f2c811', 0.08), 'rgba(242, 200, 17, 0.08)');
  assert.equal(programTint('  #1d6f42 ', 1), 'rgba(29, 111, 66, 1)');
});

test('3-digit hex expands each digit', () => {
  assert.equal(programTint('#0af', 0.1), 'rgba(0, 170, 255, 0.1)');
  assert.equal(programTint('FFF', 0.5), 'rgba(255, 255, 255, 0.5)');
  assert.deepEqual(parseProgramHex('#abc'), { r: 0xaa, g: 0xbb, b: 0xcc });
});

test('alpha defaults to 1 and is clamped', () => {
  assert.equal(programTint('#000'), 'rgba(0, 0, 0, 1)');
  assert.equal(programTint('#000', 2), 'rgba(0, 0, 0, 1)');
  assert.equal(programTint('#000', -1), 'rgba(0, 0, 0, 0)');
  assert.equal(programTint('#000', NaN), 'rgba(0, 0, 0, 1)');
});

test('invalid, empty or null input → null, never throws', () => {
  for (const bad of [null, undefined, '', '   ', '#', '#12', '#1234', '#12345', '#1234567', '#GGGGGG',
    'red', 'rgb(1,2,3)', '##fff', 123, {}, []]) {
    assert.equal(programTint(bad, 0.1), null, JSON.stringify(bad));
    assert.equal(parseProgramHex(bad), null, JSON.stringify(bad));
  }
});
