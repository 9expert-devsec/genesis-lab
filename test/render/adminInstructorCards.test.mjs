import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstructorGroups } from '@/app/admin/instructors/_components/InstructorCards';
import { photoCropStyle, photoCropValues } from '@/lib/instructors/photoCrop';
import { readSource } from '../sourceScan.mjs';

/**
 * ADM-1 — /admin/instructors cards use the instructor's OWN crop (the shared
 * InstructorPhotoPanel, as on /about-us), active ones first, inactive ones in
 * a collapsed group, and no big empty "ไม่มีรูป" block for a missing photo.
 */

const CROPPED = {
  _id: 'a1', name: 'อาจารย์ ครอป', title: 'Trainer', image_url: 'https://res.cloudinary.com/x/a1.png',
  is_active: true, photo_scale: 260, photo_offset_y: 5, photo_offset_x: -4, specialties: ['Excel'], programs: [],
};
const NO_PHOTO = { _id: 'a2', name: 'อาจารย์ ไม่มีรูป', image_url: '', is_active: true, programs: [] };
const INACTIVE = { _id: 'i1', name: 'อาจารย์ พัก', image_url: '', is_active: false, programs: [] };

const html = () => renderToStaticMarkup(createElement(InstructorGroups, {
  instructors: [INACTIVE, CROPPED, NO_PHOTO], programs: [], onEdit() {}, onDelete() {},
}));

/** React's inline style serialisation for a style object. */
const styleAttr = (style) => Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';');

test('the card photo is InstructorPhotoPanel with the instructor\'s stored crop', () => {
  const out = html();
  assert.match(out, /class="about-instructor-panel/, 'the shared panel is not rendered');
  const expected = styleAttr(photoCropStyle(photoCropValues(CROPPED)));
  assert.ok(out.includes(`style="${expected}"`), `the stored crop did not reach the panel (wanted ${expected})`);
  assert.doesNotMatch(out, /object-cover/, 'the old wide object-cover banner is back');
});

test('CONTROL: the stored crop differs from the default, so the assertion above can fail', () => {
  assert.notEqual(
    styleAttr(photoCropStyle(photoCropValues(CROPPED))),
    styleAttr(photoCropStyle(photoCropValues({}))),
  );
});

test('inactive instructors render inside the collapsed Inactive group, after the active grid', () => {
  const out = html();
  const details = /<details data-inactive-group=""([^>]*)>([^]*?)<\/details>/.exec(out);
  assert.ok(details, 'no Inactive group');
  assert.doesNotMatch(details[1], /\bopen\b/, 'the group must be collapsed by default');
  assert.match(details[2], /Inactive \(<!-- -->1<!-- -->\)|Inactive \(1\)/);
  assert.ok(details[2].includes(INACTIVE.name), 'the inactive instructor is not inside the group');
  assert.ok(!details[2].includes(CROPPED.name), 'an active instructor leaked into the group');
  const before = out.slice(0, details.index);
  assert.ok(before.includes(CROPPED.name) && before.includes(NO_PHOTO.name), 'active cards must come first');
  assert.ok(!before.includes(INACTIVE.name), 'the inactive instructor also rendered in the active grid');
});

test('a missing photo is a panel-sized placeholder, not an empty block', () => {
  const out = html();
  assert.equal(out.match(/data-photo-placeholder=""/g)?.length, 2);
  assert.match(out, /data-photo-placeholder=""[^>]*aspect-\[336\/330\]/);
  assert.match(out, /lucide-user-round|lucide-circle-user/, 'no person icon in the placeholder');
});

test('the admin client renders through InstructorGroups', () => {
  const { code } = readSource('src/app/admin/instructors/_components/InstructorsAdminClient.jsx');
  assert.match(code, /<InstructorGroups\b/);
});
