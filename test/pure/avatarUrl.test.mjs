import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avatarUrl, defaultAvatarPath, AVATAR_SIZES } from '@/lib/avatar/avatarUrl';

/**
 * The one derivation of an avatar URL.
 *
 * ── WHY THE EMPTY-VALUE TABLE IS 4×4 AND NOT 4 ──────────────────────────────
 * "No avatar set" is the state MOST admins are in, so it is the state most
 * likely to be seen and least likely to be exercised by whoever is testing with
 * their own photo uploaded. And the default is not one path: a 128px PNG serves
 * the 36 and 72 slots, a 512px PNG serves 128 and 256. A four-case table over
 * one size would have proved the empty handling at one size and said nothing
 * about the size map underneath it — so every empty form is asserted at every
 * allowlisted size, sixteen assertions, and the control below shows the extra
 * dimension is load-bearing rather than decorative.
 *
 * ── WHAT THIS FILE CANNOT DO ────────────────────────────────────────────────
 * It cannot prove any of this is CALLED. A correct pure function that no render
 * site invokes is exactly the hole round A fell into — the sidebar highlighted
 * two rows while every pure test stayed green. The render tier is where that is
 * caught; see test/render/adminSidebarAvatar and test/render/profileAvatar.
 */

// A public_id shaped like one Cloudinary actually returns for this folder.
const PUBLIC_ID = '9expert/avatars/abc123def456';
const CDN = 'https://res.cloudinary.com';

test('the size allowlist is the four sizes the render sites use', () => {
  // Asserted before the tables below so a shrunken allowlist cannot make them
  // vacuously narrow.
  assert.deepEqual([...AVATAR_SIZES], [36, 72, 128, 256]);
});

// ── empty value × size — the 16 ─────────────────────────────────────────────
const EMPTY_VALUES = [
  ['null', null],
  ['undefined', undefined],
  ["'' (empty string)", ''],
  ["'   ' (whitespace only)", '   '],
];

/** What each size must fall back to when no avatar is set. */
const EXPECTED_DEFAULT = {
  36: '/avatar/avatar-default-128.png',
  72: '/avatar/avatar-default-128.png',
  128: '/avatar/avatar-default-512.png',
  256: '/avatar/avatar-default-512.png',
};

for (const [name, value] of EMPTY_VALUES) {
  for (const size of [36, 72, 128, 256]) {
    test(`avatarUrl: ${name} at ${size}px → ${EXPECTED_DEFAULT[size]}`, () => {
      assert.equal(avatarUrl(value, size), EXPECTED_DEFAULT[size]);
    });
  }
}

test('avatarUrl: the default is a local path, never a remote URL', () => {
  // If the default ever became a CDN URL, an admin with no photo would depend
  // on a third party to render their own admin panel.
  for (const size of AVATAR_SIZES) {
    const url = avatarUrl(null, size);
    assert.ok(url.startsWith('/avatar/'), `${size}px default is ${url}`);
    assert.ok(!url.includes('://'), `${size}px default is remote`);
  }
});

test('defaultAvatarPath agrees with what avatarUrl falls back to', () => {
  // Two exports must not describe the same fallback differently — the fs guard
  // asserts files exist at defaultAvatarPath, and it would be checking the
  // wrong files if these diverged.
  for (const size of AVATAR_SIZES) {
    assert.equal(defaultAvatarPath(size), avatarUrl(null, size));
  }
});

// ── a real public_id ────────────────────────────────────────────────────────
test('avatarUrl: a publicId builds a Cloudinary URL with the transform', () => {
  const url = avatarUrl(PUBLIC_ID, 128);
  assert.ok(url.startsWith(`${CDN}/`), url);
  assert.match(url, /\/image\/upload\//);
  assert.match(url, /c_fill/, 'square crop');
  assert.match(url, /g_face/, 'face-aware');
  assert.match(url, /f_auto/, 'format negotiation');
  assert.match(url, /q_auto/, 'quality negotiation');
  assert.ok(url.endsWith(`/${PUBLIC_ID}`), `publicId must be the last segment: ${url}`);
});

test('avatarUrl: the requested size appears as both width and height', () => {
  for (const size of AVATAR_SIZES) {
    const url = avatarUrl(PUBLIC_ID, size);
    assert.match(url, new RegExp(`\\bw_${size}\\b`), `w_${size} missing from ${url}`);
    assert.match(url, new RegExp(`\\bh_${size}\\b`), `h_${size} missing from ${url}`);
  }
});

test('avatarUrl: the same publicId at two sizes gives two different URLs', () => {
  // The entire reason the field stores a public_id instead of a secure_url. If
  // this ever returns one string for both, the deviation documented on
  // Admin.imagePublicId has stopped buying anything.
  const small = avatarUrl(PUBLIC_ID, 36);
  const large = avatarUrl(PUBLIC_ID, 128);
  assert.notEqual(small, large);
  assert.match(small, /w_36\b/);
  assert.match(large, /w_128\b/);
});

test('avatarUrl: no rounding or radius is baked into the URL', () => {
  // The circle is CSS. A `r_max` here would generate a second derivative and
  // make the same asset unusable in a square context (email, a table cell).
  assert.ok(!avatarUrl(PUBLIC_ID, 36).includes('r_'), 'a radius transform leaked in');
});

// ── size rejection ──────────────────────────────────────────────────────────
const BAD_SIZES = [
  ['0', 0],
  ['37 (not allowlisted)', 37],
  ['512 (plausible but not allowlisted)', 512],
  ["'128' (the string form)", '128'],
  ['-36 (negative)', -36],
  ['undefined (omitted)', undefined],
  ['null', null],
  ['NaN', NaN],
  ['36.5', 36.5],
];

for (const [name, size] of BAD_SIZES) {
  test(`avatarUrl: size ${name} is rejected, not interpolated`, () => {
    assert.throws(() => avatarUrl(PUBLIC_ID, size), RangeError);
    // …and rejected for the empty case too, so a bad size cannot be laundered
    // through the default-path branch.
    assert.throws(() => avatarUrl(null, size), RangeError);
  });
}

test("avatarUrl: '128' is rejected even though object keys are strings", () => {
  // The specific trap: DEFAULT_BY_SIZE is an object, so a bare lookup with the
  // string '128' would succeed and return a path, and the transform would carry
  // w_128 built from a string that came from who-knows-where.
  assert.throws(() => avatarUrl(null, '128'), RangeError);
  assert.equal(avatarUrl(null, 128), '/avatar/avatar-default-512.png');
});

// ── a malformed publicId must not reach the URL ─────────────────────────────
const UNSAFE_IDS = [
  ['a full URL', 'https://evil.example/x.png'],
  ['a traversal', '../../../secret'],
  ['a transform separator', 'avatars/x,w_9999'],
  ['a leading slash', '/9expert/avatars/x'],
  ['a space', '9expert/avatars/my photo'],
  ['a query string', '9expert/avatars/x?a=b'],
  ['a newline', '9expert/avatars/x\ny'],
];

for (const [name, id] of UNSAFE_IDS) {
  test(`avatarUrl: ${name} falls back to the default instead of being interpolated`, () => {
    const url = avatarUrl(id, 36);
    assert.equal(url, '/avatar/avatar-default-128.png');
    assert.ok(!url.includes('res.cloudinary.com'));
  });
}

// ── CONTROLS ────────────────────────────────────────────────────────────────
test('CONTROL: the two default files are genuinely different paths', () => {
  // The 4×4 table only measures the size map if the two defaults differ. If
  // both sizes pointed at one file, sixteen assertions would prove four things.
  assert.notEqual(defaultAvatarPath(36), defaultAvatarPath(128));
});

test('CONTROL: a raw publicId is not itself a usable src', () => {
  // States what avatarUrl is FOR: the stored value cannot go into an `src`.
  // The render tier asserts the sidebar does not try — this only shows the
  // stored form and the delivery form are not interchangeable.
  assert.ok(!PUBLIC_ID.startsWith('http'));
  assert.ok(!PUBLIC_ID.startsWith('/'));
  assert.notEqual(avatarUrl(PUBLIC_ID, 36), PUBLIC_ID);
});
