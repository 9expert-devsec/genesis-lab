/**
 * Correct the Content-Type of Vercel Blob objects whose DECLARED type
 * contradicts their actual bytes. Object metadata only — no code, no deploy.
 *
 *   node --env-file=.env.local scripts/fix-blob-content-types.mjs           # audit
 *   node --env-file=.env.local scripts/fix-blob-content-types.mjs --apply
 *
 * ══ THE BUG THIS FIXES, AND WHY IT ONLY EXISTS ON BLOB ══════════════════════
 *
 * The first Blob upload derived contentType from the FILE EXTENSION. That is
 * safe on Cloudinary and unsafe on Blob, because the two storages differ in
 * exactly the relevant way:
 *
 *   Cloudinary  SNIFFS the real format on upload and transcodes at delivery. A
 *               file misnamed `.png` that is really a JPEG still serves
 *               correctly — that is what the 26 formatDisagrees rows are, and
 *               they need no fix.
 *   Blob        stores the bytes plus whatever contentType it was told, and
 *               serves that verbatim. Nothing sniffs. Nothing corrects.
 *
 * So a wrong legacy filename became a wrong Content-Type on the wire. Measured
 * post-deploy: 7 of 19 objects. 4 files named `.mp3` are MP4/AAC containers
 * (`ftyp`) served as audio/mpeg, and 3 named `.png` are JPEGs served as
 * image/png. The bytes were always correct and byte-equal to source; only the
 * label lied — and a declared audio/mpeg on an MP4 container is the one with
 * real consequences, because a strict player can refuse it outright.
 *
 * ── ALL 19 ARE RE-VERIFIED, NOT JUST THE KNOWN 7 ────────────────────────────
 * The 7 came from one probe run. Trusting that list would make this script a
 * transcription of a previous measurement rather than a measurement, and would
 * miss any object whose type is wrong in a way that run did not check. Every
 * object is sniffed from its own stored bytes.
 *
 * ── SNIFFING COSTS 16 BYTES, NOT 361 MB ─────────────────────────────────────
 * The whole set is 361.75 MB. A Range request for the first 16 bytes is enough
 * for every signature below, so only the objects that actually need a re-put are
 * downloaded in full — and those have to be, since a re-put must write back
 * exactly the bytes that are already there.
 *
 * ── WHY A RE-PUT RATHER THAN A METADATA EDIT ────────────────────────────────
 * The Blob API has no "change the content type" operation; contentType is set at
 * put() time. So the correction is put() to the SAME pathname with
 * addRandomSuffix:false, which overwrites in place and keeps every URL — the
 * generated routing manifest and the 16 rewrites built from it stay valid, so
 * no code changes and no deploy.
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

const MB = 1024 * 1024;
const mb = (n) => (n / MB).toFixed(2);
const die = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };

/**
 * Magic-byte signatures, longest/most-specific first.
 *
 * `ftyp` at offset 4 is the ISO base-media container — an `.mp3` that is really
 * MP4/AAC audio. audio/mp4 rather than video/mp4 because these are podcasts with
 * no video track, and the type decides which element a browser will play.
 */
function sniff(b) {
  if (b.length >= 8 && b.subarray(4, 8).toString('latin1') === 'ftyp') return 'audio/mp4';
  if (b.length >= 3 && b.subarray(0, 3).toString('latin1') === 'ID3') return 'audio/mpeg';
  // MPEG audio frame sync: 11 set bits. Covers 0xFFFB/0xFFF3/0xFFE3 etc.
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (b.length >= 3 && b.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  // PK last: every OOXML/zip container starts this way, so a more specific
  // signature must win before it.
  if (b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b) return 'application/zip';
  return null;
}

/** The `format` token to record alongside a corrected MIME type. */
const FORMAT_FOR_TYPE = {
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'image/gif': 'gif',
};

const extOf = (p) => {
  const last = p.slice(p.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot <= 0 ? '' : last.slice(dot + 1).toLowerCase();
};
const FORMAT_ALIASES = new Map([['jpeg', 'jpg'], ['tif', 'tiff']]);
const canonicalFormat = (f) => FORMAT_ALIASES.get(String(f).toLowerCase()) ?? String(f).toLowerCase();

/** One month, matching what the original upload set. */
const CACHE_MAX_AGE = 60 * 60 * 24 * 30;

if (!process.env.BLOB_READ_WRITE_TOKEN) die('BLOB_READ_WRITE_TOKEN not set');
const uri = process.env.MONGODB_URI;
if (!uri) die('MONGODB_URI not set — pass --env-file=.env.local');
await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME, maxPoolSize: 5, serverSelectionTimeoutMS: 10_000 });

const rows = await LegacyFileMigration.find(
  { storage: 'blob' },
  { sourcePath: 1, blobPathname: 1, secureUrl: 1, sourceBytes: 1, format: 1, contentType: 1, status: 1 },
).sort({ sourcePath: 1 }).lean();

console.log('');
console.log('══ BLOB CONTENT-TYPE AUDIT ════════════════════════════════════════════');
console.log('');
console.log(`  mode    : ${APPLY ? '*** APPLY — WILL RE-PUT AND WRITE ***' : 'AUDIT — no writes'}`);
console.log(`  objects : ${rows.length} with storage:'blob'`);
console.log('');
if (!rows.length) die('no blob rows found');

/* ── SNIFF EVERY OBJECT FROM ITS OWN STORED BYTES ───────────────────────── */
const audited = [];
for (const row of rows) {
  if (!row.secureUrl) { console.log(`  ⚠ no secureUrl recorded: ${row.sourcePath}`); continue; }

  // DECLARED comes from head(), the Blob API — the object's own metadata.
  //
  // NOT from a CDN fetch, which is what the first version of this script did and
  // got wrong twice over: the CDN serves a cached copy with a 30-day max-age, so
  // it reports the type the object had when that entry was filled. That made a
  // completed correction look like a failure ("after re-put, still serving
  // audio/mpeg") and, on a second run, would have made an uncorrected object look
  // fine. The API is the only authority on what the object IS.
  const meta = await head(row.secureUrl);
  const declared = (meta.contentType ?? '').split(';')[0].trim();

  // ACTUAL comes from the bytes, and bytes are identical cached or not — so a
  // 16-byte Range against the CDN is safe here and costs nothing.
  const res = await fetch(row.secureUrl, {
    headers: { range: 'bytes=0-15', 'accept-encoding': 'identity' },
    redirect: 'manual',
    signal: AbortSignal.timeout(120_000),
  });
  const firstBytes = Buffer.from(await res.arrayBuffer());
  const actual = sniff(firstBytes);
  const cdnType = (res.headers.get('content-type') ?? '').split(';')[0].trim();

  audited.push({
    ...row,
    ext: extOf(row.sourcePath),
    declared,
    actual,
    cdnType,
    apiSize: meta.size,
    rangeStatus: res.status,
    matches: actual == null ? null : declared === actual,
    // The row may still describe the pre-correction state even when the object
    // is already right — the first run threw before writing. Tracked separately
    // so a metadata sync does not require a pointless re-upload.
    rowStale: actual != null && (row.contentType ?? '') !== actual,
  });
}

/* ── THE PROOF TABLE: all 19, declared vs actual ────────────────────────── */
console.log('── DECLARED vs ACTUAL (all objects) ────────────────────────────────────');
console.log('');
console.log('  ext    declared (API)        actual (bytes)        bytes       match  CDN now      path');
for (const a of audited) {
  const flag = a.matches === null ? '  ?  ' : a.matches ? ' ok  ' : '✗MIS ';
  const cdn = a.cdnType === a.actual ? 'converged' : `stale:${a.cdnType}`;
  console.log(
    `  ${a.ext.padEnd(6)} ${(a.declared || '(none)').padEnd(21)} ${(a.actual ?? '(unknown)').padEnd(21)} `
    + `${mb(a.sourceBytes ?? 0).padStart(8)} MB ${flag} ${cdn.padEnd(12)} ${a.sourcePath}`,
  );
}
console.log('');

const mismatched = audited.filter((a) => a.matches === false);
const unknown = audited.filter((a) => a.matches === null);
console.log(`  match: ${audited.filter((a) => a.matches === true).length}`
  + `   MISMATCH: ${mismatched.length}`
  + `   unsniffable: ${unknown.length}`);
console.log('');

if (unknown.length) {
  console.log('  ⚠ no signature recognised — NOT touched, reported for a human:');
  for (const u of unknown) console.log(`     ${u.sourcePath}`);
  console.log('');
}

const rowsToSync = audited.filter((a) => a.rowStale && a.matches === true);
if (rowsToSync.length) {
  const unset = rowsToSync.filter((r) => !r.contentType);
  const wrong = rowsToSync.filter((r) => r.contentType);
  console.log(`  ${rowsToSync.length} row(s) need their recorded type synced to the object:`);
  if (unset.length) console.log(`     ${unset.length} with contentType UNSET — the field is new, so no row has ever carried it`);
  if (wrong.length) console.log(`     ${wrong.length} recording a type that disagrees with the object`);
  for (const r of rowsToSync) console.log(`     row "${r.contentType || '(unset)'}" → ${r.actual}   ${r.sourcePath}`);
  console.log('');
}

if (!mismatched.length && !rowsToSync.length) {
  console.log('══ NOTHING TO FIX. Every object\'s declared type matches its bytes. ════');
  console.log('');
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

if (mismatched.length) {
  console.log('── OBJECTS TO RE-PUT ───────────────────────────────────────────────────');
  console.log('');
  for (const m of mismatched) console.log(`  ${m.declared} → ${m.actual}   ${m.sourcePath}`);
  console.log('');
}

if (!APPLY) {
  console.log('══ AUDIT ONLY. Nothing re-put, nothing written. Re-run with --apply. ══');
  console.log('');
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

/* ── CORRECT: re-put the SAME bytes with the SNIFFED type ───────────────── */
const stats = { fixed: 0, failed: 0 };
const failures = [];

for (const m of mismatched) {
  try {
    // Download exactly what is stored. A re-put must write back the same bytes;
    // pulling from staging instead would silently substitute a different file if
    // the two ever diverged.
    const res = await fetch(m.secureUrl, { redirect: 'manual', signal: AbortSignal.timeout(600_000) });
    if (res.status !== 200) throw new Error(`source object returned ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    if (m.sourceBytes != null && buf.length !== m.sourceBytes) {
      throw new Error(`stored object is ${buf.length} B, record says ${m.sourceBytes} B — refusing to re-put`);
    }
    // Cross-check against disk where the file is staged. Belt and braces: the
    // one thing that must not change is the bytes.
    const disk = path.join(STAGING, m.sourcePath);
    if (fs.existsSync(disk)) {
      const dbytes = fs.statSync(disk).size;
      if (dbytes !== buf.length) throw new Error(`disk is ${dbytes} B, object is ${buf.length} B`);
    }
    const beforeSha = crypto.createHash('sha256').update(buf).digest('hex');
    const reSniff = sniff(buf.subarray(0, 16));
    if (reSniff !== m.actual) throw new Error(`sniff disagrees on the full object: ${reSniff} vs ${m.actual}`);

    // SAME pathname + addRandomSuffix:false → overwrite in place, URL unchanged,
    // so the generated manifest and its 16 rewrites stay valid with no deploy.
    const written = await put(m.blobPathname, buf, {
      access: 'public',
      addRandomSuffix: false,
      contentType: m.actual,
      cacheControlMaxAge: CACHE_MAX_AGE,
      multipart: buf.length > 8 * MB,
      allowOverwrite: true,
    });

    if (written.pathname !== m.blobPathname) {
      throw new Error(`pathname changed: ${written.pathname} ≠ ${m.blobPathname}`);
    }

    // ── VERIFY AGAINST THE ORIGIN, OBSERVE THE CDN ────────────────────────
    //
    // The ASSERTION is on the object's own metadata via head(). The CDN holds a
    // 30-day cached copy, so an immediate fetch legitimately still reports the
    // OLD type — measured, and query-string cache-busting does not help because
    // the Blob CDN normalises the key. Asserting on the CDN read made a
    // completed correction report as a failure for all 7.
    const after = await head(written.url);
    const afterType = (after.contentType ?? '').split(';')[0].trim();
    if (afterType !== m.actual) throw new Error(`API still reports ${afterType} after re-put`);
    if (after.size !== buf.length) throw new Error(`API reports ${after.size} B ≠ ${buf.length} B`);

    // The BYTES are asserted unauthenticated, because they are identical cached
    // or not — a corrected label on altered bytes would be worse than the wrong
    // label, so this is the check that must not be relaxed.
    const check = await fetch(written.url, { redirect: 'manual', signal: AbortSignal.timeout(600_000) });
    const got = Buffer.from(await check.arrayBuffer());
    const gotType = (check.headers.get('content-type') ?? '').split(';')[0].trim();
    if (check.status !== 200) throw new Error(`after re-put, URL returned ${check.status}`);
    if (got.length !== buf.length) throw new Error(`after re-put, ${got.length} B ≠ ${buf.length} B`);
    const afterSha = crypto.createHash('sha256').update(got).digest('hex');
    if (afterSha !== beforeSha) throw new Error('sha256 changed across the re-put');
    const cdnNote = gotType === m.actual ? 'CDN converged' : `CDN still serving ${gotType} (cached, will expire)`;

    const trueFormat = FORMAT_FOR_TYPE[m.actual] ?? m.ext;
    await LegacyFileMigration.updateOne(
      { sourcePath: m.sourcePath },
      {
        $set: {
          contentType: m.actual,
          format: trueFormat,
          storedFormat: trueFormat,
          // Now queryable in the same way as the Cloudinary rows: the path
          // extension really does disagree with the bytes.
          formatDisagrees: canonicalFormat(trueFormat) !== canonicalFormat(m.ext),
          secureUrl: written.url,
          derivedUrl: written.url,
          sha256: afterSha,
          uploadedBytes: got.length,
          attemptedAt: new Date(),
          note: `Vercel Blob. Content-Type corrected ${m.declared} → ${m.actual}: the legacy `
              + `filename says .${m.ext} but the bytes are ${m.actual}. Blob serves the declared `
              + `type verbatim (unlike Cloudinary, which sniffs and transcodes), so the extension `
              + `could not be trusted. Bytes unchanged — sha256 verified across the re-put.`,
        },
      },
    );

    stats.fixed += 1;
    console.log(`  ✓ ${m.declared} → ${afterType}  ${mb(got.length).padStart(8)} MB  ${m.blobPathname}`);
    console.log(`      bytes unchanged, sha256 ${afterSha.slice(0, 16)}…; ${cdnNote}`);
  } catch (err) {
    stats.failed += 1;
    const msg = (err?.message ?? String(err)).slice(0, 300);
    failures.push({ path: m.sourcePath, error: msg });
    console.log(`  ✗ ${m.sourcePath}\n      ${msg}`);
  }
}

/* ── SYNC ROWS whose OBJECT is already right ────────────────────────────────
 * No re-upload: the bytes and the object metadata are already correct, only the
 * record lags. Re-putting to fix a database row would spend bandwidth to change
 * nothing about what a customer receives.
 */
let synced = 0;
for (const a of rowsToSync) {
  const trueFormat = FORMAT_FOR_TYPE[a.actual] ?? a.ext;
  await LegacyFileMigration.updateOne(
    { sourcePath: a.sourcePath },
    {
      $set: {
        contentType: a.actual,
        format: trueFormat,
        storedFormat: trueFormat,
        formatDisagrees: canonicalFormat(trueFormat) !== canonicalFormat(a.ext),
        attemptedAt: new Date(),
        note: `Vercel Blob. Content-Type corrected to ${a.actual}: the legacy filename says `
            + `.${a.ext} but the bytes are ${a.actual}. Blob serves the declared type verbatim `
            + `(unlike Cloudinary, which sniffs and transcodes), so the extension could not be `
            + `trusted. Object metadata already carried the corrected type; this synced the record.`,
      },
    },
  );
  synced += 1;
  console.log(`  ↻ row synced: ${a.sourcePath} → ${a.actual} (format ${trueFormat})`);
}
if (synced) console.log('');

console.log('');
console.log('══ SUMMARY ═════════════════════════════════════════════════════════════');
console.log('');
console.log(`  objects re-put : ${stats.fixed}`);
console.log(`  rows synced    : ${synced}`);
console.log(`  FAILED         : ${stats.failed}`);
console.log('');
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f.path}\n      ${f.error}`);
  console.log('');
}

await mongoose.disconnect().catch(() => {});
process.exit(failures.length ? 1 : 0);
