import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

import {
  PHOTO_SCALE,
  PHOTO_OFFSET_Y,
  PHOTO_OFFSET_X,
  parsePhotoCrop,
  photoCropValues,
  photoCropStyle,
} from '@/lib/instructors/photoCrop';

/**
 * AB-2f: the per-instructor card photo crop — server-side validation, the
 * defaults an unadjusted instructor renders with, and the box style. The two
 * fields are genesis-only and must never ride the MSDB payload.
 *
 * Inputs are what the admin form really submits: FormData strings from the
 * two range inputs, or '' for an emptied field.
 */

test('the defaults are AB-2e\'s uniform crop', () => {
  assert.equal(PHOTO_SCALE.default, 225);
  assert.equal(PHOTO_OFFSET_Y.default, 2);
  assert.deepEqual(photoCropStyle(photoCropValues()), { top: '2%', height: '225%', width: '130%' });
});

test('in-range numbers are accepted at both ends, and decimals pass', () => {
  for (const [s, o] of [['120', '-20'], ['320', '30'], ['225', '2'], ['248', '6.5']]) {
    const r = parsePhotoCrop({ photo_scale: s, photo_offset_y: o });
    assert.equal(r.ok, true, `${s}/${o}`);
    assert.deepEqual(r.value, { photo_scale: Number(s), photo_offset_y: Number(o), photo_offset_x: null });
  }
});

test('out of range is refused, naming the field', () => {
  assert.equal(parsePhotoCrop({ photo_scale: '119' }).field, 'photo_scale');
  assert.equal(parsePhotoCrop({ photo_scale: '321' }).field, 'photo_scale');
  assert.equal(parsePhotoCrop({ photo_offset_y: '-21' }).field, 'photo_offset_y');
  assert.equal(parsePhotoCrop({ photo_offset_y: '31' }).field, 'photo_offset_y');
  assert.match(parsePhotoCrop({ photo_scale: '400' }).error, /120 ถึง 320/);
});

test('numbers only — units, words and blanks-with-junk are refused', () => {
  for (const bad of ['225%', 'abc', '2e2', '0x10', '1,5', '--3']) {
    assert.equal(parsePhotoCrop({ photo_scale: bad }).ok, false, bad);
  }
});

test('empty → null (the default), and a card with null renders the default', () => {
  for (const empty of ['', '   ', null, undefined]) {
    const r = parsePhotoCrop({ photo_scale: empty, photo_offset_y: empty, photo_offset_x: empty });
    assert.deepEqual(r, { ok: true, value: { photo_scale: null, photo_offset_y: null, photo_offset_x: null } });
  }
  assert.deepEqual(photoCropValues({ photo_scale: null, photo_offset_y: null }), { scale: 225, offsetY: 2, offsetX: 0 });
  assert.deepEqual(photoCropValues({ photo_scale: 260, photo_offset_y: -4, photo_offset_x: 3.5 }),
    { scale: 260, offsetY: -4, offsetX: 3.5 });
  assert.deepEqual(photoCropValues({ photo_scale: 999, photo_offset_y: 'x', photo_offset_x: 31 }),
    { scale: 225, offsetY: 2, offsetX: 0 },
    'a stored value outside the range never reaches the card');
});

test('the box widens with the zoom, so object-contain keeps fitting the height', () => {
  assert.deepEqual(photoCropStyle({ scale: 180, offsetY: 6 }), { top: '6%', height: '180%', width: '104%' });
  assert.deepEqual(photoCropStyle({ scale: 270, offsetY: -3 }), { top: '-3%', height: '270%', width: '156%' });
});

test('the crop is saved locally and never sent to MSDB', () => {
  const src = readSource('src/lib/actions/instructors.js').code;
  const msdb = src.slice(src.indexOf('const msdb = {'), src.indexOf('};', src.indexOf('const msdb = {')));
  const local = src.slice(src.indexOf('const local = {'), src.indexOf('};', src.indexOf('const local = {')));
  assert.ok(msdb.length > 20 && local.length > 20, 'CONTROL: both payloads were found');
  assert.doesNotMatch(msdb, /photo_scale|photo_offset_y|photo_offset_x/);
  assert.match(local, /photo_scale,\s*photo_offset_y,\s*photo_offset_x,/);
});

// ── AB-2h: horizontal offset ───────────────────────────────────────────────

test('photo_offset_x: −30..30, numbers only, empty → 0', () => {
  for (const ok of ['-30', '30', '0', '-4.5', '3.5']) {
    assert.equal(parsePhotoCrop({ photo_offset_x: ok }).value.photo_offset_x, Number(ok), ok);
  }
  for (const bad of ['-31', '31', '4%', 'left', '1e1']) {
    assert.equal(parsePhotoCrop({ photo_offset_x: bad }).field, 'photo_offset_x', bad);
  }
  assert.match(parsePhotoCrop({ photo_offset_x: '40' }).error, /-30 ถึง 30/);
  assert.equal(PHOTO_OFFSET_X.default, 0);
  assert.equal(photoCropValues({}).offsetX, 0, 'empty → 0');
});

test('the offset moves the box centre; zero adds nothing, so old cards are unchanged', () => {
  assert.deepEqual(photoCropStyle({ scale: 225, offsetY: 2, offsetX: 0 }), { top: '2%', height: '225%', width: '130%' });
  assert.equal(photoCropStyle({ scale: 225, offsetY: 2, offsetX: -4 }).left, '46%');
  assert.equal(photoCropStyle({ scale: 225, offsetY: 2, offsetX: 3.5 }).left, '53.5%');
});
