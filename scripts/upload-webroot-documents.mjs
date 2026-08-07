/**
 * ONE-OFF — put the three webroot PDFs on Vercel Blob.
 *
 * ══ WHY THESE THREE ARE NOT PART OF THE CLOUDINARY MIGRATION ════════════════
 *
 * They are not in the database, were never migrated, and two of them exceed
 * Cloudinary's per-asset ceiling on every plan we would consider — the raw
 * limit on this account is 10 MB and the catalog is 42.6 MiB. No amount of
 * plan-shopping fixes that for a file that grows every term.
 *
 * They are also, awkwardly, the files staff hand to customers most, at URLs
 * that sit at the SITE ROOT:
 *
 *     https://9experttraining.com/how-to-create-chatgpt-account.pdf
 *
 * ── WHY THERE IS NO CATCH-ALL, EVER ─────────────────────────────────────────
 * A rule like `/:file(.*\.pdf)` at the root looks equivalent and is not. The
 * root is where every application page lives; a catch-all there is one bad
 * regex away from swallowing `/promotions`, `/schedule`, or the entire
 * `[...slug]` route. Three files get three explicit rules, named literally, in
 * next.config.mjs. Adding a fourth document means adding a fourth line, on
 * purpose, in a diff someone reads.
 *
 * ── STABLE PATHS ────────────────────────────────────────────────────────────
 * `addRandomSuffix: false` so the blob pathname is exactly the filename. The
 * rewrite destination has to be predictable at BUILD time, and a random suffix
 * would mean the config could not name its own target.
 *
 * ── WHERE THE BYTES COME FROM ───────────────────────────────────────────────
 * By default, straight from the legacy server via `putFromUrl` — Vercel fetches
 * it server-side, so a 42 MiB file never travels through this machine. That
 * server is the AUTHORITATIVE original and is the same source every other
 * migrated file came from. Verified live on 2026-08-07:
 *
 *     how-to-create-chatgpt-account.pdf     200  1.80 MiB  application/pdf
 *     9expert-company-profile.pdf           200 21.84 MiB  application/pdf
 *     9expert-training-course-catalog.pdf   200 42.58 MiB  application/pdf
 *
 * `--from <dir>` reads local copies instead, for when the legacy box is gone.
 *
 * READ-ONLY WITHOUT --upload. The default run checks the sources, prints what
 * it would do, and touches nothing.
 *
 * Usage:
 *   node --env-file=.env.local scripts/upload-webroot-documents.mjs
 *   node --env-file=.env.local scripts/upload-webroot-documents.mjs --upload
 *   node --env-file=.env.local scripts/upload-webroot-documents.mjs --upload --from ./local-pdfs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const argOf = (f, d = null) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

const UPLOAD = has('--upload');
const FROM_DIR = argOf('--from', null);
const OVERWRITE = has('--overwrite');

const LEGACY_ORIGIN = 'https://www.9experttraining.com';

/**
 * The three files, named explicitly. This list is the whole scope — it is not
 * discovered, globbed or inferred, because each entry also needs a matching
 * rewrite rule written by hand in next.config.mjs.
 *
 * `expectedBytes` is a tripwire, not a requirement: these documents are
 * re-issued periodically, so a mismatch means "confirm this is the new
 * version", not "abort". Recorded 2026-08-07 from the legacy server.
 */
const DOCUMENTS = [
  { file: 'how-to-create-chatgpt-account.pdf', expectedBytes: 1_887_366 },
  { file: '9expert-company-profile.pdf', expectedBytes: 22_902_400 },
  { file: '9expert-training-course-catalog.pdf', expectedBytes: 44_651_000 },
];

/**
 * Blob pathname prefix. Keeps these three out of the way of anything else that
 * later lands in the same store, without putting a folder in the public URL
 * that the rewrite would have to know about beyond this constant.
 */
const BLOB_PREFIX = 'webroot-documents';

/** One month, matching what Cloudinary sends for untransformed assets. */
const CACHE_MAX_AGE = 60 * 60 * 24 * 30;

const pad = (s, n) => String(s ?? '').padEnd(n);
const padL = (s, n) => String(s ?? '').padStart(n);
const mib = (b) => `${(b / 1048576).toFixed(2)} MiB`;

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

async function headLegacy(file) {
  try {
    const res = await fetch(`${LEGACY_ORIGIN}/${file}`, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    return {
      status: res.status,
      bytes: Number(res.headers.get('content-length')) || null,
      type: res.headers.get('content-type'),
    };
  } catch (err) { return { status: 'ERR', error: err.message }; }
}

/** Verify a delivered document the way a customer would experience it. */
async function verifyDelivery(url) {
  const out = {};
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  let bytes = 0;
  if (res.body) for await (const c of res.body) bytes += c.length;
  out.status = res.status;
  out.bytes = bytes;
  out.type = res.headers.get('content-type');
  out.disposition = res.headers.get('content-disposition');
  out.cacheControl = res.headers.get('cache-control');
  out.vercelCache = res.headers.get('x-vercel-cache');
  out.acceptRanges = res.headers.get('accept-ranges');

  // Range is the one that decides whether a 42 MiB catalog renders page 1
  // immediately or looks like a hang. A viewer reads the header, seeks to the
  // xref table at the tail, and pulls page 1 — three ranged requests.
  const ranged = await fetch(url, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(60_000) });
  const rb = await ranged.arrayBuffer();
  out.rangeStatus = ranged.status;
  out.contentRange = ranged.headers.get('content-range');
  out.rangeBytes = rb.byteLength;

  // Repeat fetches, for the edge-cache question.
  const seq = [];
  for (let i = 0; i < 3; i += 1) {
    const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (r.body) for await (const _ of r.body) { /* drain */ }
    seq.push(r.headers.get('x-vercel-cache') ?? '-');
  }
  out.cacheSeq = seq;
  return out;
}

console.log('');
console.log('══ WEBROOT DOCUMENTS → VERCEL BLOB ════════════════════════════════════════');
console.log(`   mode   : ${UPLOAD ? 'UPLOAD' : 'DRY RUN — nothing will be written'}`);
console.log(`   source : ${FROM_DIR ? `local dir ${FROM_DIR}` : `${LEGACY_ORIGIN} (server-side pull)`}`);
console.log('');

// ── check the sources before touching anything ──────────────────────────────
console.log(`  ${pad('file', 40)} ${padL('status', 7)} ${padL('bytes', 12)} ${padL('expected', 12)} ${'type'}`);
console.log(`  ${'-'.repeat(40)} ${'-'.repeat(7)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(16)}`);

const ready = [];
for (const doc of DOCUMENTS) {
  if (FROM_DIR) {
    const p = path.join(FROM_DIR, doc.file);
    if (!fs.existsSync(p)) { console.log(`  ${pad(doc.file, 40)} ${padL('MISSING', 7)}`); continue; }
    const { size } = fs.statSync(p);
    console.log(`  ${pad(doc.file, 40)} ${padL('local', 7)} ${padL(size, 12)} ${padL(doc.expectedBytes, 12)} (local file)`);
    ready.push({ ...doc, localPath: p, bytes: size });
  } else {
    const h = await headLegacy(doc.file);
    console.log(`  ${pad(doc.file, 40)} ${padL(h.status, 7)} ${padL(h.bytes ?? '-', 12)} ${padL(doc.expectedBytes, 12)} ${h.type ?? h.error ?? ''}`);
    if (h.status === 200) ready.push({ ...doc, sourceUrl: `${LEGACY_ORIGIN}/${doc.file}`, bytes: h.bytes });
  }
}
console.log('');

for (const d of ready) {
  if (d.bytes && Math.abs(d.bytes - d.expectedBytes) / d.expectedBytes > 0.05) {
    console.log(`  ⚠ ${d.file}: ${mib(d.bytes)} vs an expected ${mib(d.expectedBytes)} — a re-issued document?`);
  }
}

if (ready.length !== DOCUMENTS.length) {
  console.log(`  ⚠ only ${ready.length} of ${DOCUMENTS.length} sources are available.`);
  console.log('');
}

console.log('  Blob pathnames that WOULD be written (addRandomSuffix: false):');
for (const d of ready) console.log(`     ${BLOB_PREFIX}/${d.file}`);
console.log('');

if (!UPLOAD) {
  console.log('══ DRY RUN — nothing uploaded. Re-run with --upload. ══════════════════════');
  console.log('');
  console.log('  Requires BLOB_READ_WRITE_TOKEN in the environment and a Blob store on the');
  console.log('  project. Neither exists yet — see the report.');
  console.log('');
  process.exit(0);
}

// ── upload ──────────────────────────────────────────────────────────────────
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  die('BLOB_READ_WRITE_TOKEN is not set. Create a Blob store on the project first:\n'
    + '    npx vercel blob create-store <name>\n'
    + '  then pull the token:\n'
    + '    npx vercel env pull .env.local');
}

const { put, putFromUrl } = await import('@vercel/blob');

const results = [];
for (const d of ready) {
  const pathname = `${BLOB_PREFIX}/${d.file}`;
  process.stdout.write(`  uploading ${d.file} … `);
  try {
    const common = {
      access: 'public',
      // Stable, predictable path — the rewrite destination is written at build
      // time and cannot chase a random suffix.
      addRandomSuffix: false,
      allowOverwrite: OVERWRITE,
      contentType: 'application/pdf',
      cacheControlMaxAge: CACHE_MAX_AGE,
    };
    const blob = d.sourceUrl
      ? await putFromUrl(pathname, d.sourceUrl, common)
      : await put(pathname, fs.createReadStream(d.localPath), { ...common, multipart: true });
    console.log('ok');
    results.push({ ...d, blob });
  } catch (err) {
    console.log(`✖ ${err.message}`);
    if (/already exists/i.test(err.message)) {
      console.log('     (pass --overwrite to replace it)');
    }
  }
}

console.log('');
console.log('══ UPLOADED ═══════════════════════════════════════════════════════════════');
console.log('');
for (const r of results) {
  console.log(`  ${r.file}`);
  console.log(`     url          : ${r.blob.url}`);
  console.log(`     downloadUrl  : ${r.blob.downloadUrl}`);
  console.log(`     contentType  : ${r.blob.contentType}`);
  console.log(`     disposition  : ${r.blob.contentDisposition}`);
}
console.log('');

if (results.length) {
  const base = new URL(results[0].blob.url).origin;
  console.log('  Set this so next.config.mjs can build its three rewrite rules:');
  console.log('');
  console.log(`     BLOB_PUBLIC_BASE=${base}`);
  console.log('');
  console.log('  Add it to Vercel (Preview + Production) as well as .env.local:');
  console.log(`     npx vercel env add BLOB_PUBLIC_BASE`);
  console.log('');
}

// ── verify each, as a customer would experience it ──────────────────────────
console.log('══ VERIFICATION ═══════════════════════════════════════════════════════════');
console.log('');
for (const r of results) {
  const v = await verifyDelivery(r.blob.url);
  const inline = v.disposition === null || /^\s*inline/i.test(v.disposition);
  const sizeOk = r.bytes ? v.bytes === r.bytes : true;
  console.log(`  ${r.file}`);
  console.log(`     status        : ${v.status}`);
  console.log(`     content-type  : ${v.type}   ${v.type === 'application/pdf' ? '✓' : '✖ expected application/pdf'}`);
  console.log(`     disposition   : ${v.disposition ?? '(none)'}   ${inline ? '✓ renders inline' : '✖ WOULD TRIGGER SAVE-AS'}`);
  console.log(`     bytes         : ${v.bytes} (${mib(v.bytes)})   ${sizeOk ? '✓' : `✖ source was ${r.bytes}`}`);
  console.log(`     accept-ranges : ${v.acceptRanges ?? '(not advertised)'}`);
  console.log(`     Range 0-1023  : ${v.rangeStatus} ${v.rangeStatus === 206 ? `✓ ${v.contentRange}, ${v.rangeBytes} bytes` : '✖ NOT honoured — a large PDF will look like a hang'}`);
  console.log(`     cache-control : ${v.cacheControl ?? '(none)'}`);
  console.log(`     x-vercel-cache: ${v.cacheSeq.join(' ')}`);
  console.log('');
}
console.log('  Nothing in the database was read or written by this script.');
console.log('');
