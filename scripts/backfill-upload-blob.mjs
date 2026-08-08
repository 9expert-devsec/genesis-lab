/**
 * BACKFILL — the Vercel Blob track. Files Cloudinary cannot hold.
 *
 *   node --env-file=.env.local scripts/backfill-upload-blob.mjs           # plan
 *   node --env-file=.env.local scripts/backfill-upload-blob.mjs --apply
 *
 * ══ WHY A SECOND STORAGE AT ALL ═════════════════════════════════════════════
 *
 * Cloudinary's raw ceiling is 10 MB on any plan this project would consider, and
 * the training-course catalog alone is 42.6 MiB. So 19 files cannot live there:
 *
 *   11  >10 MB PDFs, PNGs and theme ZIPs under /files and /images
 *    5  MP3s in /images/audio — over the ceiling AND unroutable through the
 *       Cloudinary rewrite, since `mp3` is in neither extension set
 *    3  webroot PDFs at the site root, never part of the Cloudinary migration
 *
 * ── WHAT MAKES THIS DIFFERENT FROM THE CLOUDINARY TRACK ─────────────────────
 * Cloudinary delivery is derived BY PATTERN: public_id is the path, so one
 * rewrite rule serves thousands of files with no lookup. Blob has no such
 * property — a blob pathname is whatever you named it, so every file needs its
 * own rewrite. That is why the pathnames here are DETERMINISTIC MIRRORS of the
 * public legacy path, and why the routing manifest is GENERATED from this run
 * (src/lib/legacyBlobFiles.mjs) rather than hand-maintained: two hand-written
 * lists of 16 paths drift, and the drift shows up as a 404 nobody expects.
 *
 * ── THE THREE WEBROOT PDFs COME OVER HTTP, DELIBERATELY ─────────────────────
 * They are the only files here NOT in the local staging tree — staging holds
 * /files, /download and /images, and these sit at the webroot. The legacy origin
 * still serves them and its Content-Length matches optwww-tree.txt EXACTLY for
 * all three (1,885,334 / 22,899,697 / 44,647,587), so they are pulled over HTTPS
 * with byte-equality against the manifest as the guard. Round 1's HTTP problem
 * was RATE LIMITING at 1,600-file scale; three files do not reproduce it, and a
 * short read cannot pass the byte check.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { put, head } from '@vercel/blob';

import LegacyFileMigration from '../src/models/LegacyFileMigration.js';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const valueOf = (f, d = null) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const STAGING = path.resolve(valueOf('--staging', 'D:/workspace/projects/backfill-staging/backfill-stage1'));
const MANIFEST = path.resolve(process.cwd(), valueOf('--manifest', 'optwww-tree.txt'));
const LEGACY_ORIGIN = 'https://www.9experttraining.com';
const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024;

/** Where the three webroot documents live in the store. MUST match next.config. */
const WEBROOT_PREFIX = 'webroot-documents';

/** One month, matching what Cloudinary sends for untransformed assets. */
const CACHE_MAX_AGE = 60 * 60 * 24 * 30;

const MB = 1024 * 1024;
const mb = (n) => (n / MB).toFixed(2);
const die = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
};
const extOf = (p) => {
  const last = p.slice(p.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot <= 0 ? '' : last.slice(dot + 1).toLowerCase();
};
const directoryOf = (p) => { const c = p.lastIndexOf('/'); return c <= 0 ? '/' : p.slice(0, c); };

/** Media and oversized docs are non-transformable binaries → `raw`. */
const resourceTypeFor = (ext) => (ext === 'png' || ext === 'jpg' ? 'image' : 'raw');

/* ── MANIFEST: the byte-count authority ─────────────────────────────────── */
if (!fs.existsSync(MANIFEST)) die(`manifest not found: ${MANIFEST}`);
const manifestBytes = new Map();
for (const line of fs.readFileSync(MANIFEST, 'utf8').split('\n')) {
  if (!line) continue;
  const tab = line.indexOf('\t');
  if (tab < 0) continue;
  const p = line.slice(tab + 1);
  if (!p.startsWith('/opt/www')) continue;
  manifestBytes.set(p.slice('/opt/www'.length), Number(line.slice(0, tab)));
}

/* ── BUILD THE SET ──────────────────────────────────────────────────────── */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}
if (!fs.existsSync(STAGING)) die(`staging dir not found: ${STAGING}`);

const MEDIA = new Set(['mp3', 'mp4', 'wav', 'm4a', 'ogg', 'webm', 'mov', 'avi']);
const staged = [];
for (const full of walk(STAGING)) {
  const rel = path.relative(STAGING, full).split(path.sep).join('/');
  const publicPath = `/${rel}`;
  const ext = extOf(publicPath);
  const size = fs.statSync(full).size;
  // Two reasons a staged file belongs on Blob: too big for Cloudinary, or a
  // media type the Cloudinary rewrite has no rule for.
  const tooBig = size > CLOUDINARY_MAX_BYTES;
  const isMedia = MEDIA.has(ext);
  if (!tooBig && !isMedia) continue;
  staged.push({
    publicPath,
    source: { kind: 'disk', full },
    bytes: size,
    ext,
    blobPathname: rel,                     // deterministic mirror of the legacy path
    why: tooBig && isMedia ? '>10MB + media' : tooBig ? '>10MB' : 'media (unroutable)',
  });
}

const WEBROOT = [
  'how-to-create-chatgpt-account.pdf',
  '9expert-company-profile.pdf',
  '9expert-training-course-catalog.pdf',
].map((file) => ({
  publicPath: `/${file}`,
  source: { kind: 'http', url: `${LEGACY_ORIGIN}/${file}` },
  bytes: manifestBytes.get(`/${file}`) ?? null,
  ext: extOf(file),
  blobPathname: `${WEBROOT_PREFIX}/${file}`,
  why: 'webroot document',
}));

const all = [...staged.sort((a, b) => a.publicPath.localeCompare(b.publicPath)), ...WEBROOT];

console.log('');
console.log('══ BACKFILL → VERCEL BLOB (public store) ══════════════════════════════');
console.log('');
console.log(`  mode     : ${APPLY ? '*** APPLY — WILL UPLOAD AND WRITE ***' : 'PLAN — no uploads, no writes'}`);
console.log(`  staging  : ${STAGING}`);
console.log(`  manifest : ${path.relative(process.cwd(), MANIFEST)}`);
console.log('');
console.log('  why                 bytes        blob pathname');
for (const f of all) {
  console.log(`  ${f.why.padEnd(19)} ${mb(f.bytes ?? 0).padStart(8)} MB  ${f.blobPathname}`);
}
console.log(`  ${'─'.repeat(66)}`);
console.log(`  ${String(all.length).padStart(3)} files  ${mb(all.reduce((a, f) => a + (f.bytes ?? 0), 0))} MB`);
console.log('');

/* ── PRE-UPLOAD BYTE CHECK against the manifest ─────────────────────────── */
const mismatched = [];
for (const f of all) {
  const expected = manifestBytes.get(f.publicPath);
  if (expected == null) { mismatched.push({ ...f, expected: '(absent)' }); continue; }
  if (f.source.kind === 'disk' && expected !== f.bytes) mismatched.push({ ...f, expected });
}
if (mismatched.length) {
  console.log('  ⚠ manifest disagreement — these are SKIPPED:');
  for (const m of mismatched) console.log(`     disk ${m.bytes} B vs manifest ${m.expected} B  ${m.publicPath}`);
  console.log('');
}
const set = all.filter((f) => !mismatched.includes(f));

if (!process.env.BLOB_READ_WRITE_TOKEN) die('BLOB_READ_WRITE_TOKEN not set');

const uri = process.env.MONGODB_URI;
if (!uri) die('MONGODB_URI not set — pass --env-file=.env.local');
await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME, maxPoolSize: 5, serverSelectionTimeoutMS: 10_000 });

const prior = new Map(
  (await LegacyFileMigration.find(
    { sourcePath: { $in: set.map((f) => f.publicPath) } },
    { sourcePath: 1, status: 1, sourceBytes: 1, storage: 1, blobPathname: 1, secureUrl: 1 },
  ).lean()).map((d) => [d.sourcePath, d]),
);

if (!APPLY) {
  console.log('  resume state:');
  for (const f of set) {
    const d = prior.get(f.publicPath);
    const done = d?.status === 'uploaded' && d?.storage === 'blob' && d?.sourceBytes === f.bytes;
    console.log(`     ${done ? 'SKIP (done)' : 'UPLOAD     '}  ${f.publicPath}`);
  }
  console.log('');
  console.log('══ PLAN ONLY. Nothing uploaded, nothing written. Re-run with --apply. ══');
  console.log('');
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

/* ── UPLOAD ─────────────────────────────────────────────────────────────── */
async function readSource(f) {
  if (f.source.kind === 'disk') return fs.readFileSync(f.source.full);
  const res = await fetch(f.source.url, {
    redirect: 'follow',
    headers: { 'user-agent': '9exp-legacy-blob-mirror/1.0' },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`legacy origin ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const stats = { uploaded: 0, skipped: 0, failed: 0, bytes: 0 };
const failures = [];
let publicBase = process.env.BLOB_PUBLIC_BASE ?? null;
const written = [];

for (const f of set) {
  const d = prior.get(f.publicPath);
  if (d?.status === 'uploaded' && d?.storage === 'blob' && d?.sourceBytes === f.bytes) {
    stats.skipped += 1;
    written.push({ publicPath: f.publicPath, blobPathname: d.blobPathname || f.blobPathname });
    // Recover the base from the recorded URL so a fully-idempotent run can still
    // report BLOB_PUBLIC_BASE — the deploy checklist needs it whether or not
    // this run happened to upload anything.
    if (!publicBase && d.secureUrl) {
      try { publicBase = d.secureUrl.replace(new URL(d.secureUrl).pathname, ''); } catch { /* ignore */ }
    }
    console.log(`  SKIP  ${f.publicPath}  (already uploaded, bytes match)`);
    continue;
  }

  try {
    const buf = await readSource(f);
    // The byte check happens on the BYTES BEING UPLOADED, not on a stat taken
    // earlier — a short HTTP read or a file changed mid-run must not pass.
    const expected = manifestBytes.get(f.publicPath);
    if (expected != null && buf.length !== expected) {
      throw new Error(`SIZE vs manifest: got ${buf.length} B, manifest ${expected} B`);
    }
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const contentType = CONTENT_TYPES[f.ext] ?? 'application/octet-stream';

    const res = await put(f.blobPathname, buf, {
      access: 'public',
      addRandomSuffix: false,
      contentType,
      cacheControlMaxAge: CACHE_MAX_AGE,
      multipart: buf.length > 8 * MB,
    });

    // VERIFY THE DELIVERED OBJECT, unauthenticated, before recording success.
    // A 200 from put() says the write happened; it does not say a customer can
    // read it. Those are different systems and only the second one matters.
    const check = await fetch(res.url, { redirect: 'manual' });
    const got = Buffer.from(await check.arrayBuffer());
    if (check.status !== 200) throw new Error(`blob URL returned ${check.status}`);
    if (got.length !== buf.length) throw new Error(`blob URL served ${got.length} B, uploaded ${buf.length} B`);

    const base = res.url.replace(new URL(res.url).pathname, '');
    publicBase ??= base;
    if (base !== publicBase) throw new Error(`blob host changed mid-run: ${base} vs ${publicBase}`);

    await LegacyFileMigration.updateOne(
      { sourcePath: f.publicPath },
      {
        $set: {
          publicId: '',                       // Blob has no Cloudinary public_id
          publicIdSubstituted: false,
          substitutionRule: [],
          storage: 'blob',
          blobPathname: res.pathname,
          resourceType: resourceTypeFor(f.ext),
          format: f.ext,
          pathExtension: f.ext,
          storedFormat: f.ext,
          formatDisagrees: false,
          secureUrl: res.url,
          derivedUrl: res.url,
          sourceBytes: buf.length,
          uploadedBytes: got.length,
          sha256,
          etag: '',
          sizeExceptionReason: '',
          refCount: 0,
          directory: directoryOf(f.publicPath),
          attemptedAt: new Date(),
          status: 'uploaded',
          error: '',
          note: `Vercel Blob: ${f.why}. Cloudinary cannot hold this file `
              + `(raw ceiling ${mb(CLOUDINARY_MAX_BYTES)} MB${MEDIA.has(f.ext) ? '; mp3 is also unroutable through the Cloudinary rewrite' : ''}).`,
        },
        $setOnInsert: { sourcePath: f.publicPath },
      },
      { upsert: true },
    );

    stats.uploaded += 1; stats.bytes += buf.length;
    written.push({ publicPath: f.publicPath, blobPathname: res.pathname });
    console.log(`  ok    ${mb(buf.length).padStart(8)} MB  ${res.pathname}  → 200, byte-equal`);
  } catch (err) {
    stats.failed += 1;
    const msg = (err?.message ?? String(err)).slice(0, 300);
    failures.push({ path: f.publicPath, error: msg });
    await LegacyFileMigration.updateOne(
      { sourcePath: f.publicPath },
      {
        $set: {
          storage: 'blob', blobPathname: f.blobPathname,
          resourceType: resourceTypeFor(f.ext), pathExtension: f.ext,
          sourceBytes: f.bytes, refCount: 0, directory: directoryOf(f.publicPath),
          attemptedAt: new Date(), status: 'failed', error: msg,
        },
        $setOnInsert: { sourcePath: f.publicPath },
      },
      { upsert: true },
    );
    console.log(`  FAIL  ${f.publicPath}\n          ${msg}`);
  }
}

console.log('');
console.log('══ SUMMARY ═════════════════════════════════════════════════════════════');
console.log('');
console.log(`  uploaded : ${stats.uploaded}`);
console.log(`  skipped  : ${stats.skipped}`);
console.log(`  FAILED   : ${stats.failed}`);
console.log(`  bytes    : ${mb(stats.bytes)} MB`);
console.log('');
console.log(`  BLOB_PUBLIC_BASE = ${publicBase ?? '(nothing uploaded this run)'}`);
console.log('');

/* ── EMIT THE ROUTING MANIFEST ──────────────────────────────────────────────
 *
 * GENERATED, never hand-edited, and generated from what THIS RUN actually wrote
 * rather than from the intended set. A hand-kept list of 16 paths and a store
 * holding 16 objects drift, and the drift is a 404 for a file that uploaded
 * perfectly well.
 *
 * The three webroot documents are EXCLUDED: they already have three explicit,
 * deliberately hand-written rewrites at the site root, and that is the one place
 * a generated catch-all must never reach — see the shouting comment in
 * next.config.mjs about `/promotions` and the `[...slug]` route.
 */
const manifestEntries = written
  .filter((w) => !w.blobPathname.startsWith(`${WEBROOT_PREFIX}/`))
  .sort((a, b) => a.publicPath.localeCompare(b.publicPath));

const out = `/**
 * GENERATED by scripts/backfill-upload-blob.mjs — DO NOT EDIT BY HAND.
 *
 * Legacy files served from Vercel Blob instead of Cloudinary, because Cloudinary
 * cannot hold them: its raw ceiling is 10 MB on any plan this project would
 * consider, and one of these is 42.6 MiB. The five MP3s are here for a second
 * reason as well — \`mp3\` is in neither IMAGE_EXTENSIONS nor RAW_EXTENSION_LIST,
 * so the Cloudinary rewrite has no rule that could serve them and the image
 * catch-all would ask for \`image/upload/….mp3\` and fail.
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
 * Cloudinary delivery is derived BY PATTERN: public_id IS the legacy path, so a
 * handful of rules serve 2,900 files with no lookup and no per-file maintenance.
 * Blob has no such property. A blob pathname is whatever it was named, so each
 * file needs its own rewrite — and a list of rewrites that a human keeps in step
 * with a list of uploaded objects is a list that drifts. Generating it from the
 * upload run makes the two the same fact.
 *
 * The pathnames still MIRROR the legacy path, so the mapping is readable and a
 * re-upload is idempotent; \`blobPathname\` is simply the public path without its
 * leading slash. That is a convention, not something next.config may assume —
 * it reads this array.
 *
 * next.config.mjs emits ONE rewrite per entry to
 * \`\${BLOB_PUBLIC_BASE}/\${blobPathname}\`, placed BEFORE the /files/ and /images/
 * catch-alls so these win. Regenerate with:
 *
 *   node --env-file=.env.local scripts/backfill-upload-blob.mjs --apply
 */

/** @type {ReadonlyArray<{ publicPath: string, blobPathname: string }>} */
export const LEGACY_BLOB_FILES = Object.freeze([
${manifestEntries.map((e) => `  { publicPath: ${JSON.stringify(e.publicPath)}, blobPathname: ${JSON.stringify(e.blobPathname)} },`).join('\n')}
]);
`;

const manifestPath = path.resolve(process.cwd(), 'src', 'lib', 'legacyBlobFiles.mjs');
fs.writeFileSync(manifestPath, out);
console.log(`  routing manifest → ${path.relative(process.cwd(), manifestPath)} (${manifestEntries.length} entries)`);
console.log(`  (the ${written.length - manifestEntries.length} webroot documents keep their existing explicit rewrites)`);
console.log('');
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f.path}\n      ${f.error}`);
  console.log('');
}

await mongoose.disconnect().catch(() => {});
process.exit(failures.length ? 1 : 0);
