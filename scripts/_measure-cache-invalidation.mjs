/**
 * MEASUREMENT — how long does a REPLACED file keep serving its old bytes?
 *
 * Underscore-prefixed, like _rehearse-revert.mjs: this is an instrument, not a
 * production tool. It answers three questions with a stopwatch instead of with
 * documentation, because the only numbers worth designing against are the ones
 * this project's own services produce.
 *
 * ══ WHAT IT TOUCHES, AND WHY NOTHING REAL IS AT RISK ════════════════════════
 *
 * Every object it creates lives under a SCRATCH prefix that no delivery rule,
 * no media-manager listing and no migration row can reach:
 *
 *   Blob        _cache-probe/<runStamp>/…
 *               next.config.mjs emits blob rewrites from exactly two sources:
 *               the LEGACY_BLOB_FILES manifest (matched on the literal
 *               `publicPath`) and three hand-written `/<file>` rules for the
 *               webroot documents under `webroot-documents/`. A pathname in
 *               neither is unroutable from the site. Asserted at startup
 *               against the real manifest, not assumed.
 *
 *   Cloudinary  _cache-probe/<runStamp>/…
 *               Delivery maps `/<root>/<rest>` to `<LEGACY_PREFIX>/<root>/…`,
 *               and the file manager lists `<LEGACY_PREFIX>/files/` only. A
 *               public_id outside LEGACY_PREFIX is reachable by neither.
 *               Asserted at startup.
 *
 * It never writes to Mongo. It reads one collection, read-only, to find the
 * measurement target for M3 rather than hardcoding a guess.
 *
 * ══ THE CONSTANTS COME FROM THE REAL MODULES ════════════════════════════════
 *
 * The 30-day blob cache age and the image transformation are READ FROM SOURCE,
 * never retyped — a measurement against a mistyped constant measures nothing.
 * DELIVERY_VARIANTS is imported directly. CACHE_MAX_AGE cannot be: it is a
 * module-local const in scripts/backfill-upload-blob.mjs and that file is a
 * migration script whose import would execute it. It is therefore extracted
 * from the source TEXT, and the extraction is asserted.
 *
 * Usage:
 *   node --env-file=.env.local scripts/_measure-cache-invalidation.mjs
 *   node --env-file=.env.local scripts/_measure-cache-invalidation.mjs --minutes 20
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { put, del, head } from '@vercel/blob';
import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';

import { DELIVERY_VARIANTS, LEGACY_PREFIX, deliveryUrl } from '../src/lib/legacyTransforms.mjs';
import { CLOUDINARY_BASE, RAW_EXTENSIONS, encodePath } from '../src/lib/legacyDelivery.js';
import { LEGACY_BLOB_FILES } from '../src/lib/legacyBlobFiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argOf = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

const POLL_MINUTES = Number(argOf('--minutes', '15'));
const POLL_EVERY_MS = 5_000;
const WARM_TRIES = 12;
const SITE_ORIGIN = argOf('--origin', 'https://genesis-lab.9expert.app').replace(/\/$/, '');

const die = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// ── preflight: credentials, stated one by one ───────────────────────────────
const REQUIRED = [
  ['BLOB_READ_WRITE_TOKEN', 'Blob write token — measurement 1 cannot run'],
  ['CLOUDINARY_CLOUD_NAME', 'Cloudinary cloud — measurements 2 and 3 cannot run'],
  ['CLOUDINARY_API_KEY', 'Cloudinary API key — measurement 2 cannot upload'],
  ['CLOUDINARY_API_SECRET', 'Cloudinary API secret — measurement 2 cannot upload'],
  ['BLOB_PUBLIC_BASE', 'Blob public base — measurement 1 cannot build a URL'],
  ['MONGODB_URI', 'Mongo URI — measurement 3 cannot find its target'],
];
const missing = REQUIRED.filter(([k]) => !process.env[k]);
if (missing.length) {
  console.error('\n✖ STOPPING — required credentials are missing:\n');
  for (const [k, why] of missing) console.error(`    ${k}  — ${why}`);
  console.error('\nNothing was created. Supply them and re-run; this script does not improvise.\n');
  process.exit(1);
}

// ── constants, read from the real sources ───────────────────────────────────
const BLOB_SCRIPT = fs.readFileSync(path.join(ROOT, 'scripts/backfill-upload-blob.mjs'), 'utf8');
const CACHE_MATCH = /const\s+CACHE_MAX_AGE\s*=\s*([^;]+);/.exec(BLOB_SCRIPT);
if (!CACHE_MATCH) {
  die('could not find CACHE_MAX_AGE in scripts/backfill-upload-blob.mjs — refusing to '
    + 'substitute a number of my own, which would measure the wrong thing');
}
// eslint-disable-next-line no-new-func
const CACHE_MAX_AGE = Number(Function(`"use strict";return (${CACHE_MATCH[1]});`)());
if (!Number.isFinite(CACHE_MAX_AGE) || CACHE_MAX_AGE <= 0) die(`CACHE_MAX_AGE parsed to ${CACHE_MAX_AGE}`);

const TRANSFORM = DELIVERY_VARIANTS.default;
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const BLOB_BASE = process.env.BLOB_PUBLIC_BASE.replace(/\/$/, '');
const BASE = CLOUDINARY_BASE(CLOUD);

cloudinary.config({
  cloud_name: CLOUD,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// ── scratch namespace, proven unreachable before anything is written ────────
const RUN = stamp();
const SCRATCH = `_cache-probe/${RUN}`;
const BLOB_PATHNAME = `${SCRATCH}/probe.pdf`;
const CLD_RAW_ID = `${SCRATCH}/probe-doc.pdf`;
const CLD_IMG_ID = `${SCRATCH}/probe-image`;

{
  const manifestPaths = new Set(LEGACY_BLOB_FILES.map((f) => f.blobPathname));
  const publicPaths = new Set(LEGACY_BLOB_FILES.map((f) => f.publicPath));
  if (manifestPaths.has(BLOB_PATHNAME)) die(`scratch blob pathname collides with the real manifest: ${BLOB_PATHNAME}`);
  if (publicPaths.has(`/${BLOB_PATHNAME}`)) die('scratch blob pathname collides with a manifest publicPath');
  if (BLOB_PATHNAME.startsWith('webroot-documents/')) die('scratch blob pathname is under the webroot prefix');
  for (const id of [CLD_RAW_ID, CLD_IMG_ID]) {
    if (id.startsWith(LEGACY_PREFIX)) die(`scratch Cloudinary id is inside the legacy prefix: ${id}`);
  }
}

// ── payloads, distinguishable by CONTENT ────────────────────────────────────
/** A tiny valid PDF whose body carries a version marker. */
function pdfBytes(marker) {
  const body = `%PDF-1.4\n% ${marker}\n`
    + '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
    + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
    + `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 99 99]/Contents 4 0 R>>endobj\n`
    + `4 0 obj<</Length ${marker.length + 20}>>stream\nBT (${marker}) Tj ET\nendstream endobj\n`
    + 'trailer<</Root 1 0 R>>\n%%EOF\n';
  return Buffer.from(body, 'latin1');
}

/** Minimal PNG encoder — solid colour, so v1 and v2 differ in SIZE and PIXELS. */
function pngBytes(side, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xFFFFFFFF;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0); ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolour RGB
  const raw = Buffer.concat(Array.from({ length: side }, () =>
    Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: side }, () => Buffer.from([r, g, b])))])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Width from a VP8/VP8L/VP8X webp header — proves WHICH version arrived. */
function webpWidth(buf) {
  if (buf.length < 30 || buf.toString('latin1', 0, 4) !== 'RIFF') return null;
  const fourcc = buf.toString('latin1', 12, 16);
  if (fourcc === 'VP8 ') return buf.readUInt16LE(26) & 0x3FFF;
  if (fourcc === 'VP8L') return (buf.readUInt32LE(21) & 0x3FFF) + 1;
  if (fourcc === 'VP8X') return (buf.readUIntLE(24, 3) & 0xFFFFFF) + 1;
  return null;
}

const V1 = { marker: `PROBE-V1-${RUN}`, side: 64, rgb: [220, 30, 30] };
const V2 = { marker: `PROBE-V2-${RUN}`, side: 96, rgb: [30, 120, 220] };

// ── probing ─────────────────────────────────────────────────────────────────
async function probe(url, { range = null } = {}) {
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, { headers: range ? { range } : {}, redirect: 'follow' });
  } catch (err) { return { error: err?.message ?? String(err) }; }
  const ttfb = Date.now() - t0;
  const body = Buffer.from(await res.arrayBuffer());
  const total = Date.now() - t0;
  const h = (k) => res.headers.get(k);
  return {
    status: res.status, ttfb, total, bytes: body.length, body, hash: sha(body),
    age: h('age'), vercelCache: h('x-vercel-cache'), cfCache: h('cf-cache-status'),
    serverTiming: h('server-timing'), legacyDelivery: h('x-legacy-delivery'),
    cacheControl: h('cache-control'), contentType: h('content-type'),
    contentRange: h('content-range'), etag: h('etag'), xCache: h('x-cache'),
  };
}

/**
 * Which header, if any, says this response came from a cache.
 *
 * MEASURED — the two services answer this in completely different vocabularies,
 * and a checker that knows only one of them silently reports "never cached" for
 * the other:
 *
 *   Vercel Blob   x-vercel-cache: HIT
 *   Cloudinary    NO x-cache, NO cf-cache-status, and `age` is absent. The only
 *                 signal is inside server-timing:
 *                   server-timing: cld-fastly;dur=2;…;desc=hit,rtt;…
 *                 A first run of this script checked the first three names only,
 *                 concluded the Cloudinary objects were never cached, and would
 *                 have reported an invalidation time measured against an
 *                 UNCACHED object — trivially fresh, and exactly the confident
 *                 wrong answer this step exists to prevent.
 */
function cacheEvidence(r) {
  if (r.vercelCache && /HIT/i.test(r.vercelCache)) return { header: 'x-vercel-cache', value: r.vercelCache };
  if (r.xCache && /HIT/i.test(r.xCache)) return { header: 'x-cache', value: r.xCache };
  if (r.cfCache && /HIT/i.test(r.cfCache)) return { header: 'cf-cache-status', value: r.cfCache };
  const st = r.serverTiming ?? '';
  const cld = /cld-fastly;[^,]*desc=(hit|miss)/i.exec(st);
  if (cld && cld[1].toLowerCase() === 'hit') return { header: 'server-timing (cld-fastly)', value: `desc=${cld[1]}` };
  if (r.age && Number(r.age) > 0) return { header: 'age', value: r.age };
  return null;
}

/**
 * Fetch until a cache-hit header appears. THIS IS THE STEP THAT DECIDES WHETHER
 * THE MEASUREMENT MEANS ANYTHING — overwriting an object that was never cached
 * is trivially fresh and yields a confident wrong answer.
 */
async function warmUntilCached(url, label) {
  for (let i = 1; i <= WARM_TRIES; i += 1) {
    const r = await probe(url);
    const ev = cacheEvidence(r);
    console.log(`   warm ${String(i).padStart(2)}: status ${r.status}  age=${r.age ?? '-'}  `
      + `x-vercel-cache=${r.vercelCache ?? '-'}  cf=${r.cfCache ?? '-'}  hash=${r.hash ?? '-'}`);
    if (ev) return { cached: true, evidence: ev, first: r };
    await sleep(2_000);
  }
  return { cached: false, evidence: null, first: await probe(url) };
}

/** Poll until the body hash changes away from `oldHash`, or the budget expires. */
async function pollUntilChanged(url, oldHash, label) {
  const deadline = Date.now() + POLL_MINUTES * 60_000;
  const t0 = Date.now();
  let last = null;
  while (Date.now() < deadline) {
    const r = await probe(url);
    last = r;
    if (r.hash && r.hash !== oldHash) {
      return { flipped: true, ms: Date.now() - t0, result: r };
    }
    await sleep(POLL_EVERY_MS);
  }
  return { flipped: false, ms: Date.now() - t0, result: last };
}

const report = { blob: {}, cloudinary: {}, resolver: {}, cleanup: {} };
const created = { blobUrls: [], cloudinary: [] };

console.log('');
console.log('══ CACHE-INVALIDATION MEASUREMENT ═════════════════════════════════════════');
console.log('');
console.log(`   run id            : ${RUN}`);
console.log(`   scratch namespace : ${SCRATCH}   (asserted outside every delivery rule)`);
console.log(`   CACHE_MAX_AGE     : ${CACHE_MAX_AGE}s (${(CACHE_MAX_AGE / 86400).toFixed(0)} days) — read from backfill-upload-blob.mjs`);
console.log(`   transformation    : ${TRANSFORM} — imported from legacyTransforms.mjs`);
console.log(`   poll budget       : ${POLL_MINUTES} minutes per target`);
console.log('');

// ════ MEASUREMENT 1 — BLOB OVERWRITE ═══════════════════════════════════════
console.log('════ 1. BLOB — how long does an overwrite serve the OLD bytes? ════════════');
console.log('');
try {
  const v1 = pdfBytes(V1.marker);
  const putOpts = {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/pdf',
    cacheControlMaxAge: CACHE_MAX_AGE,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  };
  const r1 = await put(BLOB_PATHNAME, v1, putOpts);
  created.blobUrls.push(r1.url);
  const url = `${BLOB_BASE}/${BLOB_PATHNAME}`;
  report.blob.url = url;
  report.blob.putUrl = r1.url;
  console.log(`  a) v1 written: ${BLOB_PATHNAME}  (${v1.length} B, sha ${sha(v1)})`);
  console.log(`     public URL : ${url}`);
  console.log('');

  console.log('  b) warming until a cache header confirms a HIT:');
  const warm = await warmUntilCached(url, 'blob');
  report.blob.cached = warm.cached;
  report.blob.evidence = warm.evidence;
  report.blob.v1Hash = warm.first.hash;
  console.log('');
  if (warm.cached) {
    console.log(`     ✓ CACHED — ${warm.evidence.header}: ${warm.evidence.value}`);
  } else {
    console.log('     ⚠ NEVER OBSERVED A CACHE HIT after '
      + `${WARM_TRIES} fetches. The overwrite measurement below is therefore`);
    console.log('       NOT a staleness measurement — it times an uncached object, which is');
    console.log('       trivially fresh. Reported as such rather than as a number.');
  }
  console.log('');

  // c) the overwrite, and what the SDK demanded
  console.log('  c) overwriting at the same pathname:');
  let overwriteFlag = null; let refusalMessage = null;
  const v2 = pdfBytes(V2.marker);
  try {
    await put(BLOB_PATHNAME, v2, putOpts);
    overwriteFlag = '(none — the plain put succeeded)';
    console.log('     plain put() succeeded with no extra flag');
  } catch (err) {
    refusalMessage = err?.message ?? String(err);
    console.log(`     plain put() REFUSED: ${refusalMessage}`);
    await put(BLOB_PATHNAME, v2, { ...putOpts, allowOverwrite: true });
    overwriteFlag = 'allowOverwrite: true';
    console.log(`     retried with ${overwriteFlag} — succeeded`);
  }
  report.blob.overwriteFlag = overwriteFlag;
  report.blob.refusalMessage = refusalMessage;
  report.blob.v2Hash = sha(v2);
  const flippedAt = new Date().toISOString();
  console.log(`     v2 written at ${flippedAt} (${v2.length} B, sha ${sha(v2)})`);
  console.log('');

  console.log(`  d) polling ${url} every ${POLL_EVERY_MS / 1000}s for up to ${POLL_MINUTES}m:`);
  const flip = await pollUntilChanged(url, report.blob.v1Hash, 'blob');
  report.blob.flipped = flip.flipped;
  report.blob.flipMs = flip.ms;
  report.blob.finalHash = flip.result?.hash;
  if (flip.flipped) {
    console.log(`     ✓ v2 bytes appeared after ${secs(flip.ms)}`);
  } else {
    console.log(`     ✗ STILL v1 after ${secs(flip.ms)} — that is the result, not a failure`);
  }
  console.log('');
} catch (err) {
  report.blob.error = err?.message ?? String(err);
  console.log(`  ✖ measurement 1 failed: ${report.blob.error}`);
  console.log('');
}

// ════ MEASUREMENT 2 — CLOUDINARY OVERWRITE + INVALIDATE ════════════════════
console.log('════ 2. CLOUDINARY — overwrite + invalidate ═══════════════════════════════');
console.log('');
try {
  const rawUrl = `${BASE}/raw/upload/${encodePath(CLD_RAW_ID)}`;
  const imgUrl = deliveryUrl(BASE, TRANSFORM, `${encodePath(CLD_IMG_ID)}.png`);
  report.cloudinary.rawUrl = rawUrl;
  report.cloudinary.imgUrl = imgUrl;

  // a) the URL SHAPE we actually serve — no /v<number>/ segment.
  const hasVersion = (u) => /\/v\d+\//.test(u);
  console.log('  a) URL shape under test (must carry NO version segment):');
  console.log(`     raw         : ${rawUrl}`);
  console.log(`     transformed : ${imgUrl}`);
  console.log(`     version segment present? raw=${hasVersion(rawUrl)}  transformed=${hasVersion(imgUrl)}`);
  if (hasVersion(rawUrl) || hasVersion(imgUrl)) die('a version segment leaked into the probe URL');
  console.log('     ✓ both are the shape next.config emits — the objects users actually hit');
  console.log('');

  const upload = (buf, id, resourceType, extra = {}) => new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { public_id: id, resource_type: resourceType, overwrite: true, ...extra },
      (err, res) => (err ? reject(err) : resolve(res)),
    ).end(buf);
  });

  const rawV1 = pdfBytes(V1.marker);
  const imgV1 = pngBytes(V1.side, V1.rgb);
  await upload(rawV1, CLD_RAW_ID, 'raw');
  await upload(imgV1, CLD_IMG_ID, 'image');
  created.cloudinary.push(
    { id: CLD_RAW_ID, type: 'raw', checkUrl: rawUrl },
    { id: CLD_IMG_ID, type: 'image', checkUrl: imgUrl },
  );
  console.log(`  v1 uploaded: raw ${rawV1.length} B, image ${imgV1.length} B (${V1.side}px)`);
  console.log('');

  console.log('  b) warming BOTH — derived assets are separate cache objects:');
  console.log('     raw:');
  const warmRaw = await warmUntilCached(rawUrl, 'cld-raw');
  console.log('     transformed:');
  const warmImg = await warmUntilCached(imgUrl, 'cld-img');
  report.cloudinary.rawCached = warmRaw.evidence;
  report.cloudinary.imgCached = warmImg.evidence;
  report.cloudinary.rawV1Hash = warmRaw.first.hash;
  report.cloudinary.imgV1Hash = warmImg.first.hash;
  report.cloudinary.imgV1Width = webpWidth(warmImg.first.body ?? Buffer.alloc(0));
  console.log('');
  console.log(`     raw cached        : ${warmRaw.evidence ? `${warmRaw.evidence.header}=${warmRaw.evidence.value}` : 'NO HIT OBSERVED'}`);
  console.log(`     transformed cached: ${warmImg.evidence ? `${warmImg.evidence.header}=${warmImg.evidence.value}` : 'NO HIT OBSERVED'}`);
  console.log(`     transformed v1 width: ${report.cloudinary.imgV1Width}px, content-type ${warmImg.first.contentType}`);
  console.log('');

  console.log('  c) uploading v2 with overwrite:true, invalidate:true …');
  const rawV2 = pdfBytes(V2.marker);
  const imgV2 = pngBytes(V2.side, V2.rgb);
  await upload(rawV2, CLD_RAW_ID, 'raw', { invalidate: true });
  await upload(imgV2, CLD_IMG_ID, 'image', { invalidate: true });
  console.log(`     v2 uploaded at ${new Date().toISOString()} (image now ${V2.side}px)`);
  console.log('');

  console.log('     polling RAW:');
  const rawFlip = await pollUntilChanged(rawUrl, report.cloudinary.rawV1Hash, 'cld-raw');
  report.cloudinary.rawFlipped = rawFlip.flipped;
  report.cloudinary.rawMs = rawFlip.ms;
  console.log(rawFlip.flipped
    ? `     ✓ raw flipped after ${secs(rawFlip.ms)}`
    : `     ✗ raw STILL v1 after ${secs(rawFlip.ms)}`);

  console.log('     polling TRANSFORMED:');
  const imgFlip = await pollUntilChanged(imgUrl, report.cloudinary.imgV1Hash, 'cld-img');
  report.cloudinary.imgFlipped = imgFlip.flipped;
  report.cloudinary.imgMs = imgFlip.ms;
  report.cloudinary.imgFinalWidth = webpWidth(imgFlip.result?.body ?? Buffer.alloc(0));
  console.log(imgFlip.flipped
    ? `     ✓ transformed flipped after ${secs(imgFlip.ms)} (width now ${report.cloudinary.imgFinalWidth}px, expected ${V2.side})`
    : `     ✗ transformed STILL v1 after ${secs(imgFlip.ms)}`);
  console.log('');
} catch (err) {
  report.cloudinary.error = err?.message ?? String(err);
  console.log(`  ✖ measurement 2 failed: ${report.cloudinary.error}`);
  console.log('');
}

// ════ MEASUREMENT 3 — THE RESOLVER UNDER A LARGE FILE ══════════════════════
console.log('════ 3. RESOLVER — largest raw document reachable through it ══════════════');
console.log('');
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
  const rows = await mongoose.connection.db.collection('legacy_file_migrations').find(
    { publicIdSubstituted: true },
    { projection: { sourcePath: 1, publicId: 1, resourceType: 1, uploadedBytes: 1, sourceBytes: 1, status: 1 } },
  ).toArray();
  await mongoose.disconnect();

  const extOf = (p) => { const s = p.slice(p.lastIndexOf('/') + 1); const d = s.lastIndexOf('.'); return d <= 0 ? '' : s.slice(d + 1).toLowerCase(); };
  const withSize = rows.map((r) => ({
    ...r, ext: extOf(r.sourcePath), bytes: r.uploadedBytes ?? r.sourceBytes ?? 0,
  }));
  const raws = withSize.filter((r) => r.resourceType === 'raw' || RAW_EXTENSIONS.has(r.ext));
  report.resolver.substitutedTotal = rows.length;
  report.resolver.rawCount = raws.length;

  console.log(`  substituted rows (everything the resolver can serve): ${rows.length}`);
  for (const r of withSize.sort((a, b) => b.bytes - a.bytes)) {
    console.log(`     ${String(r.bytes).padStart(9)} B  ${r.resourceType.padEnd(5)} ${r.ext.padEnd(5)} ${r.sourcePath}`);
  }
  console.log('');

  const target = raws.sort((a, b) => b.bytes - a.bytes)[0]
    ?? withSize.sort((a, b) => b.bytes - a.bytes)[0];
  if (!target) throw new Error('no substituted rows at all — nothing reaches the resolver');
  if (!raws.length) {
    console.log('  ⚠ NO RAW DOCUMENT is substituted — the resolver currently serves images only.');
    console.log('    Measuring the largest substituted asset instead, and saying so.');
  }
  report.resolver.target = { path: target.sourcePath, bytes: target.bytes, ext: target.ext, isRaw: raws.includes(target) };

  const url = `${SITE_ORIGIN}${target.sourcePath.split('/').map(encodeURIComponent).join('/')}`;
  console.log(`  a) target: ${target.sourcePath}`);
  console.log(`     ${target.bytes} B (${(target.bytes / 1048576).toFixed(2)} MB), ext ${target.ext}, resourceType ${target.resourceType}`);
  console.log(`     via    : ${url}`);

  const full = await probe(url);
  report.resolver.full = full;
  console.log(`     status ${full.status}  TTFB ${full.ttfb}ms  total ${full.total}ms  ${full.bytes} B`);
  console.log(`     x-legacy-delivery? content-type=${full.contentType}  cache-control=${full.cacheControl}`);

  const ranged = await probe(url, { range: 'bytes=0-1023' });
  report.resolver.ranged = ranged;
  const rangeOk = ranged.status === 206 && ranged.bytes === 1024;
  console.log(`     Range bytes=0-1023 → status ${ranged.status}, ${ranged.bytes} B, content-range ${ranged.contentRange ?? '(none)'}`);
  console.log(`     ${rangeOk ? '✓' : '✗'} 206 with exactly 1024 bytes through THIS path`);
  if (rangeOk && full.body) {
    const matches = ranged.body.equals(full.body.subarray(0, 1024));
    report.resolver.rangeBytesCorrect = matches;
    console.log(`     ${matches ? '✓' : '✗'} ranged bytes are byte-identical to the first 1024 of the full body`);
  }
  console.log('');
} catch (err) {
  report.resolver.error = err?.message ?? String(err);
  console.log(`  ✖ measurement 3 failed: ${report.resolver.error}`);
  console.log('');
  try { await mongoose.disconnect(); } catch { /* already closed */ }
}

// ════ CLEANUP — and VERIFY it, never assume it ═════════════════════════════
console.log('════ CLEANUP ══════════════════════════════════════════════════════════════');
console.log('');
const leftovers = [];
for (const url of created.blobUrls) {
  try {
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    try {
      await head(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      leftovers.push(`blob still present after del: ${url}`);
    } catch { console.log(`  ✓ blob deleted and verified gone: ${BLOB_PATHNAME}`); }
  } catch (err) { leftovers.push(`blob delete failed: ${url} — ${err?.message}`); }
}
/**
 * Cleanup is verified by asking the DELIVERY URL, not the Admin API.
 *
 * MEASURED, and the first version of this script got it wrong: after a
 * successful `uploader.destroy`, `api.resource` still returns the asset, so the
 * run reported two leftovers that were in fact gone — both delivery URLs
 * answered 404 the moment they were asked. That lag is a known property of the
 * Admin API's prefix index and is already documented in src/lib/actions/media.js
 * (see the note above listMediaFiles). "Can anyone still fetch this?" is the
 * question that matters for a scratch object, and only the delivery URL answers
 * it.
 */
for (const { id, type, checkUrl } of created.cloudinary) {
  try {
    await cloudinary.uploader.destroy(id, { resource_type: type, invalidate: true });
    const after = await probe(checkUrl);
    if (after.status === 404) {
      console.log(`  ✓ cloudinary ${type} destroyed — delivery URL now 404: ${id}`);
    } else {
      leftovers.push(`cloudinary ${type}/${id} still SERVES (HTTP ${after.status}) at ${checkUrl}`);
    }
  } catch (err) { leftovers.push(`cloudinary destroy failed: ${type}/${id} — ${err?.message}`); }
}
report.cleanup.leftovers = leftovers;
console.log('');
if (leftovers.length) {
  console.log('  ⚠ NOT FULLY CLEAN — the following remain and need manual removal:');
  for (const l of leftovers) console.log(`      ${l}`);
} else {
  console.log('  ✓ every object this run created was deleted, and each deletion was VERIFIED');
  console.log('    by a follow-up read rather than assumed from a successful call.');
}
console.log('');

// ════ WHAT THESE MEASUREMENTS CANNOT SEE ═══════════════════════════════════
console.log('════ WHAT THESE MEASUREMENTS CANNOT SEE ═══════════════════════════════════');
console.log('');
console.log('  · ONE MACHINE SEES ONE CDN PoP. Every number here is a LOWER BOUND on');
console.log('    staleness elsewhere and never an upper bound. Another region may still');
console.log('    be serving the old bytes long after this script reports a flip.');
console.log('  · One file size, one content type, one time of day, one run. Cache');
console.log('    behaviour under load, or for a 44 MB object, is not measured by a');
console.log('    small probe file.');
console.log('  · A cache HIT header proves THIS PoP cached it. It does not prove the');
console.log('    object was cached everywhere, nor that it was still cached at the');
console.log('    instant of the overwrite.');
console.log('  · The poll interval quantises the answer: a flip is observed at worst');
console.log(`    ${POLL_EVERY_MS / 1000}s after it happened.`);
console.log('  · Nothing here measures the BROWSER cache, which holds its own copy for');
console.log('    the same max-age and is not invalidated by any server-side action.');
console.log('');
console.log(JSON.stringify({ run: RUN, report }, (k, v) => (k === 'body' ? undefined : v), 1));
console.log('');
