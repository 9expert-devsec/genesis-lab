#!/usr/bin/env node
/**
 * ONE-TIME COPY: page catalogs (program/skill `catalogPdf`) Cloudinary → Blob.
 *
 *   node --env-file=.env.local scripts/migrate-page-catalogs-to-blob.mjs           # DRY RUN
 *   node --env-file=.env.local scripts/migrate-page-catalogs-to-blob.mjs --apply   # copy
 *
 * ══ WHY IT EXISTS ═══════════════════════════════════════════════════════════
 * The CATALOG-UPLOAD BUILD serves every `/files/catalog/<program|skill>-…-
 * catalog.pdf` from Blob (`page-catalogs/<file>`) through one narrow rewrite.
 * The moment that rule deploys, a catalog that is still only on Cloudinary
 * 404s. Run this — dry run, then --apply — BEFORE the rule goes live. Blob
 * writes are harmless until then: nothing serves `page-catalogs/` yet.
 *
 * ══ WHAT IT TOUCHES ═════════════════════════════════════════════════════════
 *   · Mongo: READ ONLY. The config rows' `catalogPdf.path` is already the
 *     public URL and does not change.
 *   · Cloudinary: READ ONLY (a HEAD per catalog, and an Admin-API listing of
 *     files/catalog/ for the report). Nothing is deleted.
 *   · Blob: written ONLY with --apply, at `page-catalogs/<file>`, no random
 *     suffix, overwrite allowed. Idempotent — a row already on Blob with the
 *     same size is skipped.
 *
 * ══ PRECONDITION: THE DATABASE ANSWERS FIRST ════════════════════════════════
 * Connect AND ping (15 s) before anything else, and fail closed — the same
 * order as scripts/restore-webroot-document.mjs. If it fails, nothing was
 * read from or written to the store.
 */

import mongoose from 'mongoose';
import { BlobNotFoundError, head, put } from '@vercel/blob';
import { v2 as cloudinary } from 'cloudinary';

import { LEGACY_PREFIX } from '../src/lib/legacyTransforms.mjs';
import { PAGE_CATALOG_CONTENT_TYPE, isPageCatalogFileName } from '../src/lib/pageCatalogPaths.mjs';
import {
  COPY_ACTION,
  copyActionWrites,
  decidePageCatalogCopy,
  planPageCatalogCopy,
} from '../src/lib/pageCatalogCopyPlan.mjs';

const APPLY = process.argv.includes('--apply');
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME ?? 'ddva7xvdt';
const CLOUD_BASE = `https://res.cloudinary.com/${CLOUD}`;
const BLOB_BASE = String(process.env.BLOB_PUBLIC_BASE ?? '').replace(/\/+$/, '');
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

/** The two config collections and the field each is keyed on. */
const SOURCES = [
  { kind: 'program', collection: 'program_page_configs', keyField: 'programId' },
  { kind: 'skill', collection: 'skill_page_configs', keyField: 'skillId' },
];

const mib = (n) => (n == null ? '—' : `${(Number(n) / 1048576).toFixed(2)} MiB`);

function safeToRetry(reason) {
  console.error(`✖ ${reason}`);
  console.error('');
  console.error('══ NOTHING WAS CHANGED / SAFE TO RETRY ═════════════════════════════════');
  console.error('   The script stopped before its first write.');
  console.error('');
}

async function ensureDb() {
  if (!process.env.MONGODB_URI) return { ok: false, error: 'MONGODB_URI is not set — pass --env-file=.env.local' };
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
    }
    await mongoose.connection.db.admin().command({ ping: 1 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `database unreachable — ${err?.message ?? err}` };
  }
}

/** HEAD the Cloudinary source: status and content-length. */
async function headSource(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const len = res.headers.get('content-length');
    return { status: res.status, bytes: len == null ? null : Number(len) };
  } catch (err) {
    return { status: 0, bytes: null, error: err?.message ?? String(err) };
  }
}

/** HEAD the Blob target: size, or null when absent. */
async function headBlob(url) {
  try {
    const h = await head(url, { token: TOKEN });
    return { exists: true, bytes: Number(h.size), contentType: h.contentType };
  } catch (err) {
    // The SDK's own class — its `name` property is not set to the class name,
    // so a string match on it misses (measured on the first dry run).
    if (err instanceof BlobNotFoundError) return { exists: false, bytes: null };
    throw err;
  }
}

/** Everything Cloudinary holds under files/catalog/ — for the report only. */
async function listCloudinaryCatalogFolder() {
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return null;
  cloudinary.config({
    cloud_name: CLOUD,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const prefix = `${LEGACY_PREFIX}/files/catalog/`;
  const out = [];
  for (const resourceType of ['raw', 'image']) {
    let cursor;
    do {
      const res = await cloudinary.api.resources({
        type: 'upload', resource_type: resourceType, prefix, max_results: 500, next_cursor: cursor,
      });
      for (const r of res.resources ?? []) {
        const rest = r.public_id.slice(prefix.length);
        const file = resourceType === 'raw' ? rest : `${rest}.${r.format}`;
        out.push({ resourceType, file, bytes: r.bytes });
      }
      cursor = res.next_cursor;
    } while (cursor);
  }
  return out;
}

async function main() {
  console.log(`page catalogs → Blob   mode: ${APPLY ? 'APPLY (writes to Blob)' : 'DRY RUN (read-only)'}`);
  if (!BLOB_BASE || !TOKEN) {
    safeToRetry('BLOB_PUBLIC_BASE and BLOB_READ_WRITE_TOKEN must both be set');
    process.exit(1);
  }

  const db = await ensureDb();
  if (!db.ok) {
    safeToRetry(db.error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }

  // ── read the rows (Mongo READ ONLY) ────────────────────────────────────────
  const rows = [];
  for (const s of SOURCES) {
    const docs = await mongoose.connection.db.collection(s.collection)
      .find({ 'catalogPdf.path': { $nin: [null, ''] } }, { projection: { [s.keyField]: 1, catalogPdf: 1 } })
      .toArray();
    for (const d of docs) rows.push({ kind: s.kind, id: d[s.keyField], path: d.catalogPdf?.path, recordBytes: d.catalogPdf?.bytes });
  }
  await mongoose.disconnect().catch(() => {});

  const plan = planPageCatalogCopy(rows, { cloudBase: CLOUD_BASE, legacyPrefix: LEGACY_PREFIX, blobBase: BLOB_BASE });

  // ── HEAD both sides (read-only) and decide ─────────────────────────────────
  for (const p of plan) {
    if (!p.valid) continue;
    const src = await headSource(p.sourceUrl);
    const blob = await headBlob(p.blobUrl);
    p.sourceStatus = src.status;
    p.sourceBytes = src.bytes;
    p.blobBytes = blob.exists ? blob.bytes : null;
    p.action = decidePageCatalogCopy({ sourceStatus: src.status, sourceBytes: src.bytes, blobBytes: p.blobBytes });
  }

  console.log('');
  console.log('kind     key                        path                                                   cloudinary          blob target                                         blob exists?          action');
  for (const p of plan) {
    console.log([
      p.kind.padEnd(8),
      String(p.id).padEnd(26),
      p.path.padEnd(54),
      (p.valid ? `${p.sourceStatus} ${mib(p.sourceBytes)}` : '—').padEnd(19),
      (p.blobPathname ?? '—').padEnd(51),
      (p.valid ? (p.blobBytes == null ? 'no' : `yes ${mib(p.blobBytes)}`) : '—').padEnd(21),
      p.action,
    ].join(' '));
  }

  const count = (a) => plan.filter((p) => p.action === a).length;
  console.log('');
  console.log(`totals: ${plan.length} catalog row(s) — copy ${count(COPY_ACTION.COPY)}, overwrite ${count(COPY_ACTION.OVERWRITE)}, `
    + `skip ${count(COPY_ACTION.SKIP)}, source missing ${count(COPY_ACTION.SOURCE_MISSING)}, bad path ${count(COPY_ACTION.BAD_PATH)}`);
  const broken = plan.filter((p) => p.action === COPY_ACTION.SOURCE_MISSING);
  if (broken.length) {
    console.log(`⚠ ${broken.length} catalog(s) do not answer 200 on Cloudinary — already broken today: ${broken.map((p) => p.path).join(', ')}`);
  }

  // ── what else lives under /files/catalog/ (report only) ────────────────────
  try {
    const folder = await listCloudinaryCatalogFolder();
    if (folder) {
      const others = folder.filter((f) => !isPageCatalogFileName(f.file));
      console.log('');
      console.log(`Cloudinary files/catalog/: ${folder.length} file(s), ${folder.length - others.length} page catalog(s), `
        + `${others.length} OTHER (stay on Cloudinary — the narrow rule does not match them):`);
      for (const o of others) console.log(`   ${o.resourceType.padEnd(5)} /files/catalog/${o.file}  ${mib(o.bytes)}`);
    } else {
      console.log('\n(Cloudinary Admin API credentials not set — folder listing skipped)');
    }
  } catch (err) {
    console.log(`\n(Cloudinary folder listing failed — ${err?.message ?? err}; report only, nothing depends on it)`);
  }

  if (!APPLY) {
    console.log('');
    console.log('══ DRY RUN — NOTHING WAS WRITTEN. Re-run with --apply to copy. ══════════');
    return;
  }

  // ── APPLY: stream each source to Blob, then verify by size ─────────────────
  let mismatches = 0;
  for (const p of plan) {
    if (!copyActionWrites(p.action)) continue;
    process.stdout.write(`copy ${p.path} → ${p.blobPathname} … `);
    try {
      const res = await fetch(p.sourceUrl);
      if (!res.ok || !res.body) throw new Error(`source answered ${res.status}`);
      await put(p.blobPathname, res.body, {
        access: 'public',
        contentType: PAGE_CATALOG_CONTENT_TYPE,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60 * 60 * 24 * 30,
        multipart: true,
        token: TOKEN,
      });
      const after = await headBlob(p.blobUrl);
      if (!after.exists || (p.sourceBytes != null && after.bytes !== p.sourceBytes)) {
        mismatches += 1;
        console.log(`✖ SIZE MISMATCH — source ${p.sourceBytes}, blob ${after.bytes}`);
      } else {
        console.log(`ok (${mib(after.bytes)})`);
      }
    } catch (err) {
      mismatches += 1;
      console.log(`✖ ${err?.message ?? err}`);
    }
  }
  console.log('');
  if (mismatches) {
    console.log(`✖ ${mismatches} row(s) failed or mismatched — see above. Re-running is safe (idempotent).`);
    process.exit(1);
  }
  console.log('✔ every planned copy verified by size.');
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
