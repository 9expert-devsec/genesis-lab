import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AvatarUploadField } from '@/components/admin/AvatarUploadField';
import { avatarUrl } from '@/lib/avatar/avatarUrl';
import { readSource } from '../sourceScan.mjs';

/**
 * The avatar picker: what it renders, and what it emits.
 *
 * ══ THE ONE THAT WOULD SHIP SILENTLY ════════════════════════════════════════
 * `/api/admin/upload` returns BOTH `{ url, publicId }`, and `url` is the field
 * every other caller of that endpoint reads — ImageUploadField, which this
 * control sits next to, stores exactly that. Reading `data.url` here would
 * work: the upload succeeds, the preview appears, the profile saves, and the
 * only symptom is that the stored value is a finished delivery URL that cannot
 * be resized — so the 36px sidebar would be serving a 512px image, and
 * `avatarUrl` would refuse the value as a malformed public_id and fall back to
 * the default. An avatar that uploads fine and then shows the default is a bug
 * report nobody files precisely.
 *
 * Nothing about the rendered markup can catch that, so it is asserted against
 * the source, and named here rather than left implicit.
 */

const PUBLIC_ID = '9expert/avatars/abc123';

function render(props = {}) {
  return renderToStaticMarkup(createElement(AvatarUploadField, props));
}

/** The first <img> tag in the markup. */
function imgTag(markup) {
  return (markup.match(/<img\b[^>]*>/) ?? [null])[0];
}

const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) ?? [])[1];

test('unset: the preview is the bundled default at the requested size', () => {
  const tag = imgTag(render({ value: null }));
  assert.ok(tag, 'no <img> rendered');
  assert.equal(attr(tag, 'src'), avatarUrl(null, 128));
  assert.equal(attr(tag, 'src'), '/avatar/avatar-default-512.png');
});

test('set: the preview is a Cloudinary URL carrying the 128px transform', () => {
  const tag = imgTag(render({ value: PUBLIC_ID }));
  const src = attr(tag, 'src');
  assert.ok(src.startsWith('https://res.cloudinary.com/'), src);
  assert.match(src, /\bw_128\b/);
  assert.match(src, /\bh_128\b/);
  assert.ok(src.endsWith(`/${PUBLIC_ID}`), src);
});

test('the raw publicId never reaches the src attribute on its own', () => {
  // The rule from B2, asserted where it can actually be violated.
  const src = attr(imgTag(render({ value: PUBLIC_ID })), 'src');
  assert.notEqual(src, PUBLIC_ID);
  assert.ok(src.includes('/image/upload/'), 'the transform is missing entirely');
});

test('the img carries explicit width and height matching the size', () => {
  // Without both, the circle collapses before the image loads and the whole
  // row reflows — the layout-shift this control is small enough to notice.
  const tag = imgTag(render({ value: null, size: 72 }));
  assert.equal(attr(tag, 'width'), '72');
  assert.equal(attr(tag, 'height'), '72');
  assert.equal(attr(tag, 'src'), avatarUrl(null, 72), 'the size did not reach avatarUrl');
});

test('the circle is CSS, not baked into the URL', () => {
  const markup = render({ value: PUBLIC_ID });
  assert.match(imgTag(markup), /rounded-full/);
  assert.ok(!attr(imgTag(markup), 'src').includes('r_'),
    'a radius transform in the URL would make this asset unusable in a square context');
});

// ── the controls ────────────────────────────────────────────────────────────
test('the upload trigger is a real button, keyboard-reachable and focusable', () => {
  // A <label> wrapping a display:none input is clickable but reaches neither
  // the tab order nor Enter/Space. ImageUploadField does that; this must not.
  const markup = render({ value: null });
  const buttons = [...markup.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(buttons.length >= 1, 'no <button> rendered');
  const upload = buttons[0];
  assert.match(upload, /type="button"/, 'a bare button inside a form would submit it');
  assert.match(upload, /focus-visible:ring-2/, 'no visible focus ring');
});

test('ลบรูป appears only when there is an image to remove', () => {
  const withImage = render({ value: PUBLIC_ID });
  const without = render({ value: null });
  assert.match(withImage, /ลบรูป/);
  assert.ok(!without.includes('ลบรูป'),
    'a remove button with nothing to remove would offer to delete the bundled default');
  assert.match(withImage, /อัปโหลดรูป/);
  assert.match(without, /อัปโหลดรูป/);
});

test('the file input narrows the picker to the three server-accepted types', () => {
  const markup = render({ value: null });
  const input = (markup.match(/<input\b[^>]*type="file"[^>]*>/) ?? [''])[0];
  assert.ok(input, 'no file input rendered');
  assert.equal(attr(input, 'accept'), 'image/jpeg,image/png,image/webp');
});

test('busy disables both the trigger and the input', () => {
  // The parent sets `busy` while its save action is in flight; a second upload
  // started mid-save would race the write.
  const markup = render({ value: PUBLIC_ID, busy: true });
  assert.match(markup, /กำลังอัปโหลด…/);
  const disabled = [...markup.matchAll(/<(?:button|input)\b[^>]*disabled[^>]*>/g)];
  assert.ok(disabled.length >= 2, `only ${disabled.length} controls disabled while busy`);
});

// ── the assertion the markup cannot make ────────────────────────────────────
test('the control reads publicId from the upload response, never url', () => {
  // Shape-bound (test/sourceScan.mjs, defect 7) — if you restructure the fetch
  // handler, come back and check this still binds.
  const { code } = readSource('src/components/admin/AvatarUploadField.jsx');
  assert.match(code, /data\?\.publicId/, 'the response publicId is never read');
  assert.match(code, /onChange\?\.\(data\.publicId\)/,
    'something other than the publicId is handed to onChange');
  assert.doesNotMatch(code, /data\.url|data\?\.url/,
    'the control reads `url` from the upload response — that is the stored-URL '
    + 'shape this whole round exists to avoid, and it would fail silently');
});

test('the control posts to the avatars folder', () => {
  const { code } = readSource('src/components/admin/AvatarUploadField.jsx');
  assert.match(code, /fd\.append\('folder', 'avatars'\)/,
    "without folder=avatars the upload lands in `uploads` with the default 5 MB "
    + 'image-or-PDF rule, and returns 200 while doing it');
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the two preview states are genuinely different markup', () => {
  // If avatarUrl were bypassed and `value` interpolated directly, or if the
  // default were returned unconditionally, these would coincide and every
  // assertion above would still be checking one rendering twice.
  assert.notEqual(imgTag(render({ value: null })), imgTag(render({ value: PUBLIC_ID })));
});
