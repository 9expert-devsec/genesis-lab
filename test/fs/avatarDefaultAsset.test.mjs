import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { defaultAvatarPath, AVATAR_SIZES } from '@/lib/avatar/avatarUrl';
import { RESERVED_PATHS } from '@/lib/courses/reservedPaths';
import { ROOT } from '../sourceScan.mjs';

/**
 * The bundled default avatar exists on disk, at the paths avatarUrl returns.
 *
 * ══ WHY THIS IS A TEST AND NOT AN ASSUMPTION ════════════════════════════════
 * `avatarUrl(null, 36)` returns the STRING '/avatar/avatar-default-128.png'.
 * That string is correct whether or not the file is there. Every pure test in
 * test/pure/avatarUrl passes against a deleted asset, the build passes, the
 * server renders 200 — and the only symptom is a broken image icon in a
 * browser, for the majority of admins (the ones with no photo uploaded), in a
 * round that has no browser in it.
 *
 * The failure mode is not hypothetical either: the assets live in `public/`,
 * are binary, are referenced from nowhere the module graph can see, and no
 * bundler, linter or type checker will ever mention them. A `git rm` of the
 * wrong glob removes them in silence.
 *
 * So the fs tier asserts the one thing the pure tier structurally cannot: the
 * path resolves to real bytes.
 */

/** Map a public URL path ('/avatar/x.png') to a file under public/. */
function publicFile(urlPath) {
  return path.join(ROOT, 'public', urlPath.replace(/^\//, '').split('/').join(path.sep));
}

test('every default avatar path resolves to a real file under public/', () => {
  const missing = [];
  for (const size of AVATAR_SIZES) {
    const urlPath = defaultAvatarPath(size);
    const file = publicFile(urlPath);
    if (!existsSync(file)) missing.push(`${size}px → ${urlPath} (looked in ${file})`);
  }
  assert.deepEqual(
    missing, [],
    'avatarUrl returns a path with no file behind it — every admin without an '
    + 'uploaded photo would see a broken image, and nothing else in the suite '
    + 'would notice',
  );
});

test('the default assets are non-empty PNGs, not placeholders or LFS pointers', () => {
  // existsSync passes on a 0-byte file and on a git-lfs pointer stub. Reading
  // the magic number is what distinguishes "the path resolves" from "the path
  // resolves to an image".
  for (const size of AVATAR_SIZES) {
    const file = publicFile(defaultAvatarPath(size));
    const bytes = statSync(file).size;
    assert.ok(bytes > 1024, `${defaultAvatarPath(size)} is only ${bytes} bytes`);
    const head = readFileSync(file).subarray(0, 8);
    assert.deepEqual(
      [...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `${defaultAvatarPath(size)} does not start with the PNG signature`,
    );
  }
});

test('the two defaults are distinct files, at the sizes they claim', () => {
  // The size map buys nothing if both entries point at one file, and the 4×4
  // table in test/pure/avatarUrl would then be measuring one path four times.
  const small = publicFile(defaultAvatarPath(36));
  const large = publicFile(defaultAvatarPath(128));
  assert.notEqual(small, large);

  // Read the IHDR width/height rather than trusting the filename: a file called
  // avatar-default-512.png that is actually 64px would upscale on the profile
  // page and nothing would say so.
  const dims = (file) => {
    const b = readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };
  assert.deepEqual(dims(small), { w: 128, h: 128 }, 'the 36/72 default is not 128×128');
  assert.deepEqual(dims(large), { w: 512, h: 512 }, 'the 128/256 default is not 512×512');
});

test('public/avatar is reserved, so a course alias cannot silently claim it', () => {
  // The folder these assets live in is served at the root. RESERVED_PATHS is
  // what stops a course URL alias of /avatar being accepted and then never
  // resolving — the one failure mode in that list with no visible symptom.
  // test/fs/reservedPaths asserts the parity; this asserts the REASON, next to
  // the assets that created it.
  const entry = RESERVED_PATHS.find((r) => r.segment === 'avatar');
  assert.ok(entry, 'public/avatar/ exists but /avatar is not reserved');
  assert.equal(entry.source, 'static', 'it is a public/ directory, so it is derivable');
});

test('CONTROL: the existence check can actually fail', () => {
  // The loop above reports [] both when every asset is present and when
  // AVATAR_SIZES is empty. This shows the resolver says no to a path that is
  // not there, and yes to one that is.
  assert.equal(existsSync(publicFile('/avatar/definitely-not-here.png')), false);
  assert.equal(existsSync(publicFile(defaultAvatarPath(36))), true);
});
