import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OG_DEFAULT_IMAGE,
  toAbsoluteUrl,
  pickCourseImageUrl,
  resolveCourseOgImage,
} from '@/lib/seo/ogImage';

// Per-course OG image resolution for masterclass detail pages. The danger
// here is a SILENT fallback: a course with no image emitting an empty or
// relative og:image (Facebook rejects both). Every case below pins the
// resolved SOURCE, and the no-image case is the control that must fail if
// the fallback ever regresses to returning something relative/empty.

const BASE = 'https://masterclass.9experttraining.com';
const CLOUDINARY = 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1712345678/masterclass/cover.jpg';
const GALLERY_IMG = 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1712345678/masterclass/g1.jpg';
const DEFAULT_ABS = `${BASE}${OG_DEFAULT_IMAGE.url}`;

// ── toAbsoluteUrl ────────────────────────────────────────────────────────────
test('toAbsoluteUrl: absolute Cloudinary URL passes through unchanged', () => {
  assert.equal(toAbsoluteUrl(CLOUDINARY, BASE), CLOUDINARY);
});
test('toAbsoluteUrl: root-relative path is joined onto base', () => {
  assert.equal(toAbsoluteUrl('/brand/og-9expert-1200x630.png', BASE), `${BASE}/brand/og-9expert-1200x630.png`);
});
test('toAbsoluteUrl: bare relative (no leading slash) still gets a slash', () => {
  assert.equal(toAbsoluteUrl('uploads/x.png', BASE), `${BASE}/uploads/x.png`);
});
test('toAbsoluteUrl: trailing slash on base is not doubled', () => {
  assert.equal(toAbsoluteUrl('/a.png', `${BASE}/`), `${BASE}/a.png`);
});
test('toAbsoluteUrl: protocol-relative is upgraded to https', () => {
  assert.equal(toAbsoluteUrl('//cdn.example.com/a.png', BASE), 'https://cdn.example.com/a.png');
});
test('toAbsoluteUrl: empty / non-string returns null (so caller can fall back)', () => {
  assert.equal(toAbsoluteUrl('', BASE), null);
  assert.equal(toAbsoluteUrl('   ', BASE), null);
  assert.equal(toAbsoluteUrl(undefined, BASE), null);
  assert.equal(toAbsoluteUrl(null, BASE), null);
});

// ── pickCourseImageUrl: the fallback chain, source by source ─────────────────
test('pick #1: cover_image_url wins when present', () => {
  const course = { cover_image_url: CLOUDINARY, gallery: [{ type: 'image', url: GALLERY_IMG }] };
  assert.equal(pickCourseImageUrl(course), CLOUDINARY);
});
test('pick #2: first gallery image when no cover', () => {
  const course = {
    cover_image_url: '',
    gallery: [
      { type: 'youtube', url: '', videoId: 'abc' },
      { type: 'image', url: GALLERY_IMG },
      { type: 'image', url: 'https://x/second.jpg' },
    ],
  };
  assert.equal(pickCourseImageUrl(course), GALLERY_IMG);
});
test('pick #2: youtube-only gallery does NOT satisfy the image slot', () => {
  const course = { cover_image_url: '', gallery: [{ type: 'youtube', url: '', videoId: 'abc' }] };
  assert.equal(pickCourseImageUrl(course), null);
});
test('pick #2: an image entry with an empty url is skipped', () => {
  const course = {
    cover_image_url: '',
    gallery: [{ type: 'image', url: '   ' }, { type: 'image', url: GALLERY_IMG }],
  };
  assert.equal(pickCourseImageUrl(course), GALLERY_IMG);
});

// ── THE CONTROL: no-image course must produce NO source ──────────────────────
// If this ever returns a truthy value, the fallback chain is silently
// inventing an image and the "→ default" guarantee below is a lie.
test('CONTROL: course with neither cover nor gallery image → null (no silent source)', () => {
  const cases = [
    { cover_image_url: '', gallery: [] },
    { cover_image_url: '   ', gallery: [{ type: 'youtube', url: '', videoId: 'z' }] },
    {},
    { gallery: null },
  ];
  for (const c of cases) {
    assert.equal(pickCourseImageUrl(c), null, `expected null for ${JSON.stringify(c)}`);
  }
});

// ── resolveCourseOgImage: the emitted URL is ALWAYS absolute ─────────────────
test('resolve: cover → absolute, unchanged', () => {
  assert.equal(resolveCourseOgImage({ cover_image_url: CLOUDINARY }, BASE), CLOUDINARY);
});
test('resolve: gallery image → absolute, unchanged', () => {
  assert.equal(
    resolveCourseOgImage({ cover_image_url: '', gallery: [{ type: 'image', url: GALLERY_IMG }] }, BASE),
    GALLERY_IMG,
  );
});
test('resolve: relative cover is made absolute against base', () => {
  assert.equal(resolveCourseOgImage({ cover_image_url: '/uploads/c.png' }, BASE), `${BASE}/uploads/c.png`);
});
test('resolve: no-image course → absolute DEFAULT, never empty, never relative', () => {
  const url = resolveCourseOgImage({ cover_image_url: '', gallery: [] }, BASE);
  assert.equal(url, DEFAULT_ABS);
  assert.ok(/^https?:\/\//.test(url), 'og:image must be absolute');
  assert.notEqual(url, '', 'og:image must not be empty');
});
test('resolve: null course (not-found path) → absolute default', () => {
  assert.equal(resolveCourseOgImage(null, BASE), DEFAULT_ABS);
});

// ── The default asset is the right shape/role ────────────────────────────────
test('OG_DEFAULT_IMAGE is 1200×630 (1.91:1) and root-relative', () => {
  assert.equal(OG_DEFAULT_IMAGE.width, 1200);
  assert.equal(OG_DEFAULT_IMAGE.height, 630);
  assert.ok(OG_DEFAULT_IMAGE.url.startsWith('/brand/'), 'default lives under /brand/, separate from /logo/ icons');
  assert.ok(typeof OG_DEFAULT_IMAGE.alt === 'string' && OG_DEFAULT_IMAGE.alt.length > 0);
});
