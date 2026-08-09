import { test } from 'node:test';
import assert from 'node:assert/strict';
import pathToRegexpPkg from 'next/dist/compiled/path-to-regexp/index.js';

const { pathToRegexp } = pathToRegexpPkg;

import nextConfig from '../../next.config.mjs';
import { LEGACY_BLOB_FILES } from '../../src/lib/legacyBlobFiles.mjs';
import { NO_STORE_DOCUMENT_EXTENSIONS, RAW_EXTENSION_LIST } from '../../src/lib/legacyTransforms.mjs';
import { documentContentType } from '../../src/lib/legacyDelivery.js';

// ── WHAT THIS FILE PINS ─────────────────────────────────────────────────────
//
// 19 legacy files cannot live on Cloudinary — its raw ceiling is 10 MB on any
// plan this project would consider and one of them is 42.6 MiB. They are on
// Vercel Blob, and reaching them is structurally different from everything else
// in the delivery layer:
//
//   Cloudinary  public_id IS the path → a handful of PATTERN rules serve ~2,900
//               files with no lookup and no per-file maintenance.
//   Blob        a pathname is whatever it was named → ONE RULE PER FILE.
//
// So there is a generated manifest (src/lib/legacyBlobFiles.mjs) and 16 rewrites
// built from it, plus 3 hand-written ones for the webroot documents.
//
// ── THE FAILURE THIS FILE EXISTS TO CATCH ───────────────────────────────────
// /files and /images are in LEGACY_ROOTS, so the Cloudinary catch-all matches
// every one of these paths too. First match wins, so if a blob rule is ever
// emitted AFTER the catch-all, the request goes to Cloudinary — where the large
// files do not exist and the MP3s never could. Nothing throws; the URL just
// 404s. Order is the entire mechanism, so order is asserted directly.
//
// ── WHY env IS SET INSIDE THE TESTS ─────────────────────────────────────────
// rewrites() reads process.env.BLOB_PUBLIC_BASE at CALL time, and the rules are
// deliberately inert without it — pointing a rewrite at an undefined origin
// would turn a 404 into a broken destination, which is harder to diagnose and no
// better. That inertness is itself a tested property, so this file calls
// rewrites() both ways rather than assuming either.

const BASE = 'https://testblobstore.public.blob.vercel-storage.com';

async function rewritesWithBase(base) {
  const prev = process.env.BLOB_PUBLIC_BASE;
  if (base === undefined) delete process.env.BLOB_PUBLIC_BASE;
  else process.env.BLOB_PUBLIC_BASE = base;
  try {
    return await nextConfig.rewrites();
  } finally {
    if (prev === undefined) delete process.env.BLOB_PUBLIC_BASE;
    else process.env.BLOB_PUBLIC_BASE = prev;
  }
}

function matcher(source) {
  const keys = [];
  const re = pathToRegexp(source, keys);
  return (pathname) => re.test(pathname);
}

const activeRules = await rewritesWithBase(BASE);
const inertRules = await rewritesWithBase(undefined);

/** First matching rule, the way Vercel resolves it. */
const routeOf = (rules, pathname) => rules.find((r) => matcher(r.source)(pathname)) ?? null;

const WEBROOT_PDFS = [
  '/how-to-create-chatgpt-account.pdf',
  '/9expert-company-profile.pdf',
  '/9expert-training-course-catalog.pdf',
];

test('the manifest holds exactly the 16 Cloudinary-impossible files, 5 of them mp3', () => {
  // Pinned, not floored. The set is a consequence of a 10 MB ceiling and one
  // unroutable extension; a change to either is a decision, not a drift.
  assert.equal(LEGACY_BLOB_FILES.length, 16);
  assert.equal(LEGACY_BLOB_FILES.filter((f) => f.publicPath.endsWith('.mp3')).length, 5);
});

test('every manifest entry mirrors its public path as the blob pathname', () => {
  // The convention that makes the mapping readable and a re-upload idempotent.
  for (const { publicPath, blobPathname } of LEGACY_BLOB_FILES) {
    assert.ok(publicPath.startsWith('/'), publicPath);
    assert.equal(blobPathname, publicPath.slice(1), publicPath);
  }
});

test('no manifest entry sits at the site root', () => {
  // The generated list must never reach the root, where every application page
  // lives. The three webroot documents are handled by three EXPLICIT rules for
  // exactly this reason and are excluded from the manifest at generation time.
  for (const { publicPath } of LEGACY_BLOB_FILES) {
    assert.ok(publicPath.slice(1).includes('/'), `${publicPath} is a site-root path`);
    assert.ok(!WEBROOT_PDFS.includes(publicPath), `${publicPath} duplicates a webroot rule`);
  }
});

test('a manifest path rewrites to the blob base', () => {
  const hit = routeOf(activeRules, '/files/9expert-roadmap-2023.pdf');
  assert.ok(hit, 'nothing matched');
  assert.equal(hit.destination, `${BASE}/files/9expert-roadmap-2023.pdf`);
});

test('an mp3 path rewrites to the blob base', () => {
  const hit = routeOf(activeRules, '/images/audio/05-Jensen-Huang.mp3');
  assert.ok(hit, 'nothing matched');
  assert.equal(hit.destination, `${BASE}/images/audio/05-Jensen-Huang.mp3`);
});

test('a webroot PDF rewrites to the blob base under webroot-documents/', () => {
  for (const p of WEBROOT_PDFS) {
    const hit = routeOf(activeRules, p);
    assert.ok(hit, `nothing matched ${p}`);
    assert.equal(hit.destination, `${BASE}/webroot-documents${p}`);
  }
});

test('THE ORDERING RULE: an mp3 is claimed by the manifest BEFORE the image catch-all', () => {
  // The specific failure this guards. /images is a LEGACY_ROOT, so the image
  // catch-all matches this path too and would send it to Cloudinary as
  // image/upload/…mp3 — which cannot work, because the file is not there and
  // mp3 is in neither Cloudinary extension set.
  const p = '/images/audio/05-Jensen-Huang.mp3';
  const blobIdx = activeRules.findIndex((r) => r.source === p);
  const catchAllIdx = activeRules.findIndex((r) => r.source === '/images/:rest*');
  assert.ok(blobIdx >= 0, 'no blob rule for the mp3');
  assert.ok(catchAllIdx >= 0, 'no image catch-all for /images');
  assert.ok(blobIdx < catchAllIdx, `blob rule at ${blobIdx} must precede the catch-all at ${catchAllIdx}`);
  assert.equal(routeOf(activeRules, p).destination, `${BASE}${p}`);
});

test('EVERY blob rule precedes EVERY Cloudinary rule for the same root', () => {
  const firstCloudinary = activeRules.findIndex((r) => r.destination.includes('res.cloudinary.com'));
  assert.ok(firstCloudinary > 0, 'no Cloudinary rule found');
  for (const { publicPath } of LEGACY_BLOB_FILES) {
    const idx = activeRules.findIndex((r) => r.source === publicPath);
    assert.ok(idx >= 0, `no rule for ${publicPath}`);
    assert.ok(idx < firstCloudinary, `${publicPath} at ${idx} is after the first Cloudinary rule at ${firstCloudinary}`);
  }
});

test('CONTROL: without BLOB_PUBLIC_BASE the blob rules are INERT', () => {
  // Deliberate: with no base there is nothing to point at, and emitting rules to
  // an undefined origin would turn a 404 into a broken destination.
  for (const { publicPath } of LEGACY_BLOB_FILES) {
    assert.equal(inertRules.some((r) => r.source === publicPath), false, `${publicPath} emitted a rule`);
  }
  for (const p of WEBROOT_PDFS) {
    assert.equal(inertRules.some((r) => r.source === p), false, `${p} emitted a rule`);
  }
  // …and the mp3 then falls through to the Cloudinary catch-all, which is why
  // it 404s until BLOB_PUBLIC_BASE is set and the site is redeployed.
  const fallthrough = routeOf(inertRules, '/images/audio/05-Jensen-Huang.mp3');
  assert.ok(fallthrough.destination.includes('res.cloudinary.com'), fallthrough.destination);
});

test('CONTROL: an ordinary /images path is NOT claimed by a blob rule', () => {
  const hit = routeOf(activeRules, '/images/web2024/greensunny.jpg');
  assert.ok(hit.destination.includes('res.cloudinary.com'), hit.destination);
});

// ── mp3 DELIVERY HEADERS ────────────────────────────────────────────────────

test('mp3 is held out of the edge cache, like every other seekable binary', () => {
  // An <audio> element seeks constantly: header first, then a range request for
  // whatever the listener scrubs to. Same 206 requirement as a PDF viewer, and
  // the same consequence if the cache answers 200 with a partial body — a player
  // that trusts the status treats a 30 MB podcast as fully buffered.
  assert.ok(NO_STORE_DOCUMENT_EXTENSIONS.includes('mp3'));
});

test('mp3 is deliberately NOT in RAW_EXTENSION_LIST', () => {
  // That list means "Cloudinary serves this as a raw asset", and these five MP3s
  // are not on Cloudinary at all — they exceed its raw ceiling. Adding mp3 there
  // would emit a Cloudinary raw rule that silently claims these paths the moment
  // rule order changed.
  assert.equal(RAW_EXTENSION_LIST.includes('mp3'), false);
});

test('the no-store header rule matches an mp3 path', async () => {
  const headers = await nextConfig.headers();
  const noStore = headers.find((h) => h.headers.some(
    (x) => x.key === 'Cache-Control' && /no-store/.test(x.value),
  ));
  assert.ok(noStore, 'no no-store header rule found');
  assert.ok(matcher(noStore.source)('/images/audio/05-Jensen-Huang.mp3'), noStore.source);
  // CONTROL: an image must NOT pick up no-store — that would defeat the edge
  // cache for the whole legacy image set.
  assert.equal(matcher(noStore.source)('/images/web2024/greensunny.jpg'), false);
});

test('an mp3 is typed audio/mpeg, not octet-stream', () => {
  // octet-stream makes a browser DOWNLOAD a podcast instead of playing it, and
  // stops <audio> seeking altogether.
  assert.equal(documentContentType('mp3'), 'audio/mpeg');
});
