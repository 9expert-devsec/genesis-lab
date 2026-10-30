import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MasterclassInstructors,
  FLOAT_ZOOM,
  floatCropStyle,
} from '@/app/(public)/masterclass/[slug]/_components/MasterclassInstructors';
import { photoCropStyle, photoCropValues } from '@/lib/instructors/photoCrop';
import { orderByIds } from '@/lib/masterclass/orderByIds';
import { readSource } from '../sourceScan.mjs';

/**
 * MC-1b — the Masterclass instructor photo is the original FLOATING cut-out
 * (no panel, overlapping the card top, fading out at the bottom), with the
 * image box placed by each instructor's stored crop so heads land at one size
 * and height. Instructors come back in the admin's `instructor_ids` order (MC-1).
 */

const A = {
  _id: 'a', name: 'อ.ชไลเวท', title: 'CEO', image_url: 'https://res.cloudinary.com/x/a.png',
  photo_scale: 175, photo_offset_y: -0.5, photo_offset_x: -6, bio: 'สอน AI\nสอน Data',
};
const B = {
  _id: 'b', name: 'อ.โทวิทูร', title: 'Canvassador', image_url: 'https://res.cloudinary.com/x/b.png',
  photo_scale: 237, photo_offset_y: -1, photo_offset_x: -2.5,
};
const NO_PHOTO = { _id: 'c', name: 'อ.ไม่มีรูป', title: 'Trainer', image_url: '', specialties: ['Excel'] };

const render = (instructors) => renderToStaticMarkup(createElement(MasterclassInstructors, { instructors }));
const styleAttr = (style) => Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';');
const photoStyles = (html) => [...html.matchAll(/data-mc-photo=""[^>]*style="([^"]*)"/g)].map((m) => m[1]);
const stages = (html) => [...html.matchAll(/<div data-mc-stage="" class="([^"]*)"/g)].map((m) => m[1]);

test('no About panel here: no about-instructor class, no watermark, no panel', () => {
  const html = render([A, B]);
  assert.doesNotMatch(html, /about-instructor/, 'an About card/panel class leaked into the Masterclass section');
  assert.doesNotMatch(html, /<svg/, 'the arrow watermark is back');
  const { withImports } = readSource('src/app/(public)/masterclass/[slug]/_components/MasterclassInstructors.jsx');
  assert.doesNotMatch(withImports, /InstructorPhotoPanel/);
});

test('the stored crop, zoomed by FLOAT_ZOOM, reaches the image box', () => {
  const [styleA] = photoStyles(render([A]));
  const c = photoCropValues(A);
  const expected = styleAttr(photoCropStyle({ scale: c.scale * FLOAT_ZOOM, offsetY: c.offsetY * FLOAT_ZOOM, offsetX: c.offsetX }));
  assert.equal(styleA, expected);
  assert.equal(styleAttr(floatCropStyle(A)), expected);
  assert.notEqual(styleA, styleAttr(photoCropStyle(photoCropValues({}))), 'CONTROL: fixture equals the default crop');
});

test('two instructors: different crop styles inside identical stages', () => {
  const html = render([A, B]);
  const [sa, sb] = stages(html);
  assert.ok(sa && sb, 'expected two stages');
  assert.equal(sa, sb, 'stage sizes differ between instructors');
  assert.match(sa, /-mb-20 h-\[320px\] w-\[260px\]/, 'the stage lost the floating 260×320 overlap footprint');
  const [pa, pb] = photoStyles(html);
  assert.notEqual(pa, pb, 'both instructors got the same crop');
  // The crop percentages apply to a box at the About panel's aspect (where the
  // values were tuned), stage-high and centred — see the component's note.
  assert.equal(html.match(/data-mc-crop-ref="" class="[^"]*aspect-\[336\/330\][^"]*"/g)?.length, 2);
});

test('the stage floats: transparent, vertical fade only, card keeps its top padding', () => {
  const html = render([A]);
  assert.match(html, /mask-image:linear-gradient\(to_bottom,#000_72%,transparent_100%\)/, 'the bottom fade is gone');
  assert.match(html, /style="left:-40%;right:-40%"/, 'the fade layer no longer bleeds past the sides (arms would be cut)');
  assert.doesNotMatch(stages(html)[0], /\bbg-|border|shadow|overflow-hidden/, 'the stage grew a box');
  assert.match(html, /pt-\[85px\]/);
  assert.match(html, /object-contain object-top/);
});

test('an instructor without image_url renders no stage and no photo padding', () => {
  const html = render([NO_PHOTO]);
  assert.doesNotMatch(html, /data-mc-stage/);
  assert.doesNotMatch(html, /pt-\[85px\]/);
  assert.match(html, /max-w-\[420px\]/, 'one instructor keeps the narrow single card');
});

test('orderByIds follows ids, matches ObjectId-like keys as strings, drops unknown ids', () => {
  const docs = [{ _id: 'a' }, { _id: { toString: () => 'b' } }, { _id: 'c' }];
  assert.deepEqual(orderByIds(['c', 'zz', 'b', 'a'], docs).map((d) => String(d._id)), ['c', 'b', 'a']);
  assert.deepEqual(orderByIds([], docs), []);
  assert.deepEqual(orderByIds(null, null), []);
});

test('getInstructorsByIds returns the find() result through orderByIds', () => {
  const { code } = readSource('src/lib/masterclass/getMasterclass.js');
  const body = /export async function getInstructorsByIds[^]*?\n\}/.exec(code)?.[0] ?? '';
  assert.match(body, /const found = await Instructor\.find\(/);
  assert.match(body, /orderByIds\(ids, found\)/, 'the $in result is returned in DB order');
});
