import { test } from 'node:test';
import assert from 'node:assert/strict';
// Next ships path-to-regexp as a CommonJS bundle, so it has no named exports.
import pathToRegexpPkg from 'next/dist/compiled/path-to-regexp/index.js';

const { pathToRegexp } = pathToRegexpPkg;

import nextConfig from '../../next.config.mjs';
import { resolveDerivative } from '../../scripts/lib/legacy-source-manifest.mjs';
import {
  DELIVERY_VARIANTS,
  LEGACY_PREFIX,
  LEGACY_ROOTS,
  UNTRANSFORMED_EXTENSIONS,
  VARIANT_PREFIX,
} from '../../src/lib/legacyTransforms.mjs';

// ── WHAT THIS FILE PINS, AND WHY IT HAS TO EXIST ────────────────────────────
//
// Two things derive a Drupal source path from a derivative path:
//
//   resolveDerivative()   scripts/lib/legacy-source-manifest.mjs — real code,
//                         runs at migration time, handles every edge case.
//   the styles/ rewrite   next.config.mjs — a REGEX, runs at request time.
//
// They cannot be the same implementation. A Next rewrite is a pattern; it
// cannot call a function per request. So they share a vocabulary (the
// extension sets in src/lib/legacyTransforms.mjs) but they are still two
// encodings of one rule, and two encodings of one rule drift.
//
// The failure mode is silent and expensive: a cover URL stops resolving, the
// page renders a broken image, and nothing throws. These tests fail instead.
//
// The corpus below is REAL — the derivative paths actually stored on
// /articles page 1, which were measured returning 404 before this rule
// existed — plus the edge cases resolveDerivative() documents as hard.

/** The rewrite rules the config actually emits. Not a restatement of them. */
const rules = await nextConfig.rewrites();

/**
 * Compile one rewrite `source` and return a matcher yielding its params.
 *
 * Next's own path-to-regexp build is used deliberately: a different version
 * could disagree about backtracking or about what `.` means, and then this
 * test would be pinning something other than what ships.
 */
function matcher(source) {
  const keys = [];
  const re = pathToRegexp(source, keys);
  return (pathname) => {
    const m = re.exec(pathname);
    if (!m) return null;
    return Object.fromEntries(keys.map((k, i) => [k.name, m[i + 1]]));
  };
}

/**
 * The exact alternation the untransformed rule is built from.
 *
 * Matching on the individual extension names is NOT specific enough: the
 * derivative rule's pattern embeds the whole IMAGE_EXTENSIONS alternation, so it
 * contains both `gif` and `svg` too — and it legitimately DOES carry a
 * transformation. Selecting on the composed alternation picks out only the
 * untransformed rule.
 */
const UNTRANSFORMED_ALT = `(?:${UNTRANSFORMED_EXTENSIONS.join('|')})`;

/** The two derivative rules for the DEFAULT variant, in config order. */
const derivativeRules = rules.filter((r) => /\/styles\/:style\/public\//.test(r.source));
const defaultDerivativeRules = derivativeRules.filter((r) => !r.source.startsWith(VARIANT_PREFIX));

/**
 * Run a path through the derivative rules the way Vercel would: first match
 * wins. Returns the recovered source path, or null if no rule matched.
 */
function rewriteSourcePath(pathname) {
  for (const rule of defaultDerivativeRules) {
    const params = matcher(rule.source)(pathname);
    if (!params) continue;
    // The destination embeds `sites/default/files/:rest`; recover what :rest
    // resolved to and rebuild the legacy path the same way the URL does.
    const rest = params.rest ?? '';
    return `/sites/default/files/${rest}`;
  }
  return null;
}

// The seven derivative paths stored on /articles page 1. Every one of these
// returned 404 through the rewrite before the styles/ rule existed.
const REAL_COVERS = [
  '/sites/default/files/styles/large_cover/public/articles/cover/9Expert Cover Design 2026_0.jpg.webp',
  '/sites/default/files/styles/large_cover/public/articles/cover/excel-work-with-text-cover-for-article.png.webp',
  '/sites/default/files/styles/large_cover/public/articles/cover/powerbi-desktop-for-business.png.webp',
  '/sites/default/files/styles/large_cover/public/articles/cover/cover-dax-function-lastdate.png.webp',
  '/sites/default/files/styles/large_cover/public/articles/cover/build-dax-mesures-in-power-bi-cover.png.webp',
  '/sites/default/files/styles/large_cover/public/articles/cover/cover-dax-function-row.png.webp',
  '/sites/default/files/styles/large_cover/public/articles/cover/cover_article_อยากเขียนเว็บไซต์เริ่มตรงไหนดี_horizontal.png.webp',
];

test('every real /articles derivative cover recovers its migrated source path', () => {
  for (const p of REAL_COVERS) {
    assert.equal(
      rewriteSourcePath(p),
      resolveDerivative(p).sourcePath,
      `rewrite and resolveDerivative disagree on ${p}`,
    );
  }
});

test('the recovered path is a plain files path with no styles segment left', () => {
  for (const p of REAL_COVERS) {
    const got = rewriteSourcePath(p);
    assert.ok(got.startsWith('/sites/default/files/'), `${got} is not under the files dir`);
    assert.ok(!got.includes('/styles/'), `${got} still carries a styles segment`);
    assert.ok(!got.includes('/public/'), `${got} still carries a scheme segment`);
    assert.ok(!/\.(webp|avif)$/.test(got) || /\.(png|jpe?g|gif)\.(webp|avif)$/.test(p) === false,
      `${got} kept an appended format extension`);
  }
});

test('the Thai-named cover survives the strip with its name intact', () => {
  const p = REAL_COVERS[6];
  assert.equal(
    rewriteSourcePath(p),
    '/sites/default/files/articles/cover/cover_article_อยากเขียนเว็บไซต์เริ่มตรงไหนดี_horizontal.png',
  );
});

test('a style that appended nothing still has its styles/public segments stripped', () => {
  const p = '/sites/default/files/styles/thumbnail/public/articles/cover/plain.png';
  assert.equal(rewriteSourcePath(p), '/sites/default/files/articles/cover/plain.png');
  assert.equal(rewriteSourcePath(p), resolveDerivative(p).sourcePath);
});

// ── THE NARROW-STRIP RULE ───────────────────────────────────────────────────
// Strip only when the last extension is a format Drupal converts to AND the
// extension underneath is itself an image extension. Getting this wrong
// invents filenames that were never uploaded.

test('an ambiguous dotted name is NOT stripped — report.2024.webp keeps its name', () => {
  const p = '/sites/default/files/styles/large_cover/public/docs/report.2024.webp';
  // `2024` is not an image extension, so `.webp` is the real extension of a
  // dotted filename, not a Drupal conversion. Stripping would invent
  // `report.2024`, which does not exist.
  assert.equal(rewriteSourcePath(p), '/sites/default/files/docs/report.2024.webp');
  assert.equal(rewriteSourcePath(p), resolveDerivative(p).sourcePath);
});

test('a doubly-converted name strips exactly one layer', () => {
  const p = '/sites/default/files/styles/large_cover/public/a/foo.png.webp.webp';
  assert.equal(rewriteSourcePath(p), '/sites/default/files/a/foo.png.webp');
  assert.equal(rewriteSourcePath(p), resolveDerivative(p).sourcePath);
});

test('a nested derivative path keeps every intermediate directory', () => {
  const p = '/sites/default/files/styles/wide/public/a/b/c/deep-cover.jpg.webp';
  assert.equal(rewriteSourcePath(p), '/sites/default/files/a/b/c/deep-cover.jpg');
  assert.equal(rewriteSourcePath(p), resolveDerivative(p).sourcePath);
});

// ── CONTROLS ────────────────────────────────────────────────────────────────
// Each of these must FAIL to match. A rule that matches everything would make
// every assertion above pass while breaking ordinary source paths.

test('CONTROL — an ordinary source path is not touched by the derivative rules', () => {
  const p = '/sites/default/files/articles/cover/cover-article-what-is-manus.png';
  assert.equal(rewriteSourcePath(p), null, 'the derivative rule swallowed a plain source path');
  assert.equal(resolveDerivative(p), null, 'resolveDerivative should not call this a derivative');
});

test('CONTROL — a styles path outside the files dir is not matched', () => {
  assert.equal(rewriteSourcePath('/images/styles/large_cover/public/a/foo.png.webp'), null);
});

// ── THE SINGLE-DEFINITION PROPERTY ──────────────────────────────────────────
// The whole point of src/lib/legacyTransforms.mjs is that a width or a format
// exists in exactly one place. These pin that the config reads from it rather
// than restating it, and that a stored reference never needs to carry one.

/**
 * The transformation an image destination asks for, or '' for untransformed.
 *
 * Cloudinary's URL grammar puts the transformation between `/image/upload/`
 * and the public id, and OMITS the segment entirely when there is none — so
 * "no transformation" and "a transformation" are told apart by whether the
 * next segment is the legacy prefix, not by an empty slot.
 */
function transformOf(destination) {
  const after = destination.split('/image/upload/')[1];
  if (after === undefined) return null;
  return after.startsWith(`${LEGACY_PREFIX}/`) ? '' : after.slice(0, after.indexOf('/'));
}

test('every image destination carries a transformation from DELIVERY_VARIANTS', () => {
  const known = new Set(Object.values(DELIVERY_VARIANTS));
  const imageRules = rules.filter((r) => r.destination.includes('/image/upload/'));
  assert.ok(imageRules.length > 0, 'no image rules found — the config shape changed');

  for (const r of imageRules) {
    const transform = transformOf(r.destination);
    assert.notEqual(transform, null, `cannot read a transformation slot out of ${r.destination}`);
    // Untransformed is legitimate and is how SVG is delivered.
    if (transform === '') continue;
    assert.ok(
      known.has(transform),
      `${transform} is not in DELIVERY_VARIANTS — a transformation was written somewhere else`,
    );
  }
});

test('no delivery rule ever emits a content-negotiated transformation', () => {
  // f_auto / q_auto / dpr_auto / w_auto make Cloudinary answer `private` with a
  // `Vary`, which defeats Vercel's edge cache on every request. Measured: MISS
  // four times out of four, against MISS-HIT-HIT-HIT for the fixed string.
  for (const r of rules) {
    assert.doesNotMatch(
      r.destination,
      /\b(f_auto|q_auto|dpr_auto|w_auto)\b/,
      `${r.destination} requests a negotiated transformation and will never edge-cache`,
    );
  }
});

test('svg AND gif are delivered untransformed on every variant', () => {
  // Was svg-only. gif joined it for the opposite reason: an SVG breaks because
  // transforming it RASTERISES, a large animated GIF breaks because Cloudinary
  // REFUSES the transform past 50 Mpx summed over frames and returns 400.
  //
  // The set is pinned LITERALLY and not read from the constant. Deriving the
  // expectation from the value under test makes a test that cannot see that
  // value change — measured: dropping 'gif' from UNTRANSFORMED_EXTENSIONS left
  // three of these assertions green, because they had quietly become
  // "whatever the constant says, the rules agree with it".
  assert.deepEqual([...UNTRANSFORMED_EXTENSIONS], ['svg', 'gif']);

  const untransformedRules = rules.filter((r) => r.source.includes(UNTRANSFORMED_ALT));
  assert.ok(
    untransformedRules.length >= 4,
    `expected one untransformed rule per root, found ${untransformedRules.length}`,
  );
  for (const r of untransformedRules) {
    assert.match(
      r.destination,
      /\/image\/upload\/9exp-genesis\//,
      `${r.destination} carries a transformation for an untransformed extension`,
    );
  }
});

test('a .gif and a .svg path both resolve to an UNTRANSFORMED delivery URL', () => {
  // The end-to-end shape, per extension, routed the way Vercel would. LITERAL
  // extensions on purpose — see the note in the test above.
  for (const ext of ['svg', 'gif']) {
    const pathname = `/images/line/logoexcel2.${ext}`;
    const hit = rules.find((r) => matcher(r.source)(pathname));
    assert.ok(hit, `nothing matched ${pathname}`);
    assert.match(hit.destination, /\/image\/upload\/9exp-genesis\//, hit.destination);
    for (const t of Object.values(DELIVERY_VARIANTS)) {
      assert.ok(!hit.destination.includes(t), `${ext} destination carries "${t}": ${hit.destination}`);
    }
  }
});

test('the two GIFs that returned 400 now route untransformed', () => {
  // Measured on the deployed site before this change: both returned HTTP 400
  // with x-cld-error "Maximum total number of pixels in all frames/pages is 50
  // Megapixels" — 1920x1080 at 119 and 54 frames. The assets were always fine;
  // only the transform was refused.
  for (const p of ['/images/line/logoexcel1.gif', '/images/line/logoexcel2.gif']) {
    const hit = rules.find((r) => matcher(r.source)(p));
    assert.ok(hit, `nothing matched ${p}`);
    // The rule is per-ROOT, so `:rest` carries `line/logoexcel1.gif` — the
    // destination names the root, not the subdirectory.
    assert.equal(
      hit.destination,
      `https://res.cloudinary.com/ddva7xvdt/image/upload/${LEGACY_PREFIX}/images/:rest`,
      `${p} must reach untransformed image/upload`,
    );
  }
});

test('CONTROL: a .png still carries the default transformation', () => {
  // The exclusion has to stay NARROW. If it widened to every image, the whole
  // bandwidth argument for a fixed transformation would be gone.
  const hit = rules.find((r) => matcher(r.source)('/images/line/logoexcel2.png'));
  assert.ok(hit.destination.includes(DELIVERY_VARIANTS.default), hit.destination);
});

test('the untransformed rule PRECEDES the image catch-all for every root', () => {
  // The catch-all matches any path under its root, so a later untransformed rule
  // could never fire and every GIF would go back to 400ing.
  for (const root of LEGACY_ROOTS) {
    const untransformedIdx = rules.findIndex(
      (r) => r.source.startsWith(`/${root}/`) && r.source.includes(UNTRANSFORMED_ALT),
    );
    const catchAllIdx = rules.findIndex((r) => r.source === `/${root}/:rest*`);
    assert.ok(untransformedIdx >= 0, `no untransformed rule for ${root}`);
    assert.ok(catchAllIdx >= 0, `no image catch-all for ${root}`);
    assert.ok(
      untransformedIdx < catchAllIdx,
      `${root}: untransformed rule at ${untransformedIdx} must precede the catch-all at ${catchAllIdx}`,
    );
  }
});

test('a width variant changes the transformation and nothing else', () => {
  const at = `${VARIANT_PREFIX}/w800`;
  const variantRules = rules.filter((r) => r.source.startsWith(at));
  assert.ok(variantRules.length > 0, 'the w800 variant emitted no rules');

  // Every raster rule under the prefix must carry w800's transformation...
  const raster = variantRules.filter((r) => r.destination.includes(DELIVERY_VARIANTS.w800));
  assert.ok(raster.length > 0, 'no w800 rule carries the w800 transformation');

  // ...and the prefix must otherwise be a transparent alias: stripping it from
  // a variant source yields a source the default set also serves.
  const defaultSources = new Set(rules.filter((r) => !r.source.startsWith(VARIANT_PREFIX)).map((r) => r.source));
  for (const r of variantRules) {
    const stripped = r.source.slice(at.length);
    assert.ok(
      defaultSources.has(stripped),
      `${r.source} has no counterpart in the default rules — the prefix is not a transparent alias`,
    );
  }
});

test('the stored path itself never contains a transformation', () => {
  // Every `source` is what a reference in the database looks like. If a width
  // or format ever appears in one, we have rebuilt the styles/large_cover trap
  // that this whole migration exists to undo.
  for (const r of rules) {
    assert.doesNotMatch(
      r.source,
      /\b(?:f_webp|f_avif|q_\d+|w_\d+|c_limit|f_auto|q_auto)\b/,
      `${r.source} bakes a rendering decision into a stored path`,
    );
  }
});
