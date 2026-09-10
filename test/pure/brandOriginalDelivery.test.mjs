import { test } from 'node:test';
import assert from 'node:assert/strict';
import pathToRegexpPkg from 'next/dist/compiled/path-to-regexp/index.js';

const { pathToRegexp } = pathToRegexpPkg;

import nextConfig from '../../next.config.mjs';
import {
  DELIVERY_VARIANTS,
  VARIANT_PREFIX,
  BRAND_ORIGINAL_PREFIXES,
  ATTACHMENT_TRANSFORM,
  RAW_EXTENSION_LIST,
} from '../../src/lib/legacyTransforms.mjs';

/**
 * ══ WHAT THIS FILE PINS ═════════════════════════════════════════════════════
 *
 * `files/ci/` holds the 9Expert logo masters offered for download on
 * /logo-page. Under the ordinary raster rules they went out through
 * DELIVERY_VARIANTS.default, which measured on production as:
 *
 *     /files/ci/signature-nineblue.png  →  image/webp  24,948 B  inline
 *
 * WEBP bytes under a `.png` URL, resized to w_1600 and re-encoded at q_80, from
 * a master intended for print — and `inline`, so it opened in a tab instead of
 * downloading. The exemption gives that prefix `fl_attachment` and nothing
 * else, so the stored original goes out as an attachment.
 *
 * ── THE FAILURE THIS FILE EXISTS TO CATCH IS ORDERING, NOT MATCHING ─────────
 * The exemption is expressed as three rules placed BETWEEN the variant rules
 * and the default rules, and both of those neighbours matter:
 *
 *   too early — above the variant rules — and `/_img/w800/files/ci/…` stops
 *               being a thumbnail. /logo-page previews the 8000x4500 wallpaper
 *               that way; it would become a 4.6 MB attachment on page load.
 *   too late  — below the default rules — and the exemption never fires at all,
 *               because the image catch-all for root `files` matches first.
 *
 * Neither mistake throws, neither 404s, and both look right in a diff. So the
 * assertions resolve real pathnames through the REAL rewrite table the way
 * Vercel does — first match wins — rather than checking that some rule exists.
 *
 * Next's own path-to-regexp build is used deliberately: a different version
 * could disagree about backtracking or about what `.` means, and then this file
 * would be pinning something other than what ships.
 */

const rules = await nextConfig.rewrites();

function matcher(source) {
  const keys = [];
  const re = pathToRegexp(source, keys);
  return (pathname) => {
    const m = re.exec(pathname);
    if (!m) return null;
    return Object.fromEntries(keys.map((k, i) => [k.name, m[i + 1]]));
  };
}

/** The rule Vercel would pick: the FIRST whose source matches. */
const routeOf = (pathname) => rules.find((r) => matcher(r.source)(pathname)) ?? null;

/** The destination that rule sends `pathname` to, with `:rest` substituted. */
function destinationOf(pathname) {
  const rule = routeOf(pathname);
  if (!rule) return null;
  const params = matcher(rule.source)(pathname);
  return rule.destination.replace(/:rest\*?/g, params.rest ?? '');
}

/** The transformation slot of an image destination, or null if it is not one. */
function transformOf(destination) {
  const after = String(destination).split('/image/upload/')[1];
  if (after === undefined) return null;
  const head = after.split('/')[0];
  // The slot is empty when the next segment is already the Cloudinary folder.
  return head === '9exp-genesis' ? '' : head;
}

const PREFIX = BRAND_ORIGINAL_PREFIXES[0];
const LOGO = `/${PREFIX}/signature-nineblue.png`;
const WALLPAPER = `/${PREFIX}/wallpaper-desktop.png`;

test('the exemption covers a real prefix, so the paths below are not fiction', () => {
  assert.ok(BRAND_ORIGINAL_PREFIXES.length > 0, 'no prefix is exempt, so nothing below is tested');
  assert.equal(PREFIX, 'files/ci', 'the brand originals live under files/ci');
  assert.equal(ATTACHMENT_TRANSFORM, 'fl_attachment');
});

test('a brand original resolves to the UNTRANSFORMED file, not to a DELIVERY_VARIANTS URL', () => {
  for (const pathname of [LOGO, WALLPAPER]) {
    const destination = destinationOf(pathname);
    assert.ok(destination, `${pathname} matched no rewrite at all`);

    assert.equal(
      transformOf(destination),
      ATTACHMENT_TRANSFORM,
      `${pathname} → ${destination}\nA brand master must go out as the stored file.`,
    );

    // Said the other way round, against the real variant table rather than
    // against a spelling of it: NONE of the transformations may appear.
    for (const [name, variant] of Object.entries(DELIVERY_VARIANTS)) {
      assert.ok(
        !destination.includes(variant),
        `${pathname} still carries the "${name}" transformation (${variant}). ` +
          `That is the w_1600 q_80 WEBP-under-a-.png-URL defect this exemption removes.`,
      );
    }

    // ...and the URL still names the stored asset, so the delivered file keeps
    // its own extension. A destination that dropped `.png` would satisfy the
    // assertions above and still hand over a mislabelled file.
    assert.ok(destination.endsWith(pathname.replace(/^\//, '')), destination);
  }
});

test('a path under files/ but NOT under ci/ still gets the transformed default', () => {
  // THIS IS THE ASSERTION THAT PROVES THE EXEMPTION IS SCOPED. Without it,
  // adding `png` to UNTRANSFORMED_EXTENSIONS — which would send every one of
  // ~2,900 migrated images out at full size — would pass every other test here.
  const neighbours = [
    '/files/2019/03/some-article-cover.png',
    '/files/inline-images/diagram.png',
    // Adjacent by name, and deliberately so: a prefix match on `files/ci`
    // rather than on `files/ci/` would swallow this one too.
    '/files/cinema-seating-plan.png',
  ];

  for (const pathname of neighbours) {
    const destination = destinationOf(pathname);
    assert.ok(destination, `${pathname} matched no rewrite at all`);
    assert.equal(
      transformOf(destination),
      DELIVERY_VARIANTS.default,
      `${pathname} → ${destination}\nOnly ${PREFIX}/ is exempt; this path is not under it.`,
    );
  }
});

test('files/ci-svg/ is untouched — it already worked', () => {
  // SVG lands in UNTRANSFORMED_EXTENSIONS and Cloudinary returns `attachment`
  // for image/svg+xml of its own accord, so this prefix needed no exemption.
  // Asserted anyway: the change is next door, and "already correct" is exactly
  // the kind of thing a neighbouring rule quietly claims.
  const destination = destinationOf('/files/ci-svg/signature-nineblue.svg');
  assert.ok(destination, 'the svg path matched no rewrite at all');
  assert.equal(transformOf(destination), '', 'svg is delivered with an empty transformation');
  assert.ok(
    !destination.includes(ATTACHMENT_TRANSFORM),
    `the svg rule has been pulled into the brand-original exemption: ${destination}`,
  );
});

test('the /_img/ prefixed form still resolves to its variant', () => {
  // /logo-page previews the 8000x4500 wallpaper this way — 14,286 B of webp
  // against 4,846,891 B for the original. If the exemption swallowed this form
  // the preview would become the download.
  const variantNames = Object.keys(DELIVERY_VARIANTS).filter((n) => n !== 'default');
  assert.ok(variantNames.length > 0, 'no named variant exists, so this test asserts nothing');

  for (const name of variantNames) {
    const pathname = `${VARIANT_PREFIX}/${name}${WALLPAPER}`;
    const destination = destinationOf(pathname);
    assert.ok(destination, `${pathname} matched no rewrite at all`);
    assert.equal(
      transformOf(destination),
      DELIVERY_VARIANTS[name],
      `${pathname} → ${destination}\nThe variant prefix is an explicit request for a ` +
        `rendered thumbnail and must survive the brand-original exemption.`,
    );
    assert.notEqual(transformOf(destination), ATTACHMENT_TRANSFORM);
  }
});

test('ORDER: the exemption sits after the variant rules and before the default ones', () => {
  // The property the three tests above depend on, asserted directly on the
  // table so a failure names the cause rather than a symptom.
  const indexOfFirst = (predicate) => rules.findIndex(predicate);

  const firstVariantRule = indexOfFirst((r) => r.source.startsWith(`${VARIANT_PREFIX}/`));
  const firstBrandRule = indexOfFirst((r) => r.destination.includes(`/${ATTACHMENT_TRANSFORM}/`));
  const firstDefaultRule = indexOfFirst((r) => r.destination.includes(DELIVERY_VARIANTS.default));

  assert.notEqual(firstVariantRule, -1, 'no variant rule is emitted');
  assert.notEqual(firstBrandRule, -1, 'no brand-original rule is emitted');
  assert.notEqual(firstDefaultRule, -1, 'no default rule is emitted');

  assert.ok(
    firstVariantRule < firstBrandRule,
    'a brand-original rule precedes the variant rules, so /_img/… would be swallowed',
  );
  assert.ok(
    firstBrandRule < firstDefaultRule,
    'the default rules precede the exemption, so the exemption never fires',
  );
});

test('the neighbouring rules of the exempt prefix are unchanged', () => {
  // The exemption copies the per-root chain rather than emitting the catch-all
  // alone. Being listed FIRST, a lone catch-all would claim these two cases too
  // and send them to image/upload, which answers 400 for both.
  const raw = destinationOf(`/${PREFIX}/9expert-brand-guideline.pdf`);
  assert.match(raw, /\/raw\/upload\//, `a document under ${PREFIX}/ must stay a raw asset: ${raw}`);
  assert.ok(RAW_EXTENSION_LIST.includes('pdf'));

  const substituted = destinationOf(`/${PREFIX}/logo%26mark.png`);
  assert.match(
    substituted,
    /^\/legacy-file\//,
    `a substitution-carrying name under ${PREFIX}/ must reach the resolver: ${substituted}`,
  );
});
