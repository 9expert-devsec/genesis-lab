import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { readSource, ROOT } from '../sourceScan.mjs';

/**
 * The motto band's background is now a WALLPAPER FILE, and a file is a kind of
 * dependency nothing in this repo can see.
 *
 * ══ WHY THIS TIER, AND NOT THE RENDER ONE ═══════════════════════════════════
 * The render test next door proves the component EMITS
 * `src="/motto/wallpaper-motto.png"`. That string is equally correct against an
 * empty public/ directory: react renders it, `next build` succeeds (public/ is
 * copied, never resolved), no linter follows it, and the module graph has no
 * edge to it at all. The whole failure is one broken image in one section of
 * the landing page — invisible to every other test in this suite, and visible
 * only to a person with a browser open at the right scroll position.
 *
 * So the fs tier asserts the thing the render tier structurally cannot: the
 * path the component writes resolves to real image bytes.
 *
 * ══ WHY readdirSync AND NOT existsSync ══════════════════════════════════════
 * Same hazard as test/fs/chatWiring: development is Windows (case-insensitive),
 * the build is Linux (case-sensitive). `Wallpaper-Motto.png` referenced as
 * `wallpaper-motto.png` renders on the dev machine and 404s in production.
 * `existsSync` asks the filesystem and would accept the wrong case; comparing
 * directory entries as STRINGS is case-sensitive everywhere.
 *
 * ══ WHAT THIS FILE CANNOT SEE ═══════════════════════════════════════════════
 * Everything about how it looks. Not whether the art is the right art, not
 * whether white and lime text stay readable over it, not what the crop throws
 * away at 390px. Those were measured once — by decoding the PNG and by eye —
 * and written up in the round's report. No test re-runs that judgement.
 */

/** The one path the component and the asset must agree on. */
const WALLPAPER = '/motto/wallpaper-motto.png';

const QUOTE = readSource('src/app/_components/home/InstructorQuote.jsx');

/** Map a public URL path to its file under public/. */
function publicFile(urlPath) {
  return path.join(ROOT, 'public', urlPath.replace(/^\//, '').split('/').join(path.sep));
}

// ── The asset is really there ───────────────────────────────────────────────

test('the wallpaper exists under public/ with EXACTLY the case the source uses', () => {
  const rel = WALLPAPER.replace(/^\//, '');
  const dir = path.posix.dirname(rel);
  const base = path.posix.basename(rel);
  const entries = readdirSync(path.join(ROOT, 'public', ...dir.split('/')));
  assert.ok(
    entries.includes(base),
    `public/${rel} is not in the directory listing. Present: ${entries.join(', ') || '(nothing)'}. `
    + 'The motto band would render as a blank navy strip and nothing else in this suite would notice.',
  );
  // The control: the same check rejects a case variant, proving it compares
  // strings rather than asking the (case-insensitive, on Windows) filesystem.
  assert.ok(!entries.includes(base.toUpperCase()), 'the matcher is not case-sensitive');
});

test('it is a real PNG with real bytes, not a 0-byte stub or an LFS pointer', () => {
  // readdirSync passes on an empty file and on the ~130-byte text stub git-lfs
  // leaves behind. Reading the signature is what separates "the path resolves"
  // from "the path resolves to an image".
  const file = publicFile(WALLPAPER);
  const bytes = statSync(file).size;
  assert.ok(bytes > 100_000, `${WALLPAPER} is only ${bytes} bytes — that is not the placed artwork`);
  const head = readFileSync(file).subarray(0, 8);
  assert.deepEqual(
    [...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    `${WALLPAPER} does not start with the PNG signature`,
  );
});

test('the asset is the wide banner the crop rule assumes, and is fully opaque', () => {
  /**
   * `object-cover` is a bargain with the aspect ratio. The component reasons
   * from a ~3:1 banner about WHICH axis gets cropped at which width. Swap in a
   * square or a portrait file and that reasoning silently inverts — the desktop
   * band would crop horizontally instead of vertically, and the quote could
   * land on the lit Earth rather than the empty space beside it.
   *
   * Opacity matters for the other half of the change: the flat #0D1B2A the old
   * SVG painted as a base rect now sits on the section. That is a LOADING
   * colour, not a blend layer. An asset with an alpha channel would let it show
   * through and mix, which is a different picture from the one that was judged.
   */
  const b = readFileSync(publicFile(WALLPAPER));
  assert.equal(b.subarray(12, 16).toString(), 'IHDR', 'the first PNG chunk is not IHDR');
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  const colourType = b[25];
  const ratio = width / height;
  assert.ok(
    ratio > 2.5 && ratio < 3.5,
    `the wallpaper is ${width}x${height} (${ratio.toFixed(2)}:1); the band's crop reasoning assumes a ~3:1 banner`,
  );
  assert.ok(width >= 1920, `${width}px wide will visibly soften on a desktop-width full-bleed band`);
  // PNG colour types: 4 = grey+alpha, 6 = RGBA. 0 / 2 / 3 carry no alpha channel.
  assert.ok(
    colourType !== 4 && colourType !== 6,
    `the wallpaper has an alpha channel (colour type ${colourType}); the #0D1B2A beneath it would blend through`,
  );
});

// ── The component and the asset agree, and the old art is gone ──────────────

test('InstructorQuote points at the wallpaper — one reference, in live code', () => {
  // `.code` is the comment-stripped form. The block above the <img> DISCUSSES
  // the swap in prose, so a raw-text match here could pass on the commentary
  // alone even with the element deleted.
  const hits = QUOTE.code.split(WALLPAPER).length - 1;
  assert.equal(hits, 1, `expected exactly one live reference to ${WALLPAPER}, found ${hits}`);
});

test('nothing of the circuit-board artwork survives in the component', () => {
  /**
   * The old layer was ~100 lines of inline SVG: a base rect, two radial
   * gradients, a blur filter, dot grids, polyline traces and glowing nodes. A
   * half-removal — the <img> added, the <svg> left underneath — renders as the
   * wallpaper with a circuit board stacked on top of it, and looks close enough
   * in a thumbnail to ship.
   *
   * Read from `.code` because the new comment names some of these tokens on
   * purpose, to say what was replaced. That is the suite's standing rule: when
   * the subject is source, strip comments before matching.
   */
  const dead = [
    '<svg', '</svg>', 'viewBox', 'preserveAspectRatio',
    'radialGradient', 'feGaussianBlur', 'feMerge', 'polyline',
    'instructor-ng1', 'instructor-ng2', 'instructor-gl',
    '#48B0FF', '#2486FF', '#005CFF',
  ];
  const left = dead.filter((t) => QUOTE.code.includes(t));
  assert.deepEqual(
    left, [],
    `circuit-board artwork is still in the live source: ${left.join(', ')}`,
  );
});

test('the CEO portrait is untouched — a separate element, still next/image', () => {
  /**
   * The portrait and the background were never one picture, and the swap must
   * not have quietly merged them. This is the guard against "the wallpaper has
   * him in it now": his own element, his own file, and the 425px ceiling this
   * component has always set inline.
   */
  assert.match(QUOTE.code, /<Image\b/, 'the portrait is no longer a next/image element');
  assert.match(QUOTE.code, /src="\/people\/Aj\.Chalaivate\.webp"/, 'the portrait source changed');
  assert.match(QUOTE.code, /maxHeight: '425px'/, 'the portrait height ceiling changed');
  assert.match(
    QUOTE.withImports,
    /^import Image from 'next\/image';$/m,
    'the next/image import line was dropped',
  );
  assert.ok(
    readdirSync(path.join(ROOT, 'public', 'people')).includes('Aj.Chalaivate.webp'),
    'the portrait file itself is gone',
  );
});

test('the background layer is a plain element, deliberately not next/image', () => {
  /**
   * Worth pinning because "it is an image, use next/image" is the reflex every
   * future reader will have. The optimiser would re-encode an asset that was
   * placed as-is, and this is decoration behind the text rather than content.
   * So: exactly one <Image> in the file (his portrait), and the wallpaper
   * reached through a raw <img>.
   */
  const imageEls = QUOTE.code.match(/<Image\b/g) || [];
  assert.equal(imageEls.length, 1, `expected one <Image> (the portrait), found ${imageEls.length}`);
  const tag = QUOTE.code.match(/<img\b[\s\S]*?\/>/);
  assert.ok(tag, 'the wallpaper is not rendered through a plain <img>');
  assert.ok(tag[0].includes(WALLPAPER), 'the plain <img> is not the wallpaper');
});
