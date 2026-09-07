import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileAvatarCard } from '@/app/admin/profile/_components/ProfileAvatarCard';
import { readSource } from '../sourceScan.mjs';

/**
 * The avatar block on /admin/profile.
 *
 * ── WHAT A SERVER RENDER CAN AND CANNOT SAY HERE ────────────────────────────
 * It can say what an admin sees on arrival: the right image, at the right size,
 * with the right controls beside it. It cannot say anything about what happens
 * after a click — the upload, the action call, the pending state, the refresh —
 * because none of that exists until the component hydrates and a real file
 * picker returns a real File. Those are named as unverified in the round
 * report rather than implied by a green here.
 */

const PUBLIC_ID = '9expert/avatars/abc123';

const render = (props) => renderToStaticMarkup(createElement(ProfileAvatarCard, props));
const imgTag = (markup) => (markup.match(/<img\b[^>]*>/) ?? [null])[0];
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) ?? [])[1];

test('unset: the block shows the bundled default at 128px', () => {
  const tag = imgTag(render({ initialPublicId: null }));
  assert.ok(tag, 'no avatar rendered');
  assert.equal(attr(tag, 'src'), '/avatar/avatar-default-512.png');
  assert.equal(attr(tag, 'width'), '128');
  assert.equal(attr(tag, 'height'), '128');
});

test('unset: undefined is treated the same as null', () => {
  // The page passes `me?.imagePublicId ?? null`, but a record written before
  // the field existed has no key at all, and a default prop of `null` is what
  // stands between that and an `undefined` reaching avatarUrl.
  assert.equal(attr(imgTag(render({})), 'src'), '/avatar/avatar-default-512.png');
});

test('set: the block shows the Cloudinary URL at 128px', () => {
  const src = attr(imgTag(render({ initialPublicId: PUBLIC_ID })), 'src');
  assert.ok(src.startsWith('https://res.cloudinary.com/'), src);
  assert.match(src, /\bw_128\b/);
  assert.match(src, /\bh_128\b/);
  assert.notEqual(src, PUBLIC_ID, 'the raw publicId reached the src attribute');
});

test('the avatar is circular, and the circle is CSS', () => {
  const tag = imgTag(render({ initialPublicId: PUBLIC_ID }));
  assert.match(tag, /rounded-full/);
  assert.ok(!attr(tag, 'src').includes('r_'));
});

test('both controls are present when an image is set, one when it is not', () => {
  const set = render({ initialPublicId: PUBLIC_ID });
  const unset = render({ initialPublicId: null });
  assert.match(set, /อัปโหลดรูป/);
  assert.match(set, /ลบรูป/);
  assert.match(unset, /อัปโหลดรูป/);
  assert.ok(!unset.includes('ลบรูป'));
});

test('neither outcome message is rendered before anything has happened', () => {
  // A card that ships its own success banner is a card that lies on arrival.
  const markup = render({ initialPublicId: null });
  assert.ok(!markup.includes('บันทึกรูปเรียบร้อย'));
  assert.ok(!markup.includes('ลบรูปแล้ว'));
  assert.ok(!/role="alert"/.test(markup), 'an error region is rendered with no error');
});

// ── the wiring the markup cannot show ───────────────────────────────────────
test('useOptimistic is not used — React is 18.3.1 in this repo', () => {
  const { withImports } = readSource('src/app/admin/profile/_components/ProfileAvatarCard.jsx');
  assert.doesNotMatch(withImports, /useOptimistic/,
    'the hook does not exist in React 18.3.1, and showing the new photo before '
    + 'the write lands makes a failed save look identical to a successful one');
});

test('the card advances its state from the ACTION result, not from its input', () => {
  // Shape-bound (test/sourceScan.mjs, defect 7). The distinction matters: on a
  // refused save the screen must keep showing what the database holds, and
  // `setValue(nextPublicId)` would show what the user tried to store.
  const { code } = readSource('src/app/admin/profile/_components/ProfileAvatarCard.jsx');
  assert.match(code, /setValue\(result\.imagePublicId \?\? null\)/,
    'the displayed value must come from the action result');
  assert.match(code, /router\.refresh\(\)/,
    'without a refresh the sidebar avatar stays stale until the next navigation — '
    + 'which is the entire reason AdminLayout reads this field from Mongo');
});

test('the page passes the stored value in, and selects the field to do it', () => {
  // Two halves of one seam, both of which fail silently: a page that renders
  // the card without the prop shows the default to everyone forever, and a
  // .select() missing the field makes the prop undefined with the same result.
  const { code } = readSource('src/app/admin/profile/page.jsx');
  assert.match(code, /<ProfileAvatarCard initialPublicId=\{me\?\.imagePublicId \?\? null\} \/>/);
  assert.match(code, /\.select\('[^']*\bimagePublicId\b[^']*'\)/,
    'imagePublicId is not selected, so the prop is undefined and the default '
    + 'renders for every admin regardless of what they uploaded');
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the two states render different markup', () => {
  assert.notEqual(
    imgTag(render({ initialPublicId: null })),
    imgTag(render({ initialPublicId: PUBLIC_ID })),
  );
});
