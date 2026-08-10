#!/usr/bin/env node
/**
 * PUT A PREVIOUS EDITION OF A SITE-ROOT PDF BACK. DRY RUN BY DEFAULT.
 *
 * ══ WHY THIS EXISTS ═════════════════════════════════════════════════════════
 *
 * Steps 6/6.5/6.6 built and proved ARCHIVE-BEFORE-OVERWRITE: every replacement
 * copies the current bytes to `webroot-archive/…` and verifies the copy before
 * a token is issued. Then nothing read one back. An archive nothing can restore
 * from is a backup in principle only, so this is the way home.
 *
 * ══ A RESTORE IS ITSELF AN OVERWRITE ════════════════════════════════════════
 *
 * Blob keeps ONE version per pathname. Copying an archive onto the live key
 * destroys what is there now — so this archives the CURRENT object first and
 * verifies that archive before it copies anything. Without that, restoring the
 * wrong edition would be unrecoverable, and the wrong edition is exactly what
 * gets picked during a rollback in a hurry.
 *
 * The ordering lives in src/lib/webroot/restoreFlow.mjs with its dependencies
 * injected, so a test can make the safety archive fail and prove the restore
 * copy was never attempted. This file is the wiring and the operator interface.
 *
 * ══ NO --apply, NO RECEIPT ══════════════════════════════════════════════════
 *
 * The flag is `--commit`, matching scripts/rewrite-legacy-references.mjs rather
 * than inventing a second vocabulary for "actually write".
 *
 * There is deliberately no receipt. The receipt gate exists because a BROWSER
 * can call the upload route; this runs from a shell already holding the store
 * credentials, so a receipt would be ceremony protecting nothing.
 *
 * Usage:
 *   # what is available, and what is live right now
 *   node --env-file=.env.local scripts/restore-webroot-document.mjs
 *
 *   # dry run — reads everything, writes nothing
 *   node --env-file=.env.local scripts/restore-webroot-document.mjs \
 *     --file 9expert-company-profile.pdf \
 *     --archive webroot-archive/9expert-company-profile/<stamp>-9expert-company-profile.pdf
 *
 *   # and again with --commit to actually restore
 */

import { createHash } from 'node:crypto';
import { copy, head, list } from '@vercel/blob';
import mongoose from 'mongoose';

import {
  WEBROOT_ARCHIVE_PREFIX, WEBROOT_DOCUMENTS, webrootUploadTarget,
} from '../src/lib/webrootDocuments.mjs';
import {
  RESTORE, restoreDidWrite, runRestoreFlow, webrootArchiveDirFor,
} from '../src/lib/webroot/restoreFlow.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const argOf = (f, d = null) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

const FILE = argOf('--file');
const ARCHIVE = argOf('--archive');
const COMMIT = has('--commit');
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }
const pad = (s, n) => String(s ?? '').padEnd(n);
const padL = (s, n) => String(s ?? '').padStart(n);
const mib = (n) => `${(Number(n) / 1024 / 1024).toFixed(2)} MB`;

/** One stamp, used by the safety-archive key and the recorded row alike. */
function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// ── Blob deps ───────────────────────────────────────────────────────────────

const headOrNull = async (pathname) => {
  try { return await head(pathname, { token: TOKEN }); } catch { return null; }
};

/**
 * The bytes that key holds, read AS FRESHLY AS THIS MACHINE CAN.
 *
 * A NEW NONCE ON EVERY CALL, and that is the whole contract. The poll retries
 * with the same identifier, so a nonce computed once would leave every retry
 * reading the CDN's copy of the first busted URL — a loop that can only repeat
 * its first answer. `cache: 'no-store'` covers the local HTTP cache; the query
 * nonce is what asks the CDN for a different key.
 *
 * MEASURED LIMIT, stated because it is the defect this file exists to fix: on
 * 2026-08-10 this still returned the PRE-COPY bytes when called milliseconds
 * after a `copy`. It is a best effort at freshness, not a guarantee of it —
 * which is exactly why head() decides success and this only decides the message.
 */
async function fetchFreshBytes(pathname) {
  const meta = await head(pathname, { token: TOKEN });
  if (!meta?.url) throw new Error(`no url for ${pathname}`);
  const bust = `${meta.url}${meta.url.includes('?') ? '&' : '?'}__verify=${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const res = await fetch(bust, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} reading ${pathname}`);
  return Buffer.from(await res.arrayBuffer());
}

const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Convenience for the listing, which wants a hash and not the bytes. */
const hashOf = async (pathname) => sha256Of(await fetchFreshBytes(pathname));

const deps = {
  headLive: headOrNull,
  headArchive: headOrNull,
  copy: async (from, to) => copy(from, to, {
    access: 'public', addRandomSuffix: false, token: TOKEN,
  }),
  fetchFreshBytes,
  sha256: sha256Of,
  nowMs: () => Date.now(),
  wait: (ms) => new Promise((r) => { setTimeout(r, ms); }),
};

// ── the listing: what is there, before anything is chosen ───────────────────

/**
 * NO "restore the latest" SHORTCUT ANYWHERE IN THIS FILE.
 *
 * The most likely reason to restore is that the newest upload was wrong — so
 * "latest" is precisely the edition the operator is trying to get away from. A
 * default that picked it would be right about the mechanism and wrong about
 * every actual incident.
 */
async function showListing() {
  console.log('');
  console.log('══ SITE-ROOT DOCUMENTS — live object and available archives ════════════');

  let rows = [];
  try {
    const { blobs } = await list({ prefix: `${WEBROOT_ARCHIVE_PREFIX}/`, limit: 1000, token: TOKEN });
    rows = blobs;
  } catch (err) {
    console.error(`  (could not list archives — ${err?.message ?? err})`);
  }

  let recorded = new Map();
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
      const docs = await mongoose.connection.db.collection('webroot_document_files')
        .find({}, { projection: { archivePathname: 1, sha256: 1, version: 1, uploadedAt: 1 } }).toArray();
      // The recorded sha256 belongs to the bytes that row made LIVE. The row's
      // archivePathname is where the bytes it REPLACED went — so a given
      // archive's known hash is the sha256 of the row BEFORE it, if any.
      recorded = new Map(docs.filter((d) => d.archivePathname).map((d) => [d.archivePathname, d]));
    } catch (err) {
      console.error(`  (could not read the record — ${err?.message ?? err})`);
    }
  }

  for (const filename of WEBROOT_DOCUMENTS) {
    const target = webrootUploadTarget(filename);
    console.log('');
    console.log(`── ${filename}`);
    const live = await headOrNull(target.blobPathname);
    if (!live) {
      console.log('   LIVE : *** MISSING *** — this document is not being served');
    } else {
      let sha = '(unread)';
      try { sha = await hashOf(target.blobPathname); } catch { sha = '(hash failed)'; }
      console.log(`   LIVE : ${padL(mib(live.size), 10)}  sha256 ${sha}`);
    }

    const dir = `${webrootArchiveDirFor(filename)}/`;
    const mine = rows.filter((b) => b.pathname.startsWith(dir))
      .sort((a, b) => (a.pathname < b.pathname ? 1 : -1));
    if (!mine.length) {
      console.log('   archives: none');
      continue;
    }
    console.log(`   archives (${mine.length}), newest first:`);
    for (const b of mine) {
      const rec = recorded.get(b.pathname);
      console.log(`     ${pad(b.pathname, 78)} ${padL(mib(b.size), 10)}`
        + (rec ? `  recorded v${rec.version} replaced ${new Date(rec.uploadedAt).toISOString()}` : '  (no record)'));
    }
  }

  console.log('');
  console.log('  Choose ONE explicitly. There is no "latest" default, on purpose:');
  console.log('  the newest edition is usually the one you are rolling back FROM.');
  console.log('');
  console.log('    node --env-file=.env.local scripts/restore-webroot-document.mjs \\');
  console.log('      --file <one of the three> --archive <archive pathname>   [--commit]');
  console.log('');
}

// ── record ──────────────────────────────────────────────────────────────────

/**
 * Append a row describing the restore. NEVER mutate the row it undoes.
 *
 * The collection is append-only because the history of a document is the one
 * thing an overwrite destroys; editing it to say "actually, reverted" would be
 * the same mistake one level up. `restoredFrom` is what makes this row legible
 * as a rollback rather than as an ordinary replacement — see the model.
 */
async function recordRestore(result) {
  if (!process.env.MONGODB_URI) {
    console.log('  (MONGODB_URI unset — the restore was NOT recorded)');
    return;
  }
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  }
  const db = mongoose.connection.db;
  const rows = db.collection('webroot_document_files');
  const previous = await rows.find({ filename: result.target.filename }, { projection: { version: 1 } })
    .sort({ version: -1 }).limit(1).toArray();
  const version = (previous[0]?.version ?? 0) + 1;

  const actor = process.env.USERNAME || process.env.USER || 'unknown';
  const now = new Date();
  await rows.insertOne({
    filename: result.target.filename,
    blobPathname: result.target.blobPathname,
    publicPath: result.target.publicPath,
    // Where the bytes this run OVERWROTE went. A restore takes its own archive.
    archivePathname: result.safetyArchivePathname,
    // Which edition came back.
    restoredFrom: result.archivePathname,
    bytes: result.bytes,
    contentType: 'application/pdf',
    sha256: result.restoredSha256,
    uploadedAt: now,
    uploadedBy: `${actor} (restore-webroot-document.mjs)`,
    version,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection('admin_audit_logs').insertOne({
    menu: 'media',
    menuRaw: 'media',
    action: 'update',
    entity: 'file',
    recordId: result.target.filename,
    recordLabel: `webroot ${result.target.publicPath} restored from ${result.archivePathname}`,
    before: { sha256: result.previousSha256, archivedTo: result.safetyArchivePathname },
    after: { sha256: result.restoredSha256, restoredFrom: result.archivePathname, version },
    meta: { via: 'scripts/restore-webroot-document.mjs' },
    actor: { id: '', name: actor },
    createdAt: now,
  });

  console.log(`  recorded : webroot_document_files v${version}, plus one admin_audit_logs row`);
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!TOKEN) die('BLOB_READ_WRITE_TOKEN not set — pass --env-file=.env.local');

  if (!FILE && !ARCHIVE) {
    await showListing();
    await mongoose.disconnect().catch(() => {});
    return;
  }
  if (!FILE || !ARCHIVE) die('pass BOTH --file and --archive. Run with no arguments to see what is available.');

  console.log('');
  console.log(`══ RESTORE — ${COMMIT ? 'COMMIT, WILL WRITE' : 'DRY RUN, nothing will be written'} ═══════`);
  console.log(`   document : ${FILE}`);
  console.log(`   from     : ${ARCHIVE}`);
  console.log('');

  const result = await runRestoreFlow(
    { filename: FILE, archivePathname: ARCHIVE, stamp: stampNow(), commit: COMMIT },
    deps,
  );

  if (result.status === RESTORE.PLANNED) {
    console.log(`   live now      : ${mib(result.previousBytes)}  sha256 ${result.liveSha256}`);
    console.log(`   would restore : ${mib(result.sourceBytes)}  sha256 ${result.sourceSha256}`);
    console.log('');
    if (result.alreadyIdentical) {
      console.log('   ⚠ these are the SAME BYTES — restoring would change nothing.');
    } else {
      console.log('   The two differ. Re-run with --commit to restore, which will:');
      console.log(`     1. archive the current object first, and verify that archive`);
      console.log(`     2. copy ${ARCHIVE} over ${result.target.blobPathname}`);
      console.log('     3. verify the result by sha256, not by length');
    }
    console.log('');
    console.log('══ NOTHING WAS WRITTEN. ════════════════════════════════════════════════');
    await mongoose.disconnect().catch(() => {});
    return;
  }

  // A REAL failure is one head() saw. Everything else records — see the RESTORE
  // enum's header for why absence is not failure here.
  if (!restoreDidWrite(result.status)) {
    console.error(`✖ ${result.status} — ${result.error}`);
    if (result.safetyArchivePathname) {
      console.error(`  the current bytes WERE archived to ${result.safetyArchivePathname} and are safe`);
    }
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }

  console.log(`   archived the previous bytes to : ${result.safetyArchivePathname}`);
  console.log(`   restored                       : ${mib(result.bytes)}`);

  if (result.status === RESTORE.RESTORED_VERIFIED) {
    console.log(`   sha256 verified                : ${result.restoredSha256}`);
    console.log(`   observed after                 : ${result.observed.attempts} attempt(s), ${(result.observed.elapsedMs / 1000).toFixed(1)}s`);
  } else {
    console.log('');
    console.log('   ⚠ RESTORED, BUT NOT YET VISIBLE FROM THIS MACHINE — this is NOT a failure.');
    console.log(`     ${result.caveat}`);
    console.log(`     head() confirmed the object and its size; ${result.observed.attempts} read(s) over`);
    console.log(`     ${(result.observed.elapsedMs / 1000).toFixed(1)}s still returned a cached copy.`);
    console.log('     DO NOT re-run the restore: it would archive the correct object and');
    console.log('     copy it again. Re-read the URL in a minute instead.');
  }

  await recordRestore(result);
  console.log('');
  console.log('   The CDN may serve the previous copy for a while — the same');
  console.log('   propagation window a replacement has. This machine sees ONE PoP.');
  console.log('');
  await mongoose.disconnect().catch(() => {});
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
