import {
  DELIVERY_VARIANTS,
  VARIANT_PREFIX,
  UNTRANSFORMED_TRANSFORM,
  UNTRANSFORMED_EXTENSIONS,
  LEGACY_PREFIX,
  LEGACY_ROOTS,
  RAW_EXTENSION_LIST,
  NO_STORE_DOCUMENT_EXTENSIONS,
  FILES_DIR,
  DERIVATIVE_SOURCE_PATTERN,
  DERIVATIVE_APPENDED_PATTERN,
} from './src/lib/legacyTransforms.mjs';
import { LEGACY_BLOB_FILES } from './src/lib/legacyBlobFiles.mjs';
import { webrootRewrites } from './src/lib/webrootDocuments.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Default Server Action body limit is 1 MB. Banner / promotion-banner
  // / instructor-portrait uploads frequently exceed that and surface as
  // either `write ECONNRESET` or `Unexpected end of form` (the request
  // body gets truncated mid-stream and the multipart parser explodes).
  // 25 MB covers typical phone-camera JPEGs (8–15 MB) plus headroom.
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },

  // Remote images. Add new hostnames here when next/image throws
  // "hostname X is not configured" — Vercel will refuse to optimize
  // any host not in this list.
  images: {
    remotePatterns: [
      // Cloudinary — covers all cloud accounts (cloud_name is in the path)
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
      // Project-specific Cloudinary subdomain (defensive — the standard
      // res.cloudinary.com pattern above already covers /ddva7xvdt/...)
      { protocol: 'https', hostname: 'ddva7xvdt.res.cloudinary.com', pathname: '/**' },
      // Legacy CDN bucket
      { protocol: 'https', hostname: '9expert-cdn.s3.ap-southeast-1.amazonaws.com', pathname: '/**' },
      // Production site assets — program roadmaps, skill icons from upstream
      { protocol: 'https', hostname: 'www.9experttraining.com', pathname: '/**' },
      { protocol: 'https', hostname: '9experttraining.com', pathname: '/**' },
      // Upstream API host — in case any item URL points here directly
      { protocol: 'https', hostname: '9exp-sec.com', pathname: '/**' },
      // MSDB public host — serves outline `download_url` streaming routes.
      // Used in <a href> (not next/image), so this is defensive in case a
      // course asset URL ever points here directly.
      { protocol: 'https', hostname: 'msdb.9expert.app', pathname: '/**' },
      // YouTube thumbnails — used by the YouTubeFacade in HeroBannerCarousel
      { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' },
    ],
  },

  // Redirect "Online" menu to external academy subdomain.
  // Also redirect the legacy singular /promotion path to /promotions —
  // the placeholder used to live at /promotion, the real list is plural.
  //
  // ── SKILL CATALOG SLUGS RENAMED UPSTREAM ──────────────────────────────────
  // A skill renamed upstream leaves its OLD catalog URL behind with real SEO
  // history, and the catch-all does NOT 404 it. Measured 2026-08-04 for
  // /rpa-all-courses: upstream renamed the skill RPA → Automation and changed
  // `skill_id` RPA → AUT (the `_id` did not change), so
  // resolveSkillBySlug('rpa-all-courses') can no longer match the still-present
  // SkillPageConfig row to any upstream skill. loadSkill() returns null, the
  // request falls through to the generic `-all-courses` branch in
  // src/app/(public)/[...slug]/page.jsx, and that branch calls
  // listPublicCourses() with NO filter — so the URL returns 200 with the
  // ENTIRE catalog under an H1 of the raw slug. A soft-404: indexable, and
  // indistinguishable from a working page to anything that isn't reading it.
  //
  // The redirect is here rather than in the database because a permanent
  // redirect is a promise to search engines that outlives the row that
  // prompted it, and this file is where such a promise can be reviewed in a
  // diff. Renaming a skill again means adding a line here, deliberately.
  async redirects() {
    return [
      {
        source: '/online-course',
        destination: 'https://academy.9experttraining.com',
        permanent: true,
      },
      {
        source: '/online-course/:path*',
        destination: 'https://academy.9experttraining.com/:path*',
        permanent: true,
      },
      {
        source: '/promotion',
        destination: '/promotions',
        permanent: true,
      },
      {
        source: '/rpa-all-courses',
        destination: '/automation-all-courses',
        permanent: true,
      },
    ];
  },

  // ── THE LEGACY DELIVERY LAYER ─────────────────────────────────────────────
  //
  // 1616 files migrated off the old Drupal site now live in Cloudinary. These
  // rules serve them at their ORIGINAL URLs, so a link somebody pasted into an
  // email in 2019 still resolves.
  //
  // Everything here is an EXTERNAL rewrite: Vercel's edge proxies straight to
  // Cloudinary, no function of ours runs, and the edge cache absorbs repeat
  // requests. That is what keeps a 25-credit Cloudinary plan — of which
  // bandwidth is 67.8% of spend, with 7.8 credits left — from becoming the
  // thing that takes the site down. Routing any of this through a route
  // handler is a bandwidth decision, not a tidy-up.
  //
  // ── NO TRANSFORMATION STRING APPEARS IN THIS FILE ──────────────────────────
  // They all come from src/lib/legacyTransforms.mjs, which is also what the
  // resolver route reads. Read that file's header before changing a width or a
  // format: the choice of a FIXED transformation over f_auto is the difference
  // between an edge cache HIT and re-billing Cloudinary on every request, and
  // it is measured, not preferred.
  //
  // ── HOW THE DESTINATION IS DERIVED ─────────────────────────────────────────
  // It must match src/lib/legacyPublicId.js exactly, and it does — because of a
  // convenience worth stating outright:
  //
  //   image: public_id is the path MINUS the extension, and Cloudinary appends
  //          the format back as a suffix. `<publicId>.<ext>` is therefore
  //          character-for-character the ORIGINAL PATH. Nothing needs splitting.
  //   raw:   public_id KEEPS the extension, and raw delivery has no format
  //          suffix. Also the original path.
  //
  // So both cases are a straight passthrough of the legacy path onto a prefix,
  // and the ONLY thing the rule has to decide is `image/upload` vs `raw/upload`
  // — which is why the raw rules come first and are keyed on extension.
  //
  // ── WHAT THIS RULE CANNOT DO, BY CONSTRUCTION ──────────────────────────────
  // A static rewrite is a pattern, not a lookup. It cannot reach:
  //   · the 12 files whose public_id was substituted (`&`→`and`, trailing-space
  //     trim) — their id is NOT their path, and the transformation is lossy and
  //     not invertible by a rule;
  //   · the 1 superseded file, which was never uploaded under its own id.
  // Those 13 are exactly the case the fallback resolver would exist for. The
  // failure mode is measured and reported rather than designed around here.
  //
  // ── DRUPAL DERIVATIVE PATHS ARE HANDLED, DELIBERATELY REDUNDANTLY ─────────
  // A stored reference may point at a Drupal image-style derivative
  // (`styles/large_cover/public/foo.png.webp?itok=…`) rather than the source.
  // Only sources were migrated, so those 404 — measured: 7 of the 12 covers on
  // /articles page 1. The rules below recover the source by pattern.
  //
  // Phase 2 will rewrite those references away, which makes this redundant on
  // purpose: it keeps the site working in the window between deploying delivery
  // and finishing the rewrite, and it keeps a derivative URL somebody copied
  // years ago resolving afterwards.
  async rewrites() {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME ?? 'ddva7xvdt';
    const base = `https://res.cloudinary.com/${cloud}`;
    const prefix = LEGACY_PREFIX;
    const rawExt = RAW_EXTENSION_LIST.join('|');

    const image = (transform, id) =>
      `${base}/image/upload/${transform ? `${transform}/` : ''}${prefix}/${id}`;

    /**
     * Every rule for one delivery variant.
     *
     * `at` is the URL prefix the variant answers on — '' for the stored path
     * itself, '/_img/w800' for a component asking for a narrower render. The
     * SAME rules are generated for each, so a variant prefix is a transparent
     * alias: it changes the raster transformation and nothing else. Documents
     * and SVG are included so that prefixing any legacy URL is always safe,
     * even though neither has a width.
     */
    const rulesFor = (at, transform) => [
      // ── DERIVATIVES FIRST ───────────────────────────────────────────────
      // These must precede the ampersand and catch-all rules for the same
      // root: a styles/ path IS a `sites/default/files` path, and whichever
      // rule is listed first wins.
      //
      // Case 1: Drupal appended a format extension. `foo.png.webp` → `foo.png`.
      // The pattern comes from src/lib/legacyTransforms.mjs so it shares its
      // vocabulary with resolveDerivative(); test/pure/legacyDerivativeRewrite
      // .test.mjs pins that the two actually agree.
      //
      // `:appended` is captured but unused, so Next forwards it to the
      // destination as a query param. Verified harmless: Cloudinary ignores
      // unknown query params and still answers `public` with identical bytes.
      // The `?itok=` HMAC rides along the same way — it cannot be validated
      // and does not need to be.
      {
        source: `${at}${FILES_DIR}/styles/:style/public/:rest(${DERIVATIVE_SOURCE_PATTERN}).:appended(${DERIVATIVE_APPENDED_PATTERN})`,
        destination: image(transform, `${FILES_DIR.slice(1)}/:rest`),
      },
      // Case 2: a style that did not convert format, so nothing was appended.
      // An ordinary source path wearing a styles/ prefix.
      {
        source: `${at}${FILES_DIR}/styles/:style/public/:rest*`,
        destination: image(transform, `${FILES_DIR.slice(1)}/:rest*`),
      },

      ...LEGACY_ROOTS.flatMap((root) => [
        // ── FALLBACK, and ONLY for what the pattern provably cannot say ────
        // A path containing `&` or `#` goes to the resolver, which looks the
        // file up by its stored source path. Measured: the derived Cloudinary
        // URL for these returns HTTP 400, because both characters are refused
        // in a public_id and the migration substituted them (`&`→`and`,
        // `#`→`sharp`) — lossy, non-invertible rules.
        //
        // Narrow ON PURPOSE. It matches 19 paths: the 6 ampersand files and the
        // 13 C# ones. Everything else stays on the static path below, where no
        // function of ours runs.
        //
        // OF THOSE 19, ONLY THE 6 ARE UPLOADED TODAY. The 13 C# files are found
        // but not yet migrated (see scripts/backfill-legacy-tree.mjs), so they
        // currently reach the resolver and get its explicit 404 `resolver-miss`.
        // That is deliberately the better failure: routing them here now means
        // the day they upload they resolve with no config change, and until then
        // the miss names the file instead of surfacing an opaque Cloudinary 400.
        //
        // BOTH SPELLINGS OF EACH. Next matches on the RAW pathname, so a client
        // that percent-encodes sends `%26`/`%23` and the literal character never
        // appears. Measured for `&`: matching only `&` let every encoded request
        // fall through to the Cloudinary rule and return HTTP 400 — 0 of 6
        // resolved, while the same URLs with a literal `&` worked.
        //
        // For `#` the encoded form is the ONLY one that can ever arrive: a
        // literal `#` is the URL fragment delimiter, so the client strips it and
        // everything after it before sending. `%23` is therefore load-bearing
        // here, not defensive — the literal alternative is kept only so the
        // pattern reads the same as the ampersand case and so a server-side
        // caller passing an unencoded path still matches.
        //
        // The resolver serves the DEFAULT variant regardless of `at`. Nineteen
        // files is not worth threading a variant through a database lookup.
        {
          source: `${at}/${root}/:rest(.*(?:&|%26|#|%23).*)`,
          destination: `/legacy-file/${root}/:rest`,
        },
        // RAW: the extension decides, so this has to win over the image
        // catch-all below. The custom regex spans slashes deliberately — the
        // remainder can be several segments deep.
        {
          source: `${at}/${root}/:rest(.*\\.(?:${rawExt}))`,
          destination: `${base}/raw/upload/${prefix}/${root}/:rest`,
        },
        // UNTRANSFORMED EXTENSIONS — svg and gif. See UNTRANSFORMED_EXTENSIONS
        // in legacyTransforms.mjs for both measurements: transforming an SVG
        // RASTERISES it, and a large animated GIF cannot be transformed at all
        // (Cloudinary caps a transform at 50 Mpx summed over frames and returns
        // 400 past it — two real files were 400ing on the deployed site).
        //
        // These MUST precede the image catch-all below, which would otherwise
        // claim them and re-apply the transformation.
        {
          source: `${at}/${root}/:rest(.*\\.(?:${UNTRANSFORMED_EXTENSIONS.join('|')}))`,
          destination: image(UNTRANSFORMED_TRANSFORM, `${root}/:rest`),
        },
        // IMAGE catch-all. `:rest*` carries the extension through untouched,
        // which is exactly what Cloudinary wants as the format suffix.
        {
          source: `${at}/${root}/:rest*`,
          destination: image(transform, `${root}/:rest*`),
        },
      ]),
    ];

    // ── THE THREE WEBROOT DOCUMENTS ───────────────────────────────────────
    //
    // Not part of the Cloudinary migration: they are not in the database, were
    // never migrated, and two of them exceed Cloudinary's per-asset ceiling on
    // any plan we would consider (raw limit 10 MB; the catalog is 42.6 MiB).
    // They live on Vercel Blob instead — see scripts/upload-webroot-documents.mjs.
    //
    // ⚠ THREE EXPLICIT RULES. NEVER A CATCH-ALL. ⚠
    //
    // These URLs sit at the SITE ROOT, which is where every application page
    // also lives. A rule like `/:file(.*\.pdf)` reads as equivalent and is one
    // bad regex away from swallowing `/promotions`, `/schedule` or the whole
    // `[...slug]` route. Each filename is named literally. A fourth document
    // means a fourth line here, written deliberately, in a diff someone reads.
    //
    // Inert until BLOB_PUBLIC_BASE is set: with no store provisioned there is
    // nothing to point at, and emitting rules to an undefined origin would
    // turn three working legacy URLs into three broken ones.
    // The list and the destination shape both come from src/lib/webrootDocuments
    // .mjs, so the delivery harness cannot drift from what is actually served.
    // Still THREE EXPLICIT RULES: webrootRewrites() maps a frozen literal list
    // and emits nothing when there is no store — it is not a pattern.
    const blobBase = process.env.BLOB_PUBLIC_BASE;
    const webrootDocuments = webrootRewrites(blobBase);

    // ── FILES SERVED FROM VERCEL BLOB, NOT CLOUDINARY ─────────────────────
    //
    // 16 files Cloudinary cannot hold — 11 over its 10 MB raw ceiling, and 5
    // MP3s that are both over it and unroutable by any Cloudinary rule, since
    // `mp3` is in neither extension set.
    //
    // ONE RULE PER FILE, and unavoidably so: Cloudinary delivery is derived by
    // PATTERN (public_id IS the path), which is why a handful of rules serve
    // ~2,900 files. A blob pathname carries no such guarantee, so there is
    // nothing to pattern-match on.
    //
    // The list is GENERATED from the upload run — src/lib/legacyBlobFiles.mjs,
    // written by scripts/backfill-upload-blob.mjs — because a hand-kept list of
    // 16 paths and a store holding 16 objects drift, and the drift is a 404 for
    // a file that uploaded perfectly well.
    //
    // ⚠ ORDER IS LOAD-BEARING. These MUST precede the /files/ and /images/
    // rules below. Those roots are in LEGACY_ROOTS, so their catch-all matches
    // every one of these paths and would send them to Cloudinary — where the
    // large files do not exist and the MP3s never could. First match wins, so
    // being listed first is the entire mechanism.
    //
    // Inert until BLOB_PUBLIC_BASE is set, for the same reason as the webroot
    // documents: pointing a rewrite at an undefined origin would turn a 404
    // into a broken destination, which is harder to diagnose and no better.
    const blobFiles = blobBase
      ? LEGACY_BLOB_FILES.map(({ publicPath, blobPathname }) => ({
        source: publicPath,
        destination: `${blobBase}/${blobPathname}`,
      }))
      : [];

    return [
      ...webrootDocuments,
      ...blobFiles,
      // Named variants first: `/_img/w800/sites/…` must not be eaten by the
      // default rules, which would treat `_img` as an unknown root and miss.
      ...Object.entries(DELIVERY_VARIANTS)
        .filter(([name]) => name !== 'default')
        .flatMap(([name, transform]) => rulesFor(`${VARIANT_PREFIX}/${name}`, transform)),
      ...rulesFor('', DELIVERY_VARIANTS.default),
    ];
  },

  async headers() {
    const securityHeaders = [
      // Start CSP in Report-Only mode first — switch to enforcing after
      // verifying no violations in Vercel logs (change key to
      // 'Content-Security-Policy' when ready to enforce).
      {
        key: 'Content-Security-Policy-Report-Only',
        value: [
          "default-src 'self'",
          "img-src 'self' https://res.cloudinary.com https://ddva7xvdt.res.cloudinary.com https://9expert-cdn.s3.ap-southeast-1.amazonaws.com https://www.9experttraining.com https://9experttraining.com https://9exp-sec.com https://msdb.9expert.app https://i.ytimg.com https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.google-analytics.com https://www.google.com https://www.google.co.th https://googleads.g.doubleclick.net https://www.googleadservices.com data: blob:",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.omise.co https://www.youtube.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net",
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self' data:",
          "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
          "connect-src 'self' https://api.omise.co https://9exp-sec.com https://msdb.9expert.app https://res.cloudinary.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://googleads.g.doubleclick.net https://www.google.com https://www.google.co.th https://region1.google-analytics.com https://stats.g.doubleclick.net",
          "media-src 'self' blob:",
          "frame-ancestors 'self'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      },
      { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options',   value: 'nosniff' },
      { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
    ];

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // ── DOCUMENTS ARE HELD OUT OF THE EDGE CACHE. THIS IS LOAD-BEARING. ───
      //
      // Vercel returns HTTP 200 — not 206 — for a Range request served from a
      // cache HIT, with a correct Content-Range and a correct partial body. A
      // client that checks the status code then treats a 1.2 MB PDF as
      // complete and renders a truncated document. On a cache MISS the 206
      // passes through correctly.
      //
      // Holding documents out of the cache is therefore the fix, and it is
      // MEASURED to work: a ranged request on a migrated PDF returns 206 four
      // times running with this rule in place. Deleting it silently corrupts
      // large-PDF delivery for any client that streams — which is every
      // browser's built-in PDF viewer, because they read the header, seek to
      // the xref table at the tail, and pull page 1 before downloading the
      // rest.
      //
      // The cost is that documents re-fetch Cloudinary on every request. That
      // is accepted: they are a small fraction of requests, and a truncated
      // contract PDF is not a bandwidth problem.
      {
        source: `/:rest(.*\\.(?:${NO_STORE_DOCUMENT_EXTENSIONS.join('|')}))`,
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        ],
      },
      // ── REMOVED: the `public` Cache-Control override on legacy image paths ─
      //
      // It attempted to recover the edge cache for f_auto by overriding
      // Cloudinary's `private` from our side. Measured on a preview: it does
      // not work. x-vercel-cache stayed MISS on all four fetches while the
      // response the BROWSER saw said `public, max-age=2592000` — so the only
      // thing the override changed was that browsers were told to cache a
      // content-negotiated response for 30 days with no `Vary`, which is a
      // correctness hazard and not a saving.
      //
      // Vercel decides from the UPSTREAM header, which we cannot override. The
      // actual fix was to stop asking for a negotiated response at all: see
      // src/lib/legacyTransforms.mjs. Fixed transformations come back `public`
      // with no `Vary` and cache normally, so nothing needs to be overridden.
    ];
  },
};

export default nextConfig;
